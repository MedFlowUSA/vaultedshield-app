function currencyToNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,%\s,()]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceFromSignals(signals = []) {
  if (signals.length === 0) return 0;
  const score = signals.reduce((sum, signal) => sum + signal, 0) / signals.length;
  return Math.max(0, Math.min(1, score));
}

export function analyzePolicyBasics(parsedData = {}) {
  const normalizedPolicy = parsedData?.normalizedPolicy || parsedData?.policyRecord || {};
  const statements = Array.isArray(parsedData?.statements) ? parsedData.statements : [];
  const normalizedAnalytics = parsedData?.normalizedAnalytics || {};
  const flags = [];

  const deathBenefit =
    currencyToNumber(normalizedPolicy?.death_benefit?.death_benefit?.value) ??
    currencyToNumber(normalizedPolicy?.death_benefit?.death_benefit?.display_value) ??
    currencyToNumber(normalizedPolicy?.death_benefit?.initial_face_amount?.value) ??
    currencyToNumber(normalizedPolicy?.death_benefit?.initial_face_amount?.display_value) ??
    currencyToNumber(parsedData?.comparisonSummary?.death_benefit);
  const cashValue =
    currencyToNumber(normalizedPolicy?.values?.cash_value?.value) ??
    currencyToNumber(normalizedPolicy?.values?.cash_value?.display_value) ??
    currencyToNumber(parsedData?.comparisonSummary?.cash_value);

  const plannedPremium =
    currencyToNumber(normalizedPolicy?.funding?.planned_premium?.value) ??
    currencyToNumber(normalizedPolicy?.funding?.planned_premium?.display_value);
  const minimumPremium =
    currencyToNumber(normalizedPolicy?.funding?.minimum_premium?.value) ??
    currencyToNumber(normalizedPolicy?.funding?.minimum_premium?.display_value);
  const guidelinePremium =
    currencyToNumber(normalizedPolicy?.funding?.guideline_premium_limit?.value) ??
    currencyToNumber(normalizedPolicy?.funding?.guideline_premium_limit?.display_value);

  const coiValues = statements
    .map((statement) =>
      currencyToNumber(statement?.fields?.cost_of_insurance?.display_value) ??
      currencyToNumber(statement?.cost_of_insurance) ??
      currencyToNumber(statement?.summary?.costOfInsurance)
    )
    .filter((value) => value !== null);

  let fundingPattern = "unknown";
  if (plannedPremium !== null && guidelinePremium !== null && plannedPremium >= guidelinePremium * 0.9) {
    fundingPattern = "overfunded";
  } else if (plannedPremium !== null && minimumPremium !== null && plannedPremium > minimumPremium * 1.1) {
    fundingPattern = "adequate";
  } else if (plannedPremium !== null && minimumPremium !== null && plannedPremium <= minimumPremium) {
    fundingPattern = "underfunded";
  }

  let coiTrend = "unknown";
  if (coiValues.length >= 2) {
    const first = coiValues[0];
    const last = coiValues[coiValues.length - 1];
    if (last > first * 1.05) {
      coiTrend = "increasing";
    } else if (Math.abs(last - first) <= Math.max(first * 0.05, 25)) {
      coiTrend = "stable";
    }
  }

  if (deathBenefit === null) flags.push("Missing death benefit visibility");
  if (cashValue === null) flags.push("Missing cash value visibility");
  if (plannedPremium === null && minimumPremium === null) flags.push("Missing funding pattern visibility");
  if (coiValues.length === 0) flags.push("Missing COI trend visibility");
  if (flags.length >= 2) flags.push("Missing key policy fields");

  const confidenceScore = confidenceFromSignals([
    deathBenefit !== null ? 1 : 0,
    cashValue !== null ? 1 : 0,
    fundingPattern !== "unknown" ? 0.75 : 0,
    coiTrend !== "unknown" ? 0.75 : 0,
    normalizedAnalytics?.policy_health_score?.score ? 0.5 : 0,
  ]);

  return {
    hasDeathBenefit: deathBenefit !== null,
    hasCashValue: cashValue !== null,
    fundingPattern,
    coiTrend,
    confidenceScore,
    flags,
  };
}

export function detectInsuranceGaps(policy, householdContext = {}) {
  const notes = [];
  const basics = policy?.basics || analyzePolicyBasics(policy || {});
  const totalPolicies = Number(householdContext.totalPolicies || 0);
  let coverageGap = false;

  if (totalPolicies === 0 && !policy) {
    return {
      coverageGap: true,
      confidence: 0.2,
      notes: ["No policies are visible yet for this household."],
    };
  }

  const deathBenefitValue =
    currencyToNumber(policy?.comparisonSummary?.death_benefit) ??
    currencyToNumber(policy?.normalizedPolicy?.death_benefit?.death_benefit?.display_value) ??
    null;

  if (!basics.hasDeathBenefit) {
    coverageGap = true;
    notes.push("Death benefit visibility is limited.");
  } else if (deathBenefitValue !== null && deathBenefitValue < 250000) {
    coverageGap = true;
    notes.push("Visible death benefit may be modest relative to household protection needs.");
  }

  if (basics.fundingPattern === "underfunded") {
    coverageGap = true;
    notes.push("Funding pattern appears underfunded from the visible policy values.");
  }

  if (basics.coiTrend === "increasing") {
    notes.push("COI trend appears to be increasing across visible statement support.");
  }

  if (basics.confidenceScore < 0.45) {
    notes.push("Confidence is low because key policy fields are still missing.");
  }

  return {
    coverageGap,
    confidence: basics.confidenceScore,
    notes,
  };
}
