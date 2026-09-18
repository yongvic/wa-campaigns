import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function initDb(): Database.Database {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, 'campaigns.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      delay_min_ms INTEGER NOT NULL,
      delay_max_ms INTEGER NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      sent INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      pending INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_recipients_campaign_status
      ON recipients(campaign_id, status);
  `);

  migrateCampaignMediaColumns(db);

  return db;
}

function migrateCampaignMediaColumns(database: Database.Database): void {
  const cols = database.prepare(`PRAGMA table_info(campaigns)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map(c => c.name));
  const add = (name: string, ddl: string) => {
    if (!names.has(name)) database.exec(`ALTER TABLE campaigns ADD COLUMN ${ddl}`);
  };
  add('media_kind', 'media_kind TEXT');
  add('media_path', 'media_path TEXT');
  add('media_name', 'media_name TEXT');
  add('media_mime', 'media_mime TEXT');
  add('media_size', 'media_size INTEGER');
}

export type CampaignStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type RecipientStatus =
  | 'pending'
  | 'checking'
  | 'skipped'
  | 'sending'
  | 'sent'
  | 'failed';

export interface CampaignRow {
  id: string;
  message: string;
  status: CampaignStatus;
  delay_min_ms: number;
  delay_max_ms: number;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  media_kind: 'image' | 'video' | 'file' | null;
  media_path: string | null;
  media_name: string | null;
  media_mime: string | null;
  media_size: number | null;
}

export interface RecipientRow {
  id: number;
  campaign_id: string;
  phone: string;
  status: RecipientStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function recountCampaign(campaignId: string): void {
  const counts = getDb()
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
        SUM(CASE WHEN status IN ('pending','checking','sending') THEN 1 ELSE 0 END) AS pending
       FROM recipients WHERE campaign_id = ?`,
    )
    .get(campaignId) as {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
  };

  getDb()
    .prepare(
      `UPDATE campaigns
       SET total = ?, sent = ?, failed = ?, skipped = ?, pending = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      counts.total,
      counts.sent,
      counts.failed,
      counts.skipped,
      counts.pending,
      nowIso(),
      campaignId,
    );
}
