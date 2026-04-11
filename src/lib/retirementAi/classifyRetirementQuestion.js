export function classifyRetirementQuestion(question = "") {
  const normalized = String(question || "").toLowerCase();

  const matchers = [
    { intent: "review_first", patterns: ["review first", "what should i review", "what should i pay attention", "watch first"] },
    { intent: "risk_summary", patterns: ["risk", "risks", "pressure", "weak"] },
    { intent: "concentration", patterns: ["concentrated", "concentration", "allocation", "holding", "diversified"] },
    { intent: "loan_beneficiary", patterns: ["loan", "beneficiary"] },
    { intent: "incomplete_data", patterns: ["incomplete", "missing", "data", "not visible", "unclear"] },
    { intent: "account_health", patterns: ["good", "healthy", "strong", "support", "performing", "readable"] },
  ];

  const matched = matchers
    .map((matcher) => ({
      intent: matcher.intent,
      score: matcher.patterns.filter((pattern) => normalized.includes(pattern)).length,
    }))
    .sort((left, right) => right.score - left.score)[0];

  return {
    intent: matched?.score ? matched.intent : "general_summary",
    confidence: matched?.score >= 2 ? "high" : matched?.score === 1 ? "medium" : "low",
  };
}

export default classifyRetirementQuestion;
