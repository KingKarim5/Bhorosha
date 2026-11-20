import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PublicShell } from '../components/Shell';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { ErrorNote } from '../components/ui';
import { IconScale, IconHand, IconCheck } from '../components/icons';

type Role = 'lender' | 'investor';

const ROLES: Record<Role, { en: string; bn: string; sub_en: string; sub_bn: string; does: { en: string; bn: string }[] }> = {
  lender: {
    en: 'Lender', bn: 'ঋণদাতা',
    sub_en: 'You own the credit policy. The AI agents decide inside it.', sub_bn: 'ক্রেডিট নীতি আপনার। এআই এজেন্টরা তার ভেতরে সিদ্ধান্ত নেয়।',
    does: [
      { en: 'Set limits, rates and pricing bands', bn: 'সীমা, সুদ ও মূল্যের সীমা ঠিক করুন' },
      { en: 'Read every AI decision and its evidence', bn: 'প্রতিটি এআই সিদ্ধান্ত ও প্রমাণ দেখুন' },
      { en: 'Confirm contracts, review payments, pause the AI', bn: 'চুক্তি নিশ্চিত, পরিশোধ পর্যালোচনা, এআই থামানো' },
    ],
  },
  investor: {
    en: 'Investor', bn: 'বিনিয়োগকারী',
    sub_en: 'Fund part of approved loans through the licensed partner (simulation).', sub_bn: 'লাইসেন্সপ্রাপ্ত অংশীদারের মাধ্যমে অনুমোদিত ঋণের অংশে অর্থ দিন (সিমুলেশন)।',
    does: [
      { en: 'Verify in three quick steps', bn: 'তিনটি ছোট ধাপে যাচাই' },
      { en: 'Read each listed loan’s evidence and interest split', bn: 'প্রতিটি ঋণের প্রমাণ ও সুদের ভাগ দেখুন' },
      { en: 'Commit and follow live updates', bn: 'প্রতিশ্রুতি দিন ও সর্বশেষ খবর দেখুন' },
    ],
  },
};

export default function Signup() {
  const { t, pick } = useI18n();
  const { signup } = useAuth();
  const go = useNavigate();
  const [sp] = useSearchParams();
  const [role, setRole] = useState<Role>(sp.get('role') === 'investor' ? 'investor' : 'lender');
  const [form, setForm] = useState({ display_name: '', email: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const u = await signup({ role, ...form });
      go(u.role === 'investor' ? '/invest/verify' : '/dashboard');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PublicShell>
      <div className="px-4 md:px-10 py-8 max-w-4xl mx-auto">
        <h1 className="font-display text-[32px] font-semibold">{t('Create your account', 'অ্যাকাউন্ট খুলুন')}</h1>
        <p className="text-muted mt-1">{t('Choose how you will use Bhorsha.', 'ভরসা কীভাবে ব্যবহার করবেন, বেছে নিন।')}</p>
        <div className="grid sm:grid-cols-2 gap-4 mt-6" role="radiogroup" aria-label={t('Account type', 'অ্যাকাউন্টের ধরন')}>
          {(['lender', 'investor'] as Role[]).map((r) => {
            const on = role === r;
            const Icon = r === 'lender' ? IconScale : IconHand;
            return (
              <motion.button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setRole(r)}
                whileTap={{ scale: 0.98 }}
                className="card p-5 text-left transition-colors"
                style={{ borderColor: on ? 'var(--accent)' : undefined, boxShadow: on ? '0 0 0 2px color-mix(in oklab, var(--accent) 45%, transparent), 0 10px 40px -12px color-mix(in oklab, var(--accent) 55%, transparent)' : undefined }}
              >
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center h-11 w-11 rounded-xl" style={{ background: 'color-mix(in oklab, var(--accent) 16%, transparent)', color: 'var(--accent)' }}><Icon width={22} height={22} /></span>
                  <div className="flex-1">
                    <div className="font-display text-[21px] font-semibold">{pick(ROLES[r])}</div>
                    <div className="text-[13.5px] text-muted">{t(ROLES[r].sub_en, ROLES[r].sub_bn)}</div>
                  </div>
                  {on && <IconCheck style={{ color: 'var(--accent)' }} />}
                </div>
                <ul className="mt-3 space-y-1 text-[13.5px]">
                  {ROLES[r].does.map((d) => <li key={d.en} className="flex gap-2"><span className="text-accent">•</span>{pick(d)}</li>)}
                </ul>
              </motion.button>
            );
          })}
        </div>
        <form
          className="card p-5 mt-5 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="label" htmlFor="nm">{t('Your name', 'আপনার নাম')}</label>
          <input id="nm" className="input mt-1 mb-3" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} autoComplete="name" required />
          <label className="label" htmlFor="em">{t('Email', 'ইমেইল')}</label>
          <input id="em" type="email" className="input mt-1 mb-3" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
          <label className="label" htmlFor="pw">{t('Password (at least 8 characters)', 'পাসওয়ার্ড (অন্তত ৮ অক্ষর)')}</label>
          <input id="pw" type="password" className="input mt-1 mb-4" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" minLength={8} required />
          <ErrorNote msg={err} />
          <button className="btn btn-primary glow-btn w-full justify-center mt-2 text-[16px]" disabled={busy}>
            {busy ? t('Creating…', 'তৈরি হচ্ছে…') : t(`Create ${role} account`, `${pick(ROLES[role])} অ্যাকাউন্ট খুলুন`)} →
          </button>
          <p className="text-[13px] text-muted mt-3">
            {t('Already have an account?', 'আগে থেকেই অ্যাকাউন্ট আছে?')} <Link to="/login" className="text-accent underline">{t('Log in', 'লগ ইন')}</Link> · {t('or use a demo account there.', 'অথবা সেখানে ডেমো অ্যাকাউন্ট নিন।')}
          </p>
        </form>
        <p className="text-[12.5px] text-muted mt-4 max-w-2xl">{t('Demo system: synthetic data only, and no real money moves. Accounts are cleared when the demo is reset.', 'ডেমো সিস্টেম: শুধু কৃত্রিম তথ্য, কোনো আসল টাকা লেনদেন হয় না। ডেমো রিসেট হলে অ্যাকাউন্ট মুছে যায়।')}</p>
      </div>
    </PublicShell>
  );
}
