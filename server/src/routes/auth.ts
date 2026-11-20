import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Investor, AuditLog } from '../models';
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

// Self sign-up (demo): a lender account works the shared lender console; an investor account starts unverified
// and goes through the simulated verification before it can commit. Accounts are removed by `npm run seed`.
const SignupBody = z.object({
  role: z.enum(['lender', 'investor']),
  display_name: z.string().trim().min(2, 'Enter your name.').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email.'),
  password: z.string().min(8, 'Use at least 8 characters for the password.').max(100),
});

r.post('/signup', async (req, res) => {
  const p = SignupBody.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Check the form.' });
  const b = p.data;
  if (await User.exists({ email: b.email })) return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });
  const u = await User.create({ role: b.role, display_name: b.display_name, email: b.email, password_hash: await bcrypt.hash(b.password, 10) });
  if (b.role === 'investor') await Investor.create({ user: u._id, label: b.display_name, verification_status: 'not_started', cap_per_loan_bdt: 50000, cap_total_bdt: 200000 });
  await AuditLog.create({ actor: b.email, action: 'auth:signup', redacted_payload_json: { role: b.role }, output_json: {}, mode: 'human' });
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
