import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { PageTitle, Skeleton, Sparkline, ErrorNote } from '../components/ui';
import { RunwayChart } from '../components/RunwayChart';
import { IconPulse, IconAlert, IconCheck } from '../components/icons';

const SEV: Record<string, { en: string; bn: string; color: string }> = {
  call: { en: 'Call', bn: 'ফোন করুন', color: 'var(--notviable)' },
  watch: { en: 'Watch', bn: 'নজর রাখুন', color: 'var(--unsure)' },
  no_data: { en: 'No data', bn: 'তথ্য নেই', color: 'var(--owner)' },
};

function Intervention({ flag, onDone }: { flag: any; onDone: () => void }) {
  const { t } = useI18n();
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (action.trim().length < 2) return;
    setBusy(true);
    try {
      await api(`/flags/${flag._id}/interventions`, { body: { action, result_note: note } });
      setAction('');
      setNote('');
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2">
      {(flag.interventions || []).length > 0 && (
        <ul className="mb-2 space-y-1 text-[13px]">
          {flag.interventions.map((i: any) => (
            <li key={i._id} className="flex gap-1.5">
              <IconCheck className="shrink-0 mt-0.5" style={{ color: 'var(--checked)' }} /> <b>{i.action}</b> {i.result_note && <span className="text-muted">— {i.result_note}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input className="input" value={action} onChange={(e) => setAction(e.target.value)} placeholder={t('Action taken (e.g. called the owner)', 'নেওয়া পদক্ষেপ (যেমন মালিককে ফোন)')} />
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Result', 'ফলাফল')} />
        <button className="btn" onClick={save} disabled={busy}>
          {t('Log', 'লিখুন')}
        </button>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const { t, n, pick, bdt } = useI18n();
  const { data, error, reload } = useApi('/watchlist');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const simulate = async () => {
    setBusy(true);
    try {
      const r = await api('/watchlist/simulate', { method: 'POST' });
      setLast(r);
      await reload();
      const flagged = r.events?.find((e: any) => e.flagged);
      if (flagged) {
        const row = data?.rows.find((x: any) => x.label === flagged.shop);
        if (row) setOpen(String(row.shop_id));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <PageTitle
        title={t('Branch watchlist', 'শাখার নজরতালিকা')}
        sub={t("Funded borrowers ranked by severity and recency. The watchman forecasts each shop's expected sales from its own history and season, and flags a month that falls below the band.", 'ঋণপ্রাপ্তদের তালিকা, গুরুত্ব ও সাম্প্রতিকতা অনুযায়ী। প্রতিটি দোকানের নিজের ইতিহাস ও মৌসুম থেকে প্রত্যাশিত বিক্রির পূর্বাভাস হয়, সীমার নিচে নামলে সতর্ক করা হয়।')}
        right={
          <div className="flex items-center gap-3">
            {data && (
              <span className="chip num">
                {data.current_month ? `${t('Now showing', 'দেখানো হচ্ছে')} ${data.current_month}` : t('Before the first month', 'প্রথম মাসের আগে')} · {n(data.month_index)}/{n(data.max)}
              </span>
            )}
            <button className="btn btn-primary text-[15.5px]" onClick={simulate} disabled={busy || (data && data.month_index >= data.max)}>
              <IconPulse /> {busy ? t('Simulating…', 'সিমুলেট হচ্ছে…') : t('Simulate next month', 'পরের মাস সিমুলেট করুন')}
            </button>
          </div>
        }
      />
      <ErrorNote msg={error} />
      <AnimatePresence>
        {last?.events && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card p-3 mb-4 text-[13.5px]">
            <b className="num">{last.month}</b>:{' '}
            {last.events.map((e: any, i: number) => (
              <span key={i} className="mr-3">
                {e.shop} {e.flagged ? <b style={{ color: 'var(--notviable)' }}>{t('below band', 'সীমার নিচে')}</b> : <span style={{ color: 'var(--checked)' }}>{t('within band', 'সীমার মধ্যে')}</span>}
                {!e.flagged && e.baseline_flag && <span className="text-muted"> ({t('a fixed 30% rule would have alarmed', 'নির্দিষ্ট ৩০% নিয়মে ভুল সতর্কতা হতো')})</span>}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {!data ? (
        <Skeleton h={300} />
      ) : (
        <div className="space-y-3">
          {data.rows.map((r: any) => {
            const flag = r.latest_flag;
            const sev = flag ? SEV[flag.severity] : null;
            const isOpen = open === String(r.shop_id);
            const lastF = r.forecasts[r.forecasts.length - 1];
            const bands = r.forecasts.map((f: any) => ({ month: f.month, low: f.expected_low, mid: f.expected_mid, high: f.expected_high, flagged: f.flagged }));
            return (
              <div key={r.shop_id} className="card" style={flag && flag.severity !== 'no_data' ? { borderColor: sev!.color } : undefined}>
                <button className="w-full flex flex-wrap items-center gap-x-5 gap-y-2 p-4 text-left" onClick={() => setOpen(isOpen ? null : String(r.shop_id))} aria-expanded={isOpen}>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold text-[16px]">{r.label}</div>
                    <div className="text-[12.5px] text-muted">
                      {lastF ? (
                        <>
                          {t('Last month', 'গত মাস')} <span className="num">{bdt(lastF.actual)}</span> · {t('expected', 'প্রত্যাশিত')} <span className="num">{n(lastF.expected_low)}–{n(lastF.expected_high)}</span>
                        </>
                      ) : (
                        t('No simulated month yet', 'এখনো কোনো মাস সিমুলেট হয়নি')
                      )}
                    </div>
                  </div>
                  <Sparkline values={r.months.map((m: any) => m.inflow)} w={150} h={34} pulse={!!flag && flag.severity !== 'no_data'} color={flag && flag.severity !== 'no_data' ? 'var(--unsure)' : 'var(--accent)'} />
                  {flag ? (
                    <span className="chip" style={{ color: sev!.color, borderColor: sev!.color }}>
                      <IconAlert width={13} height={13} /> {pick(sev!)} · {pick({ en: flag.probable_cause, bn: flag.probable_cause_bn })}
                    </span>
                  ) : (
                    <span className="chip" style={{ color: 'var(--checked)' }}>
                      <IconCheck width={13} height={13} /> {t('Holding', 'ঠিক আছে')}
                    </span>
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-4 grid lg:grid-cols-[1.4fr_1fr] gap-5">
                        <div>
                          <RunwayChart points={r.months.map((m: any) => ({ month: m.month, value: m.inflow }))} bands={bands} futureBand={r.next_forecast} label={t('Visible sales against the forecast band', 'পূর্বাভাসের সীমার বিপরীতে দৃশ্যমান বিক্রি')} />
                          <p className="text-[12px] text-muted mt-1">
                            {r.business_type === 'fish_trader'
                              ? t('Seasonal shop: the band follows the season, so a lean month is expected, not alarming.', 'মৌসুমি দোকান: সীমা মৌসুম অনুসরণ করে, তাই মন্দা মাস প্রত্যাশিত, ভয়ের নয়।')
                              : t('Shaded band: the 80% forecast range from the shop’s own history.', 'ছায়াযুক্ত অংশ: দোকানের নিজের ইতিহাস থেকে ৮০% পূর্বাভাস সীমা।')}
                          </p>
                          <table className="w-full text-[12.5px] num mt-2">
                            <thead>
                              <tr className="text-muted text-left">
                                <th>{t('Month', 'মাস')}</th>
                                <th>{t('Actual', 'আসল')}</th>
                                <th>{t('Expected', 'প্রত্যাশিত')}</th>
                                <th>{t('Watchman', 'ওয়াচম্যান')}</th>
                                <th>{t('Fixed 30% rule', 'নির্দিষ্ট ৩০% নিয়ম')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.forecasts.map((f: any) => (
                                <tr key={f.month} className="border-t border-line">
                                  <td className="py-1">{f.month}</td>
                                  <td>{n(f.actual)}</td>
                                  <td>
                                    {n(f.expected_low)}–{n(f.expected_high)}
                                  </td>
                                  <td style={{ color: f.flagged ? 'var(--notviable)' : 'var(--checked)' }}>{f.flagged ? t('below', 'নিচে') : t('ok', 'ঠিক')}</td>
                                  <td style={{ color: f.baseline_flag ? 'var(--notviable)' : 'var(--muted)' }}>{f.baseline_flag ? t('alarm', 'সতর্কতা') : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div>
                          {r.flags.length === 0 && <p className="text-muted text-[14px]">{t('No flags. The line is holding inside its band.', 'কোনো সতর্কতা নেই। রেখা সীমার মধ্যেই আছে।')}</p>}
                          {r.flags.map((f: any) => (
                            <div key={f._id} className="mb-4 p-3 rounded" style={{ background: 'var(--raised)' }}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="chip" style={{ color: SEV[f.severity].color, borderColor: SEV[f.severity].color }}>
                                  {pick(SEV[f.severity])} · <span className="num">{f.month}</span>
                                </span>
                                <span className="text-[12px] text-muted">{f.status}</span>
                              </div>
                              <div className="mt-2 text-[14px]">
                                <b>{t('Probable cause', 'সম্ভাব্য কারণ')}:</b> {pick({ en: f.probable_cause, bn: f.probable_cause_bn })}
                              </div>
                              <div className="text-[14px] mt-1">
                                <b>{t('Suggested action', 'প্রস্তাবিত পদক্ষেপ')}:</b> {pick({ en: f.suggested_action, bn: f.suggested_action_bn })}
                              </div>
                              <ul className="mt-2 list-disc pl-5 text-[12.5px] text-muted space-y-0.5">
                                {f.reasons.map((x: string, i: number) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                              <Intervention flag={f} onDone={reload} />
                            </div>
                          ))}
                          {r.application_id && (
                            <Link to={`/cases/${r.application_id}`} className="text-accent text-[13.5px] font-semibold">
                              {t('Open the file', 'ফাইল খুলুন')} →
                            </Link>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[12.5px] text-muted mt-5">
        {t('One month below the band is a watch; two in a row is a call. A missed check-in shows as no data, not distress. Suggested actions are supportive first: call, check stock, restructure.', 'সীমার নিচে এক মাস = নজর; পরপর দুই মাস = ফোন। আপডেট না এলে "তথ্য নেই", সমস্যা নয়। প্রস্তাবিত পদক্ষেপ আগে সহায়তামূলক: ফোন, মজুত দেখা, পুনর্গঠন।')}
      </p>
    </div>
  );
}
