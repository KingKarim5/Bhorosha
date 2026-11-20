import { GenConfig } from './generator';
import type { OnlineConfig } from './onlineGen';
import type { Stated } from '../lib/features';

// The nine fictional demo shops. Every loan sits inside the v3 limits (Tk 1,000,000, 12 months) except
// Hasan, whose request is deliberately outside them to show the Counter-offer agent. History: Nov 2025 to Oct 2026. "Now" is Nov 2026.
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
  segment: 'cash_led' | 'hybrid' | 'digital_first';
  offline_share: number;
  online_share: number;
  online?: OnlineConfig; // order log + courier settlements (hybrid / digital_first)
  stated: Stated;
  gen: GenConfig;
  docs: { kind: 'bill' | 'note'; sample_key: string; confirm?: boolean }[];
  checkins?: { reported_sales_bdt: number | null; problem_note: string; source: string }[];
  contract?: { earlyClause?: string; lateClause?: string }; // wording overrides for the generated loan contract
  repayments?: { lateDays: number[]; partial?: number[]; noRef?: number[]; payer?: string }; // simulated repayment behaviour per instalment (index 0 = first)
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
    loan_ask_bdt: 70000,
    tenor_months: 12,
    purpose: 'Stock up on fast-moving goods so the shelves do not empty mid-month',
    purpose_kind: 'working_capital',
    status: 'filed',
    segment: 'cash_led',
    offline_share: 1,
    online_share: 0,
    stated: { cash_share: 0.6, margin: 0.2, seasonal: false, cib_status: 'clean', grace_months: 3 },
    gen: {
      seed: 101, startMonth: HISTORY_START, months: 12, base: 38000, growth: 0.02, noise: 0.03, businessType: 'tea_grocery',
      mode: 'retail', txPerDay: 1.6, stockoutDays: 4, supplierRatio: 0.6, supplierBills: 2, lateDays: mildLate, household: 0.05, utility: 1500,
      supplierNames: ['Supplier: Meghna Traders', 'Supplier: Padma Wholesale'],
      extra: [{ date: '2026-10-18', amount: 18450, kind: 'supplier', direction: 'out', counterparty: 'Supplier: Meghna Traders', due: '2026-10-19', note: 'Memo 2417' }],
    },
    docs: [
      { kind: 'bill', sample_key: 'bill_rahima' },
      { kind: 'bill', sample_key: 'bill_rahima_b' },
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
    loan_ask_bdt: 600000,
    tenor_months: 12,
    purpose: 'Yarn and wages for the winter order season',
    purpose_kind: 'working_capital',
    status: 'funded',
    segment: 'cash_led',
    offline_share: 1,
    online_share: 0,
    stated: { cash_share: 0.05, margin: 0.3, seasonal: false, receivable_bdt: 400000, receivable_days: 75, cib_status: 'clean', grace_months: 3 },
    gen: {
      seed: 202, startMonth: HISTORY_START, months: 12, postMonths: 6, base: 490000, growth: 0.015, noise: 0.06, businessType: 'knitwear',
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
    repayments: { lateDays: [0, -1, 1, -6, 0, 0] },
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
    loan_ask_bdt: 140000,
    tenor_months: 12,
    purpose: 'Medicine stock and a second refrigerator',
    purpose_kind: 'working_capital',
    status: 'funded',
    segment: 'cash_led',
    offline_share: 1,
    online_share: 0,
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
    repayments: { lateDays: [0, 9, 14, 12, 8, 6], partial: [2] },
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
    loan_ask_bdt: 105000,
    tenor_months: 12,
    purpose: 'Bulk purchase of chargers and covers before Eid',
    purpose_kind: 'working_capital',
    status: 'filed',
    segment: 'cash_led',
    offline_share: 1,
    online_share: 0,
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
    loan_ask_bdt: 140000,
    tenor_months: 12,
    purpose: 'Ice boxes and advance payments to boat owners before the season',
    purpose_kind: 'working_capital',
    status: 'funded',
    segment: 'cash_led',
    offline_share: 1,
    online_share: 0,
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
    repayments: { lateDays: [0, 6, 7, 2, 0, -1] },
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
    loan_ask_bdt: 210000,
    tenor_months: 12,
    purpose: 'Inventory for the winter collection',
    purpose_kind: 'working_capital',
    status: 'filed',
    segment: 'digital_first',
    offline_share: 0.1,
    online_share: 0.9,
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
  {
    slug: 'rafi',
    label: 'Rafi Attar and Decants',
    label_bn: 'রাফি আতর অ্যান্ড ডিক্যান্টস',
    business_type: 'attar_online',
    business_type_label: 'Attar and perfume decants, shop plus online',
    business_type_bn: 'আতর ও পারফিউম ডিক্যান্ট, দোকান ও অনলাইন',
    owner_label: 'Rafi (demo owner)',
    months_trading: 40,
    loan_ask_bdt: 120000,
    tenor_months: 12,
    purpose: 'Oud oil and bottle stock ahead of the Eid season',
    purpose_kind: 'working_capital',
    status: 'funded',
    segment: 'hybrid',
    offline_share: 0.4,
    online_share: 0.6,
    stated: { cash_share: 0.4, margin: 0.3, seasonal: false, cib_status: 'clean', grace_months: 2 },
    online: {
      seed: 707, startMonth: HISTORY_START, months: 12, postMonths: 6, ordersPerDay: 4.5, avgOrder: 600, growth: 0.03,
      codShare: 0.7, returnRate: 0.06, feeFlat: 60, feePct: 0.01, courier: 'Pathao', partialRows: 3, dropBatch: 'smallest',
    },
    gen: {
      seed: 707, startMonth: HISTORY_START, months: 12, postMonths: 6, base: 11000, growth: 0.03, noise: 0.05, businessType: 'attar_online',
      mode: 'retail', txPerDay: 0.6, supplierRatio: 4.2, supplierBills: 2, lateDays: (_: number, r: () => number) => (r() < 0.04 ? 4 : r() * 0.8), household: 0.06, utility: 1800, startBalance: 60000,
      supplierNames: ['Supplier: Chawkbazar Attar House', 'Supplier: Gulistan Bottle Mart'],
    },
    docs: [{ kind: 'note', sample_key: 'note_rafi', confirm: true }],
    checkins: [
      { reported_sales_bdt: 150000, problem_note: 'শীতে আতরের চাহিদা ভালো।', source: 'owner_typed' },
      { reported_sales_bdt: 155000, problem_note: 'বিয়ের মৌসুমে অর্ডার বেড়েছে।', source: 'owner_typed' },
      { reported_sales_bdt: 150000, problem_note: 'স্বাভাবিক।', source: 'owner_typed' },
      { reported_sales_bdt: 210000, problem_note: 'ঈদের আগে অনেক অর্ডার।', source: 'owner_typed' },
      { reported_sales_bdt: 140000, problem_note: 'ঈদের পরে একটু কম, স্বাভাবিক।', source: 'owner_typed' },
      { reported_sales_bdt: 160000, problem_note: 'পহেলা বৈশাখের অর্ডার।', source: 'owner_typed' },
    ],
    decision: { decision: 'approve', reason: 'Hybrid seller; courier settlements match the wallet.' },
    repayments: { lateDays: [0, 0, 1, 0, -2, 0], noRef: [1, 3], payer: 'Rafi personal bKash' },
  },
  {
    slug: 'mitu',
    label: 'Mitu Beauty Corner',
    label_bn: 'মিতু বিউটি কর্নার',
    business_type: 'cosmetics',
    business_type_label: 'Cosmetics and toiletries shop',
    business_type_bn: 'প্রসাধনী ও টয়লেট্রিজের দোকান',
    owner_label: 'Mitu (demo owner)',
    months_trading: 30,
    loan_ask_bdt: 90000,
    tenor_months: 12,
    purpose: 'Stock of fast-selling cosmetics before the wedding season',
    purpose_kind: 'working_capital',
    status: 'filed',
    segment: 'cash_led',
    offline_share: 1,
    online_share: 0,
    stated: { cash_share: 0.5, margin: 0.22, seasonal: false, cib_status: 'clean', grace_months: 1 },
    gen: {
      seed: 808, startMonth: HISTORY_START, months: 12, base: 52000, growth: 0.015, noise: 0.03, businessType: 'cosmetics',
      mode: 'retail', txPerDay: 1.8, supplierRatio: 0.55, supplierBills: 2, lateDays: onTime, household: 0.05, utility: 1300,
      supplierNames: ['Supplier: Chawkbazar Cosmetics', 'Supplier: Mouchak Wholesale'],
    },
    docs: [],
    contract: { lateClause: 'Late repayment: a late fee may apply, as agreed verbally with the branch officer.' },
  },
  {
    slug: 'hasan',
    label: 'Hasan Hardware Store',
    label_bn: 'হাসান হার্ডওয়্যার স্টোর',
    business_type: 'hardware',
    business_type_label: 'Hardware and building supplies',
    business_type_bn: 'হার্ডওয়্যার ও নির্মাণসামগ্রী',
    owner_label: 'Hasan (demo owner)',
    months_trading: 96,
    loan_ask_bdt: 1500000,
    tenor_months: 24,
    purpose: 'Cement, rods and paint stock for the building season',
    purpose_kind: 'working_capital',
    status: 'filed',
    segment: 'cash_led',
    offline_share: 1,
    online_share: 0,
    stated: { cash_share: 0.5, margin: 0.18, seasonal: false, cib_status: 'clean', grace_months: 2 },
    gen: {
      seed: 909, startMonth: HISTORY_START, months: 12, base: 300000, growth: 0.01, noise: 0.03, businessType: 'hardware',
      mode: 'retail', txPerDay: 3, supplierRatio: 0.6, supplierBills: 3, lateDays: onTime, household: 0.04, utility: 3500,
      supplierNames: ['Supplier: Shah Cement dealer', 'Supplier: BSRM rod dealer', 'Supplier: Berger paint dealer'],
    },
    docs: [],
  },
];
