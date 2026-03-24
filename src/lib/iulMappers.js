import { createEmptyIulPolicyRecord } from "./iulSchema";

function pickFirst(...values) {
  return values.find((v) => v && v !== "Not found") || "";
}

function extractNextLineValue(text, possibleLabels) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].toLowerCase();

    for (const label of possibleLabels) {
      const normalizedLabel = label.toLowerCase();

      if (current === normalizedLabel || current.includes(normalizedLabel)) {
        const next = lines[i + 1];
        if (next) return next.trim();
      }
    }
  }

  return "Not found";
}

export function mapBaselineDocumentToSchema(text, fileName = "") {
  const record = createEmptyIulPolicyRecord();

  record.sourceDocuments.baselineDocumentName = fileName;

  record.policyIdentity.carrier = text.includes("American General Life Insurance Company")
    ? "American General Life Insurance Company"
    : text.includes("Corebridge Financial")
      ? "Corebridge Financial"
      : "";

  record.policyIdentity.productName = pickFirst(
    text.includes("QoL Max Accumulator+") ? "QoL Max Accumulator+" : "",
    extractNextLineValue(text, ["PRODUCT", "PRODUCT NAME"])
  );

  record.policyIdentity.policyType = pickFirst(
    text.includes("Index Universal Life") ? "Index Universal Life" : "",
    text.includes("Indexed Universal Life") ? "Indexed Universal Life" : "",
    text.includes("Universal Life") ? "Universal Life" : "",
    extractNextLineValue(text, ["PRODUCT TYPE", "POLICY TYPE"])
  );

  record.policyIdentity.policyNumber = extractNextLineValue(text, [
    "POLICY",
    "POLICY NUMBER",
  ]);

  record.policyIdentity.issueDate = extractNextLineValue(text, [
    "ISSUE DATE",
    "DATE OF ISSUE",
  ]);

  record.deathBenefit.specifiedAmount = pickFirst(
    extractNextLineValue(text, ["INITIAL SPECIFIED AMOUNT"]),
    extractNextLineValue(text, ["SPECIFIED AMOUNT"]),
    extractNextLineValue(text, ["DEATH BENEFIT AMOUNT"]),
    extractNextLineValue(text, ["DEATH BENEFIT"])
  );

  record.premiumStructure.plannedPremium = pickFirst(
    extractNextLineValue(text, ["PLANNED PERIODIC PREMIUM"]),
    extractNextLineValue(text, ["INITIAL PREMIUM"]),
    extractNextLineValue(text, ["PERIODIC PREMIUM"])
  );

  record.premiumStructure.premiumMode = pickFirst(
    extractNextLineValue(text, ["PAYMENT MODE"]),
    extractNextLineValue(text, ["PAYABLE"]),
    extractNextLineValue(text, ["MODE"])
  );

  record.premiumStructure.targetPremium = pickFirst(
    extractNextLineValue(text, ["INITIAL TARGET PREMIUM"]),
    extractNextLineValue(text, ["TARGET PREMIUM"])
  );

  record.premiumStructure.monthlyGuaranteePremium = extractNextLineValue(text, [
    "MONTHLY GUARANTEE PREMIUM",
  ]);

  return record;
}

export function mapStatementDocumentToHistoryEntry(text, fileName = "") {
  return {
    fileName,
    statementDate: pickFirst(
      extractNextLineValue(text, ["STATEMENT DATE"]),
      extractNextLineValue(text, ["STATEMENT PERIOD ENDING"]),
      extractNextLineValue(text, ["PERIOD ENDING"])
    ),
    accumulationValue: pickFirst(
      extractNextLineValue(text, ["ACCUMULATION VALUE AT END OF PERIOD"]),
      extractNextLineValue(text, ["ACCUMULATION VALUE"]),
      extractNextLineValue(text, ["ACCOUNT VALUE"])
    ),
    cashValue: extractNextLineValue(text, ["CASH VALUE"]),
    cashSurrenderValue: pickFirst(
      extractNextLineValue(text, ["CASH SURRENDER VALUE AT END OF PERIOD"]),
      extractNextLineValue(text, ["CASH SURRENDER VALUE"]),
      extractNextLineValue(text, ["NET CASH SURRENDER VALUE"])
    ),
    loanBalance: pickFirst(
      extractNextLineValue(text, ["LOAN BALANCE"]),
      extractNextLineValue(text, ["LOANS"]),
      extractNextLineValue(text, ["POLICY LOAN"])
    ),
    creditedInterest: pickFirst(
      extractNextLineValue(text, ["INTEREST CREDITED"]),
      extractNextLineValue(text, ["INDEX ACCOUNT INTEREST"])
    ),
    premiumPaid: pickFirst(
      extractNextLineValue(text, ["PERIODIC PREMIUM"]),
      extractNextLineValue(text, ["PREMIUM"])
    ),
  };
}
