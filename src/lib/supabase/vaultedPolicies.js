import { getSupabaseClient, isSupabaseConfigured } from "./client.js";
import {
  buildDocumentSourceHash,
  buildDocumentVersionLabel,
  uploadVaultedDocumentFile,
} from "./documentStorage.js";
import {
  buildPolicyComparisonSummary,
  buildVaultedPolicyComparisonRows,
} from "../domain/intelligenceEngine.js";

export const VAULTED_PARSER_VERSION = "v2";

export function buildInitialPersistenceStepResults(statementCount = 0) {
  return {
    policy: {
      attempted: false,
      succeeded: false,
      id: null,
      errorSummary: "",
    },
    baseline_upload: {
      attempted: false,
      succeeded: false,
      storagePath: null,
      errorSummary: "",
    },
    baseline_document: {
      attempted: false,
      succeeded: false,
      id: null,
      duplicateStatus: null,
      errorSummary: "",
    },
    baseline_snapshot: {
      attempted: false,
      succeeded: false,
      id: null,
      parserVersion: null,
      structuredDataPresent: false,
      compatibility: null,
      errorSummary: "",
    },
    statement_uploads: Array.from({ length: statementCount }, () => ({
      attempted: false,
      succeeded: false,
      fileName: null,
      storagePath: null,
      errorSummary: "",
    })),
    statement_documents: Array.from({ length: statementCount }, () => ({
      attempted: false,
      succeeded: false,
      fileName: null,
      id: null,
      duplicateStatus: null,
      errorSummary: "",
    })),
    statement_snapshots: Array.from({ length: statementCount }, () => ({
      attempted: false,
      succeeded: false,
      fileName: null,
      id: null,
      parserVersion: null,
      structuredDataPresent: false,
      compatibility: null,
      errorSummary: "",
    })),
    analytics: {
      attempted: false,
      succeeded: false,
      id: null,
      errorSummary: "",
    },
    statement_rows: {
      attempted: false,
      succeeded: false,
      count: 0,
      errorSummary: "",
    },
  };
}

export function parseCurrencyToNumber(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/\(?\$?\s*-?[\d,]+(?:\.\d{2})?\)?/);
  if (!match) return null;
  const raw = match[0].trim();
  const negative = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[,$()\s]/g, "");
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return null;
  return negative ? -parsed : parsed;
}

