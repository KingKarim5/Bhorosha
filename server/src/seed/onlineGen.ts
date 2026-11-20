import { mulberry32, addMonths } from '../lib/util';
import { festivalLift } from '../lib/festivals';
import type { GenTxn } from './generator';
import type { CourierRow, OrderRow } from '../lib/online';

// Synthetic online sales for hybrid and digital-first sellers: order log, courier settlement rows and the
// wallet credits they produce (prepaid orders paid straight to the wallet; COD orders remitted by the
// courier in weekly batches, net of fees). Noise is injected on purpose: returns, cancellations, partial
// remittances, settlement lag, and optionally a batch that never reaches the wallet or a duplicate credit.

export interface OnlineConfig {
  seed: number;
  startMonth: string;
  months: number; // months covered by the CSVs the owner uploads
  postMonths?: number; // hidden wallet activity after funding
  ordersPerDay: number;
  avgOrder: number;
  growth: number; // per month
  codShare: number; // share of orders paid cash-on-delivery through the courier
  returnRate: number;
  cancelRate?: number;
  feeFlat: number;
  feePct: number;
  courier: string;
  partialRows?: number; // rows remitted at half (courier hold-back)
  dropBatch?: 'smallest' | number | null; // a settlement batch that never reaches the wallet
  duplicateCredit?: boolean; // the same batch credited twice (a bank-side duplicate)
  maxLagDays?: number; // settlement -> wallet lag (1..maxLag)
}

export interface OnlineOutput {
  orders: OrderRow[];
  settlements: CourierRow[];
  walletCredits: GenTxn[];
  truth: { batchDate: string; net: number; creditIndex: number | null; lagDays: number }[];
}

const DAY = 86400000;
const nextThursday = (d: Date) => {
  const x = new Date(d.getTime());
  do x.setUTCDate(x.getUTCDate() + 1);
  while (x.getUTCDay() !== 4);
  return x;
};

export function generateOnline(cfg: OnlineConfig): OnlineOutput {
  const rng = mulberry32(cfg.seed);
  const start = new Date(cfg.startMonth + '-01T00:00:00Z');
  const endVisible = new Date(addMonths(cfg.startMonth, cfg.months) + '-01T00:00:00Z');
  const endAll = new Date(addMonths(cfg.startMonth, cfg.months + (cfg.postMonths || 0)) + '-01T00:00:00Z');
  const orders: OrderRow[] = [];
  const settlements: CourierRow[] = [];
  const walletCredits: GenTxn[] = [];
  const batches = new Map<string, { date: Date; net: number; rows: number }>();
  const hiddenIdx = (d: Date) => {
    if (d < endVisible) return 0;
    const m = (d.getUTCFullYear() - endVisible.getUTCFullYear()) * 12 + d.getUTCMonth() - endVisible.getUTCMonth();
    return m + 1;
  };
  let n = 0;
  for (let t = start.getTime(); t < endAll.getTime(); t += DAY) {
    const day = new Date(t);
    const monthIdx = (day.getUTCFullYear() - start.getUTCFullYear()) * 12 + day.getUTCMonth() - start.getUTCMonth();
    const rate = cfg.ordersPerDay * (1 + cfg.growth) ** monthIdx * festivalLift(day);
    // Poisson-ish order count
    let k = 0;
    let p = Math.exp(-rate);
    let c = p;
    const u = rng();
    while (u > c && k < 60) {
      k++;
      p *= rate / k;
      c += p;
    }
    for (let j = 0; j < k; j++) {
      n++;
      const id = `R-${String(n).padStart(5, '0')}`;
      const amount = Math.round((cfg.avgOrder * (0.45 + rng() * 1.1)) / 10) * 10;
      const r = rng();
      const status: OrderRow['status'] = r < (cfg.cancelRate ?? 0.02) ? 'cancelled' : r < (cfg.cancelRate ?? 0.02) + cfg.returnRate ? 'returned' : 'delivered';
      const channel = ['facebook', 'instagram', 'website', 'whatsapp'][Math.floor(rng() * 4)];
      const visible = day < endVisible;
      if (visible) orders.push({ order_id: id, date: day, channel, amount, status });
      if (status !== 'delivered') continue;
      const hidden = hiddenIdx(day);
      if (rng() >= cfg.codShare) {
        // prepaid: straight to the wallet, reference carries the order id
        walletCredits.push({ date: day, amount_bdt: amount, direction: 'in', counterparty_kind: 'customer', counterparty: 'Online customer (prepaid)', note: `Order ${id}`, hidden });
        continue;
      }
      const delivered = new Date(t + (1 + Math.floor(rng() * 3)) * DAY);
      const fee = Math.round(cfg.feeFlat + cfg.feePct * amount);
      const settle = nextThursday(delivered);
      let net = amount - fee;
      if (visible && cfg.partialRows && rng() < cfg.partialRows / 400) net = Math.round(net / 2); // courier hold-back
      if (visible && settle < endVisible) settlements.push({ order_id: id, date: delivered, amount_collected: amount, fee, net_remitted: net, settlement_date: settle, courier: cfg.courier });
      const key = settle.toISOString().slice(0, 10);
      const b = batches.get(key) || { date: settle, net: 0, rows: 0 };
      b.net += net;
      b.rows++;
      batches.set(key, b);
    }
  }
  // wallet credits for courier batches
  const visibleBatches = [...batches.entries()].filter(([, b]) => b.date < endVisible);
  let drop: string | null = null;
  if (cfg.dropBatch === 'smallest' && visibleBatches.length) drop = [...visibleBatches].sort((a, b) => a[1].net - b[1].net)[0][0];
  else if (typeof cfg.dropBatch === 'number') drop = visibleBatches[cfg.dropBatch]?.[0] ?? null;
  const truth: OnlineOutput['truth'] = [];
  for (const [key, b] of batches) {
    const lag = 1 + Math.floor(rng() * (cfg.maxLagDays ?? 3));
    const credit = new Date(b.date.getTime() + lag * DAY);
    if (key === drop) {
      truth.push({ batchDate: key, net: b.net, creditIndex: null, lagDays: lag });
      continue;
    }
    walletCredits.push({ date: credit, amount_bdt: b.net, direction: 'in', counterparty_kind: 'other', counterparty: `Courier: ${cfg.courier} settlement`, note: `Payout ${key}`, hidden: hiddenIdx(credit) });
    truth.push({ batchDate: key, net: b.net, creditIndex: walletCredits.length - 1, lagDays: lag });
    if (cfg.duplicateCredit && b.date < endVisible && rng() < 0.03)
      walletCredits.push({ date: credit, amount_bdt: b.net, direction: 'in', counterparty_kind: 'other', counterparty: `Courier: ${cfg.courier} settlement`, note: `Payout ${key}`, hidden: 0 });
  }
  return { orders, settlements, walletCredits, truth };
}
