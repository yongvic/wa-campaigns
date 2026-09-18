import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    username?: string;
  }
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Still compare to reduce timing leaks on length.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function validateCredentials(username: string, password: string): boolean {
  return (
    safeEqual(username, config.dashboardUser) && safeEqual(password, config.dashboardPassword)
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.authenticated) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}
