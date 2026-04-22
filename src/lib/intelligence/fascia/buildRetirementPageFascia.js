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

function buildMeaning({ status, accountLabel }) {
  if (status === "Strong") {
    return `${accountLabel} looks strong. We have enough data to understand the account clearly.`;
  }

  if (status === "Stable") {
    return `${accountLabel} looks mostly stable right now, but it should still be checked from time to time.`;
  }

  if (status === "At Risk") {
    return `${accountLabel} shows a problem that needs attention before you treat it as okay.`;
  }

  if (status === "Incomplete") {
    return `${accountLabel} is partly readable, but key retirement details are still missing.`;
  }

  if (status === "Partial") {
    return `${accountLabel} has some usable retirement data, but not enough yet for a full answer.`;
  }

  if (status === "Needs Review") {
    return `${accountLabel} is readable, but something still needs a closer look before you rely on it.`;
  }

  return "There is not enough retirement data yet to tell what is going on.";
}

function buildExplanationSummary({ meaning, latestSnapshot, latestAnalytics, positions = [] }) {
  if (!latestSnapshot?.id && !latestAnalytics?.id) {
    return `${meaning} This is based on the retirement data we could load because parsed statement and analytics support are still limited.`;
  }

  if (positions.length === 0) {
    return `${meaning} This is using current retirement data, but allocation detail is still limited.`;
  }

  return `${meaning} This is using current retirement data together with statement, analytics, and holdings support.`;
}

function buildDrivers({ retirementSignals, retirementActionFeed = [], positions = [], retirementRead }) {
  const reasons = Array.isArray(retirementSignals?.reasons) ? retirementSignals.reasons : [];
  const drivers = [];

  if (positions.length > 0) {
    drivers.push(`${positions.length} parsed position${positions.length === 1 ? "" : "s"} visible`);
  }

  if (retirementRead?.readinessStatus) {
    drivers.push(`Current retirement read is ${String(retirementRead.readinessStatus).toLowerCase()}`);
  }

  drivers.push(...reasons);

  if (retirementActionFeed[0]?.summary) {
    drivers.push(retirementActionFeed[0].summary);
  }

  return unique(drivers).slice(0, 3);
}

function buildDataSources({
  retirementRead,
  latestSnapshot,
  latestAnalytics,
  positions = [],
}) {
  const sources = [
    "Live retirement account facts, current read status, and statement-quality signals",
    latestSnapshot?.id
      ? "Parsed retirement snapshot support from the latest visible statement"
      : "Current statement-parsing checks because no parsed retirement snapshot is visible yet",
    latestAnalytics?.id
      ? "Persisted retirement analytics and review flags"
      : "Live retirement review signals because persisted analytics are not stored yet",
    positions.length > 0
      ? `${pluralize(positions.length, "parsed holding")} contributing allocation visibility`
      : "Allocation and concentration checks because parsed position detail is still limited",
  ];

  if (retirementRead?.metrics?.currentBalanceVisible !== undefined) {
    sources.push("Balance, contribution, and completeness support from the current retirement read");
  }

  return unique(sources).slice(0, 5);
}

function buildStatusReasoning({
  status,
  retirementSignals,
  retirementRead,
  latestSnapshot,
  latestAnalytics,
  positions = [],
}) {
  const flags = retirementSignals?.flags || {};

  if (status === "Strong") {
    return "This status was assigned because statement support is present, the retirement read is better supported, confidence is high, and parsed holdings are visible enough to support the current account interpretation.";
  }

  if (status === "Stable") {
    return "This status was assigned because the retirement bundle currently reads as generally supported, even though normal follow-up review should still remain active.";
  }

  if (status === "At Risk") {
    return flags.loanRisk || flags.beneficiaryRisk || flags.concentrationRisk
      ? "This status was assigned because the current retirement evidence shows visible account pressure, such as loan, beneficiary, or concentration risk."
      : "This status was assigned because the live retirement signal is currently reading at risk.";
  }

  if (status === "Incomplete") {
    return "This status was assigned because missing statement support, incomplete balance visibility, or limited allocation detail materially weaken the reliability of the current retirement interpretation.";
  }

  if (status === "Partial") {
    return "This status was assigned because some retirement evidence is present, but the bundle still lacks enough parsed statement, analytics, or holdings support for a dependable read.";
  }

  if (status === "Needs Review") {
    return flags.staleStatement || flags.balanceVisibility || flags.contributionVisibility || flags.positionVisibility
      ? "This status was assigned because the account is readable, but visible statement or holdings support gaps still need follow-up."
      : "This status was assigned because the retirement bundle is usable, but not settled enough to treat as fully supported yet.";
  }

  if (!retirementSignals || !retirementRead || (!latestSnapshot?.id && !latestAnalytics?.id && positions.length === 0)) {
    return "This status was assigned because the page does not yet have enough retirement statement, analytics, or holdings support for a reliable interpretation.";
  }

  return "This status was assigned because the page does not yet have enough readable retirement evidence for a confident interpretation.";
}

