import { useState } from 'react';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { PageTitle, Skeleton, Card, Planned } from '../components/ui';

const LEVELS: Record<number, { en: string; bn: string }> = {
  0: { en: 'Level 0 · correctness (unit tests)', bn: 'স্তর ০ · সঠিকতা (ইউনিট টেস্ট)' },
  1: { en: 'Level 1 · synthetic cohort, held-out settings', bn: 'স্তর ১ · কৃত্রিম কোহর্ট, আলাদা রাখা সেটিং' },
  2: { en: 'Level 2 · real outcomes, different setting', bn: 'স্তর ২ · বাস্তব ফলাফল, ভিন্ন প্রেক্ষাপট' },
  3: { en: 'Level 3 · real lender, shadow mode', bn: 'স্তর ৩ · বাস্তব ঋণদাতা, শ্যাডো মোড' },
};
const EVIDENCE: Record<string, { en: string; bn: string; color: string }> = {
  synthetic: { en: 'Synthetic', bn: 'কৃত্রিম', color: 'var(--unsure)' },
  public_real: { en: 'Public real data', bn: 'প্রকাশ্য বাস্তব তথ্য', color: 'var(--checked)' },
  planned: { en: 'Planned', bn: 'পরিকল্পিত', color: 'var(--muted)' },
};
const SEG: Record<string, { en: string; bn: string }> = {
  all: { en: 'All', bn: 'সব' },
  pooled: { en: 'Pooled', bn: 'সব মিলিয়ে' },
  cash_led: { en: 'Cash-led', bn: 'নগদ-নির্ভর' },
  hybrid: { en: 'Hybrid', bn: 'মিশ্র' },
  digital_first: { en: 'Digital-first', bn: 'ডিজিটাল' },
  online: { en: 'Online (hybrid + digital)', bn: 'অনলাইন (মিশ্র + ডিজিটাল)' },
};

function MetricCard({ m }: { m: any }) {
  const { t, n, pick } = useI18n();
  const planned = m.status === 'planned';
  const ev = EVIDENCE[m.evidence || (planned ? 'planned' : 'synthetic')];
  const fmt = (x: number | null | undefined) => (x == null ? '—' : Math.abs(x) < 10 && !Number.isInteger(x) ? n(x, { digits: 3 }) : n(x, { digits: Number.isInteger(x) ? 0 : 1 }));
  return (
    <div className="card p-4 flex flex-col">
      <div className="flex justify-between items-start gap-2 flex-wrap">
        <div className="text-[13px] text-muted">{m.component}</div>
        <div className="flex gap-1.5 flex-wrap">
          {m.segment && m.segment !== 'pooled' && <span className="chip">{pick(SEG[m.segment] || { en: m.segment, bn: m.segment })}</span>}
          <span className="chip" style={{ color: ev.color }}>{pick(ev)}</span>
          {planned ? <Planned /> : m.pass != null && <span className="chip" style={{ color: m.pass ? 'var(--checked)' : 'var(--notviable)' }}>{m.pass ? t('meets mark', 'মান পূরণ') : t('below mark', 'মানের নিচে')}</span>}
        </div>
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
        <div>
          {pick(LEVELS[m.level] || LEVELS[1])}
          {m.test ? ` · ${m.test}` : ''}
        </div>
        {!planned && <div className="num">n = {n(m.sample_size)}</div>}
        {m.pass_mark && <div>{t('Pass mark (fixed in EVAL_PROTOCOL.md)', 'পাস মান (EVAL_PROTOCOL.md-তে নির্ধারিত)')}: {m.pass_mark}</div>}
      </div>
      <div className="text-[12.5px] mt-2 pt-2 border-t border-line">{m.limitation}</div>
    </div>
  );
}

