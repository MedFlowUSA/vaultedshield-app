export const HOMEOWNERS_DOCUMENT_CLASS_REGISTRY = {
  declarations_page: {
    document_class_key: "declarations_page",
    display_name: "Declarations Page",
    primary_use: "Core policy identity, coverages, deductibles, and insured property review.",
    expected_fields: ["policy_number", "property_address", "dwelling_coverage", "all_peril_deductible"],
    related_policy_types: ["homeowners_standard", "condo_policy", "renters_policy", "landlord_policy"],
  },
  renewal_packet: {
    document_class_key: "renewal_packet",
    display_name: "Renewal Packet",
    primary_use: "Renewal term and premium change review.",
    expected_fields: ["effective_date", "expiration_date", "annual_premium", "renewal_premium_change"],
    related_policy_types: ["homeowners_standard", "condo_policy", "landlord_policy"],
  },
  billing_notice: {
    document_class_key: "billing_notice",
    display_name: "Billing Notice",
    primary_use: "Premium due and billing mode visibility.",
    expected_fields: ["annual_premium", "billing_mode", "escrowed_indicator"],
    related_policy_types: ["homeowners_standard", "condo_policy", "renters_policy", "landlord_policy"],
  },
  endorsement_notice: {
    document_class_key: "endorsement_notice",
    display_name: "Endorsement Notice",
    primary_use: "Coverage or policy change review.",
    expected_fields: ["policy_number", "endorsement_present", "document_type"],
    related_policy_types: ["homeowners_standard", "condo_policy", "landlord_policy", "dwelling_fire_policy"],
  },
  deductible_summary: {
    document_class_key: "deductible_summary",
    display_name: "Deductible Summary",
    primary_use: "Deductible visibility and review.",
    expected_fields: ["all_peril_deductible", "wind_hail_deductible", "hurricane_deductible"],
    related_policy_types: ["homeowners_standard", "condo_policy", "dwelling_fire_policy"],
  },
  claims_notice: {
    document_class_key: "claims_notice",
    display_name: "Claims Notice",
    primary_use: "Claims activity and status awareness.",
    expected_fields: ["claims_notice_present", "policy_number", "property_address"],
    related_policy_types: ["homeowners_standard", "condo_policy", "renters_policy", "landlord_policy"],
  },
  inspection_notice: {
    document_class_key: "inspection_notice",
    display_name: "Inspection Notice",
    primary_use: "Inspection requirements and follow-up.",
    expected_fields: ["inspection_required_indicator", "property_address", "policy_status"],
    related_policy_types: ["homeowners_standard", "vacant_property_policy", "dwelling_fire_policy"],
  },
  cancellation_notice: {
    document_class_key: "cancellation_notice",
    display_name: "Cancellation Notice",
    primary_use: "Cancellation or non-renewal review.",
    expected_fields: ["cancellation_notice_present", "policy_status", "expiration_date"],
    related_policy_types: ["homeowners_standard", "condo_policy", "renters_policy", "landlord_policy"],
  },
  id_card_reference: {
    document_class_key: "id_card_reference",
    display_name: "ID Card Reference",
    primary_use: "Reference card or minimal proof-of-policy context.",
    expected_fields: ["policy_number", "carrier_name", "effective_date"],
    related_policy_types: ["homeowners_standard", "renters_policy"],
  },
  other_homeowners_document: {
    document_class_key: "other_homeowners_document",
    display_name: "Other Homeowners Document",
    primary_use: "Fallback classification for uncategorized homeowners uploads.",
    expected_fields: ["document_type", "carrier_name", "policy_number"],
    related_policy_types: ["homeowners_standard", "condo_policy", "renters_policy", "landlord_policy"],
  },
};

export const HOMEOWNERS_DOCUMENT_CLASS_KEYS = Object.freeze(
  Object.keys(HOMEOWNERS_DOCUMENT_CLASS_REGISTRY)
);

export function listHomeownersDocumentClasses() {
  return Object.values(HOMEOWNERS_DOCUMENT_CLASS_REGISTRY);
}

export function getHomeownersDocumentClass(documentClassKey) {
  return HOMEOWNERS_DOCUMENT_CLASS_REGISTRY[documentClassKey] || null;
}
