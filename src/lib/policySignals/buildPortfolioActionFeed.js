import { normalizePortfolioPolicy } from "./portfolioSignalRules.js";

function uniqueBy(items = [], getKey = (item) => item.id) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function policyLookup(policies = []) {
  const lookup = new Map();
  policies.forEach((policy) => {
    const id = policy.policy_id || policy.id;
    if (id) lookup.set(id, policy);
  });
  return lookup;
}

function policyLabel(policy = {}) {
  return policy.product || policy.product_name || policy.label || policy.carrier || "Policy";
}

function routeForPolicy(policy = {}) {
  const id = policy.policy_id || policy.id;
  return id ? `/insurance/policy/${id}` : "/insurance";
}

function firstReason(policy = {}) {
  return (
    policy.policySignals?.reasons?.[0] ||
    policy.policy_signals?.primary_reason ||
    policy.review_reason ||
    policy.interpretation?.bottom_line_summary ||
    "This policy is one of the clearest visible pressure points in the current portfolio."
  );
}

export function buildPortfolioActionFeed({ policies = [], portfolioSignals = null } = {}) {
  const byId = policyLookup(policies);
  const actions = [];

  const priorityPolicies = (portfolioSignals?.priorityPolicyIds || [])
    .map((id) => byId.get(id))
    .filter(Boolean);
  priorityPolicies.slice(0, 3).forEach((policy, index) => {
    actions.push({
      id: `priority-policy-${policy.policy_id || policy.id || index}`,
      title: `Review ${policyLabel(policy)}`,
      summary: firstReason(policy),
      actionLabel: "Open policy review",
      route: routeForPolicy(policy),
      urgency: index === 0 ? "high" : "warning",
      category: "policy_review",
      policyId: policy.policy_id || policy.id || null,
    });
  });

  if (portfolioSignals?.portfolioFlags?.incompleteDataSpread) {
    const incompletePolicies = policies
      .filter((policy) => normalizePortfolioPolicy(policy).flags.incompleteData)
      .slice(0, 3)
      .map((policy) => policyLabel(policy));
    actions.push({
      id: "portfolio-incomplete-data",
      title: "Close portfolio data gaps",
      summary:
        incompletePolicies.length > 0
          ? `Missing or thin support is spread across ${incompletePolicies.join(", ")}. Completing those files will raise trust in the overall portfolio read.`
          : "Important missing data is spread across multiple policies, lowering confidence in the portfolio read.",
      actionLabel: "Review missing fields",
      route: "/insurance",
      urgency: "warning",
      category: "data_completion",
      policyId: null,
    });
  }

  if (portfolioSignals?.portfolioFlags?.chargeDragRisk) {
    const chargePolicies = policies
      .filter((policy) => normalizePortfolioPolicy(policy).flags.chargeDrag)
      .slice(0, 3)
      .map((policy) => policyLabel(policy));
    actions.push({
      id: "portfolio-charge-drag",
      title: "Validate charge drag across the portfolio",
      summary:
        chargePolicies.length > 0
          ? `Charge pressure is visible in ${chargePolicies.join(", ")}. Review whether deductions are becoming a broader portfolio theme.`
          : "Charge drag appears in multiple policies and should be checked as a portfolio-wide theme.",
      actionLabel: "Inspect charge pressure",
      route: "/insurance",
      urgency: "warning",
      category: "portfolio_risk",
      policyId: null,
    });
  }

  if (portfolioSignals?.portfolioFlags?.loanExposureRisk) {
    const loanPolicies = policies
      .filter((policy) => normalizePortfolioPolicy(policy).flags.loanRisk)
      .slice(0, 3)
      .map((policy) => policyLabel(policy));
    actions.push({
      id: "portfolio-loan-risk",
      title: "Review loan exposure",
      summary:
        loanPolicies.length > 0
          ? `Loan pressure is visible in ${loanPolicies.join(", ")}. Review those files together so loan risk is not treated as isolated.`
          : "Loan-related pressure is visible across the portfolio and should be reviewed together.",
      actionLabel: "Check loan pressure",
      route: "/insurance",
      urgency: "warning",
      category: "portfolio_risk",
      policyId: null,
    });
  }

  const strongestPolicy = byId.get(portfolioSignals?.strongestPolicyIds?.[0] || "");
  const weakestPolicy = byId.get(portfolioSignals?.weakestPolicyIds?.[0] || "");
  if (strongestPolicy && weakestPolicy && (strongestPolicy.policy_id || strongestPolicy.id) !== (weakestPolicy.policy_id || weakestPolicy.id)) {
    actions.push({
      id: "portfolio-compare-support",
      title: "Compare strongest vs weakest support",
      summary: `${policyLabel(strongestPolicy)} currently reads strongest, while ${policyLabel(weakestPolicy)} reads weakest. Comparing them side by side can clarify what evidence quality the portfolio is missing.`,
      actionLabel: "Open portfolio comparison",
      route: "/insurance",
      urgency: "info",
      category: "comparison",
      policyId: null,
    });
  }

  const urgencyRank = {
    high: 3,
    warning: 2,
    info: 1,
  };

  const ordered = uniqueBy(actions).sort(
    (left, right) => (urgencyRank[right.urgency] || 0) - (urgencyRank[left.urgency] || 0)
  );
  const comparisonAction = ordered.find((item) => item.category === "comparison") || null;
  const finalActions = ordered.slice(0, 5);

  if (comparisonAction && !finalActions.some((item) => item.id === comparisonAction.id) && finalActions.length > 0) {
    finalActions[finalActions.length - 1] = comparisonAction;
  }

  return uniqueBy(finalActions);
}
