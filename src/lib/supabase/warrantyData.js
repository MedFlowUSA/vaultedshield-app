import {
  createEmptyWarrantyIntelligenceSchema,
  createEmptyWarrantySchema,
  getWarrantyDocumentClass,
  getWarrantyProvider,
  getWarrantyType,
  listWarrantyDocumentClasses as listWarrantyDocumentClassesFromDomain,
} from "../domain/warranties";
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

function buildWarrantyDefaults(payload = {}) {
  const warrantyType = getWarrantyType(payload.warranty_type_key);
  const provider = payload.provider_key ? getWarrantyProvider(payload.provider_key) : null;
  return {
    warrantyType,
    provider,
    contractName: payload.contract_name || payload.asset_name || null,
    coveredItemName: payload.covered_item_name || null,
    purchaserName: payload.purchaser_name || null,
    contractStatus: payload.contract_status || "active",
    providerName: provider?.display_name || payload.institution_name || null,
  };
}

function buildWarrantyAssetPayload(payload = {}) {
  const defaults = buildWarrantyDefaults(payload);
  const typeDisplay = defaults.warrantyType?.display_name || "Warranty Contract";
  return {
    household_id: payload.household_id,
    asset_category: "warranty",
    asset_subcategory: payload.warranty_type_key || null,
    asset_name:
      payload.asset_name ||
      payload.contract_name ||
      payload.covered_item_name ||
      [defaults.providerName, typeDisplay].filter(Boolean).join(" ").trim() ||
      "Warranty Contract",
    institution_name: defaults.providerName,
    institution_key: payload.provider_key || null,
    owner_member_id: payload.owner_member_id || null,
    status: defaults.contractStatus,
    summary: {
      warranty_type_key: payload.warranty_type_key || null,
      provider_key: payload.provider_key || null,
      covered_item_name: payload.covered_item_name || null,
      purchaser_name: payload.purchaser_name || null,
    },
    metadata: {
      ...(payload.asset_metadata || {}),
      module: "warranty",
      deep_record_type: "warranty_contract",
      warranty_type_key: payload.warranty_type_key || null,
      provider_key: payload.provider_key || null,
    },
  };
}

export async function createWarranty(payload) {
  const defaults = buildWarrantyDefaults(payload);
  return insertRecord("warranties", {
    household_id: payload.household_id,
    asset_id: payload.asset_id,
    warranty_type_key: payload.warranty_type_key,
    provider_key: payload.provider_key || null,
    contract_name: defaults.contractName,
    covered_item_name: defaults.coveredItemName,
    purchaser_name: defaults.purchaserName,
    effective_date: payload.effective_date || null,
    expiration_date: payload.expiration_date || null,
    contract_status: defaults.contractStatus,
    metadata: payload.metadata || {},
  });
}

export async function getWarrantyById(warrantyId) {
  return maybeSingleRecord("warranties", [{ column: "id", value: warrantyId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function listWarranties(householdId) {
  return listRecords(
    "warranties",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
      orderBy: "updated_at",
    }
  );
}

export async function createWarrantyDocument(payload) {
  const documentClass = payload.document_class_key
    ? getWarrantyDocumentClass(payload.document_class_key)
    : null;
  return insertRecord("warranty_documents", {
    warranty_id: payload.warranty_id,
    asset_document_id: payload.asset_document_id || null,
    document_class_key: documentClass?.document_class_key || payload.document_class_key || null,
    provider_key: payload.provider_key || null,
    document_date: payload.document_date || null,
    metadata: payload.metadata || {},
  });
}

export function listWarrantyDocumentClasses() {
  return listWarrantyDocumentClassesFromDomain();
}

export async function listWarrantyDocuments(warrantyId) {
  return listRecords(
    "warranty_documents",
    [{ column: "warranty_id", value: warrantyId }],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, document_role, document_type, file_name, mime_type, storage_bucket, storage_path, processing_status, metadata)",
      orderBy: "document_date",
    }
  );
}

export async function createWarrantySnapshot(payload) {
  const normalizedWarranty = payload.normalized_warranty || createEmptyWarrantySchema();
  return insertRecord("warranty_snapshots", {
    warranty_id: payload.warranty_id,
    warranty_document_id: payload.warranty_document_id || null,
    snapshot_type: payload.snapshot_type || null,
    snapshot_date: payload.snapshot_date || null,
    normalized_warranty: normalizedWarranty,
    completeness_assessment:
      payload.completeness_assessment ||
      normalizedWarranty?.statement_context?.completeness_assessment ||
      {},
    provider_profile: payload.provider_profile || {},
    extraction_meta: payload.extraction_meta || {},
  });
}

export async function listWarrantySnapshots(warrantyId) {
  return listRecords(
    "warranty_snapshots",
    [{ column: "warranty_id", value: warrantyId }],
    {
      select: "*, warranty_documents(id, document_class_key, document_date, provider_key, asset_document_id)",
      orderBy: "snapshot_date",
    }
  );
}

export async function createWarrantyAnalytics(payload) {
  const normalizedIntelligence =
    payload.normalized_intelligence || createEmptyWarrantyIntelligenceSchema();
  return insertRecord("warranty_analytics", {
    warranty_id: payload.warranty_id,
    snapshot_id: payload.snapshot_id || null,
    analytics_type: payload.analytics_type || null,
    normalized_intelligence: normalizedIntelligence,
    review_flags: payload.review_flags || normalizedIntelligence.review_flags || [],
    metadata: payload.metadata || {},
  });
}

export async function listWarrantyAnalytics(warrantyId) {
  return listRecords(
    "warranty_analytics",
    [{ column: "warranty_id", value: warrantyId }],
    {
      select: "*, warranty_snapshots(id, snapshot_type, snapshot_date)",
      orderBy: "updated_at",
    }
  );
}

export async function linkAssetDocumentToWarrantyDocument({
  warranty_id,
  asset_document_id,
  document_class_key,
  provider_key,
  document_date,
  metadata = {},
}) {
  if (!warranty_id || !asset_document_id) {
    return {
      data: null,
      error: new Error("warranty_id and asset_document_id are required"),
      duplicate: false,
    };
  }

  const existingResult = await maybeSingleRecord(
    "warranty_documents",
    [
      { column: "warranty_id", value: warranty_id },
      { column: "asset_document_id", value: asset_document_id },
    ],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, file_name, document_role, document_type, processing_status, storage_bucket, storage_path, created_at)",
    }
  );

  if (existingResult.error) return { data: null, error: existingResult.error, duplicate: false };
  if (existingResult.data?.id) return { data: existingResult.data, error: null, duplicate: true };

  const createResult = await createWarrantyDocument({
    warranty_id,
    asset_document_id,
    document_class_key,
    provider_key,
    document_date,
    metadata,
  });

  return {
    data: createResult.data,
    error: createResult.error,
    duplicate: false,
  };
}

