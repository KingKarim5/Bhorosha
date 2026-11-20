import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApi, useAutoRefresh } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, SimulationBanner, Skeleton, VerdictChip, Card, ErrorNote } from '../components/ui';
import { IconAlert } from '../components/icons';

const STATUS: Record<string, { en: string; bn: string; color: string }> = {
  awaiting_release: { en: 'Waiting for the lender to release', bn: 'ঋণদাতার ছাড়ের অপেক্ষায়', color: 'var(--muted)' },
  repaying: { en: 'Repaying', bn: 'শোধ চলছে', color: 'var(--checked)' },
  repaid: { en: 'Fully repaid', bn: 'পুরো শোধ', color: 'var(--viable)' },
};

export default function Portfolio() {
  const { t, n, pick, bdt, lang, digits } = useI18n();
  const { data, error, reload } = useApi('/portfolio');
  useAutoRefresh(reload);
  if (error) return <ErrorNote msg={error} />;
  if (!data) return <Skeleton h={300} />;
  const T = data.totals;
  const pct = T.expected_back_bdt ? Math.round((T.received_bdt / T.expected_back_bdt) * 100) : 0;
  return (
    <div>
      <PageTitle title={t('Your portfolio', 'আপনার পোর্টফোলিও')} sub={t('What you put in, what it earns, what has come back so far and what is still to come, for each lender. It updates as borrowers repay.', 'আপনি কত দিয়েছেন, কত আয় হবে, এ পর্যন্ত কত ফেরত এসেছে আর কত বাকি, প্রতিটি ঋণদাতার জন্য। ঋণগ্রহীতা শোধ করলে আপডেট হয়।')} />
      <SimulationBanner />
      {data.holdings.length === 0 ? (
        <Card>
          <p className="text-muted">{t('No investments yet.', 'এখনো কোনো বিনিয়োগ নেই।')} <Link to="/invest" className="text-accent underline">{t('See the loans open for investment', 'বিনিয়োগের জন্য খোলা ঋণ দেখুন')}</Link></p>
        </Card>
      ) : (
        <>
          {/* totals */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              [t('You put in', 'আপনি দিয়েছেন'), bdt(T.committed_bdt), null],
              [t('Interest you earn', 'আপনার সুদ আয়'), `+${bdt(T.expected_interest_bdt)}`, 'var(--viable)'],
              [t('Total coming back', 'মোট ফেরত আসবে'), bdt(T.expected_back_bdt), null],
              [t('Received so far', 'এ পর্যন্ত পেয়েছেন'), bdt(T.received_bdt), 'var(--checked)'],
            ].map(([k, v, c]) => (
              <div key={k as string} className="card p-4">
                <div className="text-[12.5px] text-muted">{k}</div>
                <div className="num text-[21px] font-semibold mt-0.5" style={{ color: (c as string) || undefined }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="card p-4 mb-5">
            <div className="flex justify-between text-[13px] mb-1.5">
              <span>{t('Repaid to you', 'আপনাকে ফেরত')} <b className="num">{n(pct)}%</b></span>
              <span className="text-muted">{t('Still to come', 'বাকি')} <b className="num">{bdt(T.still_to_come_bdt)}</b></span>
            </div>
            <div className="h-2.5 rounded-full" style={{ background: 'var(--line)' }}><div className="h-2.5 rounded-full" style={{ width: `${pct}%`, background: 'var(--checked)' }} /></div>
          </div>

          {/* per lender */}
          <h2 className="font-display text-[20px] font-semibold mb-2">{t('By lender', 'ঋণদাতা অনুযায়ী')}</h2>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {data.by_lender.map((g: any) => (
              <div key={g.lender_name} className="card p-4">
                <div className="flex justify-between items-baseline gap-2">
                  <b className="text-[16px]">{g.lender_name}</b>
                  <span className="text-[12.5px] text-muted">{n(g.loans)} {t('loans', 'ঋণ')}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[13.5px]">
                  <dt className="text-muted">{t('Put in', 'দিয়েছেন')}</dt><dd className="num text-right">{bdt(g.committed_bdt)}</dd>
                  <dt className="text-muted">{t('Interest you earn', 'সুদ আয়')}</dt><dd className="num text-right" style={{ color: 'var(--viable)' }}>+{bdt(g.expected_interest_bdt)}</dd>
                  <dt className="text-muted">{t('Total coming back', 'মোট ফেরত আসবে')}</dt><dd className="num text-right font-semibold">{bdt(g.expected_back_bdt)}</dd>
                  <dt className="text-muted">{t('Received so far', 'এ পর্যন্ত পেয়েছেন')}</dt><dd className="num text-right" style={{ color: 'var(--checked)' }}>{bdt(g.received_bdt)}</dd>
                  <dt className="text-muted">{t('Still to come', 'বাকি')}</dt><dd className="num text-right">{bdt(g.still_to_come_bdt)}</dd>
                </dl>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
            <Card title={t('Each loan', 'প্রতিটি ঋণ')}>
              <ul className="divide-y divide-line">
                {data.holdings.map((h: any) => {
                  const st = STATUS[h.status];
                  const p = h.expected_back_bdt ? Math.round((h.received_bdt / h.expected_back_bdt) * 100) : 0;
                  return (
                    <li key={h.application} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/invest/${h.application}`} className="font-semibold hover:text-accent">{pick(h.type)}</Link>
                        <span className="num text-[12px] text-muted">{h.code} · {h.lender_name}</span>
                        <span className="ml-auto"><VerdictChip verdict={h.verdict_now} /></span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-[12.5px]">
                        <div><div className="text-muted">{t('Put in', 'দিয়েছেন')}</div><div className="num font-semibold">{bdt(h.amount_bdt)}</div></div>
                        <div><div className="text-muted">{t('Comes back', 'ফেরত আসবে')}</div><div className="num font-semibold">{bdt(h.expected_back_bdt)}</div><div className="text-[11px]" style={{ color: 'var(--viable)' }}>+{bdt(h.expected_interest_bdt)} · {h.rate_pct}%</div></div>
                        <div><div className="text-muted">{t('Received', 'পেয়েছেন')}</div><div className="num font-semibold" style={{ color: 'var(--checked)' }}>{bdt(h.received_bdt)}</div></div>
                      </div>
                      <div className="h-1.5 rounded-full mt-2" style={{ background: 'var(--line)' }}><div className="h-1.5 rounded-full" style={{ width: `${p}%`, background: 'var(--checked)' }} /></div>
                      <div className="flex justify-between text-[11.5px] mt-1">
                        <span style={{ color: st?.color }}>{st ? pick(st) : h.status}</span>
                        <span className="text-muted">{h.next_due_date ? t(`next repayment ${h.next_due_date}`, `পরের কিস্তি ${digits(h.next_due_date)}`) : `${n(h.tenor_months)} ${t('months', 'মাস')} · ${bdt(h.monthly_bdt)}/${t('month', 'মাস')}`}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
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
        </>
      )}
    </div>
  );
}
