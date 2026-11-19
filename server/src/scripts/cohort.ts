// Synthetic training/evaluation cohort (brief section 8). FROZEN as cohort-v1: do not tune after seeing results.
// About 3,000 shops over 12 to 18 months with latent states, a hidden hazard model for closure, label noise,
// overlapping archetypes, missing months and a variable cash share. Features are computed by the SAME
// TypeScript code the app uses, so training and serving cannot drift. Writes ml/data/cohort.csv.
import fs from 'fs';
import path from 'path';
import { generate, GenConfig } from '../seed/generator';
import { runChecks } from '../lib/checks';
import { computeFeatures, FEATURE_NAMES } from '../lib/features';
import { evaluateRules, rulesTotal, rulesProbability, rulesVerdict, DEFAULT_SETTINGS } from '../lib/rules';
import { mulberry32, normal, addMonths } from '../lib/util';
import { ROOT } from '../config';

export const GENERATOR_VERSION = 'cohort-v1';
const SEED = 2026;
const N = Number(process.env.COHORT_N || 3000);
const ARCH = ['healthy', 'stock_problem', 'late_payers', 'household_mixing', 'seasonal', 'declining'] as const;
type Arch = (typeof ARCH)[number];
const NOISE_LEVELS = [0.03, 0.06, 0.1];
const HELDOUT_NOISE = 0.14;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function main() {
  const rng = mulberry32(SEED);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const U = (a: number, b: number) => a + rng() * (b - a);
  const rows: string[] = [];
  const header = ['id', 'split_hint', 'vintage', 'archetypes', 'noise', 'tampered', ...FEATURE_NAMES, 'rules_total', 'rules_p', 'rules_verdict', 'group_indep', 'region', 'group_proxy', 'label'];
  rows.push(header.join(','));
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const primary: Arch = pick(ARCH);
    const second: Arch | null = rng() < 0.3 ? pick(ARCH) : null;
    const archs = new Set<Arch>([primary, ...(second && second !== primary ? [second] : [])]);
    const heldMix = archs.has('seasonal') && archs.has('declining');
    const noise = rng() < 0.12 ? HELDOUT_NOISE : pick(NOISE_LEVELS);
    const vintage = Math.floor(rng() * 24); // loan month index 0..23 (Jan 2023 .. Dec 2024)
    const months = 12 + Math.floor(rng() * 7);
    const startMonth = addMonths('2023-01', vintage - months + 12);
    const region = rng() < 0.5 ? 'urban' : 'rural';
    // fairness scenario 1: protected attribute independent of everything
    const group_indep = rng() < 0.5 ? 'A' : 'B';
    // fairness scenario 2: protected attribute correlated with a location proxy
    const group_proxy = rng() < (region === 'rural' ? 0.8 : 0.2) ? 'A' : 'B';
    // cash share: rural shops take more cash (lower wallet coverage) - the proxy channel
    const trueCash = Math.min(0.85, Math.max(0.05, (region === 'rural' ? 0.55 : 0.35) + 0.15 * normal(rng)));
    const statedCash = Math.min(0.9, Math.max(0, trueCash + 0.06 * normal(rng)));
    const base = Math.exp(U(Math.log(20000), Math.log(400000)));
    const growth = archs.has('healthy') ? U(0.005, 0.025) : archs.has('declining') ? U(-0.01, 0.005) : U(-0.005, 0.015);
    const declineStrength = archs.has('declining') ? U(0.15, 0.4) : 0;
    const household = archs.has('household_mixing') ? U(0.25, 0.45) : U(0.02, 0.15);
    const lateRecent = archs.has('late_payers') ? U(5, 12) : 0;
    const stockDays = archs.has('stock_problem') ? 3 + Math.floor(rng() * 4) : rng() < 0.2 ? 1 : 0;
    const seasonal = archs.has('seasonal');
    const tampered = rng() < 0.05;
    const margin = U(0.12, 0.3);
    const statedMargin = rng() < 0.85 ? Math.min(0.4, Math.max(0.05, margin + 0.03 * normal(rng))) : null;
    const missing = rng() < 0.08 ? [2 + Math.floor(rng() * (months - 4))] : [];
    const cfg: GenConfig = {
      seed: SEED * 1000 + i,
      startMonth,
      months,
      base,
      growth,
      noise,
      businessType: seasonal ? 'fish_trader' : 'generic',
      seasonal,
      profileJitter: 0.08,
      multiplier: declineStrength ? (k) => (k >= months - 4 ? 1 - (declineStrength * (k - (months - 5))) / 4 : 1) : undefined,
      mode: 'retail',
      txPerDay: 1,
      stockoutDays: stockDays,
      supplierRatio: Math.min(0.62, 0.95 * (1 - household) - 0.08),
      supplierBills: 2,
      lateDays: (k, r) => (lateRecent && k >= months - 3 ? lateRecent * (0.6 + r() * 0.8) : r() < 0.05 ? 3 + r() * 3 : r() * 0.8),
      household,
      utility: base * 0.03,
      tamperRows: tampered ? 4 + Math.floor(rng() * 6) : 0,
      missingMonths: missing,
    };
    const txns = generate(cfg);
    const turnover = (base * (1 + growth) ** months) / (1 - trueCash);
    const loan = Math.round((turnover * U(0.8, 4.5)) / 1000) * 1000;
    const tenor = pick([12, 24, 36, 48]);
    const checks = runChecks(txns);
    const receivableDays = archs.has('late_payers') && rng() < 0.5 ? Math.round(U(40, 110)) : 0;
    const stated = { cash_share: rng() < 0.9 ? statedCash : null, margin: statedMargin, seasonal: seasonal ? rng() < 0.85 : rng() < 0.05, receivable_bdt: receivableDays ? loan * 0.3 : null, receivable_days: receivableDays || null, receivable_confirmed: receivableDays ? rng() < 0.3 : null };
    const f = computeFeatures({ txns, business_type: cfg.businessType, loan_ask_bdt: loan, tenor_months: tenor, stated, checks });
    const rows_ = evaluateRules(f, DEFAULT_SETTINGS);
    const total = rulesTotal(rows_);
    // hidden hazard for closure within 12 months of the loan (uses latent truth, not the observed features)
    const trueItm = (loan * 0.0075) / (1 - (1 + 0.0075) ** -tenor) / (turnover * margin);
    const h =
      -2.3 + 3.2 * declineStrength + 2.2 * Math.max(0, household - 0.2) + 0.07 * lateRecent + 0.12 * stockDays + 1.1 * Math.max(0, trueItm - 0.45) - 18 * growth + (tampered ? 0.6 : 0) + (seasonal ? 0.15 : 0) + 0.7 * normal(rng);
    let survived = rng() >= sigmoid(h);
    if (rng() < 0.05) survived = !survived; // label noise
    const splitHint = heldMix || noise === HELDOUT_NOISE ? 'heldout' : vintage >= 18 ? 'late_vintage' : 'pool';
    rows.push(
      [i, splitHint, vintage, [...archs].join('+'), noise, tampered ? 1 : 0, ...FEATURE_NAMES.map((k) => Number(f[k]).toFixed(5)), total, rulesProbability(total).toFixed(5), rulesVerdict(total, f), group_indep, region, group_proxy, survived ? 1 : 0].join(','),
    );
    if (i % 500 === 499) console.log(`  ${i + 1}/${N} shops (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  const out = path.join(ROOT, 'ml', 'data');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'cohort.csv'), rows.join('\n'));
  fs.writeFileSync(path.join(out, 'cohort_meta.json'), JSON.stringify({ generator_version: GENERATOR_VERSION, seed: SEED, n: N, features: FEATURE_NAMES }, null, 1));
  console.log(`Wrote ${N} synthetic_cohort shops to ml/data/cohort.csv`);
}

main();
