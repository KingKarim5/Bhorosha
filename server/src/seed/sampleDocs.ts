// Placeholder documents for the demo shops (synthetic). Bills are rendered as images in the browser
// from these templates (Noto Sans Bengali), so the AI reader has a real image to read. Notes are typed text.
// All names, numbers and businesses are fictional.

export interface BillTemplate {
  key: string;
  kind: 'bill';
  style: 'printed' | 'handwritten';
  header: string;
  sub: string;
  lines: string[];
  total: string;
  footer: string[];
}
export interface NoteTemplate {
  key: string;
  kind: 'note';
  text: string;
}

export const BILLS: Record<string, BillTemplate> = {
  bill_rahima: {
    key: 'bill_rahima',
    kind: 'bill',
    style: 'printed',
    header: 'মেসার্স মেঘনা ট্রেডার্স',
    sub: 'পাইকারি মুদি ও চা-পাতা সরবরাহকারী · ক্যাশ মেমো নং ২৪১৭',
    lines: ['তারিখ: ১২/১০/২০২৬', 'ক্রেতা: রহিমা টি অ্যান্ড গ্রোসারি', 'চা-পাতা ১০ কেজি ............ ৳ ৪,২০০', 'চিনি ২৫ কেজি ................ ৳ ৩,৫০০', 'বিস্কুট (কার্টন) ৬ ........... ৳ ৫,৪০০', 'সয়াবিন তেল ৫ লি. × ৫ ........ ৳ ৫,৩৫০'],
    total: 'সর্বমোট: ৳ ১৮,৪৫০',
    footer: ['পরিশোধের শেষ তারিখ: ১৯/১০/২০২৬', 'পরিশোধ: বিকাশ, ১৮/১০/২০২৬', 'ধন্যবাদ'],
  },
  invoice_sultana: {
    key: 'invoice_sultana',
    kind: 'bill',
    style: 'printed',
    header: 'SULTANA KNITWEAR · সুলতানা নিটওয়্যার',
    sub: 'Commercial invoice / বাণিজ্যিক চালান · INV-0931',
    lines: ['Date / তারিখ: 08/08/2026', 'Buyer / ক্রেতা: Northern Knit Exports', 'Crew-neck sweater, 2,000 pcs × ৳ 200', 'Delivered / সরবরাহ: 10/08/2026', 'Payment terms: 30 days / পরিশোধ: ৩০ দিন'],
    total: 'Total / মোট: ৳ 4,00,000',
    footer: ['Due / শেষ তারিখ: 09/09/2026', 'Status: UNPAID / বাকি', 'Authorised signature'],
  },
  bill_tania_a: {
    key: 'bill_tania_a',
    kind: 'bill',
    style: 'handwritten',
    header: 'দ্রুত কুরিয়ার সার্ভিস',
    sub: 'ডেলিভারি চার্জ রসিদ',
    lines: ['তারিখ: ২১/০৯/২০২৬', 'পার্সেল: ৮৫টি', 'চার্জ প্রতি পার্সেল ৳ ৬০'],
    total: 'মোট: ৳ ৫,১০০',
    footer: ['নগদ / বিকাশ: বিকাশ', 'স্বাক্ষর: ......'],
  },
};
BILLS.bill_tania_b = { ...BILLS.bill_tania_a, key: 'bill_tania_b' }; // the same bill uploaded twice
BILLS.bill_rahima_b = {
  key: 'bill_rahima_b',
  kind: 'bill',
  style: 'handwritten',
  header: 'পদ্মা হোলসেল',
  sub: 'ক্যাশ মেমো',
  lines: ['তারিখ: ০৫/১০/২০২৬', 'চানাচুর ও বিস্কুট (খোলা)', 'মোট ২৬ প্যাকেট'],
  total: 'মোট: ৳ ২,৬০০',
  footer: ['নগদে পরিশোধিত', 'স্বাক্ষর: ......'],
};