export function parsePercentToNumber(value) {
  if (!value || typeof value !== "string" || !/%/.test(value)) return null;
  const match = value.match(/-?[\d.]+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseDateToIso(value) {
  if (!value || typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function maskPolicyNumber(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  if (!cleaned) return null;
  if (cleaned.length <= 4) return cleaned;
  return `****${cleaned.slice(-4)}`;
}

function safeJson(value, fallback) {
  return value ?? fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function getCurrentVaultedPolicyScope() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { userId: null, mode: "guest_shared" };
  }

  const { data } = await supabase.auth.getUser();
  const userId = data?.user?.id || null;
  return {
    userId,
    mode: userId ? "authenticated_owned" : "guest_shared",
  };
}

async function resolveAuthenticatedVaultedPolicyWriteScope(scopeOverride = null) {
  const explicitScope = normalizeExplicitVaultedPolicyScope(scopeOverride);
  const sessionScope = await getCurrentVaultedPolicyScope();
  if (!sessionScope.userId) {
    return {
      ...buildBlockedVaultedPolicyScope("authenticated_write_scope_missing_user"),
      mode: "authenticated_owned",
    };
  }
  if (
    import.meta.env.DEV &&
    explicitScope?.userId &&
    explicitScope.userId !== sessionScope.userId
  ) {
    console.warn("[VaultedShield] explicit policy write scope did not match the active Supabase auth session. Using the live auth user.", {
      explicitUserId: explicitScope.userId,
      authSessionUserId: sessionScope.userId,
      scopeSource: explicitScope.source || "unknown",
    });
  }
  return {
    userId: sessionScope.userId,
    mode: "authenticated_owned",
    source: explicitScope?.source || "resolved_authenticated_write_session",
    blocked: false,
  };
}

function buildBlockedVaultedPolicyScope(source = "explicit_scope_blocked") {
  return {
    userId: null,
    mode: "blocked",
    source,
    blocked: true,
  };
}

export function normalizeExplicitVaultedPolicyScope(scopeOverride = null) {
  if (!scopeOverride) return null;
  if (typeof scopeOverride === "string") {
    if (!scopeOverride.trim()) {
      return buildBlockedVaultedPolicyScope("explicit_user_id_missing");
    }
    return {
      userId: scopeOverride || null,
      mode: scopeOverride ? "authenticated_owned" : "guest_shared",
      source: "explicit_user_id",
      blocked: false,
    };
  }
  if (typeof scopeOverride === "object") {
    const userId = scopeOverride.userId || null;
    const ownershipMode = scopeOverride.ownershipMode || null;
    const householdId = scopeOverride.householdId || null;
    const guestFallbackActive = Boolean(scopeOverride.guestFallbackActive);
    const source = scopeOverride.source || "explicit_scope";
    const explicitAuthScope =
      ownershipMode === "authenticated_owned" ||
      Boolean(householdId) ||
      (!guestFallbackActive && ownershipMode !== "guest_shared");
    if (explicitAuthScope && !userId) {
      return buildBlockedVaultedPolicyScope(`${source}_missing_user`);
    }
    return {
      userId,
      mode: userId ? "authenticated_owned" : "guest_shared",
      source,
      blocked: false,
    };
  }
  return null;
}

async function resolveVaultedPolicyScope(scopeOverride = null) {
  const explicitScope = normalizeExplicitVaultedPolicyScope(scopeOverride);
  if (explicitScope) return explicitScope;
  const currentScope = await getCurrentVaultedPolicyScope();
  return {
    ...currentScope,
    blocked: false,
    source: "resolved_current_session",
  };
}

export function buildVaultedPolicyScopeFilter(userId) {
  return userId
    ? { column: "user_id", operator: "eq", value: userId }
    : { column: "user_id", operator: "is", value: null };
}

function scopeBlockedResult(scope, emptyValue) {
  if (!scope?.blocked) return null;
  if (import.meta.env.DEV) {
    console.warn("[VaultedShield] blocked vaulted policy query because account scope was unresolved", {
      scopeSource: scope?.source || "unknown",
    });
  }
  return { data: emptyValue, error: null };
}

function blockedVaultedWriteResult(scope) {
  if (!scope?.blocked) return null;
  if (import.meta.env.DEV) {
    console.warn("[VaultedShield] blocked vaulted policy write because account scope was unresolved", {
      scopeSource: scope?.source || "unknown",
    });
  }
  return {
    data: null,
    error: new Error("Vaulted policy writes are blocked until the authenticated account scope is fully resolved."),
  };
}

function warnUnexpectedVaultedPolicyRowScope(row, scope, context) {
  if (!import.meta.env.DEV || !row || scope?.blocked) return;
  const expectedUserId = scope?.userId || null;
  const actualUserId = row?.user_id || null;
  if (scope?.mode === "authenticated_owned" && !actualUserId) {
    console.warn("[VaultedShield] authenticated policy read returned a null-owned policy row", {
      context,
      expectedUserId,
      actualUserId,
      policyId: row?.id || row?.policy_id || null,
      scopeSource: scope?.source || "unknown",
    });
    return;
  }
  if (expectedUserId !== actualUserId) {
    console.warn("[VaultedShield] policy row user scope mismatch", {
      context,
      expectedUserId,
      actualUserId,
      policyId: row?.id || row?.policy_id || null,
      scopeSource: scope?.source || "unknown",
    });
  }
}

function warnInsertedVaultedPolicyOwnership(row, context) {
  if (!import.meta.env.DEV || !row) return;
  if (!row.user_id) {
    console.warn("[VaultedShield] inserted or updated policy row is missing user_id", {
      context,
      policyId: row.id || null,
      carrierKey: row.carrier_key || null,
      policyNumberMasked: row.policy_number_masked || null,
    });
  }
}

function isRecognizedQuality(value) {
  return value === "strong" || value === "moderate" || value === "weak" || value === "failed";
}

function hasStructuredPayloadContent(structuredData) {
  const structured = safeObject(structuredData);
  if (!Object.keys(structured).length) return false;

  if (Object.keys(safeObject(structured.extractionSummary)).length > 0) return true;
  if (safeArray(structured.pageTypes).length > 0) return true;
  if (safeArray(structured.tables).length > 0) return true;
  if (safeArray(structured.strategyRows).length > 0) return true;
  if (safeArray(structured.allStrategyRows).length > 0) return true;
  if (safeArray(structured.failedPages).length > 0) return true;

  const quality = safeObject(structured.quality);
  return Object.values(quality).some((value) => isRecognizedQuality(value));
}

function isSnapshotStructuredColumnError(error) {
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return (
    message.includes("parser_version") ||
    message.includes("parser_structured_data") ||
    message.includes("column") && (message.includes("does not exist") || message.includes("schema cache"))
  );
}

function sortByCreatedAtDesc(rows = []) {
  return [...rows].sort((a, b) => {
    const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

function sortByStatementDateAsc(rows = []) {
  return [...rows].sort((a, b) => {
    const aDate = a?.statement_date || "";
    const bDate = b?.statement_date || "";
    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate.localeCompare(bDate);
  });
}

function limitArray(values, limit) {
  return safeArray(values).slice(0, limit);
}

function sanitizePrimitiveRecord(record, keys) {
  const source = safeObject(record);
  return keys.reduce((accumulator, key) => {
    const value = source[key];
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      if (value !== undefined) {
        accumulator[key] = value;
      }
    }
    return accumulator;
  }, {});
}

function sanitizeExtractionSummary(summary) {
  return sanitizePrimitiveRecord(summary, [
    "document_type",
    "carrier_key",
    "page_count",
    "typed_page_count",
    "typed_pages",
    "table_count",
    "ledger_row_count",
    "statement_value_count",
    "strategy_row_count",
    "failed_page_count",
  ]);
}

function sanitizePageType(page) {
  return sanitizePrimitiveRecord(page, [
    "page_number",
    "page_type",
    "confidence",
    "matched_signals",
  ]);
}

function sanitizeTableRow(row) {
  return sanitizePrimitiveRecord(row, [
    "key",
    "label",
    "charge_type",
    "year",
    "policy_year",
    "premium",
    "account_value",
    "accumulation_value",
    "cash_value",
    "surrender_value",
    "cash_surrender_value",
    "death_benefit",
    "loan_balance",
    "charges",
    "cost_of_insurance",
    "admin_fee",
    "monthly_deduction",
    "expense_charge",
    "rider_charge",
    "strategy",
    "strategy_name",
    "allocation_percent",
    "cap_rate",
    "participation_rate",
    "crediting_rate",
    "spread",
    "indexed_account_value",
    "fixed_account_value",
    "active",
    "menu_only",
  ]);
}

function sanitizeTableEntry(entry) {
  const sanitized = sanitizePrimitiveRecord(entry, [
    "page_number",
    "page_type",
    "quality",
  ]);
  const qualityInputs = safeObject(entry?.quality_inputs);
  sanitized.quality_inputs = sanitizePrimitiveRecord(qualityInputs, [
    "header_match_quality",
    "row_count_quality",
    "numeric_alignment_quality",
    "repeated_headers_handled",
    "column_consistency",
    "percentage_consistency",
    "currency_consistency",
  ]);
  sanitized.rows = limitArray(entry?.rows, 75).map((row) => sanitizeTableRow(row));
  sanitized.failed_rows = limitArray(entry?.failed_rows, 25);
  return sanitized;
}

function sanitizeStrategyRow(row) {
  const sanitized = sanitizePrimitiveRecord(row, [
    "strategy",
    "strategy_name",
    "allocation_percent",
    "cap_rate",
    "participation_rate",
    "crediting_rate",
    "spread",
    "indexed_account_value",
    "fixed_account_value",
    "active",
    "menu_only",
    "row_kind",
    "source_page_number",
    "page_number",
    "confidence",
  ]);
  const provenance = safeObject(row?.provenance);
  if (Object.keys(provenance).length > 0) {
    sanitized.provenance = sanitizePrimitiveRecord(provenance, [
      "value",
      "label",
      "page",
      "document",
      "method",
      "confidence",
    ]);
    sanitized.provenance.candidates = limitArray(provenance.candidates, 5);
  }
  return sanitized;
}

export function buildStructuredQualitySummary(structuredData) {
  const tables = safeArray(structuredData?.tables);
  const strategyRows = safeArray(structuredData?.strategyRows);
  const pageTypes = safeArray(structuredData?.pageTypes);
  const qualityForType = (matcher) => {
    const matching = tables.filter((entry) => matcher(entry?.page_type));
    if (!matching.length) return null;
    if (matching.some((entry) => entry?.quality === "strong")) return "strong";
    if (matching.some((entry) => entry?.quality === "moderate")) return "moderate";
    if (matching.some((entry) => entry?.quality === "weak")) return "weak";
    return "failed";
  };

  const strategyQuality =
    qualityForType((pageType) => pageType === "allocation_table") ||
    (strategyRows.length >= 2 ? "moderate" : strategyRows.length === 1 ? "weak" : null);
  const statementQuality =
    qualityForType((pageType) => pageType === "statement_summary" || pageType === "charges_table") ||
    (pageTypes.some((entry) => entry?.page_type === "statement_summary") ? "moderate" : null);
  const ledgerQuality =
    qualityForType((pageType) => pageType === "illustration_ledger") ||
    (pageTypes.some((entry) => entry?.page_type === "illustration_ledger") ? "weak" : null);

  return {
    ledger: ledgerQuality,
    statement: statementQuality,
    strategy: strategyQuality,
  };
}

export function sanitizeParserStructuredData(structuredData) {
  if (!structuredData || typeof structuredData !== "object") {
    return null;
  }

  const pageTypes = limitArray(structuredData.pageTypes, 50).map((entry) => sanitizePageType(entry));
  const tables = limitArray(structuredData.tables, 12).map((entry) => sanitizeTableEntry(entry));
  const strategyRows = limitArray(structuredData.strategyRows, 30).map((entry) => sanitizeStrategyRow(entry));
  const allStrategyRows = limitArray(structuredData.allStrategyRows, 50).map((entry) => sanitizeStrategyRow(entry));
  const failedPages = limitArray(structuredData.failedPages, 30);

  return {
    version: VAULTED_PARSER_VERSION,
    extractionSummary: sanitizeExtractionSummary(structuredData.extractionSummary),
    pageTypes,
    tables,
    strategyRows,
    allStrategyRows,
    failedPages,
    quality: buildStructuredQualitySummary({
      pageTypes,
      tables,
      strategyRows,
    }),
  };
}

export function rehydrateStructuredParserData(snapshot) {
  const stored = safeObject(snapshot?.parser_structured_data);
  if (!Object.keys(stored).length) {
    return null;
  }

  const sanitized = sanitizeParserStructuredData(stored);
  if (!hasStructuredPayloadContent(sanitized)) {
    return null;
  }

  const quality =
    Object.keys(safeObject(sanitized?.quality)).length > 0
      ? sanitized.quality
      : buildStructuredQualitySummary({
          pageTypes: sanitized?.pageTypes,
          tables: sanitized?.tables,
          strategyRows: sanitized?.strategyRows,
        });

  return {
    version: stored.version || snapshot?.parser_version || VAULTED_PARSER_VERSION,
    extractionSummary: safeObject(sanitized?.extractionSummary),
    pageTypes: safeArray(sanitized?.pageTypes),
    tables: safeArray(sanitized?.tables),
    strategyRows: safeArray(sanitized?.strategyRows),
    allStrategyRows: safeArray(sanitized?.allStrategyRows),
    failedPages: safeArray(sanitized?.failedPages),
    quality,
  };
}

function formatIsoDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatCurrencyDisplay(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not found";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercentDisplay(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not found";
  return `${value}%`;
}

function capitalizeStatus(value) {
  if (!value) return "Limited";
  return value
    .split(/[_\s-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function makeFieldMeta(field, fallbackValue) {
  if (field && typeof field === "object") {
    return {
      value: field.display_value || fallbackValue || "Not found",
      raw_label: field.raw_label || field.matchedLabel || "",
      confidence: field.confidence || "medium",
      extraction_method: field.extraction_method || field.source || "persisted_snapshot",
      page_number: field.page_number || null,
      carrier_hint: field.carrier_hint || "",
      document_type: field.document_type || "",
      missing: field.missing || false,
      reason: field.reason || "",
    };
  }

  return {
    value: fallbackValue || "Not found",
    raw_label: "",
    confidence: fallbackValue ? "medium" : "low",
    extraction_method: "persisted_snapshot",
    page_number: null,
    carrier_hint: "",
    document_type: "",
    missing: !fallbackValue,
    reason: fallbackValue ? "" : "Persisted value not available",
  };
}

function latestStatementDate(rows = []) {
  const dated = safeArray(rows).map((row) => row?.statement_date).filter(Boolean).sort();
  return dated.at(-1) || null;
}

function buildDocumentStatus(documents = []) {
  const safeDocuments = safeArray(documents);
  const roles = [...new Set(safeDocuments.map((document) => document?.document_role).filter(Boolean))];
  const storedDocuments = safeDocuments.filter((document) => document?.storage_path).length;
  const duplicateDocuments = safeDocuments.filter(
    (document) =>
      document?.metadata?.duplicate_status === "duplicate_existing" ||
      document?.metadata?.duplicate_of
  ).length;

  return {
    totalDocuments: safeDocuments.length,
    storedDocuments,
    duplicateDocuments,
    documentRoles: roles,
    latestStatementDate: latestStatementDate(safeDocuments),
    storagePaths: safeDocuments.map((document) => document?.storage_path).filter(Boolean),
  };
}

function buildLegacyAnalyticsFromNormalized(normalizedAnalytics, normalizedPolicy) {
  const performanceSummary = normalizedAnalytics?.performance_summary || {};
  const chargeAttribution = normalizedAnalytics?.charge_attribution || {};
  const policyHealth = normalizedAnalytics?.policy_health_score || {};
  const totalCostOfInsurance = chargeAttribution.total_cost_of_insurance ?? null;
  const accumulationValue = normalizedPolicy?.values?.accumulation_value?.value ?? null;

  return {
    performance_summary: performanceSummary,
    growth_trend: {
      value: safeArray(normalizedAnalytics?.timeline).length >= 3,
    },
    charge_analysis: {
      total_cost_of_insurance: { value: totalCostOfInsurance },
      total_admin_fees: { value: chargeAttribution.total_admin_fees ?? null },
      total_monthly_deductions: { value: chargeAttribution.total_monthly_deductions ?? null },
      total_rider_charges: { value: chargeAttribution.total_rider_charges ?? null },
      total_expense_charges: { value: chargeAttribution.total_expense_charges ?? null },
      total_policy_charges: { value: chargeAttribution.lifetime_visible_charges ?? null },
      cost_of_insurance_ratio: {
        value:
          totalCostOfInsurance !== null && accumulationValue
            ? totalCostOfInsurance / accumulationValue
            : null,
      },
      charge_drag_ratio: {
        value: chargeAttribution.charge_drag_ratio ?? null,
      },
      coi_trend: {
        value: chargeAttribution.attribution_status === "trendable",
      },
    },
    policy_health_score: {
      value: {
        label: capitalizeStatus(policyHealth.status),
        value: policyHealth.score,
        factors: [
          `Funding visibility: ${capitalizeStatus(policyHealth?.factors?.funding?.status)}`,
          `Growth visibility: ${capitalizeStatus(policyHealth?.factors?.growth?.status)}`,
          `Charge visibility: ${capitalizeStatus(policyHealth?.factors?.charges?.status)}`,
          `Loan visibility: ${capitalizeStatus(policyHealth?.factors?.loans?.status)}`,
          `Data completeness: ${capitalizeStatus(policyHealth?.factors?.data_completeness?.status)}`,
        ],
      },
    },
  };
}

function buildIllustrationSummaryFromNormalized(normalizedPolicy) {
  const carrier = normalizedPolicy?.policy_identity?.carrier_name || "Not found";
  const productName = normalizedPolicy?.policy_identity?.product_name || "Not found";
  const policyType = normalizedPolicy?.policy_identity?.policy_type || "Not found";
  const policyNumber = normalizedPolicy?.policy_identity?.policy_number || "Not found";
  const issueDate = normalizedPolicy?.policy_identity?.issue_date || "Not found";
  const deathBenefitField = normalizedPolicy?.death_benefit?.death_benefit || normalizedPolicy?.death_benefit?.initial_face_amount || null;
  const premiumField = normalizedPolicy?.funding?.planned_premium || null;

  return {
    carrier,
    productName,
    policyType,
    policyNumber,
    issueDate,
    deathBenefit: deathBenefitField?.display_value || "Not found",
    periodicPremium: premiumField?.display_value || "Not found",
    paymentMode: "Not found",
    targetPremium: normalizedPolicy?.funding?.guideline_premium_limit?.display_value || "Not found",
    monthlyGuaranteePremium: "Not found",
    __meta: {
      carrier: makeFieldMeta({ display_value: carrier, confidence: carrier !== "Not found" ? "high" : "low" }, carrier),
      productName: makeFieldMeta({ display_value: productName, confidence: productName !== "Not found" ? "medium" : "low" }, productName),
      policyType: makeFieldMeta({ display_value: policyType, confidence: policyType !== "Not found" ? "medium" : "low" }, policyType),
      policyNumber: makeFieldMeta({ display_value: policyNumber, confidence: policyNumber !== "Not found" ? "high" : "low" }, policyNumber),
      issueDate: makeFieldMeta(normalizedPolicy?.policy_identity?.issue_date ? { display_value: issueDate, confidence: "high" } : null, issueDate),
      deathBenefit: makeFieldMeta(deathBenefitField, deathBenefitField?.display_value || "Not found"),
      periodicPremium: makeFieldMeta(premiumField, premiumField?.display_value || "Not found"),
    },
  };
}

function buildStatementSummary({ normalizedPolicy, extractionMeta, statementRow }) {
  const accumulationDisplay =
    extractionMeta?.accumulation_value?.display_value ||
    formatCurrencyDisplay(statementRow?.accumulation_value);
  const cashValueDisplay =
    extractionMeta?.cash_value?.display_value ||
    formatCurrencyDisplay(statementRow?.cash_value);
  const cashSurrenderDisplay =
    extractionMeta?.cash_surrender_value?.display_value ||
    formatCurrencyDisplay(statementRow?.cash_surrender_value);
  const loanDisplay =
    extractionMeta?.loan_balance?.display_value ||
    formatCurrencyDisplay(statementRow?.loan_balance);

  return {
    carrier: normalizedPolicy?.policy_identity?.carrier_name || "Not found",
    productName: normalizedPolicy?.policy_identity?.product_name || "Not found",
    policyType: normalizedPolicy?.policy_identity?.policy_type || "Not found",
    policyNumber: normalizedPolicy?.policy_identity?.policy_number || "Not found",
    statementDate: extractionMeta?.statement_date?.display_value || formatIsoDate(statementRow?.statement_date) || "Not found",
    deathBenefit:
      extractionMeta?.death_benefit?.display_value ||
      normalizedPolicy?.death_benefit?.current_death_benefit?.display_value ||
      "Not found",
    periodicPremium:
      extractionMeta?.premium_paid?.display_value ||
      normalizedPolicy?.funding?.planned_premium?.display_value ||
      "Not found",
    accumulationValue: accumulationDisplay,
    cashValue: cashValueDisplay,
    cashSurrenderValue: cashSurrenderDisplay,
    loanBalance: loanDisplay,
    totalPolicyCharges: formatCurrencyDisplay(
      [statementRow?.cost_of_insurance, statementRow?.admin_fee, statementRow?.monthly_deduction, statementRow?.expense_charge, statementRow?.rider_charge]
        .filter((value) => value !== null && value !== undefined)
        .reduce((sum, value) => sum + value, 0)
    ),
    __meta: {
      statementDate: makeFieldMeta(extractionMeta?.statement_date, extractionMeta?.statement_date?.display_value || formatIsoDate(statementRow?.statement_date)),
      accumulationValue: makeFieldMeta(extractionMeta?.accumulation_value, accumulationDisplay),
      cashValue: makeFieldMeta(extractionMeta?.cash_value, cashValueDisplay),
      cashSurrenderValue: makeFieldMeta(extractionMeta?.cash_surrender_value, cashSurrenderDisplay),
      loanBalance: makeFieldMeta(extractionMeta?.loan_balance, loanDisplay),
      costOfInsurance: makeFieldMeta(extractionMeta?.cost_of_insurance, formatCurrencyDisplay(statementRow?.cost_of_insurance)),
      expenseCharge: makeFieldMeta(extractionMeta?.expense_charge, formatCurrencyDisplay(statementRow?.expense_charge)),
      indexStrategy: makeFieldMeta(extractionMeta?.index_strategy, extractionMeta?.index_strategy?.display_value || statementRow?.current_index_strategy || "Not found"),
      allocationPercent: makeFieldMeta(extractionMeta?.allocation_percent, extractionMeta?.allocation_percent?.display_value || formatPercentDisplay(statementRow?.allocation_percent)),
      capRate: makeFieldMeta(extractionMeta?.cap_rate, extractionMeta?.cap_rate?.display_value || formatPercentDisplay(statementRow?.cap_rate)),
    },
  };
}

export function rehydrateVaultedPolicyBundle(bundle) {
  const policy = bundle?.policy || null;
  const documents = safeArray(bundle?.documents);
  const snapshots = safeArray(bundle?.snapshots);
  const analytics = safeArray(bundle?.analytics);
  const statements = sortByStatementDateAsc(safeArray(bundle?.statements));

  const baselineSnapshot =
    sortByCreatedAtDesc(snapshots.filter((snapshot) => snapshot?.snapshot_type === "baseline_illustration")).at(0) ||
    sortByCreatedAtDesc(snapshots.filter((snapshot) => snapshot?.snapshot_type === "merged_policy_view")).at(0) ||
    sortByCreatedAtDesc(snapshots).at(0) ||
    null;
  const statementSnapshots = sortByStatementDateAsc(
    snapshots.filter((snapshot) => snapshot?.snapshot_type === "annual_statement")
  );
  const latestStatementSnapshot = statementSnapshots.at(-1) || null;
  const latestSnapshot = latestStatementSnapshot || baselineSnapshot || null;
  const latestAnalytics =
    sortByCreatedAtDesc(
      analytics.filter((record) => record?.analytics_type === "current_policy_view")
    ).at(0) || sortByCreatedAtDesc(analytics).at(0) || null;

  const normalizedPolicy =
    latestSnapshot?.normalized_policy ||
    baselineSnapshot?.normalized_policy ||
    {};
  const normalizedAnalytics =
    latestAnalytics?.normalized_analytics ||
    {};
  const completenessAssessment =
    normalizedAnalytics?.completeness_assessment ||
    latestSnapshot?.completeness_assessment ||
    {};
  const carrierProfile =
    latestSnapshot?.carrier_profile ||
    baselineSnapshot?.carrier_profile ||
    {};
  const productProfile =
    latestSnapshot?.product_profile ||
    baselineSnapshot?.product_profile ||
    {};
  const strategyReferenceHits =
    latestSnapshot?.strategy_reference_hits ||
    baselineSnapshot?.strategy_reference_hits ||
    [];
  const latestStructuredData = rehydrateStructuredParserData(latestSnapshot);
  const baselineStructuredData = rehydrateStructuredParserData(baselineSnapshot);
  const documentStatus = buildDocumentStatus(documents);
  const comparisonSummary = buildPolicyComparisonSummary({
    policyId: policy?.id || null,
    normalizedPolicy,
    normalizedAnalytics,
  });

  const statementResults = statements.map((statementRow) => {
    const matchingSnapshot =
      statementSnapshots.find((snapshot) => snapshot?.statement_date === statementRow?.statement_date) ||
      statementSnapshots.find((snapshot) => snapshot?.id === statementRow?.snapshot_id) ||
      null;
    const matchingDocument =
      documents.find((document) => document?.id === matchingSnapshot?.document_id) ||
      documents.find(
        (document) =>
          document?.document_role === "annual_statement" &&
          document?.statement_date === statementRow?.statement_date
      ) ||
      null;
    const extractionMeta = matchingSnapshot?.extraction_meta || statementRow?.raw_statement_payload?.fields || {};
    const structuredData = rehydrateStructuredParserData(matchingSnapshot);
    const hasStructuredData = hasStructuredPayloadContent(structuredData);
    const summary = buildStatementSummary({
      normalizedPolicy: matchingSnapshot?.normalized_policy || normalizedPolicy,
      extractionMeta,
      statementRow,
    });

    return {
      fileName: matchingDocument?.file_name || statementRow?.statement_date || "Saved statement",
      text: matchingDocument?.raw_text_excerpt || "",
      summary,
      pages: [],
      documentType: {
        document_type: matchingDocument?.document_type || "annual_statement",
        confidence: matchingDocument?.classification_confidence || "medium",
      },
      carrierDetection: {
        carrier_name:
          matchingDocument?.carrier_name ||
          carrierProfile?.display_name ||
          normalizedPolicy?.policy_identity?.carrier_name ||
          "",
        confidence: matchingDocument?.classification_confidence || normalizedPolicy?.extraction_meta?.carrier_confidence || "medium",
      },
      fields: extractionMeta,
      structuredData,
      parserState: {
        parserVersion: matchingSnapshot?.parser_version || null,
        structuredDataPresent: hasStructuredData,
        structuredQualitySummary: structuredData?.quality || null,
        fallbackUsed: !hasStructuredData,
      },
    };
  });

  const analyticsCompat = buildLegacyAnalyticsFromNormalized(normalizedAnalytics, normalizedPolicy);
  const illustrationSummary = buildIllustrationSummaryFromNormalized(normalizedPolicy);
  const baselineFields = {
    carrier_name: normalizedPolicy?.policy_identity?.carrier_name
      ? { display_value: normalizedPolicy.policy_identity.carrier_name, confidence: "high" }
      : null,
    product_name: normalizedPolicy?.policy_identity?.product_name
      ? { display_value: normalizedPolicy.policy_identity.product_name, confidence: "medium" }
      : null,
    policy_type: normalizedPolicy?.policy_identity?.policy_type
      ? { display_value: normalizedPolicy.policy_identity.policy_type, confidence: "medium" }
      : null,
    policy_number: normalizedPolicy?.policy_identity?.policy_number
      ? { display_value: normalizedPolicy.policy_identity.policy_number, confidence: "high" }
      : null,
    issue_date: normalizedPolicy?.policy_identity?.issue_date
      ? { display_value: normalizedPolicy.policy_identity.issue_date, confidence: "high" }
      : null,
    death_benefit: normalizedPolicy?.death_benefit?.death_benefit || null,
    initial_face_amount: normalizedPolicy?.death_benefit?.initial_face_amount || null,
    option_type: normalizedPolicy?.death_benefit?.option_type
      ? { display_value: normalizedPolicy.death_benefit.option_type, confidence: "medium" }
      : null,
    planned_premium: normalizedPolicy?.funding?.planned_premium || null,
    minimum_premium: normalizedPolicy?.funding?.minimum_premium || null,
    guideline_premium_limit: normalizedPolicy?.funding?.guideline_premium_limit || null,
  };
  const baselineDocument =
    documents.find((document) => document?.id === baselineSnapshot?.document_id) ||
    documents.find((document) => document?.document_role === "illustration") ||
    null;

  return {
    illustrationText: baselineDocument?.raw_text_excerpt || "",
    illustrationSummary,
    baseline_illustration: {
      fileName: baselineDocument?.file_name || "Saved illustration",
      text: baselineDocument?.raw_text_excerpt || "",
      pages: [],
      summary: illustrationSummary,
      fields: baselineFields,
      documentType: {
        document_type: baselineDocument?.document_type || baselineSnapshot?.snapshot_type || "illustration",
        confidence: baselineDocument?.classification_confidence || "medium",
      },
      carrierDetection: {
        carrier_name:
          baselineDocument?.carrier_name ||
          carrierProfile?.display_name ||
          normalizedPolicy?.policy_identity?.carrier_name ||
          "",
        confidence: normalizedPolicy?.extraction_meta?.carrier_confidence || "medium",
      },
      structuredData: baselineStructuredData,
      parserState: {
        parserVersion: baselineSnapshot?.parser_version || null,
        structuredDataPresent: hasStructuredPayloadContent(baselineStructuredData),
        structuredQualitySummary: baselineStructuredData?.quality || null,
        fallbackUsed: !hasStructuredPayloadContent(baselineStructuredData),
      },
    },
    statementResults,
    statement_history: statementResults,
    analytics: analyticsCompat,
    vaultAiInterpretation: [
      normalizedAnalytics?.presentation_values?.confirmed_summary,
      normalizedAnalytics?.presentation_values?.limitations_summary,
    ].filter(Boolean),
    vaultAiStatus: {
      limitations: completenessAssessment?.analysis_limitations || [],
    },
    cashValueGrowthExplanation: normalizedAnalytics?.growth_attribution?.explanation
      ? [normalizedAnalytics.growth_attribution.explanation]
      : [],
    chargeAnalysisExplanation: normalizedAnalytics?.charge_attribution?.explanation
      ? [normalizedAnalytics.charge_attribution.explanation]
      : [],
    strategyReviewNote:
      normalizedAnalytics?.presentation_values?.limitations_summary ||
      "Strategy visibility will improve as additional persisted allocation detail becomes available.",
    vaultAiPolicyExplanation: [
      normalizedAnalytics?.presentation_values?.confirmed_summary,
      normalizedAnalytics?.presentation_values?.limitations_summary,
    ].filter(Boolean),
    policyRecord: normalizedPolicy,
    normalizedPolicy,
    normalizedAnalytics,
    comparisonSummary,
    completenessAssessment,
    carrierProfile,
    productProfile,
    strategyReferenceHits,
    savedDocuments: documents,
    documentStatus,
    persistenceStatus: {
      attempted: true,
      configured: true,
      succeeded: true,
      mode: "supabase_loaded",
      policyId: policy?.id || null,
      documentCount: documents.length,
      snapshotCount: snapshots.length,
      statementRowCount: statements.length,
      errorSummary: "",
      storageConfigured: true,
      fileUploadAttempted: false,
      uploadedFileCount: documentStatus.storedDocuments,
      uploadedStoragePaths: documentStatus.storagePaths,
      duplicateDetections: documents
        .filter((document) => document?.metadata?.duplicate_status)
        .map((document) => ({
          fileName: document.file_name,
          duplicateStatus: document.metadata?.duplicate_status,
          sourceHash: document.source_hash,
        })),
    },
    readbackStatus: {
      mode: "supabase_loaded",
      policyId: policy?.id || null,
      documentCount: documents.length,
      snapshotCount: snapshots.length,
      statementCount: statements.length,
      analyticsId: latestAnalytics?.id || null,
      latestStatementDate: latestStatementDate(statements),
      lastSavedAt: policy?.updated_at || policy?.created_at || null,
      errorSummary: "",
      storageConfigured: true,
      storedDocumentCount: documentStatus.storedDocuments,
      storagePaths: documentStatus.storagePaths,
      parserVersion: latestSnapshot?.parser_version || baselineSnapshot?.parser_version || null,
      structuredDataPresent:
        hasStructuredPayloadContent(latestStructuredData) ||
        hasStructuredPayloadContent(baselineStructuredData) ||
        statementResults.some((statement) => statement?.parserState?.structuredDataPresent),
      structuredQualitySummary:
        latestStructuredData?.quality ||
        baselineStructuredData?.quality ||
        null,
      fallbackUsed:
        !(
          hasStructuredPayloadContent(latestStructuredData) ||
          hasStructuredPayloadContent(baselineStructuredData) ||
          statementResults.some((statement) => statement?.parserState?.structuredDataPresent)
        ),
    },
  };
}

export async function compareVaultedPolicies(policyIds = [], scopeOverride = null) {
  const uniqueIds = [...new Set((Array.isArray(policyIds) ? policyIds : []).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {
      data: {
        policy_summaries: [],
        comparison_rows: [],
      },
      error: null,
    };
  }

  const scope = await resolveVaultedPolicyScope(scopeOverride);
  const blocked = scopeBlockedResult(scope, {
    policy_summaries: [],
    comparison_rows: [],
  });
  if (blocked) return blocked;

  const bundleResults = await Promise.all(uniqueIds.map((policyId) => getVaultedPolicyBundle(policyId, scope)));
  const error = bundleResults.find((result) => result?.error)?.error || null;
  if (error) {
    return { data: null, error };
  }

  const policySummaries = bundleResults
    .map((result) => rehydrateVaultedPolicyBundle(result.data))
    .map((rehydrated) => rehydrated.comparisonSummary)
    .filter(Boolean);

  return {
    data: {
      policy_summaries: policySummaries,
      comparison_rows: buildVaultedPolicyComparisonRows(policySummaries),
    },
    error: null,
  };
}

async function insertRecord(table, payload) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: new Error("Supabase not configured") };
  }

  const { data, error } = await supabase.from(table).insert(payload).select().single();
  return { data, error };
}

async function insertSnapshotRecord(payload) {
  const firstAttempt = await insertRecord("vaulted_policy_snapshots", payload);
  if (!firstAttempt.error || !isSnapshotStructuredColumnError(firstAttempt.error)) {
    return {
      ...firstAttempt,
      compatibility: {
        structuredColumnsPersisted: !firstAttempt.error,
        fallbackWithoutStructuredColumns: false,
      },
    };
  }

  const { parser_version, parser_structured_data, ...legacyPayload } = payload;
  const retryAttempt = await insertRecord("vaulted_policy_snapshots", legacyPayload);
  return {
    ...retryAttempt,
    compatibility: {
      structuredColumnsPersisted: false,
      fallbackWithoutStructuredColumns: !retryAttempt.error,
      fallbackReason: String(firstAttempt.error?.message || firstAttempt.error?.details || ""),
    },
  };
}

async function updateRecord(table, id, payload) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: new Error("Supabase not configured") };
  }

  const { data, error } = await supabase
    .from(table)
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  return { data, error };
}

export function isMissingUpsertConstraintError(error) {
  const message = String(error?.message || error?.details || "");
  return (
    message.includes("there is no unique or exclusion constraint matching the ON CONFLICT specification") ||
    message.includes("no unique or exclusion constraint matching the ON CONFLICT specification")
  );
}

export function isRowLevelSecurityError(error) {
  const message = String(error?.message || error?.details || "");
  return (
    message.includes("row-level security policy") ||
    message.includes("violates row-level security policy")
  );
}

async function findVaultedPolicyByIdentity({ policyNumber, carrierKey, scopeOverride = null }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: new Error("Supabase not configured") };
  }
  if (!policyNumber || !carrierKey) {
    return { data: null, error: null };
  }

  const scope = await resolveVaultedPolicyScope(scopeOverride);
  const blockedWrite = blockedVaultedWriteResult(scope);
  if (blockedWrite) return blockedWrite;
  const { data, error } = await supabase
    .from("vaulted_policies")
    .select("*")
    .eq("policy_number", policyNumber)
    .eq("carrier_key", carrierKey)
    [scope.userId ? "eq" : "is"]("user_id", scope.userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data: data || null, error };
}

export async function upsertVaultedPolicyFromAnalysis({
  normalizedPolicy,
  carrierProfile,
  productProfile,
  scopeOverride = null,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: new Error("Supabase not configured") };
  }

  const scope = await resolveAuthenticatedVaultedPolicyWriteScope(scopeOverride);
  const blockedWrite = blockedVaultedWriteResult(scope);
  if (blockedWrite) return blockedWrite;
  const payload = {
    user_id: scope.userId,
    policy_number: normalizedPolicy?.policy_identity?.policy_number || null,
    policy_number_masked: maskPolicyNumber(normalizedPolicy?.policy_identity?.policy_number),
    carrier_name: normalizedPolicy?.policy_identity?.carrier_name || null,
    carrier_key: carrierProfile?.key || null,
    product_name: normalizedPolicy?.policy_identity?.product_name || null,
    product_key: productProfile?.key || null,
    policy_type: normalizedPolicy?.policy_identity?.policy_type || null,
    issue_date: parseDateToIso(normalizedPolicy?.policy_identity?.issue_date),
    insured_name: normalizedPolicy?.policy_identity?.insured_name || null,
    owner_name: normalizedPolicy?.policy_identity?.owner_name || null,
    source_status: "active",
  };

  if (payload.policy_number && payload.carrier_key) {
    const { data, error } = await supabase
      .from("vaulted_policies")
      .upsert(payload, { onConflict: "user_id,policy_number,carrier_key" })
      .select()
      .single();

    warnInsertedVaultedPolicyOwnership(data, "upsertVaultedPolicyFromAnalysis");
    if (!error || !isMissingUpsertConstraintError(error)) {
      return { data, error };
    }

    const existingResult = await findVaultedPolicyByIdentity({
      policyNumber: payload.policy_number,
      carrierKey: payload.carrier_key,
      scopeOverride,
    });
    if (existingResult.error) {
      return { data: null, error: existingResult.error };
    }

    if (existingResult.data?.id) {
      const updateResult = await updateRecord("vaulted_policies", existingResult.data.id, payload);
      warnInsertedVaultedPolicyOwnership(updateResult.data, "upsertVaultedPolicyFromAnalysis:updateFallback");
      return updateResult;
    }

    const insertResult = await insertRecord("vaulted_policies", payload);
    warnInsertedVaultedPolicyOwnership(insertResult.data, "upsertVaultedPolicyFromAnalysis:insertFallback");
    return insertResult;
  }

  const insertResult = await insertRecord("vaulted_policies", payload);
  warnInsertedVaultedPolicyOwnership(insertResult.data, "upsertVaultedPolicyFromAnalysis:insertUnkeyed");
  return insertResult;
}

