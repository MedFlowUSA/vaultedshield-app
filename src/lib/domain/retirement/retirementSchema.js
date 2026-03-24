// Retirement foundation objects will later attach to:
// - Retirement Hub overview cards and account registries
// - Retirement Account Detail and Pension Detail page models
// - generic assets / asset_documents / asset_snapshots
// - linked portal continuity records
// - future retirement parser and extraction classifiers
// - future Supabase retirement account, snapshot, and intelligence tables

export const RETIREMENT_SCHEMA_GROUPS = Object.freeze([
  "account_identity",
  "balance_metrics",
  "contribution_metrics",
  "investment_metrics",
  "loan_distribution_metrics",
  "beneficiary_metrics",
  "pension_metrics",
  "portal_and_access",
  "statement_context",
  "completeness_meta",
]);

export const RETIREMENT_SCHEMA_FIELD_MAP = Object.freeze({
  account_identity: Object.freeze([
    "account_type",
    "account_subtype",
    "plan_name",
    "institution_name",
    "institution_key",
    "account_number_masked",
    "account_owner",
    "participant_name",
    "employer_name",
    "statement_date",
    "plan_status",
  ]),
  balance_metrics: Object.freeze([
    "current_balance",
    "vested_balance",
    "available_balance",
    "cash_balance",
    "loan_balance",
    "prior_period_balance",
    "ytd_change",
    "accrued_benefit_estimate",
    "monthly_benefit_estimate",
    "lump_sum_estimate",
  ]),
  contribution_metrics: Object.freeze([
    "employee_contributions",
    "employer_contributions",
    "employer_match",
    "roth_balance",
    "pre_tax_balance",
    "after_tax_balance",
    "rollover_balance",
    "ytd_contributions",
  ]),
  investment_metrics: Object.freeze([
    "allocation_summary",
    "model_portfolio_name",
    "target_date_fund_name",
    "gains_losses",
    "rate_of_return",
    "subaccounts",
    "fund_positions",
  ]),
  loan_distribution_metrics: Object.freeze([
    "loan_balance",
    "loan_payment_amount",
    "loan_issue_date",
    "distribution_status",
    "withdrawal_amount",
    "rmd_due",
    "rmd_taken",
  ]),
  beneficiary_metrics: Object.freeze([
    "beneficiary_present",
    "primary_beneficiary_name",
    "contingent_beneficiary_name",
    "beneficiary_status_known",
  ]),
  pension_metrics: Object.freeze([
    "normal_retirement_age",
    "accrued_monthly_benefit",
    "early_retirement_option",
    "survivor_option",
    "service_years",
    "benefit_commencement_status",
  ]),
  portal_and_access: Object.freeze([
    "linked_portal_present",
    "portal_verified",
    "recovery_info_present",
    "support_contact_present",
  ]),
  statement_context: Object.freeze([
    "document_type",
    "statement_period",
    "provider_confidence",
    "extraction_confidence",
    "completeness_assessment",
  ]),
  completeness_meta: Object.freeze([
    "required_sections",
    "captured_sections",
    "missing_sections",
    "missing_fields",
    "document_class",
    "parser_version",
    "schema_version",
  ]),
});

export const RETIREMENT_SCHEMA_VERSION = "retirement.foundation.v1";

export const RETIREMENT_MODULE_CONNECTIONS = Object.freeze({
  retirement_hub: "Uses registries for plan-type grouping, provider labels, and starter rollups.",
  retirement_account_detail:
    "Uses normalized schema for account balances, contributions, allocations, loans, and portal readiness.",
  pension_detail:
    "Uses normalized schema pension_metrics for benefit estimates, commencement state, and survivor review.",
  generic_assets_documents:
    "Maps uploaded retirement files into shared asset/document records before specialized parsing is added.",
  linked_portals:
    "Connects institution_key and portal_and_access to continuity credentials and recovery readiness.",
  future_parser:
    "Will classify provider, type, and document class before filling normalized fields and completeness_meta.",
  future_supabase_schema:
    "Can persist registries as reference data and normalized snapshots/intelligence as retirement-specific tables.",
});

export const RETIREMENT_SCHEMA_TEMPLATE = Object.freeze({
  account_identity: Object.freeze({
    account_type: null,
    account_subtype: null,
    plan_name: null,
    institution_name: null,
    institution_key: null,
    account_number_masked: null,
    account_owner: null,
    participant_name: null,
    employer_name: null,
    statement_date: null,
    plan_status: null,
  }),
  balance_metrics: Object.freeze({
    current_balance: null,
    vested_balance: null,
    available_balance: null,
    cash_balance: null,
    loan_balance: null,
    prior_period_balance: null,
    ytd_change: null,
    accrued_benefit_estimate: null,
    monthly_benefit_estimate: null,
    lump_sum_estimate: null,
  }),
  contribution_metrics: Object.freeze({
    employee_contributions: null,
    employer_contributions: null,
    employer_match: null,
    roth_balance: null,
    pre_tax_balance: null,
    after_tax_balance: null,
    rollover_balance: null,
    ytd_contributions: null,
  }),
  investment_metrics: Object.freeze({
    allocation_summary: Object.freeze([]),
    model_portfolio_name: null,
    target_date_fund_name: null,
    gains_losses: null,
    rate_of_return: null,
    subaccounts: Object.freeze([]),
    fund_positions: Object.freeze([]),
  }),
  loan_distribution_metrics: Object.freeze({
    loan_balance: null,
    loan_payment_amount: null,
    loan_issue_date: null,
    distribution_status: null,
    withdrawal_amount: null,
    rmd_due: null,
    rmd_taken: null,
  }),
  beneficiary_metrics: Object.freeze({
    beneficiary_present: null,
    primary_beneficiary_name: null,
    contingent_beneficiary_name: null,
    beneficiary_status_known: null,
  }),
  pension_metrics: Object.freeze({
    normal_retirement_age: null,
    accrued_monthly_benefit: null,
    early_retirement_option: null,
    survivor_option: null,
    service_years: null,
    benefit_commencement_status: null,
  }),
  portal_and_access: Object.freeze({
    linked_portal_present: null,
    portal_verified: null,
    recovery_info_present: null,
    support_contact_present: null,
  }),
  statement_context: Object.freeze({
    document_type: null,
    statement_period: null,
    provider_confidence: null,
    extraction_confidence: null,
    completeness_assessment: Object.freeze({}),
  }),
  completeness_meta: Object.freeze({
    required_sections: Object.freeze([]),
    captured_sections: Object.freeze([]),
    missing_sections: Object.freeze([]),
    missing_fields: Object.freeze([]),
    document_class: null,
    parser_version: null,
    schema_version: RETIREMENT_SCHEMA_VERSION,
  }),
});

function cloneSchemaSection(section) {
  if (Array.isArray(section)) {
    return [...section];
  }

  if (section && typeof section === "object") {
    return Object.fromEntries(
      Object.entries(section).map(([key, value]) => [key, cloneSchemaSection(value)])
    );
  }

  return section;
}

export function createEmptyRetirementSchema() {
  return cloneSchemaSection(RETIREMENT_SCHEMA_TEMPLATE);
}
