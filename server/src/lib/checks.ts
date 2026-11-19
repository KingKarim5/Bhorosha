import type { Txn } from './statement';
import { isolationScores } from './iforest';

// Consistency checks. Wording rule: these say whether a statement is internally consistent.
// They never claim a document is authentic, forged or fake.

export interface CheckResult {
  code: string;
  name_en: string;
  name_bn: string;
  passed: boolean;
  severity: 'low' | 'medium' | 'high';
  detail_en: string;
  detail_bn: string;
  count?: number;
  score?: number;
}

export function balanceContinuity(txns: Txn[]): CheckResult {
  let breaks = 0;
  let checked = 0;
  for (let i = 1; i < txns.length; i++) {
    const prev = txns[i - 1].balance_after_bdt;
    const cur = txns[i].balance_after_bdt;
    if (prev == null || cur == null) continue;
    checked++;
    const expected = prev + (txns[i].direction === 'in' ? 1 : -1) * txns[i].amount_bdt;
    if (Math.abs(expected - cur) > 1) breaks++;
  }
  const passed = breaks === 0;
  return {
    code: 'balance_continuity',
    name_en: 'Running balance reconciles',
    name_bn: 'চলমান ব্যালান্স মেলে',
    passed,
    severity: passed ? 'low' : breaks >= 3 ? 'high' : 'medium',
    count: breaks,
    detail_en: passed
      ? `All ${checked} running balances reconcile with the amounts.`
      : `The running balance does not reconcile in ${breaks} of ${checked} rows. Ask for a fresh statement covering 12 months.`,
    detail_bn: passed
      ? `${checked}টি সারির চলমান ব্যালান্স লেনদেনের সাথে মেলে।`
      : `${checked}টি সারির মধ্যে ${breaks}টিতে চলমান ব্যালান্স মেলে না। ১২ মাসের নতুন স্টেটমেন্ট চাওয়া হোক।`,
  };
}

export function duplicates(txns: Txn[]): CheckResult {
  const seen = new Map<string, number>();
  let dups = 0;
  for (const t of txns) {
    const k = `${t.date.toISOString().slice(0, 10)}|${t.direction}|${Math.round(t.amount_bdt)}|${t.counterparty || ''}|${t.balance_after_bdt ?? ''}`;
    const c = seen.get(k) || 0;
    if (c >= 1 && t.amount_bdt >= 500) dups++;
    seen.set(k, c + 1);
  }
  const passed = dups <= 1;
  return {
    code: 'duplicates',
    name_en: 'No repeated rows',
    name_bn: 'একই লেনদেন দুবার নেই',
    passed,
    severity: passed ? 'low' : dups > 5 ? 'high' : 'medium',
    count: dups,
    detail_en: passed ? 'No suspicious repeated rows.' : `${dups} rows repeat the same date, amount, party and balance.`,
    detail_bn: passed ? 'সন্দেহজনক পুনরাবৃত্ত সারি নেই।' : `${dups}টি সারিতে একই তারিখ, টাকা ও পক্ষ পুনরাবৃত্ত।`,
  };
}

export function roundNumberRuns(txns: Txn[]): CheckResult {
  let run = 0;
  let maxRun = 0;
  for (const t of txns.filter((x) => x.direction === 'in')) {
    if (t.amount_bdt >= 1000 && t.amount_bdt % 1000 === 0) {
      run++;
      maxRun = Math.max(maxRun, run);
    } else run = 0;
  }
  const passed = maxRun < 8;
  return {
    code: 'round_runs',
    name_en: 'No long runs of round amounts',
    name_bn: 'একটানা গোল অঙ্কের লেনদেন নেই',
    passed,
    severity: passed ? 'low' : 'medium',
    count: maxRun,
    detail_en: passed ? `Longest run of round inflows: ${maxRun}.` : `${maxRun} inflows in a row are exact thousands.`,
    detail_bn: passed ? `সবচেয়ে লম্বা গোল অঙ্কের ধারা: ${maxRun}।` : `পরপর ${maxRun}টি জমা ঠিক হাজারের গুণিতক।`,
  };
}

