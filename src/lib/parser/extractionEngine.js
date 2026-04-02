import { createEmptyIulPolicyRecord } from "../iulSchema.js";
import { parseCarrierSpecificDocument } from "../domain/parsing/carrierSpecificParsers.js";
import { PARSER_DICTIONARY } from "./parserDictionary.js";

const CONFIDENCE_RANK = {
  low: 0,
  medium: 1,
  high: 2,
};

const F_AND_G_CARRIER_NAME = "F&G Life Insurance Company";
const ILLUSTRATION_IDENTITY_FIELDS = new Set([
  "carrier_name",
  "product_name",
  "policy_type",
  "policy_number",
  "issue_date",
  "death_benefit",
  "initial_face_amount",
  "planned_premium",
  "target_premium",
  "guaranteed_premium",
]);
const STATEMENT_IDENTITY_FIELDS = new Set([
  "carrier_name",
  "product_name",
  "policy_type",
  "policy_number",
  "statement_date",
  "policy_year",
  "death_benefit",
  "loan_balance",
]);
const FG_POLICY_INFO_FIELDS = new Set([
  "policy_number",
  "issue_date",
  "carrier_name",
  "product_name",
  "policy_type",
  "owner_name",
  "insured_name",
  "trustee_name",
  "ownership_structure",
  "primary_beneficiary_name",
  "contingent_beneficiary_name",
  "beneficiary_status",
  "death_benefit",
  "initial_face_amount",
  "option_type",
  "planned_premium",
  "annual_target_premium",
  "target_premium",
  "no_lapse_premium",
  "guaranteed_premium",
  "premium_class",
  "guideline_single_premium",
  "guideline_level_premium",
  "rate_class_percent",
  "premium_expense_charge_percent",
  "monthly_deduction",
  "guaranteed_minimum_interest",
]);
const FG_STATEMENT_SUMMARY_FIELDS = new Set([
  "accumulation_value",
  "cash_value",
  "cash_surrender_value",
  "death_benefit",
  "minimum_death_benefit",
  "loan_balance",
  "statement_date",
  "premium_paid",
  "policy_charges_total",
  "index_credit",
  "fixed_account_value",
  "indexed_account_value",
]);
const FG_MONTHLY_ACTIVITY_FIELDS = new Set([
  "premium_paid",
  "cost_of_insurance",
  "expense_charge",
  "rider_charge",
  "index_credit",
  "accumulation_value",
]);
const FG_SEGMENT_DETAIL_FIELDS = new Set([
  "index_strategy",
  "allocation_percent",
  "participation_rate",
  "cap_rate",
  "spread",
  "crediting_rate",
  "fixed_account_value",
  "indexed_account_value",
  "guaranteed_minimum_interest",
]);
const COVERAGE_CORE_FIELDS = new Set([
  "policy_number",
  "issue_date",
  "product_name",
  "carrier_name",
  "policy_type",
  "death_benefit",
  "initial_face_amount",
  "accumulation_value",
  "cash_value",
  "cash_surrender_value",
  "premium_paid",
  "policy_year",
  "statement_date",
  "loan_balance",
]);
const FG_FIELD_RECOVERY_TARGETS = new Set([
  "issue_date",
  "death_benefit",
  "minimum_death_benefit",
  "planned_premium",
  "accumulation_value",
  "cash_value",
  "cash_surrender_value",
  "loan_balance",
  "cost_of_insurance",
  "cap_rate",
  "product_name",
]);
const CHARGE_RELATED_FIELDS = new Set([
  "cost_of_insurance",
  "monthly_deduction",
  "expense_charge",
  "admin_fee",
  "rider_charge",
]);
const FOOTNOTE_SENSITIVE_FINANCIAL_FIELDS = new Set([
  "loan_balance",
  "cost_of_insurance",
  "expense_charge",
  "rider_charge",
  "admin_fee",
]);

function splitLines(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isLikelyIllustrationLedgerPage(lines) {
  const joined = lines.join(" ").toLowerCase();
  const headerSignals = [
    "policy year",
    "attained age",
    "accumulation value",
    "cash surrender value",
    "death benefit",
  ].filter((signal) => joined.includes(signal)).length;

  return headerSignals >= 3;
}

function looksLikeIllustrationLedgerCurrencyToken(token) {
  const normalized = String(token || "").trim();
  if (!normalized) return false;
  if (/\$\s*[\d,(]/.test(normalized)) return true;
  if (/[\d,]+\.\d{2}/.test(normalized)) return true;
  if (/^\(?\d{1,3}(,\d{3})+(\.\d{2})?\)?$/.test(normalized)) return true;
  return false;
}

function extractIllustrationLedger(pages = []) {
  const rowsByYear = new Map();

  pages.forEach((pageText, pageIndex) => {
    const lines = splitLines(pageText);
    if (!isLikelyIllustrationLedgerPage(lines)) return;

    for (let index = 0; index < lines.length; index += 1) {
      const yearCandidate = normalizeInteger(lines[index] || "");
      if (!yearCandidate || yearCandidate.value < 1 || yearCandidate.value > 120) continue;

      let cursor = index + 1;
      let attainedAge = null;
      const ageCandidate = normalizeInteger(lines[cursor] || "");
      if (ageCandidate && ageCandidate.value >= 0 && ageCandidate.value <= 120) {
        attainedAge = ageCandidate;
        cursor += 1;
      }

      const currencyTokens = [];
      const rawWindow = [lines[index]];
      while (cursor < lines.length && rawWindow.length < 12 && currencyTokens.length < 6) {
        const token = lines[cursor];
        if (!token) break;

        const nextYearCandidate = normalizeInteger(token);
        const nextAgeCandidate = normalizeInteger(lines[cursor + 1] || "");
        if (
          currencyTokens.length >= 3 &&
          nextYearCandidate &&
          nextYearCandidate.value >= 1 &&
          nextYearCandidate.value <= 120 &&
          nextAgeCandidate &&
          nextAgeCandidate.value >= 0 &&
          nextAgeCandidate.value <= 120
        ) {
          break;
        }

        if (
          rawWindow.length > 1 &&
          /^(policy year|attained age|premium outlay|premium|accumulation value|cash surrender value|death benefit|guaranteed|illustrated)$/i.test(
            token
          )
        ) {
          break;
        }

        const currency = looksLikeIllustrationLedgerCurrencyToken(token) ? normalizeCurrency(token) : null;
        if (currency) {
          currencyTokens.push(currency);
        }

        rawWindow.push(token);
        cursor += 1;
      }

      if (currencyTokens.length < 3) continue;

      const row = {
        policy_year: yearCandidate.value,
        policy_year_display: yearCandidate.display,
        attained_age: attainedAge?.value ?? null,
        premium_outlay: currencyTokens[0] || null,
        accumulation_value: currencyTokens[1] || null,
        cash_surrender_value: currencyTokens[2] || null,
        death_benefit: currencyTokens[currencyTokens.length - 1] || null,
        source_page_number: pageIndex + 1,
        token_count: currencyTokens.length,
      };

      const existing = rowsByYear.get(row.policy_year);
      if (!existing || row.token_count > existing.token_count) {
        rowsByYear.set(row.policy_year, row);
      }

      index = Math.max(index, cursor - 1);
    }
  });

  const rows = [...rowsByYear.values()].sort((left, right) => left.policy_year - right.policy_year);
  const benchmarkTargets = [5, 10, 20, 30];
  const benchmarkRows = benchmarkTargets
    .map((target) => rows.find((row) => row.policy_year === target) || rows.find((row) => row.policy_year > target) || null)
    .filter(Boolean)
    .filter((row, index, collection) => collection.findIndex((candidate) => candidate.policy_year === row.policy_year) === index);

  return {
    row_count: rows.length,
    rows,
    benchmark_rows: benchmarkRows,
    page_numbers: [...new Set(rows.map((row) => row.source_page_number))],
    comparison_support_available: rows.length > 0,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").replace(/^[:\-]+/, "").trim();
}

function normalizeFreeText(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/^[\s:,\-]+/, "").trim();
}

function looksLikeBeneficiaryHeaderValue(value) {
  const normalized = normalizeFreeText(value).toLowerCase();
  if (!normalized) return false;
  return /^(designation|designation schedule|information|schedule|record|allocation)$/.test(normalized);
}

function buildDerivedTextField({
  normalizedKey,
  rawLabel,
  rawValue,
  pageNumber,
  method,
  carrierHint,
  documentType,
  confidenceScore,
  evidence,
  sourcePageType = "",
  sourcePriority = 0,
}) {
  const cleaned = normalizeFreeText(rawValue);
  if (!cleaned) return null;
  return buildDerivedField({
    normalizedKey,
    rawLabel,
    rawValue: cleaned,
    type: "text",
    pageNumber,
    method,
    carrierHint,
    documentType,
    confidenceScore,
    evidence,
    sourcePageType,
    sourcePriority,
  });
}

function extractNamedPartyFallback(pages, normalizedKey, labels = [], { carrierName = "", documentType = "" } = {}) {
  const labelPattern = labels.map((label) => escapeRegExp(label)).join("|");
  if (!labelPattern) return null;

  for (let pageIndex = 0; pageIndex < Math.min(pages.length, 6); pageIndex += 1) {
    const pageText = pages[pageIndex];
    const sourcePageType = getPageSourceType(carrierName, documentType, pageText);
    const patterns = [
      new RegExp(`(?:${labelPattern})\\s*[:\\-]\\s*([^\\n\\r]{2,80})`, "i"),
      new RegExp(`(?:${labelPattern})\\s{2,}([^\\n\\r]{2,80})`, "i"),
    ];

    for (const regex of patterns) {
      const match = pageText.match(regex);
      if (!match) continue;
      const candidate = normalizeFreeText(match[1]);
      if (!candidate || /^(yes|no|n\/a|none|same as insured)$/i.test(candidate)) continue;
      if (/[$%]/.test(candidate)) continue;
      return buildDerivedTextField({
        normalizedKey,
        rawLabel: labels[0],
        rawValue: candidate,
        pageNumber: pageIndex + 1,
        method: "section_based_inference",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.82,
        evidence: ["matched labeled party line fallback"],
        sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, sourcePageType),
      });
    }
  }

  return null;
}

function extractBeneficiaryShareFallback(pages, normalizedKey, labels = [], { carrierName = "", documentType = "" } = {}) {
  const labelPattern = labels.map((label) => escapeRegExp(label)).join("|");
  if (!labelPattern) return null;

  for (let pageIndex = 0; pageIndex < Math.min(pages.length, 6); pageIndex += 1) {
    const pageText = pages[pageIndex];
    const sourcePageType = getPageSourceType(carrierName, documentType, pageText);
    const patterns = [
      new RegExp(`(?:${labelPattern})[^\\n\\r%]{0,60}?(\\d{1,3}(?:\\.\\d+)?)\\s*%`, "i"),
      new RegExp(`(?:${labelPattern})\\s*[:\\-]\\s*(\\d{1,3}(?:\\.\\d+)?)\\s*%`, "i"),
    ];

    for (const regex of patterns) {
      const match = pageText.match(regex);
      if (!match) continue;
      return buildDerivedField({
        normalizedKey,
        rawLabel: labels[0],
        rawValue: `${match[1]}%`,
        type: "percent",
        pageNumber: pageIndex + 1,
        method: "section_based_inference",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.8,
        evidence: ["matched beneficiary share fallback"],
        sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, sourcePageType),
      });
    }
  }

  return null;
}

function extractBeneficiaryScheduleFallbacks(pages, { carrierName = "", documentType = "" } = {}) {
  const derivedFields = {};
  const roleConfigs = [
    {
      role: "primary",
      rolePattern: "(?:primary|first)",
      nameKey: "primary_beneficiary_name",
      shareKey: "primary_beneficiary_share",
    },
    {
      role: "contingent",
      rolePattern: "(?:contingent|secondary|alternate|successor)",
      nameKey: "contingent_beneficiary_name",
      shareKey: "contingent_beneficiary_share",
    },
  ];

  for (let pageIndex = 0; pageIndex < Math.min(pages.length, 8); pageIndex += 1) {
    const pageText = String(pages[pageIndex] || "");
    if (!/\bbeneficiar(?:y|ies)\b/i.test(pageText)) continue;

    const sourcePageType = getPageSourceType(carrierName, documentType, pageText);
    const lines = splitLines(pageText);
    let scheduleDetected = /beneficiary (?:designation|information|schedule|record|distribution|allocation)/i.test(pageText);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (!scheduleDetected && /\bbeneficiar(?:y|ies)\b/i.test(line)) {
        scheduleDetected = true;
        continue;
      }
      if (!scheduleDetected) continue;

      roleConfigs.forEach(({ role, rolePattern, nameKey, shareKey }) => {
        const rowRegex = new RegExp(
          `^${rolePattern}\\s+(?:beneficiar(?:y|ies)\\s+)?(.+?)\\s+(\\d{1,3}(?:\\.\\d+)?)\\s*%$`,
          "i"
        );
        const rowMatch = line.match(rowRegex);
        if (rowMatch) {
          if (!derivedFields[nameKey]) {
            derivedFields[nameKey] = buildDerivedTextField({
              normalizedKey: nameKey,
              rawLabel: `${role} beneficiary`,
              rawValue: rowMatch[1],
              pageNumber: pageIndex + 1,
              method: "section_based_inference",
              carrierHint: carrierName,
              documentType,
              confidenceScore: 0.8,
              evidence: ["matched beneficiary schedule row"],
              sourcePageType,
              sourcePriority: getSourcePriority(carrierName, nameKey, sourcePageType),
            });
          }
          if (!derivedFields[shareKey]) {
            derivedFields[shareKey] = buildDerivedField({
              normalizedKey: shareKey,
              rawLabel: `${role} beneficiary share`,
              rawValue: `${rowMatch[2]}%`,
              type: "percent",
              pageNumber: pageIndex + 1,
              method: "section_based_inference",
              carrierHint: carrierName,
              documentType,
              confidenceScore: 0.8,
              evidence: ["matched beneficiary schedule row"],
              sourcePageType,
              sourcePriority: getSourcePriority(carrierName, shareKey, sourcePageType),
            });
          }
        }
      });
    }

    if (Object.keys(derivedFields).length > 0) {
      if (!derivedFields.beneficiary_status) {
        derivedFields.beneficiary_status = buildDerivedTextField({
          normalizedKey: "beneficiary_status",
          rawLabel: "beneficiary status",
          rawValue: "Beneficiary designation visible",
          pageNumber: pageIndex + 1,
          method: "section_based_inference",
          carrierHint: carrierName,
          documentType,
          confidenceScore: 0.72,
          evidence: ["matched beneficiary schedule section"],
          sourcePageType,
          sourcePriority: getSourcePriority(carrierName, "beneficiary_status", sourcePageType),
        });
      }
      break;
    }
  }

  return derivedFields;
}

function applyDerivedPartyFieldFallbacks(fieldMap, pages, carrierName, documentType) {
  const nextFields = { ...fieldMap };
  const fallbackConfigs = [
    { key: "joint_insured_name", labels: ["joint insured", "co-insured", "additional insured", "second insured"] },
    { key: "payor_name", labels: ["payor", "payer", "premium payor", "premium payer", "payor name"] },
    { key: "trust_name", labels: ["trust name", "owner trust", "trust owner name"] },
  ];

  fallbackConfigs.forEach(({ key, labels }) => {
    if (!nextFields[key] || nextFields[key].missing) {
      const derived = extractNamedPartyFallback(pages, key, labels, { carrierName, documentType });
      if (derived) nextFields[key] = derived;
    }
  });

  if (!nextFields.primary_beneficiary_share || nextFields.primary_beneficiary_share.missing) {
    const derived = extractBeneficiaryShareFallback(
      pages,
      "primary_beneficiary_share",
      ["primary beneficiary", "primary beneficiary name", "primary beneficiary share"],
      { carrierName, documentType }
    );
    if (derived) nextFields.primary_beneficiary_share = derived;
  }

  if (!nextFields.contingent_beneficiary_share || nextFields.contingent_beneficiary_share.missing) {
    const derived = extractBeneficiaryShareFallback(
      pages,
      "contingent_beneficiary_share",
      ["contingent beneficiary", "secondary beneficiary", "alternate beneficiary", "contingent beneficiary share"],
      { carrierName, documentType }
    );
    if (derived) nextFields.contingent_beneficiary_share = derived;
  }

  const scheduleFallbacks = extractBeneficiaryScheduleFallbacks(pages, { carrierName, documentType });
  Object.entries(scheduleFallbacks).forEach(([key, derivedField]) => {
    const existingField = nextFields[key];
    const shouldReplaceHeaderLikeValue =
      /beneficiary_name|beneficiary_status/.test(key) &&
      existingField &&
      !existingField.missing &&
      looksLikeBeneficiaryHeaderValue(existingField.value ?? existingField.display_value);

    if (((!existingField || existingField.missing) || shouldReplaceHeaderLikeValue) && derivedField) {
      nextFields[key] = derivedField;
    }
  });

  return nextFields;
}

function cleanNumericToken(value, type) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (type === "percent") {
    const match = raw.match(/-?[\d.]+%/);
    return match ? match[0] : raw;
  }

  if (type === "currency") {
    const match = raw.match(/\(?\$?\s*-?[\d,]+(?:\.\d{2})?\)?/);
    return match ? match[0] : raw;
  }

  if (type === "integer") {
    const match = raw.match(/-?\d+/);
    return match ? match[0] : raw;
  }

  return raw;
}

function isFootnoteMarkerToken(value) {
  return /^\(?\d+\)?\*?$/.test(String(value || "").trim());
}

function containsPendingMarker(value) {
  return /\bTBD\*?\b/i.test(String(value || ""));
}

function normalizeCarrierName(value) {
  return String(value || "").trim().toLowerCase();
}

function isFgCarrier(carrierName) {
  return normalizeCarrierName(carrierName) === normalizeCarrierName(F_AND_G_CARRIER_NAME);
}

function resolveExtractionDocumentType(documentType) {
  if (documentType === "in_force_ledger") return "annual_statement";
  if (documentType === "policy_detail_page") return "illustration";
  return documentType;
}

