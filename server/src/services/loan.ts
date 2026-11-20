import crypto from 'crypto';
import { LoanContract, LoanAccount, Payment, Application, Shop, AuditLog, OwnerMessage, Forecast, Flag } from '../models';
import { callJson, PROMPTS, ContractSchema, TextPairSchema, PricingSchema, PaymentMatchSchema, RepaymentWatchSchema, TextPair, PricingRead, ContractRead, PaymentMatch, RepaymentWatch } from './ai';
import { getActivePolicy } from './policy';
import { redact } from '../lib/redact';
import { validateText, extractNumbers } from '../lib/validate';
import { isPostFestival, windowLift } from '../lib/festivals';
import { config } from '../config';
import { lenderOfApp, lenderShopIds } from '../tenancy';
import {
  TermsPolicy, termsFrom, contractText, readContractRules, validateContract, ContractFields, checkLimits, checkRateSetup, feeSplit, FeeSplit,
  clampPricing, schedule, settlementQuote, SettlementQuote, classifyPayment, applyToSchedule, nextOpen, matchScore, verifySignature, signPayload, lateFee1, Installment,
} from '../lib/loanTerms';

// Loan agents (v3). Each agent: the AI reads, proposes or writes; the code validates, clamps and computes.
// Every agent has a labelled fallback, so the demo never breaks without a key.
//   Contract reader · Counter-offer · Pricing · Fee explainer · Payment matcher · Servicer · Watchman (repayments)

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const INVESTOR_SHARE = 0.25; // investors may fund up to 25% of a loan through the partner's pool (simulation)
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

export async function getTerms(lenderId: unknown): Promise<TermsPolicy> {
  if (!lenderId) return termsFrom(null); // a payment no lender can be found for: default terms only
  return termsFrom((await getActivePolicy(lenderId)) as Partial<TermsPolicy>);
}

async function lenderOfShop(shopId: unknown): Promise<unknown> {
  return ((await Shop.findById(shopId).select('lender').lean()) as Lean | null)?.lender ?? null;
}

export const loanRef = (appId: unknown) => 'LN-' + String(appId).slice(-4).toUpperCase();

async function trace(app: unknown, runId: string | undefined, actor: string, agent: string, step: string, t0: number, summary: string, mode: string, extra: Lean = {}) {
  await AuditLog.create({ actor, action: `agent:${agent}`, agent, step, run_id: runId, application: app, redacted_payload_json: {}, output_json: { summary, ...extra }, mode, latency_ms: Date.now() - t0 });
}

/** Numbers the AI may write: everything in the facts, plus the facts as percentages. */
function allowedFrom(facts: unknown) {
  return extractNumbers(JSON.stringify(facts));
}
function textCheck(allowed: number[]) {
  return (d: TextPair) => {
    const probs = [...validateText(d.text_en, allowed).problems, ...validateText(d.text_bn, allowed).problems];
    return probs.length ? probs.slice(0, 4).join('; ') : null;
  };
}

// =============================================================== 1. Contract reader
export async function ensureContract(app: Lean, shop: Lean, t: TermsPolicy, clauses: { earlyClause?: string; lateClause?: string } = {}) {
  const have = await LoanContract.findOne({ application: app._id }).sort({ createdAt: -1 });
  if (have) return have;
  const text = contractText({
    contractNo: loanRef(app._id), borrower: shop.owner_label || shop.label, principal: app.loan_ask_bdt, ratePct: t.borrower_rate_pct, tenor: app.tenor_months,
    rebateBand: [t.rebate_min_pct, t.rebate_max_pct], penaltyBand: [t.penalty_min_pts, t.penalty_max_pts], ...clauses,
  });
  return LoanContract.create({ application: app._id, text, source: 'generated', status: 'unsure' });
}

/** Replace the contract text (lender upload, or a new contract after the owner accepts a counter-offer). It is read again on the next run. */
export async function replaceContract(appId: unknown, text: string, source: 'uploaded' | 'generated', actor: string) {
  await LoanContract.deleteMany({ application: appId });
  const c = await LoanContract.create({ application: appId, text, source, status: 'unsure' });
  await AuditLog.create({ actor, action: 'contract:replace', agent: 'Contract reader', application: appId, redacted_payload_json: { source, chars: text.length }, output_json: {}, mode: 'human' });
  return c;
}

export interface ContractGate {
  ok: boolean;
  en: string;
  bn: string;
  doc: Lean;
}

