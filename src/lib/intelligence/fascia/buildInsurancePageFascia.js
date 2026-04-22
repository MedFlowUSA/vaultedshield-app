import { getPolicyDetailRoute } from "../../navigation/insurancePolicyRouting.js";
import { buildFasciaExplanation, buildFasciaExplanationToggleAction, finalizeFascia } from "./fasciaContract.js";

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function hasHouseholdSummaryData(summary = null) {
  if (!summary || typeof summary !== "object") return false;
  return Boolean(
    summary.headline ||
      summary.status ||
      summary.totalPolicies ||
      summary.totalCoverage ||
      safeNumber(summary.confidence, 0) > 0 ||
      (Array.isArray(summary.notes) && summary.notes.length > 0)
  );
}

function buildMeaning({
  status,
  sourceMode,
  policyCount,
  summaryGapDetected,
}) {
  if (status === "Strong") {
    return "Your insurance picture looks strong. We have enough good data, and no major gap is standing out.";
  }

  if (status === "Stable") {
    return sourceMode === "household_summary"
      ? "Your insurance picture looks mostly stable. Nothing urgent is standing out right now."
      : "Your loaded policy data looks mostly stable, but the full household summary is not available right now.";
  }

  if (status === "At Risk") {
    return sourceMode === "household_summary"
      ? "Something in your insurance picture needs attention before you treat it as okay."
      : "Your loaded policy data shows a problem, and the full household summary is not available right now.";
  }

  if (status === "Incomplete") {
    return "We can see part of your insurance picture, but too much key information is still missing.";
  }

  if (status === "Partial") {
    return policyCount > 0
      ? "We have some insurance data, but not enough yet to give you a full, confident read."
      : "Only part of your insurance picture is loaded right now, so this page cannot give a full answer yet.";
  }

  if (status === "Needs Review") {
    return summaryGapDetected
      ? "Your insurance records are loaded, but something still needs a closer look."
      : "Your insurance records are loaded, but this view still needs follow-up before you rely on it.";
  }

  return "There is not enough insurance data yet to tell what is going on.";
}

function buildExplanationSummary({ meaning, sourceMode, summaryError, hasAuthenticatedHousehold }) {
  if (sourceMode === "policy_fallback") {
    if (summaryError) {
      return `${meaning} This is based only on the policy records we could load, because the household summary is unavailable right now.`;
    }

    if (!hasAuthenticatedHousehold) {
      return `${meaning} This is based only on the policy records we could load, because the household summary is not active right now.`;
    }

    return `${meaning} This is using a policy-only view instead of the full household summary.`;
  }

  return `${meaning} This is using the household summary together with the policy data we have loaded.`;
}

function buildDrivers({
  sourceMode,
  summaryLoading,
  summaryError,
  hasAuthenticatedHousehold,
  policyCount,
  gapCount,
  atRiskCount,
  issuesCount,
  confidence,
  strongCount,
  portfolioFlags = {},
}) {
  const drivers = [];
  const addDriver = (weight, text, condition = true) => {
    if (!condition || !text) return;
    drivers.push({ weight, text });
  };

  addDriver(1, "The household summary is unavailable right now", sourceMode === "policy_fallback" && Boolean(summaryError));
  addDriver(1, "The household summary is still loading", sourceMode === "policy_fallback" && !summaryError && summaryLoading);
  addDriver(1, "At least one coverage gap may still be open", gapCount > 0);
  addDriver(1, `${pluralize(atRiskCount, "policy")} look at risk`, atRiskCount > 0);
  addDriver(2, "Policy data is loaded", policyCount > 0);
  addDriver(2, "We have both household and policy data", sourceMode === "household_summary");
  addDriver(2, "Some policy details are still incomplete", issuesCount > 0 || portfolioFlags.incompleteDataSpread);
  addDriver(3, "The loaded policies do not show the full household picture yet", sourceMode === "policy_fallback" && policyCount > 0);
  addDriver(3, "Most loaded policies look stable", policyCount > 1 && strongCount >= Math.max(1, policyCount - 1) && atRiskCount === 0);
  addDriver(3, "Confidence is limited because the documents are thin", confidence > 0 && confidence < 0.65);
  addDriver(3, "The household summary is not active right now", sourceMode === "policy_fallback" && !hasAuthenticatedHousehold && !summaryError);
  addDriver(4, "No readable policies are loaded", policyCount === 0);

  return unique(
    drivers
      .sort((left, right) => left.weight - right.weight)
      .map((item) => item.text)
  );
}

