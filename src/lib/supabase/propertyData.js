import {
  createEmptyPropertyIntelligenceSchema,
  createEmptyPropertySchema,
  getPropertyDocumentClass,
  getPropertyType,
  listPropertyDocumentClasses as listPropertyDocumentClassesFromDomain,
} from "../domain/property";
import {
  getPropertyStackBundle,
  getPropertyStackAnalytics,
  getPropertyStackLinkageStatus,
  linkHomeownersToProperty,
  linkMortgageToProperty,
  unlinkHomeownersFromProperty,
  unlinkMortgageFromProperty,
  upsertPropertyStackAnalytics,
  updatePropertyHomeownersLink,
  updatePropertyMortgageLink,
  listHomeownersPropertyLinks,
  listMortgagePropertyLinks,
  listPropertyHomeownersLinks,
  listPropertyMortgageLinks,
} from "./propertyStackLinks";
import {
  createPropertyValuation,
  evaluatePropertyEquityPosition,
  getLatestPropertyValuation,
  listPropertyComps,
  listPropertyValuations,
  runPropertyVirtualValuation as runPropertyVirtualValuationBase,
  savePropertyComps,
  updatePropertyAddressFacts,
} from "./propertyValuationData";
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

function buildPropertyDefaults(payload = {}) {
  const propertyType = getPropertyType(payload.property_type_key);
  return {
    propertyType,
    propertyName: payload.property_name || payload.asset_name || null,
    propertyAddress: payload.property_address || null,
    street1: payload.street_1 || null,
    street2: payload.street_2 || null,
    city: payload.city || null,
    state: payload.state || null,
    postalCode: payload.postal_code || null,
    county: payload.county || null,
    apn: payload.apn || null,
    occupancyType: payload.occupancy_type || null,
    ownerName: payload.owner_name || null,
    beds: payload.beds ?? null,
    baths: payload.baths ?? null,
    squareFeet: payload.square_feet ?? null,
    lotSize: payload.lot_size ?? null,
    yearBuilt: payload.year_built ?? null,
    propertyStatus: payload.property_status || "active",
  };
}

function buildPropertyAssetPayload(payload = {}) {
  const defaults = buildPropertyDefaults(payload);
  const typeDisplay = defaults.propertyType?.display_name || "Property";
  return {
    household_id: payload.household_id,
    asset_category: "property",
    asset_subcategory: payload.property_type_key || null,
    asset_name:
      payload.asset_name ||
      payload.property_name ||
      payload.property_address ||
      typeDisplay,
    institution_name: payload.county || null,
    institution_key: null,
    owner_member_id: payload.owner_member_id || null,
    status: defaults.propertyStatus,
    summary: {
      property_type_key: payload.property_type_key || null,
      property_address: payload.property_address || null,
      city: payload.city || null,
      state: payload.state || null,
      postal_code: payload.postal_code || null,
      county: payload.county || null,
      occupancy_type: payload.occupancy_type || null,
      owner_name: payload.owner_name || null,
    },
    metadata: {
      ...(payload.asset_metadata || {}),
      module: "property",
      deep_record_type: "property_record",
      property_type_key: payload.property_type_key || null,
      future_link_targets: ["mortgage_loans", "homeowners_policies", "portal_profiles"],
    },
  };
}

export async function createProperty(payload) {
  const defaults = buildPropertyDefaults(payload);
  return insertRecord("properties", {
    household_id: payload.household_id,
    asset_id: payload.asset_id,
    property_type_key: payload.property_type_key,
    property_name: defaults.propertyName,
    property_address: defaults.propertyAddress,
    street_1: defaults.street1,
    street_2: defaults.street2,
    city: defaults.city,
    state: defaults.state,
    postal_code: defaults.postalCode,
    county: defaults.county,
    apn: defaults.apn,
    occupancy_type: defaults.occupancyType,
    owner_name: defaults.ownerName,
    beds: defaults.beds,
    baths: defaults.baths,
    square_feet: defaults.squareFeet,
    lot_size: defaults.lotSize,
    year_built: defaults.yearBuilt,
    purchase_date: payload.purchase_date || null,
    last_purchase_price: payload.last_purchase_price || null,
    last_purchase_date: payload.last_purchase_date || payload.purchase_date || null,
    property_status: defaults.propertyStatus,
    metadata: {
      ...(payload.metadata || {}),
      future_link_targets: ["mortgage_loans", "homeowners_policies", "cross_module_household_intelligence"],
    },
  });
}

