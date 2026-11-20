import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Investor, AuditLog } from '../models';
import { sign, COOKIE, cookieOpts, sessionUser } from '../auth';
import { newApplyCode, ensureTenancy } from '../tenancy';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../seed/seed';

const r = Router();

r.get('/demo-accounts', (_req, res) => res.json({ password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS }));

r.post('/login', async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Enter an email and password.' });
  const u = await User.findOne({ email: body.data.email.toLowerCase() });
  if (!u || !(await bcrypt.compare(body.data.password, u.password_hash || ''))) return res.status(401).json({ error: 'Email or password is wrong.' });
  const user = sessionUser(u.toObject() as never);
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
  org_name: z.string().trim().max(80).optional(),
});

r.post('/signup', async (req, res) => {
  const p = SignupBody.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Check the form.' });
  const b = p.data;
  if (await User.exists({ email: b.email })) return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });
  if (b.role === 'lender' && (!b.org_name || b.org_name.length < 2)) return res.status(400).json({ error: "Enter your institution's name." });
  const u = await User.create({ role: b.role, display_name: b.display_name, email: b.email, password_hash: await bcrypt.hash(b.password, 10), ...(b.role === 'lender' ? { org_name: b.org_name, apply_code: newApplyCode(b.org_name!) } : {}) });
  if (b.role === 'investor') await Investor.create({ user: u._id, label: b.display_name, verification_status: 'not_started', cap_per_loan_bdt: 50000, cap_total_bdt: 200000 });
  await AuditLog.create({ actor: b.email, action: 'auth:signup', redacted_payload_json: { role: b.role }, output_json: {}, mode: 'human' });
  if (u.role === 'lender' && !u.apply_code) await ensureTenancy(); // a lender from before institutions existed
  const fresh = (await User.findById(u._id).lean())!;
  const user = sessionUser(fresh as never);
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
