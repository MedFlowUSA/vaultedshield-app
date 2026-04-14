import { PROPERTY_QUESTION_TYPES } from "./propertyQuestionClassifier.js";

function dedupe(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function formatCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.round(numeric * 100)}%`;
}

function buildFact(label, value, source = "property_engine") {
  if (value === null || value === undefined || value === "") return null;
  return { label, value: String(value), source };
}

function mapConfidence(label = "", signalConfidence = null) {
  if (Number.isFinite(signalConfidence)) {
    if (signalConfidence >= 0.78) return "high";
    if (signalConfidence >= 0.52) return "medium";
    return "low";
  }

  if (label === "strong") return "high";
  if (label === "moderate") return "medium";
  return "low";
}

function buildPropertyContext({
  property = {},
  analytics = {},
  precomputed = {},
} = {}) {
  const linkedMortgages = Array.isArray(precomputed.linkedMortgages) ? precomputed.linkedMortgages : [];
  const linkedHomeownersPolicies = Array.isArray(precomputed.linkedHomeownersPolicies)
    ? precomputed.linkedHomeownersPolicies
    : [];
  const propertyDocuments = Array.isArray(precomputed.propertyDocuments) ? precomputed.propertyDocuments : [];
  const propertySnapshots = Array.isArray(precomputed.propertySnapshots) ? precomputed.propertySnapshots : [];
  const propertyAnalytics = Array.isArray(precomputed.propertyAnalytics) ? precomputed.propertyAnalytics : [];
  const portalLinks = Array.isArray(precomputed.portalLinks) ? precomputed.portalLinks : [];
  const latestValuation = precomputed.latestPropertyValuation || null;
  const valuationChangeSummary = precomputed.valuationChangeSummary || null;
  const propertyEquityPosition = precomputed.propertyEquityPosition || null;
  const propertyStackAnalytics = precomputed.propertyStackAnalytics || null;
  const propertySignals = precomputed.propertySignals || null;

  const missingFacts = [];
  ["property_address", "city", "state", "postal_code", "square_feet", "beds", "baths", "year_built"].forEach(
    (field) => {
      const value = property?.[field];
      if (value === null || value === undefined || value === "") missingFacts.push(field);
    }
  );

  return {
    property,
    analytics,
    linkedMortgages,
    linkedHomeownersPolicies,
    propertyDocuments,
    propertySnapshots,
    propertyAnalytics,
    portalLinks,
    latestValuation,
    valuationChangeSummary,
    propertyEquityPosition,
    propertyStackAnalytics,
    propertySignals,
    missingFacts,
  };
}

function buildSharedFacts(context) {
  return [
    buildFact("Valuation confidence", context.latestValuation?.confidence_label || "Limited"),
    buildFact("Midpoint estimate", formatCurrency(context.latestValuation?.midpoint_estimate)),
    buildFact("Comp count", context.latestValuation?.comps_count ?? null),
    buildFact("Stack completeness", formatPercent(context.propertyStackAnalytics?.completeness_score)),
    buildFact("Linked mortgages", context.linkedMortgages.length),
    buildFact("Linked homeowners", context.linkedHomeownersPolicies.length),
    buildFact("Property documents", context.propertyDocuments.length),
    buildFact("Linked portals", context.portalLinks.length),
    buildFact("Equity visibility", context.propertyEquityPosition?.equity_visibility_status || "Limited"),
  ].filter(Boolean);
}

function buildUncertainties(context) {
  const valuationFlags = context.latestValuation?.metadata?.review_flags || [];
  return dedupe([
    context.latestValuation ? null : "A saved virtual valuation is not available yet.",
    context.missingFacts.length > 0
      ? `Core property facts remain incomplete: ${context.missingFacts.slice(0, 4).join(", ")}.`
      : null,
    context.propertyDocuments.length === 0 ? "No property-specific documents are attached yet." : null,
    context.linkedMortgages.length === 0 ? "No linked mortgage is visible yet." : null,
    context.linkedHomeownersPolicies.length === 0
      ? "No linked homeowners protection is visible yet."
      : null,
    context.portalLinks.length === 0 ? "No linked portals are visible yet." : null,
    valuationFlags[0] ? `Valuation review flag: ${valuationFlags[0].replace(/_/g, " ")}.` : null,
  ]);
}

function buildReviewFocus(context) {
  return dedupe([
    context.propertySignals?.reasons?.[0],
    context.propertySignals?.reasons?.[1],
    context.valuationChangeSummary?.summary,
    context.propertyEquityPosition?.prompts?.[0],
    context.propertyStackAnalytics?.prompts?.[0],
  ]).slice(0, 4);
}

function buildSectionTargets(type) {
  switch (type) {
    case PROPERTY_QUESTION_TYPES.stack_completeness:
      return ["property-stack-analytics", "linked-context"];
    case PROPERTY_QUESTION_TYPES.valuation_read:
      return ["valuation"];
    case PROPERTY_QUESTION_TYPES.linked_context:
      return ["linked-context", "property-stack-analytics"];
    case PROPERTY_QUESTION_TYPES.protections:
      return ["property-stack-analytics", "linked-context"];
    case PROPERTY_QUESTION_TYPES.liabilities:
      return ["linked-context", "property-stack-analytics"];
    case PROPERTY_QUESTION_TYPES.documents:
      return ["documents"];
    case PROPERTY_QUESTION_TYPES.portals:
      return ["portals"];
    case PROPERTY_QUESTION_TYPES.missing_data:
      return ["documents", "property-stack-analytics"];
    case PROPERTY_QUESTION_TYPES.general:
    default:
      return ["continuity-command", "valuation"];
  }
}

function buildResponseByType(type, context) {
  const valuationConfidence = context.latestValuation?.confidence_label || "limited";
  const stackCompleteness = formatPercent(context.propertyStackAnalytics?.completeness_score) || "not scored";
  const officialSupport = context.latestValuation?.metadata?.official_market_support || "unavailable";

  switch (type) {
    case PROPERTY_QUESTION_TYPES.stack_completeness:
      return {
        answer:
          context.propertyStackAnalytics?.completeness_score >= 0.85
            ? "Based on available data, this property stack appears broadly complete enough for a stronger household review."
            : "Based on available data, this property stack is still partial, so value, liabilities, and protections are not yet reading as one complete record.",
        whyThisRead: [
          `Stack completeness currently reads ${stackCompleteness}.`,
          `Linked mortgages visible: ${context.linkedMortgages.length}.`,
          `Linked homeowners policies visible: ${context.linkedHomeownersPolicies.length}.`,
          context.propertyStackAnalytics?.continuity_status
            ? `Continuity currently reads ${context.propertyStackAnalytics.continuity_status}.`
            : "A persisted continuity read is not available yet.",
        ],
      };
    case PROPERTY_QUESTION_TYPES.valuation_read:
      return {
        answer:
          valuationConfidence === "strong"
            ? "Based on available data, the valuation read appears well supported for a virtual review."
            : valuationConfidence === "moderate"
              ? "Based on available data, the valuation read is usable, but the support stack is still mixed rather than tight."
              : "Based on available data, the valuation read is still thin, so it should be treated as a broad review range rather than a settled value call.",
        whyThisRead: dedupe([
          context.latestValuation?.midpoint_estimate
            ? `Current midpoint estimate: ${formatCurrency(context.latestValuation.midpoint_estimate)}.`
            : "A current midpoint estimate is not available yet.",
          context.latestValuation?.confidence_score !== null &&
          context.latestValuation?.confidence_score !== undefined
            ? `Confidence score: ${formatPercent(context.latestValuation.confidence_score)}.`
            : null,
          `Official market support currently reads ${officialSupport}.`,
          context.valuationChangeSummary?.summary || null,
        ]).slice(0, 4),
      };
    case PROPERTY_QUESTION_TYPES.linked_context:
      return {
        answer:
          context.linkedMortgages.length > 0 || context.linkedHomeownersPolicies.length > 0
            ? "Based on available data, linked context is visible, but the operating graph still depends on how complete the financing, protection, and document links are."
            : "Based on available data, linked context is still thin, so this property is not yet well integrated into the broader household workflow.",
        whyThisRead: [
          `Linked mortgages visible: ${context.linkedMortgages.length}.`,
          `Linked homeowners policies visible: ${context.linkedHomeownersPolicies.length}.`,
          `Linked portals visible: ${context.portalLinks.length}.`,
          context.propertyStackAnalytics?.linkage_status
            ? `Stored linkage status: ${String(context.propertyStackAnalytics.linkage_status).replace(/_/g, " ")}.`
            : "A stored linkage status is not available yet.",
        ],
      };
    case PROPERTY_QUESTION_TYPES.protections:
      return {
        answer:
          context.linkedHomeownersPolicies.length > 0
            ? "Based on available data, protection is visible on this property record, although confidence still depends on document and continuity depth."
            : "Based on available data, linked protection was not identified on this property record yet.",
        whyThisRead: [
          `Linked homeowners policies visible: ${context.linkedHomeownersPolicies.length}.`,
          context.propertyEquityPosition?.protection_status
            ? `Protection status currently reads ${context.propertyEquityPosition.protection_status}.`
            : "A stored protection status is not available yet.",
          context.propertyStackAnalytics?.has_homeowners !== undefined
            ? `Property stack says homeowners coverage is ${context.propertyStackAnalytics.has_homeowners ? "linked" : "not linked"}.`
            : null,
        ].filter(Boolean),
      };
    case PROPERTY_QUESTION_TYPES.liabilities:
      return {
        answer:
          context.linkedMortgages.length > 0
            ? "Based on available data, liability context is visible enough to connect this property to mortgage review."
            : "Based on available data, liability context is still incomplete because a linked mortgage is not clearly visible yet.",
        whyThisRead: [
          `Linked mortgages visible: ${context.linkedMortgages.length}.`,
          context.propertyEquityPosition?.primary_mortgage_balance !== null &&
          context.propertyEquityPosition?.primary_mortgage_balance !== undefined
            ? `Primary mortgage balance: ${formatCurrency(context.propertyEquityPosition.primary_mortgage_balance)}.`
            : "Primary mortgage balance is not clearly visible.",
          context.propertyEquityPosition?.financing_status
            ? `Financing status currently reads ${context.propertyEquityPosition.financing_status}.`
            : null,
        ].filter(Boolean),
      };
    case PROPERTY_QUESTION_TYPES.documents:
      return {
        answer:
          context.propertyDocuments.length > 0
            ? "Based on available data, document support is present on this property record, although a fuller review still depends on the depth and relevance of those files."
            : "Based on available data, document support is still light because no property-specific documents are visible yet.",
        whyThisRead: [
          `Property documents visible: ${context.propertyDocuments.length}.`,
          `Property snapshots visible: ${context.propertySnapshots.length}.`,
          `Property analytics rows visible: ${context.propertyAnalytics.length}.`,
        ],
      };
    case PROPERTY_QUESTION_TYPES.portals:
      return {
        answer:
          context.portalLinks.length > 0
            ? "Based on available data, portal continuity is visible enough to support access review on this property."
            : "Based on available data, portal continuity is not visible yet, so county, tax, or related access support may still be thin.",
        whyThisRead: [
          `Linked portals visible: ${context.portalLinks.length}.`,
          context.portalLinks[0]?.portal_profiles?.institution_name
            ? `First visible portal institution: ${context.portalLinks[0].portal_profiles.institution_name}.`
            : null,
          context.portalLinks[0]?.portal_profiles?.recovery_contact_hint
            ? "Recovery guidance is visible for at least one linked portal."
            : null,
        ].filter(Boolean),
      };
    case PROPERTY_QUESTION_TYPES.missing_data:
      return {
        answer:
          buildUncertainties(context).length > 0
            ? `Based on available data, the main missing areas are ${buildUncertainties(context)
                .slice(0, 2)
                .join(" ")}`
            : "Based on available data, no major missing-data blocker is standing out right now.",
        whyThisRead: buildUncertainties(context).slice(0, 4),
      };
    case PROPERTY_QUESTION_TYPES.general:
    default:
      return {
        answer:
          context.propertySignals?.signalLevel
            ? `Based on available data, this property currently reads as ${String(context.propertySignals.signalLevel).replace(/_/g, " ")}, with the strongest next review usually sitting in valuation support, linkage depth, or missing records.`
            : "Based on available data, this property can be reviewed at a high level, but the strongest read still depends on valuation support, linked context, and document depth.",
        whyThisRead: dedupe([
          context.propertySignals?.reasons?.[0],
          context.propertySignals?.reasons?.[1],
          context.valuationChangeSummary?.summary,
        ]).slice(0, 4),
      };
  }
}

export function generatePropertyResponse({
  question = "",
  type = PROPERTY_QUESTION_TYPES.general,
  property = {},
  analytics = {},
  precomputed = {},
} = {}) {
  const context = buildPropertyContext({
    property,
    analytics,
    precomputed,
  });
  const core = buildResponseByType(type, context);
  const facts = buildSharedFacts(context);
  const uncertainties = buildUncertainties(context);
  const safeReviewFocus = buildReviewFocus(context);

  return {
    answer: core.answer,
    whyThisRead: core.whyThisRead || [],
    why_this_read: core.whyThisRead || [],
    supportingData: {
      question: String(question || "").trim(),
      type,
      facts,
      uncertainties,
      review_focus: safeReviewFocus,
    },
    supporting_data: {
      question: String(question || "").trim(),
      type,
      facts,
      uncertainties,
      review_focus: safeReviewFocus,
      why: core.whyThisRead || [],
    },
    uncertainty:
      uncertainties.length > 0
        ? "A more complete property review would require stronger valuation support, more linked records, or deeper document visibility."
        : null,
    safeReviewFocus: safeReviewFocus,
    safe_review_focus: safeReviewFocus,
    confidence: mapConfidence(context.latestValuation?.confidence_label, context.propertySignals?.confidence),
    source: "property_engine",
    sourceMetadata: {
      label: "property_engine",
      recordId: property?.id || null,
      documentCount: context.propertyDocuments.length,
      portalCount: context.portalLinks.length,
      mortgageLinkCount: context.linkedMortgages.length,
      homeownersLinkCount: context.linkedHomeownersPolicies.length,
    },
    source_metadata: {
      label: "property_engine",
      record_id: property?.id || null,
      document_count: context.propertyDocuments.length,
      portal_count: context.portalLinks.length,
      mortgage_link_count: context.linkedMortgages.length,
      homeowners_link_count: context.linkedHomeownersPolicies.length,
    },
    sectionTargets: buildSectionTargets(type),
  };
}

export default generatePropertyResponse;
