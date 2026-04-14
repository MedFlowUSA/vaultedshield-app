const REVIEW_WORKSPACE_PATH = "/review-workspace";
const ASSISTANT_ORIGIN = "household_assistant";
const VALID_MODULES = new Set([
  "policy",
  "mortgage",
  "property",
  "homeowners",
  "retirement",
  "estate",
  "portal",
  "household",
  "asset",
  "auto",
  "health",
  "warranty",
]);
const VALID_SEVERITIES = new Set(["high", "medium", "low"]);

function cleanString(value) {
  const nextValue = String(value || "").trim();
  return nextValue || null;
}

function normalizeModule(value) {
  const nextValue = cleanString(value)?.toLowerCase() || null;
  return nextValue && VALID_MODULES.has(nextValue) ? nextValue : null;
}

function normalizeSeverity(value) {
  const nextValue = cleanString(value)?.toLowerCase() || null;
  if (!nextValue) return null;
  if (["critical", "high"].includes(nextValue)) return "high";
  if (["warning", "moderate", "medium"].includes(nextValue)) return "medium";
  if (["info", "open", "ready", "low"].includes(nextValue)) return "low";
  return VALID_SEVERITIES.has(nextValue) ? nextValue : null;
}

function normalizeIssueType(value) {
  const nextValue = cleanString(value)?.toLowerCase() || null;
  return nextValue ? nextValue.replace(/[^a-z0-9_:-]/g, "_") : null;
}

