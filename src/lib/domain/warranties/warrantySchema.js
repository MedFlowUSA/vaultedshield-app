export const WARRANTY_SCHEMA_GROUPS = [
  "contract_identity",
  "covered_item_identity",
  "coverage_term_metrics",
  "claim_and_service_context",
  "provider_contact_context",
  "portal_and_access",
  "statement_context",
  "completeness_meta",
];

export const WARRANTY_SCHEMA_FIELD_MAP = {
  contract_identity: [
    "provider_name",
    "provider_key",
    "contract_number",
    "warranty_type",
    "purchaser_name",
    "effective_date",
    "expiration_date",
    "contract_status",
  ],
  covered_item_identity: [
    "covered_item_name",
    "product_category",
    "model_number",
    "serial_number_masked",
    "purchase_date",
    "installation_date",
    "property_or_vehicle_reference",
  ],
  coverage_term_metrics: [
    "coverage_start_date",
    "coverage_end_date",
    "renewal_option_present",
    "deductible_or_service_fee",
    "covered_components_summary",
  ],
  claim_and_service_context: [
    "claim_notice_present",
    "service_history_present",
    "service_request_reference",
    "claim_status_visible",
  ],
  provider_contact_context: [
    "claim_contact",
    "support_contact",
    "service_portal_reference",
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

export const WARRANTY_SCHEMA_VERSION = "2026-03-16.warranty.foundation.v1";

export const WARRANTY_MODULE_CONNECTIONS = {
  warranty_hub: "List generic warranty assets and linked warranties records.",
  warranty_detail: "Load getWarrantyBundle(...) plus linked generic asset continuity context.",
  generic_assets: "assets remains the platform-level category shell while warranties holds deep module structure.",
  generic_documents: "asset_documents remains universal storage and warranty_documents carries module-specific metadata.",
  linked_portals: "Portal continuity stays attached at the linked asset level and can be surfaced in detail views.",
  future_parser: "Future warranty parsing should land normalized outputs in warranty_snapshots.",
  future_intelligence: "Future warranty review outputs should land in warranty_analytics.",
  future_supabase_modeling: "Schema is designed to extend without collapsing module distinctions into generic tables.",
};

export const WARRANTY_SCHEMA_TEMPLATE = Object.freeze({
  contract_identity: {
    provider_name: null,
    provider_key: null,
    contract_number: null,
    warranty_type: null,
    purchaser_name: null,
    effective_date: null,
    expiration_date: null,
    contract_status: null,
  },
  covered_item_identity: {
    covered_item_name: null,
    product_category: null,
    model_number: null,
    serial_number_masked: null,
    purchase_date: null,
    installation_date: null,
    property_or_vehicle_reference: null,
  },
  coverage_term_metrics: {
    coverage_start_date: null,
    coverage_end_date: null,
    renewal_option_present: null,
    deductible_or_service_fee: null,
    covered_components_summary: null,
  },
  claim_and_service_context: {
    claim_notice_present: null,
    service_history_present: null,
    service_request_reference: null,
    claim_status_visible: null,
  },
  provider_contact_context: {
    claim_contact: null,
    support_contact: null,
    service_portal_reference: null,
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
    schema_version: WARRANTY_SCHEMA_VERSION,
    data_sources: [],
    manual_overrides_present: false,
    last_reviewed_at: null,
  },
});

export function createEmptyWarrantySchema() {
  return JSON.parse(JSON.stringify(WARRANTY_SCHEMA_TEMPLATE));
}
