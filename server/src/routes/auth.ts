import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models';
import { sign, COOKIE, cookieOpts } from '../auth';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../seed/seed';

const r = Router();

r.get('/demo-accounts', (_req, res) => res.json({ password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS }));

r.post('/login', async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Enter an email and password.' });
  const u = await User.findOne({ email: body.data.email.toLowerCase() });
  if (!u || !(await bcrypt.compare(body.data.password, u.password_hash || ''))) return res.status(401).json({ error: 'Email or password is wrong.' });
  const user = { id: String(u._id), role: u.role as 'lender', email: u.email, display_name: u.display_name || u.email };
  const token = sign(user);
  res.cookie(COOKIE, token, cookieOpts());
  res.json({ user, token });
});

r.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
  res.json({ ok: true });
});

r.get('/me', (req, res) => res.json({ user: req.user || null }));

export default r;
