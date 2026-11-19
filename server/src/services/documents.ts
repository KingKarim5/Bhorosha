import { Doc, Shop, AuditLog } from '../models';
import { callJson, PROMPTS, BillSchema, NoteSchema, Bill, Note } from './ai';
import { CANNED, NOTES } from '../seed/sampleDocs';
import { redact } from '../lib/redact';
import { bnToLatinDigits } from '../lib/util';

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const BILL_FIELDS = ['document_type', 'supplier_label', 'date', 'amount_bdt', 'due_date', 'paid_date'];

function emptyBill(): Bill {
  return {
    document_type: null, supplier_label: null, date: null, amount_bdt: null, due_date: null, paid_date: null, language: null, confidence: 0,
    field_confidences: Object.fromEntries(BILL_FIELDS.map((f) => [f, 0])), fields_needing_review: BILL_FIELDS,
  };
}

/** Deterministic note reader used as the labelled fallback. Only extracts what is clearly stated. */
export function ruleReadNote(text: string): Note {
  const t = bnToLatinDigits(text);
  const cash = t.match(/(\d{1,3})\s*%[^।.]*(নগদ|cash)/i) || t.match(/(নগদ|cash)[^।.]*?(\d{1,3})\s*%/i);
  const cashPct = cash ? Number(cash[1].match(/\d/) ? cash[1] : cash[2]) : null;
  const margin = t.match(/(লাভ|margin|profit)[^।.]*?(\d{1,3})\s*%/i);
  const notSeasonal = /মৌসুমি\s*(না|নয়)|not seasonal/i.test(t);
  const seasonal = notSeasonal ? false : /মৌসুমি|seasonal/i.test(t) ? true : null;
  const rec = t.match(/([\d,]{5,})\s*টাকা\s*পাওনা[^।]*?(\d{1,3})\s*দিন/);
  return {
    cash_share: cashPct != null ? cashPct / 100 : null,
    margin: margin ? Number(margin[2]) / 100 : null,
    seasonal,
    receivables: rec ? [{ party: null, amount_bdt: Number(rec[1].replace(/,/g, '')), days: Number(rec[2]) }] : [],
    concerns: [],
    claims: [],
    language: /[ঀ-৿]/.test(text) ? 'bn' : 'en',
    confidence: 0.5,
  };
}

export async function readBill(docId: string, image: { b64: string; mime: string } | null, actor: string) {
  const doc = (await Doc.findById(docId).lean()) as Lean;
  if (!doc) throw new Error('document not found');
  const canned = doc.sample_key && CANNED[doc.sample_key] ? (CANNED[doc.sample_key] as unknown as Bill) : null;
  const r = image
    ? await callJson<Bill>({
        task: 'read_bill', system: PROMPTS.bill, user: 'Read this bill. Return the JSON object only.', image, schema: BillSchema,
        fallback: () => canned || emptyBill(), actor, application: doc.application,
      })
    : { data: canned || emptyBill(), mode: 'demo_fallback' as const, attempts: 0, latency_ms: 0, error: 'no image sent' };
  // fields below 0.6 confidence always go to the officer
  const fc = r.data.field_confidences || {};
  const review = new Set([...(r.data.fields_needing_review || []), ...BILL_FIELDS.filter((f) => (fc[f] ?? 0) < 0.6 && (r.data as Lean)[f] != null)]);
  const extracted = { ...r.data, fields_needing_review: [...review] };
  await Doc.updateOne({ _id: docId }, { extracted_json: extracted, field_confidences: fc, read_by: r.mode, confirmed_fields: {}, officer_confirmed: false });
  return { mode: r.mode, extracted, error: r.mode === 'demo_fallback' ? r.error : undefined };
}

export async function readNote(docId: string, actor: string) {
  const doc = (await Doc.findById(docId).lean()) as Lean;
  if (!doc) throw new Error('document not found');
  const shop = (await Shop.findById(doc.shop).lean()) as Lean;
  const text = doc.raw_text || (doc.sample_key ? NOTES[doc.sample_key]?.text : '') || '';
  const red = redact(text, [shop?.owner_label, shop?.owner_label?.split(' ')[0]].filter(Boolean));
  const canned = doc.sample_key && CANNED[doc.sample_key] ? (CANNED[doc.sample_key] as unknown as Note) : null;
  const r = await callJson<Note>({
    task: 'read_note', system: PROMPTS.note, user: `Owner's note:\n${red.text}`, schema: NoteSchema,
    fallback: () => canned || ruleReadNote(text), actor, application: doc.application,
  });
  await Doc.updateOne({ _id: docId }, { extracted_json: r.data, read_by: r.mode });
  return { mode: r.mode, extracted: r.data, redacted_preview: red.text, error: r.mode === 'demo_fallback' ? r.error : undefined };
}

export async function confirmField(docId: string, field: string, value: unknown, confirmed: boolean, actor: string) {
  const doc = await Doc.findById(docId);
  if (!doc) throw new Error('document not found');
  const cf = { ...((doc.confirmed_fields as Lean) || {}) };
  const prev = cf[field];
  if (confirmed) cf[field] = { value, at: new Date(), by: actor };
  else delete cf[field];
  doc.confirmed_fields = cf;
  doc.markModified('confirmed_fields');
  doc.officer_confirmed = Object.keys(cf).length > 0;
  doc.confirmed_at = new Date();
  await doc.save();
  // two confirmations of one field: the last wins and both are in the audit log
  await AuditLog.create({ actor, action: confirmed ? 'officer:confirm_field' : 'officer:untick_field', application: doc.application, redacted_payload_json: { document: String(doc._id), field, value, previous: prev ?? null }, output_json: { confirmed }, mode: 'human' });
  return doc;
}