export async function getPropertyById(propertyId) {
  return maybeSingleRecord("properties", [{ column: "id", value: propertyId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function listProperties(householdId) {
  return listRecords(
    "properties",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
      orderBy: "updated_at",
    }
  );
}

export async function createPropertyDocument(payload) {
  const documentClass = payload.document_class_key
    ? getPropertyDocumentClass(payload.document_class_key)
    : null;
  return insertRecord("property_documents", {
    property_id: payload.property_id,
    asset_document_id: payload.asset_document_id || null,
    document_class_key: documentClass?.document_class_key || payload.document_class_key || null,
    document_date: payload.document_date || null,
    metadata: payload.metadata || {},
  });
}

export function listPropertyDocumentClasses() {
  return listPropertyDocumentClassesFromDomain();
}

export async function listPropertyDocuments(propertyId) {
  return listRecords(
    "property_documents",
    [{ column: "property_id", value: propertyId }],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, document_role, document_type, file_name, mime_type, storage_bucket, storage_path, processing_status, metadata)",
      orderBy: "document_date",
    }
  );
}

export async function createPropertySnapshot(payload) {
  const normalizedProperty = payload.normalized_property || createEmptyPropertySchema();
  return insertRecord("property_snapshots", {
    property_id: payload.property_id,
    property_document_id: payload.property_document_id || null,
    snapshot_type: payload.snapshot_type || null,
    snapshot_date: payload.snapshot_date || null,
    normalized_property: normalizedProperty,
    completeness_assessment:
      payload.completeness_assessment ||
      normalizedProperty?.statement_context?.completeness_assessment ||
      {},
    extraction_meta: payload.extraction_meta || {},
  });
}

export async function listPropertySnapshots(propertyId) {
  return listRecords(
    "property_snapshots",
    [{ column: "property_id", value: propertyId }],
    {
      select: "*, property_documents(id, document_class_key, document_date, asset_document_id)",
      orderBy: "snapshot_date",
    }
  );
}

export async function createPropertyAnalytics(payload) {
  const normalizedIntelligence =
    payload.normalized_intelligence || createEmptyPropertyIntelligenceSchema();
  return insertRecord("property_analytics", {
    property_id: payload.property_id,
    snapshot_id: payload.snapshot_id || null,
    analytics_type: payload.analytics_type || null,
    normalized_intelligence: normalizedIntelligence,
    review_flags: payload.review_flags || [],
    metadata: payload.metadata || {},
  });
}

export async function listPropertyAnalytics(propertyId) {
  return listRecords(
    "property_analytics",
    [{ column: "property_id", value: propertyId }],
    {
      select: "*, property_snapshots(id, snapshot_type, snapshot_date)",
      orderBy: "created_at",
    }
  );
}

export async function linkAssetDocumentToPropertyDocument({
  property_id,
  asset_document_id,
  document_class_key,
  document_date,
  metadata = {},
}) {
  if (!property_id || !asset_document_id) {
    return {
      data: null,
      error: new Error("property_id and asset_document_id are required"),
      duplicate: false,
    };
  }

  const existingResult = await maybeSingleRecord(
    "property_documents",
    [
      { column: "property_id", value: property_id },
      { column: "asset_document_id", value: asset_document_id },
    ],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, file_name, document_role, document_type, processing_status, storage_bucket, storage_path, created_at)",
    }
  );

  if (existingResult.error) return { data: null, error: existingResult.error, duplicate: false };
  if (existingResult.data?.id) return { data: existingResult.data, error: null, duplicate: true };

  const createResult = await createPropertyDocument({
    property_id,
    asset_document_id,
    document_class_key,
    document_date,
    metadata,
  });

  return {
    data: createResult.data,
    error: createResult.error,
    duplicate: false,
  };
}

