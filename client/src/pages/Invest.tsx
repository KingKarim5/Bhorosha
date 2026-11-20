import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, SimulationBanner, Skeleton, VerdictChip, Sparkline, ErrorNote, Card } from '../components/ui';

export default function Invest() {
  const { t, n, pick, bdt } = useI18n();
  const { data, error } = useApi<any[]>('/invest/listings');
  const [budget, setBudget] = useState(100000);
  const alloc = useApi(`/invest/allocate?budget=${budget}`, [budget]);
  return (
    <div>
      <PageTitle title={t('Listed cases', 'তালিকাভুক্ত কেস')} sub={t('Loans approved inside the lender’s policy. Shop names are hidden.', 'ঋণদাতার নীতির ভেতরে অনুমোদিত ঋণ। দোকানের নাম লুকানো।')} />
      <SimulationBanner />
      <ErrorNote msg={error} />
      {!data ? (
        <Skeleton h={200} />
      ) : data.length === 0 ? (
        <p className="text-muted">{t('No listed cases right now.', 'এখন কোনো তালিকাভুক্ত কেস নেই।')}</p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.map((l) => (
            <Link key={l.id} to={`/invest/${l.id}`} className="card p-4 hover:border-accent transition-colors">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="num text-[12px] text-muted">{l.code}{l.lender_name ? ` · ${l.lender_name}` : ''}</div>
                  <div className="font-display text-[18px] font-semibold">{pick(l.type)}</div>
                  <div className="text-[13px] text-muted">{pick(l.size)}</div>
                </div>
                <VerdictChip verdict={l.verdict} />
              </div>
              <div className="mt-3">
                <Sparkline values={l.runway} w={260} h={40} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-[13px]">
                <div>
                  <div className="text-muted">{t('Investor share open', 'বিনিয়োগকারীর অংশ বাকি')}</div>
                  <div className="num font-semibold">
                    {bdt(l.open_bdt)} / {n(l.investor_share_bdt)}
                  </div>
                </div>
                <div>
                  <div className="text-muted">{t('Claims checked', 'যাচাই করা দাবি')}</div>
                  <div className="num font-semibold">{n(l.checked_share)}%</div>
                </div>
              </div>
              <div className="mt-2 h-1.5 rounded-full" style={{ background: 'var(--line)' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${(l.committed_bdt / l.investor_share_bdt) * 100}%`, background: 'var(--accent)' }} />
              </div>
            </Link>
          ))}
        </div>
      )}
      <Card title={t('Suggested spread', 'প্রস্তাবিত বণ্টন')} className="mt-6">
        <p className="text-[13.5px] text-muted mb-3">{t('Enter an amount and Bhorsha spreads it across the listed loans, within your caps.', 'একটি অঙ্ক দিন, ভরসা আপনার সীমার মধ্যে তালিকার ঋণগুলোতে ভাগ করে দেবে।')}</p>
        <div className="flex items-center gap-3 mb-3">
          <label className="label" htmlFor="b">{t('Amount', 'অঙ্ক')}</label>
          <input id="b" type="number" step={10000} className="input max-w-[180px]" value={budget} onChange={(e) => setBudget(Math.max(1000, Number(e.target.value)))} />
        </div>
        {alloc.data && (
          <div className="text-[13.5px]">
            <ul className="space-y-1">
              {alloc.data.proposal.map((p: any) => {
                const l = alloc.data.listings.find((x: any) => x.id === p.id);
                return (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span>
                      <span className="num text-muted">{l?.code}</span> {pick(l?.type)}
                    </span>
                    <span className="num font-semibold">{bdt(p.amount_bdt)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
