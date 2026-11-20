import crypto from 'crypto';
import { installment } from './util';

// Loan terms (v3): the code side of the contract, counter-offer, pricing, fee, payment and servicer agents.
// The AI agents read, propose and explain; everything here validates, clamps and computes the amounts.
// Nothing an agent says can move a number outside these functions.

export interface TermsPolicy {
  max_principal_bdt: number;
  max_tenor_months: number;
  bank_rate_pct: number;
  investor_spread_pct: number;
  borrower_rate_pct: number;
  fee_pct_short: number;
  fee_pct_mid: number;
  fee_pct_long: number;
  rebate_default_pct: number;
  rebate_min_pct: number;
  rebate_max_pct: number;
  penalty_default_pts: number;
  penalty_min_pts: number;
  penalty_max_pts: number;
  grace_days: number;
  match_confidence_min: number;
  early_pay_discount_pct: number; // share of an instalment's interest waived when it is paid early enough (0 = off)
  early_pay_min_days: number; // how many days before the due date counts as "early enough"
}

export const DEFAULT_TERMS: TermsPolicy = {
  max_principal_bdt: 1000000,
  max_tenor_months: 12,
  bank_rate_pct: 10,
  investor_spread_pct: 0.25,
  borrower_rate_pct: 14,
  fee_pct_short: 8,
  fee_pct_mid: 8.5,
  fee_pct_long: 9,
  rebate_default_pct: 20,
  rebate_min_pct: 10,
  rebate_max_pct: 30,
  penalty_default_pts: 2,
  penalty_min_pts: 1,
  penalty_max_pts: 4,
  grace_days: 3,
  match_confidence_min: 0.8,
  early_pay_discount_pct: 25,
  early_pay_min_days: 5,
};

