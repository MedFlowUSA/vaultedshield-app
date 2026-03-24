export const AUTO_DOCUMENT_CLASS_REGISTRY = {
  declarations_page: {
    document_class_key: "declarations_page",
    display_name: "Declarations Page",
    primary_use: "Primary coverage, insured, vehicle, and policy-terms reference",
    expected_fields: ["named_insured", "effective_date", "expiration_date", "bodily_injury_per_person"],
    related_policy_types: ["personal_auto_policy", "multi_vehicle_auto_policy", "single_vehicle_auto_policy", "auto_policy_generic"],
  },
  id_card_reference: {
    document_class_key: "id_card_reference",
    display_name: "ID Card Reference",
    primary_use: "Policy number and proof-of-insurance reference",
    expected_fields: ["policy_number", "named_insured", "effective_date", "expiration_date"],
    related_policy_types: ["personal_auto_policy", "single_vehicle_auto_policy", "auto_policy_generic"],
  },
  renewal_notice: {
    document_class_key: "renewal_notice",
    display_name: "Renewal Notice",
    primary_use: "Renewal timing and premium-change context",
    expected_fields: ["renewal_premium_change", "effective_date", "expiration_date", "policy_status"],
    related_policy_types: ["personal_auto_policy", "multi_vehicle_auto_policy", "auto_policy_generic"],
  },
  billing_notice: {
    document_class_key: "billing_notice",
    display_name: "Billing Notice",
    primary_use: "Premium billing and installment reference",
    expected_fields: ["premium_amount", "billing_mode", "installment_reference", "policy_status"],
    related_policy_types: ["auto_policy_generic", "personal_auto_policy", "commercial_auto_reference"],
  },
  endorsement_notice: {
    document_class_key: "endorsement_notice",
    display_name: "Endorsement Notice",
    primary_use: "Policy endorsement or rider reference",
    expected_fields: ["endorsement_present", "policy_status", "named_insured"],
    related_policy_types: ["rideshare_endorsement_reference", "personal_auto_policy", "auto_policy_generic"],
  },
  vehicle_schedule: {
    document_class_key: "vehicle_schedule",
    display_name: "Vehicle Schedule",
    primary_use: "Vehicle list and garaging schedule reference",
    expected_fields: ["vehicle_count", "year_make_model_summary", "vin_masked", "garaging_address"],
    related_policy_types: ["multi_vehicle_auto_policy", "commercial_auto_reference", "auto_policy_generic"],
  },
  claims_notice: {
    document_class_key: "claims_notice",
    display_name: "Claims Notice",
    primary_use: "Claims or loss-activity reference",
    expected_fields: ["claims_notice_present", "policy_status", "named_insured"],
    related_policy_types: ["auto_policy_generic", "personal_auto_policy", "commercial_auto_reference"],
  },
  cancellation_notice: {
    document_class_key: "cancellation_notice",
    display_name: "Cancellation Notice",
    primary_use: "Cancellation, lapse, or non-renewal warning reference",
    expected_fields: ["cancellation_notice_present", "policy_status", "premium_amount"],
    related_policy_types: ["auto_policy_generic", "personal_auto_policy", "commercial_auto_reference"],
  },
  proof_of_insurance_reference: {
    document_class_key: "proof_of_insurance_reference",
    display_name: "Proof of Insurance Reference",
    primary_use: "Coverage proof reference for vehicle or state compliance",
    expected_fields: ["policy_number", "effective_date", "expiration_date", "named_insured"],
    related_policy_types: ["single_vehicle_auto_policy", "motorcycle_policy_reference", "auto_policy_generic"],
  },
  other_auto_document: {
    document_class_key: "other_auto_document",
    display_name: "Other Auto Document",
    primary_use: "Fallback intake class for unclassified auto-policy materials",
    expected_fields: ["named_insured", "policy_status", "carrier_name"],
    related_policy_types: ["auto_policy_generic"],
  },
};

export const AUTO_DOCUMENT_CLASS_KEYS = Object.freeze(Object.keys(AUTO_DOCUMENT_CLASS_REGISTRY));

export function listAutoDocumentClasses() {
  return Object.values(AUTO_DOCUMENT_CLASS_REGISTRY);
}

export function getAutoDocumentClass(documentClassKey) {
  return AUTO_DOCUMENT_CLASS_REGISTRY[documentClassKey] || null;
}
