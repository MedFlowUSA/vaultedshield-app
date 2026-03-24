export const AUTO_INTELLIGENCE_GROUPS = [
  "summary",
  "liability_flags",
  "deductible_flags",
  "vehicle_flags",
  "renewal_flags",
  "claims_flags",
  "driver_flags",
  "completeness_flags",
];

export const AUTO_INTELLIGENCE_SCHEMA_VERSION = "2026-03-16.auto.intelligence.foundation.v1";

export const AUTO_INTELLIGENCE_TEMPLATE = Object.freeze({
  summary: {
    headline: null,
    narrative: null,
    readiness_status: "foundation_only",
  },
  liability_flags: {
    liability_visibility_missing: null,
    uninsured_motorist_review: null,
  },
  deductible_flags: {
    deductible_visibility_missing: null,
    physical_damage_deductible_visible: null,
  },
  vehicle_flags: {
    vehicle_schedule_missing: null,
    multi_vehicle_detected: null,
  },
  renewal_flags: {
    renewal_change_review: null,
    renewal_visibility_limited: null,
  },
  claims_flags: {
    claims_notice_detected: null,
    cancellation_notice_detected: null,
  },
  driver_flags: {
    driver_visibility_incomplete: null,
    household_driver_reference_limited: null,
  },
  completeness_flags: {
    missing_policy_identity: null,
    missing_vehicle_visibility: null,
    missing_liability_visibility: null,
    sparse_document_visibility: null,
  },
});

export function createEmptyAutoIntelligenceSchema() {
  return JSON.parse(JSON.stringify(AUTO_INTELLIGENCE_TEMPLATE));
}
