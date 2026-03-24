export const RETIREMENT_DOCUMENT_CLASS_REGISTRY = {
  quarterly_statement: {
    document_class_key: "quarterly_statement",
    display_name: "Quarterly Statement",
    primary_use: "Periodic account balance and allocation review",
    expected_fields: ["statement_date", "current_balance", "allocation_summary", "rate_of_return"],
    related_plan_types: ["401k", "403b", "traditional_ira", "roth_ira", "rollover_ira"],
  },
  annual_statement: {
    document_class_key: "annual_statement",
    display_name: "Annual Statement",
    primary_use: "Annual balance and contribution review",
    expected_fields: ["statement_date", "current_balance", "ytd_contributions", "beneficiary_present"],
    related_plan_types: ["401k", "403b", "457b_governmental", "traditional_ira", "roth_ira"],
  },
  plan_summary: {
    document_class_key: "plan_summary",
    display_name: "Plan Summary",
    primary_use: "Plan-level overview and features",
    expected_fields: ["plan_name", "account_type", "loan_possible", "beneficiary_present"],
    related_plan_types: ["401k", "403b", "profit_sharing_plan", "cash_balance_plan"],
  },
  beneficiary_designation: {
    document_class_key: "beneficiary_designation",
    display_name: "Beneficiary Designation",
    primary_use: "Beneficiary review and continuity validation",
    expected_fields: ["beneficiary_present", "primary_beneficiary_name", "contingent_beneficiary_name"],
    related_plan_types: ["401k", "traditional_ira", "roth_ira", "defined_benefit_pension"],
  },
  pension_estimate: {
    document_class_key: "pension_estimate",
    display_name: "Pension Estimate",
    primary_use: "Projected pension income analysis",
    expected_fields: ["monthly_benefit_estimate", "lump_sum_estimate", "normal_retirement_age"],
    related_plan_types: ["defined_benefit_pension", "government_pension", "cash_balance_plan"],
  },
  loan_statement: {
    document_class_key: "loan_statement",
    display_name: "Loan Statement",
    primary_use: "Outstanding plan loan review",
    expected_fields: ["loan_balance", "loan_payment_amount", "loan_issue_date"],
    related_plan_types: ["401k", "403b", "tsp"],
  },
  distribution_notice: {
    document_class_key: "distribution_notice",
    display_name: "Distribution Notice",
    primary_use: "Distribution and payout status review",
    expected_fields: ["distribution_status", "withdrawal_amount", "statement_date"],
    related_plan_types: ["traditional_ira", "inherited_ira", "defined_benefit_pension"],
  },
  rollover_notice: {
    document_class_key: "rollover_notice",
    display_name: "Rollover Notice",
    primary_use: "Rollover opportunity or completed rollover review",
    expected_fields: ["rollover_balance", "distribution_status", "statement_date"],
    related_plan_types: ["401k", "403b", "rollover_ira", "terminated_employer_plan"],
  },
  fee_disclosure: {
    document_class_key: "fee_disclosure",
    display_name: "Fee Disclosure",
    primary_use: "Plan fee and cost visibility",
    expected_fields: ["plan_name", "investment_metrics", "statement_period"],
    related_plan_types: ["401k", "403b", "457b_governmental"],
  },
  rmd_notice: {
    document_class_key: "rmd_notice",
    display_name: "RMD Notice",
    primary_use: "Required minimum distribution monitoring",
    expected_fields: ["rmd_due", "rmd_taken", "statement_date"],
    related_plan_types: ["traditional_ira", "inherited_ira", "rmd_relevant_retirement_account"],
  },
  account_snapshot: {
    document_class_key: "account_snapshot",
    display_name: "Account Snapshot",
    primary_use: "Single-point balance review",
    expected_fields: ["current_balance", "vested_balance", "allocation_summary"],
    related_plan_types: ["401k", "traditional_ira", "roth_ira", "tsp"],
  },
  participant_statement: {
    document_class_key: "participant_statement",
    display_name: "Participant Statement",
    primary_use: "Core participant-level account review",
    expected_fields: ["participant_name", "current_balance", "employee_contributions", "employer_match"],
    related_plan_types: ["401k", "403b", "457b_governmental", "tsp"],
  },
  plan_administrator_notice: {
    document_class_key: "plan_administrator_notice",
    display_name: "Plan Administrator Notice",
    primary_use: "Operational notices, amendments, and participant communications",
    expected_fields: ["plan_name", "statement_date", "document_type"],
    related_plan_types: ["401k", "403b", "profit_sharing_plan", "defined_benefit_pension"],
  },
};

export const RETIREMENT_DOCUMENT_CLASS_KEYS = Object.freeze(
  Object.keys(RETIREMENT_DOCUMENT_CLASS_REGISTRY)
);

export function listRetirementDocumentClasses() {
  return Object.values(RETIREMENT_DOCUMENT_CLASS_REGISTRY);
}

export function getRetirementDocumentClass(documentClassKey) {
  return RETIREMENT_DOCUMENT_CLASS_REGISTRY[documentClassKey] || null;
}
