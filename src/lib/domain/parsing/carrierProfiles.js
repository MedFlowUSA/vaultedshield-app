const SHARED_PAGE_TYPES = [
  "illustration_summary",
  "illustration_ledger",
  "statement_summary",
  "charges_table",
  "allocation_table",
];

function buildProfile({
  key,
  name,
  aliases,
  detectionPatterns,
  pageTypeSignals = {},
  fieldLabels = {},
}) {
  return {
    key,
    name,
    aliases,
    detectionPatterns,
    pageTypesSupported: SHARED_PAGE_TYPES,
    pageTypeSignals,
    fieldLabels,
  };
}

const SHARED_FIELD_LABELS = {
  illustration_summary: {
    policy_number: ["policy number", "contract number", "certificate number"],
    issue_date: ["issue date", "policy date", "effective date", "policy effective date"],
    product_name: ["product name", "plan name", "policy name"],
    death_benefit: ["death benefit", "initial death benefit", "specified amount", "face amount"],
    planned_premium: ["planned premium", "annual premium", "modal planned premium", "target premium"],
  },
  statement_summary: {
    policy_number: ["policy number", "contract number", "certificate number"],
    statement_date: ["statement date", "report date", "statement ending date", "as of"],
    accumulation_value: ["accumulation value", "account value", "policy value"],
    cash_value: ["cash value"],
    cash_surrender_value: ["cash surrender value", "surrender value", "net cash surrender value"],
    death_benefit: ["death benefit", "current death benefit"],
    loan_balance: ["loan balance", "policy loan balance", "indebtedness"],
    premium_paid: ["premium paid", "premium received", "planned premium"],
    policy_charges_total: ["policy charges", "total charges", "monthly deduction"],
  },
  charges_table: {
    cost_of_insurance: ["cost of insurance", "coi", "insurance charge"],
    monthly_deduction: ["monthly deduction", "monthly deductions"],
    expense_charge: ["expense charge", "expense charges", "premium expense"],
    admin_fee: ["administrative charge", "administrative fee", "policy fee"],
    rider_charge: ["rider charge", "rider charges", "cost of riders"],
  },
  allocation_table: {
    index_strategy: ["indexed account", "allocation option", "strategy", "interest option"],
    allocation_percent: ["allocation percent", "allocation %", "percent allocated"],
    cap_rate: ["cap rate"],
    participation_rate: ["participation rate", "participation %"],
    spread: ["spread"],
    crediting_rate: ["crediting rate", "index credit", "declared rate"],
    fixed_account_value: ["fixed account", "fixed account value"],
    indexed_account_value: ["indexed account value", "index account value"],
  },
};

export const CARRIER_PARSING_PROFILES = {
  fidelity_guaranty: buildProfile({
    key: "fidelity_guaranty",
    name: "F&G Life Insurance Company",
    aliases: [
      "f&g",
      "f&g life",
      "f&g life insurance company",
      "fidelity & guaranty",
      "fidelity & guaranty life",
      "fidelity & guaranty life insurance company",
    ],
    detectionPatterns: ["policy detail", "segment detail", "allocation detail", "annual statement"],
    pageTypeSignals: {
      illustration_summary: ["policy detail", "policy information", "coverage detail"],
      illustration_ledger: ["policy year", "attained age", "accumulation value", "cash surrender value"],
      statement_summary: ["annual statement", "policy value summary", "account summary"],
      charges_table: ["cost of insurance", "expense charges", "monthly deduction", "date premium paid"],
      allocation_table: ["allocation detail", "segment detail", "indexed segment", "strategy detail"],
    },
    fieldLabels: SHARED_FIELD_LABELS,
  }),
  protective: buildProfile({
    key: "protective",
    name: "Protective Life Insurance Company",
    aliases: ["protective", "protective life", "protective life insurance company"],
    detectionPatterns: ["policy summary", "annual statement", "ledger", "indexed account"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage summary", "policy information"],
      illustration_ledger: ["policy year", "attained age", "account value", "surrender value"],
      statement_summary: ["annual statement", "statement summary", "account values"],
      charges_table: ["cost of insurance", "monthly deduction", "administrative charge"],
      allocation_table: ["indexed account", "allocation", "participation rate", "cap rate"],
    },
    fieldLabels: SHARED_FIELD_LABELS,
  }),
  symetra: buildProfile({
    key: "symetra",
    name: "Symetra Life Insurance Company",
    aliases: ["symetra", "symetra life", "symetra life insurance company"],
    detectionPatterns: ["policy summary", "current illustrated values", "annual statement"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "illustration summary", "insured information"],
      illustration_ledger: ["policy year", "attained age", "account value", "cash surrender value"],
      statement_summary: ["annual statement", "policy summary", "account value"],
      charges_table: ["cost of insurance", "expense charge", "monthly deduction"],
      allocation_table: ["indexed account", "fixed account", "cap rate", "participation rate", "spread"],
    },
    fieldLabels: SHARED_FIELD_LABELS,
  }),
  john_hancock: buildProfile({
    key: "john_hancock",
    name: "John Hancock Life Insurance Company",
    aliases: ["john hancock", "john hancock life insurance company", "manulife"],
    detectionPatterns: ["in force illustration", "policy detail", "annual statement"],
    pageTypeSignals: {
      illustration_summary: ["policy detail", "policy summary", "coverage information"],
      illustration_ledger: ["policy year", "attained age", "cash value", "death benefit"],
      statement_summary: ["annual statement", "policy summary", "current values"],
      charges_table: ["cost of insurance", "policy fee", "monthly deduction"],
      allocation_table: ["indexed account", "fixed account", "cap rate", "participation rate"],
    },
    fieldLabels: SHARED_FIELD_LABELS,
  }),
  principal: buildProfile({
    key: "principal",
    name: "Principal Life Insurance Company",
    aliases: ["principal", "principal life", "principal life insurance company"],
    detectionPatterns: ["policy summary", "illustration", "annual statement"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage summary", "illustration summary"],
      illustration_ledger: ["policy year", "attained age", "accumulation value", "surrender value"],
      statement_summary: ["annual statement", "policy summary", "value summary"],
      charges_table: ["cost of insurance", "expense charge", "administrative fee"],
      allocation_table: ["indexed account", "cap rate", "participation rate", "allocation"],
    },
    fieldLabels: SHARED_FIELD_LABELS,
  }),
  penn_mutual: buildProfile({
    key: "penn_mutual",
    name: "Penn Mutual Life Insurance Company",
    aliases: ["penn mutual", "the penn mutual life insurance company"],
    detectionPatterns: ["policy summary", "illustration", "annual statement"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage summary", "insured information"],
      illustration_ledger: ["policy year", "attained age", "account value", "cash surrender value"],
      statement_summary: ["annual statement", "policy summary", "policy values"],
      charges_table: ["cost of insurance", "monthly deduction", "policy fee"],
      allocation_table: ["indexed account", "fixed account", "spread", "allocation"],
    },
    fieldLabels: SHARED_FIELD_LABELS,
  }),
};

export function resolveCarrierParsingProfile(carrierName = "", pages = []) {
  const haystack = `${carrierName}\n${pages.slice(0, 2).join("\n")}`.toLowerCase();
  const entries = Object.values(CARRIER_PARSING_PROFILES)
    .map((profile) => {
      let score = 0;
      if (profile.aliases.some((alias) => haystack.includes(alias.toLowerCase()))) score += 3;
      if (profile.detectionPatterns.some((pattern) => haystack.includes(pattern.toLowerCase()))) score += 1;
      return { profile, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return entries[0]?.profile || null;
}
