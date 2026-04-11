import { evaluatePolicySignalRules } from "./policySignalRules.js";

function dedupe(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalizeExistingSignal(value) {
  const signal = String(value || "").toLowerCase();
  if (signal === "at_risk" || signal === "at risk") return "at_risk";
  if (signal === "monitor") return "monitor";
  if (signal === "healthy") return "healthy";
  return null;
}

function confidenceFromEvidence({ ruleResult, signalLevel }) {
  const metrics = ruleResult.metrics;
  const evidenceChecks = [
    metrics.cashValue !== null,
    metrics.loanBalance !== null,
    metrics.chargeDragRatio !== null || metrics.coiRatio !== null || Boolean(metrics.chargeVisibility),
    Boolean(metrics.latestStatementDate),
    metrics.missingFields.length <= 2,
    metrics.periodsCount === null || metrics.periodsCount > 0,
  ];
  const evidenceCoverage = evidenceChecks.filter(Boolean).length / evidenceChecks.length;
  const pressurePenalty = Object.values(ruleResult.flags).filter(Boolean).length * 0.04;
  const atRiskPenalty = signalLevel === "at_risk" ? 0.08 : 0;
  return Number(clamp(evidenceCoverage - pressurePenalty - atRiskPenalty).toFixed(2));
}

function summaryFor(signalLevel) {
  if (signalLevel === "healthy") return "Healthy policy signal";
  if (signalLevel === "at_risk") return "Needs review signal";
  return "Monitor policy signal";
}

export function buildPolicySignals({
  policyInterpretation = null,
  trendSummary = null,
  comparisonData = null,
  signalsOutput = null,
  normalizedMetrics = null,
} = {}) {
  const ruleResult = evaluatePolicySignalRules({
    policyInterpretation: policyInterpretation || {},
    trendSummary: trendSummary || {},
    comparisonData: comparisonData || {},
    signalsOutput: signalsOutput || comparisonData?.policy_signals || {},
    normalizedMetrics: normalizedMetrics || {},
  });
  const existingSignal = normalizeExistingSignal(signalsOutput?.policy_signal || comparisonData?.policy_signal);
  const hasRiskFlag = ruleResult.riskScore > 0;
  const hasMonitorFlag = ruleResult.monitorScore > 0;
  const severeIncompleteData = ruleResult.flags.incompleteData && ruleResult.riskScore > 0;
  const signalLevel =
    hasRiskFlag || existingSignal === "at_risk"
      ? "at_risk"
      : hasMonitorFlag || existingSignal === "monitor" || severeIncompleteData
        ? "monitor"
        : "healthy";
  const fallbackReason =
    signalLevel === "healthy"
      ? "Visible policy evidence does not show a major pressure point right now."
      : signalLevel === "monitor"
        ? "The policy is readable, but one or more evidence signals deserves monitoring."
        : "The policy has visible pressure that should be reviewed before treating it as stable.";
  const reasons = dedupe([
    ...ruleResult.reasons,
    ...(signalLevel === "healthy" ? ruleResult.positiveReasons : []),
    signalsOutput?.primary_reason,
  ]).slice(0, 6);

  return {
    signalLevel,
    summaryLabel: summaryFor(signalLevel),
    reasons: reasons.length > 0 ? reasons : [fallbackReason],
    flags: ruleResult.flags,
    confidence: confidenceFromEvidence({ ruleResult, signalLevel }),
  };
}
