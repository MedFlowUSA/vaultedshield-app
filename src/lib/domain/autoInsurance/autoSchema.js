export const AUTO_SCHEMA_GROUPS = [
  "policy_identity",
  "insured_and_driver_context",
  "vehicle_identity",
  "liability_coverages",
  "physical_damage_coverages",
  "deductible_metrics",
  "premium_billing_metrics",
  "claims_and_status",
  "portal_and_access",
  "statement_context",
  "completeness_meta",
];

export const AUTO_SCHEMA_FIELD_MAP = {
  policy_identity: [
    "carrier_name",
    "carrier_key",
    "policy_number",
    "policy_type",
    "named_insured",
    "additional_insured",
    "effective_date",
    "expiration_date",
    "policy_status",
  ],
  insured_and_driver_context: [
    "primary_driver_name",
    "covered_driver_count",
    "household_driver_reference_present",
  ],
  vehicle_identity: [
    "vehicle_count",
    "year_make_model_summary",
    "vin_masked",
    "garaging_address",
    "multi_vehicle_indicator",
  ],
  liability_coverages: [
    "bodily_injury_per_person",
    "bodily_injury_per_accident",
    "property_damage_liability",
    "uninsured_motorist_bi",
    "uninsured_motorist_pd",
    "underinsured_motorist_reference",
  ],
  physical_damage_coverages: [
    "collision_coverage_present",
    "comprehensive_coverage_present",
    "rental_reimbursement_present",
    "roadside_assistance_present",
    "medical_payments_present",
  ],
  deductible_metrics: [
    "collision_deductible",
    "comprehensive_deductible",
    "glass_reference",
    "other_deductible_notes",
  ],
  premium_billing_metrics: [
    "premium_amount",
    "billing_mode",
    "installment_reference",
    "renewal_premium_change",
  ],
  claims_and_status: [
    "claims_notice_present",
    "cancellation_notice_present",
    "endorsement_present",
    "sr22_reference_present",
  ],
  portal_and_access: [
    "linked_portal_present",
    "portal_verified",
    "recovery_info_present",
    "support_contact_present",
  ],
  statement_context: [
    "document_type",
    "provider_confidence",
    "extraction_confidence",
    "completeness_assessment",
  ],
  completeness_meta: [
    "schema_version",
    "data_sources",
    "manual_overrides_present",
    "last_reviewed_at",
  ],
};

export const AUTO_SCHEMA_VERSION = "2026-03-16.auto.foundation.v1";

export const AUTO_MODULE_CONNECTIONS = {
  auto_hub: "List generic auto-insurance assets and linked auto_policies records.",
  auto_policy_detail: "Load getAutoPolicyBundle(...) plus linked generic asset continuity context.",
  generic_assets: "assets remains the platform-level category shell while auto_policies holds deep module structure.",
  generic_documents: "asset_documents remains universal storage and auto_documents carries module-specific metadata.",
  linked_portals: "Portal continuity stays attached at the linked asset level and can be surfaced in detail views.",
  future_parser: "Future auto parsing should land normalized outputs in auto_snapshots.",
  future_intelligence: "Future auto review outputs should land in auto_analytics.",
  future_supabase_modeling: "Schema is designed to extend without collapsing module distinctions into generic tables.",
};

export const AUTO_SCHEMA_TEMPLATE = Object.freeze({
  policy_identity: {
    carrier_name: null,
    carrier_key: null,
    policy_number: null,
    policy_type: null,
    named_insured: null,
    additional_insured: null,
    effective_date: null,
    expiration_date: null,
    policy_status: null,
  },
  insured_and_driver_context: {
    primary_driver_name: null,
    covered_driver_count: null,
    household_driver_reference_present: null,
  },
  vehicle_identity: {
    vehicle_count: null,
    year_make_model_summary: null,
    vin_masked: null,
    garaging_address: null,
    multi_vehicle_indicator: null,
  },
  liability_coverages: {
    bodily_injury_per_person: null,
    bodily_injury_per_accident: null,
    property_damage_liability: null,
    uninsured_motorist_bi: null,
    uninsured_motorist_pd: null,
    underinsured_motorist_reference: null,
  },
  physical_damage_coverages: {
    collision_coverage_present: null,
    comprehensive_coverage_present: null,
    rental_reimbursement_present: null,
    roadside_assistance_present: null,
    medical_payments_present: null,
  },
  deductible_metrics: {
    collision_deductible: null,
    comprehensive_deductible: null,
    glass_reference: null,
    other_deductible_notes: null,
  },
  premium_billing_metrics: {
    premium_amount: null,
    billing_mode: null,
    installment_reference: null,
    renewal_premium_change: null,
  },
  claims_and_status: {
    claims_notice_present: null,
    cancellation_notice_present: null,
    endorsement_present: null,
    sr22_reference_present: null,
  },
  portal_and_access: {
    linked_portal_present: null,
    portal_verified: null,
    recovery_info_present: null,
    support_contact_present: null,
  },
  statement_context: {
    document_type: null,
    provider_confidence: null,
    extraction_confidence: null,
    completeness_assessment: {},
  },
  completeness_meta: {
    schema_version: AUTO_SCHEMA_VERSION,
    data_sources: [],
    manual_overrides_present: false,
    last_reviewed_at: null,
  },
});

export function createEmptyAutoSchema() {
  return JSON.parse(JSON.stringify(AUTO_SCHEMA_TEMPLATE));
}
