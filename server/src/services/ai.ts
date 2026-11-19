import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { config, aiKeyPresent } from '../config';
import { AuditLog } from '../models';

// Thin AI wrapper. Every call: redacted input in, JSON out, validated with Zod, retried once,
// and written to the audit log. If there is no key or the call fails, the caller's fallback runs and
// the result is tagged demo_fallback (shown on screen as DEMO FALLBACK). The app never breaks.

let anthropic: Anthropic | null = null;
function client() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: config.anthropicKey, timeout: config.aiTimeoutMs, maxRetries: 1 });
  return anthropic;
}

export type AiMode = 'ai' | 'demo_fallback';
export interface AiResult<T> {
  data: T;
  mode: AiMode;
  attempts: number;
  error?: string;
  latency_ms: number;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('no JSON in response');
  return JSON.parse(body.slice(start, end + 1));
}

async function callAnthropic(system: string, user: string, image?: { b64: string; mime: string }) {
  const content: Anthropic.ContentBlockParam[] = [];
  if (image)
    content.push({ type: 'image', source: { type: 'base64', media_type: image.mime as 'image/png' | 'image/jpeg', data: image.b64 } });
  content.push({ type: 'text', text: user });
  const params = {
    model: config.aiModel,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user' as const, content }],
    output_config: { effort: 'low' },
  };
  const resp = await client().messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
  if (resp.stop_reason === 'refusal') throw new Error('model declined the request');
  return resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

async function callGemini(system: string, user: string, image?: { b64: string; mime: string }) {
  const parts: unknown[] = [];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.b64 } });
  parts.push({ text: user });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.aiTimeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`gemini http ${r.status}`);
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  } finally {
    clearTimeout(timer);
  }
}

export async function callJson<T>(opts: {
  task: string;
  system: string;
  user: string; // must already be redacted
  image?: { b64: string; mime: string };
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  fallback: () => T;
  actor?: string;
  application?: unknown;
  extraCheck?: (d: T) => string | null; // extra validator; return a problem to force a retry
}): Promise<AiResult<T>> {
  const t0 = Date.now();
  const auditInput = { task: opts.task, system: opts.system.slice(0, 4000), user: opts.user.slice(0, 8000), image: opts.image ? `[image ${opts.image.mime}, ${Math.round(opts.image.b64.length * 0.75 / 1024)} KB, not stored]` : undefined };
  let attempts = 0;
  let lastErr = 'no AI key set';
  if (aiKeyPresent()) {
    let userMsg = opts.user;
    for (attempts = 1; attempts <= 2; attempts++) {
      try {
        const text = config.aiProvider === 'gemini' ? await callGemini(opts.system, userMsg, opts.image) : await callAnthropic(opts.system, userMsg, opts.image);
        const parsed = opts.schema.safeParse(extractJson(text));
        if (!parsed.success) throw new Error('schema: ' + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; '));
        const problem = opts.extraCheck?.(parsed.data);
        if (problem) throw new Error('validator: ' + problem);
        const res: AiResult<T> = { data: parsed.data, mode: 'ai', attempts, latency_ms: Date.now() - t0 };
        await AuditLog.create({ actor: opts.actor || 'system', action: `ai:${opts.task}`, application: opts.application, redacted_payload_json: auditInput, output_json: parsed.data, mode: 'ai', latency_ms: res.latency_ms });
        return res;
      } catch (e) {
        lastErr = (e as Error).message;
        userMsg = `${opts.user}\n\nYour previous answer was rejected (${lastErr}). Return only valid JSON that follows every rule.`;
      }
    }
    attempts = 2;
  }
  const data = opts.fallback();
  const res: AiResult<T> = { data, mode: 'demo_fallback', attempts, error: lastErr, latency_ms: Date.now() - t0 };
  await AuditLog.create({ actor: opts.actor || 'system', action: `ai:${opts.task}`, application: opts.application, redacted_payload_json: auditInput, output_json: { fallback: true, reason: lastErr, data }, mode: 'demo_fallback', latency_ms: res.latency_ms });
  return res;
}

// ---------- Schemas ----------
const nullableNum = z.union([z.number(), z.string(), z.null()]).transform((v) => {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d))).replace(/[,\s৳]|tk|bdt/gi, ''));
  return Number.isFinite(n) ? n : null;
});
const dateStr = z.union([z.string(), z.null()]).transform((v) => (v && /\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null));

export const BillSchema = z.object({
  document_type: z.string().nullable(),
  supplier_label: z.string().nullable(),
  date: dateStr,
  amount_bdt: nullableNum,
  due_date: dateStr,
  paid_date: dateStr,
  language: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  field_confidences: z.record(z.number().min(0).max(1)).default({}),
  fields_needing_review: z.array(z.string()).default([]),
});
export type Bill = z.infer<typeof BillSchema>;

