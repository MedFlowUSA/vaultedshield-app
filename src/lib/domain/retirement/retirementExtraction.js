const EMPTY_SUMMARY = Object.freeze({
  accountValue: null,
  contributions: null,
  accountType: null,
  statementDate: null,
  status: "limited",
  missingFields: ["account value", "statement date", "account type"],
});

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parseCurrency(text) {
  if (!text) return null;
  const match = cleanText(text).match(/\$?\(?-?\d[\d,]*(?:\.\d{2})?\)?/);
  if (!match) return null;
  const normalized = match[0].replace(/[$,()\s]/g, "");
  const negative = match[0].includes("(") || match[0].startsWith("-");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function parseDate(text) {
  if (!text) return null;
  const match = cleanText(text).match(
    /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4})\b/i
  );
  if (!match) return null;
  const parsed = new Date(match[0]);
  if (Number.isNaN(parsed.getTime())) return match[0];
  return parsed.toISOString().slice(0, 10);
}

function matchFirstValue(text, patterns, parser = (value) => value) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = parser(match[1] || match[0]);
    if (parsed !== null && parsed !== undefined && parsed !== "") {
      return parsed;
    }
  }
  return null;
}

export function extractRetirementSummary(documentText = "") {
  const text = cleanText(documentText);
  if (!text) {
    return EMPTY_SUMMARY;
  }

  const accountValue = matchFirstValue(
    text,
    [
      /(?:total account value|account value|ending balance|current balance|vested balance)\s*[:-]?\s*(\$?\(?-?\d[\d,]*(?:\.\d{2})?\)?)/i,
      /(?:balance as of .*?)\s+(\$?\(?-?\d[\d,]*(?:\.\d{2})?\)?)/i,
    ],
    parseCurrency
  );

  const contributions = matchFirstValue(
    text,
    [
      /(?:year[- ]to[- ]date contributions|ytd contributions|employee contributions|contributions)\s*[:-]?\s*(\$?\(?-?\d[\d,]*(?:\.\d{2})?\)?)/i,
      /(?:deferrals|contribution amount)\s*[:-]?\s*(\$?\(?-?\d[\d,]*(?:\.\d{2})?\)?)/i,
    ],
    parseCurrency
  );

  const accountType = matchFirstValue(
    text,
    [
      /\b(roth 401\(k\)|401\(k\)|403\(b\)|457\(b\)|traditional ira|roth ira|rollover ira|simple ira|sep ira|ira|brokerage ira|pension)\b/i,
      /(?:plan type|account type)\s*[:-]?\s*([A-Za-z0-9() -]+)/i,
    ],
    (value) => cleanText(value)
  );

  const statementDate = matchFirstValue(
    text,
    [
      /(?:statement date|period ending|as of|statement period ending)\s*[:-]?\s*([A-Za-z0-9,/ ]{6,30})/i,
    ],
    parseDate
  );

  const captured = [
    accountValue !== null,
    contributions !== null,
    Boolean(accountType),
    Boolean(statementDate),
  ].filter(Boolean).length;

  const missingFields = [];
  if (accountValue === null) missingFields.push("account value");
  if (contributions === null) missingFields.push("contributions");
  if (!accountType) missingFields.push("account type");
  if (!statementDate) missingFields.push("statement date");

  return {
    accountValue,
    contributions,
    accountType,
    statementDate,
    status: captured >= 3 ? "complete" : "limited",
    missingFields,
  };
}
