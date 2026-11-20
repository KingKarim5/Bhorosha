import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { z } from 'zod';
import { requireRole } from '../auth';
import { Application, Shop, Verdict, EvidenceItem, Finding, Doc, Decision, AuditLog, Transaction, Outcome, CourierSettlement, OrderRecord, OwnerQuestion } from '../models';
import { parseCourierCsv, parseOrderLogCsv } from '../lib/online';
import { recompute, loadTxns } from '../services/casefile';
import { readBill, readNote } from '../services/documents';
import { parseStatementCsv, summarise } from '../lib/statement';
import { runChecks } from '../lib/checks';
import { BILLS, NOTES } from '../seed/sampleDocs';
import { callJson, PROMPTS, AnswerSchema } from '../services/ai';
import { redact } from '../lib/redact';
import { validateText, validateCitations, extractNumbers } from '../lib/validate';

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const staff = requireRole('lender');

r.get('/samples/statement/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-z]/g, '');
  const file = path.join(config.seedDataDir, 'statements', `${slug}.csv`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'no such sample' });
  res.json({ csv: fs.readFileSync(file, 'utf8') });
});

r.get('/samples/online/:slug/:kind', (req, res) => {
  const slug = req.params.slug.replace(/[^a-z]/g, '');
  const kind = req.params.kind === 'orders' ? 'orders' : 'courier';
  const file = path.join(config.seedDataDir, 'online', `${slug}_${kind}.csv`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'no such sample' });
  res.json({ csv: fs.readFileSync(file, 'utf8') });
});

r.get('/samples/:key', (req, res) => {
  const t = BILLS[req.params.key] || NOTES[req.params.key];
  if (!t) return res.status(404).json({ error: 'no such sample' });
  res.json(t);
});

r.get('/cases', staff, async (_req, res) => {
  const shops = await Shop.find({ cohort_flag: 'demo' }).lean();
  const apps = await Application.find({ shop: { $in: shops.map((s) => s._id) } }).sort({ createdAt: 1 }).lean();
  const verdicts = await Verdict.find({ _id: { $in: apps.map((a) => a.current_verdict).filter(Boolean) } }).lean();
  const decisions = await Decision.find({ application: { $in: apps.map((a) => a._id) } }).sort({ createdAt: -1 }).lean();
  res.json(
    apps.map((a) => {
      const s = shops.find((x) => String(x._id) === String(a.shop))!;
      const v = verdicts.find((x) => String(x._id) === String(a.current_verdict)) as Lean | undefined;
      const d = decisions.find((x) => String(x.application) === String(a._id));
      return {
        id: a._id, shop: s.label, slug: s.slug, business_type: s.business_type, loan_ask_bdt: a.loan_ask_bdt, status: a.status,
        verdict: v?.final_verdict, band_low: v?.band_low, band_high: v?.band_high, coverage_pct: v?.coverage_pct, cause: v?.cause,
        checked_share: v?.features_json?.checked_share, monthly: (v?.features_json?.monthly || []).map((m: Lean) => m.inflow),
        disagreement: v?.disagreement_flag, decision: d?.decision || null, funded: s.funded,
      };
    }),
  );
});

r.get('/cases/:id', staff, async (req, res) => {
  const app = (await Application.findById(req.params.id).lean()) as Lean;
  if (!app) return res.status(404).json({ error: 'case not found' });
  const shop = await Shop.findById(app.shop).lean();
  const questions = await OwnerQuestion.find({ application: app._id }).sort({ createdAt: 1 }).lean();
  const [verdict, history, evidence, findings, docs, decisions, audit] = await Promise.all([
    Verdict.findById(app.current_verdict).lean(),
    Verdict.find({ application: app._id }).sort({ version: -1 }).select('version final_verdict band_low band_high generated_by phrased_by createdAt').lean(),
    EvidenceItem.find({ application: app._id }).lean(),
    Finding.find({ application: app._id }).lean(),
    Doc.find({ shop: app.shop }).sort({ createdAt: 1 }).lean(),
    Decision.find({ application: app._id }).sort({ createdAt: -1 }).lean(),
    AuditLog.find({ application: app._id }).sort({ createdAt: -1 }).limit(60).lean(),
  ]);
  const docsOut = docs.map((d) => ({ ...d, sample: d.sample_key ? BILLS[d.sample_key] || NOTES[d.sample_key] || null : null }));
  res.json({ app, shop, verdict, history, evidence, findings, docs: docsOut, decisions, audit, questions });
});

