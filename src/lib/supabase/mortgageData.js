import {
  createEmptyMortgageIntelligenceSchema,
  createEmptyMortgageSchema,
  getMortgageDocumentClass,
  getMortgageLender,
  getMortgageLoanType,
  listMortgageDocumentClasses as listMortgageDocumentClassesFromDomain,
} from "../domain/mortgage";
import {
  getMortgageLinkageStatus,
  linkMortgageToProperty,
  listMortgagePropertyLinks,
  unlinkMortgageFromProperty,
  updatePropertyMortgageLink,
} from "./propertyStackLinks";
import { getSupabaseClient } from "./client";
import {
  createAsset,
  getAssetById,
  getCurrentUserOrThrow,
  getOrCreateCurrentHousehold,
  getOwnedHouseholdById,
  uploadGenericAssetDocument,
} from "./platformData";
import {
  appendHouseholdScope,
  buildScopedAccessError,
} from "./platformScope";

function getClientOrError() {
  const supabase = getSupabaseClient();
  if (!supabase) return { supabase: null, error: new Error("Supabase not configured") };
  return { supabase, error: null };
}

function warnMortgageCreation(message, context = {}) {
  if (import.meta.env.DEV) {
    console.warn(`[VaultedShield] ${message}`, context);
  }
}

function mapMortgageCreationError(error, fallbackMessage) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  if (!message) return fallbackMessage;
  if (message.includes("owner_user_id") && message.includes("null value")) {
    return "We could not initialize your household profile yet. Please try again.";
  }
  if (message.includes("row-level security")) {
    return "We could not save this mortgage inside your current household yet. Please try again.";
  }
  if (message.includes("signed in") || message.includes("authenticated")) {
    return "Please sign in again before creating a mortgage loan.";
  }
  return fallbackMessage;
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

function buildMortgageDefaults(payload = {}) {
  const loanType = getMortgageLoanType(payload.mortgage_loan_type_key);
  const lender = payload.lender_key ? getMortgageLender(payload.lender_key) : null;
  return {
    loanType,
    lender,
    loanName: payload.loan_name || payload.asset_name || null,
    propertyAddress: payload.property_address || null,
    borrowerName: payload.borrower_name || null,
    currentStatus: payload.current_status || "active",
    lenderName: lender?.display_name || payload.institution_name || null,
  };
}

function buildMortgageAssetPayload(payload = {}) {
  const defaults = buildMortgageDefaults(payload);
  const typeDisplay = defaults.loanType?.display_name || "Mortgage Loan";
  return {
    household_id: payload.household_id,
    asset_category: "mortgage",
    asset_subcategory: payload.mortgage_loan_type_key || null,
    asset_name:
      payload.asset_name ||
      payload.loan_name ||
      payload.property_address ||
      [defaults.lenderName, typeDisplay].filter(Boolean).join(" ").trim() ||
      "Mortgage Loan",
    institution_name: defaults.lenderName,
    institution_key: payload.lender_key || null,
    owner_member_id: payload.owner_member_id || null,
    status: defaults.currentStatus,
    summary: {
      mortgage_loan_type_key: payload.mortgage_loan_type_key || null,
      lender_key: payload.lender_key || null,
      property_address: payload.property_address || null,
      borrower_name: payload.borrower_name || null,
    },
    metadata: {
      ...(payload.asset_metadata || {}),
      module: "mortgage",
      deep_record_type: "mortgage_loan",
      mortgage_loan_type_key: payload.mortgage_loan_type_key || null,
      lender_key: payload.lender_key || null,
    },
  };
}

export async function createMortgageLoan(payload) {
  const defaults = buildMortgageDefaults(payload);
  return insertRecord("mortgage_loans", {
    household_id: payload.household_id,
    asset_id: payload.asset_id,
    mortgage_loan_type_key: payload.mortgage_loan_type_key,
    lender_key: payload.lender_key || null,
    loan_name: defaults.loanName,
    property_address: defaults.propertyAddress,
    borrower_name: defaults.borrowerName,
    current_status: defaults.currentStatus,
    origination_date: payload.origination_date || null,
    maturity_date: payload.maturity_date || null,
    metadata: payload.metadata || {},
  });
}

