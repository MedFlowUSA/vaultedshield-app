function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function _normalizeText(value = "") {
  return String(value || "").trim();
}

function safeFetchLog(stage, detail = {}) {
  if (!import.meta.env.DEV || typeof console === "undefined") return;
  console.info("[VaultedShield] property real comp provider", { stage, ...detail });
}

export function getRealPropertyValuationProviderDiagnostics() {
  const endpoint =
    import.meta.env.VITE_PROPERTY_VALUATION_API_URL ||
    (typeof window !== "undefined" ? "/api/property-comps" : "");
  const providerKind = (import.meta.env.VITE_PROPERTY_VALUATION_PROVIDER || "attom_proxy").trim().toLowerCase();
  const allowFallback = String(import.meta.env.VITE_PROPERTY_VALUATION_ALLOW_SIMULATED_FALLBACK || "true").toLowerCase() !== "false";

  return {
    enabled: Boolean(endpoint),
    endpoint,
    providerKind,
    allowSimulatedFallback: allowFallback,
    endpointMode: endpoint.startsWith("/") ? "same_origin_proxy" : endpoint ? "external_proxy" : "disabled",
  };
}

function classifyOfficialDataQuality(sourceCount = 0, compCount = 0) {
  if (compCount >= 3 || (compCount >= 2 && sourceCount >= 1)) return "strong";
  if (compCount >= 1 || sourceCount >= 1) return "limited";
  return "unavailable";
}

function buildRequestPayload(subject = {}) {
  return {
    address: subject.street_1 || subject.property_address || "",
    city: subject.city || "",
    state: subject.state || "",
    postalCode: subject.postal_code || "",
    county: subject.county || "",
    propertyType: subject.property_type_key || subject.property_type || "",
    beds: toNumber(subject.beds),
    baths: toNumber(subject.baths),
    squareFeet: toNumber(subject.square_feet),
    lotSize: toNumber(subject.lot_size),
    yearBuilt: toNumber(subject.year_built),
    lastPurchasePrice: toNumber(subject.last_purchase_price),
    lastPurchaseDate: subject.last_purchase_date || null,
    subject,
  };
}

function normalizeCompAddress(raw = {}) {
  return (
    raw.comp_address ||
    raw.address ||
    raw.fullAddress ||
    raw.address_line ||
    raw.line ||
    [
      raw.address1 || raw.street || raw.streetAddress,
      [raw.city, raw.state, raw.zip || raw.postalCode || raw.postal_code].filter(Boolean).join(", "),
    ]
      .filter(Boolean)
      .join(", ")
  );
}

function normalizeComp(raw = {}, index = 0, subject = {}) {
  const address = normalizeCompAddress(raw);
  const city = raw.city || raw.address?.city || subject.city || null;
  const state = raw.state || raw.address?.state || subject.state || null;
  const postalCode = raw.postal_code || raw.postalCode || raw.zip || raw.address?.zip || subject.postal_code || null;
  const distanceMiles =
    toNumber(raw.distance_miles) ??
    toNumber(raw.distanceMiles) ??
    toNumber(raw.miles) ??
    toNumber(raw.distance);
  const salePrice =
    toNumber(raw.sale_price) ??
    toNumber(raw.salePrice) ??
    toNumber(raw.closePrice) ??
    toNumber(raw.lastSalePrice) ??
    toNumber(raw.price);
  const saleDate = raw.sale_date || raw.saleDate || raw.closeDate || raw.lastSaleDate || null;
  const squareFeet = toNumber(raw.square_feet) ?? toNumber(raw.squareFeet) ?? toNumber(raw.livingArea);
  const lotSize = toNumber(raw.lot_size) ?? toNumber(raw.lotSize);
  const beds = toNumber(raw.beds) ?? toNumber(raw.bedrooms);
  const baths = toNumber(raw.baths) ?? toNumber(raw.bathrooms);
  const yearBuilt = toNumber(raw.year_built) ?? toNumber(raw.yearBuilt);
  const pricePerSqft =
    toNumber(raw.price_per_sqft) ??
    toNumber(raw.pricePerSqft) ??
    (salePrice && squareFeet ? salePrice / squareFeet : null);

  return {
    source_name: raw.source_name || raw.sourceName || "Official comparable sale",
    comp_address: address || `Comparable ${index + 1}`,
    city,
    state,
    postal_code: postalCode,
    distance_miles: distanceMiles,
    sale_price: salePrice,
    sale_date: saleDate,
    beds,
    baths,
    square_feet: squareFeet,
    lot_size: lotSize,
    year_built: yearBuilt,
    price_per_sqft: pricePerSqft ? Number(pricePerSqft.toFixed(2)) : null,
    property_type: raw.property_type || raw.propertyType || subject.property_type_key || null,
    status: raw.status || "sold",
    raw_payload: raw,
  };
}