function normalizeCurrency(value) {
  const cleanedInput = cleanNumericToken(value, "currency");
  const match = cleanedInput.match(/\(?\$?\s*-?[\d,]+(?:\.\d{2})?\)?/);
  if (!match) return null;

  const raw = match[0].trim();
  const negative = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[,$()\s]/g, "");
  const amount = Number(cleaned);

  if (Number.isNaN(amount)) return null;

  return {
    value: negative ? -amount : amount,
    display: `${negative ? "-" : ""}$${Math.abs(amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
  };
}

function formatCurrencyForDebug(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return null;
  const numericAmount = Number(amount);
  return `${numericAmount < 0 ? "-" : ""}$${Math.abs(numericAmount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function resolveChargeConfidenceLabel({ fieldKey, sourceKind = "fallback", confidenceScore = 0, sourcePageType = "" }) {
  if (!CHARGE_RELATED_FIELDS.has(fieldKey)) return null;
  if (sourceKind === "annual_total" && confidenceScore >= 0.88) return "strong";
  if (["monthly_rollup", "table_row"].includes(sourceKind) && confidenceScore >= 0.8) return "moderate";
  if (sourcePageType === "statement_summary" && confidenceScore >= 0.84) return "moderate";
  return confidenceScore >= 0.75 ? "moderate" : "weak";
}

function normalizePercent(value) {
  const cleanedInput = cleanNumericToken(value, "percent");
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cleanedInput)) return null;
  if (/n\/a/i.test(cleanedInput)) return null;
  if (!/%/.test(cleanedInput)) return null;
  const match = cleanedInput.match(/-?[\d.]+/);
  if (!match) return null;
  const amount = Number(match[0]);
  if (Number.isNaN(amount)) return null;
  return {
    value: amount,
    display: `${amount}%`,
  };
}

function normalizeDate(value) {
  const match = value.match(/([A-Za-z]+ \d{1,2}, \d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
  if (!match) return null;

  const raw = match[1];
  const parsed = new Date(raw);

  return {
    value: Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10),
    display: raw,
  };
}

function normalizeInteger(value) {
  if (/%/.test(value)) return null;
  const match = value.match(/-?\d+/);
  if (!match) return null;
  const amount = Number(match[0]);
  if (Number.isNaN(amount)) return null;
  return {
    value: amount,
    display: String(amount),
  };
}

function normalizePolicyNumber(value) {
  const match = value.match(/([A-Z0-9][A-Z0-9-]{5,})/i);
  if (!match) return null;
  return {
    value: match[1],
    display: match[1],
  };
}

function normalizeEnum(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return {
    value: normalized,
    display: normalized,
  };
}

function normalizeValue(rawValue, type) {
  if (!rawValue) return null;

  if (type === "currency") return normalizeCurrency(rawValue);
  if (type === "percent") return normalizePercent(rawValue);
  if (type === "date") return normalizeDate(rawValue);
  if (type === "integer") return normalizeInteger(rawValue);
  if (type === "policyNumber") return normalizePolicyNumber(rawValue);
  if (type === "enum") return normalizeEnum(rawValue);

  const normalized = normalizeText(rawValue);
  if (!normalized) return null;
  return {
    value: normalized,
    display: normalized,
  };
}

function matchesExpectedType(rawValue, type) {
  return Boolean(normalizeValue(rawValue, type));
}

function isLikelyTextValue(normalizedKey, value) {
  const normalized = value.trim();
  if (!normalized) return false;

  if (normalizedKey === "product_name") {
    if (normalized.length < 4 || normalized.length > 60) return false;
    if (/^[,.;:!?-]+$/.test(normalized)) return false;
    if (/^(particularly|under|or|utilizing|securely|dear|congratulations|responsible)/i.test(normalized)) return false;
    if (/^name:?$/i.test(normalized)) return false;
  }

  if (normalizedKey === "payment_mode") {
    return /^(monthly|quarterly|annual|annually|semi-annual|semiannual)$/i.test(normalized);
  }

  if (normalizedKey === "policy_type") {
    return /(universal life|flexible premium adjustable life)/i.test(normalized);
  }

  if (normalizedKey === "index_strategy") {
    return normalized.length >= 12 && /(index account|declared interest account|s&p 500|pimco|franklin|strategic balanced|quality dividend)/i.test(normalized);
  }

  return true;
}

function passesFieldSpecificValidation(normalizedKey, rawValue, normalized) {
  if (!normalized) return false;

  if (normalizedKey === "policy_number") {
    return /^[A-Z0-9][A-Z0-9-]{5,}$/i.test(String(normalized.value));
  }

  if (normalizedKey === "product_name" || normalizedKey === "payment_mode" || normalizedKey === "policy_type") {
    return isLikelyTextValue(normalizedKey, normalized.display);
  }

  if (normalizedKey === "option_type") {
    return /^(1|2|level(?:\s*\(\d\))?|increasing(?:\s*\(\d\))?|option\s*1|option\s*2)$/i.test(
      String(normalized.display)
    );
  }

  if (
    normalizedKey === "death_benefit" ||
    normalizedKey === "initial_face_amount" ||
    normalizedKey === "minimum_death_benefit"
  ) {
    return typeof normalized.value === "number" && normalized.value >= 10000;
  }

  if (normalizedKey === "planned_premium") {
    return typeof normalized.value === "number" && normalized.value >= 100;
  }

  if (normalizedKey === "guaranteed_premium") {
    return typeof normalized.value === "number" && normalized.value >= 50;
  }

  if (
    [
      "accumulation_value",
      "cash_value",
      "cash_surrender_value",
      "indexed_account_value",
      "fixed_account_value",
    ].includes(normalizedKey)
  ) {
    return typeof normalized.value === "number" && normalized.value >= 100;
  }

  if (normalizedKey === "premium_paid") {
    return typeof normalized.value === "number" && normalized.value >= 25;
  }

  if (normalizedKey === "insured_age") {
    return typeof normalized.value === "number" && normalized.value >= 18 && normalized.value <= 100 && !/%/.test(rawValue);
  }

  if (normalizedKey === "policy_year") {
    return typeof normalized.value === "number" && normalized.value >= 1 && normalized.value <= 100;
  }

  if (normalizedKey === "statement_date" || normalizedKey === "issue_date") {
    const parsed = new Date(normalized.value);
    if (Number.isNaN(parsed.getTime())) return false;

    const earliestSupportedDate = new Date("1980-01-01T00:00:00Z");
    const latestAllowedDate = new Date();
    latestAllowedDate.setDate(latestAllowedDate.getDate() + 45);

    return parsed >= earliestSupportedDate && parsed <= latestAllowedDate;
  }

  if (["allocation_percent", "cap_rate", "crediting_rate", "index_credit", "spread"].includes(normalizedKey)) {
    return typeof normalized.value === "number" && normalized.value >= -5 && normalized.value <= 100;
  }

  if (normalizedKey === "participation_rate") {
    return typeof normalized.value === "number" && normalized.value >= 0 && normalized.value <= 500;
  }

  return true;
}

function looksLikeValueStart(rawValue, type) {
  const trimmed = rawValue.trim();
  if (type === "currency") return /^[(:\-\s]*\$?-?\d/.test(trimmed) && !/%/.test(trimmed.split(/\s+/)[0] || "");
  if (type === "percent") return /^[(:\-\s]*-?\d/.test(trimmed);
  if (type === "integer") return /^[(:\-\s]*-?\d/.test(trimmed);
  if (type === "date") return /^[(:\-\s]*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/.test(trimmed);
  return true;
}

function scoreToConfidence(score) {
  if (score >= PARSER_DICTIONARY.confidenceThresholds.high) return "high";
  if (score >= PARSER_DICTIONARY.confidenceThresholds.medium) return "medium";
  return "low";
}

function getPageText(pages, pageNumber) {
  return pages[pageNumber - 1] || "";
}

function buildMissingField(normalizedKey, reason, documentType, carrierHint) {
  return {
    normalized_key: normalizedKey,
    value: null,
    display_value: "Not found",
    raw_label: "",
    raw_value: "",
    page_number: null,
    extraction_method: "missing",
    confidence: "low",
    confidence_score: 0,
    carrier_hint: carrierHint || "",
    document_type: documentType,
    evidence: [],
    rejected_candidates: [],
    source_page_type: "",
    source_priority: 0,
    suppression_reason: "",
    missing: true,
    reason,
  };
}

function buildFieldProvenance(field, fileName = "") {
  if (!field) return null;
  return {
    value: field.value ?? null,
    label: field.raw_label || "",
    page: field.page_number ?? null,
    document: fileName,
    method: field.extraction_method || "missing",
    confidence:
      field.extraction_confidence_tier ||
      (field.missing ? "none" : field.confidence === "high" ? "strong" : field.confidence === "medium" ? "moderate" : "weak"),
    candidates: (field.rejected_candidates || []).map((candidate) => ({
      value: candidate.display_value || "",
      label: candidate.raw_label || "",
      page: candidate.page_number ?? null,
      method: candidate.extraction_method || "",
      confidence:
        candidate.confidence_score >= 0.9 ? "strong" : candidate.confidence_score >= 0.75 ? "moderate" : candidate.confidence_score > 0 ? "weak" : "none",
    })),
  };
}

function attachProvenanceToFields(fieldMap, fileName = "") {
  return Object.fromEntries(
    Object.entries(fieldMap || {}).map(([fieldKey, field]) => [
      fieldKey,
      {
        ...field,
        provenance: field?.provenance || buildFieldProvenance(field, fileName),
      },
    ])
  );
}

function mergeCarrierSpecificFields(baseFields, carrierFields = {}) {
  const merged = { ...baseFields };

  Object.entries(carrierFields).forEach(([fieldKey, carrierField]) => {
    if (!carrierField || carrierField.missing) return;
    const currentField = merged[fieldKey];
    if (!currentField || currentField.missing) {
      merged[fieldKey] = carrierField;
      return;
    }

    const currentScore = currentField.confidence_score || 0;
    const carrierScore = carrierField.confidence_score || 0;
    const carrierIsStructured = /table|carrier_label/.test(carrierField.extraction_method || "");
    const carrierIsSummary = /carrier_summary_row|carrier_strategy_row/.test(carrierField.extraction_method || "");
    const currentIsWeak = currentScore < PARSER_DICTIONARY.confidenceThresholds.medium;
    const identityField = ["policy_number", "statement_date", "issue_date"].includes(fieldKey);

    if (
      carrierScore >= currentScore + 0.04 ||
      (carrierIsStructured && currentIsWeak && carrierScore >= currentScore) ||
      (identityField && carrierIsSummary && carrierField.extraction_confidence_tier === "strong" && carrierScore >= currentScore - 0.05)
    ) {
      merged[fieldKey] = {
        ...carrierField,
        merge_debug: {
          ...(carrierField.merge_debug || {}),
          selected: "carrier_specific",
          reason: currentField.missing ? "generic_missing" : "carrier_specific_stronger_support",
          generic_confidence_score: currentScore,
          carrier_specific_confidence_score: carrierScore,
        },
      };
    }
  });

  return merged;
}

function countAliasMatches(pages, aliases) {
  const loweredAliases = aliases.map((alias) => alias.toLowerCase());
  let matches = 0;

  pages.forEach((pageText) => {
    const lines = splitLines(pageText);
    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();
      if (loweredAliases.some((alias) => lowerLine.includes(alias))) {
        matches += 1;
      }
    });
  });

  return matches;
}

function getCarrierDocumentTypeHints(carrierName) {
  return PARSER_DICTIONARY.carrierDocumentTypeHints?.[carrierName] || {};
}

function getCarrierSectionMarkers(carrierName, documentType) {
  return PARSER_DICTIONARY.carrierProfiles?.[carrierName]?.sectionMarkers?.[documentType] || [];
}

function buildDocumentTypeHintMap(carrierName) {
  const merged = JSON.parse(JSON.stringify(PARSER_DICTIONARY.documentTypeHints));
  const carrierHints = getCarrierDocumentTypeHints(carrierName);

  Object.entries(carrierHints).forEach(([documentType, hints]) => {
    const existing = merged[documentType] || { filenameHints: [], markers: [] };
    merged[documentType] = {
      filenameHints: [...existing.filenameHints, ...(hints.filenameHints || [])],
      markers: [...existing.markers, ...(hints.markers || [])],
    };
  });

  return merged;
}

function getCandidatePagePenalty(documentType, normalizedKey, pageIndex) {
  if (
    (documentType === "illustration" || documentType === "policy_detail_page") &&
    ILLUSTRATION_IDENTITY_FIELDS.has(normalizedKey) &&
    pageIndex > 1
  ) {
    return Math.min(0.18, (pageIndex - 1) * 0.06);
  }

  if (
    (documentType === "annual_statement" || documentType === "in_force_ledger") &&
    STATEMENT_IDENTITY_FIELDS.has(normalizedKey) &&
    pageIndex > 1
  ) {
    return Math.min(0.14, (pageIndex - 1) * 0.05);
  }

  return 0;
}

function findSectionHits(pages, markers = []) {
  if (!markers.length) return [];

  const hits = [];
  pages.forEach((pageText, pageIndex) => {
    const lines = splitLines(pageText);
    lines.forEach((line, lineIndex) => {
      const lowerLine = line.toLowerCase();
      markers.forEach((marker) => {
        if (lowerLine.includes(marker.toLowerCase())) {
          hits.push({
            pageNumber: pageIndex + 1,
            lineIndex,
            marker,
            line,
            lines,
          });
        }
      });
    });
  });

  return hits;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function classifyFgPageType(pageText, documentType) {
  const lower = pageText.toLowerCase();
  const hasMonthlyActivityColumns =
    /(date\s+premium paid\s+interest rate\s+expense charges\s+cost of insurance)/i.test(pageText) ||
    /(date\s+premium(?:s)?\s+(?:credited )?interest\s+(?:policy|account) value)/i.test(pageText) ||
    /(date\s+premium paid\s+monthly deduction\s+cost of insurance)/i.test(pageText);
  const hasMonthlyActivityTotals =
    (lower.includes("ending account value") && lower.includes("cost of insurance") && lower.includes("premium paid")) ||
    (lower.includes("monthly deduction") && lower.includes("premium paid") && lower.includes("account value")) ||
    (lower.includes("expense charges") && lower.includes("policy value") && lower.includes("interest credited"));

  if (hasMonthlyActivityColumns || hasMonthlyActivityTotals) {
    return "monthly_activity_table";
  }

  if (
    lower.includes("policy detail") ||
    lower.includes("policy information") ||
    lower.includes("coverage detail") ||
    lower.includes("policy summary")
  ) {
    return "policy_information";
  }

  if (
    lower.includes("account summary") ||
    lower.includes("policy value summary") ||
    lower.includes("annual statement") ||
    lower.includes("statement date")
  ) {
    return "statement_summary";
  }

  if (
    lower.includes("segment detail") ||
    lower.includes("strategy detail") ||
    lower.includes("indexed segment") ||
    lower.includes("crediting segment")
  ) {
    return "segment_detail";
  }

  if (
    lower.includes("allocation detail") ||
    lower.includes("strategy allocation") ||
    lower.includes("interest option") ||
    lower.includes("allocation option")
  ) {
    return "strategy_menu";
  }

  if (lower.includes("rider") && !lower.includes("cost of riders")) {
    return "rider_support";
  }

  if (documentType === "illustration" || documentType === "policy_detail_page") {
    return "policy_information";
  }
  if (documentType === "annual_statement" || documentType === "in_force_ledger") {
    return "statement_summary";
  }

  return "unknown";
}

function getFgFieldSourcePolicy(fieldKey) {
  if (FG_POLICY_INFO_FIELDS.has(fieldKey)) {
    return {
      allowed: ["policy_information", "rider_support", "strategy_menu"],
      primary: "policy_information",
      priorities: { policy_information: 4, rider_support: 2, strategy_menu: 1 },
    };
  }

  if (FG_STATEMENT_SUMMARY_FIELDS.has(fieldKey)) {
    return {
      allowed: ["statement_summary", "monthly_activity_table"],
      primary: "statement_summary",
      priorities: { statement_summary: 4, monthly_activity_table: 3 },
    };
  }

  if (FG_MONTHLY_ACTIVITY_FIELDS.has(fieldKey)) {
    return {
      allowed: ["monthly_activity_table", "statement_summary"],
      primary: "monthly_activity_table",
      priorities: { monthly_activity_table: 4, statement_summary: 2 },
    };
  }

  if (FG_SEGMENT_DETAIL_FIELDS.has(fieldKey)) {
    return {
      allowed: ["strategy_menu", "segment_detail", "statement_summary"],
      primary: "strategy_menu",
      priorities: { strategy_menu: 4, segment_detail: 2, statement_summary: 1 },
    };
  }

  return {
    allowed: ["policy_information", "statement_summary", "monthly_activity_table", "strategy_menu", "segment_detail", "rider_support", "unknown"],
    primary: "unknown",
    priorities: {},
  };
}

function getPageSourceType(carrierName, documentType, pageText) {
  if (isFgCarrier(carrierName)) {
    return classifyFgPageType(pageText, documentType);
  }
  return "generic";
}

function getSourcePriority(carrierName, fieldKey, sourcePageType) {
  if (!isFgCarrier(carrierName)) return 0;
  return getFgFieldSourcePolicy(fieldKey).priorities[sourcePageType] || 0;
}

function getFgTargetFieldPageBoost(fieldKey, sourcePageType) {
  if (!FG_FIELD_RECOVERY_TARGETS.has(fieldKey)) return 0;

  if (
    ["issue_date", "death_benefit", "planned_premium", "product_name"].includes(fieldKey) &&
    ["policy_information", "statement_summary"].includes(sourcePageType)
  ) {
    return 0.12;
  }

  if (fieldKey === "issue_date" && sourcePageType === "policy_information") {
    return 0.18;
  }

  if (fieldKey === "minimum_death_benefit" && sourcePageType === "statement_summary") {
    return 0.1;
  }

  if (
    ["loan_balance", "cost_of_insurance"].includes(fieldKey) &&
    sourcePageType === "statement_summary"
  ) {
    return 0.12;
  }

  if (
    ["accumulation_value", "cash_value", "cash_surrender_value"].includes(fieldKey) &&
    sourcePageType === "statement_summary"
  ) {
    return 0.1;
  }

  if (fieldKey === "cap_rate" && ["strategy_menu", "statement_summary"].includes(sourcePageType)) {
    return 0.1;
  }

  if (
    ["issue_date", "death_benefit", "planned_premium", "product_name"].includes(fieldKey) &&
    sourcePageType === "monthly_activity_table"
  ) {
    return -0.14;
  }

  if (
    ["issue_date", "death_benefit", "planned_premium", "loan_balance", "cost_of_insurance"].includes(fieldKey) &&
    sourcePageType === "segment_detail"
  ) {
    return -0.12;
  }

  if (fieldKey === "issue_date" && ["statement_summary", "segment_detail", "rider_support"].includes(sourcePageType)) {
    return -0.16;
  }

  if (fieldKey === "cap_rate" && sourcePageType === "segment_detail") {
    return -0.04;
  }

  return 0;
}

function buildFieldSanityAssessment(fieldKey, candidate) {
  const rawValue = String(candidate?.raw_value || "");
  const rawLabel = String(candidate?.raw_label || "");
  const sourcePageType = String(candidate?.source_page_type || "");
  const scorePenalty = [];
  const warnings = [];
  let reject = false;

  if (!candidate || candidate.missing) {
    return { penalty: 0, warnings, reject: false, cleanedRawValue: rawValue };
  }

  const cleanedRawValue = cleanNumericToken(rawValue, PARSER_DICTIONARY.fields[fieldKey]?.type || "text");

  if (FOOTNOTE_SENSITIVE_FINANCIAL_FIELDS.has(fieldKey) && isFootnoteMarkerToken(cleanedRawValue)) {
    reject = true;
    warnings.push("isolated footnote marker rejected for financial field");
  }

  if (fieldKey === "loan_balance" && typeof candidate.value === "number") {
    if (Math.abs(candidate.value) <= 5 && !/loan/i.test(rawLabel) && sourcePageType !== "statement_summary") {
      scorePenalty.push(0.28);
      warnings.push("tiny loan value lacked strong loan context");
    }
  }

  if (fieldKey === "cost_of_insurance" && typeof candidate.value === "number") {
    if (Math.abs(candidate.value) <= 10 && !/cost of insurance|coi/i.test(rawLabel) && sourcePageType !== "statement_summary") {
      scorePenalty.push(0.28);
      warnings.push("tiny cost-of-insurance value lacked strong COI context");
    }
  }

  if (CHARGE_RELATED_FIELDS.has(fieldKey) && typeof candidate.value === "number") {
    const chargeContext = `${rawValue} ${rawLabel}`.toLowerCase();
    const fieldContextChecks = {
      cost_of_insurance: /cost of insurance|coi|insurance charge/,
      monthly_deduction: /monthly deduction|monthly deductions/,
      expense_charge: /expense charge|expense charges|premium expense|premium load/,
      admin_fee: /administrative charge|administrative fee|admin fee|policy fee/,
      rider_charge: /cost of riders|rider charge|rider charges/,
    };
    const hasStrongChargeContext = fieldContextChecks[fieldKey]?.test(chargeContext);
    const statementTableContext = ["statement_summary", "monthly_activity_table"].includes(sourcePageType);

    if (!hasStrongChargeContext && !statementTableContext) {
      scorePenalty.push(0.16);
      warnings.push("charge candidate lacked strong field-specific charge context");
    }

    if (Math.abs(candidate.value) <= 10 && !hasStrongChargeContext && !statementTableContext) {
      scorePenalty.push(0.24);
      warnings.push("tiny charge candidate lacked labeled statement support");
    }
  }

  if (
    FOOTNOTE_SENSITIVE_FINANCIAL_FIELDS.has(fieldKey) &&
    typeof candidate.value === "number" &&
    candidate.value < 0 &&
    !/\$|loan|cost of insurance|coi|expense|rider|admin/i.test(`${rawValue} ${rawLabel}`) &&
    sourcePageType !== "statement_summary"
  ) {
    scorePenalty.push(0.34);
    warnings.push("negative financial value lacked currency or total-row context");
  }

  if (fieldKey === "cap_rate") {
    if (/%[A-Za-z]/.test(rawValue)) {
      scorePenalty.push(0.06);
      warnings.push("mixed percent/text token sanitized");
    }
    if (!/%/.test(cleanedRawValue)) {
      scorePenalty.push(0.2);
      warnings.push("cap rate candidate lacked a clean percent token");
    }
  }

  if (fieldKey === "planned_premium" && typeof candidate.value === "number") {
    if (candidate.value < 25 && !/premium|modal/i.test(rawLabel)) {
      scorePenalty.push(0.18);
      warnings.push("small premium candidate lacked premium context");
    }
  }

  if (fieldKey === "death_benefit" && typeof candidate.value === "number") {
    if (candidate.value < 10000) {
      scorePenalty.push(0.3);
      warnings.push("death benefit candidate fell below minimum useful threshold");
    }
    if (/minimum death benefit|guaranteed minimum death benefit|min death benefit/i.test(rawLabel)) {
      scorePenalty.push(0.42);
      warnings.push("minimum death benefit candidate demoted for current death benefit");
    }
    if (/initial specified amount|specified amount|face amount/i.test(rawLabel) && sourcePageType !== "policy_information") {
      scorePenalty.push(0.14);
      warnings.push("baseline face amount candidate demoted for current death benefit");
    }
  }

  if (fieldKey === "minimum_death_benefit" && typeof candidate.value === "number") {
    if (!/minimum death benefit|guaranteed minimum death benefit|min death benefit/i.test(rawLabel)) {
      scorePenalty.push(0.18);
      warnings.push("candidate lacked clear minimum death benefit label support");
    }
  }

  if (fieldKey === "issue_date") {
    if (!/\d{4}/.test(String(candidate.display_value || ""))) {
      scorePenalty.push(0.2);
      warnings.push("issue date candidate lacked a complete year");
    }
    if (/statement generated|date prepared|illustration date|application date|policy anniversary|anniversary|rider effective/i.test(rawLabel)) {
      scorePenalty.push(0.34);
      warnings.push("issue date candidate matched a non-issue-date label");
    }
  }

  if (fieldKey === "product_name") {
    if (/^(basic|initial|monthly)$/i.test(String(candidate.display_value || "").trim())) {
      scorePenalty.push(0.25);
      warnings.push("product name candidate was just a trailing token fragment");
    }
  }

  if (fieldKey === "carrier_name") {
    if (String(candidate.display_value || "").length > 80) {
      scorePenalty.push(0.35);
      warnings.push("carrier name candidate was overly long");
    }
    if (/privacy|notice|consumer|information|practices|collect|share|protect/i.test(rawValue)) {
      scorePenalty.push(0.4);
      warnings.push("carrier name candidate resembled notice/privacy prose");
    }
  }

  return {
    penalty: scorePenalty.reduce((sum, value) => sum + value, 0),
    warnings,
    reject,
    cleanedRawValue,
  };
}

function classifyDocument(pages, fileName = "", carrierName = "") {
  const lowerName = fileName.toLowerCase();
  const firstPagesText = pages.slice(0, 2).join("\n").toLowerCase();
  const scores = {};
  const evidence = {};
  const hintMap = buildDocumentTypeHintMap(carrierName);

  Object.entries(hintMap).forEach(([docType, hints]) => {
    scores[docType] = 0;
    evidence[docType] = [];

    hints.filenameHints.forEach((hint) => {
      if (lowerName.includes(hint)) {
        scores[docType] += 2;
        evidence[docType].push(`filename:${hint}`);
      }
    });

    hints.markers.forEach((marker) => {
      if (firstPagesText.includes(marker)) {
        scores[docType] += 1;
        evidence[docType].push(`marker:${marker}`);
      }
    });
  });

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = ranked[0] || ["unknown", 0];
  const secondScore = ranked[1]?.[1] || 0;

  if (bestScore < 2) {
    return { document_type: "unknown", confidence: "low", evidence: ["insufficient hints"] };
  }

  const confidence = bestScore - secondScore >= 2 ? "high" : "medium";
  return {
    document_type: bestType,
    confidence,
    evidence: evidence[bestType],
  };
}

function detectCarrier(pages) {
  const firstPageText = getPageText(pages, 1).toLowerCase();
  const earlyPages = pages.slice(0, 5);
  const firstPagesText = earlyPages.join("\n").toLowerCase();
  const matches = [];

  Object.entries(PARSER_DICTIONARY.carrierProfiles).forEach(([carrierName, profile]) => {
    let score = 0;
    const evidence = [];

    profile.aliases.forEach((alias) => {
      if (firstPageText.includes(alias)) {
        score += 2;
        evidence.push(`header:${alias}`);
      } else if (firstPagesText.includes(alias)) {
        score += 1;
        evidence.push(`body:${alias}`);
      }
    });

    (profile.productHints || []).forEach((hint) => {
      if (firstPagesText.includes(hint.toLowerCase())) {
        score += 1;
        evidence.push(`product:${hint}`);
      }
    });

    (profile.documentPatterns || []).forEach((pattern) => {
      if (firstPagesText.includes(pattern.toLowerCase())) {
        score += 1;
        evidence.push(`pattern:${pattern}`);
      }
    });

    const sectionMarkers = Object.values(profile.sectionMarkers || {}).flat();
    sectionMarkers.forEach((marker) => {
      if (firstPagesText.includes(marker.toLowerCase())) {
        score += 0.5;
        evidence.push(`section:${marker}`);
      }
    });

    if (score > 0) {
      matches.push({ carrier_name: carrierName, score, evidence });
    }
  });

  if (matches.length === 0) {
    return { carrier_name: "", confidence: "low", evidence: ["no carrier alias matched"] };
  }

  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];
  const second = matches[1]?.score || 0;
  const confidence = best.score >= 3 && best.score > second ? "high" : "medium";

  return {
    carrier_name: best.carrier_name,
    confidence,
    evidence: best.evidence,
  };
}

function inferPolicyType(text) {
  const lower = text.toLowerCase();
  if (lower.includes("index universal life")) return "Index Universal Life";
  if (lower.includes("indexed universal life")) return "Indexed Universal Life";
  if (lower.includes("individual fixed index interest flexible premium adjustable life insurance")) {
    return "Index Universal Life";
  }
  if (lower.includes("universal life")) return "Universal Life";
  return "";
}

function extractFgIssueDateField(pages, documentType, carrierName) {
  if (!isFgCarrier(carrierName) || resolveExtractionDocumentType(documentType) !== "illustration") {
    return null;
  }

  const issueDatePatterns = [
    { regex: /Issue Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Issue Date" },
    { regex: /Policy Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Policy Date" },
    { regex: /Contract Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Contract Date" },
    { regex: /Date of Issue\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Date of Issue" },
  ];

  for (let pageIndex = 0; pageIndex < Math.min(pages.length, 5); pageIndex += 1) {
    const pageText = pages[pageIndex];
    const pageRole = getPageSourceType(carrierName, documentType, pageText);
    if (pageRole !== "policy_information") continue;
    if (/statement generated|illustration date|application date|policy anniversary|rider effective/i.test(pageText)) {
      // keep scanning, but do not use those labels as primary issue-date evidence
    }

    for (const pattern of issueDatePatterns) {
      const match = pageText.match(pattern.regex);
      if (!match) continue;
      return buildDerivedField({
        normalizedKey: "issue_date",
        rawLabel: pattern.label,
        rawValue: match[1],
        type: "date",
        pageNumber: pageIndex + 1,
        method: "exact_label_same_line",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.99,
        evidence: ["matched F&G policy information issue date pattern", `page classified as ${pageRole}`],
        sourcePageType: pageRole,
        sourcePriority: getSourcePriority(carrierName, "issue_date", pageRole),
      });
    }
  }

  return null;
}

function extractFgStatementDateInfo(pages, fileName, documentType, carrierName) {
  if (!isFgCarrier(carrierName) || resolveExtractionDocumentType(documentType) !== "annual_statement") {
    return null;
  }

  const generatedPatterns = [
    { regex: /Statement Generated\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Statement Generated" },
    { regex: /Date Prepared\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Date Prepared" },
  ];
  const periodPatterns = [
    { regex: /Statement Period Ending\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Statement Period Ending" },
    { regex: /Period Ending\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Period Ending" },
    { regex: /Year Ending\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Year Ending" },
    { regex: /As of Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "As of Date" },
    { regex: /Statement Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Statement Date" },
  ];

  let generatedField = null;
  let statementPeriodField = null;

  for (let pageIndex = 0; pageIndex < Math.min(pages.length, 4); pageIndex += 1) {
    const pageText = pages[pageIndex];
    const pageRole = getPageSourceType(carrierName, documentType, pageText);
    if (!["statement_summary", "monthly_activity_table", "unknown"].includes(pageRole)) continue;

    for (const pattern of generatedPatterns) {
      const match = pageText.match(pattern.regex);
      if (match) {
        generatedField = buildDerivedField({
          normalizedKey: "statement_date",
          rawLabel: pattern.label,
          rawValue: match[1],
          type: "date",
          pageNumber: pageIndex + 1,
          method: "exact_label_same_line",
          carrierHint: carrierName,
          documentType,
          confidenceScore: 0.9,
          evidence: ["matched F&G statement generated date pattern", `page classified as ${pageRole}`],
          sourcePageType: pageRole,
          sourcePriority: getSourcePriority(carrierName, "statement_date", pageRole),
        });
        break;
      }
    }

    for (const pattern of periodPatterns) {
      const match = pageText.match(pattern.regex);
      if (match) {
        statementPeriodField = buildDerivedField({
          normalizedKey: "statement_date",
          rawLabel: pattern.label,
          rawValue: match[1],
          type: "date",
          pageNumber: pageIndex + 1,
          method: "exact_label_same_line",
          carrierHint: carrierName,
          documentType,
          confidenceScore: 0.98,
          evidence: ["matched F&G statement period date pattern", `page classified as ${pageRole}`],
          sourcePageType: pageRole,
          sourcePriority: getSourcePriority(carrierName, "statement_date", pageRole),
        });
        break;
      }
    }

    if (statementPeriodField && generatedField) break;
  }

  const chosenField = statementPeriodField || generatedField || inferStatementDateFromFilename(fileName);

  return {
    chosenField,
    generatedField,
    statementPeriodField,
    usedFilenameFallback: Boolean(chosenField?.extraction_method === "filename_inference"),
  };
}

function extractFgStatementDateField(pages, fileName, documentType, carrierName) {
  return extractFgStatementDateInfo(pages, fileName, documentType, carrierName)?.chosenField || null;
}

function extractGenericLabeledDateField({
  pages,
  normalizedKey,
  documentType,
  carrierName,
  allowedPageRoles,
  patterns,
  defaultConfidenceScore,
  evidenceLabel,
}) {
  for (let pageIndex = 0; pageIndex < Math.min(pages.length, 5); pageIndex += 1) {
    const pageText = pages[pageIndex];
    const pageRole = getPageSourceType(carrierName, documentType, pageText);
    if (allowedPageRoles?.length && !allowedPageRoles.includes(pageRole)) continue;

    for (const pattern of patterns) {
      const match = pageText.match(pattern.regex);
      if (!match) continue;

      return buildDerivedField({
        normalizedKey,
        rawLabel: pattern.label,
        rawValue: match[1],
        type: "date",
        pageNumber: pageIndex + 1,
        method: "generic_label_same_line",
        carrierHint: carrierName,
        documentType,
        confidenceScore: pattern.confidenceScore ?? defaultConfidenceScore,
        evidence: [evidenceLabel, `page classified as ${pageRole}`],
        sourcePageType: pageRole,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, pageRole),
      });
    }
  }

  return null;
}

function extractGenericIssueDateField(pages, documentType, carrierName) {
  if (resolveExtractionDocumentType(documentType) !== "illustration") {
    return null;
  }

  return extractGenericLabeledDateField({
    pages,
    normalizedKey: "issue_date",
    documentType,
    carrierName,
    allowedPageRoles: ["policy_information", "strategy_menu", "unknown"],
    defaultConfidenceScore: 0.8,
    evidenceLabel: "matched generic issue-date pattern",
    patterns: [
      { regex: /Issue Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "Issue Date", confidenceScore: 0.9 },
      { regex: /Policy Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "Policy Date", confidenceScore: 0.88 },
      { regex: /Contract Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "Contract Date", confidenceScore: 0.86 },
      { regex: /Date of Issue\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "Date of Issue", confidenceScore: 0.9 },
    ],
  });
}

function extractGenericStatementDateField(pages, fileName, documentType, carrierName) {
  if (resolveExtractionDocumentType(documentType) !== "annual_statement") {
    return inferStatementDateFromFilename(fileName);
  }

  const labeledField = extractGenericLabeledDateField({
    pages,
    normalizedKey: "statement_date",
    documentType,
    carrierName,
    allowedPageRoles: ["statement_summary", "monthly_activity_table", "segment_detail", "unknown"],
    defaultConfidenceScore: 0.76,
    evidenceLabel: "matched generic statement-date pattern",
    patterns: [
      { regex: /Statement Period Ending\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "Statement Period Ending", confidenceScore: 0.9 },
      { regex: /Period Ending\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "Period Ending", confidenceScore: 0.88 },
      { regex: /Year Ending\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "Year Ending", confidenceScore: 0.88 },
      { regex: /As of Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "As of Date", confidenceScore: 0.84 },
      { regex: /Statement Date\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "Statement Date", confidenceScore: 0.84 },
      { regex: /Statement Through\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, label: "Statement Through", confidenceScore: 0.82 },
    ],
  });

  if (labeledField) {
    return labeledField;
  }

  return inferStatementDateFromFilename(fileName);
}

function extractGenericPolicyNumberField(pages, documentType, carrierName) {
  const patterns = [
    { regex: /Policy Number\s*:?\s*([A-Z0-9-]{6,})/i, label: "Policy Number", confidenceScore: 0.9 },
    { regex: /Policy No\.?\s*:?\s*([A-Z0-9-]{6,})/i, label: "Policy No.", confidenceScore: 0.88 },
    { regex: /Contract Number\s*:?\s*([A-Z0-9-]{6,})/i, label: "Contract Number", confidenceScore: 0.86 },
    { regex: /Contract No\.?\s*:?\s*([A-Z0-9-]{6,})/i, label: "Contract No.", confidenceScore: 0.84 },
    { regex: /Certificate Number\s*:?\s*([A-Z0-9-]{6,})/i, label: "Certificate Number", confidenceScore: 0.82 },
  ];

  for (let pageIndex = 0; pageIndex < Math.min(pages.length, 5); pageIndex += 1) {
    const pageText = pages[pageIndex];
    const pageRole = getPageSourceType(carrierName, documentType, pageText);
    if (!["policy_information", "statement_summary", "monthly_activity_table", "unknown", "generic"].includes(pageRole)) {
      continue;
    }

    for (const pattern of patterns) {
      const match = pageText.match(pattern.regex);
      if (!match) continue;

      return buildDerivedField({
        normalizedKey: "policy_number",
        rawLabel: pattern.label,
        rawValue: match[1],
        type: "policyNumber",
        pageNumber: pageIndex + 1,
        method: "generic_label_same_line",
        carrierHint: carrierName,
        documentType,
        confidenceScore: pattern.confidenceScore,
        evidence: ["matched generic policy-number pattern", `page classified as ${pageRole}`],
        sourcePageType: pageRole,
        sourcePriority: getSourcePriority(carrierName, "policy_number", pageRole),
      });
    }
  }

  return null;
}

function extractFgIllustrationPremiumField(pages, normalizedKey, documentType, carrierName) {
  if (!isFgCarrier(carrierName) || resolveExtractionDocumentType(documentType) !== "illustration") {
    return null;
  }

  const fieldPatterns = {
    planned_premium: {
      regex: /Planned Premium\s+\$?([\d,]+\.\d{2})\s+(Monthly|Quarterly|Annual|Semi-Annual)/i,
      label: "Planned Premium",
      type: "currency",
      extra: (match) => ({ payment_mode: match[2] }),
    },
    payment_mode: {
      regex: /Planned Premium\s+\$?[\d,]+\.\d{2}\s+(Monthly|Quarterly|Annual|Semi-Annual)/i,
      label: "Planned Premium",
      type: "text",
    },
    annual_target_premium: {
      regex: /Annual Target Premium\s+\$?([\d,]+\.\d{2})/i,
      label: "Annual Target Premium",
      type: "currency",
    },
    no_lapse_premium: {
      regex: /Minimum NLP\s+\$?([\d,]+\.\d{2})/i,
      label: "Minimum NLP",
      type: "currency",
    },
    guideline_single_premium: {
      regex: /Guideline Single Premium\s+\$?([\d,]+\.\d{2})/i,
      label: "Guideline Single Premium",
      type: "currency",
    },
    guideline_level_premium: {
      regex: /Guideline Level Premium\s+\$?([\d,]+\.\d{2})/i,
      label: "Guideline Level Premium",
      type: "currency",
    },
  };

  const config = fieldPatterns[normalizedKey];
  if (!config) return null;

  for (let pageIndex = 0; pageIndex < Math.min(pages.length, 5); pageIndex += 1) {
    const pageText = pages[pageIndex];
    const pageRole = getPageSourceType(carrierName, documentType, pageText);
    if (!["policy_information", "strategy_menu", "unknown"].includes(pageRole)) continue;
    const match = pageText.match(config.regex);
    if (!match) continue;
    return buildDerivedField({
      normalizedKey,
      rawLabel: config.label,
      rawValue: match[1],
      type: config.type,
      pageNumber: pageIndex + 1,
      method: "exact_label_same_line",
      carrierHint: carrierName,
      documentType,
      confidenceScore: normalizedKey === "payment_mode" ? 0.97 : 0.99,
      evidence: ["matched F&G policy information premium pattern", `page classified as ${pageRole}`],
      sourcePageType: pageRole,
      sourcePriority: getSourcePriority(carrierName, normalizedKey, pageRole),
    });
  }

  return null;
}

function extractFgStrategyMenuRows(pages, documentType, carrierName) {
  if (!isFgCarrier(carrierName) || resolveExtractionDocumentType(documentType) !== "illustration") {
    return [];
  }

  const strategyRows = [];
  const strategyPattern =
    /(One[- ]?Year S&P 500(?: Monthly)? Pt[- ]?to[- ]?Pt|One Year S&P 500(?: Monthly)? Pt[- ]?to[- ]?Pt|Fixed Interest Option)/i;

  pages.forEach((pageText, pageIndex) => {
    const pageRole = getPageSourceType(carrierName, documentType, pageText);
    if (!["policy_information", "strategy_menu"].includes(pageRole)) return;
    const lines = splitLines(pageText);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!strategyPattern.test(line)) continue;
      const windowText = lines.slice(i, i + 6).join(" ");
      const percents = [...windowText.matchAll(/-?[\d.]+%/g)].map((match) => normalizePercent(match[0])).filter(Boolean);
      strategyRows.push({
        strategy_name: normalizeText(line),
        page_number: pageIndex + 1,
        source_page_type: pageRole,
        source_type: "menu_only",
        allocation_percent: percents[0]?.display || null,
        participation_rate: /participation/i.test(windowText) ? percents[0]?.display || null : null,
        minimum_guaranteed_cap_rate: /minimum guaranteed cap/i.test(windowText) ? percents[0]?.display || null : null,
        initial_annual_cap_rate: /initial annual cap|initial cap/i.test(windowText) ? percents.at(-1)?.display || null : null,
        guaranteed_account_value_interest_rate:
          /guaranteed account value interest rate|fixed interest/i.test(windowText) ? percents.at(-1)?.display || null : null,
      });
    }
  });

  return strategyRows;
}

function directDocumentHints(normalizedKey, text, carrierName) {
  const lowerText = text.toLowerCase();

  if (normalizedKey === "carrier_name" && carrierName) {
    return {
      normalized_key: normalizedKey,
      value: carrierName,
      display_value: carrierName,
      raw_label: carrierName,
      raw_value: carrierName,
      page_number: 1,
      extraction_method: "section_based_inference",
      confidence: "high",
      confidence_score: 0.97,
      carrier_hint: carrierName,
      document_type: "",
      evidence: ["carrier alias matched in header/body"],
      rejected_candidates: [],
      missing: false,
    };
  }

  if (normalizedKey === "carrier_name") {
    const fgAliases = [
      "fidelity & guaranty life insurance company",
      "f&g life insurance company",
      "fidelity & guaranty life",
      "fidelity & guaranty",
      "f&g life",
      "f&g",
    ];
    const matchedAlias = fgAliases.find((alias) => lowerText.includes(alias));
    if (matchedAlias) {
      return {
        normalized_key: normalizedKey,
        value: F_AND_G_CARRIER_NAME,
        display_value: F_AND_G_CARRIER_NAME,
        raw_label: "Carrier Name",
        raw_value: matchedAlias,
        page_number: 1,
        extraction_method: "section_based_inference",
        confidence: "high",
        confidence_score: 0.96,
        carrier_hint: F_AND_G_CARRIER_NAME,
        document_type: "",
        evidence: ["canonical F&G carrier alias matched in document"],
        rejected_candidates: [],
        source_page_type: "policy_information",
        source_priority: 4,
        suppression_reason: "",
        missing: false,
      };
    }
  }

  if (normalizedKey === "product_name" && lowerText.includes("qol max accumulator+")) {
    return {
      normalized_key: normalizedKey,
      value: "QoL Max Accumulator+",
      display_value: "QoL Max Accumulator+",
      raw_label: "QoL Max Accumulator+",
      raw_value: "QoL Max Accumulator+",
      page_number: 1,
      extraction_method: "section_based_inference",
      confidence: "high",
      confidence_score: 0.95,
      carrier_hint: carrierName || "",
      document_type: "",
      evidence: ["known product phrase found in document"],
      rejected_candidates: [],
      missing: false,
    };
  }

  if (normalizedKey === "policy_type") {
    const policyType = inferPolicyType(text);
    if (policyType) {
      return {
        normalized_key: normalizedKey,
        value: policyType,
        display_value: policyType,
        raw_label: policyType,
        raw_value: policyType,
        page_number: 1,
        extraction_method: "section_based_inference",
        confidence: policyType === "Universal Life" ? "medium" : "high",
        confidence_score: policyType === "Universal Life" ? 0.68 : 0.92,
        carrier_hint: carrierName || "",
        document_type: "",
        evidence: ["policy type phrase found in document body"],
        rejected_candidates: [],
        missing: false,
      };
    }
  }

  return null;
}

function findBestFgSectionCandidate({
  pages,
  normalizedKey,
  type,
  carrierName,
  documentType,
  aliases,
}) {
  const sectionMarkers = uniqueStrings([
    ...getCarrierSectionMarkers(carrierName, documentType),
    ...(normalizedKey === "index_strategy" ||
    normalizedKey === "allocation_percent" ||
    normalizedKey === "indexed_account_value" ||
    normalizedKey === "fixed_account_value" ||
    normalizedKey === "cap_rate" ||
    normalizedKey === "participation_rate" ||
    normalizedKey === "spread" ||
    normalizedKey === "crediting_rate"
      ? getCarrierSectionMarkers(carrierName, "allocation_page")
      : []),
  ]);

  const sectionHits = findSectionHits(pages, sectionMarkers);
  if (!sectionHits.length) return null;
  const sourcePolicy = getFgFieldSourcePolicy(normalizedKey);

  const candidates = [];
  sectionHits.forEach((hit) => {
    const sourcePageType = getPageSourceType(carrierName, documentType, pages[hit.pageNumber - 1] || "");
    const hierarchyPenalty = sourcePolicy.allowed.includes(sourcePageType) ? 0 : 0.14;
    const targetFieldPageBoost = getFgTargetFieldPageBoost(normalizedKey, sourcePageType);
    aliases.forEach((alias, aliasIndex) => {
      for (let offset = 0; offset <= 2; offset += 1) {
        const line = hit.lines[hit.lineIndex + offset];
        if (!line) continue;
        const lowerLine = line.toLowerCase();
        const lowerAlias = alias.toLowerCase();
        if (!lowerLine.includes(lowerAlias)) continue;

        const sameLineValue = normalizeText(line.replace(new RegExp(escapeRegExp(alias), "ig"), ""));
        if (
          sameLineValue &&
          matchesExpectedType(sameLineValue, type) &&
          looksLikeValueStart(sameLineValue, type)
        ) {
          const normalized = normalizeValue(sameLineValue, type);
          if (normalized && passesFieldSpecificValidation(normalizedKey, sameLineValue, normalized)) {
            candidates.push({
              normalized_key: normalizedKey,
              value: normalized.value,
              display_value: normalized.display,
              raw_label: alias,
              raw_value: sameLineValue,
              page_number: hit.pageNumber,
              extraction_method: "section_based_inference",
              confidence_score: Math.min(
                0.96 + (aliasIndex === 0 ? 0.01 : 0) - hierarchyPenalty + targetFieldPageBoost,
                0.99
              ),
              carrier_hint: carrierName || "",
              document_type: documentType,
              evidence: [
                `matched ${hit.marker} section`,
                "matched preferred carrier label",
                "value found within scoped section",
                `${type} format valid`,
              ],
              rejected_candidates: [],
              line_index: hit.lineIndex + offset,
              marker_matched: true,
              source_page_type: sourcePageType,
              source_priority: sourcePolicy.priorities[sourcePageType] || 0,
              suppression_reason: "",
              missing: false,
            });
          }
        }

        const nextLine = hit.lines[hit.lineIndex + offset + 1];
        if (
          !nextLine ||
          !matchesExpectedType(nextLine, type) ||
          !looksLikeValueStart(nextLine, type)
        ) continue;
        const normalizedNext = normalizeValue(nextLine, type);
        if (!normalizedNext || !passesFieldSpecificValidation(normalizedKey, nextLine, normalizedNext)) continue;

        candidates.push({
          normalized_key: normalizedKey,
          value: normalizedNext.value,
          display_value: normalizedNext.display,
          raw_label: alias,
          raw_value: nextLine,
          page_number: hit.pageNumber,
          extraction_method: "section_based_inference",
          confidence_score: Math.min(
            0.92 + (aliasIndex === 0 ? 0.01 : 0) - hierarchyPenalty + targetFieldPageBoost,
            0.98
          ),
          carrier_hint: carrierName || "",
          document_type: documentType,
          evidence: [
            `matched ${hit.marker} section`,
            "matched preferred carrier label",
            "value found on next line within scoped section",
            `${type} format valid`,
          ],
          rejected_candidates: [],
          line_index: hit.lineIndex + offset + 1,
          marker_matched: true,
          source_page_type: sourcePageType,
          source_priority: sourcePolicy.priorities[sourcePageType] || 0,
          suppression_reason: "",
          missing: false,
        });
      }
    });
  });

  return candidates.length ? selectBestCandidate(candidates, normalizedKey, documentType, carrierName) : null;
}

function extractFgStrategyRows(pages, carrierName) {
  const sectionMarkers = uniqueStrings([
    ...getCarrierSectionMarkers(carrierName, "annual_statement"),
    ...getCarrierSectionMarkers(carrierName, "allocation_page"),
  ]);
  const sectionHits = findSectionHits(pages, sectionMarkers);
  const strategyRows = [];

  sectionHits.forEach((hit) => {
    const sourcePageType = getPageSourceType(carrierName, "annual_statement", pages[hit.pageNumber - 1] || "");
    const start = Math.max(0, hit.lineIndex - 2);
    const end = Math.min(hit.lines.length, hit.lineIndex + 30);
    for (let i = start; i < end; i += 1) {
      const line = hit.lines[i];
      if (
        !/(point[-\s]to[-\s]point|monthly sum|s&p|fixed account|indexed account|index strategy|allocation option|strategy)/i.test(
          line
        )
      ) {
        continue;
      }

      const windowLines = hit.lines.slice(i, i + 4);
      const windowText = windowLines.join(" ");
      const percentMatches = [...windowText.matchAll(/-?[\d.]+%/g)].map((match) => match[0]);
      const currencyMatches = [...windowText.matchAll(/\$[\d,]+(?:\.\d{2})?/g)].map((match) => match[0]);
      const normalizedPercents = percentMatches.map((value) => normalizePercent(value)).filter(Boolean);
      const normalizedCurrencies = currencyMatches.map((value) => normalizeCurrency(value)).filter(Boolean);

      if (!normalizedPercents.length && !normalizedCurrencies.length) continue;

      const allocationPercent =
        normalizedPercents.find((entry) => entry.value > 0 && entry.value <= 100) || null;
      const capRate =
        /cap/i.test(windowText) ? normalizedPercents.find((entry) => entry.value > 0 && entry.value <= 100) || null : null;
      const participationRate =
        /participation/i.test(windowText)
          ? normalizedPercents.find((entry) => entry.value > 0 && entry.value <= 100) || null
          : null;
      const spread =
        /spread/i.test(windowText) ? normalizedPercents.find((entry) => entry.value >= 0 && entry.value <= 100) || null : null;
      const creditingRate =
        /crediting|credited/i.test(windowText)
          ? normalizedPercents.find((entry) => entry.value > 0 && entry.value <= 100) || null
          : null;
      const accountValue =
        normalizedCurrencies.sort((a, b) => b.value - a.value)[0] || null;
      const hasStatementBalanceEvidence = Boolean(accountValue || allocationPercent);
      const hasRateEvidence = Boolean(capRate || participationRate || creditingRate || spread);
      const strategySourceEvidence =
        sourcePageType === "segment_detail"
          ? "historical_segment"
          : hasStatementBalanceEvidence
            ? "statement_active"
            : sourcePageType === "strategy_menu"
              ? "menu_only"
              : hasRateEvidence
                ? "statement_observed"
                : "menu_only";

      strategyRows.push({
        name: normalizeText(line),
        pageNumber: hit.pageNumber,
        marker: hit.marker,
        allocationPercent,
        capRate,
        participationRate,
        spread,
        creditingRate,
        accountValue,
        isFixed: /fixed account|fixed strategy|fixed interest/i.test(line),
        sourcePageType,
        strategySourceEvidence,
        sourceType: strategySourceEvidence,
      });
    }
  });

  return strategyRows;
}

function getFgStrategyEvidenceRank(row) {
  if (row?.strategySourceEvidence === "statement_active") return 3;
  if (row?.strategySourceEvidence === "statement_observed") return 2;
  if (row?.strategySourceEvidence === "menu_only") return 1;
  if (row?.strategySourceEvidence === "historical_segment") return 0;
  return 0;
}

function rankFgStrategyRows(rows, carrierName, normalizedKey) {
  return [...rows].sort((a, b) => {
    const evidenceDelta = getFgStrategyEvidenceRank(b) - getFgStrategyEvidenceRank(a);
    if (evidenceDelta !== 0) return evidenceDelta;

    const sourceDelta =
      getSourcePriority(carrierName, normalizedKey, b.sourcePageType) -
      getSourcePriority(carrierName, normalizedKey, a.sourcePageType);
    if (sourceDelta !== 0) return sourceDelta;

    const bPercent = b.allocationPercent?.value || 0;
    const aPercent = a.allocationPercent?.value || 0;
    if (bPercent !== aPercent) return bPercent - aPercent;

    return (b.accountValue?.value || 0) - (a.accountValue?.value || 0);
  });
}

function extractFgCarrierField(pages, normalizedKey, documentType, carrierName) {
  if (!isFgCarrier(carrierName)) return null;

  const preferredLabels = PARSER_DICTIONARY.carrierProfiles?.[carrierName]?.preferredLabels?.[normalizedKey] || [];
  const fieldConfig = PARSER_DICTIONARY.fields[normalizedKey];
  if (!fieldConfig) return null;

  if (
    [
      "index_strategy",
      "allocation_percent",
      "indexed_account_value",
      "fixed_account_value",
      "cap_rate",
      "participation_rate",
      "spread",
      "crediting_rate",
    ].includes(normalizedKey)
  ) {
    const rows = extractFgStrategyRows(pages, carrierName);
    const dominantIndexedRow = rankFgStrategyRows(
      rows.filter((row) => !row.isFixed),
      carrierName,
      normalizedKey
    )[0];
    const fixedRow = rankFgStrategyRows(
      rows.filter((row) => row.isFixed),
      carrierName,
      normalizedKey
    )[0];

    if (normalizedKey === "index_strategy" && dominantIndexedRow) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: dominantIndexedRow.marker,
        rawValue: dominantIndexedRow.name,
        type: "text",
        pageNumber: dominantIndexedRow.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.9,
        evidence: [
          `matched ${dominantIndexedRow.marker} section`,
          `selected ${dominantIndexedRow.strategySourceEvidence.replaceAll("_", " ")} indexed strategy row`,
          "text format valid",
        ],
        sourcePageType: dominantIndexedRow.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, dominantIndexedRow.sourcePageType),
      });
    }

    if (normalizedKey === "allocation_percent" && dominantIndexedRow?.allocationPercent) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: `${dominantIndexedRow.name} - Allocation`,
        rawValue: dominantIndexedRow.allocationPercent.display,
        type: "percent",
        pageNumber: dominantIndexedRow.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.88,
        evidence: [
          `matched ${dominantIndexedRow.marker} section`,
          `selected ${dominantIndexedRow.strategySourceEvidence.replaceAll("_", " ")} indexed strategy row`,
          "percent format valid",
        ],
        sourcePageType: dominantIndexedRow.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, dominantIndexedRow.sourcePageType),
      });
    }

    if (normalizedKey === "indexed_account_value" && dominantIndexedRow?.accountValue) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: `${dominantIndexedRow.name} - Indexed Account Value`,
        rawValue: dominantIndexedRow.accountValue.display,
        type: "currency",
        pageNumber: dominantIndexedRow.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.86,
        evidence: [
          `matched ${dominantIndexedRow.marker} section`,
          `selected ${dominantIndexedRow.strategySourceEvidence.replaceAll("_", " ")} indexed strategy value row`,
          "currency format valid",
        ],
        sourcePageType: dominantIndexedRow.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, dominantIndexedRow.sourcePageType),
      });
    }

    if (normalizedKey === "fixed_account_value" && fixedRow?.accountValue) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: `${fixedRow.name} - Fixed Account Value`,
        rawValue: fixedRow.accountValue.display,
        type: "currency",
        pageNumber: fixedRow.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.86,
        evidence: [
          `matched ${fixedRow.marker} section`,
          `selected ${fixedRow.strategySourceEvidence.replaceAll("_", " ")} fixed account row`,
          "currency format valid",
        ],
        sourcePageType: fixedRow.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, fixedRow.sourcePageType),
      });
    }

    if (normalizedKey === "cap_rate" && dominantIndexedRow?.capRate) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: `${dominantIndexedRow.name} - Cap Rate`,
        rawValue: dominantIndexedRow.capRate.display,
        type: "percent",
        pageNumber: dominantIndexedRow.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.84,
        evidence: [
          `matched ${dominantIndexedRow.marker} section`,
          `selected percent from ${dominantIndexedRow.strategySourceEvidence.replaceAll("_", " ")} indexed strategy row`,
          "percent format valid",
        ],
        sourcePageType: dominantIndexedRow.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, dominantIndexedRow.sourcePageType),
      });
    }

    if (normalizedKey === "participation_rate" && dominantIndexedRow?.participationRate) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: `${dominantIndexedRow.name} - Participation Rate`,
        rawValue: dominantIndexedRow.participationRate.display,
        type: "percent",
        pageNumber: dominantIndexedRow.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.84,
        evidence: [
          `matched ${dominantIndexedRow.marker} section`,
          `selected percent from ${dominantIndexedRow.strategySourceEvidence.replaceAll("_", " ")} indexed strategy row`,
          "percent format valid",
        ],
        sourcePageType: dominantIndexedRow.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, dominantIndexedRow.sourcePageType),
      });
    }

    if (normalizedKey === "spread" && dominantIndexedRow?.spread) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: `${dominantIndexedRow.name} - Spread`,
        rawValue: dominantIndexedRow.spread.display,
        type: "percent",
        pageNumber: dominantIndexedRow.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.82,
        evidence: [
          `matched ${dominantIndexedRow.marker} section`,
          "selected spread from dominant indexed strategy row",
          "percent format valid",
        ],
        sourcePageType: dominantIndexedRow.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, dominantIndexedRow.sourcePageType),
      });
    }

    if (normalizedKey === "crediting_rate" && dominantIndexedRow?.creditingRate) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: `${dominantIndexedRow.name} - Crediting Rate`,
        rawValue: dominantIndexedRow.creditingRate.display,
        type: "percent",
        pageNumber: dominantIndexedRow.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.82,
        evidence: [
          `matched ${dominantIndexedRow.marker} section`,
          "selected crediting rate from dominant indexed strategy row",
          "percent format valid",
        ],
        sourcePageType: dominantIndexedRow.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, dominantIndexedRow.sourcePageType),
      });
    }
  }

  return findBestFgSectionCandidate({
    pages,
    normalizedKey,
    type: fieldConfig.type,
    carrierName,
    documentType,
    aliases: uniqueStrings([...preferredLabels, ...fieldConfig.aliases]),
  });
}

