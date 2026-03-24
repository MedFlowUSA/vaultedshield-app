function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizePositiveValue(value) {
  const numeric = toNumber(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

function pickMortgageBalance(mortgage = {}) {
  const candidates = [
    mortgage.metadata?.current_principal_balance,
    mortgage.metadata?.unpaid_principal_balance,
    mortgage.metadata?.payoff_amount,
    mortgage.current_principal_balance,
    mortgage.unpaid_principal_balance,
    mortgage.payoff_amount,
    mortgage.assets?.summary?.current_principal_balance,
    mortgage.assets?.summary?.unpaid_principal_balance,
  ];

  for (const candidate of candidates) {
    const value = toNumber(candidate);
    if (value !== null) return value;
  }

  return null;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function deriveVisibilityStatus({
  valuationAvailable,
  mortgageBalance,
  hasHomeowners,
  financingVisible,
}) {
  if (valuationAvailable && mortgageBalance !== null && hasHomeowners && financingVisible) {
    return "strong";
  }
  if (valuationAvailable && (mortgageBalance !== null || hasHomeowners || financingVisible)) {
    return "partial";
  }
  if (valuationAvailable || financingVisible || hasHomeowners) {
    return "limited";
  }
  return "unavailable";
}

export function evaluatePropertyEquityPosition(propertyBundle = {}) {
  const latestPropertyValuation = propertyBundle.latestPropertyValuation || null;
  const linkedMortgages = propertyBundle.linkedMortgages || [];
  const linkedHomeownersPolicies = propertyBundle.linkedHomeownersPolicies || [];
  const propertyStackAnalytics = propertyBundle.propertyStackAnalytics || null;

  const primaryMortgage =
    linkedMortgages.find((item) => item.linkage?.is_primary) ||
    linkedMortgages[0] ||
    null;
  const primaryMortgageBalance = primaryMortgage ? pickMortgageBalance(primaryMortgage) : null;
  const hasHomeowners = linkedHomeownersPolicies.length > 0;
  const financingVisible = linkedMortgages.length > 0;
  const valuationAvailable = Boolean(latestPropertyValuation?.id);
  const valuationConfidenceLabel = latestPropertyValuation?.confidence_label || null;

  const estimatedValueMidpoint = sanitizePositiveValue(latestPropertyValuation?.midpoint_estimate);
  const estimatedValueLow = sanitizePositiveValue(latestPropertyValuation?.low_estimate);
  const estimatedValueHigh = sanitizePositiveValue(latestPropertyValuation?.high_estimate);
  const estimatedEquityMidpoint =
    estimatedValueMidpoint !== null && primaryMortgageBalance !== null
      ? estimatedValueMidpoint - primaryMortgageBalance
      : null;
  const estimatedEquityLow =
    estimatedValueLow !== null && primaryMortgageBalance !== null
      ? estimatedValueLow - primaryMortgageBalance
      : null;
  const estimatedEquityHigh =
    estimatedValueHigh !== null && primaryMortgageBalance !== null
      ? estimatedValueHigh - primaryMortgageBalance
      : null;
  const estimatedLtv =
    estimatedValueMidpoint && primaryMortgageBalance !== null && estimatedValueMidpoint > 0
      ? Number((primaryMortgageBalance / estimatedValueMidpoint).toFixed(2))
      : null;

  const protectionStatus = hasHomeowners ? "visible" : "missing";
  const financingStatus = financingVisible
    ? primaryMortgageBalance !== null
      ? "visible"
      : "linked_balance_missing"
    : "missing";
  const equityVisibilityStatus = deriveVisibilityStatus({
    valuationAvailable,
    mortgageBalance: primaryMortgageBalance,
    hasHomeowners,
    financingVisible,
  });

  const reviewFlags = [];
  const prompts = [];

  if (!valuationAvailable) {
    reviewFlags.push("valuation_missing");
    prompts.push("A virtual property value review has not been run yet.");
  }
  if (latestPropertyValuation?.id && estimatedValueMidpoint === null) {
    reviewFlags.push("invalid_saved_valuation");
    prompts.push("The latest saved valuation contains invalid value output and should be refreshed.");
  }
  if (valuationConfidenceLabel === "weak") {
    reviewFlags.push("valuation_confidence_weak");
    prompts.push("The latest virtual valuation has weak confidence, so value range review should stay cautious.");
  }
  if (!hasHomeowners) {
    reviewFlags.push("homeowners_protection_missing");
    prompts.push("This property shows value visibility but no linked homeowners protection record.");
  }
  if (!financingVisible) {
    reviewFlags.push("mortgage_visibility_missing");
    prompts.push("This property does not currently show linked financing visibility.");
  } else if (primaryMortgageBalance === null) {
    reviewFlags.push("mortgage_balance_missing");
    prompts.push("A mortgage link is present, but a current principal balance is not visible yet.");
  }
  if (estimatedLtv !== null && estimatedLtv > 0.8) {
    reviewFlags.push("ltv_review_elevated");
    prompts.push("Estimated loan-to-value appears elevated based on the current value range and visible debt.");
  }
  if (equityVisibilityStatus === "strong") {
    reviewFlags.push("equity_visibility_strong");
    prompts.push("This property currently has strong value, debt, and protection visibility.");
  }
  if (
    propertyStackAnalytics?.linkage_status === "complete_property_stack" &&
    !valuationAvailable
  ) {
    reviewFlags.push("complete_stack_missing_value_review");
    prompts.push("The property stack is complete, but a virtual value review has not been stored yet.");
  }

  return {
    latest_valuation_id: latestPropertyValuation?.id || null,
    valuation_available: valuationAvailable,
    valuation_confidence_label: valuationConfidenceLabel,
    estimated_value_midpoint: estimatedValueMidpoint,
    estimated_value_low: estimatedValueLow,
    estimated_value_high: estimatedValueHigh,
    primary_mortgage_loan_id: primaryMortgage?.id || null,
    primary_mortgage_balance: primaryMortgageBalance,
    estimated_equity_midpoint: estimatedEquityMidpoint,
    estimated_equity_low: estimatedEquityLow,
    estimated_equity_high: estimatedEquityHigh,
    estimated_ltv: estimatedLtv,
    equity_visibility_status: equityVisibilityStatus,
    protection_status: protectionStatus,
    financing_status: financingStatus,
    review_flags: unique(reviewFlags),
    prompts: unique(prompts),
  };
}
