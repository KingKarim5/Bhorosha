import { useEffect, useState } from 'react';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { PageTitle, Skeleton, Card, ErrorNote } from '../components/ui';

const FIELDS: { k: string; en: string; bn: string; step: number; group: 'autonomy' | 'rules' | 'breaker' }[] = [
  { k: 'autonomy_cap_bdt', en: 'Autonomy cap: largest first tranche the AI may release (BDT)', bn: 'স্বয়ংক্রিয় সীমা: এআই সর্বোচ্চ যত টাকার প্রথম কিস্তি ছাড়তে পারে', step: 10000, group: 'autonomy' },
  { k: 'min_coverage_pct', en: 'Coverage below which the band widens (%)', bn: 'যে কভারেজের নিচে সীমা চওড়া হয় (%)', step: 5, group: 'rules' },
  { k: 'household_mixing_pct', en: 'Household mixing threshold (% of outflows)', bn: 'সংসারের টাকা মেশানোর সীমা (খরচের %)', step: 1, group: 'rules' },
  { k: 'trend_drop_pct', en: 'Trend drop that costs 2 points (% over 3 months)', bn: 'যে পতনে ২ পয়েন্ট কাটে (৩ মাসে %)', step: 1, group: 'rules' },
  { k: 'good_installment_to_margin', en: 'Instalment-to-margin earning +1 (below)', bn: 'কিস্তি/লাভ অনুপাত যার নিচে +১', step: 0.01, group: 'rules' },
  { k: 'max_installment_to_margin', en: 'Instalment-to-margin costing −2 (above)', bn: 'কিস্তি/লাভ অনুপাত যার উপরে −২', step: 0.01, group: 'rules' },
  { k: 'viable_points', en: 'Points for viable (at or above)', bn: 'টেকসই হতে পয়েন্ট (সমান বা বেশি)', step: 1, group: 'rules' },
  { k: 'not_viable_points', en: 'Points for not viable (at or below)', bn: 'টেকসই নয় হতে পয়েন্ট (সমান বা কম)', step: 1, group: 'rules' },
  { k: 'breaker_max_hold_rate', en: 'Pause when the hold rate exceeds (0–1)', bn: 'স্থগিতের হার এর বেশি হলে থামান (০–১)', step: 0.05, group: 'breaker' },
  { k: 'breaker_max_default_rate', en: 'Pause when the simulated default rate exceeds (0–1)', bn: 'সিমুলেটেড খেলাপি হার এর বেশি হলে থামান (০–১)', step: 0.01, group: 'breaker' },
  { k: 'breaker_window', en: 'Recent decisions counted for the hold rate', bn: 'স্থগিতের হার গোনার জন্য সাম্প্রতিক সিদ্ধান্ত', step: 1, group: 'breaker' },
  { k: 'breaker_min_decisions', en: 'Minimum decisions before the hold-rate limit applies', bn: 'স্থগিত-হারের সীমা প্রযোজ্য হওয়ার আগে ন্যূনতম সিদ্ধান্ত', step: 1, group: 'breaker' },
];
const DOCS = [
  { k: 'statement', en: 'Wallet or bank statement', bn: 'ওয়ালেট বা ব্যাংক স্টেটমেন্ট' },
  { k: 'online_evidence', en: 'Online evidence for hybrid and digital sellers (courier settlements or order log)', bn: 'মিশ্র ও ডিজিটাল বিক্রেতার অনলাইন প্রমাণ (কুরিয়ারের হিসাব বা অর্ডারের খাতা)' },
  { k: 'supplier_bill', en: 'At least one supplier bill', bn: 'অন্তত একটি সরবরাহকারীর বিল' },
];