async function ensureWritableVaultedPolicy(policyId, scopeOverride = null) {
  const writeScope = await resolveAuthenticatedVaultedPolicyWriteScope(scopeOverride);
  const blockedWrite = blockedVaultedWriteResult(writeScope);
  if (blockedWrite) return blockedWrite;
  return ensureAccessibleVaultedPolicy(policyId, writeScope);
}

export async function createVaultedDocumentRecord({
  policyId,
  documentRole,
  documentType,
  fileName,
  fileSize,
  statementDate,
  pageCount,
  carrierName,
  carrierKey,
  classificationConfidence,
  rawTextExcerpt,
  mimeType,
  sourceHash,
  storageBucket,
  storagePath,
  uploadStatus,
  versionLabel,
  parentDocumentId,
  metadata = {},
}) {
  return insertRecord("vaulted_policy_documents", {
    policy_id: policyId,
    document_role: documentRole,
    document_type: documentType,
    file_name: fileName,
    file_size: fileSize ?? null,
    statement_date: parseDateToIso(statementDate),
    page_count: pageCount ?? null,
    carrier_name: carrierName ?? null,
    carrier_key: carrierKey ?? null,
    classification_confidence: classificationConfidence ?? null,
    classification_score: null,
    raw_text_excerpt: rawTextExcerpt ?? null,
    source_hash: sourceHash ?? null,
    storage_bucket: storageBucket ?? null,
    storage_path: storagePath ?? null,
    mime_type: mimeType ?? null,
    upload_status: uploadStatus ?? null,
    version_label: versionLabel ?? null,
    parent_document_id: parentDocumentId ?? null,
    metadata: safeJson(metadata, {}),
  });
}

