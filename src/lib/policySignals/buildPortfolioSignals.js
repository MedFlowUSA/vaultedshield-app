import { evaluatePortfolioSignalRules } from "./portfolioSignalRules.js";

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function comparePriority(left, right) {
  if (right.severity !== left.severity) return right.severity - left.severity;

  const leftFlagCount = Object.values(left.flags || {}).filter(Boolean).length;
  const rightFlagCount = Object.values(right.flags || {}).filter(Boolean).length;
  if (rightFlagCount !== leftFlagCount) return rightFlagCount - leftFlagCount;

  if (left.missingFields.length !== right.missingFields.length) {
    return right.missingFields.length - left.missingFields.length;
  }

  if (left.continuityScore !== right.continuityScore) {
    return left.continuityScore - right.continuityScore;
  }

  return String(left.label).localeCompare(String(right.label));
}

function compareStrongest(left, right) {
  if (left.severity !== right.severity) return left.severity - right.severity;
  if (right.confidence !== left.confidence) return right.confidence - left.confidence;
  if (right.continuityScore !== left.continuityScore) return right.continuityScore - left.continuityScore;
  if (left.missingFields.length !== right.missingFields.length) return left.missingFields.length - right.missingFields.length;
  return String(left.label).localeCompare(String(right.label));
}

function summaryLabel(portfolioSignalLevel) {
  if (portfolioSignalLevel === "healthy") return "Healthy portfolio signal";
  if (portfolioSignalLevel === "at_risk") return "Needs review portfolio signal";
  return "Monitor portfolio signal";
}

function buildConfidence(normalizedPolicies = [], portfolioFlags = {}) {
  if (normalizedPolicies.length === 0) return 0;

  const averageConfidence =
    normalizedPolicies.reduce((sum, policy) => sum + Number(policy.confidence || 0), 0) / normalizedPolicies.length;
  const missingPenalty = normalizedPolicies.filter((policy) => policy.flags.incompleteData).length * 0.05;
  const portfolioPenalty = Object.values(portfolioFlags).filter(Boolean).length * 0.03;
  return Number(clamp(averageConfidence - missingPenalty - portfolioPenalty).toFixed(2));
}

export function buildPortfolioSignals({ policies = [] } = {}) {
  const ruleResult = evaluatePortfolioSignalRules(policies);
  const { normalizedPolicies, totals, portfolioFlags } = ruleResult;

  const portfolioSignalLevel =
    totals.atRiskCount >= 2 || (totals.totalPolicies > 0 && totals.atRiskCount / totals.totalPolicies >= 0.34)
      ? "at_risk"
      : totals.atRiskCount >= 1 ||
          totals.monitorCount >= Math.max(1, Math.ceil(totals.totalPolicies / 2)) ||
          Object.values(portfolioFlags).some(Boolean)
        ? "monitor"
        : "healthy";

  const priorityPolicyIds = normalizedPolicies
    .slice()
    .sort(comparePriority)
    .slice(0, 3)
    .map((policy) => policy.id)
    .filter(Boolean);

  const strongestPolicyIds = normalizedPolicies
    .slice()
    .sort(compareStrongest)
    .slice(0, 3)
    .map((policy) => policy.id)
    .filter(Boolean);

  const weakestPolicyIds = normalizedPolicies
    .slice()
    .sort(comparePriority)
    .slice(0, 3)
    .map((policy) => policy.id)
    .filter(Boolean);

  const reasons = unique(
    ruleResult.reasons.length > 0
      ? ruleResult.reasons
      : portfolioSignalLevel === "healthy"
        ? ["Most visible policies are currently reading healthy with limited portfolio-wide pressure."]
        : portfolioSignalLevel === "monitor"
          ? ["The portfolio is usable, but at least one policy or evidence pattern deserves monitoring."]
          : ["The portfolio has visible policy pressure that should be reviewed before being treated as stable."]
  ).slice(0, 6);

  return {
    portfolioSignalLevel,
    summaryLabel: summaryLabel(portfolioSignalLevel),
    reasons,
    totals,
    priorityPolicyIds,
    strongestPolicyIds,
    weakestPolicyIds,
    portfolioFlags,
    confidence: buildConfidence(normalizedPolicies, portfolioFlags),
  };
}