function buildDataSources({
  sourceMode,
  summaryLoading,
  policyCount,
  hasAuthenticatedHousehold,
}) {
  const sources = [];

  if (policyCount > 0) {
    sources.push("Loaded policy records and extracted policy reads");
    sources.push("Statement dates, document quality, and missing fields across the loaded policies");
    sources.push("Coverage and gap signals built from the current policy set");
  }

  if (sourceMode === "household_summary") {
    sources.push("Household insurance summary and household confidence signals");
  } else {
    sources.push("A policy-only fallback view using just the data currently loaded");
  }

  if (summaryLoading && sourceMode === "policy_fallback") {
    sources.push("A household summary refresh that has not finished yet");
  }

  if (!hasAuthenticatedHousehold && sourceMode === "policy_fallback") {
    sources.push("A policy-only view because the household summary is not active");
  }

  if (sources.length === 0) {
    sources.push("Current insurance page state and available insurance evidence checks");
  }

  return unique(sources).slice(0, 5);
}

function buildStatusReasoning({
  status,
  sourceMode,
  confidence,
  gapCount,
  atRiskCount,
  issuesCount,
  limitedVisibilityCount,
  policyCount,
  summaryGapDetected,
}) {
  if (status === "Strong") {
    return "This status was assigned because we have strong household-level support, high confidence, and no clear major gap in the loaded policies.";
  }

  if (status === "Stable") {
    return sourceMode === "household_summary"
      ? "This status was assigned because the household summary and policy data both point to a mostly steady insurance picture."
      : "This status was assigned because the loaded policy data looks mostly steady and does not show an immediate problem.";
  }

  if (status === "At Risk") {
    return summaryGapDetected || gapCount > 0 || atRiskCount > 0
      ? "This status was assigned because the current records show at least one real pressure point, such as an at-risk policy or a coverage gap."
      : "This status was assigned because the current insurance view shows enough pressure that it should not be treated as okay yet.";
  }

  if (status === "Incomplete") {
    return "This status was assigned because key details are missing, confidence is low, or the household-level view is too limited.";
  }

  if (status === "Partial") {
    return policyCount > 0
      ? "This status was assigned because some policy data is present, but not enough to trust the full insurance picture yet."
      : "This status was assigned because only part of the insurance picture is available right now.";
  }

  if (status === "Needs Review") {
    return gapCount > 0 || atRiskCount > 0 || issuesCount > 0 || limitedVisibilityCount > 0 || confidence < 0.65
      ? "This status was assigned because the records are usable, but there are still concerns or missing pieces that need follow-up."
      : "This status was assigned because the insurance picture is readable, but still needs review before you rely on it.";
  }

  return "This status was assigned because there is not enough readable insurance evidence yet for a reliable answer.";
}

