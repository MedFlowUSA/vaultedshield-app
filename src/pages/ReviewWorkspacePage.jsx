import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import EmptyState from "../components/shared/EmptyState";
import PlainLanguageBridge from "../components/shared/PlainLanguageBridge";
import { FriendlyActionTile, SuggestedActionsRow } from "../components/shared/FriendlyIntelligenceUI";
import {
  buildReviewWorkflowStateEntry,
  buildHouseholdReviewDigest,
  getHouseholdReviewDigestSnapshot,
  getHouseholdReviewWorkflowState,
  REVIEW_WORKFLOW_STATUSES,
  saveHouseholdReviewDigestSnapshot,
  saveHouseholdReviewWorkflowState,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { buildHouseholdReviewQueueItems } from "../lib/domain/platformIntelligence/reviewWorkspaceData";
import { buildWorkflowAwareHouseholdContext } from "../lib/domain/platformIntelligence/workflowMemory";
import { buildHouseholdScorecard } from "../lib/domain/platformIntelligence/householdOperatingSystem";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  applyReviewWorkspaceFilters,
  deriveReviewWorkspaceCandidateFromQueueItem,
  formatReviewWorkspaceFilterSummary,
  parseReviewWorkspaceHashState,
} from "../lib/reviewWorkspace/workspaceFilters";

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

function urgencyPresentation(urgency = "info") {
  if (urgency === "critical" || urgency === "high") {
    return {
      icon: "🔴",
      label: "Attention needed",
      accent: "#991b1b",
      background: "#fee2e2",
      border: "1px solid rgba(248, 113, 113, 0.22)",
    };
  }

  if (urgency === "warning" || urgency === "medium") {
    return {
      icon: "🟡",
      label: "Needs review",
      accent: "#92400e",
      background: "#fef3c7",
      border: "1px solid rgba(245, 158, 11, 0.22)",
    };
  }

  return {
    icon: "📄",
    label: "Worth a look",
    accent: "#475569",
    background: "#e2e8f0",
    border: "1px solid rgba(148, 163, 184, 0.22)",
  };
}

function friendlyUrgencyPresentation(urgency = "info") {
  const legacy = urgencyPresentation(urgency);

  if (urgency === "critical" || urgency === "high") {
    return {
      icon: "High",
      label: "Attention needed",
      accent: legacy.accent,
      background: legacy.background,
      border: legacy.border,
    };
  }

  if (urgency === "warning" || urgency === "medium") {
    return {
      icon: "Review",
      label: "Needs review",
      accent: legacy.accent,
      background: legacy.background,
      border: legacy.border,
    };
  }

  return {
    icon: "Note",
    label: "Worth a look",
    accent: legacy.accent,
    background: legacy.background,
    border: legacy.border,
  };
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

function scrollToWorkspaceSection(sectionId) {
  if (typeof document === "undefined") return;
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function buildIssueClusters(items = [], householdId = null) {
  const urgencyRank = { critical: 4, high: 4, warning: 3, medium: 3, info: 2, low: 1, open: 1 };
  const clusters = new Map();

  items.forEach((item) => {
    const filters = deriveReviewWorkspaceCandidateFromQueueItem(item, householdId);
    if (!filters) return;
    const key = `${filters.module}:${filters.issueType}`;
    const current = clusters.get(key) || {
      key,
      filters,
      count: 0,
      urgency: item.urgency || "info",
      examples: [],
      items: [],
    };

    current.count += 1;
    if ((urgencyRank[item.urgency] ?? 0) > (urgencyRank[current.urgency] ?? 0)) {
      current.urgency = item.urgency || current.urgency;
    }
    if (current.examples.length < 2 && item.label) {
      current.examples.push(item.label);
    }
    current.items.push(item);

    clusters.set(key, current);
  });

  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      summaryLabels: formatReviewWorkspaceFilterSummary(cluster.filters),
    }))
    .sort((left, right) => {
      const countDelta = right.count - left.count;
      if (countDelta !== 0) return countDelta;
      return (urgencyRank[right.urgency] ?? 0) - (urgencyRank[left.urgency] ?? 0);
    });
}

