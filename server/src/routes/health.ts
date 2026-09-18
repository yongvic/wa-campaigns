import { Router } from 'express';
import { config } from '../config.js';
import { pingGowa } from '../gowa.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const gowaOk = await pingGowa();
  res.status(gowaOk ? 200 : 503).json({
    status: gowaOk ? 'ok' : 'degraded',
    version: config.version,
    gowa: gowaOk ? 'up' : 'down',
  });
});
