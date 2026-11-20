import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth';
import { Application, Shop, Verdict, Decision, Investor, InvestorVerification, Commitment, InvestorUpdate, EvidenceItem, AuditLog } from '../models';
import { User, LoanAccount } from '../models';
import { getTerms } from '../services/loan';
import { investorReturn, investorReceived, investorRatePct, nextOpen, Installment, TermsPolicy, investorCapBdt, investorSharePct } from '../lib/loanTerms';
import { allocate } from '../services/allocator';

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const r = Router();
const inv = requireRole('investor');

export const TYPE_LABEL: Record<string, { en: string; bn: string }> = {
  tea_grocery: { en: 'Tea stall and grocery', bn: 'চায়ের দোকান ও মুদি' },
  knitwear: { en: 'Knitwear unit', bn: 'নিটওয়্যার কারখানা' },
  pharmacy: { en: 'Pharmacy', bn: 'ফার্মেসি' },
  mobile_accessories: { en: 'Mobile accessories shop', bn: 'মোবাইল এক্সেসরিজের দোকান' },
  fish_trader: { en: 'Seasonal fish trader', bn: 'মৌসুমি মাছ ব্যবসায়ী' },
  online_clothing: { en: 'Online clothing seller', bn: 'অনলাইন পোশাক বিক্রেতা' },
  attar_online: { en: 'Attar seller, shop and online', bn: 'আতর বিক্রেতা, দোকান ও অনলাইন' },
  cosmetics: { en: 'Cosmetics shop', bn: 'প্রসাধনীর দোকান' },
  hardware: { en: 'Hardware store', bn: 'হার্ডওয়্যারের দোকান' },
};
const typeLabel = (t: string) => TYPE_LABEL[t] || { en: 'Small business', bn: 'ক্ষুদ্র ব্যবসা' };
const code = (id: unknown) => 'BH-' + String(id).slice(-4).toUpperCase();
const sizeRange = (n: number) =>
  n < 250000 ? { en: 'Under 2.5 lakh BDT', bn: '২.৫ লাখ টাকার কম' } : n < 500000 ? { en: '2.5 to 5 lakh BDT', bn: '২.৫ থেকে ৫ লাখ টাকা' } : n < 1000000 ? { en: '5 to 10 lakh BDT', bn: '৫ থেকে ১০ লাখ টাকা' } : { en: 'Over 10 lakh BDT', bn: '১০ লাখ টাকার বেশি' };

async function me(userId: string) {
  return (await Investor.findOne({ user: userId }).lean()) as Lean;
}

/** Only cases whose latest AI decision is approved_with_conditions can be listed; every lender's loans are included. */
async function listable() {
  const apps = (await Application.find({ status: { $in: ['decided', 'funded'] } }).sort({ createdAt: -1 }).lean()) as Lean[];
  const out: Lean[] = [];
  const termsCache = new Map<string, TermsPolicy>();
  for (const a of apps) {
    const shop = (await Shop.findById(a.shop).lean()) as Lean;
    if (shop?.cohort_flag !== 'demo') continue;
    const lender = (await User.findById(shop.lender).select('org_name').lean()) as Lean | null;
    shop.lender_name = lender?.org_name || 'Licensed lender';
    const key = String(shop.lender);
    if (!termsCache.has(key)) termsCache.set(key, await getTerms(shop.lender));
    shop.terms = termsCache.get(key);
    const v = (await Verdict.findById(a.current_verdict).lean()) as Lean;
    const d = (await Decision.findOne({ application: a._id }).sort({ createdAt: -1 }).lean()) as Lean;
    const listed = d?.decision === 'approved_with_conditions'; // only AI decisions approved with conditions are listed
    out.push({ a, shop, v, d, listed });
  }
  return out;
}

