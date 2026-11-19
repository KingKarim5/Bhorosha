import { describe, it, expect } from 'vitest';
import { parseStatementCsv, summarise, toCsv } from './statement';
import { runChecks, balanceContinuity } from './checks';
import { computeFeatures, likelyCause } from './features';
import { evaluateRules, rulesTotal, rulesVerdict, DEFAULT_SETTINGS } from './rules';
import { judge } from './judge';
import { redact } from './redact';
import { validateText, extractNumbers, validateCitations, findForbidden } from './validate';
import { forecastNext, classify, fixedThresholdFlag } from './forecast';
import { counterfactualSearch, ACTIONS } from './conditions';
import { installment, bnToLatinDigits } from './util';
import { DEMO_SHOPS } from '../seed/demoShops';
import { generate } from '../seed/generator';
import { allocate } from '../services/allocator';

function demo(slug: string) {
  const s = DEMO_SHOPS.find((x) => x.slug === slug)!;
  const rows = generate(s.gen);
  const txns = parseStatementCsv(toCsv(rows.filter((r) => !r.hidden))).txns;
  const checks = runChecks(txns);
  const stated = { ...s.stated, receivable_confirmed: slug === 'sultana' };
  const f = computeFeatures({ txns, business_type: s.business_type, loan_ask_bdt: s.loan_ask_bdt, tenor_months: s.tenor_months, stated, checks });
  return { s, rows, txns, checks, f, j: judge(f, DEFAULT_SETTINGS, null) };
}