function titleize(value) {
  return String(value || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractRouteRecordId(route = "") {
  const match = String(route || "").match(/\/detail\/([^/?#]+)/i);
  return match?.[1] || null;
}

function mapQueueSourceToModule(item = {}) {
  const route = String(item.route || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const label = `${item.label || ""} ${item.summary || ""} ${item.change_signal || ""}`.toLowerCase();

  if (item.module) return normalizeModule(item.module);
  if (route.includes("/insurance/homeowners")) return "homeowners";
  if (route.includes("/mortgage")) return "mortgage";
  if (route.includes("/property")) return "property";
  if (route.includes("/retirement")) return "retirement";
  if (route.includes("/estate")) return "estate";
  if (route.includes("/portals")) return "portal";
  if (route.includes("/insurance/auto")) return "auto";
  if (route.includes("/insurance/health")) return "health";
  if (route.includes("/warranties")) return "warranty";
  if (route.includes("/assets")) return "asset";
  if (route.includes("/insurance/")) return "policy";
  if (source === "property") return "property";
  if (source === "retirement") return "retirement";
  if (source === "homeowners") return "homeowners";
  if (source === "asset") return "asset";
  if (source === "auto") return "auto";
  if (source === "health") return "health";
  if (source === "warranty") return "warranty";
  if (source === "mortgage") return "mortgage";
  if (source === "policy" || source === "insurance") return "policy";
  if (source === "portal" || label.includes("portal") || label.includes("access")) return "portal";
  if (source === "estate" || route.includes("/estate")) return "estate";
  return "household";
}

function mapQueueIssueType(item = {}, module = "household") {
  const combined = [
    item.id,
    item.blocker_title,
    item.label,
    item.summary,
    item.change_signal,
    item.source_label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (module === "portal" || /portal|access|recovery|continuity/.test(combined)) {
    return "continuity_gap";
  }
  if (module === "property" && /homeowners|protection/.test(combined)) {
    return "missing_protection";
  }
  if (module === "property" && /mortgage|financing|liabilit|debt/.test(combined)) {
    return "missing_linkage";
  }
  if (module === "property" && /property stack|stack|linkage|completeness/.test(combined)) {
    return "stack_incomplete";
  }
  if (module === "estate" || /estate|trust|will/.test(combined)) {
    return "missing_estate_components";
  }
  if (module === "retirement" && /document|statement|beneficiar|allocation|loan/.test(combined)) {
    return "sparse_documentation";
  }
  if (module === "policy" || /coi|charge|illustration|policy/.test(combined)) {
    return "policy_review_issue";
  }
  if (module === "homeowners" && /document|coverage|link/.test(combined)) {
    return "policy_review_issue";
  }
  if (/document|statement|evidence|upload|proof/.test(combined)) {
    return "sparse_documentation";
  }
  return "review_needed";
}

function deriveRecordId(item = {}, module = "household") {
  return (
    cleanString(item.record_id) ||
    cleanString(item.property_id) ||
    cleanString(item.mortgage_loan_id) ||
    cleanString(item.homeowners_policy_id) ||
    cleanString(item.retirement_account_id) ||
    cleanString(item.auto_policy_id) ||
    cleanString(item.health_plan_id) ||
    cleanString(item.warranty_id) ||
    (module === "asset" ? cleanString(item.asset_id) : null) ||
    extractRouteRecordId(item.route)
  );
}

export function normalizeReviewWorkspaceFilters(payload = {}) {
  if (!payload || typeof payload !== "object") return null;

  const module = normalizeModule(payload.module);
  const issueType = normalizeIssueType(payload.issueType);
  const severity = normalizeSeverity(payload.severity);
  const householdId = cleanString(payload.householdId);
  const assetId = cleanString(payload.assetId);
  const recordId = cleanString(payload.recordId);

  if (!module || !issueType) return null;

  return {
    module,
    issueType,
    ...(severity ? { severity } : {}),
    ...(householdId ? { householdId } : {}),
    ...(assetId ? { assetId } : {}),
    ...(recordId ? { recordId } : {}),
  };
}

export function buildReviewWorkspaceRoute({
  filters = null,
  openedFromAssistant = false,
} = {}) {
  const normalizedFilters = normalizeReviewWorkspaceFilters(filters);
  if (!normalizedFilters) return REVIEW_WORKSPACE_PATH;

  const params = new URLSearchParams();
  params.set("module", normalizedFilters.module);
  params.set("issueType", normalizedFilters.issueType);
  if (normalizedFilters.severity) params.set("severity", normalizedFilters.severity);
  if (normalizedFilters.householdId) params.set("householdId", normalizedFilters.householdId);
  if (normalizedFilters.assetId) params.set("assetId", normalizedFilters.assetId);
  if (normalizedFilters.recordId) params.set("recordId", normalizedFilters.recordId);
  if (openedFromAssistant) params.set("origin", ASSISTANT_ORIGIN);
  return `${REVIEW_WORKSPACE_PATH}?${params.toString()}`;
}

export function parseReviewWorkspaceHashState(hash = "", expectedHouseholdId = null) {
  const trimmedHash = String(hash || "").replace(/^#/, "");
  const [pathPart = "", queryPart = ""] = trimmedHash.split("?");

  if ((pathPart || REVIEW_WORKSPACE_PATH) !== REVIEW_WORKSPACE_PATH || !queryPart) {
    return {
      openedFromAssistant: false,
      filters: null,
      invalid: false,
    };
  }

  const params = new URLSearchParams(queryPart);
  const filters = normalizeReviewWorkspaceFilters({
    module: params.get("module"),
    issueType: params.get("issueType"),
    severity: params.get("severity"),
    householdId: params.get("householdId"),
    assetId: params.get("assetId"),
    recordId: params.get("recordId"),
  });
  const openedFromAssistant = params.get("origin") === ASSISTANT_ORIGIN;

  if (!filters) {
    return {
      openedFromAssistant: false,
      filters: null,
      invalid: true,
    };
  }

  if (expectedHouseholdId && filters.householdId && filters.householdId !== expectedHouseholdId) {
    return {
      openedFromAssistant: false,
      filters: null,
      invalid: true,
    };
  }

  return {
    openedFromAssistant,
    filters,
    invalid: false,
  };
}

export function deriveReviewWorkspaceCandidateFromQueueItem(item = {}, householdId = null) {
  if (!item || typeof item !== "object") return null;
  const module = mapQueueSourceToModule(item);
  const issueType = mapQueueIssueType(item, module);
  const severity = normalizeSeverity(item.severity || item.urgency);
  const recordId = deriveRecordId(item, module);
  const assetId = cleanString(item.asset_id);

  return normalizeReviewWorkspaceFilters({
    module,
    issueType,
    severity,
    householdId,
    assetId,
    recordId,
  });
}

export function queueItemMatchesReviewWorkspaceFilters(item = {}, filters = null, householdId = null) {
  const normalizedFilters = normalizeReviewWorkspaceFilters(filters);
  if (!normalizedFilters) return true;

  const candidate = deriveReviewWorkspaceCandidateFromQueueItem(item, householdId);
  if (!candidate) return false;
  if (candidate.module !== normalizedFilters.module) return false;
  if (candidate.issueType !== normalizedFilters.issueType) return false;
  if (normalizedFilters.severity && candidate.severity !== normalizedFilters.severity) return false;
  if (normalizedFilters.assetId && candidate.assetId !== normalizedFilters.assetId) return false;
  if (normalizedFilters.recordId && candidate.recordId !== normalizedFilters.recordId) return false;
  return true;
}

export function applyReviewWorkspaceFilters(items = [], filters = null, householdId = null) {
  const normalizedFilters = normalizeReviewWorkspaceFilters(filters);
  if (!normalizedFilters) return [...items];
  return items.filter((item) => queueItemMatchesReviewWorkspaceFilters(item, normalizedFilters, householdId));
}

export function formatReviewWorkspaceFilterSummary(filters = null) {
  const normalizedFilters = normalizeReviewWorkspaceFilters(filters);
  if (!normalizedFilters) return [];

  return [
    titleize(normalizedFilters.module),
    titleize(normalizedFilters.issueType),
    normalizedFilters.severity ? titleize(normalizedFilters.severity) : null,
  ].filter(Boolean);
}

function buildReviewWorkspaceActionLabel(filters = null) {
  const normalizedFilters = normalizeReviewWorkspaceFilters(filters);
  if (!normalizedFilters) return "Open review queue";

  switch (normalizedFilters.issueType) {
    case "missing_protection":
      return "Review missing protection";
    case "continuity_gap":
      return "Review continuity gaps";
    case "sparse_documentation":
      return "Review sparse documentation";
    case "missing_estate_components":
      return "Review estate gaps";
    case "missing_linkage":
      return "Review missing linkage";
    case "stack_incomplete":
      return "Review property stack";
    case "policy_review_issue":
      return "Review policy issues";
    default:
      return "Open review queue";
  }
}

export function buildReviewWorkspaceAction(filters = null) {
  const normalizedFilters = normalizeReviewWorkspaceFilters(filters);
  if (!normalizedFilters) return null;

  return {
    id: `review-workspace:${normalizedFilters.module}:${normalizedFilters.issueType}:${normalizedFilters.recordId || "all"}`,
    label: buildReviewWorkspaceActionLabel(normalizedFilters),
    target: "review_workspace",
    filters: normalizedFilters,
    route: buildReviewWorkspaceRoute({
      filters: normalizedFilters,
      openedFromAssistant: true,
    }),
  };
}

function selectPreferredWorkspaceCandidate(intent, candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const findFirst = (predicate) => candidates.find(predicate) || null;

  switch (intent) {
    case "property_operating_graph":
      return (
        findFirst((candidate) => candidate.filters.module === "property") ||
        findFirst((candidate) => ["mortgage", "homeowners"].includes(candidate.filters.module))
      );
    case "document_readiness":
      return (
        findFirst((candidate) => candidate.filters.issueType === "sparse_documentation") ||
        findFirst((candidate) => ["retirement", "estate", "policy", "property"].includes(candidate.filters.module))
      );
    case "portal_readiness":
      return (
        findFirst((candidate) => candidate.filters.module === "portal") ||
        findFirst((candidate) => candidate.filters.issueType === "continuity_gap")
      );
    case "insurance_strength":
      return findFirst((candidate) => ["policy", "homeowners"].includes(candidate.filters.module));
    case "dependency_alignment":
      return (
        findFirst((candidate) =>
          ["property", "portal", "estate", "retirement", "policy"].includes(candidate.filters.module)
        ) || candidates[0]
      );
    case "change_review":
    case "continuity_status":
    case "priority_review":
    case "general_summary":
    default:
      return candidates[0];
  }
}

export function buildHouseholdAssistantReviewActions({
  intent = "general_summary",
  queueItems = [],
  householdId = null,
} = {}) {
  const candidates = queueItems
    .map((item) => ({
      item,
      filters: deriveReviewWorkspaceCandidateFromQueueItem(item, householdId),
    }))
    .filter((entry) => entry.filters);

  const selected = selectPreferredWorkspaceCandidate(intent, candidates);
  if (!selected) return [];

  const action = buildReviewWorkspaceAction(selected.filters);
  return action ? [action] : [];
}

export {
  ASSISTANT_ORIGIN,
  REVIEW_WORKSPACE_PATH,
};
