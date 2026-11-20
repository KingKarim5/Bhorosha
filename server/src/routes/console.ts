import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth';
import { Policy, Decision, Application, Shop, AuditLog } from '../models';
import { getActivePolicy, getControl, setPause, breakerMetrics, checkBreaker } from '../services/policy';
import { termsFrom, checkRateSetup } from '../lib/loanTerms';
import { lenderShopIds } from '../tenancy';

// Policy and Audit Console (v2): the lender owns the policy, reads every AI decision and the audit log,
// and can pause the AI. The console never approves or declines an individual case.
type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const r = Router();
const lender = requireRole('lender');

r.get('/console', lender, async (req, res) => {
  const me = req.user!.id;
  const policy = await getActivePolicy(me);
  const versions = await Policy.find({ lender: me }).sort({ version: -1 }).lean();
  const control = await getControl(me);
  const metrics = await breakerMetrics(policy, me);
  const shops = await Shop.find({ cohort_flag: 'demo', lender: me }).select('label segment').lean();
  const apps = await Application.find({ shop: { $in: shops.map((s) => s._id) } }).select('shop loan_ask_bdt status').lean();
  const decisions = (await Decision.find({ application: { $in: apps.map((a) => a._id) } }).sort({ createdAt: -1 }).limit(200).lean()) as Lean[];
  const rows: Lean[] = decisions.map((d) => {
    const a = apps.find((x) => String(x._id) === String(d.application));
    const s = shops.find((x) => String(x._id) === String(a?.shop));
    return { ...d, shop: s?.label, segment: s?.segment, loan_ask_bdt: a?.loan_ask_bdt, case_id: a?._id };
  });
  const counts = ['approved_with_conditions', 'declined_with_plan', 'hold_need_evidence'].map((k) => ({ decision: k, n: rows.filter((x) => x.decision === k).length }));
  res.json({ policy: { ...termsFrom(policy), ...policy }, versions, control, metrics, decisions: rows, counts });
});

const PolicyBody = z.object({
  autonomy_cap_bdt: z.number().min(10000).max(5000000),
  min_documents: z.array(z.enum(['statement', 'online_evidence', 'supplier_bill'])).min(1),
  household_mixing_pct: z.number().min(5).max(80),
  trend_drop_pct: z.number().min(1).max(80),
  good_installment_to_margin: z.number().min(0.05).max(1.5),
  max_installment_to_margin: z.number().min(0.1).max(2),
  viable_points: z.number().int().min(1).max(8),
  not_viable_points: z.number().int().min(-8).max(-1),
  min_coverage_pct: z.number().min(0).max(100),
  breaker_max_default_rate: z.number().min(0.01).max(1),
  breaker_max_hold_rate: z.number().min(0.05).max(1),
  breaker_window: z.number().int().min(3).max(100),
  breaker_min_decisions: z.number().int().min(1).max(100),
  max_principal_bdt: z.number().min(10000).max(10000000).optional(),
  max_tenor_months: z.number().int().min(1).max(60).optional(),
  bank_rate_pct: z.number().min(0).max(30).optional(),
  investor_spread_pct: z.number().min(0).max(5).optional(),
  borrower_rate_pct: z.number().min(1).max(40).optional(),
  fee_pct_short: z.number().min(0).max(30).optional(),
  fee_pct_mid: z.number().min(0).max(30).optional(),
  fee_pct_long: z.number().min(0).max(30).optional(),
  rebate_default_pct: z.number().min(0).max(100).optional(),
  rebate_min_pct: z.number().min(0).max(100).optional(),
  rebate_max_pct: z.number().min(0).max(100).optional(),
  penalty_default_pts: z.number().min(0).max(20).optional(),
  penalty_min_pts: z.number().min(0).max(20).optional(),
  penalty_max_pts: z.number().min(0).max(20).optional(),
  grace_days: z.number().int().min(0).max(15).optional(),
  match_confidence_min: z.number().min(0.5).max(1).optional(),
  early_pay_discount_pct: z.number().min(0, 'The early-payment discount cannot be negative.').max(100, 'The early-payment discount is a share of the interest: at most 100%.').optional(),
  early_pay_min_days: z.number().int().min(1, 'Early means at least 1 day before the due date.').max(28, 'Use 28 days or fewer.').optional(),
  note: z.string().trim().max(300).default(''),
});

r.post('/policy', lender, async (req, res) => {
  const b = PolicyBody.parse(req.body);
  const me = req.user!.id;
  const cur = await getActivePolicy(me);
  // the code refuses a setup where the borrower rate is below investor rate plus Bhorsha's fee (checked at every fee tier)
  const t = termsFrom({ ...cur, ...b });
  for (const tenor of [3, 6, t.max_tenor_months]) {
    const rc = checkRateSetup(t.borrower_rate_pct, tenor, t);
    if (!rc.ok) return res.status(400).json({ error: `Policy refused: ${rc.en}` });
  }
  if (!(t.rebate_min_pct <= t.rebate_default_pct && t.rebate_default_pct <= t.rebate_max_pct)) return res.status(400).json({ error: 'Policy refused: the default rebate must sit between its minimum and maximum.' });
  if (!(t.penalty_min_pts <= t.penalty_default_pts && t.penalty_default_pts <= t.penalty_max_pts)) return res.status(400).json({ error: 'Policy refused: the default late penalty must sit between its minimum and maximum.' });
  const p = await Policy.create({ ...b, lender: me, version: cur.version + 1, created_by: req.user!.email });
  await AuditLog.create({ actor: req.user!.email, lender: me, action: 'policy:new_version', agent: 'Policy', redacted_payload_json: b, output_json: { version: p.version, applies_to: 'new decisions only' }, mode: 'human' });
  const breaker = await checkBreaker(me, req.user!.email);
  res.json({ policy: p, breaker });
});

r.post('/control/pause', lender, async (req, res) => {
  const b = z.object({ paused: z.boolean(), reason: z.string().trim().max(300).default('') }).parse(req.body);
  const c = await setPause(req.user!.id, b.paused, 'lender', b.paused ? b.reason || 'Paused by the lender.' : '', req.user!.email);
  res.json(c);
});

r.post('/control/check-breaker', lender, async (req, res) => res.json(await checkBreaker(req.user!.id, req.user!.email)));

r.get('/audit/full', lender, async (req, res) => {
  const apps = await Application.find({ shop: { $in: await lenderShopIds(req.user!.id) } }).select('_id').lean();
  const q: Lean = { $or: [{ application: { $in: apps.map((a) => a._id) } }, { lender: req.user!.id }] };
  if (req.query.agent) q.agent = String(req.query.agent);
  if (req.query.ai) q.action = /^ai:/;
  res.json(await AuditLog.find(q).sort({ createdAt: -1 }).limit(300).lean());
});

export default r;
