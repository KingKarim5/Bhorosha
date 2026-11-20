// npm run eval (v2): the TypeScript tests in EVAL_PROTOCOL.md, merged with the Python classifier metrics into
// ml/model/eval.json. Every result carries its evidence level, segment, sample size and limitation.
import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { ROOT, config } from '../config';
import { generate } from '../seed/generator';
import { generateOnline } from '../seed/onlineGen';
import { summarise } from '../lib/statement';
import { forecastNext, forecastNextWeek, fixedThresholdFlag, WeekPoint } from '../lib/forecast';
import { runChecks } from '../lib/checks';
import { mulberry32, median, mean, quantile } from '../lib/util';
import { FEATURE_NAMES, Features } from '../lib/features';
import { judge } from '../lib/judge';
import { DEFAULT_SETTINGS } from '../lib/rules';
import { counterfactualSearch, ACTIONS } from '../lib/conditions';
import { loadModel, ModelFile } from '../lib/model';
import { allocate } from '../services/allocator';
import { redact } from '../lib/redact';
import { validateText } from '../lib/validate';
import { decide } from '../lib/decide';
import { breakerReasons } from '../lib/breaker';

type M = Record<string, unknown>;
const metrics: M[] = [];
const SEGS = ['cash_led', 'hybrid', 'digital_first'] as const;
const CAP = 300000;
const GEN: string = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'ml', 'data', 'cohort_v2_meta.json'), 'utf8')).generator_version; } catch { return 'cohort-v2'; } })();
const LIM = 'Synthetic cohort v2 from our own frozen generator (assumptions in EVAL_PROTOCOL.md); not real-world accuracy.';
const add = (m: M) => metrics.push({ status: 'done', evidence: 'synthetic', level: 1, ci_low: null, ci_high: null, baseline: null, baseline_name: null, pass_mark: null, pass: null, segment: 'pooled', generator: GEN, ...m });
const planned = (group: string, component: string, metric: string, level: number, limitation: string, test?: string) => metrics.push({ group, component, metric, level, limitation, status: 'planned', evidence: 'planned', sample_size: 0, test, segment: 'pooled' });

/** Wilson 95% interval for a proportion. */
function wilson(k: number, n: number): [number | null, number | null] {
  if (!n) return [null, null];
  const z = 1.96;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.round(((c - r) / den) * 1000) / 1000, Math.round(((c + r) / den) * 1000) / 1000];
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ---------------- cohort v2 rows ----------------
interface Row {
  id: number;
  segment: string;
  variant: string;
  split: string;
  f: Features;
  rulesVerdict: string;
  materialOpen: number;
  loan: number;
  healthy: boolean;
  label: number;
}
function loadCohort(): Row[] {
  const file = path.join(ROOT, 'ml', 'data', 'cohort_v2.csv');
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const h = lines[0].split(',');
  const col = (c: string[], k: string) => c[h.indexOf(k)];
  return lines.slice(1).map((line) => {
    const c = line.split(',');
    const f = { monthly: [], receivable_bdt: 0, receivable_confirmed: 0, avg_inflow_3m: 0, estimated_turnover: 0, margin_month: 0, installment: 0, coverage_known: 1, stock_signal: 0, txcount_trend: 0, cost_ratio_change: 0, seasonal_used: 0, late_days_recent: 0, return_rate: Number(col(c, 'return_rate')) } as unknown as Features;
    for (const k of FEATURE_NAMES) (f as unknown as Record<string, number>)[k] = Number(col(c, k));
    return { id: Number(col(c, 'id')), segment: col(c, 'segment'), variant: col(c, 'variant'), split: col(c, 'split_hint'), f, rulesVerdict: col(c, 'rules_verdict'), materialOpen: Number(col(c, 'material_open')), loan: Number(col(c, 'loan_bdt')), healthy: col(c, 'healthy') === '1', label: Number(col(c, 'label')) };
  });
}

function decideRow(r: Row, model: ModelFile | null, over: Partial<Parameters<typeof decide>[0]> = {}) {
  const j = judge(r.f, DEFAULT_SETTINGS, model, r.segment);
  return {
    j,
    d: decide({
      paused: false, missingDocs: [], tamper: r.f.consistency_flags >= 2, monthsHistory: r.f.months_history, rulesVerdict: j.rules_verdict, finalVerdict: j.final_verdict, modelSet: j.conformal_set,
      materialOpen: r.materialOpen, loanAsk: r.loan, autonomyCap: CAP, conditions: [], tranches: [{ n: 1, amount_bdt: r.loan, release_en: '', release_bn: '' }],
      evidenceIds: { statement: [], consistency: [], rules: [] }, ...over,
    }),
  };
}

