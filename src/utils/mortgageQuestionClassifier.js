export const MORTGAGE_QUESTION_TYPES = {
  payment_structure: "payment_structure",
  balance_status: "balance_status",
  escrow: "escrow",
  rate_structure: "rate_structure",
  linkage_status: "linkage_status",
  missing_data: "missing_data",
  general: "general",
};

const CLASSIFICATION_RULES = [
  {
    type: MORTGAGE_QUESTION_TYPES.escrow,
    keywords: ["escrow", "tax", "insurance payment", "impound"],
  },
  {
    type: MORTGAGE_QUESTION_TYPES.linkage_status,
    keywords: ["linked", "link", "property", "collateral", "complete", "correctly"],
  },
  {
    type: MORTGAGE_QUESTION_TYPES.missing_data,
    keywords: ["missing", "incomplete", "not visible", "what is missing", "what's missing"],
  },
  {
    type: MORTGAGE_QUESTION_TYPES.payment_structure,
    keywords: ["payment", "monthly payment", "amortization", "principal", "interest only"],
  },
  {
    type: MORTGAGE_QUESTION_TYPES.balance_status,
    keywords: ["balance", "payoff", "principal", "remaining", "maturity"],
  },
  {
    type: MORTGAGE_QUESTION_TYPES.rate_structure,
    keywords: ["rate", "interest", "arm", "fixed", "adjustable", "loan type"],
  },
];

export function classifyMortgageQuestionType(question = "") {
  const normalized = String(question || "").trim().toLowerCase();
  if (!normalized) return MORTGAGE_QUESTION_TYPES.general;

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.type;
    }
  }

  return MORTGAGE_QUESTION_TYPES.general;
}

export default classifyMortgageQuestionType;
