import { Shop, Application, CheckIn, Forecast, Flag, InvestorUpdate, Commitment, SimState, Intervention, AuditLog, OwnerMessage } from '../models';
import { summarise } from '../lib/statement';
import { forecastNext, forecastNextWeek, fixedThresholdFlag, classify, FlagSeverity, WeekPoint } from '../lib/forecast';
import { isPostFestival, windowLift } from '../lib/festivals';
import { addMonths, fmtBdt, monthKey } from '../lib/util';
import { loadTxns } from './casefile';
import { callJson, PROMPTS, CheckinSchema } from './ai';
import { redact } from '../lib/redact';
import { z } from 'zod';
import { SIM_BASE_MONTH } from '../seed/demoShops';
import { checkBreaker } from './policy';
import type { Txn } from '../lib/statement';

// Watchman agent (v2): weekly cadence for hybrid and digital-first shops, monthly for cash-led shops,
// festival-aware. Servicer agent: supportive Bangla messages to the owner, a policy-allowed repayment-date
// shift at call level (simulated), plain updates to investors, all logged in the intervention log.

type Lean = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400000;
export const SIM_START = `${SIM_BASE_MONTH}-01`;
export const SIM_END = `${addMonths(SIM_BASE_MONTH, 6)}-01`;
export const MAX_SIM = 6;
const d = (s: string) => new Date(s + 'T00:00:00Z');
const iso = (x: Date) => x.toISOString().slice(0, 10);
const cadenceOf = (shop: Lean) => (shop.segment === 'hybrid' || shop.segment === 'digital_first' ? 'weekly' : 'monthly');

export async function getSim() {
  let s = await SimState.findOne({ key: 'sim' });
  if (!s) s = await SimState.create({ key: 'sim', month_index: 0, base_month: SIM_BASE_MONTH, day: SIM_START });
  if (!s.day) {
    s.day = SIM_START;
    await s.save();
  }
  return s;
}

/** Sales the watchman monitors: customer inflows plus courier payouts from couriers verified at filing. */
function salesRows(txns: Txn[], courierLabels: Set<string>) {
  return txns.filter((t) => t.direction === 'in' && (t.counterparty_kind === 'customer' || (t.counterparty && courierLabels.has(t.counterparty))));
}

const CAUSE_TEXT: Record<string, { en: string; bn: string; act_en: string; act_bn: string }> = {
  fewer_customers: { en: 'Fewer customers', bn: 'ক্রেতা কমেছে', act_en: 'Talk with the owner this week about what changed nearby and whether a short restructure would help.', act_bn: 'এই সপ্তাহে আশেপাশে কী বদলেছে তা নিয়ে মালিকের সাথে কথা বলুন; স্বল্পমেয়াদি পুনর্গঠন সাহায্য করবে কিনা দেখুন।' },
  stock_problem: { en: 'Stock problem', bn: 'মালের ঘাটতি', act_en: 'Check stock levels with the owner; suggest smaller, more frequent purchases.', act_bn: 'মালিকের সাথে মজুত দেখুন; কম পরিমাণে ঘন ঘন কেনার পরামর্শ দিন।' },
  higher_costs: { en: 'Higher costs', bn: 'খরচ বেড়েছে', act_en: 'Review the largest cost lines with the owner.', act_bn: 'মালিকের সাথে সবচেয়ে বড় খরচগুলো দেখুন।' },
  buyers_paying_late: { en: 'Buyers paying late', bn: 'ক্রেতা দেরিতে টাকা দিচ্ছে', act_en: 'Support collection of the receivable; consider moving the next instalment date.', act_bn: 'পাওনা আদায়ে সহায়তা করুন; পরের কিস্তির তারিখ পেছানোর কথা ভাবুন।' },
  unknown: { en: 'Not clear yet', bn: 'এখনো স্পষ্ট নয়', act_en: 'Ask the owner how the period went.', act_bn: 'সময়টা কেমন গেল, মালিককে জিজ্ঞেস করুন।' },
  no_data: { en: 'No check-in this period', bn: 'এই সময়ে আপডেট আসেনি', act_en: 'No data is not distress. Send a reminder; escalate if a second period is missed.', act_bn: 'তথ্য না আসা মানে সমস্যা নয়। মনে করিয়ে দিন; পরেরবারও না এলে গুরুত্ব বাড়ান।' },
};