function listingView(x: Lean) {
  // investors together may fund the lender's share for this loan size (by default 100% up to Tk 5,00,000, 75% above)
  const share = investorCapBdt(x.a.loan_ask_bdt, x.shop.terms);
  const rate = investorRatePct(x.shop.terms);
  const example = investorReturn(10000, x.a.tenor_months, rate);
  return {
    investor_share_pct: investorSharePct(x.a.loan_ask_bdt, x.shop.terms), investor_rate_pct: rate, bank_rate_pct: x.shop.terms.bank_rate_pct, borrower_rate_pct: x.shop.terms.borrower_rate_pct,
    example_10k: example, released: !!x.shop.funded, listed_at: x.a.updatedAt,
    id: x.a._id, code: code(x.a._id), lender_name: x.shop.lender_name, type: typeLabel(x.shop.business_type), size: sizeRange(x.a.loan_ask_bdt), loan_bdt: x.a.loan_ask_bdt,
    investor_share_bdt: share, committed_bdt: x.a.funded_bdt || 0, open_bdt: Math.max(0, share - (x.a.funded_bdt || 0)),
    verdict: x.v?.final_verdict, band_low: x.v?.band_low, band_high: x.v?.band_high, checked_share: x.v?.features_json?.checked_share ?? 0,
    runway: (x.v?.features_json?.monthly || []).map((m: Lean) => m.inflow), runway_points: (x.v?.features_json?.monthly || []).map((m: Lean) => ({ month: m.month, value: m.inflow })), listed: x.listed, tenor_months: x.a.tenor_months,
  };
}

r.get('/invest/me', inv, async (req, res) => {
  const i = await me(req.user!.id);
  if (!i) return res.status(404).json({ error: 'investor profile not found' });
  const steps = await InvestorVerification.find({ investor: i._id }).lean();
  res.json({ investor: i, steps });
});

r.post('/invest/verify', inv, async (req, res) => {
  const b = z.object({ step: z.enum(['identity', 'source_of_funds', 'risk_acknowledgement']), dummy_value: z.string().trim().max(60) }).parse(req.body);
  // Simulation only: refuse anything that looks like a real ID number or phone number.
  if (/\d{8,}/.test(b.dummy_value.replace(/\D/g, '')) || /01[3-9]\d{8}/.test(b.dummy_value)) return res.status(400).json({ error: 'This is a simulation. Do not enter a real ID or phone number; use a dummy value such as DUMMY-1234.' });
  const i = await me(req.user!.id);
  await InvestorVerification.findOneAndUpdate({ investor: i._id, step: b.step }, { status: 'done', simulated_at: new Date(), dummy_value: b.dummy_value.slice(0, 20) }, { upsert: true });
  const done = await InvestorVerification.countDocuments({ investor: i._id, status: 'done' });
  const status = done >= 3 ? 'verified' : 'in_progress';
  await Investor.updateOne({ _id: i._id }, { verification_status: status });
  res.json({ verification_status: status, done });
});

r.get('/invest/listings', inv, async (_req, res) => {
  const all = await listable();
  res.json(all.filter((x) => x.listed).map(listingView));
});

r.get('/invest/cases/:id', inv, async (req, res) => {
  const all = await listable();
  const x = all.find((y) => String(y.a._id) === req.params.id);
  if (!x || !x.listed) return res.status(404).json({ error: 'This case is not listed.' });
  const ev = await EvidenceItem.find({ application: x.a._id }).lean();
  const i = await me(req.user!.id);
  const mine = await Commitment.findOne({ investor: i._id, application: x.a._id }).lean();
  const strip = (s: string) => s.replace(/"[^"]*"/g, '"…"'); // owner quotes hidden: they can identify a small shop
  res.json({
    ...listingView(x),
    evidence: ev.filter((e) => !String(e.claim_key).startsWith('doc_') && e.claim_key !== 'note_claim').map((e) => ({ eid: e.eid, label: e.label, en: strip(e.claim_text as string), bn: strip(e.claim_text_bn as string) })),
    reasons: x.v?.reasons_json, conditions: x.v?.conditions_json, cause: x.v?.cause, watch_list: x.v?.watch_list_json, cannot_tell: x.v?.cannot_tell_json,
    my_commitment_bdt: mine?.amount_bdt || 0, committed_total_bdt: i.committed_total_bdt,
    verification_status: i.verification_status,
    fee_split: x.d?.fee_split ? { figures: x.d.fee_split.figures, text_en: x.d.fee_split.text_en, text_bn: x.d.fee_split.text_bn, by: x.d.fee_split.by } : null,
  });
});