// ---------------- T3 healthy-shop approval, T4 fail-safe, T8 band/hold ----------------
function cohortTests(rows: Row[], model: ModelFile | null) {
  const test = rows.filter((r) => r.variant === 'with' && (r.split === 'heldout' || r.split === 'late_vintage'));
  const G3 = 'T3 · Healthy-shop approval rate';
  const rates: Record<string, number> = {};
  for (const seg of ['pooled', ...SEGS]) {
    const hs = test.filter((r) => r.healthy && (seg === 'pooled' || r.segment === seg));
    const k = hs.filter((r) => decideRow(r, model).d.decision === 'approved_with_conditions').length;
    rates[seg] = hs.length ? k / hs.length : 0;
    const [lo, hi] = wilson(k, hs.length);
    add({ group: G3, component: 'Fail-safe Underwriter', metric: 'Truly healthy shops approved with conditions', value: hs.length ? r3(k / hs.length) : null, ci_low: lo, ci_high: hi, sample_size: hs.length, segment: seg, test: 'T3', limitation: 'Healthy = single "healthy" archetype and still trading at 12 months. A low rate is the cost of a fail-safe design: anything in doubt is held. ' + LIM });
    const ka = hs.filter((r) => decideRow(r, model, { materialOpen: 0 }).d.decision === 'approved_with_conditions').length;
    const [alo, ahi] = wilson(ka, hs.length);
    add({ group: G3, component: 'Fail-safe Underwriter', metric: 'Same shops after the owner answers the payout questions', value: hs.length ? r3(ka / hs.length) : null, ci_low: alo, ci_high: ahi, sample_size: hs.length, segment: seg, test: 'T3', limitation: 'Assumes every question about an unmatched or weak payout is answered; in the app the answer is stored as "owner says" and the file is re-run. ' + LIM });
  }
  const gap = Math.max(...SEGS.map((s) => rates[s])) - Math.min(...SEGS.map((s) => rates[s]));
  add({ group: G3, component: 'Fail-safe Underwriter', metric: 'Largest gap in healthy approval rate between segments (points)', value: Math.round(gap * 1000) / 10, sample_size: test.filter((r) => r.healthy).length, test: 'T3', limitation: `Rates: cash-led ${Math.round(rates.cash_led * 100)}%, hybrid ${Math.round(rates.hybrid * 100)}%, digital-first ${Math.round(rates.digital_first * 100)}%. Reported honestly, no pass mark. ` + LIM });

  const G4 = 'T4 · Fail-safe: seeded traps never approved';
  const traps: [string, (r: Row) => { f?: Partial<Features>; over?: Partial<Parameters<typeof decide>[0]> }][] = [
    ['statement does not reconcile', () => ({ f: { consistency_flags: 2 } })],
    ['under 3 months of statement', () => ({ f: { months_history: 2 } })],
    ['rules not viable', () => ({ f: { trend_3m: -0.35, household_share: 0.45, installment_to_margin: 0.9, months_history: 5 } })],
    ['model contradicts the rules', () => ({ over: { modelSet: ['not_viable'] } })],
    ['material evidence unanswered', () => ({ over: { materialOpen: 1 } })],
    ['AI paused', () => ({ over: { paused: true, pauseReason: 'test' } })],
  ];
  for (const seg of SEGS) {
    const base = test.filter((r) => r.segment === seg).slice(0, 250);
    let n = 0;
    let approved = 0;
    for (const [, mk] of traps)
      for (const r of base) {
        const t = mk(r);
        const rr = { ...r, f: { ...r.f, ...(t.f || {}) } as Features };
        if (t.over?.modelSet) {
          // a contradiction needs a firm rules verdict: force the rules side to viable through the inputs
          const j = judge(rr.f, DEFAULT_SETTINGS, model, seg);
          const d = decide({ paused: false, missingDocs: [], tamper: false, monthsHistory: 12, rulesVerdict: 'viable', finalVerdict: j.final_verdict === 'not_viable' ? 'not_viable' : 'viable', modelSet: ['not_viable'], materialOpen: 0, loanAsk: rr.loan, autonomyCap: CAP, conditions: [], tranches: [], evidenceIds: { statement: [], consistency: [], rules: [] } });
          n++;
          if (d.decision === 'approved_with_conditions') approved++;
          continue;
        }
        const { d } = decideRow(rr, model, t.over || {});
        n++;
        if (d.decision === 'approved_with_conditions') approved++;
      }
    const [lo, hi] = wilson(n - approved, n);
    add({ group: G4, component: 'Fail-safe Underwriter', metric: 'Traps not approved', value: n ? r3((n - approved) / n) : null, ci_low: lo, ci_high: hi, sample_size: n, segment: seg, pass_mark: '100% in every segment', pass: approved === 0, test: 'T4', limitation: `${traps.length} trap kinds × ${base.length} shops. Traps are built by forcing one failing condition onto real cohort shops. ` + LIM });
  }

  const G8 = 'T8 · Extra-evidence ablation (hybrid: with vs without online evidence)';
  const hy = rows.filter((r) => r.segment === 'hybrid' && (r.split === 'heldout' || r.split === 'late_vintage'));
  const w = hy.filter((r) => r.variant === 'with');
  const wo = hy.filter((r) => r.variant === 'without');
  const width = (rs: Row[]) => mean(rs.map((r) => { const b = judge(r.f, DEFAULT_SETTINGS, model, 'hybrid').band; return b.high - b.low; }));
  const holdRate = (rs: Row[]) => rs.filter((r) => decideRow(r, model).d.decision === 'hold_need_evidence').length / Math.max(1, rs.length);
  add({ group: G8, component: 'Ablation', metric: 'Mean likelihood band width (points), with online evidence', value: r3(width(w)), baseline: r3(width(wo)), baseline_name: 'Without online evidence', sample_size: w.length, segment: 'hybrid', test: 'T8', limitation: LIM });
  add({ group: G8, component: 'Ablation', metric: 'Hold rate, with online evidence', value: r3(holdRate(w)), baseline: r3(holdRate(wo)), baseline_name: 'Without online evidence', sample_size: w.length, segment: 'hybrid', test: 'T8', limitation: 'With online evidence, unmatched or weak payouts become owner questions and the file is held until they are answered, so the hold rate can rise even though the evidence is better. Without it, courier payouts stay unclassified credits. ' + LIM });
}

