import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import EmptyState from "../components/shared/EmptyState";
import {
  buildHouseholdReviewDigest,
  getHouseholdReviewDigestSnapshot,
  getHouseholdReviewWorkflowState,
  REVIEW_WORKFLOW_STATUSES,
  saveHouseholdReviewDigestSnapshot,
  saveHouseholdReviewWorkflowState,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { buildHouseholdReviewQueueItems } from "../lib/domain/platformIntelligence/reviewWorkspaceData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";

const REVIEW_WORKSPACE_VIEW_STORAGE_KEY = "vaultedshield_review_workspace_views_v1";

function actionStyle(primary = false) {
  return {
    padding: "10px 14px",
    borderRadius: "12px",
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
  };
}

function statusToneStyles(status) {
  if (status === REVIEW_WORKFLOW_STATUSES.reviewed.key) {
    return { color: "#166534", background: "#dcfce7" };
  }
  if (status === REVIEW_WORKFLOW_STATUSES.pending_documents.key) {
    return { color: "#92400e", background: "#fef3c7" };
  }
  if (status === REVIEW_WORKFLOW_STATUSES.follow_up.key) {
    return { color: "#9a3412", background: "#fed7aa" };
  }
  return { color: "#475569", background: "#e2e8f0" };
}

function sourceOptions(items = []) {
  return ["all", ...new Set(items.map((item) => item.source).filter(Boolean))];
}

function assignmentOptions(bundle = {}) {
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

function safeReadWorkspaceViews() {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(REVIEW_WORKSPACE_VIEW_STORAGE_KEY);
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function safeWriteWorkspaceViews(value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REVIEW_WORKSPACE_VIEW_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage write failures so queue interactions remain usable.
  }
}

function toTimestamp(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortItems(items = [], sortKey = "priority") {
  const nextItems = [...items];

  if (sortKey === "recent") {
    return nextItems.sort((left, right) => toTimestamp(right.data_updated_at) - toTimestamp(left.data_updated_at));
  }

  if (sortKey === "source") {
    return nextItems.sort((left, right) =>
      `${left.source || ""}:${left.label || ""}`.localeCompare(`${right.source || ""}:${right.label || ""}`)
    );
  }

  if (sortKey === "status") {
    const order = {
      [REVIEW_WORKFLOW_STATUSES.follow_up.key]: 0,
      [REVIEW_WORKFLOW_STATUSES.pending_documents.key]: 1,
      [REVIEW_WORKFLOW_STATUSES.open.key]: 2,
      [REVIEW_WORKFLOW_STATUSES.reviewed.key]: 3,
    };
    return nextItems.sort((left, right) => {
      const statusDelta = (order[left.workflow_status] ?? 99) - (order[right.workflow_status] ?? 99);
      if (statusDelta !== 0) return statusDelta;
      return (left.label || "").localeCompare(right.label || "");
    });
  }

  if (sortKey === "owner") {
    return nextItems.sort((left, right) =>
      `${left.workflow_assignee_label || ""}:${left.label || ""}`.localeCompare(
        `${right.workflow_assignee_label || ""}:${right.label || ""}`
      )
    );
  }

  return nextItems.sort((left, right) => {
    const priorityOrder = { critical: 0, warning: 1, info: 2, open: 3 };
    const urgencyDelta = (priorityOrder[left.urgency] ?? 99) - (priorityOrder[right.urgency] ?? 99);
    if (urgencyDelta !== 0) return urgencyDelta;
    if (left.changed_since_review !== right.changed_since_review) {
      return left.changed_since_review ? -1 : 1;
    }
    return toTimestamp(right.data_updated_at) - toTimestamp(left.data_updated_at);
  });
}

export default function ReviewWorkspacePage({ onNavigate }) {
  const { householdState, debug, intelligenceBundle, intelligence } = usePlatformShellData();
  const [reviewWorkflowState, setReviewWorkflowState] = useState({});
  const [reviewDigestSnapshot, setReviewDigestSnapshot] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [sortKey, setSortKey] = useState("priority");
  const [savedViews, setSavedViews] = useState([]);

  const reviewScope = useMemo(
    () => ({
      householdId: householdState.context.householdId,
      userId: debug.authUserId || null,
    }),
    [debug.authUserId, householdState.context.householdId]
  );

  useEffect(() => {
    setReviewWorkflowState(getHouseholdReviewWorkflowState(reviewScope));
    setReviewDigestSnapshot(getHouseholdReviewDigestSnapshot(reviewScope));
  }, [reviewScope]);

  useEffect(() => {
    const viewKey = `${reviewScope.userId || "guest"}:${reviewScope.householdId || "none"}`;
    const allViews = safeReadWorkspaceViews();
    setSavedViews(allViews[viewKey] || []);
  }, [reviewScope]);

  const { queueItems } = useMemo(
    () =>
      buildHouseholdReviewQueueItems({
        bundle: intelligenceBundle || {},
        intelligence,
        savedPolicyRows: [],
        reviewWorkflowState,
      }),
    [intelligence, intelligenceBundle, reviewWorkflowState]
  );

  const reviewDigest = useMemo(
    () => buildHouseholdReviewDigest(queueItems || [], reviewDigestSnapshot),
    [queueItems, reviewDigestSnapshot]
  );

  const assigneeChoices = useMemo(() => assignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);

  const visibleItems = useMemo(() => {
    let nextItems = [...queueItems];

    if (statusFilter === "active") {
      nextItems = nextItems.filter(
        (item) => item.workflow_status !== REVIEW_WORKFLOW_STATUSES.reviewed.key || item.changed_since_review
      );
    } else if (statusFilter === "reviewed") {
      nextItems = nextItems.filter(
        (item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key && !item.changed_since_review
      );
    } else if (statusFilter !== "all") {
      nextItems = nextItems.filter((item) => item.workflow_status === statusFilter);
    }

    if (sourceFilter !== "all") {
      nextItems = nextItems.filter((item) => item.source === sourceFilter);
    }

    if (assigneeFilter === "assigned") {
      nextItems = nextItems.filter((item) => Boolean(item.workflow_assignee_key));
    } else if (assigneeFilter === "unassigned") {
      nextItems = nextItems.filter((item) => !item.workflow_assignee_key);
    } else if (assigneeFilter !== "all") {
      nextItems = nextItems.filter((item) => item.workflow_assignee_key === assigneeFilter);
    }

    return sortItems(nextItems, sortKey);
  }, [assigneeFilter, queueItems, sourceFilter, sortKey, statusFilter]);

  const metrics = useMemo(
    () => [
      {
        label: "Active",
        value: queueItems.filter((item) => item.workflow_status !== REVIEW_WORKFLOW_STATUSES.reviewed.key || item.changed_since_review).length,
        helper: "Items still in motion",
      },
      {
        label: "Pending Docs",
        value: queueItems.filter((item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.pending_documents.key).length,
        helper: "Waiting on evidence",
      },
      {
        label: "Follow Up",
        value: queueItems.filter((item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.follow_up.key).length,
        helper: "Needs outreach or resolution",
      },
      {
        label: "Reviewed",
        value: queueItems.filter((item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key && !item.changed_since_review).length,
        helper: "Closed cleanly",
      },
      {
        label: "Reopened",
        value: reviewDigest.reopened_count,
        helper: "Changed since review",
      },
      {
        label: "Assigned",
        value: reviewDigest.assigned_count,
        helper: "Routed to an owner",
      },
    ],
    [queueItems, reviewDigest]
  );

  function handleReviewWorkflowUpdate(itemId, status) {
    if (!reviewScope.householdId || !itemId) return;
    const nextState = {
      ...reviewWorkflowState,
      [itemId]: {
        ...(reviewWorkflowState[itemId] || {}),
        status,
        updated_at: new Date().toISOString(),
      },
    };
    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

  function handleAssignmentUpdate(itemId, assigneeKey) {
    if (!reviewScope.householdId || !itemId) return;
    const assignee = assigneeChoices.find((option) => option.key === assigneeKey) || assigneeChoices[0];
    const nextState = {
      ...reviewWorkflowState,
      [itemId]: {
        ...(reviewWorkflowState[itemId] || {}),
        assignee_key: assignee?.key || "",
        assignee_label: assignee?.label || "Unassigned",
        assigned_at: assignee?.key ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
    };
    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

  function handleBulkUpdate(status) {
    if (!reviewScope.householdId || visibleItems.length === 0) return;
    const nextState = { ...reviewWorkflowState };
    const updatedAt = new Date().toISOString();
    visibleItems.forEach((item) => {
      nextState[item.id] = {
        ...(reviewWorkflowState[item.id] || {}),
        status,
        updated_at: updatedAt,
      };
    });
    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

  function handleBulkAssignment(assigneeKey) {
    if (!reviewScope.householdId || visibleItems.length === 0) return;
    const assignee = assigneeChoices.find((option) => option.key === assigneeKey) || assigneeChoices[0];
    const nextState = { ...reviewWorkflowState };
    const updatedAt = new Date().toISOString();
    visibleItems.forEach((item) => {
      nextState[item.id] = {
        ...(reviewWorkflowState[item.id] || {}),
        assignee_key: assignee?.key || "",
        assignee_label: assignee?.label || "Unassigned",
        assigned_at: assignee?.key ? updatedAt : null,
        updated_at: updatedAt,
      };
    });
    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

  function handleRefreshSnapshot() {
    if (!reviewScope.householdId) return;
    const snapshot = reviewDigest.current_snapshot;
    setReviewDigestSnapshot(snapshot);
    saveHouseholdReviewDigestSnapshot(reviewScope, snapshot);
  }

  function handleSaveCurrentView() {
    if (!reviewScope.householdId) return;
    const viewKey = `${reviewScope.userId || "guest"}:${reviewScope.householdId || "none"}`;
    const nextViews = [
      {
        id: `${Date.now()}`,
        label: [
          statusFilter === "active" ? "Active" : statusFilter,
          sourceFilter === "all" ? "All Sources" : sourceFilter,
          assigneeFilter === "all"
            ? "All Owners"
            : assigneeFilter === "assigned"
              ? "Assigned"
              : assigneeFilter === "unassigned"
                ? "Unassigned"
                : assigneeChoices.find((option) => option.key === assigneeFilter)?.label || "Owner",
        ].join(" / "),
        statusFilter,
        sourceFilter,
        assigneeFilter,
        sortKey,
      },
      ...savedViews,
    ].slice(0, 4);
    const allViews = safeReadWorkspaceViews();
    safeWriteWorkspaceViews({
      ...allViews,
      [viewKey]: nextViews,
    });
    setSavedViews(nextViews);
  }

  function handleApplySavedView(view) {
    setStatusFilter(view.statusFilter || "active");
    setSourceFilter(view.sourceFilter || "all");
    setAssigneeFilter(view.assigneeFilter || "all");
    setSortKey(view.sortKey || "priority");
  }

  function handleDeleteSavedView(viewId) {
    if (!reviewScope.householdId) return;
    const viewKey = `${reviewScope.userId || "guest"}:${reviewScope.householdId || "none"}`;
    const nextViews = savedViews.filter((item) => item.id !== viewId);
    const allViews = safeReadWorkspaceViews();
    safeWriteWorkspaceViews({
      ...allViews,
      [viewKey]: nextViews,
    });
    setSavedViews(nextViews);
  }

  const sourceChoices = useMemo(() => sourceOptions(queueItems), [queueItems]);

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <PageHeader
        eyebrow="Household Operations"
        title="Review Workspace"
        description="A dedicated cross-module queue for working household blockers, updating status, assigning owners, and moving evidence-backed review forward."
        actions={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={handleRefreshSnapshot} style={actionStyle(false)}>
              Refresh Snapshot
            </button>
            <button type="button" onClick={() => onNavigate?.("/dashboard")} style={actionStyle(true)}>
              Back To Dashboard
            </button>
          </div>
        }
      />

      <SectionCard title="Queue Summary" subtitle={reviewDigest.summary}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          {metrics.map((item) => (
            <div
              key={item.label}
              style={{
                padding: "14px 16px",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>
                {item.label}
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>{item.value}</div>
              <div style={{ color: "#475569", fontSize: "13px", lineHeight: "1.5" }}>{item.helper}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Work Queue" subtitle="Filter, sort, save views, assign owners, and apply status changes in one place.">
        <div style={{ display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {[
              { key: "active", label: "Active" },
              { key: "all", label: "All" },
              { key: REVIEW_WORKFLOW_STATUSES.pending_documents.key, label: "Pending Docs" },
              { key: REVIEW_WORKFLOW_STATUSES.follow_up.key, label: "Follow Up" },
              { key: "reviewed", label: "Reviewed" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setStatusFilter(option.key)}
                style={{
                  ...actionStyle(statusFilter === option.key),
                  background: statusFilter === option.key ? "#0f172a" : "#ffffff",
                  color: statusFilter === option.key ? "#ffffff" : "#0f172a",
                }}
              >
                {option.label}
              </button>
            ))}
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              style={{ padding: "10px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#ffffff" }}
            >
              {sourceChoices.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All Sources" : option}
                </option>
              ))}
            </select>
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              style={{ padding: "10px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#ffffff" }}
            >
              <option value="all">All Owners</option>
              <option value="assigned">Assigned Only</option>
              <option value="unassigned">Unassigned Only</option>
              {assigneeChoices
                .filter((option) => option.key)
                .map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
            </select>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value)}
              style={{ padding: "10px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#ffffff" }}
            >
              <option value="priority">Sort: Priority</option>
              <option value="recent">Sort: Most Recent</option>
              <option value="status">Sort: Status</option>
              <option value="source">Sort: Source</option>
              <option value="owner">Sort: Owner</option>
            </select>
            <button type="button" onClick={handleSaveCurrentView} style={actionStyle(false)}>
              Save Current View
            </button>
          </div>

          {savedViews.length > 0 ? (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {savedViews.map((view) => (
                <div
                  key={view.id}
                  style={{
                    display: "flex",
                    gap: "6px",
                    alignItems: "center",
                    padding: "6px",
                    borderRadius: "14px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <button type="button" onClick={() => handleApplySavedView(view)} style={actionStyle(false)}>
                    {view.label}
                  </button>
                  <button type="button" onClick={() => handleDeleteSavedView(view.id)} style={{ ...actionStyle(false), padding: "10px 12px" }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => handleBulkUpdate(REVIEW_WORKFLOW_STATUSES.pending_documents.key)} style={actionStyle(false)}>
              Mark Visible Pending Docs
            </button>
            <button type="button" onClick={() => handleBulkUpdate(REVIEW_WORKFLOW_STATUSES.follow_up.key)} style={actionStyle(false)}>
              Mark Visible Follow Up
            </button>
            <button type="button" onClick={() => handleBulkUpdate(REVIEW_WORKFLOW_STATUSES.reviewed.key)} style={actionStyle(false)}>
              Mark Visible Reviewed
            </button>
            <button type="button" onClick={() => handleBulkUpdate(REVIEW_WORKFLOW_STATUSES.open.key)} style={actionStyle(false)}>
              Reopen Visible
            </button>
            <select
              defaultValue=""
              onChange={(event) => {
                handleBulkAssignment(event.target.value);
                event.target.value = "";
              }}
              style={{ padding: "10px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#ffffff" }}
            >
              <option value="">Assign Visible To...</option>
              {assigneeChoices.map((option) => (
                <option key={option.key || "unassigned"} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {visibleItems.length === 0 ? (
            <EmptyState
              title="No review items match these filters"
              description="Try changing the status, source, or owner filter to bring more household blockers into view."
            />
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {visibleItems.map((item, index) => {
                const workflowTone = statusToneStyles(item.workflow_status);
                const canOpenRoute = Boolean(item.route);
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: "16px",
                      borderRadius: "18px",
                      border: "1px solid #e2e8f0",
                      background: "#ffffff",
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>
                          Queue Item {index + 1} · {item.source || "Household"}
                        </div>
                        <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{item.label}</div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ padding: "6px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, ...workflowTone }}>
                          {item.workflow_label}
                        </span>
                        {item.changed_since_review ? (
                          <span style={{ padding: "6px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, color: "#1d4ed8", background: "#dbeafe" }}>
                            {item.changed_since_review_label}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.summary}</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: item.workflow_assignee_key ? "#1d4ed8" : "#64748b",
                          background: item.workflow_assignee_key ? "#dbeafe" : "#e2e8f0",
                        }}
                      >
                        Owner: {item.workflow_assignee_label}
                      </span>
                      <select
                        value={item.workflow_assignee_key || ""}
                        onChange={(event) => handleAssignmentUpdate(item.id, event.target.value)}
                        style={{ padding: "8px 10px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff" }}
                      >
                        {assigneeChoices.map((option) => (
                          <option key={option.key || "unassigned"} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {item.change_signal ? (
                      <div style={{ color: item.changed_since_review ? "#1d4ed8" : "#64748b", lineHeight: "1.6", fontSize: "14px" }}>
                        {item.change_signal}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => canOpenRoute && onNavigate?.(item.route)}
                        disabled={!canOpenRoute}
                        title={canOpenRoute ? item.route : "No route is available for this review item yet."}
                        style={{
                          ...actionStyle(true),
                          cursor: canOpenRoute ? "pointer" : "not-allowed",
                          opacity: canOpenRoute ? 1 : 0.55,
                        }}
                      >
                        {canOpenRoute ? item.action_label || "Open review" : "Route unavailable"}
                      </button>
                      <button type="button" onClick={() => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.pending_documents.key)} style={actionStyle(false)}>
                        Pending Docs
                      </button>
                      <button type="button" onClick={() => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.follow_up.key)} style={actionStyle(false)}>
                        Follow Up
                      </button>
                      <button type="button" onClick={() => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.reviewed.key)} style={actionStyle(false)}>
                        {item.changed_since_review ? "Review Again" : "Mark Reviewed"}
                      </button>
                      {item.workflow_status !== REVIEW_WORKFLOW_STATUSES.open.key ? (
                        <button type="button" onClick={() => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.open.key)} style={actionStyle(false)}>
                          Reopen
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
