import { Router } from 'express';
import { requireAuth, validateCredentials } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const username = String(req.body?.username ?? '');
  const password = String(req.body?.password ?? '');
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  if (!validateCredentials(username, password)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  req.session.authenticated = true;
  req.session.username = username;
  res.json({ ok: true, username });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.session.username });
});
