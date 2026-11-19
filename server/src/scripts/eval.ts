// npm run eval (TypeScript part): evaluates the components that live in the server and merges them with the
// Python classifier metrics into ml/model/eval.json, which /evaluation renders. Fixed seeds throughout.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ROOT, config } from '../config';
import { generate } from '../seed/generator';
import { summarise } from '../lib/statement';
import { forecastNext, fixedThresholdFlag } from '../lib/forecast';
import { runChecks } from '../lib/checks';
import { mulberry32, median, mean, quantile } from '../lib/util';
import { FEATURE_NAMES, Features } from '../lib/features';
import { judge } from '../lib/judge';
import { DEFAULT_SETTINGS } from '../lib/rules';
import { counterfactualSearch, ACTIONS } from '../lib/conditions';
import { loadModel } from '../lib/model';
import { allocate } from '../services/allocator';
import { redact } from '../lib/redact';
import { validateText } from '../lib/validate';

type M = Record<string, unknown>;
const metrics: M[] = [];
const add = (m: M) => metrics.push({ status: 'done', ci_low: null, ci_high: null, baseline: null, baseline_name: null, pass_mark: null, pass: null, ...m });
const planned = (group: string, component: string, metric: string, level: number, limitation: string) => metrics.push({ group, component, metric, level, limitation, status: 'planned', sample_size: 0 });

function bootMedian(xs: number[], seed = 7) {
  const r = mulberry32(seed);
  const meds: number[] = [];
  for (let b = 0; b < 400; b++) meds.push(median(xs.map(() => xs[Math.floor(r() * xs.length)])));
  return [quantile(meds, 0.025), quantile(meds, 0.975)];
}