function cueCause(text: string): string {
  if (/ক্রেতা.{0,12}কম|customer|নতুন.*(দোকান|ফার্মেসি)|competitor/i.test(text)) return 'fewer_customers';
  if (/মাল ফুরি|স্টক|stock/i.test(text)) return 'stock_problem';
  if (/দেরিতে টাকা দিচ্ছে ক্রেতা|পাওনা|late pay/i.test(text)) return 'buyers_paying_late';
  if (/খরচ|দাম বেড়েছে|cost/i.test(text)) return 'higher_costs';
  if (/মৌসুম|শীতে|লীন|season|ঈদ/i.test(text)) return 'seasonal_normal';
  return 'none';
}

interface Evaluated {
  shop: Lean;
  period: string;
  cadence: 'weekly' | 'monthly';
  actual: number;
  fc: { low: number; mid: number; high: number };
  flagged: boolean;
  baseline: boolean;
  missed: boolean;
  note: string;
  reportedSales: number | null;
  causeHint: string;
}

/** Servicer: on a flag, write to the owner (supportive Bangla), offer a repayment-date shift at call level, update investors, log it all. */
async function service(e: Evaluated, severity: FlagSeverity, below: number, missed: number, actor: string) {
  const causeKey = severity === 'no_data' && !e.flagged ? 'no_data' : e.causeHint !== 'none' && e.causeHint !== 'seasonal_normal' ? e.causeHint : 'unknown';
  const prevFlag = await Flag.findOne({ shop: e.shop._id }).sort({ createdAt: -1 }).lean();
  const prevKey = prevFlag ? Object.keys(CAUSE_TEXT).find((k) => CAUSE_TEXT[k].en === prevFlag.probable_cause) : undefined;
  const key = causeKey === 'unknown' && prevKey && prevKey !== 'no_data' && prevKey !== 'unknown' ? prevKey : causeKey;
  const ct = CAUSE_TEXT[key];
  const unit = e.cadence === 'weekly' ? { en: 'week', bn: 'সপ্তাহ' } : { en: 'month', bn: 'মাস' };
  const reasons: string[] = [];
  if (e.flagged) reasons.push(`Sales ${fmtBdt(e.actual)} BDT this ${unit.en}, below the expected ${fmtBdt(e.fc.low)} to ${fmtBdt(e.fc.high)} BDT.`);
  if (below >= 2) reasons.push(`${below} ${unit.en}s in a row below the expected range.`);
  if (missed) reasons.push(missed >= 2 ? 'Two check-ins missed in a row.' : 'Check-in missed (no data, not distress).');
  if (e.reportedSales && e.reportedSales > e.fc.high && e.flagged) reasons.push(`Owner reports ${fmtBdt(e.reportedSales)} BDT, but the wallet shows less. Kept as owner says.`);
  if (e.note) reasons.push(`Owner's note: "${e.note}"`);
  const shortfall = e.fc.mid ? Math.round((1 - e.actual / e.fc.mid) * 100) : 0;
  const flag = await Flag.create({
    shop: e.shop._id, month: e.period, cadence: e.cadence, severity, probable_cause: ct.en, probable_cause_bn: ct.bn,
    suggested_action: ct.act_en, suggested_action_bn: ct.act_bn, reasons, status: 'open', shortfall_pct: shortfall,
  });
  await AuditLog.create({ actor, action: 'watchman:flag', agent: 'Watchman', step: `${e.cadence} check ${e.period}`, redacted_payload_json: { shop: e.shop.label, period: e.period, forecast: e.fc, actual: e.actual }, output_json: { severity, cause: ct.en }, mode: 'rules' });

  const app = await Application.findOne({ shop: e.shop._id }).lean();
  // owner message (supportive first, never punitive)
  const ownerBn =
    severity === 'no_data'
      ? `এই ${unit.bn}ের আপডেট আমরা পাইনি। সময় পেলে ছোট একটি আপডেট পাঠাবেন। এটি কোনো সমস্যার লক্ষণ নয়।`
      : `এই ${unit.bn}ে আপনার বিক্রি প্রত্যাশার চেয়ে প্রায় ${shortfall}% কম দেখা যাচ্ছে। চিন্তা করবেন না, আমরা পাশে আছি। সম্ভাব্য কারণ: ${ct.bn}। কী হয়েছে জানালে আমরা সাহায্যের উপায় খুঁজব।`;
  const ownerEn =
    severity === 'no_data'
      ? `We did not get your update this ${unit.en}. Send a short one when you can. This is not a sign of trouble.`
      : `Your sales this ${unit.en} look about ${shortfall}% below what we expected. We are here to help. Probable cause: ${ct.en.toLowerCase()}. Tell us what happened and we will look for ways to support you.`;
  await OwnerMessage.create({ shop: e.shop._id, application: app?._id, flag: flag._id, kind: 'watchman', text_bn: ownerBn, text_en: ownerEn });
  await Intervention.create({ flag: flag._id, actor: 'Servicer agent', action: 'Sent a supportive message to the owner (Bangla)', result_note: severity === 'no_data' ? 'reminder' : `shortfall about ${shortfall}%` });
  if (severity === 'call' && e.flagged) {
    await OwnerMessage.create({
      shop: e.shop._id, application: app?._id, flag: flag._id, kind: 'offer',
      text_bn: 'আপনার ঋণদাতার নীতি অনুযায়ী পরের কিস্তির তারিখ ১৪ দিন পিছিয়ে নেওয়া যায় (সিমুলেটেড)। চাইলে নিচের বোতামে গ্রহণ করুন।',
      text_en: "Under your lender's policy, the next instalment date can move back by 14 days (simulated). Accept below if it helps.",
      offer: { type: 'repayment_date_shift', days: 14, status: 'offered' },
    });
    await Intervention.create({ flag: flag._id, actor: 'Servicer agent', action: 'Offered a 14-day repayment-date shift (policy-allowed, simulated)', result_note: 'awaiting owner' });
  }
  // investor updates, only for real dips (never for no-data or seasonal/festival lulls)
  if ((severity === 'watch' || severity === 'call') && app) {
    const commits = await Commitment.find({ application: app._id }).lean();
    const kind = e.shop.business_type === 'pharmacy' ? { en: 'pharmacy', bn: 'ফার্মেসির' } : { en: 'business', bn: 'ব্যবসার' };
    for (const c of commits)
      await InvestorUpdate.create({
        application: app._id, investor: c.investor, source_flag: flag._id, month: e.period, tone: 'attention',
        plain_text_en: `${e.period}: sales at a ${kind.en} you back were about ${shortfall}% below what we expected this ${unit.en}. The Servicer agent has contacted the owner${severity === 'call' ? ' and offered a short repayment-date shift (simulated)' : ''}. Probable cause: ${ct.en.toLowerCase()}. The loan stays under monitoring. Investors can lose money.`,
        plain_text_bn: `${e.period}: আপনার সমর্থিত একটি ${kind.bn} বিক্রি এই ${unit.bn}ে প্রত্যাশার চেয়ে প্রায় ${shortfall}% কম। সার্ভিসার এজেন্ট মালিকের সাথে যোগাযোগ করেছে${severity === 'call' ? ' এবং কিস্তির তারিখ কিছুটা পেছানোর প্রস্তাব দিয়েছে (সিমুলেটেড)' : ''}। সম্ভাব্য কারণ: ${ct.bn}। ঋণটি নজরদারিতে আছে। বিনিয়োগে লোকসান হতে পারে।`,
      });
    if (commits.length) await Intervention.create({ flag: flag._id, actor: 'Servicer agent', action: `Sent a plain update to ${commits.length} investor(s)`, result_note: 'simulation' });
  }
}

