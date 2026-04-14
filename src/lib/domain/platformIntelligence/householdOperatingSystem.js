import {
  buildPropertyOperatingGraphSummary,
  formatCompletenessScore,
} from "../../assetLinks/linkedContext.js";

function getUrgencyMeta(level = "warning") {
  if (level === "critical") {
    return {
      label: "Critical",
      accent: "#fecaca",
      background: "rgba(239,68,68,0.14)",
      border: "1px solid rgba(248,113,113,0.34)",
    };
  }
  if (level === "ready") {
    return {
      label: "Ready",
      accent: "#bbf7d0",
      background: "rgba(34,197,94,0.14)",
      border: "1px solid rgba(74,222,128,0.32)",
    };
  }
  return {
    label: "Important",
    accent: "#fed7aa",
    background: "rgba(249,115,22,0.14)",
    border: "1px solid rgba(251,146,60,0.34)",
  };
}

function mapStatusTone(status = "") {
  if (status === "Strong") return "ready";
  if (status === "Moderate") return "warning";
  return "critical";
}

function formatImpact(score = 0) {
  if (score >= 88) return "Highest household impact";
  if (score >= 75) return "High household impact";
  if (score >= 60) return "Meaningful household impact";
  return "Worth reviewing soon";
}

function buildPropertyGraphPriorityRow(bundle = null) {
  const graphSummary = buildPropertyOperatingGraphSummary(bundle || {});
  if (!graphSummary.propertyCount) return null;

  const {
    averageCompletenessScore,
    averageCompletenessLabel,
    completeCount,
    partialCount,
    missingProtectionCount,
    missingLiabilityCount,
    portalWeaknessCount,
  } = graphSummary;

  const hasPressure =
    partialCount > 0 ||
    missingProtectionCount > 0 ||
    missingLiabilityCount > 0 ||
    portalWeaknessCount > 0 ||
    (averageCompletenessScore !== null && averageCompletenessScore < 0.95);

  if (!hasPressure) return null;

  const normalizedScore = averageCompletenessScore ?? 0;
  const urgency =
    normalizedScore < 0.4 || (missingProtectionCount > 0 && missingLiabilityCount > 0)
      ? "critical"
      : normalizedScore < 0.75 || partialCount > 0 || portalWeaknessCount > 0
        ? "warning"
        : "ready";
  const priorityScore = Math.max(
    58,
    Math.round(
      62 +
        (missingProtectionCount > 0 ? 10 : 0) +
        (missingLiabilityCount > 0 ? 8 : 0) +
        Math.min(10, partialCount * 3) +
        Math.min(8, portalWeaknessCount * 2) +
        (averageCompletenessScore !== null ? (1 - averageCompletenessScore) * 22 : 10)
    )
  );
  const blockerParts = [
    averageCompletenessScore !== null
      ? `Average stack completeness is ${formatCompletenessScore(averageCompletenessScore)} and currently reads ${String(averageCompletenessLabel || "limited").toLowerCase()}.`
      : "A stored property stack completeness score is not available yet.",
    partialCount > 0
      ? `${partialCount} propert${partialCount === 1 ? "y appears" : "ies appear"} partially connected.`
      : `${completeCount} complete property stack${completeCount === 1 ? " is" : "s are"} currently visible.`,
    missingProtectionCount > 0
      ? `${missingProtectionCount} propert${missingProtectionCount === 1 ? "y still does" : "ies still do"} not show linked protection.`
      : null,
    missingLiabilityCount > 0
      ? `${missingLiabilityCount} propert${missingLiabilityCount === 1 ? "y still does" : "ies still do"} not show linked liabilities.`
      : null,
  ].filter(Boolean);
  const consequence =
    portalWeaknessCount > 0
      ? "Household property review is still fragmented because stack linkage and portal continuity are not reading cleanly together."
      : "Household property review is still fragmented because the asset, liability, and protection triangle is not consistently connected.";

  return {
    id: "property-stack-completeness",
    title: "Property stack completeness is still developing",
    blocker: blockerParts.join(" "),
    consequence,
    nextAction: "Open property stack review",
    route: "/property",
    source: "Operating Graph",
    urgency,
    urgencyMeta: getUrgencyMeta(urgency),
    priorityScore,
    impactLabel: formatImpact(priorityScore),
  };
}

