export function isIulShowcasePolicy(policy) {
  const normalizedType = String(
    policy?.policy_type ||
      policy?.policyType ||
      policy?.policy_type_label ||
      policy?.basicAnalysis?.policyType ||
      ""
  )
    .trim()
    .toLowerCase();

  if (["iul", "indexed_universal_life", "indexed universal life"].includes(normalizedType)) {
    return true;
  }

  const displayText = [policy?.product, policy?.product_name, policy?.policy_type_label]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return displayText.includes("iul") || displayText.includes("indexed universal");
}

export function getPolicyDetailRoute(policy) {
  if (!policy?.policy_id) return "/insurance";
  return isIulShowcasePolicy(policy) ? `/insurance/iul/${policy.policy_id}` : `/insurance/${policy.policy_id}`;
}

export function getPolicyEntryLabel(policy) {
  return isIulShowcasePolicy(policy) ? "Open IUL Review Console" : "Open Policy Detail";
}
