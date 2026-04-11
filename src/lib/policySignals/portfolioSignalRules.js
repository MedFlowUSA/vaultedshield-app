function normalizeSignalLevel(value) {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, "_");
  if (["at_risk", "at-risk", "weak"].includes(normalized)) return "at_risk";
  if (["monitor", "moderate"].includes(normalized)) return "monitor";
  if (["healthy", "strong"].includes(normalized)) return "healthy";
  return "monitor";
}

function severityScore(signalLevel) {
  if (signalLevel === "at_risk") return 3;
  if (signalLevel === "monitor") return 2;
  return 1;
}

function normalizeConfidence(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0.5;
  }

  const normalized = String(value || "").toLowerCase().trim();
  if (normalized === "high") return 0.85;
  if (normalized === "moderate") return 0.65;
  if (normalized === "developing" || normalized === "low") return 0.4;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0.5;
}

export const PORTFOLIO_SIGNAL_FLAG_LABELS = {
  concentrationRisk: "Concentration Risk",
  incompleteDataSpread: "Incomplete Data Spread",
  loanExposureRisk: "Loan Exposure",
  chargeDragRisk: "Charge Drag",
  illustrationVarianceRisk: "Illustration Variance",
};

export function normalizePortfolioPolicy(policy = {}) {
  const policySignal = policy.policySignals || policy.policy_signals || {};
  const signalLevel = normalizeSignalLevel(
    policySignal.signalLevel ||
      policySignal.policy_signal ||
      policy.policy_signal ||
      policy.ranking?.status
  );
  const flags = policySignal.flags || {
    fundingPressure: false,
    chargeDrag: false,
    loanRisk: false,
    incompleteData: false,
    illustrationVarianceRisk: false,
    concentrationRisk: false,
  };
  const missingFields = Array.isArray(policy.missing_fields) ? policy.missing_fields : [];

  return {
    id: policy.policy_id || policy.id || "",
    label: policy.product || policy.product_name || policy.carrier || "Policy",
    carrier: policy.carrier || "",
    signalLevel,
    flags,
    confidence: normalizeConfidence(
      policySignal.confidence_score ??
        policySignal.confidence ??
        policy.confidence ??
        0.5
    ),
    continuityScore: Number(policy.continuity_score ?? policy.ranking?.score ?? 0) || 0,
    missingFields,
    severity: severityScore(signalLevel),
  };
}

export function evaluatePortfolioSignalRules(policies = []) {
  const normalizedPolicies = policies.map(normalizePortfolioPolicy).filter((policy) => policy.id || policy.label);
  const totalPolicies = normalizedPolicies.length;
  const atRiskPolicies = normalizedPolicies.filter((policy) => policy.signalLevel === "at_risk");
  const monitorPolicies = normalizedPolicies.filter((policy) => policy.signalLevel === "monitor");
  const incompletePolicies = normalizedPolicies.filter((policy) => policy.flags.incompleteData || policy.missingFields.length >= 3);
  const loanPolicies = normalizedPolicies.filter((policy) => policy.flags.loanRisk);
  const chargePolicies = normalizedPolicies.filter((policy) => policy.flags.chargeDrag);
  const illustrationPolicies = normalizedPolicies.filter((policy) => policy.flags.illustrationVarianceRisk);
  const concentrationPolicies = normalizedPolicies.filter((policy) => policy.flags.concentrationRisk);
  const carrierCounts = normalizedPolicies.reduce((accumulator, policy) => {
    const carrier = String(policy.carrier || "").trim();
    if (!carrier) return accumulator;
    accumulator[carrier] = (accumulator[carrier] || 0) + 1;
    return accumulator;
  }, {});
  const largestCarrierCount = Math.max(0, ...Object.values(carrierCounts));

  const portfolioFlags = {
    concentrationRisk:
      concentrationPolicies.length >= 2 ||
      (totalPolicies >= 3 && largestCarrierCount >= Math.ceil(totalPolicies / 2)),
    incompleteDataSpread:
      totalPolicies > 0 && incompletePolicies.length >= Math.max(2, Math.ceil(totalPolicies / 2)),
    loanExposureRisk:
      totalPolicies > 0 && loanPolicies.length >= Math.max(1, Math.ceil(totalPolicies / 3)),
    chargeDragRisk:
      totalPolicies > 0 && chargePolicies.length >= Math.max(1, Math.ceil(totalPolicies / 3)),
    illustrationVarianceRisk:
      totalPolicies > 0 && illustrationPolicies.length >= Math.max(1, Math.ceil(totalPolicies / 3)),
  };

  const reasons = [];
  if (atRiskPolicies.length >= 2) {
    reasons.push(`${atRiskPolicies.length} policies are already reading at risk.`);
  } else if (atRiskPolicies.length === 1) {
    reasons.push(`${atRiskPolicies[0].label} is the clearest at-risk policy in the current portfolio.`);
  }
  if (monitorPolicies.length >= Math.max(2, Math.ceil(totalPolicies / 2)) && totalPolicies > 1) {
    reasons.push(`${monitorPolicies.length} policies are in monitor status, so the portfolio is mixed rather than uniformly stable.`);
  }
  if (portfolioFlags.incompleteDataSpread) {
    reasons.push("Incomplete policy evidence is spread across multiple saved policies.");
  }
  if (portfolioFlags.loanExposureRisk) {
    reasons.push("Loan-related pressure is visible across the portfolio.");
  }
  if (portfolioFlags.chargeDragRisk) {
    reasons.push("Charge drag appears in multiple policies, not just one file.");
  }
  if (portfolioFlags.illustrationVarianceRisk) {
    reasons.push("Illustration or growth-variance pressure appears across the portfolio.");
  }
  if (portfolioFlags.concentrationRisk) {
    reasons.push("The portfolio shows concentration risk in strategy visibility or carrier mix.");
  }

  return {
    normalizedPolicies,
    totals: {
      totalPolicies,
      healthyCount: normalizedPolicies.filter((policy) => policy.signalLevel === "healthy").length,
      monitorCount: monitorPolicies.length,
      atRiskCount: atRiskPolicies.length,
    },
    portfolioFlags,
    reasons,
  };
}
