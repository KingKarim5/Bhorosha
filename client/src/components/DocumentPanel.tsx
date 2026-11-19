import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { BillImage, BillImageHandle, resizeImage } from './BillImage';
import { ModeBadge, ErrorNote, ProofLabel } from './ui';
import { IconDoc } from './icons';

const FIELD_LABEL: Record<string, { en: string; bn: string }> = {
  document_type: { en: 'Document type', bn: 'কাগজের ধরন' },
  supplier_label: { en: 'Party', bn: 'পক্ষ' },
  date: { en: 'Date', bn: 'তারিখ' },
  amount_bdt: { en: 'Amount (BDT)', bn: 'অঙ্ক (টাকা)' },
  due_date: { en: 'Due date', bn: 'শেষ তারিখ' },
  paid_date: { en: 'Paid date', bn: 'পরিশোধের তারিখ' },
};
const NOTE_LABEL: Record<string, { en: string; bn: string }> = {
  cash_share: { en: 'Cash share of sales', bn: 'নগদ বিক্রির অংশ' },
  margin: { en: 'Margin', bn: 'লাভের হার' },
  seasonal: { en: 'Seasonal', bn: 'মৌসুমি' },
  receivables: { en: 'Receivables', bn: 'পাওনা' },
  concerns: { en: 'Concerns', bn: 'চিন্তা' },
  claims: { en: 'Claims', bn: 'দাবি' },
};