export async function uploadWarrantyDocument({
  household_id,
  asset_id,
  warranty_id,
  file,
  document_class_key,
  provider_key,
  document_date,
  notes,
  metadata = {},
}) {
  if (!household_id || !asset_id || !warranty_id || !file) {
    return {
      data: null,
      error: new Error("household_id, asset_id, warranty_id, and file are required"),
      upload: null,
      duplicate: false,
    };
  }

  const documentClass = getWarrantyDocumentClass(document_class_key);
  const provider = provider_key ? getWarrantyProvider(provider_key) : null;

  const assetDocumentResult = await uploadGenericAssetDocument({
    householdId: household_id,
    assetId: asset_id,
    file,
    documentType: documentClass?.document_class_key || document_class_key || "warranty_document",
    documentRole: "warranty_document",
    assetCategoryHint: "warranty",
    notes: notes || null,
    metadata: {
      ...metadata,
      warranty_upload: true,
      warranty_id,
      provider_key: provider_key || null,
      provider_display_name: provider?.display_name || null,
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

  const warrantyDocumentResult = await linkAssetDocumentToWarrantyDocument({
    warranty_id,
    asset_document_id: assetDocumentResult.data.id,
    document_class_key: documentClass?.document_class_key || document_class_key || null,
    provider_key: provider_key || null,
    document_date: document_date || null,
    metadata: {
      ...metadata,
      warranty_upload: true,
      notes: notes || null,
    },
  });

  return {
    data: {
      assetDocument: assetDocumentResult.data,
      warrantyDocument: warrantyDocumentResult.data,
    },
    error: warrantyDocumentResult.error,
    upload: assetDocumentResult.upload || null,
    duplicate: Boolean(assetDocumentResult.duplicate || warrantyDocumentResult.duplicate),
  };
}

export async function getWarrantyBundle(warrantyId) {
  const [warrantyResult, warrantyDocumentsResult, warrantySnapshotsResult, warrantyAnalyticsResult] =
    await Promise.all([
      getWarrantyById(warrantyId),
      listWarrantyDocuments(warrantyId),
      listWarrantySnapshots(warrantyId),
      listWarrantyAnalytics(warrantyId),
    ]);

  const error =
    warrantyResult.error ||
    warrantyDocumentsResult.error ||
    warrantySnapshotsResult.error ||
    warrantyAnalyticsResult.error ||
    null;

  return {
    data: error
      ? null
      : {
          warranty: warrantyResult.data,
          warrantyDocuments: warrantyDocumentsResult.data || [],
          warrantySnapshots: warrantySnapshotsResult.data || [],
          warrantyAnalytics: warrantyAnalyticsResult.data || [],
        },
    error,
  };
}

export async function createWarrantyAssetWithContract(payload) {
  if (!payload?.household_id || !payload?.warranty_type_key) {
    return {
      data: null,
      error: new Error("household_id and warranty_type_key are required"),
    };
  }

  const assetResult = await createAsset(buildWarrantyAssetPayload(payload));
  if (assetResult.error || !assetResult.data?.id) {
    return { data: null, error: assetResult.error || new Error("Asset creation failed") };
  }

  const warrantyResult = await createWarranty({
    ...payload,
    asset_id: assetResult.data.id,
  });

  if (warrantyResult.error || !warrantyResult.data?.id) {
    await deleteAssetById(assetResult.data.id);
    return {
      data: null,
      error: warrantyResult.error || new Error("Warranty creation failed"),
    };
  }

  return {
    data: {
      asset: assetResult.data,
      warranty: warrantyResult.data,
    },
    error: null,
  };
}

export async function getWarrantyForAsset(assetId) {
  return maybeSingleRecord("warranties", [{ column: "asset_id", value: assetId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function getWarrantyAssetLink(assetId) {
  const [assetResult, warrantyResult] = await Promise.all([
    getAssetById(assetId),
    getWarrantyForAsset(assetId),
  ]);
  return {
    data:
      assetResult.error || warrantyResult.error
        ? null
        : {
            asset: assetResult.data,
            warranty: warrantyResult.data,
          },
    error: assetResult.error || warrantyResult.error || null,
  };
}
