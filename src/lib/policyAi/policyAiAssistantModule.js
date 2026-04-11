import { buildPolicyAiResponse } from "./buildPolicyAiResponse.js";
import { classifyPolicyQuestion } from "./classifyPolicyQuestion.js";

const CANONICAL_INTENTS = {
  performance_summary: "performance",
  rating_explanation: "performance",
  generic_summary: "performance",
  charge_analysis: "charges",
  policy_comparison: "comparison",
  risk_summary: "risk",
  loan_risk: "risk",
};

export function classifyPolicyAiAssistantIntent(question = "") {
  const internalIntent = classifyPolicyQuestion(question);
  return {
    intent: CANONICAL_INTENTS[internalIntent] || "performance",
    internalIntent,
  };
}

export function buildPolicyAiAssistantResponse({
  userQuestion = "",
  policyInterpretation = null,
  trendSummary = null,
  comparisonData = null,
  signalsOutput = null,
} = {}) {
  const classification = classifyPolicyAiAssistantIntent(userQuestion);
  const comparisonRow = {
    ...(comparisonData || {}),
    policy_signals: signalsOutput || comparisonData?.policy_signals || null,
  };
  const response = buildPolicyAiResponse({
    currentPolicyBundle: {
      comparisonRow,
      policyInterpretation,
      trendSummary,
      missingFields: comparisonData?.missing_fields || signalsOutput?.missing_fields || [],
    },
    comparisonPolicyBundle: comparisonData?.comparisonPolicyBundle || null,
    userQuestion,
    intent: classification.internalIntent,
  });

  return {
    intent: classification.intent,
    explanation: response.answer,
    evidence: response.evidence || [],
    missingData: response.missingData || [],
    disclaimers: response.disclaimers || [],
    debug: {
      internalIntent: classification.internalIntent,
    },
  };
}
