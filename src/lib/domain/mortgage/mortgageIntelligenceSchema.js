export const MORTGAGE_INTELLIGENCE_GROUPS = Object.freeze([
  "summary",
  "payment_flags",
  "rate_flags",
  "escrow_flags",
  "delinquency_flags",
  "property_link_flags",
  "payoff_flags",
  "completeness_flags",
]);

export const MORTGAGE_INTELLIGENCE_SCHEMA_VERSION = "mortgage.intelligence.v1";

export const MORTGAGE_INTELLIGENCE_TEMPLATE = Object.freeze({
  summary: Object.freeze({
    loan_summary: null,
    balance_visibility: null,
    payment_visibility: null,
    lender_visibility: null,
  }),
  payment_flags: Object.freeze({
    payment_breakdown_incomplete: false,
    monthly_payment_visible: false,
    pmi_mip_visible: false,
  }),
  rate_flags: Object.freeze({
    arm_review_needed: false,
    interest_rate_visible: false,
    term_visibility_limited: false,
  }),
  escrow_flags: Object.freeze({
    escrow_change_review: false,
    escrow_present: false,
    escrow_visibility_limited: false,
  }),
  delinquency_flags: Object.freeze({
    delinquency_notice_detected: false,
    late_status_visible: false,
    modification_notice_detected: false,
  }),
  property_link_flags: Object.freeze({
    property_link_missing: false,
    investment_property_detected: false,
    occupancy_visibility_limited: false,
  }),
  payoff_flags: Object.freeze({
    payoff_visibility_present: false,
    payoff_review_needed: false,
  }),
  completeness_flags: Object.freeze({
    statement_missing_sections: Object.freeze([]),
    lender_unconfirmed: false,
    loan_type_unconfirmed: false,
    document_class_unconfirmed: false,
  }),
  intelligence_meta: Object.freeze({
    schema_version: MORTGAGE_INTELLIGENCE_SCHEMA_VERSION,
    generated_at: null,
    analysis_status: "foundation_only",
  }),
});

function cloneIntelligenceSection(section) {
  if (Array.isArray(section)) return [...section];
  if (section && typeof section === "object") {
    return Object.fromEntries(
      Object.entries(section).map(([key, value]) => [key, cloneIntelligenceSection(value)])
    );
  }
  return section;
}

export function createEmptyMortgageIntelligenceSchema() {
  return cloneIntelligenceSection(MORTGAGE_INTELLIGENCE_TEMPLATE);
}
