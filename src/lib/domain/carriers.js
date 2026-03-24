export const CARRIER_REGISTRY = {
  corebridge_aig: {
    key: "corebridge_aig",
    display_name: "American General Life Insurance Company",
    aliases: [
      "american general life insurance company",
      "corebridge financial",
      "agl",
      "us life",
    ],
    known_document_patterns: [
      "policy activity summary by month",
      "your account values and allocation",
      "external indices performance detail",
      "monthly guarantee premium",
    ],
    known_charge_labels: [
      "policy cost of insurance",
      "expense charges",
      "rider(s) charges",
      "monthly administration fee",
    ],
    known_strategy_labels: [
      "index account strategies",
      "cap rate",
      "participation rate",
      "declared interest account (dia)",
    ],
    known_products: ["qol max accumulator+"],
  },
  allianz: {
    key: "allianz",
    display_name: "Allianz Life Insurance Company of North America",
    aliases: ["allianz", "allianz life insurance company of north america"],
    known_document_patterns: [],
    known_charge_labels: [],
    known_strategy_labels: [],
    known_products: [],
  },
  pacific_life: {
    key: "pacific_life",
    display_name: "Pacific Life Insurance Company",
    aliases: ["pacific life", "pacific life insurance company"],
    known_document_patterns: [],
    known_charge_labels: [],
    known_strategy_labels: [],
    known_products: [],
  },
  nationwide: {
    key: "nationwide",
    display_name: "Nationwide Life Insurance Company",
    aliases: ["nationwide", "nationwide life insurance company"],
    known_document_patterns: [],
    known_charge_labels: [],
    known_strategy_labels: [],
    known_products: [],
  },
  lincoln_financial: {
    key: "lincoln_financial",
    display_name: "Lincoln Financial",
    aliases: ["lincoln financial", "the lincoln national life insurance company", "lincoln"],
    known_document_patterns: [],
    known_charge_labels: [],
    known_strategy_labels: [],
    known_products: [],
  },
  transamerica: {
    key: "transamerica",
    display_name: "Transamerica Life Insurance Company",
    aliases: ["transamerica", "transamerica life insurance company"],
    known_document_patterns: [],
    known_charge_labels: [],
    known_strategy_labels: [],
    known_products: [],
  },
  north_american: {
    key: "north_american",
    display_name: "North American Company for Life and Health Insurance",
    aliases: ["north american", "north american company for life and health insurance"],
    known_document_patterns: [],
    known_charge_labels: [],
    known_strategy_labels: [],
    known_products: [],
  },
  protective: {
    key: "protective",
    display_name: "Protective Life Insurance Company",
    aliases: ["protective", "protective life", "protective life insurance company"],
    known_document_patterns: ["annual statement", "policy summary", "ledger", "indexed account"],
    known_charge_labels: ["cost of insurance", "monthly deduction", "administrative charge"],
    known_strategy_labels: ["cap rate", "participation rate", "indexed account"],
    known_products: [],
  },
  symetra: {
    key: "symetra",
    display_name: "Symetra Life Insurance Company",
    aliases: ["symetra", "symetra life", "symetra life insurance company"],
    known_document_patterns: ["annual statement", "policy summary", "current illustrated values"],
    known_charge_labels: ["cost of insurance", "expense charge", "monthly deduction"],
    known_strategy_labels: ["cap rate", "participation rate", "spread"],
    known_products: [],
  },
  john_hancock: {
    key: "john_hancock",
    display_name: "John Hancock Life Insurance Company",
    aliases: ["john hancock", "john hancock life insurance company", "manulife"],
    known_document_patterns: ["annual statement", "policy detail", "in force illustration"],
    known_charge_labels: ["cost of insurance", "policy fee", "monthly deduction"],
    known_strategy_labels: ["indexed account", "fixed account", "cap rate"],
    known_products: [],
  },
  principal: {
    key: "principal",
    display_name: "Principal Life Insurance Company",
    aliases: ["principal", "principal life", "principal life insurance company"],
    known_document_patterns: ["annual statement", "policy summary", "illustration"],
    known_charge_labels: ["cost of insurance", "expense charge", "administrative fee"],
    known_strategy_labels: ["indexed account", "participation rate", "cap rate"],
    known_products: [],
  },
  penn_mutual: {
    key: "penn_mutual",
    display_name: "Penn Mutual Life Insurance Company",
    aliases: ["penn mutual", "the penn mutual life insurance company"],
    known_document_patterns: ["annual statement", "policy summary", "illustration"],
    known_charge_labels: ["cost of insurance", "monthly deduction", "policy fee"],
    known_strategy_labels: ["indexed account", "fixed account", "spread"],
    known_products: [],
  },
  minnesota_life: {
    key: "minnesota_life",
    display_name: "Minnesota Life Insurance Company",
    aliases: ["minnesota life", "minnesota life insurance company"],
    known_document_patterns: [],
    known_charge_labels: [],
    known_strategy_labels: [],
    known_products: [],
  },
  fg_life: {
    key: "fg_life",
    display_name: "F&G Life Insurance Company",
    aliases: [
      "f&g",
      "f&g life",
      "f&g life insurance company",
      "fidelity & guaranty",
      "fidelity & guaranty life",
      "fidelity & guaranty life insurance company",
    ],
    known_document_patterns: [
      "annual statement",
      "policy detail",
      "in force ledger",
      "allocation detail",
      "indexed account",
    ],
    known_charge_labels: [
      "monthly deduction",
      "expense charge",
      "cost of insurance",
      "policy loan balance",
    ],
    known_strategy_labels: [
      "indexed account",
      "fixed account",
      "cap rate",
      "participation rate",
      "spread",
      "crediting rate",
    ],
    known_products: ["pathsetter"],
  },
};

export function resolveCarrierProfile(carrierName = "", pages = []) {
  const haystack = `${carrierName}\n${pages.slice(0, 2).join("\n")}`.toLowerCase();
  const profiles = Object.values(CARRIER_REGISTRY);
  const ranked = profiles
    .map((profile) => {
      let score = 0;

      if (profile.aliases.some((alias) => haystack.includes(alias.toLowerCase()))) {
        score += 3;
      }
      if (profile.known_document_patterns.some((pattern) => haystack.includes(pattern.toLowerCase()))) {
        score += 1;
      }
      if (profile.known_products.some((product) => haystack.includes(product.toLowerCase()))) {
        score += 1;
      }

      return { profile, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.profile || null;
}