export async function getMortgageLoanById(mortgageLoanId, scopeOverride = null) {
  return maybeSingleRecord("mortgage_loans", appendHouseholdScope([{ column: "id", value: mortgageLoanId }], scopeOverride), {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function listMortgageLoans(householdId) {
  if (!householdId) {
    return { data: [], error: null };
  }
  return listRecords(
    "mortgage_loans",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
      orderBy: "updated_at",
    }
  );
}

export async function createMortgageDocument(payload) {
  const documentClass = payload.document_class_key
    ? getMortgageDocumentClass(payload.document_class_key)
    : null;
  return insertRecord("mortgage_documents", {
    mortgage_loan_id: payload.mortgage_loan_id,
    asset_document_id: payload.asset_document_id || null,
    document_class_key: documentClass?.document_class_key || payload.document_class_key || null,
    lender_key: payload.lender_key || null,
    document_date: payload.document_date || null,
    metadata: payload.metadata || {},
  });
}

export function listMortgageDocumentClasses() {
  return listMortgageDocumentClassesFromDomain();
}

export async function listMortgageDocuments(mortgageLoanId) {
  return listRecords(
    "mortgage_documents",
    [{ column: "mortgage_loan_id", value: mortgageLoanId }],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, document_role, document_type, file_name, mime_type, storage_bucket, storage_path, processing_status, metadata)",
      orderBy: "document_date",
    }
  );
}

export async function createMortgageSnapshot(payload) {
  const normalizedMortgage = payload.normalized_mortgage || createEmptyMortgageSchema();
  return insertRecord("mortgage_snapshots", {
    mortgage_loan_id: payload.mortgage_loan_id,
    mortgage_document_id: payload.mortgage_document_id || null,
    snapshot_type: payload.snapshot_type || null,
    snapshot_date: payload.snapshot_date || null,
    normalized_mortgage: normalizedMortgage,
    completeness_assessment:
      payload.completeness_assessment ||
      normalizedMortgage?.statement_context?.completeness_assessment ||
      {},
    lender_profile: payload.lender_profile || {},
    extraction_meta: payload.extraction_meta || {},
  });
}

export async function listMortgageSnapshots(mortgageLoanId) {
  return listRecords(
    "mortgage_snapshots",
    [{ column: "mortgage_loan_id", value: mortgageLoanId }],
    {
      select:
        "*, mortgage_documents(id, document_class_key, document_date, lender_key, asset_document_id)",
      orderBy: "snapshot_date",
    }
  );
}

export async function createMortgageAnalytics(payload) {
  const normalizedIntelligence =
    payload.normalized_intelligence || createEmptyMortgageIntelligenceSchema();
  return insertRecord("mortgage_analytics", {
    mortgage_loan_id: payload.mortgage_loan_id,
    snapshot_id: payload.snapshot_id || null,
    analytics_type: payload.analytics_type || null,
    normalized_intelligence: normalizedIntelligence,
    review_flags: payload.review_flags || normalizedIntelligence.review_flags || [],
    metadata: payload.metadata || {},
  });
}

export async function listMortgageAnalytics(mortgageLoanId) {
  return listRecords(
    "mortgage_analytics",
    [{ column: "mortgage_loan_id", value: mortgageLoanId }],
    {
      select: "*, mortgage_snapshots(id, snapshot_type, snapshot_date)",
      orderBy: "updated_at",
    }
  );
}

