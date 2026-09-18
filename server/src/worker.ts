import { nanoid } from 'nanoid';
import {
  getDb,
  nowIso,
  recountCampaign,
  type CampaignRow,
  type CampaignStatus,
  type RecipientRow,
} from './db.js';
import { checkUser, sendTextMessage } from './gowa.js';
import { config } from './config.js';

let running = false;
let wake: (() => void) | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number): number {
  const lo = Math.min(minMs, maxMs);
  const hi = Math.max(minMs, maxMs);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function notify(): void {
  if (wake) {
    const fn = wake;
    wake = null;
    fn();
  }
}

async function waitForWork(): Promise<void> {
  await new Promise<void>(resolve => {
    wake = resolve;
  });
}

export function createCampaign(input: {
  message: string;
  phones: string[];
  delayMinMs?: number;
  delayMaxMs?: number;
}): CampaignRow {
  const message = input.message.trim();
  if (!message) throw Object.assign(new Error('Message is required'), { status: 400 });
  if (message.length > 4096) throw Object.assign(new Error('Message too long'), { status: 400 });

  const seen = new Set<string>();
  const phones: string[] = [];
  for (const raw of input.phones) {
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length < 8 || seen.has(digits)) continue;
    seen.add(digits);
    phones.push(digits);
  }
  if (phones.length === 0) {
    throw Object.assign(new Error('At least one valid phone number is required'), { status: 400 });
  }

  const id = nanoid(12);
  const ts = nowIso();
  const delayMin = input.delayMinMs ?? config.campaignDelayMinMs;
  const delayMax = input.delayMaxMs ?? config.campaignDelayMaxMs;

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO campaigns (
        id, message, status, delay_min_ms, delay_max_ms,
        total, sent, failed, skipped, pending,
        created_at, updated_at
      ) VALUES (?, ?, 'queued', ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
    ).run(id, message, delayMin, delayMax, phones.length, phones.length, ts, ts);

    const insert = db.prepare(
      `INSERT INTO recipients (campaign_id, phone, status, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?)`,
    );
    for (const phone of phones) {
      insert.run(id, phone, ts, ts);
    }
  });
  tx();

  kickWorker();
  return getCampaign(id)!;
}

export function getCampaign(id: string): CampaignRow | undefined {
  return getDb().prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id) as CampaignRow | undefined;
}

export function listCampaigns(limit = 20): CampaignRow[] {
  return getDb()
    .prepare(`SELECT * FROM campaigns ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as CampaignRow[];
}

export function cancelCampaign(id: string): CampaignRow | undefined {
  const campaign = getCampaign(id);
  if (!campaign) return undefined;
  if (['completed', 'cancelled', 'failed'].includes(campaign.status)) return campaign;

  const ts = nowIso();
  getDb()
    .prepare(
      `UPDATE campaigns SET status = 'cancelled', finished_at = ?, updated_at = ? WHERE id = ?`,
    )
    .run(ts, ts, id);
  getDb()
    .prepare(
      `UPDATE recipients SET status = 'failed', error = 'cancelled', updated_at = ?
       WHERE campaign_id = ? AND status IN ('pending','checking','sending')`,
    )
    .run(ts, id);
  recountCampaign(id);
  return getCampaign(id);
}

function setCampaignStatus(id: string, status: CampaignStatus, error?: string): void {
  const ts = nowIso();
  if (status === 'running') {
    getDb()
      .prepare(
        `UPDATE campaigns SET status = ?, started_at = COALESCE(started_at, ?), updated_at = ?, error = NULL WHERE id = ?`,
      )
      .run(status, ts, ts, id);
  } else if (status === 'completed' || status === 'cancelled' || status === 'failed') {
    getDb()
      .prepare(
        `UPDATE campaigns SET status = ?, finished_at = ?, updated_at = ?, error = ? WHERE id = ?`,
      )
      .run(status, ts, ts, error ?? null, id);
  } else {
    getDb()
      .prepare(`UPDATE campaigns SET status = ?, updated_at = ?, error = ? WHERE id = ?`)
      .run(status, ts, error ?? null, id);
  }
}

function nextRecipient(campaignId: string): RecipientRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM recipients
       WHERE campaign_id = ? AND status = 'pending'
       ORDER BY id ASC LIMIT 1`,
    )
    .get(campaignId) as RecipientRow | undefined;
}

