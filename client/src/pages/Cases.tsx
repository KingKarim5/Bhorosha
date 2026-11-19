import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, Skeleton, VerdictChip, Sparkline, ErrorNote } from '../components/ui';
import { STATUS_WORDS } from './Dashboard';
import { IconPlus } from '../components/icons';

const CAUSE: Record<string, { en: string; bn: string }> = {
  stock_problem: { en: 'Stock problem', bn: 'মালের ঘাটতি' },
  fewer_customers: { en: 'Fewer customers', bn: 'ক্রেতা কমছে' },
  higher_costs: { en: 'Higher costs', bn: 'খরচ বাড়ছে' },
  buyers_paying_late: { en: 'Buyers paying late', bn: 'ক্রেতা দেরিতে টাকা দিচ্ছে' },
  household_mixing: { en: 'Household money mixed in', bn: 'সংসারের টাকা মিশে যাচ্ছে' },
  none_clear: { en: 'No clear weak point', bn: 'স্পষ্ট দুর্বলতা নেই' },
};
export const CAUSE_WORDS = CAUSE;

export default function Cases() {
  const { t, n, pick, pct } = useI18n();
  const { data, error } = useApi<any[]>('/cases');
  return (
    <div>
      <PageTitle
        title={t('Cases', 'কেস')}
        sub={t('Every file with its verdict, likelihood band and status. Synthetic shops only.', 'প্রতিটি ফাইলের রায়, সম্ভাবনার সীমা ও অবস্থা। শুধু কৃত্রিম দোকান।')}
        right={
          <Link to="/cases/new" className="btn btn-primary">
            <IconPlus /> {t('New case', 'নতুন কেস')}
          </Link>
        }
      />
      <ErrorNote msg={error} />
      {!data ? (
        <Skeleton h={300} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-[14.5px]">
            <thead>
              <tr className="text-left text-muted text-[12.5px] border-b border-line">
                <th className="p-3">{t('Shop', 'দোকান')}</th>
                <th className="p-3">{t('Visible sales, 12 months', '১২ মাসের দৃশ্যমান বিক্রি')}</th>
                <th className="p-3">{t('Verdict', 'রায়')}</th>
                <th className="p-3">{t('Band', 'সীমা')}</th>
                <th className="p-3">{t('Coverage', 'কভারেজ')}</th>
                <th className="p-3">{t('Likely cause', 'সম্ভাব্য কারণ')}</th>
                <th className="p-3">{t('Status', 'অবস্থা')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-raised">
                  <td className="p-3">
                    <Link to={`/cases/${c.id}`} className="font-semibold hover:text-accent">
                      {c.shop}
                    </Link>
                    <div className="text-[12.5px] text-muted num">{n(c.loan_ask_bdt)} BDT</div>
                  </td>
                  <td className="p-3">
                    <Sparkline values={c.monthly} />
                  </td>
                  <td className="p-3">
                    <VerdictChip verdict={c.verdict} />
                    {c.disagreement && <div className="text-[11.5px] mt-1" style={{ color: 'var(--unsure)' }}>{t('rules and model differ', 'নিয়ম ও মডেল ভিন্ন')}</div>}
                  </td>
                  <td className="p-3 num">
                    {n(c.band_low)}–{n(c.band_high)}%
                  </td>
                  <td className="p-3 num">{pct(c.coverage_pct)}</td>
                  <td className="p-3">{pick(CAUSE[c.cause])}</td>
                  <td className="p-3 text-[13px]">{pick(STATUS_WORDS[c.status])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
