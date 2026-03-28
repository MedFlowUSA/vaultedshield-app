function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildAddress2(subject = {}) {
  return [subject.city, subject.state, subject.postalCode || subject.postal_code]
    .filter(Boolean)
    .join(", ");
}

function createSearchParams(subject = {}) {
  const params = new URLSearchParams();
  const address1 = subject.address || subject.street_1 || subject.property_address || "";
  const address2 = buildAddress2(subject);

  if (address1) params.set("address1", address1);
  if (address2) params.set("address2", address2);

  const radius = process.env.ATTOM_DEFAULT_COMP_RADIUS_MILES || "1.5";
  params.set("radius", radius);

  if (subject.propertyType) {
    params.set("propertyType", String(subject.propertyType));
  }

  return params;
}

function getPathName(path = []) {
  return path.map((segment) => String(segment)).join(".");
}

function looksLikeComparable(path, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const pathName = getPathName(path).toLowerCase();
  const hasAddress =
    value.comp_address ||
    value.address ||
    value.fullAddress ||
    value._StreetAddress ||
    value.StreetAddress ||
    value.AddressLine1 ||
    value.Line1;
  const hasSaleSignal =
    value.sale_price ||
    value.salePrice ||
    value.PropertySalesAmount ||
    value._Amount ||
    value.closePrice ||
    value.lastSalePrice;

  return Boolean(hasAddress && hasSaleSignal) || pathName.includes("compar");
}

function normalizeComparable(value = {}) {
  const address =
    value.comp_address ||
    value.address ||
    value.fullAddress ||
    value._StreetAddress ||
    value.StreetAddress ||
    value.AddressLine1 ||
    value.Line1 ||
    null;

  const salePrice =
    toNumber(value.sale_price) ??
    toNumber(value.salePrice) ??
    toNumber(value.PropertySalesAmount) ??
    toNumber(value._Amount) ??
    toNumber(value.closePrice) ??
    toNumber(value.lastSalePrice);

  return {
    source_name: value.source_name || value.sourceName || "ATTOM comparable sale",
    comp_address: address,
    city: value.city || value._City || value.City || null,
    state: value.state || value._State || value.State || null,
    postal_code: value.postal_code || value.postalCode || value._PostalCode || value.Zip || null,
    distance_miles: toNumber(value.distance_miles) ?? toNumber(value.distanceMiles) ?? toNumber(value.Distance),
    sale_price: salePrice,
    sale_date:
      value.sale_date ||
      value.saleDate ||
      value._Date ||
      value.closeDate ||
      value.lastSaleDate ||
      null,
    beds: toNumber(value.beds) ?? toNumber(value.TotalBedroomCount) ?? toNumber(value.bedrooms),
    baths:
      toNumber(value.baths) ??
      toNumber(value.TotalBathroomCountDq_ext) ??
      toNumber(value.TotalBathroomCount) ??
      toNumber(value.bathrooms),
    square_feet:
      toNumber(value.square_feet) ??
      toNumber(value.squareFeet) ??
      toNumber(value.SquareFeetCount) ??
      toNumber(value.livingArea),
    lot_size: toNumber(value.lot_size) ?? toNumber(value.LotSquareFeetCount) ?? toNumber(value.lotSize),
    year_built:
      toNumber(value.year_built) ??
      toNumber(value.PropertyStructureBuiltYear) ??
      toNumber(value.yearBuilt),
    price_per_sqft:
      toNumber(value.price_per_sqft) ??
      toNumber(value.pricePerSqft) ??
      (salePrice && (toNumber(value.square_feet) ?? toNumber(value.squareFeet) ?? toNumber(value.SquareFeetCount))
        ? salePrice / (toNumber(value.square_feet) ?? toNumber(value.squareFeet) ?? toNumber(value.SquareFeetCount))
        : null),
    property_type:
      value.property_type ||
      value.propertyType ||
      value.StandardUseDescription_ext ||
      value.StandardUseCode_ext ||
      null,
    status: value.status || "sold",
    raw_payload: value,
  };
}

function collectComparables(value, path = [], results = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectComparables(item, [...path, index], results));
    return results;
  }

  if (!value || typeof value !== "object") return results;

  if (looksLikeComparable(path, value)) {
    results.push({ path: getPathName(path), comparable: normalizeComparable(value) });
  }

  Object.entries(value).forEach(([key, nested]) => {
    collectComparables(nested, [...path, key], results);
  });

  return results;
}

function normalizeAttomResponse(payload = {}) {
  const comparableCandidates = collectComparables(payload);
  const preferred = comparableCandidates.filter((entry) => entry.path.toLowerCase().includes("compar"));
  const selected = (preferred.length > 0 ? preferred : comparableCandidates)
    .map((entry) => entry.comparable)
    .filter((comp) => comp.comp_address && Number.isFinite(comp.sale_price));

  return {
    provider: "attom_proxy",
    comparables: selected,
    sources: [],
    metadata: {
      upstream_record_count: selected.length,
      upstream_payload_keys: Object.keys(payload || {}),
    },
    raw: payload,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  const apiKey = process.env.ATTOM_API_KEY || "";
  if (!apiKey) {
    return sendJson(res, 503, {
      error: "attom_api_key_missing",
      message: "ATTOM_API_KEY is not configured on the server.",
    });
  }

  const body = await readRequestBody(req);
  const subject = body?.subject || {};
  const params = createSearchParams(subject);
  const baseUrl = process.env.ATTOM_BASE_URL || "https://api.gateway.attomdata.com/propertyapi/v1.0.0";
  const path = process.env.ATTOM_SALES_COMPARABLES_PATH || "/salescomparables";
  const endpoint = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}?${params.toString()}`;

  try {
    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        APIKey: apiKey,
      },
    });

    const text = await upstream.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw_text: text };
    }

    if (!upstream.ok) {
      return sendJson(res, upstream.status, {
        error: "attom_request_failed",
        message: "ATTOM comparable-sale request failed.",
        details: payload,
      });
    }

    const normalized = normalizeAttomResponse(payload);
    return sendJson(res, 200, normalized);
  } catch (error) {
    return sendJson(res, 500, {
      error: "attom_proxy_failed",
      message: "Comparable-sale proxy request failed.",
      details: error?.message || "Unknown proxy failure",
    });
  }
}
