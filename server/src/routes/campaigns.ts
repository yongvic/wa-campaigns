import { Router } from 'express';
import { requireAuth } from '../auth.js';
import {
  cancelCampaign,
  createCampaign,
  getCampaign,
  listCampaigns,
} from '../worker.js';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth);

campaignsRouter.get('/', (_req, res) => {
  res.json(listCampaigns());
});

campaignsRouter.get('/:id', (req, res) => {
  const campaign = getCampaign(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json(campaign);
});

campaignsRouter.post('/', (req, res) => {
  try {
    const message = String(req.body?.message ?? '');
    const phones = Array.isArray(req.body?.phones) ? req.body.phones.map(String) : [];
    const delayMinMs =
      req.body?.delayMinMs != null ? Number(req.body.delayMinMs) : undefined;
    const delayMaxMs =
      req.body?.delayMaxMs != null ? Number(req.body.delayMaxMs) : undefined;

    const campaign = createCampaign({ message, phones, delayMinMs, delayMaxMs });
    res.status(201).json(campaign);
  } catch (err) {
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
  res.json(campaign);
});
