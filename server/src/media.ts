import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export type MediaKind = 'image' | 'video' | 'file';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);
const VIDEO_EXT = new Set(['.mp4', '.mkv', '.avi']);
const IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const VIDEO_MIME = new Set(['video/mp4', 'video/x-matroska', 'video/avi', 'video/x-msvideo']);
const BLOCKED_EXT = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.pif',
  '.msi',
  '.js',
  '.vbs',
  '.ps1',
  '.sh',
  '.dll',
]);

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function mediaRoot(): string {
  const dir = path.join(config.dataDir, 'media');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function tmpRoot(): string {
  const dir = path.join(config.dataDir, 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function classifyMedia(filename: string, mime: string): MediaKind {
  const ext = path.extname(filename).toLowerCase();
  const type = (mime || '').toLowerCase().split(';')[0].trim();
  if (IMAGE_MIME.has(type) || IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_MIME.has(type) || VIDEO_EXT.has(ext)) return 'video';
  return 'file';
}

export function maxBytesForKind(kind: MediaKind): number {
  if (kind === 'image') return 16 * 1024 * 1024;
  if (kind === 'video') return 100 * 1024 * 1024;
  return 50 * 1024 * 1024;
}

export function mimeForSend(kind: MediaKind, filename: string, mime: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (kind === 'image') return ext === '.png' ? 'image/png' : 'image/jpeg';
  if (kind === 'video') {
    if (ext === '.mkv') return 'video/x-matroska';
    if (ext === '.avi') return 'video/x-msvideo';
    return 'video/mp4';
  }
  return mime || 'application/octet-stream';
}

export function assertAllowedUpload(filename: string, mime: string, size: number): MediaKind {
  const ext = path.extname(filename).toLowerCase();
  if (!ext || BLOCKED_EXT.has(ext)) {
    throw Object.assign(new Error('This file type is not allowed'), { status: 400 });
  }
  const kind = classifyMedia(filename, mime);
  const max = maxBytesForKind(kind);
  if (size > max) {
    const mb = Math.round(max / (1024 * 1024));
    throw Object.assign(new Error(`File too large for ${kind} (max ${mb} MB)`), { status: 400 });
  }
  return kind;
}

export function safeExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext.slice(0, 12) || '.bin';
}

export function persistCampaignMedia(
  campaignId: string,
  tmpPath: string,
  originalName: string,
): string {
  const dir = path.join(mediaRoot(), campaignId);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `media${safeExt(originalName)}`);
  try {
    fs.renameSync(tmpPath, dest);
  } catch {
    fs.copyFileSync(tmpPath, dest);
    fs.unlinkSync(tmpPath);
  }
  return dest;
}

export function removeCampaignMedia(campaignId: string): void {
  const dir = path.join(mediaRoot(), campaignId);
  fs.rmSync(dir, { recursive: true, force: true });
}
