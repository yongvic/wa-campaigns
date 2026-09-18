import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { assertAllowedUpload, tmpRoot } from '../media.js';
import {
  cancelCampaign,
  createCampaign,
  getCampaign,
  listCampaigns,
  toPublicCampaign,
} from '../worker.js';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpRoot()),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: config.mediaMaxUploadBytes, files: 1 },
});

function unlinkQuiet(filePath?: string): void {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* already moved or missing */
  }
}

function parsePhones(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through to split */
    }
    return trimmed.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

campaignsRouter.get('/', (_req, res) => {
  res.json(listCampaigns().map(toPublicCampaign));
});

campaignsRouter.get('/:id', (req, res) => {
  const campaign = getCampaign(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json(toPublicCampaign(campaign));
});

campaignsRouter.post('/', (req, res, next) => {
  upload.single('media')(req, res, err => {
    if (!err) {
      next();
      return;
    }
    const code = (err as { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large (max 100 MB)' });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
  });
}, (req, res) => {
  const uploaded = req.file;
  try {
    const message = String(req.body?.message ?? '');
    const phones = parsePhones(req.body?.phones);
    const delayMinMs =
      req.body?.delayMinMs != null && req.body.delayMinMs !== ''
        ? Number(req.body.delayMinMs)
        : undefined;
    const delayMaxMs =
      req.body?.delayMaxMs != null && req.body.delayMaxMs !== ''
        ? Number(req.body.delayMaxMs)
        : undefined;

    let media: Parameters<typeof createCampaign>[0]['media'];
    if (uploaded) {
      const kind = assertAllowedUpload(uploaded.originalname, uploaded.mimetype, uploaded.size);
      media = {
        tmpPath: uploaded.path,
        originalName: uploaded.originalname,
        mime: uploaded.mimetype,
        size: uploaded.size,
        kind,
      };
    }

    const campaign = createCampaign({ message, phones, delayMinMs, delayMaxMs, media });
    res.status(201).json(toPublicCampaign(campaign));
  } catch (err) {
    unlinkQuiet(uploaded?.path);
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Failed to create campaign',
    });
  }
});

campaignsRouter.post('/:id/cancel', (req, res) => {
  const campaign = cancelCampaign(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json(toPublicCampaign(campaign));
});
