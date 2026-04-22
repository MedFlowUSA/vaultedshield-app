import {
  buildFasciaExplanation,
  buildFasciaExplanationToggleAction,
  finalizeFascia,
  normalizeFasciaAction,
} from "./fasciaContract.js";

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildMeaning({ status, propertyLabel }) {
  if (status === "Strong") {
    return `${propertyLabel} looks strong. We have enough data to understand the property clearly.`;
  }

  if (status === "Stable") {
    return `${propertyLabel} looks mostly stable right now, but it should still be checked from time to time.`;
  }

  if (status === "At Risk") {
    return `${propertyLabel} shows a problem that needs attention before you treat it as okay.`;
  }

  if (status === "Incomplete") {
    return `${propertyLabel} is partly readable, but key property details are still missing.`;
  }

  if (status === "Partial") {
    return `${propertyLabel} has some usable property data, but not enough yet for a full answer.`;
  }

  if (status === "Needs Review") {
    return `${propertyLabel} is readable, but something still needs a closer look before you rely on it.`;
  }

  return "There is not enough property data yet to tell what is going on.";
}

function buildExplanationSummary({
  meaning,
  hasPersistedStackAnalytics,
  hasValuation,
}) {
  if (!hasPersistedStackAnalytics && !hasValuation) {
    return `${meaning} This is based on the property data we could load because saved valuation and deeper analytics are still limited.`;
  }

  if (!hasPersistedStackAnalytics) {
    return `${meaning} This is using current property data and valuation support, even though deeper saved analytics are not stored yet.`;
  }

  return `${meaning} This is using the current property data together with saved valuation and support context.`;
}

function buildDrivers({ propertySignals, propertyActionFeed = [], linkedMortgages = [], linkedHomeownersPolicies = [] }) {
  const reasons = Array.isArray(propertySignals?.reasons) ? propertySignals.reasons : [];
  const drivers = [];

  if (linkedMortgages.length > 0) drivers.push(`${linkedMortgages.length} mortgage link${linkedMortgages.length === 1 ? "" : "s"} visible`);
  if (linkedHomeownersPolicies.length > 0) {
    drivers.push(`${linkedHomeownersPolicies.length} homeowners link${linkedHomeownersPolicies.length === 1 ? "" : "s"} visible`);
  }

  drivers.push(...reasons);

  if (propertyActionFeed[0]?.summary) {
    drivers.push(propertyActionFeed[0].summary);
  }

  return unique(drivers).slice(0, 3);
}

function buildDataSources({
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
  latestValuation = null,
  propertyStackAnalytics = null,
}) {
  const sources = [
    "Live property record facts, status, and property-level review signals",
    latestValuation?.id
      ? "Saved virtual valuation support, comp evidence, and value-range confidence"
      : "Current valuation-support checks for value visibility and confidence",
    propertyStackAnalytics?.id
      ? "Persisted property stack analytics for continuity, linkage, and completeness"
      : "Live property stack continuity checks because persisted stack analytics are not stored yet",
    linkedMortgages.length > 0
      ? `${pluralize(linkedMortgages.length, "linked mortgage")} contributing debt visibility`
      : "Mortgage-linkage visibility checks for this property",
    linkedHomeownersPolicies.length > 0
      ? `${pluralize(linkedHomeownersPolicies.length, "linked homeowners policy")} contributing protection visibility`
      : "Homeowners-linkage visibility checks for this property",
  ];

  return unique(sources).slice(0, 5);
}

function buildStatusReasoning({
  status,
  confidence,
  flags = {},
  hasValuation,
  hasDebtVisibility,
  hasProtectionVisibility,
  propertySignals,
  propertyStackAnalytics,
}) {
  if (status === "Strong") {
    return "This status was assigned because valuation support is present, debt and protection linkage are visible, confidence is high, and the property stack does not currently show a material completeness gap.";
  }

  if (status === "Stable") {
    return "This status was assigned because the property bundle currently reads as generally supported, even though ongoing valuation and linkage review should still remain active.";
  }

  if (status === "At Risk") {
    return flags.equityPressure
      ? "This status was assigned because the property stack shows visible pressure in valuation or equity support, so the current read should not be treated as settled."
      : "This status was assigned because the live property signal is currently reading at risk.";
  }

  if (status === "Incomplete") {
    return "This status was assigned because missing valuation support, incomplete facts, or a materially weak stack completeness read are limiting the reliability of the current property interpretation.";
  }

  if (status === "Partial") {
    return "This status was assigned because the property has some live signals, but not enough valuation, linkage, or stored stack support yet for a dependable full-stack read.";
  }

  if (status === "Needs Review") {
    return flags.linkageGap || flags.marketSupportGap || flags.compQualityRisk || flags.stackCompletenessGap
      ? "This status was assigned because the property is readable, but visible support gaps or mixed stack signals still need follow-up."
      : "This status was assigned because the property bundle is usable, but not settled enough to treat as fully supported yet.";
  }

  if (!propertySignals || (!propertyStackAnalytics && !hasValuation && !hasDebtVisibility && !hasProtectionVisibility && confidence <= 0)) {
    return "This status was assigned because the page does not yet have enough valuation, linkage, or stack support for a reliable property interpretation.";
  }

  return "This status was assigned because the page does not yet have enough readable property evidence for a confident interpretation.";
}