export const NOTES: Record<string, NoteTemplate> = {
  note_rahima: {
    key: 'note_rahima',
    kind: 'note',
    text: 'আমার দোকানে প্রায় ৬০% বিক্রি নগদে হয়, বাকিটা বিকাশে। মাসের মাঝামাঝি প্রায়ই চা-পাতা আর বিস্কুট ফুরিয়ে যায়, তখন ক্রেতা ফিরে যায়। একবারে বেশি মাল কেনার টাকা থাকে না। লাভ মোটামুটি ২০%। ব্যবসা মৌসুমি না, সারা বছর একই রকম চলে। আমার মোবাইল ০১৭১২৩৪৫৬৭৮।',
  },
  note_sultana: {
    key: 'note_sultana',
    kind: 'note',
    text: 'আমাদের ৪টি মেশিন ও ১৮ জন কর্মী। বিক্রির প্রায় ৫% নগদে। নর্দার্ন নিট এক্সপোর্টস-এর কাছে আমাদের ৪,০০,০০০ টাকা পাওনা, প্রায় ৭৫ দিন হয়ে গেছে। লাভ প্রায় ৩০%। শীতের আগে অর্ডার বাড়ে। চিন্তা: পাওনা টাকা দেরিতে এলে কর্মীদের বেতন দিতে কষ্ট হয়।',
  },
  note_karim: {
    key: 'note_karim',
    kind: 'note',
    text: 'ফার্মেসির বিক্রি ঠিক আছে, আগের মতোই চলছে। প্রায় ৪০% বিক্রি নগদে। লাভ ২০% এর মতো। কোম্পানির ডিলারকে মাঝে মাঝে কয়েক দিন দেরিতে টাকা দিই। ব্যবসা মৌসুমি না।',
  },
  note_nasir: {
    key: 'note_nasir',
    kind: 'note',
    text: 'মোবাইল এক্সেসরিজের দোকান। বিক্রির ৩০% নগদে। যে টাকা ব্যক্তিগত নম্বরে পাঠানো দেখা যায়, তার বেশিরভাগ আসলে আমার চাচাতো ভাইয়ের পাইকারি দোকানে মালের দাম। লাভ ১৫%। ব্যবসা মৌসুমি না।',
  },
  note_jahan: {
    key: 'note_jahan',
    kind: 'note',
    text: 'মাছের ব্যবসা মৌসুমি। বর্ষায় বিক্রি অনেক বেশি, শীতে অনেক কম, প্রায় চার ভাগের এক ভাগ। প্রায় ৫০% বিক্রি নগদে। লাভ প্রায় ১৮%। গত বছরের হিসাব খাতায় আছে, বিকাশে নেই।',
  },
  note_rafi: {
    key: 'note_rafi',
    kind: 'note',
    text: 'দোকানে আতর ও ডিক্যান্ট বিক্রি করি, আর ফেসবুক ও ওয়েবসাইটে অনলাইনে। প্রায় ৪০% বিক্রি দোকানে নগদে, ৬০% অনলাইনে, বেশিরভাগ ক্যাশ অন ডেলিভারি পাঠাও কুরিয়ারে। ঈদের আগে বিক্রি দ্বিগুণ হয়। ফেরত প্রায় ৬%। লাভ প্রায় ৩০%। মাল কিনি চকবাজার থেকে।',
  },
  note_tania: {
    key: 'note_tania',
    kind: 'note',
    text: 'অনলাইনে পোশাক বিক্রি করি, ১২ মাস ধরে ব্যবসা করছি। প্রায় সব টাকা বিকাশ ও নগদে আসে, নগদ টাকা ১০% এর মতো। পূজার সময় বিক্রি অনেক বেড়েছিল। লাভ ২৫%।',
  },
};

