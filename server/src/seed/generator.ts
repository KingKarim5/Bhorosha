import type { Txn, CounterpartyKind } from '../lib/statement';
import { mulberry32, normal, addMonths, calMonth, Rng } from '../lib/util';
import { profileFor } from '../lib/seasonal';

// Synthetic statement generator, shared by the demo shops and the training cohort.
// Fixed seeds: the same config always produces the same rows.

export interface GenTxn extends Txn {
  hidden?: number; // post-funding month index (1..n) revealed by Simulate next month; 0 = visible history
}

export interface GenConfig {
  seed: number;
  startMonth: string;
  months: number; // history months
  postMonths?: number; // post-funding months (hidden until simulated)
  base: number; // visible customer inflow in month 1 (season-free)
  growth: number; // per-month growth of the season-free level
  noise: number; // month-level noise sd (fraction)
  businessType: string;
  seasonal?: boolean;
  profileJitter?: number;
  multiplier?: (i: number, month: string) => number; // i = 0-based month index across history+post
  mode: 'retail' | 'buyers';
  txPerDay?: number;
  buyers?: { name: string; share: number }[];
  stockoutDays?: number;
  supplierRatio: number;
  supplierBills: number;
  lateDays: (i: number, rng: Rng) => number;
  household: number;
  utility: number;
  startBalance?: number;
  tamperRows?: number;
  extra?: { date: string; amount: number; kind: CounterpartyKind; direction: 'in' | 'out'; counterparty: string; due?: string; note?: string }[];
  supplierNames?: string[];
  missingMonths?: number[];
  extraRows?: GenTxn[]; // e.g. courier payouts and prepaid online orders, merged before balances are computed
}

const day = (month: string, d: number) => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.max(1, Math.min(last, Math.round(d)))));
};
const r10 = (x: number) => Math.max(10, Math.round(x / 10) * 10);

