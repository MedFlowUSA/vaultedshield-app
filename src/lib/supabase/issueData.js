import { getSupabaseClient } from "./client.js";
import {
  normalizeIssueEventType,
  normalizeIssueInput,
  normalizeIssueKey,
  normalizeIssueModuleKey,
  normalizeIssuePriority,
  normalizeIssueReopenReason,
  normalizeIssueSeverity,
  normalizeIssueStatus,
  normalizeIssueTypeKey,
  normalizeSourceSystem,
} from "../domain/issues/issueTypes.js";

const HOUSEHOLD_ISSUES_TABLE = "household_issues";
const HOUSEHOLD_ISSUE_SELECT = "*";
const HOUSEHOLD_ISSUE_EVENTS_TABLE = "household_issue_events";
const HOUSEHOLD_ISSUE_EVENT_SELECT = "*";
const SEVERITY_RANK = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeIsoTimestamp(value) {
  const normalized = cleanString(value);
  if (!normalized) return null;
  const timestamp = new Date(normalized);
  if (!Number.isFinite(timestamp.getTime())) return null;
  return timestamp.toISOString();
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map((entry) => entry);
  if (value && typeof value === "object") return { ...value };
  return value;
}

function buildIssueError(message, cause = null) {
  const error = new Error(message);
  if (cause) error.cause = cause;
  return error;
}

function buildSupabaseError(message, error) {
  if (!error) return buildIssueError(message);
  const details = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return buildIssueError(details ? `${message} ${details}` : message, error);
}

function getClientOrThrow(supabaseOverride = null) {
  const supabase = supabaseOverride || getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase not configured");
  }
  return supabase;
}

function normalizePositiveLimit(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error("limit must be a positive integer when provided");
  }
  return numeric;
}

function resolveNow(options = {}) {
  if (options.now) {
    const timestamp = new Date(options.now);
    if (!Number.isFinite(timestamp.getTime())) {
      throw new Error("options.now must be a valid timestamp when provided");
    }
    return timestamp.toISOString();
  }
  return new Date().toISOString();
}

function isDuplicateIssueIdentityError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "23505" || message.includes("duplicate key");
}

function applyFilters(query, filters = []) {
  return filters.reduce((currentQuery, filter) => {
    if (!filter?.column) return currentQuery;
    if (filter.operator === "is") return currentQuery.is(filter.column, filter.value);
    if (filter.operator === "in") return currentQuery.in(filter.column, filter.value);
    return currentQuery[filter.operator || "eq"](filter.column, filter.value);
  }, query);
}

function buildIssueIdentityDescription(identity = {}) {
  return [
    identity.household_id || "unknown-household",
    identity.module_key || "unknown-module",
    identity.issue_type || "unknown-type",
    identity.issue_key || "unknown-key",
    identity.asset_id || "asset:null",
    identity.record_id || "record:null",
  ].join(" | ");
}

export function buildHouseholdIssueIdentity(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("issue identity input must be a plain object");
  }

  const householdId = cleanString(input.household_id);
  if (!householdId) {
    throw new Error("household_id is required for issue identity");
  }

  return {
    household_id: householdId,
    module_key: normalizeIssueModuleKey(input.module_key),
    issue_type: normalizeIssueTypeKey(input.issue_type),
    issue_key: normalizeIssueKey(input.issue_key),
    asset_id: cleanString(input.asset_id),
    record_id: cleanString(input.record_id),
  };
}

export function buildHouseholdIssueIdentityFilters(identityInput = {}) {
  const identity = buildHouseholdIssueIdentity(identityInput);
  return [
    { column: "household_id", value: identity.household_id },
    { column: "module_key", value: identity.module_key },
    { column: "issue_type", value: identity.issue_type },
    { column: "issue_key", value: identity.issue_key },
    identity.asset_id === null
      ? { column: "asset_id", operator: "is", value: null }
      : { column: "asset_id", value: identity.asset_id },
    identity.record_id === null
      ? { column: "record_id", operator: "is", value: null }
      : { column: "record_id", value: identity.record_id },
  ];
}

