export const PROPERTY_INTELLIGENCE_GROUPS = [
  "summary",
  "valuation_flags",
  "tax_flags",
  "occupancy_flags",
  "mortgage_link_flags",
  "insurance_link_flags",
  "hoa_flags",
  "completeness_flags",
];

export const PROPERTY_INTELLIGENCE_SCHEMA_VERSION = "2026-03-16.v1";

export const PROPERTY_INTELLIGENCE_TEMPLATE = {
  summary: {
    property_type_detected: null,
    property_address_visible: null,
    valuation_visible: null,
  },
  valuation_flags: {
    assessed_value_visible: false,
    appraisal_reference_visible: false,
  },
  tax_flags: {
    tax_document_missing: false,
    property_tax_visible: false,
  },
  occupancy_flags: {
    investment_property_detected: false,
    tenant_visibility_present: false,
  },
  mortgage_link_flags: {
    mortgage_link_missing: false,
    mortgage_visibility_unknown: true,
  },
  insurance_link_flags: {
    homeowners_link_missing: false,
    flood_reference_visible: false,
    earthquake_reference_visible: false,
  },
  hoa_flags: {
    hoa_visibility_incomplete: false,
    hoa_present: false,
  },
  completeness_flags: {
    sparse_property_documentation: true,
    missing_property_identity: true,
  },
};

export function createEmptyPropertyIntelligenceSchema() {
  return structuredClone(PROPERTY_INTELLIGENCE_TEMPLATE);
}