function updateRecipient(
  id: number,
  status: RecipientRow['status'],
  error?: string,
  sentAt?: string,
): void {
  getDb()
    .prepare(
      `UPDATE recipients SET status = ?, error = ?, sent_at = COALESCE(?, sent_at), updated_at = ? WHERE id = ?`,
    )
    .run(status, error ?? null, sentAt ?? null, nowIso(), id);
}

function pickActiveCampaign(): CampaignRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM campaigns
       WHERE status IN ('queued', 'running')
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get() as CampaignRow | undefined;
}

async function processOne(campaign: CampaignRow, recipient: RecipientRow): Promise<void> {
  const ts = nowIso();
  updateRecipient(recipient.id, 'checking');
  recountCampaign(campaign.id);

  let onWhatsApp = false;
  try {
    onWhatsApp = await checkUser(recipient.phone);
  } catch (err) {
    updateRecipient(
      recipient.id,
      'failed',
      err instanceof Error ? err.message : 'check failed',
    );
    recountCampaign(campaign.id);
    return;
  }

  if (!onWhatsApp) {
    updateRecipient(recipient.id, 'skipped', 'not on WhatsApp');
    recountCampaign(campaign.id);
    return;
  }

  updateRecipient(recipient.id, 'sending');
  recountCampaign(campaign.id);

  try {
    await sendTextMessage(recipient.phone, campaign.message);
    updateRecipient(recipient.id, 'sent', undefined, ts);
  } catch (err) {
    updateRecipient(
      recipient.id,
      'failed',
      err instanceof Error ? err.message : 'send failed',
    );
  }
  recountCampaign(campaign.id);
}

async function workerLoop(): Promise<void> {
  running = true;
  try {
    for (;;) {
      const campaign = pickActiveCampaign();
      if (!campaign) {
        await waitForWork();
        continue;
      }

      if (campaign.status === 'queued') {
        setCampaignStatus(campaign.id, 'running');
      }

      // Re-read in case cancelled between pick and process
      const fresh = getCampaign(campaign.id);
      if (!fresh || fresh.status === 'cancelled') {
        continue;
      }

      const recipient = nextRecipient(campaign.id);
      if (!recipient) {
        recountCampaign(campaign.id);
        const done = getCampaign(campaign.id);
        if (done && done.status !== 'cancelled') {
          setCampaignStatus(campaign.id, 'completed');
        }
        continue;
      }

      await processOne(fresh, recipient);

      const after = getCampaign(campaign.id);
      if (after && after.status === 'cancelled') continue;

      const delay = randomDelay(fresh.delay_min_ms, fresh.delay_max_ms);
      await sleep(delay);
    }
  } catch (err) {
    console.error('[worker] fatal error', err);
  } finally {
    running = false;
  }
}

export function kickWorker(): void {
  notify();
  if (!running) {
    void workerLoop();
  }
}

export function resumeInterruptedCampaigns(): void {
  const ts = nowIso();
  // Reset in-flight recipient rows so they can be retried after restart.
  getDb()
    .prepare(
      `UPDATE recipients SET status = 'pending', error = NULL, updated_at = ?
       WHERE status IN ('checking', 'sending')`,
    )
    .run(ts);

  const interrupted = getDb()
    .prepare(`SELECT id FROM campaigns WHERE status IN ('queued', 'running')`)
    .all() as Array<{ id: string }>;

  for (const row of interrupted) {
    recountCampaign(row.id);
    const campaign = getCampaign(row.id);
    if (!campaign) continue;
    if (campaign.pending === 0) {
      setCampaignStatus(row.id, 'completed');
    } else if (campaign.status === 'running') {
      // Keep running; worker will pick it up.
      getDb()
        .prepare(`UPDATE campaigns SET updated_at = ? WHERE id = ?`)
        .run(ts, row.id);
    }
  }

  if (interrupted.length > 0) {
    console.log(`[worker] resuming ${interrupted.length} campaign(s)`);
    kickWorker();
  }
}
