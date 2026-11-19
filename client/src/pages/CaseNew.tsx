import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { ErrorNote, PageTitle } from '../components/ui';
import { resizeImage } from '../components/BillImage';
import { IconAlert, IconDoc } from '../components/icons';

const SAMPLE_NOTE = 'আমার দোকানে প্রায় ৫০% বিক্রি নগদে হয়। লাভ প্রায় ১৮%। ব্যবসা মৌসুমি না। ঈদের আগে বিক্রি একটু বাড়ে।';

export default function CaseNew() {
  const { t } = useI18n();
  const go = useNavigate();
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [f, setF] = useState({ label: '', business_type: 'tea_grocery', months_trading: 24, loan_ask_bdt: 150000, tenor_months: 24, purpose: '', purpose_kind: 'working_capital', cib_status: 'unknown' });
  const [csv, setCsv] = useState('');
  const [csvName, setCsvName] = useState('');
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
      const r = await api('/cases', {
        body: {
          consent: true, ...f, statement_csv: csv || undefined, note_text: note || undefined,
          cash_share_pct: cash === '' ? null : Number(cash), margin_pct: margin === '' ? null : Number(margin), seasonal: seasonal === 'unknown' ? null : seasonal === 'yes',
        },
      });
      for (const b of bills) {
        const blob = await resizeImage(b);
        const form = new FormData();
        form.append('image', blob, 'bill.jpg');
        form.append('kind', 'bill');
        await api(`/cases/${r.id}/documents`, { form });
      }
      go(`/cases/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const canNext = step === 0 ? consent && f.label.trim().length >= 2 : true;
  return (
    <div className="max-w-2xl">
      <PageTitle title={t('New case', 'নতুন কেস')} sub={t('Four short steps. Works on a phone.', 'চারটি ছোট ধাপ। ফোনেও চলে।')} />
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
                  {t('The owner agrees that the lender may read these records to judge this loan, and knows a person makes the decision.', 'মালিক সম্মত যে এই ঋণ বিচারের জন্য ঋণদাতা এই কাগজগুলো পড়তে পারবেন, এবং জানেন সিদ্ধান্ত একজন মানুষ নেবেন।')}
                </span>
              </label>
              <div>
                <label className="label">{t('Shop label (no real names)', 'দোকানের নাম (আসল নাম নয়)')}</label>
                <input className="input mt-1" value={f.label} onChange={(e) => set('label', e.target.value)} placeholder={t('e.g. Demo Tailoring', 'যেমন: ডেমো টেইলার্স')} />
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
