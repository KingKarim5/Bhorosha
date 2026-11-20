// Auto-verification by matching (v2). Replaces the officer tick.
// A document claim becomes "checked" only on a STRONG match to the money trail. Weak, ambiguous or
// missing matches stay "owner says" and produce a question for the owner. When in doubt: owner says.

export interface WalletTxn {
  id: string;
  date: Date;
  amount_bdt: number;
  direction: 'in' | 'out';
  counterparty_kind: string;
  counterparty?: string;
  note?: string;
}
export type MatchStatus = 'checked' | 'weak' | 'unmatched' | 'duplicate' | 'pending';

const DAY = 86400000;

// ---------- supplier label matching across Bangla and English ----------
const BN_CONS: Record<string, string> = {
  ক: 'k', খ: 'kh', গ: 'g', ঘ: 'gh', ঙ: 'ng', চ: 'ch', ছ: 'chh', জ: 'j', ঝ: 'jh', ঞ: 'n', ট: 't', ঠ: 'th', ড: 'd', ঢ: 'dh', ণ: 'n',
  ত: 't', থ: 'th', দ: 'd', ধ: 'dh', ন: 'n', প: 'p', ফ: 'f', ব: 'b', ভ: 'bh', ম: 'm', য: 'j', র: 'r', ল: 'l', শ: 'sh', ষ: 'sh', স: 's',
  হ: 'h', ড়: 'r', ঢ়: 'rh', য়: 'y', ৎ: 't', 'ং': 'ng', 'ঁ': '',
};
const STOP = new Set(['supplier', 'messrs', 'ms', 'traders', 'trader', 'trading', 'store', 'stores', 'house', 'mart', 'enterprise', 'enterprises', 'co', 'ltd', 'limited', 'and', 'the', 'shop', 'buyer', 'courier', 'settlement']);
const BN_STOP = ['মেসার্স', 'ট্রেডার্স', 'ট্রেডার', 'স্টোর', 'এন্টারপ্রাইজ', 'হাউস', 'মার্ট', 'লিমিটেড'];

/** Sound skeleton of a word: consonants only, with common spelling variants folded together. */
export function skeleton(word: string): string {
  let w = word.toLowerCase();
  if (/[ঀ-৿]/.test(w)) w = [...w].map((ch) => BN_CONS[ch] ?? (/[a-z]/.test(ch) ? ch : '')).join('');
  return w
    .replace(/ph/g, 'f')
    .replace(/z/g, 'j')
    .replace(/v/g, 'b')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/[aeiouwy]/g, '')
    .replace(/(.)\1+/g, '$1');
}

export function labelTokens(label: string): string[] {
  let s = label || '';
  for (const w of BN_STOP) s = s.split(w).join(' ');
  return s
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((t) => t && !STOP.has(t.toLowerCase()))
    .map(skeleton)
    .filter((t) => t.length >= 3);
}

export function labelsMatch(a: string, b: string): boolean {
  const ta = labelTokens(a);
  const tb = labelTokens(b);
  if (!ta.length || !tb.length) return false;
  return ta.some((x) => tb.some((y) => x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))));
}

// ---------- bills -> wallet debits ----------
export interface BillIn {
  id: string;
  amount: number | null;
  date: string | null; // bill date
  paid_date?: string | null;
  supplier: string | null;
}
export interface BillMatch {
  bill_id: string;
  status: MatchStatus;
  txn_id: string | null;
  reason_en: string;
  reason_bn: string;
}

