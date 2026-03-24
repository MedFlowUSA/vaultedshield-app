// Homeowners foundation objects will later attach to:
// - Homeowners Hub overview cards and policy registries
// - Homeowners Policy Detail page models
// - generic assets / asset_documents / asset_snapshots
// - linked portal continuity records
// - future homeowners parser and extraction classifiers
// - future Supabase homeowners policy, snapshot, and intelligence tables

export const HOMEOWNERS_SCHEMA_GROUPS = Object.freeze([
  "policy_identity",
  "property_identity",
  "coverage_metrics",
  "deductible_metrics",
  "premium_billing_metrics",
  "claims_and_status",
  "mortgage_and_escrow_context",
  "portal_and_access",
  "statement_context",
  "completeness_meta",
]);

export const HOMEOWNERS_SCHEMA_FIELD_MAP = Object.freeze({
  policy_identity: Object.freeze([
    "carrier_name",
    "carrier_key",
    "policy_number",
    "policy_type",
    "named_insured",
    "additional_insured",
    "effective_date",
    "expiration_date",
    "policy_status",
  ]),
  property_identity: Object.freeze([
    "property_address",
    "dwelling_type",
    "occupancy_type",
    "unit_count",
    "year_built",
  ]),
  coverage_metrics: Object.freeze([
    "dwelling_coverage",
    "personal_property_coverage",
    "liability_coverage",
    "loss_of_use_coverage",
    "medical_payments_coverage",
    "other_structures_coverage",
  ]),
  deductible_metrics: Object.freeze([
    "all_peril_deductible",
    "wind_hail_deductible",
    "hurricane_deductible",
    "flood_reference",
    "earthquake_reference",
  ]),
  premium_billing_metrics: Object.freeze([
    "annual_premium",
    "billing_mode",
    "escrowed_indicator",
    "renewal_premium_change",
  ]),
  claims_and_status: Object.freeze([
    "claims_notice_present",
    "cancellation_notice_present",
    "endorsement_present",
    "inspection_required_indicator",
  ]),
  mortgage_and_escrow_context: Object.freeze([
    "mortgagee_present",
    "escrow_reference_present",
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

export const HOMEOWNERS_SCHEMA_VERSION = "homeowners.foundation.v1";

export const HOMEOWNERS_MODULE_CONNECTIONS = Object.freeze({
  homeowners_hub: "Uses registries for policy-type grouping, carrier labels, and starter rollups.",
  homeowners_policy_detail:
    "Uses normalized schema for policy identity, property details, coverages, deductibles, billing, and portal readiness.",
  generic_assets_documents:
    "Maps uploaded homeowners files into shared asset/document records before specialized parsing is added.",
  linked_portals:
    "Connects carrier_key and portal_and_access to continuity credentials and recovery readiness.",
  future_parser:
    "Will classify carrier, policy type, and document class before filling normalized fields and completeness_meta.",
  future_supabase_schema:
    "Can persist registries as reference data and normalized snapshots/intelligence as homeowners-specific tables.",
});

export const HOMEOWNERS_SCHEMA_TEMPLATE = Object.freeze({
  policy_identity: Object.freeze({
    carrier_name: null,
    carrier_key: null,
    policy_number: null,
    policy_type: null,
    named_insured: null,
    additional_insured: null,
    effective_date: null,
    expiration_date: null,
    policy_status: null,
  }),
  property_identity: Object.freeze({
    property_address: null,
    dwelling_type: null,
    occupancy_type: null,
    unit_count: null,
    year_built: null,
  }),
  coverage_metrics: Object.freeze({
    dwelling_coverage: null,
    personal_property_coverage: null,
    liability_coverage: null,
    loss_of_use_coverage: null,
    medical_payments_coverage: null,
    other_structures_coverage: null,
  }),
  deductible_metrics: Object.freeze({
    all_peril_deductible: null,
    wind_hail_deductible: null,
    hurricane_deductible: null,
    flood_reference: null,
    earthquake_reference: null,
  }),
  premium_billing_metrics: Object.freeze({
    annual_premium: null,
    billing_mode: null,
    escrowed_indicator: null,
    renewal_premium_change: null,
  }),
  claims_and_status: Object.freeze({
    claims_notice_present: null,
    cancellation_notice_present: null,
    endorsement_present: null,
    inspection_required_indicator: null,
  }),
  mortgage_and_escrow_context: Object.freeze({
    mortgagee_present: null,
    escrow_reference_present: null,
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
    schema_version: HOMEOWNERS_SCHEMA_VERSION,
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

export function createEmptyHomeownersSchema() {
  return cloneSchemaSection(HOMEOWNERS_SCHEMA_TEMPLATE);
}
