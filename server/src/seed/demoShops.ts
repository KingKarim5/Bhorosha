import { GenConfig } from './generator';
import type { Stated } from '../lib/features';

// The six fictional demo shops (brief section 8). History: Nov 2025 to Oct 2026. "Now" is Nov 2026.
// Funded shops also get 6 hidden post-funding months that Simulate next month reveals one at a time.

export const HISTORY_START = '2025-11';
export const HISTORY_END = '2026-10';
export const SIM_BASE_MONTH = '2026-11';

export interface DemoShop {
  slug: string;
  label: string;
  label_bn: string;
  business_type: string;
  business_type_label: string;
  business_type_bn: string;
  owner_label: string;
  months_trading: number;
  loan_ask_bdt: number;
  tenor_months: number;
  purpose: string;
  purpose_kind: 'working_capital' | 'capex';
  status: 'filed' | 'decided' | 'funded';
  stated: Stated;
  gen: GenConfig;
  docs: { kind: 'bill' | 'note'; sample_key: string; confirm?: boolean }[];
  checkins?: { reported_sales_bdt: number | null; problem_note: string; source: string }[];
  decision?: { decision: 'approve'; reason: string }; // seeds the funded loans; text is rewritten by the Underwriter
}

const onTime = () => 0;
const mildLate = (_: number, r: () => number) => (r() < 0.05 ? 4 + r() * 3 : r() * 0.8);