export async function linkAssetDocumentToMortgageDocument({
  mortgage_loan_id,
  asset_document_id,
  document_class_key,
  lender_key,
  document_date,
  metadata = {},
}) {
  if (!mortgage_loan_id || !asset_document_id) {
    return {
      data: null,
      error: new Error("mortgage_loan_id and asset_document_id are required"),
      duplicate: false,
    };
  }

  const existingResult = await maybeSingleRecord(
    "mortgage_documents",
    [
      { column: "mortgage_loan_id", value: mortgage_loan_id },
      { column: "asset_document_id", value: asset_document_id },
    ],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, file_name, document_role, document_type, processing_status, storage_bucket, storage_path, created_at)",
    }
  );

  if (existingResult.error) return { data: null, error: existingResult.error, duplicate: false };
  if (existingResult.data?.id) return { data: existingResult.data, error: null, duplicate: true };

  const createResult = await createMortgageDocument({
    mortgage_loan_id,
    asset_document_id,
    document_class_key,
    lender_key,
    document_date,
    metadata,
  });

  return {
    data: createResult.data,
    error: createResult.error,
    duplicate: false,
  };
}

export async function uploadMortgageDocument({
  household_id,
  asset_id,
  mortgage_loan_id,
  file,
  document_class_key,
  lender_key,
  document_date,
  notes,
  metadata = {},
}) {
  if (!household_id || !asset_id || !mortgage_loan_id || !file) {
    return {
      data: null,
      error: new Error("household_id, asset_id, mortgage_loan_id, and file are required"),
      upload: null,
      duplicate: false,
    };
  }

  const documentClass = getMortgageDocumentClass(document_class_key);
  const lender = lender_key ? getMortgageLender(lender_key) : null;

  const assetDocumentResult = await uploadGenericAssetDocument({
    householdId: household_id,
    assetId: asset_id,
    file,
    documentType: documentClass?.document_class_key || document_class_key || "mortgage_document",
    documentRole: "mortgage_document",
    assetCategoryHint: "mortgage",
    notes: notes || null,
    metadata: {
      ...metadata,
      mortgage_upload: true,
      mortgage_loan_id,
      lender_key: lender_key || null,
      lender_display_name: lender?.display_name || null,
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

  const mortgageDocumentResult = await linkAssetDocumentToMortgageDocument({
    mortgage_loan_id,
    asset_document_id: assetDocumentResult.data.id,
    document_class_key: documentClass?.document_class_key || document_class_key || null,
    lender_key: lender_key || null,
    document_date: document_date || null,
    metadata: {
      ...metadata,
      mortgage_upload: true,
      notes: notes || null,
    },
  });

  return {
    data: {
      assetDocument: assetDocumentResult.data,
      mortgageDocument: mortgageDocumentResult.data,
    },
    error: mortgageDocumentResult.error,
    upload: assetDocumentResult.upload || null,
    duplicate: Boolean(assetDocumentResult.duplicate || mortgageDocumentResult.duplicate),
  };
}

export async function getMortgageLoanBundle(mortgageLoanId, scopeOverride = null) {
  const [
    mortgageLoanResult,
    mortgageDocumentsResult,
    mortgageSnapshotsResult,
    mortgageAnalyticsResult,
  ] = await Promise.all([
    getMortgageLoanById(mortgageLoanId, scopeOverride),
    listMortgageDocuments(mortgageLoanId),
    listMortgageSnapshots(mortgageLoanId),
    listMortgageAnalytics(mortgageLoanId),
  ]);

  const error =
    mortgageLoanResult.error ||
    mortgageDocumentsResult.error ||
    mortgageSnapshotsResult.error ||
    mortgageAnalyticsResult.error ||
    null;

  return {
    data: error
      ? null
      : {
          mortgageLoan: mortgageLoanResult.data,
          mortgageDocuments: mortgageDocumentsResult.data || [],
          mortgageSnapshots: mortgageSnapshotsResult.data || [],
          mortgageAnalytics: mortgageAnalyticsResult.data || [],
        },
    error,
  };
}

export async function createMortgageAssetWithLoan(payload) {
  return createMortgageLoanWithDependencies(payload);
}

export async function createMortgageLoanWithDependencies(payload) {
  const authResult = await getCurrentUserOrThrow();
  if (authResult.error || !authResult.data?.id) {
    warnMortgageCreation("mortgage creation blocked because no authenticated user was available", {
      householdId: payload?.household_id || null,
    });
    return {
      data: null,
      error: new Error("Please sign in again before creating a mortgage loan."),
    };
  }

  if (!payload?.mortgage_loan_type_key) {
    return {
      data: null,
      error: new Error("A mortgage loan type is required before a mortgage loan can be created."),
    };
  }

  let resolvedHouseholdId = payload?.household_id || null;
  if (resolvedHouseholdId) {
    const ownedHouseholdResult = await getOwnedHouseholdById(resolvedHouseholdId, authResult.data.id);
    if (ownedHouseholdResult.error) {
      return {
        data: null,
        error: new Error(
          mapMortgageCreationError(
            ownedHouseholdResult.error,
            "We could not verify your household profile yet. Please try again."
          )
        ),
      };
    }
    if (!ownedHouseholdResult.data?.id) {
      warnMortgageCreation("mortgage creation attempted with a household outside the current user scope", {
        householdId: resolvedHouseholdId,
        authUserId: authResult.data.id,
      });
      resolvedHouseholdId = null;
    }
  }

  if (!resolvedHouseholdId) {
    const householdResult = await getOrCreateCurrentHousehold();
    if (householdResult.error || !householdResult.data?.id) {
      warnMortgageCreation("mortgage creation failed while initializing the current household", {
        authUserId: authResult.data.id,
        error: householdResult.error?.message || null,
      });
      return {
        data: null,
        error: new Error(
          mapMortgageCreationError(
            householdResult.error,
            "We could not initialize your household profile yet. Please try again."
          )
        ),
      };
    }
    resolvedHouseholdId = householdResult.data.id;
  }

  const resolvedPayload = {
    ...payload,
    household_id: resolvedHouseholdId,
  };

  const assetResult = await createAsset(buildMortgageAssetPayload(resolvedPayload));
  if (assetResult.error || !assetResult.data?.id) {
    warnMortgageCreation("mortgage asset creation failed", {
      householdId: resolvedHouseholdId,
      authUserId: authResult.data.id,
      error: assetResult.error?.message || null,
    });
    return {
      data: null,
      error: new Error(
        mapMortgageCreationError(assetResult.error, "We could not create the mortgage asset record yet. Please try again.")
      ),
    };
  }

  const loanResult = await createMortgageLoan({
    ...resolvedPayload,
    asset_id: assetResult.data.id,
  });

  if (loanResult.error || !loanResult.data?.id) {
    await deleteAssetById(assetResult.data.id);
    warnMortgageCreation("mortgage loan creation failed after asset creation", {
      householdId: resolvedHouseholdId,
      assetId: assetResult.data.id,
      authUserId: authResult.data.id,
      error: loanResult.error?.message || null,
    });
    return {
      data: null,
      error: new Error(
        mapMortgageCreationError(loanResult.error, "We could not create the mortgage loan yet. Please try again.")
      ),
    };
  }

  return {
    data: {
      householdId: resolvedHouseholdId,
      asset: assetResult.data,
      mortgageLoan: loanResult.data,
    },
    error: null,
  };
}

export async function ensureCurrentUserHousehold() {
  return getOrCreateCurrentHousehold();
}

export async function getMortgageLoanForAsset(assetId, scopeOverride = null) {
  return maybeSingleRecord("mortgage_loans", appendHouseholdScope([{ column: "asset_id", value: assetId }], scopeOverride), {
    select:
      "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
  });
}

export async function getMortgageAssetLink(assetId, scopeOverride = null) {
  const [assetResult, mortgageLoanResult] = await Promise.all([
    getAssetById(assetId, scopeOverride),
    getMortgageLoanForAsset(assetId, scopeOverride),
  ]);
  return {
    data:
      assetResult.error || mortgageLoanResult.error
        ? null
        : {
            asset: assetResult.data,
            mortgageLoan: mortgageLoanResult.data,
          },
    error:
      assetResult.error ||
      mortgageLoanResult.error ||
      (!assetResult.data && !mortgageLoanResult.data
        ? buildScopedAccessError("Mortgage asset link")
        : null),
  };
}

export {
  linkMortgageToProperty,
  listMortgagePropertyLinks,
  getMortgageLinkageStatus,
  updatePropertyMortgageLink,
  unlinkMortgageFromProperty,
};
