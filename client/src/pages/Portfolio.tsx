import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, SimulationBanner, Skeleton, VerdictChip, Sparkline, Card, ErrorNote } from '../components/ui';
import { IconAlert } from '../components/icons';

export default function Portfolio() {
  const { t, n, pick, bdt, lang, digits } = useI18n();
  const { data, error } = useApi('/portfolio');
  if (error) return <ErrorNote msg={error} />;
  if (!data) return <Skeleton h={300} />;
  const total = data.holdings.reduce((a: number, h: any) => a + h.amount_bdt, 0);
  return (
    <div>
      <PageTitle title={t('Your portfolio', 'আপনার পোর্টফোলিও')} sub={t('Holdings, spread across loans, and live updates from the watchman.', 'বিনিয়োগ, ঋণে ঋণে বণ্টন, আর ওয়াচম্যানের সর্বশেষ খবর।')} />
      <SimulationBanner />
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-5">
        <div>
          <Card title={t('Holdings', 'বিনিয়োগ')} right={<span className="num font-semibold">{bdt(total)}</span>}>
            {data.holdings.length === 0 && <p className="text-muted">{t('No commitments yet.', 'এখনো কোনো প্রতিশ্রুতি নেই।')} <Link to="/invest" className="text-accent">{t('See listings', 'তালিকা দেখুন')}</Link></p>}
            <ul className="divide-y divide-line">
              {data.holdings.map((h: any) => (
                <li key={h.application} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[150px]">
                    <div className="font-semibold">{pick(h.type)}</div>
                    <div className="num text-[12px] text-muted">{h.code}</div>
                  </div>
                  <Sparkline values={h.runway} />
                  <VerdictChip verdict={h.verdict_now} />
                  <span className="num w-24 text-right">{bdt(h.amount_bdt)}</span>
                </li>
              ))}
            </ul>
            {total > 0 && (
              <div className="mt-3">
                <div className="text-[12.5px] text-muted mb-1">{t('Spread across loans', 'ঋণে ঋণে বণ্টন')}</div>
                <div className="flex h-3 rounded overflow-hidden">
                  {data.holdings.map((h: any, i: number) => (
                    <div key={h.application} title={h.code} style={{ width: `${(h.amount_bdt / total) * 100}%`, background: ['var(--accent)', 'var(--owner)', 'var(--viable)', 'var(--unsure)'][i % 4] }} />
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
        <Card title={t('Live updates', 'সর্বশেষ খবর')}>
          {data.updates.length === 0 ? (
            <p className="text-muted text-[14px]">{t('No updates yet. Updates appear when the lender’s watchman flags a loan you back.', 'এখনো কোনো খবর নেই। আপনার সমর্থিত ঋণে ওয়াচম্যান সতর্ক করলে খবর আসবে।')}</p>
          ) : (
            <ul className="space-y-3">
              {data.updates.map((u: any) => (
                <motion.li key={u._id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded" style={{ background: 'var(--raised)', borderLeft: `3px solid ${u.tone === 'attention' ? 'var(--unsure)' : 'var(--line)'}` }}>
                  <div className="flex items-center justify-between text-[12px] text-muted">
                    <span className="flex items-center gap-1">
                      {u.tone === 'attention' && <IconAlert width={13} height={13} style={{ color: 'var(--unsure)' }} />} <span className="num">{u.code}</span>
                    </span>
                    <span className="chip !py-0">{t('SIMULATION', 'সিমুলেশন')}</span>
                  </div>
                  <p className="text-[14px] mt-1">{lang === 'bn' ? digits(u.plain_text_bn) : u.plain_text_en}</p>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="text-[12.5px] text-muted mt-4">{n(data.holdings.length)} {t('loans. Investors can lose money. No return is projected.', 'টি ঋণ। বিনিয়োগে লোকসান হতে পারে। কোনো মুনাফার পূর্বাভাস নেই।')}</p>
    </div>
  );
}