r.post('/invest/commit', inv, async (req, res) => {
  const b = z.object({ application: z.string().length(24), amount_bdt: z.coerce.number({ invalid_type_error: 'Enter an amount in taka.' }).int('Enter a whole number of taka.').min(1, 'Enter an amount above zero.').max(10000000, 'Enter Tk 1,00,00,000 or less.') }).parse(req.body);
  const i = await me(req.user!.id);
  if (i.verification_status !== 'verified') return res.status(403).json({ error: 'Finish the simulated verification before committing.' });
  const all = await listable();
  const x = all.find((y) => String(y.a._id) === b.application);
  if (!x || !x.listed) return res.status(400).json({ error: 'This case is not listed (only cases the AI approved with conditions are listed).' });
  const amt = b.amount_bdt;
  // Investors choose freely how much to put in; the only limit is what is still open on the loan.
  // The open check is one atomic conditional update, so two investors cannot overfill a loan.
  const cap = investorCapBdt(x.a.loan_ask_bdt, x.shop.terms);
  const openNow = Math.max(0, cap - (x.a.funded_bdt || 0));
  if (amt < Math.min(1000, openNow)) return res.status(400).json({ error: 'The smallest amount is Tk 1,000 (or exactly what is left, if less).' });
  const appOk = await Application.findOneAndUpdate(
    { _id: x.a._id, $expr: { $lte: [{ $add: [{ $ifNull: ['$funded_bdt', 0] }, amt] }, cap] } },
    { $inc: { funded_bdt: amt } },
    { new: true },
  );
  if (!appOk) {
    const open = Math.max(0, cap - (x.a.funded_bdt || 0));
    return res.status(400).json({ error: open > 0 ? `Only Tk ${open.toLocaleString('en-IN')} is still open on this loan.` : 'This loan is fully funded by investors.' });
  }
  const invOk = await Investor.findOneAndUpdate({ _id: i._id }, { $inc: { committed_total_bdt: amt } }, { new: true });
  await Commitment.findOneAndUpdate({ investor: i._id, application: x.a._id }, { $inc: { amount_bdt: amt }, $setOnInsert: { status: 'active' } }, { upsert: true, new: true });
  await AuditLog.create({ actor: req.user!.email, action: 'invest:commit (simulation)', application: x.a._id, redacted_payload_json: { amount_bdt: amt }, output_json: { open_after: cap - (appOk.funded_bdt || 0) }, mode: 'human' });
  res.json({ ok: true, committed_total_bdt: invOk?.committed_total_bdt ?? 0, case_open_bdt: cap - (appOk.funded_bdt || 0) });
});

r.get('/invest/allocate', inv, async (req, res) => {
  const budget = Math.max(1000, Math.min(1000000, Number(req.query.budget) || 100000));
  const i = await me(req.user!.id);
  const listings = (await listable()).filter((x) => x.listed).map(listingView);
  const mine = await Commitment.find({ investor: i._id }).lean();
  const already = Object.fromEntries(mine.map((c) => [String(c.application), c.amount_bdt as number]));
  const room = budget; // no personal cap: the whole amount can be spread, limited only by what each loan has open
  const out = allocate(budget, listings.map((l) => ({ id: String(l.id), band_low: l.band_low, open_bdt: l.open_bdt })), Number.MAX_SAFE_INTEGER, already);
  res.json({ budget, room_under_total_cap: room, ...out, listings: listings.map((l) => ({ id: l.id, code: l.code, type: l.type, band_low: l.band_low, open_bdt: l.open_bdt })) });
});