export function termsFrom(p: Partial<TermsPolicy> | null | undefined): TermsPolicy {
  const out = { ...DEFAULT_TERMS };
  for (const k of Object.keys(DEFAULT_TERMS) as (keyof TermsPolicy)[]) {
    const v = p?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const DAY = 86400000;

// ---------------------------------------------------------------- limits
export interface LimitCheck {
  ok: boolean;
  problems: { key: 'principal' | 'tenor'; en: string; bn: string }[];
}

export function checkLimits(principal: number, tenor: number, p: TermsPolicy): LimitCheck {
  const problems: LimitCheck['problems'] = [];
  if (principal > p.max_principal_bdt)
    problems.push({ key: 'principal', en: `Tk ${fmt(principal)} is above the Tk ${fmt(p.max_principal_bdt)} limit.`, bn: `${fmt(principal)} টাকা সীমা ${fmt(p.max_principal_bdt)} টাকার বেশি।` });
  if (tenor > p.max_tenor_months)
    problems.push({ key: 'tenor', en: `${tenor} months is longer than the ${p.max_tenor_months}-month limit.`, bn: `${tenor} মাস, সীমা ${p.max_tenor_months} মাসের বেশি।` });
  return { ok: problems.length === 0, problems };
}

function fmt(n: number) {
  return Math.round(n).toLocaleString('en-IN');
}

// ---------------------------------------------------------------- rates and fees
/** Bhorsha's share of the interest, by tenor: up to 3 months, 4 to 6 months, 7 months and longer. */
export function feePct(tenor: number, p: TermsPolicy) {
  return tenor <= 3 ? p.fee_pct_short : tenor <= 6 ? p.fee_pct_mid : p.fee_pct_long;
}

export function investorRatePct(p: TermsPolicy) {
  return r2(p.bank_rate_pct + p.investor_spread_pct);
}

export interface RateCheck {
  ok: boolean;
  borrower_rate_pct: number;
  investor_rate_pct: number;
  fee_pct: number;
  fee_rate_pts: number; // Bhorsha's fee expressed in rate points (fee share x borrower rate)
  floor_rate_pct: number; // investor rate + Bhorsha fee: the borrower rate must not go below this
  en: string;
  bn: string;
}

/** Rejects any setup where the borrower rate is below the investor rate plus Bhorsha's fee. */
export function checkRateSetup(borrowerRate: number, tenor: number, p: TermsPolicy): RateCheck {
  const inv = investorRatePct(p);
  const fee = feePct(tenor, p);
  const feePts = r2((borrowerRate * fee) / 100);
  const floor = r2(inv + feePts);
  const ok = borrowerRate >= floor;
  return {
    ok, borrower_rate_pct: borrowerRate, investor_rate_pct: inv, fee_pct: fee, fee_rate_pts: feePts, floor_rate_pct: floor,
    en: ok
      ? `Borrower rate ${borrowerRate}% covers the investor rate ${inv}% plus Bhorsha's fee (${fee}% of interest, ${feePts} points).`
      : `Borrower rate ${borrowerRate}% is below the investor rate ${inv}% plus Bhorsha's fee (${feePts} points): at least ${floor}% is needed.`,
    bn: ok
      ? `ঋণগ্রহীতার সুদ ${borrowerRate}% বিনিয়োগকারীর ${inv}% ও ভরসার ফি (সুদের ${fee}%, ${feePts} পয়েন্ট) মেটায়।`
      : `ঋণগ্রহীতার সুদ ${borrowerRate}% বিনিয়োগকারীর ${inv}% ও ভরসার ফি (${feePts} পয়েন্ট) থেকে কম: অন্তত ${floor}% দরকার।`,
  };
}

// ---------------------------------------------------------------- schedule
export interface Installment {
  n: number;
  due_date: string; // YYYY-MM-DD
  amount_bdt: number;
  principal_bdt: number;
  interest_bdt: number;
  paid_bdt: number;
  status: 'due' | 'paid' | 'partial';
  discount_bdt?: number; // interest waived because it was paid early
}

function addMonthsIso(iso: string, k: number) {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + k);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** Equal monthly instalments (amortising). The last instalment absorbs rounding so principal sums exactly. */
export function schedule(principal: number, annualRatePct: number, tenor: number, firstDue: string): Installment[] {
  const r = annualRatePct / 100 / 12;
  const pay = Math.round(installment(principal, annualRatePct / 100, tenor));
  let bal = principal;
  const out: Installment[] = [];
  for (let n = 1; n <= tenor; n++) {
    const interest = Math.round(bal * r);
    let princ = pay - interest;
    if (n === tenor) princ = bal;
    bal -= princ;
    out.push({ n, due_date: addMonthsIso(firstDue, n - 1), amount_bdt: princ + interest, principal_bdt: princ, interest_bdt: interest, paid_bdt: 0, status: 'due' });
  }
  return out;
}

export function totalInterest(s: Installment[]) {
  return s.reduce((a, x) => a + x.interest_bdt, 0);
}

export interface FeeSplit {
  principal_bdt: number;
  tenor_months: number;
  borrower_rate_pct: number;
  investor_rate_pct: number;
  fee_pct: number;
  total_interest_bdt: number;
  bhorsha_bdt: number;
  investor_bdt: number; // interest owed to investors on the share they fund
  investor_share_pct: number;
  lender_bdt: number;
  per_100: { investor: number; bhorsha: number; lender: number }; // out of every Tk 100 of interest
  rate_check: RateCheck;
}

/** How the borrower's interest splits between the investors, Bhorsha and the lender. */
export function feeSplit(principal: number, tenor: number, borrowerRate: number, investorShare: number, p: TermsPolicy): FeeSplit {
  const s = schedule(principal, borrowerRate, tenor, '2000-01-01');
  const total = totalInterest(s);
  const rc = checkRateSetup(borrowerRate, tenor, p);
  const bhorsha = Math.round((total * rc.fee_pct) / 100);
  const investor = Math.round(total * investorShare * (rc.investor_rate_pct / borrowerRate));
  const lender = total - bhorsha - investor;
  const per = (x: number) => (total ? r2((x / total) * 100) : 0);
  return {
    principal_bdt: principal, tenor_months: tenor, borrower_rate_pct: borrowerRate, investor_rate_pct: rc.investor_rate_pct, fee_pct: rc.fee_pct,
    total_interest_bdt: total, bhorsha_bdt: bhorsha, investor_bdt: investor, investor_share_pct: Math.round(investorShare * 100), lender_bdt: lender,
    per_100: { investor: per(investor), bhorsha: per(bhorsha), lender: per(lender) }, rate_check: rc,
  };
}

// ---------------------------------------------------------------- counter-offer
export interface CounterOffer {
  amount_bdt: number;
  tenor_months: number;
  installment_bdt: number;
  changed: ('amount' | 'tenor')[];
}

/**
 * Clamp a request to the limits, then step the amount down (in Tk 10,000 steps, never below 30% of the
 * clamped amount) until `acceptable` says the terms work. Returns null when nothing inside the limits works.
 */
export function counterOffer(ask: number, tenor: number, p: TermsPolicy, acceptable: (amount: number, tenor: number) => boolean): CounterOffer | null {
  const t = Math.min(tenor, p.max_tenor_months);
  const top = Math.floor(Math.min(ask, p.max_principal_bdt) / 10000) * 10000;
  const floor = Math.max(10000, Math.round(top * 0.3));
  for (let a = top; a >= floor; a -= 10000) {
    if (acceptable(a, t)) {
      const changed: CounterOffer['changed'] = [];
      if (a !== ask) changed.push('amount');
      if (t !== tenor) changed.push('tenor');
      return { amount_bdt: a, tenor_months: t, installment_bdt: Math.round(installment(a, p.borrower_rate_pct / 100, t)), changed };
    }
  }
  return null;
}

// ---------------------------------------------------------------- pricing
export interface Pricing {
  rebate_pct: number;
  penalty_pts: number;
  clamped: string[];
}

/** Clamp the Pricing agent's proposal into the lender's bands. */
export function clampPricing(rebate: number | null | undefined, penalty: number | null | undefined, p: TermsPolicy): Pricing {
  const clamped: string[] = [];
  let rb = typeof rebate === 'number' && Number.isFinite(rebate) ? rebate : p.rebate_default_pct;
  let pn = typeof penalty === 'number' && Number.isFinite(penalty) ? penalty : p.penalty_default_pts;
  if (rb < p.rebate_min_pct || rb > p.rebate_max_pct) {
    clamped.push(`rebate ${rb}% moved into ${p.rebate_min_pct}-${p.rebate_max_pct}%`);
    rb = Math.min(p.rebate_max_pct, Math.max(p.rebate_min_pct, rb));
  }
  if (pn < p.penalty_min_pts || pn > p.penalty_max_pts) {
    clamped.push(`penalty ${pn} points moved into ${p.penalty_min_pts}-${p.penalty_max_pts}`);
    pn = Math.min(p.penalty_max_pts, Math.max(p.penalty_min_pts, pn));
  }
  return { rebate_pct: r2(rb), penalty_pts: r2(pn), clamped };
}

export interface SettlementQuote {
  as_of: string;
  outstanding_principal_bdt: number;
  interest_accrued_bdt: number;
  remaining_interest_bdt: number; // scheduled interest not yet earned
  rebate_bdt: number;
  overdue_bdt: number;
  late_fee_bdt: number;
  total_to_settle_bdt: number;
}

/** Early-settlement quote: unpaid principal + interest accrued since the last due date + overdue + late fee. The rebate waives part of the remaining scheduled interest. */
export function settlementQuote(s: Installment[], ratePct: number, rebatePct: number, penaltyPts: number, asOf: string): SettlementQuote {
  const now = new Date(asOf + 'T00:00:00Z').getTime();
  const past = s.filter((x) => new Date(x.due_date + 'T00:00:00Z').getTime() <= now);
  const future = s.filter((x) => new Date(x.due_date + 'T00:00:00Z').getTime() > now);
  const overdue = past.reduce((a, x) => a + Math.max(0, x.amount_bdt - x.paid_bdt), 0);
  const outstanding = future.reduce((a, x) => a + x.principal_bdt, 0);
  const lastDue = past.length ? new Date(past[past.length - 1].due_date + 'T00:00:00Z').getTime() : now;
  const accrued = Math.round(outstanding * (ratePct / 100) * ((now - lastDue) / DAY / 365));
  const remaining = future.reduce((a, x) => a + x.interest_bdt, 0);
  const rebate = Math.round(Math.max(0, remaining - accrued) * (rebatePct / 100));
  const lateFee = past.reduce((a, x) => a + lateFee1(Math.max(0, x.amount_bdt - x.paid_bdt), penaltyPts, Math.max(0, (now - new Date(x.due_date + 'T00:00:00Z').getTime()) / DAY)), 0);
  return {
    as_of: asOf, outstanding_principal_bdt: outstanding, interest_accrued_bdt: accrued, remaining_interest_bdt: remaining, rebate_bdt: rebate,
    overdue_bdt: overdue, late_fee_bdt: lateFee, total_to_settle_bdt: outstanding + accrued + overdue + lateFee,
  };
}

/** Late fee on one overdue amount: the penalty points a year, pro rata for the days late. */
export function lateFee1(overdue: number, penaltyPts: number, daysLate: number) {
  if (overdue <= 0 || daysLate <= 0) return 0;
  return Math.round(overdue * (penaltyPts / 100) * (daysLate / 365));
}

// ---------------------------------------------------------------- payments
export type PaymentClass = 'early' | 'on_time' | 'late';

/** Early: more than the grace window before the due date. On time: within the grace window either side. Late: after it. */
export function classifyPayment(dueIso: string, receivedIso: string, graceDays: number): { classification: PaymentClass; days_from_due: number } {
  const days = Math.round((new Date(receivedIso.slice(0, 10) + 'T00:00:00Z').getTime() - new Date(dueIso + 'T00:00:00Z').getTime()) / DAY);
  const classification: PaymentClass = days < -graceDays ? 'early' : days <= graceDays ? 'on_time' : 'late';
  return { classification, days_from_due: days };
}

/**
 * Early-payment discount on one instalment: when it is paid at least `early_pay_min_days` before the due date,
 * that share of its interest is waived. Returns 0 when the policy has it off or the payment is not early enough.
 */
export function earlyDiscount(inst: Installment, daysFromDue: number, p: TermsPolicy) {
  if (p.early_pay_discount_pct <= 0 || inst.paid_bdt > 0 || inst.discount_bdt) return 0;
  if (daysFromDue > -p.early_pay_min_days) return 0;
  return Math.round((inst.interest_bdt * p.early_pay_discount_pct) / 100);
}

/** The date an instalment must be paid by to earn the early-payment discount. */
export function earlyPayBy(dueIso: string, p: TermsPolicy) {
  const d = new Date(dueIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - p.early_pay_min_days);
  return d.toISOString().slice(0, 10);
}

/** What an investor gets back on an amount at the investor rate, repaid monthly over the loan's tenor (if the borrower repays in full). */
export function investorReturn(amount: number, tenor: number, investorRatePct: number) {
  const s = schedule(amount, investorRatePct, tenor, '2000-01-01');
  const interest = totalInterest(s);
  return { amount_bdt: amount, interest_bdt: interest, total_back_bdt: amount + interest, monthly_bdt: s[0]?.amount_bdt ?? 0, tenor_months: tenor, rate_pct: investorRatePct };
}

/** How much an investor has received so far: each borrower instalment paid passes on the investor's share of that instalment. */
export function investorReceived(amount: number, investorRatePct: number, loan: Installment[]) {
  const inv = schedule(amount, investorRatePct, loan.length, '2000-01-01');
  let received = 0;
  let principalBack = 0;
  loan.forEach((x, i) => {
    const frac = x.amount_bdt > 0 ? Math.min(1, x.paid_bdt / x.amount_bdt) : 0;
    received += inv[i].amount_bdt * frac;
    principalBack += inv[i].principal_bdt * frac;
  });
  return { received_bdt: Math.round(received), principal_back_bdt: Math.round(principalBack), interest_received_bdt: Math.round(received - principalBack) };
}

/** A repayment clause that points to Annex A with a stated range is clear: the Pricing agent sets the figure inside it. */
export function isAnnexRange(text: string | null | undefined) {
  return !!text && /annex\s*a/i.test(text) && /between\s+[\d.]+\s*%?\s*(?:and|to|-)\s*[\d.]+/i.test(text);
}

/** The first instalment not yet fully paid. */
export function nextOpen(s: Installment[]) {
  return s.find((x) => x.paid_bdt < x.amount_bdt) || null;
}

/** Apply an amount to the schedule, oldest open instalment first. Returns the instalment the payment was mainly for. */
export function applyToSchedule(s: Installment[], amount: number): { schedule: Installment[]; first_n: number | null; partial: boolean } {
  const out = s.map((x) => ({ ...x }));
  let left = amount;
  let first: number | null = null;
  let partial = false;
  for (const x of out) {
    if (left <= 0) break;
    const need = x.amount_bdt - x.paid_bdt;
    if (need <= 0) continue;
    if (first == null) first = x.n;
    const take = Math.min(need, left);
    x.paid_bdt += take;
    left -= take;
    x.status = x.paid_bdt >= x.amount_bdt ? 'paid' : 'partial';
    if (x.n === first && x.status === 'partial') partial = true;
  }
  return { schedule: out, first_n: first, partial };
}

/** Deterministic match score used when the reference is missing and the AI is not available. */
export function matchScore(pay: { amount_bdt: number; received_at: string; payer_label?: string }, loan: { payer_label?: string; due_amount: number; due_date: string }) {
  const payer = pay.payer_label && loan.payer_label && pay.payer_label.trim().toLowerCase() === loan.payer_label.trim().toLowerCase() ? 1 : 0;
  const amt = loan.due_amount ? Math.max(0, 1 - Math.abs(pay.amount_bdt - loan.due_amount) / loan.due_amount) : 0;
  const days = Math.abs((new Date(pay.received_at.slice(0, 10)).getTime() - new Date(loan.due_date).getTime()) / DAY);
  const when = Math.max(0, 1 - days / 30);
  return r2(0.5 * payer + 0.3 * amt + 0.2 * when);
}

export function signPayload(raw: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

/** Constant-time check of the webhook's HMAC-SHA256 signature over the raw body. */
export function verifySignature(raw: string, signature: string | undefined, secret: string) {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const want = Buffer.from(signPayload(raw, secret), 'hex');
  const got = Buffer.from(signature, 'hex');
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// ---------------------------------------------------------------- contract
export interface ContractFields {
  principal_bdt: number | null;
  annual_rate_pct: number | null;
  tenor_months: number | null;
  early_clause: string | null;
  late_clause: string | null;
  early_rebate_pct: number | null;
  late_penalty_pts: number | null;
}

/** Code checks on what the Contract-reading agent extracted. */
export function validateContract(x: ContractFields, app: { loan_ask_bdt: number; tenor_months: number }, p: TermsPolicy) {
  const problems: { en: string; bn: string }[] = [];
  if (x.principal_bdt == null) problems.push({ en: 'The principal could not be read.', bn: 'মূল ঋণের অঙ্ক পড়া যায়নি।' });
  if (x.annual_rate_pct == null) problems.push({ en: 'The interest rate could not be read.', bn: 'সুদের হার পড়া যায়নি।' });
  if (x.tenor_months == null) problems.push({ en: 'The tenor could not be read.', bn: 'মেয়াদ পড়া যায়নি।' });
  if (!x.early_clause) problems.push({ en: 'No early repayment clause was found.', bn: 'আগাম পরিশোধের ধারা পাওয়া যায়নি।' });
  if (!x.late_clause) problems.push({ en: 'No late repayment clause was found.', bn: 'দেরিতে পরিশোধের ধারা পাওয়া যায়নি।' });
  if (x.principal_bdt != null && x.principal_bdt > p.max_principal_bdt) problems.push({ en: `The contract principal (Tk ${fmt(x.principal_bdt)}) is above the Tk ${fmt(p.max_principal_bdt)} limit.`, bn: `চুক্তির মূল অঙ্ক (${fmt(x.principal_bdt)} টাকা) ${fmt(p.max_principal_bdt)} টাকার সীমার বেশি।` });
  if (x.tenor_months != null && x.tenor_months > p.max_tenor_months) problems.push({ en: `The contract tenor (${x.tenor_months} months) is longer than the ${p.max_tenor_months}-month limit.`, bn: `চুক্তির মেয়াদ (${x.tenor_months} মাস) ${p.max_tenor_months} মাসের সীমার বেশি।` });
  if (x.principal_bdt != null && Math.abs(x.principal_bdt - app.loan_ask_bdt) > 1) problems.push({ en: `The contract principal (Tk ${fmt(x.principal_bdt)}) differs from the application (Tk ${fmt(app.loan_ask_bdt)}).`, bn: `চুক্তির মূল অঙ্ক (${fmt(x.principal_bdt)} টাকা) আবেদনের (${fmt(app.loan_ask_bdt)} টাকা) সাথে মেলে না।` });
  if (x.tenor_months != null && x.tenor_months !== app.tenor_months) problems.push({ en: `The contract tenor (${x.tenor_months} months) differs from the application (${app.tenor_months} months).`, bn: `চুক্তির মেয়াদ (${x.tenor_months} মাস) আবেদনের (${app.tenor_months} মাস) সাথে মেলে না।` });
  return problems;
}

const UNCLEAR = /verbal|as agreed|to be (decided|agreed|fixed)|tbd|at the (lender'?s|branch'?s) discretion|may apply|negotiable|if any|from time to time|reasonable (fee|charge)/i;

/** Rules reader for the contract format Bhorsha generates (used when the AI is not available). */
export function readContractRules(text: string): { fields: ContractFields; unclear: { clause: string; why_en: string; why_bn: string }[]; confidence: number } {
  const num = (re: RegExp) => {
    const m = text.match(re);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };
  const line = (re: RegExp) => text.split(/\r?\n/).find((l) => re.test(l))?.replace(/^\s*\d+\.\s*/, '').trim() || null;
  const early = line(/early repayment|prepayment/i);
  const late = line(/late (repayment|payment)|overdue/i);
  const fields: ContractFields = {
    principal_bdt: num(/principal[^0-9]{0,30}([\d,]+)/i),
    annual_rate_pct: num(/interest rate[^0-9]{0,30}([\d.]+)\s*%/i),
    tenor_months: num(/tenor[^0-9]{0,30}(\d+)\s*months?/i),
    early_clause: early,
    late_clause: late,
    // a figure counts only when the clause fixes it; "as set in Annex A (between x and y)" leaves it to the Pricing agent
    early_rebate_pct: early ? num(/([\d.]+)\s*% of the remaining/i) : null,
    late_penalty_pts: late ? num(/([\d.]+)\s*percentage points? a year above/i) : null,
  };
  const unclear: { clause: string; why_en: string; why_bn: string }[] = [];
  for (const [name, c, nameBn] of [['early repayment', early, 'আগাম পরিশোধ'], ['late repayment', late, 'দেরিতে পরিশোধ']] as const) {
    if (c && UNCLEAR.test(c)) unclear.push({ clause: c, why_en: `The ${name} clause does not state a fixed figure.`, why_bn: `${nameBn}ের ধারায় নির্দিষ্ট অঙ্ক নেই।` });
  }
  const got = [fields.principal_bdt, fields.annual_rate_pct, fields.tenor_months, fields.early_clause, fields.late_clause].filter((v) => v != null).length;
  return { fields, unclear, confidence: r2(0.5 + got * 0.09) };
}

/** The standard loan contract text Bhorsha generates for an application. */
export function contractText(o: { contractNo: string; borrower: string; principal: number; ratePct: number; tenor: number; rebateBand: [number, number]; penaltyBand: [number, number]; lateClause?: string; earlyClause?: string }) {
  return [
    `LOAN AGREEMENT ${o.contractNo} (synthetic demo)`,
    `Lender: licensed partner (lender of record). Borrower: ${o.borrower}.`,
    `1. Principal: Tk ${fmt(o.principal)}.`,
    `2. Interest rate: ${o.ratePct}% a year, reducing balance.`,
    `3. Tenor: ${o.tenor} months, equal monthly instalments.`,
    `4. ${o.earlyClause || `Early repayment: the borrower may repay early at any time; part of the remaining scheduled interest is waived, at the rebate set in Annex A (between ${o.rebateBand[0]}% and ${o.rebateBand[1]}%).`}`,
    `5. ${o.lateClause || `Late repayment: an overdue instalment carries a late charge for the days it is late, at the extra points a year set in Annex A (between ${o.penaltyBand[0]} and ${o.penaltyBand[1]} points).`}`,
    `Annex A (pricing): set by the lender's Pricing agent inside the ranges above and recorded with the decision.`,
    `6. Repayment by bKash or bank transfer, quoting the loan reference.`,
  ].join('\n');
}
