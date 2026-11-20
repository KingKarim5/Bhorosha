// npm run check:seed — asserts the v2 seed expectations (brief step 9) and that seeding is deterministic.
import { connectDb, disconnectDb } from '../db';
import { seedAll } from '../seed/seed';
import { Shop, Application, Verdict, Decision, OwnerQuestion, Doc, Transaction, Flag, LoanContract, LoanAccount, Payment } from '../models';
import { confirmContract, signedBody, ingestWebhook, getTerms } from '../services/loan';
import { recompute } from '../services/casefile';
import { demoLender } from '../tenancy';
import { simulate } from '../services/watchman';

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function snapshot() {
  const out: Record<string, Lean> = {};
  for (const s of await Shop.find({ cohort_flag: 'demo' }).lean()) {
    const app = (await Application.findOne({ shop: s._id }).lean()) as Lean;
    const v = (await Verdict.findById(app.current_verdict).lean()) as Lean;
    const d = (await Decision.findOne({ application: app._id }).sort({ createdAt: -1 }).lean()) as Lean;
    const qs = (await OwnerQuestion.find({ application: app._id }).lean()) as Lean[];
    const bills = (await Doc.find({ shop: s._id, kind: 'bill' }).lean()) as Lean[];
    out[s.slug as string] = {
      verdict: v.final_verdict, band: [v.band_low, v.band_high], widened: v.features_json?.band_widened || [], decision: d.decision, tranches: (d.tranche_plan || []).length,
      first: d.first_tranche_bdt, reasons: (d.reasons || []).map((r: Lean) => r.en).join(' '), conditions: (d.conditions || []).map((c: Lean) => c.key),
      questions: qs.map((q) => ({ status: q.status, material: q.material, bn: /[ঀ-৿]/.test(q.question_bn || '') })),
      bills: bills.map((b) => b.match_status), txns: await Transaction.countDocuments({ shop: s._id }), rules: v.rules_total,
      gates: Object.fromEntries((d.gates || []).map((g: Lean) => [g.key, g.pass])), counter: d.counter_offer, pricing: d.pricing, fees: d.fee_split?.figures || null,
      contract: ((await LoanContract.findOne({ application: app._id }).lean()) as Lean)?.status,
    };
  }
  return out;
}

const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = '') => results.push({ name, pass, detail });

