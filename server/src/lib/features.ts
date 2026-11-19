import type { Txn } from './statement';
import { summarise } from './statement';
import type { CheckResult } from './checks';
import { seasonalIndex, isSeasonal } from './seasonal';
import { calMonth, clamp, cv, installment, mean, median, monthKey, slope } from './util';

export const RATE = 0.09; // refinance cap rate used for the instalment

export interface Stated {
  cash_share?: number | null; // 0..1, owner says
  margin?: number | null; // 0..1, owner says
  seasonal?: boolean | null;
  receivable_bdt?: number | null;
  receivable_days?: number | null;
  receivable_confirmed?: boolean | null;
  reported_sales_bdt?: number | null;
  cib_status?: 'clean' | 'classified' | 'unknown' | null;
  grace_months?: number | null;
}

export interface CaseInput {
  txns: Txn[];
  business_type: string;
  loan_ask_bdt: number;
  tenor_months: number;
  stated: Stated;
  checks: CheckResult[];
}

/** The model feature vector. Order matters: it is shared with ml/train.py through the cohort CSV header. */
export const FEATURE_NAMES = [
  'coverage',
  'log_inflow',
  'trend_3m',
  'trend_6m',
  'seasonal_dev',
  'inflow_cv',
  'supplier_on_time',
  'lateness_trend',
  'household_share',
  'receivable_days',
  'installment_to_margin',
  'months_history',
  'consistency_flags',
  'balance_volatility',
  'customer_concentration',
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Features the counterfactual search may change (actionable). Everything else is fixed. */
export const ACTIONABLE: FeatureName[] = ['household_share', 'supplier_on_time', 'lateness_trend', 'receivable_days', 'installment_to_margin', 'months_history', 'consistency_flags'];

export interface Features extends Record<FeatureName, number> {
  // diagnostics (not model inputs)
  avg_inflow_3m: number;
  estimated_turnover: number;
  margin_month: number;
  installment: number;
  coverage_known: number;
  stock_signal: number;
  txcount_trend: number;
  cost_ratio_change: number;
  receivable_bdt: number;
  receivable_confirmed: number;
  seasonal_used: number;
  late_days_recent: number;
  monthly: { month: string; inflow: number; adjusted: number }[];
}

function winsorise(xs: number[], k = 1.6) {
  const m = median(xs);
  return xs.map((x) => (m > 0 ? Math.min(x, m * k) : x));
}

export function computeFeatures(c: CaseInput): Features {
  const s = summarise(c.txns);
  const seasonalUsed = isSeasonal(c.business_type, !!c.stated.seasonal);
  const monthly = s.months.map((m) => {
    const idx = seasonalUsed ? seasonalIndex(c.business_type, calMonth(m.month), !!c.stated.seasonal) : 1;
    return { month: m.month, inflow: m.inflow, adjusted: m.inflow / idx };
  });
  const adjW = winsorise(monthly.map((m) => m.adjusted));
  const n = adjW.length;
  const last3 = adjW.slice(-3);
  const prev3 = adjW.slice(-6, -3);
  const trend3 = n >= 4 && mean(prev3) > 0 ? mean(last3) / mean(prev3) - 1 : 0;
  const last6 = adjW.slice(-6);
  const trend6 = last6.length >= 4 && mean(last6) > 0 ? slope(last6) / mean(last6) : 0;
  const seasonalDev = n >= 2 && mean(adjW) > 0 ? adjW[n - 1] / mean(adjW) - 1 : 0;

  const avg3 = mean(monthly.slice(-3).map((m) => m.inflow));
  const cashKnown = c.stated.cash_share != null;
  const cash = clamp(c.stated.cash_share ?? 0.5, 0, 0.95);
  const turnover = avg3 / (1 - cash);
  const margin = (c.stated.margin ?? 0.15) * turnover;
  const inst = installment(c.loan_ask_bdt, RATE, c.tenor_months);

  // supplier punctuality
  const sup = c.txns.filter((t) => t.direction === 'out' && t.counterparty_kind === 'supplier' && t.due_date);
  const late = sup.map((t) => ({ m: monthKey(t.date), d: Math.max(0, (t.date.getTime() - t.due_date!.getTime()) / 86400000) }));
  const onTime = late.length ? late.filter((x) => x.d <= 2).length / late.length : 0.9;
  const months = monthly.map((m) => m.month);
  const recentMonths = new Set(months.slice(-3));
  const lr = late.filter((x) => recentMonths.has(x.m)).map((x) => x.d);
  const le = late.filter((x) => !recentMonths.has(x.m)).map((x) => x.d);
  const latenessTrend = lr.length && le.length ? mean(lr) - mean(le) : 0;

  const outs = c.txns.filter((t) => t.direction === 'out');
  const outTotal = outs.reduce((a, t) => a + t.amount_bdt, 0);
  const personal = outs.filter((t) => t.counterparty_kind === 'personal').reduce((a, t) => a + t.amount_bdt, 0);

  // customer concentration
  const byCust = new Map<string, number>();
  let custTotal = 0;
  for (const t of c.txns)
    if (t.direction === 'in' && t.counterparty_kind === 'customer') {
      const k = t.counterparty || 'walk-in';
      byCust.set(k, (byCust.get(k) || 0) + t.amount_bdt);
      custTotal += t.amount_bdt;
    }
  const named = [...byCust.entries()].filter(([k]) => !/walk|customer|retail|বিক্রি/i.test(k));
  const conc = custTotal && named.length ? Math.max(...named.map(([, v]) => v)) / custTotal : 0;

  const bal = c.txns.map((t) => t.balance_after_bdt).filter((b): b is number => b != null);

  // stock-out signal: mid-month days with sales far below the month's typical day
  let lowDays = 0;
  let midDays = 0;
  const byMonthDay = new Map<string, Map<number, number>>();
  for (const t of c.txns)
    if (t.direction === 'in' && t.counterparty_kind === 'customer') {
      const k = monthKey(t.date);
      if (!byMonthDay.has(k)) byMonthDay.set(k, new Map());
      const dm = byMonthDay.get(k)!;
      dm.set(t.date.getUTCDate(), (dm.get(t.date.getUTCDate()) || 0) + t.amount_bdt);
    }
  for (const dm of byMonthDay.values()) {
    const med = median([...dm.values()]);
    for (let d = 10; d <= 20; d++) {
      midDays++;
      if ((dm.get(d) || 0) < 0.35 * med) lowDays++;
    }
  }
  const custTxPerMonth = byMonthDay.size ? c.txns.filter((t) => t.direction === 'in' && t.counterparty_kind === 'customer').length / byMonthDay.size : 0;
  const stock = midDays && custTxPerMonth >= 25 ? lowDays / midDays : 0; // only meaningful for daily retail sales

  const cnt = s.months.map((m) => m.inflow_count);
  const txTrend = cnt.length >= 6 && mean(cnt.slice(-6, -3)) > 0 ? mean(cnt.slice(-3)) / mean(cnt.slice(-6, -3)) - 1 : 0;
  const ratio = (rows: typeof s.months) => {
    const i = rows.reduce((a, r) => a + r.inflow, 0);
    return i ? rows.reduce((a, r) => a + r.supplier_out, 0) / i : 0;
  };
  const costChange = s.months.length >= 6 ? ratio(s.months.slice(-3)) - ratio(s.months.slice(-6, -3)) : 0;

  const highFlags = c.checks.filter((x) => !x.passed && x.severity === 'high').length;
  const anyFlags = c.checks.filter((x) => !x.passed && x.severity !== 'low').length;

  return {
    coverage: Math.round((1 - cash) * 100),
    log_inflow: Math.log1p(avg3),
    trend_3m: trend3,
    trend_6m: trend6,
    seasonal_dev: seasonalDev,
    inflow_cv: cv(monthly.map((m) => m.adjusted)),
    supplier_on_time: onTime,
    lateness_trend: latenessTrend,
    household_share: outTotal ? personal / outTotal : 0,
    receivable_days: c.stated.receivable_days ?? 0,
    installment_to_margin: margin > 0 ? inst / margin : 9,
    months_history: s.months_history,
    consistency_flags: highFlags * 2 + (anyFlags - highFlags),
    balance_volatility: cv(bal),
    customer_concentration: conc,
    avg_inflow_3m: avg3,
    estimated_turnover: turnover,
    margin_month: margin,
    installment: inst,
    coverage_known: cashKnown ? 1 : 0,
    stock_signal: stock,
    txcount_trend: txTrend,
    cost_ratio_change: costChange,
    receivable_bdt: c.stated.receivable_bdt ?? 0,
    receivable_confirmed: c.stated.receivable_confirmed ? 1 : 0,
    seasonal_used: seasonalUsed ? 1 : 0,
    late_days_recent: lr.length ? mean(lr) : 0,
    monthly,
  };
}

export function featureVector(f: Features): number[] {
  return FEATURE_NAMES.map((k) => f[k]);
}

// ---------- Likely cause ----------
export const CAUSES = {
  stock_problem: { en: 'Stock problem', bn: 'মালের ঘাটতি' },
  fewer_customers: { en: 'Fewer customers', bn: 'ক্রেতা কমছে' },
  higher_costs: { en: 'Higher costs', bn: 'খরচ বাড়ছে' },
  buyers_paying_late: { en: 'Buyers paying late', bn: 'ক্রেতা দেরিতে টাকা দিচ্ছে' },
  household_mixing: { en: 'Household money mixed in', bn: 'সংসারের টাকা ব্যবসায় মিশে যাচ্ছে' },
  none_clear: { en: 'No clear weak point', bn: 'স্পষ্ট দুর্বলতা নেই' },
} as const;
export type Cause = keyof typeof CAUSES;

export function causeScores(f: Features): Record<Exclude<Cause, 'none_clear'>, number> {
  return {
    stock_problem: f.stock_signal > 0.12 ? f.stock_signal * 3 : 0,
    fewer_customers: Math.max(0, -f.txcount_trend) * 3 + Math.max(0, -f.trend_3m) * 2,
    higher_costs: Math.max(0, f.cost_ratio_change) * 5,
    buyers_paying_late: f.receivable_days > 30 ? 0.3 + f.receivable_days / 100 : 0,
    household_mixing: f.household_share > 0.15 ? (f.household_share / 0.25) * 0.6 : 0,
  };
}

export function likelyCause(f: Features): Cause {
  const sc = causeScores(f);
  const [best, val] = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  return val >= 0.2 ? (best as Cause) : 'none_clear';
}
