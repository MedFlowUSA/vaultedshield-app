import {
  createEmptyAutoIntelligenceSchema,
  createEmptyAutoSchema,
  getAutoCarrier,
  getAutoDocumentClass,
  getAutoPolicyType,
  listAutoDocumentClasses as listAutoDocumentClassesFromDomain,
} from "../domain/autoInsurance";
import { getSupabaseClient } from "./client";
import { createAsset, getAssetById, uploadGenericAssetDocument } from "./platformData";

function getClientOrError() {
  const supabase = getSupabaseClient();
  if (!supabase) return { supabase: null, error: new Error("Supabase not configured") };
  return { supabase, error: null };
}

async function insertRecord(table, payload) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  const { data, error: insertError } = await supabase.from(table).insert(payload).select().single();
  return { data, error: insertError };
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

async function maybeSingleRecord(table, filters = [], options = {}) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  let query = supabase.from(table).select(options.select || "*");
  filters.forEach((filter) => {
    query = query[filter.operator || "eq"](filter.column, filter.value);
  });
  const { data, error: queryError } = await query.maybeSingle();
  return { data: data || null, error: queryError };
}

async function deleteAssetById(assetId) {
  const { supabase, error } = getClientOrError();
  if (error) return { error };
  if (!assetId) return { error: null };
  const { error: deleteError } = await supabase.from("assets").delete().eq("id", assetId);
  return { error: deleteError };
}

function buildAutoDefaults(payload = {}) {
  const policyType = getAutoPolicyType(payload.auto_policy_type_key);
  const carrier = payload.carrier_key ? getAutoCarrier(payload.carrier_key) : null;
  return {
    policyType,
    carrier,
    policyName: payload.policy_name || payload.asset_name || null,
    namedInsured: payload.named_insured || null,
    policyStatus: payload.policy_status || "active",
    carrierName: carrier?.display_name || payload.institution_name || null,
  };
}

function buildAutoAssetPayload(payload = {}) {
  const defaults = buildAutoDefaults(payload);
  const typeDisplay = defaults.policyType?.display_name || "Auto Policy";
  return {
    household_id: payload.household_id,
    asset_category: "auto_insurance",
    asset_subcategory: payload.auto_policy_type_key || null,
    asset_name:
      payload.asset_name ||
      payload.policy_name ||
      [defaults.carrierName, typeDisplay].filter(Boolean).join(" ").trim() ||
      "Auto Policy",
    institution_name: defaults.carrierName,
    institution_key: payload.carrier_key || null,
    owner_member_id: payload.owner_member_id || null,
    status: defaults.policyStatus,
    summary: {
      auto_policy_type_key: payload.auto_policy_type_key || null,
      carrier_key: payload.carrier_key || null,
      named_insured: payload.named_insured || null,
    },
    metadata: {
      ...(payload.asset_metadata || {}),
      module: "auto_insurance",
      deep_record_type: "auto_policy",
      auto_policy_type_key: payload.auto_policy_type_key || null,
      carrier_key: payload.carrier_key || null,
    },
  };
}

export async function createAutoPolicy(payload) {
  const defaults = buildAutoDefaults(payload);
  return insertRecord("auto_policies", {
    household_id: payload.household_id,
    asset_id: payload.asset_id,
    auto_policy_type_key: payload.auto_policy_type_key,
    carrier_key: payload.carrier_key || null,
    policy_name: defaults.policyName,
    named_insured: defaults.namedInsured,
    effective_date: payload.effective_date || null,
    expiration_date: payload.expiration_date || null,
    policy_status: defaults.policyStatus,
    metadata: payload.metadata || {},
  });
}

