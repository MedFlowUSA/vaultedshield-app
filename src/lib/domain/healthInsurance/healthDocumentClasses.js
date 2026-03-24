export const HEALTH_DOCUMENT_CLASS_REGISTRY = {
  summary_of_benefits: {
    document_class_key: "summary_of_benefits",
    display_name: "Summary of Benefits",
    primary_use: "Core plan coverage overview and cost-sharing reference",
    expected_fields: ["plan_name", "deductible_individual", "out_of_pocket_max_individual", "network_name"],
    related_plan_types: ["ppo_plan", "hmo_plan", "epo_plan", "pos_plan", "hdhp_plan", "marketplace_individual_plan", "employer_group_plan"],
  },
  id_card_reference: {
    document_class_key: "id_card_reference",
    display_name: "ID Card Reference",
    primary_use: "Member ID and carrier reference details",
    expected_fields: ["policy_or_member_id_masked", "carrier_name", "subscriber_name", "network_name"],
    related_plan_types: ["health_plan_generic", "ppo_plan", "hmo_plan", "medicare_advantage_plan", "medicaid_plan"],
  },
  renewal_notice: {
    document_class_key: "renewal_notice",
    display_name: "Renewal Notice",
    primary_use: "Plan renewal timing and premium change context",
    expected_fields: ["renewal_date", "premium_amount", "plan_status", "plan_name"],
    related_plan_types: ["health_plan_generic", "marketplace_individual_plan", "employer_group_plan", "medicare_advantage_plan"],
  },
  explanation_of_benefits: {
    document_class_key: "explanation_of_benefits",
    display_name: "Explanation of Benefits",
    primary_use: "Claims and member responsibility reference",
    expected_fields: ["claim_notice_present", "subscriber_name", "carrier_name", "plan_name"],
    related_plan_types: ["health_plan_generic", "ppo_plan", "hmo_plan", "medicare_advantage_plan", "medicaid_plan"],
  },
  formulary_reference: {
    document_class_key: "formulary_reference",
    display_name: "Formulary Reference",
    primary_use: "Prescription coverage tier and formulary context",
    expected_fields: ["formulary_reference_present", "prescription_tier_summary_present", "plan_name"],
    related_plan_types: ["ppo_plan", "hmo_plan", "epo_plan", "hdhp_plan", "medicare_advantage_plan"],
  },
  group_benefits_summary: {
    document_class_key: "group_benefits_summary",
    display_name: "Group Benefits Summary",
    primary_use: "Employer-sponsored benefits overview",
    expected_fields: ["employer_group_name", "covered_members_count", "premium_amount", "family_plan_indicator"],
    related_plan_types: ["employer_group_plan", "ppo_plan", "hmo_plan", "hdhp_plan"],
  },
  claims_notice: {
    document_class_key: "claims_notice",
    display_name: "Claims Notice",
    primary_use: "Claim determination or claims-related communication",
    expected_fields: ["claim_notice_present", "subscriber_name", "plan_name", "carrier_name"],
    related_plan_types: ["health_plan_generic", "ppo_plan", "hmo_plan", "medicare_advantage_plan", "medicaid_plan"],
  },
  prior_authorization_notice: {
    document_class_key: "prior_authorization_notice",
    display_name: "Prior Authorization Notice",
    primary_use: "Authorization requirement or decision reference",
    expected_fields: ["prior_authorization_notice_present", "carrier_name", "plan_name", "subscriber_name"],
    related_plan_types: ["health_plan_generic", "hmo_plan", "epo_plan", "medicare_advantage_plan", "medicaid_plan"],
  },
  eligibility_notice: {
    document_class_key: "eligibility_notice",
    display_name: "Eligibility Notice",
    primary_use: "Coverage start, continuation, or eligibility visibility",
    expected_fields: ["effective_date", "plan_status", "subscriber_name", "family_plan_indicator"],
    related_plan_types: ["health_plan_generic", "medicaid_plan", "marketplace_individual_plan", "employer_group_plan"],
  },
  other_health_document: {
    document_class_key: "other_health_document",
    display_name: "Other Health Document",
    primary_use: "Fallback intake class for unclassified health-plan materials",
    expected_fields: ["plan_name", "carrier_name", "subscriber_name"],
    related_plan_types: ["health_plan_generic"],
  },
};

export const HEALTH_DOCUMENT_CLASS_KEYS = Object.freeze(Object.keys(HEALTH_DOCUMENT_CLASS_REGISTRY));

export function listHealthDocumentClasses() {
  return Object.values(HEALTH_DOCUMENT_CLASS_REGISTRY);
}

export function getHealthDocumentClass(documentClassKey) {
  return HEALTH_DOCUMENT_CLASS_REGISTRY[documentClassKey] || null;
}
