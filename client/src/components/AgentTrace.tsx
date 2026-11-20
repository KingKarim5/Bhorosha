import { motion } from 'framer-motion';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { ModeBadge, Skeleton } from './ui';

const AGENT_INFO: Record<string, { en: string; bn: string; color: string }> = {
  Intake: { en: 'Redacts, reads documents, scores confidence', bn: 'গোপন তথ্য মোছে, কাগজ পড়ে, আস্থা মাপে', color: '#8FA6C9' },
  Verifier: { en: 'Matches to the money trail, checks, asks the owner', bn: 'টাকার হিসাবের সাথে মেলায়, যাচাই করে, মালিককে জিজ্ঞেস করে', color: '#4FC9A0' },
  Underwriter: { en: 'Coverage, rules, model, fail-safe decision', bn: 'কভারেজ, নিয়ম, মডেল, নিরাপদ সিদ্ধান্ত', color: '#E0B24F' },
  Watchman: { en: 'Forecasts sales, raises flags', bn: 'বিক্রির পূর্বাভাস, সতর্কতা', color: '#F0B34A' },
  Servicer: { en: 'Messages to the owner and investors', bn: 'মালিক ও বিনিয়োগকারীকে বার্তা', color: '#F0705A' },
};

export function AgentTrace({ caseId, refreshKey }: { caseId: string; refreshKey?: unknown }) {
  const { t, pick, n } = useI18n();
  const { data } = useApi(`/cases/${caseId}/trace`, [refreshKey]);
  if (!data) return <Skeleton h={160} />;
  if (!data.agents?.length) return <p className="text-muted text-[14px]">{t('No pipeline run recorded yet.', 'এখনো কোনো রান রেকর্ড হয়নি।')}</p>;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-[12.5px] text-muted">
        <span className="num">
          {t('Run', 'রান')} {data.run_id?.split(':').pop()} · {new Date(data.at).toLocaleString()}
        </span>
        {data.fallback && <ModeBadge mode="demo_fallback" />}
      </div>
      <ol className="relative border-l border-line ml-2 space-y-4">
        {data.agents.map((a: any, i: number) => {
          const info = AGENT_INFO[a.agent];
          const ms = a.steps.reduce((x: number, s: any) => x + (s.ms || 0), 0);
          return (
            <motion.li key={a.agent} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="pl-5 relative">
              <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full" style={{ background: info?.color || 'var(--accent)' }} />
              <div className="flex flex-wrap items-baseline gap-2">
                <b className="text-[14.5px]">{a.agent}</b>
                <span className="text-[12px] text-muted">{info ? pick(info) : ''}</span>
                <span className="num text-[11.5px] text-muted ml-auto">{n(ms)} ms</span>
              </div>
              <ul className="mt-1 space-y-1">
                {a.steps.map((s: any, j: number) => (
                  <li key={j} className="text-[13px]">
                    <span className="font-semibold">{s.step.replace(/_/g, ' ')}</span>{' '}
                    {(s.ai || s.mode === 'ai' || s.mode === 'demo_fallback') && <ModeBadge mode={s.mode === 'ai' ? 'ai' : 'demo_fallback'} />}
                    {s.summary && <div className="text-muted leading-snug">{s.summary}</div>}
                  </li>
                ))}
              </ul>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
