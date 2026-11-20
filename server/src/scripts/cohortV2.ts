// Synthetic cohort v2 (EVAL_PROTOCOL.md section 2). FROZEN once committed: do not tune to results.
// Three segment families (cash_led, hybrid, digital_first). Online sellers get courier settlements and an
// order log with injected noise; their wallet is matched with the SAME matching code the app uses, and
// matching accuracy is scored against the generator's ground truth. Writes ml/data/cohort_v2.csv,
// ml/data/cohort_v2_meta.json and ml/data/cohort_v2_matching.json.
import fs from 'fs';
import path from 'path';
import { generate, GenConfig, GenTxn } from '../seed/generator';
import { generateOnline } from '../seed/onlineGen';
import { runChecks } from '../lib/checks';
import { computeFeatures, FEATURE_NAMES, Features } from '../lib/features';
import { evaluateRules, rulesTotal, rulesProbability, rulesVerdict, DEFAULT_SETTINGS } from '../lib/rules';
import { matchSettlements, WalletTxn } from '../lib/matching';
import { orderSummary } from '../lib/online';
import { summarise } from '../lib/statement';
import type { Txn } from '../lib/statement';
import { mulberry32, normal, addMonths, mean } from '../lib/util';
import { ROOT } from '../config';

export const GENERATOR_VERSION = 'cohort-v2.1'; // v2.0 let the wallet statement run past the window (see EVAL_PROTOCOL.md §2)
const SEED = 2027;
const N = Number(process.env.COHORT_N || 3000);
const ARCH = ['healthy', 'stock_problem', 'late_payers', 'household_mixing', 'seasonal', 'declining'] as const;
const NOISE_LEVELS = [0.03, 0.06, 0.1];
const HELDOUT_NOISE = 0.14;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const DAY = 86400000;

type Seg = 'cash_led' | 'hybrid' | 'digital_first';
const match = { cash_led: newCounts(), hybrid: newCounts(), digital_first: newCounts() } as Record<Seg, ReturnType<typeof newCounts>>;
function newCounts() {
  return { batches: 0, matchable: 0, checked: 0, checked_correct: 0, false_checked: 0, missed: 0, pending: 0, shops: 0 };
}

/** Same reclassification as the app's Verifier: each checked payout becomes its orders, dated by delivery. */
function verifiedSales(txns: Txn[], settlements: { id: string; order_id: string; net_remitted: number; settlement_date: Date; date: Date }[], seg: Seg, truthByBatch: Map<string, { creditNote: string | null; lag: number; dup: boolean }>) {
  const wallet: WalletTxn[] = txns.map((t, i) => ({ ...t, id: `w${i}` }));
  const end = txns.length ? txns[txns.length - 1].date : null;
  const batches = matchSettlements(settlements, wallet, new Set(), 10, end);
  const checkedIds = new Map(batches.filter((b) => b.status === 'checked').map((b) => [b.txn_id!, b]));
  const byId = new Map(settlements.map((s) => [s.id, s]));
  const sales: Txn[] = [];
  wallet.forEach((t, i) => {
    const b = checkedIds.get(t.id);
    if (!b) return sales.push(txns[i]);
    for (const rid of b.row_ids) {
      const r = byId.get(rid)!;
      sales.push({ date: r.date, amount_bdt: r.net_remitted, direction: 'in', counterparty_kind: 'customer', counterparty: 'Courier settlement (verified)', balance_after_bdt: null });
    }
  });
  sales.sort((a, b) => a.date.getTime() - b.date.getTime());
  // score matching against the generator's truth
  const c = match[seg];
  c.shops++;
  for (const b of batches) {
    c.batches++;
    const truth = truthByBatch.get(b.batch);
    if (b.status === 'pending') {
      c.pending++;
      continue;
    }
    const matchable = !!truth && !!truth.creditNote && truth.lag <= 10 && !truth.dup;
    if (matchable) c.matchable++;
    if (b.status === 'checked') {
      c.checked++;
      const note = wallet.find((w) => w.id === b.txn_id)?.note;
      const correct = !!truth?.creditNote && note === truth.creditNote && truth.lag <= 10;
      if (correct) c.checked_correct++;
      else c.false_checked++;
    } else if (matchable) c.missed++;
  }
  const materialOpen = (() => {
    const monthly = mean(summarise(sales).months.map((m) => m.inflow).slice(-3)) || 1;
    return batches.filter((b) => (b.status === 'weak' || b.status === 'unmatched') && b.net > 0.1 * monthly).length;
  })();
  return { sales, materialOpen };
}

