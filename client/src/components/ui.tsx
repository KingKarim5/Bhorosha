import { ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { IconCheck, IconSpeech, IconLeaf, IconQuestion, IconPause, IconInfo } from './icons';
import { useReducedMotion } from '../lib/hooks';

export type VerdictKey = 'viable' | 'not_sure' | 'not_viable';
export const VERDICT_WORDS: Record<VerdictKey, { en: string; bn: string }> = {
  viable: { en: 'Viable', bn: 'টেকসই' },
  not_sure: { en: 'Not sure', bn: 'নিশ্চিত নয়' },
  not_viable: { en: 'Not viable', bn: 'এখন টেকসই নয়' },
};
const VCOLOR: Record<VerdictKey, string> = { viable: 'var(--viable)', not_sure: 'var(--unsure)', not_viable: 'var(--notviable)' };

/** Kept for compatibility: the loud ribbon is now a slim animated line; the honest label lives in the header badge. */
export function SyntheticRibbon() {
  return <div className="top-shimmer" aria-hidden />;
}

export function SimulationBanner({ extra }: { extra?: string }) {
  const { t } = useI18n();
  return (
    <div role="note" className="rounded-xl border-2 border-dashed px-4 py-3 mb-5 text-sm font-semibold" style={{ borderColor: 'var(--owner)', color: 'var(--ink)', background: 'color-mix(in oklab, var(--owner) 12%, transparent)' }}>
      <div>{t('SIMULATION: no real money, no real investors.', 'সিমুলেশন: কোনো আসল টাকা নেই, কোনো আসল বিনিয়োগকারী নেই।')}</div>
      <div className="font-normal text-muted mt-0.5">{extra || t('Investors can lose money. No return is projected or promised. A licensed partner (simulated) holds all funds; Bhorsha never does.', 'বিনিয়োগে লোকসান হতে পারে। কোনো মুনাফার পূর্বাভাস বা প্রতিশ্রুতি নেই। সব টাকা লাইসেন্সপ্রাপ্ত অংশীদারের (সিমুলেটেড) কাছে থাকে; ভরসা কখনো টাকা রাখে না।')}</div>
    </div>
  );
}

export function ModeBadge({ mode }: { mode?: string | null }) {
  const { t } = useI18n();
  if (!mode) return null;
  if (mode === 'ai')
    return <span className="chip" style={{ borderColor: 'var(--checked)', color: 'var(--checked)' }} title={t('Read by the AI model; an officer still confirms each field', 'এআই মডেল পড়েছে; অফিসার প্রতিটি ঘর নিশ্চিত করবেন')}>AI</span>;
  if (mode === 'template') return <span className="chip text-muted">{t('Template text', 'টেমপ্লেট লেখা')}</span>;
  return (
    <span className="chip" style={{ borderColor: 'var(--unsure)', color: 'var(--unsure)' }} title={t('No AI key set or the AI call failed: canned output for the seed documents', 'এআই কী নেই বা কল ব্যর্থ: সিড ডকুমেন্টের জন্য তৈরি উত্তর')}>
      DEMO FALLBACK
    </span>
  );
}

export function ProofLabel({ label, compact }: { label: 'checked' | 'owner_says'; compact?: boolean }) {
  const { t } = useI18n();
  const checked = label === 'checked';
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" title={checked ? t('Checked against a statement, a calculation or an officer-confirmed document', 'স্টেটমেন্ট, হিসাব বা অফিসার-নিশ্চিত কাগজের সাথে মিলিয়ে দেখা') : t("Only the owner's word so far", 'এখন পর্যন্ত শুধু মালিকের কথা')}>
      <span className={`inline-block h-2.5 w-7 rounded-sm ${checked ? '' : 'hatch'}`} style={checked ? { background: 'var(--checked)' } : { border: '1px solid var(--owner)' }} />
      {!compact && (
        <span className="text-[12px] font-semibold" style={{ color: checked ? 'var(--checked)' : 'var(--owner)' }}>
          {checked ? <IconCheck width={12} height={12} className="inline -mt-0.5 mr-0.5" /> : <IconSpeech width={12} height={12} className="inline -mt-0.5 mr-0.5" />}
          {checked ? t('Checked', 'যাচাই করা') : t('Owner says', 'মালিক বলছেন')}
        </span>
      )}
    </span>
  );
}

