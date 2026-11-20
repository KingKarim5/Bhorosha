import { Policy, Control, Decision, Shop, Flag, AuditLog, Application } from '../models';
import { DEFAULT_SETTINGS, RuleSettings } from '../lib/rules';
import { breakerReasons } from '../lib/breaker';

// Each lender owns its policy versions, its AI pause switch and its circuit breaker.
type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function getActivePolicy(lenderId: unknown): Promise<Lean> {
  let p = (await Policy.findOne({ lender: lenderId }).sort({ version: -1 }).lean()) as Lean;
  if (!p) {
    try {
      p = (await Policy.create({ lender: lenderId, version: 1, created_by: 'system', note: 'Initial policy' })).toObject();
    } catch {
      p = (await Policy.findOne({ lender: lenderId }).sort({ version: -1 }).lean()) as Lean; // created at the same moment by another request
    }
  }
  return p;
}

export async function getPolicy(lenderId: unknown, version: number): Promise<Lean | null> {
  return (await Policy.findOne({ lender: lenderId, version }).lean()) as Lean;
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

export async function getControl(lenderId: unknown) {
  const key = `ai:${lenderId}`;
  let c = await Control.findOne({ key });
  if (!c) {
    try {
      c = await Control.create({ key, paused: false, source: null, reason: null, metrics: {} });
    } catch {
      c = await Control.findOne({ key });
    }
  }
  return c!;
}

export async function setPause(lenderId: unknown, paused: boolean, source: 'lender' | 'circuit_breaker', reason: string, actor = 'lender', metrics: Lean = {}) {
  const c = await getControl(lenderId);
  c.set({ paused, source: paused ? source : null, reason: paused ? reason : null, metrics });
  await c.save();
  await AuditLog.create({ actor, lender: lenderId, action: paused ? `control:pause (${source})` : 'control:resume', agent: 'Policy', redacted_payload_json: { reason }, output_json: metrics, mode: source === 'lender' ? 'human' : 'rules' });
  return c;
}

/** Circuit-breaker metrics for one lender: hold rate among its recent AI decisions, and the simulated default rate of its funded loans. */
export async function breakerMetrics(p: Lean, lenderId: unknown) {
  const shops = await Shop.find({ lender: lenderId }).select('_id funded').lean();
  const apps = await Application.find({ shop: { $in: shops.map((s) => s._id) } }).select('_id').lean();
  const recent = (await Decision.find({ application: { $in: apps.map((a) => a._id) }, legacy_note: { $in: [null, undefined] } }).sort({ createdAt: -1 }).limit(p.breaker_window).lean()) as Lean[];
  const holds = recent.filter((d) => d.decision === 'hold_need_evidence').length;
  const holdRate = recent.length ? holds / recent.length : 0;
  const funded = shops.filter((s) => s.funded);
  let calls = 0;
  for (const s of funded) if (await Flag.exists({ shop: s._id, severity: 'call', status: { $ne: 'resolved' } })) calls++;
  const defaultRate = funded.length ? calls / funded.length : 0;
  return { recent: recent.length, holds, holdRate, funded: funded.length, calls, defaultRate };
}

/** Trip this lender's breaker (pause its AI decisions) when a limit is crossed. Never auto-resumes: the lender resumes. */
export async function checkBreaker(lenderId: unknown, actor = 'system') {
  const p = await getActivePolicy(lenderId);
  const m = await breakerMetrics(p, lenderId);
  const reasons = breakerReasons(m, p as never);
  const c = await getControl(lenderId);
  if (reasons.length && !c.paused) await setPause(lenderId, true, 'circuit_breaker', `Circuit breaker: ${reasons.join('; ')}.`, actor, m);
  return { tripped: reasons.length > 0, reasons, metrics: m, policy_version: p.version };
}
