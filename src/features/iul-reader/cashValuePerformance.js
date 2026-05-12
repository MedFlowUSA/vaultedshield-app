
function formatCurrency(value) {
  const num = Number(value);
  if (!value || isNaN(num)) return null;
  return `$${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPercent(value) {
  const num = Number(value);
  if (value === null || value === undefined || isNaN(num)) return null;
  return `${(num * 100).toFixed(1)}%`;
}

const VEHICLE_REFERENCE = [
  {
    key: "iul",
    label: "IUL (This Policy)",
    isThis: true,
    returnRange: null,
    floorCeiling: "0% floor / carrier cap",
    taxGrowth: "Tax-deferred",
    taxAccess: "Tax-free loans",
    deathBenefit: "Yes — built into premium",
    downside: "Protected (0% floor)",
    liquidity: "Policy loans (may reduce DB)",
    contributionLimit: "No IRS limit (MEC rules apply)",
  },
  {
    key: "401k",
    label: "401(k) Traditional",
    isThis: false,
    returnRange: "5%–8% avg (market)",
    floorCeiling: "No floor — full drawdown risk",
    taxGrowth: "Pre-tax / deferred",
    taxAccess: "Taxable withdrawals + RMDs",
    deathBenefit: "None",
    downside: "Full market exposure",
    liquidity: "10% penalty before 59½",
    contributionLimit: "$23,500/yr (2025)",
  },
  {
    key: "roth",
    label: "Roth IRA",
    isThis: false,
    returnRange: "5%–8% avg (market)",
    floorCeiling: "No floor — full drawdown risk",
    taxGrowth: "After-tax contributions",
    taxAccess: "Tax-free (qualified)",
    deathBenefit: "None",
    downside: "Full market exposure",
    liquidity: "Contributions anytime; earnings after 59½",
    contributionLimit: "$7,000/yr (2025)",
  },
  {
    key: "whole_life",
    label: "Whole Life",
    isThis: false,
    returnRange: "3%–5% guaranteed; 4%–6% w/ dividends",
    floorCeiling: "Guaranteed minimum — no market link",
    taxGrowth: "Tax-deferred",
    taxAccess: "Tax-free loans",
    deathBenefit: "Yes — guaranteed",
    downside: "None — guaranteed cash value",
    liquidity: "Policy loans",
    contributionLimit: "Based on face amount",
  },
  {
    key: "term_invest",
    label: "Term + Invest Difference",
    isThis: false,
    returnRange: "Market-based (invested portion)",
    floorCeiling: "No floor on invested portion",
    taxGrowth: "Depends on account type",
    taxAccess: "Depends on account type",
    deathBenefit: "Term only (expires)",
    downside: "Full market exposure on investments",
    liquidity: "Investment account access",
    contributionLimit: "No limit",
  },
];

const COMPARISON_DIMENSIONS = [
  { key: "returnRange", label: "Return Range / Credited Rate" },
  { key: "floorCeiling", label: "Downside Protection" },
  { key: "taxGrowth", label: "Tax Treatment — Growth" },
  { key: "taxAccess", label: "Tax Treatment — Access" },
  { key: "deathBenefit", label: "Death Benefit" },
  { key: "liquidity", label: "Liquidity" },
  { key: "contributionLimit", label: "Contribution Limits" },
];

function buildIulReturnRange(results) {
  const strategy = results.normalizedPolicy?.strategy || {};
  const trend = results.normalizedAnalytics?.trend_summary || {};

  const creditingRate = strategy.crediting_rate?.display_value;
  const capRate = strategy.cap_rate?.display_value;
  const participationRate = strategy.participation_rate?.display_value;
  const spread = strategy.spread?.display_value;

  const terms = [
    creditingRate ? `Current credit: ${creditingRate}` : null,
    capRate ? `Cap: ${capRate}` : null,
    participationRate ? `Participation: ${participationRate}` : null,
    spread ? `Spread: ${spread}` : null,
  ].filter(Boolean);

  if (terms.length > 0) {
    const trendNote = trend?.cash_value_trend?.status && trend.cash_value_trend.status !== "limited"
      ? ` (value trend: ${trend.cash_value_trend.status})`
      : "";
    return terms.join(" · ") + trendNote;
  }

  return "0% floor + carrier cap — terms not yet visible";
}

function buildIulDownside(results) {
  const strategy = results.normalizedPolicy?.strategy || {};
  const floor = "Protected at 0% — index cannot credit negatively";
  const capNote = strategy.cap_rate?.display_value
    ? ` Cap at ${strategy.cap_rate.display_value} limits upside.`
    : " Cap limits upside (amount pending from packet).";
  return floor + capNote;
}

function buildPerformanceMetrics(results) {
  const values = results.normalizedPolicy?.values || {};
  const funding = results.normalizedPolicy?.funding || {};
  const strategy = results.normalizedPolicy?.strategy || {};
  const chargeSummary = results.normalizedAnalytics?.charge_summary || {};
  const performanceSummary = results.normalizedAnalytics?.performance_summary || {};
  const trend = results.normalizedAnalytics?.trend_summary || {};
  const statementResults = Array.isArray(results.statementResults) ? results.statementResults : [];

  // Cash value efficiency estimate (cash value / estimated total premiums)
  const cashValueRaw = parseFloat(values.cash_value?.value || values.accumulation_value?.value || 0);
  const plannedPremiumRaw = parseFloat(funding.planned_premium?.value || funding.annual_target_premium?.value || 0);
  const issueDate = results.normalizedPolicy?.policy_identity?.issue_date;
  const latestDate = performanceSummary.latest_statement_date;

  let yearsInForce = null;
  if (issueDate && latestDate) {
    const sy = new Date(issueDate).getFullYear();
    const ey = new Date(latestDate).getFullYear();
    if (!isNaN(sy) && !isNaN(ey) && ey > sy) yearsInForce = ey - sy;
  }

  const estimatedTotalPremiums = plannedPremiumRaw > 0 && yearsInForce ? plannedPremiumRaw * yearsInForce : null;
  const efficiencyRatio = cashValueRaw > 0 && estimatedTotalPremiums ? cashValueRaw / estimatedTotalPremiums : null;

  // Charge drag
  const chargeDragRatio = chargeSummary.charge_drag_ratio;
  const chargeDragNum = chargeDragRatio !== null && chargeDragRatio !== undefined ? Number(chargeDragRatio) : null;
  const totalCoi = chargeSummary.total_coi;

  // Strategy terms
  const capRate = strategy.cap_rate?.display_value;
  const participationRate = strategy.participation_rate?.display_value;
  const spread = strategy.spread?.display_value;
  const creditingRate = strategy.crediting_rate?.display_value;
  const indexStrategy = strategy.current_index_strategy;
  const allocation = strategy.allocation_percent?.display_value;

  // Trend
  const trendStatus = trend?.cash_value_trend?.status;
  const trendNote = trend?.cash_value_trend?.note;
  const periodsCount = trend?.periods_count || 0;

  const metrics = [];

  metrics.push({
    label: "Value Direction",
    value: trendStatus === "increase" ? "Growing" : trendStatus === "flat" ? "Flat" : trendStatus === "decrease" ? "Declining" : "Developing",
    note: trendNote || (periodsCount < 2 ? "Upload multiple annual statements to see year-over-year trend." : "Derived from visible statement history."),
    status: trendStatus === "increase" ? "good" : trendStatus === "flat" ? "watch" : trendStatus === "decrease" ? "risk" : "limited",
  });

  if (efficiencyRatio !== null) {
    metrics.push({
      label: "Cash Value Efficiency",
      value: `${Math.round(efficiencyRatio * 100)}%`,
      note: `Roughly ${Math.round(efficiencyRatio * 100)}% of estimated premiums preserved as accessible cash value after charges. Industry range for a well-funded IUL is typically 80–100%+ in later years.`,
      status: efficiencyRatio >= 0.85 ? "good" : efficiencyRatio >= 0.65 ? "watch" : "risk",
    });
  }

  if (chargeDragNum !== null && !isNaN(chargeDragNum)) {
    metrics.push({
      label: "Charge Drag Ratio",
      value: `${(chargeDragNum * 100).toFixed(1)}% of premium`,
      note: chargeDragNum <= 0.15
        ? "Visible charges look moderate relative to visible funding — consistent with a reasonably efficient IUL."
        : chargeDragNum <= 0.30
          ? "Visible charges are meaningful and deserve annual review alongside crediting performance."
          : "Visible charges are heavy relative to funding — a material headwind to net cash value growth.",
      status: chargeDragNum <= 0.15 ? "good" : chargeDragNum <= 0.30 ? "watch" : "risk",
    });
  }

  if (totalCoi !== null && totalCoi !== undefined) {
    metrics.push({
      label: "Visible Cost of Insurance",
      value: formatCurrency(totalCoi) || "Limited",
      note: `COI is the largest recurring internal cost in most IULs. It rises with age and increasing death benefit. COI confidence: ${chargeSummary.coi_confidence || "developing"}.`,
      status: chargeSummary.coi_confidence === "strong" ? "confirmed" : chargeSummary.coi_confidence === "moderate" ? "review" : "missing",
    });
  }

  if (creditingRate || capRate || participationRate) {
    metrics.push({
      label: "Indexed Crediting Terms",
      value: [creditingRate ? `Credited: ${creditingRate}` : null, capRate ? `Cap: ${capRate}` : null, participationRate ? `PR: ${participationRate}` : null, spread ? `Spread: ${spread}` : null].filter(Boolean).join(" / "),
      note: "Cap limits maximum index credit per segment. Participation rate scales the credit. Spread is subtracted before crediting. A higher cap or PR, lower spread = better potential return.",
      status: "confirmed",
    });
  }

  if (indexStrategy || allocation) {
    metrics.push({
      label: "Strategy Allocation",
      value: [indexStrategy, allocation ? `${allocation} allocated` : null].filter(Boolean).join(" — ") || "Limited",
      note: "Indexed allocation shows how much of the account is participating in index-linked crediting vs fixed account. Higher indexed exposure = more upside potential and more dependency on cap/PR terms.",
      status: indexStrategy ? "confirmed" : "limited",
    });
  }

  if (performanceSummary.net_policy_growth) {
    metrics.push({
      label: "Net Visible Growth",
      value: performanceSummary.net_policy_growth,
      note: "Dollar amount the policy has grown net of visible deductions in the current packet period.",
      status: "confirmed",
    });
  }

  if (estimatedTotalPremiums) {
    metrics.push({
      label: "Est. Total Premiums In",
      value: formatCurrency(estimatedTotalPremiums) || "Developing",
      note: `Based on ${formatCurrency(plannedPremiumRaw)}/yr × ${yearsInForce} year${yearsInForce === 1 ? "" : "s"} in force. Actual payments may differ from planned premium.`,
      status: "review",
    });
  }

  return metrics;
}

function buildStatementTimeline(results) {
  const statementResults = Array.isArray(results.statementResults) ? results.statementResults : [];
  return statementResults
    .filter((s) => s?.summary?.statementDate)
    .map((s) => ({
      date: s.summary.statementDate,
      cashValue: s.summary.cashValue || s.summary.accumulationValue || null,
      surrenderValue: s.summary.cashSurrenderValue || null,
      loanBalance: s.summary.loanBalance || null,
      creditingRate: s.summary.creditingRate || s.summary.crediting_rate || null,
      capRate: s.summary.capRate || s.summary.cap_rate || null,
      coi: s.summary.costOfInsurance || null,
    }));
}

export function buildCashValuePerformanceModel(results) {
  if (!results) return null;

  const statementResults = Array.isArray(results.statementResults) ? results.statementResults : [];
  const metrics = buildPerformanceMetrics(results);
  const timeline = buildStatementTimeline(results);
  const iulReturnRange = buildIulReturnRange(results);
  const iulDownside = buildIulDownside(results);

  const vehicles = VEHICLE_REFERENCE.map((v) => ({
    ...v,
    returnRange: v.isThis ? iulReturnRange : v.returnRange,
    downside: v.isThis ? iulDownside : v.downside,
  }));

  const strategy = results.normalizedPolicy?.strategy || {};
  const chargeSummary = results.normalizedAnalytics?.charge_summary || {};
  const trend = results.normalizedAnalytics?.trend_summary || {};

  const summaryHeadline = (() => {
    const trendStatus = trend?.cash_value_trend?.status;
    const dragRatio = Number(chargeSummary.charge_drag_ratio || 0);
    if (trendStatus === "increase" && dragRatio <= 0.20) return "Cash value appears to be growing with manageable charge drag from the visible packet.";
    if (trendStatus === "decrease" || dragRatio > 0.30) return "Cash value direction or charge drag needs closer review from the visible packet.";
    if (statementResults.length === 0) return "Upload annual statements to unlock the live performance reading for this policy.";
    return "Cash value performance is developing — more statement history will sharpen the read.";
  })();

  const hasTerms = Boolean(strategy.cap_rate?.display_value || strategy.participation_rate?.display_value || strategy.crediting_rate?.display_value);

  return {
    hasData: statementResults.length > 0 || hasTerms,
    summaryHeadline,
    metrics: metrics.filter((m) => m.value !== "Developing" && m.value !== "Limited"),
    timeline,
    vehicles,
    vehicleDimensions: COMPARISON_DIMENSIONS,
    statementCount: statementResults.length,
    hasTerms,
  };
}
