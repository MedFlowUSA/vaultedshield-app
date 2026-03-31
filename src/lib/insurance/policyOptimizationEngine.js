function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function toNumber(value) {
  if (isFiniteNumber(value)) return value;
  if (value && typeof value === "object") {
    if (isFiniteNumber(value.value)) return value.value;
    if (typeof value.display_value === "string") return toNumber(value.display_value);
  }
  if (typeof value === "string") {
    const normalized = value.replace(/[$,%\s,]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function uniqueMessages(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function buildRecommendation(type, title, message, impact, confidence) {
  return { type, title, message, impact, confidence };
}

function buildRisk(type, message, severity) {
  return { type, message, severity };
}

function buildOpportunity(type, message, potentialImpact) {
  return { type, message, potentialImpact };
}

function getPriorityLevel(overallStatus, risks = [], recommendations = []) {
  if (overallStatus === "insufficient_data") return "medium";
  if (overallStatus === "at_risk") return "high";
  if (overallStatus === "watch") return risks.some((item) => item.severity === "high") ? "high" : "medium";
  return recommendations.some((item) => item.impact === "high") ? "medium" : "low";
}

function buildConfidenceContext({ policyType, illustrationComparison, iulV2, missingData }) {
  if (illustrationComparison?.confidenceExplanation) {
    return illustrationComparison.confidenceExplanation;
  }
  if (iulV2?.riskAnalysis?.confidence === "high") {
    return "Confidence is supported by visible statement, charge, and funding evidence.";
  }
  if (policyType === "iul" || policyType === "ul") {
    return missingData.length >= 3
      ? "Confidence is limited because the current packet still has material gaps in statement, charge, or illustration support."
      : "Confidence is moderate because some optimization signals are visible, but not every policy lever is fully documented.";
  }
  return missingData.length >= 2
    ? "Confidence is limited because the current packet is still missing supporting detail."
    : "Confidence is moderate because the visible policy structure is only partially documented.";
}

export function buildPolicyOptimizationEngine({
  lifePolicy = null,
  normalizedPolicy = {},
  normalizedAnalytics = {},
  iulV2 = null,
  illustrationComparison = null,
  statementRows = [],
  policyType = "unknown",
} = {}) {
  const type = policyType || lifePolicy?.meta?.policyType || "unknown";
  const comparison = illustrationComparison || iulV2?.illustrationComparison || null;
  const missingData = uniqueMessages([
    ...(iulV2?.missingData || []),
    ...(comparison?.missingData || []),
  ]);

  const recommendations = [];
  const risks = [];
  const opportunities = [];
  const loanBalance = toNumber(lifePolicy?.loans?.loanBalance);
  const policyValue =
    toNumber(lifePolicy?.values?.accumulationValue) ??
    toNumber(lifePolicy?.values?.cashValue) ??
    toNumber(lifePolicy?.values?.cashSurrenderValue) ??
    null;
  const loanRatio =
    isFiniteNumber(loanBalance) && isFiniteNumber(policyValue) && policyValue > 0
      ? loanBalance / policyValue
      : null;
  const hasIllustrationSupport = comparison && comparison.status !== "indeterminate";
  const comparisonDrivers = comparison?.drivers || [];
  const chargeDragLevel = iulV2?.chargeAnalysis?.chargeDragLevel || "unknown";
  const fundingStatus = iulV2?.fundingAnalysis?.status || "unclear";
  const riskLevel = iulV2?.riskAnalysis?.overallRisk || "unclear";
  const strategyVisibility =
    iulV2?.strategyAnalysis?.strategiesVisible
      ? iulV2?.strategyAnalysis?.allocationsVisible
        ? "strong"
        : "moderate"
      : "limited";
  const strategyConcentration = iulV2?.strategyAnalysis?.concentrationLevel || "unknown";
  const chronologyStatus = comparison?.chronologySupport?.status || "limited";

  if (type === "iul" || type === "ul") {
    if (!comparison || comparison.status === "indeterminate") {
      recommendations.push(
        buildRecommendation(
          "data",
          "Improve comparison support",
          "Upload more in-force statements or fuller illustration pages before making a stronger optimization call.",
          "medium",
          "low"
        )
      );
      risks.push(
        buildRisk(
          "limited_visibility",
          "Optimization risk is harder to judge because illustration timing and current policy duration are not aligned cleanly.",
          "medium"
        )
      );
      opportunities.push(
        buildOpportunity(
          "data_quality",
          "A fuller illustration and additional statements would improve optimization confidence materially.",
          "medium"
        )
      );
    }

    if (chronologyStatus === "mixed") {
      recommendations.push(
        buildRecommendation(
          "data",
          "Clean up annual statement chronology",
          "The visible annual statement sequence is irregular or duplicated. Confirm one clean statement per period before leaning too hard on drift conclusions.",
          "medium",
          "low"
        )
      );
      risks.push(
        buildRisk(
          "chronology_support",
          "Trend and illustration comparisons are less dependable when annual statement timing is irregular.",
          "medium"
        )
      );
    } else if (chronologyStatus === "limited") {
      recommendations.push(
        buildRecommendation(
          "data",
          "Add more dated annual statements",
          "One clean current statement helps with current position, but a stronger optimization read still needs broader annual history.",
          "medium",
          "low"
        )
      );
    }

    if (comparisonDrivers.some((item) => item.key === "underfunding") || fundingStatus === "underfunded") {
      recommendations.push(
        buildRecommendation(
          "funding",
          "Review premium contribution pace",
          "Visible funding is trailing the policy's illustrated or visible target pace. Restoring funding discipline is the first lever to review.",
          "high",
          comparison?.confidence || iulV2?.fundingAnalysis?.confidence || "moderate"
        )
      );
      risks.push(
        buildRisk(
          "underfunding",
          "If funding remains light while charges continue, long-term accumulation can weaken and lapse pressure can build.",
          "high"
        )
      );
    }

    if (
      hasIllustrationSupport &&
      comparison?.status === "behind" &&
      !comparisonDrivers.some((item) => item.key === "underfunding")
    ) {
      recommendations.push(
        buildRecommendation(
          "efficiency",
          "Review policy efficiency",
          "Funding appears closer to target, but value is still behind. Review charge drag, crediting efficiency, and policy structure before changing funding assumptions.",
          chargeDragLevel === "high" ? "high" : "medium",
          comparison?.confidence || "moderate"
        )
      );
      risks.push(
        buildRisk(
          "performance_drag",
          "Long-term accumulation may remain pressured even if funding holds up, because the policy is not converting funding into value efficiently enough.",
          chargeDragLevel === "high" ? "high" : "medium"
        )
      );
    }

    if (chargeDragLevel === "high" || chargeDragLevel === "moderate") {
      recommendations.push(
        buildRecommendation(
          "efficiency",
          "Inspect visible charge structure",
          "Visible charges are meaningful enough to review alongside funding and current value development.",
          chargeDragLevel === "high" ? "high" : "medium",
          iulV2?.chargeAnalysis?.confidence || "moderate"
        )
      );
    }

    if (strategyVisibility === "limited") {
      recommendations.push(
        buildRecommendation(
          "strategy",
          "Upload current allocation detail",
          "Indexed strategy and allocation visibility are still too thin to judge whether current crediting structure matches the policy's intended role.",
          "medium",
          "low"
        )
      );
    } else if (strategyConcentration === "concentrated") {
      recommendations.push(
        buildRecommendation(
          "strategy",
          "Review concentration in the current strategy mix",
          "The visible allocation looks concentrated in one main sleeve, so cap, spread, participation, and concentration risk deserve a closer look.",
          "medium",
          iulV2?.strategyAnalysis?.confidence || "moderate"
        )
      );
      opportunities.push(
        buildOpportunity(
          "strategy_balance",
          "A more balanced strategy mix could reduce dependence on one visible sleeve or one set of crediting terms.",
          "medium"
        )
      );
    }

    if (loanRatio !== null && loanRatio > 0.3) {
      recommendations.push(
        buildRecommendation(
          "loan",
          "Evaluate policy loan management",
          "Visible loans are large relative to current policy value and should be reviewed before the policy takes on more stress.",
          loanRatio > 0.45 ? "high" : "medium",
          "moderate"
        )
      );
      risks.push(
        buildRisk(
          "loan_pressure",
          "Loan pressure can destabilize the policy if value growth and funding support do not keep pace.",
          loanRatio > 0.45 ? "high" : "medium"
        )
      );
    }

    if (
      hasIllustrationSupport &&
      (comparison?.status === "ahead" || comparison?.status === "on_track") &&
      !risks.some((item) => item.severity === "high")
    ) {
      recommendations.push(
        buildRecommendation(
          "funding",
          "Maintain current funding discipline",
          "Visible funding and value support do not show a major drift right now. The main optimization move is to keep the current discipline consistent.",
          "low",
          comparison?.confidence || "moderate"
        )
      );
      opportunities.push(
        buildOpportunity(
          "monitoring",
          "The policy appears stable enough for periodic monitoring rather than corrective action.",
          comparison?.status === "ahead" ? "medium" : "low"
        )
      );
    }
  } else {
    if (loanRatio !== null && loanRatio > 0.3) {
      recommendations.push(
        buildRecommendation(
          "loan",
          "Review policy loans",
          "Visible policy loans are significant relative to current policy value and deserve a targeted review.",
          loanRatio > 0.45 ? "high" : "medium",
          "moderate"
        )
      );
      risks.push(
        buildRisk(
          "loan_pressure",
          "Loan pressure is visible and could affect policy stability if left unmanaged.",
          loanRatio > 0.45 ? "high" : "medium"
        )
      );
    }

    if (missingData.length >= 2 || statementRows.length === 0) {
      recommendations.push(
        buildRecommendation(
          "data",
          "Upload more policy support",
          "Optimization guidance is limited until more statement or contract detail is available for this policy type.",
          "medium",
          "low"
        )
      );
    } else {
      recommendations.push(
        buildRecommendation(
          "risk",
          "Maintain periodic review",
          "The visible file does not show an immediate optimization issue, so the next step is regular review rather than corrective action.",
          "low",
          "moderate"
        )
      );
    }
  }

  const uniqueRecommendations = recommendations.filter(
    (item, index, array) => array.findIndex((candidate) => candidate.title === item.title) === index
  );
  const uniqueRisks = risks.filter(
    (item, index, array) => array.findIndex((candidate) => candidate.type === item.type) === index
  );
  const uniqueOpportunities = opportunities.filter(
    (item, index, array) => array.findIndex((candidate) => candidate.type === item.type) === index
  );

  const overallStatus =
    comparison?.status === "indeterminate"
      ? "insufficient_data"
      : uniqueRisks.some((item) => item.severity === "high") || riskLevel === "high"
        ? "at_risk"
        : (
            comparison?.status === "behind" ||
            chronologyStatus === "mixed" ||
            riskLevel === "moderate" ||
            uniqueRecommendations.some((item) => item.impact === "high") ||
            uniqueRisks.some((item) => item.severity === "medium")
          )
          ? "watch"
          : !comparison && missingData.length >= 3
            ? "insufficient_data"
            : "healthy";
  const priorityLevel = getPriorityLevel(overallStatus, uniqueRisks, uniqueRecommendations);
  const topRecommendation = uniqueRecommendations[0];
  const currentStatus =
    overallStatus === "healthy"
      ? "This policy currently appears stable based on the visible policy data."
      : overallStatus === "watch"
        ? "This policy currently appears to need attention based on the visible policy data."
        : overallStatus === "at_risk"
          ? "This policy currently appears at risk based on the visible policy data."
          : "This policy currently does not have enough visible support for a strong optimization call.";
  const whyItMatters =
    uniqueRisks[0]?.message ||
    (overallStatus === "healthy"
      ? "That lowers the need for corrective action right now."
      : "Leaving the visible issues unchanged could weaken long-term policy performance or stability.");
  const whatToReviewNext =
    topRecommendation
      ? `The next best step is to ${topRecommendation.title.charAt(0).toLowerCase()}${topRecommendation.title.slice(1)}.`
      : "The next best step is to improve data quality before changing the policy strategy.";
  const confidenceContext = buildConfidenceContext({
    policyType: type,
    illustrationComparison: comparison,
    iulV2,
    missingData,
  });

  return {
    overallStatus,
    priorityLevel,
    recommendations: uniqueRecommendations,
    risks: uniqueRisks,
    opportunities: uniqueOpportunities,
    explanation: [currentStatus, whyItMatters, whatToReviewNext, confidenceContext].join(" "),
    missingData,
  };
}
