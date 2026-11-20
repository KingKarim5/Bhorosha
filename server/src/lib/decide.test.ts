import { describe, it, expect } from 'vitest';
import { decide, DecideInput } from './decide';

const base: DecideInput = {
  paused: false,
  missingDocs: [],
  tamper: false,
  monthsHistory: 12,
  rulesVerdict: 'viable',
  finalVerdict: 'viable',
  modelSet: ['viable', 'not_viable'],
  materialOpen: 0,
  loanAsk: 200000,
  autonomyCap: 300000,
  conditions: [{ key: 'c1', en: 'Show bills.', bn: 'বিল দেখান।', kind: 'prudential' }],
  tranches: [{ n: 1, amount_bdt: 100000, release_en: 'At approval.', release_bn: '' }, { n: 2, amount_bdt: 100000, release_en: 'later', release_bn: '' }],
  evidenceIds: { statement: ['E1'], consistency: ['E5'], rules: ['E1', 'E3'] },
};

describe('fail-safe decision', () => {
  it('approves only when every gate holds', () => {
    expect(decide(base).decision).toBe('approved_with_conditions');
  });
  it.each([
    ['paused', { paused: true }],
    ['missing documents', { missingDocs: ['statement'] }],
    ['tamper', { tamper: true }],
    ['short history', { monthsHistory: 2 }],
    ['rules not sure', { rulesVerdict: 'not_sure', finalVerdict: 'not_sure' }],
    ['model contradicts', { modelSet: ['not_viable'] }],
    ['model lowered the verdict', { finalVerdict: 'not_sure' }],
    ['material evidence open', { materialOpen: 1 }],
  ] as [string, Partial<DecideInput>][])('never approves when %s', (_, patch) => {
    expect(decide({ ...base, ...patch }).decision).not.toBe('approved_with_conditions');
  });
  it('declines with a plan when the rules say not viable', () => {
    expect(decide({ ...base, rulesVerdict: 'not_viable', finalVerdict: 'not_viable' }).decision).toBe('declined_with_plan');
  });
  it('holds rather than declines when the statement does not reconcile', () => {
    expect(decide({ ...base, rulesVerdict: 'not_viable', finalVerdict: 'not_viable', tamper: true }).decision).toBe('hold_need_evidence');
  });
  it('the model alone can never cause an approval', () => {
    expect(decide({ ...base, rulesVerdict: 'not_sure', finalVerdict: 'not_sure', modelSet: ['viable'] }).decision).toBe('hold_need_evidence');
  });
  it('over the autonomy cap releases a first tranche no bigger than the cap', () => {
    const r = decide({ ...base, loanAsk: 1200000, tranches: [{ n: 1, amount_bdt: 600000, release_en: '', release_bn: '' }] });
    expect(r.decision).toBe('approved_with_conditions');
    expect(r.first_tranche_bdt).toBe(300000);
    expect(r.tranche_plan.reduce((a, t) => a + t.amount_bdt, 0)).toBe(1200000);
  });
  it('does not call an unsure model a contradiction when the rules say not sure', () => {
    const r = decide({ ...base, rulesVerdict: 'not_sure', finalVerdict: 'not_sure', modelSet: ['viable', 'not_viable'] });
    expect(r.gates.find((g) => g.key === 'model_no_contradiction')!.pass).toBe(true);
    expect(r.decision).toBe('hold_need_evidence');
  });
  it('gives reasons with evidence ids', () => {
    const r = decide({ ...base, tamper: true });
    expect(r.reasons.some((x) => x.evidence_ids.includes('E5'))).toBe(true);
  });
});
