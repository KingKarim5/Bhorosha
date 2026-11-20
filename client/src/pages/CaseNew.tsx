import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { ErrorNote, PageTitle } from '../components/ui';
import { resizeImage } from '../components/BillImage';
import { IconAlert, IconDoc } from '../components/icons';

const SAMPLE_NOTE = 'আমার দোকানে প্রায় ৫০% বিক্রি নগদে হয়। লাভ প্রায় ১৮%। ব্যবসা মৌসুমি না। ঈদের আগে বিক্রি একটু বাড়ে।';

interface LenderInfo {
  org_name: string;
  code: string;
  max_principal_bdt: number;
  max_tenor_months: number;
  borrower_rate_pct: number;
}

export default function CaseNew() {
  const { t, n } = useI18n();
  const go = useNavigate();
  const { code } = useParams();
  const [lender, setLender] = useState<LenderInfo | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  useEffect(() => {
    api(`/apply-info/${code || ''}`).then(setLender).catch((e) => setLinkErr((e as Error).message));
  }, [code]);
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [f, setF] = useState({ label: '', business_type: 'tea_grocery', months_trading: 24, loan_ask_bdt: 100000, tenor_months: 12, purpose: '', purpose_kind: 'working_capital', cib_status: 'unknown' });
  const [csv, setCsv] = useState('');
  const [csvName, setCsvName] = useState('');
  const [segment, setSegment] = useState<'cash_led' | 'hybrid' | 'digital_first'>('cash_led');
  const [onlinePct, setOnlinePct] = useState<string>('');
  const [courierCsv, setCourierCsv] = useState('');
  const [courierName, setCourierName] = useState('');
  const [ordersCsv, setOrdersCsv] = useState('');
  const [ordersName, setOrdersName] = useState('');
  const loadOnlineSample = async (kind: 'courier' | 'orders') => {
    const r = await api(`/samples/online/rafi/${kind}`);
    if (kind === 'courier') {
      setCourierCsv(r.csv);
      setCourierName('rafi_courier.csv (' + t('synthetic sample', 'কৃত্রিম নমুনা') + ')');
    } else {
      setOrdersCsv(r.csv);
      setOrdersName('rafi_orders.csv (' + t('synthetic sample', 'কৃত্রিম নমুনা') + ')');
    }
  };
  const [bills, setBills] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [cash, setCash] = useState<string>('');
  const [margin, setMargin] = useState<string>('');
  const [seasonal, setSeasonal] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const steps = [t('Consent', 'সম্মতি'), t('Statement', 'স্টেটমেন্ট'), t('Bill photos', 'বিলের ছবি'), t('Bangla note', 'বাংলা নোট')];
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const loadSample = async (slug: string) => {
    const r = await api(`/samples/statement/${slug}`);
    setCsv(r.csv);
    setCsvName(`${slug}.csv (${t('synthetic sample', 'কৃত্রিম নমুনা')})`);
  };
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api('/apply', {
        body: {
          consent: true, ...f, lender_code: lender?.code || code || undefined, statement_csv: csv || undefined, note_text: note || undefined,
          segment, online_share_pct: onlinePct === '' ? null : Number(onlinePct), courier_csv: courierCsv || undefined, orders_csv: ordersCsv || undefined,
          cash_share_pct: cash === '' ? null : Number(cash), margin_pct: margin === '' ? null : Number(margin), seasonal: seasonal === 'unknown' ? null : seasonal === 'yes',
        },
      });
      for (const b of bills) {
        const blob = await resizeImage(b);
        const form = new FormData();
        form.append('image', blob, 'bill.jpg');
        form.append('kind', 'bill');
        await api(`/owner/${r.token}/documents`, { form });
      }
      go(`/owner/${r.token}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // plain-language checks before anything is sent
  const amountProblem =
    !Number.isFinite(f.loan_ask_bdt) || f.loan_ask_bdt < 5000 ? t('The smallest loan is Tk 5,000.', 'সর্বনিম্ন ঋণ ৫,০০০ টাকা।')
      : f.loan_ask_bdt > 5000000 ? t('Ask for Tk 50,00,000 or less.', '৫০,০০,০০০ টাকা বা কম চাইতে পারেন।')
        : !Number.isInteger(f.tenor_months) || f.tenor_months < 1 ? t('Enter the tenor in whole months.', 'মেয়াদ পূর্ণ মাসে লিখুন।')
          : f.tenor_months > 60 ? t('Ask for 60 months or less.', '৬০ মাস বা কম চাইতে পারেন।') : null;
  const overLimit = lender && !amountProblem && (f.loan_ask_bdt > lender.max_principal_bdt || f.tenor_months > lender.max_tenor_months);
  const canNext = step === 0 ? consent && f.label.trim().length >= 2 && !amountProblem && !!lender : true;
  return (
    <div className="max-w-2xl">
      <PageTitle title={t('Apply for a loan', 'ঋণের আবেদন')} sub={t('For shop owners. Four short steps, works on a phone. Bhorsha AI decides inside the lender’s policy; you get a private link to follow your file.', 'দোকান মালিকদের জন্য। চারটি ছোট ধাপ, ফোনেও চলে। ঋণদাতার নীতির ভেতরে ভরসা এআই সিদ্ধান্ত নেয়; আপনার ফাইল দেখতে একটি ব্যক্তিগত লিংক পাবেন।')} />
      {linkErr && <ErrorNote msg={linkErr} />}
      {lender && (
        <div className="card p-4 mb-4">
          <div className="text-[12.5px] text-muted">{t('You are applying to', 'আপনি আবেদন করছেন')}</div>
          <div className="font-display text-[20px] font-semibold">{lender.org_name}</div>
          <div className="text-[13.5px] text-muted mt-0.5">
            {t(`Loans up to Tk ${n(lender.max_principal_bdt)} for up to ${lender.max_tenor_months} months, at ${lender.borrower_rate_pct}% a year.`, `${n(lender.max_principal_bdt)} টাকা পর্যন্ত, ${n(lender.max_tenor_months)} মাস পর্যন্ত, বছরে ${n(lender.borrower_rate_pct)}% সুদে।`)}
          </div>
        </div>
      )}
      <div className="mb-4 rounded-lg p-3 text-[14px] flex gap-2" style={{ background: 'color-mix(in oklab, var(--notviable) 10%, transparent)' }} role="alert">
        <IconAlert className="shrink-0 mt-0.5" style={{ color: 'var(--notviable)' }} />
        {t('Demo only: do not upload real documents or real personal data.', 'শুধু ডেমো: আসল কাগজ বা আসল ব্যক্তিগত তথ্য আপলোড করবেন না।')}
      </div>
      <ol className="grid grid-cols-4 gap-2 mb-5">
        {steps.map((s, i) => (
          <li key={s} className="text-center">
            <div className="h-1.5 rounded-full" style={{ background: i <= step ? 'var(--accent)' : 'var(--line)' }} />
            <div className={`text-[12.5px] mt-1 ${i === step ? 'font-semibold' : 'text-muted'}`}>{s}</div>
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="card p-5 space-y-4">
          {step === 0 && (
            <>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-line cursor-pointer">
                <input type="checkbox" className="h-6 w-6 mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span className="text-[15px]">
                  {t('I agree that the lender may read these records to judge this loan. I understand Bhorsha AI decides inside the lender’s policy, and that I can add evidence or answer questions later.', 'আমি সম্মত যে এই ঋণ বিচারের জন্য ঋণদাতা এই কাগজগুলো পড়তে পারবেন। আমি জানি ঋণদাতার নীতির ভেতরে ভরসা এআই সিদ্ধান্ত নেয়, এবং পরে প্রমাণ যোগ করা বা প্রশ্নের উত্তর দেওয়া যায়।')}
                </span>
              </label>
              <div>
                <label className="label">{t('Shop label (no real names)', 'দোকানের নাম (আসল নাম নয়)')}</label>
                <input className="input mt-1" value={f.label} onChange={(e) => set('label', e.target.value)} placeholder={t('e.g. Demo Tailoring', 'যেমন: ডেমো টেইলার্স')} />
              </div>
              <div>
                <label className="label">{t('How do you sell?', 'কীভাবে বিক্রি করেন?')}</label>
                <div className="grid grid-cols-3 gap-2 mt-1" role="radiogroup">
                  {([
                    ['cash_led', t('Mostly in the shop', 'বেশিরভাগ দোকানে'), t('cash, some wallet', 'নগদ, কিছু ওয়ালেট')],
                    ['hybrid', t('Shop and online', 'দোকান ও অনলাইন'), t('cash + courier', 'নগদ + কুরিয়ার')],
                    ['digital_first', t('Mostly online', 'বেশিরভাগ অনলাইনে'), t('courier, wallet', 'কুরিয়ার, ওয়ালেট')],
                  ] as const).map(([k, title, sub]) => (
                    <button key={k} type="button" role="radio" aria-checked={segment === k} onClick={() => setSegment(k)} className={`card p-2.5 text-left ${segment === k ? 'ring-2 ring-[var(--accent)]' : ''}`}>
                      <div className="font-semibold text-[14px]">{title}</div>
                      <div className="text-[12px] text-muted">{sub}</div>
                    </button>
                  ))}
                </div>
                {segment !== 'cash_led' && (
                  <div className="mt-2 max-w-[200px]">
                    <label className="label">{t('Online share of sales %', 'অনলাইন বিক্রির অংশ %')}</label>
                    <input type="number" className="input mt-1" value={onlinePct} onChange={(e) => setOnlinePct(e.target.value)} placeholder={segment === 'hybrid' ? '50' : '90'} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('Business type', 'ব্যবসার ধরন')}</label>
                  <select className="input mt-1" value={f.business_type} onChange={(e) => set('business_type', e.target.value)}>
                    <option value="tea_grocery">{t('Tea stall / grocery', 'চা / মুদি')}</option>
                    <option value="pharmacy">{t('Pharmacy', 'ফার্মেসি')}</option>
                    <option value="mobile_accessories">{t('Mobile accessories', 'মোবাইল এক্সেসরিজ')}</option>
                    <option value="online_clothing">{t('Online clothing', 'অনলাইন পোশাক')}</option>
                    <option value="fish_trader">{t('Fish trader (seasonal)', 'মাছ ব্যবসা (মৌসুমি)')}</option>
                    <option value="knitwear">{t('Knitwear', 'নিটওয়্যার')}</option>
                    <option value="other">{t('Other', 'অন্যান্য')}</option>
                  </select>
                </div>
                <div>
                  <label className="label">{t('Months trading', 'ব্যবসার বয়স (মাস)')}</label>
                  <input type="number" className="input mt-1" value={f.months_trading} onChange={(e) => set('months_trading', Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">{t('Loan ask (BDT)', 'ঋণের চাহিদা (টাকা)')}</label>
                  <input type="number" className="input mt-1" value={f.loan_ask_bdt} onChange={(e) => set('loan_ask_bdt', Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">{t('Tenor (months)', 'মেয়াদ (মাস)')}</label>
                  <input type="number" className="input mt-1" value={f.tenor_months} onChange={(e) => set('tenor_months', Number(e.target.value))} />
                </div>
              </div>
              {amountProblem && <p className="text-[13.5px]" style={{ color: 'var(--notviable)' }}>{amountProblem}</p>}
              {overLimit && lender && (
                <p className="text-[13.5px] rounded-lg p-2.5" style={{ background: 'color-mix(in oklab, var(--unsure) 12%, transparent)' }}>
                  {t(`This is more than ${lender.org_name} lends (up to Tk ${n(lender.max_principal_bdt)} for ${lender.max_tenor_months} months). You can still apply: the AI will offer the largest loan inside the limit that your sales support.`, `এটি ${lender.org_name}-এর সীমার বেশি (${n(lender.max_principal_bdt)} টাকা, ${n(lender.max_tenor_months)} মাস)। তবু আবেদন করতে পারেন: আপনার বিক্রিতে যত বড় ঋণ চলে, সীমার ভেতরে এআই তা প্রস্তাব করবে।`)}
                </p>
              )}
              <div>
                <label className="label">{t('Purpose', 'উদ্দেশ্য')}</label>
                <input className="input mt-1" value={f.purpose} onChange={(e) => set('purpose', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('Purpose type', 'উদ্দেশ্যের ধরন')}</label>
                  <select className="input mt-1" value={f.purpose_kind} onChange={(e) => set('purpose_kind', e.target.value)}>
                    <option value="working_capital">{t('Working capital', 'চলতি মূলধন')}</option>
                    <option value="capex">{t('Equipment', 'যন্ত্রপাতি')}</option>
                  </select>
                </div>
                <div>
                  <label className="label">{t('CIB status (declared)', 'সিআইবি অবস্থা (ঘোষিত)')}</label>
                  <select className="input mt-1" value={f.cib_status} onChange={(e) => set('cib_status', e.target.value)}>
                    <option value="unknown">{t('Unknown', 'অজানা')}</option>
                    <option value="clean">{t('Clean', 'পরিষ্কার')}</option>
                    <option value="classified">{t('Classified', 'শ্রেণিকৃত')}</option>
                  </select>
                </div>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <p className="text-[14.5px]">{t('Upload a mobile-money or bank statement as CSV (date, amount, direction or credit/debit, balance). Bangla numerals are fine.', 'মোবাইল-মানি বা ব্যাংক স্টেটমেন্ট CSV হিসেবে দিন (তারিখ, অঙ্ক, জমা/খরচ, ব্যালান্স)। বাংলা সংখ্যা চলবে।')}</p>
              <label className="btn w-full justify-center cursor-pointer py-4">
                <IconDoc /> {csvName || t('Choose a CSV file', 'CSV ফাইল বাছুন')}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCsv(await file.text());
                      setCsvName(file.name);
                    }
                  }}
                />
              </label>
              <div className="text-[13px] text-muted">{t('Or use a synthetic sample:', 'অথবা একটি কৃত্রিম নমুনা নিন:')}</div>
              <div className="flex flex-wrap gap-2">
                {['rahima', 'nasir', 'tania'].map((s) => (
                  <button key={s} className="btn !min-h-0 !py-1.5 text-[13px]" onClick={() => loadSample(s)}>
                    {s}.csv
                  </button>
                ))}
              </div>
              {segment !== 'cash_led' && (
                <div className="pt-3 mt-1 border-t border-line space-y-2">
                  <p className="text-[14.5px] font-semibold">{t('Online sales', 'অনলাইন বিক্রি')}</p>
                  <p className="text-[13px] text-muted">{t('Courier settlement CSV (order_id, date, amount_collected, fee, net_remitted, settlement_date) and your order log CSV (order_id, date, channel, amount, status). Settlements are checked against your wallet credits; order-log claims stay owner says unless they match.', 'কুরিয়ারের হিসাব CSV (order_id, date, amount_collected, fee, net_remitted, settlement_date) এবং অর্ডারের খাতা CSV (order_id, date, channel, amount, status)। কুরিয়ারের হিসাব ওয়ালেটের জমার সাথে মেলানো হয়; অর্ডারের খাতার দাবি না মেলা পর্যন্ত "মালিক বলছেন"।')}</p>
                  <label className="btn w-full justify-center cursor-pointer">
                    <IconDoc /> {courierName || t('Courier settlements CSV', 'কুরিয়ারের হিসাব CSV')}
                    <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) { setCourierCsv(await fl.text()); setCourierName(fl.name); } }} />
                  </label>
                  <label className="btn w-full justify-center cursor-pointer">
                    <IconDoc /> {ordersName || t('Order log CSV', 'অর্ডারের খাতা CSV')}
                    <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const fl = e.target.files?.[0]; if (fl) { setOrdersCsv(await fl.text()); setOrdersName(fl.name); } }} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn !min-h-0 !py-1.5 text-[13px]" onClick={() => loadOnlineSample('courier')}>rafi_courier.csv</button>
                    <button className="btn !min-h-0 !py-1.5 text-[13px]" onClick={() => loadOnlineSample('orders')}>rafi_orders.csv</button>
                    <button className="btn !min-h-0 !py-1.5 text-[13px]" onClick={() => loadSample('rafi')}>rafi.csv</button>
                  </div>
                </div>
              )}
              {!csv && <p className="text-[13px]" style={{ color: 'var(--unsure)' }}>{t('Without a statement the verdict will be not sure, with a list of what to upload.', 'স্টেটমেন্ট ছাড়া রায় "নিশ্চিত নয়" হবে, সাথে কী জমা দিতে হবে তার তালিকা।')}</p>}
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-[14.5px]">{t('Add one or two supplier bills. Photos are resized in your browser to about 1600 px and are not kept after reading.', 'এক-দুটি সরবরাহকারীর বিল দিন। ছবি ব্রাউজারে প্রায় ১৬০০ পিক্সেলে ছোট হয় এবং পড়ার পর রাখা হয় না।')}</p>
              <label className="btn w-full justify-center cursor-pointer py-4">
                {t('Take or choose photos', 'ছবি তুলুন বা বাছুন')}
                <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => setBills([...bills, ...Array.from(e.target.files || [])])} />
              </label>
              <div className="space-y-2">
                {bills.map((b, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between card p-2 text-[13.5px]">
                    <span>{b.name}</span>
                    <button className="text-muted" onClick={() => setBills(bills.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </motion.div>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div>
                <label className="label">{t("Owner's note in Bangla (typed)", 'মালিকের নোট, বাংলায় (টাইপ করা)')}</label>
                <textarea className="input mt-1 min-h-[110px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder={SAMPLE_NOTE} />
                <button className="text-[12.5px] text-accent mt-1" onClick={() => setNote(SAMPLE_NOTE)}>
                  {t('Use the sample note', 'নমুনা নোট নিন')}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">{t('Cash share %', 'নগদ বিক্রি %')}</label>
                  <input type="number" className="input mt-1" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="50" />
                </div>
                <div>
                  <label className="label">{t('Margin %', 'লাভ %')}</label>
                  <input type="number" className="input mt-1" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="15" />
                </div>
                <div>
                  <label className="label">{t('Seasonal?', 'মৌসুমি?')}</label>
                  <select className="input mt-1" value={seasonal} onChange={(e) => setSeasonal(e.target.value as 'yes')}>
                    <option value="unknown">{t('Not said', 'বলা হয়নি')}</option>
                    <option value="yes">{t('Yes', 'হ্যাঁ')}</option>
                    <option value="no">{t('No', 'না')}</option>
                  </select>
                </div>
              </div>
              <p className="text-[12.5px] text-muted">{t('Everything on this step is recorded as owner says.', 'এই ধাপের সবকিছু "মালিক বলছেন" হিসেবে রাখা হয়।')}</p>
            </>
          )}
          <ErrorNote msg={err} />
          <div className="flex justify-between pt-2">
            <button className="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || busy}>
              {t('Back', 'পেছনে')}
            </button>
            {step < 3 ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={!canNext}>
                {t('Next', 'পরের ধাপ')}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? t('Building the file…', 'ফাইল তৈরি হচ্ছে…') : t('Build the viability file', 'ফাইল তৈরি করুন')}
              </button>
            )}
          </div>
          {step === 0 && !consent && <p className="text-[12.5px] text-muted">{t('Consent is needed before anything is uploaded.', 'কিছু আপলোডের আগে সম্মতি দরকার।')}</p>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