function buildLimitations({
  sourceMode,
  summaryLoading,
  summaryError,
  hasAuthenticatedHousehold,
  policyCount,
  gapCount,
  issuesCount,
  missingStatementCount,
  weakConfidenceCount,
  missingFieldPolicyCount,
  portfolioFlags = {},
}) {
  const limitations = [];

  if (sourceMode === "policy_fallback") {
    if (summaryError) {
      limitations.push("This explanation is based only on the loaded policy records because the household summary is unavailable right now.");
    } else if (!hasAuthenticatedHousehold) {
      limitations.push("This explanation is based only on the loaded policy records because the household summary is not active right now.");
    } else {
      limitations.push("This explanation is based only on the loaded policy records while household summary support is limited.");
    }
  }

  if (summaryLoading && sourceMode === "policy_fallback") {
    limitations.push("The household summary is still loading, so the household-level view is temporarily limited.");
  }

  if (policyCount === 0) {
    limitations.push("No readable policy records are loaded right now.");
  }

  if (missingStatementCount > 0) {
    limitations.push(`${pluralize(missingStatementCount, "loaded policy")} do not have a clear latest statement date.`);
  }

  if (missingFieldPolicyCount > 0 || issuesCount > 0) {
    limitations.push(`${pluralize(Math.max(missingFieldPolicyCount, issuesCount), "loaded policy")} still have missing fields or weak document support.`);
  }

  if (weakConfidenceCount > 0) {
    limitations.push(`${pluralize(weakConfidenceCount, "loaded policy")} still have weak confidence support.`);
  }

  if (gapCount > 0) {
    limitations.push("The current records still leave at least one open coverage question.");
  }

  if (portfolioFlags.incompleteDataSpread) {
    limitations.push("Missing or weak data is spread across multiple policies, which lowers confidence.");
  }

  if (limitations.length === 0) {
    limitations.push(
      sourceMode === "household_summary"
        ? "No major confidence limit stands out right now beyond normal document-quality caveats."
        : "Policy-only fallback is active, but no additional major confidence limit stands out right now."
    );
  }

  return unique(limitations).slice(0, 4);
}

function buildPolicyAction(policy = null) {
  const route = policy ? getPolicyDetailRoute(policy) : "";
  if (!route) return null;
  return {
    label: "Open policy details",
    kind: "navigate",
    route,
  };
}

