import mongoose, { Schema, Types } from 'mongoose';

const opts = { timestamps: true } as const;
const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name });
const M = Schema.Types.Mixed;

const UserSchema = new Schema(
  {
    role: { type: String, enum: ['lender', 'investor', 'admin'], required: true },
    display_name: String,
    org_name: String, // lenders: the institution's name
    apply_code: { type: String, index: true, sparse: true }, // lenders: code in the owner application link /apply/<code>
    email: { type: String, unique: true, required: true },
    password_hash: String,
  },
  opts,
);

const ShopSchema = new Schema(
  {
    label: String,
    business_type: String,
    months_trading: Number,
    owner_label: String,
    token: { type: String, index: true },
    cohort_flag: { type: String, enum: ['demo', 'synthetic_cohort'], default: 'demo', index: true },
    slug: { type: String, index: true },
    lender: { ...ref('User'), index: true }, // the institution the owner applied to; only that lender sees the case
    funded: { type: Boolean, default: false },
    segment: { type: String, enum: ['cash_led', 'hybrid', 'digital_first'], default: 'cash_led', index: true },
    offline_share: { type: Number, default: 1 }, // share of sales in the shop (mostly cash)
    online_share: { type: Number, default: 0 }, // share of sales online (courier COD + prepaid)
  },
  opts,
);

const ApplicationSchema = new Schema(
  {
    shop: { ...ref('Shop'), index: true },
    loan_ask_bdt: Number,
    tenor_months: Number,
    purpose: String,
    purpose_kind: { type: String, default: 'working_capital' },
    status: { type: String, enum: ['draft', 'filed', 'decided', 'funded'], default: 'filed', index: true },
    stated: { type: M, default: {} }, // owner-stated inputs: cash_share, margin, cib_status, seasonal...
    consent: { type: Boolean, default: false },
    missing: { type: [String], default: [] },
    funded_bdt: { type: Number, default: 0 },
    current_verdict: ref('Verdict'),
  },
  opts,
);

const TransactionSchema = new Schema(
  {
    shop: { ...ref('Shop'), index: true },
    date: { type: Date, index: true },
    amount_bdt: Number,
    direction: { type: String, enum: ['in', 'out'] },
    counterparty_kind: { type: String, enum: ['customer', 'supplier', 'personal', 'utility', 'other'] },
    counterparty: String,
    balance_after_bdt: Number,
    note: String,
    due_date: Date, // supplier payments only: when it was due (seeded)
    hidden_until_sim: { type: Number, default: 0 }, // >0: post-funding month index revealed by Simulate next month
  },
  opts,
);
TransactionSchema.index({ shop: 1, date: 1 });

const DocumentSchema = new Schema(
  {
    shop: { ...ref('Shop'), index: true },
    application: ref('Application'),
    kind: { type: String, enum: ['bill', 'note', 'visit_photo', 'statement'] },
    sample_key: String, // seeded placeholder template id (rendered in the browser)
    raw_text: String, // for notes
    extracted_json: { type: M, default: null },
    field_confidences: { type: M, default: {} },
    confirmed_fields: { type: M, default: {} }, // field -> {value, at, by}
    officer_confirmed: { type: Boolean, default: false },
    confirmed_at: Date,
    read_by: { type: String, default: null }, // ai | demo_fallback
    match_status: { type: String, default: null }, // checked | weak | unmatched | duplicate | relationship
    matched_txn: { type: Schema.Types.ObjectId, default: null },
    match_reason_en: String,
    match_reason_bn: String,
  },
  opts,
);

const EvidenceItemSchema = new Schema(
  {
    application: { ...ref('Application'), index: true },
    eid: String, // short stable id used in citations, e.g. E3
    claim_key: String,
    claim_text: String,
    claim_text_bn: String,
    value: M,
    label: { type: String, enum: ['checked', 'owner_says'] },
    source_kind: String,
    source_ref: String,
  },
  opts,
);

const FindingSchema = new Schema(
  {
    application: { ...ref('Application'), index: true },
    kind: { type: String, enum: ['contradiction', 'tamper', 'coverage'] },
    code: String,
    text: String,
    text_bn: String,
    cited_evidence_ids: [String],
    severity: { type: String, enum: ['low', 'medium', 'high'] },
    source: { type: String, default: 'rules' }, // rules | ai | demo_fallback
  },
  opts,
);

