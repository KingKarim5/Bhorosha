import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Card, PageTitle, Skeleton, ErrorNote, ModeBadge } from '../components/ui';
import { Tour } from '../components/Tour';
import { IconPause, IconPulse } from '../components/icons';

const STATUS: Record<string, { en: string; bn: string }> = {
  draft: { en: 'Draft', bn: 'খসড়া' },
  filed: { en: 'Filed, waiting for evidence', bn: 'জমা, প্রমাণের অপেক্ষায়' },
  decided: { en: 'Decided', bn: 'সিদ্ধান্ত হয়েছে' },
  funded: { en: 'Funded', bn: 'ঋণ দেওয়া হয়েছে' },
};
export const STATUS_WORDS = STATUS;
export const DECISION_WORDS: Record<string, { en: string; bn: string; color: string }> = {
  approved_with_conditions: { en: 'Approved with conditions', bn: 'শর্তসহ অনুমোদিত', color: 'var(--viable)' },
  declined_with_plan: { en: 'Declined, with a plan', bn: 'পরিকল্পনাসহ প্রত্যাখ্যাত', color: 'var(--notviable)' },
  hold_need_evidence: { en: 'Hold: more evidence', bn: 'স্থগিত: আরও প্রমাণ', color: 'var(--unsure)' },
};
const SEGMENTS: Record<string, { en: string; bn: string }> = {
  cash_led: { en: 'cash-led', bn: 'নগদ-নির্ভর' },
  hybrid: { en: 'hybrid', bn: 'মিশ্র' },
  digital_first: { en: 'digital-first', bn: 'ডিজিটাল' },
};
export const SEGMENT_WORDS = SEGMENTS;

