import { config } from './config.js';

export class GowaError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'GowaError';
  }
}

function authHeader(): Record<string, string> {
  if (!config.gowaBasicAuth) return {};
  const token = Buffer.from(config.gowaBasicAuth).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function gowaFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
  const url = `${config.gowaBaseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(authHeader())) headers.set(k, v);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function gowaJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const res = await gowaFetch(pathname, init);
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : `GOWA request failed (${res.status})`;
    throw new GowaError(msg, res.status, body);
  }
  return body as T;
}

export interface GowaStatus {
  is_connected: boolean;
  is_logged_in: boolean;
  device_id?: string;
  jid?: string;
}

export interface GowaLogin {
  qr_link: string;
  qr_duration: number;
}

export async function getStatus(): Promise<GowaStatus> {
  const data = await gowaJson<{ results: GowaStatus }>('/app/status');
  return data.results;
}

export async function getLoginQr(): Promise<GowaLogin> {
  const data = await gowaJson<{ results: GowaLogin }>('/app/login');
  return data.results;
}

export async function logoutDevice(): Promise<void> {
  await gowaJson('/app/logout');
}

export async function checkUser(phone: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, '');
  const data = await gowaJson<{ results: { is_on_whatsapp: boolean } }>(
    `/user/check?phone=${encodeURIComponent(digits)}`,
  );
  return Boolean(data.results?.is_on_whatsapp);
}

export async function sendTextMessage(phone: string, message: string): Promise<void> {
  const digits = phone.replace(/\D/g, '');
  await gowaJson('/send/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: `${digits}@s.whatsapp.net`,
      message,
    }),
  });
}

export async function fetchGowaBinary(absoluteOrPath: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  let url = absoluteOrPath;
  if (absoluteOrPath.startsWith('http://') || absoluteOrPath.startsWith('https://')) {
    try {
      const parsed = new URL(absoluteOrPath);
      const base = new URL(config.gowaBaseUrl);
      // Rewrite host to internal GOWA URL so we never hit a public/localhost address from Docker.
      url = `${base.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      url = absoluteOrPath;
    }
  } else {
    url = `${config.gowaBaseUrl}${absoluteOrPath.startsWith('/') ? absoluteOrPath : `/${absoluteOrPath}`}`;
  }

  const headers = new Headers(authHeader());
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new GowaError(`Failed to fetch GOWA asset (${res.status})`, res.status);
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

export async function pingGowa(): Promise<boolean> {
  try {
    const res = await gowaFetch('/health');
    return res.ok;
  } catch {
    return false;
  }
}
