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

function mergeFieldLabels(overrides = {}) {
  const merged = {};
  Object.entries(SHARED_FIELD_LABELS).forEach(([sectionKey, sectionLabels]) => {
    merged[sectionKey] = {
      ...sectionLabels,
      ...(overrides[sectionKey] || {}),
    };
  });
  return merged;
}

const SHARED_FIELD_LABELS = {
  illustration_summary: {
    policy_number: ["policy number", "contract number", "certificate number", "policy no", "certificate no"],
    issue_date: ["issue date", "policy date", "effective date", "policy effective date", "contract date", "date issued"],
    product_name: ["product name", "plan name", "policy name", "product", "plan"],
    owner_name: ["owner", "owner name", "policy owner", "policyowner"],
    insured_name: ["insured", "insured name", "primary insured"],
    primary_beneficiary_name: ["primary beneficiary", "beneficiary name", "designated beneficiary", "beneficiary"],
    contingent_beneficiary_name: ["contingent beneficiary", "secondary beneficiary", "alternate beneficiary"],
    beneficiary_status: ["beneficiary designation", "beneficiary information", "designated beneficiary", "beneficiary"],
    death_benefit: ["death benefit", "initial death benefit", "specified amount", "face amount", "death benefit amount", "initial specified amount"],
    planned_premium: ["planned premium", "annual premium", "modal planned premium", "target premium", "planned periodic premium", "modal premium", "periodic premium"],
  },
  statement_summary: {
    policy_number: ["policy number", "contract number", "certificate number", "policy no", "certificate no"],
    statement_date: ["statement date", "report date", "statement ending date", "as of", "period ending", "statement period ending", "as of date"],
    owner_name: ["owner", "owner name", "policy owner", "policyowner"],
    insured_name: ["insured", "insured name", "primary insured"],
    primary_beneficiary_name: ["primary beneficiary", "beneficiary name", "designated beneficiary", "beneficiary"],
    contingent_beneficiary_name: ["contingent beneficiary", "secondary beneficiary", "alternate beneficiary"],
    beneficiary_status: ["beneficiary designation", "beneficiary information", "beneficiary"],
    accumulation_value: ["accumulation value", "account value", "policy value", "total accumulation value", "total account value"],
    cash_value: ["cash value", "net cash value"],
    cash_surrender_value: ["cash surrender value", "surrender value", "net cash surrender value", "net surrender value"],
    death_benefit: ["death benefit", "current death benefit", "death benefit amount", "face amount"],
    loan_balance: ["loan balance", "policy loan balance", "indebtedness", "outstanding loan balance", "total loan balance"],
    premium_paid: ["premium paid", "premium received", "planned premium", "premium", "premiums paid ytd"],
    policy_charges_total: ["policy charges", "total charges", "monthly deduction", "annual charges", "visible charges"],
  },
  charges_table: {
    cost_of_insurance: ["cost of insurance", "coi", "insurance charge", "insurance charges", "policy cost of insurance"],
    monthly_deduction: ["monthly deduction", "monthly deductions", "monthly charges"],
    expense_charge: ["expense charge", "expense charges", "premium expense", "premium load", "other charges"],
    admin_fee: ["administrative charge", "administrative fee", "policy fee", "admin fee"],
    rider_charge: ["rider charge", "rider charges", "cost of riders", "rider(s) charges"],
  },
  allocation_table: {
    index_strategy: ["indexed account", "allocation option", "strategy", "interest option", "indexed strategy", "crediting strategy", "index account strategy"],
    allocation_percent: ["allocation percent", "allocation %", "percent allocated", "allocation", "% of accumulation value"],
    cap_rate: ["cap rate", "cap %"],
    participation_rate: ["participation rate", "participation %", "par rate"],
    spread: ["spread", "asset fee spread"],
    crediting_rate: ["crediting rate", "index credit", "declared rate", "credited rate", "interest credit rate"],
    fixed_account_value: ["fixed account", "fixed account value", "declared interest account", "fixed strategy value"],
    indexed_account_value: ["indexed account value", "index account value", "total of index accounts", "indexed strategy value"],
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
    fieldLabels: mergeFieldLabels({
      statement_summary: {
        cash_surrender_value: ["net cash surrender value", "cash surrender value", "surrender value"],
      },
    }),
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
    fieldLabels: mergeFieldLabels({
      statement_summary: {
        statement_date: ["statement date", "report date", "period ending", "statement period ending"],
      },
    }),
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
    fieldLabels: mergeFieldLabels({
      statement_summary: {
        accumulation_value: ["account value", "accumulation value", "policy value"],
      },
    }),
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
    fieldLabels: mergeFieldLabels({
      illustration_summary: {
        death_benefit: ["specified amount", "face amount", "death benefit", "death benefit amount"],
      },
    }),
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
    fieldLabels: mergeFieldLabels({
      statement_summary: {
        statement_date: ["statement date", "statement period ending", "report date", "period ending"],
      },
    }),
  }),
  allianz: buildProfile({
    key: "allianz",
    name: "Allianz Life Insurance Company of North America",
    aliases: ["allianz", "allianz life", "allianz life insurance company of north america"],
    detectionPatterns: ["policy summary", "in force illustration", "annual statement", "indexed account"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage summary", "policy information"],
      illustration_ledger: ["policy year", "attained age", "account value", "net cash surrender value"],
      statement_summary: ["annual statement", "statement summary", "policy summary", "policy values"],
      charges_table: ["cost of insurance", "monthly deduction", "policy fee", "charges"],
      allocation_table: ["indexed account", "allocation", "participation rate", "cap rate", "declared interest"],
    },
    fieldLabels: mergeFieldLabels({
      statement_summary: {
        cash_surrender_value: ["net cash surrender value", "cash surrender value", "surrender value"],
      },
    }),
  }),
  pacific_life: buildProfile({
    key: "pacific_life",
    name: "Pacific Life Insurance Company",
    aliases: ["pacific life", "pacific life insurance company"],
    detectionPatterns: ["policy summary", "annual statement", "in force illustration", "account value"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage summary", "policy information"],
      illustration_ledger: ["policy year", "attained age", "policy value", "cash surrender value"],
      statement_summary: ["annual statement", "policy summary", "policy values", "account value"],
      charges_table: ["cost of insurance", "monthly deduction", "policy fee", "expense charge"],
      allocation_table: ["indexed account", "allocation option", "participation rate", "cap rate"],
    },
    fieldLabels: mergeFieldLabels({
      statement_summary: {
        accumulation_value: ["policy value", "account value", "accumulation value"],
      },
    }),
  }),
  nationwide: buildProfile({
    key: "nationwide",
    name: "Nationwide Life Insurance Company",
    aliases: ["nationwide", "nationwide life", "nationwide life insurance company"],
    detectionPatterns: ["policy summary", "annual statement", "coverage summary", "account summary"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage summary", "policy information"],
      illustration_ledger: ["policy year", "attained age", "account value", "surrender value"],
      statement_summary: ["annual statement", "account summary", "policy summary", "statement date"],
      charges_table: ["cost of insurance", "monthly deduction", "policy charges"],
      allocation_table: ["indexed account", "allocation", "cap rate", "participation rate"],
    },
    fieldLabels: mergeFieldLabels({
      illustration_summary: {
        planned_premium: ["planned premium", "modal premium", "annual premium", "target premium"],
      },
    }),
  }),
  lincoln_financial: buildProfile({
    key: "lincoln_financial",
    name: "Lincoln Financial",
    aliases: ["lincoln financial", "lincoln", "the lincoln national life insurance company", "lincoln national life insurance company"],
    detectionPatterns: ["policy summary", "annual statement", "coverage summary", "account value"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage information", "policy detail"],
      illustration_ledger: ["policy year", "attained age", "cash value", "account value"],
      statement_summary: ["annual statement", "policy summary", "account value", "current values"],
      charges_table: ["cost of insurance", "monthly deduction", "administrative fee", "policy fee"],
      allocation_table: ["indexed account", "fixed account", "allocation", "cap rate"],
    },
    fieldLabels: mergeFieldLabels({
      statement_summary: {
        cash_value: ["cash value", "account value", "policy value"],
      },
    }),
  }),
  transamerica: buildProfile({
    key: "transamerica",
    name: "Transamerica Life Insurance Company",
    aliases: ["transamerica", "transamerica life", "transamerica life insurance company"],
    detectionPatterns: ["policy summary", "annual statement", "in force illustration", "policy values"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage summary", "policy information"],
      illustration_ledger: ["policy year", "attained age", "account value", "cash surrender value"],
      statement_summary: ["annual statement", "policy summary", "policy values", "statement date"],
      charges_table: ["cost of insurance", "monthly deduction", "expense charges", "policy fee"],
      allocation_table: ["indexed account", "allocation", "cap rate", "participation rate", "spread"],
    },
    fieldLabels: mergeFieldLabels({
      illustration_summary: {
        policy_number: ["policy number", "policy no", "contract number", "certificate number"],
      },
    }),
  }),
  north_american: buildProfile({
    key: "north_american",
    name: "North American Company for Life and Health Insurance",
    aliases: ["north american", "north american life", "north american company for life and health insurance"],
    detectionPatterns: ["policy summary", "annual statement", "in force illustration", "coverage summary"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage summary", "policy information"],
      illustration_ledger: ["policy year", "attained age", "accumulation value", "surrender value"],
      statement_summary: ["annual statement", "policy summary", "account summary", "policy values"],
      charges_table: ["cost of insurance", "monthly deduction", "administrative charge", "policy fee"],
      allocation_table: ["indexed account", "allocation", "participation rate", "cap rate", "fixed account"],
    },
    fieldLabels: mergeFieldLabels({
      illustration_summary: {
        death_benefit: ["death benefit", "face amount", "specified amount", "initial specified amount"],
      },
    }),
  }),
  minnesota_life: buildProfile({
    key: "minnesota_life",
    name: "Minnesota Life Insurance Company",
    aliases: ["minnesota life", "securian", "minnesota life insurance company"],
    detectionPatterns: ["policy summary", "annual statement", "coverage detail", "account summary"],
    pageTypeSignals: {
      illustration_summary: ["policy summary", "coverage detail", "policy information"],
      illustration_ledger: ["policy year", "attained age", "account value", "cash surrender value"],
      statement_summary: ["annual statement", "account summary", "policy summary", "period ending"],
      charges_table: ["cost of insurance", "monthly deduction", "policy charges", "administrative charge"],
      allocation_table: ["indexed account", "allocation", "cap rate", "participation rate"],
    },
    fieldLabels: mergeFieldLabels({
      statement_summary: {
        statement_date: ["statement date", "period ending", "statement period ending", "report date"],
      },
    }),
  }),
  corebridge_aig: buildProfile({
    key: "corebridge_aig",
    name: "American General Life Insurance Company",
    aliases: ["american general life insurance company", "corebridge financial", "aig", "agl", "us life"],
    detectionPatterns: ["policy activity summary by month", "your account values and allocation", "external indices performance detail", "monthly guarantee premium"],
    pageTypeSignals: {
      illustration_summary: ["policy detail", "policy summary", "coverage detail", "monthly guarantee premium"],
      illustration_ledger: ["policy year", "attained age", "accumulation value", "cash surrender value"],
      statement_summary: ["annual statement", "policy value summary", "your account values and allocation"],
      charges_table: ["policy cost of insurance", "expense charges", "rider(s) charges", "monthly administration fee"],
      allocation_table: ["index account strategies", "allocation", "cap rate", "participation rate", "declared interest account"],
    },
    fieldLabels: mergeFieldLabels({
      illustration_summary: {
        death_benefit: ["initial specified amount", "death benefit amount", "specified amount", "face amount"],
        planned_premium: ["planned periodic premium", "periodic premium", "planned premium"],
      },
      charges_table: {
        cost_of_insurance: ["policy cost of insurance", "cost of insurance", "insurance charge"],
        expense_charge: ["expense charges", "premium expense charge", "premiums expenses", "expense charge"],
        rider_charge: ["rider(s) charges", "rider charges", "cost of riders"],
        admin_fee: ["monthly administration fee", "administrative charge", "policy fee"],
      },
      allocation_table: {
        index_strategy: ["index account strategies", "index account strategy", "indexed account", "allocation option"],
        allocation_percent: ["allocation", "% of accumulation value", "allocation percent"],
        fixed_account_value: ["declared interest account (dia)", "declared interest account", "fixed account value"],
        indexed_account_value: ["total of index accounts", "indexed account value", "index account value"],
      },
    }),
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
