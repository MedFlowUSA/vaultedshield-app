function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeQualityValue(value) {
  return ["strong", "moderate", "weak", "failed"].includes(value) ? value : "unknown";
}

function normalizeStructuredData(raw) {
  const source = safeObject(raw);
  if (!source) return null;

  const normalized = {
    version: source.version || null,
    extractionSummary: safeObject(source.extractionSummary) || null,
    pageTypes: safeArray(source.pageTypes),
    tables: safeArray(source.tables),
    strategyRows: safeArray(source.strategyRows),
    allStrategyRows: safeArray(source.allStrategyRows),
    failedPages: safeArray(source.failedPages),
    quality: {
      ledger: safeQualityValue(source.quality?.ledger),
      statement: safeQualityValue(source.quality?.statement),
      strategy: safeQualityValue(source.quality?.strategy),
    },
  };

  const hasContent =
    Boolean(normalized.extractionSummary && Object.keys(normalized.extractionSummary).length) ||
    normalized.pageTypes.length > 0 ||
    normalized.tables.length > 0 ||
    normalized.strategyRows.length > 0 ||
    normalized.allStrategyRows.length > 0 ||
    normalized.failedPages.length > 0 ||
    Object.values(normalized.quality).some((value) => value !== "unknown");

  return hasContent ? normalized : null;
}

function normalizeStrategyRow(row) {
  const source = safeObject(row) || {};
  return {
    ...source,
    strategy: source.strategy || source.strategy_name || "",
    strategy_name: source.strategy_name || source.strategy || "",
    row_kind:
      source.row_kind ||
      (source.active ? "active" : source.menu_only ? "menu" : "observed"),
    source_page_number: source.source_page_number ?? source.page_number ?? source.provenance?.page ?? null,
  };
}

function qualityRank(value) {
  return { failed: 0, weak: 1, moderate: 2, strong: 3 }[value] ?? -1;
}

export function getStructuredData(snapshot) {
  if (!snapshot) return null;

  const persisted = normalizeStructuredData(snapshot?.parser_structured_data);
  if (persisted) return persisted;

  const localStructured = normalizeStructuredData(snapshot?.structuredData);
  if (localStructured) return localStructured;

  return null;
}

export function hasStructuredData(snapshot) {
  return !!getStructuredData(snapshot);
}

export function getStructuredQuality(snapshot) {
  const structured = getStructuredData(snapshot);

  if (!structured?.quality || typeof structured.quality !== "object") {
    return {
      ledger: "unknown",
      statement: "unknown",
      strategy: "unknown",
    };
  }

  return {
    ledger: structured.quality.ledger || "unknown",
    statement: structured.quality.statement || "unknown",
    strategy: structured.quality.strategy || "unknown",
  };
}

export function getStructuredStrategyRows(snapshot) {
  const structured = getStructuredData(snapshot);

  if (!structured) return [];

  if (Array.isArray(structured.strategyRows) && structured.strategyRows.length > 0) {
    return structured.strategyRows.map((row) => normalizeStrategyRow(row));
  }

  if (Array.isArray(structured.allStrategyRows)) {
    return structured.allStrategyRows.map((row) => normalizeStrategyRow(row));
  }

  return [];
}

export function getStructuredExtractionSummary(snapshot) {
  const structured = getStructuredData(snapshot);
  return safeObject(structured?.extractionSummary) || null;
}

export function getStructuredPageTypes(snapshot) {
  const structured = getStructuredData(snapshot);
  return safeArray(structured?.pageTypes);
}

export function getStructuredFailedPages(snapshot) {
  const structured = getStructuredData(snapshot);
  return safeArray(structured?.failedPages);
}

export function getBestValue(snapshot, legacyValue, path = []) {
  const structured = getStructuredData(snapshot);

  if (!structured) return legacyValue ?? null;

  let current = structured;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return legacyValue ?? null;
    }
    current = current[key];
  }

  if (current !== undefined && current !== null) {
    return current;
  }

  return legacyValue ?? null;
}

export function getStructuredFlags(snapshot) {
  const structured = getStructuredData(snapshot);
  return {
    parserVersion: snapshot?.parser_version || snapshot?.parserState?.parserVersion || structured?.version || null,
    structuredDataPresent: Boolean(structured),
    quality: getStructuredQuality(snapshot),
    fallbackUsed: snapshot?.parserState?.fallbackUsed ?? !structured,
  };
}

export function hasStrongStructuredSupport(snapshot, type) {
  const quality = getStructuredQuality(snapshot);
  const resolvedQuality = quality?.[type] || "unknown";
  return {
    supported: qualityRank(resolvedQuality) >= qualityRank("moderate"),
    quality: resolvedQuality === "unknown" ? null : resolvedQuality,
    fallbackUsed: !hasStructuredData(snapshot),
  };
}

export function getStructuredTableRows(snapshot, pageType) {
  const structured = getStructuredData(snapshot);
  const tables = safeArray(structured?.tables);
  const matching = tables.filter((table) => table?.page_type === pageType);

  return {
    rows: matching.flatMap((table) => safeArray(table?.rows)),
    quality: matching.map((table) => table?.quality).filter(Boolean),
    failedRows: matching.flatMap((table) => safeArray(table?.failed_rows)),
    fallbackUsed: !structured,
  };
}
