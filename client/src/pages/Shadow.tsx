import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, Skeleton, Card, VerdictChip, VERDICT_WORDS, VerdictKey } from '../components/ui';

export default function Shadow() {
  const { t, n, pick } = useI18n();
  const { data } = useApi('/shadow');
  return (
    <div>
      <PageTitle title={t('Shadow-mode report', 'শ্যাডো মোড রিপোর্ট')} sub={t("Bhorsha's verdict next to the manager's decision and the outcome at 12 months. In a real trial the file would change no decisions.", 'ভরসার রায়, ম্যানেজারের সিদ্ধান্ত আর ১২ মাস পরের ফলাফল পাশাপাশি। আসল পরীক্ষায় ফাইল কোনো সিদ্ধান্ত বদলাবে না।')} />
      <div className="rounded-xl border-2 border-dashed px-4 py-3 mb-5 font-semibold" style={{ borderColor: 'var(--owner)' }}>
        {t('SIMULATION, illustrative only. These are synthetic past files, not results from a real lender.', 'সিমুলেশন, শুধু উদাহরণ। এগুলো কৃত্রিম পুরোনো ফাইল, কোনো আসল ঋণদাতার ফলাফল নয়।')}
      </div>
      {!data ? (
        <Skeleton h={300} />
      ) : (
        <div className="grid lg:grid-cols-[1fr_1.3fr] gap-5">
          <Card title={t('Survival by verdict', 'রায় অনুযায়ী টিকে থাকা')}>
            {data.summary.bands.map((b: any) => (
              <div key={b.verdict} className="py-2">
                <div className="flex justify-between text-[14px]">
                  <span>{pick(VERDICT_WORDS[b.verdict as VerdictKey])}</span>
                  <span className="num">
                    {n(b.trading_12m)}/{n(b.n)} · {n(b.survival_pct)}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full mt-1" style={{ background: 'var(--line)' }}>
                  <div className="h-2.5 rounded-full" style={{ width: `${b.survival_pct || 0}%`, background: b.verdict === 'viable' ? 'var(--viable)' : b.verdict === 'not_sure' ? 'var(--unsure)' : 'var(--notviable)' }} />
                </div>
              </div>
            ))}
            <p className="text-[13px] text-muted mt-3">
              {t('Verdict and manager agree (viable–approve or not viable–decline):', 'রায় ও ম্যানেজার একমত (টেকসই–অনুমোদন বা টেকসই নয়–প্রত্যাখ্যান):')} <span className="num font-semibold">{n(data.summary.agreement_pct)}%</span> · n = {n(data.summary.n)}
            </p>
          </Card>
          <Card title={t('Files', 'ফাইল')}>
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="text-muted text-left">
                  <tr>
                    <th className="py-1">{t('File', 'ফাইল')}</th>
                    <th>{t('Bhorsha', 'ভরসা')}</th>
                    <th>{t('Manager', 'ম্যানেজার')}</th>
                    <th>{t('Trading at 12 m', '১২ মাসে চালু')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r: any) => (
                    <tr key={r._id} className="border-t border-line">
                      <td className="py-1.5">{r.label}</td>
                      <td>
                        <VerdictChip verdict={r.bhorsha_verdict} />
                      </td>
                      <td>{r.manager_decision}</td>
                      <td style={{ color: r.trading_12m ? 'var(--viable)' : 'var(--notviable)' }}>{r.trading_12m ? t('yes', 'হ্যাঁ') : t('no', 'না')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
