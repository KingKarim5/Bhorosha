import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { SimulationBanner, Skeleton, VerdictTag, ProofLabel, ErrorNote, Card } from '../components/ui';
import { RunwayChart } from '../components/RunwayChart';
import { CAUSE_WORDS } from './Cases';

export default function InvestCase() {
  const { caseId } = useParams();
  const { t, n, pick, bdt, lang } = useI18n();
  const { data, error, reload } = useApi(`/invest/cases/${caseId}`);
  const [amt, setAmt] = useState(10000);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <><SimulationBanner /><ErrorNote msg={error} /></>;
  if (!data) return <Skeleton h={300} />;
  const commit = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await api('/invest/commit', { body: { application: caseId, amount_bdt: amt } });
      setMsg(t(`Simulated commitment recorded. Still open on this case: ${r.case_open_bdt} BDT.`, `সিমুলেটেড প্রতিশ্রুতি লেখা হলো। এই কেসে এখনো বাকি: ${n(r.case_open_bdt)} টাকা।`));
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const months = data.runway_points || [];
  return (
    <div>
      <Link to="/invest" className="text-[13px] text-muted hover:text-accent">← {t('Listings', 'তালিকা')}</Link>
      <h1 className="font-display text-[28px] font-semibold mt-1">
        {pick(data.type)} <span className="num text-[16px] text-muted">{data.code}</span>
      </h1>
      <p className="text-muted mb-4">{pick(data.size)} · {n(data.tenor_months)} {t('months', 'মাস')}</p>
      <SimulationBanner />
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
        <div className="space-y-4">
          <Card>
            <VerdictTag verdict={data.verdict} low={data.band_low} high={data.band_high} showAdvice={false} />
            <p className="text-[13.5px] text-muted mt-2">{t('This is the lender’s file in plain language. Bhorsha AI approved it with the conditions below, inside the lender’s policy. It is evidence, not a promise.', 'এটি ঋণদাতার ফাইল, সহজ ভাষায়। ঋণদাতার নীতির ভেতরে ভরসা এআই নিচের শর্তসহ অনুমোদন করেছে। এটি প্রমাণ, প্রতিশ্রুতি নয়।')}</p>
            <div className="mt-3">
              <RunwayChart points={months} height={150} />
            </div>
            <div className="text-[13.5px] mt-2">
              <b>{t('Main weak point', 'প্রধান দুর্বল দিক')}:</b> {pick(CAUSE_WORDS[data.cause])}
            </div>
          </Card>
          <Card title={t('Evidence', 'প্রমাণ')}>
            <ul className="space-y-2">
              {data.evidence.map((e: any) => (
                <li key={e.eid} className="flex justify-between gap-3 text-[13.5px]">
                  <span>{lang === 'bn' ? e.bn : e.en}</span>
                  <ProofLabel label={e.label} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t('Conditions the lender attached', 'ঋণদাতার শর্ত')}>
            <ul className="list-disc pl-5 space-y-1 text-[14px]">
              {(data.conditions || []).map((c: any) => (
                <li key={c.key}>{pick(c)}</li>
              ))}
            </ul>
          </Card>
          <Card title={t('What this cannot tell you', 'এই ফাইল যা বলতে পারে না')}>
            <ul className="list-disc pl-5 space-y-1 text-[14px]">
              {(data.cannot_tell || []).map((c: any, i: number) => (
                <li key={i}>{pick(c)}</li>
              ))}
              <li>{t('Whether you will get your money back. Investors can lose money.', 'আপনার টাকা ফেরত আসবে কিনা। বিনিয়োগে লোকসান হতে পারে।')}</li>
            </ul>
          </Card>
        </div>
        <Card title={t('Commit through the licensed partner (simulated)', 'লাইসেন্সপ্রাপ্ত অংশীদারের মাধ্যমে প্রতিশ্রুতি (সিমুলেটেড)')} className="h-fit">
          <dl className="grid grid-cols-2 gap-2 text-[13.5px] mb-3">
            <dt className="text-muted">{t('Open on this case', 'এই কেসে বাকি')}</dt>
            <dd className="num font-semibold text-right">{bdt(data.open_bdt)}</dd>
            <dt className="text-muted">{t('Your commitment here', 'এখানে আপনার')}</dt>
            <dd className="num text-right">{bdt(data.my_commitment_bdt)}</dd>
            <dt className="text-muted">{t('Your per-loan cap', 'প্রতি ঋণে আপনার সীমা')}</dt>
            <dd className="num text-right">{bdt(data.cap_per_loan_bdt)}</dd>
            <dt className="text-muted">{t('Total committed / cap', 'মোট প্রতিশ্রুতি / সীমা')}</dt>
            <dd className="num text-right">
              {n(data.committed_total_bdt)} / {n(data.cap_total_bdt)}
            </dd>
          </dl>
          {data.verification_status !== 'verified' ? (
            <p className="text-[14px]" style={{ color: 'var(--unsure)' }}>
              {t('Finish the simulated verification first.', 'আগে সিমুলেটেড যাচাই শেষ করুন।')}{' '}
              <Link to="/invest/verify" className="underline">
                {t('Verify', 'যাচাই')}
              </Link>
            </p>
          ) : (
            <>
              <label className="label" htmlFor="amt">
                {t('Amount (BDT)', 'অঙ্ক (টাকা)')}
              </label>
              <input id="amt" type="number" step={1000} className="input mt-1" value={amt} onChange={(e) => setAmt(Number(e.target.value))} />
              <button className="btn btn-primary w-full justify-center mt-3" onClick={commit} disabled={busy}>
                {t('Commit (simulation)', 'প্রতিশ্রুতি দিন (সিমুলেশন)')}
              </button>
            </>
          )}
          <ErrorNote msg={err} />
          {msg && <p className="text-[13.5px] mt-2" style={{ color: 'var(--checked)' }}>{msg}</p>}
          <p className="text-[12px] text-muted mt-3">{t('Money would flow: investor → partner’s pooled facility → business, and repayments back the same way. No projected return is shown because none is promised.', 'টাকার পথ হতো: বিনিয়োগকারী → অংশীদারের যৌথ তহবিল → ব্যবসা, আর কিস্তি ফেরে একই পথে। কোনো মুনাফার প্রতিশ্রুতি নেই, তাই পূর্বাভাসও দেখানো হয় না।')}</p>
        </Card>
      </div>
    </div>
  );
}
