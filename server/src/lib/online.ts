import Papa from 'papaparse';
import { bnToLatinDigits } from './util';

// Parsers for online-seller evidence (v2): courier settlement CSV and the owner's order log CSV.
// Formats are our assumption of a typical Bangladeshi courier export (unconfirmed with real couriers).

export interface CourierRow {
  order_id: string;
  date: Date;
  amount_collected: number;
  fee: number;
  net_remitted: number;
  settlement_date: Date;
  courier?: string;
}
export interface OrderRow {
  order_id: string;
  date: Date;
  channel: string;
  amount: number;
  status: 'delivered' | 'returned' | 'cancelled';
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = bnToLatinDigits(String(v)).replace(/[,\s৳]|tk|bdt/gi, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
function parseDate(v?: string): Date | null {
  if (!v) return null;
  const s = bnToLatinDigits(v.trim());
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}
function pick(row: Record<string, string>, names: string[]) {
  for (const k of Object.keys(row)) if (names.includes(k.trim().toLowerCase())) return row[k];
  return undefined;
}

export function parseCourierCsv(text: string): { rows: CourierRow[]; errors: string[] } {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const rows: CourierRow[] = [];
  const errors: string[] = [];
  res.data.forEach((r, i) => {
    const order_id = (pick(r, ['order_id', 'order', 'consignment_id', 'invoice']) || '').trim();
    const date = parseDate(pick(r, ['date', 'delivery_date', 'delivered_at']));
    const settlement_date = parseDate(pick(r, ['settlement_date', 'paid_date', 'payout_date']));
    const amount_collected = num(pick(r, ['amount_collected', 'cod_amount', 'collected']));
    const fee = num(pick(r, ['fee', 'charge', 'delivery_charge'])) ?? 0;
    let net = num(pick(r, ['net_remitted', 'net', 'payout']));
    if (net == null && amount_collected != null) net = amount_collected - fee;
    if (!order_id || !date || !settlement_date || amount_collected == null || net == null) {
      errors.push(`row ${i + 2}: missing order id, dates or amounts`);
      return;
    }
    rows.push({ order_id, date, amount_collected, fee, net_remitted: net, settlement_date, courier: pick(r, ['courier', 'partner']) || undefined });
  });
  return { rows, errors };
}

export function parseOrderLogCsv(text: string): { rows: OrderRow[]; errors: string[] } {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const rows: OrderRow[] = [];
  const errors: string[] = [];
  res.data.forEach((r, i) => {
    const order_id = (pick(r, ['order_id', 'order', 'id']) || '').trim();
    const date = parseDate(pick(r, ['date', 'order_date']));
    const amount = num(pick(r, ['amount', 'total', 'price']));
    const st = (pick(r, ['status']) || '').trim().toLowerCase();
    const status = (['delivered', 'returned', 'cancelled'].includes(st) ? st : st.startsWith('return') ? 'returned' : st.startsWith('cancel') ? 'cancelled' : 'delivered') as OrderRow['status'];
    if (!order_id || !date || amount == null) {
      errors.push(`row ${i + 2}: missing order id, date or amount`);
      return;
    }
    rows.push({ order_id, date, channel: (pick(r, ['channel', 'source']) || 'online').trim(), amount, status });
  });
  return { rows, errors };
}

export function courierToCsv(rows: CourierRow[]) {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return ['order_id,date,amount_collected,fee,net_remitted,settlement_date', ...rows.map((r) => [r.order_id, d(r.date), r.amount_collected, r.fee, r.net_remitted, d(r.settlement_date)].join(','))].join('\n');
}
export function ordersToCsv(rows: OrderRow[]) {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return ['order_id,date,channel,amount,status', ...rows.map((r) => [r.order_id, d(r.date), r.channel, r.amount, r.status].join(','))].join('\n');
}

export function orderSummary(rows: OrderRow[]) {
  const n = rows.length;
  const delivered = rows.filter((r) => r.status === 'delivered').length;
  const returned = rows.filter((r) => r.status === 'returned').length;
  const cancelled = rows.filter((r) => r.status === 'cancelled').length;
  return { n, delivered, returned, cancelled, return_rate: n ? returned / n : 0 };
}