export default function Settings() {
  const { t, pick, n } = useI18n();
  const { user } = useAuth();
  const { data, reload } = useApi('/console');
  const [form, setForm] = useState<Record<string, any>>({});
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setForm({ ...Object.fromEntries(FIELDS.map((f) => [f.k, data.policy[f.k]])), min_documents: data.policy.min_documents });
  }, [data]);
  if (!data) return <Skeleton h={300} />;
  const save = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await api('/policy', { body: { ...form, note } });
      setMsg(t(`Saved as policy v${r.policy.version}. It applies to new decisions only; earlier decisions keep their version.`, `নীতি v${r.policy.version} হিসেবে সংরক্ষিত। এটি শুধু নতুন সিদ্ধান্তে প্রযোজ্য; আগের সিদ্ধান্ত তাদের সংস্করণেই থাকে।`) + (r.breaker.tripped ? ' ' + t(`Circuit breaker tripped: ${r.breaker.reasons.join('; ')}`, `সার্কিট ব্রেকার চালু: ${r.breaker.reasons.join('; ')}`) : ''));
      setNote('');
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const groups: [string, string, string][] = [
    ['autonomy', t('Autonomy', 'স্বয়ংক্রিয়তা'), t('Over the cap, the AI can only release a first tranche up to the cap and ties the rest to conditions.', 'সীমার বেশি হলে এআই শুধু সীমা পর্যন্ত প্রথম কিস্তি ছাড়ে, বাকিটা শর্তের সাথে বাঁধা।')],
    ['rules', t('Rule thresholds', 'নিয়মের সীমা'), t('The transparent rules the Underwriter uses. Approval also needs every fail-safe gate to pass.', 'আন্ডাররাইটারের স্বচ্ছ নিয়ম। অনুমোদনের জন্য সব নিরাপত্তা-গেট পার হতে হয়।')],
    ['breaker', t('Circuit breaker', 'সার্কিট ব্রেকার'), t('Limits that pause AI decisions automatically.', 'যে সীমা পার হলে এআই-এর সিদ্ধান্ত নিজে থেকেই থামে।')],
  ];
  const editable = user?.role === 'lender';
  return (
    <div className="max-w-4xl">
      <PageTitle title={t('Lender policy', 'ঋণদাতার নীতি')} sub={t('Every save creates a new version. A new version applies only to new decisions; old decisions keep their version.', 'প্রতিবার সংরক্ষণে নতুন সংস্করণ হয়। নতুন সংস্করণ শুধু নতুন সিদ্ধান্তে প্রযোজ্য; পুরোনো সিদ্ধান্ত তাদের সংস্করণেই থাকে।')} right={<span className="chip">{t('Active', 'চালু')}: v{n(data.policy.version)}</span>} />
      {groups.map(([g, title, sub]) => (
        <Card key={g} title={title} className="mb-4">
          <p className="text-[13px] text-muted mb-3">{sub}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {FIELDS.filter((f) => f.group === g).map((f) => (
              <div key={f.k}>
                <label className="label" htmlFor={f.k}>{pick(f)}</label>
                <input id={f.k} type="number" step={f.step} className="input mt-1 num" value={form[f.k] ?? ''} onChange={(e) => setForm({ ...form, [f.k]: Number(e.target.value) })} disabled={!editable} />
              </div>
            ))}
          </div>
          {g === 'autonomy' && (
            <fieldset className="mt-4">
              <legend className="label mb-1">{t('Minimum documents', 'ন্যূনতম কাগজপত্র')}</legend>
              {DOCS.map((d) => (
                <label key={d.k} className="flex items-center gap-2 text-[14px] py-0.5">
                  <input type="checkbox" className="h-4 w-4" disabled={!editable} checked={(form.min_documents || []).includes(d.k)} onChange={(e) => setForm({ ...form, min_documents: e.target.checked ? [...(form.min_documents || []), d.k] : (form.min_documents || []).filter((x: string) => x !== d.k) })} />
                  {pick(d)}
                </label>
              ))}
            </fieldset>
          )}
        </Card>
      ))}
      {editable && (
        <Card>
          <label className="label" htmlFor="note">{t('Note for this version', 'এই সংস্করণের নোট')}</label>
          <input id="note" className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. Lower cap during the trial', 'যেমন: পরীক্ষার সময় সীমা কম')} />
          <ErrorNote msg={err} />
          {msg && <p className="text-[13.5px] mt-2" style={{ color: 'var(--checked)' }}>{msg}</p>}
          <button className="btn btn-primary mt-3" onClick={save} disabled={busy}>
            {busy ? t('Saving…', 'সংরক্ষণ হচ্ছে…') : t('Save as a new policy version', 'নতুন নীতি সংস্করণ হিসেবে সংরক্ষণ')}
          </button>
        </Card>
      )}
      <Card title={t('Version history', 'সংস্করণের ইতিহাস')} className="mt-4">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              <th className="py-1">v</th>
              <th>{t('Autonomy cap', 'স্বয়ংক্রিয় সীমা')}</th>
              <th>{t('Hold / default limits', 'স্থগিত / খেলাপি সীমা')}</th>
              <th>{t('By', 'কে')}</th>
              <th>{t('Note', 'নোট')}</th>
              <th>{t('When', 'কখন')}</th>
            </tr>
          </thead>
          <tbody>
            {data.versions.map((v: any) => (
              <tr key={v._id} className="border-b border-line">
                <td className="py-1.5 num">{v.version}</td>
                <td className="num">{n(v.autonomy_cap_bdt)}</td>
                <td className="num">{v.breaker_max_hold_rate} / {v.breaker_max_default_rate}</td>
                <td>{v.created_by}</td>
                <td className="text-muted">{v.note}</td>
                <td className="num text-muted">{new Date(v.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
