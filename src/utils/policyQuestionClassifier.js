export const POLICY_QUESTION_TYPES = {
  performance: "performance",
  charges: "charges",
  comparison: "comparison",
  illustration_vs_actual: "illustration_vs_actual",
  loans: "loans",
  policy_health: "policy_health",
  missing_data: "missing_data",
  general: "general",
};

const CLASSIFICATION_RULES = [
  {
    type: POLICY_QUESTION_TYPES.comparison,
    keywords: ["compare", "comparison", "versus", "vs", "better than", "other policy", "another policy"],
  },
  {
    type: POLICY_QUESTION_TYPES.illustration_vs_actual,
    keywords: ["illustration", "ahead", "behind", "projected", "projection", "pace", "actual"],
  },
  {
    type: POLICY_QUESTION_TYPES.charges,
    keywords: ["charges", "charge", "coi", "cost of insurance", "fees", "fee", "drag", "deduction"],
  },
  {
    type: POLICY_QUESTION_TYPES.loans,
    keywords: ["loan", "loans", "lapse", "loan pressure", "lapse pressure", "collateralized"],
  },
  {
    type: POLICY_QUESTION_TYPES.missing_data,
    keywords: ["missing", "missing data", "what is missing", "what's missing", "incomplete", "not visible", "uncertain"],
  },
  {
    type: POLICY_QUESTION_TYPES.policy_health,
    keywords: ["rated", "rating", "weak", "watch", "watch here", "watch out", "health", "review first", "what should i review", "what should i watch"],
  },
  {
    type: POLICY_QUESTION_TYPES.performance,
    keywords: ["performing", "doing well", "doing", "growth", "healthy", "stable", "performing well"],
  },
];

export function classifyPolicyQuestionType(question = "") {
  const normalized = String(question || "").trim().toLowerCase();
  if (!normalized) return POLICY_QUESTION_TYPES.general;

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.type;
    }
  }

  return POLICY_QUESTION_TYPES.general;
}

export default classifyPolicyQuestionType;
