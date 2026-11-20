import { Policy, Control, Decision, Shop, Flag, AuditLog } from '../models';
import { DEFAULT_SETTINGS, RuleSettings } from '../lib/rules';

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function getActivePolicy(): Promise<Lean> {
  let p = (await Policy.findOne().sort({ version: -1 }).lean()) as Lean;
  if (!p) p = (await Policy.create({ version: 1, created_by: 'system', note: 'Initial policy' })).toObject();
  return p;
}

export async function getPolicy(version: number): Promise<Lean | null> {
  return (await Policy.findOne({ version }).lean()) as Lean;
}

export function ruleSettingsFrom(p: Lean): RuleSettings {
  return {
    ...DEFAULT_SETTINGS,
    household_mixing_pct: p.household_mixing_pct,
    trend_drop_pct: p.trend_drop_pct,
    good_installment_to_margin: p.good_installment_to_margin,
    max_installment_to_margin: p.max_installment_to_margin,
    viable_points: p.viable_points,
    not_viable_points: p.not_viable_points,
    min_coverage_pct: p.min_coverage_pct,
  };
}

export async function getControl() {
  let c = await Control.findOne({ key: 'ai' });
  if (!c) c = await Control.create({ key: 'ai', paused: false, source: null, reason: null, metrics: {} });
  return c;
}

export async function setPause(paused: boolean, source: 'lender' | 'circuit_breaker', reason: string, actor = 'lender', metrics: Lean = {}) {
  const c = await getControl();
  c.set({ paused, source: paused ? source : null, reason: paused ? reason : null, metrics });
  await c.save();
  await AuditLog.create({ actor, action: paused ? `control:pause (${source})` : 'control:resume', agent: 'Policy', redacted_payload_json: { reason }, output_json: metrics, mode: source === 'lender' ? 'human' : 'rules' });
  return c;
}

/** Circuit-breaker metrics: hold rate among recent AI decisions, and the simulated default rate of funded loans. */
export async function breakerMetrics(p: Lean) {
  const recent = (await Decision.find({ legacy_note: { $in: [null, undefined] } }).sort({ createdAt: -1 }).limit(p.breaker_window).lean()) as Lean[];
  const holds = recent.filter((d) => d.decision === 'hold_need_evidence').length;
  const holdRate = recent.length ? holds / recent.length : 0;
  const funded = await Shop.find({ funded: true, cohort_flag: 'demo' }).select('_id').lean();
  let calls = 0;
  for (const s of funded) if (await Flag.exists({ shop: s._id, severity: 'call', status: { $ne: 'resolved' } })) calls++;
  const defaultRate = funded.length ? calls / funded.length : 0;
  return { recent: recent.length, holds, holdRate, funded: funded.length, calls, defaultRate };
}

/** Trip the breaker (pause AI decisions) when a limit is crossed. Never auto-resumes: the lender resumes. */
export async function checkBreaker(actor = 'system') {
  const p = await getActivePolicy();
  const m = await breakerMetrics(p);
  const reasons: string[] = [];
  if (m.recent >= p.breaker_min_decisions && m.holdRate > p.breaker_max_hold_rate)
    reasons.push(`hold rate ${(m.holdRate * 100).toFixed(0)}% over the last ${m.recent} decisions is above the limit of ${(p.breaker_max_hold_rate * 100).toFixed(0)}%`);
  if (m.funded >= 3 && m.defaultRate > p.breaker_max_default_rate)
    reasons.push(`simulated default rate ${(m.defaultRate * 100).toFixed(0)}% (${m.calls} of ${m.funded} funded loans at call level) is above the limit of ${(p.breaker_max_default_rate * 100).toFixed(0)}%`);
  const c = await getControl();
  if (reasons.length && !c.paused) await setPause(true, 'circuit_breaker', `Circuit breaker: ${reasons.join('; ')}.`, actor, m);
  return { tripped: reasons.length > 0, reasons, metrics: m, policy_version: p.version };
}
