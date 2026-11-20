import { Application, Shop, Transaction, Doc, EvidenceItem, Finding, Verdict, AuditLog, CourierSettlement, OrderRecord } from '../models';
import { orderSummary } from '../lib/online';
import type { Txn } from '../lib/statement';
import { runChecks, CheckResult } from '../lib/checks';
import { computeFeatures, likelyCause, CAUSES, Features, Stated, Cause, RATE } from '../lib/features';
import { judge, Judgement } from '../lib/judge';
import { RuleSettings, VERDICT_TEXT, Verdict as V } from '../lib/rules';
import { loadModel, contributions } from '../lib/model';
import { featureVector } from '../lib/features';
import { counterfactualSearch, prudentialConditions, tranchePlan, recoveryPlan, Condition } from '../lib/conditions';
import { fmtBdt, round } from '../lib/util';
import { getRuleSettings } from './settings';
import { callJson, PROMPTS, PhraseSchema, FindingsSchema, Phrase } from './ai';
import { validateText, validateCitations, extractNumbers } from '../lib/validate';
import { redact } from '../lib/redact';

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadTxns(shopId: unknown, includeHiddenUpTo = 0): Promise<Txn[]> {
  const rows = await Transaction.find({ shop: shopId, hidden_until_sim: { $lte: includeHiddenUpTo } }).sort({ date: 1, _id: 1 }).lean();
  return rows.map((r) => ({
    date: new Date(r.date as Date),
    amount_bdt: r.amount_bdt as number,
    direction: r.direction as 'in' | 'out',
    counterparty_kind: r.counterparty_kind as Txn['counterparty_kind'],
    counterparty: r.counterparty as string,
    balance_after_bdt: r.balance_after_bdt as number,
    due_date: r.due_date ? new Date(r.due_date as Date) : null,
    note: r.note as string,
  }));
}

export interface OnlineEv {
  settlements: Lean[];
  orders: Lean[];
  netTotal: number;
}

interface Ev {
  eid: string;
  claim_key: string;
  claim_text: string;
  claim_text_bn: string;
  value: unknown;
  label: 'checked' | 'owner_says';
  source_kind: string;
  source_ref: string;
}

