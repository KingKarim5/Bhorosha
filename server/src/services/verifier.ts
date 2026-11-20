import { Doc, CourierSettlement, OrderRecord, OwnerQuestion } from '../models';
import type { Txn } from '../lib/statement';
import { summarise } from '../lib/statement';
import { matchBills, matchSettlements, matchOrders, labelsMatch, WalletTxn, BillMatch, BatchMatch } from '../lib/matching';
import { fmtBdt, mean } from '../lib/util';

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface VerifyResult {
  txns: Txn[]; // raw wallet rows (for balance and consistency checks)
  salesTxns: Txn[]; // wallet rows where each verified courier payout is replaced by its orders, dated by delivery (for sales features)
  bills: (BillMatch & { doc: Lean })[];
  batches: BatchMatch[];
  receivableVerified: boolean;
  questionsOpened: number;
  materialOpen: number; // material items still unmatched AND unanswered
  steps: { step: string; detail: string }[];
}

const isReceivable = (d: Lean) => /receivable|sales_invoice/i.test(String(d.extracted_json?.document_type || ''));

/**
 * Verifier agent, deterministic part: match documents and courier settlements to the wallet, persist the
 * result, and ask the owner about anything that does not match. A weak match is never "checked".
 * An item is MATERIAL when its amount exceeds 10% of average monthly verified sales.
 */
