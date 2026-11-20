import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useApi, useAutoRefresh } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, SimulationBanner, Skeleton, VerdictChip, Sparkline, ErrorNote, Card } from '../components/ui';

export default function Invest() {
  const { t, n, pick, bdt } = useI18n();
  const { data, error, reload } = useApi<any[]>('/invest/listings');
  useAutoRefresh(reload);
  const [budget, setBudget] = useState(100000);
  const alloc = useApi(`/invest/allocate?budget=${budget}`, [budget]);
  const lenders = data ? [...new Set(data.map((l) => l.lender_name))] : [];
  const [lender, setLender] = useState<string>('all');
  const shown = (data || []).filter((l) => lender === 'all' || l.lender_name === lender);
  return (
    <div>
      <PageTitle
        title={t('Loans open for investment', 'বিনিয়োগের জন্য খোলা ঋণ')}
        sub={t('Every loan an AI agent approved inside its lender’s policy, from every lender. New approvals appear here on their own. Shop names are hidden.', 'প্রতিটি ঋণদাতার নীতির ভেতরে এআই যেসব ঋণ অনুমোদন করেছে, সব এখানে। নতুন অনুমোদন নিজে থেকেই আসে। দোকানের নাম লুকানো।')}
      />
      <SimulationBanner />
      <ErrorNote msg={error} />
      {lenders.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={t('Lender', 'ঋণদাতা')}>
          {['all', ...lenders].map((l) => (
            <button key={l} className="chip" onClick={() => setLender(l)} style={lender === l ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
              {l === 'all' ? t(`All lenders (${data!.length})`, `সব ঋণদাতা (${n(data!.length)})`) : `${l} (${data!.filter((x) => x.lender_name === l).length})`}
            </button>
          ))}
        </div>
      )}
      {!data ? (
        <Skeleton h={200} />
      ) : shown.length === 0 ? (
        <p className="text-muted">{t('No loans open right now. Approved loans appear here as soon as the AI approves them.', 'এখন কোনো ঋণ খোলা নেই। এআই অনুমোদন করলেই এখানে আসবে।')}</p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((l) => {
            const full = l.open_bdt <= 0;
            return (
              <Link key={l.id} to={`/invest/${l.id}`} className="card p-4 hover:border-accent transition-colors flex flex-col">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] text-muted truncate"><span className="num">{l.code}</span> · {l.lender_name}</div>
                    <div className="font-display text-[18px] font-semibold">{pick(l.type)}</div>
                    <div className="text-[13px] text-muted num">{bdt(l.loan_bdt)} · {n(l.tenor_months)} {t('months', 'মাস')}{l.released ? ` · ${t('released', 'ছাড় হয়েছে')}` : ''}</div>
                  </div>
                  <VerdictChip verdict={l.verdict} />
                </div>
                <div className="mt-3 rounded-lg p-3" style={{ background: 'color-mix(in oklab, var(--viable) 10%, transparent)' }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12.5px] text-muted">{t('You earn', 'আপনার আয়')}</span>
                    <span className="num font-semibold text-[18px]" style={{ color: 'var(--viable)' }}>{l.investor_rate_pct}% <span className="text-[12px] font-normal text-muted">{t('a year', 'বছরে')}</span></span>
                  </div>
                  <div className="text-[13px] mt-1">
                    {t('Put in', 'দিলে')} <b className="num">Tk 10,000</b> → {t('get back', 'ফেরত')} <b className="num">{bdt(l.example_10k.total_back_bdt)}</b>
                    <span className="text-muted"> ({t('+', '+')}{bdt(l.example_10k.interest_bdt)}, {bdt(l.example_10k.monthly_bdt)}/{t('month', 'মাস')})</span>
                  </div>
                </div>
                <div className="mt-3">
                  <Sparkline values={l.runway} w={260} h={34} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-[13px]">
                  <div>
                    <div className="text-muted">{t(`Open (investors fund up to ${l.investor_share_pct}%)`, `বাকি (বিনিয়োগকারী সর্বোচ্চ ${n(l.investor_share_pct)}%)`)}</div>
                    <div className="num font-semibold" style={{ color: full ? 'var(--muted)' : undefined }}>{full ? t('Fully funded', 'পুরো অর্থায়ন হয়েছে') : bdt(l.open_bdt)}</div>
                  </div>
                  <div>
                    <div className="text-muted">{t('Claims checked', 'যাচাই করা দাবি')}</div>
                    <div className="num font-semibold">{n(l.checked_share)}%</div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full" style={{ background: 'var(--line)' }} title={t(`${n(l.committed_bdt)} of ${n(l.investor_share_bdt)} committed`, `${n(l.investor_share_bdt)}-এর মধ্যে ${n(l.committed_bdt)} প্রতিশ্রুত`)}>
                  <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (l.committed_bdt / l.investor_share_bdt) * 100)}%`, background: 'var(--accent)' }} />
                </div>
                <div className="text-[11.5px] text-muted mt-1 num">{t(`${n(l.committed_bdt)} of ${n(l.investor_share_bdt)} committed`, `${n(l.investor_share_bdt)}-এর মধ্যে ${n(l.committed_bdt)} প্রতিশ্রুত`)}</div>
              </Link>
            );
          })}
        </div>
      )}
      <Card title={t('Spread an amount across loans', 'একটি অঙ্ক কয়েকটি ঋণে ভাগ করুন')} className="mt-6">
        <p className="text-[13.5px] text-muted mb-3">{t('Enter any amount and Bhorsha suggests how to spread it across the open loans, so not everything rides on one shop.', 'যেকোনো অঙ্ক দিন, ভরসা খোলা ঋণগুলোতে ভাগ করার প্রস্তাব দেবে, যাতে সব টাকা এক দোকানে না যায়।')}</p>
        <div className="flex items-center gap-3 mb-3">
          <label className="label" htmlFor="b">{t('Amount', 'অঙ্ক')}</label>
          <input id="b" type="number" step={10000} className="input max-w-[180px]" value={budget} onChange={(e) => setBudget(Math.max(1000, Number(e.target.value)))} />
        </div>
        {alloc.data && (
          <ul className="space-y-1 text-[13.5px]">
            {alloc.data.proposal.map((p: any) => {
              const l = alloc.data.listings.find((x: any) => x.id === p.id);
              return (
                <li key={p.id} className="flex justify-between gap-3">
                  <span><span className="num text-muted">{l?.code}</span> {pick(l?.type)}</span>
                  <span className="num font-semibold">{bdt(p.amount_bdt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
