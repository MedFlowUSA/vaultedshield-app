import {
  createEmptyHomeownersIntelligenceSchema,
  createEmptyHomeownersSchema,
  getHomeownersCarrier,
  getHomeownersDocumentClass,
  getHomeownersPolicyType,
  listHomeownersDocumentClasses as listHomeownersDocumentClassesFromDomain,
} from "../domain/homeowners";
import {
  getHomeownersLinkageStatus,
  linkHomeownersToProperty,
  listHomeownersPropertyLinks,
  unlinkHomeownersFromProperty,
  updatePropertyHomeownersLink,
} from "./propertyStackLinks";
import { listAssetLinksForAsset } from "./assetLinks";
import { getSupabaseClient } from "./client";
import { createAsset, getAssetById, uploadGenericAssetDocument } from "./platformData";
import { assembleModuleBundle } from "./moduleBundleState.js";

function getClientOrError() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { supabase: null, error: new Error("Supabase not configured") };
  }
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

function buildHomeownersDefaults(payload = {}) {
  const policyType = getHomeownersPolicyType(payload.homeowners_policy_type_key);
  const carrier = payload.carrier_key ? getHomeownersCarrier(payload.carrier_key) : null;
  return {
    policyType,
    carrier,
    policyName: payload.policy_name || payload.asset_name || null,
    propertyAddress: payload.property_address || null,
    namedInsured: payload.named_insured || null,
    policyStatus: payload.policy_status || "active",
    carrierName: carrier?.display_name || payload.institution_name || null,
  };
}

function buildHomeownersAssetPayload(payload = {}) {
  const defaults = buildHomeownersDefaults(payload);
  const typeDisplay = defaults.policyType?.display_name || "Homeowners Policy";
  return {
    household_id: payload.household_id,
    asset_category: "homeowners",
    asset_subcategory: payload.homeowners_policy_type_key || null,
    asset_name:
      payload.asset_name ||
      payload.policy_name ||
      payload.property_address ||
      [defaults.carrierName, typeDisplay].filter(Boolean).join(" ").trim() ||
      "Homeowners Policy",
    institution_name: defaults.carrierName,
    institution_key: payload.carrier_key || null,
    owner_member_id: payload.owner_member_id || null,
    status: defaults.policyStatus,
    summary: {
      homeowners_policy_type_key: payload.homeowners_policy_type_key || null,
      carrier_key: payload.carrier_key || null,
      property_address: payload.property_address || null,
      named_insured: payload.named_insured || null,
    },
    metadata: {
      ...(payload.asset_metadata || {}),
      module: "homeowners",
      deep_record_type: "homeowners_policy",
      homeowners_policy_type_key: payload.homeowners_policy_type_key || null,
      carrier_key: payload.carrier_key || null,
    },
  };
}

export async function createHomeownersPolicy(payload) {
  const defaults = buildHomeownersDefaults(payload);
  return insertRecord("homeowners_policies", {
    household_id: payload.household_id,
    asset_id: payload.asset_id,
    homeowners_policy_type_key: payload.homeowners_policy_type_key,
    carrier_key: payload.carrier_key || null,
    policy_name: defaults.policyName,
    property_address: defaults.propertyAddress,
    named_insured: defaults.namedInsured,
    effective_date: payload.effective_date || null,
    expiration_date: payload.expiration_date || null,
    policy_status: defaults.policyStatus,
    metadata: payload.metadata || {},
  });
}

