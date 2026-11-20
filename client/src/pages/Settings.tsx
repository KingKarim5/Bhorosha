import { useEffect, useState } from 'react';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { PageTitle, Skeleton, Card, ErrorNote, VerdictChip } from '../components/ui';

const FIELDS: { k: string; en: string; bn: string; step: number }[] = [
  { k: 'min_coverage_pct', en: 'Coverage below which the band widens (%)', bn: 'যে কভারেজের নিচে সীমা চওড়া হয় (%)', step: 5 },
  { k: 'household_mixing_pct', en: 'Household mixing threshold (% of outflows)', bn: 'সংসারের টাকা মেশানোর সীমা (খরচের %)', step: 1 },
  { k: 'trend_drop_pct', en: 'Trend drop that costs 2 points (% over 3 months)', bn: 'যে পতনে ২ পয়েন্ট কাটে (৩ মাসে %)', step: 1 },
  { k: 'good_installment_to_margin', en: 'Instalment-to-margin earning +1 (below)', bn: 'কিস্তি/লাভ অনুপাত যার নিচে +১', step: 0.01 },
  { k: 'max_installment_to_margin', en: 'Instalment-to-margin costing −2 (above)', bn: 'কিস্তি/লাভ অনুপাত যার উপরে −২', step: 0.01 },
  { k: 'viable_points', en: 'Points for viable (at or above)', bn: 'টেকসই হতে পয়েন্ট (সমান বা বেশি)', step: 1 },
  { k: 'not_viable_points', en: 'Points for not viable (at or below)', bn: 'টেকসই নয় হতে পয়েন্ট (সমান বা কম)', step: 1 },
];

export default function Settings() {
  const { t, pick } = useI18n();
  const { user } = useAuth();
  const { data } = useApi('/settings');
  const [form, setForm] = useState<Record<string, number>>({});
  const [changes, setChanges] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cases = useApi<any[]>('/cases', [changes]);
  useEffect(() => {
    if (data) setForm(Object.fromEntries(FIELDS.map((f) => [f.k, data[f.k]])));
  }, [data]);
  if (!data) return <Skeleton h={300} />;
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api('/settings', { method: 'PUT', body: form });
      setChanges(r.changes);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-3xl">
      <PageTitle title={t('Lender settings', 'ঋণদাতার সেটিংস')} sub={t('These thresholds really change the verdict. Saving recomputes every open file and keeps the old verdicts in history.', 'এই সীমাগুলো সত্যিই রায় বদলায়। সংরক্ষণ করলে খোলা সব ফাইল আবার হিসাব হয়, পুরোনো রায় ইতিহাসে থাকে।')} />
      <Card>
        <div className="grid sm:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <div key={f.k}>
              <label className="label" htmlFor={f.k}>
                {pick(f)}
              </label>
              <input id={f.k} type="number" step={f.step} className="input mt-1 num" value={form[f.k] ?? ''} onChange={(e) => setForm({ ...form, [f.k]: Number(e.target.value) })} disabled={user?.role !== 'lender'} />
            </div>
          ))}
        </div>
        <ErrorNote msg={err} />
        {user?.role === 'lender' ? (
          <button className="btn btn-primary mt-4" onClick={save} disabled={busy}>
            {busy ? t('Recomputing…', 'আবার হিসাব হচ্ছে…') : t('Save and recompute', 'সংরক্ষণ ও আবার হিসাব')}
          </button>
        ) : (
          <p className="text-muted mt-3 text-[13.5px]">{t('Only the lender can change the policy.', 'শুধু ঋণদাতা নীতি বদলাতে পারেন।')}</p>
        )}
      </Card>
      {changes && (
        <Card title={t('Effect on open files', 'খোলা ফাইলে প্রভাব')} className="mt-5">
          <ul className="space-y-1.5">
            {changes.map((c) => {
              const cs = cases.data?.find((x) => x.id === c.id);
              return (
                <li key={c.id} className="flex items-center gap-2 text-[14px]">
                  <span className="flex-1">{cs?.shop || c.id}</span>
                  <VerdictChip verdict={c.before} /> → <VerdictChip verdict={c.after} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
