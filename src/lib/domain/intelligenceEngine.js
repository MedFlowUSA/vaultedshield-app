import { createEmptyNormalizedAnalytics } from "./analyticsSchema.js";
import { resolveCarrierProfile } from "./carriers.js";
import { createEmptyNormalizedPolicy } from "./policySchema.js";
import { resolveProductProfile } from "./products.js";
import { buildStrategyReferenceHits } from "./strategies.js";
import {
  getBestValue,
  getStructuredExtractionSummary,
  getStructuredFlags,
  getStructuredQuality,
  getStructuredStrategyRows,
  getStructuredTableRows,
  hasStrongStructuredSupport,
} from "../intelligence/structuredAccess.js";
import {
  analyzePolicyBasics,
  buildProtectionComparisonNarrative,
  detectInsuranceGaps,
} from "./insurance/insuranceIntelligence.js";

function hasValue(field) {
  return Boolean(field && !field.missing && field.display_value && field.display_value !== "Not found");
}

function hasTrustedValue(field, minimum = "medium") {
  const rank = { low: 0, medium: 1, high: 2 };
  return hasValue(field) && rank[field.confidence] >= rank[minimum];
}

function fieldDisplay(field) {
  return hasValue(field) ? field.display_value : "";
}

function fieldValue(field) {
  return hasValue(field) ? field.value : null;
}

function buildStructuredField(value, type = "text") {
  if (value === null || value === undefined || value === "") return null;
  return {
    value,
    display_value:
      type === "currency" && typeof value === "number"
        ? formatCurrency(value)
        : type === "percent" && typeof value === "number"
          ? `${value}%`
          : String(value),
    confidence: "high",
    missing: false,
  };
}

function getLatestStructuredStrategyRows(statement = null) {
  const rows = getStructuredStrategyRows(statement);
  const quality = getStructuredQuality(statement)?.strategy || null;
  const activeRows = rows.filter((row) => row?.active || row?.row_kind === "active");
  const observedRows = rows.filter((row) => !row?.menu_only && row?.row_kind !== "menu");
  const menuRows = rows.filter((row) => row?.menu_only || row?.row_kind === "menu");

  return {
    rows,
    activeRows,
    observedRows,
    menuRows,
    quality,
    usedFallback: !rows.length,
  };
}

function getLatestStructuredChargeRows(statement = null) {
  return getStructuredTableRows(statement, "charges_table");
}

function buildStrategyConfidenceTier(structuredStrategyInfo, latestStatement) {
  if (structuredStrategyInfo.activeRows.length > 0 && ["strong", "moderate"].includes(structuredStrategyInfo.quality)) {
    return "strong";
  }
  if (structuredStrategyInfo.observedRows.length > 0 || structuredStrategyInfo.rows.length > 0) {
    return "moderate";
  }
  if (latestStatement?.fields?.index_strategy && !latestStatement.fields.index_strategy.missing) {
    return "weak";
  }
  return "weak";
}

function buildStrategyVisibilityStatus(structuredStrategyInfo, strategy = {}) {
  if (structuredStrategyInfo.activeRows.length > 0 && structuredStrategyInfo.menuRows.length > 0) return "strong";
  if (structuredStrategyInfo.activeRows.length > 0 || structuredStrategyInfo.observedRows.length > 1) return "strong";
  if (structuredStrategyInfo.rows.length > 0 && ["strong", "moderate"].includes(structuredStrategyInfo.quality)) return "moderate";
  if (strategy.current_index_strategy && strategy.current_index_strategy !== "Not found") {
    return strategy.available_strategy_menu ? "moderate" : "basic";
  }
  return "limited";
}

function selectPreferredDeathBenefitField(baseline, latestStatement) {
  return (
    latestStatement?.fields?.death_benefit ||
    baseline?.fields?.death_benefit ||
    baseline?.fields?.initial_face_amount ||
    latestStatement?.fields?.minimum_death_benefit ||
    null
  );
}

