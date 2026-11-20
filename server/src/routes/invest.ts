import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth';
import { Application, Shop, Verdict, Decision, Investor, InvestorVerification, Commitment, InvestorUpdate, EvidenceItem, AuditLog } from '../models';
import { allocate } from '../services/allocator';
import { mulberry32, addMonths } from '../lib/util';

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const r = Router();
const inv = requireRole('investor');
export const INVESTOR_SHARE = 0.25; // investors may fund up to 25% of a loan through the partner's pool (simulation)

export const TYPE_LABEL: Record<string, { en: string; bn: string }> = {
  tea_grocery: { en: 'Tea stall and grocery', bn: 'চায়ের দোকান ও মুদি' },
  knitwear: { en: 'Knitwear unit', bn: 'নিটওয়্যার কারখানা' },
  pharmacy: { en: 'Pharmacy', bn: 'ফার্মেসি' },
  mobile_accessories: { en: 'Mobile accessories shop', bn: 'মোবাইল এক্সেসরিজের দোকান' },
  fish_trader: { en: 'Seasonal fish trader', bn: 'মৌসুমি মাছ ব্যবসায়ী' },
  online_clothing: { en: 'Online clothing seller', bn: 'অনলাইন পোশাক বিক্রেতা' },
};
const typeLabel = (t: string) => TYPE_LABEL[t] || { en: 'Small business', bn: 'ক্ষুদ্র ব্যবসা' };
const code = (id: unknown) => 'BH-' + String(id).slice(-4).toUpperCase();
const sizeRange = (n: number) =>
  n < 250000 ? { en: 'Under 2.5 lakh BDT', bn: '২.৫ লাখ টাকার কম' } : n < 500000 ? { en: '2.5 to 5 lakh BDT', bn: '২.৫ থেকে ৫ লাখ টাকা' } : n < 1000000 ? { en: '5 to 10 lakh BDT', bn: '৫ থেকে ১০ লাখ টাকা' } : { en: 'Over 10 lakh BDT', bn: '১০ লাখ টাকার বেশি' };

async function me(userId: string) {
  return (await Investor.findOne({ user: userId }).lean()) as Lean;
}

/** Only cases whose latest AI decision is approved_with_conditions can be listed. */
async function listable() {
  const apps = (await Application.find({ status: { $in: ['decided', 'funded'] } }).lean()) as Lean[];
  const out: Lean[] = [];
  for (const a of apps) {
    const shop = (await Shop.findById(a.shop).lean()) as Lean;
    if (shop?.cohort_flag !== 'demo') continue;
    const v = (await Verdict.findById(a.current_verdict).lean()) as Lean;
    const d = (await Decision.findOne({ application: a._id }).sort({ createdAt: -1 }).lean()) as Lean;
    const listed = d?.decision === 'approved_with_conditions'; // only AI decisions approved with conditions are listed
    out.push({ a, shop, v, d, listed });
  }
  return out;
}

function listingView(x: Lean) {
  const share = Math.round(x.a.loan_ask_bdt * INVESTOR_SHARE);
  return {
    id: x.a._id, code: code(x.a._id), type: typeLabel(x.shop.business_type), size: sizeRange(x.a.loan_ask_bdt), loan_bdt: x.a.loan_ask_bdt,
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
    my_commitment_bdt: mine?.amount_bdt || 0, cap_per_loan_bdt: i.cap_per_loan_bdt, cap_total_bdt: i.cap_total_bdt, committed_total_bdt: i.committed_total_bdt,
    verification_status: i.verification_status,
  });
});

