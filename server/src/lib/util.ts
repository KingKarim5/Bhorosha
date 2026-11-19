// Small shared helpers: seeded randomness, numerals, statistics, month keys.

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function normal(rng: Rng, mean = 0, sd = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export function bnToLatinDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}
export function latinToBnDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function sd(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
export function cv(xs: number[]) {
  const m = mean(xs);
  return m ? sd(xs) / m : 0;
}
export function quantile(xs: number[], q: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export function slope(ys: number[]) {
  const n = ys.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - xm) * (y - ym);
    den += (i - xm) ** 2;
  });
  return den ? num / den : 0;
}
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const round = (x: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(x * f) / f;
};

export function monthKey(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function addMonths(key: string, n: number) {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}
export function monthsBetween(a: string, b: string) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return yb * 12 + mb - (ya * 12 + ma);
}
export function calMonth(key: string) {
  return Number(key.split('-')[1]);
}

/** Equal monthly instalment (annuity) at an annual rate. */
export function installment(principal: number, annualRate: number, months: number) {
  const r = annualRate / 12;
  if (!months) return principal;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - (1 + r) ** -months);
}

export function fmtBdt(n: number) {
  return Math.round(n).toLocaleString('en-US');
}
