import {
  createEmptyRetirementIntelligenceSchema,
  createEmptyRetirementSchema,
  getRetirementDocumentClass,
  getRetirementProvider,
  getRetirementType,
  listRetirementDocumentClasses as listRetirementDocumentClassesFromDomain,
} from "../domain/retirement";
import {
  buildRetirementIntelligence,
  extractRetirementDocumentText,
  extractRetirementDocumentTextFromBlob,
  parseRetirementDocument,
} from "../parsers/retirement";
import { getSupabaseClient } from "./client";
import {
  createAsset,
  getAssetById,
  uploadGenericAssetDocument,
} from "./platformData";

// Retirement persistence sits between the broad platform shell and future retirement-specific UI.
// - Retirement Hub should combine generic assets with retirement_accounts for list views and summary cards.
// - Retirement Detail should use getRetirementAccountBundle(...) as the primary data entry point.
// - Future parser output should land in retirement_snapshots.
// - Future retirement intelligence should land in retirement_analytics.
// - Future allocation and subaccount parsing should land in retirement_positions.
// - Specialized IUL persistence remains isolated in vaulted_* tables.

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

  const { data, error: insertError } = await supabase
    .from(table)
    .insert(payload)
    .select()
    .single();

  return { data, error: insertError };
}

async function listRecords(table, filters = [], options = {}) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };

  let query = supabase.from(table).select(options.select || "*");

  filters.forEach((filter) => {
    if (filter.operator === "is") {
      query = query.is(filter.column, filter.value);
      return;
    }

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
    if (filter.operator === "is") {
      query = query.is(filter.column, filter.value);
      return;
    }

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

async function updateRecord(table, id, payload, options = {}) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  if (!id) return { data: null, error: new Error(`${table} id is required`) };

  let query = supabase.from(table).update(payload).eq("id", id);
  if (options.select !== false) {
    query = query.select(options.select || "*").single();
  }

  const { data, error: updateError } = await query;
  return { data: data || null, error: updateError };
}

async function deleteRecords(table, filters = []) {
  const { supabase, error } = getClientOrError();
  if (error) return { error };

  let query = supabase.from(table).delete();
  filters.forEach((filter) => {
    query = query[filter.operator || "eq"](filter.column, filter.value);
  });

  const { error: deleteError } = await query;
  return { error: deleteError };
}

function buildRetirementAccountDefaults(payload = {}) {
  const retirementType = getRetirementType(payload.retirement_type_key);
  const provider = payload.provider_key ? getRetirementProvider(payload.provider_key) : null;

  return {
    retirementType,
    provider,
    planName: payload.plan_name || null,
    institutionName: payload.institution_name || provider?.display_name || null,
    accountOwner: payload.account_owner || payload.participant_name || null,
    participantName: payload.participant_name || payload.account_owner || null,
    planStatus: payload.plan_status || "active",
    isAccountBased:
      payload.is_account_based ?? retirementType?.account_based ?? true,
    isBenefitBased:
      payload.is_benefit_based ?? retirementType?.benefit_based ?? false,
  };
}

export function getRetirementLabeling(retirementTypeKey, providerKey) {
  const retirementType = getRetirementType(retirementTypeKey);
  const provider = providerKey ? getRetirementProvider(providerKey) : null;

  return {
    retirementTypeKey,
    providerKey: providerKey || null,
    retirementTypeDisplayName: retirementType?.display_name || retirementTypeKey || "Retirement Account",
    providerDisplayName: provider?.display_name || null,
    institutionName: provider?.display_name || null,
    isAccountBased: retirementType?.account_based ?? true,
    isBenefitBased: retirementType?.benefit_based ?? false,
    taxTreatment: retirementType?.tax_treatment || null,
    majorCategory: retirementType?.major_category || null,
  };
}

function buildRetirementAssetPayload(payload = {}) {
  const defaults = buildRetirementAccountDefaults(payload);
  const typeDisplay = defaults.retirementType?.display_name || "Retirement Account";
  const providerDisplay = defaults.provider?.display_name || defaults.institutionName || null;

  return {
    household_id: payload.household_id,
    asset_category: "retirement",
    asset_subcategory: payload.retirement_type_key || null,
    asset_name:
      payload.asset_name ||
      payload.plan_name ||
      [providerDisplay, typeDisplay].filter(Boolean).join(" ").trim() ||
      "Retirement Account",
    institution_name: defaults.institutionName,
    institution_key: payload.provider_key || null,
    owner_member_id: payload.owner_member_id || null,
    status: defaults.planStatus,
    summary: {
      retirement_type_key: payload.retirement_type_key || null,
      provider_key: payload.provider_key || null,
      plan_name: payload.plan_name || null,
      account_based: defaults.isAccountBased,
      benefit_based: defaults.isBenefitBased,
    },
    metadata: {
      ...(payload.asset_metadata || {}),
      module: "retirement",
      deep_record_type: "retirement_account",
      retirement_type_key: payload.retirement_type_key || null,
      provider_key: payload.provider_key || null,
    },
  };
}

export async function createRetirementAccount(payload) {
  const defaults = buildRetirementAccountDefaults(payload);

  return insertRecord("retirement_accounts", {
    household_id: payload.household_id,
    asset_id: payload.asset_id,
    retirement_type_key: payload.retirement_type_key,
    provider_key: payload.provider_key || null,
    plan_name: defaults.planName,
    institution_name: defaults.institutionName,
    account_number_masked: payload.account_number_masked || null,
    account_owner: defaults.accountOwner,
    participant_name: defaults.participantName,
    employer_name: payload.employer_name || null,
    plan_status: defaults.planStatus,
    is_account_based: defaults.isAccountBased,
    is_benefit_based: defaults.isBenefitBased,
    metadata: payload.metadata || {},
  });
}

export async function getRetirementAccountById(retirementAccountId) {
  return maybeSingleRecord(
    "retirement_accounts",
    [{ column: "id", value: retirementAccountId }],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
    }
  );
}