export async function findVaultedDocumentByHash({ policyId, sourceHash }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: new Error("Supabase not configured") };
  }

  if (!policyId || !sourceHash) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from("vaulted_policy_documents")
    .select("*")
    .eq("policy_id", policyId)
    .eq("source_hash", sourceHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

export async function findLatestVaultedDocumentVersion({
  policyId,
  documentRole,
  statementDate,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: [], error: new Error("Supabase not configured") };
  }

  let query = supabase
    .from("vaulted_policy_documents")
    .select("*")
    .eq("policy_id", policyId)
    .eq("document_role", documentRole)
    .order("created_at", { ascending: false });

  if (statementDate) {
    query = query.eq("statement_date", parseDateToIso(statementDate));
  }

  const { data, error } = await query;
  return { data: safeArray(data), error };
}

export async function createVaultedSnapshot({
  policyId,
  documentId,
  snapshotType,
  statementDate,
  normalizedPolicy,
  extractionMeta,
  completenessAssessment,
  carrierProfile,
  productProfile,
  strategyReferenceHits,
  parserVersion,
  parserStructuredData,
  scopeOverride = null,
}) {
  const accessResult = await ensureWritableVaultedPolicy(policyId, scopeOverride);
  if (accessResult.error) {
    return { data: null, error: accessResult.error };
  }
  return insertSnapshotRecord(buildVaultedSnapshotPayload({
    policy_id: policyId,
    document_id: documentId ?? null,
    snapshot_type: snapshotType,
    statement_date: parseDateToIso(statementDate),
    normalized_policy: safeJson(normalizedPolicy, {}),
    extraction_meta: safeJson(extractionMeta, {}),
    completeness_assessment: safeJson(completenessAssessment, {}),
    carrier_profile: safeJson(carrierProfile, {}),
    product_profile: safeJson(productProfile, {}),
    strategy_reference_hits: safeJson(strategyReferenceHits, []),
    parser_version: parserVersion ?? null,
    parser_structured_data: safeJson(parserStructuredData, null),
  }));
}

