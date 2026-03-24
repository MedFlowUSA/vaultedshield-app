export const RETIREMENT_INTELLIGENCE_GROUPS = Object.freeze([
  "summary",
  "review_flags",
  "beneficiary_flags",
  "rollover_flags",
  "loan_flags",
  "pension_flags",
  "concentration_flags",
  "completeness_flags",
  "household_retirement_rollup_stub",
]);

export const RETIREMENT_INTELLIGENCE_SCHEMA_VERSION = "retirement.intelligence.v1";

export const RETIREMENT_INTELLIGENCE_TEMPLATE = Object.freeze({
  summary: Object.freeze({
    account_summary: null,
    balance_visibility: null,
    provider_visibility: null,
    retirement_type_visibility: null,
  }),
  review_flags: Object.freeze([]),
  beneficiary_flags: Object.freeze({
    beneficiary_missing: false,
    beneficiary_status_unknown: false,
    contingent_beneficiary_missing: false,
  }),
  rollover_flags: Object.freeze({
    rollover_review_candidate: false,
    old_employer_plan_possible: false,
    terminated_plan_detected: false,
  }),
  loan_flags: Object.freeze({
    outstanding_loan_detected: false,
    loan_payment_visibility_limited: false,
  }),
  pension_flags: Object.freeze({
    pension_estimate_detected: false,
    survivor_option_visibility_limited: false,
    commencement_status_needs_review: false,
  }),
  concentration_flags: Object.freeze({
    concentration_warning: false,
    target_date_fund_detected: false,
    allocation_visibility_limited: false,
  }),
  completeness_flags: Object.freeze({
    statement_missing_sections: Object.freeze([]),
    provider_unconfirmed: false,
    account_type_unconfirmed: false,
    document_class_unconfirmed: false,
  }),
  household_retirement_rollup_stub: Object.freeze({
    household_balance_known: false,
    retirement_accounts_visible: 0,
    pensions_visible: 0,
    rollover_candidates_visible: 0,
  }),
  intelligence_meta: Object.freeze({
    schema_version: RETIREMENT_INTELLIGENCE_SCHEMA_VERSION,
    generated_at: null,
    analysis_status: "foundation_only",
  }),
});

function cloneIntelligenceSection(section) {
  if (Array.isArray(section)) {
    return [...section];
  }

  if (section && typeof section === "object") {
    return Object.fromEntries(
      Object.entries(section).map(([key, value]) => [key, cloneIntelligenceSection(value)])
    );
  }

  return section;
}

export function createEmptyRetirementIntelligenceSchema() {
  return cloneIntelligenceSection(RETIREMENT_INTELLIGENCE_TEMPLATE);
}
