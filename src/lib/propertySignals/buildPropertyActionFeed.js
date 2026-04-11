function uniqueBy(items = [], getKey = (item) => item.id) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildPropertyActionFeed({
  property = null,
  propertySignals = null,
  valuationChangeSummary = null,
} = {}) {
  if (!propertySignals) return [];

  const propertyLabel = property?.property_name || property?.property_address || "this property";
  const actions = [];

  if (propertySignals.flags.valuationMissing) {
    actions.push({
      id: "property-first-valuation",
      title: "Run the first virtual valuation",
      summary: `No saved valuation is available for ${propertyLabel}, so value, equity, and comp support are still incomplete.`,
      actionLabel: "Open property facts",
      target: { type: "scroll_section", section: "facts" },
      urgency: "high",
      category: "valuation_setup",
    });
  }

  if (propertySignals.flags.incompleteFacts) {
    actions.push({
      id: "property-complete-facts",
      title: "Complete core property facts",
      summary: "Missing subject facts are holding back comp matching and keeping the valuation range broader than it needs to be.",
      actionLabel: "Review property facts",
      target: { type: "scroll_section", section: "facts" },
      urgency: propertySignals.flags.valuationMissing ? "high" : "warning",
      category: "data_completion",
    });
  }

  if (propertySignals.flags.weakValuation || propertySignals.flags.compQualityRisk || propertySignals.flags.marketSupportGap) {
    actions.push({
      id: "property-review-valuation",
      title: "Review valuation support",
      summary: propertySignals.reasons.find((reason) => reason.includes("valuation") || reason.includes("Comparable-sale")) || "The current valuation support should be reviewed before treating the estimate as tight.",
      actionLabel: "Open valuation review",
      target: { type: "scroll_section", section: "valuation" },
      urgency: propertySignals.signalLevel === "at_risk" ? "high" : "warning",
      category: "valuation_review",
    });
  }

  if (propertySignals.flags.debtVisibilityGap) {
    actions.push({
      id: "property-review-financing",
      title: "Tighten financing visibility",
      summary: "Mortgage linkage or balance visibility is still incomplete, which weakens the equity read.",
      actionLabel: "Open mortgage linkage",
      target: { type: "scroll_section", section: "mortgages" },
      urgency: "warning",
      category: "financing_review",
    });
  }

  if (propertySignals.flags.protectionGap) {
    actions.push({
      id: "property-link-homeowners",
      title: "Link homeowners protection",
      summary: "Protection visibility is still missing, so this property is not yet being reviewed as a full value-debt-coverage stack.",
      actionLabel: "Open homeowners linkage",
      target: { type: "scroll_section", section: "homeowners" },
      urgency: "warning",
      category: "coverage_review",
    });
  }

  if (propertySignals.flags.equityPressure) {
    actions.push({
      id: "property-review-equity",
      title: "Review equity pressure",
      summary: "The visible loan-to-value read looks elevated and deserves a closer look alongside the current valuation range.",
      actionLabel: "Open equity review",
      target: { type: "scroll_section", section: "equity" },
      urgency: "high",
      category: "equity_review",
    });
  }

  if (valuationChangeSummary?.change_status && valuationChangeSummary.change_status !== "insufficient_history") {
    actions.push({
      id: "property-review-history",
      title: "Check valuation movement",
      summary: valuationChangeSummary.summary,
      actionLabel: "Open valuation history",
      target: { type: "scroll_section", section: "valuation_history" },
      urgency: "info",
      category: "history_review",
    });
  }

  const urgencyRank = { high: 3, warning: 2, info: 1 };

  return uniqueBy(actions)
    .sort((left, right) => (urgencyRank[right.urgency] || 0) - (urgencyRank[left.urgency] || 0))
    .slice(0, 5);
}

export default buildPropertyActionFeed;
