import {
  createEmptyHealthIntelligenceSchema,
  createEmptyHealthSchema,
  getHealthCarrier,
  getHealthDocumentClass,
  getHealthPlanType,
  listHealthDocumentClasses as listHealthDocumentClassesFromDomain,
} from "../domain/healthInsurance";
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

function buildHealthDefaults(payload = {}) {
  const planType = getHealthPlanType(payload.health_plan_type_key);
  const carrier = payload.carrier_key ? getHealthCarrier(payload.carrier_key) : null;
  return {
    planType,
    carrier,
    planName: payload.plan_name || payload.asset_name || null,
    subscriberName: payload.subscriber_name || null,
    employerGroupName: payload.employer_group_name || null,
    planStatus: payload.plan_status || "active",
    carrierName: carrier?.display_name || payload.institution_name || null,
  };
}

function buildHealthAssetPayload(payload = {}) {
  const defaults = buildHealthDefaults(payload);
  const typeDisplay = defaults.planType?.display_name || "Health Plan";
  return {
    household_id: payload.household_id,
    asset_category: "health_insurance",
    asset_subcategory: payload.health_plan_type_key || null,
    asset_name:
      payload.asset_name ||
      payload.plan_name ||
      payload.employer_group_name ||
      [defaults.carrierName, typeDisplay].filter(Boolean).join(" ").trim() ||
      "Health Plan",
    institution_name: defaults.carrierName,
    institution_key: payload.carrier_key || null,
    owner_member_id: payload.owner_member_id || null,
    status: defaults.planStatus,
    summary: {
      health_plan_type_key: payload.health_plan_type_key || null,
      carrier_key: payload.carrier_key || null,
      subscriber_name: payload.subscriber_name || null,
      employer_group_name: payload.employer_group_name || null,
    },
    metadata: {
      ...(payload.asset_metadata || {}),
      module: "health_insurance",
      deep_record_type: "health_plan",
      health_plan_type_key: payload.health_plan_type_key || null,
      carrier_key: payload.carrier_key || null,
    },
  };
}

export async function createHealthPlan(payload) {
  const defaults = buildHealthDefaults(payload);
  return insertRecord("health_plans", {
    household_id: payload.household_id,
    asset_id: payload.asset_id,
    health_plan_type_key: payload.health_plan_type_key,
    carrier_key: payload.carrier_key || null,
    plan_name: defaults.planName,
    subscriber_name: defaults.subscriberName,
    employer_group_name: defaults.employerGroupName,
    effective_date: payload.effective_date || null,
    renewal_date: payload.renewal_date || null,
    plan_status: defaults.planStatus,
    metadata: payload.metadata || {},
  });
}

