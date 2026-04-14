import {
  answerPropertyQuestion,
  classifyPropertyQuestion,
} from "../lib/domain/propertyValuation/valuationEngine.js";
import {
  formatCompletenessScore,
  getCompletenessLabel,
  normalizeCompletenessScore,
} from "../lib/assetLinks/linkedContext.js";

function confidenceLabelFromScore(confidence = 0) {
  if (confidence >= 0.8) return "strong";
  if (confidence >= 0.55) return "moderate";
  return "developing";
}

function confidenceNumberFromLabel(label = "") {
  if (label === "strong") return 0.84;
  if (label === "moderate") return 0.64;
  return 0.46;
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeSignalSentence(propertySignals) {
  if (!propertySignals) return "";
  const signalLabel = String(propertySignals.signalLevel || "monitor").replace(/_/g, " ");
  const topReason = propertySignals.reasons?.[0] || "the current property support stack is still mixed";
  const stackScore = normalizeCompletenessScore(propertySignals?.metadata?.stackCompletenessScore);
  const stackSentence =
    stackScore !== null
      ? ` The operating graph currently reads ${getCompletenessLabel(stackScore).toLowerCase()} at ${formatCompletenessScore(stackScore)} completeness.`
      : "";
  return `Overall, this property currently reads as ${signalLabel} because ${topReason.charAt(0).toLowerCase()}${topReason.slice(1)}.${stackSentence}`.trim();
}

function buildReviewFirstAnswer(propertyActionFeed = [], propertySignals = null, fallbackText = "") {
  const topAction = propertyActionFeed[0] || null;
  const signalSentence = normalizeSignalSentence(propertySignals);

  if (!topAction) {
    return [signalSentence, fallbackText].filter(Boolean).join(" ").trim();
  }

  return `${signalSentence} The clearest next review is ${topAction.title.toLowerCase()} because ${topAction.summary.charAt(0).toLowerCase()}${topAction.summary.slice(1)}`.trim();
}

export function runPropertyAiAssistant({
  userQuestion,
  property,
  latestValuation,
  valuationChangeSummary,
  propertyEquityPosition,
  propertyStackAnalytics,
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
  propertyId,
  propertySignals = null,
  propertyActionFeed = [],
} = {}) {
  const questionText = String(userQuestion || "").trim();
  const normalizedQuestion = questionText.toLowerCase();
  const classification = classifyPropertyQuestion(questionText);
  const baseResponse = answerPropertyQuestion({
    questionText,
    property,
    latestValuation,
    valuationChangeSummary,
    propertyEquityPosition,
    propertyStackAnalytics,
    linkedMortgages,
    linkedHomeownersPolicies,
    propertyId,
  });

  const asksReviewPriority =
    normalizedQuestion.includes("review first") ||
    normalizedQuestion.includes("pay attention") ||
    normalizedQuestion.includes("what should i watch") ||
    normalizedQuestion.includes("what matters most");
  const asksRiskSummary =
    normalizedQuestion.includes("risk") ||
    normalizedQuestion.includes("risky") ||
    normalizedQuestion.includes("pressure");

  let answer = baseResponse.answer_text || "";

  if (asksReviewPriority) {
    answer = buildReviewFirstAnswer(propertyActionFeed, propertySignals, baseResponse.answer_text);
  } else if (propertySignals && (asksRiskSummary || classification.intent === "general_property_summary")) {
    answer = `${baseResponse.answer_text} ${normalizeSignalSentence(propertySignals)}.`;
  } else if (
    propertySignals &&
    ["valuation_strength", "debt_coverage_linkage", "missing_property_facts"].includes(classification.intent)
  ) {
    answer = `${baseResponse.answer_text} ${normalizeSignalSentence(propertySignals)}.`;
  }

  answer = answer.replace(/\.\./g, ".").trim();
  if (!/[.!?]$/.test(answer)) {
    answer = `${answer}.`;
  }

  const evidence = unique([
    ...(baseResponse.evidence_points || []),
    ...(asksReviewPriority && propertyActionFeed[0] ? [propertyActionFeed[0].summary] : []),
    ...(propertySignals?.metadata?.stackCompletenessScore !== null && propertySignals?.metadata?.stackCompletenessScore !== undefined
      ? [
          `Property stack completeness is ${formatCompletenessScore(propertySignals.metadata.stackCompletenessScore)} and currently reads ${String(propertySignals.metadata.stackCompletenessLabel || getCompletenessLabel(propertySignals.metadata.stackCompletenessScore)).toLowerCase()}.`,
        ]
      : []),
    ...(propertySignals?.reasons || []).slice(0, 2),
  ]).slice(0, 5);

  const confidence =
    propertySignals?.confidence ??
    confidenceNumberFromLabel(baseResponse.confidence_label);
  const confidenceLabel = propertySignals
    ? confidenceLabelFromScore(propertySignals.confidence)
    : baseResponse.confidence_label;

  return {
    answer,
    answer_text: answer,
    evidence,
    evidence_points: evidence,
    confidence,
    confidence_label: confidenceLabel,
    intent: baseResponse.intent,
    actions: baseResponse.actions || [],
    followup_prompts: baseResponse.followup_prompts || [],
    signal_level: propertySignals?.signalLevel || null,
  };
}

export default runPropertyAiAssistant;