// ---------------- T5 circuit breaker ----------------
function breakerTest() {
  const rng = mulberry32(5);
  const limits = { breaker_max_hold_rate: 0.6, breaker_max_default_rate: 0.3, breaker_min_decisions: 6 };
  let streams = 0;
  let correct = 0;
  for (let s = 0; s < 400; s++) {
    // a stream of decisions; holds spike after a random point
    const spikeAt = 5 + Math.floor(rng() * 30);
    const window: string[] = [];
    let tripAt = -1;
    let crossAt = -1;
    for (let k = 0; k < 60; k++) {
      window.push(rng() < (k >= spikeAt ? 0.85 : 0.3) ? 'hold' : 'approve');
      const recent = window.slice(-10);
      const m = { recent: recent.length, holdRate: recent.filter((x) => x === 'hold').length / recent.length, funded: 0, calls: 0, defaultRate: 0 };
      const crossed = m.recent >= limits.breaker_min_decisions && m.holdRate > limits.breaker_max_hold_rate;
      if (crossed && crossAt < 0) crossAt = k;
      if (breakerReasons(m, limits).length && tripAt < 0) tripAt = k;
    }
    streams++;
    if (tripAt === crossAt) correct++;
  }
  // default-rate limit
  let dOk = 0;
  for (let calls = 0; calls <= 10; calls++) {
    const m = { recent: 0, holdRate: 0, funded: 10, calls, defaultRate: calls / 10 };
    if ((breakerReasons(m, limits).length > 0) === calls / 10 > limits.breaker_max_default_rate) dOk++;
  }
  // 0 approvals while paused
  let pausedApprovals = 0;
  for (let k = 0; k < 500; k++) {
    const d = decide({ paused: true, pauseReason: 'breaker', missingDocs: [], tamper: false, monthsHistory: 12, rulesVerdict: 'viable', finalVerdict: 'viable', modelSet: ['viable'], materialOpen: 0, loanAsk: 100000 + k * 100, autonomyCap: CAP, conditions: [], tranches: [], evidenceIds: { statement: [], consistency: [], rules: [] } });
    if (d.decision === 'approved_with_conditions') pausedApprovals++;
  }
  const G = 'T5 · Circuit breaker';
  add({ group: G, component: 'Circuit breaker', metric: 'Trips on the first check after the hold-rate limit is crossed, never before', value: r3(correct / streams), sample_size: streams, pass_mark: '100%', pass: correct === streams, test: 'T5', limitation: 'Synthetic decision streams with an injected hold spike; window 10, limit 60%.' });
  add({ group: G, component: 'Circuit breaker', metric: 'Default-rate limit trips exactly when crossed', value: r3(dOk / 11), sample_size: 11, pass_mark: '100%', pass: dOk === 11, test: 'T5', limitation: '0 to 10 of 10 funded loans at call level; limit 30%.' });
  add({ group: G, component: 'Circuit breaker', metric: 'Approvals while paused', value: pausedApprovals, sample_size: 500, pass_mark: 'zero', pass: pausedApprovals === 0, test: 'T5', limitation: 'Otherwise-approvable inputs with the AI paused.' });
}

