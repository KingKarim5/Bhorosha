import { Shop, Application, CheckIn, Forecast, Flag, InvestorUpdate, Commitment, SimState, Intervention, AuditLog } from '../models';
import { summarise } from '../lib/statement';
import { forecastNext, fixedThresholdFlag, classify, FlagSeverity } from '../lib/forecast';
import { addMonths, fmtBdt } from '../lib/util';
import { loadTxns } from './casefile';
import { callJson, PROMPTS, CheckinSchema } from './ai';
import { redact } from '../lib/redact';
import { z } from 'zod';
import { SIM_BASE_MONTH } from '../seed/demoShops';

export const MAX_SIM = 6;

export async function getSim() {
  let s = await SimState.findOne({ key: 'sim' });
  if (!s) s = await SimState.create({ key: 'sim', month_index: 0, base_month: SIM_BASE_MONTH });
  return s;
}

const CAUSE_TEXT: Record<string, { en: string; bn: string; act_en: string; act_bn: string }> = {
  fewer_customers: { en: 'Fewer customers', bn: 'ক্রেতা কমেছে', act_en: 'Call the owner this week. Ask what changed nearby and whether a short restructure would help.', act_bn: 'এই সপ্তাহে মালিককে ফোন করুন। আশেপাশে কী বদলেছে জানুন, স্বল্পমেয়াদি পুনর্গঠন সাহায্য করবে কিনা দেখুন।' },
  stock_problem: { en: 'Stock problem', bn: 'মালের ঘাটতি', act_en: 'Call the owner and check stock levels; suggest smaller, more frequent purchases.', act_bn: 'মালিককে ফোন করে মজুত দেখুন; কম পরিমাণে ঘন ঘন কেনার পরামর্শ দিন।' },
  higher_costs: { en: 'Higher costs', bn: 'খরচ বেড়েছে', act_en: 'Call the owner and review the largest cost lines together.', act_bn: 'মালিককে ফোন করে সবচেয়ে বড় খরচগুলো একসাথে দেখুন।' },
  buyers_paying_late: { en: 'Buyers paying late', bn: 'ক্রেতা দেরিতে টাকা দিচ্ছে', act_en: 'Call the owner about collecting the receivable; consider moving the next instalment date.', act_bn: 'পাওনা আদায় নিয়ে মালিকের সাথে কথা বলুন; পরের কিস্তির তারিখ পেছানোর কথা ভাবুন।' },
  household_mixing: { en: 'Household money mixed in', bn: 'সংসারের টাকা মিশে যাচ্ছে', act_en: 'Call the owner and suggest a separate business wallet.', act_bn: 'মালিককে ফোন করে আলাদা ব্যবসায়িক ওয়ালেটের পরামর্শ দিন।' },
  unknown: { en: 'Not clear yet', bn: 'এখনো স্পষ্ট নয়', act_en: 'Call the owner to ask how the month went.', act_bn: 'মাস কেমন গেল জানতে মালিককে ফোন করুন।' },
  no_data: { en: 'No check-in this month', bn: 'এ মাসে আপডেট আসেনি', act_en: 'No data is not distress. Send a reminder; call if a second month is missed.', act_bn: 'তথ্য না আসা মানে সমস্যা নয়। মনে করিয়ে দিন; পরের মাসেও না এলে ফোন করুন।' },
};

function cueCause(text: string): string {
  if (/ক্রেতা.{0,12}কম|customer|নতুন.*(দোকান|ফার্মেসি)|competitor/i.test(text)) return 'fewer_customers';
  if (/মাল ফুরি|স্টক|stock/i.test(text)) return 'stock_problem';
  if (/দেরিতে টাকা দিচ্ছে ক্রেতা|পাওনা|late pay/i.test(text)) return 'buyers_paying_late';
  if (/খরচ|দাম বেড়েছে|cost/i.test(text)) return 'higher_costs';
  if (/মৌসুম|শীতে|লীন|season/i.test(text)) return 'seasonal_normal';
  return 'none';
}

