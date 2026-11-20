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

async function callAnthropic(system: string, user: string, image?: { b64: string; mime: string }, timeoutMs = config.aiTimeoutMs) {
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
  const resp = await client().messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming, { timeout: timeoutMs });
  if (resp.stop_reason === 'refusal') throw new Error('model declined the request');
  return resp.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

async function callGemini(system: string, user: string, image?: { b64: string; mime: string }, timeoutMs = config.aiTimeoutMs) {
  const parts: unknown[] = [];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.b64 } });
  parts.push({ text: user });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
    if (!r.ok) throw new Error(`gemini http ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 200)}`);
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
  agent?: string;
  run_id?: string;
  timeoutMs?: number; // per-call limit; on timeout the labelled fallback runs
  maxAttempts?: number; // default 2 (one retry); 1 for time-boxed paths such as the simulation
}): Promise<AiResult<T>> {
  const t0 = Date.now();
  const auditInput = { task: opts.task, system: opts.system.slice(0, 4000), user: opts.user.slice(0, 8000), image: opts.image ? `[image ${opts.image.mime}, ${Math.round(opts.image.b64.length * 0.75 / 1024)} KB, not stored]` : undefined };
  let attempts = 0;
  let lastErr = 'no AI key set';
  if (aiKeyPresent()) {
    let userMsg = opts.user;
    for (attempts = 1; attempts <= (opts.maxAttempts ?? 2); attempts++) {
      try {
        const text = config.aiProvider === 'gemini' ? await callGemini(opts.system, userMsg, opts.image, opts.timeoutMs) : await callAnthropic(opts.system, userMsg, opts.image, opts.timeoutMs);
        const parsed = opts.schema.safeParse(extractJson(text));
        if (!parsed.success) throw new Error('schema: ' + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; '));
        const problem = opts.extraCheck?.(parsed.data);
        if (problem) throw new Error('validator: ' + problem);
        const res: AiResult<T> = { data: parsed.data, mode: 'ai', attempts, latency_ms: Date.now() - t0 };
        await AuditLog.create({ actor: opts.actor || 'system', action: `ai:${opts.task}`, application: opts.application, redacted_payload_json: auditInput, output_json: parsed.data, mode: 'ai', latency_ms: res.latency_ms, agent: opts.agent, run_id: opts.run_id, step: opts.task });
        return res;
      } catch (e) {
        lastErr = (e as Error).message;
        userMsg = `${opts.user}\n\nYour previous answer was rejected (${lastErr}). Return only valid JSON that follows every rule.`;
      }
    }
    attempts = opts.maxAttempts ?? 2;
  }
  const data = opts.fallback();
  const res: AiResult<T> = { data, mode: 'demo_fallback', attempts, error: lastErr, latency_ms: Date.now() - t0 };
  await AuditLog.create({ actor: opts.actor || 'system', action: `ai:${opts.task}`, application: opts.application, redacted_payload_json: auditInput, output_json: { fallback: true, reason: lastErr, data }, mode: 'demo_fallback', latency_ms: res.latency_ms, agent: opts.agent, run_id: opts.run_id, step: opts.task });
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

// ---------- v3 loan agents ----------
const clauseNum = nullableNum.optional().transform((v) => v ?? null);
export const ContractSchema = z.object({
  principal_bdt: nullableNum,
  annual_rate_pct: nullableNum,
  tenor_months: nullableNum,
  early_clause: z.string().nullable(),
  late_clause: z.string().nullable(),
  early_rebate_pct: clauseNum,
  late_penalty_pts: clauseNum,
  unclear: z.array(z.object({ clause: z.string(), why_en: z.string(), why_bn: z.string().optional().default('') })).default([]),
  confidence: z.number().min(0).max(1),
});
export type ContractRead = z.infer<typeof ContractSchema>;

export const TextPairSchema = z.object({ text_en: z.string().min(10).max(900), text_bn: z.string().min(10).max(1200) });
export type TextPair = z.infer<typeof TextPairSchema>;

export const PricingSchema = z.object({ rebate_pct: z.number(), penalty_pts: z.number(), reason_en: z.string().max(400), reason_bn: z.string().max(600) });
export type PricingRead = z.infer<typeof PricingSchema>;

export const PaymentMatchSchema = z.object({ loan_ref: z.string().nullable(), confidence: z.number().min(0).max(1), reason: z.string().max(300) });
export type PaymentMatch = z.infer<typeof PaymentMatchSchema>;

export const RepaymentWatchSchema = z.object({
  assessment: z.enum(['real_warning', 'seasonal_pattern', 'no_concern']),
  reason_en: z.string().max(400),
  reason_bn: z.string().max(600),
});
export type RepaymentWatch = z.infer<typeof RepaymentWatchSchema>;

const NO_WORDS = 'Never use the words certificate, guarantee, guaranteed, ensured, secured, or "approved by AI".';

// ---------- Prompts ----------
export const PROMPTS = {
  bill: `You read photos of shop bills, cash memos and invoices from Bangladesh, written in Bangla, English or both.
Return ONLY a JSON object with these keys: document_type, supplier_label, date (YYYY-MM-DD), amount_bdt (number, the total), due_date (YYYY-MM-DD), paid_date (YYYY-MM-DD), language ("bn", "en" or "mixed"), confidence (0..1), field_confidences (object of 0..1 per field), fields_needing_review (array of field names).
Rules: return only what is visible on the image. Use null for anything missing or unreadable. Never guess. Convert Bangla numerals to digits. Dates on the image are day/month/year. Lower the confidence for handwriting or blur and list those fields in fields_needing_review.`,
  note: `You read a short note written by a small-business owner in Bangladesh (usually Bangla).
Return ONLY a JSON object: cash_share (0..1 share of sales taken in cash, or null), margin (0..1 profit margin, or null), seasonal (true/false/null), receivables (array of {party, amount_bdt, days}), concerns (array of short English phrases), claims (array of short English phrases for factual claims the owner makes), language, confidence (0..1).
Rules: only extract what the note states. Use null when it is not stated. Never guess. Convert Bangla numerals.`,
  crosscheck: `You compare evidence about a small business: the owner's own statements, documents matched to the money trail, and figures computed from a mobile-money statement. Each fact has an id.
List contradictions or mismatches between facts. Return ONLY JSON: {"findings":[{"text_en","text_bn","cites":[fact ids],"severity":"low|medium|high"}]}.
Rules: every finding must cite at least two fact ids from the list. Do not invent facts or numbers. Do not call any document fake, forged or false; say "does not match" or "does not reconcile". Return an empty list if nothing conflicts.`,
  phrase: `You write the plain-language summary of a one-page viability file for a licensed lender in Bangladesh, in Bangla and English.
You are given a facts object. Return ONLY JSON: {"summary_en","summary_bn","reasons":[{"en","bn","cites":[fact ids]}, ... exactly 3]}.
Rules: use only numbers that appear in the facts object, written the same way. Every reason cites fact ids from the facts. Never use the words certificate, guarantee, guaranteed, ensured, secured, or "approved by AI". Describe the evidence and the verdict; the decision itself is recorded separately inside the lender's policy, so do not announce approval. Judge the evidence, never the person. If the verdict is not viable or not sure, lead with what can change. Keep each reason under 30 words.`,
  ask: `You answer questions about ONE loan case file using only the evidence items given, each with an id.
Return ONLY JSON: {"declined": boolean, "answer_en", "answer_bn", "cites": [evidence ids]}.
Rules: answer only from the evidence; cite the ids you used. If the question cannot be answered from the evidence, or asks for anything else (advice about a person, other cases, predictions beyond the file), set declined true and say briefly what the file can answer. Use only numbers that appear in the evidence.`,
  contract: `You read a small-business loan contract from Bangladesh (English or Bangla).
Return ONLY JSON: {"principal_bdt","annual_rate_pct","tenor_months","early_clause","late_clause","early_rebate_pct","late_penalty_pts","unclear":[{"clause","why_en","why_bn"}],"confidence"}.
Rules: extract only what the contract states; use null when a term is missing. early_clause and late_clause are the clause texts, copied as written. early_rebate_pct is the share of remaining interest waived on early repayment; late_penalty_pts is the extra percentage points a year on overdue amounts. Set early_rebate_pct or late_penalty_pts only when the clause itself fixes the figure; a clause that points to Annex A with a stated range is clear, and the figure stays null (the Pricing agent sets it inside the range). List in "unclear" every early or late repayment clause that has neither a fixed figure nor a stated range, refers to a verbal or later agreement, or leaves the amount to someone's discretion. Lower the confidence when anything is ambiguous. Never guess.`,
  counteroffer: `You write a counter-offer to a small-business owner in Bangladesh whose loan request is outside the lender's limits, in plain English and plain Bangla.
You are given the request, the limits and the counter-offer figures. Return ONLY JSON: {"text_en","text_bn"}.
Rules: use only the numbers given, written the same way. Say which limit the request crossed, what the lender can offer instead, and that the owner can accept it on their page. Warm and respectful, under 70 words each. Judge the request, never the person. ${NO_WORDS}`,
  pricing: `You set two terms for a small-business loan inside the lender's bands: the early-repayment rebate (share of remaining scheduled interest waived) and the late penalty (extra percentage points a year on overdue amounts).
You are given the contract clauses, the lender's default, minimum and maximum for each, and the borrower's payment history. Return ONLY JSON: {"rebate_pct","penalty_pts","reason_en","reason_bn"}.
Rules: if the contract states a figure, use it. Otherwise start from the default: a borrower who pays suppliers on time may get a slightly higher rebate; a worsening payment record may justify a slightly higher penalty. Stay inside the bands. Explain in one sentence each, using only numbers given. ${NO_WORDS}`,
  feeexplain: `You explain, in plain English and plain Bangla for a shop owner and a small investor, how the interest on one loan is shared between the investors, Bhorsha and the lender.
You are given the figures. Return ONLY JSON: {"text_en","text_bn"}.
Rules: use only the numbers given, written the same way. Mention the borrower rate, the investor rate (bank rate plus 0.25%), Bhorsha's share of the interest for this tenor, and what the lender keeps. Under 90 words each. No promises about returns. ${NO_WORDS}`,
  paymatch: `You match one incoming bKash or bank payment to the right loan when the reference is missing or unclear.
You are given the payment (amount, date, payer token, reference text) and the candidate loans (reference, payer token, next due date and amount, amount overdue). Return ONLY JSON: {"loan_ref": a candidate reference or null, "confidence": 0..1, "reason"}.
Rules: pick only from the candidates. Payer token match is the strongest signal; amount and timing support it. A partial amount or odd timing lowers the confidence. If two loans fit equally, or nothing fits, return null with low confidence. Never guess.`,
  servicer: `You are the Servicer agent. You write one short message to a small-business borrower in Bangladesh, in plain English and plain Bangla: a payment receipt, an early-settlement quote, or a late-payment notice.
You are given the kind of message and the exact amounts. Return ONLY JSON: {"text_en","text_bn"}.
Rules: use only the numbers given, written the same way, with "Tk" or "টাকা". Receipts thank the owner and state what is still due. Quotes state the total and that it is valid on the date given. Late notices are supportive first: state the amount and days overdue, the late fee so far, and invite the owner to talk to the lender. Under 70 words each. ${NO_WORDS}`,
  repaywatch: `You are the Watchman agent. A repayment arrived late or early on a small-business loan in Bangladesh. Decide whether it is a real warning, an expected seasonal pattern, or no concern.
You are given the payment timing, the shop's type, whether its sales are seasonal, the latest sales check against its forecast, any festival nearby, and earlier repayments. Return ONLY JSON: {"assessment":"real_warning|seasonal_pattern|no_concern","reason_en","reason_bn"}.
Rules: a late payment in a known lean season of a seasonal shop, with sales inside the forecast band, is a seasonal pattern. Late payments together with sales below forecast, or repeated late payments, are a real warning. Early or on-time payments are no concern. One sentence each, using only facts given.`,
  checkin: `You read a monthly update from a small-business owner in Bangladesh (Bangla or English, may be speech-to-text).
Return ONLY JSON: {"sales_bdt": number or null, "problems": [short English phrases], "cause_hint": one of stock_problem, fewer_customers, higher_costs, buyers_paying_late, household_mixing, seasonal_normal, none}.
Only extract what is said. Convert Bangla numerals.`,
};
