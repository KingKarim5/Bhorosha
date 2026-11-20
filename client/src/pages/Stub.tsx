import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { PageTitle, Card, Planned } from '../components/ui';

export default function Stub({ kind }: { kind: 'field_visit' | 'counterparty' }) {
  const { t } = useI18n();
  const { id } = useParams();
  const fv = kind === 'field_visit';
  const steps = fv
    ? [
        t('Photo of the shop front and shelves (stock level)', 'দোকানের সামনে ও তাকের ছবি (মজুতের অবস্থা)'),
        t('Count of customers in 30 minutes', '৩০ মিনিটে ক্রেতার সংখ্যা'),
        t('Check the paper ledger against two wallet days', 'খাতার হিসাব দুই দিনের ওয়ালেটের সাথে মেলানো'),
        t('Confirm the owner runs the shop day to day', 'মালিক নিজে প্রতিদিন দোকান চালান কিনা'),
        t('A field partner signs; items become checked evidence', 'মাঠের অংশীদার স্বাক্ষর করেন; বিষয়গুলো যাচাই করা প্রমাণ হয়'),
      ]
    : [
        t('Pick a named buyer or supplier from the statement', 'স্টেটমেন্ট থেকে একজন ক্রেতা বা সরবরাহকারী বাছুন'),
        t('Send a consent-based confirmation request (SMS or call)', 'সম্মতির ভিত্তিতে নিশ্চিতকরণের অনুরোধ (এসএমএস বা ফোন)'),
        t('Counterparty confirms the amount and the relationship', 'পক্ষটি অঙ্ক ও সম্পর্ক নিশ্চিত করেন'),
        t('A confirmed receivable stops costing a rule point', 'নিশ্চিত পাওনা আর পয়েন্ট কাটায় না'),
      ];
  return (
    <div className="max-w-2xl">
      <Link to={`/cases/${id}`} className="text-[13px] text-muted hover:text-accent">← {t('Back to the file', 'ফাইলে ফিরুন')}</Link>
      <PageTitle title={fv ? t('Field visit checklist', 'সরেজমিন পরিদর্শনের তালিকা') : t('Counterparty confirmation', 'ক্রেতা/সরবরাহকারীর নিশ্চিতকরণ')} right={<Planned />} />
      <Card>
        <p className="text-muted text-[14px] mb-3">{t('This flow is planned and not built yet. It shows how the step would work.', 'এই ধাপটি পরিকল্পিত, এখনো তৈরি হয়নি। এটি দেখায় ধাপটি কীভাবে কাজ করবে।')}</p>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="num chip">{i + 1}</span>
              <span>{s}</span>
              <input type="checkbox" disabled className="ml-auto mt-1" aria-label="planned" />
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