const VerdictSchema = new Schema(
  {
    application: { ...ref('Application'), index: true },
    version: Number,
    rules_verdict: String,
    rules_points_json: M,
    rules_total: Number,
    model_probability: Number,
    model_verdict: String,
    conformal_set: [String],
    final_verdict: String,
    band_low: Number,
    band_high: Number,
    coverage_pct: Number,
    cause: String,
    reasons_json: M,
    recovery_plan_json: M,
    conditions_json: M,
    counterfactuals_json: M,
    tranche_plan_json: M,
    watch_list_json: M,
    cannot_tell_json: M,
    refinance_json: M,
    features_json: M,
    model_contributions_json: M,
    text_bn: String,
    text_en: String,
    generated_by: { type: String, enum: ['rules', 'model_hybrid', 'ai_phrased', 'template'] },
    phrased_by: String, // ai | template | demo_fallback
    disagreement_flag: Boolean,
    disagreement_text: String,
    verdict_source: String, // rules_only | model_hybrid
  },
  opts,
);

// AI decisions (v2): made by the Underwriter agent inside the lender's policy. History is never edited.
const DecisionSchema = new Schema(
  {
    application: { ...ref('Application'), index: true },
    verdict: ref('Verdict'),
    decision: { type: String, enum: ['approved_with_conditions', 'declined_with_plan', 'hold_need_evidence'] },
    decided_by: String, // e.g. "Bhorsha AI, policy v1"
    policy_version: Number,
    reasons: { type: M, default: [] }, // [{en, bn, evidence_ids}]
    evidence_ids: [String],
    conditions: { type: M, default: [] },
    tranche_plan: { type: M, default: [] },
    first_tranche_bdt: Number,
    gates: { type: M, default: [] }, // each fail-safe gate with pass/fail
    counter_offer: { type: M, default: null }, // Counter-offer agent: { amount_bdt, tenor_months, text_en, text_bn, by }
    pricing: { type: M, default: null }, // Pricing agent: { rebate_pct, penalty_pts, reason_en, reason_bn, by }
    fee_split: { type: M, default: null }, // Fee and rate explainer: { figures, text_en, text_bn, by }
    run_id: String,
    legacy_note: String,
  },
  opts,
);

// Courier settlement rows (one per delivered COD order) and the owner's order log (v2, hybrid/digital sellers)
const CourierSettlementSchema = new Schema(
  {
    shop: { ...ref('Shop'), index: true },
    order_id: String,
    date: Date, // delivery date
    amount_collected: Number,
    fee: Number,
    net_remitted: Number,
    settlement_date: Date,
    courier: String,
    match_status: { type: String, enum: ['unmatched', 'checked', 'weak'], default: 'unmatched' },
    matched_txn: { type: Schema.Types.ObjectId, default: null },
    match_note: String,
  },
  opts,
);
const OrderRecordSchema = new Schema(
  {
    shop: { ...ref('Shop'), index: true },
    order_id: String,
    date: Date,
    channel: String,
    amount: Number,
    status: { type: String, enum: ['delivered', 'returned', 'cancelled'] },
    matched: { type: Boolean, default: false },
    matched_via: String,
  },
  opts,
);

// Questions the Verifier sends the owner about evidence it could not match (v2). Answers stay "owner says".
const OwnerQuestionSchema = new Schema(
  {
    application: { ...ref('Application'), index: true },
    shop: ref('Shop'),
    item_kind: String, // bill | courier_batch
    item_key: { type: String, index: true },
    amount_bdt: Number,
    material: Boolean,
    question_en: String,
    question_bn: String,
    status: { type: String, enum: ['open', 'answered', 'resolved'], default: 'open' },
    answer: String,
    answered_at: Date,
  },
  opts,
);

// Messages the Servicer agent writes to the owner (v2).
const OwnerMessageSchema = new Schema(
  {
    shop: { ...ref('Shop'), index: true },
    application: ref('Application'),
    flag: ref('Flag'),
    kind: String, // decision | watchman | offer
    text_bn: String,
    text_en: String,
    offer: { type: M, default: null }, // e.g. { type: 'repayment_date_shift', days: 14, status: 'offered' | 'accepted' }
  },
  opts,
);

const CheckInSchema = new Schema(
  {
    shop: { ...ref('Shop'), index: true },
    month: String, // YYYY-MM
    sim_index: Number,
    reported_sales_bdt: Number,
    problem_note: String,
    source: String, // owner_typed | owner_voice | missed
    extracted_json: M,
    revealed: { type: Boolean, default: false },
    officer_annotation: String,
  },
  opts,
);