export async function getAutoPolicyById(autoPolicyId) {
  return maybeSingleRecord("auto_policies", [{ column: "id", value: autoPolicyId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function listAutoPolicies(householdId) {
  return listRecords(
    "auto_policies",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
      orderBy: "updated_at",
    }
  );
}

export async function createAutoDocument(payload) {
  const documentClass = payload.document_class_key
    ? getAutoDocumentClass(payload.document_class_key)
    : null;
  return insertRecord("auto_documents", {
    auto_policy_id: payload.auto_policy_id,
    asset_document_id: payload.asset_document_id || null,
    document_class_key: documentClass?.document_class_key || payload.document_class_key || null,
    carrier_key: payload.carrier_key || null,
    document_date: payload.document_date || null,
    metadata: payload.metadata || {},
  });
}

export function listAutoDocumentClasses() {
  return listAutoDocumentClassesFromDomain();
}

export async function listAutoDocuments(autoPolicyId) {
  return listRecords(
    "auto_documents",
    [{ column: "auto_policy_id", value: autoPolicyId }],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, document_role, document_type, file_name, mime_type, storage_bucket, storage_path, processing_status, metadata)",
      orderBy: "document_date",
    }
  );
}

export async function createAutoSnapshot(payload) {
  const normalizedAuto = payload.normalized_auto || createEmptyAutoSchema();
  return insertRecord("auto_snapshots", {
    auto_policy_id: payload.auto_policy_id,
    auto_document_id: payload.auto_document_id || null,
    snapshot_type: payload.snapshot_type || null,
    snapshot_date: payload.snapshot_date || null,
    normalized_auto: normalizedAuto,
    completeness_assessment:
      payload.completeness_assessment ||
      normalizedAuto?.statement_context?.completeness_assessment ||
      {},
    carrier_profile: payload.carrier_profile || {},
    extraction_meta: payload.extraction_meta || {},
  });
}

export async function listAutoSnapshots(autoPolicyId) {
  return listRecords(
    "auto_snapshots",
    [{ column: "auto_policy_id", value: autoPolicyId }],
    {
      select: "*, auto_documents(id, document_class_key, document_date, carrier_key, asset_document_id)",
      orderBy: "snapshot_date",
    }
  );
}

export async function createAutoAnalytics(payload) {
  const normalizedIntelligence =
    payload.normalized_intelligence || createEmptyAutoIntelligenceSchema();
  return insertRecord("auto_analytics", {
    auto_policy_id: payload.auto_policy_id,
    snapshot_id: payload.snapshot_id || null,
    analytics_type: payload.analytics_type || null,
    normalized_intelligence: normalizedIntelligence,
    review_flags: payload.review_flags || normalizedIntelligence.review_flags || [],
    metadata: payload.metadata || {},
  });
}

export async function listAutoAnalytics(autoPolicyId) {
  return listRecords(
    "auto_analytics",
    [{ column: "auto_policy_id", value: autoPolicyId }],
    {
      select: "*, auto_snapshots(id, snapshot_type, snapshot_date)",
      orderBy: "updated_at",
    }
  );
}

export async function linkAssetDocumentToAutoDocument({
  auto_policy_id,
  asset_document_id,
  document_class_key,
  carrier_key,
  document_date,
  metadata = {},
}) {
  if (!auto_policy_id || !asset_document_id) {
    return {
      data: null,
      error: new Error("auto_policy_id and asset_document_id are required"),
      duplicate: false,
    };
  }

  const existingResult = await maybeSingleRecord(
    "auto_documents",
    [
      { column: "auto_policy_id", value: auto_policy_id },
      { column: "asset_document_id", value: asset_document_id },
    ],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, file_name, document_role, document_type, processing_status, storage_bucket, storage_path, created_at)",
    }
  );

  if (existingResult.error) return { data: null, error: existingResult.error, duplicate: false };
  if (existingResult.data?.id) return { data: existingResult.data, error: null, duplicate: true };

  const createResult = await createAutoDocument({
    auto_policy_id,
    asset_document_id,
    document_class_key,
    carrier_key,
    document_date,
    metadata,
  });

  return {
    data: createResult.data,
    error: createResult.error,
    duplicate: false,
  };
}