export async function simulateNextMonth(actor = 'manager') {
  const sim = await getSim();
  if ((sim.month_index || 0) >= MAX_SIM) return { done: true, month_index: sim.month_index, month: addMonths(sim.base_month!, (sim.month_index || 0) - 1), events: [] };
  const idx = (sim.month_index || 0) + 1;
  const month = addMonths(sim.base_month!, idx - 1);
  const shops = await Shop.find({ funded: true, cohort_flag: 'demo' }).lean();
  const events: { shop: string; month: string; actual: number; low: number; high: number; flagged: boolean; severity: FlagSeverity; baseline_flag: boolean }[] = [];

  await Promise.all(
    shops.map(async (shop) => {
      const txns = await loadTxns(shop._id, idx);
      const months = summarise(txns).months;
      const curIdx = months.findIndex((m) => m.month === month);
      if (curIdx < 1) return;
      const hist = months.slice(0, curIdx).map((m) => ({ month: m.month, value: m.inflow }));
      const actual = months[curIdx].inflow;
      const seasonal = shop.business_type === 'fish_trader';
      const fc = forecastNext(hist, shop.business_type as string, seasonal);
      const flagged = actual < fc.low;
      const baseline = fixedThresholdFlag(hist[hist.length - 1].value, actual);
      await Forecast.create({ shop: shop._id, month, expected_low: fc.low, expected_mid: fc.mid, expected_high: fc.high, actual, flagged, baseline_flag: baseline });

      const ci = await CheckIn.findOneAndUpdate({ shop: shop._id, sim_index: idx }, { revealed: true }, { new: true }).lean();
      let cueText = ci?.problem_note || '';
      let causeHint = 'none';
      let reportedSales: number | null = ci?.reported_sales_bdt ?? null;
      if (ci && ci.source !== 'missed' && cueText) {
        const r = await callJson({
          task: 'checkin_extract', system: PROMPTS.checkin, user: redact(`Reported sales: ${reportedSales ?? 'not given'} BDT. Note: ${cueText}`, [shop.owner_label as string]).text,
          schema: CheckinSchema, fallback: () => ({ sales_bdt: reportedSales, problems: cueText ? [cueText] : [], cause_hint: cueCause(cueText) as 'none' }) as z.infer<typeof CheckinSchema>,
          actor, application: undefined,
        });
        causeHint = r.data.cause_hint || 'none';
        reportedSales = (r.data.sales_bdt as number | null) ?? reportedSales;
        await CheckIn.updateOne({ _id: ci._id }, { extracted_json: { ...r.data, mode: r.mode } });
      }

      // streaks
      const recent = await Forecast.find({ shop: shop._id }).sort({ month: -1 }).limit(4).lean();
      let below = 0;
      for (const r of recent) {
        if (r.flagged) below++;
        else break;
      }
      const cis = await CheckIn.find({ shop: shop._id, revealed: true }).sort({ sim_index: -1 }).limit(3).lean();
      let missed = 0;
      for (const c of cis) {
        if (c.source === 'missed') missed++;
        else break;
      }
      const severity = classify(below, missed);
      events.push({ shop: shop.label as string, month, actual, low: fc.low, high: fc.high, flagged, severity, baseline_flag: baseline });
      if (!severity) return;

      const prevFlag = await Flag.findOne({ shop: shop._id }).sort({ month: -1 }).lean();
      const prevKey = prevFlag ? Object.keys(CAUSE_TEXT).find((k) => CAUSE_TEXT[k].en === prevFlag.probable_cause) : undefined;
      let causeKey = severity === 'no_data' && !flagged ? 'no_data' : causeHint !== 'none' && causeHint !== 'seasonal_normal' ? causeHint : 'unknown';
      if (causeKey === 'unknown' && prevKey && prevKey !== 'no_data' && prevKey !== 'unknown') causeKey = prevKey; // carry the last known cause forward
      const ct = CAUSE_TEXT[causeKey];
      const reasons: string[] = [];
      if (flagged) reasons.push(`Visible sales ${fmtBdt(actual)} BDT, below the expected ${fmtBdt(fc.low)} to ${fmtBdt(fc.high)} BDT.`);
      if (below >= 2) reasons.push(`${below} months in a row below the expected range.`);
      if (missed) reasons.push(missed >= 2 ? 'Two check-ins missed in a row.' : 'Check-in missed this month (no data, not distress).');
      if (reportedSales && reportedSales > fc.high && flagged) reasons.push(`Owner reports ${fmtBdt(reportedSales)} BDT, but the statement shows less. Kept as owner says.`);
      if (cueText) reasons.push(`Owner's note: "${cueText}"`);
      const shortfall = fc.mid ? Math.round((1 - actual / fc.mid) * 100) : 0;
      const flag = await Flag.create({
        shop: shop._id, month, severity, probable_cause: ct.en, probable_cause_bn: ct.bn,
        suggested_action: severity === 'call' && causeKey !== 'no_data' ? `Call now. ${ct.act_en}` : ct.act_en,
        suggested_action_bn: ct.act_bn, reasons, status: 'open', shortfall_pct: shortfall,
      });
      await AuditLog.create({ actor, action: 'watchman:flag', redacted_payload_json: { shop: shop.label, month, forecast: fc, actual }, output_json: { severity, cause: ct.en }, mode: 'rules' });

      // plain-words investor updates, only for real dips (never for no-data or seasonal lean months)
      if (severity === 'watch' || severity === 'call') {
        const app = await Application.findOne({ shop: shop._id }).lean();
        if (app) {
          const commits = await Commitment.find({ application: app._id }).lean();
          for (const c of commits)
            await InvestorUpdate.create({
              application: app._id, investor: c.investor, source_flag: flag._id, month, tone: 'attention',
              plain_text_en: `${month}: sales at a ${shop.business_type === 'pharmacy' ? 'pharmacy' : 'business'} you back were about ${shortfall}% below what we expected. The partner's officer is ${severity === 'call' ? 'calling the owner now' : 'keeping a close watch'}. Probable cause: ${ct.en.toLowerCase()}. The loan stays under monitoring. Investors can lose money.`,
              plain_text_bn: `${month}: আপনার সমর্থিত একটি ${shop.business_type === 'pharmacy' ? 'ফার্মেসির' : 'ব্যবসার'} বিক্রি প্রত্যাশার চেয়ে প্রায় ${shortfall}% কম। অংশীদারের অফিসার ${severity === 'call' ? 'এখন মালিককে ফোন করছেন' : 'নজর রাখছেন'}। সম্ভাব্য কারণ: ${ct.bn}। ঋণটি নজরদারিতে আছে। বিনিয়োগে লোকসান হতে পারে।`,
            });
        }
      }
    }),
  );
  sim.month_index = idx;
  await sim.save();
  return { done: idx >= MAX_SIM, month_index: idx, month, events };
}

