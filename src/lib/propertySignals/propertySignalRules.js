function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value) {
  if (typeof value === "string") {
    const normalized = value.replace(/[$,%\s,]/g, "");
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export const PROPERTY_SIGNAL_FLAG_LABELS = Object.freeze({
  valuationMissing: "No valuation on file",
  weakValuation: "Weak valuation support",
  linkageGap: "Property stack incomplete",
  debtVisibilityGap: "Debt visibility limited",
  protectionGap: "Protection linkage missing",
  incompleteFacts: "Property facts incomplete",
  marketSupportGap: "Market support limited",
  compQualityRisk: "Comparable support mixed",
  equityPressure: "Elevated equity pressure",
});

export function getMissingPropertyFacts(property = {}) {
  const fields = [
    "city",
    "state",
    "postal_code",
    "square_feet",
    "beds",
    "baths",
    "year_built",
    "last_purchase_price",
    "last_purchase_date",
  ];

  return fields.filter((field) => {
    const value = property?.[field];
    return value === null || value === undefined || value === "";
  });
}

export function buildPropertySignalFlags({
  property = null,
  latestValuation = null,
  propertyEquityPosition = null,
  propertyStackAnalytics = null,
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
} = {}) {
  const metadata = latestValuation?.metadata || {};
  const subjectCompleteness = toNumber(metadata.subject_completeness);
  const compFitScore = toNumber(metadata.comp_fit_score);
  const strongCompCount = toNumber(metadata.strong_comp_count) ?? 0;
  const valuationRangeRatio = toNumber(metadata.valuation_range_ratio);
  const estimatedLtv = toNumber(propertyEquityPosition?.estimated_ltv);
  const invalidSavedValuation = Boolean(propertyEquityPosition?.review_flags?.includes("invalid_saved_valuation"));
  const missingFacts = getMissingPropertyFacts(property);

  return {
    valuationMissing: !latestValuation?.id,
    weakValuation:
      invalidSavedValuation ||
      latestValuation?.confidence_label === "weak" ||
      (toNumber(latestValuation?.confidence_score) !== null && toNumber(latestValuation?.confidence_score) < 0.62),
    linkageGap:
      propertyStackAnalytics?.continuity_status === "weak" ||
      propertyStackAnalytics?.linkage_status === "property_only" ||
      linkedHomeownersPolicies.length === 0 ||
      (linkedMortgages.length === 0 && linkedHomeownersPolicies.length === 0),
    debtVisibilityGap:
      propertyEquityPosition?.financing_status === "missing" ||
      propertyEquityPosition?.financing_status === "linked_balance_missing" ||
      (linkedMortgages.length > 0 && propertyEquityPosition?.primary_mortgage_balance === null),
    protectionGap:
      propertyEquityPosition?.protection_status === "missing" || linkedHomeownersPolicies.length === 0,
    incompleteFacts:
      missingFacts.length >= 3 ||
      (subjectCompleteness !== null && subjectCompleteness < 0.72),
    marketSupportGap:
      Boolean(latestValuation?.id) &&
      ["mixed", "unavailable"].includes(metadata.official_market_support || "unavailable"),
    compQualityRisk:
      Boolean(latestValuation?.id) &&
      (
        strongCompCount === 0 ||
        (compFitScore !== null && compFitScore < 0.72) ||
        (valuationRangeRatio !== null && valuationRangeRatio >= 0.16) ||
        (Array.isArray(metadata.review_flags) &&
          metadata.review_flags.some((flag) =>
            ["limited_comp_support", "comp_similarity_mixed", "no_strong_core_comps"].includes(flag)
          ))
      ),
    equityPressure:
      (estimatedLtv !== null && estimatedLtv >= 0.8) ||
      Boolean(propertyEquityPosition?.review_flags?.includes("ltv_review_elevated")),
    missingFacts,
    subjectCompleteness,
  };
}

export function buildPropertySignalReasons({
  flags = {},
  latestValuation = null,
  propertyStackAnalytics = null,
  valuationChangeSummary = null,
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
} = {}) {
  const metadata = latestValuation?.metadata || {};
  const reasons = [];

  if (flags.valuationMissing) {
    reasons.push("No saved virtual valuation is available yet, so the property still lacks a current value range.");
  }

  if (flags.weakValuation) {
    reasons.push("The latest valuation support is weak or invalid, so the current value range should be treated cautiously.");
  }

  if (flags.incompleteFacts) {
    const missingFacts = (flags.missingFacts || []).slice(0, 3).join(", ");
    reasons.push(
      missingFacts
        ? `Core property facts are still incomplete, including ${missingFacts}, which keeps the review broader.`
        : "Core property facts are still incomplete, which weakens the valuation support."
    );
  }

  if (flags.compQualityRisk) {
    reasons.push("Comparable-sale support is mixed, so the current valuation reads as a broader range rather than a tight value call.");
  }

  if (flags.marketSupportGap) {
    reasons.push(
      metadata.official_market_support === "mixed"
        ? "Official market support is available but not fully aligned with the blended valuation."
        : "Official market support is not available in the latest valuation run."
    );
  }

  if (flags.debtVisibilityGap) {
    reasons.push(
      linkedMortgages.length > 0
        ? "Mortgage linkage exists, but current debt visibility is still incomplete."
        : "Financing visibility is still incomplete, so equity review is less reliable."
    );
  }

  if (flags.protectionGap) {
    reasons.push("No linked homeowners protection record is visible, so value and coverage are not being reviewed together yet.");
  }

  if (flags.linkageGap) {
    reasons.push(
      propertyStackAnalytics?.linkage_status
        ? `The property stack is still reading as ${String(propertyStackAnalytics.linkage_status).replace(/_/g, " ")}, not fully connected.`
        : "The property stack is not fully linked yet, so the overall property read is fragmented."
    );
  }

  if (flags.equityPressure) {
    reasons.push("Estimated loan-to-value appears elevated from the visible debt and valuation inputs.");
  }

  if (valuationChangeSummary?.change_status === "insufficient_history" && latestValuation?.id) {
    reasons.push("Valuation history is still shallow, so change tracking across runs is limited.");
  }

  if (
    reasons.length === 0 &&
    latestValuation?.id &&
    linkedHomeownersPolicies.length > 0 &&
    !flags.debtVisibilityGap
  ) {
    reasons.push("Value support, linkage visibility, and protection context are all currently reading as relatively stable.");
  }

  return unique(reasons).slice(0, 6);
}

export function buildPropertySignalConfidence({
  flags = {},
  latestValuation = null,
  propertyStackAnalytics = null,
  propertyEquityPosition = null,
  propertyValuationHistory = [],
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
} = {}) {
  let confidence = 0.34;

  if (latestValuation?.id) confidence += 0.14;
  if (latestValuation?.confidence_label === "strong") confidence += 0.18;
  else if (latestValuation?.confidence_label === "moderate") confidence += 0.1;

  if (propertyStackAnalytics?.id) confidence += 0.08;
  if (propertyEquityPosition) confidence += 0.08;
  if (propertyValuationHistory.length >= 2) confidence += 0.06;
  if (linkedMortgages.length > 0) confidence += 0.04;
  if (linkedHomeownersPolicies.length > 0) confidence += 0.04;

  if (flags.valuationMissing) confidence -= 0.14;
  if (flags.weakValuation) confidence -= 0.08;
  if (flags.incompleteFacts) confidence -= 0.08;
  if (flags.compQualityRisk) confidence -= 0.06;
  if (flags.marketSupportGap) confidence -= 0.04;

  return Number(clamp(confidence, 0.22, 0.94).toFixed(2));
}

export function derivePropertySignalLevel(flags = {}) {
  const activeCount = Object.entries(flags).filter(
    ([key, value]) => key !== "missingFacts" && key !== "subjectCompleteness" && Boolean(value)
  ).length;

  const severePressure =
    flags.equityPressure ||
    (flags.weakValuation && flags.compQualityRisk && (flags.debtVisibilityGap || flags.protectionGap)) ||
    (flags.valuationMissing && flags.incompleteFacts && (flags.debtVisibilityGap || flags.protectionGap));

  if (severePressure || activeCount >= 5) {
    return "at_risk";
  }

  if (activeCount >= 1) {
    return "monitor";
  }

  return "healthy";
}