export function totalMismatch(txns: Txn[], stated?: { in?: number; out?: number }): CheckResult {
  if (!stated)
    return {
      code: 'total_mismatch',
      name_en: 'Stated totals match rows',
      name_bn: 'মোট অঙ্ক সারির সাথে মেলে',
      passed: true,
      severity: 'low',
      detail_en: 'No stated totals on this statement to compare.',
      detail_bn: 'তুলনার জন্য স্টেটমেন্টে মোট অঙ্ক নেই।',
    };
  const tin = txns.filter((t) => t.direction === 'in').reduce((a, t) => a + t.amount_bdt, 0);
  const tout = txns.filter((t) => t.direction === 'out').reduce((a, t) => a + t.amount_bdt, 0);
  const bad = (stated.in != null && Math.abs(stated.in - tin) > 10) || (stated.out != null && Math.abs(stated.out - tout) > 10);
  return {
    code: 'total_mismatch',
    name_en: 'Stated totals match rows',
    name_bn: 'মোট অঙ্ক সারির সাথে মেলে',
    passed: !bad,
    severity: bad ? 'high' : 'low',
    detail_en: bad ? 'The totals printed on the statement do not match the sum of its rows.' : 'Printed totals match the rows.',
    detail_bn: bad ? 'স্টেটমেন্টে ছাপা মোট অঙ্ক সারির যোগফলের সাথে মেলে না।' : 'ছাপা মোট অঙ্ক সারির সাথে মেলে।',
  };
}

/** First-digit distribution test (Benford). Weak signal only, reported at low severity. */
export function firstDigit(txns: Txn[]): CheckResult {
  const amounts = txns.map((t) => t.amount_bdt).filter((a) => a >= 10);
  const n = amounts.length;
  const counts = new Array(10).fill(0);
  amounts.forEach((a) => counts[Number(String(Math.floor(a))[0])]++);
  let chi = 0;
  for (let d = 1; d <= 9; d++) {
    const e = n * Math.log10(1 + 1 / d);
    chi += e ? (counts[d] - e) ** 2 / e : 0;
  }
  // chi-square 8 df: 99.9% critical value ~ 26.1
  const passed = n < 100 || chi < 26.1 * Math.max(1, n / 400);
  return {
    code: 'first_digit',
    name_en: 'First-digit pattern looks ordinary',
    name_bn: 'প্রথম অঙ্কের ধরন স্বাভাবিক',
    passed,
    severity: 'low',
    score: Math.round(chi * 10) / 10,
    detail_en: n < 100 ? 'Too few rows for this test.' : `Chi-square ${Math.round(chi)} on ${n} amounts. A weak signal only.`,
    detail_bn: n < 100 ? 'এই পরীক্ষার জন্য সারি কম।' : `${n}টি অঙ্কে কাই-স্কয়ার ${Math.round(chi)}। এটি দুর্বল সংকেত মাত্র।`,
  };
}

export function anomaly(txns: Txn[]): CheckResult {
  const scores = isolationScores(txns);
  const high = scores.filter((s) => s > 0.68).length;
  const share = txns.length ? high / txns.length : 0;
  const passed = share < 0.04;
  return {
    code: 'anomaly',
    name_en: 'Unusual-row score',
    name_bn: 'অস্বাভাবিক সারির স্কোর',
    passed,
    severity: passed ? 'low' : 'medium',
    count: high,
    score: Math.round(share * 1000) / 10,
    detail_en: `${high} of ${txns.length} rows look unusual for this statement (isolation score). Review, do not conclude.`,
    detail_bn: `${txns.length}টির মধ্যে ${high}টি সারি এই স্টেটমেন্টের তুলনায় অস্বাভাবিক। যাচাই করুন, সিদ্ধান্ত নয়।`,
  };
}

export function runChecks(txns: Txn[], stated?: { in?: number; out?: number }): CheckResult[] {
  if (!txns.length) return [];
  return [balanceContinuity(txns), duplicates(txns), roundNumberRuns(txns), totalMismatch(txns, stated), firstDigit(txns), anomaly(txns)];
}
