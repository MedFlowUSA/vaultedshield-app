export const PROPERTY_SCHEMA_GROUPS = [
  "property_identity",
  "ownership_context",
  "valuation_metrics",
  "tax_and_assessment_context",
  "hoa_and_occupancy",
  "mortgage_link_context",
  "insurance_link_context",
  "portal_and_access",
  "statement_context",
  "completeness_meta",
];

export const PROPERTY_SCHEMA_FIELD_MAP = {
  property_identity: [
    "property_name",
    "property_type",
    "property_address",
    "county",
    "parcel_or_apn_masked",
    "occupancy_type",
    "year_built",
    "square_footage",
    "bedroom_count",
    "bathroom_count",
  ],
  ownership_context: [
    "owner_name",
    "co_owner_name",
    "ownership_entity_reference",
    "purchase_date",
    "purchase_price",
  ],
  valuation_metrics: [
    "assessed_value",
    "land_value",
    "improvement_value",
    "estimated_market_value",
    "appraisal_reference_present",
  ],
  tax_and_assessment_context: [
    "property_tax_amount",
    "tax_year",
    "tax_bill_present",
    "assessment_notice_present",
  ],
  hoa_and_occupancy: [
    "hoa_present",
    "hoa_amount",
    "rental_indicator",
    "tenant_reference_present",
  ],
  mortgage_link_context: [
    "linked_mortgage_present",
    "mortgage_visibility_status",
  ],
  insurance_link_context: [
    "linked_homeowners_present",
    "flood_reference_present",
    "earthquake_reference_present",
  ],
  portal_and_access: [
    "linked_portal_present",
    "portal_verified",
    "recovery_info_present",
    "support_contact_present",
  ],
  statement_context: [
    "document_type",
    "extraction_confidence",
    "completeness_assessment",
  ],
  completeness_meta: [
    "fields_detected",
    "missing_groups",
    "source_document_count",
    "notes",
  ],
};

export const PROPERTY_SCHEMA_VERSION = "2026-03-16.v1";

export const PROPERTY_MODULE_CONNECTIONS = {
  future_links: [
    "mortgage_loans",
    "homeowners_policies",
    "portal_profiles",
    "property_tax_and_assessment_docs",
    "cross_module_household_intelligence",
  ],
};

export const PROPERTY_SCHEMA_TEMPLATE = {
  property_identity: {
    property_name: null,
    property_type: null,
    property_address: null,
    county: null,
    parcel_or_apn_masked: null,
    occupancy_type: null,
    year_built: null,
    square_footage: null,
    bedroom_count: null,
    bathroom_count: null,
  },
  ownership_context: {
    owner_name: null,
    co_owner_name: null,
    ownership_entity_reference: null,
    purchase_date: null,
    purchase_price: null,
  },
  valuation_metrics: {
    assessed_value: null,
    land_value: null,
    improvement_value: null,
    estimated_market_value: null,
    appraisal_reference_present: null,
  },
  tax_and_assessment_context: {
    property_tax_amount: null,
    tax_year: null,
    tax_bill_present: null,
    assessment_notice_present: null,
  },
  hoa_and_occupancy: {
    hoa_present: null,
    hoa_amount: null,
    rental_indicator: null,
    tenant_reference_present: null,
  },
  mortgage_link_context: {
    linked_mortgage_present: null,
    mortgage_visibility_status: null,
  },
  insurance_link_context: {
    linked_homeowners_present: null,
    flood_reference_present: null,
    earthquake_reference_present: null,
  },
  portal_and_access: {
    linked_portal_present: null,
    portal_verified: null,
    recovery_info_present: null,
    support_contact_present: null,
  },
  statement_context: {
    document_type: null,
    extraction_confidence: null,
    completeness_assessment: {},
  },
  completeness_meta: {
    fields_detected: [],
    missing_groups: [],
    source_document_count: 0,
    notes: [],
  },
};

export function createEmptyPropertySchema() {
  return structuredClone(PROPERTY_SCHEMA_TEMPLATE);
}
