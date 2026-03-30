function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function roundConfidence(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function analyzeRetirementReadiness({
  summary = {},
  extraction = null,
  snapshot = null,
  analytics = null,
  positions = [],
} = {}) {
  const pageCount = Number(extraction?.pageCount || 0);
  const rawText = String(extraction?.text || extraction?.rawText || "");
  const currentBalance =
    toNumber(summary?.accountValue) ??
    toNumber(snapshot?.normalized_retirement?.balance_metrics?.current_balance) ??
    toNumber(snapshot?.normalized_retirement?.balance_metrics?.vested_balance);
  const contributions =
    toNumber(summary?.contributions) ??
    toNumber(snapshot?.normalized_retirement?.contribution_metrics?.employee_contributions_ytd) ??
    toNumber(snapshot?.normalized_retirement?.contribution_metrics?.total_contributions_ytd);
  const accountType =
    summary?.accountType ||
    snapshot?.normalized_retirement?.account_identity?.retirement_type ||
    snapshot?.normalized_retirement?.account_identity?.plan_type ||
    null;
  const statementDate =
    summary?.statementDate ||
    snapshot?.normalized_retirement?.statement_context?.statement_date ||
    snapshot?.snapshot_date ||
    null;
  const completenessStatus =
    snapshot?.completeness_assessment?.status ||
    snapshot?.normalized_retirement?.statement_context?.completeness_assessment?.status ||
    null;
  const reviewFlags = safeArray(analytics?.review_flags);
  const safePositions = safeArray(positions);

  const notes = [];
  const flags = [];
  let confidence = 0.2;

  if (pageCount > 0) confidence += 0.12;
  if (rawText.length > 1200) confidence += 0.1;
  if (currentBalance !== null) confidence += 0.22;
  if (contributions !== null) confidence += 0.12;
  if (accountType) confidence += 0.12;
  if (statementDate) confidence += 0.08;
  if (completenessStatus === "strong") confidence += 0.16;
  else if (completenessStatus === "moderate") confidence += 0.08;
  if (safePositions.length > 0) confidence += 0.08;

  let extractionQuality = "limited";
  if (pageCount >= 2 && rawText.length > 1800) {
    extractionQuality = "strong";
  } else if (pageCount >= 1 && rawText.length > 500) {
    extractionQuality = "moderate";
  }

  if (currentBalance === null) {
    flags.push("balance_missing");
    notes.push("Current account value is still missing from the visible retirement read.");
  }
  if (contributions === null) {
    flags.push("contributions_missing");
    notes.push("Contribution visibility is still limited in the current retirement read.");
  }
  if (!accountType) {
    flags.push("account_type_missing");
    notes.push("Account type is not yet clearly visible in the current retirement read.");
  }
  if (!statementDate) {
    flags.push("statement_date_missing");
    notes.push("Statement date is still missing, so recency is harder to confirm.");
  }
  if (extractionQuality === "limited") {
    flags.push("document_quality_limited");
    notes.push("Document quality or extracted text depth is still limited.");
  }
  if (safePositions.length > 0) {
    notes.push(`${pluralize(safePositions.length, "position")} are visible in parsed allocation detail.`);
  }
  if (reviewFlags.some((flag) => String(flag).includes("beneficiary"))) {
    notes.push("Beneficiary review signals are present in the parsed retirement analytics.");
  }
  if (reviewFlags.some((flag) => String(flag).includes("loan"))) {
    notes.push("Loan-related review signals are present in the parsed retirement analytics.");
  }

  let readinessStatus = "Needs Review";
  if (currentBalance !== null && accountType && statementDate && extractionQuality === "strong") {
    readinessStatus = "Better Supported";
  } else if (currentBalance !== null && (contributions !== null || accountType)) {
    readinessStatus = "Usable";
  }

  const headline =
    readinessStatus === "Better Supported"
      ? "This retirement read has enough visible balance, type, and statement support to be treated as more dependable."
      : readinessStatus === "Usable"
        ? "This retirement read is usable, but contribution, recency, or document support is still incomplete."
        : "This retirement read still needs stronger statement support before it can be treated as reliable.";

  return {
    readinessStatus,
    confidence: roundConfidence(confidence),
    extractionQuality,
    notes: [...new Set(notes)].slice(0, 5),
    flags: [...new Set(flags)],
    metrics: {
      currentBalanceVisible: currentBalance !== null,
      contributionsVisible: contributions !== null,
      accountTypeVisible: Boolean(accountType),
      statementDateVisible: Boolean(statementDate),
      positionsCount: safePositions.length,
      pageCount,
      completenessStatus: completenessStatus || "limited",
    },
    headline,
  };
}

export function summarizeRetirementHousehold({
  accounts = [],
  readinessSnapshot = null,
} = {}) {
  const safeAccounts = safeArray(accounts);
  const activeCount = safeAccounts.filter((account) => String(account?.plan_status || "").toLowerCase() === "active").length;
  const pensionStyleCount = safeAccounts.filter((account) => account?.is_benefit_based).length;
  const employerPlanCount = safeAccounts.filter((account) => {
    const key = String(account?.retirement_type_key || "");
    return key.includes("401") || key.includes("403") || key.includes("457");
  }).length;

  const notes = [];
  if (safeAccounts.length === 0) {
    return {
      status: "Needs Setup",
      confidence: 0.1,
      headline: "No retirement accounts are visible yet, so household retirement planning support is still just a shell.",
      notes: ["Create or import at least one retirement account to begin building retirement continuity and readiness support."],
      metrics: {
        totalAccounts: 0,
        activeCount: 0,
        pensionStyleCount: 0,
        employerPlanCount: 0,
      },
    };
  }

  if (pensionStyleCount > 0) {
    notes.push(`${pluralize(pensionStyleCount, "pension-style account")} may need benefit-review context in addition to balance tracking.`);
  }
  if (employerPlanCount > 0) {
    notes.push(`${pluralize(employerPlanCount, "employer plan")} can benefit from contribution and beneficiary review over time.`);
  }
  if (readinessSnapshot?.readinessStatus) {
    notes.push(`Current household retirement planner status is ${readinessSnapshot.readinessStatus.toLowerCase()}.`);
  }

  const headline =
    readinessSnapshot?.readinessStatus === "On Track"
      ? "Household retirement planning looks relatively well supported from the current saved goals and account structure."
      : readinessSnapshot?.readinessStatus
        ? "Household retirement planning is active, but the current goal read still shows room for improvement."
        : "Retirement accounts are visible, but the household still needs a saved retirement goal to complete the planning picture.";

  return {
    status: readinessSnapshot?.readinessStatus || "Planning Needed",
    confidence: readinessSnapshot ? 0.75 : 0.45,
    headline,
    notes: notes.slice(0, 4),
    metrics: {
      totalAccounts: safeAccounts.length,
      activeCount,
      pensionStyleCount,
      employerPlanCount,
    },
  };
}