export function matchBills(bills: BillIn[], txns: WalletTxn[], usedTxn = new Set<string>()): BillMatch[] {
  const debits = txns.filter((t) => t.direction === 'out');
  const out: BillMatch[] = [];
  const seenKeys = new Map<string, string>();
  for (const b of bills) {
    if (b.amount == null || !b.date) {
      out.push({ bill_id: b.id, status: 'unmatched', txn_id: null, reason_en: 'The amount or date could not be read, so it cannot be matched.', reason_bn: 'অঙ্ক বা তারিখ পড়া যায়নি, তাই মেলানো যায়নি।' });
      continue;
    }
    const key = `${Math.round(b.amount)}|${b.date}`;
    if (seenKeys.has(key)) {
      out.push({ bill_id: b.id, status: 'duplicate', txn_id: null, reason_en: 'Same amount and date as another uploaded bill; counted once.', reason_bn: 'আরেকটি বিলের সাথে অঙ্ক ও তারিখ একই; একবারই গোনা হয়েছে।' });
      continue;
    }
    seenKeys.set(key, b.id);
    const refDates = [b.date, b.paid_date].filter(Boolean).map((d) => new Date(d + 'T00:00:00Z').getTime());
    const near = debits.filter(
      (t) => !usedTxn.has(t.id) && Math.abs(t.amount_bdt - b.amount!) <= b.amount! * 0.01 && refDates.some((d) => Math.abs(t.date.getTime() - d) <= 7 * DAY),
    );
    const strong = near.filter((t) => b.supplier && labelsMatch(b.supplier, t.counterparty || ''));
    if (strong.length === 1) {
      usedTxn.add(strong[0].id);
      out.push({ bill_id: b.id, status: 'checked', txn_id: strong[0].id, reason_en: `Matches a wallet payment of ${Math.round(strong[0].amount_bdt)} BDT on ${strong[0].date.toISOString().slice(0, 10)} to the same supplier.`, reason_bn: `${strong[0].date.toISOString().slice(0, 10)} তারিখে একই সরবরাহকারীকে ওয়ালেট থেকে ${Math.round(strong[0].amount_bdt)} টাকা পরিশোধের সাথে মিলেছে।` });
    } else if (strong.length > 1 || near.length) {
      out.push({ bill_id: b.id, status: 'weak', txn_id: null, reason_en: strong.length > 1 ? 'More than one wallet payment could fit; not counted as checked.' : 'A payment of this amount exists, but the supplier name does not match; not counted as checked.', reason_bn: strong.length > 1 ? 'একাধিক পরিশোধ মিলতে পারে; যাচাই করা ধরা হয়নি।' : 'এই অঙ্কের পরিশোধ আছে, কিন্তু সরবরাহকারীর নাম মেলে না; যাচাই করা ধরা হয়নি।' });
    } else {
      out.push({ bill_id: b.id, status: 'unmatched', txn_id: null, reason_en: 'No wallet payment matches this bill (it may have been paid in cash).', reason_bn: 'এই বিলের সাথে মেলে এমন কোনো ওয়ালেট পরিশোধ নেই (নগদে দেওয়া হতে পারে)।' });
    }
  }
  return out;
}

// ---------- courier settlements -> wallet credits ----------
export interface SettlementIn {
  id: string;
  order_id: string;
  net_remitted: number;
  settlement_date: Date;
  courier?: string;
}
export interface BatchMatch {
  batch: string; // settlement date
  row_ids: string[];
  net: number;
  status: MatchStatus;
  txn_id: string | null;
  reason_en: string;
  reason_bn: string;
}

/**
 * Couriers pay out in batches: settlement rows sharing a settlement date are summed (net of fees, including
 * partial remittances) and matched to ONE wallet credit within 0..10 days after the settlement date and
 * within 1% of the batch net. Exactly one fitting courier-labelled credit = checked. Two or more fitting
 * credits (a duplicate) or an unlabelled credit = weak. Nothing = unmatched.
 */
