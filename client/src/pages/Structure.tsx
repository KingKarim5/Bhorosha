import { motion } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { PageTitle, SimulationBanner, Card } from '../components/ui';
import { useReducedMotion } from '../lib/hooks';
import { BRAND } from '../brand';

export default function Structure() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const nodes = [
    { x: 70, en: 'Small investors', bn: 'ছোট বিনিয়োগকারী', sub: t('verified, capped', 'যাচাইকৃত, সীমিত') },
    { x: 260, en: "Licensed partner's pooled facility", bn: 'লাইসেন্সপ্রাপ্ত অংশীদারের যৌথ তহবিল', sub: t('lender of record, holds the money', 'আইনি ঋণদাতা, টাকা রাখে') },
    { x: 450, en: 'Small business', bn: 'ছোট ব্যবসা', sub: t('borrower', 'ঋণগ্রহীতা') },
  ];
  const checklist = [
    { en: 'An agreement with a licensed lender', bn: 'লাইসেন্সপ্রাপ্ত ঋণদাতার সাথে চুক্তি' },
    { en: 'Regulator approval where required (Bangladesh Bank)', bn: 'প্রয়োজনে নিয়ন্ত্রকের অনুমোদন (বাংলাদেশ ব্যাংক)' },
    { en: "The lender's own credit policy loaded into the AI agents, and a regulator's review of AI decisions inside it", bn: 'ঋণদাতার নিজের ঋণনীতি এআই এজেন্টে বসানো, এবং সেই নীতির ভেতরে এআই সিদ্ধান্তের ওপর নিয়ন্ত্রকের পর্যালোচনা' },
    { en: 'Investor verification and anti-money-laundering controls', bn: 'বিনিয়োগকারী যাচাই ও মানি-লন্ডারিং প্রতিরোধ ব্যবস্থা' },
    { en: 'Investor risk disclosures', bn: 'বিনিয়োগকারীর জন্য ঝুঁকির প্রকাশ' },
    { en: "A lawyer's review", bn: 'আইনজীবীর পর্যালোচনা' },
  ];
  return (
    <div>
      <PageTitle title={t('How the money would move', 'টাকা কীভাবে চলবে')} sub={t('Bhorsha never holds, receives or pays out funds. It supplies evidence, the viability file, verification workflow and servicing information.', 'ভরসা কখনো টাকা রাখে, নেয় বা দেয় না। এটি প্রমাণ, টেকসইতার ফাইল, যাচাইয়ের ধাপ ও ঋণ-পরবর্তী তথ্য দেয়।')} />
      <p className="font-display text-[20px] text-accent -mt-3 mb-4">{t(BRAND.taglineEn, BRAND.taglineBn)}</p>
      <SimulationBanner />
      <Card>
        <svg viewBox="0 0 520 230" className="w-full h-auto" role="img" aria-label={t('Money flow diagram', 'টাকার প্রবাহের চিত্র')}>
          <defs>
            <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
            </marker>
            <marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--owner)" />
            </marker>
          </defs>
          {[0, 1].map((i) => (
            <g key={i}>
              <motion.path d={`M${nodes[i].x + 62},70 L${nodes[i + 1].x - 62},70`} stroke="var(--accent)" strokeWidth={2.5} markerEnd="url(#ar)" initial={{ pathLength: reduce ? 1 : 0 } as any} animate={{ pathLength: 1 } as any} transition={{ delay: 0.3 + i * 0.4, duration: 0.6 }} />
              <motion.path d={`M${nodes[i + 1].x - 62},120 L${nodes[i].x + 62},120`} stroke="var(--owner)" strokeWidth={2} strokeDasharray="5 4" markerEnd="url(#ar2)" initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 + i * 0.4, duration: 0.6 }} />
            </g>
          ))}
          {nodes.map((nd) => (
            <g key={nd.x}>
              <rect x={nd.x - 62} y={40} width={124} height={110} rx={12} fill="var(--raised)" stroke="var(--line)" />
              <foreignObject x={nd.x - 58} y={46} width={116} height={100}>
                <div style={{ fontSize: 12.5, lineHeight: 1.25, textAlign: 'center', color: 'var(--ink)' }}>
                  <b>{t(nd.en, nd.bn)}</b>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>{nd.sub}</div>
                </div>
              </foreignObject>
            </g>
          ))}
          <text x={260} y={30} textAnchor="middle" fontSize={11} fill="var(--accent)">
            {t('money out', 'টাকা যায়')}
          </text>
          <text x={260} y={172} textAnchor="middle" fontSize={11} fill="var(--owner)">
            {t('repayments back the same path', 'কিস্তি ফেরে একই পথে')}
          </text>
          <rect x={150} y={190} width={220} height={30} rx={8} fill="none" stroke="var(--muted)" strokeDasharray="3 3" />
          <text x={260} y={209} textAnchor="middle" fontSize={11} fill="var(--muted)">
            {t('Bhorsha: evidence and information only', 'ভরসা: শুধু প্রমাণ ও তথ্য')}
          </text>
        </svg>
      </Card>
      <Card title={t('What must be true in real life', 'বাস্তবে যা সত্য হতে হবে')} className="mt-5">
        <ul className="divide-y divide-line">
          {checklist.map((c) => (
            <li key={c.en} className="flex items-center justify-between gap-3 py-2.5">
              <span>{t(c.en, c.bn)}</span>
              <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--notviable)' }}>
                {t('Not yet done', 'এখনো হয়নি')}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] mt-3">{t('Real deployment needs the lender’s own policy and a regulator’s review of AI decisions made inside it. Neither is done; the policy here is a demo default.', 'বাস্তবে চালু করতে ঋণদাতার নিজের নীতি এবং সেই নীতির ভেতরে নেওয়া এআই সিদ্ধান্তের ওপর নিয়ন্ত্রকের পর্যালোচনা দরকার। কোনোটিই হয়নি; এখানের নীতি একটি ডেমো ডিফল্ট।')}</p>
        <p className="text-[12.5px] text-muted mt-3">{t('The staged path: one lender trials the file in shadow mode first; the partner co-funds next; small investors join last, after a lawyer’s sign-off and a partner agreement.', 'ধাপে ধাপে পথ: প্রথমে একজন ঋণদাতা শ্যাডো মোডে ফাইলটি পরীক্ষা করবেন; তারপর অংশীদার সহ-অর্থায়ন করবেন; সবশেষে, আইনজীবীর সম্মতি ও অংশীদার চুক্তির পর, ছোট বিনিয়োগকারীরা যুক্ত হবেন।')}</p>
      </Card>
    </div>
  );
}
