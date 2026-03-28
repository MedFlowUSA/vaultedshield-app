const STORAGE_KEY_PREFIX = "vaultedshield-college-goals-v1";

function buildScopedStorageKey({ userId = null, householdId = null } = {}) {
  return `${STORAGE_KEY_PREFIX}:${userId || "guest"}:${householdId || "none"}`;
}

export function loadCollegeGoalState(scope = {}) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(buildScopedStorageKey(scope));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCollegeGoalState(scope = {}, state = null) {
  if (typeof window === "undefined") return;
  try {
    const key = buildScopedStorageKey(scope);
    if (!state) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Ignore storage failures so the planner continues working.
  }
}
