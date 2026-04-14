export const HOUSEHOLD_ISSUE_STATUSES = ["open", "resolved", "ignored"];
export const HOUSEHOLD_ISSUE_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];
export const HOUSEHOLD_ISSUE_PRIORITIES = ["high", "medium", "low"];
export const HOUSEHOLD_ISSUE_SOURCE_SYSTEMS = [
  "household_engine",
  "property_engine",
  "mortgage_engine",
  "insurance_engine",
  "retirement_engine",
  "portal_engine",
  "manual_user",
];

const STATUS_SET = new Set(HOUSEHOLD_ISSUE_STATUSES);
const SEVERITY_SET = new Set(HOUSEHOLD_ISSUE_SEVERITIES);
const PRIORITY_SET = new Set(HOUSEHOLD_ISSUE_PRIORITIES);
const SOURCE_SYSTEM_SET = new Set(HOUSEHOLD_ISSUE_SOURCE_SYSTEMS);

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeIdentifier(value, fieldLabel = "value") {
  const normalized = cleanString(value)
    ?.toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) {
    throw new Error(`${fieldLabel} is required`);
  }

  return normalized;
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map((entry) => entry);
  if (value && typeof value === "object") return { ...value };
  return value;
}

function normalizeIsoTimestamp(value, fieldLabel = "timestamp") {
  const normalized = cleanString(value);
  if (!normalized) return null;
  const timestamp = new Date(normalized);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error(`${fieldLabel} must be a valid date or timestamp`);
  }
  return timestamp.toISOString();
}

export function normalizeIssueModuleKey(value) {
  return normalizeIdentifier(value, "module_key");
}

export function normalizeIssueTypeKey(value) {
  return normalizeIdentifier(value, "issue_type");
}

export function normalizeIssueKey(value) {
  return normalizeIdentifier(value, "issue_key");
}

export function normalizeIssueStatus(value) {
  const normalized = cleanString(value)?.toLowerCase() || "open";
  if (!STATUS_SET.has(normalized)) {
    throw new Error(
      `Unsupported issue status "${value}". Expected one of: ${HOUSEHOLD_ISSUE_STATUSES.join(", ")}`
    );
  }
  return normalized;
}

export function normalizeIssueSeverity(value) {
  const normalized = cleanString(value)?.toLowerCase();
  if (!normalized) return "medium";
  if (!SEVERITY_SET.has(normalized)) {
    throw new Error(
      `Unsupported issue severity "${value}". Expected one of: ${HOUSEHOLD_ISSUE_SEVERITIES.join(", ")}`
    );
  }
  return normalized;
}

export function normalizeIssuePriority(value) {
  const normalized = cleanString(value)?.toLowerCase() || null;
  if (!normalized) return null;
  if (!PRIORITY_SET.has(normalized)) {
    throw new Error(
      `Unsupported issue priority "${value}". Expected one of: ${HOUSEHOLD_ISSUE_PRIORITIES.join(", ")}`
    );
  }
  return normalized;
}

export function normalizeSourceSystem(value) {
  const normalized = cleanString(value)?.toLowerCase() || "household_engine";
  if (!SOURCE_SYSTEM_SET.has(normalized)) {
    throw new Error(
      `Unsupported issue source_system "${value}". Expected one of: ${HOUSEHOLD_ISSUE_SOURCE_SYSTEMS.join(", ")}`
    );
  }
  return normalized;
}

export function normalizeIssueInput(issueInput = {}) {
  if (!issueInput || typeof issueInput !== "object" || Array.isArray(issueInput)) {
    throw new Error("issueInput must be a plain object");
  }

  const title = cleanString(issueInput.title);
  if (!title) {
    throw new Error("title is required");
  }

  const metadata =
    issueInput.metadata === null || issueInput.metadata === undefined
      ? {}
      : issueInput.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("metadata must be an object when provided");
  }

  const evidence =
    issueInput.evidence === undefined ? null : issueInput.evidence;
  if (
    evidence !== null &&
    evidence !== undefined &&
    typeof evidence !== "object"
  ) {
    throw new Error("evidence must be an object, array, or null when provided");
  }

  return {
    household_id: cleanString(issueInput.household_id) || (() => {
      throw new Error("household_id is required");
    })(),
    module_key: normalizeIssueModuleKey(issueInput.module_key),
    issue_type: normalizeIssueTypeKey(issueInput.issue_type),
    issue_key: normalizeIssueKey(issueInput.issue_key),
    asset_id: cleanString(issueInput.asset_id),
    record_id: cleanString(issueInput.record_id),
    title,
    summary: cleanString(issueInput.summary),
    severity: normalizeIssueSeverity(issueInput.severity),
    priority: normalizeIssuePriority(issueInput.priority),
    detection_hash: cleanString(issueInput.detection_hash),
    source_system: normalizeSourceSystem(issueInput.source_system),
    due_at: normalizeIsoTimestamp(issueInput.due_at, "due_at"),
    evidence: evidence === null || evidence === undefined ? null : cloneJsonValue(evidence),
    metadata: cloneJsonValue(metadata) || {},
  };
}