// ---------------- 5. Watchman ----------------
function watchman() {
  const rng = mulberry32(55);
  const shops: { kind: 'decliner' | 'seasonal' | 'flat'; onset: number; series: { month: string; value: number }[]; type: string }[] = [];
  for (let i = 0; i < 300; i++) {
    const kind = i < 120 ? 'decliner' : i < 210 ? 'seasonal' : 'flat';
    const seasonal = kind === 'seasonal' || (kind === 'decliner' && rng() < 0.3);
    const onset = kind === 'decliner' ? 2 + Math.floor(rng() * 6) : 99; // post-funding month the decline starts
    const depth = 0.35 + rng() * 0.3;
    const rows = generate({
      seed: 9000 + i, startMonth: '2024-01', months: 12, postMonths: 12, base: 40000 + rng() * 150000, growth: (rng() - 0.3) * 0.02, noise: 0.03 + rng() * 0.05,
      businessType: seasonal ? 'fish_trader' : 'generic', seasonal, profileJitter: 0.06,
      multiplier: (k) => (k >= 12 + onset ? Math.max(1 - depth, 1 - (depth * (k - 12 - onset + 1)) / 3) : 1),
      mode: 'retail', txPerDay: 1, supplierRatio: 0.6, supplierBills: 1, lateDays: () => 0, household: 0.05, utility: 500,
    });
    shops.push({ kind, onset, series: summarise(rows).months.map((m) => ({ month: m.month, value: m.inflow })), type: seasonal ? 'fish_trader' : 'generic' });
  }
  const run = (useSeason: boolean) => {
    const leads: number[] = [];
    let falseW = 0;
    let falseF = 0;
    let seasonalYears = 0;
    let tpW = 0;
    let fpW = 0;
    const topk: number[] = [];
    for (let k = 12; k < 24; k++) {
      const ranked: { short: number; true: boolean }[] = [];
      for (const s of shops) {
        const fc = forecastNext(s.series.slice(0, k), s.type, s.type === 'fish_trader', useSeason);
        const a = s.series[k].value;
        const declining = s.kind === 'decliner' && k - 12 >= s.onset;
        if (a < fc.low) (declining ? tpW++ : fpW++);
        ranked.push({ short: 1 - a / Math.max(1, fc.low), true: declining });
      }
      ranked.sort((x, y) => y.short - x.short);
      topk.push(ranked.slice(0, 10).filter((r) => r.true).length / 10);
    }
    for (const s of shops) {
      let firstW = -1;
      let firstF = -1;
      for (let k = 12; k < 24; k++) {
        const fc = forecastNext(s.series.slice(0, k), s.type, s.type === 'fish_trader', useSeason);
        const a = s.series[k].value;
        if (firstW < 0 && a < fc.low && k - 12 >= s.onset) firstW = k;
        if (s.kind !== 'decliner') {
          if (a < fc.low) falseW++;
          if (fixedThresholdFlag(s.series[k - 1].value, a)) falseF++;
        }
        if (firstF < 0 && s.kind === 'decliner' && k - 12 >= s.onset && fixedThresholdFlag(s.series[k - 1].value, a)) firstF = k;
      }
      if (s.kind === 'seasonal') seasonalYears += 1;
      if (s.kind === 'decliner' && firstW >= 0) {
        const defaultMonth = 12 + s.onset + 3; // decline reaches full depth three months after onset
        leads.push(defaultMonth - firstW);
      }
    }
    const healthy = shops.filter((s) => s.kind !== 'decliner').length;
    const seasonalShops = shops.filter((s) => s.kind === 'seasonal');
    let seasonalFalseW = 0;
    let seasonalFalseF = 0;
    for (const s of seasonalShops)
      for (let k = 12; k < 24; k++) {
        const fc = forecastNext(s.series.slice(0, k), s.type, true, useSeason);
        if (s.series[k].value < fc.low) seasonalFalseW++;
        if (fixedThresholdFlag(s.series[k - 1].value, s.series[k].value)) seasonalFalseF++;
      }
    return { leads, falseW: falseW / healthy, falseF: falseF / healthy, seasonalFalseW: seasonalFalseW / seasonalYears, seasonalFalseF: seasonalFalseF / seasonalYears, precision: tpW / Math.max(1, tpW + fpW), p10: mean(topk), detected: leads.length, decliners: shops.filter((s) => s.kind === 'decliner').length };
  };
  const r = run(true);
  const ab = run(false);
  const G = 'Watchman (seasonal forecasting)';
  const LIM = 'Simulated post-funding paths from our own generator (300 shops, 12 months each). Real decline shapes will differ.';
  add({ group: G, component: '5 · Watchman', metric: 'Median lead time before full decline (months)', value: median(r.leads), ...(() => { const [a, b] = bootMedian(r.leads); return { ci_low: a, ci_high: b }; })(), sample_size: r.leads.length, level: 1, pass_mark: '>= 2 months', pass: median(r.leads) >= 2, limitation: `${r.detected} of ${r.decliners} decliners flagged. ` + LIM });
  add({ group: G, component: '5 · Watchman', metric: 'False alarms per borrower-year, seasonal shops', value: Math.round(r.seasonalFalseW * 100) / 100, baseline: Math.round(r.seasonalFalseF * 100) / 100, baseline_name: 'Fixed 30% month-on-month threshold', sample_size: 90, level: 1, pass_mark: 'fewer than the fixed threshold', pass: r.seasonalFalseW < r.seasonalFalseF, limitation: 'Seasonal profile borrowed from the business type. ' + LIM });
  add({ group: G, component: '5 · Watchman', metric: 'False alarms per borrower-year, all healthy shops', value: Math.round(r.falseW * 100) / 100, baseline: Math.round(r.falseF * 100) / 100, baseline_name: 'Fixed 30% threshold', sample_size: 180, level: 1, limitation: LIM });
  add({ group: G, component: '5 · Watchman', metric: 'Precision at 10 (monthly top-10 by shortfall)', value: Math.round(r.p10 * 1000) / 1000, sample_size: 12, level: 1, limitation: 'Averaged over 12 simulated months. ' + LIM });
  add({ group: G, component: 'Ablation', metric: 'False alarms per borrower-year on seasonal shops without seasonal adjustment', value: Math.round(ab.seasonalFalseW * 100) / 100, baseline: Math.round(r.seasonalFalseW * 100) / 100, baseline_name: 'With seasonal adjustment', sample_size: 90, level: 1, limitation: LIM });
}

// ---------------- 7. Tamper ----------------
function tamper() {
  const G = 'Statement checks';
  const strengths = [0, 1, 2, 4, 8];
  for (const s of strengths) {
    let det = 0;
    const n = 80;
    for (let i = 0; i < n; i++) {
      const rows = generate({ seed: 7000 + s * 1000 + i, startMonth: '2025-01', months: 9, base: 30000 + i * 900, growth: 0.005, noise: 0.05, businessType: 'generic', mode: 'retail', txPerDay: 1.2, supplierRatio: 0.6, supplierBills: 2, lateDays: () => 0, household: 0.05, utility: 800, tamperRows: s });
      const checks = runChecks(rows);
      if (checks.some((c) => !c.passed && c.severity !== 'low')) det++;
    }
    add({ group: G, component: '7 · Tamper and consistency', metric: s === 0 ? 'False positives on clean statements' : `Detection rate, ${s} edited balance row${s > 1 ? 's' : ''}`, value: Math.round((det / n) * 1000) / 1000, sample_size: n, level: 1, pass_mark: s === 0 ? 'report the full curve' : undefined, limitation: 'Edits are synthetic running-balance changes. A careful forger who recomputes every balance would not be caught by this check; wording stays "does not reconcile".' });
  }
}

