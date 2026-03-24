export const MORTGAGE_DOCUMENT_CLASS_REGISTRY = {
  monthly_statement: {
    document_class_key: "monthly_statement",
    display_name: "Monthly Statement",
    primary_use: "Core mortgage balance, payment, and due-date review.",
    expected_fields: ["current_principal_balance", "monthly_payment", "next_due_date", "interest_rate"],
    related_loan_types: ["conventional_fixed_mortgage", "adjustable_rate_mortgage", "fha_mortgage", "va_mortgage"],
  },
  escrow_statement: {
    document_class_key: "escrow_statement",
    display_name: "Escrow Statement",
    primary_use: "Escrow balance and tax/insurance component review.",
    expected_fields: ["escrow_balance", "tax_component", "insurance_component", "escrow_present"],
    related_loan_types: ["conventional_fixed_mortgage", "fha_mortgage", "va_mortgage", "refinance_mortgage"],
  },
  payoff_statement: {
    document_class_key: "payoff_statement",
    display_name: "Payoff Statement",
    primary_use: "Payoff amount and payoff timing review.",
    expected_fields: ["payoff_amount", "current_principal_balance", "next_due_date"],
    related_loan_types: ["conventional_fixed_mortgage", "heloc", "second_mortgage", "private_money_mortgage"],
  },
  amortization_schedule: {
    document_class_key: "amortization_schedule",
    display_name: "Amortization Schedule",
    primary_use: "Scheduled payment and payoff structure review.",
    expected_fields: ["monthly_payment", "principal_payment", "interest_payment", "term_months"],
    related_loan_types: ["conventional_fixed_mortgage", "fha_mortgage", "jumbo_mortgage"],
  },
  closing_disclosure: {
    document_class_key: "closing_disclosure",
    display_name: "Closing Disclosure",
    primary_use: "Origination and closing-term review.",
    expected_fields: ["origination_date", "original_balance", "interest_rate", "monthly_payment"],
    related_loan_types: ["conventional_fixed_mortgage", "refinance_mortgage", "fha_mortgage", "va_mortgage"],
  },
  promissory_note: {
    document_class_key: "promissory_note",
    display_name: "Promissory Note",
    primary_use: "Core note terms and borrower obligations.",
    expected_fields: ["loan_number_masked", "borrower_name", "interest_rate", "maturity_date"],
    related_loan_types: ["private_money_mortgage", "seller_carry_note", "second_mortgage", "jumbo_mortgage"],
  },
  deed_of_trust_reference: {
    document_class_key: "deed_of_trust_reference",
    display_name: "Deed of Trust Reference",
    primary_use: "Lien and property reference visibility.",
    expected_fields: ["property_address", "borrower_name", "origination_date"],
    related_loan_types: ["conventional_fixed_mortgage", "second_mortgage", "seller_carry_note"],
  },
  refinance_packet: {
    document_class_key: "refinance_packet",
    display_name: "Refinance Packet",
    primary_use: "Refinance transition and replacement-loan review.",
    expected_fields: ["origination_date", "monthly_payment", "interest_rate", "loan_status"],
    related_loan_types: ["refinance_mortgage", "conventional_fixed_mortgage", "adjustable_rate_mortgage"],
  },
  loan_modification_notice: {
    document_class_key: "loan_modification_notice",
    display_name: "Loan Modification Notice",
    primary_use: "Modification review and payment-change visibility.",
    expected_fields: ["loan_status", "monthly_payment", "interest_rate", "next_due_date"],
    related_loan_types: ["loan_modification_reference", "conventional_fixed_mortgage", "fha_mortgage"],
  },
  delinquency_notice: {
    document_class_key: "delinquency_notice",
    display_name: "Delinquency Notice",
    primary_use: "Delinquency and late-status visibility.",
    expected_fields: ["late_status_visible", "late_fee", "monthly_payment", "next_due_date"],
    related_loan_types: ["conventional_fixed_mortgage", "heloc", "loan_modification_reference"],
  },
  tax_and_insurance_escrow_notice: {
    document_class_key: "tax_and_insurance_escrow_notice",
    display_name: "Tax and Insurance Escrow Notice",
    primary_use: "Escrow adjustment and shortage/surplus visibility.",
    expected_fields: ["escrow_balance", "tax_component", "insurance_component", "monthly_payment"],
    related_loan_types: ["conventional_fixed_mortgage", "fha_mortgage", "va_mortgage", "refinance_mortgage"],
  },
  other_mortgage_document: {
    document_class_key: "other_mortgage_document",
    display_name: "Other Mortgage Document",
    primary_use: "Fallback classification for uncategorized mortgage uploads.",
    expected_fields: ["document_type", "lender_name", "loan_number_masked"],
    related_loan_types: ["conventional_fixed_mortgage", "heloc", "seller_carry_note", "private_money_mortgage"],
  },
};

export const MORTGAGE_DOCUMENT_CLASS_KEYS = Object.freeze(
  Object.keys(MORTGAGE_DOCUMENT_CLASS_REGISTRY)
);

export function listMortgageDocumentClasses() {
  return Object.values(MORTGAGE_DOCUMENT_CLASS_REGISTRY);
}

export function getMortgageDocumentClass(documentClassKey) {
  return MORTGAGE_DOCUMENT_CLASS_REGISTRY[documentClassKey] || null;
}
