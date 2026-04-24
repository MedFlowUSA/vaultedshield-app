import { buildIllustrationVsActualAnalysis } from "./illustrationVsActualEngine.js";

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

function _average(values = []) {
  const usable = values.filter(isFiniteNumber);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function sortStatements(statementRows = []) {
  return [...statementRows].sort((left, right) => {
    const leftDate = String(left?.statement_date || left?.statement_date_value || "");
    const rightDate = String(right?.statement_date || right?.statement_date_value || "");
    return leftDate.localeCompare(rightDate);
  });
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildChargeAnalysis({ lifePolicy, normalizedAnalytics, statementRows, missingData }) {
  const chargeSummary = normalizedAnalytics?.charge_summary || {};
  const chargeAttribution = normalizedAnalytics?.charge_attribution || {};
  const totalPremiumPaid =
    toNumber(lifePolicy?.funding?.totalPremiumPaid) ??
    toNumber(normalizedAnalytics?.growth_attribution?.visible_total_premium_paid) ??
    null;
  const totalVisibleCharges =
    toNumber(chargeSummary?.total_visible_policy_charges) ??
    toNumber(chargeAttribution?.lifetime_visible_charges) ??
    null;
  const totalVisibleCoi =
    toNumber(chargeSummary?.total_coi) ??
    toNumber(chargeAttribution?.total_cost_of_insurance) ??
    toNumber(lifePolicy?.charges?.costOfInsurance) ??
    null;
  const categories = [
    {
      type: "cost_of_insurance",
      amount: totalVisibleCoi,
      visibility: isFiniteNumber(totalVisibleCoi) ? "visible" : "not_visible",
    },
    {
      type: "monthly_deduction",
      amount: toNumber(chargeAttribution?.total_monthly_deductions) ?? toNumber(lifePolicy?.charges?.monthlyDeduction),
      visibility:
        isFiniteNumber(toNumber(chargeAttribution?.total_monthly_deductions) ?? toNumber(lifePolicy?.charges?.monthlyDeduction))
          ? "visible"
          : "not_visible",
    },
    {
      type: "admin_fee",
      amount: toNumber(chargeAttribution?.total_admin_fees) ?? toNumber(lifePolicy?.charges?.adminFee),
      visibility:
        isFiniteNumber(toNumber(chargeAttribution?.total_admin_fees) ?? toNumber(lifePolicy?.charges?.adminFee))
          ? "visible"
          : "not_visible",
    },
    {
      type: "expense_charge",
      amount: toNumber(chargeAttribution?.total_expense_charges) ?? toNumber(lifePolicy?.charges?.expenseCharge),
      visibility:
        isFiniteNumber(toNumber(chargeAttribution?.total_expense_charges) ?? toNumber(lifePolicy?.charges?.expenseCharge))
          ? "visible"
          : "not_visible",
    },
    {
      type: "rider_charge",
      amount: toNumber(chargeAttribution?.total_rider_charges) ?? toNumber(lifePolicy?.charges?.riderCharge),
      visibility:
        isFiniteNumber(toNumber(chargeAttribution?.total_rider_charges) ?? toNumber(lifePolicy?.charges?.riderCharge))
          ? "visible"
          : "not_visible",
    },
    {
      type: "premium_load",
      amount: null,
      visibility: "not_visible",
    },
    {
      type: "surrender_charge",
      amount: null,
      visibility: "not_visible",
    },
  ];

  const firstStatement = sortStatements(statementRows)[0] || null;
  const latestStatement = sortStatements(statementRows).at(-1) || null;
  const firstChargeView =
    toNumber(firstStatement?.visible_charges) ??
    (() => {
      const values = [
      toNumber(firstStatement?.cost_of_insurance),
      toNumber(firstStatement?.admin_fee),
      toNumber(firstStatement?.monthly_deduction),
      toNumber(firstStatement?.expense_charge),
      toNumber(firstStatement?.rider_charge),
      ].filter(isFiniteNumber);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    })();
  const latestChargeView =
    toNumber(latestStatement?.visible_charges) ??
    (() => {
      const values = [
      toNumber(latestStatement?.cost_of_insurance),
      toNumber(latestStatement?.admin_fee),
      toNumber(latestStatement?.monthly_deduction),
      toNumber(latestStatement?.expense_charge),
      toNumber(latestStatement?.rider_charge),
      ].filter(isFiniteNumber);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    })();

  let trend = "unknown";
  if (statementRows.length >= 2 && isFiniteNumber(firstChargeView) && isFiniteNumber(latestChargeView)) {
    const change = latestChargeView - firstChargeView;
    trend = Math.abs(change) <= Math.max(firstChargeView, 1) * 0.05 ? "stable" : change > 0 ? "rising" : "mixed";
  }

  const chargeDragRatio =
    isFiniteNumber(totalVisibleCharges) && isFiniteNumber(totalPremiumPaid) && totalPremiumPaid > 0
      ? totalVisibleCharges / totalPremiumPaid
      : null;
  const chargeDragLevel =
    !isFiniteNumber(chargeDragRatio)
      ? "unknown"
      : chargeDragRatio >= 0.3
        ? "high"
        : chargeDragRatio >= 0.15
          ? "moderate"
          : "low";

  if (!isFiniteNumber(totalVisibleCharges)) {
    missingData.push("Total visible charges are incomplete.");
  }
  if (!categories.some((item) => item.visibility === "visible")) {
    missingData.push("Charge category detail is still thin.");
  }

  return {
    totalVisibleCharges,
    coiVisible: isFiniteNumber(totalVisibleCoi),
    monthlyDeductionVisible: categories.find((item) => item.type === "monthly_deduction")?.visibility === "visible",
    chargeCategories: categories,
    chargeDragLevel,
    trend,
    explanation:
      !isFiniteNumber(totalVisibleCharges)
        ? "Charge visibility is still partial, so charge drag can only be described at a high level."
        : trend === "rising"
          ? `Visible charges total ${formatCurrency(totalVisibleCharges)} and the latest statement pressure appears higher than earlier visible periods.`
          : trend === "stable"
            ? `Visible charges total ${formatCurrency(totalVisibleCharges)} and recent statement pressure appears fairly stable.`
            : `Visible charges total ${formatCurrency(totalVisibleCharges)}, but trend support is still mixed or limited.`,
    confidence:
      chargeSummary?.coi_confidence === "strong"
        ? statementRows.length >= 2
          ? "high"
          : "moderate"
        : chargeSummary?.coi_confidence === "moderate"
          ? "moderate"
          : "low",
  };
}

function buildFundingAnalysis({ lifePolicy, normalizedAnalytics, missingData }) {
  const plannedPremium = toNumber(lifePolicy?.funding?.plannedPremium);
  const minimumPremium = toNumber(lifePolicy?.funding?.minimumPremium);
  const guidelinePremium = toNumber(lifePolicy?.funding?.guidelinePremiumLimit);
  const totalPremiumPaid =
    toNumber(lifePolicy?.funding?.totalPremiumPaid) ??
    toNumber(normalizedAnalytics?.growth_attribution?.visible_total_premium_paid) ??
    null;
  const statementCount = Number(lifePolicy?.meta?.statementCount || 0);
  const observedFundingPace =
    isFiniteNumber(totalPremiumPaid) && statementCount > 0
      ? totalPremiumPaid / Math.max(statementCount, 1)
      : null;
  const baselineTarget = plannedPremium ?? minimumPremium ?? guidelinePremium ?? null;
  const fundingGapAmount =
    isFiniteNumber(observedFundingPace) && isFiniteNumber(baselineTarget)
      ? observedFundingPace - baselineTarget
      : null;

  let status = "unclear";
  if (isFiniteNumber(observedFundingPace) && isFiniteNumber(baselineTarget) && baselineTarget > 0) {
    const ratio = observedFundingPace / baselineTarget;
    if (ratio < 0.85) status = "underfunded";
    else if (ratio > 1.2) status = "aggressive";
    else status = "sufficient";
  }

  if (!isFiniteNumber(plannedPremium) && !isFiniteNumber(minimumPremium) && !isFiniteNumber(guidelinePremium)) {
    missingData.push("Planned or minimum premium support is limited.");
  }
  if (!isFiniteNumber(totalPremiumPaid)) {
    missingData.push("Total premium-paid history is incomplete.");
  }

  return {
    status,
    plannedPremium,
    totalPremiumPaid,
    observedFundingPace,
    fundingGapAmount,
    explanation:
      status === "underfunded"
        ? "Visible funding pace is running below the policy's visible premium target, which can add pressure if charges continue rising."
        : status === "aggressive"
          ? "Visible funding pace is stronger than the baseline target, which can support the policy if it is intentional and sustainable."
          : status === "sufficient"
            ? "Visible funding pace is broadly in line with the policy's visible premium target."
            : "Funding sufficiency is still unclear because premium pace and target support are incomplete.",
    confidence:
      status === "unclear"
        ? "low"
        : isFiniteNumber(plannedPremium) && isFiniteNumber(totalPremiumPaid)
          ? "high"
          : "moderate",
  };
}

function buildStrategyAnalysis({ lifePolicy, normalizedAnalytics, missingData }) {
  const strategy = lifePolicy?.typeSpecific || {};
  const _normalizedStrategy = normalizedAnalytics?.structured_debug || {};
  const menuRows = safeArray(normalizedAnalytics?.strategy_menu_rows || lifePolicy?.typeSpecific?.strategyMenuRows);
  const normalizedPolicyStrategyRows = safeArray(lifePolicy?.meta?.strategyRows);
  const candidateRows = menuRows.length ? menuRows : normalizedPolicyStrategyRows;

  const mainAllocation = toNumber(strategy?.allocationPercent);
  const fixedExposurePercent = toNumber(lifePolicy?.values?.fixedAccountValue) !== null && toNumber(lifePolicy?.values?.indexedAccountValue) !== null
    ? (toNumber(lifePolicy.values.fixedAccountValue) / (toNumber(lifePolicy.values.fixedAccountValue) + toNumber(lifePolicy.values.indexedAccountValue))) * 100
    : candidateRows.find((row) => /fixed/i.test(String(row?.strategy_name || row?.strategy || "")))?.allocation_percent ?? null;
  const indexedExposurePercent =
    isFiniteNumber(fixedExposurePercent) && fixedExposurePercent <= 100 ? 100 - fixedExposurePercent : null;

  const visibleTerms = {
    capRates: [
      ...new Set(
        [toNumber(strategy?.capRate), ...candidateRows.map((row) => toNumber(row?.cap_rate))]
          .filter(isFiniteNumber)
          .map((value) => formatPercent(value))
      ),
    ],
    participationRates: [
      ...new Set(
        [toNumber(strategy?.participationRate), ...candidateRows.map((row) => toNumber(row?.participation_rate))]
          .filter(isFiniteNumber)
          .map((value) => formatPercent(value))
      ),
    ],
    spreads: [
      ...new Set(
        [toNumber(strategy?.spread), ...candidateRows.map((row) => toNumber(row?.spread))]
          .filter(isFiniteNumber)
          .map((value) => formatPercent(value))
      ),
    ],
    multipliers: [
      ...new Set(candidateRows.map((row) => toNumber(row?.multiplier)).filter(isFiniteNumber).map((value) => formatPercent(value))),
    ],
  };

  const allocationRows = candidateRows.filter((row) => isFiniteNumber(toNumber(row?.allocation_percent)));
  const maxAllocation = Math.max(mainAllocation ?? 0, ...allocationRows.map((row) => toNumber(row.allocation_percent) || 0));
  const concentrationLevel =
    !candidateRows.length && !isFiniteNumber(mainAllocation)
      ? "unknown"
      : maxAllocation >= 80
        ? "concentrated"
        : maxAllocation >= 50
          ? "moderate"
          : "diversified";

  const strategiesVisible = Boolean(strategy?.strategy || candidateRows.length);
  const allocationsVisible = isFiniteNumber(mainAllocation) || allocationRows.length > 0;

  if (!strategiesVisible) {
    missingData.push("Indexed strategy names are incomplete.");
  }
  if (!allocationsVisible) {
    missingData.push("Strategy allocation percentages are incomplete.");
  }

  return {
    strategiesVisible,
    allocationsVisible,
    strategyCount: candidateRows.length || (strategy?.strategy ? 1 : 0),
    concentrationLevel,
    fixedExposurePercent: isFiniteNumber(fixedExposurePercent) ? Number(fixedExposurePercent.toFixed(1)) : null,
    indexedExposurePercent: isFiniteNumber(indexedExposurePercent) ? Number(indexedExposurePercent.toFixed(1)) : null,
    visibleTerms,
    explanation:
      !strategiesVisible
        ? "Strategy visibility is still limited, so allocation interpretation remains incomplete."
        : !allocationsVisible
          ? `The visible strategy points to ${strategy?.strategy || "an indexed allocation"}, but allocation percentages are not complete enough to judge concentration confidently.`
          : concentrationLevel === "concentrated"
            ? "The visible allocation looks concentrated in one primary strategy, which increases reliance on that strategy's cap, spread, or participation terms."
            : concentrationLevel === "diversified"
              ? "The visible allocation appears spread across multiple sleeves rather than concentrated in one dominant strategy."
              : "The visible allocation mix shows some concentration, but not an extreme one-strategy posture.",
    confidence:
      strategiesVisible && allocationsVisible
        ? candidateRows.length >= 2 || isFiniteNumber(mainAllocation)
          ? "high"
          : "moderate"
        : strategiesVisible
          ? "moderate"
          : "low",
  };
}

function buildRiskAnalysis({ lifePolicy, illustrationComparison, chargeAnalysis, fundingAnalysis, statementRows, missingData }) {
  const loanBalance = toNumber(lifePolicy?.loans?.loanBalance);
  const accumulationValue = toNumber(lifePolicy?.values?.accumulationValue) ?? toNumber(lifePolicy?.values?.cashValue);
  const riskFactors = [];
  let score = 10;

  if (isFiniteNumber(loanBalance) && loanBalance > 0) {
    const loanRatio =
      isFiniteNumber(accumulationValue) && accumulationValue > 0 ? loanBalance / accumulationValue : null;
    const severity = loanRatio !== null && loanRatio >= 0.35 ? "high" : "medium";
    riskFactors.push({
      type: "loan_pressure",
      severity,
      message:
        loanRatio !== null
          ? `Visible loan balance of ${formatCurrency(loanBalance)} represents about ${formatPercent(loanRatio * 100)} of visible policy value.`
          : `Visible loan balance of ${formatCurrency(loanBalance)} should be reviewed against current value and charges.`,
    });
    score += severity === "high" ? 28 : 16;
  }

  if (chargeAnalysis.chargeDragLevel === "high") {
    riskFactors.push({
      type: "charge_drag",
      severity: "high",
      message: "Visible charges look heavy relative to the visible premium support, which can increase long-term pressure.",
    });
    score += 25;
  } else if (chargeAnalysis.chargeDragLevel === "moderate") {
    riskFactors.push({
      type: "charge_drag",
      severity: "medium",
      message: "Visible charges are meaningful enough to keep reviewing over time.",
    });
    score += 14;
  }

  if (fundingAnalysis.status === "underfunded") {
    riskFactors.push({
      type: "funding",
      severity: "high",
      message: "Visible funding pace is running below the visible premium target.",
    });
    score += 24;
  } else if (fundingAnalysis.status === "unclear") {
    riskFactors.push({
      type: "funding_visibility",
      severity: "low",
      message: "Funding risk is harder to score because premium pace support is incomplete.",
    });
    score += 6;
  }

  if (illustrationComparison.status === "behind") {
    riskFactors.push({
      type: "illustration_drift",
      severity: illustrationComparison.confidence === "high" ? "high" : "medium",
      message: "Actual visible values are trailing the extracted illustration checkpoint.",
    });
    score += illustrationComparison.confidence === "high" ? 20 : 12;
  }

  if (missingData.length >= 4) {
    riskFactors.push({
      type: "data_completeness",
      severity: "medium",
      message: "Critical data gaps are limiting how confidently the policy can be scored.",
    });
    score += 10;
  }

  const lapsePressure =
    riskFactors.some((item) => item.type === "funding" && item.severity === "high") ||
    riskFactors.some((item) => item.type === "loan_pressure" && item.severity === "high")
      ? "high"
      : riskFactors.some((item) => item.type === "charge_drag" || item.type === "funding")
        ? "moderate"
        : riskFactors.length
        ? "low"
          : "unknown";

  const substantiveRiskFactors = riskFactors.filter(
    (item) => !["data_completeness", "funding_visibility"].includes(item.type)
  );

  const overallRisk =
    (
      !substantiveRiskFactors.some((item) => item.severity === "high" || item.severity === "medium") &&
      (
        missingData.length >= 2 ||
        safeArray(statementRows).length === 0 ||
        illustrationComparison?.status === "indeterminate"
      )
    )
      ? "unclear"
      : score >= 60
        ? "high"
        : score >= 30
          ? "moderate"
          : "low";

  return {
    overallRisk,
    riskScore: overallRisk === "unclear" ? null : Math.min(score, 100),
    factors: riskFactors,
    lapsePressure,
    explanation:
      overallRisk === "high"
        ? "Visible loans, charges, funding pressure, or illustration drift suggest meaningful policy stress that warrants close review."
        : overallRisk === "moderate"
          ? "The policy shows some visible pressure points, but not enough to call it acute stress from the current file alone."
          : overallRisk === "low"
            ? "No major stress signal stands out from the currently visible data."
            : "Risk remains unclear because the current file is still missing too much support to score pressure responsibly.",
    confidence:
      missingData.length >= 4
        ? "low"
        : riskFactors.some((item) => item.severity === "high")
          ? "high"
          : "moderate",
  };
}

export function buildIulV2Analytics({
  lifePolicy = null,
  normalizedAnalytics = {},
  statementRows = [],
} = {}) {
  const missingData = [];
  const chargeAnalysis = buildChargeAnalysis({
    lifePolicy,
    normalizedAnalytics,
    statementRows,
    missingData,
  });
  const fundingAnalysis = buildFundingAnalysis({
    lifePolicy,
    normalizedAnalytics,
    missingData,
  });
  const strategyAnalysis = buildStrategyAnalysis({
    lifePolicy,
    normalizedAnalytics,
    missingData,
  });
  const illustrationComparison = buildIllustrationVsActualAnalysis({
    lifePolicy,
    normalizedAnalytics,
    statementRows,
    chargeAnalysis,
    fundingAnalysis,
    missingData,
  });
  const riskAnalysis = buildRiskAnalysis({
    lifePolicy,
    illustrationComparison,
    chargeAnalysis,
    fundingAnalysis,
    statementRows,
    missingData,
  });

  const summary = {
    illustrationStatus: illustrationComparison.status,
    chargeDragLevel: chargeAnalysis.chargeDragLevel,
    fundingStatus: fundingAnalysis.status,
    overallRisk: riskAnalysis.overallRisk,
    strategyVisibility: strategyAnalysis.strategiesVisible
      ? strategyAnalysis.allocationsVisible
        ? "strong"
        : "moderate"
      : "limited",
    headline:
      riskAnalysis.overallRisk === "high"
        ? "This IUL shows visible pressure building across funding, charges, loans, or illustration drift."
        : riskAnalysis.overallRisk === "moderate"
          ? "This IUL has mixed signals and deserves focused review on funding, charges, and current value alignment."
          : riskAnalysis.overallRisk === "low"
            ? "This IUL does not show immediate visible stress from the current file."
            : "This IUL still needs more evidence before a confident stress read is possible.",
  };

  return {
    illustrationComparison,
    chargeAnalysis,
    fundingAnalysis,
    riskAnalysis,
    strategyAnalysis,
    summary,
    missingData: [...new Set(missingData)],
  };
}
