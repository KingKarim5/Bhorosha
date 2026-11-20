import type { Verdict } from './rules';
import type { Condition, Tranche } from './conditions';
import { fmtBdt } from './util';

// Underwriter's fail-safe decision (v2). Approve ONLY when every gate holds. Anything in doubt is a hold
// (or a decline with a plan when the rules say not viable). There is no default-to-approve path.
// The classifier can only add caution: it can block an approval, never cause one.

export type DecisionKind = 'approved_with_conditions' | 'declined_with_plan' | 'hold_need_evidence';

export interface DecideInput {
  paused: boolean;
  pauseReason?: string;
  missingDocs: string[]; // required by the policy but not provided
  tamper: boolean; // a high-severity consistency check failed (statement does not reconcile)
  monthsHistory: number;
  rulesVerdict: Verdict;
  finalVerdict: Verdict; // after the model's caution
  modelSet: Verdict[] | null; // conformal prediction set (null = no model loaded)
  materialOpen: number; // material evidence neither matched nor answered by the owner
  loanAsk: number;
  autonomyCap: number;
  conditions: Condition[];
  tranches: Tranche[];
  evidenceIds: { statement: string[]; consistency: string[]; rules: string[] };
}

export interface Gate {
  key: string;
  pass: boolean;
  en: string;
  bn: string;
}

export interface DecideOutput {
  decision: DecisionKind;
  gates: Gate[];
  reasons: { en: string; bn: string; evidence_ids: string[] }[];
  tranche_plan: Tranche[];
  first_tranche_bdt: number | null;
}