function directStructuredExtraction(normalizedKey, text, documentType, carrierName) {
  const extractionDocumentType = resolveExtractionDocumentType(documentType);
  const patterns = {
    illustration: {
      policy_number: {
        regex: /(?:Policy Number|Policy No\.?|Contract Number|Contract No\.?)\s*:?\s*([A-Z0-9-]{6,})/i,
        type: "policyNumber",
        label: "Policy Number:",
        method: "exact_label_next_line",
      },
      issue_date: {
        regex: /(?:Date of Issue|Issue Date|Policy Date):\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
        type: "date",
        label: "Issue Date",
        method: "exact_label_next_line",
      },
      death_benefit: {
        regex: /Initial Specified Amount:\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Initial Specified Amount:",
        method: "exact_label_next_line",
      },
      planned_premium: {
        regex: /Planned Periodic Premium:\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Planned Periodic Premium:",
        method: "exact_label_next_line",
      },
      target_premium: {
        regex: /Initial Target Premium:\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Initial Target Premium:",
        method: "exact_label_next_line",
      },
      guaranteed_premium: {
        regex: /Monthly Guarantee Premium:\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Monthly Guarantee Premium:",
        method: "exact_label_next_line",
      },
      payment_mode: {
        regex: /(?:Planned Periodic Premium:\s+\$?[\d,]+\.\d{2}\s+Payable\s+(Monthly|Quarterly|Annual|Semi-Annual)|Mode:\s+(Monthly|Quarterly|Annual|Semi-Annual))/i,
        type: "text",
        label: "Payment Mode",
        method: "exact_label_same_line",
        group: (match) => match[1] || match[2],
      },
    },
    annual_statement: {
      statement_date: {
        regex: /(?:Statement Generated|Statement Date|As of Date|Period Ending)\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i,
        type: "date",
        label: "Statement Date",
        method: "exact_label_same_line",
      },
      policy_number: {
        regex: /(?:Policy Number|Policy No\.?|Contract Number|Contract No\.?|Certificate Number)\s*:?\s*([A-Z0-9-]{6,})/i,
        type: "policyNumber",
        label: "Policy Number:",
        method: "exact_label_next_line",
      },
      product_name: {
        regex: /Product:\s+([^\n]+)/i,
        type: "text",
        label: "Product:",
        method: "exact_label_next_line",
      },
      policy_type: {
        regex: /Product Type:\s+([^\n]+)/i,
        type: "text",
        label: "Product Type:",
        method: "exact_label_next_line",
      },
      death_benefit: {
        regex: /Death Benefit Amount\*?:\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Death Benefit Amount*:",
        method: "exact_label_next_line",
      },
      minimum_death_benefit: {
        regex: /(?:Guaranteed\s+)?Minimum Death Benefit\*?:\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Minimum Death Benefit:",
        method: "exact_label_next_line",
      },
      planned_premium: {
        regex: /Periodic Premium:\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Periodic Premium:",
        method: "exact_label_next_line",
      },
      premium_paid: {
        regex: /\+\s+Premiums\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "+ Premiums",
        method: "table_cell_neighbor",
      },
      accumulation_value: {
        regex: /Accumulation Value\s+at end of period\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Accumulation Value at end of period",
        method: "exact_label_next_line",
      },
      cash_value: {
        regex: /Cash Value\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Cash Value",
        method: "exact_label_next_line",
      },
      cash_surrender_value: {
        regex: /Cash Surrender Value\s+at end of period\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Cash Surrender Value at end of period",
        method: "exact_label_next_line",
      },
      loan_balance: {
        regex: /Ending Loan Balance\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Ending Loan Balance",
        method: "exact_label_next_line",
      },
      policy_charges_total: {
        regex: /Policy Charges\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Policy Charges",
        method: "table_cell_neighbor",
      },
      index_credit: {
        regex: /Index Account Interest(?:\s+\d+)?\s+\$?([\d,]+\.\d{2})/i,
        type: "currency",
        label: "Index Account Interest",
        method: "table_cell_neighbor",
      },
    },
  };

  const config = patterns[extractionDocumentType]?.[normalizedKey];
  if (!config) return null;

  const match = text.match(config.regex);
  if (!match) return null;

  const rawValue = typeof config.group === "function" ? config.group(match) : match[1];
  const normalized = normalizeValue(rawValue, config.type);
  if (!normalized || !passesFieldSpecificValidation(normalizedKey, rawValue, normalized)) return null;

  return {
    normalized_key: normalizedKey,
    value: normalized.value,
    display_value: normalized.display,
    raw_label: config.label,
    raw_value: rawValue,
    page_number: 1,
    extraction_method: config.method,
    confidence: "high",
    confidence_score: 0.99,
    carrier_hint: carrierName || "",
    document_type: documentType,
    evidence: ["matched structured document pattern", `${config.type} format valid`],
    rejected_candidates: [],
    missing: false,
  };
}