r.get('/portfolio', inv, async (req, res) => {
  const i = await me(req.user!.id);
  const commits = (await Commitment.find({ investor: i._id }).lean()) as Lean[];
  const all = await listable();
  const holdings = await Promise.all(
    commits.map(async (c) => {
      const x = all.find((y) => String(y.a._id) === String(c.application));
      const app = x?.a || ((await Application.findById(c.application).lean()) as Lean);
      const shop = x?.shop || ((await Shop.findById(app?.shop).lean()) as Lean);
      const terms = shop?.terms || (await getTerms(shop?.lender));
      const lenderName = shop?.lender_name || ((await User.findById(shop?.lender).select('org_name').lean()) as Lean | null)?.org_name || 'Licensed lender';
      const rate = investorRatePct(terms);
      const tenor = app?.tenor_months || 12;
      const exp = investorReturn(c.amount_bdt, tenor, rate);
      const loan = (await LoanAccount.findOne({ application: c.application }).lean()) as Lean | null;
      const sched = (loan?.schedule || []) as Installment[];
      const got = loan ? investorReceived(c.amount_bdt, rate, sched) : { received_bdt: 0, principal_back_bdt: 0, interest_received_bdt: 0 };
      const next = loan ? nextOpen(sched) : null;
      const status = !loan ? 'awaiting_release' : loan.status === 'settled' ? 'repaid' : 'repaying';
      return {
        application: c.application, amount_bdt: c.amount_bdt, code: code(c.application), lender_id: shop?.lender, lender_name: lenderName,
        type: shop ? typeLabel(shop.business_type) : null, verdict_now: x?.v?.final_verdict, band_low: x?.v?.band_low, band_high: x?.v?.band_high,
        runway: (x?.v?.features_json?.monthly || []).map((m: Lean) => m.inflow), rate_pct: rate, tenor_months: tenor,
        expected_interest_bdt: exp.interest_bdt, expected_back_bdt: exp.total_back_bdt, monthly_bdt: exp.monthly_bdt,
        received_bdt: got.received_bdt, interest_received_bdt: got.interest_received_bdt, still_to_come_bdt: Math.max(0, exp.total_back_bdt - got.received_bdt),
        status, next_due_date: next?.due_date ?? null,
      };
    }),
  );
  const sum = (xs: Lean[], k: string) => xs.reduce((a, h) => a + (h[k] || 0), 0);
  const groups = new Map<string, Lean[]>();
  for (const h of holdings) groups.set(String(h.lender_id), [...(groups.get(String(h.lender_id)) || []), h]);
  const by_lender = [...groups.values()].map((hs) => ({
    lender_name: hs[0].lender_name, loans: hs.length, committed_bdt: sum(hs, 'amount_bdt'), expected_interest_bdt: sum(hs, 'expected_interest_bdt'),
    expected_back_bdt: sum(hs, 'expected_back_bdt'), received_bdt: sum(hs, 'received_bdt'), still_to_come_bdt: sum(hs, 'still_to_come_bdt'),
  })).sort((a, b) => b.committed_bdt - a.committed_bdt);
  const totals = { committed_bdt: sum(holdings, 'amount_bdt'), expected_interest_bdt: sum(holdings, 'expected_interest_bdt'), expected_back_bdt: sum(holdings, 'expected_back_bdt'), received_bdt: sum(holdings, 'received_bdt'), still_to_come_bdt: sum(holdings, 'still_to_come_bdt') };
  const updates = await InvestorUpdate.find({ investor: i._id }).sort({ createdAt: -1 }).limit(30).lean();
  res.json({ investor: i, holdings, by_lender, totals, updates: updates.map((u) => ({ ...u, code: code(u.application) })) });
});

export default r;