/** Reads the contract once (again only when its text changes). Unclear clauses or failed code checks hold the case until the lender confirms. */
export async function readContract(app: Lean, shop: Lean, t: TermsPolicy, o: { useAi: boolean; actor: string; runId?: string }): Promise<ContractGate> {
  const c = await ensureContract(app, shop, t);
  if (!c.read_by) {
    const t0 = Date.now();
    const rules = readContractRules(c.text || '');
    let fields: ContractFields = rules.fields;
    let unclear = rules.unclear;
    let confidence = rules.confidence;
    let mode = 'demo_fallback';
    if (o.useAi) {
      const r = await callJson<ContractRead>({
        task: 'contract_read', system: PROMPTS.contract, user: redact(c.text || '', [shop.owner_label, shop.label].filter(Boolean)).text, schema: ContractSchema,
        fallback: () => ({ ...rules.fields, unclear: rules.unclear, confidence: rules.confidence }) as ContractRead,
        actor: o.actor, application: app._id, agent: 'Contract reader', run_id: o.runId, timeoutMs: 15000,
      });
      mode = r.mode;
      if (r.mode === 'ai') {
        fields = { principal_bdt: r.data.principal_bdt, annual_rate_pct: r.data.annual_rate_pct, tenor_months: r.data.tenor_months, early_clause: r.data.early_clause, late_clause: r.data.late_clause, early_rebate_pct: r.data.early_rebate_pct, late_penalty_pts: r.data.late_penalty_pts };
        unclear = r.data.unclear.map((u) => ({ clause: u.clause, why_en: u.why_en, why_bn: u.why_bn || u.why_en }));
        confidence = r.data.confidence;
        // the code still flags vague wording the model missed
        for (const u of rules.unclear) if (!unclear.some((x) => x.clause === u.clause)) unclear.push(u);
      }
    }
    const problems = validateContract(fields, app as { loan_ask_bdt: number; tenor_months: number }, t);
    if (confidence < 0.7) unclear.push({ clause: '(whole contract)', why_en: `Reading confidence is ${Math.round(confidence * 100)}%, below 70%.`, why_bn: `পড়ার আস্থা ${Math.round(confidence * 100)}%, ৭০%-এর কম।` });
    c.set({ extracted: fields, unclear, problems, confidence, read_by: mode, status: problems.length ? 'invalid' : unclear.length ? 'unsure' : 'clear' });
    await c.save();
    await trace(app._id, o.runId, o.actor, 'Contract reader', 'read the loan contract', t0,
      `Principal ${fields.principal_bdt != null ? 'Tk ' + fmt(fields.principal_bdt) : 'unread'}, rate ${fields.annual_rate_pct ?? '?'}%, tenor ${fields.tenor_months ?? '?'} months; ${unclear.length} unclear clause(s); ${problems.length} problem(s) from the code checks. Status: ${c.status}.`, mode);
  }
  const doc = c.toObject() as Lean;
  if (c.status === 'clear') return { ok: true, en: 'The loan contract was read and every term is clear.', bn: 'ঋণ চুক্তি পড়া হয়েছে, সব শর্ত পরিষ্কার।', doc };
  if (c.status === 'confirmed') return { ok: true, en: `The lender confirmed the contract terms (${c.confirmed_by}).`, bn: `ঋণদাতা চুক্তির শর্ত নিশ্চিত করেছেন।`, doc };
  if (c.status === 'invalid') return { ok: false, en: `The contract does not pass the checks: ${(c.problems as Lean[]).map((p) => p.en).join(' ')}`, bn: `চুক্তি যাচাইয়ে আটকেছে: ${(c.problems as Lean[]).map((p) => p.bn).join(' ')}`, doc };
  return { ok: false, en: `The contract reader is unsure about: ${(c.unclear as Lean[]).map((u) => u.why_en).join(' ')} Held until the lender confirms the terms.`, bn: `চুক্তির এই অংশ নিয়ে নিশ্চিত নয়: ${(c.unclear as Lean[]).map((u) => u.why_bn).join(' ')} ঋণদাতা শর্ত নিশ্চিত না করা পর্যন্ত স্থগিত।`, doc };
}

/** The lender settles the unclear clauses: the figures they give replace the vague wording, and the contract counts as confirmed. */
export async function confirmContract(appId: unknown, actor: string, terms: { rebate_pct: number; penalty_pts: number }) {
  const c = await LoanContract.findOne({ application: appId }).sort({ createdAt: -1 });
  if (!c) throw new Error('no contract on this case');
  if ((c.problems as Lean[] | undefined)?.length) throw new Error('This contract fails the code checks; upload a corrected contract instead of confirming it.');
  const t = await getTerms(await lenderOfApp(appId));
  const p = clampPricing(terms.rebate_pct, terms.penalty_pts, t);
  c.set({ status: 'confirmed', confirmed_by: actor, confirmed_at: new Date(), extracted: { ...(c.extracted as Lean), early_rebate_pct: p.rebate_pct, late_penalty_pts: p.penalty_pts } });
  await c.save();
  await AuditLog.create({ actor, action: 'contract:confirm', agent: 'Contract reader', application: appId, redacted_payload_json: terms, output_json: { ...p }, mode: 'human' });
  return c;
}

