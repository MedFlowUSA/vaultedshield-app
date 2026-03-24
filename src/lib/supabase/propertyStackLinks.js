import { getSupabaseClient } from "./client";
import { getAssetDetailBundle } from "./platformData";
import { evaluatePropertyEquityPosition } from "../domain/propertyValuation";

function getClientOrError() {
  const supabase = getSupabaseClient();
  if (!supabase) return { supabase: null, error: new Error("Supabase not configured") };
  return { supabase, error: null };
}

async function updateRecord(table, id, payload) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  const { data, error: updateError } = await supabase
    .from(table)
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  return { data, error: updateError };
}

async function deleteRecord(table, id) {
  const { supabase, error } = getClientOrError();
  if (error) return { error };
  const { error: deleteError } = await supabase.from(table).delete().eq("id", id);
  return { error: deleteError };
}

async function listLinkRowsForPrimaryDemotion(table, propertyId, excludeLinkId) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };
  let query = supabase
    .from(table)
    .select("id")
    .eq("property_id", propertyId)
    .eq("is_primary", true);

  if (excludeLinkId) {
    query = query.neq("id", excludeLinkId);
  }

  const { data, error: queryError } = await query;
  return { data: data || [], error: queryError };
}

async function demoteOtherPrimaryLinks(table, propertyId, excludeLinkId) {
  const existingPrimaryLinksResult = await listLinkRowsForPrimaryDemotion(
    table,
    propertyId,
    excludeLinkId
  );
  if (existingPrimaryLinksResult.error) {
    return { error: existingPrimaryLinksResult.error };
  }

  const idsToDemote = (existingPrimaryLinksResult.data || []).map((row) => row.id);
  if (idsToDemote.length === 0) {
    return { error: null };
  }

  const { supabase, error } = getClientOrError();
  if (error) return { error };
  const { error: updateError } = await supabase
    .from(table)
    .update({ is_primary: false })
    .in("id", idsToDemote);

  return { error: updateError };
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

async function insertRecord(table, payload) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  const { data, error: insertError } = await supabase.from(table).insert(payload).select().single();
  return { data, error: insertError };
}

async function upsertRecord(table, payload, onConflict) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  const { data, error: upsertError } = await supabase
    .from(table)
    .upsert(payload, { onConflict })
    .select()
    .single();
  return { data, error: upsertError };
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