export const DEMO_SHOPS: DemoShop[] = [
  {
    slug: 'rahima',
    label: 'Rahima Tea and Grocery',
    label_bn: 'রহিমা টি অ্যান্ড গ্রোসারি',
    business_type: 'tea_grocery',
    business_type_label: 'Tea stall and grocery',
    business_type_bn: 'চায়ের দোকান ও মুদি',
    owner_label: 'Rahima (demo owner)',
    months_trading: 48,
    loan_ask_bdt: 200000,
    tenor_months: 36,
    purpose: 'Stock up on fast-moving goods so the shelves do not empty mid-month',
    purpose_kind: 'working_capital',
    status: 'filed',
    stated: { cash_share: 0.6, margin: 0.2, seasonal: false, cib_status: 'clean', grace_months: 3 },
    gen: {
      seed: 101, startMonth: HISTORY_START, months: 12, base: 38000, growth: 0.02, noise: 0.03, businessType: 'tea_grocery',
      mode: 'retail', txPerDay: 1.6, stockoutDays: 4, supplierRatio: 0.6, supplierBills: 2, lateDays: mildLate, household: 0.05, utility: 1500,
      supplierNames: ['Supplier: Meghna Traders', 'Supplier: Padma Wholesale'],
      extra: [{ date: '2026-10-18', amount: 18450, kind: 'supplier', direction: 'out', counterparty: 'Supplier: Meghna Traders', due: '2026-10-19', note: 'Memo 2417' }],
    },
    docs: [
      { kind: 'bill', sample_key: 'bill_rahima' },
      { kind: 'note', sample_key: 'note_rahima' },
    ],
  },
  {
    slug: 'sultana',
    label: 'Sultana Knitwear',
    label_bn: 'সুলতানা নিটওয়্যার',
    business_type: 'knitwear',
    business_type_label: 'Sweater unit, 4 machines, 18 workers',
    business_type_bn: 'সোয়েটার কারখানা, ৪টি মেশিন, ১৮ জন কর্মী',
    owner_label: 'Sultana (demo owner)',
    months_trading: 60,
    loan_ask_bdt: 1200000,
    tenor_months: 60,
    purpose: 'Yarn and wages for the winter order season',
    purpose_kind: 'working_capital',
    status: 'funded',
    stated: { cash_share: 0.05, margin: 0.3, seasonal: false, receivable_bdt: 400000, receivable_days: 75, cib_status: 'clean', grace_months: 3 },
    gen: {
      seed: 202, startMonth: HISTORY_START, months: 12, postMonths: 6, base: 225000, growth: 0.015, noise: 0.06, businessType: 'knitwear',
      mode: 'buyers', buyers: [{ name: 'Northern Knit Exports', share: 0.45 }, { name: 'Lalbagh Apparel', share: 0.3 }, { name: 'Kumilla Fashion House', share: 0.25 }],
      supplierRatio: 0.55, supplierBills: 3, lateDays: mildLate, household: 0.04, utility: 9000,
      supplierNames: ['Supplier: Narayanganj Yarn', 'Supplier: Ashulia Dyeing', 'Supplier: Tongi Accessories'],
    },
    docs: [
      { kind: 'bill', sample_key: 'invoice_sultana', confirm: true },
      { kind: 'note', sample_key: 'note_sultana', confirm: true },
    ],
    checkins: [
      { reported_sales_bdt: 300000, problem_note: 'শীতের অর্ডার চলছে, কাজ ভালো।', source: 'owner_typed' },
      { reported_sales_bdt: 310000, problem_note: 'নর্দার্ন নিট এক্সপোর্টস অর্ধেক টাকা দিয়েছে।', source: 'owner_typed' },
      { reported_sales_bdt: null, problem_note: '', source: 'missed' },
      { reported_sales_bdt: 280000, problem_note: 'স্বাভাবিক।', source: 'owner_typed' },
      { reported_sales_bdt: 270000, problem_note: 'স্বাভাবিক।', source: 'owner_typed' },
      { reported_sales_bdt: 260000, problem_note: 'গ্রীষ্মে অর্ডার একটু কম।', source: 'owner_typed' },
    ],
    decision: { decision: 'approve', reason: 'Viable with conditions; second tranche tied to collecting the Northern Knit receivable.' },
  },
  {
    slug: 'karim',
    label: 'Karim Pharmacy',
    label_bn: 'করিম ফার্মেসি',
    business_type: 'pharmacy',
    business_type_label: 'Pharmacy',
    business_type_bn: 'ফার্মেসি',
    owner_label: 'Karim (demo owner)',
    months_trading: 84,
    loan_ask_bdt: 500000,
    tenor_months: 48,
    purpose: 'Medicine stock and a second refrigerator',
    purpose_kind: 'working_capital',
    status: 'funded',
    stated: { cash_share: 0.4, margin: 0.2, seasonal: false, cib_status: 'clean', grace_months: 2 },
    gen: {
      seed: 303, startMonth: HISTORY_START, months: 12, postMonths: 6, base: 160000, growth: 0.003, noise: 0.025, businessType: 'pharmacy',
      multiplier: (i) => [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.88, 0.78, 0.72, 0.5, 0.46, 0.5, 0.55, 0.58, 0.6][i] ?? 1,
      mode: 'retail', txPerDay: 3, supplierRatio: 0.62, supplierBills: 3,
      lateDays: (i, r) => (i >= 9 ? 6 + r() * 5 : r() < 0.04 ? 3 : r() * 1.2),
      household: 0.06, utility: 4000,
      supplierNames: ['Supplier: Square Pharma dealer', 'Supplier: Beximco dealer', 'Supplier: Renata dealer'],
    },
    docs: [{ kind: 'note', sample_key: 'note_karim', confirm: true }],
    checkins: [
      { reported_sales_bdt: 130000, problem_note: 'পাশে নতুন একটা বড় ফার্মেসি খুলেছে, ক্রেতা কমে গেছে।', source: 'owner_voice' },
      { reported_sales_bdt: 120000, problem_note: 'ক্রেতা এখনো কম, ডিলারকে দেরিতে টাকা দিচ্ছি।', source: 'owner_typed' },
      { reported_sales_bdt: 125000, problem_note: 'ছাড় দিয়ে কিছু ক্রেতা ফিরেছে।', source: 'owner_typed' },
      { reported_sales_bdt: 130000, problem_note: 'আস্তে আস্তে ভালো হচ্ছে।', source: 'owner_typed' },
      { reported_sales_bdt: 135000, problem_note: 'আগের মতো না, তবে চলছে।', source: 'owner_typed' },
      { reported_sales_bdt: 135000, problem_note: 'আগের মতো না।', source: 'owner_typed' },
    ],
    decision: { decision: 'approve', reason: 'Not sure at filing; approved with conditions (smaller first tranche, monthly check-ins) because of 7 years of trading. Watch closely.' },
  },
  {
    slug: 'nasir',
    label: 'Nasir Mobile Accessories',
    label_bn: 'নাসির মোবাইল এক্সেসরিজ',
    business_type: 'mobile_accessories',
    business_type_label: 'Accessories shop',
    business_type_bn: 'মোবাইল এক্সেসরিজের দোকান',
    owner_label: 'Nasir (demo owner)',
    months_trading: 36,
    loan_ask_bdt: 300000,
    tenor_months: 36,
    purpose: 'Bulk purchase of chargers and covers before Eid',
    purpose_kind: 'working_capital',
    status: 'filed',
    stated: { cash_share: 0.3, margin: 0.15, seasonal: false, cib_status: 'unknown' },
    gen: {
      seed: 404, startMonth: HISTORY_START, months: 12, base: 90000, growth: 0.002, noise: 0.04, businessType: 'mobile_accessories',
      mode: 'retail', txPerDay: 2.2, supplierRatio: 0.5, supplierBills: 2, lateDays: mildLate, household: 0.35, utility: 2000, startBalance: 140000,
    },
    docs: [{ kind: 'note', sample_key: 'note_nasir', confirm: true }],
  },
  {
    slug: 'jahan',
    label: 'Jahan Fish Trader',
    label_bn: 'জাহান মৎস্য ব্যবসা',
    business_type: 'fish_trader',
    business_type_label: 'Seasonal fish trader',
    business_type_bn: 'মৌসুমি মাছ ব্যবসায়ী',
    owner_label: 'Jahan (demo owner)',
    months_trading: 120,
    loan_ask_bdt: 400000,
    tenor_months: 36,
    purpose: 'Ice boxes and advance payments to boat owners before the season',
    purpose_kind: 'working_capital',
    status: 'funded',
    stated: { cash_share: 0.5, margin: 0.18, seasonal: true, cib_status: 'clean', grace_months: 4 },
    gen: {
      seed: 505, startMonth: HISTORY_START, months: 12, postMonths: 6, base: 105000, growth: 0.012, noise: 0.05, businessType: 'fish_trader', seasonal: true, profileJitter: 0.05,
      mode: 'retail', txPerDay: 2, supplierRatio: 0.6, supplierBills: 3, lateDays: onTime, household: 0.05, utility: 2500,
      supplierNames: ['Supplier: Boat owner advance', 'Supplier: Ice factory'],
    },
    docs: [{ kind: 'note', sample_key: 'note_jahan', confirm: true }],
    checkins: [
      { reported_sales_bdt: 90000, problem_note: 'মৌসুম শেষ, বিক্রি কম, প্রতি বছরের মতো।', source: 'owner_voice' },
      { reported_sales_bdt: 60000, problem_note: 'শীতে বিক্রি কম, স্বাভাবিক।', source: 'owner_typed' },
      { reported_sales_bdt: 55000, problem_note: 'স্বাভাবিক লীন মাস।', source: 'owner_typed' },
      { reported_sales_bdt: 60000, problem_note: 'আস্তে আস্তে বাড়ছে।', source: 'owner_typed' },
      { reported_sales_bdt: 80000, problem_note: 'নদীতে মাছ বাড়ছে।', source: 'owner_typed' },
      { reported_sales_bdt: 100000, problem_note: 'ভালো।', source: 'owner_typed' },
    ],
    decision: { decision: 'approve', reason: 'Viable with a wide band; seasonal pattern matches the owner note. Grace period covers the lean months.' },
  },
  {
    slug: 'tania',
    label: 'Tania Online Clothing',
    label_bn: 'তানিয়া অনলাইন ক্লোদিং',
    business_type: 'online_clothing',
    business_type_label: 'Online clothing seller',
    business_type_bn: 'অনলাইন পোশাক বিক্রেতা',
    owner_label: 'Tania (demo owner)',
    months_trading: 12,
    loan_ask_bdt: 600000,
    tenor_months: 36,
    purpose: 'Inventory for the winter collection',
    purpose_kind: 'working_capital',
    status: 'filed',
    stated: { cash_share: 0.1, margin: 0.25, seasonal: false, cib_status: 'unknown' },
    gen: {
      seed: 606, startMonth: '2026-05', months: 6, base: 105000, growth: 0.01, noise: 0.04, businessType: 'online_clothing',
      multiplier: (i) => [1, 1, 1, 1.4, 1.5, 2.4][i] ?? 1,
      mode: 'retail', txPerDay: 4, supplierRatio: 0.6, supplierBills: 2, lateDays: mildLate, household: 0.06, utility: 1200, tamperRows: 6,
      extra: [{ date: '2026-09-21', amount: 5100, kind: 'supplier', direction: 'out', counterparty: 'Supplier: Druto Courier', due: '2026-09-21', note: 'Courier charges' }],
    },
    docs: [
      { kind: 'bill', sample_key: 'bill_tania_a', confirm: true },
      { kind: 'bill', sample_key: 'bill_tania_b', confirm: true },
      { kind: 'note', sample_key: 'note_tania', confirm: true },
    ],
  },
];