// =============================================================== 2. Counter-offer
export async function writeCounterOffer(app: Lean, t: TermsPolicy, offer: { amount_bdt: number; tenor_months: number; installment_bdt: number } | null, problems: { en: string; bn: string }[], o: { useAi: boolean; actor: string; runId?: string }) {
  const t0 = Date.now();
  const facts = {
    request: { amount_bdt: app.loan_ask_bdt, tenor_months: app.tenor_months },
    limits: { max_amount_bdt: t.max_principal_bdt, max_tenor_months: t.max_tenor_months },
    problems: problems.map((p) => p.en),
    counter_offer: offer ? { amount_bdt: offer.amount_bdt, tenor_months: offer.tenor_months, monthly_instalment_bdt: offer.installment_bdt, rate_pct: t.borrower_rate_pct } : null,
  };
  const fallback = (): TextPair => offer
    ? {
      text_en: `Your request for Tk ${fmt(app.loan_ask_bdt)} over ${app.tenor_months} months is outside the lender's limits (up to Tk ${fmt(t.max_principal_bdt)} and ${t.max_tenor_months} months). The lender can offer Tk ${fmt(offer.amount_bdt)} over ${offer.tenor_months} months, about Tk ${fmt(offer.installment_bdt)} a month. You can accept it on your page.`,
      text_bn: `আপনার ${fmt(app.loan_ask_bdt)} টাকা, ${app.tenor_months} মাসের আবেদন ঋণদাতার সীমার বাইরে (সর্বোচ্চ ${fmt(t.max_principal_bdt)} টাকা ও ${t.max_tenor_months} মাস)। ঋণদাতা ${offer.tenor_months} মাসে ${fmt(offer.amount_bdt)} টাকা দিতে পারেন, মাসে প্রায় ${fmt(offer.installment_bdt)} টাকা কিস্তি। আপনার পাতায় এটি গ্রহণ করতে পারেন।`,
    }
    : {
      text_en: `Your request for Tk ${fmt(app.loan_ask_bdt)} over ${app.tenor_months} months is outside the lender's limits, and no smaller amount inside them fits your current sales. Building more months of steady sales would open an offer.`,
      text_bn: `আপনার ${fmt(app.loan_ask_bdt)} টাকা, ${app.tenor_months} মাসের আবেদন ঋণদাতার সীমার বাইরে, এবং সীমার ভেতরে ছোট কোনো অঙ্কও এখনকার বিক্রিতে মেলে না। আরও কয়েক মাস স্থির বিক্রি দেখালে প্রস্তাব দেওয়া যাবে।`,
    };
  let text = fallback();
  let mode = 'demo_fallback';
  if (o.useAi) {
    const r = await callJson<TextPair>({ task: 'counter_offer', system: PROMPTS.counteroffer, user: JSON.stringify(facts), schema: TextPairSchema, fallback, actor: o.actor, application: app._id, agent: 'Counter-offer', run_id: o.runId, extraCheck: textCheck(allowedFrom(facts)), timeoutMs: 15000 });
    text = r.data;
    mode = r.mode;
  }
  await trace(app._id, o.runId, o.actor, 'Counter-offer', 'counter-offer inside the limits', t0, offer ? `Request Tk ${fmt(app.loan_ask_bdt)} / ${app.tenor_months} months is outside the limits. Code clamped the offer to Tk ${fmt(offer.amount_bdt)} / ${offer.tenor_months} months (Tk ${fmt(offer.installment_bdt)} a month), the largest amount the rules still judge viable.` : 'Outside the limits; no amount inside them passes the rules, so no counter-offer.', mode);
  return offer ? { ...offer, ...text, by: mode, status: 'offered' } : { amount_bdt: null, tenor_months: null, ...text, by: mode, status: 'none' };
}

// =============================================================== 3. Pricing
export async function priceLoan(app: Lean, contract: Lean, history: { supplier_on_time: number; lateness_trend: number; months_history: number; late_repayments?: number }, t: TermsPolicy, o: { useAi: boolean; actor: string; runId?: string }) {
  const t0 = Date.now();
  const x = (contract?.extracted || {}) as Partial<ContractFields>;
  const facts = {
    contract: { early_clause: x.early_clause ?? null, late_clause: x.late_clause ?? null, early_rebate_pct: x.early_rebate_pct ?? null, late_penalty_pts: x.late_penalty_pts ?? null },
    bands: { rebate_pct: { default: t.rebate_default_pct, min: t.rebate_min_pct, max: t.rebate_max_pct }, penalty_pts: { default: t.penalty_default_pts, min: t.penalty_min_pts, max: t.penalty_max_pts } },
    history: { supplier_on_time_pct: Math.round(history.supplier_on_time * 100), lateness_trend_days: Math.round(history.lateness_trend * 10) / 10, months_history: history.months_history, late_repayments: history.late_repayments ?? 0 },
  };
  const fallback = (): PricingRead => {
    let rb = x.early_rebate_pct ?? t.rebate_default_pct;
    let pn = x.late_penalty_pts ?? t.penalty_default_pts;
    const why: string[] = [];
    if (x.early_rebate_pct == null && history.supplier_on_time >= 0.9) { rb += 5; why.push('suppliers paid on time'); }
    if (x.early_rebate_pct == null && history.supplier_on_time < 0.7) { rb -= 5; why.push('supplier payments often late'); }
    if (x.late_penalty_pts == null && (history.lateness_trend > 3 || (history.late_repayments ?? 0) >= 2)) { pn += 1; why.push('payments getting later'); }
    return {
      rebate_pct: rb, penalty_pts: pn,
      reason_en: x.early_rebate_pct != null || x.late_penalty_pts != null ? 'Taken from the contract.' : why.length ? `Default adjusted: ${why.join(', ')}.` : 'Lender defaults: nothing in the history moves them.',
      reason_bn: x.early_rebate_pct != null || x.late_penalty_pts != null ? 'চুক্তি থেকে নেওয়া।' : why.length ? 'ইতিহাস দেখে ডিফল্ট সামান্য বদলানো হয়েছে।' : 'ঋণদাতার ডিফল্ট: ইতিহাসে বদলানোর কারণ নেই।',
    };
  };
  let prop = fallback();
  let mode = 'demo_fallback';
  if (o.useAi) {
    const r = await callJson<PricingRead>({ task: 'pricing', system: PROMPTS.pricing, user: JSON.stringify(facts), schema: PricingSchema, fallback, actor: o.actor, application: app._id, agent: 'Pricing', run_id: o.runId, timeoutMs: 15000 });
    prop = r.data;
    mode = r.mode;
  }
  // the contract's own figures win over any proposal
  const rebate = x.early_rebate_pct ?? prop.rebate_pct;
  const penalty = x.late_penalty_pts ?? prop.penalty_pts;
  const p = clampPricing(rebate, penalty, t);
  await trace(app._id, o.runId, o.actor, 'Pricing', 'early rebate and late penalty', t0, `Proposed rebate ${prop.rebate_pct}% and penalty ${prop.penalty_pts} points; after the contract and the lender's bands: rebate ${p.rebate_pct}% of remaining interest, penalty +${p.penalty_pts} points a year${p.clamped.length ? ` (clamped: ${p.clamped.join('; ')})` : ''}.`, mode);
  return { rebate_pct: p.rebate_pct, penalty_pts: p.penalty_pts, proposed: { rebate_pct: prop.rebate_pct, penalty_pts: prop.penalty_pts }, clamped: p.clamped, reason_en: prop.reason_en, reason_bn: prop.reason_bn, by: mode };
}

