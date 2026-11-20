// npm run check:seed — asserts the v2 seed expectations (brief step 9) and that seeding is deterministic.
import { connectDb, disconnectDb } from '../db';
import { seedAll } from '../seed/seed';
import { Shop, Application, Verdict, Decision, OwnerQuestion, Doc, Transaction, Flag } from '../models';
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

  // watchman after funding: Karim watch then call; Jahan no false alarm in lean months
  const m1 = await simulate('month', 'check');
  const m2 = await simulate('month', 'check');
  const karim = await Shop.findOne({ slug: 'karim' }).lean();
  const jahan = await Shop.findOne({ slug: 'jahan' }).lean();
  const kf = await Flag.find({ shop: karim!._id }).sort({ createdAt: 1 }).lean();
  check('Karim: flagged watch, then call, after funding', kf.map((f) => f.severity).join(',') === 'watch,call', kf.map((f) => f.severity).join(','));
  check('Jahan: no false alarm in the lean months', (await Flag.countDocuments({ shop: jahan!._id, severity: { $in: ['watch', 'call'] } })) === 0, `fixed rule would alarm: ${[...m1.events, ...m2.events].filter((e) => e.shop.startsWith('Jahan') && e.baseline_flag).length} time(s)`);

  await seedAll(() => undefined); // leave the demo in its seeded state
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(failed ? `\n${failed} expectation(s) failed.` : `\nAll ${results.length} seed expectations hold.`);
  await disconnectDb();
  process.exitCode = failed ? 1 : 0;
})();
