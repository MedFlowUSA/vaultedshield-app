function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function normalizeCompletenessScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

export function formatCompletenessScore(score) {
  const normalized = normalizeCompletenessScore(score);
  if (normalized === null) return "Not scored";
  return `${Math.round(normalized * 100)}%`;
}

export function getCompletenessLabel(score) {
  const normalized = normalizeCompletenessScore(score);
  if (normalized === null) return "Limited";
  if (normalized >= 0.95) return "Complete";
  if (normalized >= 0.75) return "Strong";
  if (normalized >= 0.6) return "Developing";
  if (normalized >= 0.35) return "Partial";
  return "Limited";
}

export function getCompletenessTone(score) {
  const normalized = normalizeCompletenessScore(score);
  if (normalized === null) return "info";
  if (normalized >= 0.95) return "good";
  if (normalized >= 0.6) return "warning";
  return "alert";
}

export function buildLinkedAssetRoute(module, recordId) {
  if (!recordId) return null;
  const normalizedModule = String(module || "").toLowerCase();
  if (normalizedModule === "property") return `/property/detail/${recordId}`;
  if (normalizedModule === "mortgage") return `/mortgage/detail/${recordId}`;
  if (normalizedModule === "homeowners") return `/insurance/homeowners/detail/${recordId}`;
  return null;
}

export function getCounterpartyFromLink(link, currentAssetId) {
  if (!link || !currentAssetId) return null;
  if (link.source_asset_id === currentAssetId) {
    return {
      asset: link.target_asset || null,
      module: link.target_module || null,
      recordId: link.target_record_id || null,
    };
  }
  if (link.target_asset_id === currentAssetId) {
    return {
      asset: link.source_asset || null,
      module: link.source_module || null,
      recordId: link.source_record_id || null,
    };
  }
  return {
    asset: link.target_asset || link.source_asset || null,
    module: link.target_module || link.source_module || null,
    recordId: link.target_record_id || link.source_record_id || null,
  };
}

export function classifyLinkBucket(link, counterparty = {}) {
  const module = String(counterparty.module || "").toLowerCase();
  const category = String(counterparty.asset?.asset_category || "").toLowerCase();
  const origin = String(link?.relationship_origin || "").toLowerCase();

  if (module === "property" || category === "property") return "property";
  if (module === "mortgage" || category === "mortgage" || origin === "property_mortgage") return "liability";
  if (module === "homeowners" || category === "homeowners" || origin === "property_homeowners") return "protection";
  return "other";
}

export function normalizeLinkedContextRows(assetLinks = [], currentAssetId) {
  return (assetLinks || [])
    .map((link) => {
      const resolvedCurrentAssetId = currentAssetId || link.__current_asset_id || null;
      const counterparty = getCounterpartyFromLink(link, resolvedCurrentAssetId);
      return {
        id: link.id || link.relationship_key || `${link.source_record_id || "source"}-${link.target_record_id || "target"}`,
        link_type: link.link_type,
        confidence_score: link.confidence_score,
        is_primary: Boolean(link.is_primary),
        relationship_origin: link.relationship_origin,
        asset: counterparty?.asset || null,
        module: counterparty?.module || null,
        recordId: counterparty?.recordId || null,
        bucket: classifyLinkBucket(link, counterparty),
        route: buildLinkedAssetRoute(counterparty?.module, counterparty?.recordId),
      };
    })
    .filter((row) => row.asset || row.recordId);
}

export function normalizeLinkedContextRowsForAssets(assetLinks = [], currentAssetIds = []) {
  const normalizedAssetIds = [...new Set((currentAssetIds || []).filter(Boolean))];
  if (normalizedAssetIds.length === 0) return [];

  return normalizeLinkedContextRows(
    (assetLinks || []).map((link) => ({
      ...link,
      __current_asset_id:
        normalizedAssetIds.find((assetId) => link?.source_asset_id === assetId || link?.target_asset_id === assetId) ||
        normalizedAssetIds[0],
    })),
    null
  );
}