// =============================================================== 4. Fee and rate explainer
export function feeFigures(principal: number, tenor: number, t: TermsPolicy): FeeSplit {
  return feeSplit(principal, tenor, t.borrower_rate_pct, INVESTOR_SHARE, t);
}

export async function explainFees(app: Lean, principal: number, tenor: number, t: TermsPolicy, o: { useAi: boolean; actor: string; runId?: string }) {
  const t0 = Date.now();
  const f = feeFigures(principal, tenor, t);
  const facts = {
    loan_bdt: f.principal_bdt, tenor_months: f.tenor_months, borrower_rate_pct: f.borrower_rate_pct, bank_rate_pct: t.bank_rate_pct, investor_rate_pct: f.investor_rate_pct,
    bhorsha_share_of_interest_pct: f.fee_pct, total_interest_bdt: f.total_interest_bdt, investors_fund_pct: f.investor_share_pct,
    investors_get_bdt: f.investor_bdt, bhorsha_gets_bdt: f.bhorsha_bdt, lender_keeps_bdt: f.lender_bdt, per_100_interest: f.per_100,
  };
  const fallback = (): TextPair => ({
    text_en: `The borrower pays ${f.borrower_rate_pct}% a year: about Tk ${fmt(f.total_interest_bdt)} of interest on Tk ${fmt(f.principal_bdt)} over ${f.tenor_months} months. Investors who fund ${f.investor_share_pct}% of the loan earn ${f.investor_rate_pct}% (bank rate ${t.bank_rate_pct}% plus 0.25%), about Tk ${fmt(f.investor_bdt)}. Bhorsha keeps ${f.fee_pct}% of the interest, Tk ${fmt(f.bhorsha_bdt)}. The lender keeps the rest, Tk ${fmt(f.lender_bdt)}.`,
    text_bn: `ঋণগ্রহীতা বছরে ${f.borrower_rate_pct}% সুদ দেন: ${f.tenor_months} মাসে ${fmt(f.principal_bdt)} টাকায় প্রায় ${fmt(f.total_interest_bdt)} টাকা সুদ। ঋণের ${f.investor_share_pct}% দেওয়া বিনিয়োগকারীরা পান ${f.investor_rate_pct}% (ব্যাংক রেট ${t.bank_rate_pct}% যোগ ০.২৫%), প্রায় ${fmt(f.investor_bdt)} টাকা। ভরসা রাখে সুদের ${f.fee_pct}%, ${fmt(f.bhorsha_bdt)} টাকা। বাকি ${fmt(f.lender_bdt)} টাকা ঋণদাতার।`,
  });
  let text = fallback();
  let mode = 'demo_fallback';
  if (o.useAi && f.rate_check.ok) {
    const r = await callJson<TextPair>({ task: 'fee_explain', system: PROMPTS.feeexplain, user: JSON.stringify(facts), schema: TextPairSchema, fallback, actor: o.actor, application: app._id, agent: 'Fee explainer', run_id: o.runId, extraCheck: textCheck([...allowedFrom(facts), 0.25]), timeoutMs: 15000 });
    text = r.data;
    mode = r.mode;
  }
  await trace(app._id, o.runId, o.actor, 'Fee explainer', 'interest split', t0, f.rate_check.ok ? `Of every Tk 100 of interest: investors Tk ${f.per_100.investor}, Bhorsha Tk ${f.per_100.bhorsha}, lender Tk ${f.per_100.lender}.` : `Rejected: ${f.rate_check.en}`, mode);
  return { figures: f, ...text, by: mode };
}

// =============================================================== 6. Servicer (receipts, quotes, late notices)
type ServiceKind = 'receipt' | 'settlement_quote' | 'late_notice';
export async function servicerMessage(kind: ServiceKind, facts: Record<string, unknown>, fallback: () => TextPair, o: { useAi: boolean; actor: string; application?: unknown; timeoutMs?: number; maxAttempts?: number }) {
  if (!o.useAi) return { ...fallback(), by: 'demo_fallback' };
  const r = await callJson<TextPair>({ task: `servicer_${kind}`, system: PROMPTS.servicer, user: JSON.stringify({ kind, ...facts }), schema: TextPairSchema, fallback, actor: o.actor, application: o.application, agent: 'Servicer', extraCheck: textCheck(allowedFrom(facts)), timeoutMs: o.timeoutMs ?? 8000, maxAttempts: o.maxAttempts ?? 1 });
  return { ...r.data, by: r.mode };
}