export function generate(cfg: GenConfig): GenTxn[] {
  const rng = mulberry32(cfg.seed);
  const total = cfg.months + (cfg.postMonths || 0);
  const prof = cfg.seasonal ? profileFor(cfg.businessType, true) : profileFor('flat');
  const jitter = prof.map((p) => p * (1 + (cfg.profileJitter || 0) * normal(rng)));
  const out: GenTxn[] = [];
  const suppliers = cfg.supplierNames || ['Supplier: Meghna Distributors', 'Supplier: Padma Wholesale'];

  for (let i = 0; i < total; i++) {
    if (cfg.missingMonths?.includes(i)) continue;
    const month = addMonths(cfg.startMonth, i);
    const hidden = i >= cfg.months ? i - cfg.months + 1 : 0;
    const level = cfg.base * (1 + cfg.growth) ** i;
    const season = jitter[calMonth(month) - 1];
    const mult = cfg.multiplier ? cfg.multiplier(i, month) : 1;
    const target = Math.max(1000, level * season * mult * (1 + cfg.noise * normal(rng)));
    const [y, m] = month.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();

    // ---- customer inflows
    if (cfg.mode === 'retail') {
      const stockDays = new Set<number>();
      while (stockDays.size < (cfg.stockoutDays || 0)) stockDays.add(10 + Math.floor(rng() * 11));
      const w = Array.from({ length: days }, (_, d) => Math.exp(0.35 * normal(rng)) * (stockDays.has(d + 1) ? 0.12 : 1));
      const ws = w.reduce((a, b) => a + b, 0);
      for (let d = 0; d < days; d++) {
        const amt = (target * w[d]) / ws;
        const k = Math.max(1, Math.round((cfg.txPerDay || 1.5) * (0.6 + rng() * 0.8)));
        const sw = Array.from({ length: k }, () => 0.5 + rng());
        const sws = sw.reduce((a, b) => a + b, 0);
        for (let j = 0; j < k; j++)
          out.push({ date: day(month, d + 1), amount_bdt: r10((amt * sw[j]) / sws), direction: 'in', counterparty_kind: 'customer', counterparty: 'Walk-in customer', note: 'Payment received', hidden });
      }
    } else {
      for (const b of cfg.buyers || []) {
        const n = 1 + Math.floor(rng() * 2);
        for (let j = 0; j < n; j++)
          out.push({
            date: day(month, 3 + rng() * 24),
            amount_bdt: r10(((target * b.share) / n) * (0.7 + rng() * 0.6)),
            direction: 'in',
            counterparty_kind: 'customer',
            counterparty: `Buyer: ${b.name}`,
            note: 'Order payment',
            hidden,
          });
      }
    }

    // ---- supplier payments (paid late by lateDays)
    const supTotal = target * cfg.supplierRatio;
    const parts = Array.from({ length: cfg.supplierBills }, () => 0.4 + rng());
    const ps = parts.reduce((a, b) => a + b, 0);
    parts.forEach((p, j) => {
      const late = Math.max(0, cfg.lateDays(i, rng));
      const due = 4 + ((j + 0.5) * 24) / cfg.supplierBills + rng() * 2;
      const paid = Math.min(days, due + late);
      out.push({
        date: day(month, paid),
        due_date: day(month, due),
        amount_bdt: r10((supTotal * p) / ps),
        direction: 'out',
        counterparty_kind: 'supplier',
        counterparty: suppliers[j % suppliers.length],
        note: 'Stock purchase',
        hidden,
      });
    });

    // ---- utility, other, personal
    out.push({ date: day(month, 7), amount_bdt: r10(cfg.utility * (0.9 + rng() * 0.2)), direction: 'out', counterparty_kind: 'utility', counterparty: 'Utility: electricity', note: 'Bill payment', hidden });
    const other = target * 0.05;
    for (let j = 0; j < 3; j++)
      out.push({ date: day(month, 2 + rng() * 26), amount_bdt: r10(other / 3), direction: 'out', counterparty_kind: 'other', counterparty: 'Mobile recharge / transport', note: 'Payment', hidden });
    if (cfg.household > 0) {
      const business = supTotal + cfg.utility + other;
      const personal = (cfg.household / (1 - cfg.household)) * business;
      const n = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < n; j++)
        out.push({ date: day(month, 1 + rng() * 27), amount_bdt: r10((personal / n) * (0.7 + rng() * 0.6)), direction: 'out', counterparty_kind: 'personal', counterparty: 'Personal: family transfer', note: 'Send money', hidden });
    }
  }

  for (const e of cfg.extra || []) {
    const d = new Date(e.date + 'T00:00:00Z');
    out.push({ date: d, amount_bdt: e.amount, direction: e.direction, counterparty_kind: e.kind, counterparty: e.counterparty, due_date: e.due ? new Date(e.due + 'T00:00:00Z') : undefined, note: e.note || 'Payment', hidden: 0 });
  }

  for (const x of cfg.extraRows || []) out.push({ ...x });

  // order within a day: inflows first, then outflows (stable, deterministic)
  out.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.direction === b.direction ? 0 : a.direction === 'in' ? -1 : 1));

  // ---- running balance; top up with an owner cash deposit if it would go negative
  let bal = cfg.startBalance ?? cfg.base * 1.2;
  const final: GenTxn[] = [];
  for (const t of out) {
    if (t.direction === 'out' && bal - t.amount_bdt < 500) {
      const dep = r10(t.amount_bdt + cfg.base * 0.2);
      bal += dep;
      final.push({ date: t.date, amount_bdt: dep, direction: 'in', counterparty_kind: 'other', counterparty: 'Cash deposit (owner)', note: 'Cash in', balance_after_bdt: bal, hidden: t.hidden });
    }
    bal += t.direction === 'in' ? t.amount_bdt : -t.amount_bdt;
    final.push({ ...t, balance_after_bdt: Math.round(bal) });
  }

  // ---- tamper: running balance edited on some rows so it no longer reconciles
  if (cfg.tamperRows) {
    const visible = final.filter((t) => !t.hidden);
    const start = Math.floor(visible.length * 0.55);
    for (let j = 0; j < cfg.tamperRows; j++) {
      const t = visible[start + j * 7];
      if (t && t.balance_after_bdt != null) t.balance_after_bdt += 7000 + j * 1500;
    }
  }
  return final;
}