export async function getHomeownersPolicyById(homeownersPolicyId) {
  return maybeSingleRecord("homeowners_policies", [{ column: "id", value: homeownersPolicyId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function listHomeownersPolicies(householdId) {
  return listRecords(
    "homeowners_policies",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
      orderBy: "updated_at",
    }
  );
}

export async function createHomeownersDocument(payload) {
  const documentClass = payload.document_class_key
    ? getHomeownersDocumentClass(payload.document_class_key)
    : null;
  return insertRecord("homeowners_documents", {
    homeowners_policy_id: payload.homeowners_policy_id,
    asset_document_id: payload.asset_document_id || null,
    document_class_key: documentClass?.document_class_key || payload.document_class_key || null,
    carrier_key: payload.carrier_key || null,
    document_date: payload.document_date || null,
    metadata: payload.metadata || {},
  });
}

export function listHomeownersDocumentClasses() {
  return listHomeownersDocumentClassesFromDomain();
}

export async function listHomeownersDocuments(homeownersPolicyId) {
  return listRecords(
    "homeowners_documents",
    [{ column: "homeowners_policy_id", value: homeownersPolicyId }],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, document_role, document_type, file_name, mime_type, storage_bucket, storage_path, processing_status, metadata)",
      orderBy: "document_date",
    }
  );
}

export async function createHomeownersSnapshot(payload) {
  const normalizedHomeowners = payload.normalized_homeowners || createEmptyHomeownersSchema();
  return insertRecord("homeowners_snapshots", {
    homeowners_policy_id: payload.homeowners_policy_id,
    homeowners_document_id: payload.homeowners_document_id || null,
    snapshot_type: payload.snapshot_type || null,
    snapshot_date: payload.snapshot_date || null,
    normalized_homeowners: normalizedHomeowners,
    completeness_assessment:
      payload.completeness_assessment ||
      normalizedHomeowners?.statement_context?.completeness_assessment ||
      {},
    carrier_profile: payload.carrier_profile || {},
    extraction_meta: payload.extraction_meta || {},
  });
}

export async function listHomeownersSnapshots(homeownersPolicyId) {
  return listRecords(
    "homeowners_snapshots",
    [{ column: "homeowners_policy_id", value: homeownersPolicyId }],
    {
      select:
        "*, homeowners_documents(id, document_class_key, document_date, carrier_key, asset_document_id)",
      orderBy: "snapshot_date",
    }
  );
}

export async function createHomeownersAnalytics(payload) {
  const normalizedIntelligence =
    payload.normalized_intelligence || createEmptyHomeownersIntelligenceSchema();
  return insertRecord("homeowners_analytics", {
    homeowners_policy_id: payload.homeowners_policy_id,
    snapshot_id: payload.snapshot_id || null,
    analytics_type: payload.analytics_type || null,
    normalized_intelligence: normalizedIntelligence,
    review_flags: payload.review_flags || normalizedIntelligence.review_flags || [],
    metadata: payload.metadata || {},
  });
}

export async function listHomeownersAnalytics(homeownersPolicyId) {
  return listRecords(
    "homeowners_analytics",
    [{ column: "homeowners_policy_id", value: homeownersPolicyId }],
    {
      select: "*, homeowners_snapshots(id, snapshot_type, snapshot_date)",
      orderBy: "updated_at",
    }
  );
}

export async function linkAssetDocumentToHomeownersDocument({
  homeowners_policy_id,
  asset_document_id,
  document_class_key,
  carrier_key,
  document_date,
  metadata = {},
}) {
  if (!homeowners_policy_id || !asset_document_id) {
    return {
      data: null,
      error: new Error("homeowners_policy_id and asset_document_id are required"),
      duplicate: false,
    };
  }

  const existingResult = await maybeSingleRecord(
    "homeowners_documents",
    [
      { column: "homeowners_policy_id", value: homeowners_policy_id },
      { column: "asset_document_id", value: asset_document_id },
    ],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, file_name, document_role, document_type, processing_status, storage_bucket, storage_path, created_at)",
    }
  );

  if (existingResult.error) {
    return { data: null, error: existingResult.error, duplicate: false };
  }
  if (existingResult.data?.id) {
    return { data: existingResult.data, error: null, duplicate: true };
  }

  const createResult = await createHomeownersDocument({
    homeowners_policy_id,
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

export async function uploadHomeownersDocument({
  household_id,
  asset_id,
  homeowners_policy_id,
  file,
  document_class_key,
  carrier_key,
  document_date,
  notes,
  metadata = {},
}) {
  if (!household_id || !asset_id || !homeowners_policy_id || !file) {
    return {
      data: null,
      error: new Error("household_id, asset_id, homeowners_policy_id, and file are required"),
      upload: null,
      duplicate: false,
    };
  }

  const documentClass = getHomeownersDocumentClass(document_class_key);
  const carrier = carrier_key ? getHomeownersCarrier(carrier_key) : null;

  const assetDocumentResult = await uploadGenericAssetDocument({
    householdId: household_id,
    assetId: asset_id,
    file,
    documentType: documentClass?.document_class_key || document_class_key || "homeowners_document",
    documentRole: "homeowners_document",
    assetCategoryHint: "homeowners",
    notes: notes || null,
    metadata: {
      ...metadata,
      homeowners_upload: true,
      homeowners_policy_id,
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

  const homeownersDocumentResult = await linkAssetDocumentToHomeownersDocument({
    homeowners_policy_id,
    asset_document_id: assetDocumentResult.data.id,
    document_class_key: documentClass?.document_class_key || document_class_key || null,
    carrier_key: carrier_key || null,
    document_date: document_date || null,
    metadata: {
      ...metadata,
      homeowners_upload: true,
      notes: notes || null,
    },
  });

  return {
    data: {
      assetDocument: assetDocumentResult.data,
      homeownersDocument: homeownersDocumentResult.data,
    },
    error: homeownersDocumentResult.error,
    upload: assetDocumentResult.upload || null,
    duplicate: Boolean(assetDocumentResult.duplicate || homeownersDocumentResult.duplicate),
  };
}

export async function getHomeownersPolicyBundle(homeownersPolicyId, scopeOverride = null) {
  const [
    homeownersPolicyResult,
    homeownersDocumentsResult,
    homeownersSnapshotsResult,
    homeownersAnalyticsResult,
  ] = await Promise.all([
    getHomeownersPolicyById(homeownersPolicyId),
    listHomeownersDocuments(homeownersPolicyId),
    listHomeownersSnapshots(homeownersPolicyId),
    listHomeownersAnalytics(homeownersPolicyId),
  ]);
  const homeownersAssetLinksResult = homeownersPolicyResult.data?.assets?.id
    ? await listAssetLinksForAsset(homeownersPolicyResult.data.assets.id, scopeOverride)
    : { data: [], error: null };

  return assembleHomeownersPolicyBundle({
    homeownersPolicyResult,
    homeownersDocumentsResult,
    homeownersSnapshotsResult,
    homeownersAnalyticsResult,
    homeownersAssetLinksResult,
  });
}

export function assembleHomeownersPolicyBundle({
  homeownersPolicyResult,
  homeownersDocumentsResult,
  homeownersSnapshotsResult,
  homeownersAnalyticsResult,
  homeownersAssetLinksResult,
}) {
  return assembleModuleBundle({
    coreResult: homeownersPolicyResult,
    coreKey: "homeownersPolicy",
    missingMessage: "Homeowners policy bundle could not be loaded.",
    collections: [
      {
        key: "homeownersDocuments",
        area: "documents",
        label: "Homeowners documents",
        result: homeownersDocumentsResult,
        fallbackData: [],
      },
      {
        key: "homeownersSnapshots",
        area: "snapshots",
        label: "Homeowners snapshots",
        result: homeownersSnapshotsResult,
        fallbackData: [],
      },
      {
        key: "homeownersAnalytics",
        area: "analytics",
        label: "Homeowners analytics",
        result: homeownersAnalyticsResult,
        fallbackData: [],
      },
      {
        key: "homeownersAssetLinks",
        area: "asset_links",
        label: "Homeowners linked context",
        result: homeownersAssetLinksResult,
        fallbackData: [],
      },
    ],
  });
}

export async function createHomeownersAssetWithPolicy(payload) {
  if (!payload?.household_id || !payload?.homeowners_policy_type_key) {
    return {
      data: null,
      error: new Error("household_id and homeowners_policy_type_key are required"),
    };
  }

  const assetResult = await createAsset(buildHomeownersAssetPayload(payload));
  if (assetResult.error || !assetResult.data?.id) {
    return { data: null, error: assetResult.error || new Error("Asset creation failed") };
  }

  const policyResult = await createHomeownersPolicy({
    ...payload,
    asset_id: assetResult.data.id,
  });

  if (policyResult.error || !policyResult.data?.id) {
    await deleteAssetById(assetResult.data.id);
    return {
      data: null,
      error: policyResult.error || new Error("Homeowners policy creation failed"),
    };
  }

  return {
    data: {
      asset: assetResult.data,
      homeownersPolicy: policyResult.data,
    },
    error: null,
  };
}

export async function getHomeownersPolicyForAsset(assetId) {
  return maybeSingleRecord("homeowners_policies", [{ column: "asset_id", value: assetId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function getHomeownersAssetLink(assetId) {
  const [assetResult, homeownersPolicyResult] = await Promise.all([
    getAssetById(assetId),
    getHomeownersPolicyForAsset(assetId),
  ]);
  return {
    data:
      assetResult.error || homeownersPolicyResult.error
        ? null
        : {
            asset: assetResult.data,
            homeownersPolicy: homeownersPolicyResult.data,
          },
    error: assetResult.error || homeownersPolicyResult.error || null,
  };
}

export {
  linkHomeownersToProperty,
  listHomeownersPropertyLinks,
  getHomeownersLinkageStatus,
  updatePropertyHomeownersLink,
  unlinkHomeownersFromProperty,
};