function dedupeActions(actions = []) {
  const seen = new Set();
  return actions.filter((action) => {
    if (!action?.label) return false;
    const key = `${action.kind || "action"}::${action.route || ""}::${action.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildActions({
  status,
  sourceMode,
  policyCount,
  priorityPolicy,
  hasComparison,
}) {
  const protectionAction = {
    label: "Review protection signals",
    kind: "scroll_protection_signals",
  };
  const comparisonAction = hasComparison
    ? {
        label: "Compare loaded policies",
        kind: "scroll_policy_comparison",
      }
    : null;
  const policyAction = buildPolicyAction(priorityPolicy);
  const uploadAction = {
    label: "Upload a policy",
    kind: "navigate",
    route: "/insurance/life/upload",
  };

  if (status === "Not Enough Data") {
    return {
      primaryAction: {
        label: "Upload a policy",
        kind: "navigate",
        route: "/insurance/life/upload",
      },
      secondaryAction: null,
    };
  }

  if (status === "At Risk" || status === "Needs Review" || status === "Incomplete" || status === "Partial") {
    const candidates =
      sourceMode === "policy_fallback"
        ? [protectionAction, comparisonAction, policyAction, uploadAction]
        : [protectionAction, policyAction, comparisonAction, uploadAction];
    const [primaryAction, secondaryAction] = dedupeActions(candidates);
    return { primaryAction, secondaryAction: secondaryAction || null };
  }

  if (status === "Strong" || status === "Stable") {
    const candidates =
      sourceMode === "household_summary"
        ? [comparisonAction || protectionAction, protectionAction, policyAction]
        : [comparisonAction || protectionAction, policyAction || protectionAction, protectionAction];
    const [primaryAction, secondaryAction] = dedupeActions(candidates);
    return { primaryAction, secondaryAction: secondaryAction || null };
  }

  const [primaryAction, secondaryAction] = dedupeActions([protectionAction, comparisonAction, policyAction, uploadAction]);
  return { primaryAction, secondaryAction: secondaryAction || null };
}

function buildCompletenessNote({
  sourceMode,
  summaryLoading,
  summaryError,
  hasAuthenticatedHousehold,
  status,
}) {
  if (status === "Not Enough Data") {
    return "There is not enough household or policy data yet for a reliable insurance read.";
  }

  if (sourceMode === "household_summary") {
    return summaryLoading
      ? "Using household summary and policy data while the household view refreshes."
      : "Using household summary and policy data.";
  }

  if (summaryLoading) {
    return "Using loaded policy data while the household summary refreshes.";
  }

  if (summaryError) {
    return "Using loaded policy data while the household summary is unavailable.";
  }

  if (!hasAuthenticatedHousehold) {
    return "Using loaded policy data while the household summary is not active.";
  }

  return "Using loaded policy data while the household summary is unavailable.";
}

function buildRecommendedAction(primaryAction = null) {
  if (!primaryAction?.label) {
    return {
      label: "Upload a policy",
      detail: "Add a policy or statement so this page can give you a fuller insurance read.",
      action: null,
    };
  }

  if (primaryAction.label === "Review protection signals") {
    return {
      label: primaryAction.label,
      detail: "Start with Protection Signals to see what is driving this result.",
      action: primaryAction,
    };
  }

  if (primaryAction.label === "Compare loaded policies") {
    return {
      label: primaryAction.label,
      detail: "Use Policy Comparison to see which loaded policies look strongest, weakest, or incomplete.",
      action: primaryAction,
    };
  }

  if (primaryAction.label === "Open policy details") {
    return {
      label: primaryAction.label,
      detail: "Open the policy detail that matters most to this result.",
      action: primaryAction,
    };
  }

  return {
    label: primaryAction.label,
    detail: "Follow this step to improve the insurance read.",
    action: primaryAction,
  };
}

export default function buildInsurancePageFascia({
  householdSummary = null,
  summaryLoading = false,
  summaryError = "",
  policies = [],
  protectionSummary = null,
  portfolioSignals = null,
  hasAuthenticatedHousehold = false,
  continuity = {},
  priorityPolicy = null,
} = {}) {
  const safePolicies = Array.isArray(policies) ? policies : [];
  const hasHouseholdSummary = hasHouseholdSummaryData(householdSummary);
  const sourceMode = hasHouseholdSummary ? "household_summary" : "policy_fallback";
  const policyCount = safePolicies.length;
  const gapCount = Number.isFinite(continuity.gapPolicies)
    ? continuity.gapPolicies
    : safePolicies.filter((policy) => Boolean(policy?.gapAnalysis?.coverageGap)).length;
  const atRiskCount = Number.isFinite(continuity.atRiskPolicies)
    ? continuity.atRiskPolicies
    : safePolicies.filter((policy) => policy?.ranking?.status === "At Risk").length;
  const strongCount = Number.isFinite(continuity.strongPolicies)
    ? continuity.strongPolicies
    : safePolicies.filter((policy) => policy?.ranking?.status === "Strong").length;
  const issuesCount = Number.isFinite(continuity.policiesWithIssues)
    ? continuity.policiesWithIssues
    : safePolicies.filter((policy) => {
        const missingCount = Array.isArray(policy?.missing_fields) ? policy.missing_fields.length : 0;
        return (
          policy?.coi_confidence === "weak" ||
          missingCount > 0 ||
          !policy?.latest_statement_date ||
          policy?.data_completeness_status === "basic"
        );
      }).length;
  const missingStatementCount = safePolicies.filter((policy) => !policy?.latest_statement_date).length;
  const weakConfidenceCount = safePolicies.filter((policy) => policy?.coi_confidence === "weak").length;
  const missingFieldPolicyCount = safePolicies.filter((policy) => (policy?.missing_fields || []).length > 0).length;
  const summaryMetrics = householdSummary?.metrics || {};
  const confidence =
    sourceMode === "household_summary"
      ? safeNumber(householdSummary?.confidence, 0)
      : safeNumber(protectionSummary?.confidence ?? portfolioSignals?.confidence, 0);
  const portfolioFlags = portfolioSignals?.portfolioFlags || {};
  const summaryGapDetected = Boolean(
    sourceMode === "household_summary" ? householdSummary?.gapDetected : protectionSummary?.gapDetected
  );
  const limitedVisibilityCount =
    safeNumber(summaryMetrics.lowConfidencePolicies, 0) +
    safeNumber(summaryMetrics.missingDeathBenefitPolicies, 0) +
    safeNumber(summaryMetrics.beneficiaryLimitedPolicies, 0);

  let status = "Not Enough Data";
  if (sourceMode === "household_summary") {
    if (safeNumber(householdSummary?.totalPolicies, policyCount) === 0 && policyCount === 0) {
      status = "Not Enough Data";
    } else if (summaryGapDetected || atRiskCount >= Math.max(1, Math.ceil(policyCount / 2)) || portfolioSignals?.portfolioSignalLevel === "at_risk") {
      status = "At Risk";
    } else if (
      confidence >= 0.8 &&
      householdSummary?.status === "Better Supported" &&
      limitedVisibilityCount === 0 &&
      issuesCount === 0 &&
      strongCount >= Math.max(1, policyCount - 1)
    ) {
      status = "Strong";
    } else if (
      confidence >= 0.65 &&
      limitedVisibilityCount === 0 &&
      !portfolioFlags.incompleteDataSpread &&
      issuesCount <= Math.floor(Math.max(policyCount, 1) / 3)
    ) {
      status = "Stable";
    } else if (
      confidence < 0.4 ||
      limitedVisibilityCount >= Math.max(1, Math.ceil(Math.max(policyCount, 1) / 2)) ||
      portfolioFlags.incompleteDataSpread ||
      issuesCount >= Math.max(1, Math.ceil(Math.max(policyCount, 1) / 2))
    ) {
      status = "Incomplete";
    } else {
      status = "Needs Review";
    }
  } else if (policyCount === 0) {
    status = "Not Enough Data";
  } else if (summaryGapDetected || atRiskCount >= Math.max(1, Math.ceil(policyCount / 2)) || portfolioSignals?.portfolioSignalLevel === "at_risk") {
    status = "At Risk";
  } else if (gapCount > 0 || atRiskCount > 0 || portfolioSignals?.portfolioSignalLevel === "monitor") {
    status = "Needs Review";
  } else if (
    hasAuthenticatedHousehold &&
    policyCount > 1 &&
    confidence >= 0.72 &&
    issuesCount <= Math.floor(policyCount / 3) &&
    !portfolioFlags.incompleteDataSpread
  ) {
    status = "Stable";
  } else {
    status = "Partial";
  }

  const { primaryAction, secondaryAction } = buildActions({
    status,
    sourceMode,
    policyCount,
    priorityPolicy: priorityPolicy || safePolicies[0] || null,
    hasComparison: policyCount > 1,
  });
  const meaning = buildMeaning({
    status,
    sourceMode,
    policyCount,
    summaryGapDetected,
  });
  const explanation = buildFasciaExplanation({
    summary: buildExplanationSummary({
      meaning,
      sourceMode,
      summaryError,
      hasAuthenticatedHousehold,
    }),
    drivers: buildDrivers({
      sourceMode,
      summaryLoading,
      summaryError,
      hasAuthenticatedHousehold,
      policyCount,
      gapCount,
      atRiskCount,
      issuesCount,
      confidence,
      strongCount,
      portfolioFlags,
    }),
    dataSources: buildDataSources({
      sourceMode,
      summaryLoading,
      policyCount,
      hasAuthenticatedHousehold,
    }),
    whyStatusAssigned: buildStatusReasoning({
      status,
      sourceMode,
      confidence,
      gapCount,
      atRiskCount,
      issuesCount,
      limitedVisibilityCount,
      policyCount,
      summaryGapDetected,
    }),
    limitations: buildLimitations({
      sourceMode,
      summaryLoading,
      summaryError,
      hasAuthenticatedHousehold,
      policyCount,
      gapCount,
      issuesCount,
      missingStatementCount,
      weakConfidenceCount,
      missingFieldPolicyCount,
      portfolioFlags,
    }),
    recommendedAction: buildRecommendedAction(primaryAction),
    sourceMode,
  });

  return {
    ...finalizeFascia({
      title: "Insurance Overview",
      status,
      sourceLabel: sourceMode === "household_summary" ? "Household summary" : "Policy-only view",
      sourceTone: status === "Not Enough Data" ? "neutral" : "info",
      sourceMode,
      meaning,
      drivers: explanation.drivers,
      primaryAction,
      secondaryAction,
      tertiaryAction: buildFasciaExplanationToggleAction(),
      completenessNote: buildCompletenessNote({
        sourceMode,
        summaryLoading,
        summaryError,
        hasAuthenticatedHousehold,
        status,
      }),
      explanation,
    }),
    summary: explanation.summary,
    dataSources: explanation.dataSources,
    limitations: explanation.limitations,
    recommendedAction: explanation.recommendedAction,
  };
}