export async function verify(app: Lean, shop: Lean, docs: Lean[], txns: Txn[], settlements: Lean[], orders: Lean[]): Promise<VerifyResult> {
  const steps: VerifyResult['steps'] = [];
  const wallet: WalletTxn[] = txns.map((t, i) => ({ ...t, id: t.id || `row-${i}`, counterparty_kind: t.counterparty_kind }));
  const used = new Set<string>();

  // 1. courier payouts -> wallet credits
  const batches = settlements.length
    ? matchSettlements(settlements.map((s) => ({ id: String(s._id), order_id: s.order_id, net_remitted: s.net_remitted, settlement_date: new Date(s.settlement_date), courier: s.courier })), wallet, used, 10, txns.length ? txns[txns.length - 1].date : null)
    : [];
  const checkedTxn = new Set(batches.filter((b) => b.status === 'checked').map((b) => b.txn_id!));
  const outTxns: Txn[] = txns;
  const rowsByBatch = new Map(batches.filter((b) => b.status === 'checked').map((b) => [b.txn_id!, b.row_ids]));
  const setById = new Map(settlements.map((x) => [String(x._id), x]));
  const salesTxns: Txn[] = [];
  txns.forEach((t, i) => {
    const key = t.id || `row-${i}`;
    if (!checkedTxn.has(key)) return salesTxns.push(t);
    for (const rid of rowsByBatch.get(key) || []) {
      const r = setById.get(rid);
      if (r) salesTxns.push({ date: new Date(r.date), amount_bdt: r.net_remitted, direction: 'in', counterparty_kind: 'customer', counterparty: 'Courier settlement (verified)', note: `Order ${r.order_id}`, balance_after_bdt: null });
    }
  });
  salesTxns.sort((a, b) => a.date.getTime() - b.date.getTime());
  if (settlements.length) {
    const ops = batches.flatMap((b) => b.row_ids.map((id) => ({ updateOne: { filter: { _id: id }, update: { match_status: b.status === 'duplicate' ? 'weak' : b.status, matched_txn: b.status === 'checked' ? b.txn_id : null, match_note: b.reason_en } } })));
    if (ops.length) await CourierSettlement.bulkWrite(ops);
    const c = batches.filter((b) => b.status === 'checked').length;
    const pend = batches.filter((b) => b.status === 'pending').length;
    steps.push({ step: 'match courier payouts', detail: `${c} of ${batches.length} payout batches matched to wallet credits (net of fees, lag up to 10 days)${pend ? `; ${pend} too recent to judge` : ''}` });
  }
  // 2. orders -> courier rows / prepaid credits
  if (orders.length) {
    const checkedOrders = new Set(settlements.filter((s) => batches.some((b) => b.status === 'checked' && b.row_ids.includes(String(s._id)))).map((s) => s.order_id));
    const om = matchOrders(orders as never, checkedOrders, wallet);
    const ops = om.map((m, i) => ({ updateOne: { filter: { _id: orders[i]._id }, update: { matched: m.matched, matched_via: m.via } } }));
    await OrderRecord.bulkWrite(ops);
    om.forEach((m, i) => {
      orders[i].matched = m.matched;
    });
    steps.push({ step: 'match order log', detail: `${om.filter((m) => m.matched).length} of ${orders.filter((o) => o.status === 'delivered').length} delivered orders matched to money received` });
  }
  for (const s of settlements) {
    const b = batches.find((x) => x.row_ids.includes(String(s._id)));
    s.match_status = b?.status ?? 'unmatched';
  }

  // 3. supplier bills -> wallet debits (receivable invoices are checked by the buyer relationship instead)
  const billDocs = docs.filter((d) => d.kind === 'bill' && !isReceivable(d) && d.extracted_json);
  const billRes = matchBills(
    billDocs.map((d) => ({ id: String(d._id), amount: d.extracted_json.amount_bdt ?? null, date: d.extracted_json.date ?? null, paid_date: d.extracted_json.paid_date ?? null, supplier: d.extracted_json.supplier_label ?? null })),
    wallet,
    used,
  );
  const bills = billRes.map((r) => ({ ...r, doc: billDocs.find((d) => String(d._id) === r.bill_id)! }));
  for (const b of bills)
    await Doc.updateOne({ _id: b.bill_id }, { match_status: b.status, matched_txn: b.status === 'checked' && /^[0-9a-f]{24}$/.test(b.txn_id || '') ? b.txn_id : null, match_reason_en: b.reason_en, match_reason_bn: b.reason_bn });
  if (billDocs.length) steps.push({ step: 'match bills', detail: `${bills.filter((b) => b.status === 'checked').length} of ${bills.length} bills matched to a wallet payment (amount within 1%, date within 7 days, same supplier)` });

  let receivableVerified = false;
  for (const d of docs.filter((x) => x.kind === 'bill' && isReceivable(x) && x.extracted_json)) {
    const buyer = d.extracted_json.supplier_label || '';
    const months = new Set(txns.filter((t) => t.direction === 'in' && t.counterparty_kind === 'customer' && labelsMatch(buyer, t.counterparty || '')).map((t) => t.date.toISOString().slice(0, 7)));
    receivableVerified = months.size >= 3;
    await Doc.updateOne(
      { _id: d._id },
      receivableVerified
        ? { match_status: 'relationship', match_reason_en: `The buyer paid this shop through the wallet in ${months.size} different months, so the invoice relationship is checked; the amount still owed is what the invoice says.`, match_reason_bn: `এই ক্রেতা ${months.size}টি আলাদা মাসে ওয়ালেটে টাকা দিয়েছেন, তাই চালানের সম্পর্ক যাচাই করা; বাকি অঙ্কটি চালানে যা লেখা।` }
        : { match_status: 'unmatched', match_reason_en: 'This buyer does not appear as a regular payer in the wallet.', match_reason_bn: 'এই ক্রেতা ওয়ালেটে নিয়মিত টাকা দেন না।' },
    );
    steps.push({ step: 'check receivable', detail: receivableVerified ? `buyer relationship checked (${months.size} months of payments)` : 'buyer not found in the wallet; kept as owner says' });
  }

  // 4. owner questions for anything that did not match
  const monthly = summarise(salesTxns).months.map((m) => m.inflow);
  const avgMonthly = mean(monthly.slice(-3)) || 1;
  const wanted: Lean[] = [];
  for (const b of bills.filter((x) => x.status === 'weak' || x.status === 'unmatched')) {
    const x = b.doc.extracted_json || {};
    const amt = Number(x.amount_bdt || 0);
    wanted.push({
      item_kind: 'bill', item_key: `bill:${b.bill_id}`, amount_bdt: amt, material: amt > 0.1 * avgMonthly,
      question_bn: `${x.date || 'তারিখ জানা নেই'} তারিখের ${x.supplier_label || 'সরবরাহকারীর'} ${amt ? fmtBdt(amt) + ' টাকার' : ''} বিলটি ওয়ালেটের কোনো পরিশোধের সাথে মেলেনি। এটি কীভাবে পরিশোধ করেছেন: নগদে, অন্য কোনো অ্যাকাউন্টে, নাকি এখনো বাকি?`,
      question_en: `The ${amt ? fmtBdt(amt) + ' BDT ' : ''}bill from ${x.supplier_label || 'a supplier'} dated ${x.date || 'unknown'} does not match any wallet payment. How was it paid: cash, another account, or still unpaid?`,
    });
  }
  for (const b of batches.filter((x) => x.status === 'weak' || x.status === 'unmatched'))
    wanted.push({
      item_kind: 'courier_batch', item_key: `batch:${shop._id}:${b.batch}`, amount_bdt: b.net, material: b.net > 0.1 * avgMonthly,
      question_bn: `${b.batch} তারিখের কুরিয়ার পেমেন্ট ${fmtBdt(b.net)} টাকা ওয়ালেটে ${b.status === 'weak' ? 'পরিষ্কারভাবে মেলেনি' : 'পাওয়া যায়নি'}। টাকাটা কোথায় এসেছে, নাকি এখনো আসেনি?`,
      question_en: `The courier payout of ${fmtBdt(b.net)} BDT settled on ${b.batch} ${b.status === 'weak' ? 'does not match one wallet credit clearly' : 'was not found in the wallet'}. Where did the money arrive, or has it not arrived yet?`,
    });
  let opened = 0;
  for (const q of wanted) {
    const existing = await OwnerQuestion.findOne({ application: app._id, item_key: q.item_key });
    if (!existing) {
      await OwnerQuestion.create({ ...q, application: app._id, shop: shop._id });
      opened++;
    } else if (existing.status !== 'answered') {
      existing.set({ question_bn: q.question_bn, question_en: q.question_en, material: q.material, amount_bdt: q.amount_bdt, status: 'open' });
      await existing.save();
    }
  }
  // questions whose item now matches are resolved
  const keys = new Set(wanted.map((q) => q.item_key));
  await OwnerQuestion.updateMany({ application: app._id, status: 'open', item_key: { $nin: [...keys] } }, { status: 'resolved' });
  const materialOpen = await OwnerQuestion.countDocuments({ application: app._id, material: true, status: 'open' });
  if (wanted.length) steps.push({ step: 'ask the owner', detail: `${wanted.length} item(s) did not match; ${opened} new Bangla question(s) sent; ${materialOpen} material item(s) still unanswered` });
  return { txns: outTxns, salesTxns, bills, batches, receivableVerified, questionsOpened: opened, materialOpen, steps };
}
