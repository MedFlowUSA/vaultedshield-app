function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  const parsed = Number(text.replace(/[$,%\s,()]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return /\(.*\)/.test(text) ? -parsed : parsed;
}

function toRatio(value) {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return String(value).includes("%") || Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function includesAny(value, terms = []) {
  const text = String(value || "").toLowerCase();
  return terms.some((term) => text.includes(term));
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstRatio(...values) {
  for (const value of values) {
    const parsed = toRatio(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

export const POLICY_SIGNAL_FLAG_LABELS = {
  fundingPressure: "Funding Pressure",
  chargeDrag: "Charge Drag",
  loanRisk: "Loan Risk",
  incompleteData: "Incomplete Data",
  illustrationVarianceRisk: "Illustration Variance",
  concentrationRisk: "Concentration Risk",
};

export function extractPolicySignalMetrics({
  policyInterpretation = {},
  trendSummary = {},
  comparisonData = {},
  signalsOutput = {},
  normalizedMetrics = {},
} = {}) {
  const cashValue = firstNumber(
    normalizedMetrics.cashValue,
    normalizedMetrics.cash_value,
    comparisonData.cash_value,
    comparisonData.account_value
  );
  const loanBalance = firstNumber(
    normalizedMetrics.loanBalance,
    normalizedMetrics.loan_balance,
    comparisonData.loan_balance
  );
  const chargeDragRatio = firstRatio(
    normalizedMetrics.chargeDragRatio,
    normalizedMetrics.charge_drag_ratio,
    comparisonData.charge_drag_ratio,
    signalsOutput.metrics?.charge_drag_ratio
  );
  const coiRatio = firstRatio(
    normalizedMetrics.coiRatio,
    normalizedMetrics.coi_ratio,
    comparisonData.coi_ratio,
    signalsOutput.metrics?.coi_ratio
  );
  const allocationPercent = firstRatio(
    normalizedMetrics.allocationPercent,
    normalizedMetrics.allocation_percent,
    comparisonData.allocation_percent,
    comparisonData.primary_strategy_allocation
  );
  const missingFields = [
    ...(Array.isArray(comparisonData.missing_fields) ? comparisonData.missing_fields : []),
    ...(Array.isArray(signalsOutput.missing_fields) ? signalsOutput.missing_fields : []),
  ];
  const loanRatio = loanBalance !== null && cashValue !== null && cashValue > 0 ? loanBalance / cashValue : null;

  return {
    cashValue,
    loanBalance,
    loanRatio,
    chargeDragRatio,
    coiRatio,
    allocationPercent,
    missingFields: [...new Set(missingFields)],
    chargeVisibility: normalizeText(comparisonData.charge_visibility_status),
    coiConfidence: normalizeText(comparisonData.coi_confidence),
    dataCompleteness: normalizeText(comparisonData.data_completeness_status || signalsOutput.confidence),
    strategyVisibility: normalizeText(comparisonData.strategy_visibility || comparisonData.strategy_visibility_status),
    fundingPattern: normalizeText(
      normalizedMetrics.fundingPattern ||
        normalizedMetrics.funding_pattern ||
        comparisonData.funding_pattern ||
        policyInterpretation.funding_pattern
    ),
    performanceStatus: normalizeText(policyInterpretation.performance_assessment?.status),
    illustrationStatus: normalizeText(
      normalizedMetrics.illustrationStatus ||
        normalizedMetrics.illustration_status ||
        comparisonData.illustration_status ||
        comparisonData.illustration_comparison_status
    ),
    trendSummaryText: [
      trendSummary.summary,
      ...(Array.isArray(trendSummary.concise_change_notes) ? trendSummary.concise_change_notes : []),
      policyInterpretation.growth_summary,
      policyInterpretation.charge_summary_explanation,
      policyInterpretation.confidence_summary,
      signalsOutput.primary_reason,
      ...(Array.isArray(signalsOutput.signal_reasons) ? signalsOutput.signal_reasons : []),
    ]
      .filter(Boolean)
      .join(" "),
    latestStatementDate: comparisonData.latest_statement_date,
    periodsCount: firstNumber(trendSummary.periods_count),
  };
}

export function evaluatePolicySignalRules(input = {}) {
  const metrics = extractPolicySignalMetrics(input);
  const flags = {
    fundingPressure: false,
    chargeDrag: false,
    loanRisk: false,
    incompleteData: false,
    illustrationVarianceRisk: false,
    concentrationRisk: false,
  };
  const reasons = [];
  const positiveReasons = [];
  let riskScore = 0;
  let monitorScore = 0;

  function addFlag(flag, reason, severity = "monitor") {
    flags[flag] = true;
    reasons.push(reason);
    if (severity === "risk") riskScore += 2;
    else monitorScore += 1;
  }

  if (metrics.fundingPattern === "underfunded" || metrics.performanceStatus === "underperforming") {
    addFlag("fundingPressure", "Visible funding support appears pressured against the current policy read.", "risk");
  } else if (metrics.performanceStatus === "mixed_needs_review" || includesAny(metrics.trendSummaryText, ["funding pressure", "under target", "underfunded"])) {
    addFlag("fundingPressure", "Funding evidence is mixed enough to keep this policy on the monitor list.");
  } else if (["adequate", "overfunded", "performing_well"].includes(metrics.fundingPattern) || metrics.performanceStatus === "performing_well") {
    positiveReasons.push("Visible funding and performance support do not show a major pressure point.");
  }

  if ((metrics.chargeDragRatio !== null && metrics.chargeDragRatio >= 0.12) || (metrics.coiRatio !== null && metrics.coiRatio >= 0.08)) {
    addFlag("chargeDrag", "Visible charges are elevated relative to the current policy value or premium support.", "risk");
  } else if (
    (metrics.chargeDragRatio !== null && metrics.chargeDragRatio >= 0.06) ||
    (metrics.coiRatio !== null && metrics.coiRatio >= 0.04) ||
    ["moderate", "basic", "limited"].includes(metrics.chargeVisibility)
  ) {
    addFlag("chargeDrag", "Charge drag is visible enough to monitor with future statements.");
  } else if (["strong", "available"].includes(metrics.chargeVisibility) || metrics.chargeDragRatio !== null) {
    positiveReasons.push("Visible charge pressure does not appear elevated from the current evidence.");
  }

  if (metrics.loanRatio !== null && metrics.loanRatio >= 0.3) {
    addFlag("loanRisk", "Loan balance is high relative to visible cash value.", "risk");
  } else if (metrics.loanRatio !== null && metrics.loanRatio >= 0.12) {
    addFlag("loanRisk", "Loan balance is meaningful and should be monitored with charges.");
  } else if (metrics.loanBalance === 0) {
    positiveReasons.push("No visible loan pressure is showing in the current read.");
  }

  if (metrics.missingFields.length >= 6 || (!metrics.latestStatementDate && metrics.cashValue === null)) {
    addFlag("incompleteData", "Critical policy evidence is still missing, so the signal is downgraded.", "risk");
  } else if (
    metrics.missingFields.length >= 3 ||
    !metrics.latestStatementDate ||
    ["weak", "limited", "basic", "developing"].includes(metrics.dataCompleteness) ||
    metrics.periodsCount === 0
  ) {
    addFlag("incompleteData", "Some important policy evidence is still incomplete.");
  } else {
    positiveReasons.push("Core statement support is visible enough for a higher-confidence read.");
  }

  if (
    ["behind", "underperforming", "variance_high"].includes(metrics.illustrationStatus) ||
    includesAny(metrics.trendSummaryText, ["behind illustration", "trailing", "variance", "underperforming"])
  ) {
    addFlag("illustrationVarianceRisk", "Illustration or growth alignment shows visible variance pressure.", "risk");
  }

  if (
    (metrics.allocationPercent !== null && metrics.allocationPercent >= 0.85) ||
    ["limited", "basic", "concentrated"].includes(metrics.strategyVisibility) ||
    includesAny(metrics.trendSummaryText, ["concentrated", "single strategy"])
  ) {
    addFlag("concentrationRisk", "Strategy visibility or allocation concentration deserves review.");
  }

  return {
    flags,
    reasons,
    positiveReasons,
    riskScore,
    monitorScore,
    metrics,
  };
}
