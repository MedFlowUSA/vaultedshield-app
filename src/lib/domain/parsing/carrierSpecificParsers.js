import { CARRIER_PARSING_PROFILES, resolveCarrierParsingProfile } from "./carrierProfiles.js";
import { detectDocumentPageTypes } from "./pageTypeDetection.js";
import { reconstructTableFromPage } from "./tableReconstruction.js";

const TIER_SCORE = {
  strong: 0.96,
  moderate: 0.82,
  weak: 0.62,
  none: 0,
};

const TIER_TO_CONFIDENCE = {
  strong: "high",
  moderate: "medium",
  weak: "low",
  none: "low",
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toDisplayValue(value, type = "text") {
  if (value === null || value === undefined || value === "") return "Not found";
  if (type === "currency" && typeof value === "number") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }
  if (type === "percent" && typeof value === "number") return `${value}%`;
  return String(value);
}

function detectTypeFromField(fieldKey) {
  if (
    [
      "death_benefit",
      "planned_premium",
      "premium_paid",
      "accumulation_value",
      "cash_value",
      "cash_surrender_value",
      "loan_balance",
      "policy_charges_total",
      "cost_of_insurance",
      "monthly_deduction",
      "expense_charge",
      "admin_fee",
      "rider_charge",
      "indexed_account_value",
      "fixed_account_value",
    ].includes(fieldKey)
  ) {
    return "currency";
  }
  if (["allocation_percent", "cap_rate", "participation_rate", "spread", "crediting_rate"].includes(fieldKey)) {
    return "percent";
  }
  return "text";
}

function buildProvenance({ value, label, page, document, method, confidence, candidates = [] }) {
  return {
    value,
    label,
    page,
    document,
    method,
    confidence,
    candidates,
  };
}

function buildFieldResult({
  fieldKey,
  value,
  rawLabel,
  rawValue,
  pageNumber,
  fileName = "",
  documentType,
  carrierName,
  method,
  confidenceTier,
  evidence = [],
  candidates = [],
  sourcePageType = "",
}) {
  const type = detectTypeFromField(fieldKey);
  const score = TIER_SCORE[confidenceTier] ?? TIER_SCORE.weak;
  return {
    normalized_key: fieldKey,
    value,
    display_value: toDisplayValue(value, type),
    raw_label: rawLabel,
    raw_value: rawValue,
    page_number: pageNumber,
    extraction_method: method,
    confidence: TIER_TO_CONFIDENCE[confidenceTier] || "low",
    confidence_score: score,
    extraction_confidence_tier: confidenceTier,
    carrier_hint: carrierName,
    document_type: documentType,
    evidence,
    rejected_candidates: [],
    source_page_type: sourcePageType,
    source_priority: confidenceTier === "strong" ? 4 : confidenceTier === "moderate" ? 3 : 1,
    suppression_reason: "",
    missing: value === null || value === undefined || value === "",
    provenance: buildProvenance({
      value,
      label: rawLabel,
      page: pageNumber,
      document: fileName,
      method,
      confidence: confidenceTier,
      candidates,
    }),
  };
}