function buildLimitations({
  flags = {},
  confidence,
  latestValuation = null,
  propertyStackAnalytics = null,
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
}) {
  const limitations = [];

  if (!latestValuation?.id || flags.valuationMissing) {
    limitations.push("No current saved virtual valuation is available to confirm a stronger value range.");
  }

  if (!propertyStackAnalytics?.id) {
    limitations.push("Persisted property stack analytics are not stored yet, so this read leans more heavily on live property signals.");
  }

  if (linkedMortgages.length === 0 || flags.debtVisibilityGap || flags.linkageGap) {
    limitations.push("Financing visibility is still limited because a supporting mortgage link is not fully confirmed.");
  }

  if (linkedHomeownersPolicies.length === 0 || flags.protectionGap || flags.linkageGap) {
    limitations.push("Protection visibility is still limited because a supporting homeowners link is not fully confirmed.");
  }

  if (flags.incompleteFacts) {
    limitations.push("Important property facts are still incomplete, which weakens valuation and continuity confidence.");
  }

  if (flags.stackCompletenessCritical || flags.stackCompletenessGap) {
    limitations.push("Property stack completeness is still below a comfortable support level.");
  }

  if (flags.marketSupportGap || flags.compQualityRisk || flags.weakValuation) {
    limitations.push("Market and comp support are still mixed, so the current value picture should be treated cautiously.");
  }

  if (confidence > 0 && confidence < 0.55) {
    limitations.push(`Property signal confidence remains limited at ${Math.round(confidence * 100)}%, so this interpretation should be treated as provisional.`);
  }

  if (limitations.length === 0) {
    limitations.push("No major limitation stands out beyond the normal need to keep valuation, financing, and protection linkage current.");
  }

  return unique(limitations).slice(0, 4);
}

function mapPropertyAction(action = null) {
  if (!action?.target || !action?.actionLabel) return null;
  return normalizeFasciaAction({
    label: action.actionLabel,
    target: action.target,
  });
}

function buildRecommendedAction(primaryAction = null) {
  if (!primaryAction?.label) {
    return {
      label: "Review property command",
      detail: "Start with the highest-priority property blocker so the next decision is grounded in the clearest valuation and linkage issues.",
      action: normalizeFasciaAction({
        label: "Review property command",
        target: {
          type: "scroll_section",
          section: "continuity-command",
        },
      }),
    };
  }

  const detailsByLabel = {
    "Open valuation review":
      "Open valuation review first to confirm the current value range, comp support, and confidence level behind this property read.",
    "Open equity review":
      "Open the equity review to confirm how value and debt are combining into the current property pressure read.",
    "Review property facts":
      "Open the property facts section to tighten the subject record and reduce uncertainty in later valuation and continuity reads.",
    "Review property command":
      "Open the property command section first to see the clearest blockers, why they matter, and what should be handled next.",
    "Open stack analytics":
      "Open stack analytics to review continuity, linkage completeness, and stored prompts behind this property interpretation.",
    "Review linked context":
      "Open linked context to see how this property connects across debt, protection, portals, and documents before relying on the current read.",
  };

  return {
    label: primaryAction.label,
    detail:
      detailsByLabel[primaryAction.label] ||
      "Use the recommended section to strengthen the property interpretation with the most relevant supporting context.",
    action: primaryAction,
  };
}