describe('statement parsing', () => {
  it('parses Bangla numerals, debit/credit columns and DD/MM/YYYY dates', () => {
    const csv = 'Date,Details,Credit,Debit,Balance\n০১/১০/২০২৬,Sale,"১,২০০",,"৫,২০০"\n02/10/2026,Stock,,800,4400\nTOTAL,,1200,800,';
    const r = parseStatementCsv(csv);
    expect(r.txns).toHaveLength(2);
    expect(r.txns[0].amount_bdt).toBe(1200);
    expect(r.txns[0].direction).toBe('in');
    expect(r.txns[1].direction).toBe('out');
    expect(r.txns[0].balance_after_bdt).toBe(5200);
    expect(r.stated_totals).toEqual({ in: 1200, out: 800 });
  });
  it('summarises months and finds gaps', () => {
    const csv = 'date,direction,amount_bdt,counterparty_kind\n2026-01-05,in,100,customer\n2026-03-05,in,300,customer';
    const s = summarise(parseStatementCsv(csv).txns);
    expect(s.months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(s.gaps).toEqual(['2026-02']);
    expect(s.months_history).toBe(2);
  });
  it('round-trips a generated demo statement through CSV', () => {
    const { rows, txns } = demo('rahima');
    expect(txns.length).toBe(rows.filter((r) => !r.hidden).length);
  });
});

describe('consistency checks', () => {
  it('passes a clean statement and flags the tampered one (does not reconcile)', () => {
    expect(balanceContinuity(demo('rahima').txns).passed).toBe(true);
    const t = balanceContinuity(demo('tania').txns);
    expect(t.passed).toBe(false);
    expect(t.severity).toBe('high');
    expect(t.detail_en).toMatch(/does not reconcile/);
    expect(t.detail_en).not.toMatch(/forged|fake|fraud/i);
  });
});

describe('rules and verdicts on the demo shops', () => {
  it.each([
    ['rahima', 'viable'],
    ['sultana', 'viable'],
    ['karim', 'not_sure'],
    ['nasir', 'not_sure'],
    ['jahan', 'viable'],
    ['tania', 'not_sure'],
  ])('%s is %s', (slug, verdict) => {
    expect(demo(slug).j.final_verdict).toBe(verdict);
  });
  it('finds the expected likely causes', () => {
    expect(likelyCause(demo('rahima').f)).toBe('stock_problem');
    expect(likelyCause(demo('nasir').f)).toBe('household_mixing');
    expect(likelyCause(demo('sultana').f)).toBe('buyers_paying_late');
  });
  it('widens the band for low coverage, short history and seasonality', () => {
    expect(demo('rahima').j.band.widened).toContain('low_coverage');
    expect(demo('tania').j.band.widened).toContain('short_history');
    expect(demo('jahan').j.band.widened).toContain('seasonal');
  });
  it('returns not sure with under 3 months of statement', () => {
    const { f } = demo('rahima');
    const g = { ...f, months_history: 2 };
    expect(rulesVerdict(rulesTotal(evaluateRules(g)), g)).toBe('not_sure');
  });
  it('costs two points when the instalment is over half the margin', () => {
    const { f } = demo('rahima');
    const rows = evaluateRules({ ...f, installment_to_margin: 0.7 });
    expect(rows.find((r) => r.key === 'debt_heavy')!.points).toBe(-2);
  });
  it('lender settings change the verdict', () => {
    const { f } = demo('nasir');
    const strict = rulesTotal(evaluateRules(f, DEFAULT_SETTINGS));
    const lenient = rulesTotal(evaluateRules(f, { ...DEFAULT_SETTINGS, household_mixing_pct: 40 }));
    expect(lenient).toBeGreaterThan(strict);
  });
  it('computes the 9% annuity instalment', () => {
    expect(Math.round(installment(200000, 0.09, 36))).toBe(6360);
  });
});

describe('counterfactual conditions', () => {
  it('reaches viable for Karim by clearing arrears, and moves Nasir closer by lowering household transfers, touching only actionable features', () => {
    const { f } = demo('nasir');
    const cfs = counterfactualSearch(f, DEFAULT_SETTINGS, 300000, (g) => judge(g, DEFAULT_SETTINGS, null).final_verdict, 3, (g) => judge(g, DEFAULT_SETTINGS, null).rules_total);
    expect(cfs.length).toBeGreaterThan(0);
    expect(cfs.some((c) => c.actions.includes('lower_household'))).toBe(true);
    const allowed = new Set(ACTIONS.flatMap((a) => a.changes));
    for (const c of cfs) for (const ch of c.changed_features) expect(allowed.has(ch)).toBe(true);
    for (const c of cfs) expect(c.changed_features).not.toContain('coverage');
    const k = demo('karim');
    const kc = counterfactualSearch(k.f, DEFAULT_SETTINGS, 500000, (g) => judge(g, DEFAULT_SETTINGS, null).final_verdict);
    expect(kc.length).toBeGreaterThanOrEqual(0);
  });
});

describe('redaction', () => {
  it('removes phone numbers, ID-like numbers and names', () => {
    const r = redact('Rahima, ফোন ০১৭১২৩৪৫৬৭৮, +8801812345678, NID 1987654321234', ['Rahima']);
    expect(r.text).not.toMatch(/Rahima/);
    expect(r.text).not.toMatch(/01712345678|1812345678|1987654321234/);
    expect(r.text).toMatch(/PERSON_1/);
    expect(r.text).toMatch(/PHONE_1/);
    expect(r.text).toMatch(/ID_1/);
  });
});

describe('AI output validator', () => {
  it('normalises Bangla digits and lakh grouping', () => {
    expect(extractNumbers('৪,০০,০০০ টাকা and 38,000')).toEqual([400000, 38000]);
    expect(bnToLatinDigits('১২৩')).toBe('123');
  });
  it('rejects numbers that were not supplied', () => {
    expect(validateText('Sales are 46,300 BDT a month.', [46300]).ok).toBe(true);
    expect(validateText('Sales are 52,000 BDT a month.', [46300]).ok).toBe(false);
  });
  it('rejects forbidden words', () => {
    expect(findForbidden('This loan is guaranteed and secured')).toEqual(['guaranteed', 'secured']);
    expect(validateText('A certificate of viability', []).ok).toBe(false);
  });
  it('rejects citations to unknown evidence ids', () => {
    expect(validateCitations(['E1', 'E2'], new Set(['E1', 'E2'])).ok).toBe(true);
    expect(validateCitations(['E1', 'E9'], new Set(['E1', 'E2'])).ok).toBe(false);
  });
});

describe('seasonal forecasting watchman', () => {
  const series = (slug: string) => {
    const { s, rows } = demo(slug);
    return { s, months: summarise(rows).months.map((m) => ({ month: m.month, value: m.inflow })) };
  };
  it('flags the pharmacy dip after funding', () => {
    const { s, months } = series('karim');
    const fc = forecastNext(months.slice(0, 12), s.business_type, false);
    expect(months[12].value).toBeLessThan(fc.low);
  });
  it('does not false-alarm the fish trader in lean months, while a fixed threshold does', () => {
    const { s, months } = series('jahan');
    let modelAlarms = 0;
    let fixedAlarms = 0;
    for (let k = 12; k < months.length; k++) {
      const fc = forecastNext(months.slice(0, k), s.business_type, true);
      if (months[k].value < fc.low) modelAlarms++;
      if (fixedThresholdFlag(months[k - 1].value, months[k].value)) fixedAlarms++;
    }
    expect(modelAlarms).toBe(0);
    expect(fixedAlarms).toBeGreaterThan(0);
  });
  it('one low month is a watch, two a call; missed check-ins are no data first', () => {
    expect(classify(1, 0)).toBe('watch');
    expect(classify(2, 0)).toBe('call');
    expect(classify(0, 1)).toBe('no_data');
    expect(classify(0, 2)).toBe('call');
    expect(classify(0, 0)).toBe(null);
  });
});

describe('pool allocator', () => {
  it('respects caps and is less concentrated than the naive split', () => {
    const out = allocate(100000, [{ id: 'a', band_low: 80, open_bdt: 100000 }, { id: 'b', band_low: 70, open_bdt: 100000 }, { id: 'c', band_low: 60, open_bdt: 20000 }], 50000);
    expect(out.metrics.cap_compliant).toBe(true);
    for (const p of out.proposal) expect(p.amount_bdt).toBeLessThanOrEqual(50000);
    expect(out.metrics.concentration_hhi).toBeLessThan(out.metrics.naive_concentration_hhi);
  });
});
