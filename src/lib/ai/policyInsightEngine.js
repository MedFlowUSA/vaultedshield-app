function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildInsight(type, message, severity) {
  return { type, severity, message };
}

function countBySeverity(insights = []) {
  return insights.reduce(
    (totals, item) => {
      totals[item.severity] += 1;
      return totals;
    },
    { high: 0, medium: 0, low: 0 }
  );
}

export function buildPolicyInsightSummary({
  lifePolicy = null,
  normalizedAnalytics = {},
  statementRows = [],
  comparisonSummary = null,
  interpretation = null,
} = {}) {
  const policyType = lifePolicy?.meta?.policyType || "unknown";
  const values = lifePolicy?.values || {};
  const charges = lifePolicy?.charges || {};
  const loans = lifePolicy?.loans || {};
  const growthAttribution = normalizedAnalytics?.growth_attribution || {};
  const illustrationComparison = normalizedAnalytics?.illustration_comparison || {};
  const chargeSummary = normalizedAnalytics?.charge_summary || {};
  const safeComparison = comparisonSummary || normalizedAnalytics?.comparison_summary || {};

  const insights = [];
  const missingData = [];

  if (!safeComparison?.latest_statement_date) {
    missingData.push("Latest statement date is missing.");
  }
  if ((safeComparison?.missing_fields || []).length >= 4) {
    missingData.push("Several core policy fields are still missing.");
  }
  if (statementRows.length < 2) {
    missingData.push("Statement history is thin.");
  }
  if (safeComparison?.charge_visibility_status === "limited") {
    missingData.push("Charge visibility is limited.");
  }

  if (policyType === "iul" || policyType === "ul") {
    if (illustrationComparison?.comparison_possible && illustrationComparison?.status === "behind") {
      insights.push(buildInsight("performance", illustrationComparison.narrative, "high"));
    } else if (growthAttribution?.efficiency_status === "growth_pressured") {
      insights.push(
        buildInsight(
          "performance",
          "Visible growth is lagging the funding support currently visible in the file.",
          "high"
        )
      );
    }

    if (chargeSummary?.total_coi !== null) {
      insights.push(
        buildInsight(
          "charges",
          `Visible cost of insurance is ${formatCurrency(chargeSummary.total_coi)}.`,
          safeComparison?.coi_confidence === "weak" ? "medium" : "low"
        )
      );
    }

    if (loans?.loanBalance) {
      insights.push(
        buildInsight("loans", `Visible loan balance is ${loans.loanBalance}.`, "medium")
      );
    }

    if (!lifePolicy?.typeSpecific?.strategy) {
      missingData.push("Indexed strategy detail is incomplete.");
    }
  }

  if (policyType === "whole_life") {
    if (!lifePolicy?.typeSpecific?.dividendOption) {
      missingData.push("Dividend option is not clearly visible.");
    }
    insights.push(
      buildInsight(
        "whole_life",
        values?.cashValue
          ? `Visible cash value is ${values.cashValue}, which is the core behavior to monitor in a whole life policy.`
          : "Whole life cash-value visibility is still limited.",
        values?.cashValue ? "low" : "medium"
      )
    );
  }

  if (policyType === "vul") {
    insights.push(
      buildInsight(
        "vul",
        values?.accumulationValue || values?.cashValue
          ? `Visible account value is ${values?.accumulationValue || values?.cashValue}, so the core review path is market exposure, allocation visibility, and whether charges or loans are creating avoidable pressure.`
          : "Variable-life account-value visibility is still limited.",
        values?.accumulationValue || values?.cashValue ? "low" : "medium"
      )
    );

    if (charges?.costOfInsurance) {
      insights.push(
        buildInsight(
          "charges",
          `Visible cost of insurance is ${charges.costOfInsurance}.`,
          safeComparison?.coi_confidence === "weak" ? "medium" : "low"
        )
      );
    }

    if (loans?.loanBalance) {
      insights.push(
        buildInsight("loans", `Visible loan balance is ${loans.loanBalance}.`, "medium")
      );
    }

    if (!lifePolicy?.typeSpecific?.allocationDetailVisible) {
      missingData.push("Allocation or subaccount detail is limited.");
    }
  }

  if (policyType === "term") {
    insights.push(
      buildInsight(
        "term",
        lifePolicy?.typeSpecific?.termEndDate
          ? `Coverage appears to run until ${lifePolicy.typeSpecific.termEndDate}.`
          : "Term end visibility is incomplete.",
        lifePolicy?.typeSpecific?.termEndDate ? "low" : "high"
      )
    );
    if (!lifePolicy?.typeSpecific?.conversionOption) {
      missingData.push("Conversion visibility is limited.");
    }
  }

  if (policyType === "final_expense") {
    insights.push(
      buildInsight(
        "final_expense",
        lifePolicy?.typeSpecific?.gradedBenefit || lifePolicy?.typeSpecific?.waitingPeriod
          ? "Benefit structure may include graded or waiting-period behavior that should be reviewed."
          : "Final expense benefit structure is only partially visible.",
        lifePolicy?.typeSpecific?.gradedBenefit || lifePolicy?.typeSpecific?.waitingPeriod ? "medium" : "low"
      )
    );
  }

  const severity = countBySeverity(insights);
  const status =
    missingData.length >= 3 && insights.length === 0
      ? "insufficient_data"
      : severity.high >= 2
        ? "weak"
        : severity.high >= 1 || severity.medium >= 2
          ? "moderate"
          : insights.length > 0
            ? "strong"
            : "insufficient_data";

  const summary =
    interpretation?.bottom_line_summary ||
    (status === "weak"
      ? "This policy is showing below-expectation signals and should be reviewed closely."
      : status === "moderate"
        ? "This policy has mixed signals and needs targeted review."
        : status === "strong"
          ? "This policy currently shows stable visible support from the data on file."
          : "This policy still needs more evidence before a confident read is possible.");

  return {
    summary,
    status,
    insights,
    missingData,
  };
}
