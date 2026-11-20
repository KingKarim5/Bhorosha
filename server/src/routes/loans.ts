import { Router, Request } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { requireRole } from '../auth';
import { Application, Shop, Decision, LoanContract, LoanAccount, Payment, AuditLog } from '../models';
import { recompute } from '../services/casefile';
import { getSim } from '../services/watchman';
import { checkLimits, checkRateSetup, feeFigures, getTerms, replaceContract, confirmContract, earlySettlementQuote, ingestWebhook, signedBody, resolveReview, openLoanAccount, PaymentEvent } from '../services/loan';
import { nextOpen, Installment, signPayload, earlyPayBy } from '../lib/loanTerms';
import { addMonths, monthKey } from '../lib/util';
import { ownedApp, lenderShopIds } from '../tenancy';

// Loan terms and repayments (v3): contract, limits, counter-offer, pricing, fees, schedule, payments.
// Every route works on the logged-in lender's own cases and loans only.
type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const r = Router();
const lender = requireRole('lender');

r.param('id', async (req, res, next, id) => {
  if (!req.path.startsWith('/cases/')) return next();
  if (!req.user || req.user.role !== 'lender' || !(await ownedApp(req.user.id, String(id)))) return res.status(404).json({ error: 'case not found' });
  next();
});

/** Everything the case page shows about the loan's terms and repayments. */
r.get('/cases/:id/loan', lender, async (req, res) => {
  const app = (await Application.findById(req.params.id).lean()) as Lean;
  const shop = (await Shop.findById(app.shop).select('funded').lean()) as Lean;
  const t = await getTerms(req.user!.id);
  const contract = await LoanContract.findOne({ application: app._id }).sort({ createdAt: -1 }).lean();
  const d = (await Decision.findOne({ application: app._id }).sort({ createdAt: -1 }).lean()) as Lean;
  const account = (await LoanAccount.findOne({ application: app._id }).lean()) as Lean;
  const payments = await Payment.find({ application: app._id }).sort({ received_at: -1 }).limit(50).lean();
  const tenor = Math.min(app.tenor_months, t.max_tenor_months);
  res.json({
    terms: t, contract, limits: checkLimits(app.loan_ask_bdt, app.tenor_months, t), rate: checkRateSetup(t.borrower_rate_pct, tenor, t),
    counter_offer: d?.counter_offer || null, pricing: d?.pricing || null,
    fee_split: d?.fee_split || { figures: feeFigures(Math.min(app.loan_ask_bdt, t.max_principal_bdt), tenor, t), text_en: null, text_bn: null, by: null },
    account, payments,
    can_release: !shop?.funded && !account && d?.decision === 'approved_with_conditions',
    release_bdt: d?.decision === 'approved_with_conditions' ? d.first_tranche_bdt || app.loan_ask_bdt : null,
  });
});

/**
 * The lender releases the funds of an AI-approved loan through the licensed partner (simulated).
 * The first tranche (or the whole loan) becomes a repayment account, priced as the Pricing agent set it.
 */
r.post('/cases/:id/fund', lender, async (req, res) => {
  const app = (await Application.findById(req.params.id).lean()) as Lean;
  const shop = (await Shop.findById(app.shop).lean()) as Lean;
  const d = (await Decision.findOne({ application: app._id }).sort({ createdAt: -1 }).lean()) as Lean;
  if (d?.decision !== 'approved_with_conditions') return res.status(400).json({ error: 'Only a loan the AI approved can be released.' });
  if (shop.funded || (await LoanAccount.exists({ application: app._id }))) return res.status(400).json({ error: 'This loan has already been released.' });
  const t = await getTerms(req.user!.id);
  const sim = await getSim(req.user!.id);
  const principal = d.first_tranche_bdt || app.loan_ask_bdt;
  const acct = await openLoanAccount(app, shop, {
    principal, tenor: app.tenor_months, ratePct: t.borrower_rate_pct, rebatePct: d.pricing?.rebate_pct ?? t.rebate_default_pct, penaltyPts: d.pricing?.penalty_pts ?? t.penalty_default_pts,
    firstDue: `${addMonths(monthKey(new Date(sim.day + 'T00:00:00Z')), 1)}-10`,
  });
  await Shop.updateOne({ _id: shop._id }, { funded: true });
  await Application.updateOne({ _id: app._id }, { status: 'funded' });
  await AuditLog.create({ actor: req.user!.email, lender: req.user!.id, action: 'loan:release', application: app._id, redacted_payload_json: { principal_bdt: principal }, output_json: { summary: `Released Tk ${principal.toLocaleString('en-IN')} through the licensed partner (simulated); repayment account ${acct.ref} opened.` }, mode: 'human' });
  res.json({ ok: true, ref: acct.ref, principal_bdt: principal });
});

r.post('/cases/:id/contract', lender, async (req, res) => {
  const b = z.object({ text: z.string().trim().min(40, 'Paste the full contract text.').max(20000) }).parse(req.body);
  await replaceContract(req.params.id, b.text, 'uploaded', req.user!.email);
  const v = await recompute(req.params.id, { actor: req.user!.email, reason: 'contract uploaded' });
  res.json({ ok: true, version: v.version });
});

r.post('/cases/:id/contract/confirm', lender, async (req, res) => {
  const b = z.object({ rebate_pct: z.coerce.number().min(0).max(100), penalty_pts: z.coerce.number().min(0).max(20) }).parse(req.body);
  await confirmContract(req.params.id, req.user!.email, b);
  const v = await recompute(req.params.id, { actor: req.user!.email, reason: 'lender confirmed the contract terms' });
  res.json({ ok: true, version: v.version });
});

