const UNIVERSAL_INTENTS = [
  {
    id: "policy_health",
    label: "Is this policy healthy?",
    aliases: ["Is this policy doing well?", "Are there any risk flags?"],
  },
  {
    id: "policy_type",
    label: "What kind of policy is this?",
    aliases: [],
  },
  {
    id: "what_to_review_first",
    label: "What should I review first?",
    aliases: [],
  },
  {
    id: "data_completeness",
    label: "Is the data complete enough to trust?",
    aliases: [],
  },
];

const TYPE_INTENTS = {
  iul: [
    { id: "performance", label: "Is this policy performing well?", aliases: ["Is cash value growing well?"] },
    { id: "charges", label: "Are charges hurting this policy?", aliases: ["What charges are hurting it?"] },
    { id: "illustration_vs_actual", label: "Are we ahead or behind the illustration?", aliases: [] },
    { id: "funding_sufficiency", label: "Is funding strong enough?", aliases: ["Is the policy being funded strongly enough?"] },
    {
      id: "loan_risk",
      label: "Is there visible loan or lapse pressure?",
      aliases: ["Are loans creating risk?", "Is there visible lapse or loan pressure?"],
    },
    { id: "strategy_mix", label: "What is the current strategy mix?", aliases: ["What is the indexed allocation?", "What is the current allocation mix?"] },
  ],
  ul: [
    { id: "performance", label: "Is this policy performing well?", aliases: ["Is cash value growing well?"] },
    { id: "charges", label: "Are charges hurting this policy?", aliases: ["What charges are hurting it?"] },
    { id: "illustration_vs_actual", label: "Are we ahead or behind the illustration?", aliases: [] },
    { id: "funding_sufficiency", label: "Is funding strong enough?", aliases: ["Is the policy being funded strongly enough?"] },
    {
      id: "loan_risk",
      label: "Is there visible loan or lapse pressure?",
      aliases: ["Are loans creating risk?", "Is there visible lapse or loan pressure?"],
    },
    { id: "strategy_mix", label: "What is the current strategy mix?", aliases: ["What is the current allocation mix?"] },
  ],
  whole_life: [
    { id: "whole_life_behavior", label: "Is this acting like a stable whole life policy?", aliases: ["Is cash value progressing steadily?"] },
    { id: "dividend_visibility", label: "Are dividends visible?", aliases: [] },
    { id: "whole_life_loan_risk", label: "Is there visible loan pressure?", aliases: ["Is there loan pressure?"] },
  ],
  term: [
    { id: "term_expiration", label: "When does this coverage end?", aliases: ["What happens near term expiration?"] },
    { id: "term_conversion", label: "Is conversion visible?", aliases: ["Is there conversion visibility?"] },
    { id: "term_coverage", label: "What kind of term coverage is this?", aliases: [] },
  ],
  final_expense: [
    { id: "final_expense_structure", label: "Is this structured like permanent final expense coverage?", aliases: ["What is the benefit structure?", "Is this permanent coverage?"] },
    { id: "waiting_period_visibility", label: "Is a waiting period visible?", aliases: ["Is there a waiting period?"] },
    { id: "final_expense_fit", label: "What should I understand about this policy first?", aliases: ["Is this appropriate for final expense needs?"] },
  ],
};

export function getPolicyAssistantIntents(policyType = "unknown") {
  return [...UNIVERSAL_INTENTS, ...(TYPE_INTENTS[policyType] || [])];
}

export function findPolicyAssistantIntent(value, policyType = "unknown") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;

  return getPolicyAssistantIntents(policyType).find((intent) => {
    if (intent.id === normalized) return true;
    if (intent.label.toLowerCase() === normalized) return true;
    return (intent.aliases || []).some((alias) => alias.toLowerCase() === normalized);
  }) || null;
}

export function getPolicyAssistantIntentLabel(intentId, policyType = "unknown") {
  return findPolicyAssistantIntent(intentId, policyType)?.label || intentId;
}
