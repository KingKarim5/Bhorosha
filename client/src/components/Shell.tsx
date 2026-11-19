import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/hooks';
import { SyntheticRibbon } from './ui';
import { DemoBadge, Footer } from './Chrome';
import { api } from '../lib/api';
import {
  IconHome, IconFolder, IconPlus, IconPulse, IconShadow, IconGauge, IconScale, IconSliders, IconHand, IconLayers, IconFlow, IconInfo, IconSun, IconMoon, IconLogout,
} from './icons';
import { BRAND } from '../brand';

function Wordmark() {
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-display text-[22px] font-semibold tracking-tight">{BRAND.name}</span>
      <span className="text-[17px] text-accent" style={{ fontFamily: 'Noto Serif Bengali' }}>
        {BRAND.nameBn}
      </span>
    </span>
  );
}

export function TopControls() {
  const { lang, setLang, numerals, setNumerals, t } = useI18n();
  const { isDark, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-lg border border-line overflow-hidden text-[13px] font-semibold" role="group" aria-label={t('Language', 'ভাষা')}>
        <button className={`px-2.5 py-1.5 ${lang === 'bn' ? 'bg-accent text-[#1b1405]' : ''}`} onClick={() => setLang('bn')} aria-pressed={lang === 'bn'}>
          বাংলা
        </button>
        <button className={`px-2.5 py-1.5 ${lang === 'en' ? 'bg-accent text-[#1b1405]' : ''}`} onClick={() => setLang('en')} aria-pressed={lang === 'en'}>
          EN
        </button>
      </div>
      {lang === 'bn' && (
        <button className="chip" onClick={() => setNumerals(numerals === 'bn' ? 'latin' : 'bn')} title={t('Numerals', 'সংখ্যা')} aria-label="Toggle numerals">
          {numerals === 'bn' ? '১২৩' : '123'}
        </button>
      )}
      <button className="btn !min-h-0 !px-2 !py-1.5" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label={t('Toggle theme', 'থিম বদলান')}>
        {isDark ? <IconSun /> : <IconMoon />}
      </button>
    </div>
  );
}

const STAFF_NAV = [
  { to: '/dashboard', en: 'Dashboard', bn: 'ড্যাশবোর্ড', icon: IconHome },
  { to: '/cases', en: 'Cases', bn: 'কেস', icon: IconFolder },
  { to: '/cases/new', en: 'New case', bn: 'নতুন কেস', icon: IconPlus },
  { to: '/watchlist', en: 'Watchlist', bn: 'নজরতালিকা', icon: IconPulse },
  { to: '/shadow', en: 'Shadow mode', bn: 'শ্যাডো মোড', icon: IconShadow },
  { to: '/evaluation', en: 'Evaluation', bn: 'মূল্যায়ন', icon: IconGauge },
  { to: '/fairness', en: 'Fairness & audit', bn: 'ন্যায্যতা ও অডিট', icon: IconScale },
  { to: '/settings', en: 'Lender settings', bn: 'ঋণদাতার সেটিংস', icon: IconSliders },
  { to: '/structure', en: 'Money structure', bn: 'টাকার কাঠামো', icon: IconFlow },
  { to: '/about', en: 'About', bn: 'পরিচিতি', icon: IconInfo },
];
const INVESTOR_NAV = [
  { to: '/invest', en: 'Listings', bn: 'তালিকা', icon: IconLayers },
  { to: '/portfolio', en: 'Portfolio', bn: 'পোর্টফোলিও', icon: IconHand },
  { to: '/invest/verify', en: 'Verification', bn: 'যাচাই', icon: IconScale },
  { to: '/structure', en: 'Money structure', bn: 'টাকার কাঠামো', icon: IconFlow },
  { to: '/evaluation', en: 'Evaluation', bn: 'মূল্যায়ন', icon: IconGauge },
  { to: '/about', en: 'About', bn: 'পরিচিতি', icon: IconInfo },
];