function buildDerivedField({
  normalizedKey,
  rawLabel,
  rawValue,
  type,
  pageNumber,
  method,
  carrierHint,
  documentType,
  confidenceScore,
  evidence,
  rejectedCandidates = [],
  sourcePageType = "",
  sourcePriority = 0,
  suppressionReason = "",
  chargeSourceKind = "",
  chargeConfidenceLabel = "",
}) {
  const normalized = normalizeValue(rawValue, type);
  if (!normalized || !passesFieldSpecificValidation(normalizedKey, rawValue, normalized)) {
    return null;
  }

  return {
    normalized_key: normalizedKey,
    value: normalized.value,
    display_value: normalized.display,
    raw_label: rawLabel,
    raw_value: rawValue,
    page_number: pageNumber,
    extraction_method: method,
    confidence: scoreToConfidence(confidenceScore),
    confidence_score: confidenceScore,
    carrier_hint: carrierHint || "",
    document_type: documentType,
    evidence,
    rejected_candidates: rejectedCandidates,
    source_page_type: sourcePageType,
    source_priority: sourcePriority,
    suppression_reason: suppressionReason,
    charge_source_kind: chargeSourceKind,
    charge_confidence_label: chargeConfidenceLabel,
    missing: false,
  };
}

function parseFgMonthlyActivityRow(windowLines) {
  const [date, ...rest] = windowLines;
  if (!/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(date || "").trim())) return null;
  const windowText = rest.join(" ");

  const percentMatch = windowText.match(/-?[\d.]+%/);
  const percentToken = percentMatch?.[0] || null;
  const currencyTokens = [...windowText.matchAll(/\(?\$?\s*-?[\d,]+(?:\.\d{2})?\)?/g)]
    .map((match) => match[0].trim())
    .filter((token) => token && token !== percentToken);

  if (currencyTokens.length < 3) return null;

  return {
    date,
    premium_paid: currencyTokens[0] || null,
    expense_charges: currencyTokens[1] || null,
    policy_cost_of_insurance: currencyTokens[2] || null,
    rider_charges: currencyTokens[3] || null,
    partial_surrenders: currencyTokens[4] || null,
    interest_bonus: currencyTokens[5] || null,
    ending_account_value: currencyTokens.at(-1) || null,
    interest_rate: percentToken,
    pending: containsPendingMarker(windowText),
  };
}

function extractChargeTotalsFromText(pageText, carrierName, documentType, pageNumber, sourcePageType) {
  const totalConfig = {
    premium_paid: {
      labels: ["premium paid", "premiums paid", "total premiums"],
      rawLabel: "Statement Charge Summary - Premium Paid",
    },
    policy_cost_of_insurance: {
      labels: ["cost of insurance", "policy cost of insurance", "insurance charge", "insurance charges", "coi"],
      rawLabel: "Statement Charge Summary - Cost of Insurance",
    },
    expense_charges: {
      labels: ["expense charges", "expense charge", "premium expense charge", "premium load"],
      rawLabel: "Statement Charge Summary - Expense Charges",
    },
    rider_charges: {
      labels: ["cost of riders", "rider charges", "rider charge"],
      rawLabel: "Statement Charge Summary - Cost of Riders",
    },
    admin_fee: {
      labels: ["administrative charge", "administrative fee", "admin fee", "policy fee"],
      rawLabel: "Statement Charge Summary - Administrative Charge",
    },
    monthly_deduction: {
      labels: ["monthly deduction", "monthly deductions"],
      rawLabel: "Statement Charge Summary - Monthly Deduction",
    },
  };

  const lines = splitLines(pageText);
  const totals = {};

  Object.entries(totalConfig).forEach(([key, config]) => {
    const labelPattern = config.labels.map((label) => escapeRegExp(label)).join("|");
    const sameLineRegex = new RegExp(`(?:${labelPattern})(?:[^\\n$\\d-]{0,40})\\(?\\$?\\s*(-?[\\d,]+(?:\\.\\d{2})?)\\)?`, "i");
    const totalLineRegex = new RegExp(`(?:total|annual)(?:[^\\n]{0,24})?(?:${labelPattern})(?:[^\\n$\\d-]{0,40})\\(?\\$?\\s*(-?[\\d,]+(?:\\.\\d{2})?)\\)?`, "i");
    const nextLineRegex = new RegExp(`^(?:${labelPattern})$`, "i");

    let chosenMatch = null;
    let matchedLabel = "";

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const totalLineMatch = line.match(totalLineRegex);
      if (totalLineMatch) {
        chosenMatch = totalLineMatch[1];
        matchedLabel = line;
        break;
      }

      const sameLineMatch = line.match(sameLineRegex);
      if (sameLineMatch) {
        chosenMatch = sameLineMatch[1];
        matchedLabel = line;
        break;
      }

      if (nextLineRegex.test(line)) {
        const nextLine = lines[index + 1] || "";
        const nextValueMatch = nextLine.match(/\(?\$?\s*(-?[\d,]+(?:\.\d{2})?)\)?/);
        if (nextValueMatch) {
          chosenMatch = nextValueMatch[1];
          matchedLabel = `${line} / ${nextLine}`;
          break;
        }
      }
    }

    if (!chosenMatch) return;

    const derivedField = buildDerivedField({
      normalizedKey:
        key === "policy_cost_of_insurance"
          ? "cost_of_insurance"
          : key === "expense_charges"
            ? "expense_charge"
            : key === "rider_charges"
              ? "rider_charge"
              : key,
      rawLabel: config.rawLabel,
      rawValue: chosenMatch,
      type: "currency",
      pageNumber,
      method: "table_cell_neighbor",
      carrierHint: carrierName,
      documentType,
      confidenceScore: 0.9,
      evidence: [
        "matched explicit statement charge total",
        `page classified as ${sourcePageType || "unknown"}`,
      ],
      sourcePageType,
      sourcePriority: getSourcePriority(
        carrierName,
        key === "policy_cost_of_insurance"
          ? "cost_of_insurance"
          : key === "expense_charges"
            ? "expense_charge"
            : key === "rider_charges"
              ? "rider_charge"
              : key,
        sourcePageType
      ),
    });

    if (!derivedField) return;

    totals[key] = {
      value: derivedField.value,
      display: derivedField.display_value,
      rawLabel: matchedLabel,
      sourceKind: "annual_total",
      pageNumber,
      sourcePageType,
    };
  });

  return totals;
}

function extractFgMonthlyActivityTable(pages, documentType, carrierName) {
  const pageIndex = pages.findIndex((pageText) => {
    const lower = pageText.toLowerCase();
    return (
      lower.includes("premium paid") &&
      lower.includes("expense charges") &&
      lower.includes("cost of insurance") &&
      lower.includes("ending account value")
    );
  });

  if (pageIndex === -1) {
    return { rows: [], pageNumber: null, totals: {}, endingAccountValue: null, reason: "No F&G monthly activity table found" };
  }

  const lines = splitLines(pages[pageIndex]);
  const rows = [];
  const suppressedRows = [];
  const sourcePageType = getPageSourceType(carrierName, documentType, pages[pageIndex] || "");

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(lines[i])) continue;
    const parsed = parseFgMonthlyActivityRow(lines.slice(i, i + 4));
    if (!parsed) continue;
    if (parsed.pending) {
      suppressedRows.push({ row_start: lines[i], reason: "TBD marker observed; row kept with lower confidence" });
    }
    rows.push(parsed);
  }

  const sumKey = (key) => {
    const values = rows.map((row) => normalizeCurrency(row[key])).filter(Boolean);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value.value, 0);
  };

  const explicitTotals = extractChargeTotalsFromText(
    pages[pageIndex],
    carrierName,
    documentType,
    pageIndex + 1,
    sourcePageType
  );
  const monthlyRollups = {
    premium_paid: sumKey("premium_paid"),
    expense_charges: sumKey("expense_charges"),
    policy_cost_of_insurance: sumKey("policy_cost_of_insurance"),
    rider_charges: sumKey("rider_charges"),
    interest_bonus: sumKey("interest_bonus"),
  };
  const totalSources = {
    premium_paid: explicitTotals?.premium_paid
      ? explicitTotals.premium_paid
      : monthlyRollups.premium_paid !== null
        ? {
            value: monthlyRollups.premium_paid,
            display: formatCurrencyForDebug(monthlyRollups.premium_paid),
            sourceKind: rows.length === 1 ? "table_row" : "monthly_rollup",
            pageNumber: pageIndex + 1,
            sourcePageType,
            rawLabel: "Monthly Activity - Premium Paid",
          }
        : null,
    expense_charges: explicitTotals?.expense_charges
      ? explicitTotals.expense_charges
      : monthlyRollups.expense_charges !== null
        ? {
            value: monthlyRollups.expense_charges,
            display: formatCurrencyForDebug(monthlyRollups.expense_charges),
            sourceKind: rows.length === 1 ? "table_row" : "monthly_rollup",
            pageNumber: pageIndex + 1,
            sourcePageType,
            rawLabel: "Monthly Activity - Expense Charges",
          }
        : null,
    policy_cost_of_insurance: explicitTotals?.policy_cost_of_insurance
      ? explicitTotals.policy_cost_of_insurance
      : monthlyRollups.policy_cost_of_insurance !== null
        ? {
            value: monthlyRollups.policy_cost_of_insurance,
            display: formatCurrencyForDebug(monthlyRollups.policy_cost_of_insurance),
            sourceKind: rows.length === 1 ? "table_row" : "monthly_rollup",
            pageNumber: pageIndex + 1,
            sourcePageType,
            rawLabel: "Monthly Activity - Cost of Insurance",
          }
        : null,
    rider_charges: explicitTotals?.rider_charges
      ? explicitTotals.rider_charges
      : monthlyRollups.rider_charges !== null
        ? {
            value: monthlyRollups.rider_charges,
            display: formatCurrencyForDebug(monthlyRollups.rider_charges),
            sourceKind: rows.length === 1 ? "table_row" : "monthly_rollup",
            pageNumber: pageIndex + 1,
            sourcePageType,
            rawLabel: "Monthly Activity - Cost of Riders",
          }
        : null,
    admin_fee: explicitTotals?.admin_fee || null,
    monthly_deduction: explicitTotals?.monthly_deduction || null,
    interest_bonus: monthlyRollups.interest_bonus !== null
      ? {
          value: monthlyRollups.interest_bonus,
          display: formatCurrencyForDebug(monthlyRollups.interest_bonus),
          sourceKind: rows.length === 1 ? "table_row" : "monthly_rollup",
          pageNumber: pageIndex + 1,
          sourcePageType,
          rawLabel: "Monthly Activity - Interest / Bonus",
        }
      : null,
  };
  const endingAccountValue = rows.length ? normalizeCurrency(rows.at(-1).ending_account_value) : null;

  return {
    rows,
    pageNumber: pageIndex + 1,
    totals: Object.fromEntries(
      Object.entries(totalSources).map(([key, source]) => [key, source?.value ?? null])
    ),
    totalSources,
    monthlyRollups,
    explicitTotals,
    endingAccountValue,
    suppressedRows,
    sourcePageType,
    reason: rows.length ? "" : "F&G monthly activity table detected but no finalized rows were parsed",
  };
}

