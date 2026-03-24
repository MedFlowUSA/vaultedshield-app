export const HEALTH_INTELLIGENCE_GROUPS = [
  "summary",
  "deductible_flags",
  "oop_flags",
  "network_flags",
  "claims_flags",
  "authorization_flags",
  "family_coverage_flags",
  "completeness_flags",
];

export const HEALTH_INTELLIGENCE_SCHEMA_VERSION = "2026-03-16.health.intelligence.foundation.v1";

export const HEALTH_INTELLIGENCE_TEMPLATE = Object.freeze({
  summary: {
    headline: null,
    narrative: null,
    readiness_status: "foundation_only",
  },
  deductible_flags: {
    deductible_visibility_missing: null,
    family_deductible_visible: null,
  },
  oop_flags: {
    oop_visibility_missing: null,
    family_oop_visible: null,
  },
  network_flags: {
    network_restriction_review: null,
    pcp_requirement_visible: null,
    referral_requirement_visible: null,
  },
  claims_flags: {
    claims_notice_detected: null,
    claims_visibility_limited: null,
  },
  authorization_flags: {
    authorization_notice_detected: null,
    formulary_visibility_limited: null,
  },
  family_coverage_flags: {
    family_coverage_review: null,
    dependent_visibility_limited: null,
  },
  completeness_flags: {
    missing_plan_identity: null,
    missing_cost_share_visibility: null,
    missing_network_visibility: null,
    sparse_document_visibility: null,
  },
});

export function createEmptyHealthIntelligenceSchema() {
  return JSON.parse(JSON.stringify(HEALTH_INTELLIGENCE_TEMPLATE));
}
