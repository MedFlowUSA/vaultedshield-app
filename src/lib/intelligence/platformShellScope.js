export function resolvePlatformDataScope(accessSession = null, householdState = null) {
  const householdId = householdState?.context?.householdId || null;
  const ownershipMode = householdState?.context?.ownershipMode || "loading";
  const guestFallbackActive = Boolean(householdState?.context?.guestFallbackActive);
  const authUserId = accessSession?.isAuthenticated ? accessSession?.userId || null : null;
  const isAuthenticated = Boolean(authUserId);
  const isAuthenticatedScopeReady = !authUserId || (
    householdId &&
    ownershipMode === "authenticated_owned" &&
    !guestFallbackActive
  );

  return {
    authUserId,
    householdId,
    ownershipMode,
    guestFallbackActive,
    canLoadShellData: isAuthenticated && Boolean(householdId) && isAuthenticatedScopeReady && !householdState?.loading,
    scopeSource: authUserId
      ? isAuthenticatedScopeReady && !householdState?.loading
        ? "authenticated_owned"
        : "awaiting_owned_household"
      : "auth_required",
  };
}