function extractMonthlyActivityTable(pages) {
  const pageIndex = pages.findIndex((pageText) => {
    const lower = pageText.toLowerCase();
    return (
      lower.includes("policy activity summary by month") &&
      lower.includes("premiums") &&
      lower.includes("cost of") &&
      lower.includes("withdrawals")
    );
  });

  if (pageIndex === -1) {
    return { rows: [], pageNumber: null, reason: "No matching label found" };
  }

  const lines = splitLines(pages[pageIndex]);
  const rows = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\d{2}\/\d{2}\/\d{2}$/.test(lines[i])) continue;

    const date = lines[i];
    const values = [];
    let j = i + 1;

    while (j < lines.length && !/^\d{2}\/\d{2}\/\d{2}$/.test(lines[j])) {
      if (/^\$?[\d,]+\.\d{2}$/.test(lines[j])) {
        values.push(lines[j].replace(/^\$/, ""));
      }
      if (values.length >= 10) break;
      j += 1;
    }

    if (values.length >= 10) {
      rows.push({
        date,
        beginning_accumulation: values[0],
        premiums_received: values[1],
        premiums_expenses: values[2],
        policy_cost_of_insurance: values[3],
        rider_charges: values[4],
        expense_charges: values[5],
        declared_interest: values[6],
        index_account_interest: values[7],
        withdrawals: values[8],
        ending_accumulation: values[9],
      });
    }
  }

  return {
    rows,
    pageNumber: pageIndex + 1,
    reason: rows.length > 0 ? "" : "Label found but no valid nearby monthly values",
  };
}

function sumMonthlyColumn(rows, key) {
  if (rows.length === 0) return null;
  const normalizedValues = rows
    .map((row) => normalizeCurrency(row[key]))
    .filter(Boolean);

  if (normalizedValues.length !== rows.length) return null;

  return normalizedValues.reduce((sum, item) => sum + item.value, 0);
}

function extractStatementTableField(pages, normalizedKey, documentType, carrierName) {
  if (isFgCarrier(carrierName)) {
    const fgMonthlyTable = extractFgMonthlyActivityTable(pages, documentType, carrierName);
    const fgKeyMap = {
      premium_paid: { totalKey: "premium_paid", label: "F&G Monthly Activity - Premium Paid", type: "currency" },
      cost_of_insurance: {
        totalKey: "policy_cost_of_insurance",
        label: "F&G Monthly Activity - Cost of Insurance",
        type: "currency",
      },
      expense_charge: {
        totalKey: "expense_charges",
        label: "F&G Monthly Activity - Expense Charges",
        type: "currency",
      },
      rider_charge: {
        totalKey: "rider_charges",
        label: "F&G Monthly Activity - Cost of Riders",
        type: "currency",
      },
      admin_fee: {
        totalKey: "admin_fee",
        label: "F&G Statement Charges - Administrative Charge",
        type: "currency",
      },
      monthly_deduction: {
        totalKey: "monthly_deduction",
        label: "F&G Statement Charges - Monthly Deduction",
        type: "currency",
      },
      index_credit: {
        totalKey: "interest_bonus",
        label: "F&G Monthly Activity - Interest / Bonus",
        type: "currency",
      },
    };

    if (fgKeyMap[normalizedKey]) {
      if (!fgMonthlyTable.pageNumber) {
        return null;
      }
      const totalSource = fgMonthlyTable.totalSources?.[fgKeyMap[normalizedKey].totalKey] || null;
      const total = totalSource?.value;
      if (total === null || total === undefined) {
        return null;
      }
      return buildDerivedField({
        normalizedKey,
        rawLabel: fgKeyMap[normalizedKey].label,
        rawValue: String(Number(total).toFixed(2)),
        type: fgKeyMap[normalizedKey].type,
        pageNumber: fgMonthlyTable.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore:
          totalSource?.sourceKind === "annual_total"
            ? normalizedKey === "cost_of_insurance"
              ? 0.93
              : 0.9
            : normalizedKey === "premium_paid"
              ? 0.84
              : 0.82,
        evidence: [
          totalSource?.sourceKind === "annual_total"
            ? "matched explicit F&G statement charge total"
            : "matched F&G monthly activity table",
          totalSource?.sourceKind === "annual_total"
            ? "used explicit statement total instead of computed rollup"
            : totalSource?.sourceKind === "table_row"
              ? "used single strongly supported table row"
              : "summed monthly row values",
          fgMonthlyTable.suppressedRows?.length ? "TBD rows observed and scored lower" : "no pending rows observed",
          `charge source kind: ${totalSource?.sourceKind || "unknown"}`,
        ],
        sourcePageType: fgMonthlyTable.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, fgMonthlyTable.sourcePageType),
        chargeSourceKind: totalSource?.sourceKind || "fallback",
        chargeConfidenceLabel: resolveChargeConfidenceLabel({
          fieldKey: normalizedKey,
          sourceKind: totalSource?.sourceKind || "fallback",
          confidenceScore:
            totalSource?.sourceKind === "annual_total"
              ? normalizedKey === "cost_of_insurance"
                ? 0.93
                : 0.9
              : normalizedKey === "premium_paid"
                ? 0.84
                : 0.82,
          sourcePageType: fgMonthlyTable.sourcePageType,
        }),
      });
    }

    if (normalizedKey === "accumulation_value" && fgMonthlyTable.endingAccountValue) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: "F&G Monthly Activity - Ending Account Value",
        rawValue: fgMonthlyTable.endingAccountValue.display,
        type: "currency",
        pageNumber: fgMonthlyTable.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.68,
        evidence: [
          "matched F&G monthly activity table",
          "used ending account value from monthly rows as secondary signal",
        ],
        sourcePageType: fgMonthlyTable.sourcePageType,
        sourcePriority: getSourcePriority(carrierName, normalizedKey, fgMonthlyTable.sourcePageType),
      });
    }
  }

  const monthlyTable = extractMonthlyActivityTable(pages);

  if (["cost_of_insurance", "expense_charge", "rider_charge"].includes(normalizedKey)) {
    if (!monthlyTable.pageNumber) {
      return null;
    }

    const monthlyKeyMap = {
      cost_of_insurance: "policy_cost_of_insurance",
      expense_charge: "expense_charges",
      rider_charge: "rider_charges",
    };

    const labelMap = {
      cost_of_insurance: "Policy Activity Summary By Month - Policy Cost of Insurance",
      expense_charge: "Policy Activity Summary By Month - Expense Charges",
      rider_charge: "Policy Activity Summary By Month - Rider(s) Charges",
    };

    const total = sumMonthlyColumn(monthlyTable.rows, monthlyKeyMap[normalizedKey]);
    if (total === null) {
      return null;
    }

    return buildDerivedField({
      normalizedKey,
      rawLabel: labelMap[normalizedKey],
      rawValue: String(total.toFixed(2)),
      type: "currency",
      pageNumber: monthlyTable.pageNumber,
      method: "table_cell_neighbor",
      carrierHint: carrierName,
      documentType,
      confidenceScore: 0.9,
      evidence: [
        "matched policy activity summary by month section",
        "summed repeated monthly column values",
        "currency format valid",
        "single column selected from known table layout",
        "charge source kind: monthly_rollup",
      ],
      chargeSourceKind: "monthly_rollup",
      chargeConfidenceLabel: resolveChargeConfidenceLabel({
        fieldKey: normalizedKey,
        sourceKind: "monthly_rollup",
        confidenceScore: 0.9,
        sourcePageType: "monthly_activity_table",
      }),
    });
  }

  const allocationPageIndex = pages.findIndex((pageText) =>
    pageText.toLowerCase().includes("your account values and allocation")
  );
  const allocationSummaryIndex = pages.findIndex((pageText) =>
    pageText.toLowerCase().includes("your premium allocation summary")
  );
  const openIndexPageIndex = pages.findIndex((pageText) =>
    pageText.toLowerCase().includes("external indices performance detail") &&
    pageText.toLowerCase().includes("open index account")
  );

  if (
    [
      "index_strategy",
      "allocation_percent",
      "indexed_account_value",
      "fixed_account_value",
      "cap_rate",
      "participation_rate",
    ].includes(normalizedKey)
  ) {
    const allocationPageLines =
      allocationPageIndex >= 0 ? splitLines(pages[allocationPageIndex]) : [];
    const allocationSummaryLines =
      allocationSummaryIndex >= 0 ? splitLines(pages[allocationSummaryIndex]) : [];

    const strategyRows = [];
    for (let i = 0; i < allocationPageLines.length; i += 1) {
      const line = allocationPageLines[i];
      if (
        /index account/i.test(line) &&
        !/index account strategies/i.test(line) &&
        !/total of index accounts/i.test(line) &&
        !/interest crediting account/i.test(line)
      ) {
        const valueLine = allocationPageLines[i + 1];
        const percentLine = allocationPageLines[i + 2];
        if (normalizeCurrency(valueLine) && normalizePercent(percentLine)) {
          strategyRows.push({
            name: line,
            value: normalizeCurrency(valueLine),
            percent: normalizePercent(percentLine),
            pageNumber: allocationPageIndex + 1,
          });
        }
      }
    }

    const dominantStrategy = strategyRows.sort((a, b) => {
      if (b.percent.value !== a.percent.value) return b.percent.value - a.percent.value;
      return b.value.value - a.value.value;
    })[0];

    const totalIndexLineIndex = allocationPageLines.findIndex((line) =>
      /total of index accounts/i.test(line)
    );
    const declaredInterestIndex = allocationPageLines.findIndex((line) =>
      /declared interest account/i.test(line)
    );

    const totalIndexValue =
      totalIndexLineIndex >= 0 ? normalizeCurrency(allocationPageLines[totalIndexLineIndex + 1]) : null;
    const fixedAccountValue =
      declaredInterestIndex >= 0 ? normalizeCurrency(allocationPageLines[declaredInterestIndex + 1]) : null;

    if (normalizedKey === "index_strategy" && dominantStrategy) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: "YOUR ACCOUNT VALUES AND ALLOCATION - Index Account Strategies",
        rawValue: dominantStrategy.name,
        type: "text",
        pageNumber: dominantStrategy.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.91,
        evidence: [
          "matched account values and allocation section",
          "selected highest-allocation index strategy row",
          "text format valid",
        ],
      });
    }

    if (normalizedKey === "allocation_percent" && dominantStrategy) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: `${dominantStrategy.name} - % of Accumulation Value`,
        rawValue: dominantStrategy.percent.display,
        type: "percent",
        pageNumber: dominantStrategy.pageNumber,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.91,
        evidence: [
          "matched account values and allocation section",
          "selected highest-allocation index strategy row",
          "percent format valid",
        ],
      });
    }

    if (normalizedKey === "indexed_account_value" && totalIndexValue) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: "Total of Index Accounts",
        rawValue: totalIndexValue.display,
        type: "currency",
        pageNumber: allocationPageIndex + 1,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.93,
        evidence: [
          "matched account values and allocation section",
          "selected total of index accounts row",
          "currency format valid",
        ],
      });
    }

    if (normalizedKey === "fixed_account_value" && fixedAccountValue) {
      return buildDerivedField({
        normalizedKey,
        rawLabel: "Declared Interest Account (DIA)",
        rawValue: fixedAccountValue.display,
        type: "currency",
        pageNumber: allocationPageIndex + 1,
        method: "table_cell_neighbor",
        carrierHint: carrierName,
        documentType,
        confidenceScore: 0.92,
        evidence: [
          "matched account values and allocation section",
          "selected declared interest account row",
          "currency format valid",
        ],
      });
    }

    if ((normalizedKey === "index_strategy" || normalizedKey === "allocation_percent") && allocationSummaryLines.length > 0) {
      const summaryRows = [];
      for (let i = 0; i < allocationSummaryLines.length; i += 1) {
        const line = allocationSummaryLines[i];
        if (/index account/i.test(line) && !/index account strategy/i.test(line)) {
          const percentLine = allocationSummaryLines[i + 1];
          if (normalizePercent(percentLine)) {
            summaryRows.push({
              name: line,
              percent: normalizePercent(percentLine),
              pageNumber: allocationSummaryIndex + 1,
            });
          }
        }
      }

      const dominantSummaryRow = summaryRows.sort((a, b) => b.percent.value - a.percent.value)[0];
      if (normalizedKey === "index_strategy" && dominantSummaryRow) {
        return buildDerivedField({
          normalizedKey,
          rawLabel: "YOUR PREMIUM ALLOCATION SUMMARY - Index Account Strategy",
          rawValue: dominantSummaryRow.name,
          type: "text",
          pageNumber: dominantSummaryRow.pageNumber,
          method: "table_cell_neighbor",
          carrierHint: carrierName,
          documentType,
          confidenceScore: 0.87,
          evidence: [
            "matched premium allocation summary section",
            "selected highest-allocation strategy row",
            "text format valid",
          ],
        });
      }

      if (normalizedKey === "allocation_percent" && dominantSummaryRow) {
        return buildDerivedField({
          normalizedKey,
          rawLabel: `${dominantSummaryRow.name} - Allocation`,
          rawValue: dominantSummaryRow.percent.display,
          type: "percent",
          pageNumber: dominantSummaryRow.pageNumber,
          method: "table_cell_neighbor",
          carrierHint: carrierName,
          documentType,
          confidenceScore: 0.87,
          evidence: [
            "matched premium allocation summary section",
            "selected highest-allocation strategy row",
            "percent format valid",
          ],
        });
      }
    }

    if ((normalizedKey === "cap_rate" || normalizedKey === "participation_rate") && openIndexPageIndex >= 0) {
      const lines = splitLines(pages[openIndexPageIndex]);
      const strategyLineIndex = lines.findIndex((line) => /high cap rate account/i.test(line));
      if (strategyLineIndex >= 0) {
        const rowWindow = lines.slice(strategyLineIndex, strategyLineIndex + 8);
        const percentCandidates = rowWindow.filter((line) => normalizePercent(line));
        const rejectedCandidates = percentCandidates.map((candidate) => ({
          display_value: candidate,
          raw_label: "Open Index Account detail row",
          extraction_method: "table_cell_neighbor",
          confidence_score: 0.7,
          page_number: openIndexPageIndex + 1,
        }));

        if (normalizedKey === "cap_rate") {
          const capCandidate = percentCandidates.at(-1);
          if (capCandidate) {
            return buildDerivedField({
              normalizedKey,
              rawLabel: "Cap Rate",
              rawValue: capCandidate,
              type: "percent",
              pageNumber: openIndexPageIndex + 1,
              method: "table_cell_neighbor",
              carrierHint: carrierName,
              documentType,
              confidenceScore: 0.9,
              evidence: [
                "matched external indices performance detail section",
                "selected final percent value from high cap rate account row",
                "percent format valid",
              ],
              rejectedCandidates: rejectedCandidates.filter((candidate) => candidate.display_value !== capCandidate),
            });
          }
        }

        if (normalizedKey === "participation_rate") {
          return null;
        }
      }
    }
  }

  return null;
}

function collectCandidates({
  pages,
  aliases,
  type,
  carrierName,
  normalizedKey,
  documentType,
  preferredMarkers = [],
}) {
  const candidates = [];
  const carrierPreferred =
    carrierName && PARSER_DICTIONARY.carrierProfiles[carrierName]?.preferredLabels?.[normalizedKey]
      ? PARSER_DICTIONARY.carrierProfiles[carrierName].preferredLabels[normalizedKey]
      : [];

  const orderedAliases = [...carrierPreferred, ...aliases.filter((alias) => !carrierPreferred.includes(alias))];
  const sourcePolicy = isFgCarrier(carrierName) ? getFgFieldSourcePolicy(normalizedKey) : null;

  pages.forEach((pageText, pageIndex) => {
    const lines = splitLines(pageText);
    const lowerPageText = pageText.toLowerCase();
    const markerBoost = preferredMarkers.some((marker) => lowerPageText.includes(marker.toLowerCase())) ? 0.12 : 0;
    const pagePenalty = getCandidatePagePenalty(documentType, normalizedKey, pageIndex + 1);
    const sourcePageType = getPageSourceType(carrierName, documentType, pageText);
    const sourcePriority = getSourcePriority(carrierName, normalizedKey, sourcePageType);
    const targetFieldPageBoost = isFgCarrier(carrierName)
      ? getFgTargetFieldPageBoost(normalizedKey, sourcePageType)
      : 0;
    const hierarchyPenalty =
      sourcePolicy && !sourcePolicy.allowed.includes(sourcePageType)
        ? 0.14
        : 0;

    lines.forEach((line, lineIndex) => {
      const lowerLine = line.toLowerCase();

      orderedAliases.forEach((alias, aliasIndex) => {
        const lowerAlias = alias.toLowerCase();
        const isExactLine = lowerLine === lowerAlias;
        const hasAlias = lowerLine.includes(lowerAlias);

        if (!hasAlias) return;

        const exactRemainder = normalizeText(line.replace(new RegExp(escapeRegExp(alias), "ig"), ""));

        const sameLineMethods = [];
        if (
          exactRemainder &&
          matchesExpectedType(exactRemainder, type) &&
          looksLikeValueStart(exactRemainder, type)
        ) {
          sameLineMethods.push(isExactLine ? "exact_label_same_line" : "fuzzy_label_same_line");
        }

        sameLineMethods.forEach((method) => {
          const normalized = normalizeValue(exactRemainder, type);
          if (!normalized || !passesFieldSpecificValidation(normalizedKey, exactRemainder, normalized)) return;
          let score = method === "exact_label_same_line" ? 0.98 : 0.82;
          if (aliasIndex === 0) score += 0.02;
          if (carrierPreferred.includes(alias)) score += 0.03;
          score += markerBoost;
          score -= pagePenalty;
          score -= hierarchyPenalty;
          score += targetFieldPageBoost;
          score += Math.min(sourcePriority * 0.02, 0.08);
          if (containsPendingMarker(exactRemainder)) score -= 0.05;

          candidates.push({
            normalized_key: normalizedKey,
            value: normalized.value,
            display_value: normalized.display,
            raw_label: alias,
            raw_value: exactRemainder,
            page_number: pageIndex + 1,
            extraction_method: method,
            confidence_score: Math.min(score, 0.99),
            carrier_hint: carrierName || "",
            document_type: documentType,
            evidence: [
              isExactLine ? "exact label matched" : "fuzzy label matched",
              "value found on same line",
              carrierPreferred.includes(alias) ? "matched preferred carrier label" : "matched global alias",
              `${type} format valid`,
              markerBoost > 0 ? "matched preferred section marker" : "no section marker boost",
              sourcePageType ? `page classified as ${sourcePageType}` : "",
            ],
            rejected_candidates: [],
            line_index: lineIndex,
            marker_matched: markerBoost > 0,
            source_page_type: sourcePageType,
            source_priority: sourcePriority,
            suppression_reason: "",
            missing: false,
          });
        });

        for (let offset = 1; offset <= 2; offset += 1) {
          const nextLine = lines[lineIndex + offset];
          if (!nextLine) continue;
          if (!matchesExpectedType(nextLine, type) || !looksLikeValueStart(nextLine, type)) continue;

          const normalized = normalizeValue(nextLine, type);
          if (!normalized || !passesFieldSpecificValidation(normalizedKey, nextLine, normalized)) continue;

          let score = isExactLine ? 0.92 : 0.74;
          if (offset === 2) score -= 0.08;
          if (aliasIndex === 0) score += 0.02;
          if (carrierPreferred.includes(alias)) score += 0.03;
          score += markerBoost;
          score -= pagePenalty;
          score -= hierarchyPenalty;
          score += targetFieldPageBoost;
          score += Math.min(sourcePriority * 0.02, 0.08);
          if (containsPendingMarker(nextLine)) score -= 0.05;

          candidates.push({
            normalized_key: normalizedKey,
            value: normalized.value,
            display_value: normalized.display,
            raw_label: alias,
            raw_value: nextLine,
            page_number: pageIndex + 1,
            extraction_method: isExactLine ? "exact_label_next_line" : "fuzzy_label_next_line",
            confidence_score: Math.min(score, 0.97),
            carrier_hint: carrierName || "",
            document_type: documentType,
            evidence: [
              isExactLine ? "exact label matched" : "fuzzy label matched",
              offset === 1 ? "value found on next line" : "value found two lines down",
              carrierPreferred.includes(alias) ? "matched preferred carrier label" : "matched global alias",
              `${type} format valid`,
              markerBoost > 0 ? "matched preferred section marker" : "no section marker boost",
              sourcePageType ? `page classified as ${sourcePageType}` : "",
            ],
            rejected_candidates: [],
            line_index: lineIndex + offset,
            marker_matched: markerBoost > 0,
            source_page_type: sourcePageType,
            source_priority: sourcePriority,
            suppression_reason: "",
            missing: false,
          });
        }
      });
    });
  });

  return candidates;
}