async function evaluateMonth(shop: Lean, month: string, actor: string, allTxns: Txn[]): Promise<Evaluated | null> {
  const end = d(`${addMonths(month, 1)}-01`);
  const all = allTxns.filter((t) => t.date < end);
  const courier = new Set(all.filter((t) => /courier/i.test(t.counterparty || '')).map((t) => t.counterparty!));
  const months = summarise(salesRows(all, courier).map((t) => ({ ...t, counterparty_kind: 'customer' }))).months;
  const idx = months.findIndex((m) => m.month === month);
  if (idx < 1) return null;
  const hist = months.slice(0, idx).map((m) => ({ month: m.month, value: m.inflow }));
  const actual = months[idx].inflow;
  const fc = forecastNext(hist, shop.business_type, shop.business_type === 'fish_trader');
  const simIdx = Math.round((d(`${month}-01`).getTime() - d(SIM_START).getTime()) / (30.4 * DAY)) + 1;
  const ci = await CheckIn.findOneAndUpdate({ shop: shop._id, sim_index: simIdx }, { revealed: true }, { new: true }).lean();
  const note = ci?.problem_note || '';
  let causeHint = 'none';
  let reportedSales: number | null = ci?.reported_sales_bdt ?? null;
  if (ci && ci.source !== 'missed' && note) {
    const r = await callJson({
      task: 'checkin_extract', system: PROMPTS.checkin, user: redact(`Reported sales: ${reportedSales ?? 'not given'} BDT. Note: ${note}`, [shop.owner_label]).text,
      schema: CheckinSchema, fallback: () => ({ sales_bdt: reportedSales, problems: note ? [note] : [], cause_hint: cueCause(note) as 'none' }) as z.infer<typeof CheckinSchema>,
      actor, agent: 'Watchman', timeoutMs: 8000,
    });
    causeHint = r.data.cause_hint || 'none';
    reportedSales = (r.data.sales_bdt as number | null) ?? reportedSales;
    await CheckIn.updateOne({ _id: ci._id }, { extracted_json: { ...r.data, mode: r.mode } });
  }
  return { shop, period: month, cadence: 'monthly', actual, fc, flagged: actual < fc.low, baseline: fixedThresholdFlag(hist[hist.length - 1].value, actual), missed: ci?.source === 'missed', note, reportedSales, causeHint };
}

