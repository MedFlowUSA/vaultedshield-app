function toTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getDaysStalled(value) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return null;
  const diffMs = Date.now() - timestamp;
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function formatDaysStalled(days) {
  if (days === null || days === undefined) return "Fresh";
  if (days <= 0) return "Updated today";
  if (days === 1) return "Stalled 1 day";
  return `Stalled ${days} days`;
}

function metricListFromObject(metrics = {}) {
  return Object.entries(metrics).map(([label, value]) => ({
    label,
    value,
  }));
}

export function getCommandUrgencyMeta(level = "warning") {
  if (level === "critical") {
    return {
      label: "Critical",
      badge: "CRITICAL",
      accent: "#991b1b",
      background: "rgba(239,68,68,0.14)",
      border: "1px solid rgba(248,113,113,0.34)",
    };
  }
  if (level === "ready") {
    return {
      label: "Ready",
      badge: "READY",
      accent: "#166534",
      background: "rgba(34,197,94,0.14)",
      border: "1px solid rgba(74,222,128,0.32)",
    };
  }
  return {
    label: "Warning",
    badge: "WARNING",
    accent: "#9a3412",
    background: "rgba(249,115,22,0.14)",
    border: "1px solid rgba(251,146,60,0.34)",
  };
}

function buildDashboardBlocker(item = {}) {
  const daysStalled = getDaysStalled(item.data_updated_at || item.workflow_updated_at || null);
  const isPendingDocs = item.workflow_status === "pending_documents";
  const isFollowUp = item.workflow_status === "follow_up";
  const isChanged = Boolean(item.changed_since_review);
  const priorityScore = Number(item.priority_score || 0);

  let urgency = "warning";
  if (isPendingDocs || isChanged || priorityScore >= 80 || daysStalled >= 7) {
    urgency = "critical";
  } else if (priorityScore < 55 && !isFollowUp && !isPendingDocs) {
    urgency = "ready";
  }

  let blocker = item.summary || "A household review item still needs attention.";
  let consequence = item.change_signal || "Continuity quality remains weaker until this item is resolved.";

  if (isPendingDocs) {
    blocker = item.summary || "Documents are still missing for this review path.";
    consequence = "Documentation is incomplete, which weakens review confidence and can stall downstream decisions.";
  } else if (isChanged) {
    consequence = item.change_signal || "New evidence arrived after a prior review, so the prior read should not be treated as final.";
  } else if (daysStalled !== null && daysStalled >= 5) {
    consequence = "This issue has been sitting long enough to reduce household continuity confidence.";
  }

  return {
    id: item.id,
    title: item.label || "Household review item",
    route: item.route || "/dashboard",
    nextAction: item.action_label || "Open review",
    blocker,
    consequence,
    urgency,
    urgencyMeta: getCommandUrgencyMeta(urgency),
    daysStalled,
    staleLabel: formatDaysStalled(daysStalled),
  };
}