export async function earlySettlementQuote(appId: unknown, asOf: string, o: { useAi: boolean; actor: string }) {
  const loan = await LoanAccount.findOne({ application: appId });
  if (!loan) throw new Error('This loan has no repayment account yet.');
  const q: SettlementQuote = settlementQuote(loan.schedule as Installment[], loan.annual_rate_pct!, loan.rebate_pct!, loan.penalty_pts!, asOf);
  const facts = { loan_ref: loan.ref, valid_on: asOf, outstanding_principal_bdt: q.outstanding_principal_bdt, interest_accrued_bdt: q.interest_accrued_bdt, rebate_pct: loan.rebate_pct, rebate_bdt: q.rebate_bdt, overdue_bdt: q.overdue_bdt, late_fee_bdt: q.late_fee_bdt, total_to_settle_bdt: q.total_to_settle_bdt };
  const msg = await servicerMessage('settlement_quote', facts, () => ({
    text_en: `To settle loan ${loan.ref} in full on ${asOf}: Tk ${fmt(q.total_to_settle_bdt)}. That is Tk ${fmt(q.outstanding_principal_bdt)} principal, Tk ${fmt(q.interest_accrued_bdt)} interest so far${q.overdue_bdt ? `, Tk ${fmt(q.overdue_bdt)} overdue and Tk ${fmt(q.late_fee_bdt)} late fee` : ''}. Settling early saves Tk ${fmt(q.rebate_bdt)} (${loan.rebate_pct}% rebate) on the interest still to come.`,
    text_bn: `${asOf} তারিখে ঋণ ${loan.ref} পুরো শোধ করতে: ${fmt(q.total_to_settle_bdt)} টাকা। এর মধ্যে মূল ${fmt(q.outstanding_principal_bdt)} টাকা, এ পর্যন্ত সুদ ${fmt(q.interest_accrued_bdt)} টাকা${q.overdue_bdt ? `, বকেয়া ${fmt(q.overdue_bdt)} টাকা ও দেরির ফি ${fmt(q.late_fee_bdt)} টাকা` : ''}। আগে শোধ করলে বাকি সুদে ${fmt(q.rebate_bdt)} টাকা (${loan.rebate_pct}% ছাড়) বাঁচবে।`,
  }), { ...o, application: appId, timeoutMs: 15000, maxAttempts: 2 });
  await OwnerMessage.create({ shop: loan.shop, application: appId, kind: 'settlement_quote', text_en: msg.text_en, text_bn: msg.text_bn, offer: { type: 'settlement_quote', ...q, by: msg.by } });
  await AuditLog.create({ actor: o.actor, action: 'servicer:settlement_quote', agent: 'Servicer', application: appId, redacted_payload_json: { as_of: asOf }, output_json: { ...q }, mode: msg.by });
  return { quote: q, message: msg };
}

// =============================================================== loan accounts
export async function openLoanAccount(app: Lean, shop: Lean, o: { principal: number; tenor: number; ratePct: number; rebatePct: number; penaltyPts: number; firstDue: string }) {
  await LoanAccount.deleteMany({ application: app._id });
  return LoanAccount.create({
    application: app._id, shop: shop._id, ref: loanRef(app._id), payer_label: `bKash wallet of ${shop.label}`,
    principal_bdt: o.principal, annual_rate_pct: o.ratePct, tenor_months: o.tenor, start_date: new Date(o.firstDue + 'T00:00:00Z'),
    schedule: schedule(o.principal, o.ratePct, o.tenor, o.firstDue), rebate_pct: o.rebatePct, penalty_pts: o.penaltyPts, status: 'active',
  });
}

// =============================================================== 5. Payment matcher + webhook
export function webhookSecret() {
  return process.env.PAYMENT_WEBHOOK_SECRET || crypto.createHmac('sha256', config.jwtSecret).update('bhorsha-payment-webhook').digest('hex');
}

export interface PaymentEvent {
  event_id: string;
  channel: 'bkash' | 'bank';
  amount_bdt: number;
  received_at: string; // ISO date or datetime
  reference?: string | null;
  payer_label?: string | null;
}

export function signedBody(ev: PaymentEvent) {
  const raw = JSON.stringify(ev);
  return { raw, signature: signPayload(raw, webhookSecret()) };
}

interface IngestOpts {
  useAi: boolean;
  actor: string;
  timeoutMs?: number;
  lenderId?: unknown; // a lender's test console: match only that lender's loans
}

/** Webhook entry: verify the signature over the raw body, then match, classify and apply. */
export async function ingestWebhook(raw: string, signature: string | undefined, o: IngestOpts) {
  if (!verifySignature(raw, signature, webhookSecret())) {
    await AuditLog.create({ actor: 'webhook', action: 'payment:signature_rejected', agent: 'Payment matcher', redacted_payload_json: { chars: raw.length }, output_json: {}, mode: 'rules' });
    return { ok: false as const, status: 401, error: 'Signature check failed: the payment was not accepted.' };
  }
  let ev: PaymentEvent;
  try {
    ev = JSON.parse(raw);
  } catch {
    return { ok: false as const, status: 400, error: 'Body is not JSON.' };
  }
  if (!ev.event_id || !(ev.amount_bdt > 0) || !ev.received_at || !['bkash', 'bank'].includes(ev.channel)) return { ok: false as const, status: 400, error: 'Missing event_id, channel, amount_bdt or received_at.' };
  if (await Payment.exists({ event_id: ev.event_id })) return { ok: true as const, duplicate: true, payment: await Payment.findOne({ event_id: ev.event_id }).lean() };
  const payment = await processPayment(ev, o);
  return { ok: true as const, duplicate: false, payment };
}