function buildLimitations({
  retirementSignals,
  retirementRead,
  latestSnapshot,
  latestAnalytics,
  positions = [],
}) {
  const flags = retirementSignals?.flags || {};
  const limitations = [];
  const statementAgeMonths = retirementSignals?.metadata?.statementAgeMonths;
  const confidence = safeNumber(retirementSignals?.confidence, 0);

  if (!latestSnapshot?.id) {
    limitations.push("No parsed retirement snapshot is currently visible, which limits statement-level confirmation.");
  }

  if (!latestAnalytics?.id) {
    limitations.push("Persisted retirement analytics are not stored yet, so this read leans more heavily on live account signals.");
  }

  if (positions.length === 0 || flags.positionVisibility) {
    limitations.push("Parsed allocation detail is still limited, which weakens concentration and holdings review.");
  }

  if (flags.balanceVisibility) {
    limitations.push("Current balance visibility is still limited in the available retirement evidence.");
  }

  if (flags.contributionVisibility) {
    limitations.push("Contribution visibility is still limited in the current account read.");
  }

  if (flags.staleStatement || (statementAgeMonths !== null && statementAgeMonths !== undefined && statementAgeMonths >= 12)) {
    limitations.push("The latest visible retirement statement appears stale, so the account read may lag the current account condition.");
  }

  if (flags.beneficiaryRisk) {
    limitations.push("Beneficiary support is still limited or potentially at risk in the current account evidence.");
  }

  if (flags.loanRisk) {
    limitations.push("Loan-related pressure is visible in the current retirement evidence.");
  }

  if (flags.concentrationRisk) {
    limitations.push("Concentration pressure is visible in the current retirement holdings read.");
  }

  if (retirementRead?.readinessStatus === "Needs Review") {
    limitations.push("The current retirement read still requires follow-up before this account should be treated as fully supported.");
  }

  if (confidence > 0 && confidence < 0.55) {
    limitations.push(`Retirement signal confidence remains limited at ${Math.round(confidence * 100)}%, so this interpretation should be treated as provisional.`);
  }

  if (limitations.length === 0) {
    limitations.push("No major limitation stands out beyond the normal need to keep statement, analytics, and holdings support current.");
  }

  return unique(limitations).slice(0, 4);
}

function mapRetirementAction(action = null) {
  if (!action?.target || !action?.actionLabel) return null;
  return normalizeFasciaAction({
    label: action.actionLabel,
    target: action.target,
  });
}

function buildRecommendedAction(primaryAction = null) {
  if (!primaryAction?.label) {
    return {
      label: "Open read summary",
      detail: "Start with the read summary so the next retirement decision is grounded in the clearest statement and visibility signals.",
      action: normalizeFasciaAction({
        label: "Open read summary",
        target: {
          type: "scroll_section",
          section: "signals",
        },
      }),
    };
  }

  const detailsByLabel = {
    "Open read summary":
      "Open the retirement read summary first to confirm balance visibility, contribution support, extraction quality, and overall account readiness.",
    "Open positions":
      "Open positions to review parsed holdings, allocation visibility, and any concentration pressure behind this account read.",
    "Review documents":
      "Open retirement documents to strengthen statement support and close the biggest evidence gap affecting this account interpretation.",
    "Open analytics":
      "Open analytics to review persisted retirement flags, beneficiary visibility, loan pressure, and the current intelligence summary.",
  };

  return {
    label: primaryAction.label,
    detail:
      detailsByLabel[primaryAction.label] ||
      "Use the recommended section to strengthen the retirement interpretation with the most relevant supporting context.",
    action: primaryAction,
  };
}

