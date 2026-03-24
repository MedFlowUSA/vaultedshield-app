export const WARRANTY_INTELLIGENCE_GROUPS = [
  "summary",
  "expiration_flags",
  "claim_flags",
  "proof_of_purchase_flags",
  "renewal_flags",
  "covered_item_flags",
  "completeness_flags",
];

export const WARRANTY_INTELLIGENCE_SCHEMA_VERSION = "2026-03-16.warranty.intelligence.foundation.v1";

export const WARRANTY_INTELLIGENCE_TEMPLATE = Object.freeze({
  summary: {
    headline: null,
    narrative: null,
    readiness_status: "foundation_only",
  },
  expiration_flags: {
    expiration_review_needed: null,
    expiration_visibility_limited: null,
  },
  claim_flags: {
    claim_contact_missing: null,
    claim_notice_detected: null,
  },
  proof_of_purchase_flags: {
    proof_of_purchase_missing: null,
    purchase_support_visible: null,
  },
  renewal_flags: {
    renewal_option_visible: null,
    renewal_visibility_limited: null,
  },
  covered_item_flags: {
    covered_item_identity_incomplete: null,
    serial_or_model_visibility_limited: null,
  },
  completeness_flags: {
    missing_contract_identity: null,
    missing_provider_contact_visibility: null,
    missing_coverage_term_visibility: null,
    sparse_document_visibility: null,
  },
});

export function createEmptyWarrantyIntelligenceSchema() {
  return JSON.parse(JSON.stringify(WARRANTY_INTELLIGENCE_TEMPLATE));
}
