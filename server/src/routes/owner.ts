import { Router } from 'express';
import { z } from 'zod';
import { Shop, Application, Verdict, Decision, OwnerQuestion, Transaction, CourierSettlement, OrderRecord, Doc, AuditLog, OwnerMessage } from '../models';
import { recompute } from '../services/casefile';
import { readNote } from '../services/documents';
import { parseStatementCsv } from '../lib/statement';
import { parseCourierCsv, parseOrderLogCsv } from '../lib/online';
import { CAUSES } from '../lib/features';
import { VERDICT_TEXT } from '../lib/rules';
import { fmtBdt } from '../lib/util';

// Owner experience (v2): private token link, no login, plain Bangla, no internal scoring detail.
type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const r = Router();

const FIX: Record<string, { en: string; bn: string }> = {
  not_paused: { en: 'Nothing for you to do: the lender has paused AI decisions for now. Your file will be looked at again when they resume.', bn: 'আপনার কিছু করার নেই: ঋণদাতা এখন এআই-এর সিদ্ধান্ত থামিয়ে রেখেছেন। চালু হলে আপনার ফাইল আবার দেখা হবে।' },
  min_documents: { en: 'Add the missing documents listed above.', bn: 'উপরে লেখা যে কাগজগুলো নেই, সেগুলো যোগ করুন।' },
  history: { en: 'Add at least 3 months of your wallet statement.', bn: 'অন্তত ৩ মাসের ওয়ালেট স্টেটমেন্ট যোগ করুন।' },
  no_tamper: { en: 'Download a fresh statement from your wallet app covering 12 months and upload it again. The current one does not add up from row to row.', bn: 'ওয়ালেট অ্যাপ থেকে ১২ মাসের নতুন স্টেটমেন্ট নামিয়ে আবার দিন। বর্তমানটির সারি থেকে সারিতে হিসাব মেলে না।' },
  model_no_contradiction: { en: 'Add a few more months of statement so the picture is clearer.', bn: 'আরও কয়েক মাসের স্টেটমেন্ট দিন, যাতে ছবিটা পরিষ্কার হয়।' },
  material_evidence: { en: 'Answer the questions below about payments we could not match.', bn: 'যে পরিশোধগুলো মেলানো যায়নি, সেগুলো নিয়ে নিচের প্রশ্নের উত্তর দিন।' },
};

async function ownerView(token: string) {
  const shop = (await Shop.findOne({ token }).lean()) as Lean;
  if (!shop) return null;
  const app = (await Application.findOne({ shop: shop._id }).lean()) as Lean;
  const v = (await Verdict.findById(app?.current_verdict).lean()) as Lean;
  const decisions = (await Decision.find({ application: app._id }).sort({ createdAt: -1 }).lean()) as Lean[];
  const d = decisions[0];
  const questions = (await OwnerQuestion.find({ application: app._id, status: { $in: ['open', 'answered'] } }).sort({ createdAt: 1 }).lean()) as Lean[];
  const messages = (await OwnerMessage.find({ shop: shop._id }).sort({ createdAt: -1 }).limit(20).lean()) as Lean[];
  const failed = (d?.gates || []).filter((g: Lean) => !g.pass);
  let headline = { en: 'Your file is being read.', bn: 'আপনার ফাইল পড়া হচ্ছে।' };
  let fix: { en: string; bn: string }[] = [];
  if (d?.decision === 'approved_with_conditions') {
    headline = {
      en: `Approved with conditions. ${d.first_tranche_bdt ? `The first part, ${fmtBdt(d.first_tranche_bdt)} BDT, can be released by the lender.` : ''}`,
      bn: `শর্তসহ অনুমোদিত। ${d.first_tranche_bdt ? `প্রথম ধাপে ${fmtBdt(d.first_tranche_bdt)} টাকা ঋণদাতা ছাড় করতে পারেন।` : ''}`,
    };
    fix = (d.conditions || []).map((c: Lean) => ({ en: c.en, bn: c.bn }));
  } else if (d?.decision === 'declined_with_plan') {
    headline = { en: 'Not this time, but here is what would change it.', bn: 'এবার হলো না, তবে কী বদলালে হবে তা নিচে দেওয়া হলো।' };
    fix = [...(v?.conditions_json || []), ...(v?.recovery_plan_json || [])].map((c: Lean) => ({ en: c.en, bn: c.bn }));
  } else if (d?.decision === 'hold_need_evidence') {
    headline = { en: 'On hold: we need a little more evidence before deciding.', bn: 'স্থগিত: সিদ্ধান্তের আগে আরও কিছু প্রমাণ দরকার।' };
    for (const g of failed) {
      if (g.key === 'rules_viable') fix.push(...(v?.conditions_json || []).map((c: Lean) => ({ en: c.en, bn: c.bn })));
      else if (FIX[g.key]) fix.push(FIX[g.key]);
    }
    if (!fix.length) fix.push({ en: 'Add any new evidence you have and resubmit.', bn: 'নতুন কোনো প্রমাণ থাকলে যোগ করে আবার জমা দিন।' });
  }
  return {
    shop: shop.label,
    segment: shop.segment,
    status: app?.status,
    decision: d ? { decision: d.decision, decided_by: d.decided_by, at: d.createdAt, reasons: d.reasons, first_tranche_bdt: d.first_tranche_bdt, tranche_plan: d.tranche_plan } : null,
    headline,
    why: failed.length && d?.decision !== 'approved_with_conditions' ? failed.map((g: Lean) => ({ en: g.en, bn: g.bn })) : (d?.reasons || []).map((x: Lean) => ({ en: x.en, bn: x.bn })),
    fix,
    verdict_word: v ? VERDICT_TEXT[v.final_verdict as keyof typeof VERDICT_TEXT] : null,
    cause: v ? CAUSES[v.cause as keyof typeof CAUSES] : null,
    recovery_plan: v?.recovery_plan_json || [],
    questions: questions.map((q) => ({ _id: q._id, question_bn: q.question_bn, question_en: q.question_en, status: q.status, answer: q.answer, material: q.material })),
    messages,
    history: decisions.map((x) => ({ decision: x.decision, at: x.createdAt, decided_by: x.decided_by })),
    missing: app?.missing || [],
  };
}