export const NoteSchema = z.object({
  cash_share: z.number().min(0).max(1).nullable(),
  margin: z.number().min(0).max(1).nullable().optional(),
  seasonal: z.boolean().nullable(),
  receivables: z.array(z.object({ party: z.string().nullable(), amount_bdt: nullableNum, days: nullableNum })).default([]),
  concerns: z.array(z.string()).default([]),
  claims: z.array(z.string()).default([]).optional(),
  language: z.string().nullable(),
  confidence: z.number().min(0).max(1).default(0.7),
});
export type Note = z.infer<typeof NoteSchema>;

export const FindingsSchema = z.object({
  findings: z.array(z.object({ text_en: z.string(), text_bn: z.string().optional(), cites: z.array(z.string()), severity: z.enum(['low', 'medium', 'high']) })),
});

export const PhraseSchema = z.object({
  summary_en: z.string(),
  summary_bn: z.string(),
  reasons: z.array(z.object({ en: z.string(), bn: z.string(), cites: z.array(z.string()) })).length(3),
});
export type Phrase = z.infer<typeof PhraseSchema>;

export const AnswerSchema = z.object({
  declined: z.boolean(),
  answer_en: z.string(),
  answer_bn: z.string(),
  cites: z.array(z.string()),
});

export const CheckinSchema = z.object({
  sales_bdt: nullableNum,
  problems: z.array(z.string()).default([]),
  cause_hint: z.enum(['stock_problem', 'fewer_customers', 'higher_costs', 'buyers_paying_late', 'household_mixing', 'seasonal_normal', 'none']).default('none'),
});

// ---------- Prompts ----------
export const PROMPTS = {
  bill: `You read photos of shop bills, cash memos and invoices from Bangladesh, written in Bangla, English or both.
Return ONLY a JSON object with these keys: document_type, supplier_label, date (YYYY-MM-DD), amount_bdt (number, the total), due_date (YYYY-MM-DD), paid_date (YYYY-MM-DD), language ("bn", "en" or "mixed"), confidence (0..1), field_confidences (object of 0..1 per field), fields_needing_review (array of field names).
Rules: return only what is visible on the image. Use null for anything missing or unreadable. Never guess. Convert Bangla numerals to digits. Dates on the image are day/month/year. Lower the confidence for handwriting or blur and list those fields in fields_needing_review.`,
  note: `You read a short note written by a small-business owner in Bangladesh (usually Bangla).
Return ONLY a JSON object: cash_share (0..1 share of sales taken in cash, or null), margin (0..1 profit margin, or null), seasonal (true/false/null), receivables (array of {party, amount_bdt, days}), concerns (array of short English phrases), claims (array of short English phrases for factual claims the owner makes), language, confidence (0..1).
Rules: only extract what the note states. Use null when it is not stated. Never guess. Convert Bangla numerals.`,
  crosscheck: `You compare evidence about a small business: the owner's own statements, documents an officer confirmed, and figures computed from a mobile-money statement. Each fact has an id.
List contradictions or mismatches between facts. Return ONLY JSON: {"findings":[{"text_en","text_bn","cites":[fact ids],"severity":"low|medium|high"}]}.
Rules: every finding must cite at least two fact ids from the list. Do not invent facts or numbers. Do not call any document fake, forged or false; say "does not match" or "does not reconcile". Return an empty list if nothing conflicts.`,
  phrase: `You write the plain-language summary of a one-page viability file for a bank manager in Bangladesh, in Bangla and English.
You are given a facts object. Return ONLY JSON: {"summary_en","summary_bn","reasons":[{"en","bn","cites":[fact ids]}, ... exactly 3]}.
Rules: use only numbers that appear in the facts object, written the same way. Every reason cites fact ids from the facts. Never use the words certificate, guarantee, guaranteed, ensured, secured, or "approved by AI". The manager decides: never say the loan is approved. Judge the evidence, never the person. If the verdict is not viable or not sure, lead with what can change. Keep each reason under 30 words.`,
  ask: `You answer questions about ONE loan case file using only the evidence items given, each with an id.
Return ONLY JSON: {"declined": boolean, "answer_en", "answer_bn", "cites": [evidence ids]}.
Rules: answer only from the evidence; cite the ids you used. If the question cannot be answered from the evidence, or asks for anything else (advice about a person, other cases, predictions beyond the file), set declined true and say briefly what the file can answer. Use only numbers that appear in the evidence.`,
  checkin: `You read a monthly update from a small-business owner in Bangladesh (Bangla or English, may be speech-to-text).
Return ONLY JSON: {"sales_bdt": number or null, "problems": [short English phrases], "cause_hint": one of stock_problem, fewer_customers, higher_costs, buyers_paying_late, household_mixing, seasonal_normal, none}.
Only extract what is said. Convert Bangla numerals.`,
};