export function decide(x: DecideInput): DecideOutput {
  const modelContradicts = !!x.modelSet && x.modelSet.length > 0 && !x.modelSet.includes(x.rulesVerdict);
  const modelAgreesViable = !x.modelSet || x.modelSet.includes('viable');
  const gates: Gate[] = [
    { key: 'not_paused', pass: !x.paused, en: x.paused ? `AI decisions are paused: ${x.pauseReason || 'by the lender'}.` : 'AI decisions are running.', bn: x.paused ? `এআই-এর সিদ্ধান্ত থামানো আছে: ${x.pauseReason || 'ঋণদাতা থামিয়েছেন'}।` : 'এআই-এর সিদ্ধান্ত চালু।' },
    { key: 'min_documents', pass: x.missingDocs.length === 0, en: x.missingDocs.length ? `Required by the policy but missing: ${x.missingDocs.join(', ')}.` : 'All documents the policy requires are present.', bn: x.missingDocs.length ? `নীতি অনুযায়ী দরকার কিন্তু নেই: ${x.missingDocs.join(', ')}।` : 'নীতি অনুযায়ী দরকারি সব কাগজ আছে।' },
    { key: 'history', pass: x.monthsHistory >= 3, en: `${x.monthsHistory} months of statement (at least 3 needed).`, bn: `${x.monthsHistory} মাসের স্টেটমেন্ট (অন্তত ৩ মাস দরকার)।` },
    { key: 'no_tamper', pass: !x.tamper, en: x.tamper ? 'The statement does not reconcile.' : 'The statement reconciles (internally consistent).', bn: x.tamper ? 'স্টেটমেন্টের হিসাব মেলে না।' : 'স্টেটমেন্টের হিসাব মেলে (ভেতরে সামঞ্জস্যপূর্ণ)।' },
    { key: 'rules_viable', pass: x.rulesVerdict === 'viable', en: `The transparent rules say: ${x.rulesVerdict.replace('_', ' ')}.`, bn: `স্বচ্ছ নিয়ম বলছে: ${x.rulesVerdict === 'viable' ? 'টেকসই' : x.rulesVerdict === 'not_sure' ? 'নিশ্চিত নয়' : 'এখন টেকসই নয়'}।` },
    { key: 'model_no_contradiction', pass: !modelContradicts && modelAgreesViable && x.finalVerdict === x.rulesVerdict, en: !x.modelSet ? 'No model loaded; rules only.' : modelContradicts ? 'The model contradicts the rules.' : 'The model does not contradict the rules.', bn: !x.modelSet ? 'মডেল নেই; শুধু নিয়ম।' : modelContradicts ? 'মডেল নিয়মের বিপরীত বলছে।' : 'মডেল নিয়মের বিপরীত বলছে না।' },
    { key: 'material_evidence', pass: x.materialOpen === 0, en: x.materialOpen ? `${x.materialOpen} material item(s) not matched and not yet answered by the owner.` : 'All material evidence is matched or answered by the owner.', bn: x.materialOpen ? `${x.materialOpen}টি গুরুত্বপূর্ণ বিষয় মেলেনি এবং মালিক এখনো উত্তর দেননি।` : 'সব গুরুত্বপূর্ণ প্রমাণ মিলেছে বা মালিক উত্তর দিয়েছেন।' },
  ];
  const overCap = x.loanAsk > x.autonomyCap;
  gates.push({ key: 'autonomy_cap', pass: true, en: overCap ? `Loan of ${fmtBdt(x.loanAsk)} BDT is over the policy's autonomy cap of ${fmtBdt(x.autonomyCap)} BDT: only a first tranche up to the cap can be released.` : `Loan within the autonomy cap of ${fmtBdt(x.autonomyCap)} BDT.`, bn: overCap ? `${fmtBdt(x.loanAsk)} টাকার ঋণ নীতির স্বয়ংক্রিয় সীমা ${fmtBdt(x.autonomyCap)} টাকার বেশি: সীমা পর্যন্ত প্রথম কিস্তিই ছাড় হবে।` : `ঋণ ${fmtBdt(x.autonomyCap)} টাকার স্বয়ংক্রিয় সীমার মধ্যে।` });

  const failed = gates.filter((g) => !g.pass);
  const ids = [...x.evidenceIds.statement, ...x.evidenceIds.rules];
  const reason = (g: Gate, extra: string[] = []) => ({ en: g.en, bn: g.bn, evidence_ids: [...new Set([...extra])] });

  let decision: DecisionKind = 'hold_need_evidence'; // the default is a hold, never an approval
  if (failed.length === 0) decision = 'approved_with_conditions';
  else if (!x.paused && x.rulesVerdict === 'not_viable' && !x.tamper && x.missingDocs.length === 0) decision = 'declined_with_plan';

  const reasons: DecideOutput['reasons'] = [];
  if (decision === 'approved_with_conditions') {
    reasons.push(reason(gates.find((g) => g.key === 'rules_viable')!, x.evidenceIds.rules));
    reasons.push(reason(gates.find((g) => g.key === 'material_evidence')!, x.evidenceIds.statement));
    reasons.push(reason(gates.find((g) => g.key === 'autonomy_cap')!));
  } else {
    for (const g of failed) reasons.push(reason(g, g.key === 'no_tamper' ? x.evidenceIds.consistency : g.key === 'rules_viable' || g.key === 'model_no_contradiction' ? x.evidenceIds.rules : ids));
  }

  // tranche plan: over the cap, the first tranche never exceeds the cap; the rest follows the conditions
  let plan = x.tranches;
  let first: number | null = null;
  if (decision === 'approved_with_conditions') {
    if (overCap) {
      const t1 = Math.min(x.autonomyCap, x.tranches[0]?.amount_bdt ?? x.autonomyCap);
      const rest = x.loanAsk - t1;
      const conds = x.conditions;
      plan = [{ n: 1, amount_bdt: t1, release_en: 'At approval (within the autonomy cap).', release_bn: 'অনুমোদনের সময় (স্বয়ংক্রিয় সীমার মধ্যে)।' }];
      if (conds.length >= 2) {
        const t2 = Math.floor((rest * 0.6) / 1000) * 1000;
        plan.push({ n: 2, amount_bdt: t2, release_en: `When met: ${conds[0].en}`, release_bn: `শর্ত পূরণ হলে: ${conds[0].bn}` });
        plan.push({ n: 3, amount_bdt: rest - t2, release_en: `When met: ${conds[1].en} And after 3 instalments paid on time.`, release_bn: `শর্ত পূরণ হলে: ${conds[1].bn} এবং ৩টি কিস্তি সময়মতো দেওয়ার পর।` });
      } else if (conds.length === 1) {
        plan.push({ n: 2, amount_bdt: rest, release_en: `When met: ${conds[0].en} And after 3 instalments paid on time.`, release_bn: `শর্ত পূরণ হলে: ${conds[0].bn} এবং ৩টি কিস্তি সময়মতো দেওয়ার পর।` });
      } else plan.push({ n: 2, amount_bdt: rest, release_en: 'After 3 instalments paid on time.', release_bn: '৩টি কিস্তি সময়মতো দেওয়ার পর।' });
    }
    first = plan[0]?.amount_bdt ?? null;
  } else plan = [];
  return { decision, gates, reasons, tranche_plan: plan, first_tranche_bdt: first };
}