function buildCompletenessNote({ propertySignals, linkedMortgages = [], linkedHomeownersPolicies = [] }) {
  const stackScore = propertySignals?.metadata?.stackCompletenessScore;
  const stackLabel = propertySignals?.metadata?.stackCompletenessLabel;

  if (!propertySignals) {
    return "Property signals are not available yet.";
  }

  if (stackScore !== null && stackScore !== undefined && stackLabel) {
    return `Using current property data with ${stackLabel.toLowerCase()} completeness at ${Math.round(Number(stackScore) * 100)}%.`;
  }

  if (linkedMortgages.length === 0 || linkedHomeownersPolicies.length === 0) {
    return "Using current property data while financing or insurance links are still incomplete.";
  }

  return "Using current property data from valuation, equity, and linked records.";
}

export default function buildPropertyPageFascia({
  property = null,
  propertySignals = null,
  propertyActionFeed = [],
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
  latestValuation = null,
  propertyStackAnalytics = null,
} = {}) {
  const propertyLabel = property?.property_name || property?.property_address || "This property";
  const flags = propertySignals?.flags || {};
  const confidence = safeNumber(propertySignals?.confidence, 0);
  const activeFlagCount = Object.values(flags).filter(Boolean).length;
  const stackScore = propertySignals?.metadata?.stackCompletenessScore;
  const hasValuation = Boolean(latestValuation?.id);
  const hasStackAnalytics = Boolean(propertyStackAnalytics?.id);
  const hasDebtVisibility = linkedMortgages.length > 0 && !flags.debtVisibilityGap;
  const hasProtectionVisibility = linkedHomeownersPolicies.length > 0 && !flags.protectionGap;

  let status = "Not Enough Data";
  if (!property || !propertySignals) {
    status = "Not Enough Data";
  } else if (propertySignals.signalLevel === "at_risk") {
    status = "At Risk";
  } else if (
    propertySignals.signalLevel === "healthy" &&
    confidence >= 0.8 &&
    hasValuation &&
    hasDebtVisibility &&
    hasProtectionVisibility &&
    !flags.stackCompletenessGap
  ) {
    status = "Strong";
  } else if (
    propertySignals.signalLevel === "healthy" &&
    confidence >= 0.65
  ) {
    status = "Stable";
  } else if (
    flags.incompleteFacts ||
    flags.stackCompletenessCritical ||
    (stackScore !== null && stackScore !== undefined && Number(stackScore) < 0.45)
  ) {
    status = "Incomplete";
  } else if (
    !hasValuation &&
    !hasStackAnalytics &&
    linkedMortgages.length === 0 &&
    linkedHomeownersPolicies.length === 0
  ) {
    status = "Partial";
  } else if (propertySignals.signalLevel === "monitor" || activeFlagCount > 0) {
    status = "Needs Review";
  }

  const meaning = buildMeaning({ status, propertyLabel });
  const drivers = buildDrivers({
    propertySignals,
    propertyActionFeed,
    linkedMortgages,
    linkedHomeownersPolicies,
  });
  const primaryAction = mapPropertyAction(propertyActionFeed[0] || null);
  const secondaryAction = mapPropertyAction(propertyActionFeed[1] || null);
  const explanation = buildFasciaExplanation({
    summary: buildExplanationSummary({
      meaning,
      hasPersistedStackAnalytics: hasStackAnalytics,
      hasValuation,
    }),
    drivers,
    dataSources: buildDataSources({
      linkedMortgages,
      linkedHomeownersPolicies,
      latestValuation,
      propertyStackAnalytics,
    }),
    whyStatusAssigned: buildStatusReasoning({
      status,
      confidence,
      flags,
      hasValuation,
      hasDebtVisibility,
      hasProtectionVisibility,
      propertySignals,
      propertyStackAnalytics,
    }),
    limitations: buildLimitations({
      flags,
      confidence,
      latestValuation,
      propertyStackAnalytics,
      linkedMortgages,
      linkedHomeownersPolicies,
    }),
    recommendedAction: buildRecommendedAction(primaryAction),
    sourceMode: "live_property_bundle",
  });

  return {
    ...finalizeFascia({
      title: "Property Overview",
      status,
      sourceMode: "live_property_bundle",
      sourceLabel: "Current property data",
      sourceTone: status === "Not Enough Data" ? "neutral" : "info",
      meaning,
      drivers: explanation.drivers,
      primaryAction,
      secondaryAction,
      tertiaryAction: buildFasciaExplanationToggleAction(),
      completenessNote: buildCompletenessNote({
        propertySignals,
        linkedMortgages,
        linkedHomeownersPolicies,
      }),
      explanation,
    }),
    summary: explanation.summary,
    dataSources: explanation.dataSources,
    limitations: explanation.limitations,
    recommendedAction: explanation.recommendedAction,
  };
}
