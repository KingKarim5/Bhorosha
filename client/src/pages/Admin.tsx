import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, Card, Skeleton, ErrorNote } from '../components/ui';

// Admin: every lender institution and every investor on the platform (read-only).

const VER: Record<string, { en: string; bn: string; color: string }> = {
  verified: { en: 'Verified', bn: 'যাচাইকৃত', color: 'var(--checked)' },
  in_progress: { en: 'In progress', bn: 'চলছে', color: 'var(--unsure)' },
  not_started: { en: 'Not started', bn: 'শুরু হয়নি', color: 'var(--muted)' },
};

export default function Admin() {
  const { t, n, bdt, pick } = useI18n();
  const { data, error } = useApi('/admin/overview');
  if (error) return <ErrorNote msg={error} />;
  if (!data) return <Skeleton h={300} />;
  const T = data.totals;
  const when = (d: string) => (d ? new Date(d).toLocaleDateString() : '—');
  return (
    <div>
      <PageTitle title={t('Lenders and investors', 'ঋণদাতা ও বিনিয়োগকারী')} sub={t('Every institution and investor on the platform. Each lender sees only its own cases; this view is for the platform administrator.', 'প্ল্যাটফর্মের সব প্রতিষ্ঠান ও বিনিয়োগকারী। প্রতিটি ঋণদাতা শুধু নিজের কেস দেখে; এই পাতা প্ল্যাটফর্ম অ্যাডমিনের জন্য।')} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          [t('Lenders', 'ঋণদাতা'), n(T.lenders)],
          [t('Investors', 'বিনিয়োগকারী'), n(T.investors)],
          [t('Applications', 'আবেদন'), n(T.cases)],
          [t('Loans released', 'ছাড় করা ঋণ'), n(T.funded_loans)],
          [t('Investor commitments', 'বিনিয়োগের প্রতিশ্রুতি'), bdt(T.committed_bdt)],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="text-[12.5px] text-muted">{k}</div>
            <div className="num text-[22px] font-semibold mt-0.5">{v}</div>
          </div>
        ))}
      </div>
      <Card title={t('Lender institutions', 'ঋণদাতা প্রতিষ্ঠান')} className="mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-muted text-[12px]">
              <tr>
                <th className="py-1.5 pr-3">{t('Institution', 'প্রতিষ্ঠান')}</th>
                <th className="pr-3">{t('Contact', 'যোগাযোগ')}</th>
                <th className="pr-3 text-right">{t('Applications', 'আবেদন')}</th>
                <th className="pr-3 text-right">{t('Approved', 'অনুমোদিত')}</th>
                <th className="pr-3 text-right">{t('On hold', 'স্থগিত')}</th>
                <th className="pr-3 text-right">{t('Declined', 'প্রত্যাখ্যাত')}</th>
                <th className="pr-3 text-right">{t('Released', 'ছাড়')}</th>
                <th className="pr-3">{t('Policy', 'নীতি')}</th>
                <th className="pr-3">{t('AI', 'এআই')}</th>
                <th>{t('Joined', 'যোগ দিয়েছে')}</th>
              </tr>
            </thead>
            <tbody>
              {data.lenders.map((l: any) => (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3"><b>{l.org_name}</b><div className="num text-[11.5px] text-muted">/apply/{l.apply_code}</div></td>
                  <td className="pr-3">{l.name}<div className="text-[11.5px] text-muted">{l.email}</div></td>
                  <td className="pr-3 num text-right">{n(l.cases)}</td>
                  <td className="pr-3 num text-right" style={{ color: 'var(--checked)' }}>{n(l.approved)}</td>
                  <td className="pr-3 num text-right" style={{ color: 'var(--unsure)' }}>{n(l.held)}</td>
                  <td className="pr-3 num text-right" style={{ color: 'var(--notviable)' }}>{n(l.declined)}</td>
                  <td className="pr-3 num text-right">{n(l.funded)}<div className="text-[11px] text-muted">{bdt(l.funded_bdt)}</div></td>
                  <td className="pr-3 num">v{n(l.policy_version)}</td>
                  <td className="pr-3">{l.ai_paused ? <span style={{ color: 'var(--notviable)' }}>{t('Paused', 'থামানো')}</span> : <span style={{ color: 'var(--checked)' }}>{t('Deciding', 'চালু')}</span>}</td>
                  <td className="num text-muted">{when(l.joined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={t('Investors', 'বিনিয়োগকারী')}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-muted text-[12px]">
              <tr>
                <th className="py-1.5 pr-3">{t('Investor', 'বিনিয়োগকারী')}</th>
                <th className="pr-3">{t('Verification', 'যাচাই')}</th>
                <th className="pr-3 text-right">{t('Loans backed', 'সমর্থিত ঋণ')}</th>
                <th className="pr-3 text-right">{t('Committed', 'প্রতিশ্রুতি')}</th>
                <th>{t('Joined', 'যোগ দিয়েছে')}</th>
              </tr>
            </thead>
            <tbody>
              {data.investors.map((i: any) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="py-2 pr-3"><b>{i.name}</b><div className="text-[11.5px] text-muted">{i.email}</div></td>
                  <td className="pr-3" style={{ color: VER[i.verification_status]?.color }}>{pick(VER[i.verification_status] || { en: i.verification_status, bn: i.verification_status })}</td>
                  <td className="pr-3 num text-right">{n(i.commitments)}</td>
                  <td className="pr-3 num text-right">{bdt(i.committed_bdt)}</td>
                  <td className="num text-muted">{when(i.joined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-[12.5px] text-muted mt-4">{t('SIMULATION: synthetic institutions, investors and money only.', 'সিমুলেশন: শুধু কৃত্রিম প্রতিষ্ঠান, বিনিয়োগকারী ও টাকা।')}</p>
    </div>
  );
}
