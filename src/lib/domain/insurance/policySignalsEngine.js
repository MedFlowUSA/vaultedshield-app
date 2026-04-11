function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  const parsed = Number(text.replace(/[$,%\s,()]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return /\(.*\)/.test(text) ? -parsed : parsed;
}

function toRatio(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return String(value).includes("%") || Math.abs(parsed) > 1 ? parsed / 100 : parsed;
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

function fieldNumber(field) {
  return firstNumber(field?.value, field?.display_value, field);
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function confidenceLabel(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "moderate";
  return "developing";
}

export function buildPolicySignals({
  normalizedPolicy = {},
  normalizedAnalytics = {},
  comparisonSummary = {},
  basicPolicyAnalysis = {},
} = {}) {
  const values = normalizedPolicy?.values || {};
  const funding = normalizedPolicy?.funding || {};
  const loans = normalizedPolicy?.loans || {};
  const chargeSummary = normalizedAnalytics?.charge_summary || {};
  const policyHealth = normalizedAnalytics?.policy_health_score || {};
  const completeness = normalizedAnalytics?.completeness_assessment || {};
  const growthAttribution = normalizedAnalytics?.growth_attribution || {};
  const illustrationComparison = normalizedAnalytics?.illustration_comparison || {};
  const missingFields = Array.isArray(comparisonSummary?.missing_fields) ? comparisonSummary.missing_fields : [];

  const cashValue = firstNumber(
    comparisonSummary?.cash_value,
    comparisonSummary?.account_value,
    fieldNumber(values?.cash_value),
    fieldNumber(values?.accumulation_value)
  );
  const surrenderValue = firstNumber(
    comparisonSummary?.surrender_value,
    fieldNumber(values?.cash_surrender_value)
  );
  const loanBalance = firstNumber(
    comparisonSummary?.loan_balance,
    fieldNumber(loans?.loan_balance)
  );
  const totalCoi = firstNumber(
    comparisonSummary?.total_coi,
    chargeSummary?.total_coi,
    fieldNumber(normalizedPolicy?.charges?.cost_of_insurance)
  );
  const totalVisibleCharges = firstNumber(
    comparisonSummary?.total_visible_charges,
    comparisonSummary?.total_visible_policy_charges,
    chargeSummary?.total_visible_policy_charges
  );
  const plannedPremium = firstNumber(
    comparisonSummary?.premium,
    fieldNumber(funding?.planned_premium)
  );
  const chargeDragRatio = firstRatio(comparisonSummary?.charge_drag_ratio);
  const coiRatio = firstRatio(comparisonSummary?.coi_ratio);
  const loanRatio = loanBalance !== null && cashValue !== null && cashValue > 0 ? loanBalance / cashValue : null;

  const chargeVisibility = normalizeStatus(
    comparisonSummary?.charge_visibility_status ||
      comparisonSummary?.comparison_debug?.charge_visibility_status
  );
  const coiConfidence = normalizeStatus(
    comparisonSummary?.coi_confidence ||
      comparisonSummary?.comparison_debug?.coi_confidence
  );
  const strategyVisibility = normalizeStatus(
    comparisonSummary?.strategy_visibility ||
      comparisonSummary?.strategy_visibility_status
  );
  const completenessStatus = normalizeStatus(
    comparisonSummary?.data_completeness_status ||
      completeness?.status
  );
  const policyHealthStatus = normalizeStatus(
    comparisonSummary?.policy_health_status ||
      policyHealth?.status
  );
  const fundingPattern = normalizeStatus(
    basicPolicyAnalysis?.fundingPattern ||
      basicPolicyAnalysis?.funding_pattern
  );
  const coiTrend = normalizeStatus(
    basicPolicyAnalysis?.coiTrend ||
      basicPolicyAnalysis?.coi_trend
  );
  const growthStatus = normalizeStatus(growthAttribution?.efficiency_status);
  const illustrationStatus = normalizeStatus(illustrationComparison?.status);
  const continuityScore = firstNumber(comparisonSummary?.continuity_score, comparisonSummary?.ranking_score);
  const healthScore = firstNumber(comparisonSummary?.policy_health_score, policyHealth?.score);

  const riskFlags = [];
  const monitorFlags = [];
  const positiveSignals = [];
  let riskWeight = 0;

  function addRisk(flag, weight) {
    riskFlags.push(flag);
    riskWeight += weight;
  }

  function addMonitor(flag, weight) {
    monitorFlags.push(flag);
    riskWeight += weight;
  }

  if (loanRatio !== null && loanRatio >= 0.3) addRisk("Loan balance is high relative to visible cash value.", 24);
  else if (loanRatio !== null && loanRatio >= 0.12) addMonitor("Loan balance is meaningful and should be monitored with charges.", 10);
  else if (loanBalance !== null && loanBalance > 0 && cashValue === null) addMonitor("Loan balance is visible, but cash-value support is not clean enough to size the pressure.", 8);
  else if (loanBalance === 0) positiveSignals.push("No visible loan pressure is showing in the current read.");

  if (chargeDragRatio !== null && chargeDragRatio >= 0.12) addRisk("Visible charge drag is elevated against premium support.", 20);
  else if (chargeDragRatio !== null && chargeDragRatio >= 0.06) addMonitor("Visible charge drag deserves monitoring.", 10);
  if (coiRatio !== null && coiRatio >= 0.08) addRisk("COI is elevated relative to visible account value.", 18);
  else if (coiRatio !== null && coiRatio >= 0.04) addMonitor("COI is material relative to visible account value.", 8);
  if (coiTrend === "increasing") addMonitor("COI trend is increasing in the visible statement trail.", 9);
  if (chargeVisibility === "limited" || chargeVisibility === "basic") addMonitor(`Charge visibility is ${chargeVisibility || "limited"}.`, 8);
  if (coiConfidence === "weak") addMonitor("COI confidence is weak.", 8);

  if (growthStatus === "growth_pressured" || illustrationStatus === "behind") addRisk("Visible growth or illustration alignment is under pressure.", 18);
  else if (growthStatus === "growth_supported" || illustrationStatus === "ahead") positiveSignals.push("Visible growth support is stable from the current packet.");

  if (fundingPattern === "underfunded") addRisk("Funding appears under target from visible premium support.", 18);
  else if (fundingPattern === "adequate" || fundingPattern === "overfunded") positiveSignals.push(`Funding currently reads as ${fundingPattern}.`);

  if (missingFields.length >= 5) addMonitor("Several core policy fields are still missing.", 12);
  else if (missingFields.length > 0) addMonitor("Some core policy fields are still missing.", 5);
  if (!comparisonSummary?.latest_statement_date) addMonitor("Latest statement date is not resolved.", 8);
  if (strategyVisibility === "limited" || strategyVisibility === "basic") addMonitor(`Strategy visibility is ${strategyVisibility || "limited"}.`, 5);
  if (completenessStatus === "basic" || completenessStatus === "limited") addMonitor(`Data completeness is ${completenessStatus || "still developing"}.`, 8);

  if (policyHealthStatus === "at_risk" || policyHealthStatus === "weak") addRisk("Existing policy health read is weak or at risk.", 18);
  else if (policyHealthStatus === "healthy" || policyHealthStatus === "strong") positiveSignals.push("Existing policy health read is strong.");
  if (continuityScore !== null && continuityScore < 45) addRisk("Continuity score is low.", 18);
  else if (continuityScore !== null && continuityScore < 70) addMonitor("Continuity score is mixed.", 8);
  else if (continuityScore !== null && continuityScore >= 85) positiveSignals.push("Continuity score is strong.");

  const evidenceSignals = [
    cashValue !== null,
    surrenderValue !== null,
    plannedPremium !== null,
    totalCoi !== null,
    totalVisibleCharges !== null,
    loanBalance !== null,
    Boolean(comparisonSummary?.latest_statement_date),
    !["basic", "limited", ""].includes(completenessStatus),
  ];
  const confidenceScore = evidenceSignals.filter(Boolean).length / evidenceSignals.length;
  const signalScore = Math.max(0, Math.min(100, Math.round((healthScore ?? 100) - riskWeight)));
  const policySignal =
    riskFlags.length > 0 || signalScore < 45
      ? "at_risk"
      : monitorFlags.length > 0 || signalScore < 78 || confidenceScore < 0.65
        ? "monitor"
        : "healthy";

  const fallbackReason =
    policySignal === "healthy"
      ? "Visible funding, charges, loans, and evidence support do not show a dominant pressure point."
      : policySignal === "monitor"
        ? "The policy is readable, but one or more visible signals still deserve monitoring."
        : "The policy has visible pressure that should be reviewed before treating it as stable.";

  return {
    policy_signal: policySignal,
    signal_score: signalScore,
    confidence: confidenceLabel(confidenceScore),
    confidence_score: Number(confidenceScore.toFixed(2)),
    signal_reasons: unique([...riskFlags, ...monitorFlags, ...positiveSignals]).slice(0, 6),
    primary_reason: unique([...riskFlags, ...monitorFlags, ...positiveSignals])[0] || fallbackReason,
    risk_flags: unique(riskFlags),
    monitor_flags: unique(monitorFlags),
    positive_signals: unique(positiveSignals),
    missing_fields: missingFields,
    metrics: {
      cash_value: cashValue,
      surrender_value: surrenderValue,
      loan_balance: loanBalance,
      loan_ratio: loanRatio === null ? null : Number(loanRatio.toFixed(4)),
      total_coi: totalCoi,
      total_visible_charges: totalVisibleCharges,
      charge_drag_ratio: chargeDragRatio === null ? null : Number(chargeDragRatio.toFixed(4)),
      coi_ratio: coiRatio === null ? null : Number(coiRatio.toFixed(4)),
    },
  };
}