function buildCompletenessNote({ retirementSignals, latestSnapshot, latestAnalytics, positions = [] }) {
  if (!retirementSignals) {
    return "Retirement signals are not available yet.";
  }

  const statementAgeMonths = retirementSignals?.metadata?.statementAgeMonths;
  const confidencePercent = Math.round(safeNumber(retirementSignals.confidence, 0) * 100);

  if (latestSnapshot?.id && latestAnalytics?.id) {
    const recencyNote =
      statementAgeMonths !== null && statementAgeMonths !== undefined
        ? ` Latest visible statement age is about ${statementAgeMonths} month${statementAgeMonths === 1 ? "" : "s"}.`
        : "";
    return `Using current retirement data from statements, analytics, and holdings at ${confidencePercent}% confidence.${recencyNote}`;
  }

  if (positions.length === 0) {
    return `Using current retirement data while allocation detail is still limited at ${confidencePercent}% confidence.`;
  }

  return `Using current retirement data at ${confidencePercent}% confidence.`;
}

export default function buildRetirementPageFascia({
  retirementAccount = null,
  retirementRead = null,
  retirementSignals = null,
  retirementActionFeed = [],
  latestSnapshot = null,
  latestAnalytics = null,
  positions = [],
} = {}) {
  const accountLabel = retirementAccount?.plan_name || retirementAccount?.account_name || "This retirement account";
  const flags = retirementSignals?.flags || {};
  const confidence = safeNumber(retirementSignals?.confidence, 0);
  const activeFlagCount = Object.values(flags).filter(Boolean).length;
  const positionsCount = positions.length;

  let status = "Not Enough Data";
  if (!retirementAccount || !retirementSignals || !retirementRead) {
    status = "Not Enough Data";
  } else if (retirementSignals.signalLevel === "at_risk") {
    status = "At Risk";
  } else if (
    retirementSignals.signalLevel === "healthy" &&
    retirementRead.readinessStatus === "Better Supported" &&
    confidence >= 0.8 &&
    positionsCount > 0 &&
    latestSnapshot?.id
  ) {
    status = "Strong";
  } else if (
    retirementSignals.signalLevel === "healthy" &&
    confidence >= 0.65 &&
    retirementRead.readinessStatus !== "Needs Review"
  ) {
    status = "Stable";
  } else if (
    flags.incompleteData &&
    (flags.balanceVisibility || flags.positionVisibility || retirementRead.readinessStatus === "Needs Review")
  ) {
    status = "Incomplete";
  } else if (
    !latestSnapshot?.id &&
    !latestAnalytics?.id &&
    positionsCount === 0
  ) {
    status = "Partial";
  } else if (retirementSignals.signalLevel === "monitor" || activeFlagCount > 0) {
    status = "Needs Review";
  }

  const meaning = buildMeaning({ status, accountLabel });
  const drivers = buildDrivers({
    retirementSignals,
    retirementActionFeed,
    positions,
    retirementRead,
  });
  const primaryAction = mapRetirementAction(retirementActionFeed[0] || null);
  const secondaryAction = mapRetirementAction(retirementActionFeed[1] || null);
  const explanation = buildFasciaExplanation({
    summary: buildExplanationSummary({
      meaning,
      latestSnapshot,
      latestAnalytics,
      positions,
    }),
    drivers,
    dataSources: buildDataSources({
      retirementRead,
      latestSnapshot,
      latestAnalytics,
      positions,
    }),
    whyStatusAssigned: buildStatusReasoning({
      status,
      retirementSignals,
      retirementRead,
      latestSnapshot,
      latestAnalytics,
      positions,
    }),
    limitations: buildLimitations({
      retirementSignals,
      retirementRead,
      latestSnapshot,
      latestAnalytics,
      positions,
    }),
    recommendedAction: buildRecommendedAction(primaryAction),
    sourceMode: "live_retirement_bundle",
  });

  return {
    ...finalizeFascia({
      title: "Retirement Overview",
      status,
      sourceMode: "live_retirement_bundle",
      sourceLabel: "Current retirement data",
      sourceTone: status === "Not Enough Data" ? "neutral" : "info",
      meaning,
      drivers: explanation.drivers,
      primaryAction,
      secondaryAction,
      tertiaryAction: buildFasciaExplanationToggleAction(),
      completenessNote: buildCompletenessNote({
        retirementSignals,
        latestSnapshot,
        latestAnalytics,
        positions,
      }),
      explanation,
    }),
    summary: explanation.summary,
    dataSources: explanation.dataSources,
    limitations: explanation.limitations,
    recommendedAction: explanation.recommendedAction,
  };
}