async function processPayment(ev: PaymentEvent, o: IngestOpts) {
  const scope = o.lenderId ? { status: 'active', shop: { $in: await lenderShopIds(o.lenderId) } } : { status: 'active' };
  const loans = (await LoanAccount.find(scope).lean()) as Lean[];
  const t0 = Date.now();
  // 1) the reference names a loan: certain
  const refHit = ev.reference ? loans.find((l) => String(ev.reference).toUpperCase().includes(String(l.ref).toUpperCase())) : null;
  let loan: Lean | null = refHit || null;
  let confidence = refHit ? 1 : 0;
  let matchedBy = refHit ? 'reference' : '';
  let reason = refHit ? `Reference ${refHit.ref} quoted.` : '';
  if (!refHit) {
    // 2) no usable reference: the AI weighs payer, amount and timing; the code score is the fallback
    const shops = (await Shop.find({ _id: { $in: loans.map((l) => l.shop) } }).lean()) as Lean[];
    const names = shops.flatMap((s) => [s.label, s.owner_label]).filter(Boolean);
    const cands = loans.map((l) => {
      const due = nextOpen(l.schedule as Installment[]);
      const overdue = (l.schedule as Installment[]).filter((x) => x.due_date < ev.received_at.slice(0, 10)).reduce((a, x) => a + Math.max(0, x.amount_bdt - x.paid_bdt), 0);
      return { ref: l.ref, payer: l.payer_label, next_due_date: due?.due_date ?? null, next_due_bdt: due ? due.amount_bdt - due.paid_bdt : 0, overdue_bdt: overdue };
    });
    const scored = cands.map((c) => ({ c, s: c.next_due_date ? matchScore({ amount_bdt: ev.amount_bdt, received_at: ev.received_at, payer_label: ev.payer_label || '' }, { payer_label: c.payer, due_amount: c.next_due_bdt, due_date: c.next_due_date }) : 0 })).sort((a, b) => b.s - a.s);
    const fallback = (): PaymentMatch => {
      const best = scored[0];
      const second = scored[1]?.s ?? 0;
      const conf = best ? Math.max(0, Math.min(1, best.s - (best.s - second < 0.15 ? 0.2 : 0))) : 0;
      return { loan_ref: best && best.s > 0.3 ? best.c.ref : null, confidence: Math.round(conf * 100) / 100, reason: best ? `Code score: payer, amount and timing give ${best.s}${best.s - second < 0.15 ? '; another loan is close' : ''}.` : 'No candidate loans.' };
    };
    let m = fallback();
    matchedBy = 'demo_fallback';
    if (o.useAi) {
      const body = redact(JSON.stringify({ payment: { amount_bdt: ev.amount_bdt, date: ev.received_at.slice(0, 10), payer: ev.payer_label || null, reference_text: ev.reference || null, channel: ev.channel }, candidates: cands }), names).text;
      const r = await callJson<PaymentMatch>({
        task: 'payment_match', system: PROMPTS.paymatch, user: body, schema: PaymentMatchSchema, fallback, actor: o.actor, agent: 'Payment matcher', timeoutMs: o.timeoutMs ?? 8000, maxAttempts: 1,
        extraCheck: (d) => (d.loan_ref && !cands.some((c) => c.ref === d.loan_ref) ? `unknown loan ${d.loan_ref}` : null),
      });
      m = r.data;
      matchedBy = r.mode;
    }
    loan = m.loan_ref ? loans.find((l) => l.ref === m.loan_ref) || null : null;
    confidence = m.confidence;
    reason = m.reason;
  }
  const lender = loan ? await lenderOfShop(loan.shop) : o.lenderId ?? null;
  const t = await getTerms(lender);
  const base = { event_id: ev.event_id, channel: ev.channel, reference: ev.reference || null, payer_label: ev.payer_label || null, amount_bdt: ev.amount_bdt, received_at: new Date(ev.received_at), signature_ok: true, confidence, matched_by: matchedBy, match_reason: reason, lender };
  if (!loan || confidence < t.match_confidence_min) {
    const p = await Payment.create({ ...base, loan: loan?._id, application: loan?.application, shop: loan?.shop, status: 'review' });
    await AuditLog.create({ actor: o.actor, action: 'payment:review_queue', agent: 'Payment matcher', application: loan?.application, step: 'below confidence threshold', redacted_payload_json: { amount_bdt: ev.amount_bdt }, output_json: { summary: `Confidence ${Math.round(confidence * 100)}% is below ${Math.round(t.match_confidence_min * 100)}%: sent to the lender's review queue, not applied.`, loan: loan?.ref ?? null }, mode: matchedBy === 'ai' ? 'ai' : 'rules', latency_ms: Date.now() - t0 });
    return p.toObject();
  }
  return applyPayment(base, loan, t, o, Date.now() - t0);
}

