import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth';
import { Flag, Intervention, AuditLog, CheckIn } from '../models';
import { simulate, watchlist } from '../services/watchman';
import { lenderShopIds } from '../tenancy';

const r = Router();
const staff = requireRole('lender');

r.get('/watchlist', staff, async (req, res) => res.json(await watchlist(req.user!.id)));

r.post('/watchlist/simulate', staff, async (req, res) => {
  const step = req.body?.step === 'week' ? 'week' : 'month';
  res.json(await simulate(step, req.user!.email, req.user!.id));
});

r.post('/flags/:id/interventions', staff, async (req, res) => {
  const b = z.object({ action: z.string().trim().min(2).max(200), result_note: z.string().max(500).default('') }).parse(req.body);
  const flag = await Flag.findById(req.params.id);
  if (!flag || !(await lenderShopIds(req.user!.id)).some((s) => String(s) === String(flag.shop))) return res.status(404).json({ error: 'flag not found' });
  const i = await Intervention.create({ flag: flag._id, actor: req.user!.email, ...b });
  if (flag.status === 'open') {
    flag.status = 'in_progress';
    await flag.save();
  }
  await AuditLog.create({ actor: req.user!.email, action: 'intervention:log', redacted_payload_json: b, output_json: { flag: String(flag._id) }, mode: 'human' });
  res.json(i);
});

r.patch('/flags/:id', staff, async (req, res) => {
  const b = z.object({ status: z.enum(['open', 'in_progress', 'resolved']) }).parse(req.body);
  const f = await Flag.findOneAndUpdate({ _id: req.params.id, shop: { $in: await lenderShopIds(req.user!.id) } }, { status: b.status }, { new: true });
  if (!f) return res.status(404).json({ error: 'flag not found' });
  res.json(f);
});

// The lender can annotate a month as a one-off shock (it is logged; it never changes a decision).
r.post('/checkins/:id/annotate', staff, async (req, res) => {
  const b = z.object({ note: z.string().trim().max(300) }).parse(req.body);
  const c = await CheckIn.findOneAndUpdate({ _id: req.params.id, shop: { $in: await lenderShopIds(req.user!.id) } }, { officer_annotation: b.note }, { new: true });
  if (!c) return res.status(404).json({ error: 'check-in not found' });
  await AuditLog.create({ actor: req.user!.email, action: 'lender:annotate_month', redacted_payload_json: b, output_json: {}, mode: 'human' });
  res.json(c);
});

export default r;