export function mapHouseholdIssueRow(row = null) {
  if (!row) return null;

  return {
    id: cleanString(row.id),
    household_id: cleanString(row.household_id),
    module_key: normalizeIssueModuleKey(row.module_key),
    issue_type: normalizeIssueTypeKey(row.issue_type),
    issue_key: normalizeIssueKey(row.issue_key),
    asset_id: cleanString(row.asset_id),
    record_id: cleanString(row.record_id),
    title: cleanString(row.title),
    summary: cleanString(row.summary),
    status: normalizeIssueStatus(row.status),
    severity: normalizeIssueSeverity(row.severity),
    priority: normalizeIssuePriority(row.priority),
    detection_hash: cleanString(row.detection_hash),
    source_system: normalizeSourceSystem(row.source_system),
    due_at: normalizeIsoTimestamp(row.due_at),
    evidence:
      row.evidence === null || row.evidence === undefined
        ? null
        : cloneJsonValue(row.evidence),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? cloneJsonValue(row.metadata)
        : {},
    first_detected_at: normalizeIsoTimestamp(row.first_detected_at),
    last_detected_at: normalizeIsoTimestamp(row.last_detected_at),
    last_state_changed_at: normalizeIsoTimestamp(row.last_state_changed_at),
    reopened_at: normalizeIsoTimestamp(row.reopened_at),
    reopened_by: cleanString(row.reopened_by),
    resolved_at: normalizeIsoTimestamp(row.resolved_at),
    resolved_by: cleanString(row.resolved_by),
    ignored_at: normalizeIsoTimestamp(row.ignored_at),
    ignored_by: cleanString(row.ignored_by),
    resolution_reason: cleanString(row.resolution_reason),
    resolution_note: cleanString(row.resolution_note),
    created_at: normalizeIsoTimestamp(row.created_at),
    updated_at: normalizeIsoTimestamp(row.updated_at),
  };
}

export function mapHouseholdIssueEventRow(row = null) {
  if (!row) return null;

  return {
    id: cleanString(row.id),
    household_id: cleanString(row.household_id),
    issue_id: cleanString(row.issue_id),
    asset_id: cleanString(row.asset_id),
    module_key: normalizeIssueModuleKey(row.module_key),
    issue_type: normalizeIssueTypeKey(row.issue_type),
    issue_key: normalizeIssueKey(row.issue_key),
    event_type: normalizeIssueEventType(row.event_type),
    event_reason: normalizeIssueReopenReason(row.event_reason),
    actor_user_id: cleanString(row.actor_user_id),
    detection_hash: cleanString(row.detection_hash),
    evidence_summary:
      row.evidence_summary === null || row.evidence_summary === undefined
        ? {}
        : cloneJsonValue(row.evidence_summary),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? cloneJsonValue(row.metadata)
        : {},
    score_before:
      row.score_before && typeof row.score_before === "object" && !Array.isArray(row.score_before)
        ? cloneJsonValue(row.score_before)
        : {},
    score_after:
      row.score_after && typeof row.score_after === "object" && !Array.isArray(row.score_after)
        ? cloneJsonValue(row.score_after)
        : {},
    created_at: normalizeIsoTimestamp(row.created_at),
  };
}

function normalizeIssueEventPayload(eventInput = {}, issueRow = {}, options = {}) {
  const actorUserId = Object.prototype.hasOwnProperty.call(eventInput, "actor_user_id")
    ? cleanString(eventInput.actor_user_id)
    : Object.prototype.hasOwnProperty.call(options, "currentUserId")
      ? cleanString(options.currentUserId)
      : null;
  const createdAt = resolveNow(options);
  const eventType = normalizeIssueEventType(eventInput.event_type);
  const eventReason = normalizeIssueReopenReason(eventInput.event_reason);
  const metadata =
    eventInput.metadata && typeof eventInput.metadata === "object" && !Array.isArray(eventInput.metadata)
      ? cloneJsonValue(eventInput.metadata)
      : {};

  return {
    household_id: cleanString(issueRow.household_id) || cleanString(eventInput.household_id),
    issue_id: cleanString(issueRow.id) || cleanString(eventInput.issue_id),
    asset_id: cleanString(issueRow.asset_id) || cleanString(eventInput.asset_id),
    module_key: normalizeIssueModuleKey(issueRow.module_key || eventInput.module_key),
    issue_type: normalizeIssueTypeKey(issueRow.issue_type || eventInput.issue_type),
    issue_key: normalizeIssueKey(issueRow.issue_key || eventInput.issue_key),
    event_type: eventType,
    event_reason: eventReason,
    actor_user_id: actorUserId,
    detection_hash: cleanString(eventInput.detection_hash) || cleanString(issueRow.detection_hash),
    evidence_summary:
      eventInput.evidence_summary === null || eventInput.evidence_summary === undefined
        ? cloneJsonValue(issueRow.evidence) || {}
        : cloneJsonValue(eventInput.evidence_summary),
    metadata,
    score_before:
      eventInput.score_before && typeof eventInput.score_before === "object" && !Array.isArray(eventInput.score_before)
        ? cloneJsonValue(eventInput.score_before)
        : {},
    score_after:
      eventInput.score_after && typeof eventInput.score_after === "object" && !Array.isArray(eventInput.score_after)
        ? cloneJsonValue(eventInput.score_after)
        : {},
    created_at: createdAt,
  };
}