r.post('/invest/commit', inv, async (req, res) => {
  const b = z.object({ application: z.string().length(24), amount_bdt: z.coerce.number().int().min(1000).max(1000000) }).parse(req.body);
  const i = await me(req.user!.id);
  if (i.verification_status !== 'verified') return res.status(403).json({ error: 'Finish the simulated verification before committing.' });
  const all = await listable();
  const x = all.find((y) => String(y.a._id) === b.application);
  if (!x || !x.listed) return res.status(400).json({ error: 'This case is not listed (only cases the AI approved with conditions are listed).' });
  if (b.amount_bdt > i.cap_per_loan_bdt) return res.status(400).json({ error: `Over your per-loan cap of ${i.cap_per_loan_bdt} BDT.` });
  const amt = b.amount_bdt;
  // Atomic cap checks: each step is a conditional update; any failure rolls back the earlier steps.
  const invOk = await Investor.findOneAndUpdate(
    { _id: i._id, verification_status: 'verified', $expr: { $lte: [{ $add: ['$committed_total_bdt', amt] }, '$cap_total_bdt'] } },
    { $inc: { committed_total_bdt: amt } },
    { new: true },
  );
  if (!invOk) return res.status(400).json({ error: `Over your total cap of ${i.cap_total_bdt} BDT.` });
  const appOk = await Application.findOneAndUpdate(
    { _id: x.a._id, $expr: { $lte: [{ $add: ['$funded_bdt', amt] }, { $multiply: ['$loan_ask_bdt', INVESTOR_SHARE] }] } },
    { $inc: { funded_bdt: amt } },
    { new: true },
  );
  if (!appOk) {
    await Investor.updateOne({ _id: i._id }, { $inc: { committed_total_bdt: -amt } });
    return res.status(400).json({ error: 'More than the amount still open on this case.' });
  }
  try {
    await Commitment.findOneAndUpdate(
      { investor: i._id, application: x.a._id, amount_bdt: { $lte: i.cap_per_loan_bdt - amt } },
      { $inc: { amount_bdt: amt }, $setOnInsert: { status: 'active' } },
      { upsert: true, new: true },
    );
  } catch {
    await Investor.updateOne({ _id: i._id }, { $inc: { committed_total_bdt: -amt } });
    await Application.updateOne({ _id: x.a._id }, { $inc: { funded_bdt: -amt } });
    return res.status(400).json({ error: `Over your per-loan cap of ${i.cap_per_loan_bdt} BDT for this case.` });
  }
  await AuditLog.create({ actor: req.user!.email, action: 'invest:commit (simulation)', application: x.a._id, redacted_payload_json: { amount_bdt: amt }, output_json: { open_after: Math.round(x.a.loan_ask_bdt * INVESTOR_SHARE) - appOk.funded_bdt }, mode: 'human' });
  res.json({ ok: true, committed_total_bdt: invOk.committed_total_bdt, case_open_bdt: Math.round(x.a.loan_ask_bdt * INVESTOR_SHARE) - appOk.funded_bdt });
});

r.get('/invest/allocate', inv, async (req, res) => {
  const budget = Math.max(1000, Math.min(1000000, Number(req.query.budget) || 100000));
  const i = await me(req.user!.id);
  const listings = (await listable()).filter((x) => x.listed).map(listingView);
  const mine = await Commitment.find({ investor: i._id }).lean();
  const already = Object.fromEntries(mine.map((c) => [String(c.application), c.amount_bdt as number]));
  const room = Math.max(0, i.cap_total_bdt - i.committed_total_bdt);
  const out = allocate(Math.min(budget, room), listings.map((l) => ({ id: String(l.id), band_low: l.band_low, open_bdt: l.open_bdt })), i.cap_per_loan_bdt, already);
  res.json({ budget, room_under_total_cap: room, ...out, listings: listings.map((l) => ({ id: l.id, code: l.code, type: l.type, band_low: l.band_low, open_bdt: l.open_bdt })) });
});

r.get('/portfolio', inv, async (req, res) => {
  const i = await me(req.user!.id);
  const commits = (await Commitment.find({ investor: i._id }).lean()) as Lean[];
  const all = await listable();
  const holdings = commits.map((c) => {
    const x = all.find((y) => String(y.a._id) === String(c.application));
    return { application: c.application, amount_bdt: c.amount_bdt, code: code(c.application), type: x ? typeLabel(x.shop.business_type) : null, verdict_now: x?.v?.final_verdict, band_low: x?.v?.band_low, band_high: x?.v?.band_high, runway: (x?.v?.features_json?.monthly || []).map((m: Lean) => m.inflow) };
  });
  const updates = await InvestorUpdate.find({ investor: i._id }).sort({ createdAt: -1 }).limit(30).lean();
  // simulated pool history (clearly labelled; not a projection and not a return)
  const rng = mulberry32(99);
  const history = Array.from({ length: 12 }, (_, k) => ({ month: addMonths('2025-11', k), on_schedule_pct: Math.round(90 + rng() * 7 - (k > 8 ? 4 : 0)), loans_active: 40 + k * 3 }));
  res.json({ investor: i, holdings, updates: updates.map((u) => ({ ...u, code: code(u.application) })), pool_history: history });
});

export default r;