export function buildDashboardCommandCenter({
  queueItems = [],
  topActions = [],
  reviewDigest = null,
  householdMap = null,
} = {}) {
  const activeBlockers = queueItems
    .filter((item) => item.workflow_status !== "reviewed" || item.changed_since_review)
    .map(buildDashboardBlocker)
    .sort((left, right) => {
      const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
      const urgencyDelta = (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
      if (urgencyDelta !== 0) return urgencyDelta;
      return (right.daysStalled || 0) - (left.daysStalled || 0);
    });

  const criticalCount = activeBlockers.filter((item) => item.urgency === "critical").length;
  const warningCount = activeBlockers.filter((item) => item.urgency === "warning").length;
  const stalledCount = activeBlockers.filter((item) => (item.daysStalled || 0) >= 5).length;

  const fallbackActions = (topActions || []).slice(0, 3).map((item, index) => ({
    id: item.id || `fallback-${index}`,
    title: item.label || "Suggested review",
    route: item.route || "/dashboard",
    nextAction: "Open review",
    blocker: item.summary || "A recommended household review is available.",
    consequence: "Opening the suggested review will strengthen the household operating picture.",
    urgency: "ready",
    urgencyMeta: getCommandUrgencyMeta("ready"),
    daysStalled: null,
    staleLabel: "Fresh",
  }));

  const blockers = activeBlockers.length > 0 ? activeBlockers.slice(0, 4) : fallbackActions;
  const topBlocker = blockers[0] || null;

  const headline =
    criticalCount > 0
      ? `${criticalCount} command item${criticalCount === 1 ? "" : "s"} need immediate attention.`
      : warningCount > 0
        ? `${warningCount} command item${warningCount === 1 ? "" : "s"} should be reviewed soon.`
        : "No major command blockers are active right now.";

  const summary =
    topBlocker?.urgency === "critical"
      ? `${topBlocker.title} is the strongest current blocker. ${topBlocker.staleLabel}.`
      : reviewDigest?.summary || householdMap?.bottom_line || "The household continuity picture is currently stable enough for normal review work.";

  return {
    headline,
    summary,
    blockers,
    metrics: {
      active: activeBlockers.length,
      critical: criticalCount,
      warning: warningCount,
      stalled: stalledCount,
    },
  };
}

export function buildAssetCommandCenter(bundle = {}) {
  const asset = bundle.asset || null;
  const documents = Array.isArray(bundle.documents) ? bundle.documents : [];
  const alerts = Array.isArray(bundle.alerts) ? bundle.alerts : [];
  const tasks = Array.isArray(bundle.tasks) ? bundle.tasks : [];
  const portalLinks = Array.isArray(bundle.portalLinks) ? bundle.portalLinks : [];
  const missingRecoveryCount = bundle.portalContinuity?.missingRecoveryCount || 0;

  const blockers = [];

  alerts.forEach((alert) => {
    const severity = alert.severity === "urgent" ? "critical" : alert.severity === "warning" ? "warning" : "ready";
    blockers.push({
      id: `alert-${alert.id}`,
      title: alert.title || "Asset alert",
      blocker: alert.description || alert.alert_type || "This asset has an open alert.",
      consequence: severity === "critical"
        ? "Open alerts should be resolved before this asset is treated as stable."
        : "Alert pressure is visible on this asset and should be reviewed soon.",
      nextAction: "Review asset alert",
      urgency: severity,
      urgencyMeta: getCommandUrgencyMeta(severity),
      daysStalled: getDaysStalled(alert.updated_at || alert.created_at || null),
      staleLabel: formatDaysStalled(getDaysStalled(alert.updated_at || alert.created_at || null)),
    });
  });

  tasks.forEach((task) => {
    const daysStalled = getDaysStalled(task.due_date || task.updated_at || task.created_at || null);
    const overdue = toTimestamp(task.due_date) !== null && toTimestamp(task.due_date) < Date.now();
    const urgency = overdue ? "critical" : daysStalled >= 5 ? "warning" : "ready";
    blockers.push({
      id: `task-${task.id}`,
      title: task.title || "Asset task",
      blocker: task.description || task.task_type || "This asset has an open task.",
      consequence: overdue
        ? "The due date has passed, so this asset is now carrying stale follow-up."
        : "Open task follow-through is still part of keeping this asset current.",
      nextAction: overdue ? "Resolve overdue task" : "Review asset task",
      urgency,
      urgencyMeta: getCommandUrgencyMeta(urgency),
      daysStalled,
      staleLabel: overdue ? `Overdue since ${formatDaysStalled(daysStalled)}` : formatDaysStalled(daysStalled),
    });
  });

  if (documents.length === 0) {
    blockers.push({
      id: "asset-no-documents",
      title: "No linked documents",
      blocker: `This ${asset?.asset_category || "asset"} does not have any linked support documents yet.`,
      consequence: "Without evidence in the vault, continuity review stays thin and harder to trust.",
      nextAction: "Upload supporting documents",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "No evidence yet",
    });
  }

  if (portalLinks.length === 0) {
    blockers.push({
      id: "asset-no-portals",
      title: "Access continuity not mapped",
      blocker: "No linked portal or access record is attached to this asset yet.",
      consequence: "Emergency access and recovery readiness remain weak until this is mapped.",
      nextAction: "Link a portal",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Access gap",
    });
  } else if (missingRecoveryCount > 0) {
    blockers.push({
      id: "asset-recovery-gap",
      title: "Recovery hints missing",
      blocker: `${missingRecoveryCount} linked portal${missingRecoveryCount === 1 ? "" : "s"} still miss recovery contact hints.`,
      consequence: "Access continuity is incomplete, which weakens emergency handoff confidence.",
      nextAction: "Add recovery hints",
      urgency: missingRecoveryCount >= 2 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(missingRecoveryCount >= 2 ? "critical" : "warning"),
      daysStalled: null,
      staleLabel: "Continuity gap",
    });
  }

  const sorted = blockers.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    const urgencyDelta = (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
    if (urgencyDelta !== 0) return urgencyDelta;
    return (right.daysStalled || 0) - (left.daysStalled || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} asset continuity items are visible.`
        : "This asset does not currently show major continuity blockers.",
    blockers: sorted.slice(0, 4),
    metrics: {
      critical: sorted.filter((item) => item.urgency === "critical").length,
      warning: sorted.filter((item) => item.urgency === "warning").length,
      documents: documents.length,
      linkedPortals: portalLinks.length,
    },
  };
}

export function buildPropertyCommandCenter({
  property = null,
  propertyDocuments = [],
  propertyStackAnalytics = null,
  propertyEquityPosition = null,
  latestPropertyValuation = null,
  valuationChangeSummary = null,
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
  assetBundle = null,
} = {}) {
  const blockers = [];
  const portalLinks = Array.isArray(assetBundle?.portalLinks) ? assetBundle.portalLinks : [];
  const missingRecoveryCount = Number(assetBundle?.portalContinuity?.missingRecoveryCount || 0);
  const assetAlerts = Array.isArray(assetBundle?.alerts) ? assetBundle.alerts : [];
  const assetTasks = Array.isArray(assetBundle?.tasks) ? assetBundle.tasks : [];
  const reviewFlags = [
    ...(propertyStackAnalytics?.review_flags || []),
    ...(propertyEquityPosition?.review_flags || []),
  ];
  const valuationUpdatedAt =
    latestPropertyValuation?.updated_at ||
    latestPropertyValuation?.created_at ||
    propertyStackAnalytics?.updated_at ||
    property?.updated_at ||
    null;
  const valuationDaysStalled = getDaysStalled(valuationUpdatedAt);
  const documentCount = Array.isArray(propertyDocuments) ? propertyDocuments.length : 0;

  if (linkedHomeownersPolicies.length === 0) {
    blockers.push({
      id: "property-missing-homeowners",
      title: "Coverage linkage missing",
      blocker: "No homeowners policy is linked to this property yet.",
      consequence: "Coverage continuity is weak, so loss review and household exposure stay harder to trust.",
      nextAction: "Link a homeowners policy",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: valuationDaysStalled,
      staleLabel: formatDaysStalled(valuationDaysStalled),
    });
  }

  if (linkedMortgages.length === 0 && propertyStackAnalytics?.linkage_status !== "owned_free_clear") {
    blockers.push({
      id: "property-missing-mortgage",
      title: "Financing linkage missing",
      blocker: "No mortgage record is linked to this property.",
      consequence: "Debt visibility is incomplete, which weakens equity, payoff, and continuity planning.",
      nextAction: "Link the current mortgage",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: valuationDaysStalled,
      staleLabel: formatDaysStalled(valuationDaysStalled),
    });
  }

  if (reviewFlags.includes("invalid_saved_valuation")) {
    blockers.push({
      id: "property-invalid-valuation",
      title: "Valuation confidence is compromised",
      blocker: "The latest property value includes invalid saved valuation signals.",
      consequence: "Equity and protection decisions can drift if this valuation is treated as final.",
      nextAction: "Re-run property valuation",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: valuationDaysStalled,
      staleLabel: formatDaysStalled(valuationDaysStalled),
    });
  } else if (!latestPropertyValuation) {
    blockers.push({
      id: "property-no-valuation",
      title: "No valuation on file",
      blocker: "This property does not have a current valuation read yet.",
      consequence: "Equity and coverage planning remain mostly manual until a value baseline exists.",
      nextAction: "Run virtual valuation",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "No baseline yet",
    });
  } else if (
    latestPropertyValuation?.confidence_label === "weak" ||
    valuationChangeSummary?.change_status === "material_change" ||
    valuationDaysStalled >= 30
  ) {
    blockers.push({
      id: "property-valuation-review",
      title: "Valuation review needed",
      blocker:
        valuationChangeSummary?.summary ||
        "The current property valuation should be reviewed before it is relied on operationally.",
      consequence: "Property decisions can drift if the valuation story is stale or materially changed.",
      nextAction: "Review valuation and comps",
      urgency:
        valuationChangeSummary?.change_status === "material_change" || valuationDaysStalled >= 45
          ? "critical"
          : "warning",
      urgencyMeta: getCommandUrgencyMeta(
        valuationChangeSummary?.change_status === "material_change" || valuationDaysStalled >= 45
          ? "critical"
          : "warning"
      ),
      daysStalled: valuationDaysStalled,
      staleLabel: formatDaysStalled(valuationDaysStalled),
    });
  }

  if (documentCount === 0) {
    blockers.push({
      id: "property-no-documents",
      title: "Property evidence is thin",
      blocker: "No property documents are attached to this record yet.",
      consequence: "Tax, title, valuation, and transfer review remain weaker without source evidence in the vault.",
      nextAction: "Upload property documents",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "No evidence yet",
    });
  }

  if (portalLinks.length === 0) {
    blockers.push({
      id: "property-no-portal-link",
      title: "Portal continuity not mapped",
      blocker: "No county, mortgage, or carrier portal continuity record is linked yet.",
      consequence: "Access recovery is weaker if this property must be managed during a stressful event.",
      nextAction: "Link property portals",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Access gap",
    });
  } else if (missingRecoveryCount > 0) {
    blockers.push({
      id: "property-recovery-gap",
      title: "Recovery guidance incomplete",
      blocker: `${missingRecoveryCount} linked portal${missingRecoveryCount === 1 ? "" : "s"} still miss recovery hints.`,
      consequence: "Emergency access continuity is still incomplete for this property stack.",
      nextAction: "Add portal recovery hints",
      urgency: missingRecoveryCount >= 2 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(missingRecoveryCount >= 2 ? "critical" : "warning"),
      daysStalled: null,
      staleLabel: "Continuity gap",
    });
  }

  const overdueTask = assetTasks.find((task) => {
    const due = toTimestamp(task?.due_date);
    return due !== null && due < Date.now();
  });
  if (overdueTask) {
    const daysStalled = getDaysStalled(overdueTask.due_date || overdueTask.updated_at || overdueTask.created_at || null);
    blockers.push({
      id: `property-overdue-task-${overdueTask.id}`,
      title: "Property follow-up is overdue",
      blocker: overdueTask.title || overdueTask.description || "A property-linked task is overdue.",
      consequence: "The property stack can quietly age out of date when open follow-up is left unresolved.",
      nextAction: "Resolve overdue task",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled,
      staleLabel: `Overdue since ${formatDaysStalled(daysStalled)}`,
    });
  }

  const urgentAlert = assetAlerts.find((alert) => alert?.severity === "urgent");
  if (urgentAlert) {
    const daysStalled = getDaysStalled(urgentAlert.updated_at || urgentAlert.created_at || null);
    blockers.push({
      id: `property-urgent-alert-${urgentAlert.id}`,
      title: "Urgent property alert",
      blocker: urgentAlert.title || urgentAlert.description || "A property-linked alert needs attention.",
      consequence: "Current property continuity should not be treated as stable until this alert is reviewed.",
      nextAction: "Review urgent alert",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled,
      staleLabel: formatDaysStalled(daysStalled),
    });
  }

  const sorted = blockers.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    const urgencyDelta = (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
    if (urgencyDelta !== 0) return urgencyDelta;
    return (right.daysStalled || 0) - (left.daysStalled || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} property command items are visible.`
        : "This property currently looks operationally steady.",
    blockers: sorted.slice(0, 4),
    metrics: {
      critical: sorted.filter((item) => item.urgency === "critical").length,
      warning: sorted.filter((item) => item.urgency === "warning").length,
      linkedMortgages: linkedMortgages.length,
      linkedHomeowners: linkedHomeownersPolicies.length,
      documents: documentCount,
    },
  };
}

export function buildPropertyHubCommand(properties = []) {
  const rows = (properties || [])
    .map((property) => {
      const linkedAsset = property.assets || null;
      const hasAssetLink = Boolean(linkedAsset?.id);
      const urgency = hasAssetLink ? "warning" : "critical";
      return {
        id: property.id,
        title: property.property_name || linkedAsset?.asset_name || property.property_address || "Property",
        blocker: hasAssetLink
          ? "Property record exists, but detail review is still needed to confirm valuation, docs, and linkage."
          : "The property is not fully linked into the shared asset layer yet.",
        consequence: hasAssetLink
          ? "Until detail review happens, continuity and evidence quality remain partly assumed."
          : "Cross-module continuity stays weaker until the generic asset link is in place.",
        nextAction: hasAssetLink ? "Open property detail" : "Open property setup",
        urgency,
        urgencyMeta: getCommandUrgencyMeta(urgency),
      };
    })
    .slice(0, 4);

  return {
    headline:
      rows.length > 0
        ? `${rows.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} property review items are visible.`
        : "No property command items are active yet.",
    rows,
    metrics: {
      total: (properties || []).length,
      assetLinked: (properties || []).filter((item) => Boolean(item.assets?.id)).length,
      attention: rows.length,
    },
  };
}

export function buildRetirementCommandCenter({
  retirementAccount = null,
  retirementRead = null,
  retirementDocuments = [],
  retirementSnapshots = [],
  retirementAnalytics = [],
  retirementPositions = [],
  assetBundle = null,
} = {}) {
  const blockers = [];
  const documents = Array.isArray(retirementDocuments) ? retirementDocuments : [];
  const snapshots = Array.isArray(retirementSnapshots) ? retirementSnapshots : [];
  const analytics = Array.isArray(retirementAnalytics) ? retirementAnalytics : [];
  const positions = Array.isArray(retirementPositions) ? retirementPositions : [];
  const portalLinks = Array.isArray(assetBundle?.portalLinks) ? assetBundle.portalLinks : [];
  const missingRecoveryCount = Number(assetBundle?.portalContinuity?.missingRecoveryCount || 0);
  const assetAlerts = Array.isArray(assetBundle?.alerts) ? assetBundle.alerts : [];
  const assetTasks = Array.isArray(assetBundle?.tasks) ? assetBundle.tasks : [];
  const latestSnapshot = snapshots[0] || null;
  const latestAnalytics = analytics[0] || null;
  const statementDate =
    latestSnapshot?.normalized_retirement?.statement_context?.statement_date ||
    latestSnapshot?.snapshot_date ||
    latestSnapshot?.created_at ||
    null;
  const statementDaysStalled = getDaysStalled(statementDate);

  if (documents.length === 0) {
    blockers.push({
      id: "retirement-no-documents",
      title: "No retirement statement support",
      blocker: "No retirement documents are attached to this account yet.",
      consequence: "Planning and continuity review stay weaker without statement evidence in the vault.",
      nextAction: "Upload retirement documents",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "No evidence yet",
    });
  }

  if (!retirementRead || retirementRead.readinessStatus === "Needs Review") {
    blockers.push({
      id: "retirement-needs-review",
      title: "Retirement read still needs support",
      blocker:
        retirementRead?.headline ||
        "This retirement account does not yet have a dependable read.",
      consequence: "Balance, contribution, or statement visibility is still too thin for confident planning decisions.",
      nextAction: snapshots.length > 0 ? "Review latest snapshot" : "Parse a retirement statement",
      urgency: documents.length === 0 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(documents.length === 0 ? "critical" : "warning"),
      daysStalled: statementDaysStalled,
      staleLabel: statementDaysStalled === null ? "No statement yet" : formatDaysStalled(statementDaysStalled),
    });
  } else if (statementDaysStalled !== null && statementDaysStalled >= 180) {
    blockers.push({
      id: "retirement-stale-statement",
      title: "Retirement statement is stale",
      blocker: "The latest retirement snapshot is getting old.",
      consequence: "Contribution pace, balances, loans, and beneficiary assumptions may no longer reflect reality.",
      nextAction: "Upload a newer statement",
      urgency: statementDaysStalled >= 365 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(statementDaysStalled >= 365 ? "critical" : "warning"),
      daysStalled: statementDaysStalled,
      staleLabel: formatDaysStalled(statementDaysStalled),
    });
  }

  if (retirementRead?.flags?.includes("contributions_missing")) {
    blockers.push({
      id: "retirement-contributions-missing",
      title: "Contribution visibility is limited",
      blocker: "The current read does not clearly show retirement contribution activity.",
      consequence: "Planner assumptions are weaker when ongoing savings pace is unclear.",
      nextAction: "Review contribution details",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: statementDaysStalled,
      staleLabel: statementDaysStalled === null ? "Needs detail" : formatDaysStalled(statementDaysStalled),
    });
  }

  if (
    latestAnalytics?.review_flags?.some((flag) => String(flag).includes("beneficiary")) ||
    latestAnalytics?.normalized_intelligence?.beneficiary_flags?.beneficiary_missing
  ) {
    blockers.push({
      id: "retirement-beneficiary-review",
      title: "Beneficiary review needed",
      blocker: "Beneficiary visibility is missing or flagged in the current retirement analytics.",
      consequence: "Transfer continuity can break even when account balances look healthy.",
      nextAction: "Review beneficiary designation",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: statementDaysStalled,
      staleLabel: statementDaysStalled === null ? "Needs beneficiary review" : formatDaysStalled(statementDaysStalled),
    });
  }

  if (
    latestAnalytics?.review_flags?.some((flag) => String(flag).includes("loan")) ||
    latestAnalytics?.normalized_intelligence?.loan_flags?.outstanding_loan_detected
  ) {
    blockers.push({
      id: "retirement-loan-review",
      title: "Loan exposure visible",
      blocker: "A retirement loan signal is present in the current account review.",
      consequence: "Outstanding loans can reduce effective retirement value and complicate job-change or rollover decisions.",
      nextAction: "Review retirement loan impact",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: statementDaysStalled,
      staleLabel: statementDaysStalled === null ? "Loan review pending" : formatDaysStalled(statementDaysStalled),
    });
  }

  if (positions.length === 0 && snapshots.length > 0) {
    blockers.push({
      id: "retirement-no-positions",
      title: "Allocation detail is limited",
      blocker: "A snapshot exists, but no parsed position detail is visible yet.",
      consequence: "Allocation and concentration review remain shallow until holdings are visible.",
      nextAction: "Parse another statement with holdings detail",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: statementDaysStalled,
      staleLabel: statementDaysStalled === null ? "No holdings yet" : formatDaysStalled(statementDaysStalled),
    });
  }

  if (portalLinks.length === 0) {
    blockers.push({
      id: "retirement-no-portal-link",
      title: "Access continuity not mapped",
      blocker: "No retirement portal continuity record is linked yet.",
      consequence: "Access recovery and emergency handoff remain weaker for this account.",
      nextAction: "Link retirement portal",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Access gap",
    });
  } else if (missingRecoveryCount > 0) {
    blockers.push({
      id: "retirement-recovery-gap",
      title: "Recovery guidance incomplete",
      blocker: `${missingRecoveryCount} linked portal${missingRecoveryCount === 1 ? "" : "s"} still miss recovery hints.`,
      consequence: "Retirement access continuity is still incomplete if a household handoff is needed.",
      nextAction: "Add portal recovery hints",
      urgency: missingRecoveryCount >= 2 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(missingRecoveryCount >= 2 ? "critical" : "warning"),
      daysStalled: null,
      staleLabel: "Continuity gap",
    });
  }

  const overdueTask = assetTasks.find((task) => {
    const due = toTimestamp(task?.due_date);
    return due !== null && due < Date.now();
  });
  if (overdueTask) {
    const daysStalled = getDaysStalled(overdueTask.due_date || overdueTask.updated_at || overdueTask.created_at || null);
    blockers.push({
      id: `retirement-overdue-task-${overdueTask.id}`,
      title: "Retirement follow-up is overdue",
      blocker: overdueTask.title || overdueTask.description || "A retirement-linked task is overdue.",
      consequence: "The account can quietly drift out of date when follow-up is left unresolved.",
      nextAction: "Resolve overdue task",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled,
      staleLabel: `Overdue since ${formatDaysStalled(daysStalled)}`,
    });
  }

  const urgentAlert = assetAlerts.find((alert) => alert?.severity === "urgent");
  if (urgentAlert) {
    const daysStalled = getDaysStalled(urgentAlert.updated_at || urgentAlert.created_at || null);
    blockers.push({
      id: `retirement-urgent-alert-${urgentAlert.id}`,
      title: "Urgent retirement alert",
      blocker: urgentAlert.title || urgentAlert.description || "A retirement-linked alert needs attention.",
      consequence: "This account should not be treated as stable until the alert is reviewed.",
      nextAction: "Review urgent alert",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled,
      staleLabel: formatDaysStalled(daysStalled),
    });
  }

  const sorted = blockers.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    const urgencyDelta = (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
    if (urgencyDelta !== 0) return urgencyDelta;
    return (right.daysStalled || 0) - (left.daysStalled || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} retirement command items are visible.`
        : "This retirement account currently looks operationally steady.",
    blockers: sorted.slice(0, 5),
    metrics: {
      critical: sorted.filter((item) => item.urgency === "critical").length,
      warning: sorted.filter((item) => item.urgency === "warning").length,
      documents: documents.length,
      snapshots: snapshots.length,
      positions: positions.length,
    },
  };
}

export function buildRetirementHubCommand({
  accounts = [],
  readinessSnapshot = null,
  retirementHouseholdRead = null,
} = {}) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const rows = [];

  if (!readinessSnapshot) {
    rows.push({
      id: "retirement-goal-missing",
      title: "Retirement goal is not saved",
      blocker: "The household still does not have a saved retirement goal snapshot.",
      consequence: "The hub cannot tell whether current retirement accounts are enough or still behind plan.",
      nextAction: "Set retirement goal",
      urgency: safeAccounts.length > 0 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(safeAccounts.length > 0 ? "critical" : "warning"),
    });
  } else if (readinessSnapshot.readinessStatus === "Behind") {
    rows.push({
      id: "retirement-behind",
      title: "Retirement plan is behind target",
      blocker: "Saved retirement goals currently show the household behind plan.",
      consequence: "Delay in reviewing contributions, timing, or account mix increases long-term funding pressure.",
      nextAction: "Review retirement goal plan",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
    });
  } else if (readinessSnapshot.readinessStatus === "Moderately Behind") {
    rows.push({
      id: "retirement-moderately-behind",
      title: "Retirement plan needs attention",
      blocker: "The household retirement snapshot shows room for improvement.",
      consequence: "If ignored, the funding gap can widen quietly over time.",
      nextAction: "Tune savings and goal assumptions",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
    });
  }

  const inactiveEmployerPlans = safeAccounts.filter((account) => {
    const status = String(account?.plan_status || "").toLowerCase();
    const key = String(account?.retirement_type_key || "");
    return ["inactive", "terminated", "frozen", "payout_only"].includes(status) && (key.includes("401") || key.includes("403") || key.includes("457"));
  });
  if (inactiveEmployerPlans.length > 0) {
    rows.push({
      id: "retirement-rollover-candidates",
      title: "Rollover review candidates exist",
      blocker: `${inactiveEmployerPlans.length} employer plan${inactiveEmployerPlans.length === 1 ? "" : "s"} are inactive or terminated.`,
      consequence: "Old plans can become easy to overlook and harder to coordinate with the broader retirement picture.",
      nextAction: "Review rollover candidates",
      urgency: inactiveEmployerPlans.length >= 2 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(inactiveEmployerPlans.length >= 2 ? "critical" : "warning"),
    });
  }

  if (safeAccounts.length === 0) {
    rows.push({
      id: "retirement-no-accounts",
      title: "No retirement accounts visible",
      blocker: "The retirement module is still empty.",
      consequence: "Retirement continuity and planning remain mostly theoretical until at least one account is tracked.",
      nextAction: "Create first retirement account",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
    });
  }

  return {
    headline:
      rows.length > 0
        ? `${rows.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} retirement review items are visible.`
        : retirementHouseholdRead?.headline || "No major retirement command items are active right now.",
    rows: rows.slice(0, 4),
    metrics: {
      total: safeAccounts.length,
      active: safeAccounts.filter((account) => String(account?.plan_status || "").toLowerCase() === "active").length,
      attention: rows.length,
    },
  };
}

export function buildMortgageCommandCenter({
  mortgageLoan = null,
  mortgageReview = null,
  mortgageDocuments = [],
  mortgageSnapshots = [],
  mortgageAnalytics = [],
  propertyLinks = [],
  assetBundle = null,
} = {}) {
  const blockers = [];
  const documents = Array.isArray(mortgageDocuments) ? mortgageDocuments : [];
  const snapshots = Array.isArray(mortgageSnapshots) ? mortgageSnapshots : [];
  const analytics = Array.isArray(mortgageAnalytics) ? mortgageAnalytics : [];
  const links = Array.isArray(propertyLinks) ? propertyLinks : [];
  const portalLinks = Array.isArray(assetBundle?.portalLinks) ? assetBundle.portalLinks : [];
  const missingRecoveryCount = Number(assetBundle?.portalContinuity?.missingRecoveryCount || 0);
  const assetAlerts = Array.isArray(assetBundle?.alerts) ? assetBundle.alerts : [];
  const assetTasks = Array.isArray(assetBundle?.tasks) ? assetBundle.tasks : [];
  const latestSnapshot = snapshots[0] || null;
  const latestStatementDate = latestSnapshot?.snapshot_date || latestSnapshot?.created_at || null;
  const statementDaysStalled = getDaysStalled(latestStatementDate);

  if (documents.length === 0) {
    blockers.push({
      id: "mortgage-no-documents",
      title: "No mortgage statement support",
      blocker: "No mortgage documents are attached to this loan yet.",
      consequence: "Payment, escrow, payoff, and servicer review stay weaker without source evidence in the vault.",
      nextAction: "Upload mortgage documents",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "No evidence yet",
    });
  }

  if (!links.length) {
    blockers.push({
      id: "mortgage-no-property-link",
      title: "Collateral linkage missing",
      blocker: "This mortgage is not linked to a property record yet.",
      consequence: "Property, debt, and coverage continuity stay fragmented until the collateral relationship is explicit.",
      nextAction: "Link property",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "Stack gap",
    });
  }

  if (!mortgageReview || mortgageReview.readinessStatus === "Needs Review") {
    blockers.push({
      id: "mortgage-needs-review",
      title: "Mortgage review support is weak",
      blocker:
        mortgageReview?.headline ||
        "This mortgage record still needs stronger debt-review support.",
      consequence: "Debt decisions can drift when payment, rate, property, or statement visibility is incomplete.",
      nextAction: documents.length > 0 ? "Review mortgage detail" : "Upload latest statement",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: statementDaysStalled,
      staleLabel: statementDaysStalled === null ? "No statement yet" : formatDaysStalled(statementDaysStalled),
    });
  } else if (mortgageReview.readinessStatus === "Review Soon") {
    blockers.push({
      id: "mortgage-review-soon",
      title: "Mortgage review should stay active",
      blocker: mortgageReview.headline,
      consequence: "Payment, rate, payoff, or refinance context may need attention before this loan is treated as settled.",
      nextAction:
        mortgageReview.metrics?.refinanceStatus === "review"
          ? "Review refinance options"
          : mortgageReview.metrics?.payoffStatus === "review"
            ? "Review payoff timing"
            : "Review loan detail",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: statementDaysStalled,
      staleLabel: statementDaysStalled === null ? "Needs review" : formatDaysStalled(statementDaysStalled),
    });
  }

  if (mortgageReview?.flags?.includes("escrow_visibility_limited")) {
    blockers.push({
      id: "mortgage-escrow-limited",
      title: "Escrow visibility is limited",
      blocker: "Escrow support is not clearly visible in the current mortgage read.",
      consequence: "Tax and insurance payment continuity can become harder to confirm or reconcile.",
      nextAction: "Review escrow details",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: statementDaysStalled,
      staleLabel: statementDaysStalled === null ? "Needs escrow review" : formatDaysStalled(statementDaysStalled),
    });
  }

  if (mortgageReview?.flags?.includes("lender_unconfirmed")) {
    blockers.push({
      id: "mortgage-servicer-unconfirmed",
      title: "Servicer identity is limited",
      blocker: "The lender or servicer is not clearly confirmed on this mortgage record.",
      consequence: "Portal continuity, payoff requests, and borrower handoff become weaker when servicer identity is uncertain.",
      nextAction: "Confirm servicer details",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: statementDaysStalled,
      staleLabel: statementDaysStalled === null ? "Needs servicer confirmation" : formatDaysStalled(statementDaysStalled),
    });
  }

  if (statementDaysStalled !== null && statementDaysStalled >= 90) {
    blockers.push({
      id: "mortgage-stale-statement",
      title: "Mortgage statement is stale",
      blocker: "The latest mortgage snapshot is aging out of date.",
      consequence: "Payment, escrow, payoff, and delinquency assumptions can quietly go stale.",
      nextAction: "Upload a newer mortgage statement",
      urgency: statementDaysStalled >= 180 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(statementDaysStalled >= 180 ? "critical" : "warning"),
      daysStalled: statementDaysStalled,
      staleLabel: formatDaysStalled(statementDaysStalled),
    });
  }

  if (portalLinks.length === 0) {
    blockers.push({
      id: "mortgage-no-portal-link",
      title: "Lender access continuity not mapped",
      blocker: "No lender or servicer portal continuity record is linked yet.",
      consequence: "Access recovery is weaker if the household needs account access during a stressful event.",
      nextAction: "Link mortgage portal",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Access gap",
    });
  } else if (missingRecoveryCount > 0) {
    blockers.push({
      id: "mortgage-recovery-gap",
      title: "Recovery guidance incomplete",
      blocker: `${missingRecoveryCount} linked portal${missingRecoveryCount === 1 ? "" : "s"} still miss recovery hints.`,
      consequence: "Mortgage access continuity remains incomplete if a borrower handoff or emergency recovery is needed.",
      nextAction: "Add portal recovery hints",
      urgency: missingRecoveryCount >= 2 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(missingRecoveryCount >= 2 ? "critical" : "warning"),
      daysStalled: null,
      staleLabel: "Continuity gap",
    });
  }

  const overdueTask = assetTasks.find((task) => {
    const due = toTimestamp(task?.due_date);
    return due !== null && due < Date.now();
  });
  if (overdueTask) {
    const daysStalled = getDaysStalled(overdueTask.due_date || overdueTask.updated_at || overdueTask.created_at || null);
    blockers.push({
      id: `mortgage-overdue-task-${overdueTask.id}`,
      title: "Mortgage follow-up is overdue",
      blocker: overdueTask.title || overdueTask.description || "A mortgage-linked task is overdue.",
      consequence: "Loan review can drift when critical follow-up is left unresolved.",
      nextAction: "Resolve overdue task",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled,
      staleLabel: `Overdue since ${formatDaysStalled(daysStalled)}`,
    });
  }

  const urgentAlert = assetAlerts.find((alert) => alert?.severity === "urgent");
  if (urgentAlert) {
    const daysStalled = getDaysStalled(urgentAlert.updated_at || urgentAlert.created_at || null);
    blockers.push({
      id: `mortgage-urgent-alert-${urgentAlert.id}`,
      title: "Urgent mortgage alert",
      blocker: urgentAlert.title || urgentAlert.description || "A mortgage-linked alert needs attention.",
      consequence: "This loan should not be treated as stable until the alert is reviewed.",
      nextAction: "Review urgent alert",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled,
      staleLabel: formatDaysStalled(daysStalled),
    });
  }

  const sorted = blockers.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    const urgencyDelta = (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
    if (urgencyDelta !== 0) return urgencyDelta;
    return (right.daysStalled || 0) - (left.daysStalled || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} mortgage command items are visible.`
        : "This mortgage currently looks operationally steady.",
    blockers: sorted.slice(0, 5),
    metrics: {
      critical: sorted.filter((item) => item.urgency === "critical").length,
      warning: sorted.filter((item) => item.urgency === "warning").length,
      documents: documents.length,
      snapshots: snapshots.length,
      analytics: analytics.length,
    },
  };
}

export function buildMortgageHubCommand({
  mortgageLoans = [],
  householdMortgageSummary = null,
} = {}) {
  const loans = Array.isArray(mortgageLoans) ? mortgageLoans : [];
  const rows = [];

  if (loans.length === 0) {
    rows.push({
      id: "mortgage-no-loans",
      title: "No mortgage loans visible",
      blocker: "The mortgage module is still empty.",
      consequence: "Debt, payoff, escrow, and property-financing continuity remain mostly theoretical until a loan is tracked.",
      nextAction: "Create first mortgage loan",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
    });
  }

  const delinquentLoans = loans.filter((loan) => String(loan?.current_status || "").toLowerCase() === "delinquent");
  if (delinquentLoans.length > 0) {
    rows.push({
      id: "mortgage-delinquent",
      title: "Delinquent mortgage attention needed",
      blocker: `${delinquentLoans.length} mortgage loan${delinquentLoans.length === 1 ? "" : "s"} are marked delinquent.`,
      consequence: "Borrower and property continuity can deteriorate quickly if delinquency is not addressed.",
      nextAction: "Review delinquent loans",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
    });
  }

  if ((householdMortgageSummary?.needsReviewCount || 0) > 0) {
    rows.push({
      id: "mortgage-needs-review",
      title: "Mortgage support is incomplete",
      blocker: `${householdMortgageSummary.needsReviewCount} loan${householdMortgageSummary.needsReviewCount === 1 ? "" : "s"} still need stronger statement or property-link support.`,
      consequence: "Debt visibility remains weaker until those loans have better evidence and stack linkage.",
      nextAction: "Review weak mortgage records",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
    });
  }

  if ((householdMortgageSummary?.reviewSoonCount || 0) > 0) {
    rows.push({
      id: "mortgage-review-soon",
      title: "Near-term mortgage review items",
      blocker: `${householdMortgageSummary.reviewSoonCount} loan${householdMortgageSummary.reviewSoonCount === 1 ? "" : "s"} merit refinance, payoff, or maturity review soon.`,
      consequence: "Financing opportunities or upcoming debt events can be missed if these loans sit too long.",
      nextAction: "Review refinance and payoff candidates",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
    });
  }

  return {
    headline:
      rows.length > 0
        ? `${rows.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} mortgage review items are visible.`
        : householdMortgageSummary?.headline || "No major mortgage command items are active right now.",
    rows: rows.slice(0, 4),
    metrics: {
      total: loans.length,
      active: loans.filter((loan) => ["active", "current"].includes(String(loan?.current_status || "").toLowerCase())).length,
      attention: rows.length,
    },
  };
}

export function buildHomeownersCommandCenter({
  homeownersPolicy = null,
  homeownersDocuments = [],
  homeownersSnapshots = [],
  homeownersAnalytics = [],
  propertyLinks = [],
  assetBundle = null,
} = {}) {
  const blockers = [];
  const documents = Array.isArray(homeownersDocuments) ? homeownersDocuments : [];
  const snapshots = Array.isArray(homeownersSnapshots) ? homeownersSnapshots : [];
  const analytics = Array.isArray(homeownersAnalytics) ? homeownersAnalytics : [];
  const links = Array.isArray(propertyLinks) ? propertyLinks : [];
  const portalLinks = Array.isArray(assetBundle?.portalLinks) ? assetBundle.portalLinks : [];
  const missingRecoveryCount = Number(assetBundle?.portalContinuity?.missingRecoveryCount || 0);
  const assetAlerts = Array.isArray(assetBundle?.alerts) ? assetBundle.alerts : [];
  const assetTasks = Array.isArray(assetBundle?.tasks) ? assetBundle.tasks : [];
  const expirationDate = homeownersPolicy?.expiration_date || null;
  const daysToExpiration = (() => {
    if (!expirationDate) return null;
    const parsed = new Date(expirationDate);
    if (Number.isNaN(parsed.getTime())) return null;
    return Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  })();

  if (documents.length === 0) {
    blockers.push({
      id: "homeowners-no-documents",
      title: "No homeowners coverage evidence",
      blocker: "No declarations or homeowners documents are attached to this policy yet.",
      consequence: "Coverage review stays weak without source evidence for dwelling, renewal, and carrier details.",
      nextAction: "Upload homeowners documents",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "No evidence yet",
    });
  }

  if (!links.length) {
    blockers.push({
      id: "homeowners-no-property-link",
      title: "Property linkage missing",
      blocker: "This homeowners policy is not linked to a property record yet.",
      consequence: "Protection continuity stays fragmented when property and policy are not connected.",
      nextAction: "Link property",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "Stack gap",
    });
  }

  if (!homeownersPolicy?.carrier_key) {
    blockers.push({
      id: "homeowners-carrier-unconfirmed",
      title: "Carrier identity is limited",
      blocker: "The carrier is not clearly confirmed on this policy record.",
      consequence: "Renewal, claims, and access continuity become weaker when carrier identity is uncertain.",
      nextAction: "Confirm carrier details",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Carrier gap",
    });
  }

  if (!homeownersPolicy?.named_insured) {
    blockers.push({
      id: "homeowners-named-insured-missing",
      title: "Named insured is missing",
      blocker: "Named insured visibility is incomplete on this policy record.",
      consequence: "Coverage ownership and household handoff confidence remain weaker until the insured party is explicit.",
      nextAction: "Add named insured",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Ownership gap",
    });
  }

  if (daysToExpiration !== null && daysToExpiration < 0) {
    blockers.push({
      id: "homeowners-expired",
      title: "Policy appears expired",
      blocker: "The homeowners policy expiration date is already past.",
      consequence: "Protection continuity may already be broken for this property.",
      nextAction: "Review policy status immediately",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: Math.abs(daysToExpiration),
      staleLabel: `Expired ${Math.abs(daysToExpiration)} day${Math.abs(daysToExpiration) === 1 ? "" : "s"} ago`,
    });
  } else if (daysToExpiration !== null && daysToExpiration <= 45) {
    blockers.push({
      id: "homeowners-renewal-soon",
      title: "Renewal pressure is near",
      blocker: `This homeowners policy expires in ${daysToExpiration} day${daysToExpiration === 1 ? "" : "s"}.`,
      consequence: "If renewal timing slips, property protection continuity can weaken quickly.",
      nextAction: "Review renewal status",
      urgency: daysToExpiration <= 14 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(daysToExpiration <= 14 ? "critical" : "warning"),
      daysStalled: null,
      staleLabel: `Renews in ${daysToExpiration} day${daysToExpiration === 1 ? "" : "s"}`,
    });
  }

  if (snapshots.length === 0 && documents.length > 0) {
    blockers.push({
      id: "homeowners-no-snapshots",
      title: "Coverage detail is still shallow",
      blocker: "Documents exist, but no normalized homeowners snapshot is visible yet.",
      consequence: "Coverage and completeness review remain shallow until declarations detail is normalized.",
      nextAction: "Review declarations intake",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Needs normalization",
    });
  }

  if (portalLinks.length === 0) {
    blockers.push({
      id: "homeowners-no-portal-link",
      title: "Carrier access continuity not mapped",
      blocker: "No carrier portal continuity record is linked yet.",
      consequence: "Claims and renewal access recovery remain weaker for this policy.",
      nextAction: "Link carrier portal",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Access gap",
    });
  } else if (missingRecoveryCount > 0) {
    blockers.push({
      id: "homeowners-recovery-gap",
      title: "Recovery guidance incomplete",
      blocker: `${missingRecoveryCount} linked portal${missingRecoveryCount === 1 ? "" : "s"} still miss recovery hints.`,
      consequence: "Carrier access continuity is still incomplete if renewal or claim access is needed quickly.",
      nextAction: "Add portal recovery hints",
      urgency: missingRecoveryCount >= 2 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(missingRecoveryCount >= 2 ? "critical" : "warning"),
      daysStalled: null,
      staleLabel: "Continuity gap",
    });
  }

  const overdueTask = assetTasks.find((task) => {
    const due = toTimestamp(task?.due_date);
    return due !== null && due < Date.now();
  });
  if (overdueTask) {
    const daysStalled = getDaysStalled(overdueTask.due_date || overdueTask.updated_at || overdueTask.created_at || null);
    blockers.push({
      id: `homeowners-overdue-task-${overdueTask.id}`,
      title: "Homeowners follow-up is overdue",
      blocker: overdueTask.title || overdueTask.description || "A homeowners-linked task is overdue.",
      consequence: "Coverage cleanup can quietly slip if follow-up stays unresolved.",
      nextAction: "Resolve overdue task",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled,
      staleLabel: `Overdue since ${formatDaysStalled(daysStalled)}`,
    });
  }

  const urgentAlert = assetAlerts.find((alert) => alert?.severity === "urgent");
  if (urgentAlert) {
    const daysStalled = getDaysStalled(urgentAlert.updated_at || urgentAlert.created_at || null);
    blockers.push({
      id: `homeowners-urgent-alert-${urgentAlert.id}`,
      title: "Urgent homeowners alert",
      blocker: urgentAlert.title || urgentAlert.description || "A homeowners-linked alert needs attention.",
      consequence: "This policy should not be treated as stable until the alert is reviewed.",
      nextAction: "Review urgent alert",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled,
      staleLabel: formatDaysStalled(daysStalled),
    });
  }

  const sorted = blockers.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    const urgencyDelta = (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
    if (urgencyDelta !== 0) return urgencyDelta;
    return (right.daysStalled || 0) - (left.daysStalled || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} homeowners command items are visible.`
        : "This homeowners policy currently looks operationally steady.",
    blockers: sorted.slice(0, 5),
    metrics: {
      critical: sorted.filter((item) => item.urgency === "critical").length,
      warning: sorted.filter((item) => item.urgency === "warning").length,
      documents: documents.length,
      snapshots: snapshots.length,
      analytics: analytics.length,
    },
  };
}

export function buildHomeownersHubCommand({
  policies = [],
  homeownersRead = null,
} = {}) {
  const safePolicies = Array.isArray(policies) ? policies : [];
  const rows = [];

  const expiringSoon = safePolicies.filter((policy) => {
    if (!policy?.expiration_date) return false;
    const parsed = new Date(policy.expiration_date);
    if (Number.isNaN(parsed.getTime())) return false;
    const days = Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 45;
  });
  const expired = safePolicies.filter((policy) => {
    if (!policy?.expiration_date) return false;
    const parsed = new Date(policy.expiration_date);
    return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now();
  });
  const missingProperty = safePolicies.filter((policy) => !String(policy?.property_address || "").trim());
  const missingNamedInsured = safePolicies.filter((policy) => !String(policy?.named_insured || "").trim());

  if (expired.length > 0) {
    rows.push({
      id: "homeowners-expired",
      title: "Expired property coverage needs attention",
      blocker: `${expired.length} homeowners polic${expired.length === 1 ? "y appears" : "ies appear"} expired.`,
      consequence: "Protection continuity may already be broken on one or more properties.",
      nextAction: "Review expired policies",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
    });
  }

  if (expiringSoon.length > 0) {
    rows.push({
      id: "homeowners-expiring-soon",
      title: "Renewal pressure is building",
      blocker: `${expiringSoon.length} homeowners polic${expiringSoon.length === 1 ? "y expires" : "ies expire"} within about 45 days.`,
      consequence: "Renewal timing can quietly become a continuity risk if it is not reviewed early.",
      nextAction: "Review upcoming renewals",
      urgency: expiringSoon.length >= 2 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(expiringSoon.length >= 2 ? "critical" : "warning"),
    });
  }

  if (missingProperty.length > 0) {
    rows.push({
      id: "homeowners-missing-property",
      title: "Property linkage is incomplete",
      blocker: `${missingProperty.length} polic${missingProperty.length === 1 ? "y still lacks" : "ies still lack"} property-address visibility.`,
      consequence: "Coverage cannot cleanly reinforce the property stack until the protected property is explicit.",
      nextAction: "Clean up property linkage",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
    });
  }

  if (missingNamedInsured.length > 0) {
    rows.push({
      id: "homeowners-missing-insured",
      title: "Named insured visibility is incomplete",
      blocker: `${missingNamedInsured.length} polic${missingNamedInsured.length === 1 ? "y still lacks" : "ies still lack"} named-insured detail.`,
      consequence: "Coverage ownership and handoff confidence remain weaker until insured parties are explicit.",
      nextAction: "Add named insured detail",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
    });
  }

  return {
    headline:
      rows.length > 0
        ? `${rows.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} homeowners review items are visible.`
        : homeownersRead?.headline || "No major homeowners command items are active right now.",
    rows: rows.slice(0, 4),
    metrics: {
      total: safePolicies.length,
      active: safePolicies.filter((policy) => String(policy?.policy_status || "").toLowerCase() === "active").length,
      attention: rows.length,
    },
  };
}

export function buildHousingContinuityCommand(bundle = {}) {
  const propertyStack = bundle?.propertyStackSummary || {};
  const propertyStackAnalytics = Array.isArray(bundle?.propertyStackAnalytics) ? bundle.propertyStackAnalytics : [];
  const blockers = [];

  function pushHousingBlocker({
    id,
    title,
    blocker,
    consequence,
    nextAction,
    urgency = "warning",
    count = 0,
    route = "/property",
  }) {
    blockers.push({
      id,
      title,
      blocker,
      consequence,
      nextAction,
      route,
      urgency,
      urgencyMeta: getCommandUrgencyMeta(urgency),
      daysStalled: null,
      staleLabel: count > 0 ? `${count} affected` : "Needs review",
    });
  }

  const missingHomeowners = propertyStack.propertiesMissingHomeownersLink || [];
  if (missingHomeowners.length > 0) {
    pushHousingBlocker({
      id: "housing-missing-homeowners",
      title: "Property protection gaps are visible",
      blocker: `${missingHomeowners.length} propert${missingHomeowners.length === 1 ? "y does" : "ies do"} not yet show linked homeowners coverage.`,
      consequence: "Housing continuity stays weak when property value and debt may exist without visible protection support.",
      nextAction: "Link homeowners coverage",
      urgency: "critical",
      count: missingHomeowners.length,
    });
  }

  const missingMortgage = propertyStack.propertiesMissingMortgageLink || [];
  if (missingMortgage.length > 0) {
    pushHousingBlocker({
      id: "housing-missing-mortgage",
      title: "Financing visibility is incomplete",
      blocker: `${missingMortgage.length} propert${missingMortgage.length === 1 ? "y does" : "ies do"} not yet show linked financing visibility.`,
      consequence: "Property stacks remain incomplete when debt context is still missing.",
      nextAction: "Link mortgage records",
      urgency: "warning",
      count: missingMortgage.length,
    });
  }

  const mortgagesWithoutProperty = propertyStack.mortgagesWithoutLinkedProperties || [];
  if (mortgagesWithoutProperty.length > 0) {
    pushHousingBlocker({
      id: "housing-mortgages-without-property",
      title: "Some mortgage loans are detached",
      blocker: `${mortgagesWithoutProperty.length} mortgage record${mortgagesWithoutProperty.length === 1 ? " is" : "s are"} still not linked to a property.`,
      consequence: "Debt review and housing continuity stay fragmented until collateral linkage is explicit.",
      nextAction: "Attach mortgages to properties",
      urgency: "critical",
      count: mortgagesWithoutProperty.length,
      route: "/mortgage",
    });
  }

  const homeownersWithoutProperty = propertyStack.homeownersWithoutLinkedProperties || [];
  if (homeownersWithoutProperty.length > 0) {
    pushHousingBlocker({
      id: "housing-homeowners-without-property",
      title: "Some homeowners policies are detached",
      blocker: `${homeownersWithoutProperty.length} homeowners polic${homeownersWithoutProperty.length === 1 ? "y is" : "ies are"} still not linked to a property.`,
      consequence: "Protection review and renewal context stay weaker until coverage is tied to the correct home.",
      nextAction: "Attach policies to properties",
      urgency: "critical",
      count: homeownersWithoutProperty.length,
      route: "/insurance/homeowners",
    });
  }

  const incompleteStacks = propertyStack.incompletePropertyStacks || [];
  if (incompleteStacks.length > 0) {
    pushHousingBlocker({
      id: "housing-incomplete-stacks",
      title: "Housing stacks are incomplete",
      blocker: `${incompleteStacks.length} propert${incompleteStacks.length === 1 ? "y stack still needs" : "y stacks still need"} both financing and protection linkage completed.`,
      consequence: "The household cannot treat these homes as continuity-ready until both debt and coverage are visible.",
      nextAction: "Complete property stacks",
      urgency: "critical",
      count: incompleteStacks.length,
    });
  }

  const weakContinuity = propertyStack.weakContinuityPropertyStacks || [];
  if (weakContinuity.length > 0) {
    pushHousingBlocker({
      id: "housing-weak-continuity",
      title: "Weak housing continuity is still visible",
      blocker: `${weakContinuity.length} propert${weakContinuity.length === 1 ? "y stack" : "y stacks"} still show weak continuity.`,
      consequence: "A weak housing cluster makes access, value, debt, and protection handoff less dependable.",
      nextAction: "Review weak property stacks",
      urgency: "warning",
      count: weakContinuity.length,
    });
  }

  const missingProtectionButWithValue = propertyStack.propertiesMissingProtectionButWithValue || [];
  if (missingProtectionButWithValue.length > 0) {
    pushHousingBlocker({
      id: "housing-valued-without-protection",
      title: "Valued homes still lack visible protection",
      blocker: `${missingProtectionButWithValue.length} valued propert${missingProtectionButWithValue.length === 1 ? "y still lacks" : "ies still lack"} linked homeowners protection.`,
      consequence: "High-value property review without coverage visibility creates a dangerous false sense of readiness.",
      nextAction: "Add homeowners protection",
      urgency: "critical",
      count: missingProtectionButWithValue.length,
    });
  }

  const missingValueReview = propertyStack.propertiesMissingValueReview || [];
  if (missingValueReview.length > 0) {
    pushHousingBlocker({
      id: "housing-missing-value-review",
      title: "Property value review is still missing",
      blocker: `${missingValueReview.length} linked propert${missingValueReview.length === 1 ? "y stack has" : "y stacks have"} not stored a value review yet.`,
      consequence: "Protection and debt may be linked, but the household still lacks a clean property-value baseline.",
      nextAction: "Run property valuation review",
      urgency: "warning",
      count: missingValueReview.length,
    });
  }

  const weakValuation = propertyStack.weakValuationConfidenceProperties || [];
  if (weakValuation.length > 0) {
    pushHousingBlocker({
      id: "housing-weak-valuation",
      title: "Some property values are weak-confidence",
      blocker: `${weakValuation.length} propert${weakValuation.length === 1 ? "y review has" : "y reviews have"} weak valuation confidence.`,
      consequence: "Debt, equity, and protection conversations can drift if low-confidence valuations are treated as settled.",
      nextAction: "Review valuation confidence",
      urgency: "warning",
      count: weakValuation.length,
    });
  }

  const multiMortgage = propertyStack.multipleMortgageLinkReview || [];
  if (multiMortgage.length > 0) {
    pushHousingBlocker({
      id: "housing-multi-mortgage",
      title: "Some properties have multiple mortgage links",
      blocker: `${multiMortgage.length} propert${multiMortgage.length === 1 ? "y shows" : "ies show"} multiple linked mortgages needing review.`,
      consequence: "Primary financing can become ambiguous when several loan links are still unresolved.",
      nextAction: "Review financing structure",
      urgency: "warning",
      count: multiMortgage.length,
      route: "/mortgage",
    });
  }

  const multiHomeowners = propertyStack.multipleHomeownersLinkReview || [];
  if (multiHomeowners.length > 0) {
    pushHousingBlocker({
      id: "housing-multi-homeowners",
      title: "Some properties have multiple homeowners links",
      blocker: `${multiHomeowners.length} propert${multiHomeowners.length === 1 ? "y shows" : "ies show"} multiple linked homeowners policies needing review.`,
      consequence: "Coverage ownership and renewal responsibility can become unclear when several policy links are still unresolved.",
      nextAction: "Review coverage structure",
      urgency: "warning",
      count: multiHomeowners.length,
      route: "/insurance/homeowners",
    });
  }

  const strongStacks = propertyStack.highQualityPropertyReviewAvailable || [];
  const strongContinuityEverywhere =
    propertyStackAnalytics.length > 0 &&
    propertyStackAnalytics.every((item) => item.continuity_status === "strong");

  const sorted = blockers.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    return (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} housing continuity blockers are visible.`
        : strongStacks.length > 0 || strongContinuityEverywhere
          ? "Housing continuity currently looks strong across the visible property stack."
          : "No major housing continuity blockers are active right now.",
    summary:
      sorted.length > 0
        ? "Property, mortgage, and homeowners signals are now being read together as one operating cluster."
        : "The housing cluster currently looks comparatively stable across property, debt, protection, and continuity.",
    blockers: sorted.slice(0, 5),
    metrics: metricListFromObject({
      Properties: Number(propertyStack.propertyCount || propertyStackAnalytics.length || 0),
      Critical: sorted.filter((item) => item.urgency === "critical").length,
      Warning: sorted.filter((item) => item.urgency === "warning").length,
      StrongStacks: strongStacks.length || (strongContinuityEverywhere ? propertyStackAnalytics.length : 0),
    }),
  };
}

export function buildEstateHubCommand({
  contacts = [],
  assets = [],
  readiness = null,
} = {}) {
  const safeContacts = Array.isArray(contacts) ? contacts : [];
  const safeAssets = Array.isArray(assets) ? assets : [];
  const successorContacts = safeContacts.filter((contact) =>
    ["executor", "trustee", "attorney"].includes(String(contact?.contact_type || "").toLowerCase())
  );
  const familyContacts = safeContacts.filter((contact) =>
    String(contact?.contact_type || "").toLowerCase().includes("family")
  );
  const legalAssets = safeAssets.filter((asset) => {
    const text = `${asset?.asset_category || ""} ${asset?.asset_subcategory || ""} ${asset?.asset_name || ""}`.toLowerCase();
    return ["estate", "trust", "legal", "will", "directive"].some((pattern) => text.includes(pattern));
  });

  const rows = [];

  if (successorContacts.length === 0) {
    rows.push({
      id: "estate-no-successor",
      title: "No successor authority is visible",
      blocker: "No trustee, executor, or attorney contact is clearly mapped in the household record.",
      consequence: "Estate handoff becomes fragile when no obvious successor authority is ready to step in.",
      nextAction: "Add successor contacts",
      route: "/contacts",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "No successor layer",
    });
  } else if (successorContacts.length === 1) {
    rows.push({
      id: "estate-single-successor",
      title: "Successor layer is thin",
      blocker: "Only one successor or legal contact is visible today.",
      consequence: "Single-point estate handoff can fail if one person is unavailable during an emergency.",
      nextAction: "Add a second successor contact",
      route: "/contacts",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Needs backup",
    });
  }

  if (familyContacts.length === 0) {
    rows.push({
      id: "estate-no-family",
      title: "Family handoff coverage is limited",
      blocker: "No family continuity contacts are visible for estate and emergency coordination.",
      consequence: "Legal contacts may exist, but family-side handoff still lacks a clear continuity path.",
      nextAction: "Add family continuity contacts",
      route: "/contacts",
      urgency: successorContacts.length === 0 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(successorContacts.length === 0 ? "critical" : "warning"),
      daysStalled: null,
      staleLabel: "Family gap",
    });
  }

  if (legalAssets.length === 0) {
    rows.push({
      id: "estate-no-legal-assets",
      title: "No legal document shells are visible",
      blocker: "The household record does not yet show wills, trusts, directives, or other estate asset shells.",
      consequence: "Successor contacts are harder to support operationally when the legal-document layer is still missing.",
      nextAction: "Add estate assets or upload legal files",
      route: "/upload-center",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "No legal layer",
    });
  }

  const sorted = rows.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    return (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} estate continuity items are visible.`
        : readiness?.headline || "No major estate continuity blockers are active right now.",
    summary:
      sorted.length > 0
        ? "Estate continuity is now being treated as an operating layer across successor roles, family handoff, and legal-document support."
        : "Successor roles, family continuity contacts, and legal-document shells currently look stable enough for normal review.",
    rows: sorted.slice(0, 4),
    metrics: {
      successorContacts: successorContacts.length,
      familyContacts: familyContacts.length,
      legalAssets: legalAssets.length,
      attention: sorted.length,
    },
  };
}

export function buildBankingHubCommand({
  assets = [],
  contacts = [],
  portalBundle = null,
  readiness = null,
} = {}) {
  const safeAssets = Array.isArray(assets) ? assets : [];
  const safeContacts = Array.isArray(contacts) ? contacts : [];
  const portals = Array.isArray(portalBundle?.portals) ? portalBundle.portals : [];
  const readinessMeta = portalBundle?.readiness || {};

  const bankingAssets = safeAssets.filter((asset) =>
    String(`${asset?.asset_category || ""} ${asset?.asset_subcategory || ""} ${asset?.asset_name || ""}`)
      .toLowerCase()
      .match(/bank|cash|checking|savings|treasury|brokerage|liquidity|money market/)
  );
  const missingInstitution = bankingAssets.filter((asset) => !String(asset?.institution_name || "").trim());
  const emergencyPortals = portals.filter((portal) => portal?.emergency_relevance);
  const missingRecovery = emergencyPortals.filter((portal) => !String(portal?.recovery_contact_hint || "").trim());
  const institutionContacts = safeContacts.filter((contact) =>
    /institution|bank|advisor|cpa/.test(String(`${contact?.contact_type || ""} ${contact?.organization_name || ""}`).toLowerCase())
  );
  const lockedOrLimited = emergencyPortals.filter((portal) =>
    ["locked", "limited"].includes(String(portal?.access_status || "").toLowerCase())
  );
  const criticalAssetsWithoutPortals = Array.isArray(readinessMeta?.criticalAssetsWithoutLinkedPortals)
    ? readinessMeta.criticalAssetsWithoutLinkedPortals
    : [];

  const rows = [];

  if (bankingAssets.length === 0) {
    rows.push({
      id: "banking-no-assets",
      title: "No liquidity records are visible",
      blocker: "No cash, checking, savings, brokerage, or money-market assets are clearly visible in the household record.",
      consequence: "Emergency cash access and household liquidity planning stay mostly manual until core banking records are visible.",
      nextAction: "Add banking assets",
      route: "/assets",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "No liquidity map",
    });
  }

  if (criticalAssetsWithoutPortals.length > 0 || emergencyPortals.length === 0) {
    const count = criticalAssetsWithoutPortals.length;
    rows.push({
      id: "banking-no-portals",
      title: "Access continuity is incomplete",
      blocker:
        count > 0
          ? `${count} critical asset${count === 1 ? " still lacks" : "s still lack"} linked portal continuity.`
          : "No emergency-relevant portal profiles are linked for liquidity access yet.",
      consequence: "Liquidity may be visible on paper, but emergency recovery and actual access can still break down when portals are missing.",
      nextAction: "Review banking portals",
      route: "/portals",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "Access gap",
    });
  }

  if (missingRecovery.length > 0) {
    rows.push({
      id: "banking-missing-recovery",
      title: "Recovery guidance is incomplete",
      blocker: `${missingRecovery.length} emergency-relevant portal${missingRecovery.length === 1 ? " still lacks" : "s still lack"} recovery hints.`,
      consequence: "Portal access exists, but emergency recovery still depends on memory instead of a dependable handoff path.",
      nextAction: "Add recovery hints",
      route: "/portals",
      urgency: missingRecovery.length >= 2 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(missingRecovery.length >= 2 ? "critical" : "warning"),
      daysStalled: null,
      staleLabel: "Recovery gap",
    });
  }

  if (lockedOrLimited.length > 0) {
    rows.push({
      id: "banking-locked-portals",
      title: "Some banking access is limited",
      blocker: `${lockedOrLimited.length} emergency-relevant portal${lockedOrLimited.length === 1 ? " is" : "s are"} marked locked or limited.`,
      consequence: "Even documented accounts can become hard to reach if the access layer is already degraded.",
      nextAction: "Resolve access friction",
      route: "/portals",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Access friction",
    });
  }

  if (missingInstitution.length > 0) {
    rows.push({
      id: "banking-missing-institution",
      title: "Institution visibility is incomplete",
      blocker: `${missingInstitution.length} banking asset${missingInstitution.length === 1 ? " still lacks" : "s still lack"} institution detail.`,
      consequence: "Ownership may be visible, but routing support and institution-level continuity stay weaker until the custodian is explicit.",
      nextAction: "Add institution detail",
      route: "/assets",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Needs cleanup",
    });
  }

  if (institutionContacts.length === 0) {
    rows.push({
      id: "banking-no-contacts",
      title: "Support contacts are thin",
      blocker: "No bank, institution, advisor, or CPA contacts are visible near the liquidity stack.",
      consequence: "If portal access fails, there is still no obvious human support path for the household to lean on.",
      nextAction: "Add institution contacts",
      route: "/contacts",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Support gap",
    });
  }

  const sorted = rows.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    return (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} banking continuity items are visible.`
        : readiness?.headline || "No major banking continuity blockers are active right now.",
    summary:
      sorted.length > 0
        ? "Banking continuity is now being treated as a command layer across liquidity visibility, access recovery, and institution support."
        : "Liquidity records, portal continuity, and institution support currently look stable enough for normal review.",
    rows: sorted.slice(0, 5),
    metrics: {
      bankingAssets: bankingAssets.length,
      emergencyPortals: emergencyPortals.length,
      institutionContacts: institutionContacts.length,
      attention: sorted.length,
    },
  };
}