(async () => {
  await connectDb();
  await seedAll(() => undefined);
  const a = await snapshot();
  await seedAll(() => undefined);
  const b = await snapshot();
  check('Seed is deterministic (two seeds give the same state)', JSON.stringify(a) === JSON.stringify(b));

  const s = b;
  const width = (x: Lean) => x.band[1] - x.band[0];
  check('Rahima: approved_with_conditions', s.rahima.decision === 'approved_with_conditions', s.rahima.decision);
  check('Rahima: one unmatched bill', s.rahima.bills.filter((x: string) => x === 'unmatched').length === 1, s.rahima.bills.join(','));
  check('Rahima: a Bangla owner question', s.rahima.questions.some((q: Lean) => q.bn && q.status === 'open'), JSON.stringify(s.rahima.questions));
  check('Sultana: approved_with_conditions with a tranche plan', s.sultana.decision === 'approved_with_conditions' && s.sultana.tranches >= 2 && s.sultana.first <= 300000, `${s.sultana.decision}, ${s.sultana.tranches} tranches, first ${s.sultana.first}`);
  check('Jahan: approved_with_conditions with a widened (seasonal) band', s.jahan.decision === 'approved_with_conditions' && s.jahan.widened.includes('seasonal'), `${s.jahan.decision} ${s.jahan.band} ${s.jahan.widened}`);
  check('Karim: not sure or hold at filing', s.karim.verdict === 'not_sure' || s.karim.decision === 'hold_need_evidence', `${s.karim.verdict}/${s.karim.decision}`);
  check('Nasir: hold_need_evidence', s.nasir.decision === 'hold_need_evidence', s.nasir.decision);
  check('Tania: hold_need_evidence because the statement does not reconcile', s.tania.decision === 'hold_need_evidence' && /does not reconcile/.test(s.tania.reasons), s.tania.reasons.slice(0, 120));
  check('Rafi: approved_with_conditions', s.rafi.decision === 'approved_with_conditions', s.rafi.decision);
  check('Rafi: narrower band than Rahima', width(s.rafi) < width(s.rahima), `Rafi ${s.rafi.band} vs Rahima ${s.rahima.band}`);
  check('Rafi: condition "provide supplier invoices for stock"', s.rafi.conditions.includes('supplier_invoices'), s.rafi.conditions.join(','));

  // v3 loan agents
  const demo = (await demoLender())!;
  const t = await getTerms(demo._id);
  const approved = Object.entries(s).filter(([, x]) => x.decision === 'approved_with_conditions');
  check('Every loan except Hasan is inside the limits (Tk 1,000,000, 12 months)', Object.entries(s).every(([k, x]) => k === 'hasan' || x.gates.within_limits === true), Object.entries(s).filter(([, x]) => x.gates.within_limits === false).map(([k]) => k).join(','));
  check('Mitu: hold_need_evidence because the late clause is unclear', s.mitu.decision === 'hold_need_evidence' && s.mitu.gates.contract_terms === false && s.mitu.contract === 'unsure', `${s.mitu.decision}, contract ${s.mitu.contract}`);
  check('Other contracts read clear (Hasan aside)', Object.entries(s).every(([k, x]) => ['mitu', 'hasan'].includes(k) || x.contract === 'clear'), Object.entries(s).map(([k, x]) => `${k}:${x.contract}`).join(' '));
  check('Hasan: declined_with_plan with a counter-offer inside the limits', s.hasan.decision === 'declined_with_plan' && s.hasan.counter?.amount_bdt > 0 && s.hasan.counter.amount_bdt <= t.max_principal_bdt && s.hasan.counter.tenor_months <= t.max_tenor_months, JSON.stringify({ d: s.hasan.decision, amt: s.hasan.counter?.amount_bdt, tenor: s.hasan.counter?.tenor_months }));
  check('Approved loans priced inside the bands', approved.length > 0 && approved.every(([, x]) => x.pricing && x.pricing.rebate_pct >= t.rebate_min_pct && x.pricing.rebate_pct <= t.rebate_max_pct && x.pricing.penalty_pts >= t.penalty_min_pts && x.pricing.penalty_pts <= t.penalty_max_pts), approved.map(([k, x]) => `${k}:${x.pricing?.rebate_pct}%/${x.pricing?.penalty_pts}`).join(' '));
  check('Approved loans: interest split adds up and the rate check passes', approved.every(([, x]) => x.fees && x.fees.rate_check.ok && x.fees.investor_bdt + x.fees.bhorsha_bdt + x.fees.lender_bdt === x.fees.total_interest_bdt), approved.map(([k, x]) => `${k}:${x.fees?.per_100?.investor}/${x.fees?.per_100?.bhorsha}/${x.fees?.per_100?.lender}`).join(' '));
  const ev = { event_id: 'check-forged', channel: 'bkash' as const, amount_bdt: 5000, received_at: '2026-11-12', reference: 'LN-TEST', payer_label: 'x' };
  const forged = await ingestWebhook(signedBody(ev).raw, '0'.repeat(64), { useAi: false, actor: 'check' });
  check('Webhook: a payment with a wrong signature is refused', !forged.ok && forged.status === 401, JSON.stringify(forged).slice(0, 80));

  // watchman after funding: Karim watch then call; Jahan no false alarm in lean months
  const m1 = await simulate('month', 'check', demo._id);
  const m2 = await simulate('month', 'check', demo._id);
  const karim = await Shop.findOne({ slug: 'karim' }).lean();
  const jahan = await Shop.findOne({ slug: 'jahan' }).lean();
  const kf = await Flag.find({ shop: karim!._id }).sort({ createdAt: 1 }).lean();
  check('Karim: flagged watch, then call, after funding', kf.map((f) => f.severity).join(',') === 'watch,call', kf.map((f) => f.severity).join(','));
  check('Jahan: no false alarm in the lean months', (await Flag.countDocuments({ shop: jahan!._id, severity: { $in: ['watch', 'call'] } })) === 0, `fixed rule would alarm: ${[...m1.events, ...m2.events].filter((e) => e.shop.startsWith('Jahan') && e.baseline_flag).length} time(s)`);

  // repayments arrive through the signed webhook during the two simulated months
  const pays = (await Payment.find({}).lean()) as Lean[];
  const of = async (slug: string) => {
    const shop = await Shop.findOne({ slug }).lean();
    return pays.filter((p) => String(p.shop) === String(shop!._id));
  };
  const kp = await of('karim');
  const jp = await of('jahan');
  const rp = await of('rafi');
  check('Karim: a late repayment read as a real warning', kp.some((p) => p.classification === 'late' && p.watch?.assessment === 'real_warning'), kp.map((p) => `${p.classification}/${p.watch?.assessment}`).join(' '));
  check('Jahan: a late repayment read as a seasonal pattern', jp.some((p) => p.classification === 'late' && p.watch?.assessment === 'seasonal_pattern'), jp.map((p) => `${p.classification}/${p.watch?.assessment}`).join(' '));
  check('Rafi: a payment without a reference is not applied on a guess', rp.some((p) => !p.reference && (p.status === 'review' || (p.status === 'applied' && p.confidence >= t.match_confidence_min))), rp.map((p) => `${p.reference ? 'ref' : 'noref'}:${p.status}:${p.confidence}`).join(' '));
  const sul = await LoanAccount.findOne({ shop: (await Shop.findOne({ slug: 'sultana' }).lean())!._id }).lean();
  check('Sultana: repayment account opened on the first tranche', sul?.principal_bdt === s.sultana.first, `${sul?.principal_bdt} vs ${s.sultana.first}`);

  // the lender confirms Mitu's terms: the case can then be approved
  const mitu = await Application.findOne({ shop: (await Shop.findOne({ slug: 'mitu' }).lean())!._id }).lean();
  await confirmContract(mitu!._id, 'check', { rebate_pct: 20, penalty_pts: 2 });
  await recompute(mitu!._id, { actor: 'check', reason: 'lender confirmed contract' });
  const md = (await Decision.findOne({ application: mitu!._id }).sort({ createdAt: -1 }).lean()) as Lean;
  check('Mitu: approved_with_conditions once the lender confirms the terms', md.decision === 'approved_with_conditions', md.decision);

  await seedAll(() => undefined); // leave the demo in its seeded state
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(failed ? `\n${failed} expectation(s) failed.` : `\nAll ${results.length} seed expectations hold.`);
  await disconnectDb();
  process.exitCode = failed ? 1 : 0;
})();
