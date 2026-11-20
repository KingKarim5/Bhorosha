import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { PageTitle, Card, Skeleton, ErrorNote, ModeBadge } from '../components/ui';
import { PaymentList, PAY_WORDS } from '../components/LoanTerms';

// Repayments (v3): incoming bKash and bank payments arrive through a signed webhook. The Payment matcher
// matches them to loans; below the confidence threshold they wait here for the lender instead of being applied.

export default function Repayments() {
  const { t, n, bdt, pick } = useI18n();
  const { data, error, reload } = useApi('/repayments');
  const [form, setForm] = useState({ reference: '', amount_bdt: '', payer_label: '', channel: 'bkash', received_at: '', bad_signature: false });
  const [sent, setSent] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick2, setPick2] = useState<Record<string, string>>({});
  if (error) return <ErrorNote msg={error} />;
  if (!data) return <Skeleton h={300} />;
  const send = async () => {
    setBusy(true);
    setErr(null);
    setSent(null);
    try {
      setSent(await api('/payments/test', { body: { ...form, amount_bdt: Number(form.amount_bdt), received_at: form.received_at || undefined } }));
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const review = async (id: string, action: 'apply' | 'reject') => {
    setErr(null);
    try {
      await api(`/payments/${id}/review`, { body: { action, loan_ref: pick2[id] || undefined } });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const fill = (l: any) => setForm({ ...form, reference: l.ref, amount_bdt: String(l.next_due ? l.next_due.amount_bdt - l.next_due.paid_bdt : ''), payer_label: l.payer_label });
  return (
    <div>
      <PageTitle
        title={t('Repayments', 'কিস্তি পরিশোধ')}
        sub={t(`bKash and bank payments arrive through a signed webhook. The Payment matcher applies them; anything it is unsure about waits for you. Simulation day: ${data.day}.`, `বিকাশ ও ব্যাংকের টাকা স্বাক্ষরিত ওয়েবহুকে আসে। পেমেন্ট ম্যাচার মিলিয়ে যোগ করে; অনিশ্চিত হলে আপনার জন্য অপেক্ষা করে। সিমুলেশনের দিন: ${data.day}।`)}
      />
      <div className="grid xl:grid-cols-[1.2fr_1fr] gap-5">
        <div className="space-y-5">
          <Card title={t('Loans', 'ঋণ')}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-muted text-left text-[12px]">
                  <tr><th className="py-1 pr-2">{t('Loan', 'ঋণ')}</th><th className="pr-2">{t('Repaid', 'পরিশোধ')}</th><th className="pr-2">{t('Next due', 'পরের কিস্তি')}</th><th className="pr-2 text-right">{t('Overdue', 'বকেয়া')}</th><th className="pr-2">{t('Terms', 'শর্ত')}</th><th /></tr>
                </thead>
                <tbody>
                  {data.loans.map((l: any) => (
                    <tr key={l._id} className="border-t border-line align-top">
                      <td className="py-1.5 pr-2">
                        <Link to={`/cases/${l.application}`} className="font-semibold hover:text-accent">{l.shop}</Link>
                        <div className="num text-[11.5px] text-muted">{l.ref} · {bdt(l.principal_bdt)}</div>
                      </td>
                      <td className="pr-2 w-32">
                        <div className="h-1.5 rounded mt-2" style={{ background: 'var(--line)' }}><div className="h-1.5 rounded" style={{ width: `${(l.paid_bdt / l.total_bdt) * 100}%`, background: 'var(--accent)' }} /></div>
                        <div className="num text-[11.5px] text-muted">{n(Math.round((l.paid_bdt / l.total_bdt) * 100))}%</div>
                      </td>
                      <td className="pr-2 num text-[12.5px] whitespace-nowrap">{l.next_due ? <>{l.next_due.due_date}<div className="text-muted">{n(l.next_due.amount_bdt - l.next_due.paid_bdt)}</div></> : t('repaid', 'শোধ')}</td>
                      <td className="pr-2 num text-right" style={{ color: l.overdue_bdt ? 'var(--unsure)' : 'var(--muted)' }}>{n(l.overdue_bdt)}</td>
                      <td className="pr-2 num text-[11.5px] text-muted">{l.annual_rate_pct}% · {t('rebate', 'ছাড়')} {l.rebate_pct}% · +{l.penalty_pts}</td>
                      <td><button className="btn !min-h-0 !py-1 text-[12px]" onClick={() => fill(l)}>{t('Pay', 'পরিশোধ')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={t('Review queue', 'পর্যালোচনার তালিকা')} right={<span className="chip">{n(data.review.length)}</span>}>
            {data.review.length === 0 ? (
              <p className="text-muted text-[13.5px]">{t('Nothing waiting. Payments the matcher is unsure about appear here and are not applied until you decide.', 'কিছু অপেক্ষায় নেই। ম্যাচার যেগুলো নিয়ে অনিশ্চিত, সেগুলো এখানে আসে এবং আপনি ঠিক না করা পর্যন্ত যোগ হয় না।')}</p>
            ) : (
              <ul className="space-y-2">
                {data.review.map((p: any) => (
                  <li key={p._id} className="p-2.5 rounded text-[13px]" style={{ background: 'var(--raised)' }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-muted">{String(p.received_at).slice(0, 10)}</span>
                      <b className="num">{bdt(p.amount_bdt)}</b>
                      <span className="text-muted">{p.payer_label || t('unknown payer', 'অজানা প্রেরক')}</span>
                      <span className="text-muted">{p.reference ? `“${p.reference}”` : t('no reference', 'রেফারেন্স নেই')}</span>
                      <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-muted">{t('confidence', 'আস্থা')} {Math.round((p.confidence || 0) * 100)}% <ModeBadge mode={p.matched_by === 'ai' ? 'ai' : 'demo_fallback'} /></span>
                    </div>
                    <div className="text-[12px] text-muted mt-0.5">{p.match_reason} {p.loan_ref && <>({t('best guess', 'সম্ভাব্য')}: <b className="num">{p.loan_ref}</b>)</>}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <select className="input !w-auto !py-1 text-[12.5px]" value={pick2[p._id] ?? p.loan_ref ?? ''} onChange={(e) => setPick2({ ...pick2, [p._id]: e.target.value })}>
                        <option value="">{t('Choose the loan', 'ঋণ বাছুন')}</option>
                        {data.loans.map((l: any) => <option key={l.ref} value={l.ref}>{l.ref} · {l.shop}</option>)}
                      </select>
                      <button className="btn btn-primary !min-h-0 !py-1 text-[12.5px]" disabled={!(pick2[p._id] ?? p.loan_ref)} onClick={() => review(p._id, 'apply')}>{t('Apply to this loan', 'এই ঋণে যোগ করুন')}</button>
                      <button className="btn !min-h-0 !py-1 text-[12.5px]" onClick={() => review(p._id, 'reject')}>{t('Reject', 'বাতিল')}</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t('Payments received', 'পাওয়া পরিশোধ')}>
            {data.payments.length ? <PaymentList payments={data.payments} showShop /> : <p className="text-muted text-[13.5px]">{t('No payments yet. Watchlist → Simulate next month sends each funded loan’s instalment through the webhook.', 'এখনো কিছু নেই। নজরতালিকা → পরের মাস সিমুলেট করলে প্রতিটি ঋণের কিস্তি ওয়েবহুকে আসে।')}</p>}
          </Card>
        </div>
        <Card title={t('Send a test payment', 'পরীক্ষামূলক পরিশোধ পাঠান')} className="h-fit xl:sticky xl:top-20">
          <p className="text-[12.5px] text-muted mb-3">{t('Builds a payment notification, signs it with HMAC-SHA256 the way bKash or a bank would, and sends it through the real webhook path. Leave the reference empty to make the AI match it; tick the box to see a forged one refused.', 'বিকাশ বা ব্যাংকের মতো একটি নোটিফিকেশন তৈরি করে HMAC-SHA256 স্বাক্ষর দিয়ে আসল ওয়েবহুক পথে পাঠায়। রেফারেন্স খালি রাখলে এআই মেলাবে; বক্সে টিক দিলে জাল নোটিফিকেশন বাতিল হতে দেখবেন।')}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12.5px] col-span-2">{t('Reference (loan ref)', 'রেফারেন্স (ঋণ নম্বর)')}<input className="input mt-1" value={form.reference} placeholder="LN-…" onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
            <label className="text-[12.5px]">{t('Amount (BDT)', 'অঙ্ক (টাকা)')}<input className="input mt-1" type="number" value={form.amount_bdt} onChange={(e) => setForm({ ...form, amount_bdt: e.target.value })} /></label>
            <label className="text-[12.5px]">{t('Channel', 'মাধ্যম')}<select className="input mt-1" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="bkash">bKash</option><option value="bank">{t('Bank', 'ব্যাংক')}</option></select></label>
            <label className="text-[12.5px] col-span-2">{t('Payer', 'প্রেরক')}<input className="input mt-1" value={form.payer_label} onChange={(e) => setForm({ ...form, payer_label: e.target.value })} /></label>
            <label className="text-[12.5px] col-span-2">{t('Received on (blank = simulation day)', 'পাওয়ার তারিখ (খালি = সিমুলেশনের দিন)')}<input className="input mt-1" type="date" value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-[12.5px] col-span-2"><input type="checkbox" className="h-4 w-4" checked={form.bad_signature} onChange={(e) => setForm({ ...form, bad_signature: e.target.checked })} />{t('Send with a wrong signature', 'ভুল স্বাক্ষর দিয়ে পাঠান')}</label>
          </div>
          <button className="btn btn-primary w-full justify-center mt-3" disabled={busy || !(Number(form.amount_bdt) > 0)} onClick={send}>{busy ? t('Matching…', 'মেলানো হচ্ছে…') : t('Send through the webhook', 'ওয়েবহুকে পাঠান')}</button>
          <ErrorNote msg={err} />
          {sent?.payment && (
            <div className="mt-3 p-2.5 rounded text-[13px]" style={{ background: 'var(--raised)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <b>{sent.payment.status === 'applied' ? t('Applied', 'যোগ হয়েছে') : t('Sent to the review queue', 'পর্যালোচনায় পাঠানো হয়েছে')}</b>
                {sent.payment.classification && <span className="chip !py-0" style={{ color: PAY_WORDS[sent.payment.classification]?.color }}>{pick(PAY_WORDS[sent.payment.classification])}</span>}
                <span className="text-muted text-[12px]">{Math.round((sent.payment.confidence || 0) * 100)}% · {sent.payment.matched_by}</span>
              </div>
              <div className="text-[12px] text-muted mt-1">{sent.payment.match_reason}</div>
              {sent.payment.watch && <div className="text-[12.5px] mt-1">{t('Watchman', 'ওয়াচম্যান')}: {sent.payment.watch.assessment.replace('_', ' ')} — {sent.payment.watch.reason_en}</div>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