export function dedupeLinkedContextRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row?.module || "unknown"}:${row?.recordId || row?.asset?.id || row?.id || "missing"}:${row?.link_type || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildLinkedRecordFallbackRow({
  id,
  asset,
  module,
  recordId,
  linkType,
  isPrimary = false,
  confidenceScore = null,
}) {
  return {
    id: id || `${module || "linked"}-${recordId || asset?.id || "unknown"}`,
    link_type: linkType || "related_asset",
    confidence_score: confidenceScore,
    is_primary: Boolean(isPrimary),
    relationship_origin: null,
    asset: asset || null,
    module: module || asset?.asset_category || null,
    recordId: recordId || null,
    bucket: classifyLinkBucket(null, { module, asset }),
    route: buildLinkedAssetRoute(module, recordId),
  };
}

export function getLinkTone(confidenceScore) {
  const confidence = Number(confidenceScore);
  if (Number.isFinite(confidence) && confidence >= 0.9) return "good";
  if (Number.isFinite(confidence) && confidence >= 0.7) return "warning";
  return "info";
}

export function formatConfidenceLabel(confidenceScore) {
  const confidence = Number(confidenceScore);
  if (!Number.isFinite(confidence)) return "Confidence limited";
  return `Confidence ${Math.round(confidence * 100)}%`;
}

export function buildPropertyOperatingGraphSummary(bundle = {}) {
  const propertySummary = bundle?.propertyStackSummary || {};
  const assetGraph = propertySummary.assetGraphSummary || {};
  const analyticsByPropertyId = propertySummary.analyticsByPropertyId || {};
  const scoredPropertyStacks = Object.values(analyticsByPropertyId).filter(
    (row) => normalizeCompletenessScore(row?.completeness_score) !== null
  );
  const documentCounts = bundle?.documentCountsByCategory || {};
  const portalReadiness = bundle?.portalReadiness || {};
  const propertyCount = Number(propertySummary.propertyCount || 0);
  const mortgageCount = Number(propertySummary.mortgageCount || 0);
  const homeownersCount = Number(propertySummary.homeownersCount || 0);
  const completeCount = assetGraph.completePropertyAssetGraph?.length || 0;
  const partialCount = assetGraph.partialPropertyAssetGraph?.length || 0;
  const missingProtectionCount =
    assetGraph.propertiesMissingAssetGraphHomeownersLink?.length ||
    propertySummary.propertiesMissingHomeownersLink?.length ||
    0;
  const missingLiabilityCount =
    assetGraph.propertiesMissingAssetGraphMortgageLink?.length ||
    propertySummary.propertiesMissingMortgageLink?.length ||
    0;
  const linkedProtectionCount = Math.max(propertyCount - missingProtectionCount, 0);
  const linkedLiabilityCount = Math.max(propertyCount - missingLiabilityCount, 0);
  const linkedDocumentCount =
    Number(documentCounts.property || 0) +
    Number(documentCounts.mortgage || 0) +
    Number(documentCounts.homeowners || 0);
  const graphLinkedDocumentCoverage =
    linkedDocumentCount > 0
      ? `${formatCountLabel(linkedDocumentCount, "linked document")} support${linkedDocumentCount === 1 ? "s" : ""} the property stack.`
      : "Linked document coverage is still limited across property, mortgage, and homeowners records.";
  const propertyRelatedPortalGaps = (portalReadiness.criticalAssetsWithoutLinkedPortals || []).filter((asset) =>
    ["property", "mortgage", "homeowners"].includes(String(asset?.asset_category || "").toLowerCase())
  );
  const portalWeaknessCount = propertyRelatedPortalGaps.length;
  const linkedPortalCount = Number(portalReadiness.linkedPortalCount || portalReadiness.portalCount || 0);
  const averageCompletenessScore =
    scoredPropertyStacks.length > 0
      ? scoredPropertyStacks.reduce((sum, row) => sum + Number(row.completeness_score || 0), 0) / scoredPropertyStacks.length
      : null;

  const cards = [
    {
      key: "stack_completeness",
      title: "Stack Completeness",
      value: formatCompletenessScore(averageCompletenessScore),
      route: "/property",
      summary:
        averageCompletenessScore !== null
          ? `${getCompletenessLabel(averageCompletenessScore)} average stack score across ${formatCountLabel(scoredPropertyStacks.length, "scored property stack")}.`
          : propertyCount > 0
            ? "Property stacks are visible, but a stored completeness score is not available yet."
            : "No property stacks are visible yet.",
    },
    {
      key: "linked_protections",
      title: "Linked Protections",
      value: propertyCount > 0 ? `${linkedProtectionCount}/${propertyCount}` : "0",
      route: "/insurance/homeowners",
      summary:
        propertyCount === 0
          ? "No property stacks are visible yet."
          : missingProtectionCount > 0
            ? `${formatCountLabel(missingProtectionCount, "property")} still ${missingProtectionCount === 1 ? "appears" : "appear"} to be missing linked protection.`
            : "Homeowners protection appears connected across the visible property stacks.",
    },
    {
      key: "linked_liabilities",
      title: "Linked Liabilities",
      value: propertyCount > 0 ? `${linkedLiabilityCount}/${propertyCount}` : "0",
      route: "/mortgage",
      summary:
        propertyCount === 0
          ? mortgageCount > 0
            ? `${formatCountLabel(mortgageCount, "mortgage")} ${mortgageCount === 1 ? "is" : "are"} visible without a full property stack yet.`
            : "No property-linked liabilities are visible yet."
          : missingLiabilityCount > 0
            ? `${formatCountLabel(missingLiabilityCount, "property")} still ${missingLiabilityCount === 1 ? "needs" : "need"} clearer liability linkage.`
            : "Mortgage linkage appears connected across the visible property stacks.",
    },
    {
      key: "linked_documents",
      title: "Linked Documents",
      value: linkedDocumentCount,
      route: "/vault",
      summary: graphLinkedDocumentCoverage,
    },
    {
      key: "linked_portals",
      title: "Linked Portals",
      value: linkedPortalCount,
      route: "/portals",
      summary:
        portalWeaknessCount > 0
          ? `${formatCountLabel(portalWeaknessCount, "property-related asset")} still ${portalWeaknessCount === 1 ? "appears" : "appear"} to have limited portal continuity.`
          : linkedPortalCount > 0
            ? "Portal continuity appears connected across the currently visible property stack."
            : "Portal continuity appears limited across the current property stack.",
    },
  ];

  const highlights = [
    `${formatCountLabel(completeCount, "complete property stack")} ${completeCount === 1 ? "is" : "are"} visible.`,
    partialCount > 0
      ? `${formatCountLabel(partialCount, "partially connected property")} still need${partialCount === 1 ? "s" : ""} tighter linkage.`
      : "No partially connected property stacks are standing out right now.",
    missingProtectionCount > 0
      ? `${formatCountLabel(missingProtectionCount, "property")} still ${missingProtectionCount === 1 ? "does not show" : "do not show"} linked protection.`
      : "Linked protection is visible for the currently tracked property stacks.",
    missingLiabilityCount > 0
      ? `${formatCountLabel(missingLiabilityCount, "property")} still ${missingLiabilityCount === 1 ? "does not show" : "do not show"} linked liabilities.`
      : "Linked liabilities are visible for the currently tracked property stacks.",
    portalWeaknessCount > 0
      ? `${formatCountLabel(portalWeaknessCount, "property-related asset")} still ${portalWeaknessCount === 1 ? "appears" : "appear"} to have limited portal continuity.`
      : linkedPortalCount > 0
        ? "Property-related portal continuity is visible in the current household graph."
        : "Property-related portal continuity has not been clearly established yet.",
  ];

  const reportRows = [
    {
      title: "Average stack completeness",
      value: formatCompletenessScore(averageCompletenessScore),
      summary:
        averageCompletenessScore !== null
          ? `${getCompletenessLabel(averageCompletenessScore)} average property-stack score across ${formatCountLabel(scoredPropertyStacks.length, "scored property stack")}.`
          : propertyCount > 0
            ? "Property stacks are visible, but an average completeness score is not available yet."
            : "No property stack score is available yet.",
    },
    {
      title: "Complete property stacks",
      value: completeCount,
      summary:
        completeCount > 0
          ? `${formatCountLabel(completeCount, "property stack")} appears fully connected across asset, liability, and protection.`
          : "No property stack currently appears fully connected.",
    },
    {
      title: "Partial property stacks",
      value: partialCount,
      summary:
        partialCount > 0
          ? `${formatCountLabel(partialCount, "property")} appears partially connected in the household graph.`
          : "No partial property stack stands out in the current household graph.",
    },
    {
      title: "Missing protections",
      value: missingProtectionCount,
      summary:
        missingProtectionCount > 0
          ? `Linked protection not identified for ${formatCountLabel(missingProtectionCount, "property")}.`
          : "Linked protection appears visible across the tracked property stack.",
    },
    {
      title: "Missing liabilities",
      value: missingLiabilityCount,
      summary:
        missingLiabilityCount > 0
          ? `Linked liability not identified for ${formatCountLabel(missingLiabilityCount, "property")}.`
          : "Linked liabilities appear visible across the tracked property stack.",
    },
    {
      title: "Portal continuity weaknesses",
      value: portalWeaknessCount,
      summary:
        portalWeaknessCount > 0
          ? `Portal continuity appears limited for ${formatCountLabel(portalWeaknessCount, "property-related asset")}.`
          : linkedPortalCount > 0
            ? "Portal continuity appears usable across the current property stack."
            : "Portal continuity appears limited across the current property stack.",
    },
    {
      title: "Linked document coverage",
      value: linkedDocumentCount,
      summary: graphLinkedDocumentCoverage,
    },
  ];

  return {
    propertyCount,
    mortgageCount,
    homeownersCount,
    completeCount,
    partialCount,
    missingProtectionCount,
    missingLiabilityCount,
    linkedProtectionCount,
    linkedLiabilityCount,
    linkedDocumentCount,
    linkedPortalCount,
    portalWeaknessCount,
    averageCompletenessScore,
    averageCompletenessLabel: getCompletenessLabel(averageCompletenessScore),
    cards,
    highlights,
    reportRows,
  };
}

export function buildLinkedPropertyStackCompleteness(propertyLinks = [], analyticsByPropertyId = {}) {
  const propertyIds = [...new Set((propertyLinks || []).map((link) => link.property_id || link.properties?.id).filter(Boolean))];
  const primaryPropertyId =
    propertyLinks.find((link) => link.is_primary)?.property_id ||
    propertyLinks.find((link) => link.is_primary)?.properties?.id ||
    propertyIds[0] ||
    null;
  const primaryAnalytics = primaryPropertyId ? analyticsByPropertyId?.[primaryPropertyId] || null : null;
  const scoredRows = propertyIds
    .map((propertyId) => analyticsByPropertyId?.[propertyId] || null)
    .filter((row) => normalizeCompletenessScore(row?.completeness_score) !== null);

  const averageScore =
    scoredRows.length > 0
      ? scoredRows.reduce((sum, row) => sum + Number(row.completeness_score || 0), 0) / scoredRows.length
      : null;
  const score = normalizeCompletenessScore(primaryAnalytics?.completeness_score) ?? averageScore;

  let summary = "A linked property stack score is not available yet.";
  if (propertyIds.length === 0) {
    summary = "No linked property is visible yet, so the stack cannot be scored.";
  } else if (primaryAnalytics && score !== null) {
    summary = `Primary property stack currently reads ${getCompletenessLabel(score).toLowerCase()} at ${formatCompletenessScore(score)} completeness.`;
  } else if (averageScore !== null) {
    summary = `Linked property context currently averages ${formatCompletenessScore(averageScore)} completeness across the visible stack.`;
  }

  return {
    propertyCount: propertyIds.length,
    primaryPropertyId,
    score,
    label: getCompletenessLabel(score),
    tone: getCompletenessTone(score),
    summary,
  };
}