// Agent trace: the latest pipeline run's steps from the audit log (works in DEMO FALLBACK too).
r.get('/cases/:id/trace', staff, async (req, res) => {
  const last = await AuditLog.findOne({ application: req.params.id, run_id: { $ne: null } }).sort({ createdAt: -1 }).lean();
  if (!last) return res.json({ run_id: null, agents: [] });
  const rows = await AuditLog.find({ run_id: last.run_id }).sort({ createdAt: 1 }).lean();
  const order = ['Intake', 'Verifier', 'Underwriter', 'Watchman', 'Servicer'];
  const agents = order
    .map((a) => ({ agent: a, steps: rows.filter((x) => x.agent === a).map((x) => ({ step: x.step || x.action, mode: x.mode, ms: x.latency_ms, summary: (x.output_json as Record<string, unknown>)?.summary ?? null, ai: String(x.action).startsWith('ai:'), at: x.createdAt })) }))
    .filter((a) => a.steps.length);
  res.json({ run_id: last.run_id, at: last.createdAt, agents, fallback: rows.some((x) => x.mode === 'demo_fallback') });
});

r.get('/cases/:id/statement', staff, async (req, res) => {
  const app = await Application.findById(req.params.id).lean();
  if (!app) return res.status(404).json({ error: 'case not found' });
  const txns = await loadTxns(app.shop, 0);
  const sum = summarise(txns);
  res.json({ rows: txns.slice(-60).reverse(), total_rows: txns.length, months: sum.months, gaps: sum.gaps, checks: runChecks(txns) });
});

// ---- intake wizard: create a case
const CreateSchema = z.object({
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required before anything is uploaded.' }) }),
  label: z.string().min(2).max(80),
  business_type: z.string().min(2).max(40),
  months_trading: z.coerce.number().int().min(0).max(600).default(12),
  loan_ask_bdt: z.coerce.number().min(5000).max(50000000),
  tenor_months: z.coerce.number().int().min(3).max(120),
  purpose: z.string().max(200).default(''),
  purpose_kind: z.enum(['working_capital', 'capex']).default('working_capital'),
  cash_share_pct: z.coerce.number().min(0).max(95).nullable().optional(),
  margin_pct: z.coerce.number().min(1).max(90).nullable().optional(),
  seasonal: z.boolean().nullable().optional(),
  cib_status: z.enum(['clean', 'classified', 'unknown']).default('unknown'),
  statement_csv: z.string().max(3_000_000).optional(),
  courier_csv: z.string().max(3_000_000).optional(),
  orders_csv: z.string().max(3_000_000).optional(),
  segment: z.enum(['cash_led', 'hybrid', 'digital_first']).default('cash_led'),
  online_share_pct: z.coerce.number().min(0).max(100).nullable().optional(),
  note_text: z.string().max(4000).optional(),
});

