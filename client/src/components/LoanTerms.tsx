import { useState } from 'react';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { ModeBadge, Skeleton, ErrorNote } from './ui';

// Loan terms and repayments on the case page: what the Contract reader, Counter-offer, Pricing,
// Fee explainer, Payment matcher, Servicer and Watchman agents did, next to the code checks that bound them.

const Agent = ({ name }: { name: string }) => <span className="chip !py-0 text-[11px]">{name}</span>;

export const PAY_WORDS: Record<string, { en: string; bn: string; color: string }> = {
  early: { en: 'Early', bn: 'আগাম', color: 'var(--checked)' },
  on_time: { en: 'On time', bn: 'সময়মতো', color: 'var(--checked)' },
  late: { en: 'Late', bn: 'দেরিতে', color: 'var(--unsure)' },
};
export const WATCH_WORDS: Record<string, { en: string; bn: string; color: string }> = {
  real_warning: { en: 'Real warning', bn: 'আসল সতর্কতা', color: 'var(--notviable)' },
  seasonal_pattern: { en: 'Seasonal pattern', bn: 'মৌসুমি ধরন', color: 'var(--owner)' },
  no_concern: { en: 'No concern', bn: 'চিন্তা নেই', color: 'var(--checked)' },
};

export function SplitBar({ per }: { per: { investor: number; bhorsha: number; lender: number } }) {
  const { t, n } = useI18n();
  const parts = [
    { k: 'investor', v: per.investor, c: 'var(--owner)', l: t('Investors', 'বিনিয়োগকারী') },
    { k: 'bhorsha', v: per.bhorsha, c: 'var(--accent)', l: t('Bhorsha', 'ভরসা') },
    { k: 'lender', v: per.lender, c: 'var(--viable)', l: t('Lender', 'ঋণদাতা') },
  ];
  return (
    <div>
      <div className="flex h-3 rounded overflow-hidden" role="img" aria-label={t('Interest split', 'সুদের ভাগ')}>
        {parts.map((p) => <div key={p.k} style={{ width: `${Math.max(0, p.v)}%`, background: p.c }} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[12.5px]">
        {parts.map((p) => (
          <span key={p.k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.c }} />
            {p.l} <b className="num">Tk {n(p.v, { digits: 1 })}</b>
          </span>
        ))}
        <span className="text-muted">{t('of every Tk 100 of interest', 'প্রতি ১০০ টাকা সুদে')}</span>
      </div>
    </div>
  );
}

export function LoanTerms({ caseId, onChange }: { caseId: string; onChange: () => void }) {
  const { t, n, bdt, pick, lang } = useI18n();
  const { data, error, reload } = useApi(`/cases/${caseId}/loan`, [caseId]);
  const [rebate, setRebate] = useState<string>('');
  const [penalty, setPenalty] = useState<string>('');
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  if (error) return <ErrorNote msg={error} />;
  if (!data) return <Skeleton h={160} />;
  const c = data.contract;
  const T = data.terms;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      reload();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const tx = (en?: string, bn?: string) => (lang === 'bn' ? bn || en : en) || '';
  const STATUS: Record<string, { en: string; bn: string; color: string }> = {
    clear: { en: 'Clear', bn: 'পরিষ্কার', color: 'var(--checked)' },
    confirmed: { en: 'Confirmed by the lender', bn: 'ঋণদাতা নিশ্চিত করেছেন', color: 'var(--checked)' },
    unsure: { en: 'Unsure: held for the lender', bn: 'অনিশ্চিত: ঋণদাতার জন্য স্থগিত', color: 'var(--unsure)' },
    invalid: { en: 'Fails the code checks', bn: 'যাচাইয়ে আটকেছে', color: 'var(--notviable)' },
  };
  const f = data.fee_split?.figures;
  return (
    <div className="space-y-5 text-[13.5px]">
      {/* limits and rates */}
      <div className="grid sm:grid-cols-2 gap-2">
        <div className="p-2.5 rounded" style={{ background: 'var(--raised)' }}>
          <div className="flex items-center gap-1.5 font-semibold" style={{ color: data.limits.ok ? 'var(--checked)' : 'var(--notviable)' }}>
            {data.limits.ok ? '✓' : '✗'} {t('Loan limits', 'ঋণের সীমা')}
          </div>
          <div className="text-muted">{data.limits.ok ? t(`Up to Tk ${n(T.max_principal_bdt)} and ${T.max_tenor_months} months: inside.`, `${n(T.max_principal_bdt)} টাকা ও ${n(T.max_tenor_months)} মাস পর্যন্ত: সীমার মধ্যে।`) : data.limits.problems.map((p: any) => pick(p)).join(' ')}</div>
        </div>
        <div className="p-2.5 rounded" style={{ background: 'var(--raised)' }}>
          <div className="flex items-center gap-1.5 font-semibold" style={{ color: data.rate.ok ? 'var(--checked)' : 'var(--notviable)' }}>
            {data.rate.ok ? '✓' : '✗'} {t('Rate setup', 'সুদের কাঠামো')}
          </div>
          <div className="text-muted">{pick(data.rate)}</div>
        </div>
      </div>

      {/* contract reader */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <h4 className="font-semibold">{t('Loan contract', 'ঋণ চুক্তি')}</h4>
          <Agent name="Contract reader" />
          {c && <span className="chip" style={{ color: STATUS[c.status]?.color, borderColor: STATUS[c.status]?.color }}>{pick(STATUS[c.status] || { en: c.status, bn: c.status })}</span>}
          {c?.read_by && <ModeBadge mode={c.read_by} />}
          {c && <span className="text-[11.5px] text-muted">{c.source === 'uploaded' ? t('uploaded by the lender', 'ঋণদাতা আপলোড করেছেন') : t('generated from the application', 'আবেদন থেকে তৈরি')}</span>}
        </div>
        {c ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              <dt className="text-muted">{t('Principal', 'মূল অঙ্ক')}</dt><dd className="num">{c.extracted?.principal_bdt != null ? bdt(c.extracted.principal_bdt) : '—'}</dd>
              <dt className="text-muted">{t('Rate', 'সুদ')}</dt><dd className="num">{c.extracted?.annual_rate_pct ?? '—'}% {t('a year', 'বার্ষিক')}</dd>
              <dt className="text-muted">{t('Tenor', 'মেয়াদ')}</dt><dd className="num">{c.extracted?.tenor_months ?? '—'} {t('months', 'মাস')}</dd>
              <dt className="text-muted">{t('Early repayment', 'আগাম পরিশোধ')}</dt><dd>{c.extracted?.early_clause || '—'}</dd>
              <dt className="text-muted">{t('Late repayment', 'দেরিতে পরিশোধ')}</dt><dd>{c.extracted?.late_clause || '—'}</dd>
            </dl>
            {(c.unclear || []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {c.unclear.map((u: any, i: number) => (
                  <li key={i} className="p-2 rounded" style={{ background: 'color-mix(in oklab, var(--unsure) 12%, transparent)' }}>
                    <b style={{ color: 'var(--unsure)' }}>{t('Unsure', 'অনিশ্চিত')}:</b> {tx(u.why_en, u.why_bn)} <span className="text-muted">“{u.clause}”</span>
                  </li>
                ))}
              </ul>
            )}
            {(c.problems || []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {c.problems.map((p: any, i: number) => (
                  <li key={i} className="p-2 rounded" style={{ background: 'color-mix(in oklab, var(--notviable) 10%, transparent)' }}>
                    <b style={{ color: 'var(--notviable)' }}>{t('Code check', 'কোড যাচাই')}:</b> {pick(p)}
                  </li>
                ))}
              </ul>
            )}
            {c.status === 'unsure' && (
              <div className="mt-3 p-3 rounded border border-line">
                <div className="font-semibold mb-1">{t('Confirm the terms', 'শর্ত নিশ্চিত করুন')}</div>
                <p className="text-muted text-[12.5px] mb-2">{t(`Set the figures the unclear clause should mean. They must sit inside your policy: rebate ${T.rebate_min_pct}–${T.rebate_max_pct}%, penalty ${T.penalty_min_pts}–${T.penalty_max_pts} points.`, `অস্পষ্ট ধারার অঙ্ক ঠিক করে দিন। নীতির ভেতরে থাকতে হবে: ছাড় ${T.rebate_min_pct}–${T.rebate_max_pct}%, জরিমানা ${T.penalty_min_pts}–${T.penalty_max_pts} পয়েন্ট।`)}</p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-[12.5px]">{t('Early rebate (%)', 'আগাম ছাড় (%)')}<input className="input mt-1 w-28" type="number" value={rebate || T.rebate_default_pct} onChange={(e) => setRebate(e.target.value)} /></label>
                  <label className="text-[12.5px]">{t('Late penalty (points a year)', 'দেরির জরিমানা (বার্ষিক পয়েন্ট)')}<input className="input mt-1 w-28" type="number" step={0.5} value={penalty || T.penalty_default_pts} onChange={(e) => setPenalty(e.target.value)} /></label>
                  <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api(`/cases/${caseId}/contract/confirm`, { body: { rebate_pct: Number(rebate || T.rebate_default_pct), penalty_pts: Number(penalty || T.penalty_default_pts) } }))}>
                    {busy ? '…' : t('Confirm and re-run the agents', 'নিশ্চিত করে এজেন্টদের আবার চালান')}
                  </button>
                </div>
              </div>
            )}
            <div className="mt-2">
              <button className="text-[12.5px] text-accent underline" onClick={() => { setEdit(!edit); setText(c.text || ''); }}>
                {edit ? t('Close', 'বন্ধ') : t('View or replace the contract text', 'চুক্তির লেখা দেখুন বা বদলান')}
              </button>
              {edit && (
                <div className="mt-2">
                  <textarea className="input font-mono text-[12px] min-h-[180px]" value={text} onChange={(e) => setText(e.target.value)} />
                  <button className="btn mt-2" disabled={busy || text.trim() === (c.text || '').trim()} onClick={() => run(async () => { await api(`/cases/${caseId}/contract`, { body: { text } }); setEdit(false); })}>
                    {busy ? '…' : t('Save and read it again', 'সংরক্ষণ করে আবার পড়ুন')}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-muted">{t('No contract yet.', 'এখনো চুক্তি নেই।')}</p>
        )}
      </div>

      {/* counter-offer */}
      {data.counter_offer && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h4 className="font-semibold">{t('Counter-offer', 'পাল্টা প্রস্তাব')}</h4>
            <Agent name="Counter-offer" />
            <ModeBadge mode={data.counter_offer.by} />
          </div>
          {data.counter_offer.amount_bdt ? (
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[[t('Amount', 'অঙ্ক'), bdt(data.counter_offer.amount_bdt)], [t('Tenor', 'মেয়াদ'), `${n(data.counter_offer.tenor_months)} ${t('months', 'মাস')}`], [t('Monthly', 'মাসিক'), bdt(data.counter_offer.installment_bdt)]].map(([k, v]) => (
                <div key={k} className="p-2 rounded text-center" style={{ background: 'var(--raised)' }}>
                  <div className="text-[11.5px] text-muted">{k}</div>
                  <div className="num font-semibold">{v}</div>
                </div>
              ))}
            </div>
          ) : null}
          <p>{tx(data.counter_offer.text_en, data.counter_offer.text_bn)}</p>
          <p className="text-[12px] text-muted mt-1">{t('The code clamped the offer to the limits and to the largest amount the rules still judge viable; the AI only wrote the words.', 'কোড প্রস্তাবটি সীমা ও নিয়ম অনুযায়ী টেকসই সর্বোচ্চ অঙ্কে বেঁধে দিয়েছে; এআই শুধু ভাষা লিখেছে।')}</p>
        </div>
      )}

      {/* pricing */}
      {data.pricing && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h4 className="font-semibold">{t('Pricing', 'মূল্য নির্ধারণ')}</h4>
            <Agent name="Pricing" />
            <ModeBadge mode={data.pricing.by} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded" style={{ background: 'var(--raised)' }}>
              <div className="text-[11.5px] text-muted">{t('Early-repayment rebate', 'আগাম পরিশোধে ছাড়')}</div>
              <div className="num font-semibold">{data.pricing.rebate_pct}% <span className="text-muted font-normal text-[11.5px]">{t('of remaining interest', 'বাকি সুদের')} · {t('band', 'সীমা')} {T.rebate_min_pct}–{T.rebate_max_pct}%</span></div>
            </div>
            <div className="p-2 rounded" style={{ background: 'var(--raised)' }}>
              <div className="text-[11.5px] text-muted">{t('Late penalty', 'দেরির জরিমানা')}</div>
              <div className="num font-semibold">+{data.pricing.penalty_pts} {t('points a year', 'পয়েন্ট বার্ষিক')} <span className="text-muted font-normal text-[11.5px]">{t('band', 'সীমা')} {T.penalty_min_pts}–{T.penalty_max_pts}</span></div>
            </div>
          </div>
          <p className="mt-1">{tx(data.pricing.reason_en, data.pricing.reason_bn)}</p>
          {(data.pricing.clamped || []).length > 0 && <p className="text-[12px]" style={{ color: 'var(--unsure)' }}>{t('Clamped by the code', 'কোড বেঁধে দিয়েছে')}: {data.pricing.clamped.join('; ')}</p>}
        </div>
      )}

      {/* fee explainer */}
      {f && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h4 className="font-semibold">{t('How the interest is shared', 'সুদ কীভাবে ভাগ হয়')}</h4>
            <Agent name="Fee explainer" />
            {data.fee_split.by && <ModeBadge mode={data.fee_split.by} />}
          </div>
          <SplitBar per={f.per_100} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[12.5px]">
            {[[t('Borrower rate', 'ঋণগ্রহীতার সুদ'), `${f.borrower_rate_pct}%`], [t('Investor rate', 'বিনিয়োগকারীর হার'), `${f.investor_rate_pct}%`], [t('Bhorsha fee', 'ভরসার ফি'), `${f.fee_pct}% ${t('of interest', 'সুদের')}`], [t('Total interest', 'মোট সুদ'), bdt(f.total_interest_bdt)]].map(([k, v]) => (
              <div key={k} className="p-2 rounded" style={{ background: 'var(--raised)' }}>
                <div className="text-muted text-[11.5px]">{k}</div>
                <div className="num font-semibold">{v}</div>
              </div>
            ))}
          </div>
          {data.fee_split.text_en && <p className="mt-2">{tx(data.fee_split.text_en, data.fee_split.text_bn)}</p>}
        </div>
      )}

      {/* repayments */}
      {data.account && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h4 className="font-semibold">{t('Repayments', 'কিস্তি পরিশোধ')}</h4>
            <span className="num text-muted">{data.account.ref}</span>
            <Agent name="Payment matcher" />
            <Agent name="Servicer" />
            <Agent name="Watchman" />
            <button className="btn !min-h-0 !py-1 text-[12.5px] ml-auto" disabled={busy} onClick={() => run(async () => setQuote(await api(`/cases/${caseId}/settlement-quote`, { body: {} })))}>
              {t('Early-settlement quote', 'আগাম শোধের হিসাব')}
            </button>
          </div>
          {quote && (
            <div className="p-2.5 rounded mb-2" style={{ background: 'color-mix(in oklab, var(--accent) 10%, transparent)' }}>
              <div className="flex justify-between gap-2"><b className="num">{bdt(quote.quote.total_to_settle_bdt)}</b><ModeBadge mode={quote.message.by} /></div>
              <p className="mt-1">{tx(quote.message.text_en, quote.message.text_bn)}</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] num">
              <thead className="text-muted text-left">
                <tr><th className="py-1 pr-2">#</th><th className="pr-2">{t('Due', 'তারিখ')}</th><th className="pr-2 text-right">{t('Amount', 'অঙ্ক')}</th><th className="pr-2 text-right">{t('Paid', 'পরিশোধ')}</th><th>{t('Status', 'অবস্থা')}</th></tr>
              </thead>
              <tbody>
                {data.account.schedule.map((x: any) => (
                  <tr key={x.n} className="border-t border-line">
                    <td className="py-1 pr-2">{x.n}</td>
                    <td className="pr-2">{x.due_date}</td>
                    <td className="pr-2 text-right">{n(x.amount_bdt)}</td>
                    <td className="pr-2 text-right">{n(x.paid_bdt)}</td>
                    <td style={{ color: x.status === 'paid' ? 'var(--checked)' : x.status === 'partial' ? 'var(--unsure)' : 'var(--muted)' }}>{x.status === 'paid' ? t('paid', 'পরিশোধিত') : x.status === 'partial' ? t('part paid', 'আংশিক') : t('due', 'বাকি')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.payments.length > 0 ? <PaymentList payments={data.payments} /> : <p className="text-muted mt-2">{t('No payments yet. Use Watchlist → Simulate, or send a test payment from the Repayments page.', 'এখনো কোনো পরিশোধ নেই। নজরতালিকা → সিমুলেট, অথবা কিস্তি পাতা থেকে পরীক্ষামূলক পরিশোধ পাঠান।')}</p>}
        </div>
      )}
      <ErrorNote msg={err} />
    </div>
  );
}

export function PaymentList({ payments, showShop = false }: { payments: any[]; showShop?: boolean }) {
  const { t, pick, bdt, lang } = useI18n();
  return (
    <ul className="mt-2 space-y-1.5">
      {payments.map((p: any) => (
        <li key={p._id} className="p-2 rounded text-[13px]" style={{ background: 'var(--raised)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-muted">{String(p.received_at).slice(0, 10)}</span>
            {showShop && <b>{p.shop_label || t('unknown loan', 'অজানা ঋণ')}</b>}
            <b className="num">{bdt(p.amount_bdt)}</b>
            <span className="text-muted">{p.channel === 'bank' ? t('bank', 'ব্যাংক') : 'bKash'}</span>
            {p.classification && <span className="chip !py-0" style={{ color: PAY_WORDS[p.classification]?.color }}>{pick(PAY_WORDS[p.classification])}{p.days_from_due ? ` (${p.days_from_due > 0 ? '+' : ''}${p.days_from_due}d)` : ''}</span>}
            {p.partial && <span className="chip !py-0" style={{ color: 'var(--unsure)' }}>{t('partial', 'আংশিক')}</span>}
            {p.status === 'review' && <span className="chip !py-0" style={{ color: 'var(--unsure)' }}>{t('in review', 'পর্যালোচনায়')}</span>}
            {p.status === 'rejected' && <span className="chip !py-0" style={{ color: 'var(--notviable)' }}>{t('rejected', 'বাতিল')}</span>}
            <span className="text-[11.5px] text-muted ml-auto">
              {p.matched_by === 'reference' ? t('matched by reference', 'রেফারেন্সে মিলেছে') : p.matched_by === 'lender' ? t('applied by the lender', 'ঋণদাতা যোগ করেছেন') : `${p.matched_by === 'ai' ? 'AI' : t('code score', 'কোড স্কোর')} · ${Math.round((p.confidence || 0) * 100)}%`}
            </span>
          </div>
          {p.status === 'review' && p.match_reason && <div className="text-[12px] text-muted mt-0.5">{p.match_reason}</div>}
          {p.watch && (
            <div className="text-[12.5px] mt-1 flex flex-wrap items-center gap-1.5">
              <span className="chip !py-0" style={{ color: WATCH_WORDS[p.watch.assessment]?.color }}>{t('Watchman', 'ওয়াচম্যান')}: {pick(WATCH_WORDS[p.watch.assessment])}</span>
              <span>{lang === 'bn' ? p.watch.reason_bn || p.watch.reason_en : p.watch.reason_en}</span>
              <span className="text-muted">→ {p.watch.routed_to}</span>
              <ModeBadge mode={p.watch.by} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