function Bill({ doc, caseId, onChange, canConfirm }: { doc: any; caseId: string; onChange: () => void; canConfirm: boolean }) {
  const { t, pick, n } = useI18n();
  const img = useRef<BillImageHandle>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const x = doc.extracted_json || {};
  const fc = doc.field_confidences || {};
  const cf = doc.confirmed_fields || {};
  const review = new Set(x.fields_needing_review || []);
  const read = async () => {
    setBusy('read');
    setErr(null);
    try {
      const blob = await img.current?.toBlob();
      const form = new FormData();
      if (blob) form.append('image', blob, 'bill.png');
      await api(`/cases/${caseId}/documents/${doc._id}/read`, { form });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const tick = async (field: string, value: unknown, confirmed: boolean) => {
    setBusy(field);
    try {
      await api(`/cases/${caseId}/documents/${doc._id}/confirm`, { body: { field, value, confirmed } });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="card p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-semibold text-[14px] flex items-center gap-1.5">
          <IconDoc /> {t('Bill', 'বিল')} {doc.sample ? `· ${doc.sample.style === 'handwritten' ? t('handwritten', 'হাতে লেখা') : t('printed', 'ছাপা')}` : ''}
        </span>
        <span className="flex items-center gap-2">
          <ModeBadge mode={doc.read_by} />
          <button className="btn !min-h-0 !py-1 text-[13px]" onClick={read} disabled={!!busy}>
            {busy === 'read' ? t('Reading…', 'পড়া হচ্ছে…') : t('Read with AI', 'এআই দিয়ে পড়ুন')}
          </button>
        </span>
      </div>
      <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3">
        {doc.sample ? <BillImage ref={img} template={doc.sample} /> : <div className="text-[13px] text-muted p-3 border border-dashed border-line rounded">{t('Uploaded image (not stored after reading).', 'আপলোড করা ছবি (পড়ার পর রাখা হয় না)।')}</div>}
        <div>
          <table className="w-full text-[13px]">
            <tbody>
              {Object.keys(FIELD_LABEL).map((f, i) => {
                const val = x[f];
                const conf = fc[f] ?? 0;
                const isOn = !!cf[f];
                return (
                  <motion.tr key={f} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 * i }} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2 text-muted align-top">{pick(FIELD_LABEL[f])}</td>
                    <td className="py-1.5 pr-2 align-top">
                      <div className={`${val == null ? 'text-muted italic' : 'font-semibold'} num break-words`}>{val == null ? t('unreadable', 'পড়া যায়নি') : f === 'amount_bdt' ? n(Number(val)) : String(val)}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="h-1 w-12 rounded-full" style={{ background: 'var(--line)' }}>
                          <div className="h-1 rounded-full" style={{ width: `${conf * 100}%`, background: conf < 0.6 ? 'var(--unsure)' : 'var(--checked)' }} />
                        </div>
                        <span className="text-[10.5px] text-muted num">{n(Math.round(conf * 100))}%</span>
                        {review.has(f) && <span className="text-[10.5px] font-semibold" style={{ color: 'var(--unsure)' }}>{t('review', 'যাচাই করুন')}</span>}
                      </div>
                    </td>
                    <td className="py-1.5 align-top text-right">
                      {val != null && (
                        <label className={`inline-flex items-center gap-1 text-[12px] ${canConfirm ? 'cursor-pointer' : 'opacity-60'}`}>
                          <input type="checkbox" className="h-5 w-5 accent-[var(--checked)]" checked={isOn} disabled={!canConfirm || busy === f} onChange={(e) => tick(f, val, e.target.checked)} aria-label={t(`Confirm ${FIELD_LABEL[f].en}`, `${FIELD_LABEL[f].bn} নিশ্চিত করুন`)} />
                          {isOn ? t('ticked', 'টিক') : ''}
                        </label>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11.5px] text-muted mt-1.5">{t('Unticked fields do not count. Ticked fields become checked evidence.', 'টিক না দেওয়া ঘর গোনা হয় না। টিক দেওয়া ঘর যাচাই করা প্রমাণ হয়।')}</p>
        </div>
      </div>
      <ErrorNote msg={err} />
    </motion.div>
  );
}

function Note({ doc, caseId, onChange }: { doc: any; caseId: string; onChange: () => void }) {
  const { t, pick, n } = useI18n();
  const [busy, setBusy] = useState(false);
  const x = doc.extracted_json || {};
  const text = doc.raw_text || doc.sample?.text || '';
  const read = async () => {
    setBusy(true);
    try {
      await api(`/cases/${caseId}/documents/${doc._id}/read`, { method: 'POST' });
      onChange();
    } finally {
      setBusy(false);
    }
  };
  const show = (k: string, v: any) => {
    if (v == null || (Array.isArray(v) && !v.length)) return null;
    if (k === 'cash_share' || k === 'margin') return `${n(Math.round(v * 100))}%`;
    if (k === 'seasonal') return v ? t('yes', 'হ্যাঁ') : t('no', 'না');
    if (k === 'receivables') return v.map((r: any) => `${r.party || '?'}: ${n(r.amount_bdt)} (${n(r.days)} ${t('days', 'দিন')})`).join('; ');
    return v.join('; ');
  };
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="card p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-semibold text-[14px]">{t("Owner's note (Bangla)", 'মালিকের নোট (বাংলা)')}</span>
        <span className="flex items-center gap-2">
          <ModeBadge mode={doc.read_by} />
          <button className="btn !min-h-0 !py-1 text-[13px]" onClick={read} disabled={busy}>
            {busy ? t('Reading…', 'পড়া হচ্ছে…') : t('Read with AI', 'এআই দিয়ে পড়ুন')}
          </button>
        </span>
      </div>
      <blockquote className="text-[14px] leading-relaxed p-2.5 rounded" style={{ background: 'var(--raised)', fontFamily: 'Noto Sans Bengali, sans-serif' }}>
        {text}
      </blockquote>
      <div className="mt-2 space-y-1">
        {Object.keys(NOTE_LABEL).map((k) => {
          const s = show(k, x[k]);
          if (!s) return null;
          return (
            <div key={k} className="flex items-start justify-between gap-2 text-[13px]">
              <span>
                <span className="text-muted">{pick(NOTE_LABEL[k])}:</span> <b>{s}</b>
              </span>
              <ProofLabel label="owner_says" compact />
            </div>
          );
        })}
      </div>
      <p className="text-[11.5px] text-muted mt-1.5">{t('Phone numbers and names are replaced with tokens before the note goes to the AI. Everything from a note stays owner says.', 'নোট এআই-তে যাওয়ার আগে ফোন নম্বর ও নাম টোকেনে বদলানো হয়। নোটের সবকিছু "মালিক বলছেন" থাকে।')}</p>
    </motion.div>
  );
}

export function DocumentPanel({ data, onChange, canConfirm }: { data: any; onChange: () => void; canConfirm: boolean }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const blob = await resizeImage(file);
      const form = new FormData();
      form.append('image', blob, 'bill.jpg');
      form.append('kind', 'bill');
      await api(`/cases/${data.app._id}/documents`, { form });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      {data.docs.map((d: any) => (d.kind === 'bill' ? <Bill key={d._id} doc={d} caseId={data.app._id} onChange={onChange} canConfirm={canConfirm} /> : <Note key={d._id} doc={d} caseId={data.app._id} onChange={onChange} />))}
      <label className="btn w-full justify-center cursor-pointer">
        {busy ? t('Uploading and reading…', 'আপলোড ও পড়া হচ্ছে…') : t('Add a bill photo', 'বিলের ছবি যোগ করুন')}
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      <p className="text-[11.5px] text-muted">{t('Do not upload real documents. Photos are resized in the browser and not stored after reading.', 'আসল কাগজ আপলোড করবেন না। ছবি ব্রাউজারে ছোট করা হয় এবং পড়ার পর রাখা হয় না।')}</p>
      <ErrorNote msg={err} />
    </div>
  );
}