export function buildVaultedSnapshotPayload(payload) {
  return {
    ...payload,
  };
}

export async function createVaultedAnalytics({
  policyId,
  snapshotId,
  analyticsType,
  normalizedAnalytics,
  healthScore,
  healthStatus,
  coverageStatus,
  reviewFlags,
  scopeOverride = null,
}) {
  const accessResult = await ensureWritableVaultedPolicy(policyId, scopeOverride);
  if (accessResult.error) {
    return { data: null, error: accessResult.error };
  }
  return insertRecord("vaulted_policy_analytics", {
    policy_id: policyId,
    snapshot_id: snapshotId ?? null,
    analytics_type: analyticsType,
    normalized_analytics: safeJson(normalizedAnalytics, {}),
    health_score: healthScore ?? null,
    health_status: healthStatus ?? null,
    coverage_status: coverageStatus ?? null,
    review_flags: safeJson(reviewFlags, []),
  });
}

export async function upsertVaultedStatementRows({
  policyId,
  snapshotId,
  statements = [],
  scopeOverride = null,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: new Error("Supabase not configured") };
  }

  if (!statements.length) {
    return { data: [], error: null };
  }

  const accessResult = await ensureWritableVaultedPolicy(policyId, scopeOverride);
  if (accessResult.error) {
    return { data: null, error: accessResult.error };
  }

  const payload = statements.map((statement) => ({
    policy_id: policyId,
    snapshot_id: snapshotId ?? null,
    statement_date: parseDateToIso(statement?.policy_timing?.statement_date || statement?.statement_date),
    policy_year: statement?.policy_timing?.policy_year ?? statement?.policy_year ?? null,
    accumulation_value: parseCurrencyToNumber(statement?.values?.accumulation_value?.display_value || statement?.accumulation_value),
    cash_value: parseCurrencyToNumber(statement?.values?.cash_value?.display_value || statement?.cash_value),
    cash_surrender_value: parseCurrencyToNumber(statement?.values?.cash_surrender_value?.display_value || statement?.cash_surrender_value),
    loan_balance: parseCurrencyToNumber(statement?.loans?.loan_balance?.display_value || statement?.loan_balance),
    cost_of_insurance: parseCurrencyToNumber(statement?.charges?.cost_of_insurance?.display_value || statement?.cost_of_insurance),
    admin_fee: parseCurrencyToNumber(statement?.charges?.admin_fee?.display_value || statement?.admin_fee),
    monthly_deduction: parseCurrencyToNumber(statement?.charges?.monthly_deduction?.display_value || statement?.monthly_deduction),
    expense_charge: parseCurrencyToNumber(statement?.charges?.expense_charge?.display_value || statement?.expense_charge),
    rider_charge: parseCurrencyToNumber(statement?.riders?.rider_charge?.display_value || statement?.rider_charge),
    current_index_strategy: statement?.strategy?.current_index_strategy || statement?.current_index_strategy || null,
    allocation_percent: parsePercentToNumber(statement?.strategy?.allocation_percent?.display_value || statement?.allocation_percent),
    cap_rate: parsePercentToNumber(statement?.strategy?.cap_rate?.display_value || statement?.cap_rate),
    participation_rate: parsePercentToNumber(statement?.strategy?.participation_rate?.display_value || statement?.participation_rate),
    crediting_rate: parsePercentToNumber(statement?.strategy?.crediting_rate?.display_value || statement?.crediting_rate),
    spread: parsePercentToNumber(statement?.strategy?.spread?.display_value || statement?.spread),
    indexed_account_value: parseCurrencyToNumber(statement?.values?.indexed_account_value?.display_value || statement?.indexed_account_value),
    fixed_account_value: parseCurrencyToNumber(statement?.values?.fixed_account_value?.display_value || statement?.fixed_account_value),
    raw_statement_payload: safeJson(statement, {}),
  }));

  const { data, error } = await supabase.from("vaulted_policy_statements").insert(payload).select();
  return { data, error };
}

export async function getVaultedPolicyWithHistory(policyId, scopeOverride = null) {
  return getVaultedPolicyBundle(policyId, scopeOverride);
}