r.get('/owner/:token', async (req, res) => {
  const v = await ownerView(req.params.token);
  if (!v) return res.status(404).json({ error: 'not found' });
  res.json(v);
});

r.post('/owner/:token/questions/:qid/answer', async (req, res) => {
  const b = z.object({ answer: z.string().trim().min(2).max(500) }).parse(req.body);
  const shop = await Shop.findOne({ token: req.params.token }).lean();
  if (!shop) return res.status(404).json({ error: 'not found' });
  const app = await Application.findOne({ shop: shop._id }).lean();
  const q = await OwnerQuestion.findOne({ _id: req.params.qid, application: app!._id });
  if (!q) return res.status(404).json({ error: 'question not found' });
  q.set({ answer: b.answer, status: 'answered', answered_at: new Date() });
  await q.save();
  await AuditLog.create({ actor: 'owner', action: 'owner:answer', agent: 'Verifier', application: app!._id, redacted_payload_json: { question: q.item_key }, output_json: { stored_as: 'owner says' }, mode: 'human' });
  await recompute(app!._id, { actor: 'owner', reason: 'owner answered a question' });
  res.json(await ownerView(req.params.token));
});

r.post('/owner/:token/resubmit', async (req, res) => {
  const b = z
    .object({ statement_csv: z.string().max(3_000_000).optional(), courier_csv: z.string().max(3_000_000).optional(), orders_csv: z.string().max(3_000_000).optional(), note_text: z.string().max(4000).optional() })
    .parse(req.body);
  const shop = await Shop.findOne({ token: req.params.token }).lean();
  if (!shop) return res.status(404).json({ error: 'not found' });
  const app = await Application.findOne({ shop: shop._id }).lean();
  const added: string[] = [];
  if (b.statement_csv) {
    const p = parseStatementCsv(b.statement_csv);
    if (p.txns.length) {
      await Transaction.deleteMany({ shop: shop._id, hidden_until_sim: 0 });
      await Transaction.insertMany(p.txns.map((t) => ({ ...t, shop: shop._id, hidden_until_sim: 0 })));
      added.push(`statement (${p.txns.length} rows)`);
    }
  }
  if (b.courier_csv) {
    const p = parseCourierCsv(b.courier_csv);
    if (p.rows.length) {
      await CourierSettlement.deleteMany({ shop: shop._id });
      await CourierSettlement.insertMany(p.rows.map((x) => ({ ...x, shop: shop._id })));
      added.push(`courier settlements (${p.rows.length} rows)`);
    }
  }
  if (b.orders_csv) {
    const p = parseOrderLogCsv(b.orders_csv);
    if (p.rows.length) {
      await OrderRecord.deleteMany({ shop: shop._id });
      await OrderRecord.insertMany(p.rows.map((x) => ({ ...x, shop: shop._id })));
      added.push(`order log (${p.rows.length} rows)`);
    }
  }
  if (b.note_text?.trim()) {
    const d = await Doc.create({ shop: shop._id, application: app!._id, kind: 'note', raw_text: b.note_text.trim() });
    await readNote(String(d._id), 'owner');
    added.push('note');
  }
  await AuditLog.create({ actor: 'owner', action: 'owner:resubmit', agent: 'Intake', application: app!._id, redacted_payload_json: { added }, output_json: {}, mode: 'human' });
  await recompute(app!._id, { actor: 'owner', reason: `owner resubmitted: ${added.join(', ') || 'no new files'}` });
  res.json({ added, view: await ownerView(req.params.token) });
});

// Accept a Servicer offer (simulated repayment-date shift, allowed by the policy).
r.post('/owner/:token/offers/:mid/accept', async (req, res) => {
  const shop = await Shop.findOne({ token: req.params.token }).lean();
  if (!shop) return res.status(404).json({ error: 'not found' });
  const m = await OwnerMessage.findOne({ _id: req.params.mid, shop: shop._id });
  if (!m || !m.offer) return res.status(404).json({ error: 'offer not found' });
  m.offer = { ...(m.offer as Lean), status: 'accepted', accepted_at: new Date() };
  m.markModified('offer');
  await m.save();
  await AuditLog.create({ actor: 'owner', action: 'owner:accept_offer', agent: 'Servicer', redacted_payload_json: { offer: m.offer }, output_json: { simulated: true }, mode: 'human' });
  res.json({ ok: true });
});

export default r;
