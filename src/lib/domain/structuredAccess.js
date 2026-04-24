import {
  getBestValue,
  getStructuredData as getCanonicalStructuredData,
  getStructuredExtractionSummary as getCanonicalStructuredExtractionSummary,
  getStructuredFailedPages,
  getStructuredPageTypes,
  getStructuredFlags,
  getStructuredQuality as _getCanonicalStructuredQuality,
  getStructuredStrategyRows as getCanonicalStructuredStrategyRows,
  getStructuredTableRows,
  hasStrongStructuredSupport as hasCanonicalStrongStructuredSupport,
  hasStructuredData,
} from "../intelligence/structuredAccess.js";

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function _qualityRank(value) {
  return { failed: 0, weak: 1, moderate: 2, strong: 3 }[value] ?? 0;
}

export { getBestValue, getStructuredFailedPages, getStructuredFlags, getStructuredPageTypes, getStructuredTableRows, hasStructuredData };

export function getStructuredData(snapshot) {
  const raw = getCanonicalStructuredData(snapshot);
  const flags = getStructuredFlags(snapshot);

  return {
    present: Boolean(raw),
    parserVersion: flags.parserVersion,
    quality: flags.quality,
    fallbackUsed: snapshot?.parserState?.fallbackUsed ?? !raw,
    raw,
  };
}

export function getStructuredQuality(snapshot) {
  const structured = getStructuredData(snapshot);
  return {
    present: structured.present,
    parserVersion: structured.parserVersion,
    summary: structured.quality,
    fallbackUsed: structured.fallbackUsed,
  };
}

export function getStructuredStrategyRows(snapshot) {
  const structured = getStructuredData(snapshot);
  const rows = getCanonicalStructuredStrategyRows(snapshot).filter((row) => row?.strategy || row?.strategy_name);
  const activeRows = rows.filter((row) => row?.active || row?.row_kind === "active");
  const observedRows = rows.filter((row) => !row?.menu_only && row?.row_kind !== "menu");
  const menuRows = rows.filter((row) => row?.menu_only || row?.row_kind === "menu");

  return {
    present: structured.present,
    parserVersion: structured.parserVersion,
    quality: structured.quality?.strategy || null,
    rows,
    activeRows,
    observedRows,
    menuRows,
    usedFallback: structured.fallbackUsed,
  };
}

export function getStructuredExtractionSummary(snapshot) {
  const structured = getStructuredData(snapshot);
  return {
    present: structured.present,
    parserVersion: structured.parserVersion,
    summary: safeObject(getCanonicalStructuredExtractionSummary(snapshot)),
    usedFallback: structured.fallbackUsed,
  };
}

export function hasStrongStructuredSupport(snapshot, type) {
  const result = hasCanonicalStrongStructuredSupport(snapshot, type);
  return {
    supported: result.supported,
    quality: result.quality,
    fallbackUsed: result.fallbackUsed,
  };
}