function Statements() {
  const { t } = useI18n();
  return (
    <Card title={t('Read these before the numbers', 'সংখ্যার আগে এগুলো পড়ুন')} className="mb-6">
      <ul className="list-disc pl-5 space-y-1 text-[14px]">
        <li>{t('Every result here is synthetic unless its card says "Public real data". No real borrower, lender or outcome is behind them.', 'কার্ডে "প্রকাশ্য বাস্তব তথ্য" না লেখা থাকলে এখানের প্রতিটি ফল কৃত্রিম। পেছনে কোনো আসল ঋণগ্রহীতা, ঋণদাতা বা ফলাফল নেই।')}</li>
        <li>{t('The hybrid generator rests on assumptions (online share, courier fees, payout lag, returns, festival lift) that are written in EVAL_PROTOCOL.md and not yet checked against real hybrid sellers.', 'মিশ্র দোকানের জেনারেটর কিছু অনুমানের ওপর দাঁড়ানো (অনলাইন অংশ, কুরিয়ার ফি, টাকা আসার দেরি, ফেরত, উৎসবের চাপ), যা EVAL_PROTOCOL.md-তে লেখা এবং আসল বিক্রেতার সাথে এখনো মেলানো হয়নি।')}</li>
        <li>{t('Courier settlement and order log formats are our own guess; real Pathao, RedX, Steadfast or Paperfly exports are unconfirmed.', 'কুরিয়ার সেটেলমেন্ট ও অর্ডার লগের ফরম্যাট আমাদের অনুমান; আসল Pathao, RedX, Steadfast বা Paperfly এক্সপোর্টের সাথে মেলানো হয়নি।')}</li>
        <li>{t('A fail-safe design holds files it is unsure about, so some healthy shops are held. Which segment is held more often is measured in T3 below and reported as a trade-off, not hidden.', 'নিরাপদ নকশা অনিশ্চিত ফাইল আটকে রাখে, তাই কিছু ভালো দোকানও আটকে যায়। কোন ধরনের দোকান বেশি আটকায় তা নিচে T3-এ মাপা হয়েছে এবং লুকানো হয়নি, একটি বিনিময় হিসেবে জানানো হয়েছে।')}</li>
      </ul>
    </Card>
  );
}

