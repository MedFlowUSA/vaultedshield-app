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

function formatCurrency(value) {
  if (!isFiniteNumber(value)) return "Unavailable";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value) {
  if (!isFiniteNumber(value)) return "Unavailable";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: Math.abs(value) < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  })}%`;
}

function pushMissing(list, message) {
  if (message && !list.includes(message)) list.push(message);
}

function validateInputs({ normalizedAnalytics = {}, statementRows = [], missingData = [] }) {
  const projection = normalizedAnalytics?.illustration_projection || {};
  const currentMatch = projection?.current_projection_match || null;
  const benchmarkRows = Array.isArray(projection?.benchmark_rows) ? projection.benchmark_rows : [];

  if (!benchmarkRows.length) {
    pushMissing(missingData, "No usable illustration ledger rows were extracted from the current baseline packet.");
  }
  if (!statementRows.length) {
    pushMissing(missingData, "No statement history is available for illustration comparison.");
  }
  if (!currentMatch?.actual_policy_year && !currentMatch?.matched_policy_year) {
    pushMissing(missingData, "Policy-year alignment is not visible enough for a clean illustration comparison.");
  }

  return { projection, currentMatch, benchmarkRows };
}

function alignPolicyYears({ currentMatch, benchmarkRows = [], missingData = [] }) {
  const actualPolicyYear = toNumber(currentMatch?.actual_policy_year);
  const matchedPolicyYear = toNumber(currentMatch?.matched_policy_year);
  const matchedBenchmarkRow =
    benchmarkRows.find((row) => toNumber(row?.policy_year) === matchedPolicyYear) ||
    benchmarkRows.find((row) => actualPolicyYear !== null && Math.abs((toNumber(row?.policy_year) ?? 0) - actualPolicyYear) <= 1) ||
    null;
  const gap =
    actualPolicyYear !== null && matchedPolicyYear !== null
      ? Math.abs(actualPolicyYear - matchedPolicyYear)
      : null;

  let alignmentConfidence = "low";
  if (actualPolicyYear !== null && matchedPolicyYear !== null && gap === 0) alignmentConfidence = "high";
  else if (actualPolicyYear !== null && matchedPolicyYear !== null && gap === 1) alignmentConfidence = "moderate";

  if (alignmentConfidence === "low") {
    pushMissing(missingData, "Illustration year and current policy duration are not aligned strongly enough.");
  }

  return {
    actualPolicyYear,
    matchedPolicyYear,
    matchedBenchmarkRow,
    policyYearGap: gap,
    alignmentConfidence,
  };
}

function extractComparableMetrics({ currentMatch, matchedBenchmarkRow, lifePolicy, normalizedAnalytics }) {
  const premiumPace = {
    illustrated: toNumber(matchedBenchmarkRow?.premium_outlay),
    actual:
      toNumber(lifePolicy?.funding?.totalPremiumPaid) ??
      toNumber(normalizedAnalytics?.growth_attribution?.visible_total_premium_paid) ??
      null,
  };
  const accumulationValue = {
    illustrated: toNumber(currentMatch?.projected_accumulation_value),
    actual: toNumber(currentMatch?.actual_accumulation_value),
  };
  const cashSurrenderValue = {
    illustrated: toNumber(currentMatch?.projected_cash_surrender_value),
    actual: toNumber(currentMatch?.actual_cash_surrender_value),
  };
  const deathBenefit = {
    illustrated: toNumber(matchedBenchmarkRow?.death_benefit),
    actual: toNumber(lifePolicy?.coverage?.deathBenefit),
  };

  const prioritizedMetrics = [
    { key: "premium_pace", label: "Premium Pace", ...premiumPace, signalPriority: 1 },
    { key: "accumulation_value", label: "Accumulation Value", ...accumulationValue, signalPriority: 2 },
    { key: "cash_surrender_value", label: "Cash Surrender Value", ...cashSurrenderValue, signalPriority: 3 },
    { key: "death_benefit", label: "Death Benefit", ...deathBenefit, signalPriority: 4 },
  ];

  return {
    prioritizedMetrics,
    selectedMetric:
      prioritizedMetrics.find((metric) => isFiniteNumber(metric.illustrated) && isFiniteNumber(metric.actual)) ||
      prioritizedMetrics[0],
    premiumPace,
    accumulationValue,
    cashSurrenderValue,
    deathBenefit,
  };
}

function computeVariance(metric, alignmentConfidence) {
  if (alignmentConfidence === "low") {
    return {
      varianceAmount: null,
      variancePercent: null,
      direction: "indeterminate",
    };
  }

  const varianceAmount =
    isFiniteNumber(metric?.actual) && isFiniteNumber(metric?.illustrated)
      ? metric.actual - metric.illustrated
      : null;
  const variancePercent =
    isFiniteNumber(varianceAmount) && isFiniteNumber(metric?.illustrated) && metric.illustrated !== 0
      ? (varianceAmount / metric.illustrated) * 100
      : null;

  return {
    varianceAmount,
    variancePercent,
    direction:
      !isFiniteNumber(varianceAmount)
        ? "indeterminate"
        : varianceAmount > 0
          ? "ahead"
          : varianceAmount < 0
            ? "behind"
            : "flat",
  };
}

function hasComparableMetric(metric) {
  return isFiniteNumber(metric?.illustrated) && isFiniteNumber(metric?.actual);
}

function detectDrivers({
  metrics,
  chargeAnalysis,
  fundingAnalysis,
  lifePolicy,
  alignmentConfidence,
  missingData = [],
}) {
  const drivers = [];
  const premiumRatio =
    isFiniteNumber(metrics.premiumPace.actual) &&
    isFiniteNumber(metrics.premiumPace.illustrated) &&
    metrics.premiumPace.illustrated > 0
      ? metrics.premiumPace.actual / metrics.premiumPace.illustrated
      : null;
  const loanBalance = toNumber(lifePolicy?.loans?.loanBalance);
  const cashValue =
    toNumber(lifePolicy?.values?.accumulationValue) ??
    toNumber(lifePolicy?.values?.cashValue) ??
    null;
  const loanRatio =
    isFiniteNumber(loanBalance) && isFiniteNumber(cashValue) && cashValue > 0
      ? loanBalance / cashValue
      : null;
  const growthBehind =
    isFiniteNumber(metrics.accumulationValue.actual) &&
    isFiniteNumber(metrics.accumulationValue.illustrated) &&
    metrics.accumulationValue.actual < metrics.accumulationValue.illustrated;

  if (alignmentConfidence === "low") {
    drivers.push({
      key: "incomplete_data",
      label: "Incomplete data",
      impact: "high",
      summary: "Illustration-year alignment is too weak for a responsible benchmark read.",
    });
  }

  if (premiumRatio !== null && premiumRatio < 0.9) {
    drivers.push({
      key: "underfunding",
      label: "Underfunding",
      impact: "high",
      summary: "Visible premium contributions are running below the illustrated premium pace.",
    });
  }

  if (chargeAnalysis?.chargeDragLevel === "high" && growthBehind) {
    drivers.push({
      key: "charge_drag",
      label: "Charge pressure",
      impact: "high",
      summary: "Visible charges look heavy relative to growth, which can drag performance.",
    });
  } else if (chargeAnalysis?.chargeDragLevel === "moderate" && growthBehind) {
    drivers.push({
      key: "charge_drag",
      label: "Charge pressure",
      impact: "moderate",
      summary: "Visible charges are meaningful enough to be part of the performance gap.",
    });
  }

  if (loanRatio !== null && loanRatio > 0.3) {
    drivers.push({
      key: "loan_pressure",
      label: "Loan pressure",
      impact: loanRatio > 0.45 ? "high" : "moderate",
      summary: "Visible policy loans are large enough to add pressure against current value support.",
    });
  }

  if (
    growthBehind &&
    premiumRatio !== null &&
    premiumRatio >= 0.9 &&
    chargeAnalysis?.chargeDragLevel !== "high"
  ) {
    drivers.push({
      key: "performance_drag",
      label: "Performance drag",
      impact: "moderate",
      summary: "Value is behind even though funding pace is not the main issue, so growth efficiency needs review.",
    });
  }

  if (!drivers.length && missingData.length > 0) {
    drivers.push({
      key: "incomplete_data",
      label: "Incomplete data",
      impact: "moderate",
      summary: "The current packet is still missing enough support to isolate a clean driver confidently.",
    });
  }

  return {
    premiumRatio,
    loanRatio,
    drivers,
    fundingStatus: fundingAnalysis?.status || "unclear",
  };
}

function determineStatus({ alignmentConfidence, metrics, variances, drivers }) {
  if (alignmentConfidence === "low") {
    return "indeterminate";
  }

  const premiumBehind =
    isFiniteNumber(metrics.premiumPace.actual) &&
    isFiniteNumber(metrics.premiumPace.illustrated) &&
    metrics.premiumPace.actual < metrics.premiumPace.illustrated * 0.97;
  const premiumAhead =
    isFiniteNumber(metrics.premiumPace.actual) &&
    isFiniteNumber(metrics.premiumPace.illustrated) &&
    metrics.premiumPace.actual > metrics.premiumPace.illustrated * 1.03;
  const valueBehind = variances.accumulationValue.direction === "behind" || variances.cashSurrenderValue.direction === "behind";
  const valueAhead = variances.accumulationValue.direction === "ahead" || variances.cashSurrenderValue.direction === "ahead";
  const hasComparableValue = hasComparableMetric(metrics.accumulationValue) || hasComparableMetric(metrics.cashSurrenderValue);

  if (premiumBehind && valueBehind) return "behind";
  if (!premiumBehind && valueBehind) return "behind";
  if (!hasComparableValue) {
    if (premiumBehind) return "behind";
    if (premiumAhead) return "ahead";
  }
  if (premiumAhead && (valueAhead || variances.accumulationValue.direction === "flat")) return valueAhead ? "ahead" : "on_track";
  if (!premiumBehind && !valueBehind && valueAhead) return "ahead";
  if (drivers.some((driver) => driver.key === "charge_drag" && driver.impact === "high")) return "behind";
  return "on_track";
}

function chooseSelectedMetric({ metrics, variances, drivers = [] }) {
  const hasDriver = (key) => drivers.some((driver) => driver.key === key);
  if (hasDriver("underfunding") && hasComparableMetric(metrics.premiumPace)) {
    return { key: "premiumPace", metric: metrics.premiumPace, label: "Premium Pace" };
  }
  if ((hasDriver("charge_drag") || hasDriver("performance_drag")) && hasComparableMetric(metrics.accumulationValue)) {
    return { key: "accumulationValue", metric: metrics.accumulationValue, label: "Accumulation Value" };
  }
  if (variances.accumulationValue.direction === "behind" || variances.accumulationValue.direction === "ahead") {
    return { key: "accumulationValue", metric: metrics.accumulationValue, label: "Accumulation Value" };
  }
  if (variances.cashSurrenderValue.direction === "behind" || variances.cashSurrenderValue.direction === "ahead") {
    return { key: "cashSurrenderValue", metric: metrics.cashSurrenderValue, label: "Cash Surrender Value" };
  }
  if (hasComparableMetric(metrics.premiumPace)) {
    return { key: "premiumPace", metric: metrics.premiumPace, label: "Premium Pace" };
  }
  if (hasComparableMetric(metrics.accumulationValue)) {
    return { key: "accumulationValue", metric: metrics.accumulationValue, label: "Accumulation Value" };
  }
  if (hasComparableMetric(metrics.cashSurrenderValue)) {
    return { key: "cashSurrenderValue", metric: metrics.cashSurrenderValue, label: "Cash Surrender Value" };
  }
  return { key: "deathBenefit", metric: metrics.deathBenefit, label: "Death Benefit" };
}

function deriveConfidence({ alignmentConfidence, drivers = [], missingData = [] }) {
  if (alignmentConfidence === "low") return "low";
  if (alignmentConfidence === "high" && missingData.length <= 1) return "high";
  if (drivers.some((driver) => driver.key === "incomplete_data")) return "low";
  return "moderate";
}

function buildConfidenceExplanation(confidence, alignmentConfidence) {
  if (confidence === "high") {
    return "Confidence is high due to strong alignment between the illustration year and current policy duration.";
  }
  if (confidence === "moderate") {
    return "Confidence is moderate due to partial alignment between the illustration and current policy timing.";
  }
  if (alignmentConfidence === "low") {
    return "Confidence is limited due to weak alignment between illustration data and current policy duration.";
  }
  return "Confidence is limited because the visible comparison support is still incomplete.";
}

function generateExplanation({ status, confidence, alignmentConfidence, drivers, metrics, variances, missingData }) {
  const directAnswer =
    status === "ahead"
      ? "Based on the visible illustration and current in-force data, this policy appears ahead of the original pace."
      : status === "behind"
        ? "Based on the visible illustration and current in-force data, this policy appears behind the original pace."
        : status === "on_track"
          ? "Based on the visible illustration and current in-force data, this policy appears broadly on track."
          : "The uploaded illustration and current in-force data do not align strongly enough for a reliable comparison yet.";

  const context =
    alignmentConfidence === "high"
      ? "This comparison is based on strong alignment between the visible illustration year and current policy duration."
      : alignmentConfidence === "moderate"
        ? "This comparison is based on moderate alignment between the visible illustration year and current policy duration."
        : "This comparison is limited because the visible illustration year and current policy duration do not align cleanly.";

  const primaryDriver = drivers[0]?.summary ||
    "The current packet does not isolate a single clean driver strongly enough.";
  const impact =
    status === "behind"
      ? "That can reduce long-term accumulation and increase the risk of future underperformance."
      : status === "ahead"
        ? "That supports stronger policy value development if the current pattern continues."
        : status === "on_track"
          ? "That suggests the policy is not showing a major visible drift from the illustration at this checkpoint."
          : "The safest next step is to improve data quality before drawing a stronger conclusion.";
  const confidenceLine =
    confidence === "high"
      ? "Confidence in this comparison is high."
      : confidence === "moderate"
        ? "Confidence in this comparison is moderate."
        : "Confidence in this comparison is low because data support is still incomplete.";
  const confidenceExplanation = buildConfidenceExplanation(confidence, alignmentConfidence);

  return {
    directAnswer,
    context,
    why: `The primary driver appears to be ${primaryDriver.charAt(0).toLowerCase()}${primaryDriver.slice(1)}`,
    impact,
    confidenceLine,
    confidenceExplanation,
    shortExplanation: `${directAnswer} ${primaryDriver} ${confidenceLine}`,
    fullExplanation: [directAnswer, context, `The primary driver appears to be ${primaryDriver.charAt(0).toLowerCase()}${primaryDriver.slice(1)}`, impact, confidenceLine, confidenceExplanation].join(" "),
    missingData: [...new Set(missingData)],
  };
}

export function buildIllustrationVsActualAnalysis({
  lifePolicy = null,
  normalizedAnalytics = {},
  statementRows = [],
  chargeAnalysis = null,
  fundingAnalysis = null,
  missingData = [],
} = {}) {
  const localMissingData = [...new Set(missingData)];
  const { projection, currentMatch, benchmarkRows } = validateInputs({
    normalizedAnalytics,
    statementRows,
    missingData: localMissingData,
  });
  const alignment = alignPolicyYears({
    currentMatch,
    benchmarkRows,
    missingData: localMissingData,
  });
  const metrics = extractComparableMetrics({
    currentMatch,
    matchedBenchmarkRow: alignment.matchedBenchmarkRow,
    lifePolicy,
    normalizedAnalytics,
  });
  const variances = {
    premiumPace: computeVariance(metrics.premiumPace, alignment.alignmentConfidence),
    accumulationValue: computeVariance(metrics.accumulationValue, alignment.alignmentConfidence),
    cashSurrenderValue: computeVariance(metrics.cashSurrenderValue, alignment.alignmentConfidence),
    deathBenefit: computeVariance(metrics.deathBenefit, alignment.alignmentConfidence),
    selectedMetric: computeVariance(metrics.selectedMetric, alignment.alignmentConfidence),
  };
  const driverResults = detectDrivers({
    metrics,
    chargeAnalysis,
    fundingAnalysis,
    lifePolicy,
    alignmentConfidence: alignment.alignmentConfidence,
    missingData: localMissingData,
  });
  const status = determineStatus({
    alignmentConfidence: alignment.alignmentConfidence,
    metrics,
    variances,
    drivers: driverResults.drivers,
  });
  const confidence = deriveConfidence({
    alignmentConfidence: alignment.alignmentConfidence,
    drivers: driverResults.drivers,
    missingData: localMissingData,
  });
  const selectedMetric = chooseSelectedMetric({
    metrics,
    variances,
    drivers: driverResults.drivers,
  });
  const explanation = generateExplanation({
    status,
    confidence,
    alignmentConfidence: alignment.alignmentConfidence,
    drivers: driverResults.drivers,
    metrics,
    variances,
    missingData: localMissingData,
  });

  return {
    status,
    confidence,
    alignmentConfidence: alignment.alignmentConfidence,
    policyYearAlignment: {
      actualPolicyYear: alignment.actualPolicyYear,
      matchedPolicyYear: alignment.matchedPolicyYear,
      policyYearGap: alignment.policyYearGap,
    },
    selectedMetric: selectedMetric.key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`),
    selectedMetricLabel: selectedMetric.label,
    metrics: {
      premiumPace: {
        illustrated: metrics.premiumPace.illustrated,
        actual: metrics.premiumPace.actual,
        illustratedDisplay: formatCurrency(metrics.premiumPace.illustrated),
        actualDisplay: formatCurrency(metrics.premiumPace.actual),
        varianceAmount: variances.premiumPace.varianceAmount,
        variancePercent: variances.premiumPace.variancePercent,
      },
      accumulationValue: {
        illustrated: metrics.accumulationValue.illustrated,
        actual: metrics.accumulationValue.actual,
        illustratedDisplay: formatCurrency(metrics.accumulationValue.illustrated),
        actualDisplay: formatCurrency(metrics.accumulationValue.actual),
        varianceAmount: variances.accumulationValue.varianceAmount,
        variancePercent: variances.accumulationValue.variancePercent,
      },
      cashSurrenderValue: {
        illustrated: metrics.cashSurrenderValue.illustrated,
        actual: metrics.cashSurrenderValue.actual,
        illustratedDisplay: formatCurrency(metrics.cashSurrenderValue.illustrated),
        actualDisplay: formatCurrency(metrics.cashSurrenderValue.actual),
        varianceAmount: variances.cashSurrenderValue.varianceAmount,
        variancePercent: variances.cashSurrenderValue.variancePercent,
      },
      deathBenefit: {
        illustrated: metrics.deathBenefit.illustrated,
        actual: metrics.deathBenefit.actual,
        illustratedDisplay: formatCurrency(metrics.deathBenefit.illustrated),
        actualDisplay: formatCurrency(metrics.deathBenefit.actual),
        varianceAmount: variances.deathBenefit.varianceAmount,
        variancePercent: variances.deathBenefit.variancePercent,
      },
    },
    selectedMetricData: {
      illustrated: selectedMetric.metric.illustrated,
      actual: selectedMetric.metric.actual,
      illustratedDisplay: formatCurrency(selectedMetric.metric.illustrated),
      actualDisplay: formatCurrency(selectedMetric.metric.actual),
      varianceAmount: variances[selectedMetric.key].varianceAmount,
      variancePercent: variances[selectedMetric.key].variancePercent,
    },
    varianceAmount: variances[selectedMetric.key].varianceAmount,
    variancePercent: variances[selectedMetric.key].variancePercent,
    varianceDisplay: formatCurrency(variances[selectedMetric.key].varianceAmount),
    variancePercentDisplay: isFiniteNumber(variances[selectedMetric.key].variancePercent)
      ? formatPercent(variances[selectedMetric.key].variancePercent)
      : "Unavailable",
    direction: variances[selectedMetric.key].direction,
    drivers: driverResults.drivers,
    explanation: explanation.fullExplanation,
    shortExplanation: explanation.shortExplanation,
    directAnswer: explanation.directAnswer,
    context: explanation.context,
    why: explanation.why,
    impact: explanation.impact,
    confidenceLine: explanation.confidenceLine,
    confidenceExplanation: explanation.confidenceExplanation,
    missingData: explanation.missingData,
    debug: {
      projectionComparisonPossible: Boolean(projection?.comparison_possible),
      currentMatch,
      benchmarkRowUsed: alignment.matchedBenchmarkRow || null,
      premiumRatio: driverResults.premiumRatio,
      loanRatio: driverResults.loanRatio,
    },
  };
}
