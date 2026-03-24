// Mortgage foundation objects will later attach to:
// - Mortgage Hub overview cards and loan registries
// - Mortgage Detail page models
// - generic assets / asset_documents / asset_snapshots
// - linked portal continuity records
// - future mortgage parser and extraction classifiers
// - future Supabase mortgage loan, snapshot, and intelligence tables

export const MORTGAGE_SCHEMA_GROUPS = Object.freeze([
  "loan_identity",
  "property_link_context",
  "balance_metrics",
  "payment_metrics",
  "rate_terms",
  "escrow_metrics",
  "delinquency_and_status",
  "portal_and_access",
  "statement_context",
  "completeness_meta",
]);

export const MORTGAGE_SCHEMA_FIELD_MAP = Object.freeze({
  loan_identity: Object.freeze([
    "lender_name",
    "lender_key",
    "loan_number_masked",
    "loan_type",
    "borrower_name",
    "co_borrower_name",
    "origination_date",
    "maturity_date",
    "loan_status",
  ]),
  property_link_context: Object.freeze([
    "property_address",
    "occupancy_type",
    "investment_property_flag",
    "linked_property_present",
  ]),
  balance_metrics: Object.freeze([
    "original_balance",
    "current_principal_balance",
    "unpaid_principal_balance",
    "payoff_amount",
    "next_due_date",
  ]),
  payment_metrics: Object.freeze([
    "monthly_payment",
    "principal_payment",
    "interest_payment",
    "escrow_payment",
    "late_fee",
    "pmi_mip_amount",
  ]),
  rate_terms: Object.freeze([
    "interest_rate",
    "fixed_or_adjustable",
    "arm_adjustment_note",
    "term_months",
  ]),
  escrow_metrics: Object.freeze([
    "escrow_present",
    "escrow_balance",
    "tax_component",
    "insurance_component",
  ]),
  delinquency_and_status: Object.freeze([
    "late_status_visible",
    "delinquency_notice_present",
    "modification_notice_present",
  ]),
  portal_and_access: Object.freeze([
    "linked_portal_present",
    "portal_verified",
    "recovery_info_present",
    "support_contact_present",
  ]),
  statement_context: Object.freeze([
    "document_type",
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

export const MORTGAGE_SCHEMA_VERSION = "mortgage.foundation.v1";

export const MORTGAGE_MODULE_CONNECTIONS = Object.freeze({
  mortgage_hub: "Uses registries for loan-type grouping, lender labels, and starter rollups.",
  mortgage_detail:
    "Uses normalized schema for loan identity, balances, payment breakdown, rate terms, escrow, and portal readiness.",
  generic_assets_documents:
    "Maps uploaded mortgage files into shared asset/document records before specialized parsing is added.",
  linked_portals:
    "Connects lender_key and portal_and_access to continuity credentials and recovery readiness.",
  future_parser:
    "Will classify lender, loan type, and document class before filling normalized fields and completeness_meta.",
  future_supabase_schema:
    "Can persist registries as reference data and normalized snapshots/intelligence as mortgage-specific tables.",
});

export const MORTGAGE_SCHEMA_TEMPLATE = Object.freeze({
  loan_identity: Object.freeze({
    lender_name: null,
    lender_key: null,
    loan_number_masked: null,
    loan_type: null,
    borrower_name: null,
    co_borrower_name: null,
    origination_date: null,
    maturity_date: null,
    loan_status: null,
  }),
  property_link_context: Object.freeze({
    property_address: null,
    occupancy_type: null,
    investment_property_flag: null,
    linked_property_present: null,
  }),
  balance_metrics: Object.freeze({
    original_balance: null,
    current_principal_balance: null,
    unpaid_principal_balance: null,
    payoff_amount: null,
    next_due_date: null,
  }),
  payment_metrics: Object.freeze({
    monthly_payment: null,
    principal_payment: null,
    interest_payment: null,
    escrow_payment: null,
    late_fee: null,
    pmi_mip_amount: null,
  }),
  rate_terms: Object.freeze({
    interest_rate: null,
    fixed_or_adjustable: null,
    arm_adjustment_note: null,
    term_months: null,
  }),
  escrow_metrics: Object.freeze({
    escrow_present: null,
    escrow_balance: null,
    tax_component: null,
    insurance_component: null,
  }),
  delinquency_and_status: Object.freeze({
    late_status_visible: null,
    delinquency_notice_present: null,
    modification_notice_present: null,
  }),
  portal_and_access: Object.freeze({
    linked_portal_present: null,
    portal_verified: null,
    recovery_info_present: null,
    support_contact_present: null,
  }),
  statement_context: Object.freeze({
    document_type: null,
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
    schema_version: MORTGAGE_SCHEMA_VERSION,
  }),
});

function cloneSchemaSection(section) {
  if (Array.isArray(section)) return [...section];
  if (section && typeof section === "object") {
    return Object.fromEntries(
      Object.entries(section).map(([key, value]) => [key, cloneSchemaSection(value)])
    );
  }
  return section;
}

export function createEmptyMortgageSchema() {
  return cloneSchemaSection(MORTGAGE_SCHEMA_TEMPLATE);
}
