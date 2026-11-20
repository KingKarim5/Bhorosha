import { useState } from 'react';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { PageTitle, SimulationBanner, Skeleton, ErrorNote, Card } from '../components/ui';
import { IconCheck, IconAlert } from '../components/icons';
import { resizeImage } from '../components/BillImage';

const KYC_WORDS: Record<string, { en: string; bn: string }> = {
  card_checked: { en: 'NID card read and checked', bn: 'জাতীয় পরিচয়পত্র পড়ে যাচাই করা হয়েছে' },
  specimen_checked: { en: 'Specimen (test) card read and checked', bn: 'নমুনা (পরীক্ষার) কার্ড পড়ে যাচাই করা হয়েছে' },
  typed_checked: { en: 'Typed details checked (not read from a card)', bn: 'লেখা তথ্য যাচাই করা হয়েছে (কার্ড থেকে পড়া নয়)' },
};

/** Step 1: scan the NID. The AI reads it, the code checks it, the investor confirms. */
function NidScan({ onDone }: { onDone: () => void }) {
  const { t, lang } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [typed, setTyped] = useState(false);
  const [form, setForm] = useState({ name_en: '', date_of_birth: '', nid_number: '' });
  const scan = async (file: File) => {
    setErr(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));
    setBusy('scan');
    try {
      const blob = await resizeImage(file, 1800);
      const fd = new FormData();
      fd.append('image', blob, 'nid.jpg');
      setResult(await api('/invest/kyc/nid', { form: fd }));
    } catch (e) {
      setErr((e as Error).message);
      if (/not available/i.test((e as Error).message)) setTyped(true);
    } finally {
      setBusy(null);
    }
  };
  const sendTyped = async () => {
    setErr(null);
    setBusy('typed');
    try {
      setResult(await api('/invest/kyc/typed', { body: form }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const confirm = async () => {
    setBusy('confirm');
    setErr(null);
    try {
      await api('/invest/kyc/confirm', { method: 'POST' });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const L = (o: any) => (lang === 'bn' ? o.bn : o.en);
  return (
    <div>
      <p className="text-[13.5px] text-muted">{t('Take a clear photo of the front of your NID card: flat, in good light, all four corners showing. The card is read and checked, then the photo is thrown away. Bhorsha keeps only your name, date of birth and the last 4 digits of the number.', 'আপনার জাতীয় পরিচয়পত্রের সামনের দিকের স্পষ্ট ছবি তুলুন: সোজা করে, ভালো আলোয়, চার কোণ দেখা যায় এমনভাবে। কার্ড পড়ে যাচাই করার পর ছবিটি মুছে ফেলা হয়। ভরসা রাখে শুধু নাম, জন্মতারিখ ও নম্বরের শেষ ৪ অঙ্ক।')}</p>
      <p className="text-[12.5px] mt-1" style={{ color: 'var(--unsure)' }}>{t('Demo: use the SPECIMEN card from the test kit rather than a real NID.', 'ডেমো: আসল জাতীয় পরিচয়পত্রের বদলে টেস্ট কিটের নমুনা (SPECIMEN) কার্ড ব্যবহার করুন।')}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <label className="btn btn-primary cursor-pointer">
          {busy === 'scan' ? t('Reading the card…', 'কার্ড পড়া হচ্ছে…') : preview ? t('Retake photo', 'আবার ছবি তুলুন') : t('Scan NID (front)', 'জাতীয় পরিচয়পত্র স্ক্যান (সামনে)')}
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={!!busy} onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
        </label>
        {!typed && <button className="btn" onClick={() => setTyped(true)}>{t('Type the details instead', 'বরং তথ্য লিখে দিন')}</button>}
      </div>
      {typed && (
        <div className="mt-3 p-3 rounded border border-line">
          <p className="text-[12.5px] text-muted mb-2">{t('Typed details get the same checks but are marked as typed, not read from a card.', 'লেখা তথ্যেও একই যাচাই হয়, তবে "কার্ড থেকে পড়া নয়" হিসেবে চিহ্নিত থাকে।')}</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <input className="input" placeholder={t('Name as on the card', 'কার্ডের নাম')} value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            <input className="input" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            <input className="input num" placeholder={t('NID number', 'জাতীয় পরিচয়পত্র নম্বর')} value={form.nid_number} onChange={(e) => setForm({ ...form, nid_number: e.target.value })} />
          </div>
          <button className="btn mt-2" disabled={!!busy} onClick={sendTyped}>{busy === 'typed' ? '…' : t('Check these details', 'তথ্য যাচাই করুন')}</button>
        </div>
      )}
      {(preview || result) && (
        <div className="grid sm:grid-cols-[180px_1fr] gap-4 mt-4">
          {preview ? <img src={preview} alt={t('Your NID photo (not uploaded for storage)', 'আপনার জাতীয় পরিচয়পত্রের ছবি')} className="rounded-lg border border-line w-full object-cover" /> : <div />}
          {result && (
            <div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13.5px]">
                <dt className="text-muted">{t('Name', 'নাম')}</dt><dd><b>{result.name_en || '—'}</b>{result.name_bn ? <span className="text-muted"> · {result.name_bn}</span> : null}</dd>
                <dt className="text-muted">{t('Date of birth', 'জন্মতারিখ')}</dt><dd className="num">{result.date_of_birth || '—'}{result.age != null ? <span className="text-muted"> ({result.age})</span> : null}</dd>
                <dt className="text-muted">{t('NID number', 'নম্বর')}</dt><dd className="num">{result.nid_masked || '—'}</dd>
                {result.father_name && <><dt className="text-muted">{t('Father', 'পিতা')}</dt><dd>{result.father_name}</dd></>}
                {result.mother_name && <><dt className="text-muted">{t('Mother', 'মাতা')}</dt><dd>{result.mother_name}</dd></>}
              </dl>
              {result.specimen && <p className="text-[12.5px] mt-1" style={{ color: 'var(--unsure)' }}>{t('This is a SPECIMEN (test) card: accepted for the demo and labelled as such.', 'এটি নমুনা (পরীক্ষার) কার্ড: ডেমোর জন্য গ্রহণযোগ্য, সেভাবেই চিহ্নিত থাকবে।')}</p>}
              <ul className="mt-2 space-y-1 text-[13px]">
                {result.checks.map((c: any) => (
                  <li key={c.key} className="flex gap-2">
                    <span style={{ color: c.pass ? 'var(--checked)' : 'var(--notviable)' }}>{c.pass ? <IconCheck width={15} height={15} /> : <IconAlert width={15} height={15} />}</span>
                    <span>{L(c)}</span>
                  </li>
                ))}
              </ul>
              {result.pass ? (
                <button className="btn btn-primary mt-3" disabled={!!busy} onClick={confirm}>{busy === 'confirm' ? '…' : t('This is me: confirm', 'এটি আমি: নিশ্চিত করুন')}</button>
              ) : (
                <p className="text-[13px] mt-2" style={{ color: 'var(--notviable)' }}>{t('Fix the items marked above, then scan again.', 'উপরে চিহ্নিত বিষয়গুলো ঠিক করে আবার স্ক্যান করুন।')}</p>
              )}
              <p className="text-[11.5px] text-muted mt-2">{t('These checks confirm the card is readable, consistent and not used twice. Confirming a card is genuine needs the Election Commission’s NID verification through the licensed partner: the next step for a real launch.', 'এই যাচাই দেখায় কার্ডটি পড়া যায়, তথ্য সামঞ্জস্যপূর্ণ এবং দুবার ব্যবহৃত হয়নি। কার্ড আসল কিনা নিশ্চিত করতে লাইসেন্সপ্রাপ্ত অংশীদারের মাধ্যমে নির্বাচন কমিশনের যাচাই লাগবে: বাস্তব চালুর পরবর্তী ধাপ।')}</p>
            </div>
          )}
        </div>
      )}
      <ErrorNote msg={err} />
    </div>
  );
}

export default function InvestVerify() {
  const { t, pick } = useI18n();
  const { data, reload } = useApi('/invest/me');
  const [vals, setVals] = useState<Record<string, string>>({ source_of_funds: 'salary', risk_acknowledgement: '' });
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <Skeleton h={200} />;
  const done = new Set((data.steps || []).filter((s: any) => s.status === 'done').map((s: any) => s.step));
  const kyc = data.investor.kyc;
  const submit = async (step: string) => {
    setErr(null);
    try {
      await api('/invest/verify', { body: { step, dummy_value: vals[step] || 'yes' } });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const steps = [
    {
      key: 'source_of_funds', title: t('2. Source of funds', '২. টাকার উৎস'),
      body: (
        <select className="input mt-2" value={vals.source_of_funds} onChange={(e) => setVals({ ...vals, source_of_funds: e.target.value })}>
          <option value="salary">{t('Salary or business income', 'বেতন বা ব্যবসার আয়')}</option>
          <option value="savings">{t('Savings', 'সঞ্চয়')}</option>
          <option value="remittance">{t('Remittance', 'রেমিট্যান্স')}</option>
        </select>
      ),
    },
    {
      key: 'risk_acknowledgement', title: t('3. Risk acknowledgement', '৩. ঝুঁকির স্বীকৃতি'),
      body: (
        <label className="flex items-start gap-2 mt-2 text-[14px]">
          <input type="checkbox" className="h-5 w-5 mt-0.5" checked={vals.risk_acknowledgement === 'yes'} onChange={(e) => setVals({ ...vals, risk_acknowledgement: e.target.checked ? 'yes' : '' })} />
          {t('I understand I can lose some or all of the money, nothing is promised, and the licensed partner, not Bhorsha, holds the funds.', 'আমি বুঝি যে কিছু বা পুরো টাকা হারাতে পারি, কোনো প্রতিশ্রুতি নেই, এবং টাকা রাখে লাইসেন্সপ্রাপ্ত অংশীদার, ভরসা নয়।')}
        </label>
      ),
    },
  ];
  const doneChip = <span className="chip" style={{ color: 'var(--checked)' }}><IconCheck width={13} height={13} /> {t('Done', 'সম্পন্ন')}</span>;
  return (
    <div className="max-w-3xl">
      <PageTitle title={t('Investor verification', 'বিনিয়োগকারী যাচাই')} sub={t('Three steps before you can invest: your NID, where the money comes from, and the risk.', 'বিনিয়োগের আগে তিনটি ধাপ: জাতীয় পরিচয়পত্র, টাকার উৎস, আর ঝুঁকি।')} />
      <SimulationBanner />
      <div className="chip mb-4">
        {t('Status', 'অবস্থা')}: <b>{data.investor.verification_status}</b>
      </div>
      <div className="space-y-3">
        <Card title={t('1. Identity: scan your NID', '১. পরিচয়: জাতীয় পরিচয়পত্র স্ক্যান')} right={done.has('identity') ? doneChip : null}>
          {done.has('identity') && kyc ? (
            <div className="text-[14px]">
              <div className="flex items-center gap-2"><IconCheck style={{ color: 'var(--checked)' }} /> <b>{pick(KYC_WORDS[kyc.status] || { en: kyc.status, bn: kyc.status })}</b></div>
              <div className="text-muted mt-1">{kyc.name_en}{kyc.date_of_birth ? ` · ${kyc.date_of_birth}` : ''} · NID <span className="num">{kyc.nid_masked}</span></div>
            </div>
          ) : (
            <NidScan onDone={reload} />
          )}
        </Card>
        {steps.map((s) => (
          <Card key={s.key} title={s.title} right={done.has(s.key) ? doneChip : null}>
            {s.body}
            {!done.has(s.key) && (
              <button className="btn btn-primary mt-3" onClick={() => submit(s.key)} disabled={s.key === 'risk_acknowledgement' && vals.risk_acknowledgement !== 'yes'}>
                {t('Confirm step', 'ধাপ নিশ্চিত')}
              </button>
            )}
          </Card>
        ))}
      </div>
      <ErrorNote msg={err} />
    </div>
  );
}