function selectBestCandidate(candidates, normalizedKey, documentType, carrierName) {
  if (candidates.length === 0) {
    return buildMissingField(normalizedKey, "No valid candidate found", documentType, carrierName);
  }

  const sorted = [...candidates].sort((a, b) => b.confidence_score - a.confidence_score);
  const best = {
    ...sorted[0],
    rejected_candidates: sorted.slice(1, 4).map((candidate) => ({
      display_value: candidate.display_value,
      raw_label: candidate.raw_label,
      extraction_method: candidate.extraction_method,
      confidence_score: candidate.confidence_score,
      page_number: candidate.page_number,
      source_page_type: candidate.source_page_type || "",
      suppression_reason: "",
    })),
    candidate_count: candidates.length,
    chosen_candidate_score: sorted[0].confidence_score,
    suppressed_count: 0,
    fallback_used: sorted[0].confidence_score < PARSER_DICTIONARY.confidenceThresholds.medium,
  };

  const assessedCandidates = sorted.map((candidate) => {
    const assessment = buildFieldSanityAssessment(normalizedKey, candidate);
    const adjustedScore = candidate.confidence_score - assessment.penalty;
    return {
      ...candidate,
      confidence_score: adjustedScore,
      sanitation_warnings: assessment.warnings,
      cleaned_raw_value: assessment.cleanedRawValue,
      rejected_by_sanity: assessment.reject,
    };
  });
  const viableCandidates = assessedCandidates.filter((candidate) => !candidate.rejected_by_sanity);
  const winnerPool = viableCandidates.length > 0 ? viableCandidates : assessedCandidates;
  winnerPool.sort((a, b) => b.confidence_score - a.confidence_score);
  const winner = winnerPool[0];
  const firstCandidateRejected =
    sorted[0] &&
    winner &&
    (sorted[0].raw_value !== winner.raw_value || sorted[0].page_number !== winner.page_number);

  best.value = winner.value;
  best.display_value = winner.display_value;
  best.raw_label = winner.raw_label;
  best.raw_value = winner.raw_value;
  best.page_number = winner.page_number;
  best.extraction_method = winner.extraction_method;
  best.carrier_hint = winner.carrier_hint;
  best.document_type = winner.document_type;
  best.source_page_type = winner.source_page_type;
  best.source_priority = winner.source_priority;
  best.evidence = [...(winner.evidence || [])];
  best.confidence_score = winner.confidence_score;
  best.cleaned_raw_value = winner.cleaned_raw_value || winner.raw_value;
  best.sanitation_changed_value = best.cleaned_raw_value !== best.raw_value;
  best.first_candidate_rejected = Boolean(firstCandidateRejected);
  best.first_candidate_rejected_reason = firstCandidateRejected
    ? (winner.sanitation_warnings || []).join("; ") || "sanity check chose a stronger alternate candidate"
    : "";
  best.label_context = winner.raw_label || "";
  best.rejected_candidates = assessedCandidates
    .filter((candidate) => candidate !== winner)
    .slice(0, 4)
    .map((candidate) => ({
    display_value: candidate.display_value,
    raw_label: candidate.raw_label,
    extraction_method: candidate.extraction_method,
    confidence_score: candidate.confidence_score,
    page_number: candidate.page_number,
    source_page_type: candidate.source_page_type || "",
    suppression_reason: candidate.rejected_by_sanity ? (candidate.sanitation_warnings || []).join("; ") : "",
  }));

  if (winnerPool.length > 1 && winnerPool[1].display_value !== best.display_value) {
    best.confidence_score = Math.max(0, best.confidence_score - 0.08);
    best.evidence = [
      ...best.evidence,
      "multiple competing matches were found",
    ];
  } else {
    best.evidence = [...best.evidence, "single nearby value selected"];
  }

  if (winner.sanitation_warnings?.length) {
    best.evidence = [...best.evidence, ...winner.sanitation_warnings];
  }
  best.confidence = scoreToConfidence(best.confidence_score);
  return best;
}

function collectUnmatchedLikelyLabels(pages, matchedFields, carrierName) {
  const matchedLabels = new Set(
    Object.values(matchedFields)
      .map((field) => normalizeText(field?.raw_label || "").toLowerCase())
      .filter(Boolean)
  );
  const knownLabels = new Set(
    Object.values(PARSER_DICTIONARY.fields)
      .flatMap((field) => field.aliases || [])
      .map((alias) => normalizeText(alias).toLowerCase())
  );
  const carrierLabels = new Set(
    Object.values(PARSER_DICTIONARY.carrierProfiles?.[carrierName]?.preferredLabels || {})
      .flat()
      .map((label) => normalizeText(label).toLowerCase())
  );

  const suggestions = [];
  pages.forEach((pageText, pageIndex) => {
    splitLines(pageText).forEach((line) => {
      const match = line.match(/^([A-Za-z][A-Za-z0-9/&(),.%\- ]{3,60}):\s*(.+)?$/);
      if (!match) return;
      const label = normalizeText(match[1]).toLowerCase();
      if (!label) return;
      if (matchedLabels.has(label) || knownLabels.has(label) || carrierLabels.has(label)) return;
      suggestions.push(`${match[1]} (p${pageIndex + 1})`);
    });
  });

  return uniqueStrings(suggestions).slice(0, 8);
}

function buildParserDebug({ pages, fields, classification, carrierDetection, fileName = "", carrierSpecificDebug = null }) {
  const carrierName = carrierDetection?.confidence !== "low" ? carrierDetection?.carrier_name : "";
  const matchedFields = Object.values(fields).filter((field) => field && !field.missing);
  const missingFields = Object.values(fields).filter((field) => field?.missing);
  const sectionHits = uniqueStrings(
    matchedFields.flatMap((field) =>
      (field.evidence || [])
        .filter((entry) => /section|strategy row|preferred section marker/i.test(entry))
        .map((entry) => entry)
    )
  );
  const warnings = [];

  if (classification?.confidence === "low") {
    warnings.push("Document classification confidence is low for this packet.");
  }
  if (carrierDetection?.confidence === "low") {
    warnings.push("Carrier detection confidence is low for this packet.");
  }
  missingFields.forEach((field) => {
    if (/label found/i.test(field.reason || "")) {
      warnings.push(`${field.normalized_key}: ${field.reason}`);
    }
  });

  const sourceAttribution = Object.fromEntries(
    matchedFields.map((field) => [
      field.normalized_key,
      {
        value: field.display_value,
        source_page_type: field.source_page_type || "generic",
        source_confidence: field.confidence,
        suppression_reason: field.suppression_reason || "",
      },
    ])
  );

  const ignoredCandidates = uniqueStrings(
    matchedFields.flatMap((field) =>
      (field.rejected_candidates || [])
        .filter((candidate) => candidate?.suppression_reason)
        .map((candidate) => `${field.normalized_key}: ${candidate.suppression_reason}`)
    )
  );
  warnings.push(...ignoredCandidates);

  const fgMonthlyActivity = isFgCarrier(carrierName)
    ? extractFgMonthlyActivityTable(pages, classification?.document_type || "", carrierName)
    : null;
  const fgStrategyRows = isFgCarrier(carrierName) ? extractFgStrategyRows(pages, carrierName) : [];
  const fgStatementDateInfo = isFgCarrier(carrierName)
    ? extractFgStatementDateInfo(pages, fileName, classification?.document_type || "", carrierName)
    : null;
  const fgStrategyMenuRows = isFgCarrier(carrierName)
    ? extractFgStrategyMenuRows(pages, classification?.document_type || "", carrierName)
    : [];
  const currentOrDominantStrategy =
    fields.index_strategy && !fields.index_strategy.missing && fields.index_strategy.source_page_type !== "segment_detail"
      ? fields.index_strategy.display_value
      : "";
  const statementObservedStrategies = fgStrategyRows
    .filter((row) => ["statement_observed", "statement_active"].includes(row.strategySourceEvidence))
    .slice(0, 8)
    .map((row) => row.name);
  const statementActiveStrategies = fgStrategyRows
    .filter((row) => row.strategySourceEvidence === "statement_active")
    .slice(0, 8)
    .map((row) => row.name);
  const winningDisplayedStrategyRow = fgStrategyRows.find((row) => row.name === currentOrDominantStrategy) || null;
  const suppressedHistoricalSegmentRows = fgStrategyRows
    .filter((row) => row.strategySourceEvidence === "historical_segment")
    .slice(0, 8);
  const genericExtractionFieldCount = countPopulatedFields(
    fields,
    Object.keys(fields).filter((fieldKey) => !fields[fieldKey]?.merge_debug?.generic_missing)
  );
  const fgSpecificExtractionFieldCount = countPopulatedFields(
    fields,
    Object.keys(fields).filter((fieldKey) => !fields[fieldKey]?.merge_debug?.fg_missing)
  );
  const finalMergedFieldCount = countPopulatedFields(fields, Object.keys(fields));
  const fgOverrides = Object.entries(fields)
    .filter(([, field]) => field?.merge_debug?.selected === "fg_specific")
    .map(([fieldKey]) => fieldKey);
  const genericReversions = Object.entries(fields)
    .filter(([, field]) => field?.merge_debug?.reason === "generic_retained_for_coverage")
    .map(([fieldKey]) => fieldKey);
  const fieldDebugStats = Object.fromEntries(
    Object.entries(fields).map(([fieldKey, field]) => [
      fieldKey,
      {
        candidate_count: field?.candidate_count || 0,
        chosen_candidate_score: field?.chosen_candidate_score || field?.confidence_score || 0,
        suppressed_count: field?.suppressed_count || 0,
        fallback_used: Boolean(field?.fallback_used),
      },
    ])
  );
  const targetFieldDebug = Object.fromEntries(
    Object.entries(fields)
      .filter(([fieldKey]) =>
        FG_FIELD_RECOVERY_TARGETS.has(fieldKey) ||
        ["annual_target_premium", "guideline_single_premium", "guideline_level_premium", "payment_mode", "statement_date", "carrier_name"].includes(fieldKey)
      )
      .map(([fieldKey, field]) => [
        fieldKey,
        {
          winning_raw_value: field?.raw_value || "",
          cleaned_final_value: field?.display_value || "",
          source_page_role: field?.source_page_type || "generic",
          label_context: field?.label_context || field?.raw_label || "",
          sanitation_changed_value: Boolean(field?.sanitation_changed_value),
          first_candidate_rejected: Boolean(field?.first_candidate_rejected),
          first_candidate_rejected_reason: field?.first_candidate_rejected_reason || "",
        },
      ])
  );
  const rejectedFootnoteCandidates = uniqueStrings(
    Object.entries(fields).flatMap(([fieldKey, field]) =>
      (field?.rejected_candidates || [])
        .filter((candidate) => /footnote marker rejected/i.test(candidate?.suppression_reason || ""))
        .map((candidate) => `${fieldKey}: ${candidate.display_value}`)
    )
  );
  const chargeFieldDebug = Object.fromEntries(
    [...CHARGE_RELATED_FIELDS].map((fieldKey) => {
      const field = fields[fieldKey];
      const rejectedCandidates = (field?.rejected_candidates || []).filter((candidate) =>
        /footnote marker|tiny .*lacked|negative financial value lacked|charge candidate lacked/i.test(
          candidate?.suppression_reason || ""
        )
      );
      return [
        fieldKey,
        {
          raw_candidates: (field?.rejected_candidates || [])
            .slice(0, 8)
            .map((candidate) => ({
              raw_value: candidate?.raw_value || candidate?.display_value || "",
              raw_label: candidate?.raw_label || "",
              suppression_reason: candidate?.suppression_reason || "",
              source_page_type: candidate?.source_page_type || "",
            })),
          winning_value: field?.display_value || "",
          winning_source_page_role: field?.source_page_type || "",
          winning_source_label: field?.raw_label || "",
          source_kind:
            field?.charge_source_kind ||
            field?.evidence?.find((entry) => /charge source kind:/i.test(entry))?.replace(/^.*charge source kind:\s*/i, "") ||
            (field?.source_page_type === "monthly_activity_table" ? "generic_fallback" : ""),
          charge_confidence_label: field?.charge_confidence_label || "",
          rejected_candidates: rejectedCandidates.map((candidate) => ({
            raw_value: candidate?.raw_value || candidate?.display_value || "",
            raw_label: candidate?.raw_label || "",
            reason: candidate?.suppression_reason || "",
          })),
        },
      ];
    })
  );

  if (
    isFgCarrier(carrierName) &&
    finalMergedFieldCount < genericExtractionFieldCount
  ) {
    warnings.push("F&G carrier-specific pass reduced coverage; generic extraction retained");
  }

  return {
    matched_field_count: matchedFields.length,
    missing_field_count: missingFields.length,
    classification_evidence: classification?.evidence || [],
    carrier_evidence: carrierDetection?.evidence || [],
    carrier_specific: carrierSpecificDebug || {
      parser_used: "generic_fallback",
      detected_carrier_profile: null,
      page_types: [],
      table_reconstruction_quality: [],
      failed_pages: [],
    },
    section_hits: sectionHits,
    parsing_warnings: uniqueStrings(warnings).slice(0, 10),
    source_attribution: sourceAttribution,
    ignored_candidates: ignoredCandidates,
    generic_extraction_field_count: genericExtractionFieldCount,
    fg_specific_extraction_field_count: fgSpecificExtractionFieldCount,
    final_merged_field_count: finalMergedFieldCount,
    fields_overridden_by_fg: fgOverrides,
    fields_reverted_to_generic: genericReversions,
    field_debug_stats: fieldDebugStats,
    target_field_debug: targetFieldDebug,
    charge_field_debug: chargeFieldDebug,
    rejected_footnote_marker_candidates: rejectedFootnoteCandidates,
    unmatched_likely_labels: collectUnmatchedLikelyLabels(
      pages,
      fields,
      carrierName
    ),
    fg_monthly_activity:
      fgMonthlyActivity && fgMonthlyActivity.pageNumber
        ? {
            page_number: fgMonthlyActivity.pageNumber,
            row_count: fgMonthlyActivity.rows.length,
            totals: fgMonthlyActivity.totals,
            total_sources: fgMonthlyActivity.totalSources,
            explicit_totals: fgMonthlyActivity.explicitTotals,
            monthly_rollups: fgMonthlyActivity.monthlyRollups,
            ending_account_value: fgMonthlyActivity.endingAccountValue?.display || null,
            suppressed_rows: fgMonthlyActivity.suppressedRows || [],
          }
        : null,
    fg_strategy_split: isFgCarrier(carrierName)
      ? {
          strategy_menu_available: fgStrategyRows.some((row) => row.sourcePageType === "strategy_menu"),
          strategy_rows_observed_in_segments: fgStrategyRows
            .filter((row) => row.sourcePageType === "segment_detail")
            .slice(0, 8)
            .map((row) => row.name),
          observed_statement_strategies: statementObservedStrategies,
          active_statement_strategies: statementActiveStrategies,
          primary_strategy_source_evidence:
            fgStrategyRows.find((row) => row.name === currentOrDominantStrategy)?.strategySourceEvidence || null,
          winning_displayed_strategy_row: winningDisplayedStrategyRow
            ? {
                strategy_name: winningDisplayedStrategyRow.name,
                source_type: winningDisplayedStrategyRow.strategySourceEvidence,
                allocation_percent: winningDisplayedStrategyRow.allocationPercent?.display || null,
                indexed_account_value: winningDisplayedStrategyRow.accountValue?.display || null,
                cap_rate: winningDisplayedStrategyRow.capRate?.display || null,
                participation_rate: winningDisplayedStrategyRow.participationRate?.display || null,
                crediting_rate: winningDisplayedStrategyRow.creditingRate?.display || null,
                spread: winningDisplayedStrategyRow.spread?.display || null,
              }
            : null,
          suppressed_historical_segment_rows: suppressedHistoricalSegmentRows.map((row) => row.name),
          current_or_dominant_strategy_if_supported: currentOrDominantStrategy || null,
        }
      : null,
    fg_statement_date_debug:
      isFgCarrier(carrierName) && fields.statement_date
        ? {
            parsed_statement_date: fields.statement_date.display_value || null,
            source_page_type: fields.statement_date.source_page_type || null,
            used_filename_fallback: fields.statement_date.extraction_method === "filename_inference",
            generated_date: fgStatementDateInfo?.generatedField?.display_value || null,
            statement_period_date: fgStatementDateInfo?.statementPeriodField?.display_value || null,
            chosen_sort_date: fgStatementDateInfo?.chosenField?.display_value || fields.statement_date.display_value || null,
          }
        : null,
    fg_premium_debug:
      isFgCarrier(carrierName)
        ? {
            planned_premium_source_row: fields.planned_premium?.raw_label || null,
            annual_target_premium_source_row: fields.annual_target_premium?.raw_label || null,
            guideline_single_premium_source_row: fields.guideline_single_premium?.raw_label || null,
          }
        : null,
    fg_carrier_debug:
      isFgCarrier(carrierName) && fields.carrier_name
        ? {
            carrier_name: fields.carrier_name.display_value || null,
            winning_source_page: fields.carrier_name.page_number || null,
            winning_source_page_type: fields.carrier_name.source_page_type || null,
          }
        : null,
    fg_strategy_menu_rows: fgStrategyMenuRows,
    fg_strategy_rows_collected: fgStrategyRows.map((row) => ({
      strategy_name: row.name,
      source_type: row.sourceType,
      page_number: row.pageNumber,
      allocation_percent: row.allocationPercent?.display || null,
      indexed_account_value: row.accountValue?.display || null,
      fixed_account_value: row.isFixed ? row.accountValue?.display || null : null,
      participation_rate: row.participationRate?.display || null,
      cap_rate: row.capRate?.display || null,
      crediting_rate: row.creditingRate?.display || null,
      spread: row.spread?.display || null,
    })),
  };
}

function cloneFieldResult(field) {
  return field ? JSON.parse(JSON.stringify(field)) : null;
}

function countPopulatedFields(fieldMap, fieldKeys = []) {
  return fieldKeys.filter((fieldKey) => fieldMap[fieldKey] && !fieldMap[fieldKey].missing).length;
}

function chooseMergedField({ fieldKey, genericField, fgField }) {
  const genericResult = cloneFieldResult(genericField);
  const fgResult = cloneFieldResult(fgField);
  const genericMissing = !genericResult || genericResult.missing;
  const fgMissing = !fgResult || fgResult.missing;

  if (genericMissing && fgMissing) {
    return {
      finalField: genericResult || fgResult,
      overriddenByFg: false,
      revertedToGeneric: false,
      warning: "",
    };
  }

  if (genericMissing && !fgMissing) {
    const finalField = {
      ...fgResult,
      merge_debug: {
        selected: "fg_specific",
        reason: "generic_missing",
        generic_missing: true,
        fg_missing: false,
      },
    };
    return { finalField, overriddenByFg: true, revertedToGeneric: false, warning: "" };
  }

  if (!genericMissing && fgMissing) {
    const finalField = {
      ...genericResult,
      merge_debug: {
        selected: "generic",
        reason: "fg_missing",
        generic_missing: false,
        fg_missing: true,
      },
    };
    return { finalField, overriddenByFg: false, revertedToGeneric: false, warning: "" };
  }

  const genericScore = genericResult.confidence_score || 0;
  const fgScore = fgResult.confidence_score || 0;
  const fgFromMonthlyActivity = fgResult.source_page_type === "monthly_activity_table";
  const isCoreField = COVERAGE_CORE_FIELDS.has(fieldKey);

  let useFg = false;
  if (fgFromMonthlyActivity && isCoreField) {
    useFg = genericScore < 0.55 && fgScore >= genericScore + 0.12;
  } else if (isCoreField) {
    useFg = fgScore >= genericScore + 0.08;
  } else {
    useFg = fgScore >= genericScore + 0.05;
  }

  if (!useFg) {
    const finalField = {
      ...genericResult,
      merge_debug: {
        selected: "generic",
        reason: fgScore > genericScore ? "generic_retained_for_coverage" : "generic_stronger_or_equal",
        generic_missing: false,
        fg_missing: false,
      },
    };
    return {
      finalField,
      overriddenByFg: false,
      revertedToGeneric: fgScore > genericScore,
      warning: fgScore > genericScore ? `${fieldKey}: F&G candidate did not clearly outperform generic extraction` : "",
    };
  }

  const finalField = {
    ...fgResult,
    merge_debug: {
      selected: "fg_specific",
      reason: "fg_clearly_better_supported",
      generic_missing: false,
      fg_missing: false,
    },
  };
  return { finalField, overriddenByFg: true, revertedToGeneric: false, warning: "" };
}

function applyDocumentLevelGenericFallback(fieldMap) {
  return Object.fromEntries(
    Object.entries(fieldMap).map(([fieldKey, field]) => [
      fieldKey,
      {
        ...cloneFieldResult(field),
        merge_debug: {
          ...(field?.merge_debug || {}),
          selected: "generic",
          reason: "document_level_generic_fallback",
        },
      },
    ])
  );
}

function extractFieldPass({
  pages,
  fieldKey,
  documentType,
  carrierName,
  fileName = "",
  mode = "generic",
}) {
  const config = PARSER_DICTIONARY.fields[fieldKey];
  const extractionDocumentType = resolveExtractionDocumentType(documentType);
  const documentText = pages.join("\n");
  const passCarrierName = mode === "fg_specific" ? carrierName : "";
  const carrierHintForDirect = fieldKey === "carrier_name" ? carrierName : passCarrierName;

  const directHint = directDocumentHints(fieldKey, documentText, carrierHintForDirect);
  if (directHint) {
    return {
      ...directHint,
      document_type: documentType,
      confidence: scoreToConfidence(directHint.confidence_score),
      merge_debug: {
        selected: mode,
        reason: "direct_hint",
      },
    };
  }

  if (mode === "fg_specific") {
    if (fieldKey === "issue_date") {
      const fgIssueDate = extractFgIssueDateField(pages, documentType, carrierName);
      if (fgIssueDate) {
        return {
          ...fgIssueDate,
          merge_debug: {
            selected: mode,
            reason: "fg_issue_date_hint",
          },
        };
      }
    }

    if (fieldKey === "statement_date") {
      const fgStatementDate = extractFgStatementDateField(pages, fileName, documentType, carrierName);
      if (fgStatementDate) {
        return {
          ...fgStatementDate,
          merge_debug: {
            selected: mode,
            reason: "fg_statement_date_hint",
          },
        };
      }
    }

    if (
      ["planned_premium", "payment_mode", "annual_target_premium", "no_lapse_premium", "guideline_single_premium", "guideline_level_premium"].includes(
        fieldKey
      )
    ) {
      const fgPremiumField = extractFgIllustrationPremiumField(pages, fieldKey, documentType, carrierName);
      if (fgPremiumField) {
        return {
          ...fgPremiumField,
          merge_debug: {
            selected: mode,
            reason: "fg_policy_information_premium_hint",
          },
        };
      }
    }

    const carrierSpecificHint = extractFgCarrierField(
      pages,
      fieldKey,
      documentType,
      carrierName
    );
    if (carrierSpecificHint) {
      return {
        ...carrierSpecificHint,
        merge_debug: {
          selected: mode,
          reason: "fg_specific_hint",
        },
      };
    }
  }

  const structuredHint = directStructuredExtraction(
    fieldKey,
    documentText,
    extractionDocumentType,
    passCarrierName
  );
  if (structuredHint) {
    return {
      ...structuredHint,
      merge_debug: {
        selected: mode,
        reason: "structured_hint",
      },
    };
  }

  const statementTableHint = extractStatementTableField(
    pages,
    fieldKey,
    extractionDocumentType,
    passCarrierName
  );
  if (statementTableHint) {
    return {
      ...statementTableHint,
      merge_debug: {
        selected: mode,
        reason: "table_hint",
      },
    };
  }

  if (fieldKey === "product_name" && extractionDocumentType === "illustration") {
    return buildMissingField(fieldKey, "No reliable product name found on illustration pages", documentType, carrierName);
  }

  const candidates = collectCandidates({
    pages,
    aliases: config.aliases,
    type: config.type,
    carrierName: passCarrierName,
    normalizedKey: fieldKey,
    documentType,
    preferredMarkers: config.preferredMarkers || [],
  });

  if (candidates.length === 0) {
    const aliasMatches = countAliasMatches(pages, config.aliases);
    const reason =
      aliasMatches > 0
        ? "Label found but no valid nearby value matched the expected field type"
        : "No matching label found in the extracted text";

    return buildMissingField(fieldKey, reason, documentType, carrierName);
  }

  const selected = selectBestCandidate(candidates, fieldKey, documentType, carrierName);
  return {
    ...selected,
    merge_debug: {
      selected: mode,
      reason: "candidate_selection",
    },
  };
}