async function applyPayment(base: Lean, loanLean: Lean, t: TermsPolicy, o: IngestOpts, matchMs = 0) {
  const loan = await LoanAccount.findById(loanLean._id);
  if (!loan) throw new Error('loan not found');
  const sched = loan.schedule as Installment[];
  const open = nextOpen(sched);
  const recIso = new Date(base.received_at).toISOString().slice(0, 10);
  const cls = open ? classifyPayment(open.due_date, recIso, t.grace_days) : { classification: 'early' as const, days_from_due: 0 };
  const applied = applyToSchedule(sched, base.amount_bdt);
  loan.schedule = applied.schedule;
  if (!nextOpen(applied.schedule)) loan.status = 'settled';
  loan.markModified('schedule');
  await loan.save();
  const p = await Payment.create({ ...base, loan: loan._id, application: loan.application, shop: loan.shop, installment_n: applied.first_n, status: 'applied', classification: cls.classification, days_from_due: cls.days_from_due, partial: applied.partial });
  await AuditLog.create({ actor: o.actor, action: 'payment:applied', agent: 'Payment matcher', application: loan.application, step: `${cls.classification} payment`, redacted_payload_json: { amount_bdt: base.amount_bdt }, output_json: { summary: `Tk ${fmt(base.amount_bdt)} matched to ${loan.ref} (${base.matched_by}, ${Math.round(base.confidence * 100)}%), instalment ${applied.first_n}: ${cls.classification.replace('_', ' ')} (${cls.days_from_due} days from due)${applied.partial ? ', partial' : ''}.` }, mode: base.matched_by === 'ai' ? 'ai' : 'rules', latency_ms: matchMs });
  const shop = (await Shop.findById(loan.shop).lean()) as Lean;
  const inst = applied.schedule.find((x) => x.n === applied.first_n);
  // Servicer: receipt (and a late notice when late)
  const still = applied.schedule.reduce((a, x) => a + Math.max(0, x.amount_bdt - x.paid_bdt), 0);
  const next = nextOpen(applied.schedule);
  const factsR = { loan_ref: loan.ref, paid_bdt: base.amount_bdt, paid_on: recIso, instalment_no: applied.first_n, instalment_due_bdt: inst?.amount_bdt ?? 0, instalment_still_due_bdt: inst ? inst.amount_bdt - inst.paid_bdt : 0, loan_still_due_bdt: still, next_due_date: next?.due_date ?? null };
  const receipt = await servicerMessage('receipt', factsR, () => ({
    text_en: `Thank you. We received Tk ${fmt(base.amount_bdt)} on ${recIso} for loan ${loan.ref}, instalment ${applied.first_n}.${inst && inst.amount_bdt > inst.paid_bdt ? ` Tk ${fmt(inst.amount_bdt - inst.paid_bdt)} of this instalment is still due.` : ''} Still to repay in total: Tk ${fmt(still)}.${next ? ` Next due date: ${next.due_date}.` : ' The loan is fully repaid.'}`,
    text_bn: `ধন্যবাদ। ${recIso} তারিখে ঋণ ${loan.ref}-এর ${applied.first_n} নম্বর কিস্তির ${fmt(base.amount_bdt)} টাকা পেয়েছি।${inst && inst.amount_bdt > inst.paid_bdt ? ` এই কিস্তির ${fmt(inst.amount_bdt - inst.paid_bdt)} টাকা এখনো বাকি।` : ''} মোট বাকি: ${fmt(still)} টাকা।${next ? ` পরের কিস্তির তারিখ: ${next.due_date}।` : ' ঋণ পুরো শোধ হয়েছে।'}`,
  }), { useAi: o.useAi, actor: o.actor, application: loan.application, timeoutMs: o.timeoutMs });
  await OwnerMessage.create({ shop: loan.shop, application: loan.application, kind: 'receipt', text_en: receipt.text_en, text_bn: receipt.text_bn, offer: { type: 'receipt', payment: String(p._id), by: receipt.by } });
  // Watchman: is an early or late payment a real warning or a seasonal pattern?
  if (cls.classification !== 'on_time' || applied.partial) {
    const watch = await watchRepayment(p.toObject() as Lean, loan.toObject() as Lean, shop, o);
    p.watch = watch;
    await p.save();
    if (cls.classification === 'late' && inst) {
      const daysLate = cls.days_from_due;
      const overdue = Math.max(0, (inst.amount_bdt - inst.paid_bdt));
      const fee = lateFee1(base.amount_bdt, loan.penalty_pts || t.penalty_default_pts, daysLate);
      const factsL = { loan_ref: loan.ref, instalment_no: inst.n, due_date: inst.due_date, days_late: daysLate, paid_bdt: base.amount_bdt, still_overdue_bdt: overdue, late_fee_bdt: fee, penalty_pts: loan.penalty_pts };
      const notice = await servicerMessage('late_notice', factsL, () => ({
        text_en: `Instalment ${inst.n} of loan ${loan.ref} was due on ${inst.due_date} and arrived ${daysLate} days late. The late fee for those days is Tk ${fmt(fee)}${overdue ? `, and Tk ${fmt(overdue)} is still overdue` : ''}. If this month is hard, talk to your lender: a short date change may be possible.`,
        text_bn: `ঋণ ${loan.ref}-এর ${inst.n} নম্বর কিস্তি ${inst.due_date} তারিখে দেওয়ার কথা ছিল, এসেছে ${daysLate} দিন পরে। এই দিনগুলোর দেরির ফি ${fmt(fee)} টাকা${overdue ? `, আর ${fmt(overdue)} টাকা এখনো বকেয়া` : ''}। এই মাস কঠিন হলে ঋণদাতার সাথে কথা বলুন: তারিখ কিছুটা পেছানো যেতে পারে।`,
      }), { useAi: o.useAi, actor: o.actor, application: loan.application, timeoutMs: o.timeoutMs });
      await OwnerMessage.create({ shop: loan.shop, application: loan.application, kind: 'late_notice', text_en: notice.text_en, text_bn: notice.text_bn, offer: { type: 'late_notice', payment: String(p._id), late_fee_bdt: fee, by: notice.by } });
    }
  }
  return p.toObject();
}

