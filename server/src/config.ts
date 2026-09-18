import path from 'node:path';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: intEnv('PORT', 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',
  dashboardUser: process.env.DASHBOARD_USER || 'admin',
  dashboardPassword: process.env.DASHBOARD_PASSWORD || 'changeme',
  dataDir: process.env.DATA_DIR || path.resolve(process.cwd(), 'data'),
  mediaMaxUploadBytes: intEnv('MEDIA_MAX_UPLOAD_BYTES', 100 * 1024 * 1024),
  gowaBaseUrl: (process.env.GOWA_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, ''),
  gowaBasicAuth: process.env.GOWA_BASIC_AUTH || '',
  gowaDeviceId: (process.env.GOWA_DEVICE_ID || 'main').trim() || 'main',
  campaignDelayMinMs: intEnv('CAMPAIGN_DELAY_MIN_MS', 3000),
  campaignDelayMaxMs: intEnv('CAMPAIGN_DELAY_MAX_MS', 10000),
  version: process.env.APP_VERSION || '1.0.0',
};
