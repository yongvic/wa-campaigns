const API_BASE = '/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    window.dispatchEvent(new Event('auth:logout'));
  }

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
    const message =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as T;
}

export const authApi = {
  login: (username: string, password: string) =>
    request<{ ok: boolean; username: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ username: string }>('/auth/me'),
};

export interface WhatsAppStatus {
  is_connected: boolean;
  is_logged_in: boolean;
  device_id?: string;
  jid?: string;
}

export interface PhoneCheckResult {
  onWhatsApp: string[];
  notOnWhatsApp: string[];
  failed: Array<{ phone: string; error: string }>;
}

export interface WaContact {
  phone: string;
  name: string;
}

export const whatsappApi = {
  status: () => request<WhatsAppStatus>('/whatsapp/status'),
  qr: () => request<{ qrDuration: number; qrImageUrl: string }>('/whatsapp/qr'),
  logout: () => request<{ ok: boolean }>('/whatsapp/logout', { method: 'POST' }),
  check: (phones: string[]) =>
    request<PhoneCheckResult>('/whatsapp/check', {
      method: 'POST',
      body: JSON.stringify({ phones }),
    }),
  contacts: () => request<{ contacts: WaContact[] }>('/whatsapp/contacts'),
};

export interface Campaign {
  id: string;
  message: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
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
  media_name: string | null;
  media_mime: string | null;
  media_size: number | null;
  has_media: boolean;
}

export const campaignsApi = {
  create: (payload: { message: string; phones: string[]; media?: File }) => {
    if (payload.media) {
      const form = new FormData();
      form.set('message', payload.message);
      form.set('phones', JSON.stringify(payload.phones));
      form.set('media', payload.media);
      return request<Campaign>('/campaigns', { method: 'POST', body: form });
    }
    return request<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify({ message: payload.message, phones: payload.phones }),
    });
  },
  get: (id: string) => request<Campaign>(`/campaigns/${id}`),
  list: () => request<Campaign[]>('/campaigns'),
  cancel: (id: string) =>
    request<Campaign>(`/campaigns/${id}/cancel`, { method: 'POST' }),
};

export const healthApi = {
  check: () =>
    request<{ status: string; version: string; gowa: string }>('/health'),
};
