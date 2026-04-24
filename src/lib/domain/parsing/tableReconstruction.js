function splitLines(text = "") {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeCurrencyToken(token = "") {
  const normalized = String(token || "").replace(/[$,()\s]/g, "");
  if (!normalized) return null;
  const signAdjusted = token.includes("(") && token.includes(")") ? `-${normalized}` : normalized;
  const value = Number(signAdjusted);
  return Number.isFinite(value) ? value : null;
}

function normalizePercentToken(token = "") {
  const cleaned = String(token || "").replace(/[%\s,]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function normalizeIntegerToken(token = "") {
  const cleaned = String(token || "").replace(/[^\d-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isInteger(value) ? value : null;
}

function looksLikeCurrencyToken(token = "") {
  return normalizeCurrencyToken(token) !== null && /[\d$]/.test(String(token || ""));
}

function countMatchedHeaders(lines, expectedHeaders) {
  const lowered = lines.join(" ").toLowerCase();
  return expectedHeaders.filter((header) => lowered.includes(header.toLowerCase())).length;
}

function scoreQuality({ headerMatches, expectedHeaderCount, rowCount, numericDensity, repeatedHeadersHandled, consistentColumns }) {
  let score = 0;
  if (expectedHeaderCount > 0) score += headerMatches / expectedHeaderCount;
  if (rowCount >= 4) score += 1;
  else if (rowCount >= 2) score += 0.65;
  else if (rowCount >= 1) score += 0.35;
  score += numericDensity >= 0.75 ? 0.9 : numericDensity >= 0.5 ? 0.5 : numericDensity >= 0.25 ? 0.2 : 0;
  if (repeatedHeadersHandled) score += 0.5;
  if (consistentColumns) score += 0.6;

  if (score >= 3.2) return "strong";
  if (score >= 2) return "moderate";
  if (score >= 1) return "weak";
  return "failed";
}

function groupLedgerBlocks(lines, expectedHeaders) {
  const blocks = [];
  let current = [];
  let repeatedHeadersHandled = false;

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    const isHeaderRepeat = expectedHeaders.some((header) => lower.includes(header));
    if (isHeaderRepeat && current.length > 0) {
      repeatedHeadersHandled = true;
      blocks.push(current);
      current = [];
      return;
    }
    current.push(line);
  });

  if (current.length > 0) blocks.push(current);
  return { blocks, repeatedHeadersHandled };
}

function extractFidelityGuarantyLedgerRows(lines, pageNumber) {
  const expectedHeaders = [
    "policy year",
    "attained age",
    "premium outlay",
    "premium",
    "account value",
    "accumulation value",
    "cash surrender value",
    "death benefit",
    "loan balance",
    "charges",
  ];
  const { blocks, repeatedHeadersHandled } = groupLedgerBlocks(lines, expectedHeaders);
  const rows = [];
  const failedRows = [];

  blocks.forEach((block) => {
    for (let index = 0; index < block.length; index += 1) {
      const year = normalizeIntegerToken(block[index]);
      const age = normalizeIntegerToken(block[index + 1]);
      if (!year || year < 1 || year > 120 || !age || age < 0 || age > 120) continue;

      const rawTokens = [];
      let cursor = index + 2;
      while (cursor < block.length && rawTokens.length < 8) {
        const token = block[cursor];
        const nextYear = normalizeIntegerToken(token);
        const nextAge = normalizeIntegerToken(block[cursor + 1] || "");
        if (rawTokens.length >= 3 && nextYear && nextYear >= 1 && nextYear <= 120 && nextAge && nextAge >= 0 && nextAge <= 120) {
          break;
        }
        if (looksLikeCurrencyToken(token)) rawTokens.push(token);
        cursor += 1;
      }

      if (rawTokens.length < 3) {
        failedRows.push(`Could not reconstruct full F&G ledger row starting at policy year ${year} on page ${pageNumber}.`);
        continue;
      }

      const currencyValues = rawTokens.map((token) => normalizeCurrencyToken(token)).filter((value) => value !== null);
      const row = {
        year,
        attained_age: age,
        premium: currencyValues[0] ?? null,
        account_value: currencyValues[1] ?? null,
        surrender_value: currencyValues[2] ?? null,
        death_benefit: currencyValues[currencyValues.length - 1] ?? null,
        loan_balance: currencyValues.length >= 5 ? currencyValues[currencyValues.length - 2] : null,
        illustrated_charges: currencyValues.length >= 6 ? currencyValues[currencyValues.length - 3] : null,
        source_page_number: pageNumber,
        raw_tokens: rawTokens,
        provenance: rawTokens.map((token) => ({ value: token, page: pageNumber })),
      };
      rows.push(row);
      index = cursor - 1;
    }
  });

  const headerMatches = countMatchedHeaders(lines, expectedHeaders);
  const numericDensity = rows.length > 0 ? rows.filter((row) => row.account_value !== null && row.surrender_value !== null).length / rows.length : 0;
  const consistentColumns = rows.every((row) => row.premium !== null && row.account_value !== null && row.surrender_value !== null && row.death_benefit !== null);

  return {
    headers_detected: expectedHeaders.filter((header) => lines.join(" ").toLowerCase().includes(header)),
    rows,
    failed_rows: failedRows,
    quality: scoreQuality({
      headerMatches,
      expectedHeaderCount: expectedHeaders.length,
      rowCount: rows.length,
      numericDensity,
      repeatedHeadersHandled,
      consistentColumns,
    }),
    quality_inputs: {
      header_matches: headerMatches,
      expected_headers: expectedHeaders.length,
      row_count: rows.length,
      numeric_density: numericDensity,
      repeated_headers_handled: repeatedHeadersHandled,
      consistent_columns: consistentColumns,
    },
  };
}

function extractGenericLedgerRows(lines, pageNumber) {
  const expectedHeaders = ["policy year", "attained age", "account value", "accumulation value", "cash surrender value", "death benefit"];
  const rows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const year = normalizeIntegerToken(lines[index]);
    const age = normalizeIntegerToken(lines[index + 1]);
    if (!year || !age || year < 1 || year > 120 || age < 0 || age > 120) continue;

    const rawTokens = [];
    let cursor = index + 2;
    while (cursor < lines.length && rawTokens.length < 6) {
      const token = lines[cursor];
      if (normalizeIntegerToken(token) && rawTokens.length >= 3) break;
      if (looksLikeCurrencyToken(token)) rawTokens.push(token);
      cursor += 1;
    }

    if (rawTokens.length < 3) continue;
    const values = rawTokens.map((token) => normalizeCurrencyToken(token)).filter((value) => value !== null);
    rows.push({
      year,
      attained_age: age,
      premium: values[0] ?? null,
      account_value: values[1] ?? null,
      surrender_value: values[2] ?? null,
      death_benefit: values[values.length - 1] ?? null,
      source_page_number: pageNumber,
      raw_tokens: rawTokens,
      provenance: rawTokens.map((token) => ({ value: token, page: pageNumber })),
    });
    index = cursor - 1;
  }

  const headerMatches = countMatchedHeaders(lines, expectedHeaders);
  const numericDensity = rows.length > 0 ? rows.filter((row) => row.account_value !== null && row.surrender_value !== null).length / rows.length : 0;

  return {
    headers_detected: expectedHeaders.filter((header) => lines.join(" ").toLowerCase().includes(header)),
    rows,
    failed_rows: rows.length === 0 ? ["No complete ledger rows reconstructed."] : [],
    quality: scoreQuality({
      headerMatches,
      expectedHeaderCount: expectedHeaders.length,
      rowCount: rows.length,
      numericDensity,
      repeatedHeadersHandled: false,
      consistentColumns: rows.every((row) => row.premium !== null && row.account_value !== null && row.surrender_value !== null),
    }),
    quality_inputs: {
      header_matches: headerMatches,
      expected_headers: expectedHeaders.length,
      row_count: rows.length,
      numeric_density: numericDensity,
      repeated_headers_handled: false,
      consistent_columns: rows.every((row) => row.premium !== null && row.account_value !== null && row.surrender_value !== null),
    },
  };
}

function extractChargeRows(lines, pageNumber) {
  const patterns = [
    { key: "cost_of_insurance", label: "cost of insurance" },
    { key: "monthly_deduction", label: "monthly deduction" },
    { key: "expense_charge", label: "expense charge" },
    { key: "admin_fee", label: "administrative fee" },
    { key: "rider_charge", label: "rider charge" },
  ];

  const rows = patterns
    .map((pattern) => {
      const line = lines.find((entry) => entry.toLowerCase().includes(pattern.label));
      if (!line) return null;
      const amountMatch = line.match(/(\(?\$?[\d,]+(?:\.\d{2})?\)?)/);
      return amountMatch
        ? {
            key: pattern.key,
            label: pattern.label,
            value: normalizeCurrencyToken(amountMatch[1]),
            raw_value: amountMatch[1],
            source_page_number: pageNumber,
            provenance: [{ value: amountMatch[1], page: pageNumber }],
          }
        : null;
    })
    .filter(Boolean);

  const headerMatches = countMatchedHeaders(lines, patterns.map((pattern) => pattern.label));
  return {
    headers_detected: ["label", "value"],
    rows,
    failed_rows: rows.length === 0 ? ["No charge rows reconstructed."] : [],
    quality: scoreQuality({
      headerMatches,
      expectedHeaderCount: patterns.length,
      rowCount: rows.length,
      numericDensity: rows.length > 0 ? 1 : 0,
      repeatedHeadersHandled: false,
      consistentColumns: rows.every((row) => row.value !== null),
    }),
    quality_inputs: {
      header_matches: headerMatches,
      expected_headers: patterns.length,
      row_count: rows.length,
      numeric_density: rows.length > 0 ? 1 : 0,
      repeated_headers_handled: false,
      consistent_columns: rows.every((row) => row.value !== null),
    },
  };
}

function extractSymetraAllocationRows(lines, pageNumber) {
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/(index|fixed|account|strategy)/i.test(line)) continue;
    const percents = [...line.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]));
    if (percents.length === 0) continue;
    const nextLine = lines[index + 1] || "";
    const combined = `${line} ${nextLine}`;
    rows.push({
      strategy: line.replace(/\s+\d{1,3}(?:\.\d+)?\s*%.*/, "").trim(),
      allocation_percent: percents[0] ?? null,
      cap_rate: ((combined.match(/cap rate[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1] && Number((combined.match(/cap rate[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1])) ?? null,
      participation_rate:
        ((combined.match(/participation rate[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1] &&
          Number((combined.match(/participation rate[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1])) ??
        null,
      spread: ((combined.match(/spread[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1] && Number((combined.match(/spread[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1])) ?? null,
      crediting_rate:
        ((combined.match(/crediting rate[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1] &&
          Number((combined.match(/crediting rate[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1])) ??
        null,
      indexed_account_value:
        ((combined.match(/indexed account value[: ]+\$?([\d,]+(?:\.\d{2})?)/i) || [])[1] &&
          Number((combined.match(/indexed account value[: ]+\$?([\d,]+(?:\.\d{2})?)/i) || [])[1].replace(/,/g, ""))) ??
        null,
      fixed_account_value:
        ((combined.match(/fixed account value[: ]+\$?([\d,]+(?:\.\d{2})?)/i) || [])[1] &&
          Number((combined.match(/fixed account value[: ]+\$?([\d,]+(?:\.\d{2})?)/i) || [])[1].replace(/,/g, ""))) ??
        null,
      row_kind: /current|active|current allocation/i.test(combined) ? "active_current" : /available|option/i.test(combined) ? "menu_option" : "visible_strategy",
      source_page_number: pageNumber,
      provenance: [{ value: combined, page: pageNumber }],
    });
  }

  const activeRows = rows.filter((row) => row.row_kind === "active_current");
  const finalRows = activeRows.length > 0 ? activeRows : rows;
  const headerMatches = countMatchedHeaders(lines, ["allocation", "cap rate", "participation rate", "spread", "strategy"]);
  const percentConsistency = finalRows.length > 0 ? finalRows.filter((row) => row.allocation_percent !== null).length / finalRows.length : 0;

  return {
    headers_detected: ["strategy", "allocation_percent", "cap_rate", "participation_rate", "spread", "crediting_rate"],
    rows: finalRows,
    all_rows: rows,
    failed_rows: finalRows.length === 0 ? ["No allocation rows reconstructed."] : [],
    quality: scoreQuality({
      headerMatches,
      expectedHeaderCount: 5,
      rowCount: finalRows.length,
      numericDensity: percentConsistency,
      repeatedHeadersHandled: false,
      consistentColumns: finalRows.every((row) => row.strategy && row.allocation_percent !== null),
    }),
    quality_inputs: {
      header_matches: headerMatches,
      expected_headers: 5,
      row_count: finalRows.length,
      numeric_density: percentConsistency,
      repeated_headers_handled: false,
      consistent_columns: finalRows.every((row) => row.strategy && row.allocation_percent !== null),
    },
  };
}

function extractGenericAllocationRows(lines, pageNumber) {
  const rows = lines
    .map((line) => {
      const percentMatch = line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      if (!percentMatch || !/(index|fixed|strategy|account)/i.test(line)) return null;
      return {
        strategy: line.replace(percentMatch[0], "").trim(),
        allocation_percent: normalizePercentToken(percentMatch[0]),
        cap_rate: normalizePercentToken((line.match(/cap rate[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1]),
        participation_rate: normalizePercentToken((line.match(/participation rate[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1]),
        spread: normalizePercentToken((line.match(/spread[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1]),
        crediting_rate: normalizePercentToken((line.match(/crediting rate[: ]+(\d{1,3}(?:\.\d+)?)%/i) || [])[1]),
        source_page_number: pageNumber,
        provenance: [{ value: line, page: pageNumber }],
      };
    })
    .filter(Boolean);

  const headerMatches = countMatchedHeaders(lines, ["allocation", "cap rate", "participation rate", "spread"]);
  return {
    headers_detected: ["strategy", "allocation_percent", "cap_rate", "participation_rate", "spread", "crediting_rate"],
    rows,
    all_rows: rows,
    failed_rows: rows.length === 0 ? ["No allocation rows reconstructed."] : [],
    quality: scoreQuality({
      headerMatches,
      expectedHeaderCount: 4,
      rowCount: rows.length,
      numericDensity: rows.length > 0 ? rows.filter((row) => row.allocation_percent !== null).length / rows.length : 0,
      repeatedHeadersHandled: false,
      consistentColumns: rows.every((row) => row.strategy && row.allocation_percent !== null),
    }),
    quality_inputs: {
      header_matches: headerMatches,
      expected_headers: 4,
      row_count: rows.length,
      numeric_density: rows.length > 0 ? rows.filter((row) => row.allocation_percent !== null).length / rows.length : 0,
      repeated_headers_handled: false,
      consistent_columns: rows.every((row) => row.strategy && row.allocation_percent !== null),
    },
  };
}

export function reconstructTableFromPage(pageText = "", options = {}) {
  const lines = splitLines(pageText);
  const pageType = options.pageType || "unknown";
  const pageNumber = options.pageNumber || 1;
  const carrierKey = options.carrierKey || "";

  if (pageType === "illustration_ledger") {
    const result = carrierKey === "fidelity_guaranty" ? extractFidelityGuarantyLedgerRows(lines, pageNumber) : extractGenericLedgerRows(lines, pageNumber);
    return {
      page_type: pageType,
      ...result,
    };
  }

  if (pageType === "charges_table") {
    return {
      page_type: pageType,
      ...extractChargeRows(lines, pageNumber),
    };
  }

  if (pageType === "allocation_table") {
    const result = carrierKey === "symetra" ? extractSymetraAllocationRows(lines, pageNumber) : extractGenericAllocationRows(lines, pageNumber);
    return {
      page_type: pageType,
      ...result,
    };
  }

  return {
    page_type: pageType,
    headers_detected: [],
    rows: [],
    quality: "failed",
    quality_inputs: {
      header_matches: 0,
      expected_headers: 0,
      row_count: 0,
      numeric_density: 0,
      repeated_headers_handled: false,
      consistent_columns: false,
    },
    failed_rows: ["Unsupported page type for table reconstruction."],
  };
}