const ForecastSchema = new Schema(
  {
    shop: { ...ref('Shop'), index: true },
    month: String,
    expected_low: Number,
    expected_mid: Number,
    expected_high: Number,
    actual: Number,
    flagged: Boolean,
    baseline_flag: Boolean, // what a fixed 30%-drop threshold would have said
    cadence: { type: String, default: 'monthly' }, // monthly | weekly (month field holds YYYY-MM or the week start YYYY-MM-DD)
  },
  opts,
);

const FlagSchema = new Schema(
  {
    shop: { ...ref('Shop'), index: true },
    month: String,
    severity: { type: String, enum: ['watch', 'call', 'no_data'] },
    probable_cause: String,
    probable_cause_bn: String,
    suggested_action: String,
    suggested_action_bn: String,
    reasons: [String],
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    shortfall_pct: Number,
    cadence: { type: String, default: 'monthly' },
  },
  opts,
);

const InterventionSchema = new Schema(
  {
    flag: { ...ref('Flag'), index: true },
    actor: { type: String, default: 'Servicer agent' },
    action: String,
    result_note: String,
  },
  opts,
);

const OutcomeSchema = new Schema(
  {
    application: ref('Application'),
    checkpoint_months: Number,
    trading: Boolean,
    note: String,
  },
  opts,
);

const InvestorSchema = new Schema(
  {
    user: ref('User'),
    label: String,
    verification_status: { type: String, enum: ['not_started', 'in_progress', 'verified'], default: 'not_started' },
    cap_per_loan_bdt: { type: Number, default: 50000 },
    cap_total_bdt: { type: Number, default: 200000 },
    committed_total_bdt: { type: Number, default: 0 },
  },
  opts,
);

const InvestorVerificationSchema = new Schema(
  { investor: ref('Investor'), step: String, status: String, simulated_at: Date, dummy_value: String },
  opts,
);

const CommitmentSchema = new Schema(
  {
    investor: { ...ref('Investor'), index: true },
    application: { ...ref('Application'), index: true },
    amount_bdt: Number,
    status: { type: String, default: 'active' },
  },
  opts,
);
CommitmentSchema.index({ investor: 1, application: 1 }, { unique: true });

const InvestorUpdateSchema = new Schema(
  {
    application: ref('Application'),
    investor: ref('Investor'),
    source_flag: ref('Flag'),
    tone: { type: String, default: 'info' }, // info | attention
    plain_text_bn: String,
    plain_text_en: String,
    month: String,
  },
  opts,
);

const AuditLogSchema = new Schema(
  {
    actor: String,
    action: String,
    application: ref('Application'),
    redacted_payload_json: M,
    output_json: M,
    mode: String, // ai | demo_fallback | rules | model | human
    latency_ms: Number,
    agent: { type: String, index: true }, // Intake | Verifier | Underwriter | Watchman | Servicer
    run_id: { type: String, index: true },
    step: String,
    lender: { ...ref('User'), index: true }, // policy, control and simulation entries belong to one lender
  },
  opts,
);

const LenderSettingsSchema = new Schema(
  {
    min_coverage_pct: { type: Number, default: 50 },
    max_installment_to_margin: { type: Number, default: 0.5 },
    good_installment_to_margin: { type: Number, default: 0.35 },
    household_mixing_pct: { type: Number, default: 25 },
    trend_drop_pct: { type: Number, default: 15 },
    viable_points: { type: Number, default: 3 },
    not_viable_points: { type: Number, default: -3 },
    required_documents_json: { type: M, default: ['statement'] },
    language_default: { type: String, default: 'bn' },
    refinance_toggle: { type: Boolean, default: true },
    investor_cap_per_loan_bdt: { type: Number, default: 50000 },
    investor_cap_total_bdt: { type: Number, default: 200000 },
  },
  opts,
);