async function evaluateWeek(shop: Lean, weekStart: Date, allTxns: Txn[]): Promise<Evaluated | null> {
  const end = new Date(weekStart.getTime() + 7 * DAY);
  const all = allTxns.filter((t) => t.date < end);
  const courier = new Set(all.filter((t) => /courier/i.test(t.counterparty || '')).map((t) => t.counterparty!));
  const sales = salesRows(all, courier);
  if (!sales.length) return null;
  const first = sales[0].date.getTime();
  const weeks: WeekPoint[] = [];
  for (let s = weekStart.getTime() - Math.floor((weekStart.getTime() - first) / (7 * DAY)) * 7 * DAY; s < end.getTime(); s += 7 * DAY) weeks.push({ start: new Date(s), value: 0 });
  for (const t of sales) {
    const i = Math.floor((t.date.getTime() - weeks[0].start.getTime()) / (7 * DAY));
    if (i >= 0 && i < weeks.length) weeks[i].value += t.amount_bdt;
  }
  const hist = weeks.slice(0, -1);
  const cur = weeks[weeks.length - 1];
  if (hist.length < 8) return null;
  const fc = forecastNextWeek(hist, shop.online_share ?? 0.5, cur.start);
  // the fixed baseline: alarm when a week falls more than 30% below the previous week
  return { shop, period: iso(cur.start), cadence: 'weekly', actual: Math.round(cur.value), fc, flagged: cur.value < fc.low, baseline: fixedThresholdFlag(hist[hist.length - 1].value, cur.value), missed: false, note: isPostFestival(cur.start) ? 'Post-festival week: a quieter week is expected.' : windowLift(cur.start, 7) > 1.05 ? 'Festival rush week.' : '', reportedSales: null, causeHint: 'none' };
}

async function record(e: Evaluated, actor: string) {
  await Forecast.create({ shop: e.shop._id, month: e.period, cadence: e.cadence, expected_low: e.fc.low, expected_mid: e.fc.mid, expected_high: e.fc.high, actual: e.actual, flagged: e.flagged, baseline_flag: e.baseline });
  const recent = await Forecast.find({ shop: e.shop._id, cadence: e.cadence }).sort({ createdAt: -1 }).limit(4).lean();
  let below = 0;
  for (const r of recent) {
    if (r.flagged) below++;
    else break;
  }
  let missed = 0;
  if (e.cadence === 'monthly') {
    const cis = await CheckIn.find({ shop: e.shop._id, revealed: true }).sort({ sim_index: -1 }).limit(3).lean();
    for (const c of cis) {
      if (c.source === 'missed') missed++;
      else break;
    }
  }
  const severity = classify(below, missed);
  if (severity) await service(e, severity, below, missed, actor);
  return severity;
}

