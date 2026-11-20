import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { SimulationBanner, Skeleton, VerdictTag, ProofLabel, ErrorNote, Card } from '../components/ui';
import { RunwayChart } from '../components/RunwayChart';
import { CAUSE_WORDS } from './Cases';
import { SplitBar } from '../components/LoanTerms';
import { investorReturn } from '../lib/money';
import { ModeBadge } from '../components/ui';

/** What this amount earns at the investor rate if the borrower repays in full. */
function ReturnBox({ amount, tenor, rate }: { amount: number; tenor: number; rate: number }) {
  const { t, bdt, n } = useI18n();
  const r = investorReturn(amount, tenor, rate);
  if (!r.total_back_bdt) return null;
  return (
    <div className="rounded-lg p-3 mt-3 text-[13.5px]" style={{ background: 'color-mix(in oklab, var(--viable) 10%, transparent)' }}>
      <div className="flex justify-between gap-2"><span className="text-muted">{t('Your rate', 'আপনার হার')}</span><b className="num">{rate}% {t('a year', 'বছরে')}</b></div>
      <div className="flex justify-between gap-2"><span className="text-muted">{t('Interest you earn', 'আপনার সুদ আয়')}</span><b className="num" style={{ color: 'var(--viable)' }}>+{bdt(r.interest_bdt)}</b></div>
      <div className="flex justify-between gap-2"><span className="text-muted">{t('You get back in total', 'মোট ফেরত')}</span><b className="num">{bdt(r.total_back_bdt)}</b></div>
      <div className="flex justify-between gap-2"><span className="text-muted">{t('Paid to you', 'আপনাকে দেওয়া হবে')}</span><span className="num">{bdt(r.monthly_bdt)} × {n(tenor)} {t('months', 'মাস')}</span></div>
      <p className="text-[11.5px] text-muted mt-1.5">{t('As the borrower repays the lender each month, your share comes back to you. If the borrower does not repay, you can lose money.', 'ঋণগ্রহীতা প্রতি মাসে ঋণদাতাকে শোধ করলে আপনার অংশ আপনার কাছে ফেরে। শোধ না হলে লোকসান হতে পারে।')}</p>
    </div>
  );
}

