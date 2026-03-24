export const HOUSEHOLD_INTELLIGENCE_GROUPS = [
  "summary",
  "document_completeness",
  "emergency_readiness",
  "portal_continuity",
  "asset_linkage_flags",
  "module_presence_flags",
  "missing_item_prompts",
  "review_flags",
];

export const HOUSEHOLD_INTELLIGENCE_SCHEMA_VERSION = "2026-03-16.v1";

export const HOUSEHOLD_INTELLIGENCE_TEMPLATE = {
  summary: {
    household_name: null,
    asset_count: 0,
    document_count: 0,
    portal_count: 0,
    open_alert_count: 0,
    open_task_count: 0,
    intelligence_generated_at: null,
  },
  document_completeness: {
    score_label: "Sparse",
    score_value: 0,
    document_category_counts: {},
    sparse_household_documentation: true,
    notes: [],
  },
  emergency_readiness: {
    score_label: "Sparse",
    score_value: 0,
    emergency_contact_count: 0,
    professional_contact_count: 0,
    key_asset_count: 0,
    notes: [],
  },
  portal_continuity: {
    score_label: "Sparse",
    score_value: 0,
    linked_portal_count: 0,
    emergency_relevant_portal_count: 0,
    missing_recovery_count: 0,
    critical_assets_without_portals: [],
    notes: [],
  },
  asset_linkage_flags: {
    critical_assets_without_portals: [],
    insurance_assets_sparse_portal_coverage: false,
    many_assets_low_document_support: false,
  },
  module_presence_flags: {
    insurance_present: false,
    mortgage_present: false,
    retirement_present: false,
    estate_present: false,
    homeowners_present: false,
    health_present: false,
    auto_present: false,
    warranties_present: false,
  },
  missing_item_prompts: [],
  review_flags: [],
};

export function createEmptyHouseholdIntelligenceSchema() {
  return structuredClone(HOUSEHOLD_INTELLIGENCE_TEMPLATE);
}