/** Advance the simulation clock by a week or to the start of the next month, running every check that falls due. */
export async function simulate(step: 'week' | 'month', actor = 'lender') {
  const sim = await getSim();
  const from = d(sim.day!);
  const endCap = d(SIM_END);
  if (from >= endCap) return { done: true, day: sim.day, events: [] };
  let to = step === 'week' ? new Date(from.getTime() + 7 * DAY) : d(`${addMonths(monthKey(from), 1)}-01`);
  if (to > endCap) to = endCap;
  const shops = await Shop.find({ funded: true, cohort_flag: 'demo' }).lean();
  const events: Lean[] = [];
  // shops are independent: run them in parallel, each loading its rows once
  await Promise.all(shops.map(async (shop) => {
    const allTxns = await loadTxns(shop._id, MAX_SIM);
    const due: Evaluated[] = [];
    if (cadenceOf(shop) === 'monthly') {
      // months that complete inside (from, to]
      for (let m = monthKey(new Date(from.getTime() - DAY)); d(`${addMonths(m, 1)}-01`) <= to; m = addMonths(m, 1)) {
        const end = d(`${addMonths(m, 1)}-01`);
        if (end > from && m >= SIM_BASE_MONTH) {
          const e = await evaluateMonth(shop, m, actor, allTxns);
          if (e) due.push(e);
        }
      }
    } else {
      // weeks (aligned to the simulation start) that complete inside (from, to]
      const base = d(SIM_START).getTime();
      for (let s = base; s + 7 * DAY <= to.getTime(); s += 7 * DAY) {
        if (s + 7 * DAY > from.getTime()) {
          const e = await evaluateWeek(shop, new Date(s), allTxns);
          if (e) due.push(e);
        }
      }
    }
    for (const e of due) {
      const severity = await record(e, actor);
      events.push({ shop: shop.label, cadence: e.cadence, period: e.period, actual: e.actual, low: e.fc.low, high: e.fc.high, flagged: e.flagged, severity, baseline_flag: e.baseline, note: e.note });
    }
  }));
  events.sort((a, b) => String(a.shop).localeCompare(String(b.shop)) || String(a.period).localeCompare(String(b.period)));
  sim.day = iso(to);
  sim.month_index = Math.max(0, Math.round((to.getTime() - d(SIM_START).getTime()) / (30.4 * DAY)));
  await sim.save();
  await AuditLog.create({ actor, action: `watchman:simulate_${step}`, agent: 'Watchman', step: `advance to ${iso(to)}`, redacted_payload_json: {}, output_json: { events: events.length, flagged: events.filter((x) => x.severity).length }, mode: 'rules' });
  const breaker = await checkBreaker(actor);
  return { done: to >= endCap, day: iso(to), events, breaker };
}

export async function simulateNextMonth(actor = 'lender') {
  return simulate('month', actor);
}

export async function watchlist() {
  const sim = await getSim();
  const now = d(sim.day!);
  const shops = await Shop.find({ funded: true, cohort_flag: 'demo' }).lean();
  const sevRank: Record<string, number> = { call: 3, watch: 2, no_data: 1 };
  const rows = await Promise.all(
    shops.map(async (shop) => {
      const cadence = cadenceOf(shop);
      const all = (await loadTxns(shop._id, MAX_SIM)).filter((t) => t.date < now);
      const courier = new Set(all.filter((t) => /courier/i.test(t.counterparty || '')).map((t) => t.counterparty!));
      const sales = salesRows(all, courier);
      let series: { month: string; inflow: number }[];
      if (cadence === 'monthly') series = summarise(sales.map((t) => ({ ...t, counterparty_kind: 'customer' }))).months.map((m) => ({ month: m.month, inflow: m.inflow }));
      else {
        const base = d(SIM_START).getTime();
        const firstWeek = base - 26 * 7 * DAY; // last 26 weeks of history plus simulated weeks
        const map = new Map<number, number>();
        for (const t of sales) {
          const i = Math.floor((t.date.getTime() - firstWeek) / (7 * DAY));
          if (i >= 0) map.set(i, (map.get(i) || 0) + t.amount_bdt);
        }
        series = [];
        for (let i = 0; firstWeek + (i + 1) * 7 * DAY <= now.getTime(); i++) series.push({ month: iso(new Date(firstWeek + i * 7 * DAY)), inflow: Math.round(map.get(i) || 0) });
      }
      const forecasts = await Forecast.find({ shop: shop._id }).sort({ month: 1 }).lean();
      const flags = await Flag.find({ shop: shop._id }).sort({ createdAt: -1 }).lean();
      const interventions = await Intervention.find({ flag: { $in: flags.map((f) => f._id) } }).sort({ createdAt: 1 }).lean();
      const app = await Application.findOne({ shop: shop._id }).lean();
      const latestFlag = flags.find((f) => f.status !== 'resolved') || null;
      const checkins = await CheckIn.find({ shop: shop._id, revealed: true }).sort({ sim_index: 1 }).lean();
      return {
        shop_id: shop._id, application_id: app?._id, label: shop.label, business_type: shop.business_type, segment: shop.segment, cadence,
        months: series, forecasts, next_forecast: null,
        flags: flags.map((f) => ({ ...f, interventions: interventions.filter((i) => String(i.flag) === String(f._id)) })),
        latest_flag: latestFlag, checkins,
        score: latestFlag ? sevRank[latestFlag.severity as string] * 1e12 + new Date(latestFlag.createdAt as Date).getTime() / 1000 : 0,
      };
    }),
  );
  rows.sort((a, b) => b.score - a.score);
  return { day: sim.day, start: SIM_START, end: SIM_END, done: now >= d(SIM_END), month_index: sim.month_index, current_month: sim.day !== SIM_START ? sim.day : null, max: MAX_SIM, rows };
}
