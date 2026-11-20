import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { ProofLabel, VerdictTag } from './ui';
import { IconPulse } from './icons';

// First-run tour: three tooltips (proof ribbon, verdict tag, Simulate next month).
export function Tour() {
  const { t } = useI18n();
  const [step, setStep] = useState<number>(() => {
    try {
      return localStorage.getItem('bhorsha_tour_done') ? -1 : 0;
    } catch {
      return -1;
    }
  });
  const done = () => {
    try {
      localStorage.setItem('bhorsha_tour_done', '1');
    } catch {
      /* ignore */
    }
    setStep(-1);
  };
  const steps = [
    {
      title: t('Proof labels', 'প্রমাণের চিহ্ন'),
      body: t('Every claim shows whether it is checked (solid) or only what the owner says (hatched).', 'প্রতিটি দাবিতে দেখা যায় সেটি যাচাই করা (ভরাট) নাকি শুধু মালিকের কথা (দাগকাটা)।'),
      demo: (
        <div className="flex gap-4">
          <ProofLabel label="checked" />
          <ProofLabel label="owner_says" />
        </div>
      ),
    },
    {
      title: t('The verdict tag', 'রায়ের চিহ্ন'),
      body: t('A calm tag with a likelihood band, never a stamp. AI agents decide inside the lender’s policy.', 'সম্ভাবনার সীমাসহ একটি শান্ত চিহ্ন, কোনো সিল নয়। ঋণদাতার নীতির ভেতরে এআই এজেন্ট সিদ্ধান্ত নেয়।'),
      demo: <VerdictTag verdict="viable" low={72} high={88} showAdvice={false} />,
    },
    {
      title: t('Simulate next month', 'পরের মাস সিমুলেট করুন'),
      body: t('On the watchlist, step funded loans forward one month and watch the forecast band.', 'নজরতালিকায় ঋণগুলো এক মাস এগিয়ে নিন এবং পূর্বাভাসের সীমা দেখুন।'),
      demo: (
        <span className="btn btn-primary pointer-events-none">
          <IconPulse /> {t('Simulate next month', 'পরের মাস সিমুলেট করুন')}
        </span>
      ),
    },
  ];
  return (
    <AnimatePresence>
      {step >= 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="no-print fixed bottom-5 right-5 z-50 w-[min(360px,calc(100vw-2.5rem))] card p-5 shadow-2xl" role="dialog" aria-label={t('Quick tour', 'ছোট পরিচিতি')}>
          <div className="text-[12px] text-muted">
            {step + 1} / {steps.length}
          </div>
          <h3 className="font-display text-[18px] font-semibold mt-1">{steps[step].title}</h3>
          <p className="text-[14.5px] text-muted mt-1">{steps[step].body}</p>
          <div className="mt-3">{steps[step].demo}</div>
          <div className="flex justify-between mt-4">
            <button className="text-[13px] text-muted underline" onClick={done}>
              {t('Skip', 'বাদ দিন')}
            </button>
            <button className="btn btn-primary !min-h-0 !py-1.5" onClick={() => (step === steps.length - 1 ? done() : setStep(step + 1))}>
              {step === steps.length - 1 ? t('Done', 'শেষ') : t('Next', 'পরের')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