/** File-level proof ribbon: share of claims checked vs owner says. */
export function ProofSummary({ checked, total }: { checked: number; total: number }) {
  const { t, n } = useI18n();
  const reduce = useReducedMotion();
  const share = total ? checked / total : 0;
  return (
    <div>
      <div className="flex justify-between text-[12px] font-semibold mb-1">
        <span style={{ color: 'var(--checked)' }}>{t('Checked', 'যাচাই করা')} {n(checked)}</span>
        <span style={{ color: 'var(--owner)' }}>{t('Owner says', 'মালিক বলছেন')} {n(total - checked)}</span>
      </div>
      <div className="h-3 w-full rounded-sm overflow-hidden flex hatch-soft" style={{ border: '1px solid var(--line)' }} aria-label={t(`${checked} of ${total} claims checked`, `${total}টির মধ্যে ${checked}টি দাবি যাচাই করা`)} role="img">
        <motion.div initial={{ width: reduce ? `${share * 100}%` : 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} style={{ background: 'var(--checked)' }} />
      </div>
    </div>
  );
}

export function CoverageRing({ pct, size = 104, sentence = true }: { pct: number; size?: number; sentence?: boolean }) {
  const { t, n } = useI18n();
  const reduce = useReducedMotion();
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const low = pct < 50;
  return (
    <div className="flex flex-col items-center text-center">
      <svg width={size} height={size} role="img" aria-label={t(`Evidence sees about ${pct}% of turnover`, `প্রমাণে মোট বিক্রির প্রায় ${pct}% দেখা যায়`)}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={5} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke={low ? 'var(--unsure)' : 'var(--checked)'} strokeWidth={5} fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: reduce ? c * (1 - pct / 100) : c }} animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 0.9, ease: 'easeOut' }} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="num" fontSize={size / 4.2} fill="currentColor" fontWeight={600}>
          {n(pct)}%
        </text>
      </svg>
      {sentence && (
        <p className="text-[12.5px] text-muted mt-1 max-w-[220px] leading-snug">
          {low
            ? t(`The wallet sees about ${pct}% of sales. The rest is cash the owner reports, so the band is wider.`, `ওয়ালেটে বিক্রির প্রায় ${n(pct)}% দেখা যায়। বাকিটা মালিকের জানানো নগদ, তাই সীমা চওড়া।`)
            : t(`The wallet sees about ${pct}% of sales.`, `ওয়ালেটে বিক্রির প্রায় ${n(pct)}% দেখা যায়।`)}
        </p>
      )}
    </div>
  );
}

export function VerdictTag({ verdict, low, high, showAdvice = true }: { verdict: VerdictKey; low?: number; high?: number; showAdvice?: boolean }) {
  const { t, pick, n } = useI18n();
  const Icon = verdict === 'viable' ? IconLeaf : verdict === 'not_sure' ? IconQuestion : IconPause;
  const col = VCOLOR[verdict];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-semibold" style={{ color: col, border: `1.5px solid ${col}`, background: `color-mix(in oklab, ${col} 10%, transparent)` }}>
        <Icon width={17} height={17} />
        {pick(VERDICT_WORDS[verdict])}
      </span>
      {low != null && high != null && (
        <div className="min-w-[160px]">
          <div className="text-[11.5px] text-muted">{t('Likely still trading in 12 months', '১২ মাস পরেও চালু থাকার সম্ভাবনা')}</div>
          <div className="relative h-2 w-40 rounded-full mt-1" style={{ background: 'var(--line)' }} role="img" aria-label={`${low}% – ${high}%`}>
            <div className="absolute h-2 rounded-full" style={{ left: `${low}%`, width: `${Math.max(2, high - low)}%`, background: col }} />
          </div>
          <div className="num text-[12px] mt-0.5">
            {n(low)}% – {n(high)}%
          </div>
        </div>
      )}
      {showAdvice && <span className="text-[12.5px] italic text-muted">{t('Advice for the manager. The decision is yours.', 'ম্যানেজারের জন্য পরামর্শ। সিদ্ধান্ত আপনার।')}</span>}
    </div>
  );
}

export function VerdictChip({ verdict }: { verdict?: VerdictKey | null }) {
  const { pick } = useI18n();
  if (!verdict) return <span className="chip text-muted">—</span>;
  const Icon = verdict === 'viable' ? IconLeaf : verdict === 'not_sure' ? IconQuestion : IconPause;
  return (
    <span className="chip" style={{ color: VCOLOR[verdict], borderColor: VCOLOR[verdict] }}>
      <Icon width={13} height={13} />
      {pick(VERDICT_WORDS[verdict])}
    </span>
  );
}

export function Sparkline({ values, w = 120, h = 30, pulse = false, color = 'var(--accent)' }: { values: number[]; w?: number; h?: number; pulse?: boolean; color?: string }) {
  if (!values?.length) return <svg width={w} height={h} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values) * 0.8;
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      {pulse && (
        <circle cx={last[0]} cy={last[1]} r={3} fill="var(--unsure)">
          <animate attributeName="r" values="3;7;3" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.3;1" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}

export function Card({ title, children, right, className = '' }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 md:p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && <h3 className="font-display text-[17px] font-semibold">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="font-display text-[28px] md:text-[34px] font-semibold leading-tight">{title}</h1>
        {sub && <p className="text-muted mt-1 max-w-2xl">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Planned({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--muted)' }}>
      {children || t('Planned', 'পরিকল্পিত')}
    </span>
  );
}

export function Skeleton({ h = 16, w = '100%', className = '' }: { h?: number; w?: number | string; className?: string }) {
  return <div className={`rounded animate-pulse ${className}`} style={{ height: h, width: w, background: 'color-mix(in oklab, var(--line) 70%, transparent)' }} />;
}

export function FileSkeleton() {
  return (
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-6">
      <div className="sheet p-8 space-y-4">
        <Skeleton h={28} w="60%" />
        <Skeleton h={14} w="40%" />
        <Skeleton h={60} />
        <Skeleton h={14} />
        <Skeleton h={14} w="90%" />
        <Skeleton h={14} w="80%" />
        <Skeleton h={90} />
      </div>
      <div className="space-y-4">
        <Skeleton h={140} />
        <Skeleton h={220} />
      </div>
    </div>
  );
}

export function ErrorNote({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'color-mix(in oklab, var(--notviable) 12%, transparent)', color: 'var(--notviable)' }}>
      {msg}
    </div>
  );
}

export function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button type="button" className="text-muted align-middle" aria-label={text} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}>
        <IconInfo width={15} height={15} />
      </button>
      {open && <span className="absolute z-40 left-0 top-6 w-64 card p-2 text-[12.5px] shadow-lg">{text}</span>}
    </span>
  );
}
