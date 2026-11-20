import type { Features } from './features';

export type Verdict = 'viable' | 'not_sure' | 'not_viable';

export interface RuleSettings {
  household_mixing_pct: number;
  good_installment_to_margin: number;
  max_installment_to_margin: number;
  trend_drop_pct: number;
  viable_points: number;
  not_viable_points: number;
  min_coverage_pct: number;
}

export const DEFAULT_SETTINGS: RuleSettings = {
  household_mixing_pct: 25,
  good_installment_to_margin: 0.35,
  max_installment_to_margin: 0.5,
  trend_drop_pct: 15,
  viable_points: 3,
  not_viable_points: -3,
  min_coverage_pct: 50,
};

export interface RuleRow {
  key: string;
  group_en: string;
  group_bn: string;
  condition_en: string;
  condition_bn: string;
  points: number; // contribution actually applied
  fired: boolean;
  value_text: string; // the measured value, digits from code
  feature: string;
  evidence_keys: string[]; // claim_keys of evidence items this rule uses
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function evaluateRules(f: Features, s: RuleSettings = DEFAULT_SETTINGS): RuleRow[] {
  const rows: RuleRow[] = [];
  const add = (r: Omit<RuleRow, 'fired'>) => rows.push({ ...r, fired: r.points !== 0 });
  const rising = f.trend_6m > 0.008 && f.months_history >= 6;
  const falling = f.trend_3m < -s.trend_drop_pct / 100;

  add({
    key: 'trend_rising', group_en: 'Trend', group_bn: 'প্রবণতা',
    condition_en: 'Visible sales rising over 6 months' + (f.seasonal_used ? ' (season adjusted)' : ''),
    condition_bn: '৬ মাসে দৃশ্যমান বিক্রি বাড়ছে' + (f.seasonal_used ? ' (মৌসুম সমন্বিত)' : ''),
    points: rising ? 1 : 0, value_text: `${(f.trend_6m * 100).toFixed(1)}%/mo`, feature: 'trend_6m', evidence_keys: ['monthly_inflow'],
  });
  add({
    key: 'trend_drop', group_en: 'Trend', group_bn: 'প্রবণতা',
    condition_en: `Down more than ${s.trend_drop_pct}% over 3 months, season adjusted`,
    condition_bn: `৩ মাসে ${s.trend_drop_pct}%-এর বেশি কমেছে (মৌসুম সমন্বিত)`,
    points: falling ? -2 : 0, value_text: pct(f.trend_3m), feature: 'trend_3m', evidence_keys: ['monthly_inflow'],
  });
  add({
    key: 'supplier_on_time', group_en: 'Supplier regularity', group_bn: 'সরবরাহকারীকে নিয়মিত পরিশোধ',
    condition_en: '90% or more supplier payments on time', condition_bn: '৯০% বা বেশি সরবরাহকারী পরিশোধ সময়মতো',
    points: f.supplier_on_time >= 0.9 ? 1 : 0, value_text: pct(f.supplier_on_time), feature: 'supplier_on_time', evidence_keys: ['supplier_on_time'],
  });
  add({
    key: 'lateness_rising', group_en: 'Supplier regularity', group_bn: 'সরবরাহকারীকে নিয়মিত পরিশোধ',
    condition_en: 'Supplier payments getting later', condition_bn: 'সরবরাহকারীর পরিশোধ ক্রমশ দেরি হচ্ছে',
    points: f.lateness_trend > 3 ? -1 : 0, value_text: `+${f.lateness_trend.toFixed(1)} days`, feature: 'lateness_trend', evidence_keys: ['supplier_on_time'],
  });
  add({
    key: 'household_mixing', group_en: 'Household mixing', group_bn: 'সংসার ও ব্যবসার টাকা মেশানো',
    condition_en: `Over ${s.household_mixing_pct}% of outflows to personal contacts`, condition_bn: `খরচের ${s.household_mixing_pct}%-এর বেশি ব্যক্তিগত খাতে`,
    points: f.household_share * 100 > s.household_mixing_pct ? -2 : 0, value_text: pct(f.household_share), feature: 'household_share', evidence_keys: ['household_share'],
  });
  const itm = f.installment_to_margin;
  add({
    key: 'debt_good', group_en: 'Debt service', group_bn: 'কিস্তি পরিশোধের সামর্থ্য',
    condition_en: `Instalment under ${s.good_installment_to_margin} of monthly margin`, condition_bn: `কিস্তি মাসিক লাভের ${s.good_installment_to_margin}-এর কম`,
    points: itm < s.good_installment_to_margin ? 1 : 0, value_text: itm.toFixed(2), feature: 'installment_to_margin', evidence_keys: ['installment', 'margin'],
  });
  add({
    key: 'debt_heavy', group_en: 'Debt service', group_bn: 'কিস্তি পরিশোধের সামর্থ্য',
    condition_en: `Instalment over ${s.max_installment_to_margin} of monthly margin`, condition_bn: `কিস্তি মাসিক লাভের ${s.max_installment_to_margin}-এর বেশি`,
    points: itm > s.max_installment_to_margin ? -2 : 0, value_text: itm.toFixed(2), feature: 'installment_to_margin', evidence_keys: ['installment', 'margin'],
  });
  add({
    key: 'receivable', group_en: 'Receivable', group_bn: 'পাওনা টাকা',
    condition_en: 'Receivable over 60 days and unconfirmed', condition_bn: '৬০ দিনের বেশি পুরোনো ও অনিশ্চিত পাওনা',
    points: f.receivable_days > 60 && !f.receivable_confirmed ? -1 : 0, value_text: `${Math.round(f.receivable_days)} days`, feature: 'receivable_days', evidence_keys: ['receivable'],
  });
  add({
    key: 'history_short', group_en: 'History', group_bn: 'লেনদেনের ইতিহাস',
    condition_en: 'Under 6 months of statement', condition_bn: '৬ মাসের কম স্টেটমেন্ট',
    points: f.months_history < 6 ? -1 : 0, value_text: `${f.months_history} months`, feature: 'months_history', evidence_keys: ['months_history'],
  });
  add({
    key: 'history_under_12', group_en: 'History', group_bn: 'লেনদেনের ইতিহাস',
    condition_en: 'Under 12 months: seasons cannot be judged', condition_bn: '১২ মাসের কম: মৌসুম বিচার করা যায় না',
    points: f.months_history < 12 ? -1 : 0, value_text: `${f.months_history} months`, feature: 'months_history', evidence_keys: ['months_history'],
  });
  add({
    key: 'consistency', group_en: 'Consistency', group_bn: 'সামঞ্জস্য',
    condition_en: 'A high-severity consistency check failed', condition_bn: 'একটি গুরুতর সামঞ্জস্য পরীক্ষা ব্যর্থ',
    points: f.consistency_flags >= 2 ? -2 : 0, value_text: f.consistency_flags >= 2 ? 'failed' : 'passed', feature: 'consistency_flags', evidence_keys: ['consistency'],
  });
  add({
    key: 'returns_high', group_en: 'Returns', group_bn: 'ফেরত',
    condition_en: 'Over 15% of online orders returned', condition_bn: 'অনলাইন অর্ডারের ১৫%-এর বেশি ফেরত',
    points: f.return_rate > 0.15 ? -1 : 0, value_text: pct(f.return_rate), feature: 'return_rate', evidence_keys: ['order_log'],
  });
  add({
    key: 'concentration', group_en: 'Customer concentration', group_bn: 'ক্রেতা-নির্ভরতা',
    condition_en: 'One customer brings over 40% of inflow (noted, no points)', condition_bn: 'একজন ক্রেতা থেকে ৪০%-এর বেশি জমা (উল্লেখ, পয়েন্ট নেই)',
    points: 0, value_text: pct(f.customer_concentration), feature: 'customer_concentration', evidence_keys: ['customer_concentration'],
  });
  // mark the informational concentration row as "fired" when high, so it surfaces as a reason
  const conc = rows[rows.length - 1];
  conc.fired = f.customer_concentration > 0.4;
  return rows;
}

export function rulesTotal(rows: RuleRow[]) {
  return rows.reduce((a, r) => a + r.points, 0);
}

export function rulesVerdict(total: number, f: Features, s: RuleSettings = DEFAULT_SETTINGS): Verdict {
  if (f.months_history < 3) return 'not_sure'; // corner case: under 3 months of statement
  if (total >= s.viable_points) return 'viable';
  if (total <= s.not_viable_points) return 'not_viable';
  return 'not_sure';
}

/** Probability-like centre for the band when no model is loaded. */
export function rulesProbability(total: number) {
  return 1 / (1 + Math.exp(-(0.45 * total + 1.0)));
}

export interface Band {
  low: number;
  high: number;
  mid: number;
  widened: string[];
}

export function likelihoodBand(p: number, baseHalf: number, f: Features, s: RuleSettings = DEFAULT_SETTINGS): Band {
  let half = baseHalf;
  const widened: string[] = [];
  if (f.coverage < s.min_coverage_pct) {
    half *= 1.5;
    widened.push('low_coverage');
  }
  if (f.months_history < 12) {
    half *= 1.5;
    widened.push('short_history');
  }
  if (f.months_history < 3) {
    half *= 1.6;
    widened.push('very_short_history');
  }
  if (f.seasonal_used) {
    half *= 1.25;
    widened.push('seasonal');
  }
  // Keep the width when the band touches a limit: shift it instead of cutting it, so a widened band always looks wider.
  const width = Math.min(0.93, 2 * half);
  let low = p - half;
  let high = p + half;
  if (high > 0.95) [low, high] = [0.95 - width, 0.95];
  if (low < 0.02) [low, high] = [0.02, 0.02 + width];
  return { low: Math.round(low * 100), high: Math.round(high * 100), mid: Math.round(p * 100), widened };
}

export const VERDICT_TEXT: Record<Verdict, { en: string; bn: string }> = {
  viable: { en: 'Viable', bn: 'টেকসই' },
  not_sure: { en: 'Not sure', bn: 'নিশ্চিত নয়' },
  not_viable: { en: 'Not viable', bn: 'এখন টেকসই নয়' },
};
