const STORAGE_KEY_PREFIX = "vaultedshield-retirement-goal-v1";

function buildScopedStorageKey({ userId = null, householdId = null } = {}) {
  return `${STORAGE_KEY_PREFIX}:${userId || "guest"}:${householdId || "none"}`;
}

export function loadRetirementGoalSnapshot(scope = {}) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(buildScopedStorageKey(scope));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveRetirementGoalSnapshot(scope = {}, snapshot = null) {
  if (typeof window === "undefined") return;
  try {
    const key = buildScopedStorageKey(scope);
    if (!snapshot) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Ignore local persistence failures so the planner keeps working.
  }
}