function sortStatementsChronologically(statements) {
  return [...statements].sort((a, b) => {
    const aDate = a?.fields?.statement_date?.value || "";
    const bDate = b?.fields?.statement_date?.value || "";
    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate > bDate ? 1 : -1;
  });
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercentRatio(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return `${(value * 100).toFixed(1)}%`;
}

function parseDisplayNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getStatementValue(statement, key) {
  return parseDisplayNumber(statement?.[key]);
}

function getStatementVisibleCharges(statement) {
  const values = [
    getStatementValue(statement, "cost_of_insurance"),
    getStatementValue(statement, "admin_fee"),
    getStatementValue(statement, "expense_charge"),
    getStatementValue(statement, "rider_charge"),
    getStatementValue(statement, "monthly_deduction"),
  ].filter((value) => value !== null);

  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function getStatementDetailQuality(statement) {
  const visibleCount = [
    getStatementValue(statement, "cash_value"),
    getStatementValue(statement, "cash_surrender_value"),
    getStatementValue(statement, "loan_balance"),
    getStatementValue(statement, "cost_of_insurance"),
    getStatementVisibleCharges(statement),
  ].filter((value) => value !== null).length;

  if (visibleCount >= 4) return "Strong detail";
  if (visibleCount >= 2) return "Partial detail";
  return "Limited detail";
}

function summarizeTrendChange(oldest, newest, label, { increase, decrease, flat, missing }) {
  if (oldest === null || newest === null) {
    return { status: "limited", note: missing };
  }

  const delta = newest - oldest;
  if (Math.abs(delta) < 0.005) {
    return { status: "flat", delta, note: flat };
  }

  return delta > 0
    ? { status: "increase", delta, note: increase }
    : { status: "decrease", delta, note: decrease || `${label} decreased over the visible statement period.` };
}

function parseStatementDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getChronologyDiagnostics(rows = []) {
  const datedRows = rows
    .map((row) => ({
      raw: row?.statement_date || null,
      parsed: parseStatementDateValue(row?.statement_date),
    }))
    .filter((entry) => entry.raw);

  const validDates = datedRows.filter((entry) => entry.parsed);
  const duplicateDateCount =
    validDates.length - new Set(validDates.map((entry) => entry.parsed.toISOString().slice(0, 10))).size;

  let widestGapDays = null;
  let irregularGapCount = 0;
  for (let index = 1; index < validDates.length; index += 1) {
    const current = validDates[index].parsed;
    const prior = validDates[index - 1].parsed;
    const gapDays = Math.round((current.getTime() - prior.getTime()) / 86400000);
    if (widestGapDays === null || gapDays > widestGapDays) widestGapDays = gapDays;
    if (gapDays > 430) irregularGapCount += 1;
  }

  const chronologyStatus =
    validDates.length < 2
      ? "limited"
      : duplicateDateCount > 0 || irregularGapCount > 0
        ? "mixed"
        : "aligned";

  const notes = [];
  if (validDates.length < 2) {
    notes.push("Chronology support is limited because fewer than two dated statements are visible.");
  } else if (duplicateDateCount > 0) {
    notes.push("At least one duplicate statement date appears in the visible history.");
  } else if (irregularGapCount > 0) {
    notes.push("Visible statement spacing is irregular, so annual continuity may be incomplete.");
  } else {
    notes.push("Visible statement dates form a reasonably clean annual chronology.");
  }

  return {
    chronology_status: chronologyStatus,
    duplicate_date_count: duplicateDateCount,
    widest_gap_days: widestGapDays,
    irregular_gap_count: irregularGapCount,
    notes,
  };
}

export function buildPolicyTrendSummary(statementRows = []) {
  const rows = [...(Array.isArray(statementRows) ? statementRows : [])].sort((left, right) => {
    const leftDate = left?.statement_date || "";
    const rightDate = right?.statement_date || "";
    return leftDate.localeCompare(rightDate);
  });

  const timelineRows = rows.map((statement) => ({
    ...statement,
    visible_charges: getStatementVisibleCharges(statement),
    detail_quality: getStatementDetailQuality(statement),
  }));

  const oldest = timelineRows[0] || null;
  const newest = timelineRows.at(-1) || null;
  const periodsCount = timelineRows.length;
  const qualitySet = new Set(timelineRows.map((statement) => statement.detail_quality));
  const omittedTrendFields = [];
  const chronology = getChronologyDiagnostics(timelineRows);

  const cashValueTrend = summarizeTrendChange(
    getStatementValue(oldest, "cash_value"),
    getStatementValue(newest, "cash_value"),
    "Cash value",
    {
      increase: "Cash value increased across the visible review period.",
      decrease: "Cash value decreased across the visible review period.",
      flat: "Cash value remained relatively stable across the visible review period.",
      missing: "Cash value trend is limited because one or more statement values are missing.",
    }
  );

  const cashSurrenderValueTrend = summarizeTrendChange(
    getStatementValue(oldest, "cash_surrender_value"),
    getStatementValue(newest, "cash_surrender_value"),
    "Cash surrender value",
    {
      increase: "Cash surrender value increased across visible statements.",
      decrease: "Cash surrender value decreased across visible statements.",
      flat: "Cash surrender value remained relatively stable across visible statements.",
      missing: "Cash surrender value trend is limited because statement support is incomplete.",
    }
  );

  const loanBalanceTrend = summarizeTrendChange(
    getStatementValue(oldest, "loan_balance"),
    getStatementValue(newest, "loan_balance"),
    "Loan balance",
    {
      increase: "Loan balance increased over the visible statement period.",
      decrease: "Loan balance decreased over the visible statement period.",
      flat:
        getStatementValue(oldest, "loan_balance") === 0 && getStatementValue(newest, "loan_balance") === 0
          ? "Loan balance remained at zero across visible statements."
          : "Loan balance remained relatively stable across visible statements.",
      missing: "Loan balance trend is limited because statement support is incomplete.",
    }
  );

  const totalCoiTrend = summarizeTrendChange(
    getStatementValue(oldest, "cost_of_insurance"),
    getStatementValue(newest, "cost_of_insurance"),
    "COI",
    {
      increase: "Visible COI increased across the reviewed statements.",
      decrease: "Visible COI decreased across the reviewed statements.",
      flat: "Visible COI remained relatively stable across the reviewed statements.",
      missing: "COI trend is limited because direct statement COI values are incomplete.",
    }
  );

  const visibleChargeTrend = summarizeTrendChange(
    oldest?.visible_charges ?? null,
    newest?.visible_charges ?? null,
    "Visible charges",
    {
      increase: "Visible charges increased across the reviewed statements.",
      decrease: "Visible charges decreased across the reviewed statements.",
      flat: "Visible charges remained relatively stable across the reviewed statements.",
      missing: "Visible charge trend is limited because statement-level charge detail is incomplete.",
    }
  );

  if (cashValueTrend.status === "limited") omittedTrendFields.push("cash_value");
  if (cashSurrenderValueTrend.status === "limited") omittedTrendFields.push("cash_surrender_value");
  if (loanBalanceTrend.status === "limited") omittedTrendFields.push("loan_balance");
  if (totalCoiTrend.status === "limited") omittedTrendFields.push("cost_of_insurance");
  if (visibleChargeTrend.status === "limited") omittedTrendFields.push("visible_charges");

  const reviewFlags = [];
  if (periodsCount < 2) reviewFlags.push("single_statement_period");
  if (qualitySet.has("Limited detail")) reviewFlags.push("inconsistent_statement_support");
  if (totalCoiTrend.status === "increase") reviewFlags.push("coi_increased");
  if (visibleChargeTrend.status === "increase") reviewFlags.push("visible_charges_increased");
  if (loanBalanceTrend.status === "increase") reviewFlags.push("loan_balance_increased");
  if (loanBalanceTrend.status === "flat" && getStatementValue(newest, "loan_balance") === 0) {
    reviewFlags.push("loan_balance_remained_zero");
  }
  if (chronology.duplicate_date_count > 0) reviewFlags.push("duplicate_statement_dates");
  if (chronology.irregular_gap_count > 0) reviewFlags.push("irregular_statement_gaps");

  const factualBullets = [
    cashValueTrend.note,
    cashSurrenderValueTrend.note,
    loanBalanceTrend.note,
    totalCoiTrend.note,
    visibleChargeTrend.note,
    qualitySet.size > 1
      ? "Statement detail quality varies across the visible history."
      : qualitySet.has("Strong detail")
        ? "Statement support stays strong across the visible history."
        : qualitySet.has("Partial detail")
          ? "Statement support is partial across the visible history."
          : periodsCount > 0
            ? "Statement support remains limited across the visible history."
            : "",
    chronology.notes[0] || "",
  ].filter(Boolean);

  const conciseChangeNotes = [...new Set(factualBullets)].slice(0, 5);

  let summary = "Not enough statement history is available yet for a trend review.";
  if (periodsCount >= 2) {
    summary = conciseChangeNotes.slice(0, 2).join(" ");
  } else if (periodsCount === 1) {
    summary = "Only one visible statement period is available, so trend comparisons remain limited.";
  }

  const continuityTrend =
    periodsCount < 2
      ? "limited"
      : chronology.chronology_status === "mixed"
        ? "mixed"
      : qualitySet.has("Limited detail")
        ? "mixed"
        : qualitySet.has("Partial detail")
          ? "moderate"
          : "strong";

  return {
    periods_count: periodsCount,
    oldest_statement_date: oldest?.statement_date || null,
    newest_statement_date: newest?.statement_date || null,
    cash_value_trend: cashValueTrend,
    cash_surrender_value_trend: cashSurrenderValueTrend,
    loan_balance_trend: loanBalanceTrend,
    total_coi_trend: totalCoiTrend,
    visible_charge_trend: visibleChargeTrend,
    continuity_trend: continuityTrend,
    chronology,
    review_flags: [...new Set(reviewFlags)],
    concise_change_notes: conciseChangeNotes,
    summary,
    timeline_rows: timelineRows,
    debug: {
      trend_inputs: timelineRows.map((statement) => ({
        statement_date: statement.statement_date || null,
        cash_value: getStatementValue(statement, "cash_value"),
        cash_surrender_value: getStatementValue(statement, "cash_surrender_value"),
        loan_balance: getStatementValue(statement, "loan_balance"),
        cost_of_insurance: getStatementValue(statement, "cost_of_insurance"),
        visible_charges: statement.visible_charges ?? null,
        detail_quality: statement.detail_quality,
      })),
      detected_changes: {
        cash_value_trend: cashValueTrend,
        cash_surrender_value_trend: cashSurrenderValueTrend,
        loan_balance_trend: loanBalanceTrend,
        total_coi_trend: totalCoiTrend,
        visible_charge_trend: visibleChargeTrend,
        continuity_trend: continuityTrend,
        chronology,
      },
      omitted_trend_fields: omittedTrendFields,
    },
  };
}

export function buildPolicyTrendDeltaComparison(baseStatementRows = [], compareStatementRows = []) {
  const baseTrend = buildPolicyTrendSummary(baseStatementRows);
  const compareTrend = buildPolicyTrendSummary(compareStatementRows);

  function compareTrendStatus(baseValue, compareValue, label, betterDirection = "higher") {
    const baseDelta = baseValue?.delta ?? null;
    const compareDelta = compareValue?.delta ?? null;
    if (baseDelta === null || compareDelta === null) {
      return {
        stronger_policy: "limited",
        summary: `${label} trend comparison is limited because one file does not have enough visible support.`,
      };
    }

    if (betterDirection === "lower") {
      if (compareDelta < baseDelta) {
        return {
          stronger_policy: "comparison",
          summary: `${label} is moving more favorably in the comparison policy.`,
        };
      }
      if (compareDelta > baseDelta) {
        return {
          stronger_policy: "current",
          summary: `${label} is moving more favorably in the current policy.`,
        };
      }
    } else {
      if (compareDelta > baseDelta) {
        return {
          stronger_policy: "comparison",
          summary: `${label} is moving more favorably in the comparison policy.`,
        };
      }
      if (compareDelta < baseDelta) {
        return {
          stronger_policy: "current",
          summary: `${label} is moving more favorably in the current policy.`,
        };
      }
    }

    return {
      stronger_policy: "even",
      summary: `${label} is moving at a similar pace across both policies.`,
    };
  }

  const items = [
    {
      id: "cash_value",
      label: "Cash Value Trend",
      ...compareTrendStatus(baseTrend.cash_value_trend, compareTrend.cash_value_trend, "Cash value", "higher"),
    },
    {
      id: "cash_surrender_value",
      label: "Surrender Value Trend",
      ...compareTrendStatus(
        baseTrend.cash_surrender_value_trend,
        compareTrend.cash_surrender_value_trend,
        "Cash surrender value",
        "higher"
      ),
    },
    {
      id: "coi",
      label: "COI Trend",
      ...compareTrendStatus(baseTrend.total_coi_trend, compareTrend.total_coi_trend, "COI", "lower"),
    },
    {
      id: "visible_charges",
      label: "Visible Charge Trend",
      ...compareTrendStatus(baseTrend.visible_charge_trend, compareTrend.visible_charge_trend, "Visible charges", "lower"),
    },
    {
      id: "statement_support",
      label: "Statement Support",
      stronger_policy:
        compareTrend.periods_count > baseTrend.periods_count
          ? "comparison"
          : compareTrend.periods_count < baseTrend.periods_count
            ? "current"
            : compareTrend.continuity_trend === baseTrend.continuity_trend
              ? "even"
              : compareTrend.continuity_trend === "strong"
                ? "comparison"
                : baseTrend.continuity_trend === "strong"
                  ? "current"
                  : "limited",
      summary:
        compareTrend.periods_count > baseTrend.periods_count
          ? "The comparison policy has a longer visible statement history."
          : compareTrend.periods_count < baseTrend.periods_count
            ? "The current policy has a longer visible statement history."
            : "Visible statement history is similar across both policies.",
    },
  ];

  const comparisonLeads = items.filter((item) => item.stronger_policy === "comparison");
  const currentLeads = items.filter((item) => item.stronger_policy === "current");
  const summary =
    comparisonLeads.length > 0
      ? `Over time, the comparison policy is trending better in ${joinReadableList(comparisonLeads.map((item) => item.label.toLowerCase()))}.`
      : currentLeads.length > 0
        ? `Over time, the current policy is trending better in ${joinReadableList(currentLeads.map((item) => item.label.toLowerCase()))}.`
        : "Trend comparisons are broadly similar, or the visible history is still too limited for a stronger call.";

  return {
    summary,
    current_policy_periods: baseTrend.periods_count,
    comparison_policy_periods: compareTrend.periods_count,
    items,
    current_trend: baseTrend,
    comparison_trend: compareTrend,
  };
}

function continuityStatusFromScore(score) {
  if (score >= 85) return "Strong";
  if (score >= 65) return "Moderate";
  if (score >= 40) return "Weak";
  return "At Risk";
}

export function buildPolicyContinuityScore(
  policyComparisonSummary = {},
  chargeSummary = {},
  missingFields = []
) {
  const safeMissingFields = Array.isArray(missingFields) ? missingFields : [];
  const hasLatestStatement = Boolean(policyComparisonSummary?.latest_statement_date);
  const coiConfidence =
    policyComparisonSummary?.coi_confidence ||
    policyComparisonSummary?.comparison_debug?.coi_confidence ||
    chargeSummary?.coi_confidence ||
    "weak";
  const chargeVisibility =
    policyComparisonSummary?.charge_visibility_status ||
    policyComparisonSummary?.comparison_debug?.charge_visibility_status ||
    chargeSummary?.charge_visibility_status ||
    "limited";
  const strategyVisibility =
    policyComparisonSummary?.strategy_visibility_status ||
    policyComparisonSummary?.strategy_visibility ||
    "limited";
  const completenessStatus = policyComparisonSummary?.data_completeness_status || "basic";
  const totalCoiVisible =
    parseDisplayNumber(policyComparisonSummary?.total_coi) !== null ||
    chargeSummary?.total_coi !== null;
  const totalVisibleChargesVisible =
    parseDisplayNumber(policyComparisonSummary?.total_visible_policy_charges) !== null ||
    parseDisplayNumber(policyComparisonSummary?.total_visible_charges) !== null ||
    chargeSummary?.total_visible_policy_charges !== null;
  const criticalMissingFields = safeMissingFields.filter((field) =>
    [
      "accumulation_value",
      "cash_value",
      "cash_surrender_value",
      "death_benefit",
      "loan_balance",
      "latest_statement_date",
    ].includes(field)
  );

  const inputs = {
    missing_fields_count: safeMissingFields.length,
    missing_fields: safeMissingFields,
    critical_missing_fields: criticalMissingFields,
    latest_statement_present: hasLatestStatement,
    coi_confidence: coiConfidence,
    charge_visibility_status: chargeVisibility,
    strategy_visibility_status: strategyVisibility,
    data_completeness_status: completenessStatus,
    total_coi_visible: totalCoiVisible,
    total_visible_policy_charges_visible: totalVisibleChargesVisible,
  };

  const penalties = [];
  let score = 100;

  const applyPenalty = (reason, value) => {
    if (!value) return;
    penalties.push({ reason, value });
    score -= value;
  };

  applyPenalty("Missing latest statement date", hasLatestStatement ? 0 : 20);
  applyPenalty(
    coiConfidence === "weak"
      ? "Weak COI confidence"
      : coiConfidence === "moderate"
        ? "Moderate COI confidence"
        : "",
    coiConfidence === "weak" ? 18 : coiConfidence === "moderate" ? 6 : 0
  );
  applyPenalty(
    chargeVisibility === "limited"
      ? "Limited charge visibility"
      : chargeVisibility === "basic"
        ? "Basic charge visibility"
        : chargeVisibility === "moderate"
          ? "Moderate charge visibility"
          : "",
    chargeVisibility === "limited" ? 16 : chargeVisibility === "basic" ? 10 : chargeVisibility === "moderate" ? 4 : 0
  );
  applyPenalty(
    strategyVisibility === "limited"
      ? "Limited strategy visibility"
      : strategyVisibility === "basic"
        ? "Basic strategy visibility"
        : strategyVisibility === "moderate"
          ? "Moderate strategy visibility"
          : "",
    strategyVisibility === "limited" ? 12 : strategyVisibility === "basic" ? 8 : strategyVisibility === "moderate" ? 4 : 0
  );
  applyPenalty(
    completenessStatus === "basic"
      ? "Basic data completeness"
      : completenessStatus === "limited"
        ? "Limited data completeness"
        : completenessStatus === "moderate"
          ? "Moderate data completeness"
          : "",
    completenessStatus === "basic" ? 14 : completenessStatus === "limited" ? 18 : completenessStatus === "moderate" ? 4 : 0
  );
  applyPenalty("Missing key policy fields", Math.min(24, safeMissingFields.length * 4));
  applyPenalty("Critical policy fields are missing", Math.min(12, criticalMissingFields.length * 3));
  applyPenalty("Total COI not visible", totalCoiVisible ? 0 : 10);
  applyPenalty("Total visible charges not visible", totalVisibleChargesVisible ? 0 : 8);

  score = Math.max(0, Math.min(100, score));
  const status = continuityStatusFromScore(score);

  const sortedPenalties = [...penalties].sort((left, right) => right.value - left.value);
  let explanation = "Strong statement support and charge visibility.";
  if (sortedPenalties.length > 0) {
    const topReasons = sortedPenalties.slice(0, 2).map((item) => item.reason.toLowerCase());
    explanation = `${topReasons.join(" and ")} reduce continuity strength.`;
    explanation = explanation.charAt(0).toUpperCase() + explanation.slice(1);
  }
  if (status === "At Risk" && sortedPenalties.length > 0) {
    const topReasons = sortedPenalties.slice(0, 2).map((item) => item.reason.toLowerCase());
    explanation = `${topReasons.join(" and ")} keep this policy at risk.`;
    explanation = explanation.charAt(0).toUpperCase() + explanation.slice(1);
  }

  return {
    score,
    status,
    explanation,
    inputs,
    penalties,
  };
}

function confidenceRank(value) {
  return { low: 0, medium: 1, high: 2 }[value] ?? 0;
}

function resolveChargeSourceKind(field) {
  if (!field || field.missing) return "fallback";
  if (field.charge_source_kind) return field.charge_source_kind;
  const evidence = Array.isArray(field.evidence) ? field.evidence : [];
  const sourceKindEntry = evidence.find((entry) => /charge source kind:/i.test(entry));
  if (sourceKindEntry) {
    return sourceKindEntry.replace(/^.*charge source kind:\s*/i, "").trim() || "fallback";
  }
  if (field.source_page_type === "monthly_activity_table") return "monthly_rollup";
  if (field.source_page_type === "statement_summary") return "annual_total";
  return "fallback";
}

function buildChargeFieldConfidence(field) {
  if (!hasValue(field)) return "weak";
  const sourceKind = resolveChargeSourceKind(field);
  if (field.confidence === "high" && ["annual_total", "monthly_rollup", "table_row"].includes(sourceKind)) {
    return "strong";
  }
  if (confidenceRank(field.confidence) >= 1 && ["annual_total", "monthly_rollup", "table_row"].includes(sourceKind)) {
    return "moderate";
  }
  if (field.confidence === "high") return "moderate";
  return "weak";
}

function mostReliableChargeConfidence(fields) {
  const labels = fields
    .filter((field) => hasValue(field))
    .map((field) => buildChargeFieldConfidence(field));
  if (labels.includes("strong")) return "strong";
  if (labels.includes("moderate")) return "moderate";
  return "weak";
}

function buildNormalizedChargeSummary({ latestStatement, legacyAnalytics }) {
  const structuredChargeResult = getLatestStructuredChargeRows(latestStatement);
  const structuredChargeRows = structuredChargeResult.rows;
  const structuredChargeMap = Object.fromEntries(
    structuredChargeRows
      .filter((row) => row?.key)
      .map((row) => [
        row.key,
        {
          ...buildStructuredField(row.value, "currency"),
          charge_source_kind: "table_row",
          confidence: ["strong", "moderate"].includes(structuredChargeResult.quality[0]) ? "high" : "medium",
          source_page_type: "charges_table",
        },
      ])
  );
  const chargeFields = {
    cost_of_insurance: structuredChargeMap.cost_of_insurance || latestStatement?.fields?.cost_of_insurance || null,
    expense_charge: latestStatement?.fields?.expense_charge || null,
    admin_fee: latestStatement?.fields?.admin_fee || null,
    rider_charge: latestStatement?.fields?.rider_charge || null,
    monthly_deduction: structuredChargeMap.monthly_deduction || latestStatement?.fields?.monthly_deduction || null,
  };
  const explicitStatementCharges = fieldValue(latestStatement?.fields?.policy_charges_total);
  const totalCoi = legacyAnalytics?.charge_analysis?.total_cost_of_insurance?.value ?? fieldValue(chargeFields.cost_of_insurance);
  const totalExpenseCharges = legacyAnalytics?.charge_analysis?.total_expense_charges?.value ?? fieldValue(chargeFields.expense_charge);
  const totalAdminFees = legacyAnalytics?.charge_analysis?.total_admin_fees?.value ?? fieldValue(chargeFields.admin_fee);
  const totalRiderCharges = legacyAnalytics?.charge_analysis?.total_rider_charges?.value ?? fieldValue(chargeFields.rider_charge);
  const totalMonthlyDeductions =
    legacyAnalytics?.charge_analysis?.total_monthly_deductions?.value ?? fieldValue(chargeFields.monthly_deduction);
  const visibleChargeValues = [
    totalCoi,
    totalExpenseCharges,
    totalAdminFees,
    totalRiderCharges,
    totalMonthlyDeductions,
  ].filter((value) => value !== null && value !== undefined);
  const totalVisiblePolicyCharges = explicitStatementCharges !== null
    ? explicitStatementCharges
    : visibleChargeValues.length > 0
      ? visibleChargeValues.reduce((sum, value) => sum + value, 0)
      : null;
  const visibleChargeFieldCount = Object.values(chargeFields).filter((field) => hasValue(field)).length;
  const chargeVisibilityStatus =
    visibleChargeFieldCount >= 4 ? "strong" : visibleChargeFieldCount >= 2 ? "moderate" : visibleChargeFieldCount >= 1 ? "basic" : "limited";
  const coiSourceKind = resolveChargeSourceKind(chargeFields.cost_of_insurance);
  const coiConfidence = buildChargeFieldConfidence(chargeFields.cost_of_insurance);
  const chargeNotes = [];

  if (totalCoi !== null) {
    chargeNotes.push(
      structuredChargeRows.length > 0 && ["strong", "moderate"].includes(structuredChargeResult.quality[0])
        ? "COI is currently supported by structured charge-table extraction."
        : coiSourceKind === "annual_total"
        ? "COI is currently supported by an explicit annual or statement total."
        : coiSourceKind === "monthly_rollup"
          ? "COI is currently derived from summed monthly statement activity."
          : coiSourceKind === "table_row"
            ? "COI is currently supported by a single strongly labeled statement row."
            : "COI is currently using a weaker fallback source."
    );
  } else {
    chargeNotes.push("COI remains incomplete because no sufficiently supported charge source was identified.");
  }

  if (visibleChargeFieldCount < 2) {
    chargeNotes.push("Only a limited subset of policy charges is currently visible for comparison-ready analysis.");
  }

  return {
    total_coi: totalCoi,
    total_expense_charges: totalExpenseCharges,
    total_admin_fees: totalAdminFees,
    total_rider_charges: totalRiderCharges,
    total_monthly_deductions: totalMonthlyDeductions,
    total_visible_policy_charges: totalVisiblePolicyCharges,
    coi_confidence: coiConfidence,
    charge_visibility_status: chargeVisibilityStatus,
    coi_source_kind: coiSourceKind,
    charge_field_confidence: {
      cost_of_insurance: buildChargeFieldConfidence(chargeFields.cost_of_insurance),
      expense_charge: buildChargeFieldConfidence(chargeFields.expense_charge),
      admin_fee: buildChargeFieldConfidence(chargeFields.admin_fee),
      rider_charge: buildChargeFieldConfidence(chargeFields.rider_charge),
      monthly_deduction: buildChargeFieldConfidence(chargeFields.monthly_deduction),
      aggregate: mostReliableChargeConfidence(Object.values(chargeFields)),
    },
    charge_notes: chargeNotes,
    structured_charge_rows: structuredChargeRows,
    structured_charge_quality: structuredChargeResult.quality,
  };
}

export function buildPolicyComparisonSummary({ policyId = null, normalizedPolicy, normalizedAnalytics }) {
  const chargeSummary = normalizedAnalytics?.charge_summary || {};
  const policyHealthScore = normalizedAnalytics?.policy_health_score || {};
  const completeness = normalizedAnalytics?.completeness_assessment || {};
  const structuredDebug = normalizedAnalytics?.structured_debug || {};
  const strategy = normalizedPolicy?.strategy || {};
  const values = normalizedPolicy?.values || {};
  const policyIdentity = normalizedPolicy?.policy_identity || {};
  const funding = normalizedPolicy?.funding || {};
  const deathBenefit =
    normalizedPolicy?.death_benefit?.current_death_benefit?.display_value ||
    normalizedPolicy?.death_benefit?.death_benefit?.display_value ||
    normalizedPolicy?.death_benefit?.initial_face_amount?.display_value ||
    null;
  const totalCoi = chargeSummary.total_coi ?? null;
  const totalVisibleCharges = chargeSummary.total_visible_policy_charges ?? null;
  const accumulationValue = values.accumulation_value?.value ?? null;
  const totalPremiumPaid = funding.total_premium_paid ?? null;
  const validCoiRatio =
    totalCoi !== null &&
    accumulationValue !== null &&
    !Number.isNaN(totalCoi) &&
    !Number.isNaN(accumulationValue) &&
    accumulationValue > 0;
  const validChargeDragRatio =
    totalVisibleCharges !== null &&
    totalPremiumPaid !== null &&
    !Number.isNaN(totalVisibleCharges) &&
    !Number.isNaN(totalPremiumPaid) &&
    totalPremiumPaid > 0;
  const resolvedStatementPeriodDate =
    normalizedPolicy?.extraction_meta?.newest_statement_selected?.statement_date_value ||
    normalizedPolicy?.extraction_meta?.newest_statement_selected?.statement_date ||
    null;
  const latestStatementDate =
    resolvedStatementPeriodDate ||
    normalizedAnalytics?.performance_summary?.latest_statement_date ||
    normalizedPolicy?.policy_timing?.statement_date ||
    null;
  const missingFields = [
    !policyIdentity.carrier_name ? "carrier_name" : null,
    !policyIdentity.product_name ? "product_name" : null,
    !policyIdentity.issue_date ? "issue_date" : null,
    !deathBenefit ? "death_benefit" : null,
    !funding.planned_premium?.display_value ? "planned_premium" : null,
    !values.accumulation_value?.display_value ? "accumulation_value" : null,
    !values.cash_value?.display_value ? "cash_value" : null,
    !values.cash_surrender_value?.display_value ? "cash_surrender_value" : null,
    !normalizedPolicy?.loans?.loan_balance?.display_value ? "loan_balance" : null,
    totalCoi === null ? "total_coi" : null,
    totalVisibleCharges === null ? "total_visible_policy_charges" : null,
    !latestStatementDate ? "latest_statement_date" : null,
  ].filter(Boolean);

  const summary = {
    policy_id: policyId,
    carrier_name: policyIdentity.carrier_name || null,
    product_name: policyIdentity.product_name || null,
    policy_type: policyIdentity.policy_type || null,
    issue_date: policyIdentity.issue_date || null,
    death_benefit: deathBenefit,
    planned_premium: funding.planned_premium?.display_value || null,
    annual_target_premium:
      funding.guideline_premium_limit?.display_value ||
      funding.annual_target_premium?.display_value ||
      null,
    accumulation_value: values.accumulation_value?.display_value || null,
    cash_value: values.cash_value?.display_value || null,
    cash_surrender_value: values.cash_surrender_value?.display_value || null,
    loan_balance: normalizedPolicy?.loans?.loan_balance?.display_value || null,
    total_coi: totalCoi !== null ? formatCurrency(totalCoi) : null,
    total_visible_policy_charges: totalVisibleCharges !== null ? formatCurrency(totalVisibleCharges) : null,
    charge_drag_ratio: validChargeDragRatio
      ? formatPercentRatio(totalVisibleCharges / totalPremiumPaid)
      : null,
    coi_ratio: validCoiRatio ? formatPercentRatio(totalCoi / accumulationValue) : null,
    strategy_visibility_status:
      structuredDebug.strategy_visibility_status ||
      buildStrategyVisibilityStatus(
        {
          rows: Array.isArray(strategy.strategy_menu_rows) ? strategy.strategy_menu_rows : [],
          activeRows: (strategy.strategy_menu_rows || []).filter((row) => row?.row_kind === "active"),
          observedRows: (strategy.strategy_menu_rows || []).filter((row) => row?.row_kind !== "menu"),
          menuRows: (strategy.strategy_menu_rows || []).filter((row) => row?.row_kind === "menu"),
          quality: structuredDebug.structured_quality_summary?.strategy || null,
        },
        strategy
      ),
    primary_index_strategy: strategy.current_index_strategy || null,
    cap_rate: strategy.cap_rate?.display_value || null,
    participation_rate: strategy.participation_rate?.display_value || null,
    spread: strategy.spread?.display_value || null,
    policy_health_score: policyHealthScore.score ?? null,
    policy_health_status: policyHealthScore.status || "limited",
    data_completeness_status: completeness.status || "basic",
    latest_statement_date: latestStatementDate,
    missing_fields: missingFields,
    comparison_debug: {
      coi_source_kind: chargeSummary.coi_source_kind || "fallback",
      coi_confidence: chargeSummary.coi_confidence || "weak",
      charge_visibility_status: chargeSummary.charge_visibility_status || "limited",
      structured_data_present: Boolean(structuredDebug.structured_data_present),
      parser_version: structuredDebug.parser_version || null,
      structured_quality_summary: structuredDebug.structured_quality_summary || null,
      structured_strategy_used: Boolean(structuredDebug.structured_strategy_used),
      fallback_used: Boolean(structuredDebug.fallback_used),
      resolved_statement_period_date: resolvedStatementPeriodDate,
      latest_statement_date_source: resolvedStatementPeriodDate ? "resolved_statement_period_date" : latestStatementDate ? "display_fallback" : "missing",
      ratio_inputs: {
        total_coi: totalCoi,
        accumulation_value: accumulationValue,
        total_visible_policy_charges: totalVisibleCharges,
        total_premium_paid: totalPremiumPaid,
      },
      ratio_omissions: [
        !validCoiRatio ? "coi_ratio omitted because total_coi or accumulation_value was missing or non-meaningful" : null,
        !validChargeDragRatio ? "charge_drag_ratio omitted because total_visible_policy_charges or total_premium_paid was missing or non-meaningful" : null,
      ].filter(Boolean),
      missing_fields: missingFields,
    },
  };

  const continuity = buildPolicyContinuityScore(summary, chargeSummary, missingFields);

  return {
    ...summary,
    continuity_score: continuity.score,
    continuity_status: continuity.status,
    continuity_explanation: continuity.explanation,
    comparison_debug: {
      ...summary.comparison_debug,
      continuity_inputs: continuity.inputs,
      continuity_penalties: continuity.penalties,
      continuity_score: continuity.score,
      continuity_status: continuity.status,
      continuity_explanation: continuity.explanation,
    },
  };
}

export function buildVaultedPolicyComparisonRows(policies = []) {
  return policies.map((policy) => ({
    policy_id: policy.policy_id || null,
    carrier: policy.carrier_name ?? null,
    product: policy.product_name ?? null,
    issue_date: policy.issue_date ?? null,
    death_benefit: policy.death_benefit ?? null,
    premium: policy.planned_premium ?? null,
    annual_target_premium: policy.annual_target_premium ?? null,
    account_value: policy.accumulation_value ?? null,
    cash_value: policy.cash_value ?? null,
    surrender_value: policy.cash_surrender_value ?? null,
    loan_balance: policy.loan_balance ?? null,
    total_coi: policy.total_coi ?? null,
    total_visible_charges: policy.total_visible_policy_charges ?? null,
    coi_ratio: policy.coi_ratio ?? null,
    charge_drag_ratio: policy.charge_drag_ratio ?? null,
    primary_strategy: policy.primary_index_strategy ?? null,
    cap_rate: policy.cap_rate ?? null,
    participation_rate: policy.participation_rate ?? null,
    spread: policy.spread ?? null,
    strategy_visibility: policy.strategy_visibility_status || "limited",
    policy_health_score: policy.policy_health_score ?? null,
    policy_health_status: policy.policy_health_status || "limited",
    data_completeness_status: policy.data_completeness_status || "basic",
    latest_statement_date: policy.latest_statement_date ?? null,
    latest_statement_date_source: policy.comparison_debug?.latest_statement_date_source || "missing",
    coi_source_kind: policy.comparison_debug?.coi_source_kind || "fallback",
    coi_confidence: policy.comparison_debug?.coi_confidence || "weak",
    charge_visibility_status: policy.comparison_debug?.charge_visibility_status || "limited",
    structured_data_present: Boolean(policy.comparison_debug?.structured_data_present),
    parser_version: policy.comparison_debug?.parser_version || null,
    structured_quality_summary: policy.comparison_debug?.structured_quality_summary || null,
    structured_strategy_used: Boolean(policy.comparison_debug?.structured_strategy_used),
    fallback_used: Boolean(policy.comparison_debug?.fallback_used),
    ratio_inputs: policy.comparison_debug?.ratio_inputs || {},
    ratio_omissions: policy.comparison_debug?.ratio_omissions || [],
    missing_fields: policy.missing_fields || [],
    continuity_score: policy.continuity_score ?? null,
    continuity_status: policy.continuity_status ?? null,
    continuity_explanation: policy.continuity_explanation ?? "",
    continuity_inputs: policy.comparison_debug?.continuity_inputs || {},
    continuity_penalties: policy.comparison_debug?.continuity_penalties || [],
    raw_comparison_summary: policy,
  }));
}

export function buildVaultedPolicyRank(row) {
  const continuity = buildPolicyContinuityScore(row, row, row?.missing_fields || []);
  return {
    score: continuity.score,
    status: continuity.status,
    statusExplanation: continuity.explanation,
    caveat: continuity.status !== "Strong" ? "Continuity confidence reflects live statement, charge, and field visibility." : "",
    inputs: continuity.inputs,
    penalties: continuity.penalties,
  };
}

export function buildPolicyListInterpretation(row = {}) {
  const ranking = buildVaultedPolicyRank(row);
  const missingFields = Array.isArray(row?.missing_fields) ? row.missing_fields : [];
  const label =
    ranking.status === "Strong"
      ? "Well Supported"
      : ranking.status === "Moderate"
        ? "Stable but Needs Monitoring"
        : ranking.status === "Weak" || ranking.status === "At Risk"
          ? "At Risk"
          : "Insufficient Visibility";

  const reasons = [
    row?.latest_statement_date ? `latest statement dated ${row.latest_statement_date}` : "no resolved latest statement date",
    row?.structured_data_present
      ? `structured parser support${row?.parser_version ? ` (${row.parser_version})` : ""}`
      : "legacy fallback support only",
    row?.coi_confidence === "strong"
      ? "strong COI confidence"
      : row?.coi_confidence === "moderate"
        ? "moderate COI confidence"
        : "weak COI confidence",
    row?.charge_visibility_status ? `${row.charge_visibility_status} charge visibility` : "",
    row?.strategy_visibility ? `${row.strategy_visibility} strategy visibility` : "",
    missingFields.length > 0 ? `${missingFields.length} missing core field${missingFields.length === 1 ? "" : "s"}` : "limited missing-field pressure",
  ].filter(Boolean);

  const bottomLineSummary =
    label === "Well Supported"
      ? `This policy is one of the stronger files in the current comparison set. ${sentenceCase(joinReadableList(reasons.slice(0, 2)))} support a more confident read.`
      : label === "Stable but Needs Monitoring"
        ? `This policy looks usable for comparison, but it still needs monitoring. ${sentenceCase(joinReadableList(reasons.slice(1, 3)))} keep the read mixed rather than fully supported.`
        : label === "At Risk"
          ? `This policy is carrying visible interpretation risk. ${sentenceCase(joinReadableList(reasons.slice(0, 3)))} weaken comparison confidence and deserve review.`
          : `This policy cannot be interpreted confidently yet. ${sentenceCase(joinReadableList(reasons.slice(0, 3)))} leave the file too thin for a strong read.`;

  const reviewItems = [
    !row?.latest_statement_date ? "Resolve the latest statement date." : "",
    row?.coi_confidence === "weak" ? "Strengthen COI support." : "",
    row?.charge_visibility_status === "limited" || row?.charge_visibility_status === "basic"
      ? "Charge visibility is incomplete."
      : "",
    row?.strategy_visibility === "limited" || row?.strategy_visibility === "basic"
      ? "Strategy visibility is incomplete."
      : "",
    missingFields.length > 0 ? "Missing core fields are limiting comparison strength." : "",
  ].filter(Boolean);

  const followups = [
    { id: "why-rated", label: "Why this rating?" },
    { id: "show-gaps", label: "What is missing?" },
    { id: "compare-stronger", label: "Compare stronger policy" },
  ];

  return {
    label,
    bottom_line_summary: bottomLineSummary,
    review_items: reviewItems,
    followups,
  };
}

export function buildPolicyComparisonAnalysis(baseRow = {}, compareRow = {}) {
  const baseRanking = buildVaultedPolicyRank(baseRow);
  const compareRanking = buildVaultedPolicyRank(compareRow);
  const baseInterpretation = buildPolicyListInterpretation(baseRow);
  const compareInterpretation = buildPolicyListInterpretation(compareRow);
  const visibilityRank = { limited: 0, basic: 1, moderate: 2, strong: 3 };
  const confidenceRank = { weak: 0, moderate: 1, strong: 2 };
  const structuredRank = { false: 0, true: 1 };

  const analysisItems = [
    {
      id: "continuity",
      label: "Continuity Support",
      stronger_policy:
        compareRanking.score > baseRanking.score
          ? "comparison"
          : compareRanking.score < baseRanking.score
            ? "current"
            : "even",
      summary:
        compareRanking.score > baseRanking.score
          ? `${compareRow.product || "The comparison policy"} carries a stronger continuity profile at ${compareRanking.score}/100 versus ${baseRanking.score}/100.`
          : compareRanking.score < baseRanking.score
            ? `${baseRow.product || "The current policy"} carries the stronger continuity profile at ${baseRanking.score}/100 versus ${compareRanking.score}/100.`
            : `Both policies are carrying similar continuity scores at ${baseRanking.score}/100 and ${compareRanking.score}/100.`,
    },
    {
      id: "statement_support",
      label: "Statement Support",
      stronger_policy:
        structuredRank[Boolean(compareRow.structured_data_present)] > structuredRank[Boolean(baseRow.structured_data_present)]
          ? "comparison"
          : structuredRank[Boolean(compareRow.structured_data_present)] < structuredRank[Boolean(baseRow.structured_data_present)]
            ? "current"
            : Boolean(compareRow.latest_statement_date) && !baseRow.latest_statement_date
          ? "comparison"
          : !compareRow.latest_statement_date && Boolean(baseRow.latest_statement_date)
            ? "current"
            : "even",
      summary:
        structuredRank[Boolean(compareRow.structured_data_present)] > structuredRank[Boolean(baseRow.structured_data_present)]
          ? "The comparison policy has stronger statement support because it carries persisted structured parser data."
          : structuredRank[Boolean(compareRow.structured_data_present)] < structuredRank[Boolean(baseRow.structured_data_present)]
            ? "The current policy has stronger statement support because it carries persisted structured parser data."
            : Boolean(compareRow.latest_statement_date) && !baseRow.latest_statement_date
          ? "The comparison policy has cleaner statement support because its latest statement date is resolved."
          : !compareRow.latest_statement_date && Boolean(baseRow.latest_statement_date)
            ? "The current policy has cleaner statement support because its latest statement date is resolved."
            : "Statement support is similar across the two files.",
    },
    {
      id: "coi_support",
      label: "COI Support",
      stronger_policy:
        (confidenceRank[compareRow.coi_confidence] ?? -1) > (confidenceRank[baseRow.coi_confidence] ?? -1)
          ? "comparison"
          : (confidenceRank[compareRow.coi_confidence] ?? -1) < (confidenceRank[baseRow.coi_confidence] ?? -1)
            ? "current"
            : "even",
      summary:
        (confidenceRank[compareRow.coi_confidence] ?? -1) > (confidenceRank[baseRow.coi_confidence] ?? -1)
          ? "COI support is stronger in the comparison policy."
          : (confidenceRank[compareRow.coi_confidence] ?? -1) < (confidenceRank[baseRow.coi_confidence] ?? -1)
            ? "COI support is stronger in the current policy."
            : "COI support is similar across both policies.",
    },
    {
      id: "charge_visibility",
      label: "Charge Visibility",
      stronger_policy:
        (visibilityRank[compareRow.charge_visibility_status] ?? -1) > (visibilityRank[baseRow.charge_visibility_status] ?? -1)
          ? "comparison"
          : (visibilityRank[compareRow.charge_visibility_status] ?? -1) < (visibilityRank[baseRow.charge_visibility_status] ?? -1)
            ? "current"
            : "even",
      summary:
        (visibilityRank[compareRow.charge_visibility_status] ?? -1) > (visibilityRank[baseRow.charge_visibility_status] ?? -1)
          ? "Charge visibility is stronger in the comparison policy."
          : (visibilityRank[compareRow.charge_visibility_status] ?? -1) < (visibilityRank[baseRow.charge_visibility_status] ?? -1)
            ? "Charge visibility is stronger in the current policy."
            : "Charge visibility is similar across both policies.",
    },
    {
      id: "strategy_visibility",
      label: "Strategy Visibility",
      stronger_policy:
        (visibilityRank[compareRow.strategy_visibility] ?? -1) > (visibilityRank[baseRow.strategy_visibility] ?? -1)
          ? "comparison"
          : (visibilityRank[compareRow.strategy_visibility] ?? -1) < (visibilityRank[baseRow.strategy_visibility] ?? -1)
            ? "current"
            : "even",
      summary:
        (visibilityRank[compareRow.strategy_visibility] ?? -1) > (visibilityRank[baseRow.strategy_visibility] ?? -1)
          ? "Strategy visibility is stronger in the comparison policy."
          : (visibilityRank[compareRow.strategy_visibility] ?? -1) < (visibilityRank[baseRow.strategy_visibility] ?? -1)
            ? "Strategy visibility is stronger in the current policy."
            : "Strategy visibility is similar across both policies.",
    },
    {
      id: "missing_fields",
      label: "Missing Data Pressure",
      stronger_policy:
        (compareRow.missing_fields || []).length < (baseRow.missing_fields || []).length
          ? "comparison"
          : (compareRow.missing_fields || []).length > (baseRow.missing_fields || []).length
            ? "current"
            : "even",
      summary:
        (compareRow.missing_fields || []).length < (baseRow.missing_fields || []).length
          ? "The comparison policy is carrying less missing-field pressure."
          : (compareRow.missing_fields || []).length > (baseRow.missing_fields || []).length
            ? "The current policy is carrying less missing-field pressure."
            : "Missing-field pressure is similar across the two files.",
    },
  ];

  const strongerAreas = analysisItems.filter((item) => item.stronger_policy === "comparison");
  const weakerAreas = analysisItems.filter((item) => item.stronger_policy === "current");
  const summary =
    strongerAreas.length > 0
      ? `${compareRow.product || "The comparison policy"} is stronger because ${joinReadableList(strongerAreas.slice(0, 3).map((item) => item.label.toLowerCase()))} are more supportive.`
      : weakerAreas.length > 0
        ? `${baseRow.product || "The current policy"} is holding up better in ${joinReadableList(weakerAreas.slice(0, 3).map((item) => item.label.toLowerCase()))}.`
        : "Both policies are landing with a broadly similar support profile from the currently visible evidence.";

  return {
    summary:
      baseRow.structured_data_present !== compareRow.structured_data_present
        ? `${summary} Comparison confidence is also being affected by uneven structured parser support across the two files.`
        : summary,
    current_policy: {
      policy_id: baseRow.policy_id || null,
      label: baseInterpretation.label,
      score: baseRanking.score,
    },
    comparison_policy: {
      policy_id: compareRow.policy_id || null,
      label: compareInterpretation.label,
      score: compareRanking.score,
    },
    stronger_areas: strongerAreas,
    weaker_areas: weakerAreas,
    analysis_items: analysisItems,
  };
}

function joinReadableList(items = []) {
  const filtered = items.filter(Boolean);
  if (filtered.length === 0) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")}, and ${filtered.at(-1)}`;
}

function sentenceCase(value = "") {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeAssessmentStatus(score, evidence = {}) {
  if (!evidence.latest_statement_present || score === null || score === undefined) {
    return "insufficient_visibility";
  }
  if (
    score < 40 ||
    evidence.growth_status === "growth_pressured" ||
    (evidence.charge_visibility === "limited" && evidence.coi_confidence === "weak")
  ) {
    return "underperforming";
  }
  if (
    score >= 85 &&
    evidence.growth_status === "positive_visible_growth" &&
    evidence.charge_visibility !== "limited" &&
    evidence.missing_fields_count <= 3 &&
    evidence.strategy_visibility !== "limited"
  ) {
    return "performing_well";
  }
  return "mixed_needs_review";
}

function buildAssessmentExplanation(status, reasons = []) {
  const topReasons = reasons.slice(0, 3);
  if (status === "performing_well") {
    return topReasons.length > 0
      ? `${sentenceCase(joinReadableList(topReasons))} support this policy well.`
      : "Statements, growth, and charge support point to a well-supported policy read.";
  }
  if (status === "underperforming") {
    return topReasons.length > 0
      ? `${sentenceCase(joinReadableList(topReasons))} put this policy at risk.`
      : "Charges, growth, and continuity signals put this policy at risk.";
  }
  if (status === "mixed_needs_review") {
    return topReasons.length > 0
      ? `${sentenceCase(joinReadableList(topReasons))} keep this policy stable on the surface but worth monitoring closely.`
      : "The policy looks stable on the surface, but several signals still warrant monitoring.";
  }
  return topReasons.length > 0
    ? `${sentenceCase(joinReadableList(topReasons))} limit interpretation confidence.`
    : "The current file does not provide enough support for a confident interpretation.";
}

export function buildPolicyInterpretation(
  normalizedPolicy = {},
  normalizedAnalytics = {},
  statementRows = []
) {
  const policyIdentity = normalizedPolicy?.policy_identity || {};
  const deathBenefit = normalizedPolicy?.death_benefit || {};
  const funding = normalizedPolicy?.funding || {};
  const values = normalizedPolicy?.values || {};
  const loans = normalizedPolicy?.loans || {};
  const strategy = normalizedPolicy?.strategy || {};
  const growthAttribution = normalizedAnalytics?.growth_attribution || {};
  const chargeAttribution = normalizedAnalytics?.charge_attribution || {};
  const chargeSummary = normalizedAnalytics?.charge_summary || {};
  const completeness = normalizedAnalytics?.completeness_assessment || {};
  const comparisonSummary =
    normalizedAnalytics?.comparison_summary ||
    buildPolicyComparisonSummary({ normalizedPolicy, normalizedAnalytics });
  const missingFields = comparisonSummary?.missing_fields || [];
  const trendSummary = buildPolicyTrendSummary(statementRows);
  const continuity = buildPolicyContinuityScore(comparisonSummary, chargeSummary, missingFields);

  const policyType = policyIdentity.policy_type || "indexed universal life policy";
  const carrierProduct = joinReadableList([
    policyIdentity.carrier_name,
    policyIdentity.product_name,
  ]);
  const currentDeathBenefit =
    deathBenefit.current_death_benefit?.display_value ||
    deathBenefit.death_benefit?.display_value ||
    deathBenefit.initial_face_amount?.display_value ||
    "an unresolved death benefit";
  const premiumStructure = joinReadableList([
    funding.planned_premium?.display_value ? `planned premiums of ${funding.planned_premium.display_value}` : "",
    funding.guideline_premium_limit?.display_value ? `a visible guideline premium limit of ${funding.guideline_premium_limit.display_value}` : "",
  ]);
  const issueTiming = policyIdentity.issue_date ? `It appears to have been issued on ${policyIdentity.issue_date}.` : "";
  const ownerParty = joinReadableList([
    policyIdentity.owner_name ? `owned by ${policyIdentity.owner_name}` : "",
    policyIdentity.insured_name ? `insuring ${policyIdentity.insured_name}` : "",
  ]);

  const policyOverviewSummary = [
    `This is a ${policyType}${carrierProduct ? ` with ${carrierProduct}` : ""}.`,
    `The visible death benefit is ${currentDeathBenefit}.`,
    premiumStructure ? `The visible premium structure shows ${premiumStructure}.` : "Visible premium structure is still limited.",
    ownerParty ? `The current record is ${ownerParty}.` : "",
    issueTiming,
  ]
    .filter(Boolean)
    .join(" ");

  const latestStatementDate =
    comparisonSummary?.latest_statement_date || normalizedAnalytics?.performance_summary?.latest_statement_date || null;
  const currentPositionSummary = [
    latestStatementDate ? `The latest visible statement is dated ${latestStatementDate}.` : "A latest statement date is not clearly visible yet.",
    values.accumulation_value?.display_value
      ? `Visible accumulation value is ${values.accumulation_value.display_value}.`
      : "Visible accumulation value is still incomplete.",
    values.cash_value?.display_value
      ? `Current cash value is ${values.cash_value.display_value}.`
      : "",
    values.cash_surrender_value?.display_value
      ? `Cash surrender value is ${values.cash_surrender_value.display_value}.`
      : "",
    loans.loan_balance?.display_value ? `Visible loan balance is ${loans.loan_balance.display_value}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  let growthSummary = "Growth visibility is limited because funding or statement value support is incomplete.";
  if (
    growthAttribution.visible_total_premium_paid !== null &&
    growthAttribution.current_accumulation_value !== null
  ) {
    growthSummary =
      growthAttribution.efficiency_status === "positive_visible_growth"
        ? `Visible accumulation and cash values are holding above the premiums currently visible in the file. Net visible growth is ${growthAttribution.net_growth_display || "available"}, and the current charge picture does not overwhelm that funding support.`
        : `Visible accumulation and cash values are lagging the premiums currently visible in the file. Net visible growth is ${growthAttribution.net_growth_display || "available"}, which suggests that deductions and overall policy drag deserve closer review.`;
  } else if (trendSummary.periods_count >= 2 && trendSummary.cash_value_trend.status !== "limited") {
    growthSummary = `${trendSummary.cash_value_trend.note} ${chargeSummary.total_visible_policy_charges !== null ? `Visible charges total ${formatCurrency(chargeSummary.total_visible_policy_charges)}, so funding support should be read alongside deductions.` : "Charge visibility is incomplete, so growth quality cannot be tied cleanly to deductions yet."}`.trim();
  }

  const chargeSummaryExplanation = [
    chargeSummary.total_coi !== null
      ? `Visible total cost of insurance is ${formatCurrency(chargeSummary.total_coi)}.`
      : "A fully supported total cost of insurance is not yet visible.",
    chargeSummary.total_visible_policy_charges !== null
      ? `Visible lifetime policy charges total ${formatCurrency(chargeSummary.total_visible_policy_charges)}.`
      : "Total visible charges are still incomplete.",
    ...(chargeSummary.charge_notes || []),
  ]
    .filter(Boolean)
    .join(" ");

  const strategySummary =
    strategy.current_index_strategy
      ? `The visible strategy currently points to ${strategy.current_index_strategy}${strategy.cap_rate?.display_value ? ` with a cap rate of ${strategy.cap_rate.display_value}` : ""}${strategy.participation_rate?.display_value ? ` and a participation rate of ${strategy.participation_rate.display_value}` : ""}${strategy.spread?.display_value ? ` plus a spread of ${strategy.spread.display_value}` : ""}.`
      : "Strategy detail is incomplete, so index-crediting support cannot be reviewed confidently yet.";

  const assessmentReasons = [];
  if (continuity.score >= 85) assessmentReasons.push("strong continuity support");
  if (growthAttribution.efficiency_status === "positive_visible_growth") assessmentReasons.push("visible growth above funding");
  if (growthAttribution.efficiency_status === "growth_pressured") assessmentReasons.push("growth that looks pressured against visible funding");
  if (comparisonSummary?.charge_drag_ratio) assessmentReasons.push(`charge drag of ${comparisonSummary.charge_drag_ratio}`);
  if (chargeSummary.coi_confidence === "weak") assessmentReasons.push("weak COI confidence");
  if (comparisonSummary?.charge_visibility_status === "limited") assessmentReasons.push("limited charge visibility");
  if (!comparisonSummary?.latest_statement_date) assessmentReasons.push("a missing latest statement date");
  if ((comparisonSummary?.missing_fields || []).length > 4) assessmentReasons.push("several missing core policy fields");
  if (comparisonSummary?.strategy_visibility_status === "limited") assessmentReasons.push("incomplete strategy visibility");
  if (trendSummary.periods_count < 2) assessmentReasons.push("thin statement history");

  const performanceAssessmentStatus = normalizeAssessmentStatus(continuity.score, {
    latest_statement_present: Boolean(comparisonSummary?.latest_statement_date),
    growth_status: growthAttribution.efficiency_status,
    charge_visibility: comparisonSummary?.charge_visibility_status,
    coi_confidence: chargeSummary.coi_confidence || comparisonSummary?.coi_confidence,
    strategy_visibility: comparisonSummary?.strategy_visibility_status,
    missing_fields_count: missingFields.length,
  });

  const performanceAssessment = {
    status: performanceAssessmentStatus,
    label:
      performanceAssessmentStatus === "performing_well"
        ? "Well Supported"
        : performanceAssessmentStatus === "underperforming"
          ? "At Risk"
          : performanceAssessmentStatus === "mixed_needs_review"
            ? "Stable but Needs Monitoring"
            : "Insufficient Visibility",
    explanation: buildAssessmentExplanation(performanceAssessmentStatus, assessmentReasons),
  };

  const strengthHighlights = [
    comparisonSummary?.latest_statement_date ? `recent statement support through ${comparisonSummary.latest_statement_date}` : "",
    continuity.score >= 85 ? `continuity support at ${continuity.score}/100` : "",
    growthAttribution.efficiency_status === "positive_visible_growth" ? "visible value growth that is holding up against visible funding" : "",
    chargeSummary.coi_confidence === "strong" ? "direct COI support from statement totals" : "",
    comparisonSummary?.charge_visibility_status === "strong" || comparisonSummary?.charge_visibility_status === "available"
      ? "strong charge visibility"
      : "",
    comparisonSummary?.strategy_visibility_status === "strong" || comparisonSummary?.strategy_visibility_status === "available"
      ? "clear strategy visibility"
      : "",
    trendSummary.periods_count >= 2 ? `${trendSummary.periods_count} visible statement periods` : "",
  ].filter(Boolean);

  const attentionItems = [
    !comparisonSummary?.latest_statement_date ? "the latest statement date is still missing" : "",
    growthAttribution.efficiency_status === "growth_pressured" ? "visible growth is being pressured by deductions" : "",
    chargeSummary.coi_confidence === "weak" ? "COI support is still weak" : "",
    comparisonSummary?.charge_visibility_status === "limited" || comparisonSummary?.charge_visibility_status === "basic"
      ? `charge visibility is ${comparisonSummary?.charge_visibility_status || "limited"}`
      : "",
    comparisonSummary?.strategy_visibility_status === "limited" || comparisonSummary?.strategy_visibility_status === "basic"
      ? "strategy support is incomplete"
      : "",
    missingFields.length > 0 ? `${missingFields.length} core fields are still unresolved` : "",
    trendSummary.periods_count < 2 ? "statement history is thin" : "",
  ].filter(Boolean);

  let readerHeadline = "This policy still needs clearer support before it can be read confidently.";
  if (performanceAssessment.label === "Well Supported") {
    readerHeadline = "This policy is reading as well supported from the current evidence.";
  } else if (performanceAssessment.label === "Stable but Needs Monitoring") {
    readerHeadline = "This policy looks stable today, but a few pressure points still need monitoring.";
  } else if (performanceAssessment.label === "At Risk") {
    readerHeadline = "This policy is showing meaningful pressure in the current file.";
  }

  let whatThisPolicyIsDoing = "The current file shows the policy in force, but the value and charge story is still only partially visible.";
  if (
    growthAttribution.visible_total_premium_paid !== null &&
    growthAttribution.current_accumulation_value !== null
  ) {
    whatThisPolicyIsDoing =
      growthAttribution.efficiency_status === "positive_visible_growth"
        ? "The policy is building visible value above the premiums currently visible in the file, while still carrying normal policy deductions."
        : "The policy is still carrying value, but visible growth is being absorbed more heavily by charges and overall policy drag.";
  } else if (trendSummary.periods_count >= 2 && trendSummary.cash_value_trend.status !== "limited") {
    whatThisPolicyIsDoing = `${trendSummary.cash_value_trend.note} This gives a directional read on the policy even though the full funding picture is not complete.`;
  }

  const whatIsSupportingIt =
    strengthHighlights.length > 0
      ? `The clearest supports right now are ${joinReadableList(strengthHighlights)}.`
      : "Support is still limited because the file does not yet show enough clean statement, growth, and charge evidence together.";

  const whatNeedsAttention =
    attentionItems.length > 0
      ? `The main items to watch are ${joinReadableList(attentionItems.slice(0, 4))}.`
      : "No immediate pressure point stands out from the currently visible evidence.";

  const confidenceRead = [
    continuity.score >= 85
      ? "Confidence is strong because the file has good continuity support."
      : continuity.score >= 65
        ? "Confidence is moderate because the file supports a useful read, but not a fully complete one."
        : "Confidence is limited because key support is still missing or weak.",
    comparisonSummary?.latest_statement_date
      ? `The read is anchored by a latest visible statement dated ${comparisonSummary.latest_statement_date}.`
      : "Missing statement recency reduces confidence in the current read.",
    missingFields.length > 0 ? `${missingFields.length} unresolved core fields still limit certainty.` : "No critical missing fields are currently flagged.",
  ]
    .filter(Boolean)
    .join(" ");

  const reviewItems = [
    !comparisonSummary?.latest_statement_date ? "Latest statement is missing or unresolved." : "",
    comparisonSummary?.charge_visibility_status === "limited" || comparisonSummary?.charge_visibility_status === "basic"
      ? `Charge visibility is ${comparisonSummary?.charge_visibility_status || "limited"}.`
      : "",
    chargeSummary.coi_confidence === "weak" ? "COI confidence is limited." : "",
    comparisonSummary?.strategy_visibility_status === "limited" || comparisonSummary?.strategy_visibility_status === "basic"
      ? "Strategy visibility is incomplete."
      : "",
    growthAttribution.efficiency_status === "limited" ? "Growth support is unclear from visible funding and value history." : "",
    missingFields.length > 0 ? "Comparison strength is limited by missing core fields." : "",
  ].filter(Boolean);

  const confidenceSummary = [
    `Continuity score is ${continuity.score}/100, which maps to ${continuity.status.toLowerCase()} continuity support.`,
    completeness.status ? `Overall data completeness is ${completeness.status}.` : "",
    trendSummary.periods_count >= 2
      ? `Visible statement history covers ${trendSummary.periods_count} periods from ${trendSummary.oldest_statement_date || "an earlier statement"} to ${trendSummary.newest_statement_date || "the latest visible statement"}.`
      : "Visible statement history is still thin, which limits interpretation confidence.",
  ]
    .filter(Boolean)
    .join(" ");

  const bottomLineSummary = [
    readerHeadline,
    whatIsSupportingIt,
    attentionItems.length > 0 ? whatNeedsAttention : confidenceRead,
  ]
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  const interactiveFollowups = [
    {
      id: "explain-rating",
      label: "Why this rating?",
      prompt: "Why is this policy rated this way?",
      section: "performance_assessment",
    },
    {
      id: "show-charges",
      label: "Growth vs charges",
      prompt: "How much are charges impacting growth?",
      section: "charge_summary",
    },
    {
      id: "compare-policy",
      label: "Compare stronger policy",
      prompt: "How does this compare to a stronger policy?",
      section: "comparison",
    },
    {
      id: "show-missing",
      label: "Missing information",
      prompt: "What information is missing?",
      section: "confidence",
    },
    {
      id: "review-strategy",
      label: "Strategy visibility",
      prompt: "What strategy details are visible?",
      section: "strategy",
    },
    {
      id: "review-structure",
      label: "Death benefit and funding",
      prompt: "Review death benefit and funding structure",
      section: "policy_overview",
    },
  ];

  return {
    policy_overview_summary: policyOverviewSummary,
    current_position_summary: currentPositionSummary,
    bottom_line_summary: bottomLineSummary,
    reader_headline: readerHeadline,
    what_this_policy_is_doing: whatThisPolicyIsDoing,
    what_is_supporting_it: whatIsSupportingIt,
    what_needs_attention: whatNeedsAttention,
    confidence_read: confidenceRead,
    strength_highlights: strengthHighlights.slice(0, 5),
    attention_items: attentionItems.slice(0, 6),
    growth_summary: growthSummary,
    charge_summary_explanation: chargeSummaryExplanation,
    strategy_summary: strategySummary,
    performance_assessment: performanceAssessment,
    review_items: [...new Set(reviewItems)].slice(0, 6),
    confidence_summary: confidenceSummary,
    interactive_followups: interactiveFollowups,
    debug: {
      comparison_summary: comparisonSummary,
      continuity,
      trend_summary: trendSummary,
      growth_attribution: growthAttribution,
      charge_attribution: chargeAttribution,
      completeness_assessment: completeness,
      assessment_reasons: assessmentReasons,
    },
  };
}

function normalizeQuestionText(questionText = "") {
  return String(questionText || "").trim().toLowerCase();
}

function buildAssistantFollowups(intent = "general_policy_summary") {
  const followupsByIntent = {
    performance_assessment: [
      "Why is this policy rated this way?",
      "How much are charges affecting growth?",
      "What information is missing?",
      "How stable is the current policy position?",
    ],
    rating_explanation: [
      "What information is missing?",
      "Review strategy visibility",
      "How stable is the current policy position?",
      "Compare this policy to another IUL",
    ],
    charge_impact: [
      "Show visible charges over time",
      "Why is this policy rated this way?",
      "How stable is the current policy position?",
      "What information is missing?",
    ],
    missing_information: [
      "Why is this policy rated this way?",
      "Review strategy visibility",
      "How stable is the current policy position?",
      "Compare this policy to another IUL",
    ],
    strategy_visibility: [
      "What information is missing?",
      "How stable is the current policy position?",
      "Why is this policy rated this way?",
      "Compare this policy to another IUL",
    ],
    funding_structure: [
      "How much are charges affecting growth?",
      "Are we ahead or behind the original illustration?",
      "How stable is the current policy position?",
      "What should I review first?",
    ],
    comparison_request: [
      "Why is this policy rated this way?",
      "What information is missing?",
      "How stable is the current policy position?",
      "Review strategy visibility",
    ],
    illustration_variance: [
      "How stable is the current policy position?",
      "How much are charges affecting growth?",
      "What information is missing?",
      "Why is this policy rated this way?",
    ],
    trend_review: [
      "Show visible charges over time",
      "How much are charges affecting growth?",
      "Why is this policy rated this way?",
      "What should I review first?",
    ],
    general_policy_summary: [
      "Is this policy performing well?",
      "Why is this policy rated this way?",
      "How much are charges affecting growth?",
      "What information is missing?",
    ],
  };

  return (followupsByIntent[intent] || followupsByIntent.general_policy_summary).slice(0, 4);
}

function buildPolicyAssistantActions(intent = "general_policy_summary", { policyId = "", comparisonSummary = null } = {}) {
  const actions = [];

  if (intent === "comparison_request") {
    actions.push({
      id: "open-policy-compare",
      label: "Open policy comparison",
      route: policyId ? `/insurance/compare/${policyId}` : "/insurance",
    });
  }

  if (intent === "charge_impact") {
    actions.push({
      id: "open-charge-section",
      label: "Open charge breakdown",
      type: "scroll_section",
      section: "charge_summary",
    });
  }

  if (intent === "missing_information" || intent === "rating_explanation") {
    actions.push({
      id: "open-missing-section",
      label: "Open missing data",
      type: "scroll_section",
      section: "confidence",
    });
  }

  if (intent === "strategy_visibility") {
    actions.push({
      id: "open-interpretation-section",
      label: "Open policy interpretation",
      type: "scroll_section",
      section: "interpretation",
    });
  }

  if (intent === "trend_review" || intent === "illustration_variance") {
    actions.push({
      id: "open-annual-review",
      label: "Open annual review",
      type: "scroll_section",
      section: "annual_review",
    });
  }

  if (intent === "performance_assessment" || intent === "general_policy_summary" || intent === "funding_structure") {
    actions.push({
      id: "open-policy-snapshot",
      label: "Open policy snapshot",
      type: "scroll_section",
      section: "policy_overview",
    });
  }

  if (!actions.find((item) => item.route && item.route.includes("/insurance/compare")) && policyId) {
    actions.push({
      id: "open-policy-compare-fallback",
      label: "Compare policy",
      route: `/insurance/compare/${policyId}`,
    });
  }

  return actions.slice(0, 3);
}

function buildAssistantConfidenceLabel(evidencePoints = [], limitingSignals = 0) {
  if (evidencePoints.length >= 3 && limitingSignals === 0) return "strong";
  if (evidencePoints.length >= 2) return "moderate";
  return "limited";
}

function summarizeEvidencePoint(label, value) {
  return `${label}: ${value}`;
}

export function classifyPolicyQuestion(questionText = "") {
  const normalized = normalizeQuestionText(questionText);
  const keywords = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  const intentRules = [
    { intent: "performance_assessment", terms: ["performing", "perform", "doing well", "stable", "at risk", "health"] },
    { intent: "rating_explanation", terms: ["why", "rated", "rating", "score", "continuity", "status"] },
    { intent: "charge_impact", terms: ["charge", "charges", "coi", "cost of insurance", "impacting growth", "deduction"] },
    { intent: "missing_information", terms: ["missing", "incomplete", "not visible", "unclear", "what information"] },
    { intent: "strategy_visibility", terms: ["strategy", "index", "cap", "participation", "spread", "allocation"] },
    { intent: "funding_structure", terms: ["premium", "funding", "planned premium", "target premium", "guideline"] },
    { intent: "comparison_request", terms: ["compare", "another policy", "another iul", "stronger policy"] },
    { intent: "illustration_variance", terms: ["illustration", "ahead", "behind", "original illustration", "variance"] },
    { intent: "trend_review", terms: ["trend", "over time", "timeline", "statement history", "changed", "annual review"] },
  ];

  let bestMatch = { intent: "general_policy_summary", score: 0 };
  intentRules.forEach((rule) => {
    const score = rule.terms.reduce((count, term) => (normalized.includes(term) ? count + 1 : count), 0);
    if (score > bestMatch.score) {
      bestMatch = { intent: rule.intent, score };
    }
  });

  return {
    intent: bestMatch.intent,
    confidence: bestMatch.score >= 2 ? "high" : bestMatch.score === 1 ? "medium" : "low",
    extracted_keywords: keywords.slice(0, 8),
  };
}

export function answerPolicyQuestion({
  questionText = "",
  normalizedPolicy = {},
  normalizedAnalytics = {},
  statementRows = [],
  comparisonSummary = null,
  interpretation = null,
  trendSummary = null,
  policyId = "",
} = {}) {
  const classification = classifyPolicyQuestion(questionText);
  const safeTrendSummary = trendSummary || buildPolicyTrendSummary(statementRows);
  const safeInterpretation =
    interpretation || buildPolicyInterpretation(normalizedPolicy, normalizedAnalytics, statementRows);
  const safeComparisonSummary =
    comparisonSummary || normalizedAnalytics?.comparison_summary || buildPolicyComparisonSummary({ normalizedPolicy, normalizedAnalytics });
  const chargeSummary = normalizedAnalytics?.charge_summary || {};
  const missingFields = safeComparisonSummary?.missing_fields || [];
  const continuity =
    safeInterpretation?.debug?.continuity ||
    buildPolicyContinuityScore(safeComparisonSummary, chargeSummary, missingFields);
  const policyIdentity = normalizedPolicy?.policy_identity || {};
  const funding = normalizedPolicy?.funding || {};
  const values = normalizedPolicy?.values || {};
  const strategy = normalizedPolicy?.strategy || {};
  const growthAttribution = normalizedAnalytics?.growth_attribution || {};
  const performanceLabel = safeInterpretation?.performance_assessment?.label || "Insufficient Visibility";

  let answerText = safeInterpretation?.bottom_line_summary || "The current policy evidence is still limited.";
  let evidencePoints = [];
  let evidenceFieldsUsed = [];

  switch (classification.intent) {
    case "performance_assessment":
      answerText = `${performanceLabel}. ${safeInterpretation?.reader_headline || safeInterpretation?.performance_assessment?.explanation || safeInterpretation?.bottom_line_summary}`;
      evidencePoints = [
        summarizeEvidencePoint("Continuity score", `${continuity.score}/100 (${continuity.status})`),
        summarizeEvidencePoint("Latest statement", safeComparisonSummary?.latest_statement_date || "Missing"),
        summarizeEvidencePoint("Charge visibility", safeComparisonSummary?.charge_visibility_status || "limited"),
        summarizeEvidencePoint("Growth read", growthAttribution?.explanation || safeInterpretation?.growth_summary),
      ].filter(Boolean);
      evidenceFieldsUsed = ["continuity_score", "latest_statement_date", "charge_visibility_status", "growth_summary"];
      break;
    case "rating_explanation":
      answerText = safeInterpretation?.performance_assessment?.explanation || continuity.explanation;
      evidencePoints = [
        ...(continuity.penalties || []).slice(0, 3).map((item) => summarizeEvidencePoint("Penalty", item.reason)),
        summarizeEvidencePoint("Missing fields", missingFields.length > 0 ? `${missingFields.length} visible gaps` : "No critical missing data detected"),
        summarizeEvidencePoint("Strategy visibility", safeComparisonSummary?.strategy_visibility_status || "limited"),
      ].filter(Boolean).slice(0, 4);
      evidenceFieldsUsed = ["continuity_penalties", "missing_fields", "strategy_visibility_status"];
      break;
    case "charge_impact":
      answerText =
        growthAttribution?.efficiency_status === "growth_pressured"
          ? `Visible charges are putting pressure on growth. ${safeInterpretation?.charge_summary_explanation || ""}`.trim()
          : `Charges are visible, but the current evidence does not show them overwhelming growth. ${safeInterpretation?.charge_summary_explanation || ""}`.trim();
      evidencePoints = [
        summarizeEvidencePoint("Total COI", chargeSummary?.total_coi !== null ? formatCurrency(chargeSummary.total_coi) : "Not fully visible"),
        summarizeEvidencePoint("Visible charges", chargeSummary?.total_visible_policy_charges !== null ? formatCurrency(chargeSummary.total_visible_policy_charges) : "Incomplete"),
        summarizeEvidencePoint("Growth attribution", growthAttribution?.explanation || "Growth support is limited"),
        summarizeEvidencePoint("Charge visibility", safeComparisonSummary?.charge_visibility_status || "limited"),
      ].filter(Boolean);
      evidenceFieldsUsed = ["total_coi", "total_visible_policy_charges", "growth_attribution", "charge_visibility_status"];
      break;
    case "missing_information":
      answerText =
        missingFields.length > 0
          ? `Several visible evidence gaps are still limiting confidence. ${safeInterpretation?.confidence_summary || ""}`.trim()
          : "No critical missing fields are currently flagged, although some deeper support may still be limited.";
      evidencePoints = [
        summarizeEvidencePoint("Missing fields", missingFields.length > 0 ? missingFields.join(", ") : "No critical missing fields"),
        summarizeEvidencePoint("Latest statement", safeComparisonSummary?.latest_statement_date || "Missing"),
        summarizeEvidencePoint("COI confidence", safeComparisonSummary?.coi_confidence || chargeSummary?.coi_confidence || "weak"),
        summarizeEvidencePoint("Strategy visibility", safeComparisonSummary?.strategy_visibility_status || "limited"),
      ].filter(Boolean);
      evidenceFieldsUsed = ["missing_fields", "latest_statement_date", "coi_confidence", "strategy_visibility_status"];
      break;
    case "strategy_visibility":
      answerText = safeInterpretation?.strategy_summary || "Strategy visibility is still limited in the current file.";
      evidencePoints = [
        summarizeEvidencePoint("Primary strategy", strategy?.current_index_strategy || safeComparisonSummary?.primary_strategy || "Not clearly visible"),
        summarizeEvidencePoint("Cap rate", strategy?.cap_rate?.display_value || safeComparisonSummary?.cap_rate || "\u2014"),
        summarizeEvidencePoint("Participation rate", strategy?.participation_rate?.display_value || safeComparisonSummary?.participation_rate || "\u2014"),
        summarizeEvidencePoint("Strategy visibility", safeComparisonSummary?.strategy_visibility_status || "limited"),
      ].filter(Boolean);
      evidenceFieldsUsed = ["primary_strategy", "cap_rate", "participation_rate", "strategy_visibility_status"];
      break;
    case "funding_structure":
      answerText =
        funding?.planned_premium?.display_value
          ? `Funding structure is partially visible. Planned premium is ${funding.planned_premium.display_value}, and the broader funding read depends on how statement growth and charges are holding up over time.`
          : "Funding structure is only partially visible because planned premium support is incomplete in the current file.";
      evidencePoints = [
        summarizeEvidencePoint("Planned premium", funding?.planned_premium?.display_value || "Not clearly visible"),
        summarizeEvidencePoint("Guideline premium", funding?.guideline_premium_limit?.display_value || "Not clearly visible"),
        summarizeEvidencePoint("Growth read", growthAttribution?.explanation || safeInterpretation?.growth_summary),
        summarizeEvidencePoint("Current value position", values?.cash_value?.display_value || values?.accumulation_value?.display_value || "Limited"),
      ].filter(Boolean);
      evidenceFieldsUsed = ["planned_premium", "guideline_premium_limit", "growth_summary", "cash_value"];
      break;
    case "comparison_request":
      answerText = "Comparison is available through the focused compare workflow for this policy. The current detail page can route into a side-by-side review, but it does not keep a second policy in context here yet.";
      evidencePoints = [
        summarizeEvidencePoint("Compare route", "/insurance/compare/:policyId"),
        summarizeEvidencePoint("Current policy status", `${performanceLabel} at ${continuity.score}/100 continuity`),
        summarizeEvidencePoint("Available workflow", "Focused side-by-side policy comparison"),
      ];
      evidenceFieldsUsed = ["policy_id", "continuity_score", "comparison_workflow"];
      break;
    case "illustration_variance":
      answerText =
        normalizedAnalytics?.illustration_comparison?.comparison_possible
          ? normalizedAnalytics.illustration_comparison.narrative
          : "Illustration-versus-actual support is still limited. The current system can describe trend, growth, and charge pressure, but it does not yet have enough visible evidence here to call this policy precisely ahead or behind the original illustration.";
      evidencePoints = [
        summarizeEvidencePoint("Illustration support", normalizedAnalytics?.illustration_comparison?.comparison_possible ? "Partially available" : "Limited"),
        summarizeEvidencePoint("Trend summary", safeTrendSummary?.summary || "Limited"),
        summarizeEvidencePoint("Growth interpretation", safeInterpretation?.growth_summary || "Limited"),
        summarizeEvidencePoint("Latest statement", safeComparisonSummary?.latest_statement_date || "Missing"),
      ].filter(Boolean);
      evidenceFieldsUsed = ["illustration_comparison", "trend_summary", "growth_summary", "latest_statement_date"];
      break;
    case "trend_review":
      answerText = safeTrendSummary?.summary || "Trend review is limited because statement history is still thin.";
      evidencePoints = [
        summarizeEvidencePoint("Periods reviewed", safeTrendSummary?.periods_count ?? 0),
        summarizeEvidencePoint("Cash value trend", safeTrendSummary?.cash_value_trend?.note || "Limited"),
        summarizeEvidencePoint("COI trend", safeTrendSummary?.total_coi_trend?.note || "Limited"),
        summarizeEvidencePoint("Visible charge trend", safeTrendSummary?.visible_charge_trend?.note || "Limited"),
      ].filter(Boolean);
      evidenceFieldsUsed = ["periods_count", "cash_value_trend", "total_coi_trend", "visible_charge_trend"];
      break;
    case "general_policy_summary":
    default:
      answerText = [
        safeInterpretation?.reader_headline,
        safeInterpretation?.what_this_policy_is_doing,
        safeInterpretation?.bottom_line_summary,
      ].filter(Boolean).join(" ");
      evidencePoints = [
        summarizeEvidencePoint("Policy type", policyIdentity?.policy_type || "Indexed universal life policy"),
        summarizeEvidencePoint("Death benefit", normalizedPolicy?.death_benefit?.current_death_benefit?.display_value || normalizedPolicy?.death_benefit?.death_benefit?.display_value || "Not fully visible"),
        summarizeEvidencePoint("Continuity score", `${continuity.score}/100 (${continuity.status})`),
        summarizeEvidencePoint("Latest statement", safeComparisonSummary?.latest_statement_date || "Missing"),
      ].filter(Boolean);
      evidenceFieldsUsed = ["policy_type", "death_benefit", "continuity_score", "latest_statement_date"];
      break;
  }

  const limitingSignals = [
    !safeComparisonSummary?.latest_statement_date,
    (missingFields || []).length > 0,
    (safeComparisonSummary?.coi_confidence || chargeSummary?.coi_confidence) === "weak",
    (safeComparisonSummary?.charge_visibility_status || "limited") === "limited",
  ].filter(Boolean).length;

  const confidenceLabel = buildAssistantConfidenceLabel(evidencePoints.filter(Boolean), limitingSignals);

  return {
    answer_text: answerText,
    intent: classification.intent,
    evidence_points: evidencePoints.filter(Boolean).slice(0, 4),
    confidence_label: confidenceLabel,
    followup_prompts: buildAssistantFollowups(classification.intent),
    actions: buildPolicyAssistantActions(classification.intent, {
      policyId,
      comparisonSummary: safeComparisonSummary,
    }),
    debug: {
      classified_intent: classification,
      evidence_fields_used: evidenceFieldsUsed,
      limiting_signals: {
        missing_latest_statement: !safeComparisonSummary?.latest_statement_date,
        missing_fields_count: missingFields.length,
        coi_confidence: safeComparisonSummary?.coi_confidence || chargeSummary?.coi_confidence || "weak",
        charge_visibility_status: safeComparisonSummary?.charge_visibility_status || "limited",
      },
    },
  };
}

function displayReportValue(value) {
  return value === null || value === undefined || value === "" ? "\u2014" : value;
}

function buildStatementTimelineTableRows(timelineRows = []) {
  return (timelineRows || []).map((statement) => ({
    statement_date: statement.statement_date ? displayReportValue(statement.statement_date) : "\u2014",
    cash_value: formatCurrency(statement.cash_value ?? null) || "\u2014",
    cash_surrender_value: formatCurrency(statement.cash_surrender_value ?? null) || "\u2014",
    loan_balance: formatCurrency(statement.loan_balance ?? null) || "\u2014",
    cost_of_insurance: formatCurrency(statement.cost_of_insurance ?? null) || "\u2014",
    visible_charges: formatCurrency(statement.visible_charges ?? null) || "\u2014",
    detail_quality: displayReportValue(statement.detail_quality),
  }));
}

function buildPolicyReviewMissingGroups(comparisonRow = {}, groupedIssues = []) {
  if (Array.isArray(groupedIssues) && groupedIssues.length > 0) {
    return groupedIssues;
  }

  const missingFields = Array.isArray(comparisonRow?.missing_fields) ? comparisonRow.missing_fields : [];
  const groups = [];
  const dedupe = (items = []) => [...new Set(items.filter(Boolean))];

  const statementItems = dedupe([
    !comparisonRow?.latest_statement_date ? "Latest statement date is missing." : "",
    comparisonRow?.latest_statement_date_source === "missing" ? "Statement recency could not be resolved cleanly." : "",
  ]);
  if (statementItems.length > 0) groups.push({ title: "Statement freshness", items: statementItems });

  const chargeItems = dedupe([
    comparisonRow?.coi_confidence === "weak" ? "COI confidence is weak." : "",
    comparisonRow?.coi_confidence === "moderate" ? "COI confidence is moderate." : "",
    ["limited", "basic"].includes(comparisonRow?.charge_visibility_status)
      ? `Charge visibility is ${comparisonRow.charge_visibility_status}.`
      : "",
    missingFields.includes("total_coi") ? "Total COI is missing." : "",
    missingFields.includes("total_visible_policy_charges") ? "Total visible charges are incomplete." : "",
  ]);
  if (chargeItems.length > 0) groups.push({ title: "Charge visibility", items: chargeItems });

  const strategyItems = dedupe([
    ["limited", "basic"].includes(comparisonRow?.strategy_visibility)
      ? `Strategy visibility is ${comparisonRow.strategy_visibility}.`
      : "",
    !comparisonRow?.primary_strategy ? "Primary strategy is not clearly visible." : "",
  ]);
  if (strategyItems.length > 0) groups.push({ title: "Strategy visibility", items: strategyItems });

  const coreFieldLabels = {
    carrier_name: "Carrier",
    product_name: "Product",
    issue_date: "Issue date",
    death_benefit: "Death benefit",
    planned_premium: "Planned premium",
    accumulation_value: "Account value",
    cash_value: "Cash value",
    cash_surrender_value: "Cash surrender value",
    loan_balance: "Loan balance",
  };

  const coreItems = dedupe(
    missingFields.filter((field) => coreFieldLabels[field]).map((field) => `${coreFieldLabels[field]} is missing.`)
  );
  if (coreItems.length > 0) groups.push({ title: "Core policy fields", items: coreItems });

  return groups;
}

function buildCoiInterpretationLine(sourceKind, confidence) {
  if (confidence === "strong") {
    return "Extracted from explicit statement totals.";
  }
  if (confidence === "moderate" && sourceKind === "monthly_rollup") {
    return "Derived from monthly rollup with moderate confidence.";
  }
  if (confidence === "moderate") {
    return "Supported by a visible table rollup with moderate confidence.";
  }
  return "Limited visibility; direct COI total is not fully supported.";
}

export function buildPolicyReviewReport(policyBundle = {}) {
  const comparisonRow = policyBundle?.comparisonRow || {};
  const policy = policyBundle?.policy || {};
  const ranking = policyBundle?.ranking || buildVaultedPolicyRank(comparisonRow);
  const interpretation =
    policyBundle?.policyInterpretation ||
    buildPolicyInterpretation(
      policyBundle?.normalizedPolicy || {},
      policyBundle?.normalizedAnalytics || {},
      policyBundle?.statementTimeline || []
    );
  const trendSummary = policyBundle?.trendSummary || buildPolicyTrendSummary(policyBundle?.statementTimeline || []);
  const chargeSummary = policyBundle?.chargeSummary || {};
  const missingGroups = buildPolicyReviewMissingGroups(comparisonRow, policyBundle?.groupedIssues || []);
  const basicPolicyAnalysis = policyBundle?.basicPolicyAnalysis || {};
  const gapAnalysis = policyBundle?.gapAnalysis || {};
  const adequacyReview = policyBundle?.adequacyReview || {};
  const snapshotTitle =
    comparisonRow?.product ||
    policy?.product_name ||
    policy?.policy_number_masked ||
    policy?.policy_number ||
    "Policy Review";
  const carrier = comparisonRow?.carrier || policy?.carrier_name || "Carrier unavailable";

  return {
    title: snapshotTitle,
    subtitle: carrier,
    sections: [
      {
        id: "policy_snapshot",
        title: "Policy Snapshot",
        kind: "facts",
        columns: 4,
        items: [
          { label: "Policy", value: snapshotTitle },
          { label: "Carrier", value: carrier },
          { label: "Status", value: displayReportValue(ranking?.status) },
          { label: "Cash Value", value: displayReportValue(comparisonRow?.cash_value) },
          { label: "Death Benefit", value: displayReportValue(comparisonRow?.death_benefit) },
          { label: "Total COI", value: displayReportValue(comparisonRow?.total_coi) },
          { label: "Latest Statement Date", value: comparisonRow?.latest_statement_date || "\u2014" },
        ],
      },
      {
        id: "continuity_score",
        title: "Continuity Score",
        kind: "summary",
        summary: ranking?.statusExplanation || "Continuity support remains limited from the current live policy evidence.",
        items: [
          { label: "Score", value: ranking?.score ?? "\u2014" },
          { label: "Status", value: displayReportValue(ranking?.status) },
        ],
      },
      {
        id: "policy_interpretation",
        title: "Policy Interpretation",
        kind: "bullets",
        summary: interpretation?.bottom_line_summary || "A policy-level interpretation is not available yet.",
        bullets: [
          interpretation?.policy_overview_summary,
          interpretation?.current_position_summary,
          interpretation?.growth_summary,
          interpretation?.charge_summary_explanation,
          interpretation?.strategy_summary,
          interpretation?.confidence_summary,
        ].filter(Boolean),
      },
      {
        id: "protection_confidence",
        title: "Protection Confidence",
        kind: "summary",
        summary: gapAnalysis?.coverageGap
          ? "Visible protection pressure or incomplete support is present in the current read, so coverage should be reviewed before it is treated as complete."
          : "No obvious protection gap is visible from the current extracted read, but confidence still depends on document depth and missing fields.",
        items: [
          { label: "Coverage Confidence", value: gapAnalysis?.confidence !== null && gapAnalysis?.confidence !== undefined ? `${Math.round(Number(gapAnalysis.confidence) * 100)}%` : "\u2014" },
          { label: "Funding Pattern", value: displayReportValue(basicPolicyAnalysis?.fundingPattern) },
          { label: "COI Trend", value: displayReportValue(basicPolicyAnalysis?.coiTrend) },
          { label: "Gap Status", value: gapAnalysis?.coverageGap ? "Possible gap" : "No obvious gap" },
        ],
      },
      {
        id: "adequacy_review",
        title: "Adequacy Review",
        kind: "summary",
        summary: adequacyReview?.headline || "Adequacy review is not available yet.",
        items: [
          { label: "Adequacy Status", value: displayReportValue(adequacyReview?.displayStatus) },
          { label: "Owner Visible", value: adequacyReview?.ownerVisible ? "Yes" : "Limited" },
          { label: "Insured Visible", value: adequacyReview?.insuredVisible ? "Yes" : "Limited" },
          { label: "Beneficiary Visibility", value: adequacyReview?.beneficiaryVisibility === "not_extracted" ? "Not extracted yet" : displayReportValue(adequacyReview?.beneficiaryVisibility) },
        ],
      },
      {
        id: "cost_of_insurance",
        title: "Cost of Insurance",
        kind: "summary",
        summary: buildCoiInterpretationLine(comparisonRow?.coi_source_kind, comparisonRow?.coi_confidence),
        items: [
          { label: "Total COI", value: displayReportValue(comparisonRow?.total_coi) },
          { label: "Source Kind", value: displayReportValue(comparisonRow?.coi_source_kind) },
          { label: "Confidence", value: displayReportValue(comparisonRow?.coi_confidence) },
        ],
      },
      {
        id: "charge_breakdown",
        title: "Charge Breakdown",
        kind: "facts",
        columns: 5,
        items: [
          { label: "COI", value: formatCurrency(chargeSummary?.total_coi ?? null) || "\u2014" },
          { label: "Admin Fees", value: formatCurrency(chargeSummary?.total_admin_fees ?? null) || "\u2014" },
          { label: "Expense Charges", value: formatCurrency(chargeSummary?.total_expense_charges ?? null) || "\u2014" },
          { label: "Rider Charges", value: formatCurrency(chargeSummary?.total_rider_charges ?? null) || "\u2014" },
          { label: "Total Visible Charges", value: formatCurrency(chargeSummary?.total_visible_policy_charges ?? null) || "\u2014" },
        ],
      },
      {
        id: "annual_review",
        title: "Annual Review / Statement Timeline",
        kind: "bullets",
        summary: trendSummary?.summary || "Statement history is not yet available for an annual review.",
        items: [
          { label: "Periods Reviewed", value: trendSummary?.periods_count ?? 0 },
          { label: "Oldest Statement", value: trendSummary?.oldest_statement_date || "\u2014" },
          { label: "Newest Statement", value: trendSummary?.newest_statement_date || "\u2014" },
          { label: "Detail Continuity", value: displayReportValue(trendSummary?.continuity_trend) },
        ],
        bullets: trendSummary?.concise_change_notes?.slice(0, 5) || [],
      },
      {
        id: "statement_timeline",
        title: "Statement Timeline",
        kind: "table",
        columns: [
          { key: "statement_date", label: "Statement Date" },
          { key: "cash_value", label: "Cash Value" },
          { key: "cash_surrender_value", label: "Surrender Value" },
          { key: "loan_balance", label: "Loan Balance" },
          { key: "cost_of_insurance", label: "COI" },
          { key: "visible_charges", label: "Charges" },
          { key: "detail_quality", label: "Detail Quality" },
        ],
        rows: buildStatementTimelineTableRows(trendSummary?.timeline_rows || []),
        empty_message: "No statement timeline is available yet.",
      },
      {
        id: "missing_weak_data",
        title: "Missing / Weak Data",
        kind: "groups",
        groups: [
          ...missingGroups,
          ...(Array.isArray(gapAnalysis?.notes) && gapAnalysis.notes.length > 0
            ? [{ title: "Protection notes", items: gapAnalysis.notes }]
            : []),
          ...(Array.isArray(adequacyReview?.notes) && adequacyReview.notes.length > 0
            ? [{ title: "Adequacy notes", items: adequacyReview.notes }]
            : []),
          ...(Array.isArray(basicPolicyAnalysis?.flags) && basicPolicyAnalysis.flags.length > 0
            ? [{ title: "Visibility flags", items: basicPolicyAnalysis.flags }]
            : []),
        ],
        empty_message: "No critical missing data detected",
      },
      {
        id: "bottom_line",
        title: "Bottom Line",
        kind: "summary",
        summary: interpretation?.bottom_line_summary || ranking?.statusExplanation || "No bottom-line summary is available yet.",
      },
    ],
    debug: {
      comparison_row: comparisonRow,
      ranking_inputs: ranking?.inputs || {},
      ranking_penalties: ranking?.penalties || [],
      trend_debug: trendSummary?.debug || {},
      interpretation_debug: interpretation?.debug || {},
    },
  };
}

export function buildPolicyComparisonReport(primaryPolicy = {}, comparisonPolicy = {}) {
  const currentRow = primaryPolicy?.row || primaryPolicy || {};
  const referenceRow = comparisonPolicy?.row || comparisonPolicy || {};
  const currentRanking = primaryPolicy?.ranking || buildVaultedPolicyRank(currentRow);
  const referenceRanking = comparisonPolicy?.ranking || buildVaultedPolicyRank(referenceRow);
  const currentInterpretation = primaryPolicy?.interpretation || buildPolicyListInterpretation(currentRow);
  const referenceInterpretation = comparisonPolicy?.interpretation || buildPolicyListInterpretation(referenceRow);
  const currentStatements = primaryPolicy?.statementRows || [];
  const referenceStatements = comparisonPolicy?.statementRows || [];
  const currentTrend = primaryPolicy?.trendSummary || buildPolicyTrendSummary(currentStatements);
  const referenceTrend = comparisonPolicy?.trendSummary || buildPolicyTrendSummary(referenceStatements);
  const comparisonAnalysis =
    primaryPolicy?.comparisonAnalysis ||
    comparisonPolicy?.comparisonAnalysis ||
    buildPolicyComparisonAnalysis(currentRow, referenceRow);
  const trendDeltaAnalysis =
    primaryPolicy?.trendDeltaAnalysis ||
    comparisonPolicy?.trendDeltaAnalysis ||
    buildPolicyTrendDeltaComparison(currentStatements, referenceStatements);

  const currentName = currentRow?.product || "Current policy";
  const referenceName = referenceRow?.product || "Comparison policy";
  const strongerLabel =
    referenceRanking.score > currentRanking.score
      ? `${referenceName} currently carries the stronger visible support profile.`
      : currentRanking.score > referenceRanking.score
        ? `${currentName} currently carries the stronger visible support profile.`
        : "Both policies currently carry a similar visible support profile.";
  const currentBasics = primaryPolicy?.basicAnalysis || analyzePolicyBasics({ comparisonSummary: currentRow });
  const referenceBasics = comparisonPolicy?.basicAnalysis || analyzePolicyBasics({ comparisonSummary: referenceRow });
  const currentGap = primaryPolicy?.gapAnalysis || detectInsuranceGaps({ comparisonSummary: currentRow, basics: currentBasics }, { totalPolicies: 2 });
  const referenceGap = comparisonPolicy?.gapAnalysis || detectInsuranceGaps({ comparisonSummary: referenceRow, basics: referenceBasics }, { totalPolicies: 2 });
  const protectionNarrative = buildProtectionComparisonNarrative(
    { ...currentRow, basicAnalysis: currentBasics, gapAnalysis: currentGap },
    { ...referenceRow, basicAnalysis: referenceBasics, gapAnalysis: referenceGap }
  );

  return {
    title: `${currentName} vs ${referenceName}`,
    subtitle: "Focused policy comparison report",
    sections: [
      {
        id: "comparison_snapshot",
        title: "Comparison Snapshot",
        kind: "side_by_side",
        panels: [
          {
            title: currentName,
            subtitle: currentRow?.carrier || "Carrier unavailable",
            items: [
              { label: "Status", value: displayReportValue(currentInterpretation.label) },
              { label: "Continuity Score", value: currentRanking?.score ?? "\u2014" },
              { label: "Cash Value", value: displayReportValue(currentRow?.cash_value) },
              { label: "Latest Statement", value: currentRow?.latest_statement_date || "\u2014" },
            ],
          },
          {
            title: referenceName,
            subtitle: referenceRow?.carrier || "Carrier unavailable",
            items: [
              { label: "Status", value: displayReportValue(referenceInterpretation.label) },
              { label: "Continuity Score", value: referenceRanking?.score ?? "\u2014" },
              { label: "Cash Value", value: displayReportValue(referenceRow?.cash_value) },
              { label: "Latest Statement", value: referenceRow?.latest_statement_date || "\u2014" },
            ],
          },
        ],
      },
      {
        id: "continuity_status_comparison",
        title: "Continuity / Status Comparison",
        kind: "side_by_side",
        summary: comparisonAnalysis?.summary || strongerLabel,
        panels: [
          {
            title: currentName,
            items: [
              { label: "Continuity Score", value: currentRanking?.score ?? "\u2014" },
              { label: "Continuity Status", value: displayReportValue(currentRanking?.status) },
              { label: "Portfolio Read", value: displayReportValue(currentInterpretation.label) },
              { label: "Why", value: displayReportValue(currentRanking?.statusExplanation) },
            ],
          },
          {
            title: referenceName,
            items: [
              { label: "Continuity Score", value: referenceRanking?.score ?? "\u2014" },
              { label: "Continuity Status", value: displayReportValue(referenceRanking?.status) },
              { label: "Portfolio Read", value: displayReportValue(referenceInterpretation.label) },
              { label: "Why", value: displayReportValue(referenceRanking?.statusExplanation) },
            ],
          },
        ],
      },
      {
        id: "protection_confidence_comparison",
        title: "Protection Confidence Comparison",
        kind: "side_by_side",
        summary: protectionNarrative.headline,
        panels: [
          {
            title: currentName,
            items: [
              { label: "Coverage Confidence", value: `${Math.round(Number(currentGap?.confidence || 0) * 100)}%` },
              { label: "Funding Pattern", value: displayReportValue(currentBasics?.fundingPattern) },
              { label: "COI Trend", value: displayReportValue(currentBasics?.coiTrend) },
              { label: "Gap Status", value: currentGap?.coverageGap ? "Possible gap" : "No obvious gap" },
            ],
          },
          {
            title: referenceName,
            items: [
              { label: "Coverage Confidence", value: `${Math.round(Number(referenceGap?.confidence || 0) * 100)}%` },
              { label: "Funding Pattern", value: displayReportValue(referenceBasics?.fundingPattern) },
              { label: "COI Trend", value: displayReportValue(referenceBasics?.coiTrend) },
              { label: "Gap Status", value: referenceGap?.coverageGap ? "Possible gap" : "No obvious gap" },
            ],
          },
        ],
      },
      {
        id: "value_comparison",
        title: "Value Comparison",
        kind: "side_by_side",
        panels: [
          {
            title: currentName,
            items: [
              { label: "Cash Value", value: displayReportValue(currentRow?.cash_value) },
              { label: "Death Benefit", value: displayReportValue(currentRow?.death_benefit) },
              { label: "Total COI", value: displayReportValue(currentRow?.total_coi) },
              { label: "Visible Charges", value: displayReportValue(currentRow?.total_visible_charges || currentRow?.total_visible_policy_charges) },
            ],
          },
          {
            title: referenceName,
            items: [
              { label: "Cash Value", value: displayReportValue(referenceRow?.cash_value) },
              { label: "Death Benefit", value: displayReportValue(referenceRow?.death_benefit) },
              { label: "Total COI", value: displayReportValue(referenceRow?.total_coi) },
              { label: "Visible Charges", value: displayReportValue(referenceRow?.total_visible_charges || referenceRow?.total_visible_policy_charges) },
            ],
          },
        ],
      },
      {
        id: "charge_coi_comparison",
        title: "Charge / COI Comparison",
        kind: "side_by_side",
        panels: [
          {
            title: currentName,
            items: [
              { label: "COI Confidence", value: displayReportValue(currentRow?.coi_confidence) },
              { label: "COI Source", value: displayReportValue(currentRow?.coi_source_kind) },
              { label: "Charge Visibility", value: displayReportValue(currentRow?.charge_visibility_status) },
              { label: "Visible Charge Trend", value: displayReportValue(currentTrend?.visible_charge_trend?.note) },
            ],
          },
          {
            title: referenceName,
            items: [
              { label: "COI Confidence", value: displayReportValue(referenceRow?.coi_confidence) },
              { label: "COI Source", value: displayReportValue(referenceRow?.coi_source_kind) },
              { label: "Charge Visibility", value: displayReportValue(referenceRow?.charge_visibility_status) },
              { label: "Visible Charge Trend", value: displayReportValue(referenceTrend?.visible_charge_trend?.note) },
            ],
          },
        ],
      },
      {
        id: "strategy_visibility_comparison",
        title: "Strategy Visibility Comparison",
        kind: "side_by_side",
        panels: [
          {
            title: currentName,
            items: [
              { label: "Primary Strategy", value: displayReportValue(currentRow?.primary_strategy) },
              { label: "Strategy Visibility", value: displayReportValue(currentRow?.strategy_visibility) },
              { label: "Cap Rate", value: displayReportValue(currentRow?.cap_rate) },
              { label: "Participation Rate", value: displayReportValue(currentRow?.participation_rate) },
            ],
          },
          {
            title: referenceName,
            items: [
              { label: "Primary Strategy", value: displayReportValue(referenceRow?.primary_strategy) },
              { label: "Strategy Visibility", value: displayReportValue(referenceRow?.strategy_visibility) },
              { label: "Cap Rate", value: displayReportValue(referenceRow?.cap_rate) },
              { label: "Participation Rate", value: displayReportValue(referenceRow?.participation_rate) },
            ],
          },
        ],
      },
      {
        id: "trend_delta_review",
        title: "Trend Delta Review",
        kind: "bullets",
        summary: trendDeltaAnalysis?.summary || "Trend delta support is limited from the current statement history.",
        items: [
          { label: "Current Periods", value: trendDeltaAnalysis?.current_policy_periods ?? 0 },
          { label: "Comparison Periods", value: trendDeltaAnalysis?.comparison_policy_periods ?? 0 },
        ],
        bullets: (trendDeltaAnalysis?.items || []).map((item) => item.summary).filter(Boolean).slice(0, 5),
      },
      {
        id: "trend_delta_table",
        title: "Trend Delta Detail",
        kind: "table",
        columns: [
          { key: "category", label: "Category" },
          { key: "stronger_policy", label: "Current Read" },
          { key: "summary", label: "Summary" },
        ],
        rows: (trendDeltaAnalysis?.items || []).map((item) => ({
          category: item.label,
          stronger_policy:
            item.stronger_policy === "comparison"
              ? referenceName
              : item.stronger_policy === "current"
                ? currentName
                : item.stronger_policy === "limited"
                  ? "Limited"
                  : "Even",
          summary: item.summary,
        })),
        empty_message: "No trend delta detail is available yet.",
      },
      {
        id: "missing_weak_data_comparison",
        title: "Missing / Weak Data Comparison",
        kind: "side_by_side",
        panels: [
          {
            title: currentName,
            items: [
              {
                label: "Missing Fields",
                value: (currentRow?.missing_fields || []).length > 0 ? currentRow.missing_fields.join(", ") : "No critical missing data detected",
              },
            ],
          },
          {
            title: referenceName,
            items: [
              {
                label: "Missing Fields",
                value: (referenceRow?.missing_fields || []).length > 0 ? referenceRow.missing_fields.join(", ") : "No critical missing data detected",
              },
            ],
          },
        ],
      },
      {
        id: "advisor_recommendation",
        title: "Advisor-Style Recommendation",
        kind: "bullets",
        summary: `${strongerLabel} ${protectionNarrative.headline}`.trim(),
        bullets: [
          comparisonAnalysis?.summary,
          trendDeltaAnalysis?.summary,
          ...((protectionNarrative?.bullets || []).slice(0, 4)),
          ...(currentGap?.notes || []).slice(0, 2).map((item) => `${currentName}: ${item}`),
          ...(referenceGap?.notes || []).slice(0, 2).map((item) => `${referenceName}: ${item}`),
        ].filter(Boolean).slice(0, 8),
      },
      {
        id: "bottom_line_summary",
        title: "Bottom Line Summary",
        kind: "summary",
        summary: `${strongerLabel} ${comparisonAnalysis?.summary || ""} ${protectionNarrative.headline || ""} ${trendDeltaAnalysis?.summary || ""}`.trim(),
      },
    ],
    debug: {
      comparison_analysis: comparisonAnalysis,
      trend_delta_analysis: trendDeltaAnalysis,
      current_policy: currentRow,
      comparison_policy: referenceRow,
    },
  };
}

export function buildInsurancePortfolioBrief(rows = []) {
  const policies = [...(Array.isArray(rows) ? rows : [])]
    .map((row) => ({
      ...row,
      ranking: row?.ranking || buildVaultedPolicyRank(row),
      interpretation: row?.interpretation || buildPolicyListInterpretation(row),
    }))
    .sort((left, right) => (right.ranking?.score ?? 0) - (left.ranking?.score ?? 0));

  const totalCoverage = policies
    .map((row) => parseDisplayNumber(row.death_benefit))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const totalCoi = policies
    .map((row) => parseDisplayNumber(row.total_coi))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const totalVisibleCharges = policies
    .map((row) => parseDisplayNumber(row.total_visible_charges ?? row.total_visible_policy_charges))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);

  const strongPolicies = policies.filter((row) => row.ranking.status === "Strong");
  const moderatePolicies = policies.filter((row) => row.ranking.status === "Moderate");
  const weakPolicies = policies.filter((row) => row.ranking.status === "Weak");
  const atRiskPolicies = policies.filter((row) => row.ranking.status === "At Risk");
  const missingStatementPolicies = policies.filter((row) => !row.latest_statement_date);
  const weakCoiPolicies = policies.filter((row) => row.coi_confidence === "weak");
  const limitedChargePolicies = policies.filter((row) => ["limited", "basic"].includes(row.charge_visibility_status));
  const limitedStrategyPolicies = policies.filter((row) => ["limited", "basic"].includes(row.strategy_visibility));
  const missingFieldPolicies = policies.filter((row) => (row.missing_fields || []).length > 0);
  const structuredPolicies = policies.filter((row) => row.structured_data_present);

  const summary =
    policies.length === 0
      ? "No vaulted policies are available yet for a portfolio review."
      : strongPolicies.length === policies.length
        ? `The current insurance portfolio is broadly well supported across statement history, continuity, and charge visibility. ${policies.length} polic${policies.length === 1 ? "y is" : "ies are"} currently reviewable with a stronger confidence profile.${structuredPolicies.length > 0 ? ` ${structuredPolicies.length} polic${structuredPolicies.length === 1 ? "y is" : "ies are"} also benefiting from persisted structured parser support.` : ""}`
        : atRiskPolicies.length > 0
          ? `The current insurance portfolio is mixed. ${atRiskPolicies.length} polic${atRiskPolicies.length === 1 ? "y is" : "ies are"} carrying at-risk continuity pressure, while ${strongPolicies.length} remain well supported.${structuredPolicies.length > 0 ? ` Structured parser support is available on ${structuredPolicies.length} files, which is improving comparison reliability where present.` : ""}`
          : `The current insurance portfolio is usable for review, but it still has visible confidence gaps across continuity, statements, and charge support.${structuredPolicies.length > 0 ? ` Structured parser support is currently present on ${structuredPolicies.length} polic${structuredPolicies.length === 1 ? "y" : "ies"}, which helps stabilize the stronger files.` : ""}`;

  const focusAreas = [
    weakCoiPolicies.length > 0
      ? `${weakCoiPolicies.length} polic${weakCoiPolicies.length === 1 ? "y has" : "ies have"} weak COI confidence and still need stronger charge support.`
      : "",
    missingStatementPolicies.length > 0
      ? `${missingStatementPolicies.length} polic${missingStatementPolicies.length === 1 ? "y is" : "ies are"} missing a resolved latest statement date.`
      : "",
    limitedChargePolicies.length > 0
      ? `${limitedChargePolicies.length} polic${limitedChargePolicies.length === 1 ? "y has" : "ies have"} limited visible charge support.`
      : "",
    limitedStrategyPolicies.length > 0
      ? `${limitedStrategyPolicies.length} polic${limitedStrategyPolicies.length === 1 ? "y have" : "ies have"} incomplete strategy visibility.`
      : "",
    structuredPolicies.length > 0 && structuredPolicies.length < policies.length
      ? `${policies.length - structuredPolicies.length} polic${policies.length - structuredPolicies.length === 1 ? "y is" : "ies are"} still relying on legacy fallback reads instead of persisted structured parser support.`
      : "",
    missingFieldPolicies.length > 0
      ? `${missingFieldPolicies.length} polic${missingFieldPolicies.length === 1 ? "y is" : "ies are"} still carrying missing core fields.`
      : "",
  ].filter(Boolean).slice(0, 5);

  const priorityPolicies = policies
    .filter((row) => row.ranking.status === "At Risk" || row.ranking.status === "Weak" || (row.missing_fields || []).length > 0)
    .map((row) => ({
      policy_id: row.policy_id || null,
      product: row.product || "Unnamed policy",
      carrier: row.carrier || "Carrier unavailable",
      status: row.interpretation.label,
      continuity_score: row.ranking.score,
      latest_statement_date: row.latest_statement_date || null,
      review_reason:
        row.ranking.statusExplanation ||
        row.interpretation.bottom_line_summary ||
        "Visible support is still incomplete.",
    }))
    .slice(0, 5);

  return {
    summary,
    metrics: {
      total_policies: policies.length,
      total_coverage: totalCoverage,
      total_coi: totalCoi,
      total_visible_charges: totalVisibleCharges,
      strong_policies: strongPolicies.length,
      moderate_policies: moderatePolicies.length,
      weak_policies: weakPolicies.length,
      at_risk_policies: atRiskPolicies.length,
    },
    focus_areas: focusAreas,
    priority_policies: priorityPolicies,
    debug: {
      weak_coi_policy_ids: weakCoiPolicies.map((row) => row.policy_id).filter(Boolean),
      missing_statement_policy_ids: missingStatementPolicies.map((row) => row.policy_id).filter(Boolean),
      limited_charge_policy_ids: limitedChargePolicies.map((row) => row.policy_id).filter(Boolean),
      limited_strategy_policy_ids: limitedStrategyPolicies.map((row) => row.policy_id).filter(Boolean),
      missing_field_policy_ids: missingFieldPolicies.map((row) => row.policy_id).filter(Boolean),
      structured_policy_ids: structuredPolicies.map((row) => row.policy_id).filter(Boolean),
    },
  };
}

export function buildInsurancePortfolioReport(rows = []) {
  const brief = buildInsurancePortfolioBrief(rows);
  const policies = [...(Array.isArray(rows) ? rows : [])]
    .map((row) => ({
      ...row,
      ranking: row?.ranking || buildVaultedPolicyRank(row),
      interpretation: row?.interpretation || buildPolicyListInterpretation(row),
    }))
    .sort((left, right) => (right.ranking?.score ?? 0) - (left.ranking?.score ?? 0));

  return {
    title: "Insurance Portfolio Review",
    subtitle: "Household-level insurance intelligence summary",
    sections: [
      {
        id: "portfolio_summary",
        title: "Portfolio Summary",
        kind: "summary",
        summary: brief.summary,
      },
      {
        id: "portfolio_metrics",
        title: "Portfolio Metrics",
        kind: "facts",
        columns: 4,
        items: [
          { label: "Total Policies", value: brief.metrics.total_policies },
          { label: "Total Coverage", value: formatCurrency(brief.metrics.total_coverage) || "\u2014" },
          { label: "Total COI", value: formatCurrency(brief.metrics.total_coi) || "\u2014" },
          { label: "Visible Charges", value: formatCurrency(brief.metrics.total_visible_charges) || "\u2014" },
          { label: "Well Supported", value: brief.metrics.strong_policies },
          { label: "Monitoring", value: brief.metrics.moderate_policies },
          { label: "Weak", value: brief.metrics.weak_policies },
          { label: "At Risk", value: brief.metrics.at_risk_policies },
        ],
      },
      {
        id: "focus_areas",
        title: "Focus Areas",
        kind: "bullets",
        summary: "These are the portfolio-level confidence and visibility issues currently shaping review quality.",
        bullets: brief.focus_areas,
      },
      {
        id: "priority_queue",
        title: "Priority Review Queue",
        kind: "table",
        columns: [
          { key: "policy", label: "Policy" },
          { key: "carrier", label: "Carrier" },
          { key: "status", label: "Status" },
          { key: "continuity_score", label: "Continuity" },
          { key: "latest_statement_date", label: "Latest Statement" },
          { key: "review_reason", label: "Review Reason" },
        ],
        rows: brief.priority_policies.map((policy) => ({
          policy: policy.product,
          carrier: policy.carrier,
          status: policy.status,
          continuity_score: policy.continuity_score,
          latest_statement_date: policy.latest_statement_date || "\u2014",
          review_reason: policy.review_reason,
        })),
        empty_message: "No immediate priority-review policies were detected from the current portfolio.",
      },
      {
        id: "portfolio_policy_table",
        title: "Portfolio Policy Table",
        kind: "table",
        columns: [
          { key: "policy", label: "Policy" },
          { key: "carrier", label: "Carrier" },
          { key: "status", label: "Status" },
          { key: "continuity_score", label: "Continuity" },
          { key: "cash_value", label: "Cash Value" },
          { key: "total_coi", label: "Total COI" },
          { key: "coi_confidence", label: "COI Confidence" },
          { key: "latest_statement_date", label: "Latest Statement" },
        ],
        rows: policies.map((row) => ({
          policy: row.product || "Unnamed policy",
          carrier: row.carrier || "Carrier unavailable",
          status: row.interpretation.label,
          continuity_score: row.ranking.score,
          cash_value: displayReportValue(row.cash_value),
          total_coi: displayReportValue(row.total_coi),
          coi_confidence: displayReportValue(row.coi_confidence),
          latest_statement_date: row.latest_statement_date || "\u2014",
        })),
        empty_message: "No policy rows are available yet.",
      },
      {
        id: "portfolio_bottom_line",
        title: "Bottom Line",
        kind: "summary",
        summary: brief.summary,
      },
    ],
    debug: brief.debug,
  };
}

function buildCoverageBySection(baseline, statements) {
  const latest = sortStatementsChronologically(statements).at(-1);
  const sections = {
    identity: [baseline?.fields?.carrier_name, baseline?.fields?.product_name, baseline?.fields?.policy_number, baseline?.fields?.issue_date],
    funding: [baseline?.fields?.planned_premium, baseline?.fields?.minimum_premium, baseline?.fields?.guideline_premium_limit, latest?.fields?.premium_paid],
    values: [latest?.fields?.accumulation_value, latest?.fields?.cash_value, latest?.fields?.cash_surrender_value, latest?.fields?.indexed_account_value, latest?.fields?.fixed_account_value],
    charges: [latest?.fields?.cost_of_insurance, latest?.fields?.admin_fee, latest?.fields?.monthly_deduction, latest?.fields?.expense_charge, latest?.fields?.rider_charge],
    strategy: [latest?.fields?.index_strategy, latest?.fields?.allocation_percent, latest?.fields?.index_credit, latest?.fields?.cap_rate, latest?.fields?.participation_rate, latest?.fields?.crediting_rate, latest?.fields?.spread],
    loans: [latest?.fields?.loan_balance],
  };

  return Object.fromEntries(
    Object.entries(sections).map(([key, fields]) => {
      const attempted = fields.length;
      const captured = fields.filter((field) => hasValue(field)).length;
      const high = fields.filter((field) => hasTrustedValue(field, "high")).length;
      return [key, { attempted, captured, high }];
    })
  );
}

function buildCompletenessAssessment(baseline, statements) {
  const latest = sortStatementsChronologically(statements).at(-1);
  const baselineLedgerSupport = hasStrongStructuredSupport(baseline, "ledger");
  const statementSupport = hasStrongStructuredSupport(latest, "statement");
  const strategySupport = hasStrongStructuredSupport(latest, "strategy");
  const presentSections = [];
  const missingSections = [];
  const analysisLimitations = [];

  if (
    baseline &&
    ((hasTrustedValue(baseline.fields.issue_date) && hasTrustedValue(baseline.fields.death_benefit)) ||
      baselineLedgerSupport.supported)
  ) presentSections.push("illustration_core_pages");
  else {
    missingSections.push("illustration_core_pages");
    analysisLimitations.push("Core illustration schedule values remain incomplete.");
  }

  if (
    latest &&
    ((hasTrustedValue(latest.fields.accumulation_value) && hasTrustedValue(latest.fields.cash_surrender_value)) ||
      statementSupport.supported)
  ) presentSections.push("statement_summary_pages");
  else {
    missingSections.push("statement_summary_pages");
    analysisLimitations.push("Statement summary values are incomplete.");
  }

  if (
    latest &&
    (hasTrustedValue(latest.fields.cost_of_insurance) ||
      hasTrustedValue(latest.fields.expense_charge) ||
      getLatestStructuredChargeRows(latest).rows.length > 0)
  ) presentSections.push("policy_activity_pages");
  else {
    missingSections.push("policy_activity_pages");
    analysisLimitations.push("Charge analysis is limited because current-period activity rows were not fully identified.");
  }

  if (
    latest &&
    (hasTrustedValue(latest.fields.index_strategy) ||
      hasTrustedValue(latest.fields.allocation_percent) ||
      hasTrustedValue(latest.fields.cap_rate) ||
      strategySupport.supported)
  ) presentSections.push("allocation_strategy_pages");
  else {
    missingSections.push("allocation_strategy_pages");
    analysisLimitations.push("Strategy review is limited because allocation or indexed account detail pages were not identified.");
  }

  if (latest && hasTrustedValue(latest.fields.loan_balance)) presentSections.push("loan_pages");
  else {
    missingSections.push("loan_pages");
    analysisLimitations.push("Loan analysis remains limited because loan activity detail was not fully visible.");
  }

  const score = presentSections.length;
  let status = "basic";
  if (score >= 4) status = "strong";
  else if (score >= 2) status = "moderate";

  return {
    status,
    present_sections: presentSections,
    missing_sections: missingSections,
    analysis_limitations: analysisLimitations,
    structured_support: {
      ledger: baselineLedgerSupport.quality || null,
      statement: statementSupport.quality || null,
      strategy: strategySupport.quality || null,
    },
  };
}

function buildTimelineAnalytics(baseline, statements) {
  const sorted = sortStatementsChronologically(statements);
  const timeline = sorted.map((statement, index) => {
    const previous = sorted[index - 1];
    const accumulation = fieldValue(statement.fields.accumulation_value);
    const cashValue = fieldValue(statement.fields.cash_value);
    const cashSurrender = fieldValue(statement.fields.cash_surrender_value);
    const loanBalance = fieldValue(statement.fields.loan_balance);
    const visibleCharges = [
      fieldValue(statement.fields.cost_of_insurance),
      fieldValue(statement.fields.admin_fee),
      fieldValue(statement.fields.monthly_deduction),
      fieldValue(statement.fields.expense_charge),
      fieldValue(statement.fields.rider_charge),
    ].filter((value) => value !== null);

    const totalVisibleCharges = visibleCharges.length > 0 ? visibleCharges.reduce((sum, value) => sum + value, 0) : null;
    const structuredFlags = getStructuredFlags(statement);
    const extractionSummary = getStructuredExtractionSummary(statement);

    return {
      file_name: statement.fileName,
      statement_date: fieldDisplay(statement.fields.statement_date),
      statement_date_value: statement.fields.statement_date?.value || null,
      policy_year: fieldValue(statement.fields.policy_year),
      accumulation_value: accumulation,
      accumulation_display: fieldDisplay(statement.fields.accumulation_value),
      accumulation_change: previous ? accumulation - fieldValue(previous.fields.accumulation_value) : null,
      cash_value: cashValue,
      cash_value_display: fieldDisplay(statement.fields.cash_value),
      cash_value_change: previous ? cashValue - fieldValue(previous.fields.cash_value) : null,
      cash_surrender_value: cashSurrender,
      cash_surrender_value_display: fieldDisplay(statement.fields.cash_surrender_value),
      cash_surrender_change: previous ? cashSurrender - fieldValue(previous.fields.cash_surrender_value) : null,
      loan_balance: loanBalance,
      loan_balance_display: fieldDisplay(statement.fields.loan_balance),
      loan_balance_change: previous ? loanBalance - fieldValue(previous.fields.loan_balance) : null,
      total_visible_charges: totalVisibleCharges,
      total_visible_charges_display: formatCurrency(totalVisibleCharges),
      structured_data_present: structuredFlags.structuredDataPresent,
      parser_version: structuredFlags.parserVersion,
      structured_quality_summary: structuredFlags.quality,
      structured_statement_quality: structuredFlags.quality?.statement || null,
      extraction_summary: extractionSummary,
    };
  });

  if (baseline?.fields?.issue_date?.display_value) {
    timeline.unshift({
      file_name: baseline.fileName,
      statement_date: baseline.fields.issue_date.display_value,
      statement_date_value: baseline.fields.issue_date.value || null,
      policy_year: 0,
      baseline_point: true,
      accumulation_value: null,
      accumulation_display: "",
      accumulation_change: null,
      cash_value: null,
      cash_value_display: "",
      cash_value_change: null,
      cash_surrender_value: null,
      cash_surrender_value_display: "",
      cash_surrender_change: null,
      loan_balance: null,
      loan_balance_display: "",
      loan_balance_change: null,
      total_visible_charges: null,
      total_visible_charges_display: "",
    });
  }

  return timeline;
}

function buildGrowthAttribution(statements, legacyAnalytics) {
  const sorted = sortStatementsChronologically(statements);
  const latest = sorted.at(-1);
  const first = sorted[0];
  const totalPremiumPaid = legacyAnalytics?.total_premium_paid?.value ?? null;
  const accumulation = fieldValue(latest?.fields?.accumulation_value);
  const cashValue = fieldValue(latest?.fields?.cash_value);
  const cashSurrender = fieldValue(latest?.fields?.cash_surrender_value);
  const totalCharges = legacyAnalytics?.total_policy_charges?.value ?? null;
  const netGrowth = totalPremiumPaid !== null && accumulation !== null ? accumulation - totalPremiumPaid : null;
  const firstToLatestGrowth = first && latest && fieldValue(first.fields.accumulation_value) !== null && accumulation !== null ? accumulation - fieldValue(first.fields.accumulation_value) : null;

  return {
    visible_total_premium_paid: totalPremiumPaid,
    visible_total_premium_paid_display: formatCurrency(totalPremiumPaid),
    current_accumulation_value: accumulation,
    current_accumulation_value_display: fieldDisplay(latest?.fields?.accumulation_value),
    current_cash_value: cashValue,
    current_cash_value_display: fieldDisplay(latest?.fields?.cash_value),
    current_cash_surrender_value: cashSurrender,
    current_cash_surrender_value_display: fieldDisplay(latest?.fields?.cash_surrender_value),
    net_growth: netGrowth,
    net_growth_display: formatCurrency(netGrowth),
    first_statement_to_latest_growth: firstToLatestGrowth,
    first_statement_to_latest_growth_display: formatCurrency(firstToLatestGrowth),
    efficiency_status: netGrowth === null ? "limited" : netGrowth >= 0 ? "positive_visible_growth" : "growth_pressured",
    explanation: totalPremiumPaid === null || accumulation === null ? "Visible funding history remains incomplete, so growth attribution is limited." : totalCharges !== null && totalCharges > 0 ? "Visible growth can be compared against premiums and currently visible charges." : "Visible growth can be compared against premiums, but charge visibility remains partial.",
  };
}

function buildChargeAttribution(statements, legacyAnalytics) {
  const latest = sortStatementsChronologically(statements).at(-1);
  const structuredCharges = getLatestStructuredChargeRows(latest);
  const currentVisibleCharges = [
    fieldValue(latest?.fields?.cost_of_insurance),
    fieldValue(latest?.fields?.admin_fee),
    fieldValue(latest?.fields?.monthly_deduction),
    fieldValue(latest?.fields?.expense_charge),
    fieldValue(latest?.fields?.rider_charge),
  ].filter((value) => value !== null);
  const currentChargeSnapshot = currentVisibleCharges.length > 0 ? currentVisibleCharges.reduce((sum, value) => sum + value, 0) : null;

  return {
    current_period_visible_charges: currentChargeSnapshot,
    current_period_visible_charges_display: formatCurrency(currentChargeSnapshot),
    lifetime_visible_charges: legacyAnalytics?.total_policy_charges?.value ?? null,
    lifetime_visible_charges_display: formatCurrency(legacyAnalytics?.total_policy_charges?.value ?? null),
    total_cost_of_insurance: legacyAnalytics?.charge_analysis?.total_cost_of_insurance?.value ?? null,
    total_admin_fees: legacyAnalytics?.charge_analysis?.total_admin_fees?.value ?? null,
    total_monthly_deductions: legacyAnalytics?.charge_analysis?.total_monthly_deductions?.value ?? null,
    total_expense_charges: legacyAnalytics?.charge_analysis?.total_expense_charges?.value ?? null,
    total_rider_charges: legacyAnalytics?.charge_analysis?.total_rider_charges?.value ?? null,
    charge_drag_ratio: legacyAnalytics?.charge_drag_ratio?.value ?? null,
    charge_drag_ratio_display: formatPercentRatio(legacyAnalytics?.charge_drag_ratio?.value ?? null),
    attribution_status: currentChargeSnapshot === null ? "limited" : statements.length >= 2 ? "trendable" : "single_period_snapshot",
    explanation:
      currentChargeSnapshot === null
        ? "Current-period visible charges were not identified clearly enough."
        : structuredCharges.rows.length > 0 && ["strong", "moderate"].includes(structuredCharges.quality[0])
          ? "Charge attribution is anchored by structured statement charge rows and current-period totals."
          : statements.length >= 2
            ? "Charge attribution includes visible statement charges across multiple statements."
            : "Charge attribution is currently based on the latest visible statement period.",
    structured_charge_support: {
      row_count: structuredCharges.rows.length,
      quality: structuredCharges.quality,
      used: structuredCharges.rows.length > 0,
    },
  };
}

function buildIllustrationComparison(baseline, statements) {
  const latest = sortStatementsChronologically(statements).at(-1);
  const illustratedDeathBenefit = fieldValue(baseline?.fields?.death_benefit);
  const actualDeathBenefit =
    fieldValue(latest?.fields?.death_benefit) ??
    fieldValue(baseline?.fields?.initial_face_amount) ??
    fieldValue(latest?.fields?.minimum_death_benefit);
  const illustratedPremium = fieldValue(baseline?.fields?.planned_premium);
  const actualPremium = fieldValue(latest?.fields?.planned_premium);
  const deathBenefitVariance = illustratedDeathBenefit !== null && actualDeathBenefit !== null ? actualDeathBenefit - illustratedDeathBenefit : null;
  const premiumVariance = illustratedPremium !== null && actualPremium !== null ? actualPremium - illustratedPremium : null;

  return {
    comparison_possible: deathBenefitVariance !== null || premiumVariance !== null,
    limitations: ["Illustration ledger values were not extracted from the current packet, so value-variance analysis remains limited."],
    illustrated_values: {
      death_benefit: baseline?.fields?.death_benefit?.display_value || "",
      planned_premium: baseline?.fields?.planned_premium?.display_value || "",
    },
    actual_values: {
      death_benefit:
        latest?.fields?.death_benefit?.display_value ||
        baseline?.fields?.initial_face_amount?.display_value ||
        latest?.fields?.minimum_death_benefit?.display_value ||
        "",
      planned_premium: latest?.fields?.planned_premium?.display_value || "",
      latest_accumulation_value: latest?.fields?.accumulation_value?.display_value || "",
    },
    variance_summary: {
      death_benefit_variance: deathBenefitVariance,
      death_benefit_variance_display: formatCurrency(deathBenefitVariance),
      planned_premium_variance: premiumVariance,
      planned_premium_variance_display: formatCurrency(premiumVariance),
    },
    narrative: deathBenefitVariance === 0 && premiumVariance === 0 ? "Visible baseline and statement values currently show consistent death benefit and planned premium levels." : "Baseline-to-actual comparison is currently limited to core policy values because illustration ledger values were not identified.",
  };
}

function buildIllustrationProjectionAnalytics(baseline, statements) {
  const ledger = baseline?.illustrationProjection || {};
  const rows = Array.isArray(ledger.rows) ? ledger.rows : [];
  const benchmarkRows = Array.isArray(ledger.benchmark_rows) ? ledger.benchmark_rows : [];
  const latest = sortStatementsChronologically(statements).at(-1);
  const baselineStructuredQuality = getStructuredQuality(baseline);
  const baselineLedgerTables = getStructuredTableRows(baseline, "illustration_ledger");
  const baselineTableQuality = baselineLedgerTables.quality || [];
  const ledgerQualityStrong = baselineTableQuality.includes("strong");
  const structuredLedgerSupport = hasStrongStructuredSupport(baseline, "ledger");
  const ledgerQualityUsable =
    structuredLedgerSupport.supported ||
    ledgerQualityStrong ||
    baselineTableQuality.includes("moderate");
  const currentPolicyYear = fieldValue(latest?.fields?.policy_year);
  const currentAccumulationValue = fieldValue(latest?.fields?.accumulation_value);
  const currentCashSurrenderValue = fieldValue(latest?.fields?.cash_surrender_value);
  const matchedRow =
    currentPolicyYear !== null
      ? rows.find((row) => row.policy_year === currentPolicyYear) ||
        rows.find((row) => Math.abs(row.policy_year - currentPolicyYear) <= 1) ||
        null
      : null;

  const accumulationVariance =
    matchedRow?.accumulation_value?.value !== undefined &&
    matchedRow?.accumulation_value?.value !== null &&
    currentAccumulationValue !== null
      ? currentAccumulationValue - matchedRow.accumulation_value.value
      : null;
  const cashSurrenderVariance =
    matchedRow?.cash_surrender_value?.value !== undefined &&
    matchedRow?.cash_surrender_value?.value !== null &&
    currentCashSurrenderValue !== null
      ? currentCashSurrenderValue - matchedRow.cash_surrender_value.value
      : null;

  return {
    comparison_possible: rows.length > 0 && ledgerQualityUsable,
    row_count: rows.length,
    benchmark_rows: benchmarkRows.map((row) => ({
      policy_year: row.policy_year,
      attained_age: row.attained_age,
      premium_outlay: row.premium_outlay?.display || "",
      accumulation_value: row.accumulation_value?.display || "",
      cash_surrender_value: row.cash_surrender_value?.display || "",
      death_benefit: row.death_benefit?.display || "",
      source_page_number: row.source_page_number,
    })),
    current_projection_match:
      matchedRow && currentPolicyYear !== null
        ? {
            matched_policy_year: matchedRow.policy_year,
            actual_policy_year: currentPolicyYear,
            projected_accumulation_value: matchedRow.accumulation_value?.display || "",
            actual_accumulation_value: fieldDisplay(latest?.fields?.accumulation_value),
            accumulation_variance: accumulationVariance,
            accumulation_variance_display: formatCurrency(accumulationVariance),
            projected_cash_surrender_value: matchedRow.cash_surrender_value?.display || "",
            actual_cash_surrender_value: fieldDisplay(latest?.fields?.cash_surrender_value),
            cash_surrender_variance: cashSurrenderVariance,
            cash_surrender_variance_display: formatCurrency(cashSurrenderVariance),
          }
        : null,
    narrative:
      rows.length === 0
        ? "Projection support is still limited because no usable illustration ledger rows were identified."
        : !ledgerQualityUsable
          ? "Illustration ledger rows were detected, but the reconstruction quality is too weak to support a trusted projected-versus-actual comparison yet."
        : matchedRow && currentPolicyYear !== null
          ? accumulationVariance === null
            ? `Illustration checkpoints were identified through policy year ${matchedRow.policy_year}, but the current statement still lacks enough value support for a direct projected-versus-actual comparison.`
            : accumulationVariance >= 0
              ? `At the current visible policy year, actual accumulation value is tracking at or above the extracted illustration checkpoint by ${formatCurrency(accumulationVariance)}.`
              : `At the current visible policy year, actual accumulation value is trailing the extracted illustration checkpoint by ${formatCurrency(accumulationVariance)}.`
          : "Illustration checkpoints were identified, but the latest statement does not yet align cleanly enough by policy year for a direct projected-versus-actual comparison.",
    limitations:
      rows.length === 0
        ? ["No usable illustration ledger rows were extracted from the current baseline packet."]
        : !ledgerQualityUsable
          ? ["Illustration ledger reconstruction quality was weak, so projection comparison is being withheld."]
        : matchedRow
          ? []
          : ["Latest statement policy year did not align cleanly with the extracted illustration ledger rows."],
    reconstruction_quality: baselineTableQuality,
    structured_quality_summary: baselineStructuredQuality,
  };
}

function buildPolicyHealthStructure(legacyAnalytics, completenessAssessment, strategyHits) {
  const legacy = legacyAnalytics?.policy_health_score?.value || null;
  return {
    score: legacy?.value ?? null,
    status: legacy?.label?.toLowerCase() || "limited",
    factors: {
      funding: { status: legacy?.factors?.some((item) => /Funding|contribution/i.test(item)) ? "visible" : "limited" },
      growth: { status: legacy?.factors?.some((item) => /Accumulation|growth/i.test(item)) ? "visible" : "limited" },
      charges: { status: legacy?.factors?.some((item) => /charge/i.test(item)) ? "visible" : "limited" },
      loans: { status: legacy?.factors?.some((item) => /loan/i.test(item)) ? "visible" : "limited" },
      strategy_visibility: { status: strategyHits.length > 0 ? "visible" : "limited" },
      data_completeness: { status: completenessAssessment.status },
    },
    limitations: completenessAssessment.status === "basic" ? completenessAssessment.analysis_limitations : [],
  };
}

function buildPresentationValues(policy, analytics, completenessAssessment) {
  const structuredDebug = analytics?.structured_debug || {};
  const structuredStatementQuality = structuredDebug?.structured_quality_summary?.statement || null;
  const structuredStrategyUsed = Boolean(structuredDebug?.structured_strategy_used);
  return {
    confirmed_summary:
      structuredStatementQuality === "strong"
        ? "Core statement values are being supported by structured page reads, which improves continuity and charge confidence."
        : structuredStatementQuality === "moderate"
          ? "Core statement values are supported by partially structured page reads, which improves reliability where those pages were detected."
          : completenessAssessment.status === "strong"
            ? "Core baseline values, statement values, and supporting charge/strategy detail are visible."
            : completenessAssessment.status === "moderate"
              ? "Core policy values are visible, but some charge or strategy sections remain incomplete."
              : "Only a basic subset of policy and statement visibility is available from the uploaded packet.",
    limitations_summary: completenessAssessment.analysis_limitations.length > 0 ? completenessAssessment.analysis_limitations.join(" ") : "Current packet completeness is supporting the main analysis layers.",
    key_values: {
      issue_date: policy.policy_identity.issue_date,
      current_accumulation_value: policy.values.accumulation_value?.display_value || "",
      current_cash_surrender_value: policy.values.cash_surrender_value?.display_value || "",
      current_loan_balance: policy.loans.loan_balance?.display_value || "",
      current_index_strategy: policy.strategy.current_index_strategy,
    },
    growth_note: analytics.growth_attribution.explanation,
    charge_note: `${analytics.charge_attribution.explanation}${analytics.charge_summary?.structured_charge_rows?.length ? " Charge visibility is strengthened by structured charge-table support." : ""}`,
    comparison_note: analytics.illustration_comparison.narrative,
    strategy_note: structuredStrategyUsed
      ? "Strategy interpretation is using structured strategy rows instead of a single heuristic winner."
      : "Strategy interpretation is still relying on legacy field extraction where structured rows are not available.",
  };
}

export function buildPolicyIntelligence({ baseline, statements, legacyAnalytics, vaultAiSummary = [] }) {
  const normalizedPolicy = createEmptyNormalizedPolicy();
  const normalizedAnalytics = createEmptyNormalizedAnalytics();
  const sortedStatements = sortStatementsChronologically(statements);
  const latestStatement = sortedStatements.at(-1) || null;
  const preferredDeathBenefitField = selectPreferredDeathBenefitField(baseline, latestStatement);
  const carrierProfile = resolveCarrierProfile(baseline?.fields?.carrier_name?.display_value || latestStatement?.fields?.carrier_name?.display_value || "", [...(baseline?.pages || []), ...(latestStatement?.pages || [])]);
  const productProfile = resolveProductProfile(baseline?.fields?.product_name?.display_value || latestStatement?.fields?.product_name?.display_value || "", carrierProfile);
  const strategyReferenceHits = buildStrategyReferenceHits({ carrierProfile, productProfile, latestStatement });
  const completenessAssessment = buildCompletenessAssessment(baseline, sortedStatements);
  const coverageSummary = buildCoverageBySection(baseline, sortedStatements);
  const structuredStrategyInfo = getLatestStructuredStrategyRows(latestStatement);
  const structuredStrategyRows = structuredStrategyInfo.activeRows.length > 0
    ? structuredStrategyInfo.activeRows
    : structuredStrategyInfo.observedRows.length > 0
      ? structuredStrategyInfo.observedRows
      : structuredStrategyInfo.rows;
  const primaryStructuredStrategy = structuredStrategyRows[0] || null;
  const statementStructuredFlags = getStructuredFlags(latestStatement);
  const baselineStructuredFlags = getStructuredFlags(baseline);
  const statementExtractionSummary = getStructuredExtractionSummary(latestStatement);
  const strategyConfidenceTier = buildStrategyConfidenceTier(structuredStrategyInfo, latestStatement);

  normalizedPolicy.policy_identity = {
    carrier_name: fieldDisplay(baseline?.fields?.carrier_name) || fieldDisplay(latestStatement?.fields?.carrier_name),
    product_name: fieldDisplay(baseline?.fields?.product_name) || fieldDisplay(latestStatement?.fields?.product_name),
    policy_type: fieldDisplay(baseline?.fields?.policy_type) || fieldDisplay(latestStatement?.fields?.policy_type),
    policy_number: fieldDisplay(baseline?.fields?.policy_number) || fieldDisplay(latestStatement?.fields?.policy_number),
    issue_date: fieldDisplay(baseline?.fields?.issue_date),
    insured_name: "",
    owner_name: "",
  };
  normalizedPolicy.death_benefit = {
    death_benefit: baseline?.fields?.death_benefit || null,
    initial_face_amount: baseline?.fields?.initial_face_amount || null,
    current_death_benefit: latestStatement?.fields?.death_benefit || null,
    minimum_death_benefit: latestStatement?.fields?.minimum_death_benefit || null,
    option_type: fieldDisplay(baseline?.fields?.option_type),
  };
  normalizedPolicy.funding = {
    planned_premium: baseline?.fields?.planned_premium || latestStatement?.fields?.planned_premium || null,
    premium_paid_history: sortedStatements.filter((statement) => hasValue(statement.fields.premium_paid)).map((statement) => ({
      statement_date: fieldDisplay(statement.fields.statement_date),
      premium_paid: statement.fields.premium_paid,
    })),
    total_premium_paid: legacyAnalytics?.total_premium_paid?.value ?? null,
    minimum_premium: baseline?.fields?.minimum_premium || null,
    guideline_premium_limit: baseline?.fields?.guideline_premium_limit || null,
    mec_status: "",
  };
  normalizedPolicy.values = {
    accumulation_value: latestStatement?.fields?.accumulation_value || null,
    cash_value: latestStatement?.fields?.cash_value || null,
    cash_surrender_value: latestStatement?.fields?.cash_surrender_value || null,
    indexed_account_value: latestStatement?.fields?.indexed_account_value || null,
    fixed_account_value: latestStatement?.fields?.fixed_account_value || null,
  };
  normalizedPolicy.charges = {
    cost_of_insurance: latestStatement?.fields?.cost_of_insurance || null,
    admin_fee: latestStatement?.fields?.admin_fee || null,
    monthly_deduction: latestStatement?.fields?.monthly_deduction || null,
    expense_charge: latestStatement?.fields?.expense_charge || null,
    rider_charge: latestStatement?.fields?.rider_charge || null,
    total_policy_charges: legacyAnalytics?.total_policy_charges?.value ?? null,
  };
  normalizedPolicy.strategy = {
    current_index_strategy: primaryStructuredStrategy?.strategy || fieldDisplay(latestStatement?.fields?.index_strategy),
    allocation_percent: primaryStructuredStrategy?.allocation_percent !== null && primaryStructuredStrategy?.allocation_percent !== undefined
      ? buildStructuredField(primaryStructuredStrategy.allocation_percent, "percent")
      : latestStatement?.fields?.allocation_percent || null,
    index_credit: latestStatement?.fields?.index_credit || null,
    crediting_rate:
      primaryStructuredStrategy?.crediting_rate !== null && primaryStructuredStrategy?.crediting_rate !== undefined
        ? buildStructuredField(primaryStructuredStrategy.crediting_rate, "percent")
        : latestStatement?.fields?.crediting_rate || null,
    participation_rate:
      primaryStructuredStrategy?.participation_rate !== null && primaryStructuredStrategy?.participation_rate !== undefined
        ? buildStructuredField(primaryStructuredStrategy.participation_rate, "percent")
        : latestStatement?.fields?.participation_rate || null,
    cap_rate:
      primaryStructuredStrategy?.cap_rate !== null && primaryStructuredStrategy?.cap_rate !== undefined
        ? buildStructuredField(primaryStructuredStrategy.cap_rate, "percent")
        : latestStatement?.fields?.cap_rate || null,
    spread:
      primaryStructuredStrategy?.spread !== null && primaryStructuredStrategy?.spread !== undefined
        ? buildStructuredField(primaryStructuredStrategy.spread, "percent")
        : latestStatement?.fields?.spread || null,
    floor_rate: null,
    multiplier: null,
    observed_statement_strategies:
      structuredStrategyRows.length > 0
        ? structuredStrategyRows.map((row) => row.strategy).filter(Boolean)
        : latestStatement?.parserDebug?.fg_strategy_split?.active_statement_strategies ||
          latestStatement?.parserDebug?.fg_strategy_split?.observed_statement_strategies ||
          [],
    available_strategy_menu:
      structuredStrategyInfo.menuRows.length > 0 ||
      Boolean(latestStatement?.parserDebug?.fg_strategy_split?.strategy_menu_available) ||
      structuredStrategyRows.length > 1,
    strategy_source_evidence:
      structuredStrategyRows.length > 0
        ? structuredStrategyInfo.activeRows.length > 0
          ? "structured_strategy_rows_active"
          : "structured_strategy_rows_observed"
        : latestStatement?.parserDebug?.fg_strategy_split?.primary_strategy_source_evidence || "",
    strategy_menu_rows:
      structuredStrategyInfo.rows.length > 0
        ? structuredStrategyInfo.rows.map((row) => ({
            strategy: row.strategy,
            allocation_percent: row.allocation_percent ?? null,
            cap_rate: row.cap_rate ?? null,
            participation_rate: row.participation_rate ?? null,
            spread: row.spread ?? null,
            crediting_rate: row.crediting_rate ?? null,
            row_kind: row.row_kind || "observed",
            source_page_number: row.source_page_number,
          }))
        : baseline?.parserDebug?.fg_strategy_menu_rows || [],
    strategy_confidence: strategyConfidenceTier,
  };
  normalizedPolicy.loans = {
    loan_balance: latestStatement?.fields?.loan_balance || null,
    loan_interest: null,
    withdrawals: null,
    loan_activity: sortedStatements.filter((statement) => hasValue(statement.fields.loan_balance)).map((statement) => ({
      statement_date: fieldDisplay(statement.fields.statement_date),
      loan_balance: statement.fields.loan_balance,
    })),
  };
  normalizedPolicy.riders = {
    detected_riders: hasValue(latestStatement?.fields?.rider_charge) ? ["Visible rider charge row detected"] : [],
    rider_charge: latestStatement?.fields?.rider_charge || null,
  };
  normalizedPolicy.policy_timing = {
    statement_date: fieldDisplay(latestStatement?.fields?.statement_date),
    policy_year: fieldValue(latestStatement?.fields?.policy_year),
    insured_age: fieldValue(latestStatement?.fields?.insured_age),
  };
  normalizedPolicy.extraction_meta = {
    document_types_seen: [baseline?.documentType?.document_type, ...sortedStatements.map((statement) => statement.documentType?.document_type)].filter(Boolean),
    coverage_summary: coverageSummary,
    missing_sections: completenessAssessment.missing_sections,
    carrier_confidence: baseline?.carrierDetection?.confidence || latestStatement?.carrierDetection?.confidence || "low",
    product_confidence: normalizedPolicy.policy_identity.product_name ? "high" : "low",
    statement_processing_order: sortedStatements.map((statement) => ({
      file_name: statement.fileName,
      statement_date: fieldDisplay(statement.fields.statement_date),
      statement_date_value: statement.fields.statement_date?.value || null,
    })),
    newest_statement_selected: latestStatement
      ? {
          file_name: latestStatement.fileName,
          statement_date: fieldDisplay(latestStatement.fields.statement_date),
          statement_date_value: latestStatement.fields.statement_date?.value || null,
        }
      : null,
    structured_data_present:
      Boolean(statementStructuredFlags.structuredDataPresent) || Boolean(baselineStructuredFlags.structuredDataPresent),
    parser_version: statementStructuredFlags.parserVersion || baselineStructuredFlags.parserVersion || null,
    structured_quality_summary: statementStructuredFlags.quality || baselineStructuredFlags.quality || null,
    structured_strategy_used: structuredStrategyRows.length > 0 && ["strong", "moderate"].includes(structuredStrategyInfo.quality),
    fallback_used: !statementStructuredFlags.structuredDataPresent && !baselineStructuredFlags.structuredDataPresent,
    statement_extraction_summary: statementExtractionSummary,
  };

  normalizedAnalytics.performance_summary = {
    issue_date: normalizedPolicy.policy_identity.issue_date,
    latest_statement_date: normalizedPolicy.policy_timing.statement_date,
    carrier_name: normalizedPolicy.policy_identity.carrier_name,
    product_name: normalizedPolicy.policy_identity.product_name,
    policy_number: normalizedPolicy.policy_identity.policy_number,
    death_benefit: preferredDeathBenefitField?.display_value || "",
    total_premium_paid: formatCurrency(legacyAnalytics?.total_premium_paid?.value ?? null),
    current_accumulation_value: normalizedPolicy.values.accumulation_value?.display_value || "",
    current_cash_value: normalizedPolicy.values.cash_value?.display_value || "",
    current_cash_surrender_value: normalizedPolicy.values.cash_surrender_value?.display_value || "",
    current_loan_balance: normalizedPolicy.loans.loan_balance?.display_value || "",
    net_policy_growth: formatCurrency(legacyAnalytics?.net_policy_growth?.value ?? null),
    illustration_variance: formatCurrency(legacyAnalytics?.illustration_variance?.value ?? null),
  };
  normalizedAnalytics.timeline = buildTimelineAnalytics(baseline, sortedStatements);
  normalizedAnalytics.growth_attribution = buildGrowthAttribution(sortedStatements, legacyAnalytics);
  normalizedAnalytics.charge_attribution = buildChargeAttribution(sortedStatements, legacyAnalytics);
  normalizedAnalytics.charge_summary = buildNormalizedChargeSummary({
    latestStatement,
    legacyAnalytics,
  });
  normalizedAnalytics.illustration_comparison = buildIllustrationComparison(baseline, sortedStatements);
  normalizedAnalytics.illustration_projection = buildIllustrationProjectionAnalytics(baseline, sortedStatements);
  normalizedAnalytics.policy_health_score = buildPolicyHealthStructure(legacyAnalytics, completenessAssessment, strategyReferenceHits);
  normalizedAnalytics.review_flags = [
    ...(normalizedAnalytics.growth_attribution.efficiency_status === "growth_pressured" ? ["growth_pressured"] : []),
    ...(normalizedAnalytics.charge_attribution.attribution_status === "single_period_snapshot" ? ["single_period_charge_snapshot"] : []),
    ...(completenessAssessment.status === "basic" ? ["incomplete_packet"] : []),
  ];
  normalizedAnalytics.completeness_assessment = completenessAssessment;
  normalizedAnalytics.structured_debug = {
    structured_data_present:
      Boolean(statementStructuredFlags.structuredDataPresent) || Boolean(baselineStructuredFlags.structuredDataPresent),
    parser_version: statementStructuredFlags.parserVersion || baselineStructuredFlags.parserVersion || null,
    structured_quality_summary: statementStructuredFlags.quality || baselineStructuredFlags.quality || null,
    structured_strategy_used: structuredStrategyRows.length > 0 && ["strong", "moderate"].includes(structuredStrategyInfo.quality),
    fallback_used: !statementStructuredFlags.structuredDataPresent && !baselineStructuredFlags.structuredDataPresent,
    statement_extraction_summary: statementExtractionSummary,
    baseline_extraction_summary: getStructuredExtractionSummary(baseline),
    strategy_quality: structuredStrategyInfo.quality || null,
  };
  normalizedAnalytics.presentation_values = buildPresentationValues(normalizedPolicy, normalizedAnalytics, completenessAssessment);
  normalizedAnalytics.comparison_summary = buildPolicyComparisonSummary({
    normalizedPolicy,
    normalizedAnalytics,
  });

  return {
    carrierProfile,
    productProfile,
    strategyReferenceHits,
    normalizedPolicy,
    normalizedAnalytics,
    completenessAssessment,
    vaultAiSummary,
  };
}