async function insertHouseholdIssueRow(payload, options = {}) {
  const supabase = getClientOrThrow(options.supabase);
  const { data, error } = await supabase
    .from(HOUSEHOLD_ISSUES_TABLE)
    .insert(payload)
    .select(HOUSEHOLD_ISSUE_SELECT)
    .single();

  if (error) {
    throw buildSupabaseError("VaultedShield could not insert the household issue.", error);
  }

  return mapHouseholdIssueRow(data);
}

async function updateHouseholdIssueRow(issueId, payload, options = {}) {
  const supabase = getClientOrThrow(options.supabase);
  const { data, error } = await supabase
    .from(HOUSEHOLD_ISSUES_TABLE)
    .update(payload)
    .eq("id", issueId)
    .select(HOUSEHOLD_ISSUE_SELECT)
    .single();

  if (error) {
    throw buildSupabaseError(
      `VaultedShield could not update household issue ${issueId}.`,
      error
    );
  }

  return mapHouseholdIssueRow(data);
}

async function insertHouseholdIssueEventRow(payload, options = {}) {
  const supabase = getClientOrThrow(options.supabase);
  const { data, error } = await supabase
    .from(HOUSEHOLD_ISSUE_EVENTS_TABLE)
    .insert(payload)
    .select(HOUSEHOLD_ISSUE_EVENT_SELECT)
    .single();

  if (error) {
    throw buildSupabaseError("VaultedShield could not insert the household issue event.", error);
  }

  return mapHouseholdIssueEventRow(data);
}

async function getHouseholdIssueById(issueId, options = {}) {
  const normalizedIssueId = cleanString(issueId);
  if (!normalizedIssueId) {
    throw new Error("issueId is required");
  }

  const supabase = getClientOrThrow(options.supabase);
  const { data, error } = await supabase
    .from(HOUSEHOLD_ISSUES_TABLE)
    .select(HOUSEHOLD_ISSUE_SELECT)
    .eq("id", normalizedIssueId)
    .maybeSingle();

  if (error) {
    throw buildSupabaseError(
      `VaultedShield could not load household issue ${normalizedIssueId}.`,
      error
    );
  }

  if (!data) {
    throw new Error(`Household issue ${normalizedIssueId} was not found.`);
  }

  return mapHouseholdIssueRow(data);
}

export async function getCurrentUserId(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "currentUserId")) {
    return cleanString(options.currentUserId);
  }

  try {
    const supabase = getClientOrThrow(options.supabase);
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return cleanString(data?.user?.id);
  } catch {
    return null;
  }
}

export async function appendHouseholdIssueEvent(issueId, eventInput = {}, options = {}) {
  const normalizedIssueId = cleanString(issueId);
  if (!normalizedIssueId) {
    throw new Error("issueId is required");
  }

  const issueRow = options.issueRow ? mapHouseholdIssueRow(options.issueRow) : await getHouseholdIssueById(normalizedIssueId, options);
  if (!issueRow) {
    throw new Error(`Household issue ${normalizedIssueId} was not found for event append.`);
  }

  const actorUserId = await getCurrentUserId(options);
  const payload = normalizeIssueEventPayload(
    {
      ...eventInput,
      actor_user_id: Object.prototype.hasOwnProperty.call(eventInput, "actor_user_id")
        ? eventInput.actor_user_id
        : actorUserId,
      issue_id: normalizedIssueId,
    },
    issueRow,
    options
  );

  return insertHouseholdIssueEventRow(payload, options);
}

