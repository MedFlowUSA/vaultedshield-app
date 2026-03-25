import { getPropertyValuationProvider } from "../domain/propertyValuation";
import { buildVirtualValuation } from "../domain/propertyValuation";
import { evaluatePropertyEquityPosition as evaluatePropertyEquityPositionFromDomain } from "../domain/propertyValuation";
import { getSupabaseClient } from "./client";
import {
  appendHouseholdScope,
  buildScopedAccessError,
} from "./platformScope";

function getClientOrError() {
  const supabase = getSupabaseClient();
  if (!supabase) return { supabase: null, error: new Error("Supabase not configured") };
  return { supabase, error: null };
}

async function insertRecord(table, payload) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  const { data, error: insertError } = await supabase.from(table).insert(payload).select().single();
  return { data, error: insertError };
}

async function updateRecord(table, id, payload) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  const { data, error: updateError } = await supabase.from(table).update(payload).eq("id", id).select().single();
  return { data, error: updateError };
}

async function listRecords(table, filters = [], options = {}) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };
  let query = supabase.from(table).select(options.select || "*");
  filters.forEach((filter) => {
    query = query[filter.operator || "eq"](filter.column, filter.value);
  });
  if (options.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? false });
  }
  const { data, error: listError } = await query;
  return { data: data || [], error: listError };
}

async function maybeSingleRecord(table, filters = [], options = {}) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  let query = supabase.from(table).select(options.select || "*");
  filters.forEach((filter) => {
    query = query[filter.operator || "eq"](filter.column, filter.value);
  });
  const { data, error: queryError } = await query.maybeSingle();
  return { data: data || null, error: queryError };
}

async function deleteRecords(table, filters = []) {
  const { supabase, error } = getClientOrError();
  if (error) return { error };
  let query = supabase.from(table).delete();
  filters.forEach((filter) => {
    query = query[filter.operator || "eq"](filter.column, filter.value);
  });
  const { error: deleteError } = await query;
  return { error: deleteError };
}

function buildSubjectFacts(property = {}) {
  return {
    id: property.id,
    household_id: property.household_id,
    property_type_key: property.property_type_key,
    property_name: property.property_name,
    property_address: property.property_address,
    street_1: property.street_1,
    street_2: property.street_2,
    city: property.city,
    state: property.state,
    postal_code: property.postal_code,
    county: property.county,
    apn: property.apn,
    beds: property.beds,
    baths: property.baths,
    square_feet: property.square_feet,
    lot_size: property.lot_size,
    year_built: property.year_built,
    occupancy_type: property.occupancy_type,
    last_purchase_price: property.last_purchase_price,
    last_purchase_date: property.last_purchase_date,
  };
}

async function getScopedPropertyRecord(propertyId, scopeOverride = null) {
  return maybeSingleRecord(
    "properties",
    appendHouseholdScope([{ column: "id", value: propertyId }], scopeOverride),
    { select: "*" }
  );
}

export async function updatePropertyAddressFacts(propertyId, updates = {}, scopeOverride = null) {
  if (!propertyId) {
    return { data: null, error: new Error("propertyId is required") };
  }

  const propertyResult = await getScopedPropertyRecord(propertyId, scopeOverride);
  if (propertyResult.error || !propertyResult.data) {
    return {
      data: null,
      error: propertyResult.error || buildScopedAccessError("Property"),
    };
  }

  const payload = {
    property_name: updates.property_name ?? undefined,
    property_address: updates.property_address ?? undefined,
    street_1: updates.street_1 ?? undefined,
    street_2: updates.street_2 ?? undefined,
    city: updates.city ?? undefined,
    state: updates.state ?? undefined,
    postal_code: updates.postal_code ?? undefined,
    county: updates.county ?? undefined,
    apn: updates.apn ?? undefined,
    property_type_key: updates.property_type_key ?? undefined,
    occupancy_type: updates.occupancy_type ?? undefined,
    beds: updates.beds ?? undefined,
    baths: updates.baths ?? undefined,
    square_feet: updates.square_feet ?? undefined,
    lot_size: updates.lot_size ?? undefined,
    year_built: updates.year_built ?? undefined,
    owner_name: updates.owner_name ?? undefined,
    last_purchase_price: updates.last_purchase_price ?? undefined,
    last_purchase_date: updates.last_purchase_date ?? undefined,
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) delete payload[key];
  });

  return updateRecord("properties", propertyId, payload);
}

export async function createPropertyValuation(payload) {
  return insertRecord("property_valuations", {
    household_id: payload.household_id,
    property_id: payload.property_id,
    valuation_date: payload.valuation_date || new Date().toISOString(),
    valuation_status: payload.valuation_status || "draft",
    valuation_method: payload.valuation_method || null,
    low_estimate: payload.low_estimate ?? null,
    midpoint_estimate: payload.midpoint_estimate ?? null,
    high_estimate: payload.high_estimate ?? null,
    confidence_score: payload.confidence_score ?? null,
    confidence_label: payload.confidence_label || null,
    source_summary: payload.source_summary || [],
    adjustment_notes: payload.adjustment_notes || [],
    comps_count: payload.comps_count ?? 0,
    price_per_sqft_estimate: payload.price_per_sqft_estimate ?? null,
    disclaimer_text: payload.disclaimer_text || null,
    metadata: payload.metadata || {},
  });
}