export function matchSettlements(rows: SettlementIn[], txns: WalletTxn[], usedTxn = new Set<string>(), maxLagDays = 10, statementEnd: Date | null = null): BatchMatch[] {
  const credits = txns.filter((t) => t.direction === 'in');
  const batches = new Map<string, SettlementIn[]>();
  for (const r of rows) {
    const k = r.settlement_date.toISOString().slice(0, 10);
    batches.set(k, [...(batches.get(k) || []), r]);
  }
  const out: BatchMatch[] = [];
  for (const [k, rs] of [...batches.entries()].sort()) {
    const net = rs.reduce((a, r) => a + r.net_remitted, 0);
    const d0 = new Date(k + 'T00:00:00Z').getTime();
    const fits = credits.filter((t) => !usedTxn.has(t.id) && t.date.getTime() >= d0 && t.date.getTime() - d0 <= maxLagDays * DAY && Math.abs(t.amount_bdt - net) <= Math.max(1, net * 0.01));
    const isCourier = (t: WalletTxn) => /courier|pathao|redx|steadfast|paperfly|sundarban|e-courier|ecourier/i.test(t.counterparty || '') || !!(rs[0].courier && labelsMatch(rs[0].courier, t.counterparty || ''));
    const labelled = fits.filter(isCourier);
    // several credits within 1% (weekly payouts of similar size): only an exact, unique, courier-labelled amount is strong
    const exact = fits.filter((t) => Math.abs(t.amount_bdt - net) <= 1);
    const strongPick = labelled.length === 1 && fits.length === 1 ? labelled[0] : exact.length === 1 && isCourier(exact[0]) ? exact[0] : null;
    const base = { batch: k, row_ids: rs.map((r) => r.id), net: Math.round(net) };
    if (strongPick) {
      labelled.splice(0, labelled.length, strongPick);
      usedTxn.add(labelled[0].id);
      out.push({ ...base, status: 'checked', txn_id: labelled[0].id, reason_en: `Payout of ${Math.round(net)} BDT matched to a wallet credit on ${labelled[0].date.toISOString().slice(0, 10)}.`, reason_bn: `${Math.round(net)} টাকার পেমেন্ট ${labelled[0].date.toISOString().slice(0, 10)} তারিখের ওয়ালেট জমার সাথে মিলেছে।` });
    } else if (fits.length) {
      out.push({ ...base, status: 'weak', txn_id: null, reason_en: fits.length > 1 ? 'More than one wallet credit fits this payout (possible duplicate); not counted as checked.' : 'A credit of this amount arrived, but it is not labelled as a courier payout; not counted as checked.', reason_bn: fits.length > 1 ? 'এই পেমেন্টের সাথে একাধিক জমা মেলে (দ্বৈত হতে পারে); যাচাই করা ধরা হয়নি।' : 'এই অঙ্কের জমা এসেছে, কিন্তু কুরিয়ারের পেমেন্ট হিসেবে চিহ্নিত নয়; যাচাই করা ধরা হয়নি।' });
    } else if (statementEnd && d0 + maxLagDays * DAY > statementEnd.getTime()) {
      out.push({ ...base, status: 'pending', txn_id: null, reason_en: 'Settled too close to the end of the statement for the wallet credit to show yet; not counted either way.', reason_bn: 'স্টেটমেন্ট শেষের খুব কাছে নিষ্পত্তি, তাই ওয়ালেটে জমা এখনো দেখা যায় না; কোনো দিকেই গোনা হয়নি।' });
    } else {
      out.push({ ...base, status: 'unmatched', txn_id: null, reason_en: `No wallet credit within ${maxLagDays} days matches this ${Math.round(net)} BDT payout.`, reason_bn: `${maxLagDays} দিনের মধ্যে ${Math.round(net)} টাকার এই পেমেন্টের সাথে মেলে এমন কোনো ওয়ালেট জমা নেই।` });
    }
  }
  return out;
}

/** Orders count as matched when a checked courier row carries their id, or a prepaid wallet credit names the order with the same amount. */
export function matchOrders(orders: { order_id: string; amount: number; status: string }[], checkedOrderIds: Set<string>, txns: WalletTxn[]) {
  const prepaid = new Map<string, number>();
  for (const t of txns) {
    const m = t.direction === 'in' && t.note?.match(/Order\s+([A-Za-z0-9-]+)/);
    if (m) prepaid.set(m[1], t.amount_bdt);
  }
  return orders.map((o) => {
    if (o.status !== 'delivered') return { order_id: o.order_id, matched: false, via: null as string | null };
    if (checkedOrderIds.has(o.order_id)) return { order_id: o.order_id, matched: true, via: 'courier' };
    const p = prepaid.get(o.order_id);
    if (p != null && Math.abs(p - o.amount) <= Math.max(1, o.amount * 0.01)) return { order_id: o.order_id, matched: true, via: 'wallet' };
    return { order_id: o.order_id, matched: false, via: null };
  });
}
