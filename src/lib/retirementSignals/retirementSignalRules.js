function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function monthsSince(dateValue) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  return Math.max(
    0,
    (now.getUTCFullYear() - parsed.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - parsed.getUTCMonth())
  );
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export const RETIREMENT_SIGNAL_FLAG_LABELS = Object.freeze({
  balanceVisibility: "Balance visibility limited",
  contributionVisibility: "Contribution visibility limited",
  staleStatement: "Statement may be stale",
  beneficiaryRisk: "Beneficiary review needed",
  loanRisk: "Loan pressure visible",
  concentrationRisk: "Allocation concentration",
  incompleteData: "Evidence incomplete",
  positionVisibility: "Positions not parsed",
});

export function buildRetirementSignalFlags({
  retirementRead = null,
  latestSnapshot = null,
  latestAnalytics = null,
  positions = [],
} = {}) {
  const reviewFlags = Array.isArray(latestAnalytics?.review_flags) ? latestAnalytics.review_flags : [];
  const normalized = latestAnalytics?.normalized_intelligence || {};
  const concentrationWarning = Boolean(
    normalized?.concentration_flags?.concentration_warning ||
      positions.some((position) => toNumber(position?.allocation_percent) >= 60)
  );
  const loanDetected = Boolean(
    normalized?.loan_flags?.outstanding_loan_detected ||
      reviewFlags.some((flag) => String(flag).includes("loan")) ||
      toNumber(
        latestSnapshot?.normalized_retirement?.loan_distribution_metrics?.loan_balance ||
          latestSnapshot?.normalized_retirement?.balance_metrics?.loan_balance
      ) > 0
  );
  const beneficiaryMissing = Boolean(
    normalized?.beneficiary_flags?.beneficiary_missing ||
      normalized?.beneficiary_flags?.beneficiary_status_unknown ||
      reviewFlags.some((flag) => String(flag).includes("beneficiary")) ||
      latestSnapshot?.normalized_retirement?.beneficiary_metrics?.beneficiary_present === false
  );
  const statementDate =
    latestSnapshot?.normalized_retirement?.statement_context?.statement_date ||
    latestSnapshot?.snapshot_date ||
    null;
  const statementAgeMonths = monthsSince(statementDate);

  return {
    balanceVisibility: !retirementRead?.metrics?.currentBalanceVisible,
    contributionVisibility: !retirementRead?.metrics?.contributionsVisible,
    staleStatement: statementAgeMonths !== null && statementAgeMonths > 18,
    beneficiaryRisk: beneficiaryMissing,
    loanRisk: loanDetected,
    concentrationRisk: concentrationWarning,
    incompleteData:
      (retirementRead?.confidence ?? 0) < 0.58 ||
      retirementRead?.readinessStatus === "Needs Review" ||
      ["limited", "basic"].includes(retirementRead?.metrics?.completenessStatus),
    positionVisibility: positions.length === 0,
    statementAgeMonths,
  };
}

export function buildRetirementSignalReasons({
  flags = {},
  retirementRead = null,
  latestSnapshot = null,
  latestAnalytics = null,
  positions = [],
} = {}) {
  const reasons = [];
  const normalized = latestAnalytics?.normalized_intelligence || {};
  const statementDate =
    latestSnapshot?.normalized_retirement?.statement_context?.statement_date ||
    latestSnapshot?.snapshot_date ||
    null;
  const topPosition = [...positions]
    .filter((position) => toNumber(position?.current_value) !== null)
    .sort((left, right) => (right.current_value || 0) - (left.current_value || 0))[0];

  if (flags.balanceVisibility) {
    reasons.push("Current account balance is not fully visible yet, which lowers trust in the account read.");
  }
  if (flags.contributionVisibility) {
    reasons.push("Contribution details are still limited, so funding visibility is incomplete.");
  }
  if (flags.incompleteData) {
    reasons.push("The current retirement evidence stack is still incomplete, so this account should stay in a review state.");
  }
  if (flags.positionVisibility) {
    reasons.push("Parsed position detail is not available yet, so allocation review is still thin.");
  }
  if (flags.concentrationRisk) {
    reasons.push(
      topPosition
        ? `${topPosition.position_name || "One holding"} appears to dominate the visible allocation mix.`
        : "Allocation concentration warning is visible in the current retirement read."
    );
  }
  if (flags.loanRisk) {
    reasons.push("Loan-related pressure is visible in the current retirement account evidence.");
  }
  if (flags.beneficiaryRisk) {
    reasons.push("Beneficiary visibility is missing or uncertain in the current account read.");
  }
  if (flags.staleStatement) {
    reasons.push(
      statementDate
        ? `The latest visible retirement statement is aging, so the account may need a fresher read.`
        : "Statement recency is not clear enough to confirm that this account is current."
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      retirementRead?.headline ||
        "Balance, statement, and allocation support currently look relatively stable."
    );
  }

  if (
    normalized?.completeness_flags?.statement_missing_sections?.length &&
    !flags.incompleteData
  ) {
    reasons.push(
      `Missing sections are still visible: ${normalized.completeness_flags.statement_missing_sections.slice(0, 2).join(", ")}.`
    );
  }

  return unique(reasons).slice(0, 6);
}

export function buildRetirementSignalConfidence({
  retirementRead = null,
  latestSnapshot = null,
  latestAnalytics = null,
  positions = [],
  flags = {},
} = {}) {
  let confidence = 0.28;

  confidence += clamp(retirementRead?.confidence ?? 0, 0, 1) * 0.38;
  if (latestSnapshot?.id) confidence += 0.12;
  if (latestAnalytics?.id) confidence += 0.1;
  if (positions.length > 0) confidence += 0.08;
  if (!flags.balanceVisibility) confidence += 0.06;
  if (!flags.positionVisibility) confidence += 0.04;
  if (flags.incompleteData) confidence -= 0.08;
  if (flags.staleStatement) confidence -= 0.05;

  return Number(clamp(confidence, 0.24, 0.94).toFixed(2));
}

export function deriveRetirementSignalLevel(flags = {}) {
  const activeCount = Object.entries(flags).filter(
    ([key, value]) => key !== "statementAgeMonths" && Boolean(value)
  ).length;
  const severePressure =
    (flags.loanRisk && flags.incompleteData) ||
    (flags.beneficiaryRisk && flags.incompleteData && flags.staleStatement) ||
    (flags.balanceVisibility && flags.incompleteData && flags.positionVisibility);

  if (severePressure || activeCount >= 5) {
    return "at_risk";
  }

  if (activeCount >= 1) {
    return "monitor";
  }

  return "healthy";
}
