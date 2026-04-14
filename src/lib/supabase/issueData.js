import { getSupabaseClient } from "./client.js";
import {
  normalizeIssueInput,
  normalizeIssueKey,
  normalizeIssueModuleKey,
  normalizeIssuePriority,
  normalizeIssueSeverity,
  normalizeIssueStatus,
  normalizeIssueTypeKey,
  normalizeSourceSystem,
} from "../domain/issues/issueTypes.js";

const HOUSEHOLD_ISSUES_TABLE = "household_issues";
const HOUSEHOLD_ISSUE_SELECT = "*";
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
      return await insertHouseholdIssueRow(insertPayload, options);
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
    return updateHouseholdIssueRow(
      existingIssue.id,
      {
        ...buildUpsertContentPayload(normalizedInput),
        last_detected_at: now,
      },
      options
    );
  }

  if (["resolved", "ignored"].includes(existingIssue.status)) {
    const actorId = await getCurrentUserId(options);
    return updateHouseholdIssueRow(
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
  return updateHouseholdIssueRow(
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
  return updateHouseholdIssueRow(
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
}

export async function reopenHouseholdIssue(issueId, options = {}) {
  const normalizedIssueId = cleanString(issueId);
  if (!normalizedIssueId) {
    throw new Error("issueId is required");
  }

  const actorId = await getCurrentUserId(options);
  const now = resolveNow(options);
  return updateHouseholdIssueRow(
    normalizedIssueId,
    {
      status: "open",
      reopened_at: now,
      reopened_by: actorId,
      last_state_changed_at: now,
    },
    options
  );
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
    assetId: cleanString(filters.assetId),
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
  if (normalizedFilters.assetId) {
    query = query.eq("asset_id", normalizedFilters.assetId);
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
};
