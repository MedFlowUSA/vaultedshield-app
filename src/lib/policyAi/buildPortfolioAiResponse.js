function dedupe(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function policyLabel(policy = {}) {
  return policy.label || policy.product || policy.product_name || policy.carrier || policy.id || "Policy";
}

function findPoliciesByIds(policies = [], ids = []) {
  const lookup = new Map(
    policies.map((policy) => [policy.policy_id || policy.id || "", policy])
  );
  return ids.map((id) => lookup.get(id)).filter(Boolean);
}

function addEvidence(evidence, label, value, source = "Portfolio signals") {
  if (value === null || value === undefined || value === "") return;
  evidence.push({ label, value: String(value), source });
}

function answerPriority(portfolioSignals, policies) {
  const priorityPolicies = findPoliciesByIds(policies, portfolioSignals.priorityPolicyIds);
  const firstPolicy = priorityPolicies[0] || null;
  const evidence = [];

  addEvidence(evidence, "Portfolio Signal", portfolioSignals.portfolioSignalLevel.replace(/_/g, " "));
  addEvidence(evidence, "Priority Policy", firstPolicy ? policyLabel(firstPolicy) : "None visible");
  addEvidence(evidence, "At-Risk Policies", portfolioSignals.totals.atRiskCount);

  const answer = firstPolicy
    ? `${policyLabel(firstPolicy)} needs attention first. It is currently one of the clearest pressure points in the portfolio, based on the portfolio signal and the current policy-level evidence. ${portfolioSignals.reasons[0] || "This priority is driven by visible pressure rather than a guess."}`
    : "No single policy is standing out as the immediate first review item right now. The portfolio still has a signal read, but it is not concentrating the pressure into one obvious first file.";

  return { answer, evidence };
}

function answerStrongest(portfolioSignals, policies) {
  const strongestPolicies = findPoliciesByIds(policies, portfolioSignals.strongestPolicyIds);
  const firstPolicy = strongestPolicies[0] || null;
  const evidence = [];

  addEvidence(evidence, "Portfolio Signal", portfolioSignals.portfolioSignalLevel.replace(/_/g, " "));
  addEvidence(evidence, "Strongest Policy", firstPolicy ? policyLabel(firstPolicy) : "None visible");
  addEvidence(evidence, "Healthy Policies", portfolioSignals.totals.healthyCount);

  const answer = firstPolicy
    ? `${policyLabel(firstPolicy)} currently looks strongest in the saved portfolio. It stands out because its signal profile is cleaner than the others, and the current evidence stack is comparatively more stable. ${portfolioSignals.totals.healthyCount > 1 ? `There are ${portfolioSignals.totals.healthyCount} healthy-reading policies overall.` : "It is the clearest healthy-reading file right now."}`
    : "A strongest policy is not visible yet because the current portfolio evidence is still too thin or too mixed.";

  return { answer, evidence };
}

function answerWeakest(portfolioSignals, policies) {
  const weakestPolicies = findPoliciesByIds(policies, portfolioSignals.weakestPolicyIds);
  const labels = weakestPolicies.slice(0, 3).map((policy) => policyLabel(policy));
  const evidence = [];

  addEvidence(evidence, "At-Risk Policies", portfolioSignals.totals.atRiskCount);
  addEvidence(evidence, "Monitor Policies", portfolioSignals.totals.monitorCount);
  addEvidence(evidence, "Weakest Visible Policies", labels.join(", "));

  const answer =
    labels.length > 0
      ? `${labels.join(", ")} currently read as the weakest visible policies in the portfolio. That does not mean they are identical problems, but they are the ones carrying the most visible pressure or weakest support. ${portfolioSignals.reasons[0] || "The portfolio signal is using current structured evidence to make that call."}`
      : "No weak policy grouping is clearly visible yet from the current portfolio evidence.";

  return { answer, evidence };
}

function answerRiskSummary(portfolioSignals) {
  const activeFlags = Object.entries(portfolioSignals.portfolioFlags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => key.replace(/([A-Z])/g, " $1").toLowerCase());
  const evidence = [];

  addEvidence(evidence, "Portfolio Signal", portfolioSignals.portfolioSignalLevel.replace(/_/g, " "));
  addEvidence(evidence, "At-Risk Policies", portfolioSignals.totals.atRiskCount);
  addEvidence(evidence, "Active Portfolio Flags", activeFlags.join(", "));

  const answer =
    activeFlags.length > 0
      ? `The biggest visible portfolio risks are ${activeFlags.join(", ")}. ${portfolioSignals.reasons.slice(0, 2).join(" ")}`
      : `No single portfolio-wide risk theme is dominating right now. The portfolio signal still reads ${portfolioSignals.portfolioSignalLevel.replace(/_/g, " ")}, so the current mix should be read together with policy-level detail.`;

  return { answer, evidence };
}

function answerIncompleteData(portfolioSignals, policies) {
  const incompletePolicies = policies.filter((policy) => policy.policySignals?.flags?.incompleteData);
  const evidence = [];

  addEvidence(evidence, "Incomplete Data Spread", portfolioSignals.portfolioFlags.incompleteDataSpread ? "Yes" : "No");
  addEvidence(evidence, "Policies With Incomplete Data", incompletePolicies.map((policy) => policyLabel(policy)).join(", "));

  const answer =
    incompletePolicies.length > 0
      ? `Incomplete data is still concentrated in ${incompletePolicies.map((policy) => policyLabel(policy)).join(", ")}. ${portfolioSignals.portfolioFlags.incompleteDataSpread ? "That spread is large enough to weaken the overall portfolio read." : "The gap is visible, but it is not yet spread across most of the portfolio."}`
      : "No major incomplete-data cluster is standing out across the portfolio right now.";

  return { answer, evidence };
}

function answerPortfolioHealth(portfolioSignals) {
  const evidence = [];
  addEvidence(evidence, "Portfolio Signal", portfolioSignals.portfolioSignalLevel.replace(/_/g, " "));
  addEvidence(evidence, "Healthy Policies", portfolioSignals.totals.healthyCount);
  addEvidence(evidence, "Monitor Policies", portfolioSignals.totals.monitorCount);
  addEvidence(evidence, "At-Risk Policies", portfolioSignals.totals.atRiskCount);

  return {
    answer: `The portfolio currently reads ${portfolioSignals.portfolioSignalLevel.replace(/_/g, " ")} overall. ${portfolioSignals.totals.healthyCount} policies are healthy, ${portfolioSignals.totals.monitorCount} are in monitor status, and ${portfolioSignals.totals.atRiskCount} are at risk. ${portfolioSignals.reasons[0] || "That read is based on the current structured policy evidence."}`,
    evidence,
  };
}

function answerComparisonOverview(portfolioSignals, policies) {
  const strongest = findPoliciesByIds(policies, portfolioSignals.strongestPolicyIds)[0] || null;
  const weakest = findPoliciesByIds(policies, portfolioSignals.weakestPolicyIds)[0] || null;
  const evidence = [];

  addEvidence(evidence, "Strongest Policy", strongest ? policyLabel(strongest) : "Unavailable");
  addEvidence(evidence, "Weakest Policy", weakest ? policyLabel(weakest) : "Unavailable");
  addEvidence(evidence, "Portfolio Signal", portfolioSignals.portfolioSignalLevel.replace(/_/g, " "));

  return {
    answer: strongest && weakest
      ? `${policyLabel(strongest)} currently looks strongest, while ${policyLabel(weakest)} is the clearest weaker file. The gap between them is mostly being driven by evidence quality, visible pressure flags, and current signal stability rather than one isolated metric.`
      : "A clean strongest-versus-weakest comparison is not fully visible yet from the current portfolio evidence.",
    evidence,
  };
}

export function buildPortfolioAiResponse({
  policies = [],
  portfolioSignals = null,
  userQuestion = "",
  intent = "general_summary",
} = {}) {
  const safeSignals = portfolioSignals || {
    portfolioSignalLevel: "monitor",
    reasons: ["The portfolio signal is still forming from the current evidence."],
    totals: {
      totalPolicies: policies.length,
      healthyCount: 0,
      monitorCount: policies.length,
      atRiskCount: 0,
    },
    priorityPolicyIds: [],
    strongestPolicyIds: [],
    weakestPolicyIds: [],
    portfolioFlags: {},
    confidence: 0.4,
  };

  let response;
  switch (intent) {
    case "priority":
      response = answerPriority(safeSignals, policies);
      break;
    case "strongest":
      response = answerStrongest(safeSignals, policies);
      break;
    case "weakest":
      response = answerWeakest(safeSignals, policies);
      break;
    case "risk_summary":
      response = answerRiskSummary(safeSignals, policies);
      break;
    case "incomplete_data":
      response = answerIncompleteData(safeSignals, policies);
      break;
    case "comparison_overview":
      response = answerComparisonOverview(safeSignals, policies);
      break;
    case "portfolio_health":
    case "general_summary":
    default:
      response = answerPortfolioHealth(safeSignals, policies);
      break;
  }

  return {
    answer: response.answer,
    evidence: dedupe(response.evidence),
    confidence: safeSignals.confidence ?? null,
    disclaimers: [
      "This portfolio read is based on the policies currently visible in VaultedShield and is not product, tax, or legal advice.",
    ],
    userQuestion,
  };
}