async function getLatestPropertyValuationRecord(propertyId) {
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

export function getPropertyStackLinkageStatus({
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
}) {
  const mortgageCount = linkedMortgages.length;
  const homeownersCount = linkedHomeownersPolicies.length;

  if (mortgageCount > 0 && homeownersCount > 0) return "complete_property_stack";
  if (mortgageCount > 0) return "mortgage_and_property_missing_homeowners";
  if (homeownersCount > 0) return "homeowners_and_property_missing_mortgage";
  return "property_only";
}

export function getMortgageLinkageStatus({ linkedProperties = [] }) {
  return linkedProperties.length > 0 ? "linked_to_property" : "mortgage_without_property";
}

export function getHomeownersLinkageStatus({ linkedProperties = [] }) {
  return linkedProperties.length > 0 ? "linked_to_property" : "homeowners_without_property";
}

export async function linkMortgageToProperty(propertyId, mortgageLoanId, options = {}) {
  if (!propertyId || !mortgageLoanId) {
    return { data: null, error: new Error("propertyId and mortgageLoanId are required"), duplicate: false };
  }

  const linkType = options.link_type || "primary_financing";
  const existingResult = await maybeSingleRecord(
    "property_mortgage_links",
    [
      { column: "property_id", value: propertyId },
      { column: "mortgage_loan_id", value: mortgageLoanId },
      { column: "link_type", value: linkType },
    ]
  );

  if (existingResult.error) return { data: null, error: existingResult.error, duplicate: false };
  if (existingResult.data?.id) return { data: existingResult.data, error: null, duplicate: true };

  if (options.is_primary ?? true) {
    const demotionResult = await demoteOtherPrimaryLinks(
      "property_mortgage_links",
      propertyId,
      null
    );
    if (demotionResult.error) {
      return { data: null, error: demotionResult.error, duplicate: false };
    }
  }

  const insertResult = await insertRecord("property_mortgage_links", {
      property_id: propertyId,
      mortgage_loan_id: mortgageLoanId,
      link_type: linkType,
      is_primary: options.is_primary ?? true,
      notes: options.notes || null,
      metadata: options.metadata || {},
    });

  if (!insertResult.error) {
    await upsertPropertyStackAnalytics(propertyId);
  }

  return {
    ...insertResult,
    duplicate: false,
  };
}

export async function linkHomeownersToProperty(propertyId, homeownersPolicyId, options = {}) {
  if (!propertyId || !homeownersPolicyId) {
    return { data: null, error: new Error("propertyId and homeownersPolicyId are required"), duplicate: false };
  }

  const linkType = options.link_type || "primary_property_coverage";
  const existingResult = await maybeSingleRecord(
    "property_homeowners_links",
    [
      { column: "property_id", value: propertyId },
      { column: "homeowners_policy_id", value: homeownersPolicyId },
      { column: "link_type", value: linkType },
    ]
  );

  if (existingResult.error) return { data: null, error: existingResult.error, duplicate: false };
  if (existingResult.data?.id) return { data: existingResult.data, error: null, duplicate: true };

  if (options.is_primary ?? true) {
    const demotionResult = await demoteOtherPrimaryLinks(
      "property_homeowners_links",
      propertyId,
      null
    );
    if (demotionResult.error) {
      return { data: null, error: demotionResult.error, duplicate: false };
    }
  }

  const insertResult = await insertRecord("property_homeowners_links", {
      property_id: propertyId,
      homeowners_policy_id: homeownersPolicyId,
      link_type: linkType,
      is_primary: options.is_primary ?? true,
      notes: options.notes || null,
      metadata: options.metadata || {},
    });

  if (!insertResult.error) {
    await upsertPropertyStackAnalytics(propertyId);
  }

  return {
    ...insertResult,
    duplicate: false,
  };
}

export async function listPropertyMortgageLinks(propertyId) {
  return listRecords(
    "property_mortgage_links",
    [{ column: "property_id", value: propertyId }],
    {
      select:
        "*, mortgage_loans(*, assets(id, asset_name, asset_category, asset_subcategory, institution_name, status))",
      orderBy: "created_at",
    }
  );
}

export async function listPropertyHomeownersLinks(propertyId) {
  return listRecords(
    "property_homeowners_links",
    [{ column: "property_id", value: propertyId }],
    {
      select:
        "*, homeowners_policies(*, assets(id, asset_name, asset_category, asset_subcategory, institution_name, status))",
      orderBy: "created_at",
    }
  );
}

export async function listMortgagePropertyLinks(mortgageLoanId) {
  return listRecords(
    "property_mortgage_links",
    [{ column: "mortgage_loan_id", value: mortgageLoanId }],
    {
      select:
        "*, properties(*, assets(id, asset_name, asset_category, asset_subcategory, institution_name, status))",
      orderBy: "created_at",
    }
  );
}

export async function listHomeownersPropertyLinks(homeownersPolicyId) {
  return listRecords(
    "property_homeowners_links",
    [{ column: "homeowners_policy_id", value: homeownersPolicyId }],
    {
      select:
        "*, properties(*, assets(id, asset_name, asset_category, asset_subcategory, institution_name, status))",
      orderBy: "created_at",
    }
  );
}

export async function getPropertyStackBundle(propertyId) {
  const propertyResult = await maybeSingleRecord(
    "properties",
    [{ column: "id", value: propertyId }],
    {
      select:
        "*, assets(id, household_id, asset_name, asset_category, asset_subcategory, institution_name, institution_key, status, summary, metadata)",
    }
  );

  if (propertyResult.error || !propertyResult.data) {
    return {
      data: null,
      error: propertyResult.error || new Error("Property not found"),
    };
  }

  const [mortgageLinksResult, homeownersLinksResult, assetBundleResult] = await Promise.all([
    listPropertyMortgageLinks(propertyId),
    listPropertyHomeownersLinks(propertyId),
    propertyResult.data.assets?.id
      ? getAssetDetailBundle(propertyResult.data.assets.id)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const linkedMortgages = (mortgageLinksResult.data || []).map((link) => ({
    ...link.mortgage_loans,
    linkage: {
      id: link.id,
      link_type: link.link_type,
      is_primary: link.is_primary,
      notes: link.notes,
      metadata: link.metadata,
    },
  }));

  const linkedHomeownersPolicies = (homeownersLinksResult.data || []).map((link) => ({
    ...link.homeowners_policies,
    linkage: {
      id: link.id,
      link_type: link.link_type,
      is_primary: link.is_primary,
      notes: link.notes,
      metadata: link.metadata,
    },
  }));

  const linkageStatus = getPropertyStackLinkageStatus({
    linkedMortgages,
    linkedHomeownersPolicies,
  });

  return {
    data: {
      property: propertyResult.data,
      linkedMortgages,
      linkedHomeownersPolicies,
      relatedPortals: assetBundleResult.data?.portalLinks || [],
      relatedDocuments: assetBundleResult.data?.documents || [],
      linkageStatus,
    },
    error:
      mortgageLinksResult.error ||
      homeownersLinksResult.error ||
      assetBundleResult.error ||
      null,
  };
}

function buildPropertyStackReview(linkedMortgages = [], linkedHomeownersPolicies = []) {
  const reviewFlags = [];
  const prompts = [];
  const mortgageLinkCount = linkedMortgages.length;
  const homeownersLinkCount = linkedHomeownersPolicies.length;
  const primaryMortgage = linkedMortgages.find((item) => item.linkage?.is_primary) || null;
  const primaryHomeowners =
    linkedHomeownersPolicies.find((item) => item.linkage?.is_primary) || null;

  if (mortgageLinkCount === 0) {
    reviewFlags.push("missing_mortgage_link");
    prompts.push("No mortgage link is currently visible for this property.");
  }
  if (homeownersLinkCount === 0) {
    reviewFlags.push("missing_homeowners_link");
    prompts.push("No homeowners coverage link is currently visible for this property.");
  }
  if (mortgageLinkCount > 1) {
    reviewFlags.push("multiple_mortgages_linked");
    prompts.push("Multiple mortgages are linked and should be reviewed for primary financing clarity.");
  }
  if (homeownersLinkCount > 1) {
    reviewFlags.push("multiple_homeowners_policies_linked");
    prompts.push("Multiple homeowners policies are linked and should be reviewed for primary coverage clarity.");
  }
  if (mortgageLinkCount > 1 && !primaryMortgage) {
    reviewFlags.push("no_primary_mortgage_selected");
    prompts.push("Multiple mortgage links exist without a clear primary financing record.");
  }
  if (homeownersLinkCount > 1 && !primaryHomeowners) {
    reviewFlags.push("no_primary_homeowners_selected");
    prompts.push("Multiple homeowners links exist without a clear primary coverage record.");
  }
  if (mortgageLinkCount > 0 && homeownersLinkCount > 0) {
    reviewFlags.push("complete_property_stack");
    prompts.push("This property stack appears complete.");
  }

  return { reviewFlags, prompts, primaryMortgage, primaryHomeowners };
}

function buildPropertyStackAnalyticsFromBundle(stackBundle) {
  const property = stackBundle?.property || null;
  const linkedMortgages = stackBundle?.linkedMortgages || [];
  const linkedHomeownersPolicies = stackBundle?.linkedHomeownersPolicies || [];
  const latestPropertyValuation = stackBundle?.latestPropertyValuation || null;
  const linkageStatus = stackBundle?.linkageStatus || getPropertyStackLinkageStatus({
    linkedMortgages,
    linkedHomeownersPolicies,
  });
  const review = buildPropertyStackReview(linkedMortgages, linkedHomeownersPolicies);
  const equityPosition = evaluatePropertyEquityPosition({
    latestPropertyValuation,
    linkedMortgages,
    linkedHomeownersPolicies,
    propertyStackAnalytics: stackBundle?.propertyStackAnalytics || null,
  });

  let completenessScore = 0.35;
  if (linkedMortgages.length > 0 && linkedHomeownersPolicies.length > 0) completenessScore = 1.0;
  else if (linkedMortgages.length > 0 || linkedHomeownersPolicies.length > 0) completenessScore = 0.65;

  if ((linkedMortgages.length > 1 && !review.primaryMortgage) || (linkedHomeownersPolicies.length > 1 && !review.primaryHomeowners)) {
    completenessScore = Math.max(0, completenessScore - 0.1);
  }

  let continuityStatus = "weak";
  if (completenessScore >= 0.95) continuityStatus = "strong";
  else if (completenessScore >= 0.6) continuityStatus = "moderate";

  if (continuityStatus === "weak") {
    review.reviewFlags.push("weak_property_continuity");
    review.prompts.push("This property stack still shows weak continuity.");
  }
  if (continuityStatus !== "strong") {
    review.reviewFlags.push("property_stack_needs_review");
  }

  (equityPosition.review_flags || []).forEach((flag) => review.reviewFlags.push(flag));
  (equityPosition.prompts || []).forEach((prompt) => review.prompts.push(prompt));

  if (equityPosition.valuation_available) {
    review.reviewFlags.push("valuation_review_available");
  }

  return {
    household_id: property?.household_id || null,
    property_id: property?.id || null,
    linkage_status: linkageStatus,
    has_mortgage: linkedMortgages.length > 0,
    has_homeowners: linkedHomeownersPolicies.length > 0,
    mortgage_link_count: linkedMortgages.length,
    homeowners_link_count: linkedHomeownersPolicies.length,
    primary_mortgage_loan_id: review.primaryMortgage?.id || null,
    primary_homeowners_policy_id: review.primaryHomeowners?.id || null,
    review_flags: [...new Set(review.reviewFlags)],
    prompts: [...new Set(review.prompts)],
    completeness_score: Number(completenessScore.toFixed(2)),
    continuity_status: continuityStatus,
    metadata: {
      linked_mortgage_ids: linkedMortgages.map((item) => item.id),
      linked_homeowners_policy_ids: linkedHomeownersPolicies.map((item) => item.id),
      generated_from: "property_stack_links",
      latest_valuation_id: equityPosition.latest_valuation_id,
      valuation_available: equityPosition.valuation_available,
      valuation_confidence_label: equityPosition.valuation_confidence_label,
      equity_visibility_status: equityPosition.equity_visibility_status,
      estimated_equity_midpoint: equityPosition.estimated_equity_midpoint,
      estimated_ltv: equityPosition.estimated_ltv,
      primary_mortgage_balance: equityPosition.primary_mortgage_balance,
      protection_status: equityPosition.protection_status,
      financing_status: equityPosition.financing_status,
      valuation_review_flags: equityPosition.review_flags || [],
      valuation_prompts: equityPosition.prompts || [],
    },
  };
}

export async function evaluatePropertyStackAnalytics(propertyId) {
  if (!propertyId) {
    return { data: null, error: new Error("propertyId is required") };
  }

  const stackBundleResult = await getPropertyStackBundle(propertyId);
  if (stackBundleResult.error || !stackBundleResult.data?.property) {
    return {
      data: null,
      error: stackBundleResult.error || new Error("Property stack bundle could not be loaded"),
    };
  }

  const latestValuationResult = await getLatestPropertyValuationRecord(propertyId);
  if (latestValuationResult.error) {
    return {
      data: null,
      error: latestValuationResult.error,
    };
  }

  return {
    data: buildPropertyStackAnalyticsFromBundle({
      ...stackBundleResult.data,
      latestPropertyValuation: latestValuationResult.data || null,
    }),
    error: null,
  };
}

export async function upsertPropertyStackAnalytics(propertyId) {
  const analyticsResult = await evaluatePropertyStackAnalytics(propertyId);
  if (analyticsResult.error || !analyticsResult.data?.property_id) {
    return { data: null, error: analyticsResult.error || new Error("Property stack analytics could not be evaluated") };
  }

  return upsertRecord("property_stack_analytics", analyticsResult.data, "property_id");
}

export async function getPropertyStackAnalytics(propertyId) {
  return maybeSingleRecord("property_stack_analytics", [{ column: "property_id", value: propertyId }]);
}

export async function listHouseholdPropertyStackAnalytics(householdId) {
  return listRecords(
    "property_stack_analytics",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    {
      orderBy: "updated_at",
    }
  );
}

export async function updatePropertyMortgageLink(linkId, updates = {}) {
  if (!linkId) {
    return { data: null, error: new Error("linkId is required") };
  }

  const existingResult = await maybeSingleRecord(
    "property_mortgage_links",
    [{ column: "id", value: linkId }]
  );
  if (existingResult.error || !existingResult.data) {
    return {
      data: null,
      error: existingResult.error || new Error("Property mortgage link not found"),
    };
  }

  if (updates.is_primary === true) {
    const demotionResult = await demoteOtherPrimaryLinks(
      "property_mortgage_links",
      existingResult.data.property_id,
      linkId
    );
    if (demotionResult.error) {
      return { data: null, error: demotionResult.error };
    }
  }

  const updateResult = await updateRecord("property_mortgage_links", linkId, {
    link_type: updates.link_type ?? existingResult.data.link_type,
    is_primary: updates.is_primary ?? existingResult.data.is_primary,
    notes: updates.notes ?? existingResult.data.notes,
    metadata: updates.metadata ?? existingResult.data.metadata ?? {},
  });
  if (updateResult.error) return updateResult;
  await upsertPropertyStackAnalytics(existingResult.data.property_id);
  return updateResult;
}

export async function updatePropertyHomeownersLink(linkId, updates = {}) {
  if (!linkId) {
    return { data: null, error: new Error("linkId is required") };
  }

  const existingResult = await maybeSingleRecord(
    "property_homeowners_links",
    [{ column: "id", value: linkId }]
  );
  if (existingResult.error || !existingResult.data) {
    return {
      data: null,
      error: existingResult.error || new Error("Property homeowners link not found"),
    };
  }

  if (updates.is_primary === true) {
    const demotionResult = await demoteOtherPrimaryLinks(
      "property_homeowners_links",
      existingResult.data.property_id,
      linkId
    );
    if (demotionResult.error) {
      return { data: null, error: demotionResult.error };
    }
  }

  const updateResult = await updateRecord("property_homeowners_links", linkId, {
    link_type: updates.link_type ?? existingResult.data.link_type,
    is_primary: updates.is_primary ?? existingResult.data.is_primary,
    notes: updates.notes ?? existingResult.data.notes,
    metadata: updates.metadata ?? existingResult.data.metadata ?? {},
  });
  if (updateResult.error) return updateResult;
  await upsertPropertyStackAnalytics(existingResult.data.property_id);
  return updateResult;
}

export async function unlinkMortgageFromProperty(linkId) {
  if (!linkId) {
    return { error: new Error("linkId is required") };
  }
  const existingResult = await maybeSingleRecord(
    "property_mortgage_links",
    [{ column: "id", value: linkId }]
  );
  if (existingResult.error || !existingResult.data) {
    return { error: existingResult.error || new Error("Property mortgage link not found") };
  }
  const deleteResult = await deleteRecord("property_mortgage_links", linkId);
  if (deleteResult.error) return deleteResult;
  await upsertPropertyStackAnalytics(existingResult.data.property_id);
  return deleteResult;
}

export async function unlinkHomeownersFromProperty(linkId) {
  if (!linkId) {
    return { error: new Error("linkId is required") };
  }
  const existingResult = await maybeSingleRecord(
    "property_homeowners_links",
    [{ column: "id", value: linkId }]
  );
  if (existingResult.error || !existingResult.data) {
    return { error: existingResult.error || new Error("Property homeowners link not found") };
  }
  const deleteResult = await deleteRecord("property_homeowners_links", linkId);
  if (deleteResult.error) return deleteResult;
  await upsertPropertyStackAnalytics(existingResult.data.property_id);
  return deleteResult;
}