export async function listRetirementAccounts(householdId) {
  return listRecords(
    "retirement_accounts",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
      orderBy: "updated_at",
    }
  );
}

export async function createRetirementDocument(payload) {
  const documentClass = payload.document_class_key
    ? getRetirementDocumentClass(payload.document_class_key)
    : null;

  return insertRecord("retirement_documents", {
    retirement_account_id: payload.retirement_account_id,
    asset_document_id: payload.asset_document_id || null,
    document_class_key: documentClass?.document_class_key || payload.document_class_key || null,
    provider_key: payload.provider_key || null,
    statement_date: payload.statement_date || null,
    metadata: payload.metadata || {},
  });
}

export function listRetirementDocumentClasses() {
  return listRetirementDocumentClassesFromDomain();
}

export async function listRetirementDocuments(retirementAccountId) {
  return listRecords(
    "retirement_documents",
    [{ column: "retirement_account_id", value: retirementAccountId }],
    {
      select:
        "*, asset_documents(id, asset_id, household_id, document_role, document_type, file_name, mime_type, storage_bucket, storage_path, processing_status, metadata)",
      orderBy: "statement_date",
    }
  );
}

export async function linkAssetDocumentToRetirementDocument({
  retirement_account_id,
  asset_document_id,
  document_class_key,
  provider_key,
  statement_date,
  metadata = {},
}) {
  if (!retirement_account_id || !asset_document_id) {
    return {
      data: null,
      error: new Error("retirement_account_id and asset_document_id are required"),
      duplicate: false,
    };
  }

  const existingResult = await maybeSingleRecord(
    "retirement_documents",
    [
      { column: "retirement_account_id", value: retirement_account_id },
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

  const createResult = await createRetirementDocument({
    retirement_account_id,
    asset_document_id,
    document_class_key,
    provider_key,
    statement_date,
    metadata,
  });

  return {
    data: createResult.data,
    error: createResult.error,
    duplicate: false,
  };
}

export async function uploadRetirementDocument({
  household_id,
  asset_id,
  retirement_account_id,
  file,
  document_class_key,
  provider_key,
  statement_date,
  notes,
  metadata = {},
}) {
  if (!household_id || !asset_id || !retirement_account_id || !file) {
    return {
      data: null,
      error: new Error("household_id, asset_id, retirement_account_id, and file are required"),
      upload: null,
      duplicate: false,
    };
  }

  const documentClass = getRetirementDocumentClass(document_class_key);
  const provider = provider_key ? getRetirementProvider(provider_key) : null;
  const textExtraction = await extractRetirementDocumentText(file);

  const assetDocumentResult = await uploadGenericAssetDocument({
    householdId: household_id,
    assetId: asset_id,
    file,
    documentType: documentClass?.document_class_key || document_class_key || "retirement_document",
    documentRole: "retirement_document",
    assetCategoryHint: "retirement",
    notes: notes || null,
    metadata: {
      ...metadata,
      retirement_upload: true,
      retirement_account_id,
      provider_key: provider_key || null,
      provider_display_name: provider?.display_name || null,
      document_class_key: documentClass?.document_class_key || document_class_key || null,
      statement_date: statement_date || null,
      extracted_text_available: Boolean(textExtraction.rawText),
      raw_text: textExtraction.rawText || "",
      page_texts: textExtraction.pageTexts || [],
      page_count: textExtraction.pageCount || 0,
      text_extraction_error: textExtraction.errorSummary || null,
      text_extraction_warnings: textExtraction.warnings || [],
      text_extraction_classified_error: textExtraction.classifiedError || null,
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

  const retirementDocumentResult = await linkAssetDocumentToRetirementDocument({
    retirement_account_id,
    asset_document_id: assetDocumentResult.data.id,
    document_class_key: documentClass?.document_class_key || document_class_key || null,
    provider_key: provider_key || null,
    statement_date: statement_date || null,
    metadata: {
      ...metadata,
      retirement_upload: true,
      notes: notes || null,
    },
  });

  return {
    data: {
      assetDocument: assetDocumentResult.data,
      retirementDocument: retirementDocumentResult.data,
      textExtraction,
    },
    error: retirementDocumentResult.error,
    upload: assetDocumentResult.upload || null,
    duplicate: Boolean(assetDocumentResult.duplicate || retirementDocumentResult.duplicate),
  };
}

export async function createRetirementSnapshot(payload) {
  const normalizedRetirement = payload.normalized_retirement || createEmptyRetirementSchema();

  return insertRecord("retirement_snapshots", {
    retirement_account_id: payload.retirement_account_id,
    retirement_document_id: payload.retirement_document_id || null,
    snapshot_type: payload.snapshot_type || null,
    snapshot_date: payload.snapshot_date || null,
    normalized_retirement: normalizedRetirement,
    completeness_assessment:
      payload.completeness_assessment ||
      normalizedRetirement?.statement_context?.completeness_assessment ||
      {},
    provider_profile: payload.provider_profile || {},
    extraction_meta: payload.extraction_meta || {},
  });
}

async function downloadRetirementDocumentBlob(assetDocument) {
  const { supabase, error } = getClientOrError();
  if (error) return { blob: null, error };

  if (!assetDocument?.storage_bucket || !assetDocument?.storage_path) {
    return {
      blob: null,
      error: new Error("Stored retirement document is missing storage location"),
    };
  }

  const { data, error: downloadError } = await supabase
    .storage
    .from(assetDocument.storage_bucket)
    .download(assetDocument.storage_path);

  return {
    blob: data || null,
    error: downloadError || null,
  };
}

async function resolveRetirementDocumentText(assetDocument) {
  const metadata = assetDocument?.metadata || {};

  if (metadata.raw_text || (Array.isArray(metadata.page_texts) && metadata.page_texts.length > 0)) {
    return {
      rawText: metadata.raw_text || "",
      pageTexts: Array.isArray(metadata.page_texts) ? metadata.page_texts : [],
      pageCount:
        metadata.page_count ||
        (Array.isArray(metadata.page_texts) ? metadata.page_texts.length : 0),
      source: "asset_document_metadata",
      errorSummary: metadata.text_extraction_error || "",
      warnings: Array.isArray(metadata.text_extraction_warnings) ? metadata.text_extraction_warnings : [],
      classifiedError: metadata.text_extraction_classified_error || null,
    };
  }

  const downloadResult = await downloadRetirementDocumentBlob(assetDocument);
  if (downloadResult.error || !downloadResult.blob) {
    return {
      rawText: "",
      pageTexts: [],
      pageCount: 0,
      source: "storage_download_failed",
      errorSummary:
        downloadResult.error?.message ||
        "Stored retirement document could not be downloaded for parsing",
    };
  }

  const extracted = await extractRetirementDocumentTextFromBlob(
    downloadResult.blob,
    assetDocument.file_name || "retirement-document.pdf",
    assetDocument.mime_type || downloadResult.blob.type || ""
  );

  return {
    ...extracted,
    source: "storage_download",
  };
}

export async function parseRetirementDocumentToSnapshot({
  retirementAccount,
  retirementDocument,
}) {
  if (!retirementAccount?.id || !retirementDocument?.id) {
    return {
      data: null,
      error: new Error("retirementAccount and retirementDocument are required"),
    };
  }

  const assetDocument = retirementDocument.asset_documents || null;
  const resolvedText = await resolveRetirementDocumentText(assetDocument);

  if (!resolvedText.rawText && (!resolvedText.pageTexts || resolvedText.pageTexts.length === 0)) {
    return {
      data: null,
      error: new Error(
        resolvedText.errorSummary || "Retirement document text is not available for parsing"
      ),
    };
  }

  const parserResult = parseRetirementDocument({
    text: resolvedText.rawText,
    pageTexts: resolvedText.pageTexts,
    fileName: assetDocument?.file_name || "",
    manualDocumentClassKey: retirementDocument.document_class_key || null,
    manualProviderKey: retirementDocument.provider_key || retirementAccount.provider_key || null,
    manualRetirementTypeKey: retirementAccount.retirement_type_key || null,
  });

  parserResult.normalizedRetirement.account_identity.plan_name =
    parserResult.normalizedRetirement.account_identity.plan_name ||
    retirementAccount.plan_name ||
    retirementAccount.assets?.asset_name ||
    null;
  parserResult.normalizedRetirement.account_identity.institution_name =
    parserResult.normalizedRetirement.account_identity.institution_name ||
    retirementAccount.institution_name ||
    retirementAccount.assets?.institution_name ||
    null;
  parserResult.normalizedRetirement.account_identity.institution_key =
    parserResult.normalizedRetirement.account_identity.institution_key ||
    retirementDocument.provider_key ||
    retirementAccount.provider_key ||
    null;
  parserResult.normalizedRetirement.account_identity.account_owner =
    parserResult.normalizedRetirement.account_identity.account_owner ||
    retirementAccount.account_owner ||
    null;
  parserResult.normalizedRetirement.account_identity.participant_name =
    parserResult.normalizedRetirement.account_identity.participant_name ||
    retirementAccount.participant_name ||
    null;
  parserResult.normalizedRetirement.account_identity.employer_name =
    parserResult.normalizedRetirement.account_identity.employer_name ||
    retirementAccount.employer_name ||
    null;
  parserResult.normalizedRetirement.account_identity.account_number_masked =
    parserResult.normalizedRetirement.account_identity.account_number_masked ||
    retirementAccount.account_number_masked ||
    null;
  parserResult.normalizedRetirement.account_identity.plan_status =
    parserResult.normalizedRetirement.account_identity.plan_status ||
    retirementAccount.plan_status ||
    null;

  const snapshotResult = await createRetirementSnapshot({
    retirement_account_id: retirementAccount.id,
    retirement_document_id: retirementDocument.id,
    snapshot_type: parserResult.snapshotType,
    snapshot_date: parserResult.snapshotDate || retirementDocument.statement_date || null,
    normalized_retirement: parserResult.normalizedRetirement,
    completeness_assessment: parserResult.completenessAssessment,
    provider_profile: parserResult.providerProfileSummary,
    extraction_meta: {
      ...parserResult.extractionMeta,
      parse_source: resolvedText.source,
      document_class_key:
        parserResult.classifier.document_class_key ||
        retirementDocument.document_class_key ||
        null,
      provider_key:
        parserResult.classifier.provider_key || retirementDocument.provider_key || null,
      retirement_type_key:
        parserResult.classifier.retirement_type_key ||
        retirementAccount.retirement_type_key ||
        null,
      },
  });

  const positionsResult = snapshotResult.error
    ? { data: [], error: null }
    : await replaceRetirementPositionsForSnapshot({
        retirement_account_id: retirementAccount.id,
        snapshot_id: snapshotResult.data?.id,
        positions: parserResult.positions || [],
      });

  const intelligenceResult = snapshotResult.error
    ? { data: null, error: null }
    : (() => {
        const intelligenceOutput = buildRetirementIntelligence({
          retirementAccount,
          latestSnapshot: snapshotResult.data
            ? {
                ...snapshotResult.data,
                normalized_retirement: parserResult.normalizedRetirement,
                completeness_assessment: parserResult.completenessAssessment,
                provider_profile: parserResult.providerProfileSummary,
              }
            : null,
          retirementPositions: positionsResult.data || [],
          linkedAssetContext: retirementAccount.assets || null,
        });

        return {
          engine: intelligenceOutput,
        };
      })();

  const analyticsResult =
    snapshotResult.error || positionsResult.error || !intelligenceResult.engine
      ? { data: null, error: null }
      : await createRetirementAnalytics({
          retirement_account_id: retirementAccount.id,
          snapshot_id: snapshotResult.data?.id || null,
          analytics_type: "current_view",
          normalized_intelligence: intelligenceResult.engine.normalizedIntelligence,
          readiness_status: intelligenceResult.engine.readinessStatus,
          review_flags: intelligenceResult.engine.reviewFlags,
          metadata: intelligenceResult.engine.metadata,
        });

  if (assetDocument?.id) {
    const currentMetadata = assetDocument.metadata || {};
    await updateRecord(
      "asset_documents",
      assetDocument.id,
      {
        processing_status: snapshotResult.error ? "parse_failed" : "parsed",
        metadata: {
          ...currentMetadata,
          raw_text: currentMetadata.raw_text || resolvedText.rawText || "",
          page_texts: currentMetadata.page_texts || resolvedText.pageTexts || [],
          page_count: currentMetadata.page_count || resolvedText.pageCount || 0,
          retirement_last_parse: new Date().toISOString(),
          retirement_last_snapshot_id: snapshotResult.data?.id || null,
          retirement_last_position_count: positionsResult.data?.length || 0,
          retirement_last_analytics_id: analyticsResult.data?.id || null,
          retirement_parse_error:
            snapshotResult.error?.message ||
            positionsResult.error?.message ||
            analyticsResult.error?.message ||
            null,
        },
      },
      { select: false }
    );
  }

  return {
    data: snapshotResult.error
      ? null
      : {
          snapshot: snapshotResult.data,
          positions: positionsResult.data || [],
          analytics: analyticsResult.data || null,
          intelligence: intelligenceResult.engine?.normalizedIntelligence || null,
          parserResult,
          textSource: resolvedText.source,
        },
    error: snapshotResult.error || positionsResult.error || analyticsResult.error,
  };
}

export async function listRetirementSnapshots(retirementAccountId) {
  return listRecords(
    "retirement_snapshots",
    [{ column: "retirement_account_id", value: retirementAccountId }],
    {
      select: "*, retirement_documents(id, document_class_key, statement_date, provider_key, asset_document_id)",
      orderBy: "snapshot_date",
    }
  );
}

export async function createRetirementAnalytics(payload) {
  const normalizedIntelligence =
    payload.normalized_intelligence || createEmptyRetirementIntelligenceSchema();

  return insertRecord("retirement_analytics", {
    retirement_account_id: payload.retirement_account_id,
    snapshot_id: payload.snapshot_id || null,
    analytics_type: payload.analytics_type || null,
    normalized_intelligence: normalizedIntelligence,
    readiness_status: payload.readiness_status || null,
    review_flags: payload.review_flags || normalizedIntelligence.review_flags || [],
    metadata: payload.metadata || {},
  });
}

export async function listRetirementAnalytics(retirementAccountId) {
  return listRecords(
    "retirement_analytics",
    [{ column: "retirement_account_id", value: retirementAccountId }],
    {
      select: "*, retirement_snapshots(id, snapshot_type, snapshot_date)",
      orderBy: "updated_at",
    }
  );
}

export async function createRetirementPosition(payload) {
  return insertRecord("retirement_positions", {
    retirement_account_id: payload.retirement_account_id,
    snapshot_id: payload.snapshot_id || null,
    position_type: payload.position_type || null,
    position_name: payload.position_name || null,
    ticker_symbol: payload.ticker_symbol || null,
    asset_class: payload.asset_class || null,
    units: payload.units ?? null,
    unit_value: payload.unit_value ?? null,
    current_value: payload.current_value ?? null,
    allocation_percent: payload.allocation_percent ?? null,
    metadata: payload.metadata || {},
  });
}

export async function replaceRetirementPositionsForSnapshot({
  retirement_account_id,
  snapshot_id,
  positions = [],
}) {
  if (!retirement_account_id || !snapshot_id) {
    return {
      data: [],
      error: new Error("retirement_account_id and snapshot_id are required"),
    };
  }

  const deleteResult = await deleteRecords("retirement_positions", [
    { column: "retirement_account_id", value: retirement_account_id },
    { column: "snapshot_id", value: snapshot_id },
  ]);

  if (deleteResult.error) {
    return { data: [], error: deleteResult.error };
  }

  if (!positions.length) {
    return { data: [], error: null };
  }

  const created = [];
  for (const position of positions) {
    const result = await createRetirementPosition({
      retirement_account_id,
      snapshot_id,
      position_type: position.position_type || null,
      position_name: position.position_name || null,
      ticker_symbol: position.ticker_symbol || null,
      asset_class: position.asset_class || null,
      units: position.units ?? null,
      unit_value: position.unit_value ?? null,
      current_value: position.current_value ?? null,
      allocation_percent: position.allocation_percent ?? null,
      metadata: {
        gain_loss: position.gain_loss ?? null,
        source_section: position.source_section || null,
        raw_row: position.raw_row || null,
        confidence: position.confidence || null,
        target_year: position.target_year ?? null,
        page_number: position.page_number ?? null,
      },
    });

    if (result.error) {
      return { data: created, error: result.error };
    }

    created.push(result.data);
  }

  return { data: created, error: null };
}

export async function listRetirementPositions(retirementAccountId) {
  return listRecords(
    "retirement_positions",
    [{ column: "retirement_account_id", value: retirementAccountId }],
    {
      select: "*, retirement_snapshots(id, snapshot_type, snapshot_date)",
      orderBy: "updated_at",
    }
  );
}

export async function getRetirementAccountBundle(retirementAccountId) {
  const [
    retirementAccountResult,
    retirementDocumentsResult,
    retirementSnapshotsResult,
    retirementAnalyticsResult,
    retirementPositionsResult,
  ] = await Promise.all([
    getRetirementAccountById(retirementAccountId),
    listRetirementDocuments(retirementAccountId),
    listRetirementSnapshots(retirementAccountId),
    listRetirementAnalytics(retirementAccountId),
    listRetirementPositions(retirementAccountId),
  ]);

  const error =
    retirementAccountResult.error ||
    retirementDocumentsResult.error ||
    retirementSnapshotsResult.error ||
    retirementAnalyticsResult.error ||
    retirementPositionsResult.error ||
    null;

  return {
    data: error
      ? null
      : {
          retirementAccount: retirementAccountResult.data,
          retirementDocuments: retirementDocumentsResult.data || [],
          retirementSnapshots: retirementSnapshotsResult.data || [],
          retirementAnalytics: retirementAnalyticsResult.data || [],
          retirementPositions: retirementPositionsResult.data || [],
        },
    error,
  };
}

export async function refreshRetirementAccountBundle(retirementAccountId) {
  return getRetirementAccountBundle(retirementAccountId);
}

export async function getRetirementAccountForAsset(assetId) {
  return maybeSingleRecord(
    "retirement_accounts",
    [{ column: "asset_id", value: assetId }],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
    }
  );
}

export async function getRetirementAssetLink(assetId) {
  const [assetResult, retirementAccountResult] = await Promise.all([
    getAssetById(assetId),
    getRetirementAccountForAsset(assetId),
  ]);

  return {
    data:
      assetResult.error || retirementAccountResult.error
        ? null
        : {
            asset: assetResult.data,
            retirementAccount: retirementAccountResult.data,
          },
    error: assetResult.error || retirementAccountResult.error || null,
  };
}

export async function createRetirementAssetWithAccount(payload) {
  if (!payload?.household_id || !payload?.retirement_type_key) {
    return {
      data: null,
      error: new Error("household_id and retirement_type_key are required"),
    };
  }

  const assetResult = await createAsset(buildRetirementAssetPayload(payload));
  if (assetResult.error || !assetResult.data?.id) {
    return { data: null, error: assetResult.error || new Error("Asset creation failed") };
  }

  const accountResult = await createRetirementAccount({
    ...payload,
    asset_id: assetResult.data.id,
    institution_name: payload.institution_name || assetResult.data.institution_name || null,
  });

  if (accountResult.error || !accountResult.data?.id) {
    await deleteAssetById(assetResult.data.id);
    return {
      data: null,
      error: accountResult.error || new Error("Retirement account creation failed"),
    };
  }

  return {
    data: {
      asset: assetResult.data,
      retirementAccount: accountResult.data,
    },
    error: null,
  };
}