// Lender policy (v2): versioned. A new version applies only to new decisions; old decisions keep theirs.
const PolicySchema = new Schema(
  {
    lender: { ...ref('User'), index: true }, // each lender owns its own versioned policy
    version: Number,
    autonomy_cap_bdt: { type: Number, default: 300000 },
    min_documents: { type: [String], default: ['statement'] }, // statement | online_evidence (hybrid/digital) | supplier_bill
    household_mixing_pct: { type: Number, default: 25 },
    trend_drop_pct: { type: Number, default: 15 },
    good_installment_to_margin: { type: Number, default: 0.35 },
    max_installment_to_margin: { type: Number, default: 0.5 },
    viable_points: { type: Number, default: 3 },
    not_viable_points: { type: Number, default: -3 },
    min_coverage_pct: { type: Number, default: 50 },
    breaker_max_default_rate: { type: Number, default: 0.34 }, // share of funded loans at "call" level
    breaker_max_hold_rate: { type: Number, default: 0.8 }, // share of holds among recent decisions
    breaker_window: { type: Number, default: 10 }, // recent decisions considered for the hold rate
    breaker_min_decisions: { type: Number, default: 6 },
    // loan limits and pricing (contract, counter-offer, pricing and fee agents work inside these)
    max_principal_bdt: { type: Number, default: 1000000 },
    max_tenor_months: { type: Number, default: 12 },
    bank_rate_pct: { type: Number, default: 10 }, // investor rate = bank rate + investor_spread_pct
    investor_spread_pct: { type: Number, default: 0.25 },
    borrower_rate_pct: { type: Number, default: 14 },
    fee_pct_short: { type: Number, default: 8 }, // Bhorsha's share of interest, tenor up to 3 months
    fee_pct_mid: { type: Number, default: 8.5 }, // 4 to 6 months
    fee_pct_long: { type: Number, default: 9 }, // 7 to 12 months
    rebate_default_pct: { type: Number, default: 20 }, // early repayment: share of remaining interest waived
    rebate_min_pct: { type: Number, default: 10 },
    rebate_max_pct: { type: Number, default: 30 },
    penalty_default_pts: { type: Number, default: 2 }, // late repayment: extra points a year on the overdue amount
    penalty_min_pts: { type: Number, default: 1 },
    penalty_max_pts: { type: Number, default: 4 },
    grace_days: { type: Number, default: 3 }, // a payment up to this many days after the due date is on time
    match_confidence_min: { type: Number, default: 0.8 }, // below this a payment waits in the lender's review queue
    early_pay_discount_pct: { type: Number, default: 25 }, // share of an instalment's interest waived when paid early enough (0 = off)
    early_pay_min_days: { type: Number, default: 5 }, // days before the due date that count as early enough
    created_by: String,
    note: String,
  },
  opts,
);

// AI control switch: manual pause by the lender, or automatic circuit breaker.
const ControlSchema = new Schema({ key: { type: String, unique: true }, paused: Boolean, source: String, reason: String, metrics: M }, opts);

const EvalRunSchema = new Schema(
  {
    component: String,
    level: Number,
    metric_name: String,
    value: Number,
    ci_low: Number,
    ci_high: Number,
    sample_size: Number,
    limitation: String,
    run_at: Date,
  },
  opts,
);

const SimStateSchema = new Schema({ key: { type: String, unique: true }, month_index: Number, base_month: String, day: String }, opts);

const ShadowCaseSchema = new Schema(
  {
    lender: { ...ref('User'), index: true },
    label: String,
    business_type: String,
    bhorsha_verdict: String,
    band_mid: Number,
    manager_decision: String,
    trading_12m: Boolean,
  },
  opts,
);

// Loan contract as the Contract-reading agent read it (v3).
const LoanContractSchema = new Schema(
  {
    application: { ...ref('Application'), index: true },
    text: String,
    source: { type: String, default: 'generated' }, // generated from the application | uploaded by the lender
    read_by: String, // ai | demo_fallback
    extracted: { type: M, default: {} }, // principal_bdt, annual_rate_pct, tenor_months, early_clause, late_clause, early_rebate_pct, late_penalty_pts
    unclear: { type: M, default: [] }, // [{ clause, why_en, why_bn }] flagged by the agent
    problems: { type: M, default: [] }, // [{ en, bn }] found by the code checks
    confidence: Number,
    status: { type: String, enum: ['clear', 'unsure', 'invalid', 'confirmed'], default: 'unsure' },
    confirmed_by: String,
    confirmed_at: Date,
  },
  opts,
);

