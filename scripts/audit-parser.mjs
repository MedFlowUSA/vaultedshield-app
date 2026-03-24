import fs from "node:fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  parseIllustrationDocument,
  parseStatementDocument,
} from "../src/lib/parser/extractionEngine.js";

async function extractPdfPages(filePath) {
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join("\n");
    pages.push(pageText);
  }

  return pages;
}

function printFieldAudit(label, field) {
  console.log(
    JSON.stringify(
      {
        field: label,
        display_value: field?.display_value ?? "Not found",
        raw_label: field?.raw_label ?? "",
        raw_value: field?.raw_value ?? "",
        extraction_method: field?.extraction_method ?? "missing",
        confidence: field?.confidence ?? "low",
        confidence_score: field?.confidence_score ?? 0,
        page_number: field?.page_number ?? null,
        evidence: field?.evidence ?? [],
        rejected_candidates: field?.rejected_candidates ?? [],
      },
      null,
      2
    )
  );
}

async function main() {
  const illustrationPath = process.argv[2];
  const statementPath = process.argv[3];

  if (!illustrationPath || !statementPath) {
    throw new Error("Usage: node scripts/audit-parser.mjs <illustration.pdf> <statement.pdf>");
  }

  const illustrationPages = await extractPdfPages(illustrationPath);
  const statementPages = await extractPdfPages(statementPath);

  const illustration = parseIllustrationDocument({
    pages: illustrationPages,
    fileName: illustrationPath.split("\\").at(-1),
  });
  const statement = parseStatementDocument({
    pages: statementPages,
    fileName: statementPath.split("\\").at(-1),
  });

  console.log("=== ILLUSTRATION SUMMARY ===");
  console.log(JSON.stringify(illustration.summary, null, 2));
  console.log("=== ILLUSTRATION AUDIT ===");
  [
    "carrier_name",
    "product_name",
    "policy_type",
    "policy_number",
    "issue_date",
    "death_benefit",
    "initial_face_amount",
    "option_type",
    "planned_premium",
    "minimum_premium",
    "guideline_premium_limit",
  ].forEach((fieldKey) => printFieldAudit(fieldKey, illustration.fields[fieldKey]));

  console.log("=== STATEMENT SUMMARY ===");
  console.log(JSON.stringify(statement.summary, null, 2));
  console.log("=== STATEMENT AUDIT ===");
  [
    "statement_date",
    "policy_year",
    "insured_age",
    "accumulation_value",
    "cash_value",
    "cash_surrender_value",
    "loan_balance",
    "cost_of_insurance",
    "admin_fee",
    "monthly_deduction",
    "expense_charge",
    "rider_charge",
    "index_strategy",
    "allocation_percent",
    "index_credit",
    "crediting_rate",
    "participation_rate",
    "cap_rate",
    "spread",
    "indexed_account_value",
    "fixed_account_value",
  ].forEach((fieldKey) => printFieldAudit(fieldKey, statement.fields[fieldKey]));

  console.log("=== ILLUSTRATION FIRST 200 LINES ===");
  console.log(
    illustration.text
      .split("\n")
      .slice(0, 200)
      .map((line, index) => `${index + 1}: ${line}`)
      .join("\n")
  );

  console.log("=== STATEMENT FIRST 200 LINES ===");
  console.log(
    statement.text
      .split("\n")
      .slice(0, 200)
      .map((line, index) => `${index + 1}: ${line}`)
      .join("\n")
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
