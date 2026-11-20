import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, Skeleton, Card, Planned } from '../components/ui';

const LEVELS: Record<number, { en: string; bn: string }> = {
  0: { en: 'Level 0 · correctness (unit tests)', bn: 'স্তর ০ · সঠিকতা (ইউনিট টেস্ট)' },
  1: { en: 'Level 1 · synthetic cohort, held-out settings', bn: 'স্তর ১ · কৃত্রিম কোহর্ট, আলাদা রাখা সেটিং' },
  2: { en: 'Level 2 · real outcomes, different setting', bn: 'স্তর ২ · বাস্তব ফলাফল, ভিন্ন প্রেক্ষাপট' },
  3: { en: 'Level 3 · real lender, shadow mode', bn: 'স্তর ৩ · বাস্তব ঋণদাতা, শ্যাডো মোড' },
};

function MetricCard({ m }: { m: any }) {
  const { t, n, pick } = useI18n();
  const planned = m.status === 'planned';
  const fmt = (x: number | null | undefined) => (x == null ? '—' : Math.abs(x) < 10 && !Number.isInteger(x) ? n(x, { digits: 3 }) : n(x, { digits: Number.isInteger(x) ? 0 : 1 }));
  return (
    <div className="card p-4 flex flex-col">
      <div className="flex justify-between items-start gap-2">
        <div className="text-[13px] text-muted">{m.component}</div>
        {planned ? <Planned /> : m.pass != null && <span className="chip" style={{ color: m.pass ? 'var(--checked)' : 'var(--unsure)' }}>{m.pass ? t('meets mark', 'মান পূরণ') : t('below mark', 'মানের নিচে')}</span>}
      </div>
      <div className="font-semibold mt-1">{m.metric}</div>
      {!planned && (
        <div className="mt-2">
          <span className="num text-[28px] font-semibold">{fmt(m.value)}</span>
          {m.ci_low != null && (
            <span className="num text-[13px] text-muted ml-2">
              95% CI {fmt(m.ci_low)}–{fmt(m.ci_high)}
            </span>
          )}
          {m.baseline != null && (
            <div className="num text-[12.5px] text-muted">
              {m.baseline_name}: {fmt(m.baseline)}
            </div>
          )}
        </div>
      )}
      <div className="text-[12px] mt-2 space-y-0.5 text-muted">
        <div>{pick(LEVELS[m.level])}</div>
        {!planned && <div className="num">n = {n(m.sample_size)}</div>}
        {m.pass_mark && <div>{t('Pass mark (set before the first run)', 'পাস মান (প্রথম রানের আগে ঠিক করা)')}: {m.pass_mark}</div>}
      </div>
      <div className="text-[12.5px] mt-2 pt-2 border-t border-line">{m.limitation}</div>
    </div>
  );
}

export default function Evaluation() {
  const { t } = useI18n();
  const { data } = useApi('/evaluation');
  if (!data) return <Skeleton h={300} />;
  const ev = data.eval;
  const metrics: any[] = ev?.metrics || [];
  const groups = [...new Set(metrics.map((m) => m.group))];
  return (
    <div>
      <PageTitle
        title={t('Evaluation', 'মূল্যায়ন')}
        sub={t('Every number shows its level on the evidence ladder, its sample size and its limitation. A model trained and tested on data our own scripts generated proves little: treat very high scores as a warning.', 'প্রতিটি সংখ্যার সাথে প্রমাণের সিঁড়ির স্তর, নমুনার আকার ও সীমাবদ্ধতা। নিজেদের তৈরি তথ্যে প্রশিক্ষিত ও পরীক্ষিত মডেল তেমন কিছু প্রমাণ করে না: খুব বেশি স্কোরকে সতর্কসংকেত ধরুন।')}
      />
      {!ev ? (
        <Card>
          <p>
            <Planned /> {t('No evaluation file yet. Run npm run eval to train on the synthetic cohort and write the results.', 'এখনো মূল্যায়ন ফাইল নেই। কৃত্রিম কোহর্টে প্রশিক্ষণ ও ফলাফল লিখতে npm run eval চালান।')}
          </p>
        </Card>
      ) : (
        <>
          <p className="text-[12.5px] text-muted mb-4 num">
            {t('Run at', 'চালানো হয়েছে')} {ev.run_at} · {t('seed', 'সিড')} {ev.seed} · {t('generator frozen', 'জেনারেটর স্থির')} {ev.generator_version}
          </p>
          {groups.map((g) => (
            <section key={g} className="mb-8">
              <h2 className="font-display text-[20px] font-semibold mb-3">{g}</h2>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {metrics.filter((m) => m.group === g).map((m, i) => (
                  <MetricCard key={i} m={m} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      <Card title={t('What the evaluation cannot show', 'মূল্যায়ন যা দেখাতে পারে না')}>
        <ul className="list-disc pl-5 space-y-1 text-[14px]">
          <li>{t('That Bhorsha works on real Bangladeshi shops. That needs a lender trial (level 3), which is planned, not done.', 'ভরসা বাস্তব বাংলাদেশি দোকানে কাজ করে কিনা। এর জন্য ঋণদাতার পরীক্ষা (স্তর ৩) দরকার, যা পরিকল্পিত, হয়নি।')}</li>
          <li>{t('That the investor side attracts investors or performs.', 'বিনিয়োগকারীর অংশ বিনিয়োগকারী আকর্ষণ করে বা ভালো ফল দেয় কিনা।')}</li>
          <li>{t('That extraction is reliable on real handwritten documents. Published benchmarks on handwritten Bengali records report very high error rates; a reading counts as checked only when it matches the money trail.', 'হাতে লেখা আসল কাগজে পড়া নির্ভরযোগ্য কিনা। হাতে লেখা বাংলা নথিতে প্রকাশিত পরীক্ষায় ভুলের হার খুব বেশি; তাই টাকার হিসাবের সাথে মিললে তবেই যাচাই করা ধরা হয়।')}</li>
        </ul>
      </Card>
    </div>
  );
}