export default function InvestCase() {
  const { caseId } = useParams();
  const { t, n, pick, bdt, lang } = useI18n();
  const { data, error, reload } = useApi(`/invest/cases/${caseId}`);
  const [amt, setAmt] = useState<number | null>(null); // null until the case loads: then the largest amount allowed
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <><SimulationBanner /><ErrorNote msg={error} /></>;
  if (!data) return <Skeleton h={300} />;
  // the most this investor can put in here: what is still open on the loan, their per-loan cap left, and their total cap left
  const MIN = 1000;
  const maxAllowed = Math.max(0, Math.min(data.open_bdt, data.cap_per_loan_bdt - data.my_commitment_bdt, data.cap_total_bdt - data.committed_total_bdt));
  const amount = amt ?? Math.min(10000, maxAllowed);
  const amountProblem =
    maxAllowed < MIN ? (data.open_bdt <= 0 ? t('This loan is fully funded by investors.', 'বিনিয়োগকারীরা এই ঋণ পুরো অর্থায়ন করেছেন।') : t('You have reached your cap for this loan or in total.', 'এই ঋণে বা মোট সীমায় আপনি সর্বোচ্চ দিয়ে ফেলেছেন।'))
      : !(amount >= MIN) ? t(`The smallest amount is ${n(MIN)}.`, `সর্বনিম্ন ${n(MIN)} টাকা।`)
        : amount > data.open_bdt ? t(`Only ${n(data.open_bdt)} is still open on this loan. Investors together can fund up to a quarter of it.`, `এই ঋণে মাত্র ${n(data.open_bdt)} টাকা বাকি। বিনিয়োগকারীরা মিলে ঋণের সর্বোচ্চ চার ভাগের এক ভাগ দিতে পারেন।`)
          : amount > maxAllowed ? t(`That is over your cap. You can put in up to ${n(maxAllowed)}.`, `এটি আপনার সীমার বেশি। সর্বোচ্চ ${n(maxAllowed)} টাকা দিতে পারেন।`) : null;
  const commit = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await api('/invest/commit', { body: { application: caseId, amount_bdt: amount } });
      setMsg(t(`Simulated commitment recorded. Still open on this case: ${n(r.case_open_bdt)} BDT.`, `সিমুলেটেড প্রতিশ্রুতি লেখা হলো। এই কেসে এখনো বাকি: ${n(r.case_open_bdt)} টাকা।`));
      setAmt(null); // back to the new largest allowed amount
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
      <p className="text-muted mb-4">{data.lender_name} · {bdt(data.loan_bdt)} · {n(data.tenor_months)} {t('months', 'মাস')}</p>
      <SimulationBanner />
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
        <div className="space-y-4">
          <Card>
            <VerdictTag verdict={data.verdict} low={data.band_low} high={data.band_high} showAdvice={false} />
            <p className="text-[13.5px] text-muted mt-2">{t('Approved with the conditions below, inside the lender’s policy.', 'ঋণদাতার নীতির ভেতরে, নিচের শর্তসহ অনুমোদিত।')}</p>
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
          {data.fee_split && (
            <Card title={t('How the interest is shared', 'সুদ কীভাবে ভাগ হয়')} right={<ModeBadge mode={data.fee_split.by} />}>
              <SplitBar per={data.fee_split.figures.per_100} />
              <p className="text-[14px] mt-2">{lang === 'bn' ? data.fee_split.text_bn : data.fee_split.text_en}</p>
              <p className="text-[12px] text-muted mt-1">{t('Contract rates if the borrower repays in full. They are not a promise: if the borrower does not repay, investors can lose money.', 'ঋণগ্রহীতা পুরো শোধ করলে চুক্তির হার। এটি প্রতিশ্রুতি নয়: শোধ না হলে বিনিয়োগে লোকসান হতে পারে।')}</p>
            </Card>
          )}
          <Card title={t('Conditions the lender attached', 'ঋণদাতার শর্ত')}>
            <ul className="list-disc pl-5 space-y-1 text-[14px]">
              {(data.conditions || []).map((c: any) => (
                <li key={c.key}>{pick(c)}</li>
              ))}
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
              <input id="amt" type="number" step={500} min={MIN} max={maxAllowed} className="input mt-1" value={amount} onChange={(e) => setAmt(Number(e.target.value))} />
              <div className="flex flex-wrap items-center justify-between gap-2 mt-1 text-[12.5px]">
                <span className="text-muted">{t(`You can put in up to ${n(maxAllowed)} here.`, `এখানে সর্বোচ্চ ${n(maxAllowed)} টাকা দিতে পারেন।`)}</span>
                {amount !== maxAllowed && maxAllowed >= MIN && <button type="button" className="text-accent underline" onClick={() => setAmt(maxAllowed)}>{t('Use the maximum', 'সর্বোচ্চ নিন')}</button>}
              </div>
              {amountProblem && <p className="text-[13px] mt-1" style={{ color: 'var(--notviable)' }}>{amountProblem}</p>}
              <ReturnBox amount={amountProblem ? 0 : amount} tenor={data.tenor_months} rate={data.investor_rate_pct} />
              <button className="btn btn-primary w-full justify-center mt-3" onClick={commit} disabled={busy || !!amountProblem}>
                {t('Commit (simulation)', 'প্রতিশ্রুতি দিন (সিমুলেশন)')}
              </button>
            </>
          )}
          <ErrorNote msg={err} />
          {msg && <p className="text-[13.5px] mt-2" style={{ color: 'var(--checked)' }}>{msg}</p>}
          <p className="text-[12px] text-muted mt-3">{t('Funds are held by the licensed partner. Investors can lose money; no return is promised.', 'টাকা রাখে লাইসেন্সপ্রাপ্ত অংশীদার। বিনিয়োগে লোকসান হতে পারে; কোনো মুনাফার প্রতিশ্রুতি নেই।')}</p>
        </Card>
      </div>
    </div>
  );
}
