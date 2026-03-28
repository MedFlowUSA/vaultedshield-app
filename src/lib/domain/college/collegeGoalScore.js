function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) return "$0";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function scoreCollegeGoal(inputs = {}) {
  const childLabel = String(inputs.childLabel || "Child Plan").trim() || "Child Plan";
  const currentAge = Math.max(0, toNumber(inputs.currentAge, 8));
  const collegeStartAge = Math.max(0, toNumber(inputs.collegeStartAge, 18));
  const targetSavings = Math.max(0, toNumber(inputs.targetSavings, 0));
  const currentSavings = Math.max(0, toNumber(inputs.currentSavings, 0));
  const monthlyContribution = Math.max(0, toNumber(inputs.monthlyContribution, 0));
  const annualGrowthRate = clamp(toNumber(inputs.annualGrowthRate, 5), 0, 12) / 100;
  const yearsUntilCollege = Math.max(0, collegeStartAge - currentAge);
  const monthsUntilCollege = yearsUntilCollege * 12;
  const validationMessages = [];

  if (collegeStartAge <= currentAge) {
    validationMessages.push("College start age is at or below the child's current age, so the projection horizon is treated as 0 years.");
  }
  if (targetSavings === 0) {
    validationMessages.push("College savings goal is set to 0, so readiness will look fully funded by default.");
  }
  if (currentSavings === 0) {
    validationMessages.push("Current college savings are set to 0 in this estimate.");
  }

  const projectedCurrentSavings = currentSavings * ((1 + annualGrowthRate) ** yearsUntilCollege);
  const monthlyRate = annualGrowthRate / 12;
  const projectedContributionGrowth =
    monthsUntilCollege > 0
      ? monthlyContribution *
        (monthlyRate > 0
          ? (((1 + monthlyRate) ** monthsUntilCollege) - 1) / monthlyRate
          : monthsUntilCollege)
      : 0;
  const projectedSavings = projectedCurrentSavings + projectedContributionGrowth;
  const fundingDifference = projectedSavings - targetSavings;
  const readinessRatio = targetSavings > 0 ? projectedSavings / targetSavings : 1;
  const readinessScore = clamp(Math.round(readinessRatio * 100), 0, 100);

  let readinessStatus = "On Track";
  if (readinessScore < 40) readinessStatus = "Needs Attention";
  else if (readinessScore < 70) readinessStatus = "Behind";
  else if (readinessScore < 90) readinessStatus = "Slightly Behind";

  const assumptions = {
    annualGrowthRatePercent: Math.round(annualGrowthRate * 1000) / 10,
    tuitionInflationIncluded: false,
    inflationIncluded: false,
    yearsUntilCollege,
  };
  const assumptionLines = [
    `Annual growth assumption: ${assumptions.annualGrowthRatePercent}%`,
    "No inflation modeling yet",
    "No tuition inflation modeling yet",
    "Estimate only, not advice",
  ];

  const explanation = `You would like to have about ${formatCurrency(
    targetSavings
  )} saved for ${childLabel} by the time college starts at age ${collegeStartAge}. Based on the current savings, ongoing monthly contributions, and the assumptions used here, this plan appears ${readinessStatus.toLowerCase()} against the current target. Projected savings at the target date are about ${formatCurrency(
    projectedSavings
  )}, which leaves ${fundingDifference >= 0 ? "a projected surplus" : "an estimated gap"} of ${formatCurrency(
    Math.abs(fundingDifference)
  )}. This estimate is sensitive to contribution pace, timing, and the assumed ${assumptions.annualGrowthRatePercent}% annual growth rate.`;

  return {
    childLabel,
    projectedSavings,
    fundingDifference,
    readinessScore,
    readinessStatus,
    explanation,
    assumptions,
    assumptionLines,
    validationMessages,
    inputs: {
      currentAge,
      collegeStartAge,
      targetSavings,
      currentSavings,
      monthlyContribution,
      annualGrowthRatePercent: annualGrowthRate * 100,
      yearsUntilCollege,
      monthsUntilCollege,
    },
  };
}
