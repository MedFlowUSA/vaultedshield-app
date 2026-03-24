import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import { createEmptyRetirementSchema } from "../../domain/retirement";
import { RETIREMENT_FIELD_DICTIONARY, RETIREMENT_FIELD_KEYS } from "./retirementFieldDictionary";
import { classifyRetirementDocument } from "./retirementClassifier";
import {
  RETIREMENT_POSITION_ASSET_CLASS_HINTS,
  RETIREMENT_POSITION_NAME_HINTS,
  RETIREMENT_POSITION_ROW_HINTS,
  RETIREMENT_POSITION_SECTION_PATTERNS,
} from "./retirementPositionDictionary";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function splitLines(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeCurrency(value) {
  const match = String(value || "").match(/\(?\$?\s*-?[\d,]+(?:\.\d{2})?\)?/);
  if (!match) return null;
  const raw = match[0].trim();
  const negative = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[,$()\s]/g, "");
  const amount = Number(cleaned);
  if (Number.isNaN(amount)) return null;
  return {
    value: negative ? -amount : amount,
    display_value: `${negative ? "-" : ""}$${Math.abs(amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
  };
}

function normalizeDate(value) {
  const match = String(value || "").match(
    /([A-Za-z]+ \d{1,2}, \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/
  );
  if (!match) return null;
  const raw = match[1];
  const parsed = new Date(raw);
  return {
    value: Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10),
    display_value: raw,
  };
}

function normalizeInteger(value) {
  const match = String(value || "").match(/\b\d{1,3}\b/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (Number.isNaN(parsed)) return null;
  return { value: parsed, display_value: String(parsed) };
}

function normalizeAccountNumber(value) {
  const match = String(value || "").match(/([*xX#-]{0,8}\d{2,6}|\d{2,4}[-*xX#]+\d{2,4})/);
  if (!match) return null;
  return {
    value: match[1],
    display_value: match[1],
  };
}

function normalizeName(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.length < 4 || normalized.length > 60) return null;
  if (/\d{2,}/.test(normalized)) return null;
  if (!/^[A-Za-z][A-Za-z ,.'-]+$/.test(normalized)) return null;
  return { value: normalized, display_value: normalized };
}

function normalizeBoolean(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (/(yes|on file|listed|designated|primary beneficiary|contingent beneficiary)/.test(normalized)) {
    return { value: true, display_value: "Yes" };
  }
  if (/(no|none|not on file|missing)/.test(normalized)) {
    return { value: false, display_value: "No" };
  }
  return null;
}

function normalizeEnum(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return { value: normalized, display_value: normalized };
}

function normalizeNumber(value) {
  const match = String(value || "").match(/-?[\d,]+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/,/g, ""));
  if (Number.isNaN(parsed)) return null;
  return { value: parsed, display_value: match[0] };
}

function normalizePercent(value) {
  const match = String(value || "").match(/-?[\d,]+(?:\.\d+)?\s*%/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/[,%\s]/g, ""));
  if (Number.isNaN(parsed)) return null;
  return { value: parsed, display_value: `${parsed}%` };
}

function normalizeValue(rawValue, type) {
  if (!rawValue) return null;
  if (type === "currency") return normalizeCurrency(rawValue);
  if (type === "date") return normalizeDate(rawValue);
  if (type === "integer") return normalizeInteger(rawValue);
  if (type === "number") return normalizeNumber(rawValue);
  if (type === "percent") return normalizePercent(rawValue);
  if (type === "accountNumber") return normalizeAccountNumber(rawValue);
  if (type === "name") return normalizeName(rawValue);
  if (type === "boolean") return normalizeBoolean(rawValue);
  if (type === "enum") return normalizeEnum(rawValue);

  const normalized = normalizeText(rawValue);
  if (!normalized) return null;
  return { value: normalized, display_value: normalized };
}

function buildFieldResult({
  normalizedKey,
  rawLabel,
  rawValue,
  method,
  confidence,
  pageNumber,
  providerHint,
  documentClassKey,
}) {
  const dictionary = RETIREMENT_FIELD_DICTIONARY[normalizedKey];
  const normalized = normalizeValue(rawValue, dictionary?.type || "text");
  if (!normalized) return null;

  return {
    normalized_key: normalizedKey,
    value: normalized.value,
    display_value: normalized.display_value,
    raw_label: rawLabel,
    raw_value: rawValue,
    extraction_method: method,
    confidence,
    page_number: pageNumber,
    provider_hint: providerHint || "",
    document_class_key: documentClassKey || null,
  };
}

function tryExactSameLine(lines, normalizedKey, aliases, pageNumber, providerHint, documentClassKey) {
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase();
      const directIndex = lowerLine.indexOf(normalizedAlias);
      if (directIndex < 0) continue;

      const suffix = line.slice(directIndex + normalizedAlias.length).replace(/^[:\-\s]+/, "");
      if (!suffix) continue;

      const field = buildFieldResult({
        normalizedKey,
        rawLabel: alias,
        rawValue: suffix,
        method: "exact_same_line",
        confidence: "high",
        pageNumber,
        providerHint,
        documentClassKey,
      });

      if (field) return field;
    }
  }

  return null;
}

function tryExactNextLine(lines, normalizedKey, aliases, pageNumber, providerHint, documentClassKey) {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index].toLowerCase();
    for (const alias of aliases) {
      if (line === alias.toLowerCase() || line === `${alias.toLowerCase()}:`) {
        const nextLine = lines[index + 1];
        const field = buildFieldResult({
          normalizedKey,
          rawLabel: alias,
          rawValue: nextLine,
          method: "exact_next_line",
          confidence: "high",
          pageNumber,
          providerHint,
          documentClassKey,
        });

        if (field) return field;
      }
    }
  }

  return null;
}

function tryFuzzySameLine(lines, normalizedKey, aliases, pageNumber, providerHint, documentClassKey) {
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase();
      if (!lowerLine.includes(normalizedAlias)) continue;
      const suffix = line.split(/[:\-]/).slice(1).join(":").trim();
      if (!suffix) continue;

      const field = buildFieldResult({
        normalizedKey,
        rawLabel: alias,
        rawValue: suffix,
        method: "fuzzy_same_line",
        confidence: "medium",
        pageNumber,
        providerHint,
        documentClassKey,
      });

      if (field) return field;
    }
  }

  return null;
}

function tryFuzzyNextLine(lines, normalizedKey, aliases, pageNumber, providerHint, documentClassKey) {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index].toLowerCase();
    for (const alias of aliases) {
      if (!line.includes(alias.toLowerCase())) continue;
      const nextLine = lines[index + 1];

      const field = buildFieldResult({
        normalizedKey,
        rawLabel: alias,
        rawValue: nextLine,
        method: "fuzzy_next_line",
        confidence: "medium",
        pageNumber,
        providerHint,
        documentClassKey,
      });

      if (field) return field;
    }
  }

  return null;
}

function trySectionInference(fullText, normalizedKey, pageNumber, providerHint, documentClassKey) {
  const text = normalizeText(fullText);
  if (!text) return null;

  if (normalizedKey === "beneficiary_present") {
    if (/primary beneficiary|contingent beneficiary|beneficiary designation/i.test(text)) {
      return buildFieldResult({
        normalizedKey,
        rawLabel: "beneficiary_section",
        rawValue: "Yes",
        method: "section_based_inference",
        confidence: "medium",
        pageNumber,
        providerHint,
        documentClassKey,
      });
    }
  }

  if (normalizedKey === "primary_beneficiary_name") {
    const match = text.match(/primary beneficiary[:\s]+([A-Z][A-Za-z ,.'-]{2,50})/i);
    if (match) {
      return buildFieldResult({
        normalizedKey,
        rawLabel: "primary beneficiary",
        rawValue: match[1],
        method: "section_based_inference",
        confidence: "medium",
        pageNumber,
        providerHint,
        documentClassKey,
      });
    }
  }

  if (normalizedKey === "contingent_beneficiary_name") {
    const match = text.match(/contingent beneficiary[:\s]+([A-Z][A-Za-z ,.'-]{2,50})/i);
    if (match) {
      return buildFieldResult({
        normalizedKey,
        rawLabel: "contingent beneficiary",
        rawValue: match[1],
        method: "section_based_inference",
        confidence: "medium",
        pageNumber,
        providerHint,
        documentClassKey,
      });
    }
  }

  if (normalizedKey === "statement_date") {
    const match = text.match(/(statement date|period ending|as of)[:\s]+([A-Za-z]+ \d{1,2}, \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (match) {
      return buildFieldResult({
        normalizedKey,
        rawLabel: match[1],
        rawValue: match[2],
        method: "section_based_inference",
        confidence: "medium",
        pageNumber,
        providerHint,
        documentClassKey,
      });
    }
  }

  return null;
}

function pickBestFieldCandidate(candidates) {
  const rank = { high: 3, medium: 2, low: 1 };
  return candidates
    .filter(Boolean)
    .sort((a, b) => (rank[b.confidence] || 0) - (rank[a.confidence] || 0))[0] || null;
}

function extractFieldFromPages({ pageTexts, fullText, normalizedKey, aliases, providerHint, documentClassKey }) {
  const candidates = [];

  pageTexts.forEach((pageText, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const lines = splitLines(pageText);
    candidates.push(
      tryExactSameLine(lines, normalizedKey, aliases, pageNumber, providerHint, documentClassKey),
      tryExactNextLine(lines, normalizedKey, aliases, pageNumber, providerHint, documentClassKey),
      tryFuzzySameLine(lines, normalizedKey, aliases, pageNumber, providerHint, documentClassKey),
      tryFuzzyNextLine(lines, normalizedKey, aliases, pageNumber, providerHint, documentClassKey)
    );
  });

  candidates.push(
    trySectionInference(fullText, normalizedKey, 1, providerHint, documentClassKey)
  );

  return pickBestFieldCandidate(candidates);
}

function buildCompletenessAssessment(extractedFieldMap) {
  const requiredFields = [
    "statement_date",
    "current_balance",
    "plan_name",
    "institution_name",
    "monthly_benefit_estimate",
    "beneficiary_present",
  ];
  const captured = requiredFields.filter((fieldKey) => extractedFieldMap[fieldKey]);
  const missing = requiredFields.filter((fieldKey) => !extractedFieldMap[fieldKey]);
  const ratio = captured.length / requiredFields.length;

  return {
    status: ratio >= 0.66 ? "moderate" : ratio >= 0.33 ? "limited" : "minimal",
    required_sections: [
      "account_identity",
      "balance_metrics",
      "beneficiary_metrics",
      "pension_metrics",
      "statement_context",
    ],
    captured_sections: [
      extractedFieldMap.plan_name || extractedFieldMap.statement_date ? "account_identity" : null,
      extractedFieldMap.current_balance || extractedFieldMap.monthly_benefit_estimate ? "balance_metrics" : null,
      extractedFieldMap.beneficiary_present ? "beneficiary_metrics" : null,
      extractedFieldMap.accrued_monthly_benefit || extractedFieldMap.normal_retirement_age ? "pension_metrics" : null,
      "statement_context",
    ].filter(Boolean),
    missing_sections: [
      !extractedFieldMap.plan_name && !extractedFieldMap.statement_date ? "account_identity" : null,
      !extractedFieldMap.current_balance && !extractedFieldMap.monthly_benefit_estimate ? "balance_metrics" : null,
      !extractedFieldMap.beneficiary_present ? "beneficiary_metrics" : null,
      !extractedFieldMap.accrued_monthly_benefit && !extractedFieldMap.normal_retirement_age
        ? "pension_metrics"
        : null,
    ].filter(Boolean),
    missing_fields: missing,
    captured_field_count: Object.keys(extractedFieldMap).length,
    required_field_count: requiredFields.length,
  };
}

function buildStatementPeriod(fullText) {
  const match = normalizeText(fullText).match(
    /(for the period|period ending|statement period)[:\s]+([A-Za-z0-9 ,\-\/]+)/
  );
  return match ? match[2] : null;
}

function applyExtractedField(schema, field) {
  if (!field) return;
  const definition = RETIREMENT_FIELD_DICTIONARY[field.normalized_key];
  if (!definition?.group) return;
  schema[definition.group][field.normalized_key] = field.value;
}

function normalizePositionName(value) {
  return normalizeText(value)
    .replace(/\s{2,}/g, " ")
    .replace(/\b(?:shares?|units?|unit value|price|current value|market value|allocation|gain\/loss|net change)\b.*$/i, "")
    .replace(/[-:|]+$/, "")
    .trim();
}

function inferAssetClass(positionName, sourceSection) {
  const haystack = `${positionName || ""} ${sourceSection || ""}`.toLowerCase();
  for (const [assetClass, labels] of Object.entries(RETIREMENT_POSITION_ASSET_CLASS_HINTS)) {
    if (labels.some((label) => haystack.includes(label))) {
      return assetClass;
    }
  }
  return null;
}

function inferPositionType(positionName, sourceSection) {
  const haystack = `${positionName || ""} ${sourceSection || ""}`.toLowerCase();
  for (const [positionType, labels] of Object.entries(RETIREMENT_POSITION_NAME_HINTS)) {
    if (labels.some((label) => haystack.includes(label))) {
      return positionType;
    }
  }
  if (/fund|index|portfolio|trust|equity|bond|market/i.test(positionName || "")) {
    return "fund";
  }
  return "unknown";
}

function inferTargetYear(positionName) {
  const match = String(positionName || "").match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function extractTickerSymbol(rawRow, positionName) {
  const row = String(rawRow || "");
  const parenMatch = row.match(/\(([A-Z]{1,5})\)/);
  if (parenMatch) return parenMatch[1];

  const upperMatch = row.match(/\b([A-Z]{3,5})\b/);
  if (upperMatch && !String(positionName || "").includes(upperMatch[1])) {
    return upperMatch[1];
  }

  return null;
}

function findPositionSectionName(line, currentSection) {
  const normalizedLine = normalizeText(line).toLowerCase();
  if (RETIREMENT_POSITION_SECTION_PATTERNS.some((pattern) => normalizedLine.includes(pattern))) {
    return line;
  }
  return currentSection;
}

function looksLikePositionRow(line) {
  const normalizedLine = normalizeText(line);
  if (!normalizedLine) return false;
  if (normalizedLine.length < 12) return false;
  const lower = normalizedLine.toLowerCase();
  if (RETIREMENT_POSITION_ROW_HINTS.some((hint) => lower === hint || lower.startsWith(`${hint} `))) {
    return false;
  }
  const hasName = /[A-Za-z]{4,}/.test(normalizedLine);
  const hasMetric = /\$[\d,]+(?:\.\d+)?|[\d.]+\s*%|\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/.test(normalizedLine);
  const looksLikeHeading = /^(total|totals|summary|balance summary|investment option|fund name|current value|allocation)/i.test(
    normalizedLine
  );
  return hasName && hasMetric && !looksLikeHeading;
}

function extractMetricMatches(rawRow) {
  const currencyMatches = [...String(rawRow || "").matchAll(/\(?\$?\s*-?[\d,]+(?:\.\d{2})?\)?/g)].map(
    (match) => normalizeCurrency(match[0])?.value
  ).filter((value) => value !== null && value !== undefined);
  const percentMatches = [...String(rawRow || "").matchAll(/-?[\d,]+(?:\.\d+)?\s*%/g)].map(
    (match) => normalizePercent(match[0])?.value
  ).filter((value) => value !== null && value !== undefined);
  const numberMatches = [...String(rawRow || "").matchAll(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g)].map(
    (match) => normalizeNumber(match[0])?.value
  ).filter((value) => value !== null && value !== undefined);

  return {
    currencyMatches,
    percentMatches,
    numberMatches,
  };
}

function extractPositionName(rawRow) {
  const match = String(rawRow || "").match(
    /^([A-Za-z][A-Za-z0-9&.,/'()\- ]*[A-Za-z)])(?=\s+(?:\(?\$?\s*-?[\d,]+(?:\.\d{2})?\)?|-?[\d,]+(?:\.\d+)?%|\d{1,3}(?:,\d{3})*(?:\.\d+)?))/ 
  );
  const candidate = match?.[1] || String(rawRow || "").split(/\s{2,}/)[0] || "";
  return normalizePositionName(candidate);
}

function buildPositionRecord(rawRow, sourceSection, pageNumber) {
  if (!looksLikePositionRow(rawRow)) {
    return { position: null, skipped: true };
  }

  const positionName = extractPositionName(rawRow);
  if (!positionName || positionName.length < 4) {
    return { position: null, skipped: true };
  }

  const { currencyMatches, percentMatches, numberMatches } = extractMetricMatches(rawRow);
  const currentValue = currencyMatches.length > 0 ? currencyMatches[currencyMatches.length - 1] : null;
  const unitValue = currencyMatches.length > 1 ? currencyMatches[currencyMatches.length - 2] : null;
  const allocationPercent = percentMatches.length > 0 ? percentMatches[percentMatches.length - 1] : null;
  const units =
    numberMatches.length > 0 && unitValue !== null
      ? numberMatches.find((value) => value !== unitValue && value !== currentValue)
      : null;
  const gainLoss =
    currencyMatches.length > 2
      ? currencyMatches[currencyMatches.length - 3]
      : null;

  if (currentValue === null && allocationPercent === null) {
    return { position: null, skipped: true };
  }

  const positionType = inferPositionType(positionName, sourceSection);
  const assetClass = inferAssetClass(positionName, sourceSection);
  const targetYear = inferTargetYear(positionName);
  const tickerSymbol = extractTickerSymbol(rawRow, positionName);
  const confidence =
    currentValue !== null && allocationPercent !== null
      ? "high"
      : currentValue !== null || allocationPercent !== null
        ? "medium"
        : "low";

  return {
    skipped: false,
    position: {
      position_type: positionType,
      position_name: positionName,
      ticker_symbol: tickerSymbol,
      asset_class: assetClass,
      units: units ?? null,
      unit_value: unitValue ?? null,
      current_value: currentValue ?? null,
      allocation_percent: allocationPercent ?? null,
      gain_loss: gainLoss ?? null,
      source_section: sourceSection || null,
      raw_row: rawRow,
      confidence,
      target_year: targetYear,
      page_number: pageNumber,
    },
  };
}

function extractRetirementPositions(pageTexts) {
  const positions = [];
  const rawRows = [];
  let skippedRowCount = 0;

  pageTexts.forEach((pageText, pageIndex) => {
    const lines = splitLines(pageText);
    let currentSection = "";

    lines.forEach((line) => {
      currentSection = findPositionSectionName(line, currentSection);
      if (!looksLikePositionRow(line)) {
        return;
      }

      rawRows.push({
        raw_row: line,
        source_section: currentSection || null,
        page_number: pageIndex + 1,
      });

      const result = buildPositionRecord(line, currentSection, pageIndex + 1);
      if (result.skipped || !result.position) {
        skippedRowCount += 1;
        return;
      }

      positions.push(result.position);
    });
  });

  const uniquePositions = [];
  const seen = new Set();

  positions.forEach((position) => {
    const dedupeKey = [
      position.position_name,
      position.current_value,
      position.allocation_percent,
      position.page_number,
    ].join("|");
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    uniquePositions.push(position);
  });

  const topHolding = uniquePositions
    .filter((position) => position.current_value !== null && position.current_value !== undefined)
    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))[0] || null;

  const concentrationNote =
    uniquePositions.some((position) => (position.allocation_percent || 0) >= 60)
      ? "Possible concentration detected from parsed allocation data."
      : null;

  return {
    positions: uniquePositions,
    summary: {
      parsed_position_count: uniquePositions.length,
      raw_position_row_count: rawRows.length,
      skipped_position_row_count: skippedRowCount,
      top_holding_name: topHolding?.position_name || null,
      top_holding_value: topHolding?.current_value ?? null,
      concentration_note: concentrationNote,
    },
    rawRows,
  };
}

export async function extractRetirementDocumentText(file) {
  if (!file) {
    return { rawText: "", pageTexts: [], pageCount: 0, errorSummary: "No file provided" };
  }

  try {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pageTexts = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        pageTexts.push(textContent.items.map((item) => item.str).join("\n"));
      }

      return {
        rawText: pageTexts.join("\n\n"),
        pageTexts,
        pageCount: pageTexts.length,
        errorSummary: "",
      };
    }

    const rawText = await file.text();
    return {
      rawText,
      pageTexts: rawText ? [rawText] : [],
      pageCount: rawText ? 1 : 0,
      errorSummary: "",
    };
  } catch (error) {
    return {
      rawText: "",
      pageTexts: [],
      pageCount: 0,
      errorSummary: error?.message || "Document text extraction failed",
    };
  }
}

export async function extractRetirementDocumentTextFromBlob(blob, fileName = "document.pdf", mimeType = "") {
  const file = new File([blob], fileName, { type: mimeType || blob.type || "application/pdf" });
  return extractRetirementDocumentText(file);
}

function inferSnapshotType(documentClassKey) {
  if (documentClassKey === "pension_estimate") return "pension_estimate";
  if (documentClassKey === "beneficiary_designation") return "beneficiary_review";
  return "statement";
}

export function parseRetirementDocument({
  text,
  pageTexts,
  fileName,
  manualDocumentClassKey,
  manualProviderKey,
  manualRetirementTypeKey,
}) {
  const safePageTexts = Array.isArray(pageTexts) && pageTexts.length > 0 ? pageTexts : [text || ""];
  const fullText = text || safePageTexts.join("\n\n");
  const classifier = classifyRetirementDocument({
    text: fullText,
    fileName,
    manualDocumentClassKey,
    manualProviderKey,
    manualRetirementTypeKey,
  });

  const normalizedRetirement = createEmptyRetirementSchema();
  const extractedFields = {};

  RETIREMENT_FIELD_KEYS.forEach((fieldKey) => {
    const definition = RETIREMENT_FIELD_DICTIONARY[fieldKey];
    const field = extractFieldFromPages({
      pageTexts: safePageTexts,
      fullText,
      normalizedKey: fieldKey,
      aliases: definition.aliases,
      providerHint: classifier.provider_key,
      documentClassKey: classifier.document_class_key,
    });

    if (field) {
      extractedFields[fieldKey] = field;
      applyExtractedField(normalizedRetirement, field);
    }
  });

  normalizedRetirement.account_identity.account_type =
    classifier.retirement_type_key || manualRetirementTypeKey || null;
  normalizedRetirement.account_identity.institution_name =
    normalizedRetirement.account_identity.institution_name ||
    classifier.provider_profile?.display_name ||
    null;
  normalizedRetirement.account_identity.institution_key = classifier.provider_key || manualProviderKey || null;
  normalizedRetirement.statement_context.document_type =
    classifier.document_class_key || manualDocumentClassKey || null;
  normalizedRetirement.statement_context.statement_period = buildStatementPeriod(fullText);
  normalizedRetirement.statement_context.provider_confidence = classifier.confidence;

  const confidenceMap = Object.fromEntries(
    Object.entries(extractedFields).map(([key, field]) => [key, field.confidence])
  );
  const completenessAssessment = buildCompletenessAssessment(extractedFields);
  const positionExtraction = extractRetirementPositions(safePageTexts);
  normalizedRetirement.statement_context.extraction_confidence =
    Object.keys(extractedFields).length + positionExtraction.positions.length >= 8
      ? "medium"
      : Object.keys(extractedFields).length + positionExtraction.positions.length >= 4
        ? "low"
        : "low";
  normalizedRetirement.statement_context.completeness_assessment = completenessAssessment;

  return {
    classifier,
    snapshotType: inferSnapshotType(classifier.document_class_key),
    snapshotDate:
      normalizedRetirement.account_identity.statement_date ||
      extractedFields.statement_date?.value ||
      null,
    positions: positionExtraction.positions,
    positionSummary: positionExtraction.summary,
    normalizedRetirement,
    extractedFields,
    completenessAssessment,
    providerProfileSummary: {
      key: classifier.provider_key || null,
      display_name: classifier.provider_profile?.display_name || null,
      confidence: classifier.confidence,
      evidence: classifier.evidence,
    },
    extractionMeta: {
      classifier,
      extracted_fields: extractedFields,
      extracted_positions: positionExtraction.positions,
      position_summary: positionExtraction.summary,
      raw_position_rows: positionExtraction.rawRows,
      confidence_map: confidenceMap,
      file_name: fileName || null,
      page_count: safePageTexts.length,
    },
  };
}
