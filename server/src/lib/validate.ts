import { FORBIDDEN_WORDS } from '../brand';
import { bnToLatinDigits } from './util';

// Validator for AI-written text (hard rule 6: no invented numbers; rule 4: forbidden words).

const BN_FORBIDDEN = ['গ্যারান্টি', 'সার্টিফিকেট', 'সনদ'];

/** Extract numbers written in text, normalising Bangla digits, thousands separators and lakh grouping. */
export function extractNumbers(text: string): number[] {
  const t = bnToLatinDigits(text);
  const out: number[] = [];
  const re = /(?<![A-Za-z_])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const whole = m[1].replace(/,/g, '');
    const n = Number(m[2] ? `${whole}.${m[2]}` : whole);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function numberAllowed(n: number, allowed: number[]): boolean {
  if (n <= 12 && Number.isInteger(n)) return true; // small counting words: "three reasons", "2 parts", "12 months"
  return allowed.some((a) => {
    if (a === n) return true;
    const tol = Math.max(0.5, Math.abs(a) * 0.005);
    if (Math.abs(a - n) <= tol) return true;
    // percentages may be written as 0.62 or 62
    if (Math.abs(a * 100 - n) <= 0.6 || Math.abs(a - n * 100) <= 0.6) return true;
    return false;
  });
}

export function findForbidden(text: string): string[] {
  const low = text.toLowerCase();
  return [...FORBIDDEN_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(low)), ...BN_FORBIDDEN.filter((w) => text.includes(w))];
}

export interface ValidationResult {
  ok: boolean;
  problems: string[];
}

export function validateText(text: string, allowed: number[]): ValidationResult {
  const problems: string[] = [];
  // ids like E3, F2, R1 are citations, not numbers
  const stripped = text.replace(/\b[A-Z]{1,3}_?\d+\b/g, ' ');
  for (const n of extractNumbers(stripped)) if (!numberAllowed(n, allowed)) problems.push(`number not supplied: ${n}`);
  for (const w of findForbidden(text)) problems.push(`forbidden word: ${w}`);
  return { ok: problems.length === 0, problems };
}

export function validateCitations(cited: string[], known: Set<string>): ValidationResult {
  const bad = cited.filter((c) => !known.has(c));
  return { ok: bad.length === 0 && cited.length > 0, problems: bad.length ? [`unknown ids: ${bad.join(', ')}`] : cited.length ? [] : ['no citation'] };
}
