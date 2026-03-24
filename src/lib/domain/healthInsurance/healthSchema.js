export const HEALTH_SCHEMA_GROUPS = [
  "plan_identity",
  "member_coverage",
  "cost_share_metrics",
  "network_and_access",
  "prescription_context",
  "claims_and_authorization",
  "portal_and_access",
  "statement_context",
  "completeness_meta",
];

export const HEALTH_SCHEMA_FIELD_MAP = {
  plan_identity: [
    "carrier_name",
    "carrier_key",
    "plan_name",
    "plan_type",
    "policy_or_member_id_masked",
    "subscriber_name",
    "employer_group_name",
    "effective_date",
    "renewal_date",
    "plan_status",
  ],
  member_coverage: [
    "covered_members_count",
    "dependent_coverage_visible",
    "primary_member_name",
    "family_plan_indicator",
  ],
  cost_share_metrics: [
    "deductible_individual",
    "deductible_family",
    "out_of_pocket_max_individual",
    "out_of_pocket_max_family",
    "primary_care_copay",
    "specialist_copay",
    "emergency_room_copay",
    "coinsurance_percent",
    "premium_amount",
  ],
  network_and_access: [
    "network_name",
    "in_network_only_indicator",
    "pcp_required_indicator",
    "referral_required_indicator",
  ],
  prescription_context: [
    "formulary_reference_present",
    "rx_deductible_present",
    "prescription_tier_summary_present",
  ],
  claims_and_authorization: [
    "claim_notice_present",
    "prior_authorization_notice_present",
    "eligibility_notice_present",
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

export const HEALTH_SCHEMA_VERSION = "2026-03-16.health.foundation.v1";

export const HEALTH_MODULE_CONNECTIONS = {
  health_hub: "List generic health insurance assets and linked health_plans records.",
  health_plan_detail: "Load getHealthPlanBundle(...) plus linked generic asset continuity context.",
  generic_assets: "assets remains the platform-level category shell while health_plans holds deep module structure.",
  generic_documents: "asset_documents remains universal storage and health_documents carries module-specific metadata.",
  linked_portals: "Portal continuity stays attached at the linked asset level and can be surfaced in detail views.",
  future_parser: "Future health parsing should land normalized outputs in health_snapshots.",
  future_intelligence: "Future health review outputs should land in health_analytics.",
  future_supabase_modeling: "Schema is designed to extend without collapsing module distinctions into generic tables.",
};

export const HEALTH_SCHEMA_TEMPLATE = Object.freeze({
  plan_identity: {
    carrier_name: null,
    carrier_key: null,
    plan_name: null,
    plan_type: null,
    policy_or_member_id_masked: null,
    subscriber_name: null,
    employer_group_name: null,
    effective_date: null,
    renewal_date: null,
    plan_status: null,
  },
  member_coverage: {
    covered_members_count: null,
    dependent_coverage_visible: null,
    primary_member_name: null,
    family_plan_indicator: null,
  },
  cost_share_metrics: {
    deductible_individual: null,
    deductible_family: null,
    out_of_pocket_max_individual: null,
    out_of_pocket_max_family: null,
    primary_care_copay: null,
    specialist_copay: null,
    emergency_room_copay: null,
    coinsurance_percent: null,
    premium_amount: null,
  },
  network_and_access: {
    network_name: null,
    in_network_only_indicator: null,
    pcp_required_indicator: null,
    referral_required_indicator: null,
  },
  prescription_context: {
    formulary_reference_present: null,
    rx_deductible_present: null,
    prescription_tier_summary_present: null,
  },
  claims_and_authorization: {
    claim_notice_present: null,
    prior_authorization_notice_present: null,
    eligibility_notice_present: null,
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
    schema_version: HEALTH_SCHEMA_VERSION,
    data_sources: [],
    manual_overrides_present: false,
    last_reviewed_at: null,
  },
});

export function createEmptyHealthSchema() {
  return JSON.parse(JSON.stringify(HEALTH_SCHEMA_TEMPLATE));
}
