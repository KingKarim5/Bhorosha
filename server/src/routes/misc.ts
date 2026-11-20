import { Router } from 'express';
import fs from 'fs';
import { z } from 'zod';
import { requireRole } from '../auth';
import { Application, Shop, Verdict, Decision, AuditLog, ShadowCase, Flag } from '../models';
import { config } from '../config';
import { getSettingsDoc } from '../services/settings';
import { recompute } from '../services/casefile';
import { seedAll } from '../seed/seed';
import { FEATURE_NAMES, CAUSES } from '../lib/features';
import { VERDICT_TEXT } from '../lib/rules';
import { getSim } from '../services/watchman';
import { modelStatus, loadModel } from '../lib/model';

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const r = Router();
const staff = requireRole('lender');

function readEval(): Lean | null {
  try {
    return fs.existsSync(config.evalPath) ? JSON.parse(fs.readFileSync(config.evalPath, 'utf8')) : null;
  } catch {
    return null;
  }
}

function shadowSummary(rows: Lean[]) {
  const bands = ['viable', 'not_sure', 'not_viable'].map((v) => {
    const xs = rows.filter((r2) => r2.bhorsha_verdict === v);
    return { verdict: v, n: xs.length, trading_12m: xs.filter((x) => x.trading_12m).length, survival_pct: xs.length ? Math.round((xs.filter((x) => x.trading_12m).length / xs.length) * 100) : null };
  });
  const agree = rows.filter((x) => (x.bhorsha_verdict === 'viable' && x.manager_decision === 'approve') || (x.bhorsha_verdict === 'not_viable' && x.manager_decision === 'decline')).length;
  return { n: rows.length, bands, agreement_pct: rows.length ? Math.round((agree / rows.length) * 100) : 0 };
}

r.get('/dashboard', staff, async (_req, res) => {
  const shops = await Shop.find({ cohort_flag: 'demo' }).lean();
  const apps = await Application.find({ shop: { $in: shops.map((s) => s._id) } }).lean();
  const verdicts = await Verdict.find({ _id: { $in: apps.map((a) => a.current_verdict) } }).lean();
  const byStatus = ['draft', 'filed', 'decided', 'funded'].map((s) => ({ status: s, n: apps.filter((a) => a.status === s).length }));
  const byVerdict = ['viable', 'not_sure', 'not_viable'].map((v) => ({ verdict: v, n: verdicts.filter((x) => x.final_verdict === v).length }));
  const openFlags = await Flag.find({ status: { $ne: 'resolved' } }).sort({ month: -1 }).limit(5).populate('shop', 'label').lean();
  const shadow = shadowSummary(await ShadowCase.find().lean());
  const sim = await getSim();
  res.json({ byStatus, byVerdict, openFlags, shadow, sim: { month_index: sim.month_index, base_month: sim.base_month }, model: modelStatus() });
});

r.get('/shadow', staff, async (_req, res) => {
  const rows = await ShadowCase.find().lean();
  res.json({ rows, summary: shadowSummary(rows) });
});

r.get('/audit', staff, async (req, res) => {
  const filter = req.query.ai ? { action: /^ai:/ } : {};
  res.json(await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200).lean());
});

r.get('/evaluation', async (_req, res) => {
  res.json({ eval: readEval(), model: modelStatus() });
});

r.get('/fairness', staff, async (_req, res) => {
  const ev = readEval();
  const aiCalls = await AuditLog.find({ action: /^ai:/ }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({
    model_inputs: FEATURE_NAMES,
    excluded: ['gender', 'religion', 'marital status', 'ethnicity', 'district or location', 'owner name', 'business type (used only for seasonality)'],
    fairness: ev?.fairness ?? null,
    ai_calls: aiCalls,
  });
});

r.get('/settings', staff, async (_req, res) => res.json(await getSettingsDoc()));

r.put('/settings', requireRole('lender'), async (req, res) => {
  const b = z
    .object({
      min_coverage_pct: z.number().min(0).max(100),
      max_installment_to_margin: z.number().min(0.1).max(2),
      good_installment_to_margin: z.number().min(0.05).max(1.5),
      household_mixing_pct: z.number().min(5).max(80),
      trend_drop_pct: z.number().min(1).max(80),
      viable_points: z.number().int().min(1).max(8),
      not_viable_points: z.number().int().min(-8).max(-1),
      required_documents_json: z.array(z.string()).optional(),
      language_default: z.enum(['bn', 'en']).optional(),
      refinance_toggle: z.boolean().optional(),
      investor_cap_per_loan_bdt: z.number().min(1000).max(1000000).optional(),
      investor_cap_total_bdt: z.number().min(1000).max(10000000).optional(),
    })
    .partial()
    .parse(req.body);
  const s = await getSettingsDoc();
  Object.assign(s, b);
  await s.save();
  const changes: { id: unknown; before: string; after: string }[] = []; // v2: policy changes apply only to new decisions
  await AuditLog.create({ actor: req.user!.email, action: 'settings:update', redacted_payload_json: b, output_json: { changes }, mode: 'human' });
  res.json({ settings: s, changes });
});

r.post('/admin/reset', requireRole('lender'), async (_req, res) => {
  await seedAll(() => undefined);
  loadModel(true);
  res.json({ ok: true });
});

export default r;
