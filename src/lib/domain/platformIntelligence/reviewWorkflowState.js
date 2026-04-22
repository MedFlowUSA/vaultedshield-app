import { deriveReviewWorkspaceCandidateFromQueueItem } from "../../reviewWorkspace/workspaceFilters.js";
import { saveHouseholdIssueWorkflowStateEntries } from "../../supabase/issueData.js";
import { getSupabaseClient } from "../../supabase/client.js";

const REVIEW_WORKFLOW_STORAGE_KEY = "vaultedshield_household_review_workflow_v2";
const REVIEW_WORKFLOW_DIGEST_STORAGE_KEY = "vaultedshield_household_review_digest_v2";
const LEGACY_REVIEW_WORKFLOW_STORAGE_KEY = "vaultedshield_household_review_workflow_v1";
const LEGACY_REVIEW_WORKFLOW_DIGEST_STORAGE_KEY = "vaultedshield_household_review_digest_v1";
const persistedWorkflowStateByScope = new Map();

export const REVIEW_WORKFLOW_STATUSES = {
  open: {
    key: "open",
    label: "Open",
  },
  pending_documents: {
    key: "pending_documents",
    label: "Pending Documents",
  },
  follow_up: {
    key: "follow_up",
    label: "Follow Up",
  },
  reviewed: {
    key: "reviewed",
    label: "Reviewed",
  },
};

export function buildReviewAssignmentOptions(bundle = {}) {
  const members = (bundle.householdMembers || [])
    .filter((member) => member?.id && member?.full_name)
    .map((member) => ({
      key: `member:${member.id}`,
      label: member.full_name,
      type: "member",
    }));
  const contacts = (bundle.contacts || [])
    .filter((contact) => contact?.id && contact?.full_name)
    .map((contact) => ({
      key: `contact:${contact.id}`,
      label: contact.full_name,
      type: "contact",
    }));
  const seen = new Set();

  return [{ key: "", label: "Unassigned", type: "none" }, ...members, ...contacts].filter((option) => {
    if (!option.key) return true;
    if (seen.has(option.key)) return false;
    seen.add(option.key);
    return true;
  });
}

function safeReadStorage() {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(REVIEW_WORKFLOW_STORAGE_KEY);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function safeWriteStorage(value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REVIEW_WORKFLOW_STORAGE_KEY, JSON.stringify(value));
}

function safeReadDigestStorage() {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(REVIEW_WORKFLOW_DIGEST_STORAGE_KEY);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function safeWriteDigestStorage(value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REVIEW_WORKFLOW_DIGEST_STORAGE_KEY, JSON.stringify(value));
}

function toTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function chooseMoreRecentWorkflowEntry(left = null, right = null) {
  if (!left) return right || null;
  if (!right) return left;
  const leftTimestamp = toTimestamp(left.updated_at);
  const rightTimestamp = toTimestamp(right.updated_at);
  if (leftTimestamp === null && rightTimestamp === null) return right;
  if (leftTimestamp === null) return right;
  if (rightTimestamp === null) return left;
  return rightTimestamp >= leftTimestamp ? right : left;
}

function toStableWorkflowMemoryKey(filters = null) {
  if (!filters?.module || !filters?.issueType) return null;
  return [
    filters.module,
    filters.issueType,
    filters.assetId || "asset",
    filters.recordId || "record",
  ].join("|");
}

function resolveWorkflowMemoryState(item = {}, workflowState = {}) {
  if (!item?.id) return {};
  const directState = workflowState[item.id];
  if (directState) return directState;

  const candidateFilters = deriveReviewWorkspaceCandidateFromQueueItem(item, null);
  const memoryKey = toStableWorkflowMemoryKey(candidateFilters);
  if (!memoryKey) return {};

  const matchedEntry = Object.values(workflowState || {}).find(
    (entry) => entry?.resolution_key && entry.resolution_key === memoryKey
  );

  return matchedEntry || {};
}

function mergeWorkflowStates(...states) {
  const merged = {};
  const byResolutionKey = new Map();

  states
    .filter(Boolean)
    .forEach((state) => {
      Object.entries(state || {}).forEach(([entryKey, entryValue]) => {
        if (!entryValue || typeof entryValue !== "object") return;
        const resolutionKey = entryValue.resolution_key || null;
        if (resolutionKey) {
          const current = byResolutionKey.get(resolutionKey);
          const selected = chooseMoreRecentWorkflowEntry(current, entryValue);
          byResolutionKey.set(resolutionKey, selected);
          return;
        }
        merged[entryKey] = chooseMoreRecentWorkflowEntry(merged[entryKey], entryValue);
      });
    });

  byResolutionKey.forEach((entryValue, resolutionKey) => {
    const entryKey = entryValue?.persisted_issue_id || entryValue?.issue_id || resolutionKey;
    merged[entryKey] = entryValue;
  });

  return merged;
}

