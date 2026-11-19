import Papa from 'papaparse';
import { bnToLatinDigits, cv, mean, monthKey, monthsBetween, addMonths } from './util';

export type CounterpartyKind = 'customer' | 'supplier' | 'personal' | 'utility' | 'other';
export interface Txn {
  date: Date;
  amount_bdt: number;
  direction: 'in' | 'out';
  counterparty_kind: CounterpartyKind;
  counterparty?: string;
  balance_after_bdt?: number | null;
  due_date?: Date | null;
  note?: string;
}

export interface ParseResult {
  txns: Txn[];
  errors: string[];
  stated_totals?: { in?: number; out?: number };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = bnToLatinDigits(String(v)).replace(/[,\s৳]|tk|bdt/gi, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function pick(row: Record<string, string>, names: string[]) {
  for (const k of Object.keys(row)) {
    const kk = k.trim().toLowerCase();
    if (names.includes(kk)) return row[k];
  }
  return undefined;
}

function parseDate(v?: string): Date | null {
  if (!v) return null;
  const s = bnToLatinDigits(v.trim());
  // YYYY-MM-DD or DD/MM/YYYY
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const KINDS: CounterpartyKind[] = ['customer', 'supplier', 'personal', 'utility', 'other'];

/** Parse a mobile-money / bank statement CSV. Tolerant of common header names and Bangla numerals. */
export function parseStatementCsv(text: string): ParseResult {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const txns: Txn[] = [];
  const errors: string[] = [];
  const stated: { in?: number; out?: number } = {};
  res.data.forEach((row, i) => {
    const desc = (pick(row, ['description', 'details', 'note', 'narration']) || '').trim();
    const dateRaw = pick(row, ['date', 'txn date', 'transaction date']);
    if (/^total/i.test((dateRaw || '').trim()) || /^total/i.test(desc)) {
      stated.in = num(pick(row, ['total_in', 'credit', 'in'])) ?? stated.in;
      stated.out = num(pick(row, ['total_out', 'debit', 'out'])) ?? stated.out;
      return;
    }
    const date = parseDate(dateRaw);
    if (!date) {
      errors.push(`row ${i + 2}: unreadable date`);
      return;
    }
    let direction = (pick(row, ['direction', 'type', 'dr/cr']) || '').toLowerCase();
    let amount = num(pick(row, ['amount_bdt', 'amount']));
    const credit = num(pick(row, ['credit', 'cash in', 'in']));
    const debit = num(pick(row, ['debit', 'cash out', 'out']));
    if (amount === null && (credit || debit)) {
      amount = credit || debit;
      direction = credit ? 'in' : 'out';
    }
    if (amount === null) {
      errors.push(`row ${i + 2}: no amount`);
      return;
    }
    const dir: 'in' | 'out' = /^(in|cr|credit|cash in|received)/.test(direction) ? 'in' : 'out';
    const kindRaw = (pick(row, ['counterparty_kind', 'kind', 'category']) || '').toLowerCase() as CounterpartyKind;
    const kind: CounterpartyKind = KINDS.includes(kindRaw) ? kindRaw : dir === 'in' ? 'customer' : 'other';
    txns.push({
      date,
      amount_bdt: Math.abs(amount),
      direction: dir,
      counterparty_kind: kind,
      counterparty: pick(row, ['counterparty', 'party', 'from/to']) || undefined,
      balance_after_bdt: num(pick(row, ['balance_after_bdt', 'balance'])),
      due_date: parseDate(pick(row, ['due_date', 'due'])),
      note: desc || undefined,
    });
  });
  txns.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { txns, errors, stated_totals: stated.in || stated.out ? stated : undefined };
}

export function toCsv(txns: Txn[]): string {
  const head = 'date,description,direction,amount_bdt,balance_after_bdt,counterparty_kind,counterparty,due_date';
  const rows = txns.map((t) =>
    [
      t.date.toISOString().slice(0, 10),
      (t.note || '').replace(/,/g, ' '),
      t.direction,
      Math.round(t.amount_bdt),
      t.balance_after_bdt ?? '',
      t.counterparty_kind,
      (t.counterparty || '').replace(/,/g, ' '),
      t.due_date ? t.due_date.toISOString().slice(0, 10) : '',
    ].join(','),
  );
  return [head, ...rows].join('\n');
}

export interface MonthRow {
  month: string;
  inflow: number; // customer inflow (visible sales)
  inflow_all: number;
  outflow: number;
  supplier_out: number;
  personal_out: number;
  utility_out: number;
  inflow_count: number;
}

export interface StatementSummary {
  months: MonthRow[];
  first_month: string | null;
  last_month: string | null;
  months_history: number;
  gaps: string[];
  avg_inflow: number;
  inflow_cv: number;
  active_day_share: number;
}

export function summarise(txns: Txn[]): StatementSummary {
  if (!txns.length)
    return { months: [], first_month: null, last_month: null, months_history: 0, gaps: [], avg_inflow: 0, inflow_cv: 0, active_day_share: 0 };
  const map = new Map<string, MonthRow>();
  const days = new Set<string>();
  for (const t of txns) {
    const k = monthKey(t.date);
    if (!map.has(k))
      map.set(k, { month: k, inflow: 0, inflow_all: 0, outflow: 0, supplier_out: 0, personal_out: 0, utility_out: 0, inflow_count: 0 });
    const r = map.get(k)!;
    if (t.direction === 'in') {
      r.inflow_all += t.amount_bdt;
      if (t.counterparty_kind === 'customer') {
        r.inflow += t.amount_bdt;
        r.inflow_count++;
        days.add(t.date.toISOString().slice(0, 10));
      }
    } else {
      r.outflow += t.amount_bdt;
      if (t.counterparty_kind === 'supplier') r.supplier_out += t.amount_bdt;
      if (t.counterparty_kind === 'personal') r.personal_out += t.amount_bdt;
      if (t.counterparty_kind === 'utility') r.utility_out += t.amount_bdt;
    }
  }
  const first = monthKey(txns[0].date);
  const last = monthKey(txns[txns.length - 1].date);
  const span = monthsBetween(first, last) + 1;
  const months: MonthRow[] = [];
  const gaps: string[] = [];
  for (let i = 0; i < span; i++) {
    const k = addMonths(first, i);
    if (map.has(k)) months.push(map.get(k)!);
    else {
      gaps.push(k);
      months.push({ month: k, inflow: 0, inflow_all: 0, outflow: 0, supplier_out: 0, personal_out: 0, utility_out: 0, inflow_count: 0 });
    }
  }
  const inflows = months.map((m) => m.inflow);
  return {
    months,
    first_month: first,
    last_month: last,
    months_history: span - gaps.length,
    gaps,
    avg_inflow: mean(inflows),
    inflow_cv: cv(inflows),
    active_day_share: days.size / (span * 30),
  };
}
