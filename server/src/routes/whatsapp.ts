import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  fetchGowaBinary,
  getLoginQr,
  getStatus,
  GowaError,
  logoutDevice,
} from '../gowa.js';

export const whatsappRouter = Router();

whatsappRouter.use(requireAuth);

let lastQrLink: string | null = null;

whatsappRouter.get('/status', async (_req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    const statusCode = err instanceof GowaError ? err.status : 502;
    res.status(statusCode).json({
      error: err instanceof Error ? err.message : 'Failed to get status',
    });
  }
});

whatsappRouter.get('/qr', async (_req, res) => {
  try {
    const login = await getLoginQr();
    lastQrLink = login.qr_link;
    res.json({
      qrDuration: login.qr_duration,
      qrImageUrl: `/api/whatsapp/qr-image?t=${Date.now()}`,
    });
  } catch (err) {
    const statusCode = err instanceof GowaError ? err.status : 502;
    res.status(statusCode).json({
      error: err instanceof Error ? err.message : 'Failed to get QR',
    });
  }
});

whatsappRouter.get('/qr-image', async (_req, res) => {
  try {
    if (!lastQrLink) {
      const login = await getLoginQr();
      lastQrLink = login.qr_link;
    }
    const asset = await fetchGowaBinary(lastQrLink);
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(asset.buffer);
  } catch (err) {
    lastQrLink = null;
    const statusCode = err instanceof GowaError ? err.status : 502;
    res.status(statusCode).json({
      error: err instanceof Error ? err.message : 'Failed to fetch QR image',
    });
  }
});

whatsappRouter.post('/logout', async (_req, res) => {
  try {
    await logoutDevice();
    lastQrLink = null;
    res.json({ ok: true });
  } catch (err) {
    const statusCode = err instanceof GowaError ? err.status : 502;
    res.status(statusCode).json({
      error: err instanceof Error ? err.message : 'Failed to logout',
    });
  }
});
