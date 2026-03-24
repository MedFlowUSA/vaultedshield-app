export const PRODUCT_REGISTRY = {
  "qol max accumulator+": {
    key: "qol_max_accumulator_plus",
    display_name: "QoL Max Accumulator+",
    carrier_key: "corebridge_aig",
    product_type: "iul",
    known_strategies: [
      "S&P 500 High Cap Rate Index Account",
      "Declared Interest Account (DIA)",
    ],
    known_riders: [],
    notes: "Corebridge / AIG fixed index universal life product family.",
  },
  pathsetter: {
    key: "pathsetter",
    display_name: "PathSetter",
    carrier_key: "fg_life",
    product_type: "iul",
    known_strategies: [
      "Indexed Account",
      "Fixed Account",
    ],
    known_riders: [],
    notes: "F&G indexed universal life product family built around permanent death benefit coverage plus account-value accumulation tied to declared and indexed crediting options.",
  },
};

export function resolveProductProfile(productName = "", carrierProfile = null) {
  const normalized = String(productName || "").trim().toLowerCase();
  if (!normalized) return null;

  const product = PRODUCT_REGISTRY[normalized] || null;
  if (!product) return null;
  if (carrierProfile && product.carrier_key !== carrierProfile.key) return null;
  return product;
}
