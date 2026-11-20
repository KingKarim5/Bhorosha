import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PublicShell } from '../components/Shell';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { ErrorNote } from '../components/ui';
import { BRAND } from '../brand';

interface Acc {
  role: string;
  email: string;
  display_name: string;
}

export default function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const go = useNavigate();
  const [sp] = useSearchParams();
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [password, setPassword] = useState('bhorsha-demo');
  const [email, setEmail] = useState('lender@demo.bd');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/auth/demo-accounts')
      .then((r) => {
        setAccounts(r.accounts);
        setPassword(r.password);
      })
      .catch(() => setErr(t('The API is not reachable yet. If it was asleep, wait a few seconds and reload.', 'এপিআই এখনো সাড়া দিচ্ছে না। ঘুমিয়ে থাকলে কয়েক সেকেন্ড অপেক্ষা করে আবার লোড করুন।')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const doLogin = async (em: string, pw: string) => {
    setBusy(true);
    setErr(null);
    try {
      const u = await login(em, pw);
      const next = sp.get('next');
      go(next && next !== '/login' ? next : u.role === 'investor' ? '/portfolio' : '/dashboard');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const roleText: Record<string, { en: string; bn: string }> = {
    lender: { en: 'Lender policy owner: sets the policy, reads AI decisions and the audit log, can pause the AI', bn: 'ঋণদাতা: নীতি ঠিক করেন, এআই-এর সিদ্ধান্ত ও অডিট লগ দেখেন, এআই থামাতে পারেন' },
    investor: { en: 'Investor (simulation): listings, portfolio, live updates', bn: 'বিনিয়োগকারী (সিমুলেশন): তালিকা, পোর্টফোলিও, আপডেট' },
  };
  return (
    <PublicShell>
      <div className="px-4 md:px-10 py-8 max-w-4xl mx-auto grid md:grid-cols-[1.2fr_1fr] gap-6">
        <div>
          <p className="text-accent font-semibold">{t(BRAND.taglineEn, BRAND.taglineBn)}</p>
          <h1 className="font-display text-[30px] font-semibold">{t('Demo accounts', 'ডেমো অ্যাকাউন্ট')}</h1>
          <p className="text-muted mt-1">
            {t('All accounts use the password', 'সব অ্যাকাউন্টের পাসওয়ার্ড')} <code className="num chip">{password}</code>
          </p>
          <div className="mt-5 space-y-3">
            {accounts.map((a) => (
              <button key={a.email} className="card w-full text-left p-4 hover:border-accent transition-colors" onClick={() => doLogin(a.email, password)} disabled={busy}>
                <div className="font-semibold">{a.display_name}</div>
                <div className="num text-[13px] text-muted">{a.email}</div>
                <div className="text-[13.5px] mt-1">{t(roleText[a.role]?.en || '', roleText[a.role]?.bn || '')}{a.email.startsWith('new') ? t(' (not yet verified)', ' (এখনো যাচাই হয়নি)') : ''}</div>
              </button>
            ))}
          </div>
        </div>
        <form
          className="card p-5 h-fit"
          onSubmit={(e) => {
            e.preventDefault();
            doLogin(email, password);
          }}
        >
          <h2 className="font-display text-[19px] font-semibold mb-3">{t('Log in', 'লগ ইন')}</h2>
          <label className="label" htmlFor="em">
            {t('Email', 'ইমেইল')}
          </label>
          <input id="em" className="input mt-1 mb-3" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          <label className="label" htmlFor="pw">
            {t('Password', 'পাসওয়ার্ড')}
          </label>
          <input id="pw" type="password" className="input mt-1 mb-4" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <ErrorNote msg={err} />
          <button className="btn btn-primary w-full justify-center mt-3" disabled={busy}>
            {busy ? t('Logging in…', 'লগ ইন হচ্ছে…') : t('Log in', 'লগ ইন')}
          </button>
        </form>
      </div>
    </PublicShell>
  );
}