function buildPersistedWorkflowStateEntry(issue = {}) {
  const metadata = issue?.metadata;
  const persistedWorkflowState =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata.workflow_state
      : null;
  if (!persistedWorkflowState || typeof persistedWorkflowState !== "object" || Array.isArray(persistedWorkflowState)) {
    return null;
  }

  return {
    ...persistedWorkflowState,
    updated_at: persistedWorkflowState.updated_at || issue.updated_at || null,
    resolution_key:
      persistedWorkflowState.resolution_key ||
      toStableWorkflowMemoryKey(persistedWorkflowState.resolution_filters || null),
    persisted_issue_id: issue.id || null,
    issue_id: issue.id || null,
  };
}

export function buildPersistedReviewWorkflowState(issueRows = []) {
  return (issueRows || []).reduce((accumulator, issue) => {
    const entry = buildPersistedWorkflowStateEntry(issue);
    if (!entry) return accumulator;
    const key = entry.persisted_issue_id || entry.issue_id || entry.resolution_key;
    if (!key) return accumulator;
    accumulator[key] = entry;
    return accumulator;
  }, {});
}

export function buildReviewWorkflowStateEntry({
  item = null,
  currentEntry = {},
  householdId = null,
  updates = {},
} = {}) {
  const candidateFilters = item
    ? deriveReviewWorkspaceCandidateFromQueueItem(item, householdId || null)
    : currentEntry?.resolution_filters || null;
  const resolutionKey = toStableWorkflowMemoryKey(candidateFilters);

  return {
    ...currentEntry,
    ...updates,
    ...(candidateFilters ? { resolution_filters: candidateFilters } : {}),
    ...(resolutionKey ? { resolution_key: resolutionKey } : {}),
    ...(item?.route ? { route: item.route } : {}),
    ...(item?.label ? { label: item.label } : {}),
    ...(item?.source ? { source: item.source } : {}),
  };
}

export function isReviewWorkflowItemResolved(item = {}) {
  return (
    item?.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key &&
    !item?.changed_since_review
  );
}

export function filterActiveReviewWorkflowItems(items = []) {
  return items.filter(
    (item) => item?.workflow_status !== REVIEW_WORKFLOW_STATUSES.reviewed.key || item?.changed_since_review
  );
}

export function filterResolvedReviewWorkflowItems(items = []) {
  return items.filter((item) => isReviewWorkflowItemResolved(item));
}

function resolveReviewScope(input) {
  if (!input) {
    return { key: null, householdId: null, userId: null };
  }
  if (typeof input === "string") {
    return {
      key: `legacy:${input}`,
      householdId: input,
      userId: null,
    };
  }
  const householdId = input.householdId || null;
  const userId = input.userId || null;
  if (!householdId) {
    return { key: null, householdId: null, userId };
  }
  return {
    key: `${userId || "guest"}:${householdId}`,
    householdId,
    userId,
  };
}

export function clearLegacyHouseholdReviewStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_REVIEW_WORKFLOW_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_REVIEW_WORKFLOW_DIGEST_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures so the app can continue safely.
  }
}

export function primeHouseholdReviewWorkflowState(scopeInput, issueRows = []) {
  const scope = resolveReviewScope(scopeInput);
  if (!scope.key) return {};
  const persistedState = buildPersistedReviewWorkflowState(issueRows);
  persistedWorkflowStateByScope.set(scope.key, persistedState);
  return persistedState;
}

export function getHouseholdReviewWorkflowState(scopeInput) {
  const scope = resolveReviewScope(scopeInput);
  if (!scope.key) return {};
  const allState = safeReadStorage();
  const localState = allState[scope.key] || {};
  const persistedState = persistedWorkflowStateByScope.get(scope.key) || {};
  return mergeWorkflowStates(localState, persistedState);
}

export function saveHouseholdReviewWorkflowState(scopeInput, nextState) {
  const scope = resolveReviewScope(scopeInput);
  if (!scope.key) return;
  const allState = safeReadStorage();
  safeWriteStorage({
    ...allState,
    [scope.key]: nextState || {},
  });
  if (scope.householdId && typeof window !== "undefined") {
    const supabase = getSupabaseClient();
    if (supabase) {
      saveHouseholdIssueWorkflowStateEntries(scope.householdId, nextState || {}, { supabase }).catch((error) => {
        console.error("[VaultedShield] review workflow persistence failed.", {
          householdId: scope.householdId,
          error,
        });
      });
    }
  }
}

