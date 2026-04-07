import {
  buildAssetCommandCenter,
  buildAutoCommandCenter,
  buildHealthCommandCenter,
  buildHomeownersCommandCenter,
  buildPropertyCommandCenter,
  buildRetirementCommandCenter,
  buildWarrantyCommandCenter,
} from "./continuityCommandCenter";
import { analyzeRetirementReadiness } from "../retirement/retirementIntelligence";

function toTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildPortalsByAssetId(portals = []) {
  return (Array.isArray(portals) ? portals : []).reduce((accumulator, portal) => {
    const linkedAssets = Array.isArray(portal?.linked_assets) ? portal.linked_assets : [];
    linkedAssets.forEach((asset) => {
      if (!asset?.id) return;
      if (!accumulator[asset.id]) {
        accumulator[asset.id] = [];
      }
      accumulator[asset.id].push({
        id: `${portal.id || portal.portal_name || "portal"}:${asset.id}`,
        portal_profiles: portal,
      });
    });
    return accumulator;
  }, {});
}

function buildLatestAssetTimestamp({ asset, documents, alerts, tasks, portalLinks }) {
  const timestamps = [
    asset?.updated_at,
    asset?.created_at,
    ...documents.map((item) => item?.updated_at || item?.created_at),
    ...alerts.map((item) => item?.updated_at || item?.created_at),
    ...tasks.map((item) => item?.updated_at || item?.created_at || item?.due_date),
    ...portalLinks.map((item) => item?.updated_at || item?.created_at || item?.portal_profiles?.last_verified_at),
  ]
    .map(toTimestamp)
    .filter((value) => value !== null);

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function buildAssetReviewQueueItems(bundle = {}) {
  const assets = Array.isArray(bundle?.assets) ? bundle.assets : [];
  const documents = Array.isArray(bundle?.documents) ? bundle.documents : [];
  const alerts = Array.isArray(bundle?.openAlerts) ? bundle.openAlerts : [];
  const tasks = Array.isArray(bundle?.openTasks) ? bundle.openTasks : [];
  const portalsByAssetId = buildPortalsByAssetId(bundle?.portals || []);

  const documentsByAssetId = documents.reduce((accumulator, item) => {
    if (!item?.asset_id) return accumulator;
    if (!accumulator[item.asset_id]) {
      accumulator[item.asset_id] = [];
    }
    accumulator[item.asset_id].push(item);
    return accumulator;
  }, {});

  const alertsByAssetId = alerts.reduce((accumulator, item) => {
    if (!item?.asset_id) return accumulator;
    if (!accumulator[item.asset_id]) {
      accumulator[item.asset_id] = [];
    }
    accumulator[item.asset_id].push(item);
    return accumulator;
  }, {});

  const tasksByAssetId = tasks.reduce((accumulator, item) => {
    if (!item?.asset_id) return accumulator;
    if (!accumulator[item.asset_id]) {
      accumulator[item.asset_id] = [];
    }
    accumulator[item.asset_id].push(item);
    return accumulator;
  }, {});

  return assets.flatMap((asset) => {
    if (!asset?.id) return [];

    const assetDocuments = documentsByAssetId[asset.id] || [];
    const assetAlerts = alertsByAssetId[asset.id] || [];
    const assetTasks = tasksByAssetId[asset.id] || [];
    const assetPortalLinks = portalsByAssetId[asset.id] || [];
    const missingRecoveryCount = assetPortalLinks.filter(
      (link) => !link?.portal_profiles?.recovery_contact_hint
    ).length;

    const commandCenter = buildAssetCommandCenter({
      asset,
      documents: assetDocuments,
      alerts: assetAlerts,
      tasks: assetTasks,
      portalLinks: assetPortalLinks,
      portalContinuity: {
        linkedCount: assetPortalLinks.length,
        missingRecoveryCount,
      },
    });

    const dataUpdatedAt = buildLatestAssetTimestamp({
      asset,
      documents: assetDocuments,
      alerts: assetAlerts,
      tasks: assetTasks,
      portalLinks: assetPortalLinks,
    });

    return commandCenter.blockers.map((blocker, index) => ({
      id: `asset:${asset.id}:${blocker.id}`,
      label: `${asset.asset_name || "Asset"}: ${blocker.title}`,
      summary: blocker.blocker,
      change_signal: blocker.consequence,
      route: `/assets/detail/${asset.id}`,
      action_label: blocker.nextAction || "Open asset review",
      action_key: "open_asset_detail",
      urgency: blocker.urgency || "warning",
      source: "Asset",
      source_label: asset.asset_category || "asset",
      asset_id: asset.id,
      asset_name: asset.asset_name || "Asset",
      data_updated_at: dataUpdatedAt,
      blocker_title: blocker.title,
      blocker_stale_label: blocker.staleLabel || "",
      blocker_index: index,
    }));
  });
}

export function buildAssetDetailReviewQueueItems(assetBundle = {}) {
  if (!assetBundle?.asset?.id) return [];

  return buildAssetReviewQueueItems({
    assets: [assetBundle.asset],
    documents: assetBundle.documents || [],
    openAlerts: assetBundle.alerts || [],
    openTasks: assetBundle.tasks || [],
    portals: (assetBundle.portalLinks || []).map((link) => ({
      ...(link.portal_profiles || {}),
      id: link.portal_profile_id || link.portal_profiles?.id || link.id,
      linked_assets: [assetBundle.asset],
      recovery_contact_hint: link.portal_profiles?.recovery_contact_hint || "",
      last_verified_at: link.portal_profiles?.last_verified_at || null,
    })),
  });
}

function buildPropertyPortalsForAsset(assetId, portals = []) {
  return (Array.isArray(portals) ? portals : [])
    .filter((portal) =>
      (portal?.linked_assets || []).some((asset) => asset?.id === assetId)
    )
    .map((portal) => ({
      ...(portal || {}),
      linked_assets: (portal?.linked_assets || []).filter((asset) => asset?.id === assetId),
    }));
}

function buildPropertyLinksByPropertyId(links = [], key = "property_id") {
  return (Array.isArray(links) ? links : []).reduce((accumulator, item) => {
    const propertyId = item?.[key];
    if (!propertyId) return accumulator;
    if (!accumulator[propertyId]) {
      accumulator[propertyId] = [];
    }
    accumulator[propertyId].push(item);
    return accumulator;
  }, {});
}

function buildLatestPropertyTimestamp({
  property,
  propertyStackAnalytics,
  linkedMortgages,
  linkedHomeownersPolicies,
  propertyDocuments,
  assetBundle,
}) {
  const timestamps = [
    property?.updated_at,
    property?.created_at,
    propertyStackAnalytics?.updated_at,
    ...(linkedMortgages || []).map((item) => item?.updated_at || item?.created_at),
    ...(linkedHomeownersPolicies || []).map((item) => item?.updated_at || item?.created_at),
    ...(propertyDocuments || []).map((item) => item?.updated_at || item?.created_at),
    assetBundle?.asset?.updated_at,
    ...(assetBundle?.documents || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.alerts || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.tasks || []).map((item) => item?.updated_at || item?.created_at || item?.due_date),
    ...(assetBundle?.portalLinks || []).map((item) => item?.updated_at || item?.created_at),
  ]
    .map(toTimestamp)
    .filter((value) => value !== null);

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function buildPropertyReviewQueueItems(bundle = {}) {
  const properties = Array.isArray(bundle?.properties) ? bundle.properties : [];
  const allDocuments = Array.isArray(bundle?.documents) ? bundle.documents : [];
  const allAlerts = Array.isArray(bundle?.openAlerts) ? bundle.openAlerts : [];
  const allTasks = Array.isArray(bundle?.openTasks) ? bundle.openTasks : [];
  const allPortals = Array.isArray(bundle?.portals) ? bundle.portals : [];
  const mortgageLoans = Array.isArray(bundle?.mortgageLoans) ? bundle.mortgageLoans : [];
  const homeownersPolicies = Array.isArray(bundle?.homeownersPolicies) ? bundle.homeownersPolicies : [];
  const analyticsByPropertyId = bundle?.propertyStackSummary?.analyticsByPropertyId || {};
  const mortgageLinksByPropertyId = buildPropertyLinksByPropertyId(bundle?.propertyMortgageLinks);
  const homeownersLinksByPropertyId = buildPropertyLinksByPropertyId(bundle?.propertyHomeownersLinks);

  return properties.flatMap((property) => {
    if (!property?.id) return [];

    const linkedAsset = property.assets || null;
    const linkedAssetId = linkedAsset?.id || null;
    const linkedMortgages = (mortgageLinksByPropertyId[property.id] || [])
      .map((link) => mortgageLoans.find((item) => item?.id === link?.mortgage_loan_id))
      .filter(Boolean);
    const linkedHomeownersPolicies = (homeownersLinksByPropertyId[property.id] || [])
      .map((link) => homeownersPolicies.find((item) => item?.id === link?.homeowners_policy_id))
      .filter(Boolean);
    const assetDocuments = linkedAssetId
      ? allDocuments.filter((item) => item?.asset_id === linkedAssetId)
      : [];
    const assetAlerts = linkedAssetId
      ? allAlerts.filter((item) => item?.asset_id === linkedAssetId)
      : [];
    const assetTasks = linkedAssetId
      ? allTasks.filter((item) => item?.asset_id === linkedAssetId)
      : [];
    const propertyPortals = linkedAssetId
      ? buildPropertyPortalsForAsset(linkedAssetId, allPortals)
      : [];
    const assetPortalLinks = propertyPortals.map((portal) => ({
      id: `${portal.id || portal.portal_name || "portal"}:${linkedAssetId || property.id}`,
      portal_profiles: portal,
    }));
    const assetBundle = linkedAsset
      ? {
          asset: linkedAsset,
          documents: assetDocuments,
          alerts: assetAlerts,
          tasks: assetTasks,
          portalLinks: assetPortalLinks,
          portalContinuity: {
            linkedCount: assetPortalLinks.length,
            missingRecoveryCount: assetPortalLinks.filter(
              (link) => !link?.portal_profiles?.recovery_contact_hint
            ).length,
          },
        }
      : null;

    const propertyCommandCenter = buildPropertyCommandCenter({
      property,
      propertyDocuments: assetDocuments,
      propertyStackAnalytics: analyticsByPropertyId[property.id] || null,
      propertyEquityPosition: null,
      latestPropertyValuation: null,
      valuationChangeSummary: null,
      linkedMortgages,
      linkedHomeownersPolicies,
      assetBundle,
    });

    const dataUpdatedAt = buildLatestPropertyTimestamp({
      property,
      propertyStackAnalytics: analyticsByPropertyId[property.id] || null,
      linkedMortgages,
      linkedHomeownersPolicies,
      propertyDocuments: assetDocuments,
      assetBundle,
    });

    return propertyCommandCenter.blockers.map((blocker, index) => ({
      id: `property:${property.id}:${blocker.id}`,
      label: `${property.property_name || property.property_address || "Property"}: ${blocker.title}`,
      summary: blocker.blocker,
      change_signal: blocker.consequence,
      route: `/property/detail/${property.id}`,
      action_label: blocker.nextAction || "Open property review",
      action_key: "open_property_detail",
      urgency: blocker.urgency || "warning",
      source: "Property",
      source_label: property.property_type_key || "property",
      property_id: property.id,
      property_name: property.property_name || property.property_address || "Property",
      data_updated_at: dataUpdatedAt,
      blocker_title: blocker.title,
      blocker_stale_label: blocker.staleLabel || "",
      blocker_index: index,
    }));
  });
}

export function buildPropertyDetailReviewQueueItems({
  property = null,
  propertyBundle = null,
  assetBundle = null,
  propertyCommandCenter = null,
} = {}) {
  if (!property?.id) return [];

  const commandCenter =
    propertyCommandCenter ||
    buildPropertyCommandCenter({
      property,
      propertyDocuments: propertyBundle?.propertyDocuments || [],
      propertyStackAnalytics: propertyBundle?.propertyStackAnalytics || null,
      propertyEquityPosition: propertyBundle?.propertyEquityPosition || null,
      latestPropertyValuation: propertyBundle?.latestPropertyValuation || null,
      valuationChangeSummary: propertyBundle?.valuationChangeSummary || null,
      linkedMortgages: propertyBundle?.linkedMortgages || [],
      linkedHomeownersPolicies: propertyBundle?.linkedHomeownersPolicies || [],
      assetBundle,
    });

  const dataUpdatedAt = buildLatestPropertyTimestamp({
    property,
    propertyStackAnalytics: propertyBundle?.propertyStackAnalytics || null,
    linkedMortgages: propertyBundle?.linkedMortgages || [],
    linkedHomeownersPolicies: propertyBundle?.linkedHomeownersPolicies || [],
    propertyDocuments: propertyBundle?.propertyDocuments || [],
    assetBundle,
  });

  return commandCenter.blockers.map((blocker, index) => ({
    id: `property:${property.id}:${blocker.id}`,
    label: `${property.property_name || property.property_address || "Property"}: ${blocker.title}`,
    summary: blocker.blocker,
    change_signal: blocker.consequence,
    route: `/property/detail/${property.id}`,
    action_label: blocker.nextAction || "Open property review",
    action_key: "open_property_detail",
    urgency: blocker.urgency || "warning",
    source: "Property",
    source_label: property.property_type_key || "property",
    property_id: property.id,
    property_name: property.property_name || property.property_address || "Property",
    data_updated_at: dataUpdatedAt,
    blocker_title: blocker.title,
    blocker_stale_label: blocker.staleLabel || "",
    blocker_index: index,
  }));
}

function buildLatestRetirementTimestamp({
  retirementAccount,
  retirementDocuments,
  retirementSnapshots,
  retirementAnalytics,
  retirementPositions,
  assetBundle,
}) {
  const timestamps = [
    retirementAccount?.updated_at,
    retirementAccount?.created_at,
    ...(retirementDocuments || []).map((item) => item?.updated_at || item?.created_at || item?.statement_date),
    ...(retirementSnapshots || []).map((item) => item?.updated_at || item?.created_at || item?.snapshot_date),
    ...(retirementAnalytics || []).map((item) => item?.updated_at || item?.created_at),
    ...(retirementPositions || []).map((item) => item?.updated_at || item?.created_at),
    assetBundle?.asset?.updated_at,
    ...(assetBundle?.documents || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.alerts || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.tasks || []).map((item) => item?.updated_at || item?.created_at || item?.due_date),
    ...(assetBundle?.portalLinks || []).map((item) => item?.updated_at || item?.created_at),
  ]
    .map(toTimestamp)
    .filter((value) => value !== null);

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function buildRetirementDetailReviewQueueItems({
  retirementAccount = null,
  retirementRead = null,
  retirementBundle = null,
  assetBundle = null,
  retirementCommandCenter = null,
} = {}) {
  if (!retirementAccount?.id) return [];

  const commandCenter =
    retirementCommandCenter ||
    buildRetirementCommandCenter({
      retirementAccount,
      retirementRead,
      retirementDocuments: retirementBundle?.retirementDocuments || [],
      retirementSnapshots: retirementBundle?.retirementSnapshots || [],
      retirementAnalytics: retirementBundle?.retirementAnalytics || [],
      retirementPositions: retirementBundle?.retirementPositions || [],
      assetBundle,
    });

  const dataUpdatedAt = buildLatestRetirementTimestamp({
    retirementAccount,
    retirementDocuments: retirementBundle?.retirementDocuments || [],
    retirementSnapshots: retirementBundle?.retirementSnapshots || [],
    retirementAnalytics: retirementBundle?.retirementAnalytics || [],
    retirementPositions: retirementBundle?.retirementPositions || [],
    assetBundle,
  });

  return commandCenter.blockers.map((blocker, index) => ({
    id: `retirement:${retirementAccount.id}:${blocker.id}`,
    label: `${retirementAccount.plan_name || retirementAccount.institution_name || "Retirement Account"}: ${blocker.title}`,
    summary: blocker.blocker,
    change_signal: blocker.consequence,
    route: `/retirement/detail/${retirementAccount.id}`,
    action_label: blocker.nextAction || "Open retirement review",
    action_key: "open_retirement_detail",
    urgency: blocker.urgency || "warning",
    source: "Retirement",
    source_label: retirementAccount.retirement_type_key || "retirement",
    retirement_account_id: retirementAccount.id,
    retirement_account_name:
      retirementAccount.plan_name || retirementAccount.institution_name || "Retirement Account",
    data_updated_at: dataUpdatedAt,
    blocker_title: blocker.title,
    blocker_stale_label: blocker.staleLabel || "",
    blocker_index: index,
  }));
}

export function buildRetirementReviewQueueItems(bundle = {}) {
  const retirementAccounts = Array.isArray(bundle?.retirementAccounts) ? bundle.retirementAccounts : [];
  const retirementDocumentsByAccountId = bundle?.retirementSummary?.retirementDocumentsByAccountId || {};
  const retirementSnapshotsByAccountId = bundle?.retirementSummary?.retirementSnapshotsByAccountId || {};
  const retirementAnalyticsByAccountId = bundle?.retirementSummary?.retirementAnalyticsByAccountId || {};
  const retirementPositionsByAccountId = bundle?.retirementSummary?.retirementPositionsByAccountId || {};
  const allDocuments = Array.isArray(bundle?.documents) ? bundle.documents : [];
  const allAlerts = Array.isArray(bundle?.openAlerts) ? bundle.openAlerts : [];
  const allTasks = Array.isArray(bundle?.openTasks) ? bundle.openTasks : [];
  const portalsByAssetId = buildPortalsByAssetId(bundle?.portals || []);

  return retirementAccounts.flatMap((retirementAccount) => {
    if (!retirementAccount?.id) return [];

    const linkedAsset = retirementAccount.assets || null;
    const linkedAssetId = linkedAsset?.id || null;
    const retirementDocuments = retirementDocumentsByAccountId[retirementAccount.id] || [];
    const retirementSnapshots = retirementSnapshotsByAccountId[retirementAccount.id] || [];
    const retirementAnalytics = retirementAnalyticsByAccountId[retirementAccount.id] || [];
    const retirementPositions = retirementPositionsByAccountId[retirementAccount.id] || [];
    const latestSnapshot = retirementSnapshots[0] || null;
    const latestAnalytics = retirementAnalytics[0] || null;
    const retirementRead = analyzeRetirementReadiness({
      snapshot: latestSnapshot,
      analytics: latestAnalytics,
      positions: retirementPositions,
    });
    const assetDocuments = linkedAssetId
      ? allDocuments.filter((item) => item?.asset_id === linkedAssetId)
      : [];
    const assetAlerts = linkedAssetId
      ? allAlerts.filter((item) => item?.asset_id === linkedAssetId)
      : [];
    const assetTasks = linkedAssetId
      ? allTasks.filter((item) => item?.asset_id === linkedAssetId)
      : [];
    const assetPortalLinks = linkedAssetId ? portalsByAssetId[linkedAssetId] || [] : [];
    const assetBundle = linkedAsset
      ? {
          asset: linkedAsset,
          documents: assetDocuments,
          alerts: assetAlerts,
          tasks: assetTasks,
          portalLinks: assetPortalLinks,
          portalContinuity: {
            linkedCount: assetPortalLinks.length,
            missingRecoveryCount: assetPortalLinks.filter(
              (link) => !link?.portal_profiles?.recovery_contact_hint
            ).length,
          },
        }
      : null;

    return buildRetirementDetailReviewQueueItems({
      retirementAccount,
      retirementRead,
      retirementBundle: {
        retirementDocuments,
        retirementSnapshots,
        retirementAnalytics,
        retirementPositions,
      },
      assetBundle,
    });
  });
}

function buildLatestAutoTimestamp({
  autoPolicy,
  autoDocuments,
  autoSnapshots,
  autoAnalytics,
  assetBundle,
}) {
  const timestamps = [
    autoPolicy?.updated_at,
    autoPolicy?.created_at,
    ...(autoDocuments || []).map((item) => item?.updated_at || item?.created_at || item?.document_date),
    ...(autoSnapshots || []).map((item) => item?.updated_at || item?.created_at || item?.snapshot_date),
    ...(autoAnalytics || []).map((item) => item?.updated_at || item?.created_at),
    assetBundle?.asset?.updated_at,
    ...(assetBundle?.documents || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.alerts || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.tasks || []).map((item) => item?.updated_at || item?.created_at || item?.due_date),
    ...(assetBundle?.portalLinks || []).map((item) => item?.updated_at || item?.created_at),
  ]
    .map(toTimestamp)
    .filter((value) => value !== null);

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function buildAutoReviewQueueItems(bundle = {}) {
  const autoPolicies = Array.isArray(bundle?.autoPolicies) ? bundle.autoPolicies : [];
  const autoDocumentsByPolicyId = bundle?.autoSummary?.autoDocumentsByPolicyId || {};
  const autoSnapshotsByPolicyId = bundle?.autoSummary?.autoSnapshotsByPolicyId || {};
  const autoAnalyticsByPolicyId = bundle?.autoSummary?.autoAnalyticsByPolicyId || {};
  const allDocuments = Array.isArray(bundle?.documents) ? bundle.documents : [];
  const allAlerts = Array.isArray(bundle?.openAlerts) ? bundle.openAlerts : [];
  const allTasks = Array.isArray(bundle?.openTasks) ? bundle.openTasks : [];
  const portalsByAssetId = buildPortalsByAssetId(bundle?.portals || []);

  return autoPolicies.flatMap((autoPolicy) => {
    if (!autoPolicy?.id) return [];

    const linkedAsset = autoPolicy.assets || null;
    const linkedAssetId = linkedAsset?.id || null;
    const autoDocuments = autoDocumentsByPolicyId[autoPolicy.id] || [];
    const autoSnapshots = autoSnapshotsByPolicyId[autoPolicy.id] || [];
    const autoAnalytics = autoAnalyticsByPolicyId[autoPolicy.id] || [];
    const assetDocuments = linkedAssetId ? allDocuments.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetAlerts = linkedAssetId ? allAlerts.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetTasks = linkedAssetId ? allTasks.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetPortalLinks = linkedAssetId ? portalsByAssetId[linkedAssetId] || [] : [];
    const assetBundle = linkedAsset
      ? {
          asset: linkedAsset,
          documents: assetDocuments,
          alerts: assetAlerts,
          tasks: assetTasks,
          portalLinks: assetPortalLinks,
          portalContinuity: {
            linkedCount: assetPortalLinks.length,
            missingRecoveryCount: assetPortalLinks.filter(
              (link) => !link?.portal_profiles?.recovery_contact_hint
            ).length,
          },
        }
      : null;

    return buildAutoDetailReviewQueueItems({
      autoPolicy,
      autoBundle: {
        autoDocuments,
        autoSnapshots,
        autoAnalytics,
      },
      assetBundle,
    });
  });
}

export function buildAutoDetailReviewQueueItems({
  autoPolicy = null,
  autoBundle = null,
  assetBundle = null,
  autoCommandCenter = null,
} = {}) {
  if (!autoPolicy?.id) return [];

  const commandCenter =
    autoCommandCenter ||
    buildAutoCommandCenter({
      autoPolicy,
      autoDocuments: autoBundle?.autoDocuments || [],
      autoSnapshots: autoBundle?.autoSnapshots || [],
      autoAnalytics: autoBundle?.autoAnalytics || [],
      assetBundle,
    });

  const dataUpdatedAt = buildLatestAutoTimestamp({
    autoPolicy,
    autoDocuments: autoBundle?.autoDocuments || [],
    autoSnapshots: autoBundle?.autoSnapshots || [],
    autoAnalytics: autoBundle?.autoAnalytics || [],
    assetBundle,
  });

  return commandCenter.blockers.map((blocker, index) => ({
    id: `auto:${autoPolicy.id}:${blocker.id}`,
    label: `${autoPolicy.policy_name || autoPolicy.assets?.asset_name || "Auto Policy"}: ${blocker.title}`,
    summary: blocker.blocker,
    change_signal: blocker.consequence,
    route: `/insurance/auto/detail/${autoPolicy.id}`,
    action_label: blocker.nextAction || "Open auto review",
    action_key: "open_auto_detail",
    urgency: blocker.urgency || "warning",
    source: "Auto",
    source_label: autoPolicy.auto_policy_type_key || "auto",
    auto_policy_id: autoPolicy.id,
    auto_policy_name: autoPolicy.policy_name || autoPolicy.assets?.asset_name || "Auto Policy",
    data_updated_at: dataUpdatedAt,
    blocker_title: blocker.title,
    blocker_stale_label: blocker.staleLabel || "",
    blocker_index: index,
  }));
}

function buildLatestHealthTimestamp({
  healthPlan,
  healthDocuments,
  healthSnapshots,
  healthAnalytics,
  assetBundle,
}) {
  const timestamps = [
    healthPlan?.updated_at,
    healthPlan?.created_at,
    ...(healthDocuments || []).map((item) => item?.updated_at || item?.created_at || item?.document_date),
    ...(healthSnapshots || []).map((item) => item?.updated_at || item?.created_at || item?.snapshot_date),
    ...(healthAnalytics || []).map((item) => item?.updated_at || item?.created_at),
    assetBundle?.asset?.updated_at,
    ...(assetBundle?.documents || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.alerts || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.tasks || []).map((item) => item?.updated_at || item?.created_at || item?.due_date),
    ...(assetBundle?.portalLinks || []).map((item) => item?.updated_at || item?.created_at),
  ]
    .map(toTimestamp)
    .filter((value) => value !== null);

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function buildHealthReviewQueueItems(bundle = {}) {
  const healthPlans = Array.isArray(bundle?.healthPlans) ? bundle.healthPlans : [];
  const healthDocumentsByPlanId = bundle?.healthSummary?.healthDocumentsByPlanId || {};
  const healthSnapshotsByPlanId = bundle?.healthSummary?.healthSnapshotsByPlanId || {};
  const healthAnalyticsByPlanId = bundle?.healthSummary?.healthAnalyticsByPlanId || {};
  const allDocuments = Array.isArray(bundle?.documents) ? bundle.documents : [];
  const allAlerts = Array.isArray(bundle?.openAlerts) ? bundle.openAlerts : [];
  const allTasks = Array.isArray(bundle?.openTasks) ? bundle.openTasks : [];
  const portalsByAssetId = buildPortalsByAssetId(bundle?.portals || []);

  return healthPlans.flatMap((healthPlan) => {
    if (!healthPlan?.id) return [];

    const linkedAsset = healthPlan.assets || null;
    const linkedAssetId = linkedAsset?.id || null;
    const healthDocuments = healthDocumentsByPlanId[healthPlan.id] || [];
    const healthSnapshots = healthSnapshotsByPlanId[healthPlan.id] || [];
    const healthAnalytics = healthAnalyticsByPlanId[healthPlan.id] || [];
    const assetDocuments = linkedAssetId ? allDocuments.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetAlerts = linkedAssetId ? allAlerts.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetTasks = linkedAssetId ? allTasks.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetPortalLinks = linkedAssetId ? portalsByAssetId[linkedAssetId] || [] : [];
    const assetBundle = linkedAsset
      ? {
          asset: linkedAsset,
          documents: assetDocuments,
          alerts: assetAlerts,
          tasks: assetTasks,
          portalLinks: assetPortalLinks,
          portalContinuity: {
            linkedCount: assetPortalLinks.length,
            missingRecoveryCount: assetPortalLinks.filter(
              (link) => !link?.portal_profiles?.recovery_contact_hint
            ).length,
          },
        }
      : null;

    return buildHealthDetailReviewQueueItems({
      healthPlan,
      healthBundle: {
        healthDocuments,
        healthSnapshots,
        healthAnalytics,
      },
      assetBundle,
    });
  });
}

export function buildHealthDetailReviewQueueItems({
  healthPlan = null,
  healthBundle = null,
  assetBundle = null,
  healthCommandCenter = null,
} = {}) {
  if (!healthPlan?.id) return [];

  const commandCenter =
    healthCommandCenter ||
    buildHealthCommandCenter({
      healthPlan,
      healthDocuments: healthBundle?.healthDocuments || [],
      healthSnapshots: healthBundle?.healthSnapshots || [],
      healthAnalytics: healthBundle?.healthAnalytics || [],
      assetBundle,
    });

  const dataUpdatedAt = buildLatestHealthTimestamp({
    healthPlan,
    healthDocuments: healthBundle?.healthDocuments || [],
    healthSnapshots: healthBundle?.healthSnapshots || [],
    healthAnalytics: healthBundle?.healthAnalytics || [],
    assetBundle,
  });

  return commandCenter.blockers.map((blocker, index) => ({
    id: `health:${healthPlan.id}:${blocker.id}`,
    label: `${healthPlan.plan_name || healthPlan.assets?.asset_name || "Health Plan"}: ${blocker.title}`,
    summary: blocker.blocker,
    change_signal: blocker.consequence,
    route: `/insurance/health/detail/${healthPlan.id}`,
    action_label: blocker.nextAction || "Open health review",
    action_key: "open_health_detail",
    urgency: blocker.urgency || "warning",
    source: "Health",
    source_label: healthPlan.health_plan_type_key || "health",
    health_plan_id: healthPlan.id,
    health_plan_name: healthPlan.plan_name || healthPlan.assets?.asset_name || "Health Plan",
    data_updated_at: dataUpdatedAt,
    blocker_title: blocker.title,
    blocker_stale_label: blocker.staleLabel || "",
    blocker_index: index,
  }));
}

function buildLatestWarrantyTimestamp({
  warranty,
  warrantyDocuments,
  warrantySnapshots,
  warrantyAnalytics,
  assetBundle,
}) {
  const timestamps = [
    warranty?.updated_at,
    warranty?.created_at,
    ...(warrantyDocuments || []).map((item) => item?.updated_at || item?.created_at || item?.document_date),
    ...(warrantySnapshots || []).map((item) => item?.updated_at || item?.created_at || item?.snapshot_date),
    ...(warrantyAnalytics || []).map((item) => item?.updated_at || item?.created_at),
    assetBundle?.asset?.updated_at,
    ...(assetBundle?.documents || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.alerts || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.tasks || []).map((item) => item?.updated_at || item?.created_at || item?.due_date),
    ...(assetBundle?.portalLinks || []).map((item) => item?.updated_at || item?.created_at),
  ]
    .map(toTimestamp)
    .filter((value) => value !== null);

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function buildWarrantyReviewQueueItems(bundle = {}) {
  const warranties = Array.isArray(bundle?.warranties) ? bundle.warranties : [];
  const warrantyDocumentsById = bundle?.warrantySummary?.warrantyDocumentsById || {};
  const warrantySnapshotsById = bundle?.warrantySummary?.warrantySnapshotsById || {};
  const warrantyAnalyticsById = bundle?.warrantySummary?.warrantyAnalyticsById || {};
  const allDocuments = Array.isArray(bundle?.documents) ? bundle.documents : [];
  const allAlerts = Array.isArray(bundle?.openAlerts) ? bundle.openAlerts : [];
  const allTasks = Array.isArray(bundle?.openTasks) ? bundle.openTasks : [];
  const portalsByAssetId = buildPortalsByAssetId(bundle?.portals || []);

  return warranties.flatMap((warranty) => {
    if (!warranty?.id) return [];

    const linkedAsset = warranty.assets || null;
    const linkedAssetId = linkedAsset?.id || null;
    const warrantyDocuments = warrantyDocumentsById[warranty.id] || [];
    const warrantySnapshots = warrantySnapshotsById[warranty.id] || [];
    const warrantyAnalytics = warrantyAnalyticsById[warranty.id] || [];
    const assetDocuments = linkedAssetId ? allDocuments.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetAlerts = linkedAssetId ? allAlerts.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetTasks = linkedAssetId ? allTasks.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetPortalLinks = linkedAssetId ? portalsByAssetId[linkedAssetId] || [] : [];
    const assetBundle = linkedAsset
      ? {
          asset: linkedAsset,
          documents: assetDocuments,
          alerts: assetAlerts,
          tasks: assetTasks,
          portalLinks: assetPortalLinks,
          portalContinuity: {
            linkedCount: assetPortalLinks.length,
            missingRecoveryCount: assetPortalLinks.filter(
              (link) => !link?.portal_profiles?.recovery_contact_hint
            ).length,
          },
        }
      : null;

    return buildWarrantyDetailReviewQueueItems({
      warranty,
      warrantyBundle: {
        warrantyDocuments,
        warrantySnapshots,
        warrantyAnalytics,
      },
      assetBundle,
    });
  });
}

export function buildWarrantyDetailReviewQueueItems({
  warranty = null,
  warrantyBundle = null,
  assetBundle = null,
  warrantyCommandCenter = null,
} = {}) {
  if (!warranty?.id) return [];

  const commandCenter =
    warrantyCommandCenter ||
    buildWarrantyCommandCenter({
      warranty,
      warrantyDocuments: warrantyBundle?.warrantyDocuments || [],
      warrantySnapshots: warrantyBundle?.warrantySnapshots || [],
      warrantyAnalytics: warrantyBundle?.warrantyAnalytics || [],
      assetBundle,
    });

  const dataUpdatedAt = buildLatestWarrantyTimestamp({
    warranty,
    warrantyDocuments: warrantyBundle?.warrantyDocuments || [],
    warrantySnapshots: warrantyBundle?.warrantySnapshots || [],
    warrantyAnalytics: warrantyBundle?.warrantyAnalytics || [],
    assetBundle,
  });

  return commandCenter.blockers.map((blocker, index) => ({
    id: `warranty:${warranty.id}:${blocker.id}`,
    label: `${warranty.contract_name || warranty.assets?.asset_name || "Warranty"}: ${blocker.title}`,
    summary: blocker.blocker,
    change_signal: blocker.consequence,
    route: `/warranties/detail/${warranty.id}`,
    action_label: blocker.nextAction || "Open warranty review",
    action_key: "open_warranty_detail",
    urgency: blocker.urgency || "warning",
    source: "Warranty",
    source_label: warranty.warranty_type_key || "warranty",
    warranty_id: warranty.id,
    warranty_name: warranty.contract_name || warranty.assets?.asset_name || "Warranty",
    data_updated_at: dataUpdatedAt,
    blocker_title: blocker.title,
    blocker_stale_label: blocker.staleLabel || "",
    blocker_index: index,
  }));
}

function buildLatestHomeownersTimestamp({
  homeownersPolicy,
  homeownersDocuments,
  homeownersSnapshots,
  homeownersAnalytics,
  propertyLinks,
  assetBundle,
}) {
  const timestamps = [
    homeownersPolicy?.updated_at,
    homeownersPolicy?.created_at,
    ...(homeownersDocuments || []).map((item) => item?.updated_at || item?.created_at || item?.document_date),
    ...(homeownersSnapshots || []).map((item) => item?.updated_at || item?.created_at || item?.snapshot_date),
    ...(homeownersAnalytics || []).map((item) => item?.updated_at || item?.created_at),
    ...(propertyLinks || []).map((item) => item?.updated_at || item?.created_at),
    assetBundle?.asset?.updated_at,
    ...(assetBundle?.documents || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.alerts || []).map((item) => item?.updated_at || item?.created_at),
    ...(assetBundle?.tasks || []).map((item) => item?.updated_at || item?.created_at || item?.due_date),
    ...(assetBundle?.portalLinks || []).map((item) => item?.updated_at || item?.created_at),
  ]
    .map(toTimestamp)
    .filter((value) => value !== null);

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function buildHomeownersReviewQueueItems(bundle = {}) {
  const homeownersPolicies = Array.isArray(bundle?.homeownersPolicies) ? bundle.homeownersPolicies : [];
  const homeownersDocumentsByPolicyId = bundle?.homeownersSummary?.homeownersDocumentsByPolicyId || {};
  const homeownersSnapshotsByPolicyId = bundle?.homeownersSummary?.homeownersSnapshotsByPolicyId || {};
  const homeownersAnalyticsByPolicyId = bundle?.homeownersSummary?.homeownersAnalyticsByPolicyId || {};
  const propertyHomeownersLinks = Array.isArray(bundle?.propertyHomeownersLinks) ? bundle.propertyHomeownersLinks : [];
  const properties = Array.isArray(bundle?.properties) ? bundle.properties : [];
  const allDocuments = Array.isArray(bundle?.documents) ? bundle.documents : [];
  const allAlerts = Array.isArray(bundle?.openAlerts) ? bundle.openAlerts : [];
  const allTasks = Array.isArray(bundle?.openTasks) ? bundle.openTasks : [];
  const portalsByAssetId = buildPortalsByAssetId(bundle?.portals || []);
  const propertiesById = Object.fromEntries(properties.map((item) => [item.id, item]));
  const linksByPolicyId = propertyHomeownersLinks.reduce((accumulator, link) => {
    if (!link?.homeowners_policy_id) return accumulator;
    if (!accumulator[link.homeowners_policy_id]) accumulator[link.homeowners_policy_id] = [];
    accumulator[link.homeowners_policy_id].push({
      ...link,
      properties: propertiesById[link.property_id] || link.properties || null,
    });
    return accumulator;
  }, {});

  return homeownersPolicies.flatMap((homeownersPolicy) => {
    if (!homeownersPolicy?.id) return [];

    const linkedAsset = homeownersPolicy.assets || null;
    const linkedAssetId = linkedAsset?.id || null;
    const homeownersDocuments = homeownersDocumentsByPolicyId[homeownersPolicy.id] || [];
    const homeownersSnapshots = homeownersSnapshotsByPolicyId[homeownersPolicy.id] || [];
    const homeownersAnalytics = homeownersAnalyticsByPolicyId[homeownersPolicy.id] || [];
    const propertyLinks = linksByPolicyId[homeownersPolicy.id] || [];
    const assetDocuments = linkedAssetId ? allDocuments.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetAlerts = linkedAssetId ? allAlerts.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetTasks = linkedAssetId ? allTasks.filter((item) => item?.asset_id === linkedAssetId) : [];
    const assetPortalLinks = linkedAssetId ? portalsByAssetId[linkedAssetId] || [] : [];
    const assetBundle = linkedAsset
      ? {
          asset: linkedAsset,
          documents: assetDocuments,
          alerts: assetAlerts,
          tasks: assetTasks,
          portalLinks: assetPortalLinks,
          portalContinuity: {
            linkedCount: assetPortalLinks.length,
            missingRecoveryCount: assetPortalLinks.filter(
              (link) => !link?.portal_profiles?.recovery_contact_hint
            ).length,
          },
        }
      : null;

    const commandCenter = buildHomeownersCommandCenter({
      homeownersPolicy,
      homeownersDocuments,
      homeownersSnapshots,
      homeownersAnalytics,
      propertyLinks,
      assetBundle,
    });

    const dataUpdatedAt = buildLatestHomeownersTimestamp({
      homeownersPolicy,
      homeownersDocuments,
      homeownersSnapshots,
      homeownersAnalytics,
      propertyLinks,
      assetBundle,
    });

    return commandCenter.blockers.map((blocker, index) => ({
      id: `homeowners:${homeownersPolicy.id}:${blocker.id}`,
      label: `${homeownersPolicy.policy_name || homeownersPolicy.property_address || "Homeowners Policy"}: ${blocker.title}`,
      summary: blocker.blocker,
      change_signal: blocker.consequence,
      route: `/insurance/homeowners/detail/${homeownersPolicy.id}`,
      action_label: blocker.nextAction || "Open homeowners review",
      action_key: "open_homeowners_detail",
      urgency: blocker.urgency || "warning",
      source: "Homeowners",
      source_label: homeownersPolicy.homeowners_policy_type_key || "homeowners",
      homeowners_policy_id: homeownersPolicy.id,
      homeowners_policy_name:
        homeownersPolicy.policy_name || homeownersPolicy.property_address || "Homeowners Policy",
      data_updated_at: dataUpdatedAt,
      blocker_title: blocker.title,
      blocker_stale_label: blocker.staleLabel || "",
      blocker_index: index,
    }));
  });
}

export function buildHomeownersDetailReviewQueueItems({
  homeownersPolicy = null,
  homeownersBundle = null,
  propertyLinks = [],
  assetBundle = null,
  homeownersCommandCenter = null,
} = {}) {
  if (!homeownersPolicy?.id) return [];

  const commandCenter =
    homeownersCommandCenter ||
    buildHomeownersCommandCenter({
      homeownersPolicy,
      homeownersDocuments: homeownersBundle?.homeownersDocuments || [],
      homeownersSnapshots: homeownersBundle?.homeownersSnapshots || [],
      homeownersAnalytics: homeownersBundle?.homeownersAnalytics || [],
      propertyLinks,
      assetBundle,
    });

  const dataUpdatedAt = buildLatestHomeownersTimestamp({
    homeownersPolicy,
    homeownersDocuments: homeownersBundle?.homeownersDocuments || [],
    homeownersSnapshots: homeownersBundle?.homeownersSnapshots || [],
    homeownersAnalytics: homeownersBundle?.homeownersAnalytics || [],
    propertyLinks,
    assetBundle,
  });

  return commandCenter.blockers.map((blocker, index) => ({
    id: `homeowners:${homeownersPolicy.id}:${blocker.id}`,
    label: `${homeownersPolicy.policy_name || homeownersPolicy.property_address || "Homeowners Policy"}: ${blocker.title}`,
    summary: blocker.blocker,
    change_signal: blocker.consequence,
    route: `/insurance/homeowners/detail/${homeownersPolicy.id}`,
    action_label: blocker.nextAction || "Open homeowners review",
    action_key: "open_homeowners_detail",
    urgency: blocker.urgency || "warning",
    source: "Homeowners",
    source_label: homeownersPolicy.homeowners_policy_type_key || "homeowners",
    homeowners_policy_id: homeownersPolicy.id,
    homeowners_policy_name:
      homeownersPolicy.policy_name || homeownersPolicy.property_address || "Homeowners Policy",
    data_updated_at: dataUpdatedAt,
    blocker_title: blocker.title,
    blocker_stale_label: blocker.staleLabel || "",
    blocker_index: index,
  }));
}