export async function savePropertyComps(propertyId, valuationId, comps = [], householdId = null) {
  if (!propertyId) return { data: [], error: new Error("propertyId is required") };

  const clearResult = await deleteRecords("property_comps", [
    { column: "property_id", value: propertyId },
    ...(valuationId ? [{ column: "valuation_id", value: valuationId }] : []),
  ]);
  if (clearResult.error) return { data: [], error: clearResult.error };

  if (!comps.length) return { data: [], error: null };

  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };
  const rows = comps.map((comp) => ({
    household_id: householdId,
    property_id: propertyId,
    valuation_id: valuationId || null,
    source_name: comp.source_name || null,
    comp_address: comp.comp_address || null,
    city: comp.city || null,
    state: comp.state || null,
    postal_code: comp.postal_code || null,
    distance_miles: comp.distance_miles ?? null,
    sale_price: comp.sale_price ?? null,
    sale_date: comp.sale_date || null,
    beds: comp.beds ?? null,
    baths: comp.baths ?? null,
    square_feet: comp.square_feet ?? null,
    lot_size: comp.lot_size ?? null,
    year_built: comp.year_built ?? null,
    price_per_sqft: comp.price_per_sqft ?? null,
    property_type: comp.property_type || null,
    status: comp.status || null,
    raw_payload: comp.raw_payload || comp,
  }));

  const { data, error: insertError } = await supabase
    .from("property_comps")
    .insert(rows)
    .select();

  return { data: data || [], error: insertError };
}

export async function listPropertyValuations(propertyId, scopeOverride = null) {
  const propertyResult = await getScopedPropertyRecord(propertyId, scopeOverride);
  if (propertyResult.error || !propertyResult.data) {
    return { data: [], error: propertyResult.error || buildScopedAccessError("Property") };
  }

  return listRecords(
    "property_valuations",
    [{ column: "property_id", value: propertyId }],
    { orderBy: "valuation_date" }
  );
}

export async function getLatestPropertyValuation(propertyId, scopeOverride = null) {
  const propertyResult = await getScopedPropertyRecord(propertyId, scopeOverride);
  if (propertyResult.error || !propertyResult.data) {
    return { data: null, error: propertyResult.error || buildScopedAccessError("Property") };
  }

  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  const { data, error: queryError } = await supabase
    .from("property_valuations")
    .select("*")
    .eq("property_id", propertyId)
    .order("valuation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data || null, error: queryError };
}

export async function listPropertyComps(propertyId, valuationId = null, scopeOverride = null) {
  const propertyResult = await getScopedPropertyRecord(propertyId, scopeOverride);
  if (propertyResult.error || !propertyResult.data) {
    return { data: [], error: propertyResult.error || buildScopedAccessError("Property") };
  }

  return listRecords(
    "property_comps",
    [
      { column: "property_id", value: propertyId },
      ...(valuationId ? [{ column: "valuation_id", value: valuationId }] : []),
    ],
    { orderBy: "sale_date" }
  );
}

export async function runPropertyVirtualValuation(propertyId, scopeOverride = null) {
  if (!propertyId) {
    return { data: null, error: new Error("propertyId is required") };
  }

  const propertyResult = await getScopedPropertyRecord(propertyId, scopeOverride);
  if (propertyResult.error || !propertyResult.data) {
    return {
      data: null,
      error: propertyResult.error || buildScopedAccessError("Property"),
    };
  }

  const subject = buildSubjectFacts(propertyResult.data);
  const provider = getPropertyValuationProvider();
  const providerResult = await provider.runValuation(subject);
  const blendedValuation = buildVirtualValuation(providerResult.subject || subject, providerResult);
  const analyzedCompMap = new Map(
    ((blendedValuation.metadata?.analyzed_comps || []) || []).map((comp) => [
      `${comp.comp_address || ""}::${comp.sale_date || ""}`,
      comp,
    ])
  );

  const valuationResult = await createPropertyValuation({
    household_id: propertyResult.data.household_id,
    property_id: propertyResult.data.id,
    valuation_status: blendedValuation.valuation_status,
    valuation_method: blendedValuation.valuation_method,
    low_estimate: blendedValuation.low_estimate,
    midpoint_estimate: blendedValuation.midpoint_estimate,
    high_estimate: blendedValuation.high_estimate,
    confidence_score: blendedValuation.confidence_score,
    confidence_label: blendedValuation.confidence_label,
    source_summary: blendedValuation.source_summary,
    adjustment_notes: blendedValuation.adjustment_notes,
    comps_count: blendedValuation.comps_count,
    price_per_sqft_estimate: blendedValuation.price_per_sqft_estimate,
    disclaimer_text: blendedValuation.disclaimer_text,
    metadata: {
      ...(blendedValuation.metadata || {}),
      provider_key: provider.provider_key,
      subject,
    },
  });

  if (valuationResult.error || !valuationResult.data?.id) {
    return {
      data: null,
      error: valuationResult.error || new Error("Property valuation could not be saved"),
    };
  }

  const compsResult = await savePropertyComps(
    propertyResult.data.id,
    valuationResult.data.id,
    (providerResult.comps || []).map((comp) => {
      const analyzedComp =
        analyzedCompMap.get(`${comp.comp_address || ""}::${comp.sale_date || ""}`) || null;
      return {
        ...comp,
        raw_payload: {
          ...comp.raw_payload,
          ...(analyzedComp || {}),
        },
      };
    }),
    propertyResult.data.household_id
  );
  if (compsResult.error) {
    return { data: null, error: compsResult.error };
  }

  return {
    data: {
      property: propertyResult.data,
      valuation: valuationResult.data,
      comps: compsResult.data || [],
      providerResult,
    },
    error: null,
  };
}

export function evaluatePropertyEquityPosition(propertyBundle = {}) {
  return {
    data: evaluatePropertyEquityPositionFromDomain(propertyBundle),
    error: null,
  };
}
