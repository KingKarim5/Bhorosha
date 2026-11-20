import { useState, ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { ViabilityFile } from '../components/ViabilityFile';
import { DocumentPanel } from '../components/DocumentPanel';
import { Card, ProofLabel, FileSkeleton, ErrorNote, ModeBadge, VerdictChip, VERDICT_WORDS, VerdictKey } from '../components/ui';
import { IconPrint, IconAlert, IconCheck } from '../components/icons';
import { STATUS_WORDS } from './Dashboard';
import { CAUSE_WORDS } from './Cases';
import { BRAND } from '../brand';

function Section({ title, children, open = true, right }: { title: string; children: ReactNode; open?: boolean; right?: ReactNode }) {
  return (
    <details open={open} className="card group">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-2 p-4 font-display text-[16.5px] font-semibold">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          {right}
          <span className="text-muted text-sm transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

const DECISION_WORDS: Record<string, { en: string; bn: string; color: string }> = {
  approved_with_conditions: { en: 'Approved with conditions', bn: 'শর্তসহ অনুমোদিত', color: 'var(--viable)' },
  declined_with_plan: { en: 'Declined, with a plan', bn: 'পরিকল্পনাসহ প্রত্যাখ্যাত', color: 'var(--notviable)' },
  hold_need_evidence: { en: 'On hold: more evidence needed', bn: 'স্থগিত: আরও প্রমাণ দরকার', color: 'var(--unsure)' },
};

export function DecisionHistory({ decisions }: { decisions: any[] }) {
  const { t, pick } = useI18n();
  if (!decisions?.length) return <p className="text-muted text-[14px]">{t('No AI decision yet.', 'এখনো এআই-এর সিদ্ধান্ত হয়নি।')}</p>;
  return (
    <ul className="space-y-2">
      {decisions.map((d: any, i: number) => {
        const w = DECISION_WORDS[d.decision] || { en: d.decision, bn: d.decision, color: 'var(--muted)' };
        return (
          <li key={d._id} className="text-[13.5px] p-2.5 rounded" style={{ background: 'var(--raised)', opacity: i === 0 ? 1 : 0.75 }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip" style={{ color: w.color, borderColor: w.color }}>{pick(w)}</span>
              <span className="text-muted">{d.decided_by}</span>
              <span className="num text-muted">{new Date(d.createdAt).toLocaleString()}</span>
              {i === 0 && <span className="chip !py-0">{t('current', 'বর্তমান')}</span>}
            </div>
            {(d.reasons || []).map((r: any, j: number) => (
              <div key={j} className="mt-1">
                {pick(r)} {r.evidence_ids?.length > 0 && <span className="num text-[11px] text-muted">[{r.evidence_ids.join(', ')}]</span>}
              </div>
            ))}
            {d.legacy_note && <div className="mt-1 text-muted">{d.legacy_note}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function AskFile({ caseId }: { caseId: string }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [a, setA] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setA(await api(`/cases/${caseId}/ask`, { body: { question: q } }));
    } catch (e) {
      setA({ declined: true, answer_en: (e as Error).message, answer_bn: (e as Error).message, cites: [] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="flex gap-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} placeholder={t('e.g. Are supplier payments on time?', 'যেমন: সরবরাহকারীকে কি সময়মতো টাকা দেওয়া হয়?')} />
        <button className="btn" onClick={ask} disabled={busy}>
          {busy ? '…' : t('Ask', 'জিজ্ঞেস')}
        </button>
      </div>
      {a && (
        <div className="mt-3 text-[14px] p-3 rounded" style={{ background: 'var(--raised)' }}>
          <div className="flex justify-between gap-2 mb-1">
            <span className="text-[12px] text-muted">{a.declined ? t('Declined: outside this file', 'উত্তর নেই: এই ফাইলের বাইরে') : t('From this file only', 'শুধু এই ফাইল থেকে')}</span>
            <ModeBadge mode={a.mode} />
          </div>
          {lang === 'bn' ? a.answer_bn : a.answer_en}
          {a.cites?.length > 0 && <div className="num text-[11.5px] text-muted mt-1">[{a.cites.join(', ')}]</div>}
        </div>
      )}
    </div>
  );
}

function memoText(data: any, t: (e: string, b: string) => string) {
  const v = data.verdict;
  const L = (o: any) => o?.en || '';
  return [
    `${BRAND.name} — ${BRAND.taglineEn}`,
    `CREDIT MEMO (draft) — ${data.shop.label}  [SYNTHETIC DEMO DATA]`,
    `1. Borrower and request: ${data.shop.business_type}; ask ${data.app.loan_ask_bdt} BDT over ${data.app.tenor_months} months; purpose: ${data.app.purpose}`,
    `2. Viability file verdict: ${VERDICT_WORDS[v.final_verdict as VerdictKey].en}; likelihood of trading in 12 months ${v.band_low}%–${v.band_high}%; coverage ${v.coverage_pct}%`,
    `3. Key reasons:\n${(v.reasons_json || []).map((r: any, i: number) => `   ${i + 1}. ${r.en}`).join('\n')}`,
    `4. Likely cause: ${L(CAUSE_WORDS[v.cause])}`,
    `5. Conditions:\n${(v.conditions_json || []).map((c: any) => `   - ${c.en}`).join('\n') || '   none'}`,
    `6. Disbursement plan:\n${(v.tranche_plan_json || []).map((x: any) => `   T${x.n}: ${x.amount_bdt} BDT — ${x.release_en}`).join('\n')}`,
    `7. Monitoring: ${(v.watch_list_json || []).map(L).join(' ')}`,
    `8. Limits: ${(v.cannot_tell_json || []).map(L).join(' ')}`,
    `Decided by Bhorsha AI inside the lender's policy. The lender sets the policy, reads the audit log and can pause the AI.`,
  ].join('\n') + (t('', '') || '');
}

export default function CaseDetail() {
  const { id } = useParams();
  const { t, lang, pick, n, digits } = useI18n();
  const { user } = useAuth();
  const { data, error, reload } = useApi(`/cases/${id}`);
  const stmt = useApi(`/cases/${id}/statement`);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (error) return <ErrorNote msg={error} />;
  if (!data) return <FileSkeleton />;
  const v = data.verdict;
  const runAi = async () => {
    setAiBusy(true);
    setAiMsg(null);
    try {
      const r = await api(`/cases/${id}/recompute`, { body: { ai: true } });
      setAiMsg(r.phrased_by === 'ai' ? t('Written by AI and passed the validator.', 'এআই লিখেছে এবং যাচাই পরীক্ষায় উত্তীর্ণ।') : t('AI not available or rejected by the validator twice: template text kept (DEMO FALLBACK).', 'এআই পাওয়া যায়নি বা যাচাইয়ে দুবার বাতিল: টেমপ্লেট লেখা রাখা হলো (DEMO FALLBACK)।'));
      reload();
    } finally {
      setAiBusy(false);
    }
  };
  const lastDecision = data.decisions[0];
  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <Link to="/cases" className="text-[13px] text-muted hover:text-accent">
            ← {t('Cases', 'কেস')}
          </Link>
          <h1 className="font-display text-[28px] font-semibold leading-tight">{data.shop.label}</h1>
          <div className="text-[13.5px] text-muted">
            {pick(STATUS_WORDS[data.app.status])}
            {lastDecision && (
              <>
                {' '}· {t('AI decision', 'এআই-এর সিদ্ধান্ত')}: <b>{pick(DECISION_WORDS[lastDecision.decision] || { en: lastDecision.decision, bn: lastDecision.decision })}</b>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={runAi} disabled={aiBusy}>
            {aiBusy ? t('Cross-checking and writing…', 'মিলিয়ে দেখা ও লেখা হচ্ছে…') : t('Cross-check and write with AI', 'এআই দিয়ে মিলিয়ে দেখুন ও লিখুন')}
          </button>
          <button className="btn" onClick={() => window.print()}>
            <IconPrint /> {t('Print file (A4)', 'ফাইল প্রিন্ট (A4)')}
          </button>
          <button
            className="btn"
            onClick={async () => {
              await navigator.clipboard?.writeText(memoText(data, t));
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? t('Copied', 'কপি হয়েছে') : t('Copy as credit memo', 'ক্রেডিট মেমো হিসেবে কপি')}
          </button>
          <a className="btn" href={`/owner/${data.shop.token}`} target="_blank" rel="noreferrer">
            {t("Owner's copy", 'মালিকের কপি')}
          </a>
        </div>
      </div>
      {aiMsg && <div className="no-print mb-4 text-[13.5px] card p-3">{aiMsg}</div>}
      {(data.app.missing || []).length > 0 && (
        <div className="no-print mb-4 card p-3 text-[13.5px]">
          <b>{t('What to upload next', 'পরবর্তী যা জমা দিতে হবে')}:</b>{' '}
          {data.app.missing
            .map((m: string) => ({ statement_3_months: t('at least 3 months of statement', 'অন্তত ৩ মাসের স্টেটমেন্ট'), statement_12_months: t('12 months of statement', '১২ মাসের স্টেটমেন্ট'), fresh_statement: t('a fresh statement (the current one does not reconcile)', 'নতুন স্টেটমেন্ট (বর্তমানটির ব্যালান্স মেলে না)'), last_year_months: t("last year's months (seasonal business)", 'গত বছরের মাসগুলো (মৌসুমি ব্যবসা)'), supplier_bills: t('one or two supplier bills', 'এক-দুটি সরবরাহকারীর বিল') } as Record<string, string>)[m] || m)
            .join(' · ')}
        </div>
      )}
      <div className="grid xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-6 items-start">
        <div className="xl:sticky xl:top-20">
          <ViabilityFile data={data} />
        </div>
        <div className="no-print space-y-4">
          <Section title={t('Documents and AI reading', 'কাগজপত্র ও এআই-এর পড়া')}>
            <DocumentPanel data={data} onChange={reload} canConfirm={false} />
          </Section>
          <Section title={t('Evidence and proof labels', 'প্রমাণ ও প্রমাণের চিহ্ন')}>
            <ul className="space-y-2">
              {data.evidence.map((e: any) => (
                <li key={e._id} className="flex items-start justify-between gap-3 text-[13.5px]">
                  <span>
                    <span className="num text-[11px] text-muted mr-1.5">{e.eid}</span>
                    {lang === 'bn' ? digits(e.claim_text_bn || e.claim_text) : e.claim_text}
                  </span>
                  <ProofLabel label={e.label} />
                </li>
              ))}
            </ul>
          </Section>
          <Section title={t('Checks and cross-checks', 'পরীক্ষা ও মিলিয়ে দেখা')}>
            <h4 className="label mb-1">{t('Statement consistency (internal consistency only, never proof of authenticity)', 'স্টেটমেন্টের সামঞ্জস্য (শুধু ভেতরের সামঞ্জস্য, আসল কিনা প্রমাণ নয়)')}</h4>
            <ul className="space-y-1.5 mb-3">
              {(v.features_json?.checks || []).map((c: any) => (
                <li key={c.code} className="flex items-start gap-2 text-[13.5px]">
                  <span className="mt-0.5" style={{ color: c.passed ? 'var(--checked)' : c.severity === 'high' ? 'var(--notviable)' : 'var(--unsure)' }}>{c.passed ? <IconCheck /> : <IconAlert />}</span>
                  <span>
                    <b>{pick({ en: c.name_en, bn: c.name_bn })}</b> — {pick({ en: c.detail_en, bn: c.detail_bn })}
                  </span>
                </li>
              ))}
            </ul>
            <h4 className="label mb-1">{t('Cross-document findings (each cites evidence ids)', 'কাগজে-কাগজে মিল-অমিল (প্রতিটির সাথে প্রমাণ আইডি)')}</h4>
            {data.findings.length ? (
              <ul className="space-y-2">
                {data.findings.map((f: any) => (
                  <li key={f._id} className="text-[13.5px] p-2 rounded" style={{ background: 'var(--raised)' }}>
                    <div className="flex justify-between gap-2">
                      <span className="chip" style={{ color: f.severity === 'high' ? 'var(--notviable)' : f.severity === 'medium' ? 'var(--unsure)' : 'var(--muted)' }}>
                        {f.kind} · {f.severity}
                      </span>
                      {f.source === 'ai' ? <ModeBadge mode="ai" /> : <span className="text-[11px] text-muted">{t('rule check', 'নিয়মের পরীক্ষা')}</span>}
                    </div>
                    <div className="mt-1">{lang === 'bn' ? f.text_bn || f.text : f.text}</div>
                    <div className="num text-[11px] text-muted">[{(f.cited_evidence_ids || []).join(', ')}]</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-[13.5px]">{t('No contradictions found between the documents.', 'কাগজগুলোর মধ্যে কোনো অমিল পাওয়া যায়নি।')}</p>
            )}
          </Section>
          <Section title={t('AI decision', 'এআই-এর সিদ্ধান্ত')}>
            <DecisionHistory decisions={data.decisions} />
          </Section>
          <Section title={t('Ask this file', 'এই ফাইলকে জিজ্ঞেস করুন')} open={false}>
            <AskFile caseId={data.app._id} />
          </Section>
          {v.model_contributions_json && (
            <Section title={t('What moved the model', 'মডেলকে কী প্রভাবিত করেছে')} open={false}>
              <p className="text-[12.5px] text-muted mb-2">
                {t('Model probability', 'মডেলের সম্ভাবনা')}: <span className="num">{n(Math.round(v.model_probability * 100))}%</span> · {t('prediction set', 'পূর্বাভাসের সেট')}: {(v.conformal_set || []).map((s: string) => pick(VERDICT_WORDS[s as VerdictKey])).join(' + ') || '—'}
              </p>
              <ul className="space-y-1">
                {v.model_contributions_json.map((c: any) => (
                  <li key={c.feature} className="flex items-center gap-2 text-[13px]">
                    <span className="w-44 shrink-0">{c.feature.replace(/_/g, ' ')}</span>
                    <div className="flex-1 h-2 relative" style={{ background: 'var(--line)' }}>
                      <div className="absolute h-2" style={{ left: c.effect >= 0 ? '50%' : `${50 + Math.max(-50, c.effect * 250)}%`, width: `${Math.min(50, Math.abs(c.effect) * 250)}%`, background: c.effect >= 0 ? 'var(--viable)' : 'var(--notviable)' }} />
                    </div>
                    <span className="num w-14 text-right">{c.effect >= 0 ? '+' : ''}{n(Math.round(c.effect * 100))}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title={t('Statement (latest rows)', 'স্টেটমেন্ট (সাম্প্রতিক সারি)')} open={false}>
            {stmt.data ? (
              <div className="overflow-x-auto max-h-80">
                <p className="text-[12px] text-muted mb-1">
                  {n(stmt.data.total_rows)} {t('rows. Counterparty types are seeded in this demo; real statements would need automatic classification, with unclear rows sent to the owner as questions.', 'সারি। এই ডেমোতে লেনদেনের পক্ষের ধরন আগে থেকে দেওয়া; আসল স্টেটমেন্টে স্বয়ংক্রিয় শ্রেণিবিন্যাস লাগবে, অস্পষ্ট সারি মালিককে প্রশ্ন হিসেবে যাবে।')}
                </p>
                <table className="w-full text-[12.5px] num">
                  <tbody>
                    {stmt.data.rows.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-line">
                        <td className="py-1 pr-2">{String(r.date).slice(0, 10)}</td>
                        <td className="pr-2" style={{ color: r.direction === 'in' ? 'var(--viable)' : 'var(--muted)' }}>{r.direction === 'in' ? '+' : '−'}{n(r.amount_bdt)}</td>
                        <td className="pr-2">{r.counterparty_kind}</td>
                        <td className="pr-2 text-right">{n(r.balance_after_bdt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              '…'
            )}
          </Section>
          <Section title={t('File history and audit trail', 'ফাইলের ইতিহাস ও অডিট')} open={false}>
            <h4 className="label">{t('Verdict versions', 'রায়ের সংস্করণ')}</h4>
            <ul className="mb-3 text-[13px] space-y-0.5">
              {data.history.map((h: any) => (
                <li key={h._id} className="flex items-center gap-2">
                  <span className="num">v{h.version}</span> <VerdictChip verdict={h.final_verdict} /> <span className="num text-muted">{h.band_low}–{h.band_high}%</span> <span className="text-muted">{new Date(h.createdAt).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
            <h4 className="label">{t('Audit log (redacted inputs)', 'অডিট লগ (গোপন তথ্য মুছে)')}</h4>
            <ul className="text-[12.5px] space-y-1 max-h-72 overflow-auto">
              {data.audit.map((a: any) => (
                <li key={a._id} className="border-b border-line pb-1">
                  <span className="num text-muted">{new Date(a.createdAt).toLocaleTimeString()}</span> · <b>{a.action}</b> · {a.actor} {a.mode && <span className="chip !py-0 ml-1">{a.mode}</span>}
                  {a.redacted_payload_json?.reason && <span className="text-muted"> — {a.redacted_payload_json.reason}</span>}
                </li>
              ))}
            </ul>
          </Section>
          <Section title={t('More evidence (planned)', 'আরও প্রমাণ (পরিকল্পিত)')} open={false}>
            <div className="flex flex-wrap gap-2">
              <Link className="btn" to={`/cases/${id}/field-visit`}>{t('Field visit checklist', 'সরেজমিন পরিদর্শন')}</Link>
              <Link className="btn" to={`/cases/${id}/counterparty`}>{t('Counterparty confirmation', 'ক্রেতা/সরবরাহকারীর নিশ্চিতকরণ')}</Link>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
