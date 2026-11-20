import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useApi } from '../lib/hooks';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { Skeleton, ErrorNote } from '../components/ui';
import { resizeImage } from '../components/BillImage';
import { IconVolume, IconDoc } from '../components/icons';

const DECISION_COLORS: Record<string, string> = { approved_with_conditions: 'var(--viable)', declined_with_plan: 'var(--notviable)', hold_need_evidence: 'var(--unsure)' };
const DECISION_WORDS: Record<string, { en: string; bn: string }> = {
  approved_with_conditions: { en: 'Approved with conditions', bn: 'শর্তসহ অনুমোদিত' },
  declined_with_plan: { en: 'Not this time, with a plan', bn: 'এবার নয়, পরিকল্পনাসহ' },
  hold_need_evidence: { en: 'On hold: more evidence needed', bn: 'স্থগিত: আরও প্রমাণ দরকার' },
};

// The owner's private page: plain Bangla, no login, no internal scoring detail.
const MSG_KIND: Record<string, { en: string; bn: string; color: string }> = {
  receipt: { en: 'Receipt', bn: 'রসিদ', color: '#2f8f6b' },
  late_notice: { en: 'Late payment', bn: 'দেরিতে পরিশোধ', color: '#b7791f' },
  settlement_quote: { en: 'Early-settlement quote', bn: 'আগাম শোধের হিসাব', color: '#2b6cb0' },
  watchman: { en: 'Check-in', bn: 'খোঁজখবর', color: '#b7791f' },
  offer: { en: 'Offer', bn: 'প্রস্তাব', color: '#2f8f6b' },
};

