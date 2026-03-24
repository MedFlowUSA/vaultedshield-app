export const HOMEOWNERS_INTELLIGENCE_GROUPS = Object.freeze([
  "summary",
  "review_flags",
  "deductible_flags",
  "coverage_flags",
  "renewal_flags",
  "mortgage_flags",
  "claims_flags",
  "completeness_flags",
]);

export const HOMEOWNERS_INTELLIGENCE_SCHEMA_VERSION = "homeowners.intelligence.v1";

export const HOMEOWNERS_INTELLIGENCE_TEMPLATE = Object.freeze({
  summary: Object.freeze({
    policy_summary: null,
    coverage_visibility: null,
    deductible_visibility: null,
    carrier_visibility: null,
  }),
  review_flags: Object.freeze([]),
  deductible_flags: Object.freeze({
    high_deductible_review: false,
    wind_hail_deductible_visible: false,
    hurricane_deductible_visible: false,
  }),
  coverage_flags: Object.freeze({
    missing_coverage_visibility: false,
    liability_visible: false,
    dwelling_visible: false,
  }),
  renewal_flags: Object.freeze({
    renewal_change_review: false,
    renewal_packet_detected: false,
    cancellation_notice_detected: false,
  }),
  mortgage_flags: Object.freeze({
    mortgagee_detected: false,
    escrow_reference_detected: false,
    mortgage_visibility_limited: false,
  }),
  claims_flags: Object.freeze({
    claims_notice_detected: false,
    endorsement_missing_visibility: false,
    inspection_notice_detected: false,
  }),
  completeness_flags: Object.freeze({
    statement_missing_sections: Object.freeze([]),
    carrier_unconfirmed: false,
    policy_type_unconfirmed: false,
    document_class_unconfirmed: false,
  }),
  intelligence_meta: Object.freeze({
    schema_version: HOMEOWNERS_INTELLIGENCE_SCHEMA_VERSION,
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

export function createEmptyHomeownersIntelligenceSchema() {
  return cloneIntelligenceSection(HOMEOWNERS_INTELLIGENCE_TEMPLATE);
}
