import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PublicShell } from '../components/Shell';
import { useI18n } from '../lib/i18n';
import { useReducedMotion } from '../lib/hooks';
import { BRAND } from '../brand';
import { IconCheck, IconSpeech, IconPulse, IconDoc } from '../components/icons';

function HeroRunway() {
  const reduce = useReducedMotion();
  // a line that draws, dips (wobbles) and holds
  const d = 'M0,150 C80,140 120,120 190,118 S300,150 360,138 S470,70 560,78 S700,60 800,52';
  return (
    <svg viewBox="0 0 800 200" className="w-full h-auto" aria-hidden>
      <defs>
        <linearGradient id="band" x1="0" x2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.02" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <path d="M0,175 C120,160 260,165 360,160 S600,95 800,80 L800,30 C600,45 380,110 360,115 S120,120 0,128 Z" fill="url(#band)" />
      <motion.path
        d={d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={3.2}
        strokeLinecap="round"
        initial={{ pathLength: reduce ? 1 : 0 } as any}
        animate={{ pathLength: 1 } as any}
        transition={{ duration: reduce ? 0 : 2.4, ease: 'easeInOut' }}
      />
      <motion.circle cx={800} cy={52} r={6} fill="var(--accent)" initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 2.3 }} />
    </svg>
  );
}

export default function Landing() {
  const { t } = useI18n();
  const three = [
    { icon: IconDoc, en: 'Reads what a shop already has', bn: 'দোকানের কাছে যা আছে তা-ই পড়ে', den: 'Mobile-money statements, bill photos and a Bangla note become one page of evidence. AI reads; an officer confirms every field.', dbn: 'মোবাইল-মানি স্টেটমেন্ট, বিলের ছবি আর একটি বাংলা নোট মিলে এক পাতার প্রমাণ। এআই পড়ে; অফিসার প্রতিটি ঘর নিশ্চিত করেন।' },
    { icon: IconCheck, en: 'Separates proven from owner says', bn: 'প্রমাণিত আর মালিকের কথা আলাদা করে', den: 'Every claim carries a proof label. The verdict comes with a likelihood band, a likely cause, conditions and a recovery plan. The manager decides.', dbn: 'প্রতিটি দাবির পাশে প্রমাণের চিহ্ন। রায়ের সাথে সম্ভাবনার সীমা, সম্ভাব্য কারণ, শর্ত ও ঘুরে দাঁড়ানোর পরিকল্পনা। সিদ্ধান্ত ম্যানেজারের।' },
    { icon: IconPulse, en: 'Watches the loan after it starts', bn: 'ঋণ শুরুর পরও নজর রাখে', den: "A watchman forecasts each shop's sales from its own seasons and warns when a month falls below the band, without crying wolf in a lean season.", dbn: 'প্রতিটি দোকানের নিজের মৌসুম থেকে বিক্রির পূর্বাভাস করে, কোনো মাস সীমার নিচে নামলে সতর্ক করে, অথচ মৌসুমি মন্দায় অকারণে ভয় দেখায় না।' },
  ];
  return (
    <PublicShell>
      <section className="px-4 md:px-10 pt-6 md:pt-14 max-w-6xl mx-auto">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] uppercase tracking-[0.18em] text-muted">
          {t('Decision support for small-business lending in Bangladesh', 'বাংলাদেশে ক্ষুদ্র ব্যবসার ঋণের সিদ্ধান্ত-সহায়তা')}
        </motion.p>
        <h1 className="mt-3 text-[34px] md:text-[56px] leading-[1.15] font-semibold" style={{ fontFamily: 'Noto Serif Bengali, serif' }}>
          {BRAND.taglineBn}
        </h1>
        <p className="font-display text-[22px] md:text-[28px] text-muted mt-2">{BRAND.taglineEn}</p>
        <div className="mt-4 -mx-2">
          <HeroRunway />
        </div>
        <p className="text-[17px] max-w-3xl">{t(BRAND.oneLineEn, BRAND.oneLineBn)}</p>
        <div className="flex flex-wrap gap-3 mt-6">
          <Link to="/login" className="btn btn-primary text-[16px] px-5">
            {t('Open the demo', 'ডেমো খুলুন')}
          </Link>
          <Link to="/about" className="btn">
            {t('What Bhorsha is and is not', 'ভরসা কী, আর কী নয়')}
          </Link>
        </div>
      </section>
      <section className="px-4 md:px-10 py-14 max-w-6xl mx-auto grid md:grid-cols-3 gap-5">
        {three.map((x, i) => (
          <motion.div key={i} className="card p-5" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
            <x.icon width={22} height={22} className="text-accent" />
            <h2 className="font-display text-[19px] font-semibold mt-3">{t(x.en, x.bn)}</h2>
            <p className="text-muted mt-2 text-[15px]">{t(x.den, x.dbn)}</p>
          </motion.div>
        ))}
      </section>
      <section className="px-4 md:px-10 pb-16 max-w-6xl mx-auto">
        <div className="card p-5 md:p-6 border-dashed" style={{ borderStyle: 'dashed' }}>
          <h2 className="font-display text-[19px] font-semibold flex items-center gap-2">
            <IconSpeech className="text-owner" /> {t('An honest note on limits', 'সীমাবদ্ধতা নিয়ে সৎ কথা')}
          </h2>
          <ul className="mt-3 space-y-1.5 text-[15px] text-muted list-disc pl-5">
            <li>{t('Everything here is synthetic demo data. No real borrower, lender or investor is involved.', 'এখানে সবকিছু কৃত্রিম ডেমো তথ্য। কোনো বাস্তব ঋণগ্রহীতা, ঋণদাতা বা বিনিয়োগকারী জড়িত নয়।')}</li>
            <li>{t('The numbers have not been tested on real Bangladeshi shops. That needs a lender trial in shadow mode, which is our first step.', 'সংখ্যাগুলো বাস্তব বাংলাদেশি দোকানে পরীক্ষা হয়নি। এর জন্য শ্যাডো মোডে ঋণদাতার সাথে পরীক্ষা দরকার, সেটিই আমাদের প্রথম ধাপ।')}</li>
            <li>{t('Bhorsha never holds, receives or pays out money. A licensed partner is the lender of record. The investor side is a simulation.', 'ভরসা কখনো টাকা রাখে, নেয় বা দেয় না। লাইসেন্সপ্রাপ্ত অংশীদারই ঋণদাতা। বিনিয়োগকারীর অংশ একটি সিমুলেশন।')}</li>
            <li>{t('AI never decides. A bank manager does, and records why.', 'এআই কখনো সিদ্ধান্ত নেয় না। ব্যাংক ম্যানেজার নেন, এবং কারণ লিখে রাখেন।')}</li>
          </ul>
        </div>
      </section>
    </PublicShell>
  );
}
