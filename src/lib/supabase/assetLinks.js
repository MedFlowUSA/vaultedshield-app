import { getSupabaseClient } from "./client";
import {
  appendHouseholdScope,
  buildScopedAccessError,
} from "./platformScope";

function getClientOrError() {
  const supabase = getSupabaseClient();
  if (!supabase) return { supabase: null, error: new Error("Supabase not configured") };
  return { supabase, error: null };
}

function isMissingAssetLinksTableError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "PGRST205" ||
    message.includes("public.asset_links") ||
    message.includes('relation "asset_links" does not exist') ||
    message.includes('relation "public.asset_links" does not exist')
  );
}

function clampConfidenceScore(value, fallback = 0.8) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(1, Math.max(0, Number(numericValue.toFixed(3))));
}

async function listRecords(table, filters = [], options = {}) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };
  let query = supabase.from(table).select(options.select || "*");
  filters.forEach((filter) => {
    query = query[filter.operator || "eq"](filter.column, filter.value);
  });
  if (options.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? false });
  }
  const { data, error: listError } = await query;
  return { data: data || [], error: listError };
}

async function upsertRecord(table, payload, onConflict) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  const { data, error: upsertError } = await supabase
    .from(table)
    .upsert(payload, { onConflict })
    .select()
    .single();
  return { data, error: upsertError };
}

export function buildAssetLinkRelationshipKey(tableName, relationshipId) {
  if (!tableName || !relationshipId) return null;
  return `${tableName}:${relationshipId}`;
}

export function buildAssetLinkPayload(payload = {}) {
  return {
    household_id: payload.household_id,
    source_asset_id: payload.source_asset_id,
    target_asset_id: payload.target_asset_id,
    source_module: payload.source_module || null,
    target_module: payload.target_module || null,
    source_record_id: payload.source_record_id || null,
    target_record_id: payload.target_record_id || null,
    relationship_origin: payload.relationship_origin || null,
    relationship_key: payload.relationship_key || null,
    link_type: payload.link_type || "related_asset",
    confidence_score: clampConfidenceScore(payload.confidence_score, 0.8),
    is_primary: Boolean(payload.is_primary),
    notes: payload.notes || null,
    metadata: payload.metadata || {},
  };
}

export async function upsertAssetLink(payload = {}) {
  if (!payload.household_id || !payload.source_asset_id || !payload.target_asset_id) {
    return {
      data: null,
      error: new Error("household_id, source_asset_id, and target_asset_id are required"),
    };
  }

  if (!payload.relationship_key) {
    return {
      data: null,
      error: new Error("relationship_key is required for asset link upserts"),
    };
  }

  return upsertRecord("asset_links", buildAssetLinkPayload(payload), "relationship_key");
}

export async function listAssetLinksForAsset(assetId, scopeOverride = null) {
  if (!assetId) {
    return { data: [], error: new Error("assetId is required") };
  }

  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };

  const scopedFilters = appendHouseholdScope([], scopeOverride);
  const householdFilter = scopedFilters.find((filter) => filter.column === "household_id") || null;
  if (!householdFilter?.value) {
    return { data: [], error: buildScopedAccessError("Asset link") };
  }

  let query = supabase
    .from("asset_links")
    .select("*, source_asset:assets!asset_links_source_asset_id_fkey(*), target_asset:assets!asset_links_target_asset_id_fkey(*)")
    .eq("household_id", householdFilter.value)
    .or(`source_asset_id.eq.${assetId},target_asset_id.eq.${assetId}`)
    .order("created_at", { ascending: false });

  const { data, error: queryError } = await query;
  if (queryError && isMissingAssetLinksTableError(queryError)) {
    return { data: [], error: null };
  }
  return { data: data || [], error: queryError };
}

export async function listAssetLinksForAssets(assetIds = [], scopeOverride = null) {
  const normalizedAssetIds = [...new Set((assetIds || []).filter(Boolean))];
  if (normalizedAssetIds.length === 0) {
    return { data: [], error: null };
  }

  const results = await Promise.all(
    normalizedAssetIds.map((assetId) => listAssetLinksForAsset(assetId, scopeOverride))
  );
  const error = results.find((result) => result.error)?.error || null;
  const dedupedLinks = [];
  const seen = new Set();

  results.forEach((result) => {
    (result.data || []).forEach((link) => {
      const key = link.relationship_key || link.id || `${link.source_asset_id || "source"}:${link.target_asset_id || "target"}:${link.link_type || "related"}`;
      if (seen.has(key)) return;
      seen.add(key);
      dedupedLinks.push(link);
    });
  });

  return { data: dedupedLinks, error };
}

export async function listPropertyMirrorAssetLinks(householdId, propertyAssetId) {
  if (!householdId || !propertyAssetId) {
    return { data: [], error: null };
  }

  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };

  const { data, error: queryError } = await supabase
    .from("asset_links")
    .select("*")
    .eq("household_id", householdId)
    .eq("source_asset_id", propertyAssetId)
    .in("relationship_origin", ["property_mortgage", "property_homeowners"]);

  if (queryError && isMissingAssetLinksTableError(queryError)) {
    return { data: [], error: null };
  }
  return { data: data || [], error: queryError };
}

export async function deleteAssetLinksByRelationshipKeys(relationshipKeys = []) {
  const normalizedKeys = [...new Set((relationshipKeys || []).filter(Boolean))];
  if (normalizedKeys.length === 0) {
    return { error: null };
  }

  const { supabase, error } = getClientOrError();
  if (error) return { error };

  const { error: deleteError } = await supabase
    .from("asset_links")
    .delete()
    .in("relationship_key", normalizedKeys);

  return { error: deleteError };
}

export async function listHouseholdAssetLinks(householdId) {
  const result = await listRecords(
    "asset_links",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    { orderBy: "created_at" }
  );
  if (result.error && isMissingAssetLinksTableError(result.error)) {
    return { data: [], error: null };
  }
  return result;
}
