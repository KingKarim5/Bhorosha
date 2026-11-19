import { bnToLatinDigits } from './util';

// Redact before anything goes to a model (hard rule 8).

const PHONE = /(?:\+?880[\s-]?|0)1[3-9]\d{2}[\s-]?\d{6}/g; // BD mobile: 01X XXXXXXXX or +880 1X...
const LONG_DIGITS = /\b\d{10,17}\b/g; // NID (10/13/17 digits) and other ID-like runs

export interface RedactResult {
  text: string;
  tokens: Record<string, string>;
}

export function redact(input: string, names: string[] = []): RedactResult {
  const tokens: Record<string, string> = {};
  let text = input;
  let p = 0;
  let id = 0;
  let person = 0;
  // normalise Bangla digits for detection, but keep original text structure by working on the normalised copy
  text = bnToLatinDigits(text);
  text = text.replace(PHONE, (m) => {
    const t = `PHONE_${++p}`;
    tokens[t] = m;
    return t;
  });
  text = text.replace(LONG_DIGITS, (m) => {
    const t = `ID_${++id}`;
    tokens[t] = m;
    return t;
  });
  const uniq = [...new Set(names.filter((n) => n && n.trim().length >= 2))].sort((a, b) => b.length - a.length);
  for (const n of uniq) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'gi');
    if (re.test(text)) {
      const t = `PERSON_${++person}`;
      tokens[t] = n;
      text = text.replace(re, t);
    }
  }
  return { text, tokens };
}

export function redactDeep<T>(obj: T, names: string[] = []): T {
  if (typeof obj === 'string') return redact(obj, names).text as unknown as T;
  if (Array.isArray(obj)) return obj.map((x) => redactDeep(x, names)) as unknown as T;
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = redactDeep(v, names);
    return out as T;
  }
  return obj;
}
