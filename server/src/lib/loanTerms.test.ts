import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TERMS as T, checkLimits, feePct, checkRateSetup, schedule, totalInterest, feeSplit, counterOffer, clampPricing, classifyPayment,
  applyToSchedule, settlementQuote, lateFee1, verifySignature, signPayload, readContractRules, validateContract, contractText, matchScore,
} from './loanTerms';

describe('limits', () => {
  it('accepts Tk 1,000,000 over 12 months and refuses anything above', () => {
    expect(checkLimits(1000000, 12, T).ok).toBe(true);
    const c = checkLimits(1500000, 24, T);
    expect(c.ok).toBe(false);
    expect(c.problems.map((p) => p.key)).toEqual(['principal', 'tenor']);
  });
});

describe('fees and rates', () => {
  it('uses 8%, 8.5% and 9% of interest by tenor band', () => {
    expect([1, 3, 4, 6, 7, 12].map((t) => feePct(t, T))).toEqual([8, 8, 8.5, 8.5, 9, 9]);
  });
  it('investor rate is bank rate + 0.25', () => {
    expect(checkRateSetup(14, 12, T).investor_rate_pct).toBe(10.25);
  });
  it('rejects a borrower rate below investor rate plus the Bhorsha fee', () => {
    expect(checkRateSetup(14, 12, T).ok).toBe(true);
    expect(checkRateSetup(11, 12, T).ok).toBe(false); // 10.25 + 0.99 = 11.24 > 11
  });
  it('splits interest so the three shares add up exactly', () => {
    const f = feeSplit(120000, 12, 14, 0.25, T);
    expect(f.investor_bdt + f.bhorsha_bdt + f.lender_bdt).toBe(f.total_interest_bdt);
    expect(f.bhorsha_bdt).toBe(Math.round(f.total_interest_bdt * 0.09));
  });
});

describe('schedule', () => {
  it('repays exactly the principal over the tenor', () => {
    const s = schedule(100000, 14, 12, '2026-11-10');
    expect(s).toHaveLength(12);
    expect(s.reduce((a, x) => a + x.principal_bdt, 0)).toBe(100000);
    expect(s[0].due_date).toBe('2026-11-10');
    expect(s[11].due_date).toBe('2027-10-10');
    expect(totalInterest(s)).toBeGreaterThan(7000);
  });
});

describe('counter-offer', () => {
  it('clamps to the limits and steps down until acceptable', () => {
    const o = counterOffer(1500000, 24, T, (a) => a <= 460000)!;
    expect(o.amount_bdt).toBe(460000);
    expect(o.tenor_months).toBe(12);
    expect(o.changed).toEqual(['amount', 'tenor']);
  });
  it('returns null when nothing inside the limits works', () => {
    expect(counterOffer(1500000, 24, T, () => false)).toBeNull();
  });
});

describe('pricing', () => {
  it('keeps the agent inside the lender bands', () => {
    expect(clampPricing(45, 9, T)).toMatchObject({ rebate_pct: 30, penalty_pts: 4 });
    expect(clampPricing(null, null, T)).toMatchObject({ rebate_pct: 20, penalty_pts: 2, clamped: [] });
  });
  it('late fee is pro rata for the days late', () => {
    expect(lateFee1(10000, 2, 365)).toBe(200);
    expect(lateFee1(10000, 2, 0)).toBe(0);
  });
  it('settlement quote waives part of the remaining interest', () => {
    const s = schedule(100000, 14, 12, '2026-11-10');
    const paid = applyToSchedule(s, s[0].amount_bdt).schedule;
    const q = settlementQuote(paid, 14, 20, 2, '2026-11-25');
    expect(q.overdue_bdt).toBe(0);
    expect(q.rebate_bdt).toBeGreaterThan(0);
    expect(q.total_to_settle_bdt).toBe(q.outstanding_principal_bdt + q.interest_accrued_bdt);
  });
});

describe('payments', () => {
  it('classifies early, on time and late around the grace window', () => {
    expect(classifyPayment('2026-12-10', '2026-12-01', 3).classification).toBe('early');
    expect(classifyPayment('2026-12-10', '2026-12-13', 3).classification).toBe('on_time');
    expect(classifyPayment('2026-12-10', '2026-12-19', 3)).toEqual({ classification: 'late', days_from_due: 9 });
  });
  it('applies a partial payment to the oldest open instalment', () => {
    const s = schedule(60000, 14, 6, '2026-11-10');
    const r = applyToSchedule(s, 5000);
    expect(r.first_n).toBe(1);
    expect(r.partial).toBe(true);
    expect(r.schedule[0].status).toBe('partial');
  });
  it('verifies the HMAC signature and refuses a changed body', () => {
    const raw = JSON.stringify({ event_id: 'e1', amount_bdt: 100 });
    const sig = signPayload(raw, 'k');
    expect(verifySignature(raw, sig, 'k')).toBe(true);
    expect(verifySignature(raw.replace('100', '900'), sig, 'k')).toBe(false);
    expect(verifySignature(raw, undefined, 'k')).toBe(false);
  });
  it('scores the matching payer highest', () => {
    const loan = { payer_label: 'Wallet A', due_amount: 10000, due_date: '2026-12-10' };
    expect(matchScore({ amount_bdt: 10000, received_at: '2026-12-10', payer_label: 'Wallet A' }, loan)).toBe(1);
    expect(matchScore({ amount_bdt: 10000, received_at: '2026-12-10', payer_label: 'Wallet B' }, loan)).toBe(0.5);
  });
});

describe('contract', () => {
  const app = { loan_ask_bdt: 90000, tenor_months: 12 };
  it('reads the standard contract and leaves the annex figures to the Pricing agent', () => {
    const r = readContractRules(contractText({ contractNo: 'LN-1', borrower: 'X', principal: 90000, ratePct: 14, tenor: 12, rebateBand: [10, 30], penaltyBand: [1, 4] }));
    expect(r.fields).toMatchObject({ principal_bdt: 90000, annual_rate_pct: 14, tenor_months: 12, early_rebate_pct: null, late_penalty_pts: null });
    expect(r.unclear).toHaveLength(0);
    expect(validateContract(r.fields, app, T)).toHaveLength(0);
  });
  it('flags a verbal late clause as unclear', () => {
    const r = readContractRules(contractText({ contractNo: 'LN-1', borrower: 'X', principal: 90000, ratePct: 14, tenor: 12, rebateBand: [10, 30], penaltyBand: [1, 4], lateClause: 'Late repayment: a late fee may apply, as agreed verbally with the branch officer.' }));
    expect(r.unclear).toHaveLength(1);
  });
  it('code checks catch terms over the limits', () => {
    const r = readContractRules(contractText({ contractNo: 'LN-1', borrower: 'X', principal: 1500000, ratePct: 14, tenor: 24, rebateBand: [10, 30], penaltyBand: [1, 4] }));
    expect(validateContract(r.fields, { loan_ask_bdt: 1500000, tenor_months: 24 }, T).length).toBe(2);
  });
});