function main() {
  const rng = mulberry32(SEED);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const U = (a: number, b: number) => a + rng() * (b - a);
  const header = ['id', 'segment', 'variant', 'split_hint', 'vintage', 'archetypes', 'noise', 'tampered', ...FEATURE_NAMES, 'return_rate', 'rules_total', 'rules_p', 'rules_verdict', 'material_open', 'loan_bdt', 'healthy', 'group_indep', 'region', 'group_proxy', 'label'];
  const rows: string[] = [header.join(',')];
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const r = rng();
    const seg: Seg = r < 0.45 ? 'cash_led' : r < 0.75 ? 'hybrid' : 'digital_first';
    const online = seg !== 'cash_led';
    const archPool = online ? ([...ARCH, 'high_returns'] as const) : ARCH;
    const primary = pick(archPool as readonly string[]);
    const second = rng() < 0.3 ? pick(archPool as readonly string[]) : null;
    const archs = new Set<string>([primary, ...(second && second !== primary ? [second] : [])]);
    const heldMix = archs.has('seasonal') && archs.has('declining');
    const noise = rng() < 0.12 ? HELDOUT_NOISE : pick(NOISE_LEVELS);
    const vintage = Math.floor(rng() * 24);
    const months = 12 + Math.floor(rng() * 7);
    const startMonth = addMonths('2023-01', vintage - months + 12);
    const region = rng() < 0.5 ? 'urban' : 'rural';
    const group_indep = rng() < 0.5 ? 'A' : 'B';
    const group_proxy = rng() < (region === 'rural' ? 0.8 : 0.2) ? 'A' : 'B';
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
    const decline = declineStrength ? (k: number) => (k >= months - 4 ? 1 - (declineStrength * (k - (months - 5))) / 4 : 1) : undefined;

    // ---- sales mix
    let inShopCash: number; // share of turnover taken as cash in the shop (invisible)
    let onlineShare = 0;
    let turnover: number;
    let on: ReturnType<typeof generateOnline> | null = null;
    let returnRate = 0;
    if (!online) {
      inShopCash = Math.min(0.8, Math.max(0.4, (region === 'rural' ? 0.62 : 0.5) + 0.12 * normal(rng)));
      turnover = Math.exp(U(Math.log(30000), Math.log(400000)));
    } else {
      const inShop = seg === 'hybrid' ? U(0.3, 0.6) : U(0.05, 0.2);
      onlineShare = 1 - inShop;
      inShopCash = inShop * 0.9;
      returnRate = archs.has('high_returns') ? U(0.12, 0.25) : U(0.02, 0.08);
      const opd = U(1.5, 4.5);
      const avg = U(400, 1500);
      const dropBatch = rng() < 0.3 ? Math.floor(rng() * 30) : null;
      on = generateOnline({
        seed: SEED * 1000 + i, startMonth, months, postMonths: 0, ordersPerDay: opd, avgOrder: avg, growth,
        codShare: U(0.6, 0.8), returnRate, feeFlat: U(50, 120), feePct: U(0.005, 0.015), courier: pick(['Pathao', 'RedX', 'Steadfast', 'Paperfly']),
        partialRows: 4, dropBatch, duplicateCredit: rng() < 0.1, maxLagDays: pick([3, 7, 14]), multiplier: decline, quietWeekProb: 0.02,
      });
      const onlineMonthly = opd * avg * 30;
      turnover = onlineMonthly / onlineShare;
    }
    const walletInShop = online ? turnover * (1 - onlineShare) * 0.1 : turnover * (1 - inShopCash);
    const statedCash = Math.min(0.9, Math.max(0, inShopCash + 0.06 * normal(rng)));
    const visibleGuess = online ? walletInShop + turnover * onlineShare * 0.9 : walletInShop;
    const cfg: GenConfig = {
      seed: SEED * 1000 + 500 + i, startMonth, months, base: Math.max(1500, walletInShop), growth, noise, businessType: seasonal ? 'fish_trader' : 'generic', seasonal, profileJitter: 0.08,
      multiplier: decline, mode: 'retail', txPerDay: online ? 0.5 : 1, stockoutDays: stockDays,
      supplierRatio: Math.min(8, (Math.min(0.62, 0.95 * (1 - household) - 0.08) * visibleGuess) / Math.max(1500, walletInShop)),
      supplierBills: 2, lateDays: (k, rr) => (lateRecent && k >= months - 3 ? lateRecent * (0.6 + rr() * 0.8) : rr() < 0.05 ? 3 + rr() * 3 : rr() * 0.8),
      household, utility: turnover * 0.02, tamperRows: tampered ? 4 + Math.floor(rng() * 6) : 0, missingMonths: missing, extraRows: on ? (on.walletCredits as GenTxn[]) : undefined,
    };
    // v2.1: the statement covers whole months only; courier payouts that land after it stay pending
    const windowEnd = new Date(`${addMonths(startMonth, months)}-01T00:00:00Z`).getTime();
    const txns = generate(cfg).filter((t) => t.date.getTime() < windowEnd);
    const loan = Math.round((turnover * U(0.8, 4.5)) / 1000) * 1000;
    const tenor = pick([12, 24, 36, 48]);
    const checks = runChecks(txns);
    const receivableDays = archs.has('late_payers') && rng() < 0.5 ? Math.round(U(40, 110)) : 0;
    const stated = { cash_share: rng() < 0.9 ? statedCash : null, margin: statedMargin, seasonal: seasonal ? rng() < 0.85 : rng() < 0.05, receivable_bdt: receivableDays ? loan * 0.3 : null, receivable_days: receivableDays || null, receivable_confirmed: receivableDays ? rng() < 0.3 : null };

    let salesTxns: Txn[] = txns;
    let materialOpen = 0;
    if (on) {
      const truth = new Map(on.truth.map((t) => [t.batchDate, { creditNote: t.creditIndex !== null ? `Payout ${t.batchDate}` : null, lag: t.lagDays, dup: on!.walletCredits.filter((w) => w.note === `Payout ${t.batchDate}`).length > 1 }]));
      const v = verifiedSales(txns, on.settlements.map((s, k) => ({ id: `s${k}`, order_id: s.order_id, net_remitted: s.net_remitted, settlement_date: s.settlement_date, date: s.date })), seg, truth);
      salesTxns = v.sales;
      materialOpen = v.materialOpen;
    }
    const rr = on ? orderSummary(on.orders).return_rate : null;
    const feat = (useTxns: Txn[], withEvidence: boolean): Features =>
      computeFeatures({ txns: useTxns, business_type: cfg.businessType, loan_ask_bdt: loan, tenor_months: tenor, stated, checks, return_rate: withEvidence ? rr : null, festival_share: online ? onlineShare : 0 });
    const variants: [string, Features, number][] = [['with', feat(salesTxns, true), materialOpen]];
    if (seg === 'hybrid') variants.push(['without', feat(txns, false), 0]);

    const trueItm = (loan * 0.0075) / (1 - (1 + 0.0075) ** -tenor) / (turnover * margin);
    const h =
      -2.3 + 3.2 * declineStrength + 2.2 * Math.max(0, household - 0.2) + 0.07 * lateRecent + 0.12 * stockDays + 1.1 * Math.max(0, trueItm - 0.45) - 18 * growth + (tampered ? 0.6 : 0) + (seasonal ? 0.15 : 0) +
      (online ? 6 * Math.max(0, returnRate - 0.1) : 0) + 0.7 * normal(rng);
    let survived = rng() >= sigmoid(h);
    if (rng() < 0.05) survived = !survived;
    const healthy = archs.size === 1 && archs.has('healthy') && survived ? 1 : 0;
    const splitHint = heldMix || noise === HELDOUT_NOISE ? 'heldout' : vintage >= 18 ? 'late_vintage' : 'pool';
    for (const [variant, f, mo] of variants) {
      const ruleRows = evaluateRules(f, DEFAULT_SETTINGS);
      const total = rulesTotal(ruleRows);
      rows.push(
        [i, seg, variant, splitHint, vintage, [...archs].join('+'), noise, tampered ? 1 : 0, ...FEATURE_NAMES.map((k) => Number(f[k]).toFixed(5)), (rr ?? 0).toFixed(4), total, rulesProbability(total).toFixed(5), rulesVerdict(total, f), mo, loan, healthy, group_indep, region, group_proxy, survived ? 1 : 0].join(','),
      );
    }
    if (i % 500 === 499) console.log(`  ${i + 1}/${N} shops (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  const out = path.join(ROOT, 'ml', 'data');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'cohort_v2.csv'), rows.join('\n'));
  fs.writeFileSync(path.join(out, 'cohort_v2_meta.json'), JSON.stringify({ generator_version: GENERATOR_VERSION, seed: SEED, n: N, features: FEATURE_NAMES }, null, 1));
  fs.writeFileSync(path.join(out, 'cohort_v2_matching.json'), JSON.stringify(match, null, 1));
  console.log(`Wrote ${N} synthetic_cohort shops (${rows.length - 1} rows) to ml/data/cohort_v2.csv`);
  console.log('matching', JSON.stringify(match));
}

main();