export function buildPortalHubCommand({
  bundle = null,
  portalRead = null,
} = {}) {
  const portals = Array.isArray(bundle?.portals) ? bundle.portals : [];
  const readiness = bundle?.readiness || {};
  const missingRecoveryCount = Number(readiness.missingRecoveryCount || 0);
  const criticalAssetsWithoutPortals = Array.isArray(readiness.criticalAssetsWithoutLinkedPortals)
    ? readiness.criticalAssetsWithoutLinkedPortals
    : [];
  const limitedOrLocked = portals.filter((portal) =>
    ["limited", "locked"].includes(String(portal?.access_status || "").toLowerCase())
  );
  const unverified = portals.filter((portal) => !portal?.last_verified_at);
  const emergencyPortals = portals.filter((portal) => portal?.emergency_relevance);

  const rows = [];

  if (portals.length === 0) {
    rows.push({
      id: "portal-none-visible",
      title: "No portal continuity records are visible",
      blocker: "The household does not yet show any reusable portal profiles.",
      consequence: "Access continuity stays fragile when critical accounts still depend on memory instead of recorded recovery paths.",
      nextAction: "Start linking portal profiles",
      route: "/assets",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "No access layer",
    });
  }

  if (criticalAssetsWithoutPortals.length > 0) {
    rows.push({
      id: "portal-critical-assets-uncovered",
      title: "Critical assets still lack portal support",
      blocker: `${criticalAssetsWithoutPortals.length} critical asset${criticalAssetsWithoutPortals.length === 1 ? " still lacks" : "s still lack"} linked portal continuity.`,
      consequence: "Important accounts may be visible, but recovery still breaks down if no access layer is attached to them.",
      nextAction: "Cover critical assets",
      route: "/assets",
      urgency: "critical",
      urgencyMeta: getCommandUrgencyMeta("critical"),
      daysStalled: null,
      staleLabel: "Coverage gap",
    });
  }

  if (emergencyPortals.length === 0 && portals.length > 0) {
    rows.push({
      id: "portal-no-emergency-relevance",
      title: "Emergency access is not clearly identified",
      blocker: "Portal profiles exist, but none are clearly marked as emergency relevant.",
      consequence: "The household may have logins recorded, but still no obvious emergency-access map when time matters.",
      nextAction: "Mark emergency portals",
      route: "/portals",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Needs triage",
    });
  }

  if (missingRecoveryCount > 0) {
    rows.push({
      id: "portal-missing-recovery",
      title: "Recovery support is incomplete",
      blocker: `${missingRecoveryCount} portal profile${missingRecoveryCount === 1 ? " still lacks" : "s still lack"} recovery contact hints.`,
      consequence: "Portal access exists, but recovery still depends on guesswork instead of a reliable handoff path.",
      nextAction: "Add recovery hints",
      route: "/portals",
      urgency: missingRecoveryCount >= 2 ? "critical" : "warning",
      urgencyMeta: getCommandUrgencyMeta(missingRecoveryCount >= 2 ? "critical" : "warning"),
      daysStalled: null,
      staleLabel: "Recovery gap",
    });
  }

  if (limitedOrLocked.length > 0) {
    rows.push({
      id: "portal-limited-access",
      title: "Some portal access is already degraded",
      blocker: `${limitedOrLocked.length} portal${limitedOrLocked.length === 1 ? " is" : "s are"} marked limited or locked.`,
      consequence: "Recorded access is less useful when account entry is already constrained before an emergency happens.",
      nextAction: "Resolve locked access",
      route: "/portals",
      urgency: limitedOrLocked.some((portal) => String(portal?.access_status || "").toLowerCase() === "locked")
        ? "critical"
        : "warning",
      urgencyMeta: getCommandUrgencyMeta(
        limitedOrLocked.some((portal) => String(portal?.access_status || "").toLowerCase() === "locked")
          ? "critical"
          : "warning"
      ),
      daysStalled: null,
      staleLabel: "Access friction",
    });
  }

  if (unverified.length > 0) {
    rows.push({
      id: "portal-unverified",
      title: "Some portal records have not been verified",
      blocker: `${unverified.length} portal profile${unverified.length === 1 ? " is" : "s are"} still missing verification timestamps.`,
      consequence: "Portal continuity looks present, but confidence stays weaker until the household knows the records are still current.",
      nextAction: "Verify portal records",
      route: "/portals",
      urgency: "warning",
      urgencyMeta: getCommandUrgencyMeta("warning"),
      daysStalled: null,
      staleLabel: "Needs verification",
    });
  }

  const sorted = rows.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    return (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} portal continuity items are visible.`
        : portalRead?.headline || "No major portal continuity blockers are active right now.",
    summary:
      sorted.length > 0
        ? "Portal continuity is now being treated as a command layer across access coverage, recovery support, and verification quality."
        : "The access layer currently looks stable enough for normal household continuity review.",
    rows: sorted.slice(0, 5),
    metrics: {
      portals: portals.length,
      emergencyPortals: emergencyPortals.length,
      missingRecovery: missingRecoveryCount,
      attention: sorted.length,
    },
  };
}

export function buildEmergencyAccessCommand(bundle = {}) {
  const assets = Array.isArray(bundle?.assets) ? bundle.assets : [];
  const contacts = Array.isArray(bundle?.contacts) ? bundle.contacts : [];
  const portals = Array.isArray(bundle?.portals) ? bundle.portals : [];
  const portalReadiness = bundle?.portalReadiness || {};

  const bankingAssets = assets.filter((asset) =>
    String(`${asset?.asset_category || ""} ${asset?.asset_subcategory || ""} ${asset?.asset_name || ""}`)
      .toLowerCase()
      .match(/bank|cash|checking|savings|treasury|brokerage|liquidity|money market/)
  );
  const emergencyPortals = portals.filter((portal) => portal?.emergency_relevance);
  const missingRecovery = emergencyPortals.filter((portal) => !String(portal?.recovery_contact_hint || "").trim());
  const institutionContacts = contacts.filter((contact) =>
    /institution|bank|advisor|cpa/.test(String(`${contact?.contact_type || ""} ${contact?.organization_name || ""}`).toLowerCase())
  );
  const criticalAssetsWithoutPortals = Array.isArray(portalReadiness?.criticalAssetsWithoutLinkedPortals)
    ? portalReadiness.criticalAssetsWithoutLinkedPortals
    : [];
  const blockedPortals = emergencyPortals.filter((portal) =>
    ["limited", "locked"].includes(String(portal?.access_status || "").toLowerCase())
  );

  const blockers = [];

  function pushBlocker({
    id,
    title,
    blocker,
    consequence,
    nextAction,
    route,
    urgency = "warning",
    staleLabel = "Needs review",
  }) {
    blockers.push({
      id,
      title,
      blocker,
      consequence,
      nextAction,
      route,
      urgency,
      urgencyMeta: getCommandUrgencyMeta(urgency),
      daysStalled: null,
      staleLabel,
    });
  }

  if (bankingAssets.length === 0) {
    pushBlocker({
      id: "emergency-access-no-liquidity",
      title: "Emergency liquidity is not mapped",
      blocker: "No clearly visible cash or banking records are anchoring the household emergency-access picture.",
      consequence: "If something urgent happens, the household may not know where immediate liquidity actually lives.",
      nextAction: "Add liquidity records",
      route: "/banking",
      urgency: "critical",
      staleLabel: "No liquidity map",
    });
  }

  if (criticalAssetsWithoutPortals.length > 0) {
    pushBlocker({
      id: "emergency-access-critical-assets",
      title: "Critical accounts still lack access coverage",
      blocker: `${criticalAssetsWithoutPortals.length} critical asset${criticalAssetsWithoutPortals.length === 1 ? " still lacks" : "s still lack"} linked portal continuity.`,
      consequence: "Important accounts may be known, but the household still has no dependable access path for them under pressure.",
      nextAction: "Cover critical assets",
      route: "/portals",
      urgency: "critical",
      staleLabel: "Coverage gap",
    });
  }

  if (emergencyPortals.length === 0) {
    pushBlocker({
      id: "emergency-access-no-portals",
      title: "Emergency access paths are missing",
      blocker: "No portal profile is clearly marked as emergency relevant.",
      consequence: "The household may know accounts exist, but not which access paths matter when time is short.",
      nextAction: "Map emergency portals",
      route: "/portals",
      urgency: "critical",
      staleLabel: "No access route",
    });
  }

  if (missingRecovery.length > 0) {
    pushBlocker({
      id: "emergency-access-missing-recovery",
      title: "Recovery support is still incomplete",
      blocker: `${missingRecovery.length} emergency-relevant portal${missingRecovery.length === 1 ? " still lacks" : "s still lack"} recovery hints.`,
      consequence: "Portal access may exist, but recovery can still fail if passwords, MFA, or account recovery break down.",
      nextAction: "Add recovery hints",
      route: "/portals",
      urgency: missingRecovery.length >= 2 ? "critical" : "warning",
      staleLabel: "Recovery gap",
    });
  }

  if (blockedPortals.length > 0) {
    pushBlocker({
      id: "emergency-access-blocked-portals",
      title: "Some emergency access is already degraded",
      blocker: `${blockedPortals.length} emergency-relevant portal${blockedPortals.length === 1 ? " is" : "s are"} marked limited or locked.`,
      consequence: "Recorded access is less useful if the household already knows those entries are partially broken.",
      nextAction: "Resolve blocked access",
      route: "/portals",
      urgency: "warning",
      staleLabel: "Access friction",
    });
  }

  if (institutionContacts.length === 0) {
    pushBlocker({
      id: "emergency-access-no-support-contacts",
      title: "Human support paths are thin",
      blocker: "No bank, institution, advisor, or CPA contact is visible alongside the emergency-access layer.",
      consequence: "If portal recovery fails, the household still lacks a clear human escalation path for cash access.",
      nextAction: "Add support contacts",
      route: "/contacts",
      urgency: "warning",
      staleLabel: "Support gap",
    });
  }

  const sorted = blockers.sort((left, right) => {
    const urgencyOrder = { critical: 3, warning: 2, ready: 1 };
    return (urgencyOrder[right.urgency] || 0) - (urgencyOrder[left.urgency] || 0);
  });

  return {
    headline:
      sorted.length > 0
        ? `${sorted.filter((item) => item.urgency === "critical").length > 0 ? "Critical" : "Active"} emergency access blockers are visible.`
        : "Emergency cash and access continuity currently look stable enough for normal review.",
    summary:
      sorted.length > 0
        ? "Banking liquidity and portal recovery are now being read together as one household emergency-access system."
        : "Liquidity records, emergency portals, and support contacts currently form a usable emergency-access layer.",
    blockers: sorted.slice(0, 4),
    metrics: [
      { label: "Liquidity Records", value: bankingAssets.length },
      { label: "Emergency Portals", value: emergencyPortals.length },
      { label: "Missing Recovery", value: missingRecovery.length },
      { label: "Attention", value: sorted.length },
    ],
  };
}