export async function uploadPropertyDocument({
  household_id,
  asset_id,
  property_id,
  file,
  document_class_key,
  document_date,
  notes,
  metadata = {},
}) {
  if (!household_id || !asset_id || !property_id || !file) {
    return {
      data: null,
      error: new Error("household_id, asset_id, property_id, and file are required"),
      upload: null,
      duplicate: false,
    };
  }

  const documentClass = getPropertyDocumentClass(document_class_key);

  const assetDocumentResult = await uploadGenericAssetDocument({
    householdId: household_id,
    assetId: asset_id,
    file,
    documentType: documentClass?.document_class_key || document_class_key || "property_document",
    documentRole: "property_document",
    assetCategoryHint: "property",
    notes: notes || null,
    metadata: {
      ...metadata,
      property_upload: true,
      property_id,
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

  const propertyDocumentResult = await linkAssetDocumentToPropertyDocument({
    property_id,
    asset_document_id: assetDocumentResult.data.id,
    document_class_key: documentClass?.document_class_key || document_class_key || null,
    document_date: document_date || null,
    metadata: {
      ...metadata,
      property_upload: true,
      notes: notes || null,
    },
  });

  return {
    data: {
      assetDocument: assetDocumentResult.data,
      propertyDocument: propertyDocumentResult.data,
    },
    error: propertyDocumentResult.error,
    upload: assetDocumentResult.upload || null,
    duplicate: Boolean(assetDocumentResult.duplicate || propertyDocumentResult.duplicate),
  };
}

export async function getPropertyBundle(propertyId) {
  const [propertyResult, propertyDocumentsResult, propertySnapshotsResult, propertyAnalyticsResult, stackResult, latestValuationResult, valuationHistoryResult] =
    await Promise.all([
      getPropertyById(propertyId),
      listPropertyDocuments(propertyId),
      listPropertySnapshots(propertyId),
      listPropertyAnalytics(propertyId),
      getPropertyStackBundle(propertyId),
      getLatestPropertyValuation(propertyId),
      listPropertyValuations(propertyId),
    ]);

  let propertyStackAnalyticsResult = await getPropertyStackAnalytics(propertyId);
  if (!propertyStackAnalyticsResult.error && !propertyStackAnalyticsResult.data) {
    const refreshAnalyticsResult = await upsertPropertyStackAnalytics(propertyId);
    propertyStackAnalyticsResult = {
      data: refreshAnalyticsResult.data || null,
      error: refreshAnalyticsResult.error || null,
    };
  }

  const latestValuationId = latestValuationResult.data?.id || null;
  const latestValuationCompsResult = latestValuationId
    ? await listPropertyComps(propertyId, latestValuationId)
    : { data: [], error: null };
  const propertyEquityResult = evaluatePropertyEquityPosition({
    property: propertyResult.data || null,
    latestPropertyValuation: latestValuationResult.data || null,
    linkedMortgages: stackResult.data?.linkedMortgages || [],
    linkedHomeownersPolicies: stackResult.data?.linkedHomeownersPolicies || [],
    propertyStackAnalytics: propertyStackAnalyticsResult.data || null,
  });

  const error =
    propertyResult.error ||
    propertyDocumentsResult.error ||
    propertySnapshotsResult.error ||
    propertyAnalyticsResult.error ||
    stackResult.error ||
    propertyStackAnalyticsResult.error ||
    latestValuationResult.error ||
    valuationHistoryResult.error ||
    latestValuationCompsResult.error ||
    propertyEquityResult.error ||
    null;

  return {
    data: error
      ? null
      : {
          property: propertyResult.data,
          propertyDocuments: propertyDocumentsResult.data || [],
          propertySnapshots: propertySnapshotsResult.data || [],
          propertyAnalytics: propertyAnalyticsResult.data || [],
          linkedMortgages: stackResult.data?.linkedMortgages || [],
          linkedHomeownersPolicies: stackResult.data?.linkedHomeownersPolicies || [],
          latestPropertyValuation: latestValuationResult.data || null,
          propertyValuationHistory: valuationHistoryResult.data || [],
          propertyComps: latestValuationCompsResult.data || [],
          propertyEquityPosition: propertyEquityResult.data || null,
          propertyStackAnalytics: propertyStackAnalyticsResult.data || null,
          propertyStackLinkageStatus:
            stackResult.data?.linkageStatus ||
            getPropertyStackLinkageStatus({
              linkedMortgages: [],
              linkedHomeownersPolicies: [],
            }),
        },
    error,
  };
}

export async function runPropertyVirtualValuation(propertyId) {
  const runResult = await runPropertyVirtualValuationBase(propertyId);
  if (runResult.error || !runResult.data?.property?.id) {
    return runResult;
  }

  const analyticsResult = await upsertPropertyStackAnalytics(runResult.data.property.id);
  return {
    data: {
      ...runResult.data,
      propertyStackAnalytics: analyticsResult.data || null,
    },
    error: analyticsResult.error || null,
  };
}

export async function createPropertyAssetWithRecord(payload) {
  if (!payload?.household_id || !payload?.property_type_key) {
    return {
      data: null,
      error: new Error("household_id and property_type_key are required"),
    };
  }

  const assetResult = await createAsset(buildPropertyAssetPayload(payload));
  if (assetResult.error || !assetResult.data?.id) {
    return { data: null, error: assetResult.error || new Error("Asset creation failed") };
  }

  const propertyResult = await createProperty({
    ...payload,
    asset_id: assetResult.data.id,
  });

  if (propertyResult.error || !propertyResult.data?.id) {
    await deleteAssetById(assetResult.data.id);
    return {
      data: null,
      error: propertyResult.error || new Error("Property record creation failed"),
    };
  }

  return {
    data: {
      asset: assetResult.data,
      property: propertyResult.data,
    },
    error: null,
  };
}

export async function getPropertyForAsset(assetId) {
  return maybeSingleRecord("properties", [{ column: "asset_id", value: assetId }], {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function getPropertyAssetLink(assetId) {
  const [assetResult, propertyResult] = await Promise.all([
    getAssetById(assetId),
    getPropertyForAsset(assetId),
  ]);
  return {
    data:
      assetResult.error || propertyResult.error
        ? null
        : {
            asset: assetResult.data,
            property: propertyResult.data,
          },
    error: assetResult.error || propertyResult.error || null,
  };
}

export {
  linkMortgageToProperty,
  linkHomeownersToProperty,
  listPropertyMortgageLinks,
  listPropertyHomeownersLinks,
  listMortgagePropertyLinks,
  listHomeownersPropertyLinks,
  getPropertyStackBundle,
  getPropertyStackAnalytics,
  getPropertyStackLinkageStatus,
  listPropertyValuations,
  getLatestPropertyValuation,
  listPropertyComps,
  createPropertyValuation,
  savePropertyComps,
  evaluatePropertyEquityPosition,
  updatePropertyAddressFacts,
  upsertPropertyStackAnalytics,
  updatePropertyMortgageLink,
  updatePropertyHomeownersLink,
  unlinkMortgageFromProperty,
  unlinkHomeownersFromProperty,
};