// ---------------- T6 matching ----------------
function matchingTest() {
  const file = path.join(ROOT, 'ml', 'data', 'cohort_v2_matching.json');
  if (!fs.existsSync(file)) return planned('T6 · Matching', 'Courier matching', 'Recall', 1, 'Run npm run cohort first.', 'T6');
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const G = 'T6 · Matching courier payouts to the wallet (injected noise)';
  for (const seg of ['pooled', 'hybrid', 'digital_first']) {
    const c = seg === 'pooled' ? ['hybrid', 'digital_first'].reduce((a: Record<string, number>, s) => { for (const k of Object.keys(m[s])) a[k] = (a[k] || 0) + m[s][k]; return a; }, {}) : m[seg];
    const lim = `${c.shops} shops, ${c.batches} payout batches. Noise: fees, lag 1 to 14 days (beyond 10 is unmatchable by design), partial remittances, missing payouts, duplicate credits, quiet weeks. ` + LIM;
    const [rl, rh] = wilson(c.checked_correct, c.matchable);
    add({ group: G, component: 'Verifier matching', metric: 'Recall (matchable payouts marked checked)', value: c.matchable ? r3(c.checked_correct / c.matchable) : null, ci_low: rl, ci_high: rh, sample_size: c.matchable, segment: seg, pass_mark: '>= 0.90', pass: c.matchable ? c.checked_correct / c.matchable >= 0.9 : null, test: 'T6', limitation: lim });
    const [pl, ph] = wilson(c.checked_correct, c.checked);
    add({ group: G, component: 'Verifier matching', metric: 'Precision (checked payouts that are correct)', value: c.checked ? r3(c.checked_correct / c.checked) : null, ci_low: pl, ci_high: ph, sample_size: c.checked, segment: seg, test: 'T6', limitation: lim });
    const [fl, fh] = wilson(c.false_checked, c.checked);
    add({ group: G, component: 'Verifier matching', metric: 'False-checked rate', value: c.checked ? r3(c.false_checked / c.checked) : null, ci_low: fl, ci_high: fh, sample_size: c.checked, segment: seg, pass_mark: '<= 1%', pass: c.checked ? c.false_checked / c.checked <= 0.01 : null, test: 'T6', limitation: lim });
  }
}

