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

  if (strategyName && strategyName !== "Not found") {
    hits.push({
      carrier_key: carrierProfile?.key || "",
      product_family: productProfile?.key || "unknown_or_detected",
      strategy_name: strategyName,
      term_type: "strategy_name",
      term_value: strategyName,
      effective_date: latestStatement?.fields?.statement_date?.value || null,
      expiration_date: null,
      source: "extracted_packet",
      confidence: latestStatement?.fields?.index_strategy?.confidence || "medium",
    });
  }

  if (capRate && capRate !== "Not found") {
    hits.push({
      carrier_key: carrierProfile?.key || "",
      product_family: productProfile?.key || "unknown_or_detected",
      strategy_name: strategyName || "unknown_strategy",
      term_type: "cap_rate",
      term_value: capRate,
      effective_date: latestStatement?.fields?.statement_date?.value || null,
      expiration_date: null,
      source: "extracted_packet",
      confidence: latestStatement?.fields?.cap_rate?.confidence || "medium",
    });
  }

  if (allocationPercent && allocationPercent !== "Not found") {
    hits.push({
      carrier_key: carrierProfile?.key || "",
      product_family: productProfile?.key || "unknown_or_detected",
      strategy_name: strategyName || "unknown_strategy",
      term_type: "allocation_percent",
      term_value: allocationPercent,
      effective_date: latestStatement?.fields?.statement_date?.value || null,
      expiration_date: null,
      source: "extracted_packet",
      confidence: latestStatement?.fields?.allocation_percent?.confidence || "medium",
    });
  }

  return hits;
}