// A funded loan's repayment account and schedule (v3).
const LoanAccountSchema = new Schema(
  {
    application: { ...ref('Application'), index: true },
    shop: { ...ref('Shop'), index: true },
    ref: { type: String, index: true }, // payment reference the borrower should quote, e.g. LN-F374
    payer_label: String, // the wallet the borrower usually pays from (synthetic)
    principal_bdt: Number,
    annual_rate_pct: Number,
    tenor_months: Number,
    start_date: Date,
    schedule: { type: M, default: [] }, // [{ n, due_date, amount_bdt, principal_bdt, interest_bdt, paid_bdt, status }]
    rebate_pct: Number,
    penalty_pts: Number,
    status: { type: String, default: 'active' }, // active | settled
  },
  opts,
);

// Incoming repayments from the bKash or bank webhook (v3).
const PaymentSchema = new Schema(
  {
    event_id: { type: String, unique: true },
    channel: String, // bkash | bank
    reference: String,
    payer_label: String,
    amount_bdt: Number,
    received_at: Date,
    signature_ok: Boolean,
    loan: { ...ref('LoanAccount'), index: true },
    lender: { ...ref('User'), index: true }, // the lender whose loan it matched (or whose test console sent it)
    application: ref('Application'),
    shop: ref('Shop'),
    installment_n: Number,
    status: { type: String, enum: ['applied', 'review', 'rejected'], default: 'review', index: true },
    classification: String, // early | on_time | late
    days_from_due: Number,
    partial: Boolean,
    discount_bdt: Number, // early-payment discount applied to this instalment
    confidence: Number,
    matched_by: String, // reference | ai | demo_fallback | lender
    match_reason: String,
    watch: { type: M, default: null }, // Watchman update: { assessment, reason_en, reason_bn, by, routed_to }
  },
  opts,
);

export const User = mongoose.model('User', UserSchema);
export const Shop = mongoose.model('Shop', ShopSchema);
export const Application = mongoose.model('Application', ApplicationSchema);
export const Transaction = mongoose.model('Transaction', TransactionSchema);
export const Doc = mongoose.model('Document', DocumentSchema);
export const EvidenceItem = mongoose.model('EvidenceItem', EvidenceItemSchema);
export const Finding = mongoose.model('Finding', FindingSchema);
export const Verdict = mongoose.model('Verdict', VerdictSchema);
export const Decision = mongoose.model('Decision', DecisionSchema);
export const CheckIn = mongoose.model('CheckIn', CheckInSchema);
export const OwnerMessage = mongoose.model('OwnerMessage', OwnerMessageSchema);
export const OwnerQuestion = mongoose.model('OwnerQuestion', OwnerQuestionSchema);
export const CourierSettlement = mongoose.model('CourierSettlement', CourierSettlementSchema);
export const OrderRecord = mongoose.model('OrderRecord', OrderRecordSchema);
export const Forecast = mongoose.model('Forecast', ForecastSchema);
export const Flag = mongoose.model('Flag', FlagSchema);
export const Intervention = mongoose.model('Intervention', InterventionSchema);
export const Outcome = mongoose.model('Outcome', OutcomeSchema);
export const Investor = mongoose.model('Investor', InvestorSchema);
export const InvestorVerification = mongoose.model('InvestorVerification', InvestorVerificationSchema);
export const Commitment = mongoose.model('Commitment', CommitmentSchema);
export const InvestorUpdate = mongoose.model('InvestorUpdate', InvestorUpdateSchema);
export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
export const LenderSettings = mongoose.model('LenderSettings', LenderSettingsSchema);
export const EvalRun = mongoose.model('EvalRun', EvalRunSchema);
PolicySchema.index({ lender: 1, version: 1 }, { unique: true });
export const Policy = mongoose.model('Policy', PolicySchema);
export const Control = mongoose.model('Control', ControlSchema);
export const SimState = mongoose.model('SimState', SimStateSchema);
export const ShadowCase = mongoose.model('ShadowCase', ShadowCaseSchema);
export const LoanContract = mongoose.model('LoanContract', LoanContractSchema);
export const LoanAccount = mongoose.model('LoanAccount', LoanAccountSchema);
export const Payment = mongoose.model('Payment', PaymentSchema);

export const ALL_MODELS = [
  User, Shop, Application, Transaction, Doc, CourierSettlement, OrderRecord, OwnerQuestion, OwnerMessage, EvidenceItem, Finding, Verdict, Decision, CheckIn, Forecast, Flag,
  Intervention, Outcome, Investor, InvestorVerification, Commitment, InvestorUpdate, AuditLog, LenderSettings,
  EvalRun, SimState, ShadowCase, Policy, Control, LoanContract, LoanAccount, Payment,
];

export type Id = Types.ObjectId | string;