r.post('/cases/:id/settlement-quote', lender, async (req, res) => {
  const sim = await getSim(req.user!.id);
  res.json(await earlySettlementQuote(req.params.id, sim.day!, { useAi: true, actor: req.user!.email }));
});

/** Repayments page: this lender's loans, incoming payments, and its review queue. */
r.get('/repayments', lender, async (req, res) => {
  const me = req.user!.id;
  const own = await lenderShopIds(me);
  const loans = (await LoanAccount.find({ shop: { $in: own } }).lean()) as Lean[];
  const shops = (await Shop.find({ _id: { $in: own } }).select('label segment').lean()) as Lean[];
  const sim = await getSim(me);
  const terms = await getTerms(me);
  const rows = loans.map((l) => {
    const s = l.schedule as Installment[];
    const next = nextOpen(s);
    const save = next && terms.early_pay_discount_pct > 0 && next.paid_bdt === 0 && !next.discount_bdt ? Math.round((next.interest_bdt * terms.early_pay_discount_pct) / 100) : 0;
    const early = next && save > 0 ? { pay_by: earlyPayBy(next.due_date, terms), pay_bdt: next.amount_bdt - save, save_bdt: save } : null;
    const overdue = s.filter((x) => x.due_date < sim.day! && x.paid_bdt < x.amount_bdt).reduce((a, x) => a + x.amount_bdt - x.paid_bdt, 0);
    return {
      _id: l._id, ref: l.ref, application: l.application, shop: shops.find((x) => String(x._id) === String(l.shop))?.label, payer_label: l.payer_label,
      principal_bdt: l.principal_bdt, annual_rate_pct: l.annual_rate_pct, tenor_months: l.tenor_months, rebate_pct: l.rebate_pct, penalty_pts: l.penalty_pts, status: l.status,
      paid_bdt: s.reduce((a, x) => a + x.paid_bdt, 0), total_bdt: s.reduce((a, x) => a + x.amount_bdt, 0), next_due: next, overdue_bdt: overdue, schedule: s, early,
    };
  });
  const payments = (await Payment.find({ lender: me }).sort({ received_at: -1, createdAt: -1 }).limit(120).lean()) as Lean[];
  const withShop: Lean[] = payments.map((p) => ({ ...p, shop_label: shops.find((x) => String(x._id) === String(p.shop))?.label || null, loan_ref: loans.find((l) => String(l._id) === String(p.loan))?.ref || null }));
  res.json({ day: sim.day, early_policy: { pct: terms.early_pay_discount_pct, days: terms.early_pay_min_days }, loans: rows, payments: withShop.filter((p) => p.status !== 'review'), review: withShop.filter((p) => p.status === 'review') });
});

r.post('/payments/:pid/review', lender, async (req, res) => {
  const b = z.object({ action: z.enum(['apply', 'reject']), loan_ref: z.string().trim().max(20).optional() }).parse(req.body);
  res.json(await resolveReview(req.user!.id, req.params.pid, b.action, b.loan_ref || undefined, req.user!.email, true));
});

/** Test console: build a payment, sign it like bKash or a bank would, and send it through the same webhook path. */
r.post('/payments/test', lender, async (req, res) => {
  const b = z.object({
    channel: z.enum(['bkash', 'bank']).default('bkash'),
    amount_bdt: z.coerce.number().min(1, 'Enter an amount above zero.').max(5000000),
    reference: z.string().trim().max(80).optional().default(''),
    payer_label: z.string().trim().max(80).optional().default(''),
    received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    bad_signature: z.boolean().default(false),
  }).parse(req.body);
  const sim = await getSim(req.user!.id);
  const ev: PaymentEvent = { event_id: `test-${crypto.randomBytes(6).toString('hex')}`, channel: b.channel, amount_bdt: b.amount_bdt, received_at: b.received_at || sim.day!, reference: b.reference || null, payer_label: b.payer_label || null };
  const { raw, signature } = signedBody(ev);
  const out = await ingestWebhook(raw, b.bad_signature ? signPayload(raw, 'not-the-secret') : signature, { useAi: true, actor: req.user!.email, timeoutMs: 15000, lenderId: req.user!.id });
  await AuditLog.create({ actor: req.user!.email, lender: req.user!.id, action: 'payment:test_sent', agent: 'Payment matcher', redacted_payload_json: { ...ev, bad_signature: b.bad_signature }, output_json: { ok: out.ok }, mode: 'human' });
  if (!out.ok) return res.status(out.status).json({ error: out.error, event: ev });
  res.json({ event: ev, payment: out.payment, duplicate: out.duplicate });
});

/** Public webhook for bKash or bank payment notifications. Authenticated only by the HMAC-SHA256 signature over the raw body. */
r.post('/payments/webhook', async (req: Request & { rawBody?: string }, res) => {
  const raw = req.rawBody ?? JSON.stringify(req.body ?? {});
  const out = await ingestWebhook(raw, req.header('x-bhorsha-signature') || undefined, { useAi: true, actor: 'webhook', timeoutMs: 15000 });
  if (!out.ok) return res.status(out.status).json({ error: out.error });
  res.json({ ok: true, duplicate: out.duplicate, status: (out.payment as Lean)?.status });
});

export default r;
