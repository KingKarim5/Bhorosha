import { useState } from 'react';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { PageTitle, SimulationBanner, Skeleton, ErrorNote, Card } from '../components/ui';
import { IconCheck } from '../components/icons';

export default function InvestVerify() {
  const { t } = useI18n();
  const { data, reload } = useApi('/invest/me');
  const [vals, setVals] = useState<Record<string, string>>({ identity: 'DUMMY-1234', source_of_funds: 'salary', risk_acknowledgement: '' });
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <Skeleton h={200} />;
  const done = new Set((data.steps || []).filter((s: any) => s.status === 'done').map((s: any) => s.step));
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
      key: 'identity', title: t('1. Identity check (simulated)', '১. পরিচয় যাচাই (সিমুলেটেড)'),
      body: (
        <>
          <p className="text-[13.5px] text-muted">{t('Enter a dummy value only. A real ID or phone number is refused.', 'শুধু নকল মান দিন। আসল আইডি বা ফোন নম্বর গ্রহণ করা হয় না।')}</p>
          <input className="input mt-2" value={vals.identity} onChange={(e) => setVals({ ...vals, identity: e.target.value })} />
        </>
      ),
    },
    {
      key: 'source_of_funds', title: t('2. Source of funds declaration (simulated)', '২. টাকার উৎসের ঘোষণা (সিমুলেটেড)'),
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
  return (
    <div className="max-w-2xl">
      <PageTitle title={t('Investor verification', 'বিনিয়োগকারী যাচাই')} sub={t('A simulated wizard. No real identity document or number is collected.', 'একটি সিমুলেটেড ধাপ। কোনো আসল পরিচয়পত্র বা নম্বর নেওয়া হয় না।')} />
      <SimulationBanner />
      <div className="chip mb-4">
        {t('Status', 'অবস্থা')}: <b>{data.investor.verification_status}</b>
      </div>
      <div className="space-y-3">
        {steps.map((s) => (
          <Card key={s.key} title={s.title} right={done.has(s.key) ? <span className="chip" style={{ color: 'var(--checked)' }}><IconCheck width={13} height={13} /> {t('Done', 'সম্পন্ন')}</span> : null}>
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