export async function listVaultedPolicies(scopeOverride = null) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: [], error: new Error("Supabase not configured") };
  }

  const scope = await resolveVaultedPolicyScope(scopeOverride);
  const blocked = scopeBlockedResult(scope, []);
  if (blocked) return blocked;
  let query = supabase.from("vaulted_policies").select(`
      *,
      vaulted_policy_statements (statement_date),
      vaulted_policy_analytics (id, created_at)
    `)
    .order("updated_at", { ascending: false });

  query = scope.userId ? query.eq("user_id", scope.userId) : query.is("user_id", null);

  const { data, error } = await query;
  safeArray(data).forEach((row) => warnUnexpectedVaultedPolicyRowScope(row, scope, "listVaultedPolicies"));

  return {
    data: safeArray(data).map((row) => ({
      ...row,
      latest_statement_date: latestStatementDate(row.vaulted_policy_statements),
      last_saved_at: row.updated_at || row.created_at,
    })),
    error,
  };
}

export async function getVaultedPolicyById(policyId, scopeOverride = null) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: null, error: new Error("Supabase not configured") };
  }

  const scope = await resolveVaultedPolicyScope(scopeOverride);
  const blocked = scopeBlockedResult(scope, null);
  if (blocked) return blocked;
  let query = supabase.from("vaulted_policies").select("*").eq("id", policyId);
  query = scope.userId ? query.eq("user_id", scope.userId) : query.is("user_id", null);
  const { data, error } = await query.single();
  warnUnexpectedVaultedPolicyRowScope(data, scope, "getVaultedPolicyById");

  return { data, error };
}

async function ensureAccessibleVaultedPolicy(policyId, scopeOverride = null) {
  const policyResult = await getVaultedPolicyById(policyId, scopeOverride);
  if (policyResult.error || !policyResult.data?.id) {
    return {
      data: null,
      error: policyResult.error || new Error("Vaulted policy is not available in the current account scope."),
    };
  }
  return policyResult;
}

export async function getVaultedPolicyDocuments(policyId, scopeOverride = null) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: [], error: new Error("Supabase not configured") };
  }

  const accessResult = await ensureAccessibleVaultedPolicy(policyId, scopeOverride);
  if (accessResult.error) {
    return { data: [], error: accessResult.error };
  }

  const { data, error } = await supabase
    .from("vaulted_policy_documents")
    .select("*")
    .eq("policy_id", policyId)
    .order("created_at", { ascending: false });

  return { data: safeArray(data), error };
}

export async function getVaultedPolicySnapshots(policyId, scopeOverride = null) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: [], error: new Error("Supabase not configured") };
  }

  const accessResult = await ensureAccessibleVaultedPolicy(policyId, scopeOverride);
  if (accessResult.error) {
    return { data: [], error: accessResult.error };
  }

  const { data, error } = await supabase
    .from("vaulted_policy_snapshots")
    .select("*")
    .eq("policy_id", policyId)
    .order("created_at", { ascending: false });

  return { data: safeArray(data), error };
}

export async function getVaultedPolicyAnalytics(policyId, scopeOverride = null) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: [], error: new Error("Supabase not configured") };
  }

  const accessResult = await ensureAccessibleVaultedPolicy(policyId, scopeOverride);
  if (accessResult.error) {
    return { data: [], error: accessResult.error };
  }

  const { data, error } = await supabase
    .from("vaulted_policy_analytics")
    .select("*")
    .eq("policy_id", policyId)
    .order("created_at", { ascending: false });

  return { data: safeArray(data), error };
}

export async function getVaultedPolicyStatements(policyId, scopeOverride = null) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { data: [], error: new Error("Supabase not configured") };
  }

  const accessResult = await ensureAccessibleVaultedPolicy(policyId, scopeOverride);
  if (accessResult.error) {
    return { data: [], error: accessResult.error };
  }

  const { data, error } = await supabase
    .from("vaulted_policy_statements")
    .select("*")
    .eq("policy_id", policyId)
    .order("statement_date", { ascending: true, nullsFirst: false });

  return { data: safeArray(data), error };
}

export async function getVaultedPolicyBundle(policyId, scopeOverride = null) {
  const policyResult = await getVaultedPolicyById(policyId, scopeOverride);
  if (policyResult.error || !policyResult.data?.id) {
    return {
      data: null,
      error: policyResult.error || new Error("Vaulted policy is not available in the current account scope."),
    };
  }

  const [documentsResult, snapshotsResult, analyticsResult, statementsResult] =
    await Promise.all([
      getVaultedPolicyDocuments(policyId, scopeOverride),
      getVaultedPolicySnapshots(policyId, scopeOverride),
      getVaultedPolicyAnalytics(policyId, scopeOverride),
      getVaultedPolicyStatements(policyId, scopeOverride),
    ]);

  const error =
    policyResult.error ||
    documentsResult.error ||
    snapshotsResult.error ||
    analyticsResult.error ||
    statementsResult.error ||
    null;

  return {
    data: error
      ? null
      : {
          policy: policyResult.data,
          documents: documentsResult.data,
          snapshots: snapshotsResult.data,
          analytics: analyticsResult.data,
          statements: statementsResult.data,
        },
    error,
  };
}

async function createOrReuseVaultedDocument({
  policyId,
  documentRole,
  documentType,
  file,
  fileName,
  fileSize,
  statementDate,
  pageCount,
  carrierName,
  carrierKey,
  classificationConfidence,
  rawTextExcerpt,
  metadata = {},
  scopeOverride = null,
}) {
  const accessResult = await ensureWritableVaultedPolicy(policyId, scopeOverride);
  if (accessResult.error) {
    return { data: null, error: accessResult.error };
  }
  const sourceHash = file ? await buildDocumentSourceHash(file) : null;
  const existingByHash = sourceHash
    ? await findVaultedDocumentByHash({ policyId, sourceHash })
    : { data: null, error: null };

  if (existingByHash.error) {
    return { data: null, error: existingByHash.error };
  }

  if (existingByHash.data?.id) {
    const existingDocument = existingByHash.data;
    const updatedMetadata = {
      ...(existingDocument.metadata || {}),
      ...metadata,
      duplicate_status: "duplicate_existing",
    };

    const updatePayload = {};
    if (!existingDocument.raw_text_excerpt && rawTextExcerpt) {
      updatePayload.raw_text_excerpt = rawTextExcerpt;
    }
    if (!existingDocument.storage_bucket && metadata.storage_bucket) {
      updatePayload.storage_bucket = metadata.storage_bucket;
    }
    if (!existingDocument.storage_path && metadata.storage_path) {
      updatePayload.storage_path = metadata.storage_path;
    }
    if (!existingDocument.upload_status && metadata.upload_status) {
      updatePayload.upload_status = metadata.upload_status;
    }
    if (Object.keys(updatePayload).length > 0 || updatedMetadata !== existingDocument.metadata) {
      updatePayload.metadata = updatedMetadata;
      const updateResult = await updateRecord("vaulted_policy_documents", existingDocument.id, updatePayload);
      if (updateResult.error) {
        return { data: null, error: updateResult.error };
      }
      return {
        data: updateResult.data,
        error: null,
        duplicateStatus: "duplicate_existing",
        sourceHash,
      };
    }

    return {
      data: existingDocument,
      error: null,
      duplicateStatus: "duplicate_existing",
      sourceHash,
    };
  }

  const versionCandidates = await findLatestVaultedDocumentVersion({
    policyId,
    documentRole,
    statementDate,
  });

  if (versionCandidates.error) {
    return { data: null, error: versionCandidates.error };
  }

  const versionLabel = buildDocumentVersionLabel({
    documentRole,
    statementDate: parseDateToIso(statementDate) || "undated",
    existingVersionCount: versionCandidates.data.length,
  });
  const parentDocumentId = versionCandidates.data[0]?.id || null;

  const createResult = await createVaultedDocumentRecord({
    policyId,
    documentRole,
    documentType,
    fileName,
    fileSize,
    statementDate,
    pageCount,
    carrierName,
    carrierKey,
    classificationConfidence,
    rawTextExcerpt,
    mimeType: file?.type || "application/pdf",
    sourceHash,
    storageBucket: metadata.storage_bucket ?? null,
    storagePath: metadata.storage_path ?? null,
    uploadStatus: metadata.upload_status ?? null,
    versionLabel,
    parentDocumentId,
    metadata: {
      ...metadata,
      duplicate_status: versionCandidates.data.length > 0 ? "new_version" : "unique",
    },
  });

  return {
    ...createResult,
    duplicateStatus: versionCandidates.data.length > 0 ? "new_version" : "unique",
    sourceHash,
  };
}

