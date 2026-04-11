import {
  buildRetirementSignalConfidence,
  buildRetirementSignalFlags,
  buildRetirementSignalReasons,
  deriveRetirementSignalLevel,
} from "./retirementSignalRules.js";

function buildSummaryLabel(signalLevel, reasons = []) {
  if (signalLevel === "healthy") return "Retirement account support looks stable";
  if (signalLevel === "at_risk") return reasons[0] || "Retirement account support shows visible pressure";
  return reasons[0] || "Retirement account support is mixed";
}

export function buildRetirementSignals({
  retirementRead = null,
  latestSnapshot = null,
  latestAnalytics = null,
  positions = [],
} = {}) {
  const flags = buildRetirementSignalFlags({
    retirementRead,
    latestSnapshot,
    latestAnalytics,
    positions,
  });
  const reasons = buildRetirementSignalReasons({
    flags,
    retirementRead,
    latestSnapshot,
    latestAnalytics,
    positions,
  });
  const signalLevel = deriveRetirementSignalLevel(flags);
  const confidence = buildRetirementSignalConfidence({
    retirementRead,
    latestSnapshot,
    latestAnalytics,
    positions,
    flags,
  });

  return {
    signalLevel,
    summaryLabel: buildSummaryLabel(signalLevel, reasons),
    reasons,
    flags: {
      balanceVisibility: Boolean(flags.balanceVisibility),
      contributionVisibility: Boolean(flags.contributionVisibility),
      staleStatement: Boolean(flags.staleStatement),
      beneficiaryRisk: Boolean(flags.beneficiaryRisk),
      loanRisk: Boolean(flags.loanRisk),
      concentrationRisk: Boolean(flags.concentrationRisk),
      incompleteData: Boolean(flags.incompleteData),
      positionVisibility: Boolean(flags.positionVisibility),
    },
    confidence,
    metadata: {
      statementAgeMonths: flags.statementAgeMonths ?? null,
      positionsCount: positions.length,
    },
  };
}

export default buildRetirementSignals;