function Meter({ label, value, limit }: { label: string; value: number; limit: number }) {
  const { n } = useI18n();
  const over = value > limit;
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-[13px]">
        <span>{label}</span>
        <span className="num" style={{ color: over ? 'var(--notviable)' : 'var(--muted)' }}>
          {n(Math.round(value * 100))}% / {n(Math.round(limit * 100))}%
        </span>
      </div>
      <div className="relative h-2 rounded-full mt-1" style={{ background: 'var(--line)' }}>
        <div className="absolute h-2 rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, background: over ? 'var(--notviable)' : 'var(--checked)' }} />
        <div className="absolute -top-1 h-4 w-0.5" style={{ left: `${Math.min(100, limit * 100)}%`, background: 'var(--ink)' }} title="limit" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t, pick, n } = useI18n();
  const { user } = useAuth();
  const c = useApi('/console');
  const [agent, setAgent] = useState('');
  const audit = useApi(`/audit/full${agent ? `?agent=${agent}` : ''}`, [agent, c.data]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await c.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const reset = () =>
    confirm(t('Reset all demo data to the seeded state?', 'সব ডেমো তথ্য শুরুর অবস্থায় ফিরিয়ে নেবেন?')) &&
    run('reset', async () => {
      await api('/admin/reset', { method: 'POST' });
      location.reload();
    });
  if (!c.data) return <Skeleton h={400} />;
  const { policy, control, metrics, decisions, counts } = c.data;
  return (
    <div>
      <Tour />
      <PageTitle
        title={t('Policy and audit console', 'নীতি ও অডিট কনসোল')}
        sub={t('AI agents decide inside the policy you own. You set the policy, read every decision and the audit log, and can pause the AI. You never approve or decline a single case here.', 'আপনার নীতির ভেতরে এআই এজেন্ট সিদ্ধান্ত নেয়। আপনি নীতি ঠিক করেন, প্রতিটি সিদ্ধান্ত ও অডিট লগ দেখেন, এবং এআই থামাতে পারেন। এখানে কোনো একক কেস আপনি অনুমোদন বা প্রত্যাখ্যান করেন না।')}
        right={
          user?.role === 'lender' && (
            <button className="btn" onClick={reset} disabled={busy === 'reset'}>
              {busy === 'reset' ? t('Resetting…', 'রিসেট হচ্ছে…') : t('Reset demo data', 'ডেমো তথ্য রিসেট')}
            </button>
          )
        }
      />
      <ErrorNote msg={err || c.error} />
      {msg && <div className="card p-3 mb-4 text-[13.5px]">{msg}</div>}
      <div className="grid lg:grid-cols-3 gap-5">
        <Card title={t('AI status', 'এআই-এর অবস্থা')}>
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full" style={{ background: control.paused ? 'var(--notviable)' : 'var(--checked)', boxShadow: `0 0 0 4px color-mix(in oklab, ${control.paused ? 'var(--notviable)' : 'var(--checked)'} 25%, transparent)` }} />
            <b className="text-[18px]">{control.paused ? t('Paused', 'থামানো') : t('Deciding', 'সিদ্ধান্ত নিচ্ছে')}</b>
            <span className="chip ml-auto">{t('Policy', 'নীতি')} v{n(policy.version)}</span>
          </div>
          {control.paused && (
            <p className="text-[13.5px] mt-2" style={{ color: 'var(--notviable)' }}>
              {control.source === 'circuit_breaker' ? t('Circuit breaker', 'সার্কিট ব্রেকার') : t('Paused by the lender', 'ঋণদাতা থামিয়েছেন')}: {control.reason}
            </p>
          )}
          <p className="text-[12.5px] text-muted mt-2">{t('While paused, new files are put on hold with the reason; nothing is approved.', 'থামানো থাকলে নতুন ফাইল কারণসহ স্থগিত থাকে; কিছুই অনুমোদিত হয় না।')}</p>
          {!control.paused && <input className="input mt-3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Reason for pausing (optional)', 'থামানোর কারণ (ঐচ্ছিক)')} />}
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn btn-primary" disabled={!!busy} onClick={() => run('pause', () => api('/control/pause', { body: { paused: !control.paused, reason } }))}>
              <IconPause /> {control.paused ? t('Resume AI decisions', 'এআই-এর সিদ্ধান্ত আবার চালু') : t('Pause AI decisions', 'এআই-এর সিদ্ধান্ত থামান')}
            </button>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() =>
                run('breaker', async () => {
                  const r = await api('/control/check-breaker', { method: 'POST' });
                  setMsg(r.tripped ? t(`Circuit breaker tripped: ${r.reasons.join('; ')}`, `সার্কিট ব্রেকার চালু হয়েছে: ${r.reasons.join('; ')}`) : t('Circuit breaker checked: all limits respected.', 'সার্কিট ব্রেকার যাচাই: সব সীমা ঠিক আছে।'));
                })
              }
            >
              {t('Check circuit breaker now', 'এখনই সার্কিট ব্রেকার যাচাই')}
            </button>
          </div>
        </Card>
        <Card title={t('Circuit breaker', 'সার্কিট ব্রেকার')} right={<Link to="/settings" className="text-accent text-sm font-semibold">{t('Limits', 'সীমা')} →</Link>}>
          <Meter label={t(`Hold rate, last ${metrics.recent} decisions`, `গত ${metrics.recent}টি সিদ্ধান্তে স্থগিতের হার`)} value={metrics.holdRate} limit={policy.breaker_max_hold_rate} />
          <Meter label={t(`Simulated default rate (${metrics.calls} of ${metrics.funded} funded at call level)`, `সিমুলেটেড খেলাপি হার (${metrics.funded}টির মধ্যে ${metrics.calls}টি "ফোন" পর্যায়ে)`)} value={metrics.defaultRate} limit={policy.breaker_max_default_rate} />
          <p className="text-[12.5px] text-muted mt-2">{t('Crossing a limit pauses AI decisions automatically, with the reason shown. Only the lender resumes.', 'সীমা পার হলে এআই-এর সিদ্ধান্ত নিজে থেকেই থামে, কারণসহ। শুধু ঋণদাতা আবার চালু করেন।')}</p>
        </Card>
        <Card title={t('Decisions so far', 'এখন পর্যন্ত সিদ্ধান্ত')} right={<Link to="/watchlist" className="text-accent text-sm font-semibold"><IconPulse width={14} height={14} className="inline" /> {t('Watchlist', 'নজরতালিকা')} →</Link>}>
          {counts.map((x: any) => (
            <div key={x.decision} className="flex justify-between py-1.5 text-[14px]">
              <span style={{ color: DECISION_WORDS[x.decision].color }}>{pick(DECISION_WORDS[x.decision])}</span>
              <b className="num">{n(x.n)}</b>
            </div>
          ))}
          <p className="text-[12.5px] text-muted mt-2">{t('Every run adds a decision; history is never edited.', 'প্রতিটি রানে নতুন সিদ্ধান্ত যোগ হয়; ইতিহাস কখনো বদলানো হয় না।')}</p>
        </Card>
      </div>

      <Card title={t('All AI decisions', 'এআই-এর সব সিদ্ধান্ত')} className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-muted text-[12px] border-b border-line">
                <th className="py-2 pr-3">{t('Case', 'কেস')}</th>
                <th className="pr-3">{t('Decision', 'সিদ্ধান্ত')}</th>
                <th className="pr-3">{t('Policy', 'নীতি')}</th>
                <th className="pr-3">{t('Reasons and evidence', 'কারণ ও প্রমাণ')}</th>
                <th>{t('When', 'কখন')}</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d: any) => (
                <tr key={d._id} className="border-b border-line align-top">
                  <td className="py-2 pr-3">
                    <Link to={`/cases/${d.case_id}`} className="font-semibold hover:text-accent">{d.shop}</Link>
                    <div className="text-[12px] text-muted">{pick(SEGMENTS[d.segment])} · <span className="num">{n(d.loan_ask_bdt)}</span></div>
                  </td>
                  <td className="pr-3">
                    <span className="chip" style={{ color: DECISION_WORDS[d.decision].color, borderColor: DECISION_WORDS[d.decision].color }}>{pick(DECISION_WORDS[d.decision])}</span>
                    {d.legacy_note && <div className="text-[11.5px] text-muted mt-1">{t('existing loan', 'আগের ঋণ')}</div>}
                  </td>
                  <td className="pr-3 num">v{d.policy_version}</td>
                  <td className="pr-3 max-w-[460px]">
                    {(d.reasons || []).slice(0, 2).map((r: any, i: number) => (
                      <div key={i}>
                        {pick(r)} {r.evidence_ids?.length > 0 && <span className="num text-[11px] text-muted">[{r.evidence_ids.join(', ')}]</span>}
                      </div>
                    ))}
                  </td>
                  <td className="num text-[12px] text-muted whitespace-nowrap">{new Date(d.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={t('Audit log (redacted inputs)', 'অডিট লগ (গোপন তথ্য মুছে)')}
        className="mt-5"
        right={
          <select className="input !min-h-0 !py-1 !w-auto text-[13px]" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label={t('Filter by agent', 'এজেন্ট অনুযায়ী')}>
            <option value="">{t('All agents', 'সব এজেন্ট')}</option>
            {['Intake', 'Verifier', 'Underwriter', 'Watchman', 'Servicer', 'Policy'].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        }
      >
        {!audit.data ? (
          <Skeleton h={120} />
        ) : (
          <ul className="space-y-1.5 max-h-[460px] overflow-auto">
            {audit.data.map((a: any) => (
              <li key={a._id}>
                <details className="p-2 rounded" style={{ background: 'var(--raised)' }}>
                  <summary className="cursor-pointer text-[12.5px] flex flex-wrap gap-2 items-center">
                    <span className="num text-muted">{new Date(a.createdAt).toLocaleString()}</span>
                    {a.agent && <span className="chip !py-0">{a.agent}</span>}
                    <b>{a.step || a.action}</b>
                    {(a.mode === 'ai' || a.mode === 'demo_fallback') && <ModeBadge mode={a.mode} />}
                    <span className="text-muted">{a.actor}</span>
                    {a.latency_ms != null && <span className="num text-muted">{n(a.latency_ms)} ms</span>}
                  </summary>
                  <pre className="text-[11.5px] whitespace-pre-wrap break-words mt-2 num">{(JSON.stringify(a.redacted_payload_json ?? {}, null, 1) || '').slice(0, 2000)}</pre>
                  <pre className="text-[11.5px] whitespace-pre-wrap break-words mt-1 num" style={{ color: 'var(--muted)' }}>→ {(JSON.stringify(a.output_json ?? {}, null, 1) || '').slice(0, 1500)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