export async function listHouseholdIssueEvents(filters = {}, options = {}) {
  const supabase = getClientOrThrow(options.supabase);
  const normalizedFilters = {
    householdId: cleanString(filters.householdId),
    issueId: cleanString(filters.issueId),
    assetId: cleanString(filters.assetId),
    moduleKey:
      filters.moduleKey === undefined || filters.moduleKey === null
        ? null
        : normalizeIssueModuleKey(filters.moduleKey),
    eventType:
      filters.eventType === undefined || filters.eventType === null
        ? null
        : normalizeIssueEventType(filters.eventType),
    limit: normalizePositiveLimit(filters.limit),
  };

  let query = supabase.from(HOUSEHOLD_ISSUE_EVENTS_TABLE).select(HOUSEHOLD_ISSUE_EVENT_SELECT);

  if (normalizedFilters.householdId) {
    query = query.eq("household_id", normalizedFilters.householdId);
  }
  if (normalizedFilters.issueId) {
    query = query.eq("issue_id", normalizedFilters.issueId);
  }
  if (normalizedFilters.assetId) {
    query = query.eq("asset_id", normalizedFilters.assetId);
  }
  if (normalizedFilters.moduleKey) {
    query = query.eq("module_key", normalizedFilters.moduleKey);
  }
  if (normalizedFilters.eventType) {
    query = query.eq("event_type", normalizedFilters.eventType);
  }

  query = query.order("created_at", { ascending: false });

  if (normalizedFilters.limit) {
    query = query.limit(normalizedFilters.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw buildSupabaseError("VaultedShield could not list household issue events.", error);
  }

  return (Array.isArray(data) ? data : []).map(mapHouseholdIssueEventRow);
}

export async function listIssueHistoryForAsset(assetId, options = {}) {
  const normalizedAssetId = cleanString(assetId);
  if (!normalizedAssetId) {
    throw new Error("assetId is required");
  }

  return listHouseholdIssueEvents(
    {
      assetId: normalizedAssetId,
    },
    options
  );
}

export async function listRecentResolvedIssuesForHousehold(householdId, options = {}) {
  const normalizedHouseholdId = cleanString(householdId);
  if (!normalizedHouseholdId) {
    throw new Error("householdId is required");
  }

  return listHouseholdIssueEvents(
    {
      householdId: normalizedHouseholdId,
      eventType: "resolved",
      limit: options.limit,
    },
    options
  );
}

export async function listRecentReopenedIssuesForHousehold(householdId, options = {}) {
  const normalizedHouseholdId = cleanString(householdId);
  if (!normalizedHouseholdId) {
    throw new Error("householdId is required");
  }

  return listHouseholdIssueEvents(
    {
      householdId: normalizedHouseholdId,
      eventType: "reopened",
      limit: options.limit,
    },
    options
  );
}

export async function findExistingHouseholdIssueByIdentity(identityInput, options = {}) {
  const identity = buildHouseholdIssueIdentity(identityInput);
  const supabase = getClientOrThrow(options.supabase);
  let query = supabase
    .from(HOUSEHOLD_ISSUES_TABLE)
    .select(HOUSEHOLD_ISSUE_SELECT);

  query = applyFilters(query, buildHouseholdIssueIdentityFilters(identity))
    .order("created_at", { ascending: false })
    .limit(2);

  const { data, error } = await query;
  if (error) {
    throw buildSupabaseError(
      `VaultedShield could not look up an existing household issue for identity ${buildIssueIdentityDescription(identity)}.`,
      error
    );
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    throw new Error(
      `Multiple household issues matched the same identity: ${buildIssueIdentityDescription(identity)}.`
    );
  }

  return mapHouseholdIssueRow(rows[0]);
}

function buildUpsertContentPayload(input) {
  return {
    title: input.title,
    summary: input.summary,
    severity: input.severity,
    priority: input.priority,
    detection_hash: input.detection_hash,
    source_system: input.source_system,
    due_at: input.due_at,
    evidence: input.evidence,
    metadata: input.metadata,
  };
}

function normalizeWorkflowResolutionFilters(filters = null, householdId = null) {
  if (!filters || typeof filters !== "object") return null;
  const module = cleanString(filters.module);
  const issueType = cleanString(filters.issueType);
  if (!module || !issueType) return null;

  return {
    module: normalizeIssueModuleKey(module),
    issueType: normalizeIssueTypeKey(issueType),
    householdId: cleanString(filters.householdId) || cleanString(householdId),
    assetId: cleanString(filters.assetId),
    recordId: cleanString(filters.recordId),
  };
}

function buildPersistedWorkflowMetadataEntry(entry = {}, householdId = null) {
  const normalizedFilters = normalizeWorkflowResolutionFilters(
    entry.resolution_filters || entry.resolutionFilters || null,
    householdId
  );
  if (!normalizedFilters) return null;

  return {
    status: cleanString(entry.status) || "open",
    notes: cleanString(entry.notes) || "",
    assignee_key: cleanString(entry.assignee_key),
    assignee_label: cleanString(entry.assignee_label) || "Unassigned",
    assigned_at: normalizeIsoTimestamp(entry.assigned_at),
    updated_at: normalizeIsoTimestamp(entry.updated_at) || new Date().toISOString(),
    resolution_filters: {
      module: normalizedFilters.module,
      issueType: normalizedFilters.issueType,
      ...(normalizedFilters.householdId ? { householdId: normalizedFilters.householdId } : {}),
      ...(normalizedFilters.assetId ? { assetId: normalizedFilters.assetId } : {}),
      ...(normalizedFilters.recordId ? { recordId: normalizedFilters.recordId } : {}),
    },
    resolution_key:
      cleanString(entry.resolution_key) ||
      [
        normalizedFilters.module,
        normalizedFilters.issueType,
        normalizedFilters.assetId || "asset",
        normalizedFilters.recordId || "record",
      ].join("|"),
    route: cleanString(entry.route),
    label: cleanString(entry.label),
    source: cleanString(entry.source),
  };
}

function issueMatchesWorkflowFilters(issue = {}, filters = null) {
  const normalizedFilters = normalizeWorkflowResolutionFilters(filters);
  if (!normalizedFilters) return false;
  if (normalizeIssueModuleKey(issue.module_key) !== normalizedFilters.module) return false;
  if (normalizeIssueTypeKey(issue.issue_type) !== normalizedFilters.issueType) return false;
  if (normalizedFilters.assetId && cleanString(issue.asset_id) !== normalizedFilters.assetId) return false;
  if (normalizedFilters.recordId && cleanString(issue.record_id) !== normalizedFilters.recordId) return false;
  return true;
}

export async function saveHouseholdIssueWorkflowStateEntries(householdId, workflowState = {}, options = {}) {
  const normalizedHouseholdId = cleanString(householdId);
  if (!normalizedHouseholdId) {
    throw new Error("householdId is required");
  }

  const entries = Object.values(workflowState || {})
    .map((entry) => buildPersistedWorkflowMetadataEntry(entry, normalizedHouseholdId))
    .filter(Boolean);
  if (entries.length === 0) {
    return [];
  }

  const issues = await listHouseholdIssues(
    {
      householdId: normalizedHouseholdId,
    },
    options
  );
  const updates = [];

  issues.forEach((issue) => {
    const matchedEntry = entries.find((entry) => issueMatchesWorkflowFilters(issue, entry.resolution_filters));
    if (!matchedEntry) return;

    updates.push(
      updateHouseholdIssueRow(
        issue.id,
        {
          metadata: {
            ...(issue.metadata || {}),
            workflow_state: matchedEntry,
          },
        },
        options
      )
    );
  });

  return Promise.all(updates);
}

export async function upsertHouseholdIssue(issueInput, options = {}) {
  const normalizedInput = normalizeIssueInput(issueInput);
  const now = resolveNow(options);
  const existingIssue = await findExistingHouseholdIssueByIdentity(
    normalizedInput,
    options
  );

  if (!existingIssue) {
    const insertPayload = {
      ...normalizedInput,
      status: "open",
      first_detected_at: now,
      last_detected_at: now,
      last_state_changed_at: now,
    };

    try {
      const insertedIssue = await insertHouseholdIssueRow(insertPayload, options);
      await appendHouseholdIssueEvent(
        insertedIssue.id,
        {
          event_type: "detected",
          detection_hash: normalizedInput.detection_hash,
        },
        {
          ...options,
          now,
          issueRow: insertedIssue,
        }
      );
      return insertedIssue;
    } catch (error) {
      if (!isDuplicateIssueIdentityError(error?.cause || error)) {
        throw error;
      }
    }

    const retriedExistingIssue = await findExistingHouseholdIssueByIdentity(
      normalizedInput,
      options
    );
    if (!retriedExistingIssue) {
      throw new Error(
        `VaultedShield detected a duplicate household issue conflict, but the existing row could not be reloaded for identity ${buildIssueIdentityDescription(normalizedInput)}.`
      );
    }

    return upsertHouseholdIssue(normalizedInput, {
      ...options,
      now,
    });
  }

  if (existingIssue.status === "open") {
    const updatedIssue = await updateHouseholdIssueRow(
      existingIssue.id,
      {
        ...buildUpsertContentPayload(normalizedInput),
        last_detected_at: now,
      },
      options
    );
    await appendHouseholdIssueEvent(
      updatedIssue.id,
      {
        event_type: "updated",
        detection_hash: normalizedInput.detection_hash,
        metadata: {
          previous_detection_hash: existingIssue.detection_hash,
        },
      },
      {
        ...options,
        now,
        issueRow: updatedIssue,
      }
    );
    return updatedIssue;
  }

  if (["resolved", "ignored"].includes(existingIssue.status)) {
    const actorId = await getCurrentUserId(options);
    const reopenedIssue = await updateHouseholdIssueRow(
      existingIssue.id,
      {
        status: "open",
        ...buildUpsertContentPayload(normalizedInput),
        reopened_at: now,
        reopened_by: actorId,
        last_detected_at: now,
        last_state_changed_at: now,
      },
      options
    );
    await appendHouseholdIssueEvent(
      reopenedIssue.id,
      {
        event_type: "reopened",
        event_reason: normalizeIssueReopenReason(options.reopenReason || options.reopen_reason) || "stale_review_superseded",
        detection_hash: normalizedInput.detection_hash,
        metadata: {
          previous_status: existingIssue.status,
          previous_resolved_at: existingIssue.resolved_at,
          previous_ignored_at: existingIssue.ignored_at,
        },
      },
      {
        ...options,
        currentUserId: actorId,
        now,
        issueRow: reopenedIssue,
      }
    );
    return reopenedIssue;
  }

  throw new Error(
    `VaultedShield encountered an unsupported household issue status "${existingIssue.status}" during upsert.`
  );
}

export async function resolveHouseholdIssue(
  issueId,
  { resolution_reason, resolution_note } = {},
  options = {}
) {
  const normalizedIssueId = cleanString(issueId);
  if (!normalizedIssueId) {
    throw new Error("issueId is required");
  }

  const actorId = await getCurrentUserId(options);
  const now = resolveNow(options);
  const resolvedIssue = await updateHouseholdIssueRow(
    normalizedIssueId,
    {
      status: "resolved",
      resolution_reason: cleanString(resolution_reason),
      resolution_note: cleanString(resolution_note),
      resolved_at: now,
      resolved_by: actorId,
      last_state_changed_at: now,
    },
    options
  );
  await appendHouseholdIssueEvent(
    resolvedIssue.id,
    {
      event_type: "resolved",
      metadata: {
        resolution_reason: cleanString(resolution_reason),
        resolution_note: cleanString(resolution_note),
      },
    },
    {
      ...options,
      currentUserId: actorId,
      now,
      issueRow: resolvedIssue,
    }
  );
  return resolvedIssue;
}

export async function ignoreHouseholdIssue(
  issueId,
  { resolution_note } = {},
  options = {}
) {
  const normalizedIssueId = cleanString(issueId);
  if (!normalizedIssueId) {
    throw new Error("issueId is required");
  }

  const actorId = await getCurrentUserId(options);
  const now = resolveNow(options);
  const ignoredIssue = await updateHouseholdIssueRow(
    normalizedIssueId,
    {
      status: "ignored",
      resolution_note: cleanString(resolution_note),
      ignored_at: now,
      ignored_by: actorId,
      last_state_changed_at: now,
    },
    options
  );
  await appendHouseholdIssueEvent(
    ignoredIssue.id,
    {
      event_type: "ignored",
      metadata: {
        resolution_note: cleanString(resolution_note),
      },
    },
    {
      ...options,
      currentUserId: actorId,
      now,
      issueRow: ignoredIssue,
    }
  );
  return ignoredIssue;
}

export async function reopenHouseholdIssue(issueId, options = {}) {
  const normalizedIssueId = cleanString(issueId);
  if (!normalizedIssueId) {
    throw new Error("issueId is required");
  }

  const actorId = await getCurrentUserId(options);
  const now = resolveNow(options);
  const reopenedIssue = await updateHouseholdIssueRow(
    normalizedIssueId,
    {
      status: "open",
      reopened_at: now,
      reopened_by: actorId,
      last_state_changed_at: now,
    },
    options
  );
  await appendHouseholdIssueEvent(
    reopenedIssue.id,
    {
      event_type: "reopened",
      event_reason: normalizeIssueReopenReason(options.reopenReason || options.reopen_reason) || "manual_reopen",
      metadata: {
        reopened_via: "manual_action",
      },
    },
    {
      ...options,
      currentUserId: actorId,
      now,
      issueRow: reopenedIssue,
    }
  );
  return reopenedIssue;
}

function compareIssueRecency(left = {}, right = {}) {
  const leftTimestamp = new Date(left.last_detected_at || left.created_at || 0).getTime();
  const rightTimestamp = new Date(right.last_detected_at || right.created_at || 0).getTime();
  return rightTimestamp - leftTimestamp;
}

function sortOpenIssues(items = []) {
  return [...items].sort((left, right) => {
    const severityDelta =
      (SEVERITY_RANK[left.severity] ?? 99) - (SEVERITY_RANK[right.severity] ?? 99);
    if (severityDelta !== 0) return severityDelta;
    return compareIssueRecency(left, right);
  });
}

export async function listHouseholdIssues(filters = {}, options = {}) {
  const supabase = getClientOrThrow(options.supabase);
  const normalizedFilters = {
    householdId: cleanString(filters.householdId),
    status:
      filters.status === undefined ? null : normalizeIssueStatus(filters.status),
    moduleKey:
      filters.moduleKey === undefined || filters.moduleKey === null
        ? null
        : normalizeIssueModuleKey(filters.moduleKey),
    issueType:
      filters.issueType === undefined || filters.issueType === null
        ? null
        : normalizeIssueTypeKey(filters.issueType),
    assetId: cleanString(filters.assetId),
    recordId: cleanString(filters.recordId),
    limit: normalizePositiveLimit(filters.limit),
  };

  let query = supabase.from(HOUSEHOLD_ISSUES_TABLE).select(HOUSEHOLD_ISSUE_SELECT);

  if (normalizedFilters.householdId) {
    query = query.eq("household_id", normalizedFilters.householdId);
  }
  if (normalizedFilters.status) {
    query = query.eq("status", normalizedFilters.status);
  }
  if (normalizedFilters.moduleKey) {
    query = query.eq("module_key", normalizedFilters.moduleKey);
  }
  if (normalizedFilters.issueType) {
    query = query.eq("issue_type", normalizedFilters.issueType);
  }
  if (normalizedFilters.assetId) {
    query = query.eq("asset_id", normalizedFilters.assetId);
  }
  if (normalizedFilters.recordId === null && filters.recordId !== undefined && filters.recordId !== null) {
    query = query.is("record_id", null);
  } else if (normalizedFilters.recordId) {
    query = query.eq("record_id", normalizedFilters.recordId);
  }

  query = query
    .order("last_detected_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (normalizedFilters.limit) {
    query = query.limit(normalizedFilters.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw buildSupabaseError("VaultedShield could not list household issues.", error);
  }

  return (Array.isArray(data) ? data : []).map(mapHouseholdIssueRow);
}

export async function listOpenIssuesForAsset(assetId, options = {}) {
  const normalizedAssetId = cleanString(assetId);
  if (!normalizedAssetId) {
    throw new Error("assetId is required");
  }

  const issues = await listHouseholdIssues(
    {
      assetId: normalizedAssetId,
      status: "open",
    },
    options
  );
  return sortOpenIssues(issues);
}

export async function listOpenIssuesForHousehold(householdId, options = {}) {
  const normalizedHouseholdId = cleanString(householdId);
  if (!normalizedHouseholdId) {
    throw new Error("householdId is required");
  }

  const issues = await listHouseholdIssues(
    {
      householdId: normalizedHouseholdId,
      status: "open",
    },
    options
  );
  return sortOpenIssues(issues);
}

export {
  HOUSEHOLD_ISSUES_TABLE,
  HOUSEHOLD_ISSUE_SELECT,
  HOUSEHOLD_ISSUE_EVENTS_TABLE,
  HOUSEHOLD_ISSUE_EVENT_SELECT,
};