// ---------------- 6. Counterfactuals ----------------
function counterfactuals() {
  const file = path.join(ROOT, 'ml', 'data', 'cohort.csv');
  if (!fs.existsSync(file)) return planned('Conditions', '6 · Counterfactual conditions', 'Validity', 1, 'Run npm run cohort first.');
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const model = loadModel(true);
  let tried = 0;
  let valid = 0;
  let found = 0;
  let protectedChanged = 0;
  const nChanged: number[] = [];
  const allowed = new Set(ACTIONS.flatMap((a) => a.changes));
  for (const line of lines.slice(1, 801)) {
    const c = line.split(',');
    const f = { monthly: [], receivable_bdt: 100000, receivable_confirmed: 0, avg_inflow_3m: 0, estimated_turnover: 0, margin_month: 0, installment: 0, coverage_known: 1, stock_signal: 0, txcount_trend: 0, cost_ratio_change: 0, seasonal_used: 0, late_days_recent: 0 } as unknown as Features;
    for (const k of FEATURE_NAMES) (f as unknown as Record<string, number>)[k] = Number(c[head.indexOf(k)]);
    const j = judge(f, DEFAULT_SETTINGS, model);
    if (j.final_verdict === 'viable') continue;
    tried++;
    const fn = (g: Features) => judge(g, DEFAULT_SETTINGS, model).final_verdict;
    const cfs = counterfactualSearch(f, DEFAULT_SETTINGS, 300000, fn);
    if (!cfs.length) continue;
    found++;
    const cf = cfs[0];
    let g = f;
    for (const a of cf.actions) g = ACTIONS.find((x) => x.key === a)!.apply(g, DEFAULT_SETTINGS);
    if (fn(g) === cf.to) valid++;
    if (cf.changed_features.some((x) => !allowed.has(x))) protectedChanged++;
    nChanged.push(cf.changed_features.length);
  }
  const G = 'Conditions';
  add({ group: G, component: '6 · Counterfactual conditions', metric: 'Validity (the suggested change really moves the verdict)', value: found ? Math.round((valid / found) * 1000) / 1000 : null, sample_size: found, level: 1, pass_mark: '>= 90% valid', pass: found ? valid / found >= 0.9 : null, limitation: 'Checked against our own verdict function, so validity is close to guaranteed by construction; plausibility needs lender review.' });
  add({ group: G, component: '6 · Counterfactual conditions', metric: 'Share of not-sure / not-viable files with a verdict-moving condition', value: tried ? Math.round((found / tried) * 1000) / 1000 : null, sample_size: tried, level: 1, limitation: 'Remaining files get the partial condition that moves them closest. Synthetic cohort.' });
  add({ group: G, component: '6 · Counterfactual conditions', metric: 'Features changed per suggestion (mean)', value: nChanged.length ? Math.round(mean(nChanged) * 100) / 100 : null, sample_size: nChanged.length, level: 1, limitation: 'Only actionable features can change.' });
  add({ group: G, component: '6 · Counterfactual conditions', metric: 'Suggestions touching a protected or unchangeable feature', value: protectedChanged, sample_size: found, level: 0, pass_mark: 'zero', pass: protectedChanged === 0, limitation: 'Enforced by the action list; no protected attribute exists in the feature set.' });
}

// ---------------- 10. Allocator ----------------
function allocator() {
  const rng = mulberry32(31);
  let compliant = 0;
  let lower = 0;
  const n = 200;
  for (let i = 0; i < n; i++) {
    const k = 2 + Math.floor(rng() * 6);
    const listings = Array.from({ length: k }, (_, j) => ({ id: String(j), band_low: 50 + Math.floor(rng() * 40), open_bdt: 10000 + Math.floor(rng() * 100) * 1000 }));
    const out = allocate(20000 + Math.floor(rng() * 200) * 1000, listings, 50000);
    if (out.metrics.cap_compliant) compliant++;
    if (out.metrics.concentration_hhi <= out.metrics.naive_concentration_hhi) lower++;
  }
  const G = 'Investor simulation';
  add({ group: G, component: '10 · Pool allocator', metric: 'Cap compliance', value: compliant / n, sample_size: n, level: 1, pass_mark: '100%', pass: compliant === n, limitation: 'Random synthetic listing sets; simulation only.' });
  add({ group: G, component: '10 · Pool allocator', metric: 'Share of runs less concentrated than the naive split', value: lower / n, sample_size: n, level: 1, pass_mark: 'lower concentration than naive', pass: lower === n, limitation: 'HHI on allocated amounts. Says nothing about returns, which are never projected.' });
}