// =============================================================== 7. Watchman update (repayments)
async function watchRepayment(p: Lean, loan: Lean, shop: Lean, o: IngestOpts) {
  const t0 = Date.now();
  const app = (await Application.findById(loan.application).lean()) as Lean;
  const seasonal = !!app?.stated?.seasonal;
  const fc = (await Forecast.findOne({ shop: shop._id }).sort({ createdAt: -1 }).lean()) as Lean;
  const earlier = (await Payment.find({ loan: loan._id, status: 'applied', _id: { $ne: p._id } }).sort({ received_at: -1 }).limit(4).lean()) as Lean[];
  const lateBefore = earlier.filter((x) => x.classification === 'late').length;
  const openFlag = await Flag.exists({ shop: shop._id, severity: { $in: ['watch', 'call'] }, status: { $ne: 'resolved' } });
  const rec = new Date(p.received_at);
  const facts = {
    payment: { timing: p.classification, days_from_due: p.days_from_due, partial: !!p.partial },
    shop: { type: shop.business_type, segment: shop.segment, seasonal_sales: seasonal },
    latest_sales_check: fc ? { period: fc.month, actual_bdt: fc.actual, expected_low_bdt: fc.expected_low, expected_high_bdt: fc.expected_high, below_forecast: !!fc.flagged } : null,
    open_sales_flag: !!openFlag,
    festival: isPostFestival(rec) ? 'just after a festival' : windowLift(rec, 7) > 1.05 ? 'festival rush' : null,
    earlier_repayments: earlier.map((x) => ({ timing: x.classification, days_from_due: x.days_from_due })),
  };
  const fallback = (): RepaymentWatch => {
    if (p.classification === 'early' && !p.partial) return { assessment: 'no_concern', reason_en: 'Paid early: no concern.', reason_bn: 'আগেই দিয়েছেন: চিন্তার কিছু নেই।' };
    const salesDip = !!fc?.flagged || !!openFlag;
    if (seasonal && !salesDip && lateBefore < 2) return { assessment: 'seasonal_pattern', reason_en: 'Late in a lean season for a seasonal shop, with sales inside the forecast band: an expected pattern.', reason_bn: 'মৌসুমি দোকানের মন্দা মৌসুমে দেরি, বিক্রি পূর্বাভাসের সীমার মধ্যে: প্রত্যাশিত ধরন।' };
    if (salesDip || lateBefore >= 1) return { assessment: 'real_warning', reason_en: salesDip ? 'Late together with sales below the forecast: a real warning.' : 'Late again after an earlier late payment: a real warning.', reason_bn: salesDip ? 'দেরির সাথে বিক্রিও পূর্বাভাসের নিচে: আসল সতর্কতা।' : 'আগেও দেরি হয়েছিল, আবার দেরি: আসল সতর্কতা।' };
    return { assessment: 'no_concern', reason_en: 'A single late payment with sales inside the forecast band: noted, no concern yet.', reason_bn: 'একবারের দেরি, বিক্রি পূর্বাভাসের সীমার মধ্যে: লেখা থাকল, এখনো চিন্তার কিছু নেই।' };
  };
  let w = fallback();
  let mode = 'demo_fallback';
  if (o.useAi) {
    const r = await callJson<RepaymentWatch>({ task: 'repayment_watch', system: PROMPTS.repaywatch, user: JSON.stringify(facts), schema: RepaymentWatchSchema, fallback, actor: o.actor, application: loan.application, agent: 'Watchman', timeoutMs: o.timeoutMs ?? 8000, maxAttempts: 1 });
    w = r.data;
    mode = r.mode;
  }
  // code stores the flag and routes it: a real warning goes to the lender's watchlist; a seasonal pattern is only noted
  const routed_to = w.assessment === 'real_warning' ? 'lender watchlist' : 'noted on the loan';
  await AuditLog.create({ actor: o.actor, action: 'watchman:repayment', agent: 'Watchman', application: loan.application, step: `repayment ${p.classification}`, redacted_payload_json: facts, output_json: { summary: `${loan.ref}: ${p.classification} payment (${p.days_from_due} days) → ${w.assessment.replace('_', ' ')}. ${w.reason_en} Routed to the ${routed_to}.` }, mode, latency_ms: Date.now() - t0 });
  return { ...w, by: mode, routed_to };
}

/** Lender review queue: apply a held payment to a chosen loan, or reject it. */
export async function resolveReview(lenderId: unknown, paymentId: string, action: 'apply' | 'reject', loanRefIn: string | undefined, actor: string, useAi: boolean) {
  const p = await Payment.findById(paymentId);
  if (!p || p.status !== 'review' || String(p.lender) !== String(lenderId)) throw new Error('payment is not waiting for your review');
  if (action === 'reject') {
    p.status = 'rejected';
    p.matched_by = 'lender';
    await p.save();
    await AuditLog.create({ actor, action: 'payment:rejected', agent: 'Payment matcher', redacted_payload_json: { payment: paymentId }, output_json: {}, mode: 'human' });
    return p.toObject();
  }
  const own = await lenderShopIds(lenderId);
  const loan = (await LoanAccount.findOne({ ...(loanRefIn ? { ref: loanRefIn } : { _id: p.loan }), shop: { $in: own } }).lean()) as Lean;
  if (!loan) throw new Error('choose one of your loans for this payment');
  const base = { event_id: p.event_id, channel: p.channel, reference: p.reference, payer_label: p.payer_label, amount_bdt: p.amount_bdt, received_at: p.received_at, signature_ok: p.signature_ok, confidence: 1, matched_by: 'lender', lender: await lenderOfShop(loan.shop), match_reason: `Applied by the lender after review (${p.match_reason || 'no reason'}).` };
  await Payment.deleteOne({ _id: p._id });
  const t = await getTerms(await lenderOfShop(loan.shop));
  return applyPayment(base, loan, t, { useAi, actor });
}

export { checkLimits, checkRateSetup };
