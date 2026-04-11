import { clearLegacyHouseholdReviewStorage } from "../domain/platformIntelligence/reviewWorkflowState.js";
import { getSupabaseClient } from "../supabase/client.js";

export const ACCOUNT_DELETION_FUNCTION_NAME = "request-account-deletion";
export const ACCOUNT_DELETION_RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000;
export const ACCOUNT_DELETION_FLASH_KEY = "vaultedshield-account-deletion-flash-v1";

const APP_STORAGE_KEY_PREFIXES = ["vaultedshield-", "vaultedshield_"];

export const ACCOUNT_DELETION_SCOPE_ITEMS = [
  {
    title: "VaultedShield login access",
    description: "Your authenticated account and ongoing access to the app are permanently removed.",
  },
  {
    title: "Household-owned workspace data",
    description:
      "Your owned household, members, contacts, assets, reports, portal records, and linked module records are removed with the household ownership tree.",
  },
  {
    title: "User-owned policy intelligence data",
    description:
      "Your vaulted policies, uploaded policy files, snapshots, analytics, and statement history are removed with your account.",
  },
];

function buildDeletionResponse(ok, status, message, extra = {}) {
  return {
    ok,
    status,
    message,
    ...extra,
  };
}

function collectPrefixedStorageKeys(storage, prefixes = APP_STORAGE_KEY_PREFIXES) {
  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") {
    return [];
  }

  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      keys.push(key);
    }
  }
  return keys;
}

function clearPrefixedStorage(storage, prefixes = APP_STORAGE_KEY_PREFIXES) {
  collectPrefixedStorageKeys(storage, prefixes).forEach((key) => {
    storage.removeItem(key);
  });
}

export function getRecentAuthTimestamp(session = null) {
  return session?.lastAuthAt || session?.lastSignInAt || session?.createdAt || null;
}

export function isRecentAuthTimestamp(
  timestamp,
  nowMs = Date.now(),
  windowMs = ACCOUNT_DELETION_RECENT_AUTH_WINDOW_MS
) {
  if (!timestamp) return false;
  const authMs = new Date(timestamp).getTime();
  if (!Number.isFinite(authMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - authMs <= windowMs;
}

export function requiresDeletionReauth(session = null, nowMs = Date.now()) {
  return !isRecentAuthTimestamp(getRecentAuthTimestamp(session), nowMs);
}

export function setAccountDeletionFlash(message = "") {
  if (typeof window === "undefined" || !message) return;
  try {
    window.sessionStorage.setItem(ACCOUNT_DELETION_FLASH_KEY, message);
  } catch {
    // Ignore flash persistence errors so deletion cleanup can continue.
  }
}

export function consumeAccountDeletionFlash() {
  if (typeof window === "undefined") return "";
  try {
    const value = window.sessionStorage.getItem(ACCOUNT_DELETION_FLASH_KEY) || "";
    if (value) {
      window.sessionStorage.removeItem(ACCOUNT_DELETION_FLASH_KEY);
    }
    return value;
  } catch {
    return "";
  }
}

export function clearVaultedShieldSessionArtifacts() {
  if (typeof window === "undefined") return;

  try {
    clearPrefixedStorage(window.localStorage);
    clearLegacyHouseholdReviewStorage();
  } catch {
    // Ignore storage cleanup failures so auth teardown can continue safely.
  }

  try {
    clearPrefixedStorage(window.sessionStorage);
  } catch {
    // Ignore session storage cleanup failures so auth teardown can continue safely.
  }
}

async function readFunctionErrorPayload(error) {
  if (typeof error?.context?.json !== "function") return null;
  try {
    return await error.context.json();
  } catch {
    return null;
  }
}

export function normalizeAccountDeletionPayload(payload) {
  const status = payload?.status;
  const message = payload?.message || "";

  if (status === "completed") {
    return buildDeletionResponse(
      true,
      "completed",
      message ||
        "Your VaultedShield account and owned data were permanently deleted. Limited records may be retained only where required by law."
    );
  }

  if (status === "requested") {
    return buildDeletionResponse(
      true,
      "requested",
      message ||
        "Your account deletion request is already in progress. You will be signed out while cleanup completes."
    );
  }

  if (status === "reauth_required") {
    return buildDeletionResponse(
      false,
      "reauth_required",
      message || "For security, re-enter your password before deleting your account."
    );
  }

  return buildDeletionResponse(
    false,
    "failed",
    message || "Account deletion could not be completed right now. Please try again."
  );
}

async function normalizeAccountDeletionError(error) {
  const payload = await readFunctionErrorPayload(error);
  if (payload?.status) {
    return normalizeAccountDeletionPayload(payload);
  }

  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("failed to fetch") || lowerMessage.includes("network")) {
    return buildDeletionResponse(
      false,
      "failed",
      "We couldn't reach VaultedShield securely. Check your connection and try again."
    );
  }

  return buildDeletionResponse(
    false,
    "failed",
    "Account deletion could not be completed right now. Please try again."
  );
}

export async function requestAccountDeletion({
  supabase = getSupabaseClient(),
  session = null,
  skipRecentAuthCheck = false,
} = {}) {
  if (!supabase) {
    return buildDeletionResponse(
      false,
      "failed",
      "Secure account deletion is unavailable because Supabase is not configured."
    );
  }

  if (!skipRecentAuthCheck && requiresDeletionReauth(session)) {
    return buildDeletionResponse(
      false,
      "reauth_required",
      "For security, re-enter your password before deleting your account."
    );
  }

  const { data, error } = await supabase.functions.invoke(ACCOUNT_DELETION_FUNCTION_NAME, {
    body: {
      initiated_at: new Date().toISOString(),
    },
  });

  if (error) {
    return normalizeAccountDeletionError(error);
  }

  return normalizeAccountDeletionPayload(data);
}