// Public intake: the shop owner applies through a link; no login. Returns the owner's private token.
r.post('/apply', async (req, res) => {
  const b = CreateSchema.parse(req.body);
  const parsed = b.statement_csv ? parseStatementCsv(b.statement_csv) : { txns: [], errors: [] as string[] };
  const onlineShare = b.online_share_pct != null ? b.online_share_pct / 100 : b.segment === 'cash_led' ? 0 : b.segment === 'hybrid' ? 0.5 : 0.9;
  const shop = await Shop.create({ label: b.label, business_type: b.business_type, months_trading: b.months_trading, owner_label: `${b.label} (owner)`, token: crypto.randomBytes(10).toString('hex'), cohort_flag: 'demo', slug: 'new-' + Date.now(), segment: b.segment, online_share: onlineShare, offline_share: 1 - onlineShare });
  const courier = b.courier_csv ? parseCourierCsv(b.courier_csv) : { rows: [], errors: [] as string[] };
  const ordersParsed = b.orders_csv ? parseOrderLogCsv(b.orders_csv) : { rows: [], errors: [] as string[] };
  if (courier.rows.length) await CourierSettlement.insertMany(courier.rows.map((r) => ({ ...r, shop: shop._id })));
  if (ordersParsed.rows.length) await OrderRecord.insertMany(ordersParsed.rows.map((r) => ({ ...r, shop: shop._id })));
  const app = await Application.create({
    shop: shop._id, loan_ask_bdt: b.loan_ask_bdt, tenor_months: b.tenor_months, purpose: b.purpose, purpose_kind: b.purpose_kind, status: 'filed', consent: true,
    stated: { cash_share: b.cash_share_pct != null ? b.cash_share_pct / 100 : null, margin: b.margin_pct != null ? b.margin_pct / 100 : null, seasonal: b.seasonal ?? null, cib_status: b.cib_status },
  });
  if (parsed.txns.length) await Transaction.insertMany(parsed.txns.map((t) => ({ ...t, shop: shop._id, hidden_until_sim: 0 })));
  if (b.note_text?.trim()) {
    const d = await Doc.create({ shop: shop._id, application: app._id, kind: 'note', raw_text: b.note_text.trim() });
    await readNote(String(d._id), 'owner');
  }
  await AuditLog.create({ actor: 'owner', action: 'intake:create', application: app._id, redacted_payload_json: { label: b.label, rows: parsed.txns.length, parse_errors: parsed.errors.slice(0, 5) }, output_json: {}, mode: 'human' });
  await recompute(app._id, { actor: 'owner', reason: 'intake' });
  res.json({ id: app._id, token: shop.token, rows: parsed.txns.length, courier_rows: courier.rows.length, order_rows: ordersParsed.rows.length, parse_errors: [...parsed.errors, ...courier.errors, ...ordersParsed.errors].slice(0, 10) });
});

// ---- documents
r.post('/cases/:id/documents', staff, upload.single('image'), async (req, res) => {
  const app = await Application.findById(req.params.id).lean();
  if (!app) return res.status(404).json({ error: 'case not found' });
  const kind = req.body.kind === 'note' ? 'note' : 'bill';
  const doc = await Doc.create({ shop: app.shop, application: app._id, kind, raw_text: kind === 'note' ? String(req.body.text || '') : undefined });
  let result;
  if (kind === 'bill') result = await readBill(String(doc._id), req.file ? { b64: req.file.buffer.toString('base64'), mime: req.file.mimetype } : null, req.user!.email);
  else result = await readNote(String(doc._id), req.user!.email);
  // image buffer is discarded here: nothing is stored
  const v = await recompute(app._id, { actor: req.user!.email, reason: 'new document' });
  res.json({ doc_id: doc._id, ...result, verdict_version: v.version });
});

// Owner uploads by private token (no login)
r.post('/owner/:token/documents', upload.single('image'), async (req, res) => {
  const shop = await Shop.findOne({ token: req.params.token }).lean();
  if (!shop) return res.status(404).json({ error: 'not found' });
  const app = await Application.findOne({ shop: shop._id }).lean();
  if (!app) return res.status(404).json({ error: 'not found' });
  const kind = req.body.kind === 'note' ? 'note' : 'bill';
  const doc = await Doc.create({ shop: shop._id, application: app._id, kind, raw_text: kind === 'note' ? String(req.body.text || '').slice(0, 4000) : undefined });
  const result = kind === 'bill' ? await readBill(String(doc._id), req.file ? { b64: req.file.buffer.toString('base64'), mime: req.file.mimetype } : null, 'owner') : await readNote(String(doc._id), 'owner');
  const v = await recompute(app._id, { actor: 'owner', reason: 'owner added a document' });
  res.json({ doc_id: doc._id, ...result, verdict_version: v.version });
});

r.post('/cases/:id/documents/:docId/read', staff, upload.single('image'), async (req, res) => {
  const doc = await Doc.findById(req.params.docId).lean();
  if (!doc) return res.status(404).json({ error: 'document not found' });
  const result =
    doc.kind === 'note'
      ? await readNote(String(doc._id), req.user!.email)
      : await readBill(String(doc._id), req.file ? { b64: req.file.buffer.toString('base64'), mime: req.file.mimetype } : null, req.user!.email);
  const v = await recompute(req.params.id, { actor: req.user!.email, reason: 'document re-read' });
  res.json({ ...result, verdict_version: v.version });
});