/** Canned extraction outputs used as DEMO FALLBACK when no AI key is set or a call fails. */
export const CANNED: Record<string, Record<string, unknown>> = {
  bill_rahima: {
    document_type: 'supplier_bill',
    supplier_label: 'Meghna Traders',
    date: '2026-10-12',
    amount_bdt: 18450,
    due_date: '2026-10-19',
    paid_date: '2026-10-18',
    language: 'bn',
    confidence: 0.86,
    field_confidences: { document_type: 0.95, supplier_label: 0.9, date: 0.92, amount_bdt: 0.93, due_date: 0.8, paid_date: 0.62 },
    fields_needing_review: ['paid_date'],
  },
  invoice_sultana: {
    document_type: 'sales_invoice_receivable',
    supplier_label: 'Northern Knit Exports (buyer)',
    date: '2026-08-08',
    amount_bdt: 400000,
    due_date: '2026-09-09',
    paid_date: null,
    language: 'mixed',
    confidence: 0.9,
    field_confidences: { document_type: 0.88, supplier_label: 0.93, date: 0.94, amount_bdt: 0.96, due_date: 0.9, paid_date: 0.85 },
    fields_needing_review: [],
  },
  bill_tania_a: {
    document_type: 'courier_receipt',
    supplier_label: 'Druto Courier',
    date: '2026-09-21',
    amount_bdt: 5100,
    due_date: null,
    paid_date: null,
    language: 'bn',
    confidence: 0.55,
    field_confidences: { document_type: 0.7, supplier_label: 0.6, date: 0.58, amount_bdt: 0.66, due_date: 0.2, paid_date: 0.2 },
    fields_needing_review: ['date', 'amount_bdt', 'supplier_label'],
  },
  note_rahima: { cash_share: 0.6, margin: 0.2, seasonal: false, receivables: [], concerns: ['mid-month stock-outs', 'not enough cash to buy stock in bulk'], language: 'bn', confidence: 0.9 },
  note_sultana: { cash_share: 0.05, margin: 0.3, seasonal: false, receivables: [{ party: 'Northern Knit Exports', amount_bdt: 400000, days: 75 }], concerns: ['late buyer payment strains wages'], language: 'bn', confidence: 0.85 },
  note_karim: { cash_share: 0.4, margin: 0.2, seasonal: false, receivables: [], concerns: ['sometimes pays the dealer a few days late'], language: 'bn', confidence: 0.88, claims: ['sales are steady, same as before'] },
  note_nasir: { cash_share: 0.3, margin: 0.15, seasonal: false, receivables: [], concerns: [], language: 'bn', confidence: 0.86, claims: ['transfers to personal numbers are mostly stock payments to a cousin’s wholesale shop'] },
  note_jahan: { cash_share: 0.5, margin: 0.18, seasonal: true, receivables: [], concerns: ['lean winter months'], language: 'bn', confidence: 0.9, claims: ['last year’s figures are in a paper ledger, not in the wallet'] },
  note_rafi: { cash_share: 0.4, margin: 0.3, seasonal: false, receivables: [], concerns: [], language: 'bn', confidence: 0.88, claims: ['about 60% of sales are online, mostly cash on delivery through Pathao', 'returns are about 6%', 'sales double before Eid'] },
  note_tania: { cash_share: 0.1, margin: 0.25, seasonal: false, receivables: [], concerns: [], language: 'bn', confidence: 0.85, claims: ['trading for 12 months', 'festival sales spike'] },
};
CANNED.bill_tania_b = CANNED.bill_tania_a;
CANNED.bill_rahima_b = {
  document_type: 'cash_memo',
  supplier_label: 'Padma Wholesale',
  date: '2026-10-05',
  amount_bdt: 2600,
  due_date: null,
  paid_date: null,
  language: 'bn',
  confidence: 0.62,
  field_confidences: { document_type: 0.8, supplier_label: 0.7, date: 0.66, amount_bdt: 0.72, due_date: 0.2, paid_date: 0.2 },
  fields_needing_review: ['date', 'supplier_label'],
};
