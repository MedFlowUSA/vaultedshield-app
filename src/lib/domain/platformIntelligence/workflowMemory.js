import {
  filterActiveReviewWorkflowItems,
  filterResolvedReviewWorkflowItems,
  isReviewWorkflowItemResolved,
} from "./reviewWorkflowState.js";
import {
  buildHouseholdPriorityEngine,
  buildHouseholdScorecard,
} from "./householdOperatingSystem.js";

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function toStatus(score) {
  if (score >= 85) return "Strong";
  if (score >= 65) return "Moderate";
  if (score >= 40) return "Weak";
  return "At Risk";
}

function countResolvedItemsByModule(items = []) {
  return items.reduce((accumulator, item) => {
    const moduleKey = item?.workflow_resolution_filters?.module || "household";
    accumulator[moduleKey] = (accumulator[moduleKey] || 0) + 1;
    return accumulator;
  }, {});
}

function countResolvedItemsByIssueType(items = []) {
  return items.reduce((accumulator, item) => {
    const issueType = item?.workflow_resolution_filters?.issueType || "review_needed";
    accumulator[issueType] = (accumulator[issueType] || 0) + 1;
    return accumulator;
  }, {});
}

function buildAdjustedFocusAreas(focusAreas = [], resolvedModuleCounts = {}, resolvedIssueCounts = {}) {
  return focusAreas.map((area) => {
    const resolvedInsuranceCount =
      (resolvedModuleCounts.policy || 0) +
      (resolvedModuleCounts.homeowners || 0) +
      (resolvedModuleCounts.health || 0) +
      (resolvedModuleCounts.auto || 0);
    const resolvedPropertyCount =
      (resolvedModuleCounts.property || 0) +
      (resolvedModuleCounts.mortgage || 0) +
      (resolvedModuleCounts.homeowners || 0);
    const resolvedContinuityCount =
      (resolvedModuleCounts.portal || 0) +
      (resolvedModuleCounts.estate || 0) +
      (resolvedIssueCounts.continuity_gap || 0);
    const resolvedDocumentationCount = resolvedIssueCounts.sparse_documentation || 0;
    const resolvedAlignmentCount =
      (resolvedIssueCounts.missing_linkage || 0) +
      (resolvedIssueCounts.missing_protection || 0) +
      (resolvedIssueCounts.stack_incomplete || 0) +
      (resolvedIssueCounts.missing_estate_components || 0);

    let bonus = 0;
    switch (area?.key) {
      case "insurance_review_strength":
        bonus = Math.min(10, resolvedInsuranceCount * 3);
        break;
      case "property_debt_linkage":
        bonus = Math.min(10, resolvedPropertyCount * 3);
        break;
      case "document_readiness":
        bonus = Math.min(8, resolvedDocumentationCount * 4);
        break;
      case "continuity_operations":
        bonus = Math.min(10, resolvedContinuityCount * 3);
        break;
      case "cross_asset_alignment":
        bonus = Math.min(10, resolvedAlignmentCount * 3);
        break;
      default:
        bonus = 0;
    }

    return {
      ...area,
      score: clampScore((area?.score || 0) + bonus),
    };
  });
}

function buildWorkflowAwareVisibilityGaps(activeQueueItems = [], householdMap = null) {
  const queueBackedGaps = activeQueueItems
    .map((item) => item?.summary || item?.change_signal || item?.label || null)
    .filter(Boolean)
    .slice(0, 4);

  if (queueBackedGaps.length > 0) return queueBackedGaps;
  return Array.isArray(householdMap?.visibility_gaps) ? householdMap.visibility_gaps.slice(0, 4) : [];
}

function buildWorkflowAwareBottomLine({
  householdMap = null,
  activeQueueItems = [],
  resolvedQueueItems = [],
}) {
  const base = householdMap?.bottom_line || "Household continuity is still being established.";
  if (resolvedQueueItems.length === 0) return base;
  if (activeQueueItems.length === 0) {
    return "The active household queue is currently clear. Recently reviewed issues are being held out of priority until new evidence reopens them.";
  }
  return `${base} ${resolvedQueueItems.length} reviewed issue${resolvedQueueItems.length === 1 ? " is" : "s are"} currently being held out of active priority unless fresh evidence reopens them.`;
}

function buildWorkflowAwareDigest({
  reviewDigest = null,
  activeQueueItems = [],
  resolvedQueueItems = [],
}) {
  const activeCount = activeQueueItems.length;
  const resolvedCount = resolvedQueueItems.length;
  const baseDigest = reviewDigest || {};
  const summary =
    activeCount === 0 && resolvedCount > 0
      ? `${resolvedCount} ${resolvedCount === 1 ? "issue is" : "issues are"} currently resolved and not driving the active household queue.`
      : activeCount > 0 && resolvedCount > 0
        ? `${activeCount} ${activeCount === 1 ? "issue remains" : "issues remain"} active, while ${resolvedCount} ${resolvedCount === 1 ? "issue is" : "issues are"} being held as reviewed.`
        : baseDigest.summary || "No major household review changes are standing out right now.";

  return {
    ...baseDigest,
    summary,
    active_count: activeCount,
    resolved_count: resolvedCount,
  };
}