function normalizeDateValue(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const isoMatch = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];
  const slashMatch = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch) {
    return `${slashMatch[3]}-${String(slashMatch[1]).padStart(2, "0")}-${String(slashMatch[2]).padStart(2, "0")}`;
  }
  const monthMatch = trimmed.match(/\b([A-Za-z]+ \d{1,2}, \d{4})\b/);
  if (monthMatch) {
    const parsed = new Date(monthMatch[1]);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function parseNumericValue(valueText, fieldKey) {
  const type = detectTypeFromField(fieldKey);
  if (type === "currency") {
    const match = valueText.match(/(\(?\$?[\d,]+(?:\.\d{2})?\)?)/);
    if (!match) return null;
    const cleaned = match[1].replace(/[$,()\s]/g, "");
    const value = Number(cleaned);
    if (!Number.isFinite(value)) return null;
    return /\(/.test(match[1]) ? -value : value;
  }
  if (type === "percent") {
    const match = valueText.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    return match ? Number(match[1]) : null;
  }
  if (fieldKey === "statement_date" || fieldKey === "issue_date") return normalizeDateValue(valueText);
  return valueText.trim() || null;
}

function mergeField(target, incoming) {
  if (!incoming || incoming.missing) return target;
  if (!target || target.missing) return incoming;
  return (incoming.confidence_score || 0) >= (target.confidence_score || 0) + 0.04 ? incoming : target;
}

function extractLabeledLineValue({
  pageText,
  pageNumber,
  labels = [],
  fieldKey,
  documentType,
  carrierName,
  pageType,
  fileName = "",
  methodInline = "carrier_summary_row",
  methodNextLine = "carrier_label_next_line",
  confidenceTierInline = "moderate",
  confidenceTierNextLine = "weak",
}) {
  const lines = String(pageText || "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const matches = [];
  labels.forEach((label) => {
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      if (!lower.includes(label.toLowerCase())) return;

      const sameLine = line.split(/:\s*/).slice(1).join(":").trim();
      const nextLine = lines[index + 1] || "";
      const valueText = sameLine || nextLine;
      if (!valueText) return;
      const value = parseNumericValue(valueText, fieldKey);
      if (value === null || value === undefined || value === "") return;

      matches.push(
        buildFieldResult({
          fieldKey,
          value,
          rawLabel: label,
          rawValue: valueText,
          pageNumber,
          fileName,
          documentType,
          carrierName,
          method: sameLine ? methodInline : methodNextLine,
          confidenceTier: sameLine ? confidenceTierInline : confidenceTierNextLine,
          evidence: [`matched carrier label for ${fieldKey}`, `page typed as ${pageType}`],
          candidates: [],
          sourcePageType: pageType,
        })
      );
    });
  });

  if (matches.length === 0) return null;
  return matches.sort((left, right) => (right.confidence_score || 0) - (left.confidence_score || 0))[0];
}

function buildIllustrationProjection(rows = []) {
  const benchmarkTargets = [5, 10, 20, 30];
  const benchmarkRows = benchmarkTargets
    .map((target) => rows.find((row) => row.year === target) || rows.find((row) => row.year > target) || null)
    .filter(Boolean)
    .filter((row, index, collection) => collection.findIndex((candidate) => candidate.year === row.year) === index)
    .map((row) => ({
      policy_year: row.year,
      policy_year_display: String(row.year),
      attained_age: row.attained_age,
      premium_outlay: toDisplayValue(row.premium, "currency"),
      accumulation_value: toDisplayValue(row.account_value, "currency"),
      cash_surrender_value: toDisplayValue(row.surrender_value, "currency"),
      death_benefit: toDisplayValue(row.death_benefit, "currency"),
      loan_balance: row.loan_balance !== null ? toDisplayValue(row.loan_balance, "currency") : null,
      illustrated_charges: row.illustrated_charges !== null ? toDisplayValue(row.illustrated_charges, "currency") : null,
      source_page_number: row.source_page_number,
      provenance: row.provenance || [],
    }));

  return {
    row_count: rows.length,
    rows: rows.map((row) => ({
      policy_year: row.year,
      policy_year_display: String(row.year),
      attained_age: row.attained_age,
      premium_outlay: row.premium !== null ? { value: row.premium, display: toDisplayValue(row.premium, "currency") } : null,
      accumulation_value: row.account_value !== null ? { value: row.account_value, display: toDisplayValue(row.account_value, "currency") } : null,
      cash_surrender_value: row.surrender_value !== null ? { value: row.surrender_value, display: toDisplayValue(row.surrender_value, "currency") } : null,
      death_benefit: row.death_benefit !== null ? { value: row.death_benefit, display: toDisplayValue(row.death_benefit, "currency") } : null,
      loan_balance: row.loan_balance !== null ? { value: row.loan_balance, display: toDisplayValue(row.loan_balance, "currency") } : null,
      illustrated_charges:
        row.illustrated_charges !== null ? { value: row.illustrated_charges, display: toDisplayValue(row.illustrated_charges, "currency") } : null,
      source_page_number: row.source_page_number,
      provenance: row.provenance || [],
    })),
    benchmark_rows: benchmarkRows,
    page_numbers: unique(rows.map((row) => row.source_page_number)),
    comparison_support_available: rows.length > 0,
  };
}

function parseIllustrationLedgerPages(pageAnalyses, pages, carrierProfile) {
  const reconstructions = pageAnalyses
    .filter((page) => page.page_type === "illustration_ledger")
    .map((page) =>
      reconstructTableFromPage(pages[page.page_number - 1], {
        pageType: page.page_type,
        pageNumber: page.page_number,
        carrierKey: carrierProfile.key,
      })
    );

  const rows = reconstructions.flatMap((entry) => entry.rows || []);
  return {
    illustrationProjection: buildIllustrationProjection(rows),
    reconstructions,
  };
}

function parseByLabelMap(pageAnalyses, pages, labelsByField = {}, carrierProfile, documentType, targetPageTypes, fileName = "") {
  const extractedFields = {};
  const pageSet = new Set(targetPageTypes);

  pageAnalyses
    .filter((page) => pageSet.has(page.page_type))
    .forEach((page) => {
      const pageText = pages[page.page_number - 1];
      Object.entries(labelsByField).forEach(([fieldKey, labels]) => {
        const candidate = extractLabeledLineValue({
          pageText,
          pageNumber: page.page_number,
          labels,
          fieldKey,
          documentType,
          carrierName: carrierProfile.name,
          pageType: page.page_type,
          fileName,
        });
        extractedFields[fieldKey] = mergeField(extractedFields[fieldKey], candidate);
      });
    });

  return extractedFields;
}

function parseProtectiveStatementSummary(pageAnalyses, pages, carrierProfile, documentType, fileName = "") {
  const extractedFields = {};
  const relevantPages = pageAnalyses.filter((page) => ["statement_summary", "charges_table"].includes(page.page_type));

  relevantPages.forEach((page) => {
    const pageText = pages[page.page_number - 1];
    const fieldCandidates = {
      policy_number: ["policy number", "contract number", "certificate number"],
      statement_date: ["statement date", "as of", "report date"],
      accumulation_value: ["account value", "accumulation value", "policy value"],
      cash_value: ["cash value"],
      cash_surrender_value: ["cash surrender value", "net cash surrender value", "surrender value"],
      death_benefit: ["death benefit", "current death benefit"],
      loan_balance: ["loan balance", "policy loan balance"],
      premium_paid: ["premium paid", "premium received", "annual premium"],
      policy_charges_total: ["policy charges", "annual charges", "total charges"],
      cost_of_insurance: ["cost of insurance", "coi"],
    };

    Object.entries(fieldCandidates).forEach(([fieldKey, labels]) => {
      const candidate = extractLabeledLineValue({
        pageText,
        pageNumber: page.page_number,
        labels,
        fieldKey,
        documentType,
        carrierName: carrierProfile.name,
        pageType: page.page_type,
        fileName,
        methodInline: page.page_type === "statement_summary" ? "carrier_summary_row" : "carrier_table_row",
        methodNextLine: page.page_type === "statement_summary" ? "carrier_summary_row" : "carrier_table_row",
        confidenceTierInline: page.page_type === "statement_summary" ? "strong" : "moderate",
        confidenceTierNextLine: page.page_type === "statement_summary" ? "moderate" : "weak",
      });
      extractedFields[fieldKey] = mergeField(extractedFields[fieldKey], candidate);
    });
  });

  return extractedFields;
}

function parseChargesPages(pageAnalyses, pages, carrierProfile, documentType, fileName = "") {
  const extractedFields = {};
  const reconstructions = pageAnalyses
    .filter((page) => page.page_type === "charges_table")
    .map((page) =>
      reconstructTableFromPage(pages[page.page_number - 1], {
        pageType: page.page_type,
        pageNumber: page.page_number,
        carrierKey: carrierProfile.key,
      })
    );

  reconstructions.flatMap((entry) => entry.rows || []).forEach((row) => {
    if (!row?.key || row.value === null || row.value === undefined) return;
    extractedFields[row.key] = buildFieldResult({
      fieldKey: row.key,
      value: row.value,
      rawLabel: row.label,
      rawValue: row.raw_value,
      pageNumber: row.source_page_number,
      fileName,
      documentType,
      carrierName: carrierProfile.name,
      method: "carrier_table_row",
      confidenceTier: entryQualityToTier(reconstructions.find((entry) => (entry.rows || []).includes(row))?.quality || "moderate"),
      evidence: [`${row.key} extracted from charges table row`],
      candidates: row.provenance || [],
      sourcePageType: "charges_table",
    });
  });

  return { extractedFields, reconstructions };
}

function entryQualityToTier(quality = "weak") {
  if (quality === "strong") return "strong";
  if (quality === "moderate") return "moderate";
  if (quality === "weak") return "weak";
  return "none";
}

function parseSymetraAllocationPages(pageAnalyses, pages, carrierProfile, documentType, fileName = "") {
  const reconstructions = pageAnalyses
    .filter((page) => page.page_type === "allocation_table")
    .map((page) =>
      reconstructTableFromPage(pages[page.page_number - 1], {
        pageType: page.page_type,
        pageNumber: page.page_number,
        carrierKey: carrierProfile.key,
      })
    );

  const rows = reconstructions.flatMap((entry) => entry.rows || []);
  const allRows = reconstructions.flatMap((entry) => entry.all_rows || entry.rows || []);
  const extractedFields = {};
  const bestRow = rows[0] || null;

  if (bestRow?.strategy) {
    extractedFields.index_strategy = buildFieldResult({
      fieldKey: "index_strategy",
      value: bestRow.strategy,
      rawLabel: "strategy row",
      rawValue: bestRow.strategy,
      pageNumber: bestRow.source_page_number,
      fileName,
      documentType,
      carrierName: carrierProfile.name,
      method: "carrier_strategy_row",
      confidenceTier: entryQualityToTier(reconstructions[0]?.quality || "moderate"),
      evidence: ["strategy extracted from Symetra strategy row"],
      candidates: rows.slice(1, 4).map((row) => row.strategy),
      sourcePageType: "allocation_table",
    });
  }

  ["allocation_percent", "cap_rate", "participation_rate", "spread", "crediting_rate", "indexed_account_value", "fixed_account_value"].forEach((fieldKey) => {
    if (bestRow?.[fieldKey] === null || bestRow?.[fieldKey] === undefined) return;
    extractedFields[fieldKey] = buildFieldResult({
      fieldKey,
      value: bestRow[fieldKey],
      rawLabel: fieldKey.replace(/_/g, " "),
      rawValue: String(bestRow[fieldKey]),
      pageNumber: bestRow.source_page_number,
      fileName,
      documentType,
      carrierName: carrierProfile.name,
      method: "carrier_strategy_row",
      confidenceTier: entryQualityToTier(reconstructions[0]?.quality || "moderate"),
      evidence: [`${fieldKey} extracted from Symetra strategy row`],
      candidates: rows.slice(1, 4).map((row) => row[fieldKey]).filter((value) => value !== null && value !== undefined),
      sourcePageType: "allocation_table",
    });
  });

  return { extractedFields, reconstructions, strategyRows: rows, allStrategyRows: allRows };
}

function createCarrierParser(carrierProfile) {
  return {
    parseIllustrationLedger({ pageAnalyses, pages, documentType }) {
      return parseIllustrationLedgerPages(pageAnalyses, pages, carrierProfile, documentType);
    },
    parseStatementSummary({ pageAnalyses, pages, documentType, fileName }) {
      if (carrierProfile.key === "protective") {
        return parseProtectiveStatementSummary(pageAnalyses, pages, carrierProfile, documentType, fileName);
      }
      return parseByLabelMap(
        pageAnalyses,
        pages,
        carrierProfile.fieldLabels.statement_summary || {},
        carrierProfile,
        documentType,
        ["statement_summary"],
        fileName
      );
    },
    parseChargesTable({ pageAnalyses, pages, documentType, fileName }) {
      return parseChargesPages(pageAnalyses, pages, carrierProfile, documentType, fileName);
    },
    parseAllocationTable({ pageAnalyses, pages, documentType, fileName }) {
      if (carrierProfile.key === "symetra") {
        return parseSymetraAllocationPages(pageAnalyses, pages, carrierProfile, documentType, fileName);
      }
      const reconstructions = pageAnalyses
        .filter((page) => page.page_type === "allocation_table")
        .map((page) =>
          reconstructTableFromPage(pages[page.page_number - 1], {
            pageType: page.page_type,
            pageNumber: page.page_number,
            carrierKey: carrierProfile.key,
          })
        );
      const bestRow = reconstructions.flatMap((entry) => entry.rows || [])[0] || null;
      const extractedFields = {};
      if (bestRow?.strategy) {
        extractedFields.index_strategy = buildFieldResult({
          fieldKey: "index_strategy",
          value: bestRow.strategy,
          rawLabel: "strategy row",
          rawValue: bestRow.strategy,
          pageNumber: bestRow.source_page_number,
          fileName,
          documentType,
          carrierName: carrierProfile.name,
          method: "carrier_strategy_row",
          confidenceTier: entryQualityToTier(reconstructions[0]?.quality || "moderate"),
          evidence: ["strategy extracted from allocation table row"],
          sourcePageType: "allocation_table",
        });
      }
      ["allocation_percent", "cap_rate", "participation_rate", "spread", "crediting_rate"].forEach((fieldKey) => {
        if (bestRow?.[fieldKey] === null || bestRow?.[fieldKey] === undefined) return;
        extractedFields[fieldKey] = buildFieldResult({
          fieldKey,
          value: bestRow[fieldKey],
          rawLabel: fieldKey.replace(/_/g, " "),
          rawValue: String(bestRow[fieldKey]),
          pageNumber: bestRow.source_page_number,
          fileName,
          documentType,
          carrierName: carrierProfile.name,
          method: "carrier_strategy_row",
          confidenceTier: entryQualityToTier(reconstructions[0]?.quality || "moderate"),
          evidence: [`${fieldKey} extracted from allocation table row`],
          sourcePageType: "allocation_table",
        });
      });
      return { extractedFields, reconstructions, strategyRows: reconstructions.flatMap((entry) => entry.rows || []) };
    },
    parseIllustrationSummary({ pageAnalyses, pages, documentType, fileName }) {
      return parseByLabelMap(
        pageAnalyses,
        pages,
        carrierProfile.fieldLabels.illustration_summary || {},
        carrierProfile,
        documentType,
        ["illustration_summary"],
        fileName
      );
    },
  };
}

export const CARRIER_SPECIFIC_PARSERS = Object.fromEntries(
  Object.values(CARRIER_PARSING_PROFILES).map((profile) => [profile.key, createCarrierParser(profile)])
);

export function parseCarrierSpecificDocument({ pages, fileName = "", documentType = "", carrierName = "" }) {
  const carrierProfile = resolveCarrierParsingProfile(carrierName, pages);
  const pageAnalyses = detectDocumentPageTypes(pages, carrierProfile);

  if (!carrierProfile) {
    return {
      carrierProfile: null,
      parserUsed: "generic_fallback",
      pageAnalyses,
      extractedFields: {},
      illustrationProjection: null,
      tableReconstructions: [],
      failedPages: pageAnalyses.filter((page) => page.page_type === "unknown").map((page) => page.page_number),
      strategyRows: [],
      extractionSummary: {
        carrier_key: null,
        parser_used: "generic_fallback",
        field_count: 0,
        table_count: 0,
        strategy_row_count: 0,
      },
    };
  }

  const parser = CARRIER_SPECIFIC_PARSERS[carrierProfile.key];
  const illustrationSummaryFields = parser.parseIllustrationSummary({ pageAnalyses, pages, documentType, fileName }) || {};
  const statementSummaryFields = parser.parseStatementSummary({ pageAnalyses, pages, documentType, fileName }) || {};
  const chargesResult = parser.parseChargesTable({ pageAnalyses, pages, documentType, fileName }) || { extractedFields: {}, reconstructions: [] };
  const allocationResult =
    parser.parseAllocationTable({ pageAnalyses, pages, documentType, fileName }) || { extractedFields: {}, reconstructions: [], strategyRows: [] };
  const ledgerResult = parser.parseIllustrationLedger({ pageAnalyses, pages, documentType, fileName }) || { illustrationProjection: null, reconstructions: [] };

  const extractedFields = {
    ...illustrationSummaryFields,
    ...statementSummaryFields,
    ...chargesResult.extractedFields,
    ...allocationResult.extractedFields,
  };
  const tableReconstructions = [...chargesResult.reconstructions, ...allocationResult.reconstructions, ...(ledgerResult.reconstructions || [])];

  return {
    carrierProfile,
    parserUsed: `${carrierProfile.key}_carrier_specific`,
    pageAnalyses,
    extractedFields,
    illustrationProjection: ledgerResult.illustrationProjection,
    tableReconstructions,
    failedPages: pageAnalyses.filter((page) => page.page_type === "unknown").map((page) => page.page_number),
    strategyRows: allocationResult.strategyRows || [],
    allStrategyRows: allocationResult.allStrategyRows || allocationResult.strategyRows || [],
    extractionSummary: {
      carrier_key: carrierProfile.key,
      parser_used: `${carrierProfile.key}_carrier_specific`,
      field_count: Object.values(extractedFields).filter((field) => field && !field.missing).length,
      table_count: tableReconstructions.length,
      strategy_row_count: (allocationResult.strategyRows || []).length,
    },
    fileName,
  };
}
