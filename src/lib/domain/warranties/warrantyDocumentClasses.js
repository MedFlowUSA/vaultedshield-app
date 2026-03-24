export const WARRANTY_DOCUMENT_CLASS_REGISTRY = {
  warranty_contract: {
    document_class_key: "warranty_contract",
    display_name: "Warranty Contract",
    primary_use: "Primary warranty/service-contract identity and terms reference",
    expected_fields: ["contract_number", "effective_date", "expiration_date", "covered_item_name"],
    related_warranty_types: ["home_warranty_contract", "appliance_warranty", "extended_service_plan_generic", "warranty_generic"],
  },
  protection_plan: {
    document_class_key: "protection_plan",
    display_name: "Protection Plan",
    primary_use: "Retail or third-party protection-plan coverage reference",
    expected_fields: ["covered_item_name", "purchase_date", "expiration_date", "proof_of_purchase_reference"],
    related_warranty_types: ["electronics_protection_plan", "furniture_protection_plan_reference", "extended_service_plan_generic"],
  },
  service_agreement: {
    document_class_key: "service_agreement",
    display_name: "Service Agreement",
    primary_use: "Service-contract and covered-component reference",
    expected_fields: ["covered_components_summary", "coverage_start_date", "coverage_end_date", "claim_contact"],
    related_warranty_types: ["home_warranty_contract", "hvac_service_contract", "vehicle_service_contract_reference"],
  },
  proof_of_purchase_reference: {
    document_class_key: "proof_of_purchase_reference",
    display_name: "Proof of Purchase Reference",
    primary_use: "Purchase evidence and start-date support reference",
    expected_fields: ["purchase_date", "purchaser_name", "covered_item_name", "proof_of_purchase_reference"],
    related_warranty_types: ["appliance_warranty", "electronics_protection_plan", "warranty_generic"],
  },
  renewal_notice: {
    document_class_key: "renewal_notice",
    display_name: "Renewal Notice",
    primary_use: "Renewal or extension visibility",
    expected_fields: ["renewal_option_present", "coverage_end_date", "contract_status"],
    related_warranty_types: ["home_warranty_contract", "hvac_service_contract", "extended_service_plan_generic"],
  },
  claim_notice: {
    document_class_key: "claim_notice",
    display_name: "Claim Notice",
    primary_use: "Claim initiation or claim-status visibility",
    expected_fields: ["claim_notice_present", "claim_status_visible", "service_request_reference"],
    related_warranty_types: ["warranty_generic", "home_warranty_contract", "electronics_protection_plan"],
  },
  expiration_notice: {
    document_class_key: "expiration_notice",
    display_name: "Expiration Notice",
    primary_use: "Coverage end and action-required reference",
    expected_fields: ["coverage_end_date", "contract_status", "renewal_option_present"],
    related_warranty_types: ["warranty_generic", "home_warranty_contract", "appliance_warranty"],
  },
  service_history_reference: {
    document_class_key: "service_history_reference",
    display_name: "Service History Reference",
    primary_use: "Repair/service event visibility",
    expected_fields: ["service_history_present", "service_request_reference", "claim_status_visible"],
    related_warranty_types: ["vehicle_service_contract_reference", "hvac_service_contract", "electronics_protection_plan"],
  },
  other_warranty_document: {
    document_class_key: "other_warranty_document",
    display_name: "Other Warranty Document",
    primary_use: "Fallback intake class for unclassified warranty materials",
    expected_fields: ["provider_name", "contract_status", "covered_item_name"],
    related_warranty_types: ["warranty_generic"],
  },
};

export const WARRANTY_DOCUMENT_CLASS_KEYS = Object.freeze(Object.keys(WARRANTY_DOCUMENT_CLASS_REGISTRY));

export function listWarrantyDocumentClasses() {
  return Object.values(WARRANTY_DOCUMENT_CLASS_REGISTRY);
}

export function getWarrantyDocumentClass(documentClassKey) {
  return WARRANTY_DOCUMENT_CLASS_REGISTRY[documentClassKey] || null;
}