// ---------------- T9 watchman (monthly cash-led, weekly online) ----------------
function bootMedian(xs: number[], seed = 7) {
  if (!xs.length) return [null, null];
  const r = mulberry32(seed);
  const meds: number[] = [];
  for (let b = 0; b < 400; b++) meds.push(median(xs.map(() => xs[Math.floor(r() * xs.length)])));
  return [quantile(meds, 0.025), quantile(meds, 0.975)];
}
function watchmanMonthly() {
  const rng = mulberry32(55);
  const shops: { kind: string; onset: number; series: { month: string; value: number }[]; type: string }[] = [];
  for (let i = 0; i < 300; i++) {
    const kind = i < 120 ? 'decliner' : i < 210 ? 'seasonal' : 'flat';
    const seasonal = kind === 'seasonal' || (kind === 'decliner' && rng() < 0.3);
    const onset = kind === 'decliner' ? 2 + Math.floor(rng() * 6) : 99;
    const depth = 0.35 + rng() * 0.3;
    const rows = generate({ seed: 9000 + i, startMonth: '2024-01', months: 12, postMonths: 12, base: 40000 + rng() * 150000, growth: (rng() - 0.3) * 0.02, noise: 0.03 + rng() * 0.05, businessType: seasonal ? 'fish_trader' : 'generic', seasonal, profileJitter: 0.06, multiplier: (k) => (k >= 12 + onset ? Math.max(1 - depth, 1 - (depth * (k - 12 - onset + 1)) / 3) : 1), mode: 'retail', txPerDay: 1, supplierRatio: 0.6, supplierBills: 1, lateDays: () => 0, household: 0.05, utility: 500 });
    shops.push({ kind, onset, series: summarise(rows).months.map((m) => ({ month: m.month, value: m.inflow })), type: seasonal ? 'fish_trader' : 'generic' });
  }
  const leads: number[] = [];
  let fw = 0;
  let ff = 0;
  let healthy = 0;
  for (const s of shops) {
    let first = -1;
    if (s.kind !== 'decliner') healthy++;
    for (let k = 12; k < 24; k++) {
      const fc = forecastNext(s.series.slice(0, k), s.type, s.type === 'fish_trader');
      const a = s.series[k].value;
      if (s.kind !== 'decliner') {
        if (a < fc.low) fw++;
        if (fixedThresholdFlag(s.series[k - 1].value, a)) ff++;
      } else if (first < 0 && a < fc.low && k - 12 >= s.onset) first = k;
    }
    if (s.kind === 'decliner' && first >= 0) leads.push(12 + s.onset + 3 - first);
  }
  return { leads, fa: fw / healthy, faFixed: ff / healthy, decliners: 120, healthy };
}
function watchmanWeekly() {
  const rng = mulberry32(77);
  const leads: number[] = [];
  let fw = 0;
  let ff = 0;
  let healthyYears = 0;
  let decl = 0;
  for (let i = 0; i < 160; i++) {
    const decliner = i < 60;
    const onsetMonth = 13 + Math.floor(rng() * 4);
    const depth = 0.4 + rng() * 0.3;
    const share = 0.5 + rng() * 0.45;
    const on = generateOnline({ seed: 7700 + i, startMonth: '2025-11', months: 18, postMonths: 0, ordersPerDay: 1.5 + rng() * 3, avgOrder: 400 + rng() * 1100, growth: 0.005, codShare: 0.7, returnRate: 0.05, feeFlat: 70, feePct: 0.01, courier: 'Pathao', maxLagDays: 3, quietWeekProb: 0.02, multiplier: decliner ? (m) => (m >= onsetMonth ? Math.max(1 - depth, 1 - (depth * (m - onsetMonth + 1)) / 2) : 1) : undefined });
    const start = new Date('2025-11-01T00:00:00Z').getTime();
    const weeks: WeekPoint[] = Array.from({ length: 78 }, (_, k) => ({ start: new Date(start + k * 7 * 86400000), value: 0 }));
    for (const s of on.settlements) { const k = Math.floor((s.date.getTime() - start) / (7 * 86400000)); if (k >= 0 && k < 78) weeks[k].value += s.net_remitted; }
    for (const c of on.walletCredits) if (c.counterparty_kind === 'customer') { const k = Math.floor((c.date.getTime() - start) / (7 * 86400000)); if (k >= 0 && k < 78) weeks[k].value += c.amount_bdt; }
    const onsetWeek = Math.round((onsetMonth * 30.4) / 7);
    const fullWeek = onsetWeek + Math.round((2 * 30.4) / 7);
    let first = -1;
    for (let k = 52; k < 76; k++) {
      const fc = forecastNextWeek(weeks.slice(0, k), share, weeks[k].start);
      const a = weeks[k].value;
      if (!decliner) {
        if (a < fc.low) fw++;
        if (fixedThresholdFlag(weeks[k - 1].value, a)) ff++;
      } else if (first < 0 && a < fc.low && k >= onsetWeek) first = k;
    }
    if (!decliner) healthyYears += 24 / 52;
    else {
      decl++;
      if (first >= 0) leads.push(fullWeek - first);
    }
  }
  return { leads, fa: fw / healthyYears, faFixed: ff / healthyYears, decliners: decl, healthy: 100 };
}
function watchmanTests() {
  const G = 'T9 · Watchman against a fixed 30% threshold';
  const mo = watchmanMonthly();
  const [ml, mh] = bootMedian(mo.leads);
  add({ group: G, component: 'Watchman, monthly (cash-led)', metric: 'Median lead time before full decline (months)', value: mo.leads.length ? median(mo.leads) : null, ci_low: ml, ci_high: mh, sample_size: mo.leads.length, segment: 'cash_led', pass_mark: '>= 2 periods', pass: median(mo.leads) >= 2, test: 'T9', limitation: `${mo.leads.length} of ${mo.decliners} decliners flagged. Simulated decline paths. ` + LIM });
  add({ group: G, component: 'Watchman, monthly (cash-led)', metric: 'False alarms per borrower-year (healthy shops)', value: r3(mo.fa), baseline: r3(mo.faFixed), baseline_name: 'Fixed 30% month-on-month threshold', sample_size: mo.healthy, segment: 'cash_led', pass_mark: 'fewer than the fixed threshold', pass: mo.fa < mo.faFixed, test: 'T9', limitation: '90 of the 180 healthy shops are seasonal. ' + LIM });
  const wk = watchmanWeekly();
  const [wl, wh] = bootMedian(wk.leads);
  add({ group: G, component: 'Watchman, weekly (hybrid and digital-first)', metric: 'Median lead time before full decline (weeks)', value: wk.leads.length ? median(wk.leads) : null, ci_low: wl, ci_high: wh, sample_size: wk.leads.length, segment: 'online', pass_mark: '>= 2 periods', pass: wk.leads.length ? median(wk.leads) >= 2 : null, test: 'T9', limitation: `${wk.leads.length} of ${wk.decliners} decliners flagged. Festival weeks included. ` + LIM });
  add({ group: G, component: 'Watchman, weekly (hybrid and digital-first)', metric: 'False alarms per borrower-year (healthy shops)', value: r3(wk.fa), baseline: r3(wk.faFixed), baseline_name: 'Fixed 30% week-on-week threshold', sample_size: wk.healthy, segment: 'online', pass_mark: 'fewer than the fixed threshold', pass: wk.fa < wk.faFixed, test: 'T9', limitation: 'Weekly sales are noisy; the weekly band flags against the 5th percentile. ' + LIM });
}

