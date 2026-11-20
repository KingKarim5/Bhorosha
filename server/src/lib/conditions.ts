import type { Features, Cause } from './features';
import type { Verdict, RuleSettings } from './rules';
import { fmtBdt } from './util';

// Counterfactual conditions (component 6): the smallest realistic changes to ACTIONABLE features
// that would move the verdict up. Unchangeable features (business type, months trading, coverage,
// log inflow, trend) and anything protected are never touched.

export interface Action {
  key: string;
  cost: number;
  applies: (f: Features, s: RuleSettings) => boolean;
  apply: (f: Features, s: RuleSettings) => Features;
  text: (f: Features, ask: number) => { en: string; bn: string };
  changes: string[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export const ACTIONS: Action[] = [
  {
    key: 'lower_household',
    cost: 1,
    changes: ['household_share'],
    applies: (f, s) => f.household_share * 100 > s.household_mixing_pct - 5,
    apply: (f, s) => ({ ...f, household_share: Math.min(f.household_share, (s.household_mixing_pct - 5) / 100) }),
    text: (f) => ({
      en: `Keep personal transfers under 20% of outflows (now ${pct(f.household_share)}), using a separate business wallet.`,
      bn: `আলাদা ব্যবসায়িক ওয়ালেট ব্যবহার করে ব্যক্তিগত খাতে খরচ ২০%-এর নিচে রাখুন (এখন ${pct(f.household_share)})।`,
    }),
  },
  {
    key: 'clear_arrears',
    cost: 1,
    changes: ['supplier_on_time', 'lateness_trend'],
    applies: (f) => f.supplier_on_time < 0.9 || f.lateness_trend > 3,
    apply: (f) => ({ ...f, supplier_on_time: Math.max(f.supplier_on_time, 0.92), lateness_trend: 0 }),
    text: (f) => ({
      en: `Clear supplier arrears and pay suppliers on time for 3 months (on-time share now ${pct(f.supplier_on_time)}).`,
      bn: `সরবরাহকারীর বকেয়া শোধ করে ৩ মাস সময়মতো পরিশোধ করুন (এখন সময়মতো ${pct(f.supplier_on_time)})।`,
    }),
  },
  {
    key: 'collect_receivable',
    cost: 1,
    changes: ['receivable_days'],
    applies: (f) => f.receivable_days > 60,
    apply: (f) => ({ ...f, receivable_days: 0, receivable_confirmed: 1 }),
    text: (f) => ({
      en: `Collect the ${fmtBdt(f.receivable_bdt)} BDT owed by the main buyer (${Math.round(f.receivable_days)} days outstanding).`,
      bn: `প্রধান ক্রেতার কাছে পাওনা ${fmtBdt(f.receivable_bdt)} টাকা আদায় করুন (${Math.round(f.receivable_days)} দিন বাকি)।`,
    }),
  },
  {
    key: 'full_history',
    cost: 1.5,
    changes: ['months_history', 'consistency_flags'],
    applies: (f) => f.months_history < 12 || f.consistency_flags >= 2,
    apply: (f) => ({ ...f, months_history: 12, consistency_flags: 0 }),
    text: (f) => ({
      en: `Supply a fresh statement covering 12 months (now ${f.months_history} months${f.consistency_flags >= 2 ? ', and the current one does not reconcile' : ''}).`,
      bn: `১২ মাসের নতুন স্টেটমেন্ট দিন (এখন ${f.months_history} মাস${f.consistency_flags >= 2 ? ', এবং বর্তমানটির ব্যালান্স মেলে না' : ''})।`,
    }),
  },
  {
    key: 'smaller_tranche',
    cost: 1.2,
    changes: ['installment_to_margin'],
    applies: (f, s) => f.installment_to_margin >= s.good_installment_to_margin,
    apply: (f, s) => ({ ...f, installment_to_margin: s.good_installment_to_margin - 0.01 }),
    text: (f, ask) => {
      const share = Math.max(0.2, Math.min(0.9, 0.34 / f.installment_to_margin));
      const amt = Math.floor((ask * share) / 1000) * 1000;
      return {
        en: `Release a smaller first tranche of ${fmtBdt(amt)} BDT so the instalment fits the margin (ratio now ${f.installment_to_margin.toFixed(2)}).`,
        bn: `প্রথম কিস্তিতে কম, ${fmtBdt(amt)} টাকা ছাড় দিন যাতে কিস্তি লাভের মধ্যে থাকে (এখন অনুপাত ${f.installment_to_margin.toFixed(2)})।`,
      };
    },
  },
];

const RANK: Record<Verdict, number> = { not_viable: 0, not_sure: 1, viable: 2 };

export interface Counterfactual {
  actions: string[];
  cost: number;
  from: Verdict;
  to: Verdict;
  changed_features: string[];
  texts: { en: string; bn: string }[];
  partial?: boolean; // moves the file closer to the next verdict without reaching it
  score_gain?: number;
}

export function counterfactualSearch(
  f: Features,
  s: RuleSettings,
  ask: number,
  judge: (f: Features) => Verdict,
  maxSize = 3,
  score?: (f: Features) => number,
): Counterfactual[] {
  const from = judge(f);
  if (from === 'viable') return [];
  const avail = ACTIONS.filter((a) => a.applies(f, s));
  const found: Counterfactual[] = [];
  const partial: Counterfactual[] = [];
  const base = score ? score(f) : 0;
  const n = avail.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset = avail.filter((_, i) => mask & (1 << i));
    if (subset.length > maxSize) continue;
    let g = f;
    for (const a of subset) g = a.apply(g, s);
    const to = judge(g);
    if (RANK[to] > RANK[from]) {
      found.push({
        actions: subset.map((a) => a.key),
        cost: subset.reduce((x, a) => x + a.cost, 0),
        from,
        to,
        changed_features: subset.flatMap((a) => a.changes),
        texts: subset.map((a) => a.text(f, ask)),
      });
    } else if (score) {
      const gain = score(g) - base;
      if (gain > 0)
        partial.push({ actions: subset.map((a) => a.key), cost: subset.reduce((x, a) => x + a.cost, 0), from, to, changed_features: subset.flatMap((a) => a.changes), texts: subset.map((a) => a.text(f, ask)), partial: true, score_gain: gain });
    }
  }
  if (!found.length && partial.length) {
    // nothing reaches the next verdict: offer the cheapest change with the largest gain per unit cost
    partial.sort((a, b) => b.score_gain! / b.cost - a.score_gain! / a.cost || a.cost - b.cost);
    return partial.slice(0, 2);
  }
  // prefer reaching viable, then lowest cost, then fewest actions; drop supersets of a found set
  found.sort((a, b) => RANK[b.to] - RANK[a.to] || a.cost - b.cost || a.actions.length - b.actions.length);
  const out: Counterfactual[] = [];
  for (const c of found) {
    if (out.some((o) => o.to === c.to && o.actions.every((x) => c.actions.includes(x)))) continue;
    out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}

export interface Condition {
  key: string;
  en: string;
  bn: string;
  kind: 'counterfactual' | 'prudential';
}

export function prudentialConditions(f: Features, cause: Cause, s: RuleSettings, ask: number): Condition[] {
  const out: Condition[] = [];
  if (f.receivable_days > 60)
    out.push({ key: 'collect_receivable', kind: 'prudential', ...ACTIONS.find((a) => a.key === 'collect_receivable')!.text(f, ask) });
  if (f.installment_to_margin > s.max_installment_to_margin)
    out.push({ key: 'smaller_tranche', kind: 'prudential', ...ACTIONS.find((a) => a.key === 'smaller_tranche')!.text(f, ask) });
  if (cause === 'stock_problem')
    out.push({
      key: 'stock_bills',
      kind: 'prudential',
      en: 'Use the first tranche for stock and upload the supplier bills in the app within 30 days.',
      bn: 'প্রথম কিস্তির টাকা মাল কেনায় ব্যবহার করুন এবং ৩০ দিনের মধ্যে অ্যাপে সরবরাহকারীর বিল আপলোড করুন।',
    });
  if (f.household_share > 0.15 && f.household_share * 100 <= s.household_mixing_pct)
    out.push({ key: 'separate_wallet', kind: 'prudential', en: 'Keep business and household money in separate wallets.', bn: 'ব্যবসা ও সংসারের টাকা আলাদা ওয়ালেটে রাখুন।' });
  return out;
}

export interface Tranche {
  n: number;
  amount_bdt: number;
  release_en: string;
  release_bn: string;
}

export function tranchePlan(ask: number, conditions: Condition[], f: Features, s: RuleSettings): Tranche[] {
  if (!conditions.length) return [{ n: 1, amount_bdt: ask, release_en: 'At approval.', release_bn: 'অনুমোদনের সময়।' }];
  let first = 0.5;
  if (f.installment_to_margin > s.good_installment_to_margin) first = Math.max(0.25, Math.min(0.6, 0.34 / f.installment_to_margin));
  const r = (x: number) => Math.floor(x / 1000) * 1000;
  const t1 = r(ask * first);
  if (conditions.length === 1) {
    return [
      { n: 1, amount_bdt: t1, release_en: 'At approval.', release_bn: 'অনুমোদনের সময়।' },
      { n: 2, amount_bdt: ask - t1, release_en: `When met: ${conditions[0].en}`, release_bn: `শর্ত পূরণ হলে: ${conditions[0].bn}` },
    ];
  }
  const t2 = r((ask - t1) * 0.6);
  return [
    { n: 1, amount_bdt: t1, release_en: 'At approval.', release_bn: 'অনুমোদনের সময়।' },
    { n: 2, amount_bdt: t2, release_en: `When met: ${conditions[0].en}`, release_bn: `শর্ত পূরণ হলে: ${conditions[0].bn}` },
    {
      n: 3,
      amount_bdt: ask - t1 - t2,
      release_en: `When met: ${conditions[1].en} And after 3 instalments paid on time.`,
      release_bn: `শর্ত পূরণ হলে: ${conditions[1].bn} এবং ৩টি কিস্তি সময়মতো দেওয়ার পর।`,
    },
  ];
}

export function recoveryPlan(cause: Cause, f: Features): { en: string; bn: string }[] {
  const plans: Record<Cause, { en: string; bn: string }[]> = {
    stock_problem: [
      { en: 'Buy fast-moving stock weekly instead of once a month, so shelves do not empty mid-month.', bn: 'মাসে একবার না কিনে প্রতি সপ্তাহে দ্রুত বিক্রি হওয়া মাল কিনুন, যাতে মাসের মাঝে তাক খালি না হয়।' },
      { en: 'Keep about 10 days of the best-selling items in reserve.', bn: 'সবচেয়ে বেশি বিক্রি হওয়া মালের প্রায় ১০ দিনের মজুত রাখুন।' },
      { en: 'Pay suppliers through the wallet so purchases stay visible as evidence.', bn: 'ওয়ালেটের মাধ্যমে সরবরাহকারীকে পরিশোধ করুন, যাতে কেনাকাটা প্রমাণ হিসেবে দেখা যায়।' },
    ],
    fewer_customers: [
      { en: 'Send a check-in if sales stay below the expected range for a second month; the Servicer will offer support.', bn: 'পরপর দ্বিতীয় মাস বিক্রি প্রত্যাশিত সীমার নিচে থাকলে আপডেট পাঠান; সার্ভিসার সহায়তা দেবে।' },
      { en: 'Review prices and the product mix against nearby competitors.', bn: 'আশেপাশের প্রতিযোগীর সাথে দাম ও পণ্যের তালিকা মিলিয়ে দেখুন।' },
      { en: 'Ask the lender about a short restructure before payments fall behind.', bn: 'কিস্তি পিছিয়ে পড়ার আগেই ঋণদাতার সাথে পুনর্গঠন নিয়ে কথা বলুন।' },
    ],
    higher_costs: [
      { en: 'Compare two or three suppliers for the largest cost items.', bn: 'সবচেয়ে বড় খরচের মালের জন্য দুই-তিনজন সরবরাহকারীর দাম তুলনা করুন।' },
      { en: 'Pass part of the cost rise on to prices where customers accept it.', bn: 'যেখানে ক্রেতা মেনে নেয়, সেখানে খরচ বৃদ্ধির কিছু অংশ দামে যোগ করুন।' },
    ],
    buyers_paying_late: [
      { en: `Agree a payment date for the ${fmtBdt(f.receivable_bdt)} BDT owed and confirm it in writing.`, bn: `পাওনা ${fmtBdt(f.receivable_bdt)} টাকার জন্য পরিশোধের তারিখ ঠিক করে লিখিত নিশ্চিত করুন।` },
      { en: 'Ask new buyers for part payment on order.', bn: 'নতুন ক্রেতার কাছে অর্ডারের সময় আংশিক অগ্রিম নিন।' },
    ],
    household_mixing: [
      { en: 'Open a separate business wallet and pay household costs from a fixed monthly draw.', bn: 'আলাদা ব্যবসায়িক ওয়ালেট খুলুন এবং সংসারের খরচ একটি নির্দিষ্ট মাসিক অঙ্ক থেকে দিন।' },
      { en: 'Keep personal transfers under 20% of business outflows.', bn: 'ব্যবসার খরচের ২০%-এর নিচে ব্যক্তিগত লেনদেন রাখুন।' },
    ],
    none_clear: [
      { en: 'Keep paying suppliers through the wallet so the record stays strong.', bn: 'ওয়ালেটের মাধ্যমে সরবরাহকারীকে পরিশোধ চালিয়ে যান, যাতে রেকর্ড শক্ত থাকে।' },
      { en: 'Send a short monthly check-in so the watchman can compare sales with the forecast.', bn: 'প্রতি মাসে ছোট একটি আপডেট পাঠান, যাতে বিক্রি পূর্বাভাসের সাথে মেলানো যায়।' },
    ],
  };
  return plans[cause];
}