export function getHouseholdReviewDigestSnapshot(scopeInput) {
  const scope = resolveReviewScope(scopeInput);
  if (!scope.key) return null;
  const allState = safeReadDigestStorage();
  return allState[scope.key] || null;
}

export function saveHouseholdReviewDigestSnapshot(scopeInput, snapshot) {
  const scope = resolveReviewScope(scopeInput);
  if (!scope.key) return;
  const allState = safeReadDigestStorage();
  safeWriteDigestStorage({
    ...allState,
    [scope.key]: snapshot || null,
  });
}

export function annotateReviewWorkflowItems(items = [], workflowState = {}) {
  return items.map((item) => {
    const current = resolveWorkflowMemoryState(item, workflowState);
    const status = REVIEW_WORKFLOW_STATUSES[current.status]
      ? current.status
      : REVIEW_WORKFLOW_STATUSES.open.key;
    const reviewedAt = toTimestamp(current.updated_at);
    const dataUpdatedAt = toTimestamp(item.data_updated_at);
    const changedSinceReview =
      status === REVIEW_WORKFLOW_STATUSES.reviewed.key &&
      reviewedAt !== null &&
      dataUpdatedAt !== null &&
      dataUpdatedAt > reviewedAt;

    return {
      ...item,
      workflow_status: status,
      workflow_label: REVIEW_WORKFLOW_STATUSES[status].label,
      workflow_updated_at: current.updated_at || null,
      workflow_notes: current.notes || "",
      workflow_assignee_key: current.assignee_key || "",
      workflow_assignee_label: current.assignee_label || "Unassigned",
      workflow_assigned_at: current.assigned_at || null,
      workflow_resolution_key: current.resolution_key || null,
      workflow_resolution_filters: current.resolution_filters || null,
      changed_since_review: changedSinceReview,
      changed_since_review_label: changedSinceReview ? "Changed Since Review" : "",
    };
  });
}

export function buildHouseholdReviewDigest(items = [], previousSnapshot = null) {
  const currentSnapshot = {
    captured_at: new Date().toISOString(),
      items: items.map((item) => ({
        id: item.id,
        label: item.label,
        workflow_status: item.workflow_status,
        workflow_assignee_key: item.workflow_assignee_key || "",
        workflow_assignee_label: item.workflow_assignee_label || "Unassigned",
        workflow_resolution_key: item.workflow_resolution_key || null,
        changed_since_review: Boolean(item.changed_since_review),
        summary: item.summary,
        change_signal: item.change_signal || "",
      })),
    };

  const previousItemsById = Object.fromEntries(
    (previousSnapshot?.items || []).map((item) => [item.id, item])
  );

  const reopenedItems = [];
  const improvedItems = [];
  const stillOpenItems = [];
  const assignedItems = [];

  currentSnapshot.items.forEach((item) => {
    const previous = previousItemsById[item.id];

    if (item.workflow_assignee_key) {
      assignedItems.push(item);
    }

    if (item.changed_since_review) {
      reopenedItems.push(item);
      return;
    }

    if (
      previous &&
      previous.workflow_status !== REVIEW_WORKFLOW_STATUSES.reviewed.key &&
      item.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key
    ) {
      improvedItems.push(item);
      return;
    }

    if (item.workflow_status !== REVIEW_WORKFLOW_STATUSES.reviewed.key) {
      stillOpenItems.push(item);
    }
  });

  const bullets = [
    ...(reopenedItems.slice(0, 2).map((item) => `${item.label} has new evidence and is back in review.`)),
    ...(improvedItems.slice(0, 2).map((item) => `${item.label} moved into reviewed status.`)),
    ...(stillOpenItems.slice(0, 2).map((item) => `${item.label} remains active in the review queue.`)),
  ].slice(0, 5);

  const summary =
    reopenedItems.length > 0
      ? `${reopenedItems.length} ${reopenedItems.length === 1 ? "item has" : "items have"} changed since the last review snapshot.`
      : improvedItems.length > 0
        ? `${improvedItems.length} ${improvedItems.length === 1 ? "item moved" : "items moved"} into reviewed status since the last snapshot.`
        : stillOpenItems.length > 0
          ? `${stillOpenItems.length} ${stillOpenItems.length === 1 ? "item remains" : "items remain"} active in the household review queue.`
          : "No active household review changes are standing out right now.";

  return {
    current_snapshot: currentSnapshot,
    summary,
    reopened_count: reopenedItems.length,
    improved_count: improvedItems.length,
    active_count: stillOpenItems.length,
    resolved_count: currentSnapshot.items.filter(
      (item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key && !item.changed_since_review
    ).length,
    assigned_count: assignedItems.length,
    reopened_items: reopenedItems,
    improved_items: improvedItems,
    still_open_items: stillOpenItems,
    assigned_items: assignedItems,
    bullets,
  };
}
