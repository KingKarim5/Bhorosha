import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { Skeleton, ErrorNote } from '../components/ui';
import { IconVolume } from '../components/icons';

// The owner's plain Bangla copy: private token, no login, no internal scoring detail.
export default function Owner() {
  const { token } = useParams();
  const { t, lang } = useI18n();
  const { data, error } = useApi(`/owner/${token}`);
  const [speaking, setSpeaking] = useState(false);
  if (error) return <div className="px-4 py-8 max-w-xl mx-auto"><ErrorNote msg={error} /></div>;
  if (!data) return <div className="px-4 py-8 max-w-xl mx-auto"><Skeleton h={300} /></div>;
  const bn = lang === 'bn';
  const L = (o: any) => (bn ? o?.bn : o?.en) || '';
  const statusLine =
    data.decision === 'approve'
      ? t('The lender has approved your loan with the conditions below.', 'ঋণদাতা নিচের শর্তসহ আপনার ঋণ অনুমোদন করেছেন।')
      : data.decision === 'decline'
        ? t('The lender could not approve the loan this time. The points below show what can change.', 'ঋণদাতা এবার ঋণ অনুমোদন করতে পারেননি। নিচের বিষয়গুলো দেখায় কী বদলানো যায়।')
        : data.decision === 'ask_more'
          ? t('The lender needs a little more from you before deciding.', 'সিদ্ধান্তের আগে ঋণদাতা আপনার কাছে আরও কিছু চান।')
          : t('Your file is being read. Bhorsha AI decides inside the lender’s policy.', 'আপনার ফাইল পড়া হচ্ছে। ঋণদাতার নীতির ভেতরে ভরসা এআই সিদ্ধান্ত নেবে।');
  const MISSING: Record<string, { en: string; bn: string }> = {
    statement_3_months: { en: 'At least 3 months of your wallet statement', bn: 'অন্তত ৩ মাসের ওয়ালেট স্টেটমেন্ট' },
    statement_12_months: { en: '12 months of your wallet statement', bn: '১২ মাসের ওয়ালেট স্টেটমেন্ট' },
    fresh_statement: { en: 'A fresh statement downloaded again from the wallet', bn: 'ওয়ালেট থেকে আবার নামানো নতুন স্টেটমেন্ট' },
    last_year_months: { en: "Last year's figures for the same months", bn: 'গত বছরের একই মাসগুলোর হিসাব' },
    supplier_bills: { en: 'One or two supplier bills', bn: 'এক-দুটি সরবরাহকারীর বিল' },
  };
  const speakText = [
    data.shop,
    statusLine,
    ...data.going_well.map(L),
    ...data.to_work_on.map(L),
    ...data.conditions.map(L),
    ...data.recovery_plan.map(L),
  ].join('। ');
  const speak = () => {
    const s = window.speechSynthesis;
    if (!s) return;
    if (speaking) {
      s.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(speakText);
    u.lang = bn ? 'bn-BD' : 'en-US';
    u.rate = 0.92;
    const voice = s.getVoices().find((v) => v.lang.startsWith(bn ? 'bn' : 'en'));
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking(false);
    s.speak(u);
    setSpeaking(true);
  };
  const Block = ({ title, items }: { title: string; items: any[] }) =>
    items.length ? (
      <section className="mt-7">
        <h2 className="text-[22px] font-semibold" style={{ fontFamily: 'Noto Serif Bengali, serif' }}>
          {title}
        </h2>
        <ul className="mt-2 space-y-2.5 text-[19px] leading-[1.8]">
          {items.map((x, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-accent">•</span>
              <span>{typeof x === 'string' ? x : L(x)}</span>
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <main className="px-5 py-6 max-w-xl mx-auto">
      <div className="card p-6 md:p-8" style={{ background: 'var(--paper)', color: 'var(--paper-ink)' }}>
        <p className="text-[14px]" style={{ color: '#5b6f6b' }}>{t('Your copy of the loan file', 'আপনার ঋণ ফাইলের কপি')}</p>
        <h1 className="text-[30px] font-semibold mt-1" style={{ fontFamily: 'Noto Serif Bengali, serif' }}>
          {data.shop}
        </h1>
        <p className="text-[20px] mt-3 leading-[1.8]">{statusLine}</p>
        <button className="btn mt-4 text-[17px]" onClick={speak} aria-pressed={speaking}>
          <IconVolume /> {speaking ? t('Stop', 'থামুন') : t('Read aloud', 'জোরে পড়ে শোনান')}
        </button>
        <Block title={t('What is going well', 'যা ভালো চলছে')} items={data.going_well} />
        <Block title={t('What to work on', 'যেখানে কাজ করতে হবে')} items={data.to_work_on} />
        <Block title={t('Conditions', 'শর্ত')} items={data.conditions} />
        <Block title={t('A plan to grow stronger', 'আরও শক্ত হওয়ার পরিকল্পনা')} items={data.recovery_plan} />
        <Block title={t('Please bring', 'অনুগ্রহ করে আনুন')} items={(data.missing || []).map((m: string) => MISSING[m]).filter(Boolean)} />
        <p className="text-[15px] mt-8" style={{ color: '#5b6f6b' }}>
          {t('This page judges the evidence, not you. Answer the questions below or add new evidence any time.', 'এই পাতা প্রমাণ বিচার করে, আপনাকে নয়। নিচের প্রশ্নের উত্তর দিন বা যেকোনো সময় নতুন প্রমাণ যোগ করুন।')}
        </p>
      </div>
    </main>
  );
}
