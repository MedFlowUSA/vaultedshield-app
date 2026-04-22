import {
  explainChargeDrag,
  explainDataCompleteness,
  explainDividendVisibility,
  explainFinalExpenseFit,
  explainFinalExpenseStructure,
  explainFundingSufficiency,
  explainIllustrationVsActual,
  explainIulRisk,
  explainPerformance,
  explainPolicyHealth,
  explainPolicyOptimization,
  explainPolicyType,
  explainStrategyAllocation,
  explainTermConversionVisibility,
  explainTermCoverage,
  explainTermExpiration,
  explainVulAllocationVisibility,
  explainVulLoanRisk,
  explainVulMarketExposure,
  explainWaitingPeriodVisibility,
  explainWhatToReviewFirst,
  explainWholeLifeBehavior,
  explainWholeLifeLoanRisk,
} from "./policyQuestionHandlers.js";
import {
  findPolicyAssistantIntent,
  getPolicyAssistantIntentLabel,
  getPolicyAssistantIntents,
} from "./policyAssistantIntents.js";

const INTENT_HANDLERS = {
  policy_health: explainPolicyHealth,
  policy_type: explainPolicyType,
  what_to_review_first: explainWhatToReviewFirst,
  data_completeness: explainDataCompleteness,
  policy_optimization: explainPolicyOptimization,
  performance: explainPerformance,
  charges: explainChargeDrag,
  illustration_vs_actual: explainIllustrationVsActual,
  loan_risk: explainIulRisk,
  funding_sufficiency: explainFundingSufficiency,
  strategy_mix: explainStrategyAllocation,
  vul_market_exposure: explainVulMarketExposure,
  vul_allocation_visibility: explainVulAllocationVisibility,
  vul_loan_risk: explainVulLoanRisk,
  whole_life_behavior: explainWholeLifeBehavior,
  dividend_visibility: explainDividendVisibility,
  whole_life_loan_risk: explainWholeLifeLoanRisk,
  term_expiration: explainTermExpiration,
  term_conversion: explainTermConversionVisibility,
  term_coverage: explainTermCoverage,
  final_expense_structure: explainFinalExpenseStructure,
  waiting_period_visibility: explainWaitingPeriodVisibility,
  final_expense_fit: explainFinalExpenseFit,
};

function buildUnsupportedIntentAnswer(intentId, policyType) {
  return {
    intent: intentId,
    answer:
      policyType && policyType !== "unknown"
        ? `That question is not strongly supported for this ${policyType.replace(/_/g, " ")} policy view yet.`
        : "That question is not strongly supported until the policy type is clearer.",
    confidence: "low",
    supportingData: [],
    missingData: ["The current policy type or visible evidence does not support that question cleanly."],
    suggestedFollowUps: getPolicyAssistantIntents(policyType).slice(0, 3).map((item) => item.label),
    tone: "informative",
  };
}

function normalizeResponse(intentId, policyType, rawResponse) {
  const followUps = (rawResponse?.suggested_followups || [])
    .map((item) => findPolicyAssistantIntent(item, policyType))
    .filter(Boolean)
    .map((item) => item.label);
  const supportingData = (rawResponse?.supporting_data || []).map((item) => ({
    label: String(item?.label || "Data point"),
    value:
      item?.value === null || item?.value === undefined || item?.value === ""
        ? "Unavailable"
        : String(item.value),
  }));

  return {
    intent: intentId,
    answer: rawResponse?.answer || "The current file does not support a confident answer yet.",
    confidence: rawResponse?.confidence || "low",
    confidenceExplanation: rawResponse?.confidence_explanation || "",
    supportingData,
    missingData: rawResponse?.missing_data || [],
    suggestedFollowUps: [...new Set(followUps)].slice(0, 4),
    tone: "informative",
  };
}

export function buildPolicyAssistantAnswer({
  intent,
  lifePolicy = null,
  normalizedPolicy = {},
  normalizedAnalytics = {},
  statementRows = [],
  comparisonSummary = null,
  interpretation = null,
  insightSummary = null,
  iulV2 = null,
  optimizationAnalysis = null,
} = {}) {
  const policyType = lifePolicy?.meta?.policyType || "unknown";
  const resolvedIntent = findPolicyAssistantIntent(intent, policyType);

  if (!resolvedIntent) {
    return buildUnsupportedIntentAnswer(String(intent || "unknown"), policyType);
  }

  const handler = INTENT_HANDLERS[resolvedIntent.id];
  if (!handler) {
    return buildUnsupportedIntentAnswer(resolvedIntent.id, policyType);
  }

  const rawResponse = handler({
    lifePolicy,
    normalizedPolicy,
    normalizedAnalytics,
    statementRows,
    comparisonSummary,
    interpretation,
    insightSummary,
    iulV2,
    optimizationAnalysis,
  });

  const response = normalizeResponse(resolvedIntent.id, policyType, rawResponse);
  if (response.suggestedFollowUps.length === 0) {
    response.suggestedFollowUps = getPolicyAssistantIntents(policyType)
      .filter((item) => item.id !== resolvedIntent.id)
      .slice(0, 4)
      .map((item) => item.label);
  }

  return response;
}

export function getPolicyAssistantDisplayLabel(intent, policyType = "unknown") {
  return getPolicyAssistantIntentLabel(intent, policyType);
}
