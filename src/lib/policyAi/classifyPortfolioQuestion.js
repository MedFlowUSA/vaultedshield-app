const INTENT_KEYWORDS = [
  {
    intent: "priority",
    keywords: ["needs attention first", "attention first", "review first", "which policy first", "should i review first", "priority"],
  },
  {
    intent: "strongest",
    keywords: ["strongest", "best supported", "looks strongest", "most stable"],
  },
  {
    intent: "weakest",
    keywords: ["weakest", "weak policies", "do i have any weak policies", "which policy is weakest"],
  },
  {
    intent: "risk_summary",
    keywords: ["biggest risks", "what are the risks", "portfolio risks", "risk summary", "risk themes"],
  },
  {
    intent: "incomplete_data",
    keywords: ["incomplete", "missing data", "where is my data incomplete", "which data is missing"],
  },
  {
    intent: "comparison_overview",
    keywords: ["compare", "comparison", "strongest vs weakest", "overview"],
  },
  {
    intent: "portfolio_health",
    keywords: ["portfolio health", "how is my portfolio", "how are my policies", "overall"],
  },
];

export function classifyPortfolioQuestion(question = "") {
  const normalized = String(question || "").trim().toLowerCase();

  if (!normalized) {
    return "general_summary";
  }

  for (const rule of INTENT_KEYWORDS) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.intent;
    }
  }

  return "general_summary";
}
