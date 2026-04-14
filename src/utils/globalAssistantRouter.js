import {
  classifyPolicyQuestionType,
  POLICY_QUESTION_TYPES,
} from "./policyQuestionClassifier.js";
import { generatePolicyResponse } from "./policyResponseEngine.js";
import {
  classifyMortgageQuestionType,
  MORTGAGE_QUESTION_TYPES,
} from "./mortgageQuestionClassifier.js";
import { generateMortgageResponse } from "./mortgageResponseEngine.js";
import {
  classifyPropertyQuestionType,
  PROPERTY_QUESTION_TYPES,
} from "./propertyQuestionClassifier.js";
import { generatePropertyResponse } from "./propertyResponseEngine.js";
import {
  answerHouseholdQuestion,
  classifyHouseholdQuestion,
} from "../lib/domain/platformIntelligence/householdIntelligenceEngine.js";
import { buildHouseholdAssistantReviewActions } from "../lib/reviewWorkspace/workspaceFilters.js";
import { buildWorkflowAwareHouseholdContext } from "../lib/domain/platformIntelligence/workflowMemory.js";

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizePolicySectionTargets(type) {
  switch (type) {
    case POLICY_QUESTION_TYPES.illustration_vs_actual:
      return ["illustration-proof", "annual-review"];
    case POLICY_QUESTION_TYPES.charges:
      return ["policy-metrics", "evidence-ledger"];
    case POLICY_QUESTION_TYPES.comparison:
      return ["comparison-read"];
    case POLICY_QUESTION_TYPES.loans:
      return ["policy-metrics", "annual-review"];
    case POLICY_QUESTION_TYPES.missing_data:
      return ["evidence-ledger", "trust-read"];
    case POLICY_QUESTION_TYPES.policy_health:
      return ["trust-read", "annual-review"];
    case POLICY_QUESTION_TYPES.performance:
    case POLICY_QUESTION_TYPES.general:
    default:
      return ["policy-metrics", "trust-read"];
  }
}

const HOUSEHOLD_SECTION_TARGETS = {
  priority_review: ["household-priority", "household-review-digest", "action-required"],
  change_review: ["household-review-digest", "household-risk-map"],
  continuity_status: ["household-priority", "household-risk-map", "module-overview"],
  document_readiness: ["household-review-digest", "action-required", "module-overview"],
  portal_readiness: ["household-risk-map", "action-required", "module-overview"],
  property_operating_graph: ["property-operating-graph", "household-priority"],
  insurance_strength: ["insurance-intelligence", "action-required"],
  dependency_alignment: ["action-required", "household-risk-map", "property-operating-graph"],
  general_summary: ["household-priority", "household-review-digest", "module-overview"],
};

function normalizeHouseholdConfidence(confidenceLabel = "", householdMap = null, bundle = null) {
  const assetCount = normalizeArray(bundle?.assets).length;
  const documentCount = normalizeArray(bundle?.documents).length;
  const portalCount = Number(bundle?.portalReadiness?.portalCount || 0);
  const visibilityGapCount = normalizeArray(householdMap?.visibility_gaps).length;

  if (assetCount === 0) return "low";
  if (confidenceLabel === "strong" && (documentCount === 0 || portalCount === 0 || visibilityGapCount >= 2)) {
    return "medium";
  }
  if (confidenceLabel === "strong") return "high";
  if (confidenceLabel === "moderate") return "medium";
  return "low";
}

function normalizeHouseholdFact(point, index) {
  const text = String(point || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return {
      label: `Evidence ${index + 1}`,
      value: "Not available",
    };
  }

  const separatorIndex = text.indexOf(":");
  if (separatorIndex > 0) {
    return {
      label: text.slice(0, separatorIndex).trim(),
      value: text.slice(separatorIndex + 1).trim() || "Visible",
    };
  }

  return {
    label: `Evidence ${index + 1}`,
    value: text,
  };
}

function normalizeHouseholdUncertainty({ householdMap = null, bundle = null, confidenceLabel = "" }) {
  const visibilityGaps = normalizeArray(householdMap?.visibility_gaps);
  const assetCount = normalizeArray(bundle?.assets).length;
  const documentCount = normalizeArray(bundle?.documents).length;
  const portalCount = Number(bundle?.portalReadiness?.portalCount || 0);

  if (confidenceLabel === "strong" && visibilityGaps.length === 0 && assetCount > 0) {
    return null;
  }

  if (assetCount === 0) {
    return "A more complete household review would require visible records across the core modules before the platform can rank priorities cleanly.";
  }

  if (documentCount === 0 || portalCount === 0 || visibilityGaps.length > 0) {
    return "A more complete household review would require broader document, portal, and cross-module support before this read can be treated as complete.";
  }

  return "This household read is usable, but some supporting context is still limited.";
}