export function extractField({
  pages,
  fieldKey,
  documentType,
  carrierDetection,
  fileName = "",
}) {
  const carrierName =
    carrierDetection && carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : "";
  const genericField = extractFieldPass({
    pages,
    fieldKey,
    documentType,
    carrierName,
    fileName,
    mode: "generic",
  });

  if (!isFgCarrier(carrierName)) {
    return genericField;
  }

  const fgSpecificField = extractFieldPass({
    pages,
    fieldKey,
    documentType,
    carrierName,
    fileName,
    mode: "fg_specific",
  });

  const merged = chooseMergedField({
    fieldKey,
    genericField,
    fgField: fgSpecificField,
  });

  return {
    ...merged.finalField,
    merge_debug: {
      ...(merged.finalField?.merge_debug || {}),
      generic_confidence_score: genericField?.confidence_score || 0,
      fg_confidence_score: fgSpecificField?.confidence_score || 0,
      warning: merged.warning || "",
    },
  };
}

function summarizeFields(fieldMap, aliases) {
  const summary = { __meta: {} };

  Object.entries(aliases).forEach(([summaryKey, fieldKey]) => {
    const field = fieldMap[fieldKey];
    summary[summaryKey] = field?.display_value || "Not found";
    summary.__meta[summaryKey] = {
      ...field,
      value: field?.display_value || "Not found",
      matchedLabel: field?.raw_label || "",
      source: field?.extraction_method || "missing",
      provenance: field?.provenance || null,
    };
  });

  return summary;
}

function inferStatementDateFromFilename(fileName) {
  const normalizedFileName = String(fileName || "");
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /(\d{1,2}-\d{1,2}-\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = normalizedFileName.match(pattern);
    if (!match) continue;
    const normalized = normalizeDate(match[1].replace(/-/g, "/"));
    if (!normalized) continue;
    return {
      normalized_key: "statement_date",
      value: normalized.value,
      display_value: normalized.display,
      raw_label: "File Name Date",
      raw_value: match[1],
      page_number: 0,
      extraction_method: "filename_inference",
      confidence: "low",
      confidence_score: 0.45,
      carrier_hint: "",
      document_type: "annual_statement",
      evidence: ["statement date inferred from filename"],
      rejected_candidates: [],
      source_page_type: "filename",
      source_priority: 0,
      suppression_reason: "",
      missing: false,
    };
  }

  const yearMatch = normalizedFileName.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    return {
      normalized_key: "statement_date",
      value: `${yearMatch[1]}-12-31`,
      display_value: `December 31, ${yearMatch[1]}`,
      raw_label: "File Name Year",
      raw_value: yearMatch[1],
      page_number: 0,
      extraction_method: "filename_inference",
      confidence: "low",
      confidence_score: 0.38,
      carrier_hint: "",
      document_type: "annual_statement",
      evidence: ["weak statement year fallback from filename"],
      rejected_candidates: [],
      source_page_type: "filename",
      source_priority: 0,
      suppression_reason: "",
      missing: false,
    };
  }

  return null;
}

export function parseIllustrationDocument({ pages, fileName }) {
  const carrierDetection = detectCarrier(pages);
  const classification = classifyDocument(
    pages,
    fileName,
    carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : ""
  );
  const fieldKeys = [
    "carrier_name",
    "product_name",
    "policy_type",
    "policy_number",
    "issue_date",
    "owner_name",
    "joint_insured_name",
    "insured_name",
    "payor_name",
    "trustee_name",
    "trust_name",
    "ownership_structure",
    "primary_beneficiary_name",
    "primary_beneficiary_share",
    "contingent_beneficiary_name",
    "contingent_beneficiary_share",
    "beneficiary_status",
    "death_benefit",
    "initial_face_amount",
    "option_type",
    "rider_summary",
    "planned_premium",
    "annual_target_premium",
    "premium_paid",
    "total_premium_paid",
    "minimum_premium",
    "guideline_single_premium",
    "guideline_level_premium",
    "guideline_premium_limit",
    "target_premium",
    "no_lapse_premium",
    "guaranteed_premium",
    "premium_class",
    "rate_class_percent",
    "premium_expense_charge_percent",
    "guaranteed_minimum_interest",
    "payment_mode",
  ];

  const fields = {};
  const genericFields = {};
  const isFgDocument =
    carrierDetection.confidence !== "low" && isFgCarrier(carrierDetection.carrier_name);
  fieldKeys.forEach((fieldKey) => {
    fields[fieldKey] = extractField({
      pages,
      fieldKey,
      documentType: classification.document_type,
      carrierDetection,
      fileName,
    });
    if (isFgDocument) {
      genericFields[fieldKey] = extractFieldPass({
        pages,
        fieldKey,
        documentType: classification.document_type,
        carrierName: carrierDetection.carrier_name,
        fileName,
        mode: "generic",
      });
    }
  });
  const finalFields =
    isFgDocument &&
    countPopulatedFields(
      fields,
      fieldKeys.filter((fieldKey) => COVERAGE_CORE_FIELDS.has(fieldKey))
    ) <
      countPopulatedFields(
        genericFields,
        fieldKeys.filter((fieldKey) => COVERAGE_CORE_FIELDS.has(fieldKey))
      )
      ? applyDocumentLevelGenericFallback(genericFields)
      : fields;
  if (finalFields.issue_date?.missing) {
    const inferredIssueDate = extractGenericIssueDateField(
      pages,
      classification.document_type,
      carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : ""
    );
    if (inferredIssueDate) {
      finalFields.issue_date = inferredIssueDate;
    }
  }
  if (finalFields.policy_number?.missing) {
    const inferredPolicyNumber = extractGenericPolicyNumberField(
      pages,
      classification.document_type,
      carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : ""
    );
    if (inferredPolicyNumber) {
      finalFields.policy_number = inferredPolicyNumber;
    }
  }
  const carrierSpecific = parseCarrierSpecificDocument({
    pages,
    fileName,
    documentType: classification.document_type,
    carrierName: carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : "",
  });
  const mergedFields = applyDerivedPartyFieldFallbacks(
    mergeCarrierSpecificFields(finalFields, carrierSpecific.extractedFields || {}),
    pages,
    carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : "",
    classification.document_type
  );
  const fieldsWithProvenance = attachProvenanceToFields(mergedFields, fileName);
  const illustrationProjection = carrierSpecific.illustrationProjection?.row_count
    ? carrierSpecific.illustrationProjection
    : extractIllustrationLedger(pages);
  const parserDebug = buildParserDebug({
    pages,
    fields: fieldsWithProvenance,
    classification,
    carrierDetection,
    fileName,
    carrierSpecificDebug: {
      parser_used: carrierSpecific.parserUsed,
      detected_carrier_profile: carrierSpecific.carrierProfile?.key || null,
      page_types: carrierSpecific.pageAnalyses || [],
      table_reconstruction_quality: (carrierSpecific.tableReconstructions || []).map((entry) => ({
        page_type: entry.page_type,
        quality: entry.quality,
        row_count: entry.rows?.length || 0,
        quality_inputs: entry.quality_inputs || {},
        failed_rows: entry.failed_rows || [],
      })),
      failed_pages: carrierSpecific.failedPages || [],
      strategy_rows: carrierSpecific.strategyRows || [],
      all_strategy_rows: carrierSpecific.allStrategyRows || [],
    },
  });
  if (isFgDocument && finalFields !== fields) {
    parserDebug.parsing_warnings = uniqueStrings([
      ...(parserDebug.parsing_warnings || []),
      "F&G carrier-specific pass reduced coverage; generic extraction retained",
    ]);
  }

  return {
    fileName,
    documentType: classification,
    carrierDetection,
    parserDebug,
    fields: fieldsWithProvenance,
    illustrationProjection,
    structuredData: {
      extractionSummary: carrierSpecific.extractionSummary || null,
      pageTypes: carrierSpecific.pageAnalyses || [],
      tables: carrierSpecific.tableReconstructions || [],
      strategyRows: carrierSpecific.strategyRows || [],
      allStrategyRows: carrierSpecific.allStrategyRows || [],
      failedPages: carrierSpecific.failedPages || [],
    },
    summary: summarizeFields(fieldsWithProvenance, {
      carrier: "carrier_name",
      productName: "product_name",
      policyType: "policy_type",
      policyNumber: "policy_number",
      issueDate: "issue_date",
      ownerName: "owner_name",
      jointInsuredName: "joint_insured_name",
      insuredName: "insured_name",
      payorName: "payor_name",
      trusteeName: "trustee_name",
      trustName: "trust_name",
      ownershipStructure: "ownership_structure",
      primaryBeneficiaryName: "primary_beneficiary_name",
      primaryBeneficiaryShare: "primary_beneficiary_share",
      contingentBeneficiaryName: "contingent_beneficiary_name",
      contingentBeneficiaryShare: "contingent_beneficiary_share",
      beneficiaryStatus: "beneficiary_status",
      deathBenefit: "death_benefit",
      initialFaceAmount: "initial_face_amount",
      deathBenefitOption: "option_type",
      riderSummary: "rider_summary",
      periodicPremium: "planned_premium",
      annualTargetPremium: "annual_target_premium",
      paymentMode: "payment_mode",
      targetPremium: "target_premium",
      noLapsePremium: "no_lapse_premium",
      monthlyGuaranteePremium: "guaranteed_premium",
    }),
    text: pages.join("\n"),
    pages,
  };
}

export function parseStatementDocument({ pages, fileName }) {
  const carrierDetection = detectCarrier(pages);
  const classification = classifyDocument(
    pages,
    fileName,
    carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : ""
  );
  const fieldKeys = [
    "carrier_name",
    "product_name",
    "policy_type",
    "policy_number",
    "statement_date",
    "policy_year",
    "owner_name",
    "joint_insured_name",
    "insured_name",
    "payor_name",
    "trustee_name",
    "trust_name",
    "ownership_structure",
    "primary_beneficiary_name",
    "primary_beneficiary_share",
    "contingent_beneficiary_name",
    "contingent_beneficiary_share",
    "beneficiary_status",
    "insured_age",
    "death_benefit",
    "minimum_death_benefit",
    "option_type",
    "planned_premium",
    "rider_summary",
    "policy_charges_total",
    "premium_paid",
    "accumulation_value",
    "cash_value",
    "cash_surrender_value",
    "loan_balance",
    "cost_of_insurance",
    "monthly_deduction",
    "admin_fee",
    "rider_charge",
    "expense_charge",
    "index_credit",
    "participation_rate",
    "cap_rate",
    "index_strategy",
    "allocation_percent",
    "crediting_rate",
    "spread",
    "indexed_account_value",
    "fixed_account_value",
    "guaranteed_minimum_interest",
  ];

  const fields = {};
  const genericFields = {};
  const isFgDocument =
    carrierDetection.confidence !== "low" && isFgCarrier(carrierDetection.carrier_name);
  fieldKeys.forEach((fieldKey) => {
    fields[fieldKey] = extractField({
      pages,
      fieldKey,
      documentType: classification.document_type,
      carrierDetection,
      fileName,
    });
    if (isFgDocument) {
      genericFields[fieldKey] = extractFieldPass({
        pages,
        fieldKey,
        documentType: classification.document_type,
        carrierName: carrierDetection.carrier_name,
        fileName,
        mode: "generic",
      });
    }
  });
  const finalFields =
    isFgDocument &&
    countPopulatedFields(
      fields,
      fieldKeys.filter((fieldKey) => COVERAGE_CORE_FIELDS.has(fieldKey))
    ) <
      countPopulatedFields(
        genericFields,
        fieldKeys.filter((fieldKey) => COVERAGE_CORE_FIELDS.has(fieldKey))
      )
      ? applyDocumentLevelGenericFallback(genericFields)
      : fields;
  if (finalFields.statement_date?.missing) {
    const inferredStatementDate = extractGenericStatementDateField(
      pages,
      fileName,
      classification.document_type,
      carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : ""
    );
    if (inferredStatementDate) {
      finalFields.statement_date = inferredStatementDate;
    }
  }
  if (finalFields.policy_number?.missing) {
    const inferredPolicyNumber = extractGenericPolicyNumberField(
      pages,
      classification.document_type,
      carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : ""
    );
    if (inferredPolicyNumber) {
      finalFields.policy_number = inferredPolicyNumber;
    }
  }
  const carrierSpecific = parseCarrierSpecificDocument({
    pages,
    fileName,
    documentType: classification.document_type,
    carrierName: carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : "",
  });
  const mergedFields = applyDerivedPartyFieldFallbacks(
    mergeCarrierSpecificFields(finalFields, carrierSpecific.extractedFields || {}),
    pages,
    carrierDetection.confidence !== "low" ? carrierDetection.carrier_name : "",
    classification.document_type
  );
  const fieldsWithProvenance = attachProvenanceToFields(mergedFields, fileName);
  const parserDebug = buildParserDebug({
    pages,
    fields: fieldsWithProvenance,
    classification,
    carrierDetection,
    fileName,
    carrierSpecificDebug: {
      parser_used: carrierSpecific.parserUsed,
      detected_carrier_profile: carrierSpecific.carrierProfile?.key || null,
      page_types: carrierSpecific.pageAnalyses || [],
      table_reconstruction_quality: (carrierSpecific.tableReconstructions || []).map((entry) => ({
        page_type: entry.page_type,
        quality: entry.quality,
        row_count: entry.rows?.length || 0,
        quality_inputs: entry.quality_inputs || {},
        failed_rows: entry.failed_rows || [],
      })),
      failed_pages: carrierSpecific.failedPages || [],
      strategy_rows: carrierSpecific.strategyRows || [],
      all_strategy_rows: carrierSpecific.allStrategyRows || [],
    },
  });
  if (isFgDocument && finalFields !== fields) {
    parserDebug.parsing_warnings = uniqueStrings([
      ...(parserDebug.parsing_warnings || []),
      "F&G carrier-specific pass reduced coverage; generic extraction retained",
    ]);
  }

  return {
    fileName,
    documentType: classification,
    carrierDetection,
    parserDebug,
    fields: fieldsWithProvenance,
    structuredData: {
      extractionSummary: carrierSpecific.extractionSummary || null,
      pageTypes: carrierSpecific.pageAnalyses || [],
      tables: carrierSpecific.tableReconstructions || [],
      strategyRows: carrierSpecific.strategyRows || [],
      allStrategyRows: carrierSpecific.allStrategyRows || [],
      failedPages: carrierSpecific.failedPages || [],
    },
    summary: summarizeFields(fieldsWithProvenance, {
      carrier: "carrier_name",
      productName: "product_name",
      policyType: "policy_type",
      policyNumber: "policy_number",
      statementDate: "statement_date",
      ownerName: "owner_name",
      jointInsuredName: "joint_insured_name",
      insuredName: "insured_name",
      payorName: "payor_name",
      trusteeName: "trustee_name",
      trustName: "trust_name",
      ownershipStructure: "ownership_structure",
      primaryBeneficiaryName: "primary_beneficiary_name",
      primaryBeneficiaryShare: "primary_beneficiary_share",
      contingentBeneficiaryName: "contingent_beneficiary_name",
      contingentBeneficiaryShare: "contingent_beneficiary_share",
      beneficiaryStatus: "beneficiary_status",
      deathBenefit: "death_benefit",
      minimumDeathBenefit: "minimum_death_benefit",
      deathBenefitOption: "option_type",
      periodicPremium: "planned_premium",
      riderSummary: "rider_summary",
      accumulationValue: "accumulation_value",
      cashValue: "cash_value",
      cashSurrenderValue: "cash_surrender_value",
      loanBalance: "loan_balance",
      costOfInsurance: "cost_of_insurance",
      monthlyDeduction: "monthly_deduction",
      adminFee: "admin_fee",
      riderCharge: "rider_charge",
      expenseCharge: "expense_charge",
      totalPolicyCharges: "policy_charges_total",
      premiumPaid: "premium_paid",
      indexCredit: "index_credit",
      participationRate: "participation_rate",
      capRate: "cap_rate",
      indexStrategy: "index_strategy",
      allocationPercent: "allocation_percent",
      creditingRate: "crediting_rate",
      spread: "spread",
      indexedAccountValue: "indexed_account_value",
      fixedAccountValue: "fixed_account_value",
      guaranteedMinimumInterest: "guaranteed_minimum_interest",
    }),
    text: pages.join("\n"),
    pages,
  };
}

function hasTrustedField(field, minimum = PARSER_DICTIONARY.confidenceThresholds.analyticsMinimum) {
  if (!field || field.missing || field.value === null || field.value === "") return false;
  return CONFIDENCE_RANK[field.confidence] >= CONFIDENCE_RANK[minimum];
}

function analyticsResult(value, explanation, missingInputs = []) {
  return {
    value,
    missing_inputs: missingInputs,
    explanation,
  };
}

export function sortStatementsChronologically(statementHistory) {
  return [...statementHistory].sort((a, b) => {
    const aDate = a?.fields?.statement_date?.value || "";
    const bDate = b?.fields?.statement_date?.value || "";
    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return aDate > bDate ? 1 : -1;
  });
}

