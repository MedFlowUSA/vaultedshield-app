const SIGNAL_STATUS_META = {
  healthy: {
    icon: "🟢",
    tone: "good",
    statusLabel: "Looks stable",
    verdictSuffix: "looks stable",
  },
  at_risk: {
    icon: "🔴",
    tone: "alert",
    statusLabel: "Attention needed",
    verdictSuffix: "needs attention",
  },
  default: {
    icon: "🟡",
    tone: "warning",
    statusLabel: "Needs review",
    verdictSuffix: "needs review",
  },
};

function pluralize(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function mapSignalLevelToFriendlyStatus(signalLevel, subject = "This item") {
  const meta = SIGNAL_STATUS_META[signalLevel] || SIGNAL_STATUS_META.default;

  return {
    ...meta,
    verdict: `${subject} ${meta.verdictSuffix}.`,
  };
}

export function mapEvidenceStrengthToReadableSupport(confidence = 0) {
  if (confidence >= 0.85) {
    return {
      tone: "good",
      label: "Strong document support",
      detail: "This read is backed by enough evidence to be treated as a strong working view.",
    };
  }

  if (confidence >= 0.6) {
    return {
      tone: "info",
      label: "Good working support",
      detail: "There is enough visible support for a usable read, but another document could sharpen it.",
    };
  }

  if (confidence > 0) {
    return {
      tone: "warning",
      label: "Limited visible support",
      detail: "This read is directionally useful, but it is still based on partial evidence.",
    };
  }

  return {
    tone: "neutral",
    label: "More evidence needed",
    detail: "VaultedShield can see part of the picture, but not enough to make a strong judgment yet.",
  };
}

export function mapCompletenessToReadableSupport(score, label = "") {
  if (score === null || score === undefined) {
    return "This review is still forming because the visible record is incomplete.";
  }

  if (score >= 90) {
    return `This review looks well supported with ${score}% visible completeness${label ? ` and ${label.toLowerCase()} continuity` : ""}.`;
  }

  if (score >= 65) {
    return `This review is usable at ${score}% completeness, but a few missing pieces still limit confidence${label ? ` and ${label.toLowerCase()} continuity` : ""}.`;
  }

  return `Only ${score}% of the needed picture is visible${label ? ` and ${label.toLowerCase()} continuity is still thin` : ""}, so this should be treated as an early read.`;
}

export function mapChargePressureToReviewLanguage(chargePressure = "unknown") {
  if (chargePressure === "low") return "Visible charges do not appear to be creating strong pressure right now.";
  if (chargePressure === "moderate") return "Visible charges may be starting to weigh on long-term growth and deserve review.";
  if (chargePressure === "high") return "Visible charges look heavy enough to create meaningful long-term pressure.";
  return "Charge visibility is still limited, so cost pressure may be understated.";
}

export function mapHouseholdReadinessToBanner(score = 0) {
  if (score >= 85) {
    return {
      icon: "👨‍👩‍👧",
      tone: "good",
      title: "Household readiness looks strong",
      description: "Most of the core household picture is visible and the next steps appear manageable.",
    };
  }

  if (score >= 60) {
    return {
      icon: "👨‍👩‍👧",
      tone: "warning",
      title: "Household readiness is usable but incomplete",
      description: "The household picture is understandable, though a few missing links or documents still matter.",
    };
  }

  return {
    icon: "👨‍👩‍👧",
    tone: "warning",
    title: "Household readiness is still building",
    description: "VaultedShield can already point to a few priorities, but the full picture still needs support.",
  };
}

export function mapPortfolioSignalsToFriendlySummary(portfolioSignals, policies = []) {
  if (!portfolioSignals) return null;

  const status = mapSignalLevelToFriendlyStatus(portfolioSignals.portfolioSignalLevel, "This insurance picture");
  const support = mapEvidenceStrengthToReadableSupport(portfolioSignals.confidence ?? 0);
  const strongestPolicy = portfolioSignals.strongestPolicyIds?.[0];
  const weakestPolicy = portfolioSignals.weakestPolicyIds?.[0];
  const policyById = (id) =>
    policies.find((policy) => (policy.policy_id || policy.id) === id)?.product
    || policies.find((policy) => (policy.policy_id || policy.id) === id)?.product_name
    || policies.find((policy) => (policy.policy_id || policy.id) === id)?.carrier
    || id
    || "Policy";
  const priorityCount = portfolioSignals.priorityPolicyIds?.length || 0;
  const activeFlagLabels = Object.entries(portfolioSignals.portfolioFlags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => key.replace(/_/g, " "));

  return {
    icon: "🛡️",
    title: "Insurance portfolio overview",
    verdict: status.verdict,
    statusLabel: status.statusLabel,
    tone: status.tone,
    supportLabel: support.label,
    supportTone: support.tone,
    whatFound:
      portfolioSignals.reasons?.[0]
      || "VaultedShield compared the currently visible policies and produced a portfolio-level read.",
    whyCare:
      priorityCount > 0
        ? `${pluralize(priorityCount, "policy")} should be reviewed first so pressure does not stay buried in the larger set.`
        : "No single policy is clearly dominating the review queue right now, which makes the overall picture easier to manage.",
    metrics: [
      {
        label: "Visible Policies",
        value: portfolioSignals.totals?.totalPolicies ?? 0,
        helper: "Policies included in this read",
      },
      {
        label: "Stable Reads",
        value: portfolioSignals.totals?.healthyCount ?? 0,
        helper: "Policies currently reading strongest",
      },
      {
        label: "Review First",
        value: priorityCount,
        helper: "Policies surfacing as priorities",
      },
      {
        label: "Document Support",
        value: support.label,
        helper: support.detail,
      },
    ],
    tags: activeFlagLabels,
    reasons: portfolioSignals.reasons || [],
    evidenceTitle: "See portfolio evidence",
    evidenceSubtitle: "Counts, reasons, flags, and strongest-versus-weakest comparisons stay available without taking over the first read.",
    evidenceSummary: {
      priorityPolicies:
        priorityCount > 0
          ? portfolioSignals.priorityPolicyIds.slice(0, 3).map((id) => policyById(id)).join(", ")
          : "No immediate priority grouping is standing out.",
      strongestVsWeakest: `Strongest: ${strongestPolicy ? policyById(strongestPolicy) : "Unavailable"} | Weakest: ${
        weakestPolicy ? policyById(weakestPolicy) : "Unavailable"
      }`,
    },
  };
}

export function mapPolicySignalsToFriendlySummary(policySignals) {
  if (!policySignals) return null;

  const status = mapSignalLevelToFriendlyStatus(policySignals.signalLevel, "This policy");
  const support = mapEvidenceStrengthToReadableSupport(policySignals.confidence ?? 0);
  const activeFlagLabels = Object.entries(policySignals.flags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => key.replace(/_/g, " "));

  return {
    icon: "🛡️",
    title: "Policy overview",
    verdict: status.verdict,
    statusLabel: status.statusLabel,
    tone: status.tone,
    supportLabel: support.label,
    supportTone: support.tone,
    whatFound:
      policySignals.reasons?.[0]
      || "VaultedShield translated the current policy evidence into a simple stability read.",
    whyCare:
      activeFlagLabels.length > 0
        ? `${pluralize(activeFlagLabels.length, "policy signal")} is affecting how this policy is being interpreted right now.`
        : "No strong pressure flags are standing out, which usually means the policy can be reviewed more calmly.",
    metrics: [
      {
        label: "Policy Status",
        value: status.statusLabel,
        helper: "The simplest working read of the policy",
      },
      {
        label: "Support Level",
        value: support.label,
        helper: support.detail,
      },
      {
        label: "Open Flags",
        value: activeFlagLabels.length,
        helper: "Signals currently affecting this policy",
      },
    ],
    tags: activeFlagLabels,
    reasons: policySignals.reasons || [],
    evidenceTitle: "See policy evidence",
    evidenceSubtitle: "Signal drivers and pressure flags remain available without overwhelming the first read.",
  };
}

export function mapPropertySignalsToFriendlySummary(propertySignals) {
  if (!propertySignals) return null;

  const status = mapSignalLevelToFriendlyStatus(propertySignals.signalLevel, "This property picture");
  const support = mapEvidenceStrengthToReadableSupport(propertySignals.confidence ?? 0);
  const stackScore = propertySignals.metadata?.stackCompletenessScore;
  const stackLabel = propertySignals.metadata?.stackCompletenessLabel || "limited";
  const continuityStatus = propertySignals.metadata?.stackContinuityStatus || "continuity limited";
  const activeFlagLabels = Object.entries(propertySignals.flags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => key.replace(/_/g, " "));

  return {
    icon: "🏠",
    title: "Property overview",
    verdict: status.verdict,
    statusLabel: status.statusLabel,
    tone: status.tone,
    supportLabel: support.label,
    supportTone: support.tone,
    whatFound:
      propertySignals.reasons?.[0]
      || "VaultedShield compared property value support, linkage, and protection visibility to produce this read.",
    whyCare:
      stackScore >= 90
        ? "The property stack is mostly connected, which makes the value and protection story easier to trust."
        : `The property stack still has missing links, so value, financing, or protection judgment may change as more records connect.`,
    metrics: [
      {
        label: "Stack Completeness",
        value: stackScore !== null && stackScore !== undefined ? `${stackScore}%` : "Still building",
        helper: stackScore !== null && stackScore !== undefined ? `${stackLabel} stack visibility` : "Not enough linkage is visible yet",
      },
      {
        label: "Continuity",
        value: continuityStatus,
        helper: "How connected the property record looks",
      },
      {
        label: "Support Level",
        value: support.label,
        helper: support.detail,
      },
    ],
    tags: activeFlagLabels,
    reasons: propertySignals.reasons || [],
    evidenceTitle: "See property evidence",
    evidenceSubtitle: "The technical layer still keeps the stack, continuity, and signal drivers available on demand.",
    evidenceSummary: {
      support: mapCompletenessToReadableSupport(stackScore, continuityStatus),
    },
  };
}

export function mapRetirementSignalsToFriendlySummary(retirementSignals) {
  if (!retirementSignals) return null;

  const status = mapSignalLevelToFriendlyStatus(retirementSignals.signalLevel, "This retirement account");
  const support = mapEvidenceStrengthToReadableSupport(retirementSignals.confidence ?? 0);
  const activeFlagLabels = Object.entries(retirementSignals.flags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => key.replace(/_/g, " "));

  return {
    icon: "💰",
    title: "Retirement account overview",
    verdict: status.verdict,
    statusLabel: status.statusLabel,
    tone: status.tone,
    supportLabel: support.label,
    supportTone: support.tone,
    whatFound:
      retirementSignals.reasons?.[0]
      || "VaultedShield reviewed the visible retirement evidence and translated it into an account-level read.",
    whyCare:
      activeFlagLabels.length > 0
        ? `${pluralize(activeFlagLabels.length, "review signal")} is shaping how this account is being interpreted right now.`
        : "No major pressure flags are standing out, so the account currently reads as more straightforward.",
    metrics: [
      {
        label: "Signal Level",
        value: status.statusLabel,
        helper: "The simplest read of the account",
      },
      {
        label: "Support Level",
        value: support.label,
        helper: support.detail,
      },
      {
        label: "Open Review Signals",
        value: activeFlagLabels.length,
        helper: "Signals currently affecting the read",
      },
    ],
    tags: activeFlagLabels,
    reasons: retirementSignals.reasons || [],
    evidenceTitle: "See account evidence",
    evidenceSubtitle: "The deeper layer still keeps signal drivers, parsed positions, and evidence support available when needed.",
  };
}
