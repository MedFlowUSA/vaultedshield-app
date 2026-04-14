import {
  getCompletenessLabel,
  getCompletenessTone,
} from "../assetLinks/linkedContext.js";
import {
  buildPropertySignalConfidence,
  buildPropertySignalFlags,
  buildPropertySignalReasons,
  derivePropertySignalLevel,
} from "./propertySignalRules.js";

function buildSummaryLabel(signalLevel, reasons = []) {
  if (signalLevel === "healthy") {
    return "Property signals look stable";
  }

  if (signalLevel === "at_risk") {
    return reasons[0] || "Property signals show visible pressure";
  }

  return reasons[0] || "Property signals are mixed";
}

export function buildPropertySignals({
  property = null,
  latestValuation = null,
  valuationChangeSummary = null,
  propertyEquityPosition = null,
  propertyStackAnalytics = null,
  propertyValuationHistory = [],
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
} = {}) {
  const flags = buildPropertySignalFlags({
    property,
    latestValuation,
    propertyEquityPosition,
    propertyStackAnalytics,
    linkedMortgages,
    linkedHomeownersPolicies,
  });
  const reasons = buildPropertySignalReasons({
    flags,
    latestValuation,
    propertyEquityPosition,
    propertyStackAnalytics,
    valuationChangeSummary,
    linkedMortgages,
    linkedHomeownersPolicies,
  });
  const signalLevel = derivePropertySignalLevel(flags);
  const confidence = buildPropertySignalConfidence({
    flags,
    latestValuation,
    propertyStackAnalytics,
    propertyEquityPosition,
    propertyValuationHistory,
    linkedMortgages,
    linkedHomeownersPolicies,
  });

  return {
    signalLevel,
    summaryLabel: buildSummaryLabel(signalLevel, reasons),
    reasons,
    flags: {
      valuationMissing: Boolean(flags.valuationMissing),
      weakValuation: Boolean(flags.weakValuation),
      linkageGap: Boolean(flags.linkageGap),
      stackCompletenessGap: Boolean(flags.stackCompletenessGap),
      debtVisibilityGap: Boolean(flags.debtVisibilityGap),
      protectionGap: Boolean(flags.protectionGap),
      incompleteFacts: Boolean(flags.incompleteFacts),
      marketSupportGap: Boolean(flags.marketSupportGap),
      compQualityRisk: Boolean(flags.compQualityRisk),
      equityPressure: Boolean(flags.equityPressure),
    },
    confidence,
    metadata: {
      missingFacts: flags.missingFacts || [],
      subjectCompleteness: flags.subjectCompleteness ?? null,
      stackCompletenessScore: flags.stackCompletenessScore ?? null,
      stackCompletenessLabel: getCompletenessLabel(flags.stackCompletenessScore),
      stackCompletenessTone: getCompletenessTone(flags.stackCompletenessScore),
      stackContinuityStatus: propertyStackAnalytics?.continuity_status || null,
      stackLinkageStatus: propertyStackAnalytics?.linkage_status || null,
    },
  };
}

export default buildPropertySignals;