function extractDetectedRiderNames(...values) {
  const combined = values
    .flatMap((value) => {
      if (Array.isArray(value)) return value;
      if (value === null || value === undefined) return [];
      return [value];
    })
    .map((value) => String(value || ""))
    .join(" | ");

  const matches = [
    ...combined.matchAll(
      /\b(accelerated(?:\s+death|\s+benefit)?|chronic illness|terminal illness|critical illness|overloan protection|waiver of (?:monthly deduction|charges|premium)|disability waiver|long term care|ltc|return of premium|guaranteed insurability|children'?s term|spouse(?: rider)?|paid[- ]?up additions?)\b/gi
    ),
  ]
    .map((match) => String(match[0] || "").trim())
    .filter(Boolean);

  return [...new Set(matches)];
}

function getPreferredCurrentDeathBenefit(baseline, latestStatement) {
  return (
    latestStatement?.fields?.death_benefit ||
    baseline?.fields?.death_benefit ||
    baseline?.fields?.initial_face_amount ||
    latestStatement?.fields?.minimum_death_benefit ||
    null
  );
}

function sumTrustedFields(statementHistory, fieldName) {
  const trustedFields = statementHistory
    .map((entry) => entry.fields[fieldName])
    .filter((field) => hasTrustedField(field));

  if (trustedFields.length === 0) return null;
  return trustedFields.reduce((sum, field) => sum + field.value, 0);
}

function ratioResult(numerator, denominator, explanation, missingInputs) {
  if (numerator === null || denominator === null || denominator === 0) {
    return analyticsResult(null, "Insufficient extracted data", missingInputs);
  }

  return analyticsResult(numerator / denominator, explanation);
}

function buildPolicyHealthScore({
  totalPremiumPaid,
  accumulationValue,
  totalPolicyCharges,
  chargeDragRatio,
  loanBalance,
  dataCompleteness,
}) {
  const factors = [];
  let score = 0;

  if (totalPremiumPaid !== null && accumulationValue && hasTrustedField(accumulationValue)) {
    const netGrowth = accumulationValue.value - totalPremiumPaid;
    if (netGrowth >= 0) {
      score += 2;
      factors.push("Accumulation value is at or above detected contributions.");
    } else {
      score += 1;
      factors.push("Accumulation value trails detected contributions.");
    }
  } else {
    factors.push("Funding efficiency is incomplete because contribution history is limited.");
  }

  if (chargeDragRatio !== null) {
    if (chargeDragRatio <= 0.15) {
      score += 2;
      factors.push("Detected charge drag appears moderate.");
    } else if (chargeDragRatio <= 0.3) {
      score += 1;
      factors.push("Detected charge drag appears elevated.");
    } else {
      factors.push("Detected charge drag appears heavy.");
    }
  } else if (totalPolicyCharges !== null) {
    score += 1;
    factors.push("Some policy charges were detected, but ratio analysis is incomplete.");
  } else {
    factors.push("Charge pressure is incomplete because charge fields are sparse.");
  }

  if (loanBalance && hasTrustedField(loanBalance)) {
    if (loanBalance.value === 0) {
      score += 2;
      factors.push("No current loan pressure was detected.");
    } else if (accumulationValue && hasTrustedField(accumulationValue) && loanBalance.value < accumulationValue.value * 0.25) {
      score += 1;
      factors.push("Loan balance is present but does not appear dominant relative to account value.");
    } else {
      factors.push("Loan balance may be pressuring policy value.");
    }
  } else {
    factors.push("Loan analysis is limited because loan balance was not confidently extracted.");
  }

  if (dataCompleteness >= 0.75) {
    score += 2;
    factors.push("Data completeness is strong enough for a more reliable reading.");
  } else if (dataCompleteness >= 0.5) {
    score += 1;
    factors.push("Data completeness is moderate.");
  } else {
    factors.push("Data completeness is low, which limits confidence in the overall reading.");
  }

  const normalizedScore = Math.max(1, Math.min(10, score + 1));
  let label = "Moderate";
  if (normalizedScore >= 8) label = "Strong";
  if (normalizedScore <= 4) label = "Limited";

  return {
    value: normalizedScore,
    label,
    factors,
  };
}

export function computeDerivedAnalytics(baseline, statementHistory) {
  const sortedStatements = sortStatementsChronologically(statementHistory);
  const latestStatement = sortedStatements.at(-1) || statementHistory.at(-1);
  const preferredDeathBenefit = getPreferredCurrentDeathBenefit(baseline, latestStatement);

  const directTotalPremium = baseline?.fields?.total_premium_paid;
  const summedPremiumPaid = sumTrustedFields(sortedStatements, "premium_paid");
  const totalPremiumPaid = hasTrustedField(directTotalPremium) ? directTotalPremium.value : summedPremiumPaid;

  const totalCostOfInsurance = sumTrustedFields(sortedStatements, "cost_of_insurance");
  const totalAdminFees = sumTrustedFields(sortedStatements, "admin_fee");
  const totalMonthlyDeductions = sumTrustedFields(sortedStatements, "monthly_deduction");
  const totalRiderCharges = sumTrustedFields(sortedStatements, "rider_charge");
  const totalExpenseCharges = sumTrustedFields(sortedStatements, "expense_charge");
  const detectedStatementCharges = sumTrustedFields(sortedStatements, "policy_charges_total");
  const summedChargeValues = [totalCostOfInsurance, totalAdminFees, totalMonthlyDeductions, totalRiderCharges, totalExpenseCharges]
    .filter((value) => value !== null);
  const totalPolicyCharges =
    summedChargeValues.length > 0
      ? summedChargeValues.reduce((sum, value) => sum + value, 0)
      : detectedStatementCharges;

  const accumulationValue = latestStatement?.fields?.accumulation_value;
  const cashValue = latestStatement?.fields?.cash_value;
  const cashSurrenderValue = latestStatement?.fields?.cash_surrender_value;
  const coi = latestStatement?.fields?.cost_of_insurance;
  // Only compute illustration variance when an actual illustrated account-value field exists.
  const illustratedValue =
    baseline?.fields?.illustrated_accumulation_value ||
    baseline?.fields?.illustrated_account_value ||
    baseline?.fields?.illustrated_cash_value ||
    null;
  const loanBalance = latestStatement?.fields?.loan_balance;

  const timeline = sortedStatements.map((statement) => {
    const rowCharges = [
      statement.fields.cost_of_insurance,
      statement.fields.admin_fee,
      statement.fields.monthly_deduction,
      statement.fields.rider_charge,
      statement.fields.expense_charge,
    ]
      .filter((field) => hasTrustedField(field))
      .reduce((sum, field) => sum + field.value, 0);

    const detectedCharges = hasTrustedField(statement.fields.policy_charges_total)
      ? statement.fields.policy_charges_total.value
      : rowCharges > 0
      ? rowCharges
      : null;

    return {
      fileName: statement.fileName,
      statement_date: statement.fields.statement_date?.display_value || "Not found",
      policy_year: statement.fields.policy_year?.display_value || "Not found",
      accumulation_value: statement.fields.accumulation_value?.display_value || "Not found",
      cash_value: statement.fields.cash_value?.display_value || "Not found",
      cash_surrender_value: statement.fields.cash_surrender_value?.display_value || "Not found",
      loan_balance: statement.fields.loan_balance?.display_value || "Not found",
      total_charges_detected:
        detectedCharges !== null
          ? `$${Number(detectedCharges).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : "Not found",
      total_charges_detected_value: detectedCharges,
    };
  });

  const coiTrend =
    sortedStatements.length >= 2 &&
    sortedStatements.every((statement) => hasTrustedField(statement.fields.cost_of_insurance))
      ? analyticsResult(
          sortedStatements.map((statement) => ({
            statement_date: statement.fields.statement_date.display_value,
            value: statement.fields.cost_of_insurance.value,
          })),
          "Tracked cost of insurance across multiple statements."
        )
      : analyticsResult(null, "Insufficient extracted data", ["2+ cost_of_insurance points"]);

  const growthTrend =
    sortedStatements.length >= 2 &&
    sortedStatements.every((statement) => hasTrustedField(statement.fields.accumulation_value))
      ? analyticsResult(
          sortedStatements.map((statement) => ({
            statement_date: statement.fields.statement_date.display_value,
            value: statement.fields.accumulation_value.value,
          })),
          "Tracked accumulation value across multiple statements."
        )
      : analyticsResult(null, "Insufficient extracted data", ["2+ accumulation_value points"]);

  const latestStatementDate = latestStatement?.fields?.statement_date?.display_value || "Not found";
  const displayTotalPremiumPaid =
    totalPremiumPaid !== null
      ? `$${Number(totalPremiumPaid).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "Not found";
  const displayNetGrowth =
    totalPremiumPaid !== null && hasTrustedField(accumulationValue)
      ? `${accumulationValue.value - totalPremiumPaid < 0 ? "-" : ""}$${Math.abs(
          accumulationValue.value - totalPremiumPaid
        ).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "Not found";
  const displayIllustrationVariance =
    hasTrustedField(accumulationValue) && hasTrustedField(illustratedValue)
      ? `${accumulationValue.value - illustratedValue.value < 0 ? "-" : ""}$${Math.abs(
          accumulationValue.value - illustratedValue.value
        ).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "Not found";

  const performanceSummary = {
    issue_date: baseline?.fields?.issue_date?.display_value || "Not found",
    latest_statement_date: latestStatementDate,
    carrier_name: baseline?.fields?.carrier_name?.display_value || "Not found",
    product_name: baseline?.fields?.product_name?.display_value || "Not found",
    policy_number: baseline?.fields?.policy_number?.display_value || "Not found",
    death_benefit: preferredDeathBenefit?.display_value || "Not found",
    total_premium_paid: displayTotalPremiumPaid,
    current_accumulation_value: accumulationValue?.display_value || "Not found",
    current_cash_value: cashValue?.display_value || "Not found",
    current_cash_surrender_value: cashSurrenderValue?.display_value || "Not found",
    current_loan_balance: loanBalance?.display_value || "Not found",
    net_policy_growth: displayNetGrowth,
    illustration_variance: displayIllustrationVariance,
  };

  const chargeAnalysis = {
    total_cost_of_insurance:
      totalCostOfInsurance !== null
        ? analyticsResult(totalCostOfInsurance, "Summed trusted cost of insurance values.")
        : analyticsResult(null, "Insufficient extracted data", ["cost_of_insurance"]),
    total_admin_fees:
      totalAdminFees !== null
        ? analyticsResult(totalAdminFees, "Summed trusted administrative fee values.")
        : analyticsResult(null, "Insufficient extracted data", ["admin_fee"]),
    total_monthly_deductions:
      totalMonthlyDeductions !== null
        ? analyticsResult(totalMonthlyDeductions, "Summed trusted monthly deduction values.")
        : analyticsResult(null, "Insufficient extracted data", ["monthly_deduction"]),
    total_rider_charges:
      totalRiderCharges !== null
        ? analyticsResult(totalRiderCharges, "Summed trusted rider charge values.")
        : analyticsResult(null, "Insufficient extracted data", ["rider_charge"]),
    total_expense_charges:
      totalExpenseCharges !== null
        ? analyticsResult(totalExpenseCharges, "Summed trusted expense charge values.")
        : analyticsResult(null, "Insufficient extracted data", ["expense_charge"]),
    total_policy_charges:
      totalPolicyCharges !== null
        ? analyticsResult(totalPolicyCharges, "Used summed trusted charges or directly detected policy charges.")
        : analyticsResult(null, "Insufficient extracted data", ["charge fields"]),
    cost_of_insurance_ratio: ratioResult(
      totalCostOfInsurance,
      hasTrustedField(accumulationValue) ? accumulationValue.value : null,
      "Calculated as total cost of insurance divided by current accumulation value.",
      ["cost_of_insurance", "accumulation_value"]
    ),
    charge_drag_ratio: ratioResult(
      totalPolicyCharges,
      totalPremiumPaid,
      "Calculated as total policy charges divided by total premium paid.",
      ["total_policy_charges", "total_premium_paid"]
    ),
    coi_trend: coiTrend,
  };

  const strategyReview = {
    index_strategy: latestStatement?.fields?.index_strategy?.display_value || "Not found",
    allocation_percent: latestStatement?.fields?.allocation_percent?.display_value || "Not found",
    index_credit: latestStatement?.fields?.index_credit?.display_value || "Not found",
    crediting_rate: latestStatement?.fields?.crediting_rate?.display_value || "Not found",
    participation_rate: latestStatement?.fields?.participation_rate?.display_value || "Not found",
    cap_rate: latestStatement?.fields?.cap_rate?.display_value || "Not found",
    spread: latestStatement?.fields?.spread?.display_value || "Not found",
    indexed_account_value: latestStatement?.fields?.indexed_account_value?.display_value || "Not found",
    fixed_account_value: latestStatement?.fields?.fixed_account_value?.display_value || "Not found",
    observed_statement_strategies:
      latestStatement?.parserDebug?.fg_strategy_split?.observed_statement_strategies || [],
    active_statement_strategies:
      latestStatement?.parserDebug?.fg_strategy_split?.active_statement_strategies || [],
    strategy_source_evidence:
      latestStatement?.parserDebug?.fg_strategy_split?.primary_strategy_source_evidence || null,
  };

  const analytics = {
    performance_summary: performanceSummary,
    statement_processing_order: sortedStatements.map((statement) => ({
      file_name: statement.fileName,
      statement_date: statement.fields?.statement_date?.display_value || "Not found",
      statement_date_value: statement.fields?.statement_date?.value || null,
    })),
    newest_statement_selected: latestStatement
      ? {
          file_name: latestStatement.fileName,
          statement_date: latestStatement.fields?.statement_date?.display_value || "Not found",
          statement_date_value: latestStatement.fields?.statement_date?.value || null,
        }
      : null,
    timeline,
    charge_analysis: chargeAnalysis,
    total_premium_paid:
      totalPremiumPaid !== null
        ? analyticsResult(totalPremiumPaid, "Summed trusted premium-paid values or used directly extracted total premium paid.")
        : analyticsResult(null, "Insufficient extracted data", ["premium_paid or total_premium_paid"]),
    total_policy_charges:
      totalPolicyCharges !== null
        ? analyticsResult(totalPolicyCharges, "Summed trusted cost of insurance, admin fee, monthly deduction, and expense charge values.")
        : analyticsResult(null, "Insufficient extracted data", ["cost_of_insurance/admin_fee/monthly_deduction/expense_charge"]),
    net_policy_growth:
      totalPremiumPaid !== null && hasTrustedField(accumulationValue)
        ? analyticsResult(
            accumulationValue.value - totalPremiumPaid,
            "Calculated as latest accumulation value minus total premium paid."
          )
        : analyticsResult(null, "Insufficient extracted data", ["accumulation_value", "total_premium_paid"]),
    cost_of_insurance_ratio:
      hasTrustedField(coi) && hasTrustedField(accumulationValue) && accumulationValue.value !== 0
        ? analyticsResult(coi.value / accumulationValue.value, "Calculated as cost of insurance divided by accumulation value.")
        : analyticsResult(null, "Insufficient extracted data", ["cost_of_insurance", "accumulation_value"]),
    charge_drag_ratio:
      totalPolicyCharges !== null && totalPremiumPaid
        ? analyticsResult(totalPolicyCharges / totalPremiumPaid, "Calculated as total policy charges divided by total premium paid.")
        : analyticsResult(null, "Insufficient extracted data", ["total_policy_charges", "total_premium_paid"]),
    growth_trend: growthTrend,
    illustration_variance:
      hasTrustedField(accumulationValue) && hasTrustedField(illustratedValue)
        ? analyticsResult(
            accumulationValue.value - illustratedValue.value,
            "Calculated as latest actual accumulation value minus illustrated baseline value proxy."
          )
        : analyticsResult(null, "Insufficient extracted data", ["accumulation_value", "illustrated value"]),
    policy_health_score: analyticsResult(
      buildPolicyHealthScore({
        totalPremiumPaid,
        accumulationValue,
        totalPolicyCharges,
        chargeDragRatio: totalPolicyCharges !== null && totalPremiumPaid ? totalPolicyCharges / totalPremiumPaid : null,
        loanBalance,
        dataCompleteness:
          latestStatement
            ? [
                hasTrustedField(latestStatement.fields.statement_date),
                hasTrustedField(accumulationValue),
                hasTrustedField(cashValue),
                hasTrustedField(cashSurrenderValue),
                hasTrustedField(loanBalance),
                totalPremiumPaid !== null,
              ].filter(Boolean).length / 6
            : 0,
      }),
      latestStatement && hasTrustedField(accumulationValue)
        ? "Conservative policy health score based on growth, charge pressure, loan pressure, and data completeness."
        : "Insufficient extracted data",
      latestStatement && hasTrustedField(accumulationValue) ? [] : ["accumulation_value"]
    ),
    strategy_review: strategyReview,
  };

  return analytics;
}

export function buildCashValueGrowthExplanation(baseline, statementHistory, analytics) {
  const lines = [];
  const latestStatement = sortStatementsChronologically(statementHistory).at(-1);
  const totalPremiumPaid = analytics.total_premium_paid?.value;
  const accumulationValue = latestStatement?.fields?.accumulation_value;
  const cashSurrenderValue = latestStatement?.fields?.cash_surrender_value;
  const cashValue = latestStatement?.fields?.cash_value;
  const loanBalance = latestStatement?.fields?.loan_balance;
  const chargeDragRatio = analytics.charge_drag_ratio?.value;

  if (totalPremiumPaid === null || !hasTrustedField(accumulationValue)) {
    return [
      "Cash value growth visibility is currently limited because contribution history or current account value could not be confirmed with sufficient confidence.",
    ];
  }

  lines.push(
    `Available records indicate approximately ${`$${Number(totalPremiumPaid).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`} in premium contributions and a current accumulation value of ${accumulationValue.display_value}.`
  );

  if (hasTrustedField(cashValue)) {
    lines.push(`Current policy cash value appears to be ${cashValue.display_value}.`);
  }

  if (hasTrustedField(cashSurrenderValue)) {
    lines.push(`Current cash surrender value appears to be ${cashSurrenderValue.display_value}.`);
  }

  const netGrowth = accumulationValue.value - totalPremiumPaid;
  lines.push(
    `Net policy growth versus detected contributions currently appears to be ${netGrowth < 0 ? "-" : ""}$${Math.abs(netGrowth).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}.`
  );

  if (chargeDragRatio !== null) {
    lines.push(
      chargeDragRatio > 0.2
        ? "The currently visible charge profile appears to be materially reducing net growth."
        : "The currently visible charge profile does not appear unusually heavy relative to premiums paid."
    );
  } else {
    lines.push("A fuller charge-impact reading would require more complete extraction of policy charges across the available statement set.");
  }

  if (hasTrustedField(loanBalance)) {
    lines.push(
      loanBalance.value > 0
        ? `Loan activity is present at ${loanBalance.display_value}, which may be reducing available policy value.`
        : "No current loan pressure was identified from the available statement history."
    );
  }

  return lines;
}

export function buildChargeAnalysisExplanation(statementHistory, analytics) {
  const lines = [];
  const chargeAnalysis = analytics?.charge_analysis || {};
  const statementCount = statementHistory.length;

  if (statementCount === 0) {
    return [
      "Charge analysis is limited because no annual statements have been uploaded yet.",
    ];
  }

  if (chargeAnalysis.total_policy_charges?.value !== null) {
    lines.push(
      `The currently visible statement history reflects approximately $${Number(chargeAnalysis.total_policy_charges.value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} in policy charges.`
    );
  } else {
    lines.push(
      "Only partial charge data was identified, so total policy charge analysis remains incomplete."
    );
  }

  if (chargeAnalysis.total_cost_of_insurance?.value !== null) {
    lines.push(
      `Cost of insurance charges were identified at approximately $${Number(chargeAnalysis.total_cost_of_insurance.value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`
    );
  } else {
    lines.push(
      "Cost of insurance was not identified clearly enough for a complete charge-pressure assessment."
    );
  }

  if (chargeAnalysis.charge_drag_ratio?.value !== null) {
    lines.push(
      chargeAnalysis.charge_drag_ratio.value > 0.2
        ? "Relative to detected premiums, visible charge drag appears elevated."
        : "Relative to detected premiums, visible charge drag appears moderate."
    );
  } else {
    lines.push(
      "Charge drag ratio remains limited because either premium history or complete charge totals are not yet available."
    );
  }

  if (chargeAnalysis.coi_trend?.value) {
    lines.push(
      "A multi-statement cost of insurance trend is available from the current policy history."
    );
  } else if (statementCount >= 2) {
    lines.push(
      "More complete charge extraction is still needed before a reliable multi-year trend can be shown."
    );
  } else {
    lines.push(
      "Because only a limited statement set is available, this should be viewed as a current-period charge snapshot rather than a long-term trend."
    );
  }

  return lines;
}

export function buildStrategyReviewNote(statementHistory, analytics) {
  const latestStatement = sortStatementsChronologically(statementHistory).at(-1);
  const strategyReview = analytics.strategy_review || {};

  if (!latestStatement) {
    return "Strategy review is limited because no statement history is available.";
  }

  const visibleFields = [
    strategyReview.index_strategy,
    strategyReview.allocation_percent,
    strategyReview.index_credit,
    strategyReview.crediting_rate,
    strategyReview.participation_rate,
    strategyReview.cap_rate,
  ].filter((value) => value && value !== "Not found");

  const concentrated =
    strategyReview.allocation_percent &&
    strategyReview.allocation_percent !== "Not found" &&
    /^100(?:\.0+)?%$/.test(String(strategyReview.allocation_percent));

  if (strategyReview.index_strategy && strategyReview.index_strategy !== "Not found") {
    if (concentrated && strategyReview.cap_rate && strategyReview.cap_rate !== "Not found") {
      return `This policy currently appears concentrated in the ${strategyReview.index_strategy}, with the available statement showing a cap rate of ${strategyReview.cap_rate}. A broader internal strategy comparison would require additional allocation or carrier option data.`;
    }

    if (concentrated) {
      return `Current indexed strategy detected: ${strategyReview.index_strategy}. Allocation appears concentrated in a single indexed account, but broader internal option terms were not identified from the uploaded pages.`;
    }

    if (visibleFields.length >= 3) {
      return `Current indexed strategy detected: ${strategyReview.index_strategy}. Some supporting internal terms were identified, but a broader internal strategy comparison remains limited by incomplete option visibility.`;
    }

    return `Current indexed strategy detected: ${strategyReview.index_strategy}. Additional allocation or carrier option detail would be needed for a fuller internal strategy comparison.`;
  }

  if (visibleFields.length > 0) {
    return "Some internal strategy metrics were identified, but the uploaded pages do not yet support a broader internal strategy comparison.";
  }

  return "Strategy visibility is limited because internal allocation and indexed account details were not identified clearly enough from the uploaded pages.";
}

export function buildVaultAiPolicyExplanation(baseline, statementHistory, analytics) {
  const lines = [];
  const latestStatement = sortStatementsChronologically(statementHistory).at(-1);
  const totalPremiumPaid = analytics.total_premium_paid?.value;
  const accumulationValue = latestStatement?.fields?.accumulation_value;
  const loanBalance = latestStatement?.fields?.loan_balance;
  const cashSurrenderValue = latestStatement?.fields?.cash_surrender_value;
  const chargeDragRatio = analytics.charge_drag_ratio?.value;

  if (!baseline || !latestStatement) {
    return ["Policy explanation is limited because both a baseline illustration and at least one statement are required."];
  }

  lines.push(
    totalPremiumPaid !== null
      ? "Funding status: contribution history was identified well enough to evaluate current policy growth."
      : "Funding status: limited, because total premium contributions could not yet be confirmed."
  );

  lines.push(
    hasTrustedField(accumulationValue)
      ? `Growth status: current accumulation value is ${accumulationValue.display_value}.`
      : "Growth status: limited, because current accumulation value was not identified with sufficient confidence."
  );

  lines.push(
    hasTrustedField(cashSurrenderValue)
      ? `Cash value status: current cash surrender value is ${cashSurrenderValue.display_value}.`
      : "Cash value status: limited, because current surrender value could not be confirmed."
  );

  if (chargeDragRatio !== null) {
    lines.push(
      chargeDragRatio > 0.2
        ? "Charge pressure: elevated relative to detected premiums and currently visible account growth."
        : "Charge pressure: presently moderate based on the available charge inputs."
    );
  } else {
    lines.push("Charge pressure: limited, because charge extraction remains incomplete.");
  }

  if (hasTrustedField(loanBalance)) {
    lines.push(
      loanBalance.value > 0 ? `Loan pressure: a current loan balance of ${loanBalance.display_value} was detected.` : "Loan pressure: no current loan balance was detected."
    );
  } else {
    lines.push("Loan pressure: limited, because loan balance could not be confirmed.");
  }

  lines.push(`Strategy visibility: ${buildStrategyReviewNote(statementHistory, analytics)}`);

  return lines;
}

export function buildVaultAiSummary(baseline, statementHistory, analytics) {
  const lines = [];

  const trusted = (field) => (hasTrustedField(field, PARSER_DICTIONARY.confidenceThresholds.aiMinimum) ? field.display_value : null);
  const baselineType = trusted(baseline?.fields?.policy_type) || "life insurance policy";
  const deathBenefit = trusted(baseline?.fields?.death_benefit);
  const plannedPremium = trusted(baseline?.fields?.planned_premium);

  if (!deathBenefit || !plannedPremium) {
    lines.push("VaultAI reading is limited because several critical baseline values were not extracted with sufficient confidence.");
  }

  lines.push(
    `The uploaded baseline document appears to describe an ${baselineType}${deathBenefit ? ` with a death benefit of ${deathBenefit}` : ""}${plannedPremium ? ` and a planned premium of ${plannedPremium}` : ""}.`
  );

  if (statementHistory.length === 0) {
    lines.push("No annual statements were uploaded, so the system could only analyze the baseline illustration.");
    return lines;
  }

  lines.push(`The system classified and processed ${statementHistory.length} annual statement${statementHistory.length > 1 ? "s" : ""}.`);

  const latestStatement = statementHistory.at(-1);
  const accumulation = trusted(latestStatement?.fields?.accumulation_value);
  const surrender = trusted(latestStatement?.fields?.cash_surrender_value);
  const loan = trusted(latestStatement?.fields?.loan_balance);

  if (accumulation) {
    lines.push(`The latest statement shows an accumulation value of ${accumulation}.`);
  } else {
    lines.push("Accumulation value could not be confirmed with sufficient confidence from the current statement set.");
  }

  if (surrender) {
    lines.push(`Cash surrender value was identified at ${surrender}.`);
  }

  if (loan) {
    lines.push(`Policy loan balance appears to be ${loan}.`);
  } else {
    lines.push("No policy loan balance was confirmed with sufficient confidence.");
  }

  if (analytics.total_policy_charges.value !== null) {
    lines.push("Charge-related analytics were computed from trusted statement fields.");
  } else {
    lines.push("A complete policy health reading is still limited because charge fields were not extracted confidently enough.");
  }

  return lines;
}

export function buildPolicyRecord({ baseline, statements, vaultAiSummary }) {
  const record = createEmptyIulPolicyRecord();
  const sortedStatements = sortStatementsChronologically(statements);

  record.sourceDocuments.baselineDocumentName = baseline?.fileName || "";
  record.sourceDocuments.statementFileNames = sortedStatements.map((statement) => statement.fileName);

  record.policyIdentity.carrier = baseline?.fields?.carrier_name?.display_value || "";
  record.policyIdentity.productName = baseline?.fields?.product_name?.display_value || "";
  record.policyIdentity.policyType = baseline?.fields?.policy_type?.display_value || "";
  record.policyIdentity.policyNumber = baseline?.fields?.policy_number?.display_value || "";
  record.policyIdentity.issueDate = baseline?.fields?.issue_date?.display_value || "";

  record.deathBenefit.specifiedAmount = baseline?.fields?.death_benefit?.display_value || "";
  record.premiumStructure.plannedPremium = baseline?.fields?.planned_premium?.display_value || "";
  record.premiumStructure.targetPremium = baseline?.fields?.target_premium?.display_value || "";
  record.premiumStructure.monthlyGuaranteePremium = baseline?.fields?.guaranteed_premium?.display_value || "";
  record.premiumStructure.premiumMode = baseline?.fields?.payment_mode?.display_value || "";

  record.performanceHistory = sortedStatements.map((statement) => ({
    statementDate: statement.fields.statement_date?.display_value || "",
    accumulationValue: statement.fields.accumulation_value?.display_value || "",
    cashValue: statement.fields.cash_value?.display_value || "",
    cashSurrenderValue: statement.fields.cash_surrender_value?.display_value || "",
    loanBalance: statement.fields.loan_balance?.display_value || "",
    creditedInterest: statement.fields.index_credit?.display_value || "",
    premiumPaid: statement.fields.premium_paid?.display_value || "",
    monthlyDeduction: statement.fields.monthly_deduction?.display_value || "",
  }));

  record.vaultAiSummary.overview = vaultAiSummary[0] || "";
  record.vaultAiSummary.majorFindings = vaultAiSummary.slice(1);

  return record;
}