export async function watchlist() {
  const sim = await getSim();
  const idx = sim.month_index || 0;
  const shops = await Shop.find({ funded: true, cohort_flag: 'demo' }).lean();
  const sevRank: Record<string, number> = { call: 3, watch: 2, no_data: 1 };
  const rows = await Promise.all(
    shops.map(async (shop) => {
      const txns = await loadTxns(shop._id, idx);
      const months = summarise(txns).months.map((m) => ({ month: m.month, inflow: m.inflow }));
      const forecasts = await Forecast.find({ shop: shop._id }).sort({ month: 1 }).lean();
      const flags = await Flag.find({ shop: shop._id }).sort({ month: -1 }).lean();
      const interventions = await Intervention.find({ flag: { $in: flags.map((f) => f._id) } }).sort({ createdAt: -1 }).lean();
      const app = await Application.findOne({ shop: shop._id }).lean();
      const latestFlag = flags.find((f) => f.status !== 'resolved') || null;
      const checkins = await CheckIn.find({ shop: shop._id, revealed: true }).sort({ sim_index: 1 }).lean();
      // next-month forecast for display
      const hist = months.map((m) => ({ month: m.month, value: m.inflow }));
      const next = hist.length ? forecastNext(hist, shop.business_type as string, shop.business_type === 'fish_trader') : null;
      return {
        shop_id: shop._id, application_id: app?._id, label: shop.label, business_type: shop.business_type,
        months, forecasts, next_forecast: next, flags: flags.map((f) => ({ ...f, interventions: interventions.filter((i) => String(i.flag) === String(f._id)) })),
        latest_flag: latestFlag, checkins,
        score: latestFlag ? sevRank[latestFlag.severity as string] * 100 + (latestFlag.month ? Number(String(latestFlag.month).replace('-', '')) / 1e6 : 0) : 0,
      };
    }),
  );
  rows.sort((a, b) => b.score - a.score);
  return { month_index: idx, base_month: sim.base_month, current_month: idx ? addMonths(sim.base_month!, idx - 1) : null, max: MAX_SIM, rows };
}