r.post('/cases/:id/recompute', staff, async (req, res) => {
  const ai = !!req.body?.ai;
  const v = await recompute(req.params.id, { actor: req.user!.email, ai, reason: ai ? 'AI cross-check and phrasing' : 'manual recompute' });
  res.json({ ok: true, version: v.version, generated_by: v.generated_by, phrased_by: v.phrased_by });
});

// ---- outcome capture (C3)
r.post('/cases/:id/outcome', staff, async (req, res) => {
  const b = z.object({ checkpoint_months: z.union([z.literal(3), z.literal(6), z.literal(12)]), trading: z.boolean(), note: z.string().max(500).default('') }).parse(req.body);
  const o = await Outcome.findOneAndUpdate({ application: req.params.id, checkpoint_months: b.checkpoint_months }, { ...b, application: req.params.id }, { upsert: true, new: true });
  await AuditLog.create({ actor: req.user!.email, action: 'outcome:capture', application: req.params.id, redacted_payload_json: b, output_json: {}, mode: 'human' });
  res.json(o);
});
r.get('/cases/:id/outcomes', staff, async (req, res) => res.json(await Outcome.find({ application: req.params.id }).sort({ checkpoint_months: 1 }).lean()));

// ---- Ask this file (component 8): answers only from this case's evidence, with citations
r.post('/cases/:id/ask', staff, async (req, res) => {
  const b = z.object({ question: z.string().trim().min(2).max(300) }).parse(req.body);
  const app = (await Application.findById(req.params.id).lean()) as Lean;
  if (!app) return res.status(404).json({ error: 'case not found' });
  const shop = (await Shop.findById(app.shop).lean()) as Lean;
  const ev = await EvidenceItem.find({ application: app._id }).lean();
  const findings = await Finding.find({ application: app._id }).lean();
  const items = [...ev.map((e) => ({ id: e.eid as string, label: e.label, text: e.claim_text as string })), ...findings.map((f, i) => ({ id: `F${i + 1}`, label: 'finding', text: f.text as string }))];
  const known = new Set(items.map((i) => i.id));
  const allowed = extractNumbers(items.map((i) => i.text).join(' '));
  const names = [shop.owner_label, shop.label];
  // retrieval: keep items sharing words with the question (falls back to all)
  const q = b.question.toLowerCase();
  const words = q.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  const scored = items.map((i) => ({ i, s: words.filter((w) => i.text.toLowerCase().includes(w)).length })).sort((a, b2) => b2.s - a.s);
  const fallback = () => {
    const top = scored.filter((x) => x.s > 0).slice(0, 2).map((x) => x.i);
    if (!top.length) return { declined: true, answer_en: 'This file cannot answer that. Ask about sales, suppliers, coverage, the bills, the checks or the conditions.', answer_bn: 'এই ফাইল থেকে এর উত্তর দেওয়া যায় না। বিক্রি, সরবরাহকারী, কভারেজ, বিল, পরীক্ষা বা শর্ত নিয়ে জিজ্ঞেস করুন।', cites: [] as string[] };
    return { declined: false, answer_en: top.map((t) => t.text).join(' '), answer_bn: top.map((t) => ev.find((e) => e.eid === t.id)?.claim_text_bn || t.text).join(' '), cites: top.map((t) => t.id) };
  };
  const result = await callJson({
    task: 'ask_file', system: PROMPTS.ask, user: redact(JSON.stringify({ question: b.question, evidence: items }), names).text, schema: AnswerSchema, fallback,
    actor: req.user!.email, application: app._id,
    extraCheck: (d) => {
      if (d.declined) return null;
      const c = validateCitations(d.cites, known);
      const t = validateText(d.answer_en + ' ' + d.answer_bn, allowed);
      return c.ok && t.ok ? null : [...c.problems, ...t.problems].join('; ');
    },
  });
  res.json({ ...result.data, mode: result.mode });
});

export default r;
