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

export function scoreRetirementGoal(inputs = {}) {
  const currentAge = toNumber(inputs.currentAge, 40);
  const retirementAge = toNumber(inputs.retirementAge, currentAge + 20);
  const derivedHorizonYears = retirementAge - currentAge;
  const horizonYearsInput =
    inputs.retirementHorizonYears === null || inputs.retirementHorizonYears === undefined || inputs.retirementHorizonYears === ""
      ? derivedHorizonYears
      : toNumber(inputs.retirementHorizonYears, derivedHorizonYears);
  const horizonYears = Math.max(0, horizonYearsInput || derivedHorizonYears);
  const currentAssets = Math.max(0, toNumber(inputs.currentAssets, 0));
  const annualContribution = Math.max(0, toNumber(inputs.annualContribution, 0));
  const annualGrowthRate = clamp(toNumber(inputs.annualGrowthRate, 5), 0, 12) / 100;
  const desiredMonthlyIncome = Math.max(0, toNumber(inputs.desiredMonthlyIncome, 0));
  const socialSecurityMonthly = Math.max(0, toNumber(inputs.socialSecurityMonthly, 0));
  const pensionMonthly = Math.max(0, toNumber(inputs.pensionMonthly, 0));
  const validationMessages = [];

  if (retirementAge <= currentAge && horizonYears === 0) {
    validationMessages.push("Retirement age is at or below current age, so the projection horizon is treated as 0 years.");
  }
  if (currentAssets === 0) {
    validationMessages.push("Current retirement assets are set to 0 in this estimate.");
  }
  if (desiredMonthlyIncome === 0) {
    validationMessages.push("Desired retirement income is set to 0, so readiness will look fully funded by default.");
  }

  const projectedCurrentAssets = currentAssets * ((1 + annualGrowthRate) ** horizonYears);
  const projectedContributionGrowth =
    horizonYears > 0
      ? annualContribution * ((((1 + annualGrowthRate) ** horizonYears) - 1) / Math.max(annualGrowthRate || 1, 0.0001))
      : 0;
  const projectedRetirementBalance = projectedCurrentAssets + projectedContributionGrowth;

  const monthlyNonPortfolioIncome = socialSecurityMonthly + pensionMonthly;
  const monthlyIncomeGap = Math.max(0, desiredMonthlyIncome - monthlyNonPortfolioIncome);
  const annualIncomeGap = monthlyIncomeGap * 12;

  // Simple 4% planning rule for a first-pass target asset estimate.
  const estimatedTargetAssets = annualIncomeGap > 0 ? annualIncomeGap / 0.04 : 0;
  const fundingRatio = estimatedTargetAssets > 0 ? projectedRetirementBalance / estimatedTargetAssets : 1;
  const readinessScore = clamp(Math.round(fundingRatio * 100), 0, 100);

  let readinessStatus = "On Track";
  if (readinessScore < 40) readinessStatus = "Needs Attention";
  else if (readinessScore < 60) readinessStatus = "Behind";
  else if (readinessScore < 85) readinessStatus = "Moderately Behind";

  const shortfall = Math.max(0, estimatedTargetAssets - projectedRetirementBalance);

  const assumptions = {
    annualGrowthRatePercent: Math.round(annualGrowthRate * 1000) / 10,
    planningRule: "4% withdrawal rule",
    horizonYears,
    inflationIncluded: false,
    taxesIncluded: false,
  };

  const assumptionLines = [
    `Annual growth assumption: ${assumptions.annualGrowthRatePercent}%`,
    `Planning rule used: ${assumptions.planningRule}`,
    "Inflation/taxes not included",
  ];

  const explanation = `You want to retire at age ${retirementAge} and would like about ${formatCurrency(
    desiredMonthlyIncome
  )} per month in retirement income. Based on your current retirement assets, ongoing contributions, and the assumptions used here, you appear ${readinessStatus.toLowerCase()} against your current target. Estimated non-portfolio income is ${formatCurrency(
    monthlyNonPortfolioIncome
  )} per month, leaving an estimated monthly gap of ${formatCurrency(
    monthlyIncomeGap
  )}. This estimate is sensitive to contribution pace, retirement timing, and the assumed ${assumptions.annualGrowthRatePercent}% annual growth rate.`;

  return {
    projectedRetirementBalance,
    estimatedNonPortfolioIncomeMonthly: monthlyNonPortfolioIncome,
    estimatedIncomeGapMonthly: monthlyIncomeGap,
    estimatedTargetAssets,
    projectedShortfall: shortfall,
    readinessScore,
    readinessStatus,
    explanation,
    assumptions,
    assumptionLines,
    validationMessages,
    inputs: {
      currentAge,
      retirementAge,
      horizonYears,
      currentAssets,
      annualContribution,
      annualGrowthRatePercent: annualGrowthRate * 100,
      desiredMonthlyIncome,
      socialSecurityMonthly,
      pensionMonthly,
    },
  };
}