export async function getHealthPlanById(healthPlanId) {
  return maybeSingleRecord("health_plans", [{ column: "id", value: healthPlanId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function listHealthPlans(householdId) {
  return listRecords(
    "health_plans",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
      orderBy: "updated_at",
    }
  );
}

export async function createHealthDocument(payload) {
  const documentClass = payload.document_class_key
    ? getHealthDocumentClass(payload.document_class_key)
    : null;
  return insertRecord("health_documents", {
    health_plan_id: payload.health_plan_id,
    asset_document_id: payload.asset_document_id || null,
    document_class_key: documentClass?.document_class_key || payload.document_class_key || null,
    carrier_key: payload.carrier_key || null,
    document_date: payload.document_date || null,
    metadata: payload.metadata || {},
  });
}

export function listHealthDocumentClasses() {
  return listHealthDocumentClassesFromDomain();
}

export async function listHealthDocuments(healthPlanId) {
  return listRecords(
    "health_documents",
    [{ column: "health_plan_id", value: healthPlanId }],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, document_role, document_type, file_name, mime_type, storage_bucket, storage_path, processing_status, metadata)",
      orderBy: "document_date",
    }
  );
}

export async function createHealthSnapshot(payload) {
  const normalizedHealth = payload.normalized_health || createEmptyHealthSchema();
  return insertRecord("health_snapshots", {
    health_plan_id: payload.health_plan_id,
    health_document_id: payload.health_document_id || null,
    snapshot_type: payload.snapshot_type || null,
    snapshot_date: payload.snapshot_date || null,
    normalized_health: normalizedHealth,
    completeness_assessment:
      payload.completeness_assessment ||
      normalizedHealth?.statement_context?.completeness_assessment ||
      {},
    carrier_profile: payload.carrier_profile || {},
    extraction_meta: payload.extraction_meta || {},
  });
}

export async function listHealthSnapshots(healthPlanId) {
  return listRecords(
    "health_snapshots",
    [{ column: "health_plan_id", value: healthPlanId }],
    {
      select: "*, health_documents(id, document_class_key, document_date, carrier_key, asset_document_id)",
      orderBy: "snapshot_date",
    }
  );
}

export async function createHealthAnalytics(payload) {
  const normalizedIntelligence =
    payload.normalized_intelligence || createEmptyHealthIntelligenceSchema();
  return insertRecord("health_analytics", {
    health_plan_id: payload.health_plan_id,
    snapshot_id: payload.snapshot_id || null,
    analytics_type: payload.analytics_type || null,
    normalized_intelligence: normalizedIntelligence,
    review_flags: payload.review_flags || normalizedIntelligence.review_flags || [],
    metadata: payload.metadata || {},
  });
}

export async function listHealthAnalytics(healthPlanId) {
  return listRecords(
    "health_analytics",
    [{ column: "health_plan_id", value: healthPlanId }],
    {
      select: "*, health_snapshots(id, snapshot_type, snapshot_date)",
      orderBy: "updated_at",
    }
  );
}

export async function linkAssetDocumentToHealthDocument({
  health_plan_id,
  asset_document_id,
  document_class_key,
  carrier_key,
  document_date,
  metadata = {},
}) {
  if (!health_plan_id || !asset_document_id) {
    return {
      data: null,
      error: new Error("health_plan_id and asset_document_id are required"),
      duplicate: false,
    };
  }

  const existingResult = await maybeSingleRecord(
    "health_documents",
    [
      { column: "health_plan_id", value: health_plan_id },
      { column: "asset_document_id", value: asset_document_id },
    ],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, file_name, document_role, document_type, processing_status, storage_bucket, storage_path, created_at)",
    }
  );

  if (existingResult.error) return { data: null, error: existingResult.error, duplicate: false };
  if (existingResult.data?.id) return { data: existingResult.data, error: null, duplicate: true };

  const createResult = await createHealthDocument({
    health_plan_id,
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

export async function uploadHealthDocument({
  household_id,
  asset_id,
  health_plan_id,
  file,
  document_class_key,
  carrier_key,
  document_date,
  notes,
  metadata = {},
}) {
  if (!household_id || !asset_id || !health_plan_id || !file) {
    return {
      data: null,
      error: new Error("household_id, asset_id, health_plan_id, and file are required"),
      upload: null,
      duplicate: false,
    };
  }

  const documentClass = getHealthDocumentClass(document_class_key);
  const carrier = carrier_key ? getHealthCarrier(carrier_key) : null;

  const assetDocumentResult = await uploadGenericAssetDocument({
    householdId: household_id,
    assetId: asset_id,
    file,
    documentType: documentClass?.document_class_key || document_class_key || "health_document",
    documentRole: "health_document",
    assetCategoryHint: "health_insurance",
    notes: notes || null,
    metadata: {
      ...metadata,
      health_upload: true,
      health_plan_id,
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

  const healthDocumentResult = await linkAssetDocumentToHealthDocument({
    health_plan_id,
    asset_document_id: assetDocumentResult.data.id,
    document_class_key: documentClass?.document_class_key || document_class_key || null,
    carrier_key: carrier_key || null,
    document_date: document_date || null,
    metadata: {
      ...metadata,
      health_upload: true,
      notes: notes || null,
    },
  });

  return {
    data: {
      assetDocument: assetDocumentResult.data,
      healthDocument: healthDocumentResult.data,
    },
    error: healthDocumentResult.error,
    upload: assetDocumentResult.upload || null,
    duplicate: Boolean(assetDocumentResult.duplicate || healthDocumentResult.duplicate),
  };
}

export async function getHealthPlanBundle(healthPlanId) {
  const [healthPlanResult, healthDocumentsResult, healthSnapshotsResult, healthAnalyticsResult] =
    await Promise.all([
      getHealthPlanById(healthPlanId),
      listHealthDocuments(healthPlanId),
      listHealthSnapshots(healthPlanId),
      listHealthAnalytics(healthPlanId),
    ]);

  const error =
    healthPlanResult.error ||
    healthDocumentsResult.error ||
    healthSnapshotsResult.error ||
    healthAnalyticsResult.error ||
    null;

  return {
    data: error
      ? null
      : {
          healthPlan: healthPlanResult.data,
          healthDocuments: healthDocumentsResult.data || [],
          healthSnapshots: healthSnapshotsResult.data || [],
          healthAnalytics: healthAnalyticsResult.data || [],
        },
    error,
  };
}

export async function createHealthAssetWithPlan(payload) {
  if (!payload?.household_id || !payload?.health_plan_type_key) {
    return {
      data: null,
      error: new Error("household_id and health_plan_type_key are required"),
    };
  }

  const assetResult = await createAsset(buildHealthAssetPayload(payload));
  if (assetResult.error || !assetResult.data?.id) {
    return { data: null, error: assetResult.error || new Error("Asset creation failed") };
  }

  const planResult = await createHealthPlan({
    ...payload,
    asset_id: assetResult.data.id,
  });

  if (planResult.error || !planResult.data?.id) {
    await deleteAssetById(assetResult.data.id);
    return {
      data: null,
      error: planResult.error || new Error("Health plan creation failed"),
    };
  }

  return {
    data: {
      asset: assetResult.data,
      healthPlan: planResult.data,
    },
    error: null,
  };
}

export async function getHealthPlanForAsset(assetId) {
  return maybeSingleRecord("health_plans", [{ column: "asset_id", value: assetId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function getHealthAssetLink(assetId) {
  const [assetResult, healthPlanResult] = await Promise.all([
    getAssetById(assetId),
    getHealthPlanForAsset(assetId),
  ]);
  return {
    data:
      assetResult.error || healthPlanResult.error
        ? null
        : {
            asset: assetResult.data,
            healthPlan: healthPlanResult.data,
          },
    error: assetResult.error || healthPlanResult.error || null,
  };
}