function normalizeHouseholdReviewFocus({ householdMap = null, response = null, reviewDigest = null }) {
  const visibilityGaps = normalizeArray(householdMap?.visibility_gaps).slice(0, 3);
  if (visibilityGaps.length > 0) return visibilityGaps;

  const actionLabels = normalizeArray(response?.actions)
    .map((action) => action?.label)
    .filter(Boolean)
    .slice(0, 3);
  if (actionLabels.length > 0) return actionLabels;

  return normalizeArray(reviewDigest?.bullets).slice(0, 3);
}

function normalizeHouseholdEnvelope(response, type, context = {}) {
  const householdMap = normalizeObject(context.householdMap);
  const bundle = normalizeObject(context.bundle);
  const reviewDigest = normalizeObject(context.reviewDigest);
  const queueItems = normalizeArray(context.queueItems);
  const householdId = context.householdId || null;
  const evidencePoints = normalizeArray(response?.evidence_points).slice(0, 4);
  const facts = evidencePoints.map(normalizeHouseholdFact);
  const uncertainty = normalizeHouseholdUncertainty({
    householdMap,
    bundle,
    confidenceLabel: response?.confidence_label,
  });
  const uncertainties = [
    ...normalizeArray(householdMap?.visibility_gaps).slice(0, 3),
    normalizeArray(bundle?.documents).length > 0
      ? null
      : "Document support is still limited across the current household record.",
    Number(bundle?.portalReadiness?.portalCount || 0) > 0
      ? null
      : "Portal continuity coverage is still limited.",
  ].filter(Boolean);
  const safeReviewFocus = normalizeHouseholdReviewFocus({
    householdMap,
    response,
    reviewDigest,
  });
  const followupPrompts = normalizeArray(response?.followup_prompts);
  const actions = normalizeArray(response?.actions);
  const reviewActions = buildHouseholdAssistantReviewActions({
    intent: type,
    queueItems,
    householdId,
  });

  return {
    answer: response?.answer_text || "Based on available data, the household review is still limited.",
    whyThisRead: evidencePoints,
    why_this_read: evidencePoints,
    supportingData: {
      facts,
      why: evidencePoints,
      uncertainties,
      review_focus: safeReviewFocus,
    },
    supporting_data: {
      facts,
      why: evidencePoints,
      uncertainties,
      review_focus: safeReviewFocus,
    },
    uncertainty,
    safeReviewFocus,
    safe_review_focus: safeReviewFocus,
    confidence: normalizeHouseholdConfidence(response?.confidence_label, householdMap, bundle),
    source: "household_engine",
    sourceMetadata: {
      label: "household_engine",
      evidenceCount: facts.length,
      actionCount: actions.length,
      followupCount: followupPrompts.length,
      responseType: type,
    },
    source_metadata: {
      label: "household_engine",
      evidence_count: facts.length,
      action_count: actions.length,
      followup_count: followupPrompts.length,
      response_type: type,
    },
    sectionTargets:
      HOUSEHOLD_SECTION_TARGETS[type] || HOUSEHOLD_SECTION_TARGETS.general_summary,
    actions,
    reviewAction: reviewActions[0] || null,
    reviewActions,
    followupPrompts,
    followup_prompts: followupPrompts,
  };
}

function normalizePolicyEnvelope(response, type) {
  const whyThisRead = normalizeArray(response?.supporting_data?.why);
  const uncertainties = normalizeArray(response?.supporting_data?.uncertainties);
  const safeReviewFocus = normalizeArray(response?.supporting_data?.review_focus);
  const facts = normalizeArray(response?.supporting_data?.facts);

  return {
    answer: response?.answer || "Based on available data, this policy read is still limited.",
    whyThisRead,
    why_this_read: whyThisRead,
    supportingData: {
      ...(response?.supporting_data || {}),
      facts,
      uncertainties,
      review_focus: safeReviewFocus,
    },
    supporting_data: {
      ...(response?.supporting_data || {}),
      facts,
      uncertainties,
      review_focus: safeReviewFocus,
    },
    uncertainty:
      uncertainties.length > 0
        ? "A more complete policy review would require stronger statement support or fewer missing fields."
        : null,
    safeReviewFocus,
    safe_review_focus: safeReviewFocus,
    confidence: response?.confidence || "low",
    source: response?.source || "policy_engine",
    sourceMetadata: {
      label: response?.source || "policy_engine",
      evidenceCount: facts.length,
      missingDataCount: uncertainties.length,
      responseType: type,
    },
    source_metadata: {
      label: response?.source || "policy_engine",
      evidence_count: facts.length,
      missing_data_count: uncertainties.length,
      response_type: type,
    },
    evidence: response?.evidence || facts,
    missingData: response?.missingData || uncertainties,
    disclaimers: response?.disclaimers || [],
    sectionTargets: normalizePolicySectionTargets(type),
  };
}