export default function ReviewWorkspacePage({ onNavigate }) {
  const { householdState, debug, intelligenceBundle, intelligence } = usePlatformShellData();
  const [reviewWorkflowState, setReviewWorkflowState] = useState({});
  const [reviewDigestSnapshot, setReviewDigestSnapshot] = useState(null);
  const [assistantFilterState, setAssistantFilterState] = useState({
    openedFromAssistant: false,
    filters: null,
  });
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
    function syncAssistantFiltersFromHash() {
      const nextState = parseReviewWorkspaceHashState(
        typeof window !== "undefined" ? window.location.hash : "",
        reviewScope.householdId || null
      );
      setAssistantFilterState({
        openedFromAssistant: nextState.openedFromAssistant,
        filters: nextState.filters,
      });
    }

    syncAssistantFiltersFromHash();
    if (typeof window === "undefined") return undefined;
    window.addEventListener("hashchange", syncAssistantFiltersFromHash);
    return () => window.removeEventListener("hashchange", syncAssistantFiltersFromHash);
  }, [reviewScope.householdId]);

  useEffect(() => {
    const viewKey = `${reviewScope.userId || "guest"}:${reviewScope.householdId || "none"}`;
    const allViews = safeReadWorkspaceViews();
    setSavedViews(allViews[viewKey] || []);
  }, [reviewScope]);

  const { householdMap, queueItems } = useMemo(
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
  const baseScorecard = useMemo(() => buildHouseholdScorecard(householdMap), [householdMap]);
  const workflowAwareContext = useMemo(
    () =>
      buildWorkflowAwareHouseholdContext({
        householdMap,
        queueItems,
        reviewDigest,
        bundle: intelligenceBundle,
      }),
    [householdMap, intelligenceBundle, queueItems, reviewDigest]
  );
  const activeQueueItems = workflowAwareContext.activeQueueItems || queueItems.filter(
    (item) => item.workflow_status !== REVIEW_WORKFLOW_STATUSES.reviewed.key || item.changed_since_review
  );
  const resolvedQueueItems = workflowAwareContext.resolvedQueueItems || queueItems.filter(
    (item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key && !item.changed_since_review
  );
  const workflowSummary = workflowAwareContext.reviewDigest || reviewDigest;
  const workflowScorecard = workflowAwareContext.scorecard || baseScorecard;
  const workflowResolutionMemory = workflowAwareContext.resolutionMemory || {
    activeIssueCount: activeQueueItems.length,
    resolvedIssueCount: resolvedQueueItems.length,
    recentlyResolved: [],
  };
  const scoreLift = Math.max(
    0,
    Number(workflowScorecard?.overallScore || 0) - Number(baseScorecard?.overallScore || 0)
  );

  const assigneeChoices = useMemo(() => assignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);

  const visibleItems = useMemo(() => {
    let nextItems =
      statusFilter === "active"
        ? [...activeQueueItems]
        : statusFilter === "reviewed"
          ? [...resolvedQueueItems]
          : [...queueItems];

    if (assistantFilterState.filters) {
      nextItems = applyReviewWorkspaceFilters(
        nextItems,
        assistantFilterState.filters,
        reviewScope.householdId || null
      );
    }

    if (statusFilter !== "all" && statusFilter !== "active" && statusFilter !== "reviewed") {
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
  }, [activeQueueItems, assistantFilterState.filters, assigneeFilter, queueItems, resolvedQueueItems, reviewScope.householdId, sourceFilter, sortKey, statusFilter]);

  const metrics = useMemo(
    () => [
      {
        label: "Active Work",
        value: activeQueueItems.length,
        helper: "Items still in motion",
      },
      {
        label: "Waiting On Docs",
        value: queueItems.filter((item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.pending_documents.key).length,
        helper: "Waiting on evidence",
      },
      {
        label: "Follow Up",
        value: queueItems.filter((item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.follow_up.key).length,
        helper: "Needs outreach or resolution",
      },
      {
        label: "Completed Reviews",
        value: resolvedQueueItems.length,
        helper: "Closed cleanly",
      },
      {
        label: "Reopened",
        value: reviewDigest.reopened_count,
        helper: "Changed since review",
      },
      {
        label: "Assigned Owners",
        value: reviewDigest.assigned_count,
        helper: "Routed to an owner",
      },
    ],
    [activeQueueItems.length, queueItems, resolvedQueueItems.length, reviewDigest]
  );

  function handleReviewWorkflowUpdate(itemId, status) {
    if (!reviewScope.householdId || !itemId) return;
    const targetItem = queueItems.find((item) => item.id === itemId) || null;
    const nextState = {
      ...reviewWorkflowState,
      [itemId]: buildReviewWorkflowStateEntry({
        item: targetItem,
        currentEntry: reviewWorkflowState[itemId] || {},
        householdId: reviewScope.householdId,
        updates: {
          status,
          updated_at: new Date().toISOString(),
        },
      }),
    };
    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

  function handleAssignmentUpdate(itemId, assigneeKey) {
    if (!reviewScope.householdId || !itemId) return;
    const targetItem = queueItems.find((item) => item.id === itemId) || null;
    const assignee = assigneeChoices.find((option) => option.key === assigneeKey) || assigneeChoices[0];
    const nextState = {
      ...reviewWorkflowState,
      [itemId]: buildReviewWorkflowStateEntry({
        item: targetItem,
        currentEntry: reviewWorkflowState[itemId] || {},
        householdId: reviewScope.householdId,
        updates: {
          assignee_key: assignee?.key || "",
          assignee_label: assignee?.label || "Unassigned",
          assigned_at: assignee?.key ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
      }),
    };
    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

  function handleBulkUpdate(status) {
    if (!reviewScope.householdId || visibleItems.length === 0) return;
    const nextState = { ...reviewWorkflowState };
    const updatedAt = new Date().toISOString();
    visibleItems.forEach((item) => {
      nextState[item.id] = buildReviewWorkflowStateEntry({
        item,
        currentEntry: reviewWorkflowState[item.id] || {},
        householdId: reviewScope.householdId,
        updates: {
          status,
          updated_at: updatedAt,
        },
      });
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
      nextState[item.id] = buildReviewWorkflowStateEntry({
        item,
        currentEntry: reviewWorkflowState[item.id] || {},
        householdId: reviewScope.householdId,
        updates: {
          assignee_key: assignee?.key || "",
          assignee_label: assignee?.label || "Unassigned",
          assigned_at: assignee?.key ? updatedAt : null,
          updated_at: updatedAt,
        },
      });
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
  const assistantFilterSummary = useMemo(
    () => formatReviewWorkspaceFilterSummary(assistantFilterState.filters),
    [assistantFilterState.filters]
  );
  const visibleIssueClusters = useMemo(
    () => buildIssueClusters(visibleItems, reviewScope.householdId || null),
    [reviewScope.householdId, visibleItems]
  );
  const topVisibleCluster = visibleIssueClusters[0] || null;
  const workspaceVerdict = useMemo(() => {
    if (activeQueueItems.length === 0 && resolvedQueueItems.length > 0) {
      return {
        label: "Stable",
        summary: "Most of the current household review work has already been handled, and completed reviews are still being remembered.",
      };
    }
    if (activeQueueItems.length <= 2) {
      return {
        label: "Watch",
        summary: "A small set of household items still needs attention, but the workspace is controlled and progress is visible.",
      };
    }
    return {
      label: "Needs Review",
      summary: "There is still meaningful follow-up work in motion, so the fastest win is to clear the top workstream before exploring everything else.",
    };
  }, [activeQueueItems.length, resolvedQueueItems.length]);
  const reviewWorkspaceWelcomeGuide = useMemo(() => {
    const recentWinCount = workflowResolutionMemory.recentlyResolved.length;
    const topFocusLabel = topVisibleCluster
      ? `${topVisibleCluster.summaryLabels[0] || "Household"}: ${topVisibleCluster.summaryLabels[1] || "Review Needed"}`
      : activeQueueItems[0]?.label || "Active review work";

    return {
      title: "Handle what matters first, not everything at once",
      summary: workspaceVerdict.summary,
      transition:
        activeQueueItems.length === 0
          ? "This page now acts more like progress memory than a long task list. Start with what has already been completed, then only reopen work when fresh evidence changes the read."
          : "Start with the top workstream, clear what is actively blocking readiness, and use the completed-review memory to show what the household has already improved.",
      quickFacts: [
        `${activeQueueItems.length} active review item${activeQueueItems.length === 1 ? "" : "s"} are still affecting readiness.`,
        `${resolvedQueueItems.length} completed review${resolvedQueueItems.length === 1 ? "" : "s"} are being held out unless new evidence reopens them.`,
        scoreLift > 0 ? `Completed work is currently lifting household readiness by +${scoreLift}.` : "Completed work is being remembered even when it is not creating a visible score lift yet.",
        recentWinCount > 0
          ? `${recentWinCount} recent improvement${recentWinCount === 1 ? "" : "s"} are already being remembered here.`
          : "Recent improvements will appear here as items move out of active review.",
      ],
      cards: [
        {
          label: "Current Status",
          value: workspaceVerdict.label,
          detail: workflowSummary.summary,
        },
        {
          label: "What Changed",
          value: recentWinCount > 0 ? `${recentWinCount} recent win${recentWinCount === 1 ? "" : "s"}` : "No recent wins recorded yet",
          detail:
            recentWinCount > 0
              ? workflowResolutionMemory.recentlyResolved.slice(0, 2).join(" | ")
              : "As work is reviewed, this page will show what improved instead of only what is still open.",
        },
        {
          label: "What To Review First",
          value: topFocusLabel,
          detail: topVisibleCluster
            ? `${topVisibleCluster.count} related item${topVisibleCluster.count === 1 ? "" : "s"} are grouped in this workstream.`
            : "Open the active review work section to route, review, or clear the next best item.",
        },
      ],
    };
  }, [
    activeQueueItems,
    resolvedQueueItems.length,
    scoreLift,
    topVisibleCluster,
    workflowResolutionMemory.recentlyResolved,
    workflowSummary.summary,
    workspaceVerdict,
  ]);
  const reviewWorkspaceActionTiles = useMemo(() => {
    const pendingDocsCount = Number(metrics.find((item) => item.label === "Waiting On Docs")?.value || 0);
    const recentWinCount = workflowResolutionMemory.recentlyResolved.length;

    return [
      {
        key: "active-work",
        kicker: "Active Work",
        title: activeQueueItems.length > 0 ? `${activeQueueItems.length} item${activeQueueItems.length === 1 ? "" : "s"} still need attention` : "No active review work right now",
        detail:
          activeQueueItems.length > 0
            ? "Start with the live review queue so the biggest readiness blocker gets handled before you look at everything else."
            : "The active queue is quiet, so this workspace can start with progress memory rather than urgency.",
        metric: topVisibleCluster ? `${topVisibleCluster.count} in top workstream` : "Queue under control",
        tone: activeQueueItems.length > 2 ? "alert" : activeQueueItems.length > 0 ? "warning" : "good",
        statusLabel: activeQueueItems.length > 0 ? "Needs Review" : "Calm Right Now",
        actionLabel: activeQueueItems.length > 0 ? "Open Active Work" : "See Progress",
        actionKey: activeQueueItems.length > 0 ? "active-work" : "completed-progress",
      },
      {
        key: "completed-progress",
        kicker: "Completed Progress",
        title: recentWinCount > 0 ? `${recentWinCount} recent win${recentWinCount === 1 ? "" : "s"} remembered` : `${resolvedQueueItems.length} completed review${resolvedQueueItems.length === 1 ? "" : "s"}`,
        detail:
          recentWinCount > 0
            ? "This workspace keeps completed work visible as proof of movement, not just as something that disappeared."
            : "Completed reviews stay held out of active priority until new evidence reopens them.",
        metric: scoreLift > 0 ? `+${scoreLift} readiness lift` : "Progress still tracked",
        tone: "good",
        statusLabel: "Recently Improved",
        actionLabel: "See Completed Progress",
        actionKey: "completed-progress",
      },
      {
        key: "missing-evidence",
        kicker: "Evidence Support",
        title: pendingDocsCount > 0 ? `${pendingDocsCount} item${pendingDocsCount === 1 ? "" : "s"} are waiting on documents` : "No obvious document bottleneck",
        detail:
          pendingDocsCount > 0
            ? "Some items are blocked on missing evidence, so adding the right record may be faster than debating the issue itself."
            : "The current queue is not mainly waiting on documents right now.",
        metric: `${metrics.find((item) => item.label === "Follow Up")?.value || 0} follow-up item${Number(metrics.find((item) => item.label === "Follow Up")?.value || 0) === 1 ? "" : "s"}`,
        tone: pendingDocsCount > 0 ? "warning" : "neutral",
        statusLabel: pendingDocsCount > 0 ? "Missing Information" : "Well Supported",
        actionLabel: "Open Active Work",
        actionKey: "active-work",
      },
      {
        key: "focus-lane",
        kicker: "Best Focus",
        title:
          topVisibleCluster
            ? `${topVisibleCluster.summaryLabels[0] || "Household"}: ${topVisibleCluster.summaryLabels[1] || "Review Needed"}`
            : activeQueueItems[0]?.label || "All review work",
        detail:
          topVisibleCluster
            ? "Use the grouped workstream first so related items can move together instead of one at a time."
            : assistantFilterState.filters
              ? "This workspace is currently focused by a saved or assistant-driven filter."
              : "Open the full work list and choose the next lane that matters most.",
        metric: assistantFilterState.filters ? "Filtered view active" : "Workspace-wide view",
        tone: "info",
        statusLabel: "Guided Focus",
        actionLabel: assistantFilterState.filters ? "Clear Filters" : "Open Workspace",
        actionKey: assistantFilterState.filters ? "clear-filters" : "active-work",
      },
    ];
  }, [
    activeQueueItems,
    assistantFilterState.filters,
    metrics,
    resolvedQueueItems.length,
    scoreLift,
    topVisibleCluster,
    workflowResolutionMemory.recentlyResolved,
  ]);

  function handleClearAssistantFilters() {
    setAssistantFilterState({
      openedFromAssistant: false,
      filters: null,
    });
    onNavigate?.("/review-workspace");
  }

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <PageHeader
        eyebrow="Household Operations"
        title="Review Workspace"
        description="Work through the household items that most affect readiness, keep completed work remembered, and move the household forward."
        actions={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={handleRefreshSnapshot} style={actionStyle(false)}>
              Refresh Progress
            </button>
            <button type="button" onClick={() => onNavigate?.("/dashboard")} style={actionStyle(true)}>
              Back To Dashboard
            </button>
          </div>
        }
      />

      <PlainLanguageBridge
        eyebrow="Start Here"
        title={reviewWorkspaceWelcomeGuide.title}
        summary={reviewWorkspaceWelcomeGuide.summary}
        transition={reviewWorkspaceWelcomeGuide.transition}
        quickFacts={reviewWorkspaceWelcomeGuide.quickFacts}
        cards={reviewWorkspaceWelcomeGuide.cards}
        primaryActionLabel={activeQueueItems.length > 0 ? "Open Active Review Work" : "See Completed Progress"}
        onPrimaryAction={() =>
          scrollToWorkspaceSection(activeQueueItems.length > 0 ? "review-work-queue" : "review-progress-memory")
        }
        secondaryActionLabel="How Progress Is Remembered"
        onSecondaryAction={() => scrollToWorkspaceSection("review-progress-memory")}
        guideTitle="Read this page in three passes"
        guideDescription="Start with the short status, then move into progress memory, and only use the full work list when you need assignment, routing, or status control."
        guideSteps={[
          {
            label: "Step 1",
            title: "Check the current status",
            detail: "See how much review work is still active and whether the household is mostly caught up or still needs attention.",
          },
          {
            label: "Step 2",
            title: "Notice what already improved",
            detail: "Completed reviews stay out of the active queue and still contribute to the household read until new evidence changes the story.",
          },
          {
            label: "Step 3",
            title: "Open the full work list only when needed",
            detail: "Use the detailed work list for owners, status updates, saved views, and route-level review work.",
          },
        ]}
        translatedTerms={[
          {
            term: "Active Review Work",
            meaning: "Items still affecting readiness right now and worth looking at first.",
          },
          {
            term: "Completed Reviews",
            meaning: "Items already handled cleanly and kept out of active priority unless something changes.",
          },
          {
            term: "Readiness Lift",
            meaning: "The positive effect completed work is having on the overall household read.",
          },
          {
            term: "Pending Docs",
            meaning: "Items that likely need more evidence before the review can be closed with confidence.",
          },
        ]}
        depthTitle="Use the full work list when you want assignment, routing, and status control"
        depthDescription="The detailed workspace below is the operating layer. It is there to move work, not to be the first thing people have to decode."
        depthPrimaryActionLabel="Jump To Active Work"
        onDepthPrimaryAction={() => scrollToWorkspaceSection("review-work-queue")}
        depthSecondaryActionLabel="Jump To Completed Progress"
        onDepthSecondaryAction={() => scrollToWorkspaceSection("review-progress-memory")}
        showAnalysisDivider={false}
      />

      <section style={{ display: "grid", gap: "10px" }}>
        <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
          Choose Your Lane
        </div>
        <div style={{ color: "#475569", lineHeight: "1.75", maxWidth: "56rem" }}>
          Start with the workspace path that matches what you need right now, then drop into the detailed assignment and status controls only after the direction is clear.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "14px",
          }}
        >
          {reviewWorkspaceActionTiles.map((tile) => (
            <FriendlyActionTile
              key={tile.key}
              kicker={tile.kicker}
              title={tile.title}
              detail={tile.detail}
              metric={tile.metric}
              tone={tile.tone}
              statusLabel={tile.statusLabel}
              actionLabel={tile.actionLabel}
              onAction={() => {
                if (tile.actionKey === "completed-progress") {
                  scrollToWorkspaceSection("review-progress-memory");
                  return;
                }
                if (tile.actionKey === "clear-filters") {
                  handleClearAssistantFilters();
                  return;
                }
                scrollToWorkspaceSection("review-work-queue");
              }}
            />
          ))}
        </div>
      </section>

      {assistantFilterState.filters ? (
        <SectionCard
          title="Filtered Review View"
          subtitle={
            assistantFilterState.openedFromAssistant
              ? "Opened from household assistant"
              : "Saved filters were restored from the current route."
          }
        >
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Showing:</span>
              {assistantFilterSummary.map((item) => (
                <span
                  key={item}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#1d4ed8",
                    background: "#dbeafe",
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" onClick={handleClearAssistantFilters} style={actionStyle(false)}>
                Clear Filters
              </button>
              <button type="button" onClick={() => onNavigate?.("/review-workspace")} style={actionStyle(true)}>
                Back To All Review Work
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Quick Status" subtitle={workflowSummary.summary}>
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

      <div id="review-progress-memory">
        <SectionCard title="Completed Reviews Still Improving Readiness" subtitle="Reviewed work stays out of active priority until fresh evidence reopens it.">
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            {[
              { label: "Household Readiness", value: workflowScorecard?.overallScore ?? "-", helper: workflowScorecard?.overallStatus || "Starter" },
              { label: "Readiness Lift", value: scoreLift > 0 ? `+${scoreLift}` : "0", helper: "Lift from resolved issues" },
              { label: "Completed Reviews", value: resolvedQueueItems.length, helper: "Reviewed items out of active priority" },
              { label: "Still Active", value: activeQueueItems.length, helper: "Issues still driving the queue" },
            ].map((item) => (
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
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            {workflowSummary.summary}
          </div>
          {workflowResolutionMemory.recentlyResolved.length > 0 ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {workflowResolutionMemory.recentlyResolved.map((item) => (
                <span
                  key={item}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#166534",
                    background: "#dcfce7",
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        </SectionCard>
      </div>

      <div id="review-work-queue">
        <SectionCard title="Active Review Work" subtitle="These are the household items worth looking at next. Filters, ownership, and workflow controls stay available below.">
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

          {visibleIssueClusters.length > 0 ? (
            <div
              style={{
                display: "grid",
                gap: "14px",
                padding: "16px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a" }}>Similar Review Work, Grouped Together</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>
                    Start here before scanning the full work list. Similar items are grouped together so repeated documentation, continuity, and linkage gaps are easier to handle in one pass.
                  </div>
                </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {visibleIssueClusters.slice(0, 8).map((cluster, clusterIndex) => {
                  const urgencyMeta = friendlyUrgencyPresentation(cluster.urgency);
                  return (
                    <div
                      key={cluster.key}
                      style={{
                        padding: "16px 16px 18px",
                        borderRadius: "18px",
                        background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "12px", fontWeight: 800, color: urgencyMeta.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {urgencyMeta.icon} Workstream {clusterIndex + 1}
                        </div>
                        <span
                          style={{
                            padding: "5px 9px",
                            borderRadius: "999px",
                            background: urgencyMeta.background,
                            color: urgencyMeta.accent,
                            border: urgencyMeta.border,
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {cluster.count} {cluster.count === 1 ? "item" : "items"}
                        </span>
                      </div>
                      <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a", lineHeight: "1.35" }}>
                        {(cluster.summaryLabels[0] || "Household")}: {cluster.summaryLabels[1] || "Review Needed"}
                      </div>
                      <div style={{ color: "#334155", lineHeight: "1.7", fontSize: "14px" }}>
                        {urgencyMeta.label}. These items are similar enough to review together instead of one by one.
                      </div>
                      {cluster.examples.length > 0 ? (
                        <div style={{ color: "#64748b", fontSize: "13px", lineHeight: "1.6" }}>
                          Examples: {cluster.examples.join(" | ")}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {visibleItems.length === 0 ? (
            <EmptyState
              title={statusFilter === "active" && resolvedQueueItems.length > 0 ? "No active review work right now" : "No review items match these filters"}
              description={
                statusFilter === "active" && resolvedQueueItems.length > 0
                  ? "Completed reviews are being held out of active priority until new evidence reopens them. Switch to Reviewed to see what the household has already improved."
                  : "Try changing the status, source, or owner filter to bring more household blockers into view."
              }
            />
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {visibleItems.map((item, index) => {
                const workflowTone = statusToneStyles(item.workflow_status);
                const urgencyMeta = friendlyUrgencyPresentation(item.urgency);
                const canOpenRoute = Boolean(item.route);
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: "18px",
                      borderRadius: "20px",
                      border: "1px solid rgba(148, 163, 184, 0.18)",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
                      boxShadow: "0 12px 28px rgba(15, 23, 42, 0.04)",
                      display: "grid",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>
                          {`${urgencyMeta.icon} Review Prompt ${index + 1} · ${item.source || "Household"}`}
                        </div>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", lineHeight: "1.35" }}>{item.label}</div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "6px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: urgencyMeta.accent,
                            background: urgencyMeta.background,
                            border: urgencyMeta.border,
                          }}
                        >
                          {urgencyMeta.label}
                        </span>
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
                    <div
                      style={{
                        padding: "14px 16px",
                        borderRadius: "16px",
                        background: "rgba(255,255,255,0.8)",
                        border: "1px solid rgba(148, 163, 184, 0.16)",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                        What This Means
                      </div>
                      <div style={{ color: "#334155", lineHeight: "1.7" }}>{item.summary}</div>
                      {item.consequence ? <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.consequence}</div> : null}
                    </div>
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
                    <SuggestedActionsRow
                      actions={[
                        {
                          label: canOpenRoute ? item.action_label || "Open review" : "Route unavailable",
                          onClick: () => canOpenRoute && onNavigate?.(item.route),
                          kind: "primary",
                        },
                        {
                          label: "Pending Docs",
                          onClick: () => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.pending_documents.key),
                          kind: "secondary",
                        },
                        {
                          label: "Follow Up",
                          onClick: () => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.follow_up.key),
                          kind: "secondary",
                        },
                        {
                          label: item.changed_since_review ? "Review Again" : "Mark Reviewed",
                          onClick: () => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.reviewed.key),
                          kind: "secondary",
                        },
                        item.workflow_status !== REVIEW_WORKFLOW_STATUSES.open.key
                          ? {
                              label: "Reopen",
                              onClick: () => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.open.key),
                              kind: "secondary",
                            }
                          : null,
                      ].filter(Boolean)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </SectionCard>
      </div>
    </div>
  );
}