export default function Owner() {
  const { token } = useParams();
  const { t, lang, pick, digits } = useI18n();
  const { data, error, setData, reload } = useApi(`/owner/${token}`);
  const [speaking, setSpeaking] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [files, setFiles] = useState<{ statement_csv?: string; courier_csv?: string; orders_csv?: string; note_text?: string }>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  if (error) return <div className="px-4 py-8 max-w-xl mx-auto"><ErrorNote msg={error} /></div>;
  if (!data) return <div className="px-4 py-8 max-w-xl mx-auto"><Skeleton h={300} /></div>;
  const L = (o: any) => digits((lang === 'bn' ? o?.bn : o?.en) || '');
  const d = data.decision;
  const color = d ? DECISION_COLORS[d.decision] : 'var(--muted)';

  const speak = () => {
    const s = window.speechSynthesis;
    if (!s) return;
    if (speaking) {
      s.cancel();
      setSpeaking(false);
      return;
    }
    const text = [data.shop, L(data.headline), ...data.why.map(L), ...data.fix.map(L), ...data.questions.filter((q: any) => q.status === 'open').map((q: any) => (lang === 'bn' ? q.question_bn : q.question_en))].join('। ');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'bn' ? 'bn-BD' : 'en-US';
    u.rate = 0.92;
    const voice = s.getVoices().find((v) => v.lang.startsWith(lang === 'bn' ? 'bn' : 'en'));
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking(false);
    s.speak(u);
    setSpeaking(true);
  };
  const answer = async (qid: string) => {
    if (!answers[qid] || answers[qid].trim().length < 2) return;
    setBusy(qid);
    setErr(null);
    try {
      setData(await api(`/owner/${token}/questions/${qid}/answer`, { body: { answer: answers[qid] } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const resubmit = async () => {
    setBusy('resubmit');
    setErr(null);
    setDone(null);
    try {
      const r = await api(`/owner/${token}/resubmit`, { body: files });
      setData(r.view);
      setFiles({});
      setNames({});
      setDone(r.added.length ? t(`Added: ${r.added.join(', ')}. Your file was read again.`, `যোগ হয়েছে: ${r.added.join(', ')}। আপনার ফাইল আবার পড়া হয়েছে।`) : t('Your file was read again.', 'আপনার ফাইল আবার পড়া হয়েছে।'));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const uploadBill = async (file: File) => {
    setBusy('bill');
    try {
      const blob = await resizeImage(file);
      const form = new FormData();
      form.append('image', blob, 'bill.jpg');
      form.append('kind', 'bill');
      await api(`/owner/${token}/documents`, { form });
      await reload();
      setDone(t('Bill added and your file was read again.', 'বিল যোগ হয়েছে এবং আপনার ফাইল আবার পড়া হয়েছে।'));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const csvPicker = (key: 'statement_csv' | 'courier_csv' | 'orders_csv', label: string) => (
    <label className="btn w-full justify-center cursor-pointer text-[15px]">
      <IconDoc /> {names[key] || label}
      <input
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            const text = await f.text();
            setFiles((x) => ({ ...x, [key]: text }));
            setNames((x) => ({ ...x, [key]: f.name }));
          }
        }}
      />
    </label>
  );
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-[21px] font-semibold mt-8 mb-2" style={{ fontFamily: 'Noto Serif Bengali, serif' }}>
      {children}
    </h2>
  );
  return (
    <main className="px-4 py-6 max-w-xl mx-auto">
      <div className="card p-6 md:p-8" style={{ background: 'var(--paper)', color: 'var(--paper-ink)' }}>
        <p className="text-[14px]" style={{ color: '#5b6f6b' }}>{t('Your loan file', 'আপনার ঋণের ফাইল')}</p>
        <h1 className="text-[30px] font-semibold mt-1" style={{ fontFamily: 'Noto Serif Bengali, serif' }}>
          {data.shop}
        </h1>
        {d && (
          <span className="chip mt-3 !text-[15px] !py-1 !px-3" style={{ color, borderColor: color, background: 'transparent' }}>
            {pick(DECISION_WORDS[d.decision])}
          </span>
        )}
        <p className="text-[21px] mt-3 leading-[1.75]">{L(data.headline)}</p>
        {d && <p className="text-[13px] mt-1" style={{ color: '#5b6f6b' }}>{t('Decided by Bhorsha AI inside the lender’s policy.', 'ঋণদাতার নীতির ভেতরে ভরসা এআই-এর সিদ্ধান্ত।')} {new Date(d.at).toLocaleDateString()}</p>}
        <button className="btn mt-4 text-[16px]" onClick={speak} aria-pressed={speaking}>
          <IconVolume /> {speaking ? t('Stop', 'থামুন') : t('Read aloud', 'জোরে পড়ে শোনান')}
        </button>

        {data.why.length > 0 && (
          <>
            <H>{t('Why', 'কেন')}</H>
            <ul className="space-y-2 text-[18px] leading-[1.75]">
              {data.why.map((x: any, i: number) => (
                <li key={i} className="flex gap-3"><span className="text-accent">•</span><span>{L(x)}</span></li>
              ))}
            </ul>
          </>
        )}
        {data.fix.length > 0 && (
          <>
            <H>{d?.decision === 'approved_with_conditions' ? t('Conditions', 'শর্ত') : t('What to do next', 'এখন কী করবেন')}</H>
            <ul className="space-y-2 text-[18px] leading-[1.75]">
              {data.fix.map((x: any, i: number) => (
                <li key={i} className="flex gap-3"><span className="text-accent">{i + 1}.</span><span>{L(x)}</span></li>
              ))}
            </ul>
          </>
        )}
        {data.counter_offer && (
          <div className="rounded-lg p-4 mt-6" style={{ background: 'rgba(224,178,79,0.12)', border: '1px solid #e2c27a' }}>
            <h2 className="text-[21px] font-semibold" style={{ fontFamily: 'Noto Serif Bengali, serif' }}>{t('What the lender can offer', 'ঋণদাতা যা দিতে পারেন')}</h2>
            <div className="grid grid-cols-3 gap-2 my-3 text-center">
              {[[t('Amount', 'অঙ্ক'), `৳ ${digits(data.counter_offer.amount_bdt.toLocaleString('en-IN'))}`], [t('Months', 'মাস'), digits(String(data.counter_offer.tenor_months))], [t('Monthly', 'মাসিক কিস্তি'), `৳ ${digits(data.counter_offer.installment_bdt.toLocaleString('en-IN'))}`]].map(([k, v]) => (
                <div key={k}><div className="text-[13px]" style={{ color: '#5b6f6b' }}>{k}</div><div className="num text-[19px] font-semibold">{v}</div></div>
              ))}
            </div>
            <p className="text-[16px] leading-[1.7]">{digits(lang === 'bn' ? data.counter_offer.text_bn : data.counter_offer.text_en)}</p>
            <button
              className="btn btn-primary mt-3 text-[16px]"
              disabled={busy === 'counter'}
              onClick={async () => {
                setBusy('counter');
                setErr(null);
                try {
                  setData(await api(`/owner/${token}/counter-offer/accept`, { method: 'POST' }));
                  setDone(t('Accepted. Your file was read again with the new amount.', 'গ্রহণ করা হয়েছে। নতুন অঙ্কে আপনার ফাইল আবার পড়া হয়েছে।'));
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === 'counter' ? '…' : t('Accept this offer', 'এই প্রস্তাব গ্রহণ করুন')}
            </button>
          </div>
        )}
        {data.loan && (
          <>
            <H>{t('Your repayments', 'আপনার কিস্তি')}</H>
            <p className="text-[15px]" style={{ color: '#5b6f6b' }}>{t(`Loan ${data.loan.ref}: quote this reference when you pay by bKash or bank.`, `ঋণ ${data.loan.ref}: বিকাশ বা ব্যাংকে টাকা পাঠানোর সময় এই রেফারেন্স লিখুন।`)}</p>
            <div className="h-2 rounded mt-2" style={{ background: '#e2daca' }}><div className="h-2 rounded" style={{ width: `${(data.loan.paid_bdt / data.loan.total_bdt) * 100}%`, background: 'var(--accent)' }} /></div>
            <p className="text-[16px] mt-2">
              {t('Paid', 'পরিশোধ')} <b className="num">৳ {digits(data.loan.paid_bdt.toLocaleString('en-IN'))}</b> {t('of', 'মোট')} <span className="num">৳ {digits(data.loan.total_bdt.toLocaleString('en-IN'))}</span>.
              {data.loan.next_due && <> {t('Next', 'পরের কিস্তি')}: <b className="num">৳ {digits((data.loan.next_due.amount_bdt - data.loan.next_due.paid_bdt).toLocaleString('en-IN'))}</b> {t('by', 'তারিখ')} <span className="num">{digits(data.loan.next_due.due_date)}</span>.</>}
            </p>
            {data.loan.early_offer && (
              <p className="text-[16px] mt-2 rounded-lg p-3" style={{ background: 'rgba(47,143,107,0.12)' }}>
                {t(`Pay your next instalment by ${data.loan.early_offer.pay_by} and pay only ৳ ${data.loan.early_offer.pay_bdt.toLocaleString('en-IN')}: you save ৳ ${data.loan.early_offer.save_bdt.toLocaleString('en-IN')} of interest.`, `পরের কিস্তি ${digits(data.loan.early_offer.pay_by)}-এর মধ্যে দিলে মাত্র ৳ ${digits(data.loan.early_offer.pay_bdt.toLocaleString('en-IN'))} দিতে হবে: ৳ ${digits(data.loan.early_offer.save_bdt.toLocaleString('en-IN'))} সুদ বাঁচবে।`)}
              </p>
            )}
            <p className="text-[14px] mt-1" style={{ color: '#5b6f6b' }}>{t(`Repay the whole loan early and ${data.loan.rebate_pct}% of the interest still to come is waived. A late instalment costs ${data.loan.penalty_pts} extra points a year, only for the days it is late.`, `আগে শোধ করলে বাকি সুদের ${digits(String(data.loan.rebate_pct))}% মাফ। কিস্তি দেরি হলে শুধু দেরির দিনগুলোর জন্য বছরে ${digits(String(data.loan.penalty_pts))} পয়েন্ট বেশি।`)}</p>
            <button
              className="btn mt-3 text-[16px]"
              disabled={busy === 'quote'}
              onClick={async () => {
                setBusy('quote');
                setErr(null);
                try {
                  const r = await api(`/owner/${token}/settlement-quote`, { method: 'POST' });
                  setData(r.view);
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === 'quote' ? '…' : t('How much to repay everything today?', 'আজ পুরো ঋণ শোধ করতে কত লাগবে?')}
            </button>
          </>
        )}
        {d?.decision === 'approved_with_conditions' && d.tranche_plan?.length > 0 && (
          <>
            <H>{t('Money released in parts', 'ধাপে ধাপে টাকা ছাড়')}</H>
            <ol className="space-y-1.5 text-[16px]">
              {d.tranche_plan.map((tr: any) => (
                <li key={tr.n} className="grid grid-cols-[auto_1fr] gap-3">
                  <b className="num">৳ {digits(tr.amount_bdt.toLocaleString('en-IN'))}</b>
                  <span style={{ color: '#5b6f6b' }}>{lang === 'bn' ? tr.release_bn : tr.release_en}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {data.questions.length > 0 && (
          <>
            <H>{t('Questions for you', 'আপনার জন্য প্রশ্ন')}</H>
            <p className="text-[14px] mb-3" style={{ color: '#5b6f6b' }}>{t('We could not match these to your wallet. Your answer is recorded as “owner says”.', 'এগুলো আপনার ওয়ালেটের সাথে মেলানো যায়নি। আপনার উত্তর "মালিক বলছেন" হিসেবে রাখা হবে।')}</p>
            <ul className="space-y-4">
              {data.questions.map((q: any) => (
                <li key={q._id} className="rounded-lg p-3" style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid #e2daca' }}>
                  <p className="text-[17px] leading-[1.7]">{digits(lang === 'bn' ? q.question_bn : q.question_en)}</p>
                  {q.status === 'answered' ? (
                    <p className="mt-2 text-[15px]">
                      <b>{t('Your answer', 'আপনার উত্তর')}:</b> {q.answer}
                    </p>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <input className="input !bg-white !text-[#1b2a28]" value={answers[q._id] || ''} onChange={(e) => setAnswers({ ...answers, [q._id]: e.target.value })} placeholder={t('e.g. Paid in cash at the shop', 'যেমন: দোকানে নগদে দিয়েছি')} />
                      <button className="btn btn-primary" onClick={() => answer(q._id)} disabled={busy === q._id}>
                        {busy === q._id ? '…' : t('Send', 'পাঠান')}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {data.messages?.length > 0 && (
          <>
            <H>{t('Messages', 'বার্তা')}</H>
            <ul className="space-y-3">
              {data.messages.map((m: any) => (
                <li key={m._id} className="rounded-lg p-3 text-[16px] leading-[1.7]" style={{ background: 'rgba(0,0,0,0.04)' }}>
                  {MSG_KIND[m.kind] && <div className="text-[12.5px] font-semibold mb-0.5" style={{ color: MSG_KIND[m.kind].color }}>{pick(MSG_KIND[m.kind])} <span className="font-normal" style={{ color: '#5b6f6b' }}>· {digits(new Date(m.createdAt).toLocaleDateString())}</span></div>}
                  {digits(lang === 'bn' ? m.text_bn : m.text_en)}
                  {m.offer && m.offer.status === 'offered' && (
                    <button
                      className="btn btn-primary mt-2"
                      onClick={async () => {
                        await api(`/owner/${token}/offers/${m._id}/accept`, { method: 'POST' });
                        reload();
                      }}
                    >
                      {t('Accept the new repayment date (simulated)', 'নতুন কিস্তির তারিখ গ্রহণ করুন (সিমুলেটেড)')}
                    </button>
                  )}
                  {m.offer && m.offer.status === 'accepted' && <p className="text-[14px] mt-1" style={{ color: 'var(--viable)' }}>{t('Accepted (simulated).', 'গ্রহণ করা হয়েছে (সিমুলেটেড)।')}</p>}
                </li>
              ))}
            </ul>
          </>
        )}

        <H>{t('Add new evidence', 'নতুন প্রমাণ যোগ করুন')}</H>
        <p className="text-[14px] mb-3" style={{ color: '#5b6f6b' }}>{t('Demo only: do not upload real documents. Each resubmission is read again and keeps the earlier decisions in history.', 'শুধু ডেমো: আসল কাগজ দেবেন না। প্রতিবার আবার জমা দিলে ফাইল নতুন করে পড়া হয়, আগের সিদ্ধান্তগুলো ইতিহাসে থাকে।')}</p>
        <div className="space-y-2">
          {csvPicker('statement_csv', t('Fresh wallet statement (CSV)', 'নতুন ওয়ালেট স্টেটমেন্ট (CSV)'))}
          {data.segment !== 'cash_led' && csvPicker('courier_csv', t('Courier settlements (CSV)', 'কুরিয়ারের হিসাব (CSV)'))}
          {data.segment !== 'cash_led' && csvPicker('orders_csv', t('Order log (CSV)', 'অর্ডারের খাতা (CSV)'))}
          <label className="btn w-full justify-center cursor-pointer text-[15px]">
            <IconDoc /> {busy === 'bill' ? t('Reading the bill…', 'বিল পড়া হচ্ছে…') : t('Add a bill photo', 'বিলের ছবি যোগ করুন')}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadBill(e.target.files[0])} />
          </label>
          <textarea className="input !bg-white !text-[#1b2a28] min-h-[80px]" value={files.note_text || ''} onChange={(e) => setFiles({ ...files, note_text: e.target.value })} placeholder={t('A note in Bangla (optional)', 'বাংলায় একটি নোট (ঐচ্ছিক)')} />
          <button className="btn btn-primary w-full justify-center text-[17px] !py-3" onClick={resubmit} disabled={busy === 'resubmit'}>
            {busy === 'resubmit' ? t('Reading your file again…', 'আপনার ফাইল আবার পড়া হচ্ছে…') : t('Resubmit with new evidence', 'নতুন প্রমাণসহ আবার জমা দিন')}
          </button>
          {done && <p className="text-[15px]" style={{ color: 'var(--viable)' }}>{done}</p>}
          <ErrorNote msg={err} />
        </div>

        {data.history.length > 1 && (
          <>
            <H>{t('Decision history', 'সিদ্ধান্তের ইতিহাস')}</H>
            <ul className="text-[14px] space-y-1">
              {data.history.map((h: any, i: number) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>{pick(DECISION_WORDS[h.decision])}</span>
                  <span className="num" style={{ color: '#5b6f6b' }}>{new Date(h.at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-[15px] mt-8" style={{ color: '#5b6f6b' }}>
          {t('This page judges the evidence, not you.', 'এই পাতা প্রমাণ বিচার করে, আপনাকে নয়।')}
        </p>
      </div>
    </main>
  );
}
