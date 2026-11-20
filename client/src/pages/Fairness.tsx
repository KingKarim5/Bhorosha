import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, Skeleton, Card, Planned, ModeBadge } from '../components/ui';

export default function Fairness() {
  const { t, n } = useI18n();
  const { data } = useApi('/fairness');
  if (!data) return <Skeleton h={300} />;
  const f = data.fairness;
  return (
    <div>
      <PageTitle title={t('Fairness and audit', 'ন্যায্যতা ও অডিট')} sub={t('What goes into the verdict, what never does, and every AI call with its redacted input.', 'রায়ে কী ঢোকে, কী কখনো ঢোকে না, আর প্রতিটি এআই কল ও তার গোপনীয়তা-রক্ষিত ইনপুট।')} />
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title={t('Inputs the model uses', 'মডেল যে তথ্য ব্যবহার করে')}>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13.5px] num">
            {data.model_inputs.map((x: string) => (
              <li key={x}>• {x.replace(/_/g, ' ')}</li>
            ))}
          </ul>
        </Card>
        <Card title={t('Never used', 'কখনো ব্যবহার হয় না')}>
          <p className="text-[14px] mb-2">
            {t('Bhorsha never collects, stores, displays or infers gender, religion, marital status, ethnicity or proxies for them. District is not a model feature. Names appear only as labels and are replaced with tokens before any AI call.', 'ভরসা কখনো লিঙ্গ, ধর্ম, বৈবাহিক অবস্থা, জাতিসত্তা বা এগুলোর বিকল্প সংকেত সংগ্রহ, সংরক্ষণ, প্রদর্শন বা অনুমান করে না। জেলা মডেলের উপাদান নয়। নাম শুধু লেবেল, এবং এআই-তে পাঠানোর আগে টোকেনে বদলানো হয়।')}
          </p>
          <ul className="text-[13.5px] list-disc pl-5">
            {data.excluded.map((x: string) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Card>
        <Card title={t('Group comparison on the synthetic cohort', 'কৃত্রিম কোহর্টে দলভিত্তিক তুলনা')} className="lg:col-span-2">
          {!f ? (
            <p className="text-muted text-[14px]">
              <Planned /> {t('Run npm run eval to compute approval-rate gaps on the synthetic cohort.', 'কৃত্রিম কোহর্টে অনুমোদনের হারের পার্থক্য দেখতে npm run eval চালান।')}
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 text-[13.5px]">
              {f.scenarios.map((s: any) => (
                <div key={s.name} className="p-3 rounded" style={{ background: 'var(--raised)' }}>
                  <div className="font-semibold">{s.title}</div>
                  <div className="text-muted text-[12.5px] mb-2">{s.description}</div>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 num">
                    <dt>{t('Approval-rate gap (group A − B)', 'অনুমোদন হারের পার্থক্য (A − B)')}</dt>
                    <dd>{n(s.approval_gap_pct, { digits: 1 })} pts</dd>
                    <dt>{t('Equal-opportunity difference', 'সমান-সুযোগ পার্থক্য')}</dt>
                    <dd>{n(s.equal_opportunity_diff_pct, { digits: 1 })} pts</dd>
                    <dt>n</dt>
                    <dd>{n(s.n)}</dd>
                  </dl>
                </div>
              ))}
              <p className="md:col-span-2 text-[12.5px] text-muted">{f.note}</p>
            </div>
          )}
        </Card>
        <Card title={t('Every AI call (redacted input)', 'প্রতিটি এআই কল (গোপনীয়তা-রক্ষিত ইনপুট)')} className="lg:col-span-2">
          <ul className="space-y-2 max-h-[520px] overflow-auto">
            {data.ai_calls.map((a: any) => (
              <li key={a._id}>
                <details className="p-2 rounded" style={{ background: 'var(--raised)' }}>
                  <summary className="cursor-pointer text-[13px] flex flex-wrap gap-2 items-center">
                    <span className="num text-muted">{new Date(a.createdAt).toLocaleString()}</span> <b>{a.action}</b> <ModeBadge mode={a.mode} /> <span className="text-muted">{a.actor}</span> {a.latency_ms != null && <span className="num text-muted">{n(a.latency_ms)} ms</span>}
                  </summary>
                  <pre className="text-[11.5px] whitespace-pre-wrap break-words mt-2 num">{(JSON.stringify(a.redacted_payload_json ?? {}, null, 1) || '').slice(0, 2500)}</pre>
                  <pre className="text-[11.5px] whitespace-pre-wrap break-words mt-2 num" style={{ color: 'var(--muted)' }}>
                    → {(JSON.stringify(a.output_json ?? {}, null, 1) || '').slice(0, 1500)}
                  </pre>
                </details>
              </li>
            ))}
            {!data.ai_calls.length && <li className="text-muted text-[14px]">{t('No AI calls yet. Use “Read with AI” or “Cross-check and write with AI” on a case.', 'এখনো কোনো এআই কল হয়নি। কোনো কেসে "এআই দিয়ে পড়ুন" চাপুন।')}</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
