export function normalizePlatformScope(scopeOverride = null) {
  if (!scopeOverride) {
    return {
      householdId: null,
      authUserId: null,
      ownershipMode: "unknown",
      guestFallbackActive: false,
      scopeSource: "unspecified",
    };
  }

  if (typeof scopeOverride === "string") {
    return {
      householdId: scopeOverride,
      authUserId: null,
      ownershipMode: "explicit_household",
      guestFallbackActive: false,
      scopeSource: "explicit_household",
    };
  }

  return {
    householdId: scopeOverride.householdId || null,
    authUserId: scopeOverride.authUserId || null,
    ownershipMode: scopeOverride.ownershipMode || "unknown",
    guestFallbackActive: Boolean(scopeOverride.guestFallbackActive),
    scopeSource: scopeOverride.scopeSource || scopeOverride.source || "unspecified",
  };
}

export function appendHouseholdScope(filters = [], scopeOverride = null) {
  const scope = normalizePlatformScope(scopeOverride);
  if (!scope.householdId) return filters;
  return [...filters, { column: "household_id", value: scope.householdId }];
}

export function buildScopedAccessError(recordLabel = "Record") {
  return new Error(`${recordLabel} was not found in the active household scope.`);
}