export function buildHouseholdScorecard(householdMap = null) {
  const focusAreas = Array.isArray(householdMap?.focus_areas) ? householdMap.focus_areas : [];
  const areaByKey = Object.fromEntries(focusAreas.map((area) => [area.key, area]));
  const dimensions = [
    {
      key: "alignment",
      label: "Alignment",
      area: areaByKey.cross_asset_alignment || null,
    },
    {
      key: "protection",
      label: "Protection",
      area: areaByKey.insurance_review_strength || null,
    },
    {
      key: "property",
      label: "Property",
      area: areaByKey.property_debt_linkage || null,
    },
    {
      key: "documentation",
      label: "Documentation",
      area: areaByKey.document_readiness || null,
    },
    {
      key: "continuity",
      label: "Continuity",
      area: areaByKey.continuity_operations || null,
    },
  ].map((item) => ({
    key: item.key,
    label: item.label,
    score: item.area?.score ?? null,
    status: item.area?.status || "Starter",
    summary: item.area?.summary || "This dimension needs more household evidence before it can read cleanly.",
    route: item.area?.route || "/dashboard",
    actionLabel: item.area?.action_label || "Open review",
    tone: mapStatusTone(item.area?.status),
  }));

  const validScores = dimensions.map((item) => item.score).filter((value) => value !== null && value !== undefined);
  const overallScore = householdMap?.overall_score ?? (validScores.length > 0
    ? Math.round(validScores.reduce((sum, value) => sum + value, 0) / validScores.length)
    : null);
  const weakestDimension = dimensions
    .filter((item) => item.score !== null && item.score !== undefined)
    .sort((left, right) => left.score - right.score)[0] || null;
  const strongestDimension = dimensions
    .filter((item) => item.score !== null && item.score !== undefined)
    .sort((left, right) => right.score - left.score)[0] || null;

  return {
    overallScore,
    overallStatus: householdMap?.overall_status || "Starter",
    dimensions,
    weakestDimension,
    strongestDimension,
    summary:
      weakestDimension && strongestDimension
        ? `${strongestDimension.label} is currently your strongest dimension, while ${weakestDimension.label.toLowerCase()} is pulling the household score down most.`
        : householdMap?.bottom_line || "Household scoring will become clearer as more linked records are added.",
  };
}

export function buildHouseholdPriorityEngine({
  householdMap = null,
  commandCenter = null,
  housingCommand = null,
  emergencyAccessCommand = null,
  bundle = null,
} = {}) {
  const dependencyIssues = Array.isArray(householdMap?.dependency_signals?.priority_issues)
    ? householdMap.dependency_signals.priority_issues
    : [];

  const dependencyRows = dependencyIssues.map((item) => {
    const urgency =
      item.severity === "high" || Number(item.priority_score || 0) >= 85
        ? "critical"
        : Number(item.priority_score || 0) >= 65
          ? "warning"
          : "ready";
    return {
      id: item.id,
      title: item.label,
      blocker: item.summary || "A cross-module issue needs attention.",
      consequence: item.change_signal || "Cross-asset continuity is still being limited here.",
      nextAction: item.action_label || "Open review",
      route: item.route || "/dashboard",
      source: "Cross-Asset",
      urgency,
      urgencyMeta: getUrgencyMeta(urgency),
      priorityScore: Number(item.priority_score || 0),
      impactLabel: formatImpact(Number(item.priority_score || 0)),
    };
  });

  const propertyGraphRow = buildPropertyGraphPriorityRow(bundle);

  function normalizeCommandRows(rows = [], source = "Command", baseScore = 72) {
    return rows.map((item, index) => {
      const urgency = item.urgency || "warning";
      const urgencyBoost = urgency === "critical" ? 18 : urgency === "warning" ? 8 : 0;
      const priorityScore = Math.max(40, baseScore + urgencyBoost - index * 3);
      return {
        id: `${source}-${item.id}`,
        title: item.title,
        blocker: item.blocker,
        consequence: item.consequence,
        nextAction: item.nextAction || "Open review",
        route: item.route || "/dashboard",
        source,
        urgency,
        urgencyMeta: item.urgencyMeta || getUrgencyMeta(urgency),
        priorityScore,
        impactLabel: formatImpact(priorityScore),
      };
    });
  }

  const rows = [
    ...dependencyRows,
    ...(propertyGraphRow ? [propertyGraphRow] : []),
    ...normalizeCommandRows(commandCenter?.blockers || [], "Household Command", 74),
    ...normalizeCommandRows(housingCommand?.blockers || [], "Housing", 78),
    ...normalizeCommandRows(emergencyAccessCommand?.blockers || [], "Access", 80),
  ];

  const deduped = [];
  const seen = new Set();
  rows.forEach((item) => {
    const key = `${item.title}|${item.route}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(item);
  });

  const sorted = deduped.sort((left, right) => right.priorityScore - left.priorityScore);
  const topPriority = sorted[0] || null;

  return {
    headline: topPriority
      ? `${topPriority.title} should be addressed first.`
      : "No major priority issues are standing out right now.",
    summary: topPriority
      ? `${topPriority.impactLabel}. ${topPriority.consequence}`
      : householdMap?.bottom_line || "Household priorities will become clearer as more evidence is added.",
    priorities: sorted.slice(0, 3),
  };
}