export async function persistVaultedPolicyAnalysis({
  normalizedPolicy,
  normalizedAnalytics,
  completenessAssessment,
  carrierProfile,
  productProfile,
  strategyReferenceHits,
  baseline,
  statements,
  illustrationFile,
  statementFiles,
  scopeOverride = null,
}) {
  const status = {
    attempted: false,
    configured: isSupabaseConfigured(),
    succeeded: false,
    mode: "local_only",
    policyId: null,
    documentCount: 0,
    snapshotCount: 0,
    statementRowCount: 0,
    errorSummary: "",
    storageConfigured: isSupabaseConfigured(),
    fileUploadAttempted: false,
    uploadedFileCount: 0,
    uploadedStoragePaths: [],
    duplicateDetections: [],
    partialPolicyCreated: false,
    lastCompletedStep: null,
    failedStep: null,
    stepResults: buildInitialPersistenceStepResults(safeArray(statements).length),
  };

  if (!status.configured) {
    status.errorSummary = "Supabase env vars are not configured.";
    return status;
  }

  status.attempted = true;

  try {
    if (import.meta.env.DEV) {
      console.info("[VaultedShield] persistVaultedPolicyAnalysis called", {
        hasBaseline: Boolean(baseline),
        statementCount: safeArray(statements).length,
        baselineStructuredDataPresent: hasStructuredPayloadContent(baseline?.structuredData),
        statementStructuredDataCount: safeArray(statements).filter((statement) => hasStructuredPayloadContent(statement?.structuredData)).length,
      });
      if (scopeOverride && !scopeOverride.userId && scopeOverride.ownershipMode === "authenticated_owned") {
        console.warn("[VaultedShield] persistVaultedPolicyAnalysis received unresolved authenticated scope", {
          scopeSource: scopeOverride.source || "unknown",
          householdId: scopeOverride.householdId || null,
        });
      }
    }

    const policyResult = await upsertVaultedPolicyFromAnalysis({
      normalizedPolicy,
      carrierProfile,
      productProfile,
      scopeOverride,
    });

    if (policyResult.error || !policyResult.data?.id) {
      status.failedStep = "policy";
      status.stepResults.policy = {
        attempted: true,
        succeeded: false,
        id: null,
        errorSummary: policyResult.error?.message || "Policy upsert failed",
      };
      throw policyResult.error || new Error("Policy upsert failed");
    }

    status.policyId = policyResult.data.id;
    status.partialPolicyCreated = true;
    status.lastCompletedStep = "policy";
    status.stepResults.policy = {
      attempted: true,
      succeeded: true,
      id: policyResult.data.id,
      errorSummary: "",
    };

    let baselineStorageResult = {
      attempted: false,
      succeeded: false,
      storageBucket: null,
      storagePath: null,
      errorSummary: "",
    };
    let baselineSourceHash = null;
    if (baseline && illustrationFile) {
      status.stepResults.baseline_upload.attempted = true;
      baselineSourceHash = await buildDocumentSourceHash(illustrationFile);
      baselineStorageResult = await uploadVaultedDocumentFile({
        file: illustrationFile,
        policyId: status.policyId,
        documentRole: "illustration",
        statementDate: null,
        sourceHash: baselineSourceHash,
      });
      status.fileUploadAttempted = true;
      if (baselineStorageResult.succeeded) {
        status.uploadedFileCount += 1;
        status.uploadedStoragePaths.push(baselineStorageResult.storagePath);
        status.lastCompletedStep = "baseline_upload";
        status.stepResults.baseline_upload = {
          attempted: true,
          succeeded: true,
          storagePath: baselineStorageResult.storagePath,
          errorSummary: "",
        };
      } else if (baselineStorageResult.errorSummary) {
        status.errorSummary = status.errorSummary || baselineStorageResult.errorSummary;
        status.stepResults.baseline_upload = {
          attempted: true,
          succeeded: false,
          storagePath: baselineStorageResult.storagePath || null,
          errorSummary: baselineStorageResult.errorSummary,
        };
      }
    }

    const baselineDocumentResult = baseline
      ? await createOrReuseVaultedDocument({
          policyId: status.policyId,
          documentRole: "illustration",
          documentType: baseline.documentType?.document_type,
          file: illustrationFile,
          fileName: illustrationFile?.name || baseline.fileName,
          fileSize: illustrationFile?.size || null,
          statementDate: null,
          pageCount: baseline.pages?.length || null,
          carrierName: baseline.carrierDetection?.carrier_name,
          carrierKey: carrierProfile?.key || null,
          classificationConfidence: baseline.documentType?.confidence,
          rawTextExcerpt: baseline.text?.slice(0, 1000) || "",
          metadata: {
            evidence: baseline.documentType?.evidence || [],
            storage_bucket: baselineStorageResult.storageBucket,
            storage_path: baselineStorageResult.storagePath,
            upload_status: baselineStorageResult.succeeded ? "uploaded" : baselineStorageResult.attempted ? "failed" : "not_attempted",
            source_type: baseline.extractionMeta?.source_type || "pdf",
            ocr_confidence: baseline.extractionMeta?.ocr_confidence ?? null,
            extraction_method: baseline.extractionMeta?.extraction_method || "pdf_text",
            extraction_warnings: baseline.extractionMeta?.extraction_warnings || [],
          },
          scopeOverride,
      })
      : { data: null, error: null, duplicateStatus: null, sourceHash: baselineSourceHash };

    if (baselineDocumentResult.error) {
      status.failedStep = "baseline_document";
      status.stepResults.baseline_document = {
        attempted: true,
        succeeded: false,
        id: null,
        duplicateStatus: null,
        errorSummary: baselineDocumentResult.error.message || "Baseline document save failed",
      };
      throw baselineDocumentResult.error;
    }

    if (baselineDocumentResult.data?.id) {
      status.documentCount += baselineDocumentResult.duplicateStatus === "duplicate_existing" ? 0 : 1;
      status.duplicateDetections.push({
        fileName: illustrationFile?.name || baseline.fileName,
        duplicateStatus: baselineDocumentResult.duplicateStatus || "unique",
        sourceHash: baselineDocumentResult.sourceHash || baselineDocumentResult.data?.source_hash || null,
      });
    }
    status.lastCompletedStep = "baseline_document";
    status.stepResults.baseline_document = {
      attempted: true,
      succeeded: true,
      id: baselineDocumentResult.data?.id || null,
      duplicateStatus: baselineDocumentResult.duplicateStatus || null,
      errorSummary: "",
    };

    const baselineSnapshotResult = await createVaultedSnapshot({
      policyId: status.policyId,
      documentId: baselineDocumentResult.data?.id || null,
      snapshotType: "baseline_illustration",
      statementDate: null,
      normalizedPolicy,
      extractionMeta: {
        ...(normalizedPolicy?.extraction_meta || {}),
        ...(baseline?.extractionMeta || {}),
      },
      completenessAssessment,
      carrierProfile,
      productProfile,
      strategyReferenceHits,
      parserVersion: baseline?.structuredData ? VAULTED_PARSER_VERSION : null,
      parserStructuredData: sanitizeParserStructuredData(baseline?.structuredData),
      scopeOverride,
    });

    if (import.meta.env.DEV) {
      console.info("[VaultedShield] baseline snapshot payload", {
        parser_version: baseline?.structuredData ? VAULTED_PARSER_VERSION : null,
        structured_data_present: hasStructuredPayloadContent(baseline?.structuredData),
        structured_keys: Object.keys(safeObject(sanitizeParserStructuredData(baseline?.structuredData))),
      });
      console.info("[VaultedShield] baseline snapshot insert result", {
        ok: !baselineSnapshotResult.error,
        snapshot_id: baselineSnapshotResult.data?.id || null,
        compatibility: baselineSnapshotResult.compatibility || null,
      });
    }

    if (baselineSnapshotResult.error) {
      status.failedStep = "baseline_snapshot";
      status.stepResults.baseline_snapshot = {
        attempted: true,
        succeeded: false,
        id: null,
        parserVersion: baseline?.structuredData ? VAULTED_PARSER_VERSION : null,
        structuredDataPresent: hasStructuredPayloadContent(baseline?.structuredData),
        compatibility: baselineSnapshotResult.compatibility || null,
        errorSummary: baselineSnapshotResult.error.message || "Baseline snapshot save failed",
      };
      throw baselineSnapshotResult.error;
    }

    if (baselineSnapshotResult.data?.id) {
      status.snapshotCount += 1;
    }
    status.lastCompletedStep = "baseline_snapshot";
    status.stepResults.baseline_snapshot = {
      attempted: true,
      succeeded: true,
      id: baselineSnapshotResult.data?.id || null,
      parserVersion: baseline?.structuredData ? VAULTED_PARSER_VERSION : null,
      structuredDataPresent: hasStructuredPayloadContent(baseline?.structuredData),
      compatibility: baselineSnapshotResult.compatibility || null,
      errorSummary: "",
    };
    if (baselineSnapshotResult.compatibility?.fallbackWithoutStructuredColumns) {
      status.mode = "supabase_loaded_with_structured_snapshot_fallback";
      status.errorSummary =
        status.errorSummary ||
        "Snapshot structured parser columns are not available in the current database yet. Save continued with legacy-compatible snapshot fields.";
    }

    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      const statementFile = statementFiles?.[index];
      let statementStorageResult = {
        attempted: false,
        succeeded: false,
        storageBucket: null,
        storagePath: null,
        errorSummary: "",
      };
      let statementSourceHash = null;

      if (statementFile) {
        status.stepResults.statement_uploads[index] = {
          attempted: true,
          succeeded: false,
          fileName: statementFile.name,
          storagePath: null,
          errorSummary: "",
        };
        statementSourceHash = await buildDocumentSourceHash(statementFile);
        statementStorageResult = await uploadVaultedDocumentFile({
          file: statementFile,
          policyId: status.policyId,
          documentRole: "annual_statement",
          statementDate: statement.fields?.statement_date?.display_value || null,
          sourceHash: statementSourceHash,
        });
        status.fileUploadAttempted = true;
        if (statementStorageResult.succeeded) {
          status.uploadedFileCount += 1;
          status.uploadedStoragePaths.push(statementStorageResult.storagePath);
          status.lastCompletedStep = `statement_upload:${index}`;
          status.stepResults.statement_uploads[index] = {
            attempted: true,
            succeeded: true,
            fileName: statementFile.name,
            storagePath: statementStorageResult.storagePath,
            errorSummary: "",
          };
        } else if (statementStorageResult.errorSummary && !status.errorSummary) {
          status.errorSummary = statementStorageResult.errorSummary;
          status.stepResults.statement_uploads[index] = {
            attempted: true,
            succeeded: false,
            fileName: statementFile.name,
            storagePath: statementStorageResult.storagePath || null,
            errorSummary: statementStorageResult.errorSummary,
          };
        }
      }

      const documentResult = await createOrReuseVaultedDocument({
        policyId: status.policyId,
        documentRole: "annual_statement",
        documentType: statement.documentType?.document_type,
        file: statementFile,
        fileName: statementFile?.name || statement.fileName,
        fileSize: statementFile?.size || null,
        statementDate: statement.fields?.statement_date?.display_value || null,
        pageCount: statement.pages?.length || null,
        carrierName: statement.carrierDetection?.carrier_name,
        carrierKey: carrierProfile?.key || null,
        classificationConfidence: statement.documentType?.confidence,
        rawTextExcerpt: statement.text?.slice(0, 1000) || "",
        metadata: {
          evidence: statement.documentType?.evidence || [],
          storage_bucket: statementStorageResult.storageBucket,
          storage_path: statementStorageResult.storagePath,
          upload_status: statementStorageResult.succeeded ? "uploaded" : statementStorageResult.attempted ? "failed" : "not_attempted",
          source_type: statement.extractionMeta?.source_type || "pdf",
          ocr_confidence: statement.extractionMeta?.ocr_confidence ?? null,
          extraction_method: statement.extractionMeta?.extraction_method || "pdf_text",
          extraction_warnings: statement.extractionMeta?.extraction_warnings || [],
        },
        scopeOverride,
      });

      if (documentResult.error) {
        status.failedStep = `statement_document:${index}`;
        status.stepResults.statement_documents[index] = {
          attempted: true,
          succeeded: false,
          fileName: statementFile?.name || statement.fileName || null,
          id: null,
          duplicateStatus: null,
          errorSummary: documentResult.error.message || "Statement document save failed",
        };
        throw documentResult.error;
      }

      if (documentResult.data?.id) {
        status.documentCount += documentResult.duplicateStatus === "duplicate_existing" ? 0 : 1;
        status.duplicateDetections.push({
          fileName: statementFile?.name || statement.fileName,
          duplicateStatus: documentResult.duplicateStatus || "unique",
          sourceHash: documentResult.sourceHash || documentResult.data?.source_hash || null,
        });
      }
      status.lastCompletedStep = `statement_document:${index}`;
      status.stepResults.statement_documents[index] = {
        attempted: true,
        succeeded: true,
        fileName: statementFile?.name || statement.fileName || null,
        id: documentResult.data?.id || null,
        duplicateStatus: documentResult.duplicateStatus || null,
        errorSummary: "",
      };

      const statementSnapshotPolicy = {
        ...normalizedPolicy,
        policy_timing: {
          ...normalizedPolicy.policy_timing,
          statement_date: statement.fields?.statement_date?.display_value || "",
          policy_year: statement.fields?.policy_year?.value ?? null,
          insured_age: statement.fields?.insured_age?.value ?? null,
        },
        values: {
          ...normalizedPolicy.values,
          accumulation_value: statement.fields?.accumulation_value || null,
          cash_value: statement.fields?.cash_value || null,
          cash_surrender_value: statement.fields?.cash_surrender_value || null,
          indexed_account_value: statement.fields?.indexed_account_value || null,
          fixed_account_value: statement.fields?.fixed_account_value || null,
        },
        charges: {
          ...normalizedPolicy.charges,
          cost_of_insurance: statement.fields?.cost_of_insurance || null,
          admin_fee: statement.fields?.admin_fee || null,
          monthly_deduction: statement.fields?.monthly_deduction || null,
          expense_charge: statement.fields?.expense_charge || null,
          rider_charge: statement.fields?.rider_charge || null,
          total_policy_charges: parseCurrencyToNumber(statement.summary?.totalPolicyCharges) ?? null,
        },
        strategy: {
          ...normalizedPolicy.strategy,
          current_index_strategy: statement.fields?.index_strategy?.display_value || "",
          allocation_percent: statement.fields?.allocation_percent || null,
          index_credit: statement.fields?.index_credit || null,
          crediting_rate: statement.fields?.crediting_rate || null,
          participation_rate: statement.fields?.participation_rate || null,
          cap_rate: statement.fields?.cap_rate || null,
          spread: statement.fields?.spread || null,
        },
        loans: {
          ...normalizedPolicy.loans,
          loan_balance: statement.fields?.loan_balance || null,
        },
        riders: {
          ...normalizedPolicy.riders,
          rider_charge: statement.fields?.rider_charge || null,
        },
      };

      const snapshotResult = await createVaultedSnapshot({
        policyId: status.policyId,
        documentId: documentResult.data?.id || null,
        snapshotType: "annual_statement",
        statementDate: statement.fields?.statement_date?.display_value || null,
        normalizedPolicy: statementSnapshotPolicy,
        extractionMeta: {
          ...(statement.fields || {}),
          ...(statement.extractionMeta || {}),
        },
        completenessAssessment,
        carrierProfile,
        productProfile,
        strategyReferenceHits,
        parserVersion: statement?.structuredData ? VAULTED_PARSER_VERSION : null,
        parserStructuredData: sanitizeParserStructuredData(statement?.structuredData),
        scopeOverride,
      });

      if (import.meta.env.DEV) {
        console.info("[VaultedShield] statement snapshot payload", {
          file_name: statement.fileName,
          parser_version: statement?.structuredData ? VAULTED_PARSER_VERSION : null,
          structured_data_present: hasStructuredPayloadContent(statement?.structuredData),
          structured_keys: Object.keys(safeObject(sanitizeParserStructuredData(statement?.structuredData))),
        });
        console.info("[VaultedShield] statement snapshot insert result", {
          file_name: statement.fileName,
          ok: !snapshotResult.error,
          snapshot_id: snapshotResult.data?.id || null,
          compatibility: snapshotResult.compatibility || null,
        });
      }

      if (snapshotResult.error) {
        status.failedStep = `statement_snapshot:${index}`;
        status.stepResults.statement_snapshots[index] = {
          attempted: true,
          succeeded: false,
          fileName: statement.fileName || statementFile?.name || null,
          id: null,
          parserVersion: statement?.structuredData ? VAULTED_PARSER_VERSION : null,
          structuredDataPresent: hasStructuredPayloadContent(statement?.structuredData),
          compatibility: snapshotResult.compatibility || null,
          errorSummary: snapshotResult.error.message || "Statement snapshot save failed",
        };
        throw snapshotResult.error;
      }

      if (snapshotResult.data?.id) {
        status.snapshotCount += 1;
      }
      status.lastCompletedStep = `statement_snapshot:${index}`;
      status.stepResults.statement_snapshots[index] = {
        attempted: true,
        succeeded: true,
        fileName: statement.fileName || statementFile?.name || null,
        id: snapshotResult.data?.id || null,
        parserVersion: statement?.structuredData ? VAULTED_PARSER_VERSION : null,
        structuredDataPresent: hasStructuredPayloadContent(statement?.structuredData),
        compatibility: snapshotResult.compatibility || null,
        errorSummary: "",
      };
      if (snapshotResult.compatibility?.fallbackWithoutStructuredColumns) {
        status.mode = "supabase_loaded_with_structured_snapshot_fallback";
        status.errorSummary =
          status.errorSummary ||
          "Snapshot structured parser columns are not available in the current database yet. Save continued with legacy-compatible snapshot fields.";
      }
    }

    const analyticsResult = await createVaultedAnalytics({
      policyId: status.policyId,
      snapshotId: baselineSnapshotResult.data?.id || null,
      analyticsType: "current_policy_view",
      normalizedAnalytics,
      healthScore: normalizedAnalytics?.policy_health_score?.score ?? null,
      healthStatus: normalizedAnalytics?.policy_health_score?.status ?? null,
      coverageStatus: completenessAssessment?.status ?? null,
      reviewFlags: normalizedAnalytics?.review_flags || [],
      scopeOverride,
    });

    if (analyticsResult.error) {
      status.failedStep = "analytics";
      status.stepResults.analytics = {
        attempted: true,
        succeeded: false,
        id: null,
        errorSummary: analyticsResult.error.message || "Analytics save failed",
      };
      throw analyticsResult.error;
    }
    status.lastCompletedStep = "analytics";
    status.stepResults.analytics = {
      attempted: true,
      succeeded: true,
      id: analyticsResult.data?.id || null,
      errorSummary: "",
    };

    const statementRows = statements.map((statement) => ({
      statement_date: statement.fields?.statement_date?.display_value || "",
      policy_year: statement.fields?.policy_year?.value ?? null,
      accumulation_value: statement.fields?.accumulation_value?.display_value || "",
      cash_value: statement.fields?.cash_value?.display_value || "",
      cash_surrender_value: statement.fields?.cash_surrender_value?.display_value || "",
      loan_balance: statement.fields?.loan_balance?.display_value || "",
      cost_of_insurance: statement.fields?.cost_of_insurance?.display_value || "",
      admin_fee: statement.fields?.admin_fee?.display_value || "",
      monthly_deduction: statement.fields?.monthly_deduction?.display_value || "",
      expense_charge: statement.fields?.expense_charge?.display_value || "",
      rider_charge: statement.fields?.rider_charge?.display_value || "",
      current_index_strategy: statement.fields?.index_strategy?.display_value || "",
      allocation_percent: statement.fields?.allocation_percent?.display_value || "",
      cap_rate: statement.fields?.cap_rate?.display_value || "",
      participation_rate: statement.fields?.participation_rate?.display_value || "",
      crediting_rate: statement.fields?.crediting_rate?.display_value || "",
      spread: statement.fields?.spread?.display_value || "",
      indexed_account_value: statement.fields?.indexed_account_value?.display_value || "",
      fixed_account_value: statement.fields?.fixed_account_value?.display_value || "",
    }));

    const statementRowResult = await upsertVaultedStatementRows({
      policyId: status.policyId,
      snapshotId: baselineSnapshotResult.data?.id || null,
      statements: statementRows,
      scopeOverride,
    });

    if (statementRowResult.error) {
      status.failedStep = "statement_rows";
      status.stepResults.statement_rows = {
        attempted: true,
        succeeded: false,
        count: 0,
        errorSummary: statementRowResult.error.message || "Statement rows save failed",
      };
      throw statementRowResult.error;
    }

    status.statementRowCount = statementRowResult.data?.length || 0;
    status.lastCompletedStep = "statement_rows";
    status.stepResults.statement_rows = {
      attempted: true,
      succeeded: true,
      count: status.statementRowCount,
      errorSummary: "",
    };
    status.succeeded = true;
    status.mode = "supabase";
    status.parserVersion = VAULTED_PARSER_VERSION;
    status.structuredSnapshotsPersisted =
      (baseline?.structuredData ? 1 : 0) +
      statements.filter((statement) => statement?.structuredData).length;
    return status;
  } catch (error) {
    if (!status.failedStep) {
      status.failedStep = status.lastCompletedStep ? `${status.lastCompletedStep}:next` : "unknown";
    }
    status.errorSummary = isRowLevelSecurityError(error)
      ? "Supabase row-level security is blocking one or more vaulted policy writes. Apply the vaulted policy beta RLS migration, then retry."
      : error?.message || "Supabase persistence failed";
    if (status.failedStep === "unknown" && !status.stepResults.policy.attempted) {
      status.stepResults.policy.errorSummary = status.errorSummary;
    }
    return status;
  }
}