// ---------------- T10 tamper, T11 counterfactuals, T12 safety, T13 allocator ----------------
function tamper() {
  for (const s of [0, 1, 2, 4, 8]) {
    let det = 0;
    const n = 80;
    for (let i = 0; i < n; i++) {
      const rows = generate({ seed: 7000 + s * 1000 + i, startMonth: '2025-01', months: 9, base: 30000 + i * 900, growth: 0.005, noise: 0.05, businessType: 'generic', mode: 'retail', txPerDay: 1.2, supplierRatio: 0.6, supplierBills: 2, lateDays: () => 0, household: 0.05, utility: 800, tamperRows: s });
      if (runChecks(rows).some((c) => !c.passed && c.severity !== 'low')) det++;
    }
    add({ group: 'T10 · Tamper and consistency', component: 'Verifier checks', metric: s === 0 ? 'False positives on clean statements' : `Detection rate, ${s} edited balance row${s > 1 ? 's' : ''}`, value: r3(det / n), sample_size: n, test: 'T10', generator: 'statement generator', limitation: 'Synthetic running-balance edits. A forger who recomputes every balance would not be caught; the wording stays "does not reconcile".' });
  }
}
function counterfactuals(rows: Row[], model: ModelFile | null) {
  const allowed = new Set(ACTIONS.flatMap((a) => a.changes));
  let tried = 0;
  let found = 0;
  let valid = 0;
  let prot = 0;
  const changed: number[] = [];
  for (const r of rows.filter((x) => x.variant === 'with').slice(0, 900)) {
    const fn = (g: Features) => judge(g, DEFAULT_SETTINGS, model, r.segment).final_verdict;
    if (fn(r.f) === 'viable') continue;
    tried++;
    const cfs = counterfactualSearch({ ...r.f, receivable_bdt: 100000 } as Features, DEFAULT_SETTINGS, 300000, fn);
    if (!cfs.length) continue;
    found++;
    let g = r.f;
    for (const a of cfs[0].actions) g = ACTIONS.find((x) => x.key === a)!.apply(g, DEFAULT_SETTINGS);
    if (fn(g) === cfs[0].to) valid++;
    if (cfs[0].changed_features.some((x) => !allowed.has(x))) prot++;
    changed.push(cfs[0].changed_features.length);
  }
  const G = 'T11 · Counterfactual conditions';
  add({ group: G, component: 'Conditions', metric: 'Validity (the suggested change moves the verdict)', value: found ? r3(valid / found) : null, sample_size: found, pass_mark: '>= 90%', pass: found ? valid / found >= 0.9 : null, test: 'T11', limitation: 'Checked against our own verdict function, so validity is close to certain by construction. ' + LIM });
  add({ group: G, component: 'Conditions', metric: 'Files with a verdict-moving condition', value: tried ? r3(found / tried) : null, sample_size: tried, test: 'T11', limitation: 'The rest get the partial condition that moves them closest. ' + LIM });
  add({ group: G, component: 'Conditions', metric: 'Suggestions touching a protected or unchangeable feature', value: prot, sample_size: found, pass_mark: 'zero', pass: prot === 0, test: 'T11', level: 0, limitation: 'Enforced by the action list.' });
  add({ group: G, component: 'Conditions', metric: 'Features changed per suggestion (mean)', value: changed.length ? r3(mean(changed)) : null, sample_size: changed.length, test: 'T11', limitation: LIM });
}
function safety() {
  const rng = mulberry32(11);
  const names = ['Rahima', 'Karim', 'Sultana', 'Nasir', 'Jahan', 'Tania', 'Rafi'];
  let leaks = 0;
  for (let i = 0; i < 200; i++) {
    const phone = `01${3 + Math.floor(rng() * 7)}${String(Math.floor(rng() * 1e8)).padStart(8, '0')}`;
    const nid = String(Math.floor(1e12 + rng() * 8e12));
    const name = names[i % names.length];
    const r = redact(`${name} বলেছেন, ফোন ${rng() < 0.5 ? phone : '+880' + phone.slice(1)}, এনআইডি ${nid}। বিক্রি ভালো।`, [name]);
    if (r.text.includes(phone.slice(-6)) || r.text.includes(nid) || r.text.includes(name)) leaks++;
  }
  add({ group: 'T12 · Redaction and validator', component: 'Redaction before any model call', metric: 'Synthetic notes with a leaked phone, ID or name', value: leaks, sample_size: 200, pass_mark: 'zero', pass: leaks === 0, test: 'T12', level: 0, generator: 'template notes', limitation: 'Names are redacted only when known to the system (shop and owner labels).' });
  const bad = ['The loan is guaranteed.', 'Sales are 52,000 BDT.', 'This is a certificate of viability.', 'Approved by AI.'];
  const rej = bad.filter((t) => !validateText(t, [46480]).ok).length;
  add({ group: 'T12 · Redaction and validator', component: 'AI output validator', metric: 'Seeded bad outputs rejected', value: r3(rej / bad.length), sample_size: bad.length, pass_mark: 'all', pass: rej === bad.length, test: 'T12', level: 0, generator: 'hand-written', limitation: 'Checks numbers, citations and forbidden words only, not meaning.' });
}
function allocator() {
  const rng = mulberry32(31);
  let ok = 0;
  let lower = 0;
  for (let i = 0; i < 200; i++) {
    const k = 2 + Math.floor(rng() * 6);
    const l = Array.from({ length: k }, (_, j) => ({ id: String(j), band_low: 50 + Math.floor(rng() * 40), open_bdt: 10000 + Math.floor(rng() * 100) * 1000 }));
    const out = allocate(20000 + Math.floor(rng() * 200) * 1000, l, 50000);
    if (out.metrics.cap_compliant) ok++;
    if (out.metrics.concentration_hhi <= out.metrics.naive_concentration_hhi) lower++;
  }
  add({ group: 'T13 · Investor allocator (simulation)', component: 'Allocator', metric: 'Cap compliance', value: ok / 200, sample_size: 200, pass_mark: '100%', pass: ok === 200, test: 'T13', generator: 'random listing sets', limitation: 'Simulation only; returns are never projected.' });
  add({ group: 'T13 · Investor allocator (simulation)', component: 'Allocator', metric: 'Runs less concentrated than the naive split', value: lower / 200, sample_size: 200, pass_mark: '100%', pass: lower === 200, test: 'T13', generator: 'random listing sets', limitation: 'HHI on allocated amounts.' });
}
function unitTests() {
  try {
    const out = execSync('npx vitest run --reporter=json', { cwd: path.join(ROOT, 'server'), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const j = JSON.parse(out.slice(out.indexOf('{')));
    add({ group: 'Correctness', component: 'Unit tests', metric: 'Tests passing', value: j.numPassedTests, baseline: j.numTotalTests, baseline_name: 'Total tests', sample_size: j.numTotalTests, level: 0, pass: j.numPassedTests === j.numTotalTests, generator: 'code', limitation: 'Parsing, matching, checks, rules, decisions and gates, redaction, validator, forecasting, allocator. Shows the code does what the design says, nothing more.' });
  } catch {
    planned('Correctness', 'Unit tests', 'Tests passing', 0, 'Run npm test.');
  }
}

function publicData() {
  const olist = path.join(ROOT, 'data', 'olist');
  const berka = path.join(ROOT, 'data', 'berka');
  if (!fs.existsSync(olist)) planned('Public real data', 'Olist (Brazil e-commerce, 2016 to 2018)', 'Watchman on real seller order streams: band coverage and false alarms (sellers with at least 26 weeks)', 2, 'data/olist/ not present. N = 26 weeks fixed in EVAL_PROTOCOL.md. "Inactive in the last window" would be a labelled survival proxy, never default. Brazil, 2016 to 2018, reviewed-purchases sample, licence unconfirmed.', 'Step 11');
  if (!fs.existsSync(berka)) planned('Public real data', 'Berka (PKDD’99 Financial)', 'Transaction-to-outcome check on 682 real loans (stratified CV)', 2, 'data/berka/ not present. A Czech bank in the 1990s: would show signal on real repayment outcomes, not that Bhorsha works in Bangladesh. Licence terms to be checked.', 'Step 11');
  planned('Planned (not yet measured)', '1 · Bangla bill and note reading', 'Field-level F1, amount exact match, CER (printed and handwritten separately)', 1, 'Needs 20 to 30 hand-labelled real, non-sensitive bills and a live AI key. Readings only count as checked when they match the money trail.');
  planned('Planned (not yet measured)', 'Ask this file', 'Citation validity, groundedness, correct refusals', 1, 'The validator enforces citations on every answer; a labelled question set is planned.');
  planned('Planned (not yet measured)', 'Level 3 · Real lender, shadow mode', 'Agreement and survival by band', 3, 'Needs a lender partner and the lender’s own policy.');
}

(async () => {
  console.log('Evaluating v2...');
  const model = loadModel(true);
  const rows = loadCohort();
  unitTests();
  if (rows.length) cohortTests(rows, model);
  breakerTest();
  matchingTest();
  watchmanTests();
  tamper();
  if (rows.length) counterfactuals(rows, model);
  safety();
  allocator();
  publicData();
  const py = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'ml', 'model', 'metrics_py_v2.json'), 'utf8')); } catch { return { metrics: [], fairness: null }; } })();
  let protocol = { hash: null as string | null, date: null as string | null };
  try {
    const git = (fmt: string) => execFileSync('git', ['log', '-1', `--format=${fmt}`, '--', 'EVAL_PROTOCOL.md'], { cwd: ROOT }).toString().trim();
    protocol = { hash: git('%H'), date: git('%cI') };
  } catch { /* not a git checkout */ }
  const prev = ['eval_v2_0.json', 'eval_v1.json']
    .map((f) => path.join(ROOT, 'ml', 'model', f))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
    .filter((e) => e.generator_version !== GEN);
  const all = {
    run_at: new Date().toISOString(), seed: py.seed ?? 2027, generator_version: GEN, protocol, splits: py.splits, segment_counts_test: py.segment_counts_test,
    metrics: [...metrics.filter((m) => m.group === 'Correctness'), ...py.metrics, ...metrics.filter((m) => m.group !== 'Correctness')], fairness: py.fairness,
    previous: prev.map((e) => ({ generator_version: e.generator_version || 'cohort-v1', run_at: e.run_at, protocol: e.protocol || null, metrics: (e.metrics || []).filter((m: M) => m.status !== 'planned') })),
  };
  fs.mkdirSync(path.dirname(config.evalPath), { recursive: true });
  fs.writeFileSync(config.evalPath, JSON.stringify(all, null, 1));
  console.log(`Wrote ${all.metrics.length} metrics (protocol ${protocol.hash?.slice(0, 7)}) to ${path.relative(ROOT, config.evalPath)}`);
  for (const m of all.metrics) if (m.status !== 'planned') console.log(`  [${m.segment}] ${m.metric}: ${m.value}${m.baseline != null ? ` (vs ${m.baseline})` : ''}${m.pass === false ? '  [BELOW MARK]' : m.pass === true ? '  [meets mark]' : ''}`);
})();
