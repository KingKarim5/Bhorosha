import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { BRAND } from '../brand';
import { TopControls } from '../components/Shell';
import { TopShimmer, DemoBadge, Marquee, TiltCard, Footer, useIsDark } from '../components/Chrome';
import { VerdictTag, CoverageRing, ProofSummary, Sparkline, ProofLabel } from '../components/ui';
import { IconDoc, IconCheck, IconPulse } from '../components/icons';

const Hero3D = lazy(() => import('../components/Hero3D'));

const fade = (d = 0) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.7, ease: [0.22, 1, 0.36, 1] } });

/** A live, floating miniature of the real viability file. */
function FloatingFile() {
  const { t } = useI18n();
  const runway = [38, 39.5, 40, 41.6, 41, 42.8, 43.5, 44.1, 45.6, 45, 46.3, 47.2];
  return (
    <motion.div
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      className="relative"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="sheet p-6 w-[min(420px,88vw)]" style={{ transform: 'perspective(1400px) rotateY(-16deg) rotateX(7deg) rotateZ(1deg)', boxShadow: '0 50px 90px -30px rgba(0,0,0,.65), 0 0 0 1px rgba(0,0,0,.04)' }}>
        <div className="text-[10.5px] uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
          {t('Viability file', 'টেকসইতার ফাইল')}
        </div>
        <div className="font-display text-[22px] font-semibold mt-0.5">Rahima Tea &amp; Grocery</div>
        <div className="mt-3">
          <VerdictTag verdict="viable" low={72} high={88} showAdvice={false} />
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-4 items-center mt-4">
          <CoverageRing pct={40} size={78} sentence={false} />
          <div>
            <ProofSummary checked={7} total={12} />
            <div className="mt-2">
              <Sparkline values={runway} w={230} h={42} />
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-2"><span>{t('Supplier paid on time', 'সময়মতো সরবরাহকারীকে পরিশোধ')}</span><ProofLabel label="checked" /></div>
          <div className="flex justify-between gap-2"><span>{t('60% of sales in cash', '৬০% বিক্রি নগদে')}</span><ProofLabel label="owner_says" /></div>
        </div>
      </div>
      {/* floating chips around the sheet */}
      <motion.div className="absolute z-10 -left-10 -top-5 hidden sm:inline-flex chip shadow-xl !py-1.5 !px-3 !bg-surface" animate={{ y: [0, 8, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}>
        <IconCheck width={14} height={14} style={{ color: 'var(--checked)' }} /> {t('Bill read · officer ticked', 'বিল পড়া · অফিসার টিক দিয়েছেন')}
      </motion.div>
      <motion.div className="absolute z-10 -right-4 -bottom-5 hidden sm:inline-flex chip shadow-xl !py-1.5 !px-3 !bg-surface" animate={{ y: [0, -9, 0] }} transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}>
        <IconPulse width={14} height={14} style={{ color: 'var(--unsure)' }} /> {t('Watchman: holding', 'ওয়াচম্যান: ঠিক আছে')}
      </motion.div>
    </motion.div>
  );
}

export default function Landing() {
  const { t } = useI18n();
  const dark = useIsDark();
  const [webgl, setWebgl] = useState(true);
  useEffect(() => {
    try {
      setWebgl(!!document.createElement('canvas').getContext('webgl2'));
    } catch {
      setWebgl(false);
    }
  }, []);
  const steps = [
    { icon: IconDoc, en: 'Reads', bn: 'পড়ে', den: 'Wallet statement, bill photos, a Bangla note.', dbn: 'ওয়ালেট স্টেটমেন্ট, বিলের ছবি, বাংলা নোট।' },
    { icon: IconCheck, en: 'Proves', bn: 'যাচাই করে', den: 'Every claim: checked, or owner says.', dbn: 'প্রতিটি দাবি: যাচাই করা, নাকি মালিকের কথা।' },
    { icon: IconPulse, en: 'Watches', bn: 'নজর রাখে', den: 'Warns early, never cries wolf in a lean season.', dbn: 'আগেই সতর্ক করে, মৌসুমি মন্দায় অকারণে নয়।' },
  ];
  return (
    <div className="min-h-screen overflow-x-hidden">
      <TopShimmer />
      {/* ---------- hero ---------- */}
      <section className="relative min-h-[100svh] flex flex-col hero-bg">
        {webgl && (
          <Suspense fallback={null}>
            <Hero3D dark={dark} />
          </Suspense>
        )}
        <div className="absolute inset-0 pointer-events-none hero-vignette" />
        <header className="relative z-10 flex items-center justify-between px-5 md:px-10 py-5">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-display text-[24px] font-semibold tracking-tight">{BRAND.name}</span>
            <span className="text-[19px] text-accent" style={{ fontFamily: 'Noto Serif Bengali, serif' }}>
              {BRAND.nameBn}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex">
              <DemoBadge />
            </span>
            <TopControls />
          </div>
        </header>
        <div className="relative z-10 flex-1 flex items-center">
          <div className="w-full max-w-6xl mx-auto px-5 md:px-10 pb-24 pt-6">
            <motion.h1 {...fade(0.1)} className="text-[40px] sm:text-[56px] md:text-[76px] leading-[1.12] font-semibold max-w-4xl" style={{ fontFamily: 'Noto Serif Bengali, serif', textShadow: dark ? '0 2px 30px rgba(0,0,0,.55)' : 'none' }}>
              প্রমাণ দেখে ঋণ দিন।
              <br />
              <span className="shimmer-text">বিপদের আগেই সজাগ থাকুন।</span>
            </motion.h1>
            <motion.p {...fade(0.35)} className="font-display text-[22px] md:text-[30px] text-muted mt-4">
              {BRAND.taglineEn}
            </motion.p>
            <motion.div {...fade(0.55)} className="flex flex-wrap gap-3 mt-9">
              <Link to="/login" className="btn btn-primary text-[17px] !px-7 !py-3.5 glow-btn">
                {t('Open the demo', 'ডেমো খুলুন')} →
              </Link>
              <a href="#how" className="btn text-[16px] !px-6 !py-3.5 backdrop-blur" style={{ background: 'color-mix(in oklab, var(--surface) 55%, transparent)' }}>
                {t('How it works', 'কীভাবে কাজ করে')}
              </a>
            </motion.div>
          </div>
        </div>
        <motion.a href="#how" initial={{ opacity: 0 }} animate={{ opacity: 1, y: [0, 8, 0] }} transition={{ delay: 1.6, duration: 2.2, repeat: Infinity }} className="relative z-10 mx-auto mb-6 text-muted text-[13px] tracking-[0.2em] uppercase" aria-label="Scroll">
          ↓
        </motion.a>
      </section>

      <Marquee />

      {/* ---------- how it works ---------- */}
      <section id="how" className="max-w-6xl mx-auto px-5 md:px-10 py-24 grid lg:grid-cols-[1fr_1.05fr] gap-14 items-center">
        <div>
          <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="font-display text-[34px] md:text-[46px] font-semibold leading-tight">
            {t('One page a manager can trust.', 'এক পাতা, যার উপর ম্যানেজার ভরসা করতে পারেন।')}
          </motion.h2>
          <div className="mt-8 grid gap-4">
            {steps.map((s, i) => (
              <motion.div key={s.en} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12 }}>
                <TiltCard className="card p-5 rounded-[14px]">
                  <div className="flex items-center gap-4">
                    <span className="grid place-items-center h-12 w-12 rounded-xl shrink-0" style={{ background: 'color-mix(in oklab, var(--accent) 16%, transparent)', color: 'var(--accent)' }}>
                      <s.icon width={22} height={22} />
                    </span>
                    <div>
                      <div className="font-display text-[20px] font-semibold">{t(s.en, s.bn)}</div>
                      <div className="text-muted text-[15px]">{t(s.den, s.dbn)}</div>
                    </div>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="flex justify-center lg:justify-end py-6">
          <FloatingFile />
        </div>
      </section>

      {/* ---------- three numbers ---------- */}
      <section className="max-w-6xl mx-auto px-5 md:px-10 pb-20">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { big: '1', en: 'page per business, in Bangla and English', bn: 'প্রতি ব্যবসায় এক পাতা, বাংলা ও ইংরেজিতে' },
            { big: '2', en: 'labels on every claim: checked or owner says', bn: 'প্রতিটি দাবিতে দুই চিহ্ন: যাচাই করা বা মালিকের কথা' },
            { big: '0', en: 'decisions made by AI. People decide.', bn: 'এআই-এর নেওয়া সিদ্ধান্ত। সিদ্ধান্ত মানুষের।' },
          ].map((x, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="card p-6 text-center">
              <div className="font-display text-[64px] leading-none font-semibold shimmer-text">{x.big}</div>
              <div className="text-muted mt-3 text-[15px]">{t(x.en, x.bn)}</div>
            </motion.div>
          ))}
        </div>
        <div className="text-center mt-14">
          <Link to="/login" className="btn btn-primary text-[17px] !px-8 !py-3.5 glow-btn">
            {t('Try it now', 'এখনই চালিয়ে দেখুন')} →
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
