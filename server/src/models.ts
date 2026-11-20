import mongoose, { Schema, Types } from 'mongoose';

const opts = { timestamps: true } as const;
const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name });
const M = Schema.Types.Mixed;

const UserSchema = new Schema(
  {
    role: { type: String, enum: ['lender', 'investor'], required: true },
    display_name: String,
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
    version: { type: Number, unique: true },
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

const SimStateSchema = new Schema({ key: { type: String, unique: true }, month_index: Number, base_month: String }, opts);

const ShadowCaseSchema = new Schema(
  {
    label: String,
    business_type: String,
    bhorsha_verdict: String,
    band_mid: Number,
    manager_decision: String,
    trading_12m: Boolean,
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
export const Policy = mongoose.model('Policy', PolicySchema);
export const Control = mongoose.model('Control', ControlSchema);
export const SimState = mongoose.model('SimState', SimStateSchema);
export const ShadowCase = mongoose.model('ShadowCase', ShadowCaseSchema);

export const ALL_MODELS = [
  User, Shop, Application, Transaction, Doc, CourierSettlement, OrderRecord, OwnerQuestion, EvidenceItem, Finding, Verdict, Decision, CheckIn, Forecast, Flag,
  Intervention, Outcome, Investor, InvestorVerification, Commitment, InvestorUpdate, AuditLog, LenderSettings,
  EvalRun, SimState, ShadowCase, Policy, Control,
];

export type Id = Types.ObjectId | string;