function filterRowsAgainstResolvedMemory(rows = [], resolvedQueueItems = [], activeQueueItems = []) {
  const resolvedKeys = new Set(
    resolvedQueueItems.map((item) => item.workflow_resolution_key).filter(Boolean)
  );
  const activeKeys = new Set(
    activeQueueItems.map((item) => item.workflow_resolution_key).filter(Boolean)
  );
  const allQueueIds = new Set(
    [...resolvedQueueItems, ...activeQueueItems].map((item) => item.id).filter(Boolean)
  );

  return rows.filter((row) => {
    if (!row) return false;
    if (activeKeys.size > 0 && row.workflow_resolution_key && activeKeys.has(row.workflow_resolution_key)) {
      return true;
    }
    if (resolvedKeys.size > 0 && row.workflow_resolution_key && resolvedKeys.has(row.workflow_resolution_key)) {
      return false;
    }
    if (allQueueIds.has(row.id)) {
      return activeQueueItems.some((item) => item.id === row.id);
    }
    return true;
  });
}

function buildResolutionMemory(activeQueueItems = [], resolvedQueueItems = []) {
  return {
    activeIssueCount: activeQueueItems.length,
    resolvedIssueCount: resolvedQueueItems.length,
    recentlyResolved: resolvedQueueItems.slice(0, 3).map((item) => item.label || item.summary || "Reviewed issue"),
  };
}

export function buildWorkflowAwareHouseholdContext({
  householdMap = null,
  queueItems = [],
  reviewDigest = null,
  commandCenter = null,
  housingCommand = null,
  emergencyAccessCommand = null,
  bundle = null,
} = {}) {
  const activeQueueItems = filterActiveReviewWorkflowItems(queueItems || []);
  const resolvedQueueItems = filterResolvedReviewWorkflowItems(queueItems || []);
  const resolvedModuleCounts = countResolvedItemsByModule(resolvedQueueItems);
  const resolvedIssueCounts = countResolvedItemsByIssueType(resolvedQueueItems);
  const adjustedFocusAreas = buildAdjustedFocusAreas(
    householdMap?.focus_areas || [],
    resolvedModuleCounts,
    resolvedIssueCounts
  );
  const baseOverallScore = clampScore(householdMap?.overall_score || 0);
  const adjustedAverageScore = adjustedFocusAreas.length
    ? clampScore(
        adjustedFocusAreas.reduce((sum, item) => sum + (item?.score || 0), 0) / adjustedFocusAreas.length
      )
    : baseOverallScore;
  const resolutionLift = Math.min(8, resolvedQueueItems.length * 4);
  const adjustedOverallScore = clampScore(
    Math.max(baseOverallScore, adjustedAverageScore) + resolutionLift
  );
  const adjustedHouseholdMap = householdMap
    ? {
        ...householdMap,
        overall_score: adjustedOverallScore,
        overall_status: toStatus(adjustedOverallScore),
        bottom_line: buildWorkflowAwareBottomLine({
          householdMap,
          activeQueueItems,
          resolvedQueueItems,
        }),
        focus_areas: adjustedFocusAreas,
        review_priorities: filterRowsAgainstResolvedMemory(
          householdMap.review_priorities || [],
          resolvedQueueItems,
          activeQueueItems
        ),
        visibility_gaps: buildWorkflowAwareVisibilityGaps(activeQueueItems, householdMap),
        dependency_signals: householdMap.dependency_signals
          ? {
              ...householdMap.dependency_signals,
              priority_issues: filterRowsAgainstResolvedMemory(
                householdMap.dependency_signals.priority_issues || [],
                resolvedQueueItems,
                activeQueueItems
              ),
            }
          : householdMap?.dependency_signals || null,
      }
    : householdMap;
  const adjustedReviewDigest = buildWorkflowAwareDigest({
    reviewDigest,
    activeQueueItems,
    resolvedQueueItems,
  });
  const adjustedScorecard = buildHouseholdScorecard(adjustedHouseholdMap);
  const adjustedPriorityEngine = buildHouseholdPriorityEngine({
    householdMap: adjustedHouseholdMap,
    commandCenter,
    housingCommand,
    emergencyAccessCommand,
    bundle,
  });

  return {
    householdMap: adjustedHouseholdMap,
    reviewDigest: adjustedReviewDigest,
    queueItems,
    activeQueueItems,
    resolvedQueueItems,
    scorecard: adjustedScorecard,
    priorityEngine: adjustedPriorityEngine,
    resolutionMemory: buildResolutionMemory(activeQueueItems, resolvedQueueItems),
  };
}

export function hasWorkflowMemoryOpenItems(items = []) {
  return items.some((item) => !isReviewWorkflowItemResolved(item));
}
