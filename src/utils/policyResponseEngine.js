import {
  buildPolicyComparisonAnalysis,
  buildPolicyContinuityScore,
  buildPolicyInterpretation,
  buildPolicyReviewReport,
  buildPolicyTrendSummary,
} from "../lib/domain/intelligenceEngine.js";
import { POLICY_QUESTION_TYPES } from "./policyQuestionClassifier.js";

const MISSING_FIELD_LABELS = {
  accumulation_value: "Account value",
  cash_value: "Cash value",
  cash_surrender_value: "Cash surrender value",
  death_benefit: "Death benefit",
  latest_statement_date: "Latest statement date",
  loan_balance: "Loan balance",
  planned_premium: "Planned premium",
  primary_strategy: "Primary strategy",
  total_coi: "Total COI",
  total_visible_policy_charges: "Visible policy charges",
};

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[$,%\s,]/g, ""));
  if (!Number.isFinite(numeric)) return String(value);
  return `${numeric < 0 ? "-" : ""}$${Math.abs(numeric).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function normalizeText(value, fallback = "Limited visibility") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function dedupe(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function normalizeHealthLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("performing_well")) return "Strong";
  if (normalized.includes("mixed") || normalized.includes("moderate")) return "Moderate";
  if (normalized.includes("underperforming") || normalized.includes("weak") || normalized.includes("risk")) {
    return "Watch Closely";
  }
  if (normalized.includes("insufficient")) return "Limited";
  return status ? String(status) : "Moderate";
}

function mapConfidence(score = 0, missingCount = 0) {
  if (score >= 82 && missingCount <= 2) return "high";
  if (score >= 58 && missingCount <= 5) return "medium";
  return "low";
}

function buildFact(label, value, source = "policy_engine") {
  if (value === null || value === undefined || value === "") return null;
  return { label, value: String(value), source };
}

function buildCurrentContext({
  policy = {},
  analytics = {},
  household_context = null,
  comparison_policy = null,
  precomputed = {},
} = {}) {
  const statementTimeline = Array.isArray(precomputed.statementTimeline) ? precomputed.statementTimeline : [];
  const comparisonRow = precomputed.comparisonRow || analytics?.comparison_summary || {};
  const chargeSummary = precomputed.chargeSummary || analytics?.charge_summary || {};
  const policyInterpretation =
    precomputed.policyInterpretation ||
    buildPolicyInterpretation(policy || {}, analytics || {}, statementTimeline);
  const trendSummary = precomputed.trendSummary || buildPolicyTrendSummary(statementTimeline);
  const reviewReport =
    precomputed.reviewReport ||
    buildPolicyReviewReport({
      comparisonRow,
      policy: precomputed.policyRecord || {},
      policyInterpretation,
      trendSummary,
      chargeSummary,
      statementTimeline,
      normalizedPolicy: policy || {},
      normalizedAnalytics: analytics || {},
      basicPolicyAnalysis: precomputed.basicPolicyAnalysis || {},
      gapAnalysis: precomputed.gapAnalysis || {},
      adequacyReview: precomputed.adequacyReview || {},
      groupedIssues: precomputed.groupedIssues || [],
      ranking: precomputed.ranking || null,
    });
  const missingFields = Array.isArray(comparisonRow?.missing_fields) ? comparisonRow.missing_fields : [];
  const continuity =
    precomputed.policyContinuity ||
    buildPolicyContinuityScore(comparisonRow, chargeSummary, missingFields);
  const comparisonAnalysis =
    comparison_policy?.precomputed?.comparisonRow || comparison_policy?.comparisonRow
      ? buildPolicyComparisonAnalysis(
          comparisonRow,
          comparison_policy?.precomputed?.comparisonRow || comparison_policy?.comparisonRow || {}
        )
      : null;

  return {
    policy,
    analytics,
    householdContext: household_context || null,
    statementTimeline,
    comparisonRow,
    chargeSummary,
    policyInterpretation,
    trendSummary,
    reviewReport,
    continuity,
    comparisonAnalysis,
    comparisonPolicy: comparison_policy || null,
    policySignals: precomputed.policySignals || null,
    iulV2: precomputed.iulV2 || null,
    missingFields,
  };
}

function buildSharedFacts(context) {
  return [
    buildFact("Policy health", normalizeHealthLabel(context.policyInterpretation?.performance_assessment?.status)),
    buildFact("Continuity score", `${Math.round(Number(context.continuity?.score || 0))}/100`),
    buildFact("Latest statement", formatDate(context.comparisonRow?.latest_statement_date), "statement_history"),
    buildFact(
      "Cash value",
      normalizeText(context.comparisonRow?.cash_value || context.policy?.values?.cash_value?.display_value || context.policy?.values?.cash_value),
      "policy_values"
    ),
    buildFact(
      "Loan balance",
      normalizeText(context.comparisonRow?.loan_balance || context.policy?.loans?.loan_balance?.display_value || context.policy?.loans?.loan_balance),
      "policy_loans"
    ),
    buildFact(
      "Visible COI",
      formatCurrency(context.chargeSummary?.total_coi ?? context.comparisonRow?.total_coi),
      "charge_summary"
    ),
    buildFact("Statements reviewed", context.statementTimeline.length, "statement_history"),
  ].filter(Boolean);
}

function buildUncertainties(context) {
  const missingFieldNotes = (context.missingFields || [])
    .slice(0, 5)
    .map((field) => `${MISSING_FIELD_LABELS[field] || field.replace(/_/g, " ")} is still incomplete.`);
  const continuityPenalties = (context.continuity?.penalties || [])
    .slice(0, 2)
    .map((item) => item?.reason || null);
  const iulMissing = (context.iulV2?.missingData || []).slice(0, 2);

  const items = dedupe([
    ...missingFieldNotes,
    ...continuityPenalties,
    ...iulMissing,
  ]);

  return items.length > 0
    ? items
    : ["Additional statement support would improve confidence in this explanation."];
}

function buildReviewFocus(context) {
  const reviewItems = context.policyInterpretation?.review_items || [];
  const reportBullets =
    context.reviewReport?.sections
      ?.filter((section) => section.kind === "bullets")
      ?.flatMap((section) => section.bullets || [])
      ?.slice(0, 3) || [];

  return dedupe([...reviewItems, ...reportBullets]).slice(0, 3);
}

function buildPerformanceResponse(context) {
  const directAnswer =
    context.policyInterpretation?.bottom_line_summary ||
    "Based on available information, this policy is readable, but performance confidence depends on statement support, visible charges, and continuity.";

  const why = dedupe([
    context.policyInterpretation?.growth_summary,
    context.policyInterpretation?.charge_summary_explanation,
    context.trendSummary?.summary,
    context.continuity?.explanation,
  ]).slice(0, 4);

  return {
    directAnswer,
    why,
  };
}

function buildChargeResponse(context) {
  const directAnswer =
    context.policyInterpretation?.charge_summary_explanation ||
    "Based on available information, charges are part of the policy read, but their full effect depends on stronger statement support and current cash-value context.";

  const why = dedupe([
    context.policyInterpretation?.charge_summary_explanation,
    context.comparisonRow?.charge_visibility_status
      ? `Charge visibility currently reads ${context.comparisonRow.charge_visibility_status}.`
      : "",
    context.chargeSummary?.coi_confidence
      ? `COI confidence currently reads ${context.chargeSummary.coi_confidence}.`
      : "",
    context.trendSummary?.summary,
  ]).slice(0, 4);

  return { directAnswer, why };
}

function buildComparisonResponse(context) {
  if (!context.comparisonPolicy || !context.comparisonAnalysis) {
    return {
      directAnswer:
        "A comparison read needs a second policy. Select another saved policy and VaultedShield will compare continuity, statement support, charges, and missing-data pressure.",
      why: ["Comparison support is not active until a second policy is selected."],
    };
  }

  const strongerAreas = (context.comparisonAnalysis?.stronger_areas || [])
    .slice(0, 3)
    .map((item) => item.summary);
  const weakerAreas = (context.comparisonAnalysis?.weaker_areas || [])
    .slice(0, 2)
    .map((item) => item.summary);

  return {
    directAnswer: context.comparisonAnalysis.summary,
    why: dedupe([...strongerAreas, ...weakerAreas]).slice(0, 5),
  };
}

function buildIllustrationResponse(context) {
  const illustration = context.iulV2?.illustrationComparison || null;
  if (!illustration) {
    return {
      directAnswer:
        "Based on available information, illustration-versus-actual alignment cannot be fully determined from the current packet alone.",
      why: [
        "Illustration support is not yet strong enough for a fuller projected-versus-actual read.",
      ],
    };
  }

  return {
    directAnswer:
      illustration.shortExplanation ||
      illustration.explanation ||
      "Illustration alignment is visible, but should still be read with care.",
    why: dedupe([
      illustration.directAnswer,
      illustration.selectedMetricData?.illustratedDisplay
        ? `Illustrated ${illustration.selectedMetricLabel || "value"}: ${illustration.selectedMetricData.illustratedDisplay}.`
        : "",
      illustration.selectedMetricData?.actualDisplay
        ? `Actual ${illustration.selectedMetricLabel || "value"}: ${illustration.selectedMetricData.actualDisplay}.`
        : "",
      illustration.varianceDisplay ? `Variance: ${illustration.varianceDisplay}.` : "",
      illustration.drivers?.[0]?.label ? `Primary driver: ${illustration.drivers[0].label}.` : "",
    ]).slice(0, 5),
  };
}

function buildLoanResponse(context) {
  const loanBalance =
    context.comparisonRow?.loan_balance ||
    context.policy?.loans?.loan_balance?.display_value ||
    context.policy?.loans?.loan_balance ||
    "Limited visibility";

  return {
    directAnswer:
      loanBalance === "0" || loanBalance === "$0" || loanBalance === "$0.00"
        ? "Based on available information, loans do not currently appear to be a dominant pressure point."
        : "Based on available information, loan pressure should be read together with cash value, charges, and continuity support before drawing stronger conclusions.",
    why: dedupe([
      `Visible loan balance: ${loanBalance}.`,
      context.policyInterpretation?.current_position_summary,
      context.continuity?.explanation,
    ]).slice(0, 4),
  };
}

function buildPolicyHealthResponse(context) {
  const reviewFocus = buildReviewFocus(context);

  return {
    directAnswer:
      context.policyInterpretation?.confidence_summary ||
      context.policyInterpretation?.bottom_line_summary ||
      "Based on available information, this policy is understandable, but several areas still deserve structured review.",
    why: dedupe([
      context.policyInterpretation?.bottom_line_summary,
      context.policyInterpretation?.confidence_summary,
      context.continuity?.explanation,
      reviewFocus[0] ? `The current top review focus is ${reviewFocus[0]}.` : "",
    ]).slice(0, 4),
  };
}

function buildMissingDataResponse(context) {
  const uncertainties = buildUncertainties(context);
  return {
    directAnswer:
      uncertainties.length > 0
        ? `Based on available information, the main missing or weaker areas are: ${uncertainties.slice(0, 3).join(" ")}`
        : "Based on available information, no major missing-data blocker is standing out right now.",
    why: uncertainties.slice(0, 4),
  };
}

function buildGeneralResponse(context) {
  return {
    directAnswer:
      context.policyInterpretation?.bottom_line_summary ||
      "Based on available information, this policy can be explained at a high level, but the best read still depends on continuity, charge visibility, and statement support.",
    why: dedupe([
      context.policyInterpretation?.policy_overview_summary,
      context.policyInterpretation?.current_position_summary,
      context.trendSummary?.summary,
      context.continuity?.explanation,
    ]).slice(0, 4),
  };
}

function buildResponseByType(type, context) {
  switch (type) {
    case POLICY_QUESTION_TYPES.performance:
      return buildPerformanceResponse(context);
    case POLICY_QUESTION_TYPES.charges:
      return buildChargeResponse(context);
    case POLICY_QUESTION_TYPES.comparison:
      return buildComparisonResponse(context);
    case POLICY_QUESTION_TYPES.illustration_vs_actual:
      return buildIllustrationResponse(context);
    case POLICY_QUESTION_TYPES.loans:
      return buildLoanResponse(context);
    case POLICY_QUESTION_TYPES.policy_health:
      return buildPolicyHealthResponse(context);
    case POLICY_QUESTION_TYPES.missing_data:
      return buildMissingDataResponse(context);
    case POLICY_QUESTION_TYPES.general:
    default:
      return buildGeneralResponse(context);
  }
}

export function generatePolicyResponse({
  question = "",
  type = POLICY_QUESTION_TYPES.general,
  policy = {},
  analytics = {},
  household_context = null,
  comparison_policy = null,
  precomputed = {},
} = {}) {
  const context = buildCurrentContext({
    policy,
    analytics,
    household_context,
    comparison_policy,
    precomputed,
  });
  const responseCore = buildResponseByType(type, context);
  const facts = buildSharedFacts(context);
  const uncertainties = buildUncertainties(context);
  const reviewFocus = buildReviewFocus(context);
  const confidence = mapConfidence(context.continuity?.score || 0, context.missingFields.length);
  const answer = responseCore.directAnswer;

  return {
    answer,
    supporting_data: {
      question: String(question || "").trim(),
      type,
      direct_answer: answer,
      why: responseCore.why || [],
      facts,
      uncertainties,
      review_focus: reviewFocus,
    },
    confidence,
    source: "policy_engine",
    evidence: facts,
    missingData: uncertainties,
    disclaimers: [
      "This explanation is based on the currently available policy evidence and is not financial advice.",
    ],
  };
}

export default generatePolicyResponse;
