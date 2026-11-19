import mongoose, { Schema, Types } from 'mongoose';

const opts = { timestamps: true } as const;
const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name });
const M = Schema.Types.Mixed;

const UserSchema = new Schema(
  {
    role: { type: String, enum: ['manager', 'officer', 'investor'], required: true },
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

const DecisionSchema = new Schema(
  {
    application: { ...ref('Application'), index: true },
    manager: ref('User'),
    decision: { type: String, enum: ['approve', 'ask_more', 'decline'] },
    reason: String,
    conditions_accepted: [String],
    overrode_verdict: Boolean,
    verdict_at_decision: String,
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
    officer: ref('User'),
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
export const SimState = mongoose.model('SimState', SimStateSchema);
export const ShadowCase = mongoose.model('ShadowCase', ShadowCaseSchema);

export const ALL_MODELS = [
  User, Shop, Application, Transaction, Doc, EvidenceItem, Finding, Verdict, Decision, CheckIn, Forecast, Flag,
  Intervention, Outcome, Investor, InvestorVerification, Commitment, InvestorUpdate, AuditLog, LenderSettings,
  EvalRun, SimState, ShadowCase,
];

export type Id = Types.ObjectId | string;
