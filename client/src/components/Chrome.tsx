import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { BRAND } from '../brand';

/** True when the dark theme is showing (manual toggle or system preference). */
export function useIsDark() {
  const read = () => {
    const a = document.documentElement.getAttribute('data-theme');
    return a ? a === 'dark' : !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  };
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const f = () => setDark(read());
    mq?.addEventListener('change', f);
    return () => {
      mo.disconnect();
      mq?.removeEventListener('change', f);
    };
  }, []);
  return dark;
}

/** Slim animated gold line across the top of every page. */
export function TopShimmer() {
  return <div className="top-shimmer" aria-hidden />;
}

/** Small, honest label: this build runs on synthetic data. */
export function DemoBadge() {
  const { t } = useI18n();
  return (
    <span className="chip !text-[11.5px] !py-0.5" title={t('This prototype runs on synthetic demo data. Not real borrowers or real lending decisions.', 'এই প্রোটোটাইপ কৃত্রিম ডেমো তথ্যে চলে। বাস্তব ঋণগ্রহীতা বা বাস্তব ঋণের সিদ্ধান্ত নয়।')}>
      <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
      {t('Demo data', 'ডেমো তথ্য')}
    </span>
  );
}

/** Card that tilts in 3D under the pointer. */
export function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [9, -9]), { stiffness: 180, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-11, 11]), { stiffness: 180, damping: 18 });
  const glowX = useTransform(mx, [-0.5, 0.5], ['0%', '100%']);
  const glowY = useTransform(my, [-0.5, 0.5], ['0%', '100%']);
  return (
    <motion.div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className={`relative ${className}`}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 [div:hover>&]:opacity-100"
        style={{ background: useTransform([glowX, glowY], ([x, y]) => `radial-gradient(400px circle at ${x} ${y}, color-mix(in oklab, var(--accent) 22%, transparent), transparent 60%)`) }}
      />
      {children}
    </motion.div>
  );
}

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="relative border-t border-line mt-10">
      <div className="max-w-6xl mx-auto px-5 md:px-10 py-10 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[24px] font-semibold">{BRAND.name}</span>
            <span className="text-[19px] text-accent" style={{ fontFamily: 'Noto Serif Bengali, serif' }}>
              {BRAND.nameBn}
            </span>
          </div>
          <p className="text-muted mt-2 max-w-sm text-[14.5px]">{t(BRAND.taglineEn, BRAND.taglineBn)}</p>
        </div>
        <div>
          <div className="label uppercase tracking-[0.14em] !text-[11.5px]">{t('Built by', 'নির্মাতা')}</div>
          <div className="mt-2 font-semibold text-[16px]">{BRAND.team}</div>
          <div className="text-muted text-[14.5px]">{BRAND.teamPlace}</div>
        </div>
        <div>
          <div className="label uppercase tracking-[0.14em] !text-[11.5px]">{t('Explore', 'ঘুরে দেখুন')}</div>
          <ul className="mt-2 space-y-1.5 text-[14.5px]">
            <li><Link className="hover:text-accent" to="/login">{t('Open the demo', 'ডেমো খুলুন')}</Link></li>
            <li><Link className="hover:text-accent" to="/about">{t('About Bhorsha', 'ভরসা পরিচিতি')}</Link></li>
            <li><Link className="hover:text-accent" to="/evaluation">{t('Evaluation', 'মূল্যায়ন')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-5 md:px-10 pb-8 flex flex-wrap justify-between gap-2 text-[12.5px] text-muted">
        <span>© 2026 Team Excuse Me · Bhorsha</span>
        <span>{t('Prototype running on synthetic data', 'কৃত্রিম তথ্যে চলা প্রোটোটাইপ')}</span>
      </div>
    </footer>
  );
}