/** Merge owner-stated inputs with document readings. Owner statements stay owner_says; only confirmed documents become checked. */
function mergeStated(app: Lean, docs: Lean[]): { stated: Stated; noteClaims: string[]; receivableDoc: Lean | null } {
  const stated: Stated = { ...(app.stated || {}) };
  const noteClaims: string[] = [];
  let receivableDoc: Lean | null = null;
  for (const d of docs) {
    const x = d.extracted_json || {};
    if (d.kind === 'note') {
      if (stated.cash_share == null && typeof x.cash_share === 'number') stated.cash_share = x.cash_share;
      if (stated.margin == null && typeof x.margin === 'number') stated.margin = x.margin;
      if (stated.seasonal == null && typeof x.seasonal === 'boolean') stated.seasonal = x.seasonal;
      const rec = (x.receivables || [])[0];
      if (rec && stated.receivable_bdt == null) {
        stated.receivable_bdt = rec.amount_bdt;
        stated.receivable_days = rec.days;
      }
      noteClaims.push(...(x.claims || []), ...(x.concerns || []));
    }
    if (d.kind === 'bill' && /receivable|sales_invoice/i.test(String(x.document_type || ''))) {
      const amtOk = d.confirmed_fields?.amount_bdt;
      if (amtOk) {
        receivableDoc = d;
        stated.receivable_bdt = Number(amtOk.value);
        stated.receivable_confirmed = true;
      }
    }
  }
  return { stated, noteClaims, receivableDoc };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function buildEvidence(f: Features, stated: Stated, app: Lean, docs: Lean[], checks: CheckResult[], noteClaims: string[], receivableDoc: Lean | null, online: OnlineEv | null): Ev[] {
  const ev: Ev[] = [];
  const add = (e: Omit<Ev, 'eid'>) => ev.push({ ...e, eid: `E${ev.length + 1}` });
  const S = 'statement';
  add({ claim_key: 'monthly_inflow', claim_text: `Visible sales in the wallet average ${fmtBdt(f.avg_inflow_3m)} BDT a month over the last 3 months.`, claim_text_bn: `গত ৩ মাসে ওয়ালেটে দৃশ্যমান বিক্রি মাসে গড়ে ${fmtBdt(f.avg_inflow_3m)} টাকা।`, value: round(f.avg_inflow_3m), label: 'checked', source_kind: S, source_ref: 'statement' });
  add({ claim_key: 'months_history', claim_text: `The statement covers ${f.months_history} months.`, claim_text_bn: `স্টেটমেন্টে ${f.months_history} মাসের হিসাব আছে।`, value: f.months_history, label: 'checked', source_kind: S, source_ref: 'statement' });
  add({ claim_key: 'supplier_on_time', claim_text: `${pct(f.supplier_on_time)} of supplier payments were made on time${f.lateness_trend > 3 ? `; recent payments are about ${Math.round(f.late_days_recent)} days late` : ''}.`, claim_text_bn: `সরবরাহকারীর ${pct(f.supplier_on_time)} পরিশোধ সময়মতো${f.lateness_trend > 3 ? `; সাম্প্রতিক পরিশোধ প্রায় ${Math.round(f.late_days_recent)} দিন দেরিতে` : ''}।`, value: round(f.supplier_on_time, 2), label: 'checked', source_kind: S, source_ref: 'statement' });
  add({ claim_key: 'household_share', claim_text: `${pct(f.household_share)} of outflows go to personal contacts.`, claim_text_bn: `খরচের ${pct(f.household_share)} ব্যক্তিগত খাতে যায়।`, value: round(f.household_share, 2), label: 'checked', source_kind: S, source_ref: 'statement' });
  const failed = checks.filter((c) => !c.passed && c.severity !== 'low');
  add({ claim_key: 'consistency', claim_text: failed.length ? `Consistency: ${failed.map((c) => c.detail_en).join(' ')}` : 'The statement passed the consistency checks (internally consistent; this does not prove it is authentic).', claim_text_bn: failed.length ? `সামঞ্জস্য: ${failed.map((c) => c.detail_bn).join(' ')}` : 'স্টেটমেন্ট সামঞ্জস্য পরীক্ষায় উত্তীর্ণ (ভেতরে সামঞ্জস্যপূর্ণ; এটি আসল কিনা প্রমাণ করে না)।', value: failed.length ? 'failed' : 'passed', label: 'checked', source_kind: S, source_ref: 'checks' });
  if (f.customer_concentration > 0)
    add({ claim_key: 'customer_concentration', claim_text: `The largest named buyer brings ${pct(f.customer_concentration)} of visible inflow.`, claim_text_bn: `সবচেয়ে বড় ক্রেতা থেকে দৃশ্যমান জমার ${pct(f.customer_concentration)} আসে।`, value: round(f.customer_concentration, 2), label: 'checked', source_kind: S, source_ref: 'statement' });
  add({ claim_key: 'installment', claim_text: `Monthly instalment on ${fmtBdt(app.loan_ask_bdt)} BDT over ${app.tenor_months} months at 9%: ${fmtBdt(f.installment)} BDT.`, claim_text_bn: `${fmtBdt(app.loan_ask_bdt)} টাকা, ${app.tenor_months} মাস, ৯% হারে মাসিক কিস্তি: ${fmtBdt(f.installment)} টাকা।`, value: round(f.installment), label: 'checked', source_kind: 'calculation', source_ref: 'loan terms' });
  add({ claim_key: 'cash_share', claim_text: stated.cash_share != null ? `About ${pct(stated.cash_share)} of sales are taken in cash, so the statement sees about ${f.coverage}% of turnover.` : 'The cash share of sales was not stated; 50% assumed.', claim_text_bn: stated.cash_share != null ? `বিক্রির প্রায় ${pct(stated.cash_share)} নগদে হয়, তাই স্টেটমেন্টে মোট বিক্রির প্রায় ${f.coverage}% দেখা যায়।` : 'নগদ বিক্রির অংশ জানানো হয়নি; ৫০% ধরা হয়েছে।', value: stated.cash_share ?? null, label: 'owner_says', source_kind: 'owner', source_ref: 'note / intake' });
  add({ claim_key: 'margin', claim_text: `Profit margin about ${pct(stated.margin ?? 0.15)}${stated.margin == null ? ' (default, not stated)' : ''}, about ${fmtBdt(f.margin_month)} BDT a month on estimated turnover of ${fmtBdt(f.estimated_turnover)} BDT.`, claim_text_bn: `লাভ প্রায় ${pct(stated.margin ?? 0.15)}${stated.margin == null ? ' (ধরা হয়েছে)' : ''}, আনুমানিক মাসিক বিক্রি ${fmtBdt(f.estimated_turnover)} টাকায় মাসে প্রায় ${fmtBdt(f.margin_month)} টাকা।`, value: stated.margin ?? 0.15, label: 'owner_says', source_kind: 'owner', source_ref: 'note / intake' });
  if (stated.seasonal != null)
    add({ claim_key: 'seasonal', claim_text: stated.seasonal ? 'The business is seasonal.' : 'The business is not seasonal.', claim_text_bn: stated.seasonal ? 'ব্যবসা মৌসুমি।' : 'ব্যবসা মৌসুমি নয়।', value: stated.seasonal, label: 'owner_says', source_kind: 'owner', source_ref: 'note' });
  if (stated.receivable_bdt)
    add({ claim_key: 'receivable', claim_text: `A buyer owes ${fmtBdt(stated.receivable_bdt)} BDT, outstanding about ${stated.receivable_days ?? '?'} days.`, claim_text_bn: `একজন ক্রেতার কাছে ${fmtBdt(stated.receivable_bdt)} টাকা পাওনা, প্রায় ${stated.receivable_days ?? '?'} দিন ধরে।`, value: stated.receivable_bdt, label: receivableDoc ? 'checked' : 'owner_says', source_kind: receivableDoc ? 'document' : 'owner', source_ref: receivableDoc ? String(receivableDoc._id) : 'note' });
  if (stated.cib_status)
    add({ claim_key: 'cib_status', claim_text: `Credit bureau (CIB) status declared: ${stated.cib_status}.`, claim_text_bn: `সিআইবি অবস্থা (ঘোষিত): ${stated.cib_status}।`, value: stated.cib_status, label: 'owner_says', source_kind: 'owner', source_ref: 'intake' });
  for (const c of noteClaims.slice(0, 4)) add({ claim_key: 'note_claim', claim_text: `Owner's note: "${c}".`, claim_text_bn: `মালিকের নোট: "${c}"।`, value: c, label: 'owner_says', source_kind: 'owner', source_ref: 'note' });
  if (online && online.settlements.length) {
    const m = online.settlements.filter((x) => x.match_status === 'checked').length;
    const share = m / online.settlements.length;
    add({ claim_key: 'courier_settlements', claim_text: `Courier settlements: ${online.settlements.length} cash-on-delivery orders, ${fmtBdt(online.netTotal)} BDT remitted after fees; ${m} of ${online.settlements.length} matched to wallet credits.`, claim_text_bn: `কুরিয়ারের হিসাব: ${online.settlements.length}টি ক্যাশ-অন-ডেলিভারি অর্ডার, খরচ বাদে ${fmtBdt(online.netTotal)} টাকা পাঠানো; ${online.settlements.length}টির মধ্যে ${m}টি ওয়ালেটের জমার সাথে মিলেছে।`, value: Math.round(share * 100) / 100, label: share >= 0.9 ? 'checked' : 'owner_says', source_kind: share >= 0.9 ? 'courier+wallet match' : 'courier csv', source_ref: 'courier settlements' });
  }
  if (online && online.orders.length) {
    const sum = orderSummary(online.orders as never);
    const matched = online.orders.filter((o) => o.status === 'delivered' && o.matched).length;
    const share = sum.delivered ? matched / sum.delivered : 0;
    add({ claim_key: 'order_log', claim_text: `Order log: ${sum.n} online orders, ${sum.delivered} delivered, returns ${pct(sum.return_rate)}; ${matched} delivered orders matched to money received.`, claim_text_bn: `অর্ডারের খাতা: ${sum.n}টি অনলাইন অর্ডার, ${sum.delivered}টি পৌঁছেছে, ফেরত ${pct(sum.return_rate)}; ${matched}টি পৌঁছানো অর্ডারের টাকা মিলেছে।`, value: Math.round(sum.return_rate * 1000) / 1000, label: share >= 0.8 ? 'checked' : 'owner_says', source_kind: share >= 0.8 ? 'orders matched to courier/wallet' : 'owner order log', source_ref: 'order log' });
  }
  for (const d of docs.filter((x) => x.kind === 'bill')) {
    const cf = d.confirmed_fields || {};
    const keys = Object.keys(cf);
    if (!keys.length) continue;
    const x = d.extracted_json || {};
    const amt = cf.amount_bdt?.value;
    const who = cf.supplier_label?.value ?? x.supplier_label ?? 'unknown party';
    const date = cf.date?.value ?? '';
    add({ claim_key: `doc_${d._id}`, claim_text: `Bill confirmed by the officer: ${amt != null ? fmtBdt(Number(amt)) + ' BDT' : 'amount unconfirmed'} from ${who}${date ? ' on ' + date : ''} (${keys.length} fields ticked).`, claim_text_bn: `অফিসার নিশ্চিত করা বিল: ${who}${date ? ', ' + date : ''}, ${amt != null ? fmtBdt(Number(amt)) + ' টাকা' : 'অঙ্ক নিশ্চিত নয়'} (${keys.length}টি ঘর টিক দেওয়া)।`, value: amt ?? null, label: 'checked', source_kind: 'document', source_ref: String(d._id) });
  }
  return ev;
}

interface F0 {
  kind: 'contradiction' | 'tamper' | 'coverage';
  code: string;
  text: string;
  text_bn: string;
  cited_evidence_ids: string[];
  severity: 'low' | 'medium' | 'high';
  source: string;
}

/** Deterministic cross-document checks. Always run; the AI cross-check adds to these. */
export function crossCheckRules(f: Features, ev: Ev[], docs: Lean[], txns: Txn[], checks: CheckResult[], stated: Stated): F0[] {
  const out: F0[] = [];
  const id = (k: string) => ev.find((e) => e.claim_key === k)?.eid;
  const claims = ev.filter((e) => e.claim_key === 'note_claim');
  const push = (x: Omit<F0, 'source'>) => out.push({ ...x, source: 'rules', cited_evidence_ids: x.cited_evidence_ids.filter(Boolean) });

  const failedHigh = checks.filter((c) => !c.passed && c.severity === 'high');
  for (const c of failedHigh) push({ kind: 'tamper', code: c.code, text: c.detail_en, text_bn: c.detail_bn, cited_evidence_ids: [id('consistency')!], severity: 'high' });

  if (f.coverage < 50 && stated.cash_share != null)
    push({ kind: 'coverage', code: 'low_coverage', text: `Most sales are cash (owner says ${pct(stated.cash_share)}). The statement sees only about ${f.coverage}% of turnover, so the band is wider. The gap is not filled from the owner's word.`, text_bn: `বেশিরভাগ বিক্রি নগদে (মালিক বলছেন ${pct(stated.cash_share)})। স্টেটমেন্টে মোট বিক্রির মাত্র প্রায় ${f.coverage}% দেখা যায়, তাই সীমা চওড়া। ফাঁকটি মালিকের কথায় পূরণ করা হয়নি।`, cited_evidence_ids: [id('cash_share')!, id('monthly_inflow')!], severity: 'low' });

  const steady = claims.find((c) => /steady|same as before|fine|ঠিক আছে|আগের মতো/i.test(String(c.value)));
  if (steady && f.trend_3m < -0.1)
    push({ kind: 'contradiction', code: 'claim_vs_trend', text: `The owner says sales are steady, but visible sales fell ${pct(-f.trend_3m)} over the last 3 months. Kept as owner says.`, text_bn: `মালিক বলছেন বিক্রি ঠিক আছে, কিন্তু গত ৩ মাসে দৃশ্যমান বিক্রি ${pct(-f.trend_3m)} কমেছে। দাবিটি "মালিক বলছেন" হিসেবে রাখা হলো।`, cited_evidence_ids: [steady.eid, id('monthly_inflow')!], severity: 'medium' });

  const months = claims.find((c) => /(\d+)\s*months/i.test(String(c.value)));
  const m = months ? Number(String(months.value).match(/(\d+)\s*months/i)![1]) : null;
  if (months && m && m > f.months_history + 2)
    push({ kind: 'contradiction', code: 'history_claim', text: `The owner says ${m} months of trading, but the statement covers ${f.months_history} months. Ask for the missing months.`, text_bn: `মালিক বলছেন ${m} মাস ব্যবসা করছেন, কিন্তু স্টেটমেন্টে ${f.months_history} মাস। বাকি মাসের স্টেটমেন্ট চাওয়া হোক।`, cited_evidence_ids: [months.eid, id('months_history')!], severity: 'medium' });

  const personalClaim = claims.find((c) => /personal|ব্যক্তিগত|cousin|wholesale/i.test(String(c.value)));
  if (personalClaim && f.household_share > 0.25)
    push({ kind: 'contradiction', code: 'personal_as_stock', text: `The owner says transfers to personal numbers are stock payments, but the statement shows them as personal (${pct(f.household_share)} of outflows). Kept as owner says until the wholesaler's bills are shown.`, text_bn: `মালিক বলছেন ব্যক্তিগত নম্বরে পাঠানো টাকা মালের দাম, কিন্তু স্টেটমেন্টে তা ব্যক্তিগত (খরচের ${pct(f.household_share)})। পাইকারের বিল না দেখানো পর্যন্ত "মালিক বলছেন"।`, cited_evidence_ids: [personalClaim.eid, id('household_share')!], severity: 'medium' });

  // bills: duplicates and statement matching
  const bills = docs.filter((d) => d.kind === 'bill' && d.confirmed_fields?.amount_bdt);
  const seen = new Map<string, Lean>();
  for (const b of bills) {
    const key = `${b.confirmed_fields.amount_bdt.value}|${b.confirmed_fields.date?.value ?? b.extracted_json?.date ?? ''}`;
    const prev = seen.get(key);
    if (prev)
      push({ kind: 'contradiction', code: 'duplicate_bill', text: `Two uploaded bills have the same amount and date (${fmtBdt(Number(b.confirmed_fields.amount_bdt.value))} BDT). Counted once, not twice.`, text_bn: `দুটি আপলোড করা বিলের অঙ্ক ও তারিখ একই (${fmtBdt(Number(b.confirmed_fields.amount_bdt.value))} টাকা)। একবারই গোনা হয়েছে।`, cited_evidence_ids: [id(`doc_${prev._id}`)!, id(`doc_${b._id}`)!], severity: 'medium' });
    seen.set(key, b);
    const amt = Number(b.confirmed_fields.amount_bdt.value);
    const isReceivable = /receivable|sales_invoice/i.test(String(b.extracted_json?.document_type || ''));
    if (!isReceivable) {
      const match = txns.some((t) => t.direction === 'out' && Math.abs(t.amount_bdt - amt) <= Math.max(5, amt * 0.01));
      if (!match)
        push({ kind: 'contradiction', code: 'bill_not_in_statement', text: `The confirmed bill of ${fmtBdt(amt)} BDT is not visible as a payment in the statement (may have been paid in cash).`, text_bn: `নিশ্চিত করা ${fmtBdt(amt)} টাকার বিলটি স্টেটমেন্টে পরিশোধ হিসেবে দেখা যায় না (নগদে দেওয়া হতে পারে)।`, cited_evidence_ids: [id(`doc_${b._id}`)!, id('monthly_inflow')!], severity: 'low' });
    }
  }
  const swing = f.monthly.length >= 6 ? Math.max(...f.monthly.map((x) => x.inflow)) / Math.max(1, Math.min(...f.monthly.map((x) => x.inflow))) : 1;
  if (stated.seasonal === false && swing > 3 && f.months_history >= 9)
    push({ kind: 'contradiction', code: 'seasonal_claim', text: `The owner says the business is not seasonal, but monthly sales swing about ${swing.toFixed(1)} times between the best and worst month.`, text_bn: `মালিক বলছেন ব্যবসা মৌসুমি নয়, কিন্তু সবচেয়ে ভালো ও খারাপ মাসে বিক্রি প্রায় ${swing.toFixed(1)} গুণ ওঠানামা করে।`, cited_evidence_ids: [id('seasonal')!, id('monthly_inflow')!], severity: 'low' });
  return out.filter((x) => x.cited_evidence_ids.length >= 1);
}

function watchList(f: Features, cause: Cause) {
  const items = [
    { en: `Monthly visible sales against the forecast band (now about ${fmtBdt(f.avg_inflow_3m)} BDT a month).`, bn: `প্রতি মাসের দৃশ্যমান বিক্রি বনাম পূর্বাভাসের সীমা (এখন মাসে প্রায় ${fmtBdt(f.avg_inflow_3m)} টাকা)।` },
    { en: 'Supplier payment timing.', bn: 'সরবরাহকারীকে পরিশোধের সময়।' },
  ];
  if (f.household_share > 0.15) items.push({ en: `Personal transfers (now ${pct(f.household_share)} of outflows).`, bn: `ব্যক্তিগত লেনদেন (এখন খরচের ${pct(f.household_share)})।` });
  if (f.receivable_days > 30) items.push({ en: `Collection of the ${fmtBdt(f.receivable_bdt)} BDT receivable.`, bn: `${fmtBdt(f.receivable_bdt)} টাকা পাওনা আদায়।` });
  if (cause === 'stock_problem') items.push({ en: 'Mid-month low-sales days (a sign of empty shelves).', bn: 'মাসের মাঝে কম বিক্রির দিন (তাক খালি থাকার লক্ষণ)।' });
  return items;
}

function cannotTell(f: Features, stated: Stated) {
  const out = [
    { en: 'Whether the owner will repay: this file judges the evidence, not the person.', bn: 'মালিক ঋণ শোধ করবেন কিনা: এই ফাইল প্রমাণ বিচার করে, মানুষকে নয়।' },
    { en: `Cash sales: about ${100 - f.coverage}% of turnover is not visible and rests on the owner's word.`, bn: `নগদ বিক্রি: মোট বিক্রির প্রায় ${100 - f.coverage}% দেখা যায় না, মালিকের কথার উপর নির্ভর করে।` },
    { en: 'Whether documents are authentic: checks only show whether they are internally consistent.', bn: 'কাগজ আসল কিনা: পরীক্ষাগুলো শুধু ভেতরের সামঞ্জস্য দেখায়।' },
    { en: 'This is synthetic demo data. The numbers have not been tested on real borrowers.', bn: 'এগুলো কৃত্রিম ডেমো তথ্য। সংখ্যাগুলো বাস্তব ঋণগ্রহীতার উপর পরীক্ষা করা হয়নি।' },
  ];
  if (f.months_history < 12) out.splice(1, 0, { en: `Seasons: with ${f.months_history} months of history, a full year of seasons cannot be judged.`, bn: `মৌসুম: ${f.months_history} মাসের ইতিহাসে পুরো বছরের মৌসুম বিচার করা যায় না।` });
  if (f.seasonal_used && f.months_history <= 12) out.splice(1, 0, { en: "The seasonal pattern comes from the business type and the owner's note (owner says); last year's months would sharpen it.", bn: 'মৌসুমি ধরন ব্যবসার ধরন ও মালিকের নোট থেকে নেওয়া (মালিক বলছেন); গত বছরের হিসাব পেলে আরও নির্ভুল হবে।' });
  if (stated.margin == null) out.push({ en: 'The margin was not stated; 15% was assumed.', bn: 'লাভের হার জানানো হয়নি; ১৫% ধরা হয়েছে।' });
  return out.slice(0, 5);
}

function refinanceFit(app: Lean, stated: Stated) {
  const r = (key: string, en: string, bn: string, status: 'pass' | 'fail' | 'unknown') => ({ key, en, bn, status });
  return [
    r('cib', 'CIB status declared clean', 'সিআইবি অবস্থা পরিষ্কার (ঘোষিত)', stated.cib_status === 'clean' ? 'pass' : stated.cib_status === 'classified' ? 'fail' : 'unknown'),
    r('grace', 'Grace period fits the fund (up to 6 months)', 'গ্রেস পিরিয়ড তহবিলের নিয়মে মেলে (৬ মাস পর্যন্ত)', stated.grace_months == null ? 'unknown' : stated.grace_months <= 6 ? 'pass' : 'fail'),
    r('rate', 'Rate at or below the 9% cap', 'সুদের হার ৯% সীমার মধ্যে', RATE <= 0.09 ? 'pass' : 'fail'),
    r('purpose', 'Working-capital purpose', 'চলতি মূলধনের উদ্দেশ্য', app.purpose_kind === 'working_capital' ? 'pass' : app.purpose_kind ? 'fail' : 'unknown'),
  ];
}

function reasonsFrom(j: Judgement, ev: Ev[], f: Features, cause: Cause) {
  const idOf = (keys: string[]) => keys.map((k) => ev.find((e) => e.claim_key === k)?.eid).filter(Boolean) as string[];
  const fired = j.rules.filter((r) => r.fired).sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const reasons = fired.slice(0, 3).map((r) => ({
    key: r.key,
    points: r.points,
    en: `${r.condition_en}: ${r.value_text}${r.points ? ` (${r.points > 0 ? '+' : ''}${r.points})` : ''}.`,
    bn: `${r.condition_bn}: ${r.value_text}${r.points ? ` (${r.points > 0 ? '+' : ''}${r.points})` : ''}।`,
    cites: idOf(r.evidence_keys),
  }));
  if (reasons.length < 3)
    reasons.push({ key: 'coverage', points: 0, en: `The statement sees about ${f.coverage}% of turnover.`, bn: `স্টেটমেন্টে মোট বিক্রির প্রায় ${f.coverage}% দেখা যায়।`, cites: idOf(['cash_share', 'monthly_inflow']) });
  if (reasons.length < 3)
    reasons.push({ key: 'cause', points: 0, en: `Likely weak point: ${CAUSES[cause].en.toLowerCase()}.`, bn: `সম্ভাব্য দুর্বল দিক: ${CAUSES[cause].bn}।`, cites: idOf(['monthly_inflow']) });
  return reasons.slice(0, 3);
}

function templateText(verdict: V, j: Judgement, cause: Cause, checkedShare: number, conds: Condition[]) {
  const vt = VERDICT_TEXT[verdict];
  const lead =
    verdict === 'viable'
      ? { en: '', bn: '' }
      : conds.length
        ? { en: `What can change it: ${conds[0].en} `, bn: `যা বদলালে রায় বদলাতে পারে: ${conds[0].bn} ` }
        : { en: 'More evidence would make this clearer. ', bn: 'আরও প্রমাণ পেলে বিষয়টি পরিষ্কার হবে। ' };
  return {
    en: `${lead.en}Verdict: ${vt.en}. Likelihood of still trading in 12 months: ${j.band.low}% to ${j.band.high}%. Likely weak point: ${CAUSES[cause].en.toLowerCase()}. ${checkedShare}% of the claims in this file are checked; the rest are what the owner says. Advice for the manager; the decision is yours.`,
    bn: `${lead.bn}রায়: ${vt.bn}। ১২ মাস পরেও ব্যবসা চালু থাকার সম্ভাবনা: ${j.band.low}% থেকে ${j.band.high}%। সম্ভাব্য দুর্বল দিক: ${CAUSES[cause].bn}। এই ফাইলের ${checkedShare}% দাবি যাচাই করা; বাকিগুলো মালিকের কথা। এটি ম্যানেজারের জন্য পরামর্শ; সিদ্ধান্ত আপনার।`,
  };
}

export interface RecomputeOpts {
  actor?: string;
  ai?: boolean; // run the AI cross-check and AI phrasing
  reason?: string;
}

export async function recompute(appId: unknown, opts: RecomputeOpts = {}) {
  const app = (await Application.findById(appId).lean()) as Lean;
  if (!app) throw new Error('application not found');
  const shop = (await Shop.findById(app.shop).lean()) as Lean;
  const docs = (await Doc.find({ shop: app.shop }).sort({ createdAt: 1 }).lean()) as Lean[];
  const txns = await loadTxns(app.shop, 0);
  const settings: RuleSettings = await getRuleSettings();
  const settlements = (await CourierSettlement.find({ shop: app.shop }).sort({ settlement_date: 1 }).lean()) as Lean[];
  const orders = (await OrderRecord.find({ shop: app.shop }).lean()) as Lean[];
  const online: OnlineEv | null = settlements.length || orders.length ? { settlements, orders, netTotal: settlements.reduce((a, x) => a + (x.net_remitted || 0), 0) } : null;
  const returnRate = orders.length ? orderSummary(orders as never).return_rate : null;
  const { stated, noteClaims, receivableDoc } = mergeStated(app, docs);
  const checks = runChecks(txns);
  const f = computeFeatures({ txns, business_type: shop.business_type, loan_ask_bdt: app.loan_ask_bdt, tenor_months: app.tenor_months, stated, checks, return_rate: returnRate });
  const model = loadModel();
  const j = judge(f, settings, model);
  const cause = likelyCause(f);
  const judgeFn = (g: Features) => judge(g, settings, model).final_verdict;
  const cfs = counterfactualSearch(f, settings, app.loan_ask_bdt, judgeFn, 3, (g) => judge(g, settings, model).rules_total);
  const conds: Condition[] = [];
  if (cfs[0]) cfs[0].actions.forEach((a, i) => conds.push({ key: a, kind: 'counterfactual', ...cfs[0].texts[i] }));
  for (const p of prudentialConditions(f, cause, settings, app.loan_ask_bdt)) if (!conds.some((c) => c.key === p.key)) conds.push(p);
  const tranches = tranchePlan(app.loan_ask_bdt, conds, f, settings);
  const ev = buildEvidence(f, stated, app, docs, checks, noteClaims, receivableDoc, online);
  const checkedShare = ev.length ? Math.round((ev.filter((e) => e.label === 'checked').length / ev.length) * 100) : 0;
  let findings = crossCheckRules(f, ev, docs, txns, checks, stated);

  const missing: string[] = [];
  if (f.months_history < 3) missing.push('statement_3_months');
  if (f.months_history < 12) missing.push('statement_12_months');
  if (f.consistency_flags >= 2) missing.push('fresh_statement');
  if (f.seasonal_used && f.months_history <= 12) missing.push('last_year_months');
  if (!docs.some((d) => d.kind === 'bill')) missing.push('supplier_bills');

  // ---- optional AI cross-check over structured facts (validated: every cited id must exist)
  const known = new Set(ev.map((e) => e.eid));
  const names = [shop.owner_label, shop.label].filter(Boolean);
  if (opts.ai) {
    const facts = ev.map((e) => ({ id: e.eid, label: e.label, text: e.claim_text }));
    const r = await callJson({
      task: 'cross_check', system: PROMPTS.crosscheck, user: redact(JSON.stringify({ facts }), names).text,
      schema: FindingsSchema, fallback: () => ({ findings: [] }), actor: opts.actor, application: app._id,
      extraCheck: (d) => {
        const bad = d.findings.filter((x) => !validateCitations(x.cites, known).ok || x.cites.length < 2);
        return bad.length ? `findings cite unknown ids: ${bad.map((b) => b.cites.join('/')).join(', ')}` : null;
      },
    });
    if (r.mode === 'ai')
      for (const x of r.data.findings)
        if (!findings.some((y) => y.cited_evidence_ids.join() === x.cites.join()))
          findings.push({ kind: 'contradiction', code: 'ai_cross_check', text: x.text_en, text_bn: x.text_bn || x.text_en, cited_evidence_ids: x.cites, severity: x.severity, source: 'ai' });
  }

  const reasons = reasonsFrom(j, ev, f, cause);
  const tmpl = templateText(j.final_verdict, j, cause, checkedShare, conds);
  let text_en = tmpl.en;
  let text_bn = tmpl.bn;
  let generated_by: 'ai_phrased' | 'template' = 'template';
  let phrased_by = 'template';
  let finalReasons: { en: string; bn: string; cites: string[]; key?: string; points?: number }[] = reasons;

  if (opts.ai) {
    const facts = {
      verdict: { id: 'F1', value: VERDICT_TEXT[j.final_verdict].en },
      band: { id: 'F2', low_pct: j.band.low, high_pct: j.band.high },
      cause: { id: 'F3', value: CAUSES[cause].en },
      checked_share_pct: { id: 'F4', value: checkedShare },
      rules: j.rules.filter((r) => r.fired).map((r, i) => ({ id: `R${i + 1}`, rule: r.condition_en, measured: r.value_text, points: r.points })),
      conditions: conds.map((c, i) => ({ id: `C${i + 1}`, text: c.en })),
      recovery_goals: recoveryPlan(cause, f).map((p, i) => ({ id: `G${i + 1}`, text: p.en })),
      evidence: ev.map((e) => ({ id: e.eid, label: e.label, text: e.claim_text })),
    };
    const factText = JSON.stringify(facts);
    const allowed = [...extractNumbers(factText.replace(/"id":"[A-Z]+\d+"/g, '')), j.band.low, j.band.high, checkedShare];
    const knownIds = new Set(['F1', 'F2', 'F3', 'F4', ...facts.rules.map((r) => r.id), ...facts.conditions.map((c) => c.id), ...facts.recovery_goals.map((g) => g.id), ...ev.map((e) => e.eid)]);
    const r = await callJson<Phrase>({
      task: 'phrase_file', system: PROMPTS.phrase, user: redact(factText, names).text, schema: PhraseSchema,
      fallback: () => ({ summary_en: tmpl.en, summary_bn: tmpl.bn, reasons: reasons.map((x) => ({ en: x.en, bn: x.bn, cites: x.cites })) as Phrase['reasons'] }),
      actor: opts.actor, application: app._id,
      extraCheck: (d) => {
        const texts = [d.summary_en, d.summary_bn, ...d.reasons.flatMap((x) => [x.en, x.bn])];
        const probs = texts.flatMap((t) => validateText(t, allowed).problems);
        for (const x of d.reasons) probs.push(...validateCitations(x.cites, knownIds).problems);
        return probs.length ? probs.slice(0, 4).join('; ') : null;
      },
    });
    if (r.mode === 'ai') {
      text_en = r.data.summary_en;
      text_bn = r.data.summary_bn;
      finalReasons = r.data.reasons.map((x, i) => ({ ...x, cites: x.cites.filter((c) => c.startsWith('E')).length ? x.cites.filter((c) => c.startsWith('E')) : reasons[i]?.cites || [], key: reasons[i]?.key }));
      generated_by = 'ai_phrased';
      phrased_by = 'ai';
    } else phrased_by = 'demo_fallback';
  }

  const contrib = model ? contributions(model, featureVector(f)).slice(0, 6) : null;
  const last = (await Verdict.findOne({ application: app._id }).sort({ version: -1 }).lean()) as Lean;
  const verdict = await Verdict.create({
    application: app._id,
    version: (last?.version || 0) + 1,
    rules_verdict: j.rules_verdict,
    rules_points_json: j.rules,
    rules_total: j.rules_total,
    model_probability: j.model_probability,
    model_verdict: j.model_verdict,
    conformal_set: j.conformal_set || [],
    final_verdict: j.final_verdict,
    band_low: j.band.low,
    band_high: j.band.high,
    coverage_pct: f.coverage,
    cause,
    reasons_json: finalReasons,
    recovery_plan_json: recoveryPlan(cause, f),
    conditions_json: conds,
    counterfactuals_json: cfs,
    tranche_plan_json: tranches,
    watch_list_json: watchList(f, cause),
    cannot_tell_json: cannotTell(f, stated),
    refinance_json: refinanceFit(app, stated),
    features_json: { ...f, monthly: f.monthly, band_widened: j.band.widened, checked_share: checkedShare, checks },
    model_contributions_json: contrib,
    text_bn,
    text_en,
    generated_by,
    phrased_by,
    disagreement_flag: j.disagreement,
    disagreement_text: j.disagreement_en ? JSON.stringify({ en: j.disagreement_en, bn: j.disagreement_bn }) : null,
    verdict_source: j.source,
  });
  await EvidenceItem.deleteMany({ application: app._id });
  await EvidenceItem.insertMany(ev.map((e) => ({ ...e, application: app._id })));
  await Finding.deleteMany({ application: app._id });
  if (findings.length) await Finding.insertMany(findings.map((x) => ({ ...x, application: app._id })));
  await Application.updateOne({ _id: app._id }, { current_verdict: verdict._id, missing });
  await AuditLog.create({
    actor: opts.actor || 'system', action: j.source === 'model_hybrid' ? 'model:verdict' : 'rules:verdict', application: app._id,
    redacted_payload_json: { features: Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'monthly')), reason: opts.reason },
    output_json: { rules_total: j.rules_total, rules_verdict: j.rules_verdict, model_probability: j.model_probability, conformal_set: j.conformal_set, final: j.final_verdict, band: j.band },
    mode: j.source === 'model_hybrid' ? 'model' : 'rules',
  });
  findings = findings.slice();
  return verdict;
}