export async function uploadAutoDocument({
  household_id,
  asset_id,
  auto_policy_id,
  file,
  document_class_key,
  carrier_key,
  document_date,
  notes,
  metadata = {},
}) {
  if (!household_id || !asset_id || !auto_policy_id || !file) {
    return {
      data: null,
      error: new Error("household_id, asset_id, auto_policy_id, and file are required"),
      upload: null,
      duplicate: false,
    };
  }

  const documentClass = getAutoDocumentClass(document_class_key);
  const carrier = carrier_key ? getAutoCarrier(carrier_key) : null;

  const assetDocumentResult = await uploadGenericAssetDocument({
    householdId: household_id,
    assetId: asset_id,
    file,
    documentType: documentClass?.document_class_key || document_class_key || "auto_document",
    documentRole: "auto_document",
    assetCategoryHint: "auto_insurance",
    notes: notes || null,
    metadata: {
      ...metadata,
      auto_upload: true,
      auto_policy_id,
      carrier_key: carrier_key || null,
      carrier_display_name: carrier?.display_name || null,
      document_class_key: documentClass?.document_class_key || document_class_key || null,
      document_date: document_date || null,
    },
  });

  if (assetDocumentResult.error || !assetDocumentResult.data?.id) {
    return {
      data: null,
      error: assetDocumentResult.error || new Error("Generic asset document could not be created"),
      upload: assetDocumentResult.upload || null,
      duplicate: Boolean(assetDocumentResult.duplicate),
    };
  }

  const autoDocumentResult = await linkAssetDocumentToAutoDocument({
    auto_policy_id,
    asset_document_id: assetDocumentResult.data.id,
    document_class_key: documentClass?.document_class_key || document_class_key || null,
    carrier_key: carrier_key || null,
    document_date: document_date || null,
    metadata: {
      ...metadata,
      auto_upload: true,
      notes: notes || null,
    },
  });

  return {
    data: {
      assetDocument: assetDocumentResult.data,
      autoDocument: autoDocumentResult.data,
    },
    error: autoDocumentResult.error,
    upload: assetDocumentResult.upload || null,
    duplicate: Boolean(assetDocumentResult.duplicate || autoDocumentResult.duplicate),
  };
}

export async function getAutoPolicyBundle(autoPolicyId) {
  const [autoPolicyResult, autoDocumentsResult, autoSnapshotsResult, autoAnalyticsResult] =
    await Promise.all([
      getAutoPolicyById(autoPolicyId),
      listAutoDocuments(autoPolicyId),
      listAutoSnapshots(autoPolicyId),
      listAutoAnalytics(autoPolicyId),
    ]);

  const error =
    autoPolicyResult.error ||
    autoDocumentsResult.error ||
    autoSnapshotsResult.error ||
    autoAnalyticsResult.error ||
    null;

  return {
    data: error
      ? null
      : {
          autoPolicy: autoPolicyResult.data,
          autoDocuments: autoDocumentsResult.data || [],
          autoSnapshots: autoSnapshotsResult.data || [],
          autoAnalytics: autoAnalyticsResult.data || [],
        },
    error,
  };
}

export async function createAutoAssetWithPolicy(payload) {
  if (!payload?.household_id || !payload?.auto_policy_type_key) {
    return {
      data: null,
      error: new Error("household_id and auto_policy_type_key are required"),
    };
  }

  const assetResult = await createAsset(buildAutoAssetPayload(payload));
  if (assetResult.error || !assetResult.data?.id) {
    return { data: null, error: assetResult.error || new Error("Asset creation failed") };
  }

  const policyResult = await createAutoPolicy({
    ...payload,
    asset_id: assetResult.data.id,
  });

  if (policyResult.error || !policyResult.data?.id) {
    await deleteAssetById(assetResult.data.id);
    return {
      data: null,
      error: policyResult.error || new Error("Auto policy creation failed"),
    };
  }

  return {
    data: {
      asset: assetResult.data,
      autoPolicy: policyResult.data,
    },
    error: null,
  };
}

export async function getAutoPolicyForAsset(assetId) {
  return maybeSingleRecord("auto_policies", [{ column: "asset_id", value: assetId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function getAutoAssetLink(assetId) {
  const [assetResult, autoPolicyResult] = await Promise.all([
    getAssetById(assetId),
    getAutoPolicyForAsset(assetId),
  ]);
  return {
    data:
      assetResult.error || autoPolicyResult.error
        ? null
        : {
            asset: assetResult.data,
            autoPolicy: autoPolicyResult.data,
          },
    error: assetResult.error || autoPolicyResult.error || null,
  };
}
