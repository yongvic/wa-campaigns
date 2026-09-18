import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from './config.js';
import { initDb } from './db.js';
import { resumeInterruptedCampaigns } from './worker.js';
import { authRouter } from './routes/auth.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { campaignsRouter } from './routes/campaigns.js';
import { healthRouter } from './routes/health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

initDb();
resumeInterruptedCampaigns();

const app = express();

app.set('trust proxy', 1);
app.use(
  cors({
    origin: config.isProd ? false : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(
  session({
    name: 'wa_campaigns.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd && process.env.COOKIE_SECURE === 'true',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/campaigns', campaignsRouter);

const staticDirCandidates = [
  process.env.STATIC_DIR,
  path.resolve(__dirname, '../../dashboard/dist'),
  path.resolve(process.cwd(), 'dashboard/dist'),
  path.resolve(process.cwd(), 'public'),
].filter(Boolean) as string[];

const staticDir = staticDirCandidates.find(dir => fs.existsSync(dir));

if (staticDir) {
  app.use(express.static(staticDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  },
);

app.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
  console.log(`[server] GOWA → ${config.gowaBaseUrl}`);
});