export function Shell({ children }: { children: ReactNode }) {
  const { t, pick } = useI18n();
  const { user, logout } = useAuth();
  const nav = user?.role === 'investor' ? INVESTOR_NAV : STAFF_NAV;
  const loc = useLocation();
  const go = useNavigate();
  const [open, setOpen] = useState(false);
  const [aiMode, setAiMode] = useState<string | null>(null);
  useEffect(() => {
    api('/meta').then((m) => setAiMode(m.ai_mode)).catch(() => undefined);
  }, []);
  useEffect(() => setOpen(false), [loc.pathname]);
  const roleWord = user ? { manager: t('Manager', 'ম্যানেজার'), officer: t('Officer', 'অফিসার'), investor: t('Investor (simulation)', 'বিনিয়োগকারী (সিমুলেশন)') }[user.role] : '';
  return (
    <div className="grain min-h-screen">
      <SyntheticRibbon />
      <div className="relative flex">
        <nav className={`no-print fixed inset-y-0 left-0 z-50 md:sticky md:top-0 md:z-auto h-[100dvh] md:h-[calc(100vh-3px)] w-64 shrink-0 border-r border-line bg-surface p-4 flex flex-col overflow-y-auto transition-transform md:translate-x-0 ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`} aria-label={t('Main', 'প্রধান')}>
          <div className="mb-6 px-2 relative">
            <button className="md:hidden absolute right-0 top-0 btn !min-h-0 !px-2 !py-1" onClick={() => setOpen(false)} aria-label={t('Close menu', 'মেনু বন্ধ করুন')}>
              ✕
            </button>
            <Wordmark />
            <div className="text-[11.5px] text-muted mt-1 leading-snug">{t(BRAND.taglineEn, BRAND.taglineBn)}</div>
          </div>
          <ul className="space-y-0.5">
            {nav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/cases' || item.to === '/invest'}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] ${isActive ? 'bg-raised font-semibold text-accent' : 'text-ink hover:bg-raised'}`}
                >
                  <item.icon />
                  {pick(item)}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6 text-[11.5px] text-muted leading-snug">
            <div className="font-semibold text-ink text-[12.5px]">Team Excuse Me</div>
            <div>Kha Merul Badda, Dhaka</div>
          </div>
        </nav>
        {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
        <div className="flex-1 min-w-0">
          <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line px-4 md:px-8 py-3" style={{ background: 'color-mix(in oklab, var(--bg) 88%, transparent)', backdropFilter: 'blur(6px)' }}>
            <div className="flex items-center gap-3">
              <button className="md:hidden btn !min-h-0 !px-2 !py-1.5" onClick={() => setOpen(true)} aria-label={t('Open menu', 'মেনু খুলুন')}>
                ☰
              </button>
              {user && (
                <span className="chip hidden sm:inline-flex">
                  {roleWord} · {user.display_name}
                </span>
              )}
              <DemoBadge />
              {aiMode && (
                <span className="chip hidden sm:inline-flex" style={{ color: aiMode === 'live' ? 'var(--checked)' : 'var(--unsure)', borderColor: aiMode === 'live' ? 'var(--checked)' : 'var(--unsure)' }}>
                  {aiMode === 'live' ? t('AI: live', 'এআই: চালু') : 'AI: DEMO FALLBACK'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TopControls />
              {user && (
                <button
                  className="btn !min-h-0 !px-2 !py-1.5"
                  onClick={async () => {
                    await logout();
                    go('/');
                  }}
                  aria-label={t('Log out', 'লগ আউট')}
                >
                  <IconLogout />
                </button>
              )}
            </div>
          </header>
          <motion.main key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="px-4 md:px-8 py-6 md:py-8 max-w-[1400px]">
            {children}
          </motion.main>
        </div>
      </div>
    </div>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="grain min-h-screen">
      <SyntheticRibbon />
      <div className="relative z-10">
        <header className="flex items-center justify-between px-4 md:px-10 py-4">
          <NavLink to="/">
            <Wordmark />
          </NavLink>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex">
              <DemoBadge />
            </span>
            <TopControls />
          </div>
        </header>
        {children}
        <Footer />
      </div>
    </div>
  );
}