export function routeGlobalAssistantRequest({
  assistantType,
  question = "",
  recordContext,
  analyticsContext,
  householdContext = null,
  comparisonContext = null,
  precomputed = {},
} = {}) {
  if (!assistantType) {
    throw new Error("Structured assistant routing requires an assistant type.");
  }

  if (!String(question || "").trim()) {
    throw new Error("Structured assistant routing requires a question.");
  }

  if (recordContext === undefined || analyticsContext === undefined) {
    throw new Error("Structured assistant routing requires record and analytics context.");
  }

  switch (assistantType) {
    case "policy": {
      const type = classifyPolicyQuestionType(question) || POLICY_QUESTION_TYPES.general;
      const response = generatePolicyResponse({
        question,
        type,
        policy: recordContext || {},
        analytics: analyticsContext || {},
        household_context: householdContext,
        comparison_policy: comparisonContext,
        precomputed,
      });
      return {
        assistantType,
        type,
        ...normalizePolicyEnvelope(response, type),
      };
    }
    case "mortgage": {
      const type = classifyMortgageQuestionType(question) || MORTGAGE_QUESTION_TYPES.general;
      const response = generateMortgageResponse({
        question,
        type,
        mortgage: recordContext || {},
        analytics: analyticsContext || {},
        precomputed,
      });
      return {
        assistantType,
        type,
        ...response,
      };
    }
    case "property": {
      const type = classifyPropertyQuestionType(question) || PROPERTY_QUESTION_TYPES.general;
      const response = generatePropertyResponse({
        question,
        type,
        property: recordContext || {},
        analytics: analyticsContext || {},
        precomputed,
      });
      return {
        assistantType,
        type,
        ...response,
      };
    }
    case "household": {
      const classification = classifyHouseholdQuestion(question);
      const type = classification?.intent || "general_summary";
      const reviewDigest = precomputed.reviewDigest || householdContext?.reviewDigest || null;
      const queueItems = precomputed.queueItems || householdContext?.queueItems || [];
      const bundle =
        precomputed.bundle || householdContext?.bundle || {};
      const householdId =
        precomputed.householdId || householdContext?.householdId || bundle?.household?.id || null;
      const workflowAwareContext = buildWorkflowAwareHouseholdContext({
        householdMap: recordContext || null,
        queueItems,
        reviewDigest,
        commandCenter: precomputed.commandCenter || householdContext?.commandCenter || null,
        housingCommand: precomputed.housingCommand || householdContext?.housingCommand || null,
        emergencyAccessCommand:
          precomputed.emergencyAccessCommand || householdContext?.emergencyAccessCommand || null,
        bundle,
      });
      const scorecard =
        precomputed.scorecard ||
        householdContext?.scorecard ||
        workflowAwareContext.scorecard ||
        null;
      const priorityEngine =
        precomputed.priorityEngine ||
        householdContext?.priorityEngine ||
        workflowAwareContext.priorityEngine ||
        null;
      const response = answerHouseholdQuestion({
        questionText: question,
        householdMap: workflowAwareContext.householdMap || recordContext || null,
        reviewDigest: workflowAwareContext.reviewDigest || reviewDigest,
        queueItems: workflowAwareContext.activeQueueItems || queueItems,
        intelligence: analyticsContext || null,
        bundle,
        scorecard,
        priorityEngine,
      });
      return {
        assistantType,
        type,
        ...normalizeHouseholdEnvelope(response, type, {
          householdMap: workflowAwareContext.householdMap || recordContext || null,
          bundle,
          reviewDigest: workflowAwareContext.reviewDigest || reviewDigest,
          queueItems: workflowAwareContext.activeQueueItems || queueItems,
          householdId,
        }),
      };
    }
    default:
      throw new Error(`Structured assistant routing does not support "${assistantType}".`);
  }
}

export default routeGlobalAssistantRequest;