export default function Evaluation() {
  const { t, pick } = useI18n();
  const { data } = useApi('/evaluation');
  const [seg, setSeg] = useState('all');
  const [showPrev, setShowPrev] = useState(false);
  if (!data) return <Skeleton h={300} />;
  const ev = data.eval;
  const all: any[] = ev?.metrics || [];
  const metrics = seg === 'all' ? all : all.filter((m) => (m.segment || 'pooled') === seg);
  const groups = [...new Set(metrics.map((m) => m.group))];
  const marked = all.filter((m) => m.pass != null);
  const passed = marked.filter((m) => m.pass).length;
  const below = marked.filter((m) => !m.pass);
  const prev: any[] = Array.isArray(ev?.previous) ? ev.previous : ev?.previous ? [ev.previous] : [];
  return (
    <div>
      <PageTitle
        title={t('Evaluation', 'মূল্যায়ন')}
        sub={t('Every number shows its evidence level, segment, sample size and limitation. A model trained and tested on data our own scripts generated proves little: treat very high scores as a warning.', 'প্রতিটি সংখ্যার সাথে প্রমাণের স্তর, দোকানের ধরন, নমুনার আকার ও সীমাবদ্ধতা। নিজেদের তৈরি তথ্যে প্রশিক্ষিত ও পরীক্ষিত মডেল তেমন কিছু প্রমাণ করে না: খুব বেশি স্কোরকে সতর্কসংকেত ধরুন।')}
      />
      <Statements />
      {!ev ? (
        <Card>
          <p>
            <Planned /> {t('No evaluation file yet. Run npm run eval to generate the cohort, train and write the results.', 'এখনো মূল্যায়ন ফাইল নেই। কোহর্ট তৈরি, প্রশিক্ষণ ও ফলাফল লিখতে npm run eval চালান।')}
          </p>
        </Card>
      ) : (
        <>
          <div className="card p-4 mb-4 text-[13.5px] space-y-1">
            <div>
              {t('Protocol', 'প্রোটোকল')}: <span className="font-semibold">EVAL_PROTOCOL.md</span>{' '}
              {ev.protocol?.hash ? (
                <>
                  {t('committed at', 'কমিট')} <code className="num">{ev.protocol.hash.slice(0, 10)}</code>
                  {ev.protocol.date ? <span className="text-muted num"> · {ev.protocol.date}</span> : null}
                </>
              ) : (
                <span className="text-muted">{t('(hash unavailable: not a git checkout)', '(হ্যাশ পাওয়া যায়নি)')}</span>
              )}
              . {t('Pass marks were written there before any run and are never changed.', 'পাস মান কোনো রানের আগে সেখানে লেখা, কখনো বদলানো হয় না।')}
            </div>
            <div className="text-muted num break-words [overflow-wrap:anywhere]">
              {t('Run at', 'চালানো হয়েছে')} {ev.run_at} · {t('seed', 'সিড')} {ev.seed} · {t('generator', 'জেনারেটর')} {ev.generator_version}
              {ev.segment_counts_test ? ` · ${t('test shops', 'পরীক্ষার দোকান')}: ${Object.entries(ev.segment_counts_test).map(([k, v]) => `${pick(SEG[k] || { en: k, bn: k })} ${v}`).join(', ')}` : ''}
            </div>
            <div>
              <span className="font-semibold">{passed}</span> {t('of', 'এর মধ্যে')} {marked.length} {t('results with a pass mark meet it.', 'পাস-মানসহ ফল মান পূরণ করেছে।')}{' '}
              {below.length > 0 && <span style={{ color: 'var(--notviable)' }}>{t('Below mark', 'মানের নিচে')}: {below.map((m) => `${m.test || ''} ${m.metric}${m.segment && m.segment !== 'pooled' ? ` (${pick(SEG[m.segment] || { en: m.segment, bn: m.segment })})` : ''}`).join('; ')}.</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            {['all', 'pooled', 'cash_led', 'hybrid', 'digital_first', 'online'].map((k) => (
              <button key={k} className={`chip ${seg === k ? 'font-semibold' : ''}`} style={seg === k ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setSeg(k)}>
                {pick(SEG[k])}
              </button>
            ))}
          </div>
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
          {ev.fairness?.scenarios && (
            <Card title={t('T14 · Fairness (attributes never used as inputs)', 'T14 · ন্যায্যতা (এই বৈশিষ্ট্য কখনো ইনপুট নয়)')} className="mb-8">
              <div className="grid md:grid-cols-2 gap-4">
                {ev.fairness.scenarios.map((f: any) => (
                  <div key={f.name} className="text-[13.5px]">
                    <div className="font-semibold">{f.title}</div>
                    <div className="text-muted text-[12.5px]">{f.description}</div>
                    <div className="num mt-1">
                      {t('Approval-rate gap', 'অনুমোদনের হারের ফারাক')}: {f.approval_gap_pct} {t('points', 'পয়েন্ট')} · {t('Equal-opportunity difference', 'সমান সুযোগের ফারাক')}: {f.equal_opportunity_diff_pct} {t('points', 'পয়েন্ট')} · n = {f.n}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[12.5px] mt-3 pt-2 border-t border-line">{ev.fairness.note}</p>
            </Card>
          )}
          {prev.length > 0 && (
            <section className="mb-8">
              <button className="btn" onClick={() => setShowPrev((x) => !x)}>
                {showPrev ? t('Hide superseded runs', 'পুরনো রান লুকান') : t(`Show superseded runs (${prev.map((p) => p.generator_version).join(', ')})`, `পুরনো রান দেখুন (${prev.map((p) => p.generator_version).join(', ')})`)}
              </button>
              {showPrev &&
                prev.map((p) => (
                  <div key={p.generator_version} className="mt-4">
                    <h3 className="font-semibold mb-1">
                      {p.generator_version} <span className="text-muted text-[13px] num">· {p.run_at}</span>
                    </h3>
                    <p className="text-[12.5px] text-muted mb-2">{t('Kept unchanged so the change of generator can be checked. Not the current result.', 'জেনারেটর বদলের হিসাব রাখতে অপরিবর্তিত রাখা। এটি বর্তমান ফল নয়।')}</p>
                    <div className="overflow-x-auto">
                      <table className="text-[12.5px] w-full">
                        <tbody>
                          {p.metrics.map((m: any, i: number) => (
                            <tr key={i} className="border-t border-line">
                              <td className="py-1 pr-2 text-muted">{m.test || m.group}</td>
                              <td className="py-1 pr-2">{m.metric}</td>
                              <td className="py-1 pr-2 text-muted">{m.segment || 'pooled'}</td>
                              <td className="py-1 num">{m.value == null ? '—' : typeof m.value === 'number' ? Math.round(m.value * 1000) / 1000 : m.value}</td>
                              <td className="py-1 pl-2">{m.pass === true ? '✓' : m.pass === false ? '✗' : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
            </section>
          )}
        </>
      )}
      <Card title={t('What the evaluation cannot show', 'মূল্যায়ন যা দেখাতে পারে না')}>
        <ul className="list-disc pl-5 space-y-1 text-[14px]">
          <li>{t('That Bhorsha works on real Bangladeshi shops. That needs a lender trial (level 3), which is planned, not done.', 'ভরসা বাস্তব বাংলাদেশি দোকানে কাজ করে কিনা। এর জন্য ঋণদাতার পরীক্ষা (স্তর ৩) দরকার, যা পরিকল্পিত, হয়নি।')}</li>
          <li>{t('That the hybrid generator matches real hybrid sellers, or that our courier formats match real exports.', 'মিশ্র জেনারেটর আসল বিক্রেতার মতো কিনা, বা আমাদের কুরিয়ার ফরম্যাট আসল এক্সপোর্টের মতো কিনা।')}</li>
          <li>{t('That the investor side attracts investors or performs.', 'বিনিয়োগকারীর অংশ বিনিয়োগকারী আকর্ষণ করে বা ভালো ফল দেয় কিনা।')}</li>
          <li>{t('That extraction is reliable on real handwritten documents. A reading counts as checked only when it matches the money trail.', 'হাতে লেখা আসল কাগজে পড়া নির্ভরযোগ্য কিনা। টাকার হিসাবের সাথে মিললে তবেই যাচাই করা ধরা হয়।')}</li>
        </ul>
      </Card>
    </div>
  );
}
