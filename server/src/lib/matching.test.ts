import { describe, it, expect } from 'vitest';
import { skeleton, labelsMatch, matchBills, matchSettlements, matchOrders, WalletTxn } from './matching';

const d = (s: string) => new Date(s + 'T00:00:00Z');
const tx = (id: string, date: string, amount: number, direction: 'in' | 'out', counterparty: string, note?: string): WalletTxn => ({ id, date: d(date), amount_bdt: amount, direction, counterparty_kind: direction === 'in' ? 'other' : 'supplier', counterparty, note });

describe('supplier labels across scripts', () => {
  it('matches a Bangla label to its English spelling', () => {
    expect(skeleton('মেঘনা')).toBe(skeleton('Meghna'));
    expect(labelsMatch('মেসার্স মেঘনা ট্রেডার্স', 'Supplier: Meghna Traders')).toBe(true);
    expect(labelsMatch('চকবাজার আতর হাউস', 'Supplier: Chawkbazar Attar House')).toBe(true);
  });
  it('does not match different suppliers', () => {
    expect(labelsMatch('Meghna Traders', 'Supplier: Padma Wholesale')).toBe(false);
  });
});

describe('bill matching', () => {
  const txns = [tx('t1', '2026-10-18', 18450, 'out', 'Supplier: Meghna Traders'), tx('t2', '2026-10-18', 18450, 'out', 'Supplier: Padma Wholesale')];
  it('checks a bill with amount, date and supplier all matching one payment', () => {
    const r = matchBills([{ id: 'b1', amount: 18450, date: '2026-10-12', paid_date: '2026-10-18', supplier: 'মেসার্স মেঘনা ট্রেডার্স' }], txns);
    expect(r[0].status).toBe('checked');
    expect(r[0].txn_id).toBe('t1');
  });
  it('never checks on amount alone (supplier mismatch = weak)', () => {
    const r = matchBills([{ id: 'b1', amount: 18450, date: '2026-10-12', supplier: 'Jamuna Distributors' }], txns);
    expect(r[0].status).toBe('weak');
  });
  it('leaves a bill with no payment unmatched, and a repeated bill as duplicate', () => {
    const r = matchBills(
      [
        { id: 'b1', amount: 2600, date: '2026-10-05', supplier: 'Padma Wholesale' },
        { id: 'b2', amount: 2600, date: '2026-10-05', supplier: 'Padma Wholesale' },
      ],
      txns,
    );
    expect(r.map((x) => x.status)).toEqual(['unmatched', 'duplicate']);
  });
  it('rejects a date more than 7 days away', () => {
    const r = matchBills([{ id: 'b1', amount: 18450, date: '2026-09-01', supplier: 'Meghna Traders' }], txns);
    expect(r[0].status).toBe('unmatched');
  });
});

describe('courier settlement matching', () => {
  const rows = [
    { id: 's1', order_id: 'R-1', net_remitted: 1000, settlement_date: d('2026-10-08'), courier: 'Pathao' },
    { id: 's2', order_id: 'R-2', net_remitted: 450, settlement_date: d('2026-10-08'), courier: 'Pathao' }, // partial remittance
    { id: 's3', order_id: 'R-3', net_remitted: 800, settlement_date: d('2026-10-15'), courier: 'Pathao' },
    { id: 's4', order_id: 'R-4', net_remitted: 700, settlement_date: d('2026-10-22'), courier: 'Pathao' },
  ];
  it('matches a batch net of fees and partial remittance within the lag window', () => {
    const r = matchSettlements(rows.slice(0, 2), [tx('c1', '2026-10-10', 1450, 'in', 'Courier: Pathao settlement')]);
    expect(r[0].status).toBe('checked');
    expect(r[0].row_ids).toEqual(['s1', 's2']);
  });
  it('rejects a credit after the 10-day lag', () => {
    const r = matchSettlements([rows[2]], [tx('c1', '2026-10-28', 800, 'in', 'Courier: Pathao settlement')]);
    expect(r[0].status).toBe('unmatched');
  });
  it('treats two fitting credits (a duplicate) as weak, never checked', () => {
    const r = matchSettlements([rows[3]], [tx('c1', '2026-10-23', 700, 'in', 'Courier: Pathao settlement'), tx('c2', '2026-10-24', 700, 'in', 'Courier: Pathao settlement')]);
    expect(r[0].status).toBe('weak');
  });
  it('accepts an exact unique amount when a similar weekly payout is also inside the 1% window', () => {
    const r = matchSettlements([rows[3]], [tx('c1', '2026-10-23', 700, 'in', 'Courier: Pathao settlement'), tx('c2', '2026-10-30', 696, 'in', 'Courier: Pathao settlement')]);
    expect(r[0].status).toBe('checked');
    expect(r[0].txn_id).toBe('c1');
  });
  it('treats an unlabelled credit as weak', () => {
    const r = matchSettlements([rows[3]], [tx('c1', '2026-10-23', 700, 'in', 'Personal: family transfer')]);
    expect(r[0].status).toBe('weak');
  });
});

describe('order matching', () => {
  it('matches delivered orders through courier rows or prepaid wallet references', () => {
    const r = matchOrders(
      [
        { order_id: 'R-1', amount: 1000, status: 'delivered' },
        { order_id: 'R-2', amount: 900, status: 'delivered' },
        { order_id: 'R-3', amount: 500, status: 'returned' },
        { order_id: 'R-4', amount: 700, status: 'delivered' },
      ],
      new Set(['R-1']),
      [tx('p1', '2026-10-01', 900, 'in', 'Online customer (prepaid)', 'Order R-2')],
    );
    expect(r.map((x) => x.matched)).toEqual([true, true, false, false]);
  });
});
