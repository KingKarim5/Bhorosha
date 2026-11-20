import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { Card, PageTitle, Skeleton, VerdictChip, Sparkline, VERDICT_WORDS, VerdictKey, ErrorNote } from '../components/ui';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useState } from 'react';
import { Tour } from '../components/Tour';

const STATUS: Record<string, { en: string; bn: string }> = {
  draft: { en: 'Draft (more asked)', bn: 'খসড়া (আরও চাওয়া)' },
  filed: { en: 'Filed, awaiting decision', bn: 'জমা, সিদ্ধান্তের অপেক্ষায়' },
  decided: { en: 'Decided', bn: 'সিদ্ধান্ত হয়েছে' },
  funded: { en: 'Funded', bn: 'ঋণ দেওয়া হয়েছে' },
};
export const STATUS_WORDS = STATUS;

export default function Dashboard() {
  const { t, n, pick } = useI18n();
  const { user } = useAuth();
  const d = useApi('/dashboard');
  const cases = useApi<any[]>('/cases');
  const [resetting, setResetting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reset = async () => {
    if (!confirm(t('Reset all demo data to the seeded state?', 'সব ডেমো তথ্য শুরুর অবস্থায় ফিরিয়ে নেবেন?'))) return;
    setResetting(true);
    try {
      await api('/admin/reset', { method: 'POST' });
      location.reload();
    } catch (e) {
      setErr((e as Error).message);
      setResetting(false);
    }
  };
  return (
    <div>
      <Tour />
      <PageTitle
        title={t('Branch dashboard', 'শাখার ড্যাশবোর্ড')}
        sub={t('Files waiting for a decision, borrowers to call this week, and how the file has matched outcomes so far (simulated).', 'সিদ্ধান্তের অপেক্ষায় থাকা ফাইল, এই সপ্তাহে যাদের ফোন করতে হবে, আর ফাইল এখন পর্যন্ত ফলাফলের সাথে কতটা মিলেছে (সিমুলেটেড)।')}
        right={
          user?.role === 'lender' && (
            <button className="btn" onClick={reset} disabled={resetting}>
              {resetting ? t('Resetting…', 'রিসেট হচ্ছে…') : t('Reset demo data', 'ডেমো তথ্য রিসেট')}
            </button>
          )
        }
      />
      <ErrorNote msg={err || d.error} />
      <div className="grid lg:grid-cols-3 gap-5">
        <Card title={t('Case pipeline', 'কেসের ধারা')} className="lg:col-span-2" right={<Link to="/cases" className="text-accent text-sm font-semibold">{t('All cases', 'সব কেস')} →</Link>}>
          {!cases.data ? (
            <Skeleton h={160} />
          ) : (
            <div className="divide-y divide-line">
              {cases.data.map((c) => (
                <Link key={c.id} to={`/cases/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-raised rounded-lg px-2 -mx-2">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold">{c.shop}</div>
                    <div className="text-[13px] text-muted">
                      {pick(STATUS[c.status])} · {t('ask', 'চাহিদা')} <span className="num">{n(c.loan_ask_bdt)}</span>
                    </div>
                  </div>
                  <Sparkline values={c.monthly} />
                  <VerdictChip verdict={c.verdict} />
                  <span className="num text-[12.5px] text-muted w-20 text-right">
                    {n(c.band_low)}–{n(c.band_high)}%
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card title={t('Watchlist this week', 'এই সপ্তাহের নজরতালিকা')} right={<Link to="/watchlist" className="text-accent text-sm font-semibold">{t('Open', 'খুলুন')} →</Link>}>
            {!d.data ? (
              <Skeleton h={80} />
            ) : d.data.openFlags.length ? (
              <ul className="space-y-2">
                {d.data.openFlags.map((f: any) => (
                  <li key={f._id} className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{f.shop?.label}</span>
                    <span className="chip" style={{ color: f.severity === 'call' ? 'var(--notviable)' : 'var(--unsure)' }}>
                      {f.severity === 'call' ? t('Call', 'ফোন') : f.severity === 'watch' ? t('Watch', 'নজর') : t('No data', 'তথ্য নেই')} · {f.month}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-[14.5px]">
                {t('No borrower to call yet. Press Simulate next month on the watchlist to step the funded loans forward.', 'এখনো কাউকে ফোন করার নেই। নজরতালিকায় "পরের মাস সিমুলেট করুন" চাপলে ঋণগুলো এক মাস এগোবে।')}
              </p>
            )}
          </Card>
          <Card title={t('Shadow mode (simulation)', 'শ্যাডো মোড (সিমুলেশন)')} right={<Link to="/shadow" className="text-accent text-sm font-semibold">{t('Report', 'রিপোর্ট')} →</Link>}>
            {!d.data ? (
              <Skeleton h={80} />
            ) : (
              <div>
                <p className="text-[12.5px] text-muted mb-2">{t('SIMULATION, illustrative only. Synthetic past files.', 'সিমুলেশন, শুধু উদাহরণ। কৃত্রিম পুরোনো ফাইল।')}</p>
                {d.data.shadow.bands.map((b: any) => (
                  <div key={b.verdict} className="flex items-center gap-3 py-1">
                    <span className="w-28 text-[13.5px]">{pick(VERDICT_WORDS[b.verdict as VerdictKey])}</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--line)' }}>
                      <div className="h-2 rounded-full" style={{ width: `${b.survival_pct || 0}%`, background: b.verdict === 'viable' ? 'var(--viable)' : b.verdict === 'not_sure' ? 'var(--unsure)' : 'var(--notviable)' }} />
                    </div>
                    <span className="num text-[12.5px] w-24 text-right">
                      {n(b.survival_pct)}% · n={n(b.n)}
                    </span>
                  </div>
                ))}
                <p className="text-[12px] text-muted mt-2">{t('Share still trading at 12 months, by verdict.', 'রায় অনুযায়ী ১২ মাস পরেও চালু থাকার হার।')}</p>
              </div>
            )}
          </Card>
          {d.data && (
            <Card>
              <div className="text-[13px] text-muted">
                {t('Verdict engine', 'রায়ের ইঞ্জিন')}:{' '}
                <span className="font-semibold text-ink">{d.data.model?.loaded ? t('rules + calibrated model', 'নিয়ম + ক্যালিব্রেটেড মডেল') : t('rules only (model file not loaded)', 'শুধু নিয়ম (মডেল ফাইল লোড হয়নি)')}</span>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
