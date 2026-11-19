import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

export type Lang = 'bn' | 'en';
type Numerals = 'bn' | 'latin';

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  numerals: Numerals;
  setNumerals: (n: Numerals) => void;
  t: (en: string, bn: string) => string;
  n: (x: number | null | undefined, opts?: { digits?: number }) => string;
  bdt: (x: number | null | undefined) => string;
  pct: (x: number | null | undefined) => string;
  digits: (s: string) => string;
  pick: <T extends { en?: string; bn?: string }>(o: T | null | undefined) => string;
}

const I18n = createContext<Ctx>(null as unknown as Ctx);
const BN = '০১২৩৪৫৬৭৮৯';

function read<T extends string>(k: string, d: T): T {
  try {
    return (localStorage.getItem(k) as T) || d;
  } catch {
    return d;
  }
}
function write(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => read<Lang>('bhorsha_lang', 'bn'));
  const [numerals, setNumState] = useState<Numerals>(() => read<Numerals>('bhorsha_numerals', 'bn'));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    write('bhorsha_lang', l);
  };
  const setNumerals = (x: Numerals) => {
    setNumState(x);
    write('bhorsha_numerals', x);
  };
  const useBn = lang === 'bn' && numerals === 'bn';
  const digits = useCallback((s: string) => (useBn ? s.replace(/[0-9]/g, (d) => BN[Number(d)]) : s), [useBn]);
  const n = useCallback(
    (x: number | null | undefined, opts: { digits?: number } = {}) => {
      if (x === null || x === undefined || Number.isNaN(x)) return '—';
      const s = x.toLocaleString('en-IN', { maximumFractionDigits: opts.digits ?? 0, minimumFractionDigits: opts.digits ?? 0 });
      return digits(s);
    },
    [digits],
  );
  const value: Ctx = {
    lang,
    setLang,
    numerals,
    setNumerals,
    t: (en, bn) => (lang === 'bn' ? bn : en),
    n,
    bdt: (x) => (x === null || x === undefined ? '—' : lang === 'bn' ? `৳ ${n(x)}` : `${n(x)} BDT`),
    pct: (x) => (x === null || x === undefined ? '—' : `${n(x)}%`),
    digits,
    pick: (o) => (o ? (lang === 'bn' ? digits(o.bn || o.en || '') : o.en || o.bn || '') : ''),
  };
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);
