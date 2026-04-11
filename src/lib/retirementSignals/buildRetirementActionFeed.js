export function buildRetirementActionFeed({
  retirementSignals = null,
  retirementRead = null,
  positions = [],
} = {}) {
  if (!retirementSignals) return [];

  const actions = [];

  if (retirementSignals.flags.incompleteData) {
    actions.push({
      id: "retirement-complete-evidence",
      title: "Strengthen account evidence",
      summary:
        "Current statement, balance, or contribution support is still incomplete, so this account should stay in a review state.",
      actionLabel: "Review documents",
      target: { type: "scroll_section", section: "documents" },
      urgency: "high",
      category: "data_completion",
    });
  }

  if (retirementSignals.flags.positionVisibility) {
    actions.push({
      id: "retirement-parse-positions",
      title: "Parse or refresh position detail",
      summary:
        "Allocation detail is still missing, which limits concentration and holding-level review.",
      actionLabel: "Open positions",
      target: { type: "scroll_section", section: "positions" },
      urgency: "warning",
      category: "positions_review",
    });
  }

  if (retirementSignals.flags.concentrationRisk) {
    actions.push({
      id: "retirement-review-concentration",
      title: "Review allocation concentration",
      summary:
        positions.length > 0
          ? "One visible holding appears to dominate the current account mix."
          : "A concentration warning is present, but parsed position detail is still limited.",
      actionLabel: "Inspect allocations",
      target: { type: "scroll_section", section: "positions" },
      urgency: "warning",
      category: "concentration_review",
    });
  }

  if (retirementSignals.flags.loanRisk) {
    actions.push({
      id: "retirement-review-loan",
      title: "Review account loan visibility",
      summary:
        "Loan-related pressure is visible in the account read and should be checked alongside balance support.",
      actionLabel: "Open analytics",
      target: { type: "scroll_section", section: "analytics" },
      urgency: "warning",
      category: "loan_review",
    });
  }

  if (retirementSignals.flags.beneficiaryRisk) {
    actions.push({
      id: "retirement-review-beneficiary",
      title: "Confirm beneficiary visibility",
      summary:
        "Beneficiary information is missing or uncertain in the current account evidence.",
      actionLabel: "Open analytics",
      target: { type: "scroll_section", section: "analytics" },
      urgency: "warning",
      category: "beneficiary_review",
    });
  }

  if (retirementSignals.flags.staleStatement) {
    actions.push({
      id: "retirement-refresh-statement",
      title: "Refresh statement recency",
      summary:
        "The latest visible retirement statement may be aging, so a fresher file would improve confidence.",
      actionLabel: "Open snapshots",
      target: { type: "scroll_section", section: "snapshots" },
      urgency: "info",
      category: "recency_review",
    });
  }

  if (!actions.length && retirementRead?.headline) {
    actions.push({
      id: "retirement-monitor",
      title: "Monitor current retirement read",
      summary: retirementRead.headline,
      actionLabel: "Open read summary",
      target: { type: "scroll_section", section: "signals" },
      urgency: "info",
      category: "monitoring",
    });
  }

  const urgencyRank = { high: 3, warning: 2, info: 1 };
  return actions
    .sort((left, right) => (urgencyRank[right.urgency] || 0) - (urgencyRank[left.urgency] || 0))
    .slice(0, 5);
}

export default buildRetirementActionFeed;
