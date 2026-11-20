import crypto from 'crypto';
import { bnToLatinDigits } from './util';

// Bangladesh NID checks (v3). The AI reads the card; this code decides. These are format and consistency
// checks only: they cannot prove a card is genuine. That needs the Election Commission's NID verification
// service through a licensed partner, which this demo does not connect to.

export interface NidRead {
  is_nid_card: boolean;
  name_en: string | null;
  name_bn: string | null;
  father_name: string | null;
  mother_name: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  nid_number: string | null;
  confidence: number;
  tamper_signs: string[];
}

export interface NidCheck {
  key: string;
  pass: boolean;
  en: string;
  bn: string;
}

export function normaliseNid(raw: string | null | undefined) {
  return bnToLatinDigits(raw || '').replace(/\D/g, '');
}

/** Smart card: 10 digits. Old laminated card: 13 digits, or 17 digits starting with the birth year. */
export function nidType(num: string): 'smart_10' | 'old_13' | 'old_17' | null {
  if (/^\d{10}$/.test(num)) return 'smart_10';
  if (/^\d{13}$/.test(num)) return 'old_13';
  if (/^\d{17}$/.test(num)) return 'old_17';
  return null;
}

export function ageOn(dobIso: string, todayIso: string) {
  const d = new Date(dobIso + 'T00:00:00Z');
  const t = new Date(todayIso + 'T00:00:00Z');
  let age = t.getUTCFullYear() - d.getUTCFullYear();
  if (t.getUTCMonth() < d.getUTCMonth() || (t.getUTCMonth() === d.getUTCMonth() && t.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);

/** At least one real name word in common (accounts often hold a short name or nickname). */
export function namesMatch(cardName: string | null, accountName: string) {
  if (!cardName) return false;
  const a = new Set(words(cardName));
  return words(accountName).some((w) => a.has(w));
}

/** One-way fingerprint of the NID number, so the same card cannot verify two accounts; the number itself is not stored. */
export function nidFingerprint(num: string, secret: string) {
  return crypto.createHmac('sha256', secret).update('nid:' + num).digest('hex');
}

export function checkNid(r: NidRead, accountName: string, todayIso: string, duplicate: boolean) {
  const num = normaliseNid(r.nid_number);
  const type = nidType(num);
  const dobOk = !!r.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth) && !Number.isNaN(new Date(r.date_of_birth).getTime());
  const age = dobOk ? ageOn(r.date_of_birth!, todayIso) : null;
  const checks: NidCheck[] = [
    { key: 'is_card', pass: r.is_nid_card, en: r.is_nid_card ? 'The photo shows a Bangladesh NID card.' : 'The photo does not look like a Bangladesh NID card.', bn: r.is_nid_card ? 'ছবিতে বাংলাদেশের জাতীয় পরিচয়পত্র দেখা যাচ্ছে।' : 'ছবিটি বাংলাদেশের জাতীয় পরিচয়পত্রের মতো দেখাচ্ছে না।' },
    { key: 'readable', pass: r.confidence >= 0.7, en: r.confidence >= 0.7 ? `The card was read clearly (${Math.round(r.confidence * 100)}% confidence).` : `The card was hard to read (${Math.round(r.confidence * 100)}% confidence). Retake it in good light, flat and in focus.`, bn: r.confidence >= 0.7 ? `কার্ডটি পরিষ্কার পড়া গেছে (${Math.round(r.confidence * 100)}%)।` : `কার্ডটি পড়া কঠিন ছিল (${Math.round(r.confidence * 100)}%)। ভালো আলোয়, সোজা করে, স্পষ্ট ছবি তুলুন।` },
    { key: 'number_format', pass: !!type, en: type ? `NID number has a valid shape (${type === 'smart_10' ? '10-digit smart card' : type === 'old_13' ? '13-digit card' : '17-digit card'}).` : 'The NID number is not 10, 13 or 17 digits.', bn: type ? 'জাতীয় পরিচয়পত্র নম্বরের গঠন ঠিক আছে।' : 'জাতীয় পরিচয়পত্র নম্বর ১০, ১৩ বা ১৭ অঙ্কের নয়।' },
  ];
  if (type === 'old_17') {
    const yr = num.slice(0, 4);
    const ok = dobOk && r.date_of_birth!.startsWith(yr);
    checks.push({ key: 'number_vs_birth_year', pass: ok, en: ok ? 'The 17-digit number starts with the birth year, as it should.' : `The 17-digit number starts with ${yr}, which does not match the date of birth.`, bn: ok ? '১৭ অঙ্কের নম্বর জন্মসাল দিয়ে শুরু, যেমন হওয়া উচিত।' : `১৭ অঙ্কের নম্বর ${yr} দিয়ে শুরু, যা জন্মতারিখের সাথে মেলে না।` });
  }
  checks.push({ key: 'adult', pass: age != null && age >= 18 && age <= 100, en: age == null ? 'The date of birth could not be read.' : age >= 18 && age <= 100 ? `Age ${age}: an adult.` : `Age ${age}: investors must be 18 or older.`, bn: age == null ? 'জন্মতারিখ পড়া যায়নি।' : age >= 18 && age <= 100 ? `বয়স ${age}: প্রাপ্তবয়স্ক।` : `বয়স ${age}: বিনিয়োগকারীর বয়স অন্তত ১৮ হতে হবে।` });
  const nameOk = namesMatch(r.name_en, accountName);
  checks.push({ key: 'name_match', pass: nameOk, en: nameOk ? 'The name on the card matches your account.' : `The name on the card (${r.name_en || 'unreadable'}) does not match your account name (${accountName}).`, bn: nameOk ? 'কার্ডের নাম আপনার অ্যাকাউন্টের নামের সাথে মেলে।' : 'কার্ডের নাম আপনার অ্যাকাউন্টের নামের সাথে মেলে না।' });
  checks.push({ key: 'no_tamper', pass: r.tamper_signs.length === 0, en: r.tamper_signs.length ? `Possible signs of editing: ${r.tamper_signs.join('; ')}.` : 'No signs of editing were seen.', bn: r.tamper_signs.length ? 'সম্পাদনার সম্ভাব্য চিহ্ন দেখা গেছে।' : 'সম্পাদনার কোনো চিহ্ন দেখা যায়নি।' });
  checks.push({ key: 'not_reused', pass: !duplicate, en: duplicate ? 'This NID is already used by another investor account.' : 'This NID is not used by any other account.', bn: duplicate ? 'এই জাতীয় পরিচয়পত্র আরেকটি বিনিয়োগকারী অ্যাকাউন্টে ব্যবহৃত হয়েছে।' : 'এই জাতীয় পরিচয়পত্র অন্য কোনো অ্যাকাউন্টে ব্যবহৃত হয়নি।' });
  const pass = checks.every((c) => c.pass);
  return { pass, checks, number: num, type, age };
}

export const maskNid = (num: string) => (num.length >= 4 ? `${'•'.repeat(Math.max(0, num.length - 4))}${num.slice(-4)}` : '');
