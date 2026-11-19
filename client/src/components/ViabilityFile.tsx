import { motion } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { VerdictTag, ProofLabel, ProofSummary, CoverageRing, ModeBadge, VerdictKey } from './ui';
import { RunwayChart } from './RunwayChart';
import { CAUSE_WORDS } from '../pages/Cases';
import { useReducedMotion } from '../lib/hooks';
import { IconAlert } from './icons';

const sec = (i: number, reduce: boolean) => ({ initial: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: reduce ? 0 : 0.08 * i, duration: 0.3 } });

export function ViabilityFile({ data }: { data: any }) {
  const { t, n, pick, bdt, lang, digits } = useI18n();
  const reduce = !!useReducedMotion();
  const { app, shop, verdict: v, evidence } = data;
  const ev: Record<string, any> = Object.fromEntries((evidence || []).map((e: any) => [e.eid, e]));
  const checked = (evidence || []).filter((e: any) => e.label === 'checked').length;
  const dis = v.disagreement_text ? JSON.parse(v.disagreement_text) : null;
  const monthly = (v.features_json?.monthly || []).map((m: any) => ({ month: m.month, value: m.inflow }));
  const H = ({ children }: { children: React.ReactNode }) => <h3 className="font-display text-[15px] font-semibold mt-4 mb-1.5 pb-1 border-b" style={{ borderColor: 'var(--line)' }}>{children}</h3>;
  const statusTxt = (s: string) => (s === 'pass' ? t('Pass', 'উত্তীর্ণ') : s === 'fail' ? t('Fail', 'ব্যর্থ') : t('Unknown', 'অজানা'));
  return (
    <article className="sheet p-5 md:p-8 text-[14.5px]" aria-label={t('Viability file', 'টেকসইতার ফাইল')}>
      <div className="print-ribbon">SYNTHETIC DEMO DATA. Not real borrowers, not a real lending decision. · কৃত্রিম ডেমো তথ্য</div>
      <motion.header {...sec(0, reduce)} className="flex flex-wrap justify-between gap-3">
        <div>
          <div className="text-[11.5px] uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>
            {t('Viability file', 'টেকসইতার ফাইল')} · v{n(v.version)} · {v.verdict_source === 'model_hybrid' ? t('rules + model', 'নিয়ম + মডেল') : t('rules only', 'শুধু নিয়ম')}
          </div>
          <h2 className="font-display text-[26px] font-semibold leading-tight mt-1">{shop.label}</h2>
          <div className="text-[13.5px]" style={{ color: 'var(--muted)' }}>
            {shop.business_type?.replace(/_/g, ' ')} · {t('trading', 'ব্যবসার বয়স')} {n(shop.months_trading)} {t('months', 'মাস')} · {t('asks', 'চাহিদা')} <b className="num">{bdt(app.loan_ask_bdt)}</b> {t('over', '')} {n(app.tenor_months)} {t('months', 'মাসে')}
          </div>
          <div className="text-[13px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {t('Purpose', 'উদ্দেশ্য')}: {app.purpose || '—'}
          </div>
        </div>
      </motion.header>

      <motion.section {...sec(1, reduce)} className="mt-4">
        <VerdictTag verdict={v.final_verdict as VerdictKey} low={v.band_low} high={v.band_high} />
        {dis && (
          <div className="mt-3 rounded-md px-3 py-2 text-[13.5px] flex gap-2" style={{ background: 'color-mix(in oklab, var(--unsure) 14%, transparent)' }} role="note">
            <IconAlert className="shrink-0 mt-0.5" style={{ color: 'var(--unsure)' }} />
            <span>
              <b>{t('Rules and model disagree.', 'নিয়ম ও মডেল একমত নয়।')}</b> {pick(dis)}
            </span>
          </div>
        )}
        <p className="mt-3 leading-relaxed">
          {lang === 'bn' ? digits(v.text_bn) : v.text_en} <ModeBadge mode={v.phrased_by === 'ai' ? 'ai' : v.phrased_by === 'demo_fallback' ? 'demo_fallback' : 'template'} />
        </p>
      </motion.section>

      <motion.section {...sec(2, reduce)} className="grid sm:grid-cols-[auto_1fr] gap-5 items-center mt-4 print-full">
        <CoverageRing pct={v.coverage_pct} size={96} />
        <div>
          <ProofSummary checked={checked} total={(evidence || []).length} />
          <div className="mt-2">
            <RunwayChart points={monthly} height={150} label={t('Monthly visible sales', 'মাসিক দৃশ্যমান বিক্রি')} />
          </div>
        </div>
      </motion.section>

      <motion.section {...sec(3, reduce)}>
        <H>{t('Three reasons', 'তিনটি কারণ')}</H>
        <ol className="space-y-2">
          {(v.reasons_json || []).map((r: any, i: number) => (
            <li key={i} className="grid grid-cols-[1fr_auto] gap-3 items-start">
              <span>
                <span className="num mr-1.5" style={{ color: 'var(--muted)' }}>{n(i + 1)}.</span>
                {pick(r)}
                {(r.cites || []).length > 0 && <span className="num text-[11px] ml-1" style={{ color: 'var(--muted)' }}>[{r.cites.join(', ')}]</span>}
              </span>
              <span className="flex flex-col gap-1 items-end">
                {[...new Set((r.cites || []).map((c: string) => ev[c]?.label).filter(Boolean))].map((l: any) => (
                  <ProofLabel key={l} label={l} />
                ))}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-2 text-[13.5px]">
          <b>{t('Likely cause', 'সম্ভাব্য কারণ')}:</b> {pick(CAUSE_WORDS[v.cause])}
        </div>
      </motion.section>

      <div className="grid md:grid-cols-2 gap-x-6 print-full">
        <motion.section {...sec(4, reduce)}>
          <H>{t('Conditions for approval', 'অনুমোদনের শর্ত')}</H>
          {(v.conditions_json || []).length ? (
            <ul className="space-y-1.5 list-disc pl-5">
              {v.conditions_json.map((c: any) => (
                <li key={c.key}>
                  {pick(c)}
                  {c.kind === 'counterfactual' && <span className="text-[11px] ml-1" style={{ color: 'var(--muted)' }}>({t('moves the verdict', 'রায় বদলায়')})</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--muted)' }}>{t('No extra conditions.', 'অতিরিক্ত শর্ত নেই।')}</p>
          )}
          {(v.counterfactuals_json || []).some((c: any) => c.partial) && (
            <p className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>{t('No single realistic change reaches the next verdict; these move the file closest to it.', 'কোনো একক বাস্তব পরিবর্তনে পরের রায়ে পৌঁছানো যায় না; এগুলো সবচেয়ে কাছে নেয়।')}</p>
          )}
          <H>{t('Suggested release in parts', 'ধাপে ধাপে ছাড়ের প্রস্তাব')}</H>
          <ol className="space-y-1">
            {(v.tranche_plan_json || []).map((tr: any) => (
              <li key={tr.n} className="grid grid-cols-[auto_1fr] gap-2">
                <span className="num font-semibold">{bdt(tr.amount_bdt)}</span>
                <span className="text-[13px]" style={{ color: 'var(--muted)' }}>{lang === 'bn' ? tr.release_bn : tr.release_en}</span>
              </li>
            ))}
          </ol>
        </motion.section>
        <motion.section {...sec(5, reduce)}>
          <H>{t('Recovery plan', 'ঘুরে দাঁড়ানোর পরিকল্পনা')}</H>
          <ul className="space-y-1.5 list-disc pl-5">
            {(v.recovery_plan_json || []).map((p: any, i: number) => (
              <li key={i}>{pick(p)}</li>
            ))}
          </ul>
          <H>{t('Watch list', 'নজরে রাখার বিষয়')}</H>
          <ul className="space-y-1 list-disc pl-5 text-[13.5px]">
            {(v.watch_list_json || []).map((p: any, i: number) => (
              <li key={i}>{pick(p)}</li>
            ))}
          </ul>
          <H>{t('Refinance fit check', 'রিফাইন্যান্স উপযোগিতা')}</H>
          <ul className="text-[13px] space-y-0.5">
            {(v.refinance_json || []).map((r: any) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span>{pick(r)}</span>
                <span className="font-semibold" style={{ color: r.status === 'pass' ? 'var(--viable)' : r.status === 'fail' ? 'var(--notviable)' : 'var(--muted)' }}>
                  {statusTxt(r.status)}
                </span>
              </li>
            ))}
          </ul>
        </motion.section>
      </div>

      <motion.section {...sec(6, reduce)} className="mt-5 rounded-md p-3.5" style={{ border: '1.5px solid var(--paper-ink)' }}>
        <h3 className="font-display text-[15px] font-semibold">{t('What this cannot tell you', 'এই ফাইল যা বলতে পারে না')}</h3>
        <ul className="mt-1 space-y-1 list-disc pl-5 text-[13.5px]">
          {(v.cannot_tell_json || []).map((c: any, i: number) => (
            <li key={i}>{pick(c)}</li>
          ))}
        </ul>
      </motion.section>
      <p className="mt-3 text-[12px] italic" style={{ color: 'var(--muted)' }}>
        {t('Advice for the manager. The decision is yours. Bhorsha does not approve loans.', 'ম্যানেজারের জন্য পরামর্শ। সিদ্ধান্ত আপনার। ভরসা ঋণ অনুমোদন করে না।')}
      </p>
    </article>
  );
}