function normalizeSource(raw = {}, fallbackName = "Official valuation source") {
  const estimate =
    toNumber(raw.estimate) ??
    toNumber(raw.value) ??
    toNumber(raw.amount) ??
    toNumber(raw.avm) ??
    toNumber(raw.price);
  if (!Number.isFinite(estimate)) return null;

  return {
    source_name: raw.source_name || raw.sourceName || raw.label || fallbackName,
    estimate,
    confidence: Math.min(0.74, Math.max(0.28, toNumber(raw.confidence, 0.52))),
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    official_source: true,
    raw_payload: raw,
  };
}

function pickComparableArray(payload = {}) {
  return (
    payload.comps ||
    payload.comparables ||
    payload.saleComparables ||
    payload.salesComparables ||
    payload.data?.comps ||
    payload.data?.comparables ||
    payload.result?.comps ||
    payload.result?.comparables ||
    payload.property?.comps ||
    []
  );
}

function pickSourceArray(payload = {}) {
  const explicitSources =
    payload.sources ||
    payload.valuationSources ||
    payload.data?.sources ||
    payload.result?.sources ||
    [];
  if (Array.isArray(explicitSources) && explicitSources.length > 0) return explicitSources;

  const avmCandidates = [
    payload.avm,
    payload.valuation,
    payload.estimate,
    payload.data?.valuation,
    payload.result?.valuation,
  ].filter(Boolean);
  return avmCandidates;
}

function normalizeProviderPayload(payload = {}, subject = {}, providerKind = "attom_proxy") {
  const rawComps = Array.isArray(pickComparableArray(payload)) ? pickComparableArray(payload) : [];
  const rawSources = Array.isArray(pickSourceArray(payload)) ? pickSourceArray(payload) : [];
  const comps = rawComps.map((comp, index) => normalizeComp(comp, index, subject)).filter((comp) => Number.isFinite(comp.sale_price));
  const sources = rawSources.map((source) => normalizeSource(source)).filter(Boolean);

  return {
    subject: {
      ...subject,
      ...(payload.subject || {}),
    },
    sources,
    comps,
    metadata: {
      provider_version: providerKind,
      comp_pool_size: rawComps.length,
      selected_comp_count: comps.length,
      official_signal_count: comps.length + sources.length,
      official_data_quality: classifyOfficialDataQuality(sources.length, comps.length),
      comp_data_origin: "official_api",
      provider_response_shape: Array.isArray(rawComps) ? "comparables_array" : "unknown",
      provider_payload_keys: Object.keys(payload || {}),
      official_market_signals: payload.marketContext || payload.market_context || null,
      market_profile: payload.marketProfile || payload.market_profile || null,
      upstream_provider: providerKind,
    },
  };
}

export async function runRealPropertyValuationProvider(subject = {}) {
  const diagnostics = getRealPropertyValuationProviderDiagnostics();
  if (!diagnostics.enabled) {
    throw new Error("Real property valuation endpoint is not configured.");
  }

  const requestPayload = buildRequestPayload(subject);
  safeFetchLog("request_started", {
    providerKind: diagnostics.providerKind,
    endpoint: diagnostics.endpoint,
    address: requestPayload.address,
    city: requestPayload.city,
    state: requestPayload.state,
  });

  const response = await fetch(diagnostics.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      provider: diagnostics.providerKind,
      subject: requestPayload,
    }),
  });

  if (!response.ok) {
    let errorPayload = null;
    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = null;
    }
    const message =
      errorPayload?.message ||
      errorPayload?.details?.message ||
      errorPayload?.error ||
      `Real comp endpoint returned ${response.status}`;
    const error = new Error(message);
    error.providerStatus = response.status;
    error.providerCode = errorPayload?.error || "real_comp_endpoint_failed";
    error.providerDetails = errorPayload?.details || null;
    throw error;
  }

  const payload = await response.json();
  const normalized = normalizeProviderPayload(payload, subject, diagnostics.providerKind);
  safeFetchLog("request_succeeded", {
      providerKind: diagnostics.providerKind,
      compCount: normalized.comps.length,
      sourceCount: normalized.sources.length,
      officialDataQuality: normalized.metadata?.official_data_quality,
    });

  if (!normalized.comps.length && !normalized.sources.length) {
    throw new Error("Real comp endpoint returned no usable valuation signals.");
  }

  normalized.metadata = {
    ...(normalized.metadata || {}),
    requested_provider: diagnostics.providerKind,
    attempted_endpoint: diagnostics.endpoint,
    endpoint_mode: diagnostics.endpointMode,
  };

  return normalized;
}
