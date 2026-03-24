const REVIEW_WORKFLOW_STORAGE_KEY = "vaultedshield_household_review_workflow_v1";
const REVIEW_WORKFLOW_DIGEST_STORAGE_KEY = "vaultedshield_household_review_digest_v1";

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

export function getHouseholdReviewWorkflowState(householdId) {
  if (!householdId) return {};
  const allState = safeReadStorage();
  return allState[householdId] || {};
}

export function saveHouseholdReviewWorkflowState(householdId, nextState) {
  if (!householdId) return;
  const allState = safeReadStorage();
  safeWriteStorage({
    ...allState,
    [householdId]: nextState || {},
  });
}

export function getHouseholdReviewDigestSnapshot(householdId) {
  if (!householdId) return null;
  const allState = safeReadDigestStorage();
  return allState[householdId] || null;
}

export function saveHouseholdReviewDigestSnapshot(householdId, snapshot) {
  if (!householdId) return;
  const allState = safeReadDigestStorage();
  safeWriteDigestStorage({
    ...allState,
    [householdId]: snapshot || null,
  });
}

export function annotateReviewWorkflowItems(items = [], workflowState = {}) {
  return items.map((item) => {
    const current = workflowState[item.id] || {};
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

  currentSnapshot.items.forEach((item) => {
    const previous = previousItemsById[item.id];

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
    reopened_items: reopenedItems,
    improved_items: improvedItems,
    still_open_items: stillOpenItems,
    bullets,
  };
}
