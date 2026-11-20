import { describe, it, expect } from 'vitest';
import { parseCourierCsv, parseOrderLogCsv, orderSummary, courierToCsv } from './online';
import { generateOnline } from '../seed/onlineGen';
import { DEMO_SHOPS } from '../seed/demoShops';

describe('courier settlement parser', () => {
  it('parses Bangla numerals and derives net when missing', () => {
    const csv = 'order_id,date,amount_collected,fee,net_remitted,settlement_date\nR-1,০২/১০/২০২৬,"১,২০০",৭২,,2026-10-08\nR-2,2026-10-03,900,69,831,2026-10-08';
    const r = parseCourierCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows[0].amount_collected).toBe(1200);
    expect(r.rows[0].net_remitted).toBe(1128);
    expect(r.rows[1].settlement_date.toISOString().slice(0, 10)).toBe('2026-10-08');
  });
  it('reports rows it cannot read instead of guessing', () => {
    const r = parseCourierCsv('order_id,date,amount_collected,fee,net_remitted,settlement_date\n,2026-10-03,900,69,831,2026-10-08');
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
  });
});

describe('order log parser', () => {
  it('normalises statuses and summarises returns', () => {
    const csv = 'order_id,date,channel,amount,status\nA,2026-10-01,facebook,1000,Delivered\nB,2026-10-01,web,800,Returned\nC,2026-10-02,web,500,cancelled\nD,2026-10-02,web,700,delivered';
    const r = parseOrderLogCsv(csv);
    expect(r.rows.map((x) => x.status)).toEqual(['delivered', 'returned', 'cancelled', 'delivered']);
    expect(orderSummary(r.rows).return_rate).toBe(0.25);
  });
});

describe('online generator (Rafi)', () => {
  const rafi = DEMO_SHOPS.find((s) => s.slug === 'rafi')!;
  it('is deterministic with a fixed seed', () => {
    const a = generateOnline(rafi.online!);
    const b = generateOnline(rafi.online!);
    expect(courierToCsv(a.settlements)).toBe(courierToCsv(b.settlements));
  });
  it('produces returns near 6% and one payout missing from the wallet', () => {
    const o = generateOnline(rafi.online!);
    const rr = orderSummary(o.orders).return_rate;
    expect(rr).toBeGreaterThan(0.03);
    expect(rr).toBeLessThan(0.1);
    expect(o.truth.filter((x) => x.creditIndex === null)).toHaveLength(1);
  });
  it('deducts courier fees from what is remitted', () => {
    const o = generateOnline(rafi.online!);
    for (const s of o.settlements.slice(0, 50)) expect(s.net_remitted).toBeLessThan(s.amount_collected);
  });
});
