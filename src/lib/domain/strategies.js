export const STRATEGY_REFERENCE_SEED = [
  {
    carrier_key: "corebridge_aig",
    product_family: "qol_max_accumulator_plus",
    strategy_name: "S&P 500 High Cap Rate Index Account",
    term_type: "cap_rate",
    term_value: "11.5%",
    effective_date: null,
    expiration_date: null,
    source: "reference_seed",
    confidence: "medium",
  },
  {
    carrier_key: "fg_life",
    product_family: "pathsetter",
    strategy_name: "S&P 500 Point-to-Point",
    term_type: "strategy_name",
    term_value: "S&P 500 Point-to-Point",
    effective_date: null,
    expiration_date: null,
    source: "reference_seed",
    confidence: "medium",
  },
  {
    carrier_key: "protective",
    product_family: "unknown_or_detected",
    strategy_name: "Indexed Account",
    term_type: "strategy_name",
    term_value: "Indexed Account",
    effective_date: null,
    expiration_date: null,
    source: "reference_seed",
    confidence: "low",
  },
  {
    carrier_key: "symetra",
    product_family: "unknown_or_detected",
    strategy_name: "Fixed Account",
    term_type: "strategy_name",
    term_value: "Fixed Account",
    effective_date: null,
    expiration_date: null,
    source: "reference_seed",
    confidence: "low",
  },
];

export function buildStrategyReferenceHits({
  carrierProfile,
  productProfile,
  latestStatement,
}) {
  const hits = [];

  const strategyName = latestStatement?.fields?.index_strategy?.display_value;
  const capRate = latestStatement?.fields?.cap_rate?.display_value;
  const allocationPercent = latestStatement?.fields?.allocation_percent?.display_value;
  const participationRate = latestStatement?.fields?.participation_rate?.display_value;
  const spread = latestStatement?.fields?.spread?.display_value;
  const creditingRate = latestStatement?.fields?.crediting_rate?.display_value;
  const fixedAccountValue = latestStatement?.fields?.fixed_account_value?.display_value;
  const indexedAccountValue = latestStatement?.fields?.indexed_account_value?.display_value;
  const effectiveDate = latestStatement?.fields?.statement_date?.value || null;
  const carrierKey = carrierProfile?.key || "";
  const productFamily = productProfile?.key || "unknown_or_detected";
  const visibleTerms = [
    {
      value: strategyName,
      term_type: "strategy_name",
      confidence: latestStatement?.fields?.index_strategy?.confidence || "medium",
      strategy_name: strategyName || "unknown_strategy",
    },
    {
      value: capRate,
      term_type: "cap_rate",
      confidence: latestStatement?.fields?.cap_rate?.confidence || "medium",
      strategy_name: strategyName || "unknown_strategy",
    },
    {
      value: allocationPercent,
      term_type: "allocation_percent",
      confidence: latestStatement?.fields?.allocation_percent?.confidence || "medium",
      strategy_name: strategyName || "unknown_strategy",
    },
    {
      value: participationRate,
      term_type: "participation_rate",
      confidence: latestStatement?.fields?.participation_rate?.confidence || "medium",
      strategy_name: strategyName || "unknown_strategy",
    },
    {
      value: spread,
      term_type: "spread",
      confidence: latestStatement?.fields?.spread?.confidence || "medium",
      strategy_name: strategyName || "unknown_strategy",
    },
    {
      value: creditingRate,
      term_type: "crediting_rate",
      confidence: latestStatement?.fields?.crediting_rate?.confidence || "medium",
      strategy_name: strategyName || "unknown_strategy",
    },
    {
      value: fixedAccountValue,
      term_type: "fixed_account_value",
      confidence: latestStatement?.fields?.fixed_account_value?.confidence || "low",
      strategy_name: "fixed_account",
    },
    {
      value: indexedAccountValue,
      term_type: "indexed_account_value",
      confidence: latestStatement?.fields?.indexed_account_value?.confidence || "low",
      strategy_name: strategyName || "indexed_account",
    },
  ];

  visibleTerms.forEach((term) => {
    if (!term.value || term.value === "Not found") return;
    hits.push({
      carrier_key: carrierKey,
      product_family: productFamily,
      strategy_name: term.strategy_name,
      term_type: term.term_type,
      term_value: term.value,
      effective_date: effectiveDate,
      expiration_date: null,
      source: "extracted_packet",
      confidence: term.confidence,
    });
  });

  STRATEGY_REFERENCE_SEED.forEach((seed) => {
    if (seed.carrier_key && carrierKey && seed.carrier_key !== carrierKey) return;
    if (
      seed.product_family &&
      seed.product_family !== "unknown_or_detected" &&
      productFamily &&
      seed.product_family !== productFamily
    ) {
      return;
    }
    if (
      strategyName &&
      seed.term_type === "strategy_name" &&
      String(seed.term_value || "").toLowerCase() === String(strategyName).toLowerCase()
    ) {
      hits.push({
        ...seed,
        effective_date: effectiveDate,
        source: "reference_seed_match",
      });
    }
  });

  return hits.filter((hit, index, collection) => {
    const key = [
      hit.carrier_key,
      hit.product_family,
      hit.strategy_name,
      hit.term_type,
      hit.term_value,
      hit.source,
    ].join("|");
    return collection.findIndex((candidate) => [
      candidate.carrier_key,
      candidate.product_family,
      candidate.strategy_name,
      candidate.term_type,
      candidate.term_value,
      candidate.source,
    ].join("|") === key) === index;
  });
}
