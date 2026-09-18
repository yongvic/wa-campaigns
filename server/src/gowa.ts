import { config } from './config.js';

export class GowaError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
    public code?: string,
  ) {
    super(message);
    this.name = 'GowaError';
  }
}

interface GowaFetchInit extends RequestInit {
  /** Device-scoped endpoints need X-Device-Id. Defaults to true. */
  scoped?: boolean;
  timeoutMs?: number;
}

interface GowaDevice {
  id?: string;
  device_id?: string;
  jid?: string;
  state?: string;
  is_connected?: boolean;
  is_logged_in?: boolean;
}

// undefined = not resolved yet, null = legacy GOWA without device slots
let cachedDeviceId: string | null | undefined;
let resolvingDeviceId: Promise<string | null> | null = null;

function authHeader(): Record<string, string> {
  if (!config.gowaBasicAuth) return {};
  const token = Buffer.from(config.gowaBasicAuth).toString('base64');
  return { Authorization: `Basic ${token}` };
}

function gowaCode(body: unknown): string | undefined {
  if (typeof body === 'object' && body && 'code' in body) {
    const code = (body as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function gowaMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body && 'message' in body) {
    return String((body as { message: unknown }).message);
  }
  return `GOWA request failed (${status})`;
}

async function gowaFetch(pathname: string, init: GowaFetchInit = {}): Promise<Response> {
  const { scoped = true, timeoutMs = 30_000, ...requestInit } = init;
  const url = `${config.gowaBaseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  const headers = new Headers(requestInit.headers);
  for (const [k, v] of Object.entries(authHeader())) headers.set(k, v);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (requestInit.body instanceof FormData) headers.delete('Content-Type');

  if (scoped) {
    const deviceId = await ensureDeviceId();
    if (deviceId) headers.set('X-Device-Id', deviceId);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...requestInit, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function gowaJsonOnce<T>(pathname: string, init?: GowaFetchInit): Promise<T> {
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
    throw new GowaError(gowaMessage(body, res.status), res.status, body, gowaCode(body));
  }
  return body as T;
}

async function gowaJson<T>(pathname: string, init?: GowaFetchInit): Promise<T> {
  try {
    return await gowaJsonOnce<T>(pathname, init);
  } catch (err) {
    const retryable =
      err instanceof GowaError &&
      init?.scoped !== false &&
      (err.code === 'DEVICE_NOT_FOUND' || err.code === 'DEVICE_ID_REQUIRED');
    if (!retryable) throw err;
    cachedDeviceId = undefined;
    return gowaJsonOnce<T>(pathname, init);
  }
}

function parseDeviceList(results: unknown): GowaDevice[] {
  if (Array.isArray(results)) return results as GowaDevice[];
  if (typeof results === 'object' && results && 'devices' in results) {
    const devices = (results as { devices: unknown }).devices;
    if (Array.isArray(devices)) return devices as GowaDevice[];
  }
  return [];
}

function deviceKey(device: GowaDevice): string | undefined {
  const id = device.id || device.device_id;
  return id ? String(id) : undefined;
}

function isLoggedInDevice(device: GowaDevice): boolean {
  return device.state === 'logged_in' || device.is_logged_in === true;
}

async function listDevices(): Promise<GowaDevice[]> {
  const data = await gowaJson<{ results: unknown }>('/devices', { scoped: false });
  return parseDeviceList(data.results);
}

async function createDevice(id: string): Promise<string> {
  const data = await gowaJson<{ results?: { id?: string; device_id?: string } }>('/devices', {
    method: 'POST',
    scoped: false,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: id }),
  });
  return data.results?.id || data.results?.device_id || id;
}

function pickExistingDevice(devices: GowaDevice[], preferred: string): string | undefined {
  const preferredMatch = devices.find(d => deviceKey(d) === preferred);
  if (preferredMatch) return deviceKey(preferredMatch);

  const loggedIn = devices.find(isLoggedInDevice);
  if (loggedIn) return deviceKey(loggedIn);

  if (devices.length > 0) return deviceKey(devices[0]);
  return undefined;
}

async function resolveDeviceId(): Promise<string | null> {
  const preferred = config.gowaDeviceId;

  let devices: GowaDevice[];
  try {
    devices = await listDevices();
  } catch (err) {
    // Older GOWA builds without /devices still work as a single implicit device.
    if (err instanceof GowaError && (err.status === 404 || err.status === 405)) {
      return null;
    }
    throw err;
  }

  const existing = pickExistingDevice(devices, preferred);
  if (existing) return existing;

  try {
    const created = await createDevice(preferred);
    console.log(`[gowa] created WhatsApp device slot "${created}"`);
    return created;
  } catch (err) {
    const again = await listDevices().catch(() => [] as GowaDevice[]);
    const fallback = pickExistingDevice(again, preferred) ?? deviceKey(again[0] ?? {});
    if (fallback) return fallback;
    throw err;
  }
}

async function ensureDeviceId(): Promise<string | null> {
  if (cachedDeviceId !== undefined) return cachedDeviceId;
  if (!resolvingDeviceId) {
    resolvingDeviceId = resolveDeviceId()
      .then(id => {
        cachedDeviceId = id;
        return id;
      })
      .finally(() => {
        resolvingDeviceId = null;
      });
  }
  return resolvingDeviceId;
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
  const load = async (): Promise<GowaLogin> => {
    const deviceId = await ensureDeviceId();
    if (deviceId) {
      const data = await gowaJson<{ results: GowaLogin }>(
        `/devices/${encodeURIComponent(deviceId)}/login`,
        { scoped: false },
      );
      return data.results;
    }
    const data = await gowaJson<{ results: GowaLogin }>('/app/login');
    return data.results;
  };

  try {
    return await load();
  } catch (err) {
    const missing =
      err instanceof GowaError &&
      (err.code === 'DEVICE_NOT_FOUND' || /device .*not found/i.test(err.message));
    if (!missing) throw err;
    cachedDeviceId = undefined;
    return load();
  }
}

export async function logoutDevice(): Promise<void> {
  const deviceId = await ensureDeviceId();
  if (deviceId) {
    try {
      await gowaJson(`/devices/${encodeURIComponent(deviceId)}/logout`, {
        method: 'POST',
        scoped: false,
      });
      return;
    } catch (err) {
      if (!(err instanceof GowaError && (err.status === 404 || err.status === 405))) {
        throw err;
      }
    }
  }
  await gowaJson('/app/logout');
}

export async function checkUser(phone: string, timeoutMs = 20_000): Promise<boolean> {
  const digits = phone.replace(/\D/g, '');
  const data = await gowaJson<{ results: { is_on_whatsapp: boolean } }>(
    `/user/check?phone=${encodeURIComponent(digits)}`,
    { timeoutMs },
  );
  return Boolean(data.results?.is_on_whatsapp);
}

export interface PhoneCheckResult {
  onWhatsApp: string[];
  notOnWhatsApp: string[];
  failed: Array<{ phone: string; error: string }>;
}

export async function checkUsers(phones: string[], concurrency = 6): Promise<PhoneCheckResult> {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of phones) {
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length < 8 || seen.has(digits)) continue;
    seen.add(digits);
    unique.push(digits);
  }

  const onWhatsApp: string[] = [];
  const notOnWhatsApp: string[] = [];
  const failed: Array<{ phone: string; error: string }> = [];

  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (index < unique.length) {
      const phone = unique[index++];
      try {
        if (await checkUser(phone)) onWhatsApp.push(phone);
        else notOnWhatsApp.push(phone);
      } catch (err) {
        failed.push({
          phone,
          error: err instanceof Error ? err.message : 'check failed',
        });
      }
    }
  });
  await Promise.all(workers);

  return { onWhatsApp, notOnWhatsApp, failed };
}

export interface WaContact {
  phone: string;
  name: string;
}

function jidToPhone(jid: string): string | null {
  const value = String(jid || '');
  if (!value || value.includes('@g.us') || value.includes('@broadcast') || value.endsWith('@lid')) {
    return null;
  }
  const user = value.split('@')[0] || '';
  const digits = user.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits;
}

export async function listContacts(): Promise<WaContact[]> {
  const data = await gowaJson<{ results?: unknown }>('/user/my/contacts', { timeoutMs: 60_000 });
  const results = data.results;
  let rows: unknown[] = [];
  if (Array.isArray(results)) {
    rows = results;
  } else if (results && typeof results === 'object' && Array.isArray((results as { data?: unknown }).data)) {
    rows = (results as { data: unknown[] }).data;
  }

  const seen = new Set<string>();
  const contacts: WaContact[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as { jid?: string; id?: string; name?: string; notify?: string };
    const phone = jidToPhone(item.jid || item.id || '');
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    contacts.push({
      phone,
      name: String(item.name || item.notify || '').trim() || phone,
    });
  }

  contacts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return contacts;
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

export async function sendMediaMessage(opts: {
  kind: 'image' | 'video' | 'file';
  phone: string;
  filePath: string;
  filename: string;
  mime: string;
  caption?: string;
}): Promise<void> {
  const fs = await import('node:fs/promises');
  const digits = opts.phone.replace(/\D/g, '');
  const bytes = await fs.readFile(opts.filePath);
  const file = new File([new Uint8Array(bytes)], opts.filename, { type: opts.mime });
  const form = new FormData();
  form.set('phone', `${digits}@s.whatsapp.net`);
  const caption = opts.caption?.trim();
  if (caption) form.set('caption', caption);

  let pathname = '/send/file';
  if (opts.kind === 'image') {
    pathname = '/send/image';
    form.set('image', file);
    form.set('compress', 'true');
  } else if (opts.kind === 'video') {
    pathname = '/send/video';
    form.set('video', file);
  } else {
    form.set('file', file);
  }

  await gowaJson(pathname, { method: 'POST', body: form, timeoutMs: 180_000 });
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
    const res = await gowaFetch('/health', { scoped: false });
    return res.ok;
  } catch {
    return false;
  }
}
