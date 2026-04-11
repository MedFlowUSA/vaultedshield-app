const INTENT_KEYWORDS = [
  {
    intent: "policy_comparison",
    keywords: ["compare", "comparison", "versus", "vs", "stronger policy", "another policy"],
  },
  {
    intent: "illustration_comparison",
    keywords: ["illustration", "ahead", "behind", "pace", "keep pace", "projected", "projection"],
  },
  {
    intent: "charge_analysis",
    keywords: ["charge", "charges", "coi", "cost of insurance", "fee", "fees", "drag", "deduction"],
  },
  {
    intent: "risk_summary",
    keywords: ["what are the risks", "risks", "risk flags", "what risk", "anything risky", "red flags", "concerns"],
  },
  {
    intent: "loan_risk",
    keywords: ["loan", "loans", "lapse", "loan pressure", "lapse pressure", "under pressure", "collapse"],
  },
  {
    intent: "missing_data",
    keywords: ["missing", "missing data", "what data", "incomplete", "not visible", "what information"],
  },
  {
    intent: "policy_review_priority",
    keywords: ["review first", "pay attention", "priority", "focus first", "what should i review"],
  },
  {
    intent: "rating_explanation",
    keywords: ["rated", "rating", "why is this policy rated", "why is this rated", "why weak", "why moderate", "why strong"],
  },
  {
    intent: "performance_summary",
    keywords: ["good", "healthy", "performing", "performing well", "doing well", "stable", "growing", "is it growing", "how is this policy doing", "policy condition"],
  },
];

export function classifyPolicyQuestion(question = "") {
  const normalized = String(question || "").trim().toLowerCase();

  if (!normalized) {
    return "generic_summary";
  }

  for (const rule of INTENT_KEYWORDS) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.intent;
    }
  }

  return "generic_summary";
}
