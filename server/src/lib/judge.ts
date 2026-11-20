import { Features, featureVector } from './features';
import { evaluateRules, rulesTotal, rulesVerdict, rulesProbability, likelihoodBand, RuleSettings, Verdict, RuleRow, Band } from './rules';
import { ModelFile, predictProba, conformalSet, setToVerdict } from './model';

// Combines the transparent rules with the calibrated model and its conformal set.
// Policy (DECISIONS.md): the model can only make the verdict MORE cautious, never less.
//   agree -> that verdict; opposite confident verdicts -> not sure; rules confident but model unsure ->
//   rules verdict with a disagreement notice; rules unsure but model confident -> not sure with a notice.

export interface Judgement {
  rules: RuleRow[];
  rules_total: number;
  rules_verdict: Verdict;
  model_probability: number | null;
  conformal_set: Verdict[] | null;
  model_verdict: Verdict | null;
  final_verdict: Verdict;
  disagreement: boolean;
  disagreement_en: string | null;
  disagreement_bn: string | null;
  band: Band;
  source: 'rules_only' | 'model_hybrid';
}

const V = { viable: 'viable', not_sure: 'not sure', not_viable: 'not viable' } as const;
const VBN = { viable: 'টেকসই', not_sure: 'নিশ্চিত নয়', not_viable: 'এখন টেকসই নয়' } as const;

export function judge(f: Features, s: RuleSettings, model: ModelFile | null, segment?: string | null): Judgement {
  const rules = evaluateRules(f, s);
  const total = rulesTotal(rules);
  const rv = rulesVerdict(total, f, s);
  if (!model) {
    return {
      rules, rules_total: total, rules_verdict: rv, model_probability: null, conformal_set: null, model_verdict: null,
      final_verdict: rv, disagreement: false, disagreement_en: null, disagreement_bn: null,
      band: likelihoodBand(rulesProbability(total), 0.08, f, s), source: 'rules_only',
    };
  }
  const p = predictProba(model, featureVector(f));
  const set = conformalSet(model, p, segment);
  const mv = setToVerdict(set);
  let final: Verdict = rv;
  let en: string | null = null;
  let bn: string | null = null;
  if (mv !== rv) {
    if (rv !== 'not_sure' && mv !== 'not_sure') {
      final = 'not_sure';
      en = `The rules say ${V[rv]} but the model says ${V[mv]}. Shown as not sure until a person looks closer.`;
      bn = `নিয়ম বলছে ${VBN[rv]}, কিন্তু মডেল বলছে ${VBN[mv]}। কেউ ভালো করে না দেখা পর্যন্ত "নিশ্চিত নয়" দেখানো হচ্ছে।`;
    } else if (rv !== 'not_sure') {
      final = rv;
      en = `The rules say ${V[rv]}; the model's prediction set holds both outcomes, so it is less certain. Read the reasons closely.`;
      bn = `নিয়ম বলছে ${VBN[rv]}; মডেলের পূর্বাভাসে দুই ফলাফলই আছে, তাই সে কম নিশ্চিত। কারণগুলো ভালো করে পড়ুন।`;
    } else {
      final = 'not_sure';
      en = `The rules say not sure; the model leans ${V[mv]}. The verdict stays not sure: the model never makes a file less cautious.`;
      bn = `নিয়ম বলছে নিশ্চিত নয়; মডেল ${VBN[mv]}-এর দিকে। রায় "নিশ্চিত নয়" থাকছে: মডেল কখনো সতর্কতা কমায় না।`;
    }
  }
  if (f.months_history < 3) final = 'not_sure';
  return {
    rules, rules_total: total, rules_verdict: rv, model_probability: p, conformal_set: set, model_verdict: mv,
    final_verdict: final, disagreement: mv !== rv, disagreement_en: en, disagreement_bn: bn,
    band: likelihoodBand(p, model.band_half, f, s), source: 'model_hybrid',
  };
}
