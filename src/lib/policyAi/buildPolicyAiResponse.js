function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatText(value) {
  return value === null || value === undefined || value === "" ? "Unavailable" : String(value);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHealthLabel(status) {
  if (!status) return "Unavailable";
  const normalized = String(status).toLowerCase();
  if (normalized.includes("strong")) return "Strong";
  if (normalized.includes("moderate") || normalized.includes("mixed")) return "Moderate";
  if (normalized.includes("weak") || normalized.includes("attention") || normalized.includes("risk")) return "Needs Attention";
  return String(status);
}

function buildLowDataResponse(missingData = []) {
  return {
    answer:
      "This policy does not yet have enough structured data for a strong AI explanation. Upload the baseline illustration and at least one in-force statement to unlock deeper analysis.",
    evidence: [],
    disclaimers: ["This interpretation is limited because the current file does not yet contain enough structured support."],
    missingData,
  };
}

function dedupe(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function addEvidence(evidence, label, value, source = "") {
  if (value === null || value === undefined || value === "" || value === "Unavailable") return;
  evidence.push({ label, value: String(value), source: source ? String(source) : undefined });
}

function getComparisonHealth(context = {}) {
  return normalizeHealthLabel(context?.policyAiSummary?.status || context?.ranking?.status || context?.generalLifeScorecard?.headline || "");
}

function buildSharedMissingData(context = {}) {
  return dedupe([
    ...(context?.missingFields || []),
    ...(context?.policyAiSummary?.missingData || []),
    ...(context?.iulV2?.missingData || []),
  ]).slice(0, 8);
}

function buildGenericSummary(context = {}) {
  const missingData = buildSharedMissingData(context);
  if (!context?.comparisonRow && !context?.lifePolicy) {
    return buildLowDataResponse(missingData);
  }

  const evidence = [];
  addEvidence(evidence, "Policy Health Snapshot", getComparisonHealth(context), "Policy health interpretation");
  addEvidence(evidence, "Current Accumulation Value", formatText(context?.comparisonRow?.cash_value || context?.lifePolicy?.values?.cashValue), "Latest statement or parsed values");
  addEvidence(evidence, "Death Benefit", formatText(context?.comparisonRow?.death_benefit || context?.lifePolicy?.coverage?.deathBenefit), "Policy overview");
  addEvidence(evidence, "Latest Statement", formatDate(context?.comparisonRow?.latest_statement_date), "Statement continuity read");
  addEvidence(evidence, "Charge Visibility", formatText(context?.comparisonRow?.charge_visibility_status), "Charge support read");

  return {
    answer:
      context?.policyInterpretation?.bottom_line_summary ||
      context?.policyAiSummary?.summary ||
      "Based on the available data, this policy appears readable at a high level, but the clearest interpretation still depends on statement support, charge visibility, and policy continuity.",
    evidence,
    disclaimers: [
      "This summary is based on the currently available documents.",
    ],
    missingData,
  };
}

function buildPerformanceSummary(context = {}) {
  const missingData = buildSharedMissingData(context);
  const evidence = [];
  const growthNet = context?.normalizedAnalytics?.growth_attribution?.net_growth_display || context?.trendSummary?.summary || null;
  const loanBalance = context?.comparisonRow?.loan_balance || context?.lifePolicy?.loans?.loanBalance || null;
  const health = getComparisonHealth(context);

  addEvidence(evidence, "Policy Health", health, "Policy interpretation");
  addEvidence(evidence, "Current Accumulation Value", formatText(context?.comparisonRow?.cash_value || context?.lifePolicy?.values?.cashValue), "Latest statement or parsed values");
  addEvidence(evidence, "Net Policy Growth", formatText(growthNet), "Trend summary");
  addEvidence(evidence, "Loan Balance", formatText(loanBalance), "Loan read");
  addEvidence(evidence, "Charge Visibility", formatText(context?.comparisonRow?.charge_visibility_status), "Charge support read");

  const answer =
    context?.policyInterpretation?.bottom_line_summary ||
    context?.policyInterpretation?.current_position_summary ||
    context?.policyAiSummary?.summary ||
    "Based on the available data, this policy appears interpretable, but the current statement support is still too thin for a stronger performance read.";

  return {
    answer: `${answer} The current statement suggests the best read comes from combining policy health, visible growth, charge drag, and any loan pressure rather than relying on one field alone.`,
    evidence,
    disclaimers: missingData.length > 0
      ? ["A fuller performance review may require additional statements or the original illustration."]
      : ["This is an interpretation based on the currently available documents."],
    missingData,
  };
}

function buildRatingExplanation(context = {}) {
  const missingData = buildSharedMissingData(context);
  const evidence = [];
  const health = getComparisonHealth(context);
  addEvidence(evidence, "Policy Health Snapshot", health, "Policy scoring");
  addEvidence(evidence, "Funding Pattern", formatText(context?.basicPolicyAnalysis?.funding_pattern), "Funding read");
  addEvidence(evidence, "Loan Balance", formatText(context?.comparisonRow?.loan_balance || context?.lifePolicy?.loans?.loanBalance), "Loan read");
  addEvidence(evidence, "Charge Visibility", formatText(context?.comparisonRow?.charge_visibility_status), "Charge support read");
  addEvidence(evidence, "Illustration Comparison", formatText(context?.iulV2?.illustrationComparison?.status?.replace(/_/g, " ")), "Illustration read");

  const pieces = [
    context?.policyAiSummary?.summary,
    context?.policyInterpretation?.confidence_summary,
  ].filter(Boolean);

  const answer = pieces.length > 0
    ? `This policy is rated ${health} because ${pieces.join(" ")}`
    : `This policy currently reads as ${health} based on the visible funding support, charge visibility, loan context, and data completeness.`;

  return {
    answer,
    evidence,
    disclaimers: ["This rating explanation is informational and should be reviewed alongside the underlying policy documents."],
    missingData,
  };
}

function buildIllustrationComparison(context = {}) {
  const comparison = context?.iulV2?.illustrationComparison || {};
  const missingData = dedupe([...(comparison?.missingData || []), ...buildSharedMissingData(context)]).slice(0, 8);
  if (!comparison || (!comparison.status && !comparison.comparison_possible)) {
    return buildLowDataResponse(missingData);
  }

  const evidence = [];
  addEvidence(evidence, "Illustration Comparison", formatText(comparison.status?.replace(/_/g, " ")), "Illustration read");
  addEvidence(evidence, "Alignment Confidence", formatText(comparison.alignmentConfidence || comparison.confidence), "Illustration read");
  addEvidence(evidence, `Illustrated ${comparison.selectedMetricLabel || "Value"}`, formatText(comparison.selectedMetricData?.illustratedDisplay), "Original illustration");
  addEvidence(evidence, `Actual ${comparison.selectedMetricLabel || "Value"}`, formatText(comparison.selectedMetricData?.actualDisplay), "Latest in-force read");
  addEvidence(evidence, "Variance", formatText(comparison.varianceDisplay), "Illustration comparison");
  addEvidence(evidence, "Primary Driver", formatText(comparison.drivers?.[0]?.label), "Illustration interpretation");

  const answer =
    comparison.shortExplanation ||
    comparison.explanation ||
    comparison.directAnswer ||
    "Based on the available data, illustration-versus-actual alignment is still indeterminate.";

  return {
    answer,
    evidence,
    disclaimers: ["A fuller illustration review may require the original illustration and stronger policy-year alignment support."],
    missingData,
  };
}

function buildChargeAnalysis(context = {}) {
  const chargeAnalysis = context?.iulV2?.chargeAnalysis || {};
  const chargeSummary = context?.chargeSummary || {};
  const missingData = buildSharedMissingData(context);
  const evidence = [];
  const visibleCoi = chargeAnalysis?.totalVisibleCharges ?? chargeSummary?.total_coi ?? null;

  addEvidence(evidence, "Visible COI", formatCurrency(chargeSummary?.total_coi ?? null), "Charge extraction");
  addEvidence(evidence, "Visible Charges", formatCurrency(chargeAnalysis?.totalVisibleCharges ?? chargeSummary?.total_visible_policy_charges ?? null), "Charge extraction");
  addEvidence(evidence, "Charge Drag Read", formatText(chargeAnalysis?.chargeDragLevel || context?.comparisonRow?.charge_visibility_status), "Charge interpretation");
  addEvidence(evidence, "Charge Trend", formatText(chargeAnalysis?.trend), "Charge interpretation");
  addEvidence(evidence, "Charge Visibility", formatText(context?.comparisonRow?.charge_visibility_status), "Charge support read");

  if (visibleCoi === null && !chargeAnalysis?.explanation) {
    return buildLowDataResponse(missingData);
  }

  const answer =
    chargeAnalysis?.explanation ||
    context?.policyInterpretation?.charge_summary_explanation ||
    "Based on the available data, charges appear to be part of the policy story, but visibility is still only partial.";

  return {
    answer,
    evidence,
    disclaimers: ["Charge interpretation should be reviewed with the actual statement detail, especially when COI visibility is partial."],
    missingData,
  };
}

function buildLoanRisk(context = {}) {
  const risk = context?.iulV2?.riskAnalysis || {};
  const loanBalance = toNumber(context?.comparisonRow?.loan_balance) ?? toNumber(context?.lifePolicy?.loans?.loanBalance);
  const cashValue = toNumber(context?.comparisonRow?.cash_value);
  const loanRatio = loanBalance !== null && cashValue !== null && cashValue > 0 ? loanBalance / cashValue : null;
  const missingData = buildSharedMissingData(context);
  const evidence = [];

  addEvidence(evidence, "Loan Balance", loanBalance === null ? null : formatCurrency(loanBalance), "Loan read");
  addEvidence(evidence, "Cash Value", cashValue === null ? null : formatCurrency(cashValue), "Latest statement or parsed values");
  addEvidence(evidence, "Loan-to-Value Read", loanRatio === null ? null : `${Math.round(loanRatio * 100)}%`, "Loan pressure check");
  addEvidence(evidence, "Risk Read", formatText(risk?.overallRisk), "Risk interpretation");
  addEvidence(evidence, "Lapse Pressure", formatText(risk?.lapsePressure), "Risk interpretation");

  if (loanBalance === null && !risk?.explanation) {
    return buildLowDataResponse(missingData);
  }

  let answer = risk?.explanation;
  if (!answer) {
    if (loanBalance === 0) {
      answer = "Based on the available data, loans do not currently appear to be a pressure point on this policy.";
    } else if (loanRatio !== null && loanRatio >= 0.25) {
      answer = "Based on the available data, loans appear to be a meaningful pressure point and should be reviewed together with charges and cash-value support.";
    } else {
      answer = "The current statement suggests loans are present, but the policy would need a fuller review of charges and statement trend before treating that pressure as fully resolved.";
    }
  }

  return {
    answer,
    evidence,
    disclaimers: ["Loan pressure should be reviewed in context with cash value, charges, and statement history."],
    missingData,
  };
}

function buildMissingData(context = {}) {
  const missingData = buildSharedMissingData(context);
  const evidence = [];
  addEvidence(evidence, "Visible Statement Count", formatText(context?.lifePolicy?.meta?.statementCount), "Statement inventory");
  addEvidence(evidence, "Latest Statement", formatDate(context?.comparisonRow?.latest_statement_date), "Statement continuity read");
  addEvidence(evidence, "Charge Visibility", formatText(context?.comparisonRow?.charge_visibility_status), "Charge support read");
  addEvidence(evidence, "Illustration Support", formatText(context?.iulV2?.illustrationComparison?.status?.replace(/_/g, " ")), "Illustration read");

  return {
    answer:
      missingData.length > 0
        ? `The current read is usable, but a stronger explanation would require cleaner support in these areas: ${missingData.slice(0, 4).join(", ")}.`
        : "Based on the currently visible fields, no major missing-data blocker is standing out right now.",
    evidence,
    disclaimers: missingData.length > 0
      ? ["A fuller review may require additional statements, rider pages, or the original illustration."]
      : [],
    missingData,
  };
}

function buildReviewPriority(context = {}) {
  const reviewItems = context?.policyInterpretation?.review_items || [];
  const priorities = reviewItems.length > 0
    ? reviewItems.slice(0, 4)
    : [
        "Charge visibility",
        "Illustration comparison",
        "Loan review",
        "Funding consistency",
      ];
  const evidence = priorities.map((item, index) => ({ label: `Review Priority ${index + 1}`, value: item, source: "Policy review ordering" }));

  return {
    answer: `Based on the available data, the cleanest review order appears to be: ${priorities.map((item, index) => `${index + 1}. ${item}`).join(" ")}`,
    evidence,
    disclaimers: ["This is a review-order suggestion, not legal, tax, investment, or replacement advice."],
    missingData: buildSharedMissingData(context),
  };
}

function buildPolicyComparison(context = {}, comparisonPolicyBundle = null) {
  if (!comparisonPolicyBundle) {
    return {
      answer: "A policy comparison needs a second policy. Select another saved policy to compare current strength, charges, growth support, loans, and evidence completeness.",
      evidence: [],
      disclaimers: [],
      missingData: [],
    };
  }

  const currentCash = toNumber(context?.comparisonRow?.cash_value);
  const compareCash = toNumber(comparisonPolicyBundle?.comparisonRow?.cash_value);
  const currentLoan = toNumber(context?.comparisonRow?.loan_balance);
  const compareLoan = toNumber(comparisonPolicyBundle?.comparisonRow?.loan_balance);
  const currentHealth = getComparisonHealth(context);
  const compareHealth = getComparisonHealth(comparisonPolicyBundle);

  const evidence = [];
  addEvidence(evidence, "Current Policy Health", currentHealth, "Current policy scoring");
  addEvidence(evidence, "Comparison Policy Health", compareHealth, "Comparison policy scoring");
  addEvidence(evidence, "Current Cash Value", currentCash === null ? null : formatCurrency(currentCash), "Current policy statement");
  addEvidence(evidence, "Comparison Cash Value", compareCash === null ? null : formatCurrency(compareCash), "Comparison policy statement");
  addEvidence(evidence, "Current Loan Balance", currentLoan === null ? null : formatCurrency(currentLoan), "Current policy loan read");
  addEvidence(evidence, "Comparison Loan Balance", compareLoan === null ? null : formatCurrency(compareLoan), "Comparison policy loan read");

  let answer = `Based on the available data, this policy appears ${currentHealth.toLowerCase()} while ${comparisonPolicyBundle.label || "the comparison policy"} appears ${compareHealth.toLowerCase()}.`;
  if (currentCash !== null && compareCash !== null) {
    answer += currentCash >= compareCash
      ? " The current policy is carrying the larger visible accumulation value."
      : " The comparison policy is carrying the larger visible accumulation value.";
  }
  answer += " A fuller comparison should also weigh charge visibility, statement continuity, and illustration support.";

  return {
    answer,
    evidence,
    disclaimers: ["This comparison is informational and based only on the policies currently visible in VaultedShield."],
    missingData: dedupe([
      ...buildSharedMissingData(context),
      ...buildSharedMissingData(comparisonPolicyBundle),
    ]).slice(0, 8),
  };
}

export function buildPolicyAiResponse({
  currentPolicyBundle = null,
  comparisonPolicyBundle = null,
  userQuestion = "",
  intent = "generic_summary",
} = {}) {
  const context = currentPolicyBundle || {};
  const safeIntent = intent || "generic_summary";
  const missingData = buildSharedMissingData(context);

  if (!context?.comparisonRow && !context?.lifePolicy) {
    return buildLowDataResponse(missingData);
  }

  switch (safeIntent) {
    case "performance_summary":
      return buildPerformanceSummary(context);
    case "rating_explanation":
      return buildRatingExplanation(context);
    case "illustration_comparison":
      return buildIllustrationComparison(context);
    case "charge_analysis":
      return buildChargeAnalysis(context);
    case "loan_risk":
      return buildLoanRisk(context);
    case "missing_data":
      return buildMissingData(context);
    case "policy_review_priority":
      return buildReviewPriority(context);
    case "policy_comparison":
      return buildPolicyComparison(context, comparisonPolicyBundle);
    case "generic_summary":
    default:
      return buildGenericSummary({
        ...context,
        userQuestion,
      });
  }
}