// ---------------- redaction and validator (level 0) ----------------
function safety() {
  const rng = mulberry32(11);
  const names = ['Rahima', 'Karim', 'Sultana', 'Nasir', 'Jahan', 'Tania'];
  let leaks = 0;
  const n = 200;
  for (let i = 0; i < n; i++) {
    const phone = `01${3 + Math.floor(rng() * 7)}${String(Math.floor(rng() * 1e8)).padStart(8, '0')}`;
    const nid = String(Math.floor(1e12 + rng() * 8e12));
    const name = names[i % names.length];
    const txt = `${name} বলেছেন, ফোন ${rng() < 0.5 ? phone : '+880' + phone.slice(1)}, এনআইডি ${nid}। বিক্রি ভালো।`;
    const r = redact(txt, [name]);
    if (r.text.includes(phone.slice(-6)) || r.text.includes(nid) || r.text.includes(name)) leaks++;
  }
  const G = 'Safety checks';
  add({ group: G, component: 'Redaction before AI', metric: 'Synthetic notes with a leaked phone, ID or name', value: leaks, sample_size: n, level: 0, pass_mark: 'zero', pass: leaks === 0, limitation: 'Template notes; names are redacted only when the name is known to the system (shop and owner labels).' });
  const bad = ['The loan is guaranteed.', 'Sales are 52,000 BDT.', 'This is a certificate of viability.', 'Approved by AI.'];
  const good = ['Sales average 46,480 BDT a month.', 'Three reasons support a viable verdict.'];
  const rej = bad.filter((t) => !validateText(t, [46480]).ok).length;
  const acc = good.filter((t) => validateText(t, [46480]).ok).length;
  add({ group: G, component: 'AI output validator', metric: 'Seeded bad outputs rejected', value: rej / bad.length, baseline: acc / good.length, baseline_name: 'Good outputs accepted', sample_size: bad.length + good.length, level: 0, limitation: 'A small hand-written test set; the validator only checks numbers, citations and forbidden words, not meaning.' });
}

async function crossDoc() {
  const G = 'Reading and cross-checking';
  try {
    const { connectDb, disconnectDb } = await import('../db');
    const { Shop, Application, Finding, EvidenceItem, AuditLog } = await import('../models');
    await connectDb();
    const expected: Record<string, string[]> = { karim: ['claim_vs_trend'], nasir: ['personal_as_stock'], tania: ['history_claim', 'duplicate_bill', 'balance_continuity'] };
    let found = 0;
    let total = 0;
    let falseF = 0;
    let allF = 0;
    let cites = 0;
    let validCites = 0;
    for (const s of await Shop.find({ cohort_flag: 'demo', slug: { $in: ['rahima', 'sultana', 'karim', 'nasir', 'jahan', 'tania'] } }).lean()) {
      const app = await Application.findOne({ shop: s._id }).lean();
      const fs_ = await Finding.find({ application: app!._id, kind: { $in: ['contradiction', 'tamper'] } }).lean();
      const eids = new Set((await EvidenceItem.find({ application: app!._id }).lean()).map((e) => e.eid));
      const exp = expected[s.slug as string] || [];
      total += exp.length;
      found += exp.filter((c) => fs_.some((f) => f.code === c)).length;
      allF += fs_.length;
      falseF += fs_.filter((f) => !exp.includes(f.code as string)).length;
      for (const f of fs_) for (const c of f.cited_evidence_ids as string[]) {
        cites++;
        if (eids.has(c)) validCites++;
      }
    }
    add({ group: G, component: '2 · Cross-document reasoning (rule checks)', metric: 'Recall of seeded contradictions', value: total ? Math.round((found / total) * 1000) / 1000 : null, sample_size: total, level: 1, pass_mark: '>= 0.80', pass: total ? found / total >= 0.8 : null, limitation: 'Only 5 seeded contradictions in the 6 demo shops; far too few for a reliable estimate. The AI cross-check is measured separately once run with a key.' });
    add({ group: G, component: '2 · Cross-document reasoning (rule checks)', metric: 'False findings', value: allF ? Math.round((falseF / allF) * 1000) / 1000 : 0, sample_size: allF, level: 1, pass_mark: '<= 5%', pass: allF ? falseF / allF <= 0.05 : true, limitation: 'Same tiny demo set.' });
    add({ group: G, component: '2 · Cross-document reasoning', metric: 'Citation validity (cited evidence ids exist)', value: cites ? validCites / cites : null, sample_size: cites, level: 0, pass_mark: '100%', pass: cites ? validCites === cites : null, limitation: 'Enforced by the validator for AI findings; rule findings cite by construction.' });
    const ai = await AuditLog.find({ action: /^ai:/ }).lean();
    const live = ai.filter((a) => a.mode === 'ai');
    add({ group: 'Operations', component: 'All AI calls', metric: 'Fallback rate (share of AI calls served by DEMO FALLBACK)', value: ai.length ? Math.round(((ai.length - live.length) / ai.length) * 1000) / 1000 : null, sample_size: ai.length, level: 0, limitation: `From the audit log at eval time. ${live.length ? `Median live latency ${median(live.map((a) => Number(a.latency_ms || 0)))} ms.` : 'No live AI calls recorded yet (no key, or not used).'} Cost per file not tracked yet.` });
    await disconnectDb();
  } catch (e) {
    planned(G, '2 · Cross-document reasoning', 'Recall of seeded contradictions', 1, `Needs the seeded database (${(e as Error).message}).`);
  }
}

function unitTests() {
  try {
    const out = execSync('npx vitest run --reporter=json', { cwd: path.join(ROOT, 'server'), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const j = JSON.parse(out.slice(out.indexOf('{')));
    add({ group: 'Correctness', component: 'Unit tests', metric: 'Tests passing', value: j.numPassedTests, baseline: j.numTotalTests, baseline_name: 'Total tests', sample_size: j.numTotalTests, level: 0, pass: j.numPassedTests === j.numTotalTests, limitation: 'Parsing, checks, rules, verdicts on the six demo shops, redaction, validator, forecasting, allocator. Shows the code does what the design says, nothing more.' });
  } catch {
    planned('Correctness', 'Unit tests', 'Tests passing', 0, 'Run npm test.');
  }
}

(async () => {
  console.log('Evaluating server components...');
  unitTests();
  watchman();
  tamper();
  counterfactuals();
  allocator();
  safety();
  await crossDoc();
  const G = 'Planned (not yet measured)';
  planned('Reading and cross-checking', '1 · Bangla bill and note reading', 'Field-level F1, amount exact match, CER (printed and handwritten separately)', 1, 'Needs 20–30 hand-labelled real, non-sensitive bills and a live AI key. Not measured: extraction is never presented as solved; the officer confirms every field.');
  planned('Reading and cross-checking', '2 · AI cross-check', 'Recall and false findings of the AI cross-check', 1, 'Needs a live key and a larger seeded contradiction set.');
  planned(G, '8 · Ask this file', 'Citation validity, groundedness, correct refusals', 1, 'The validator enforces citations on every answer; a labelled question set is planned.');
  planned(G, '9 · Check-in extraction', 'Extraction accuracy', 1, 'Needs labelled owner check-ins.');
  planned(G, '11 · Similar-case retrieval', 'Retrieval quality on seeded pairs', 1, 'For the finals.');
  planned(G, 'Level 2 · Berka (PKDD’99) real outcomes', 'AUC / PR-AUC on 682 real loans, stratified CV', 2, 'Dataset not yet downloaded and licence terms not yet checked. A Czech bank in the 1990s: would show signal on real repayment outcomes, not that Bhorsha works in Bangladesh.');
  planned(G, 'Level 3 · Real lender, shadow mode', 'Agreement and survival by band', 3, 'Needs a lender partner. This is the first stage of the plan.');
  planned(G, 'Human usability check', 'Clarity and usefulness ratings in Bangla (3–5 people)', 1, 'A small usability check, not accuracy.');
  const pyFile = path.join(ROOT, 'ml', 'model', 'metrics_py.json');
  const py = fs.existsSync(pyFile) ? JSON.parse(fs.readFileSync(pyFile, 'utf8')) : { metrics: [], fairness: null };
  const all = { run_at: new Date().toISOString(), seed: py.seed ?? 2026, generator_version: py.generator_version ?? 'cohort-v1', splits: py.splits, metrics: [...metrics.filter((m) => m.group === 'Correctness'), ...py.metrics, ...metrics.filter((m) => m.group !== 'Correctness')], fairness: py.fairness };
  fs.mkdirSync(path.dirname(config.evalPath), { recursive: true });
  fs.writeFileSync(config.evalPath, JSON.stringify(all, null, 1));
  console.log(`Wrote ${all.metrics.length} metrics to ${path.relative(ROOT, config.evalPath)}`);
  for (const m of all.metrics) if (m.status !== 'planned') console.log(`  ${m.component} | ${m.metric}: ${m.value}${m.baseline != null ? ` (vs ${m.baseline})` : ''}${m.pass === false ? '  [below mark]' : ''}`);
})();
