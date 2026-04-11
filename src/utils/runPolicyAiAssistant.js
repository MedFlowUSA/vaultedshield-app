import { buildPolicyAiResponse } from "../lib/policyAi/buildPolicyAiResponse.js";
import { classifyPolicyQuestion } from "../lib/policyAi/classifyPolicyQuestion.js";

const MAX_SENTENCES = 6;

function trimToSentenceLimit(value = "", limit = MAX_SENTENCES) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return sentences.slice(0, limit).join(" ").trim();
}

function removeReplacementAdviceLanguage(value = "") {
  return String(value || "")
    .replace(/\bshould\s+replace\s+the\s+policy\b/gi, "should be reviewed with the underlying policy documents")
    .replace(/\bshould\s+replace\s+this\s+policy\b/gi, "should be reviewed with the underlying policy documents")
    .trim();
}

function toLegacySignal(policySignals = null) {
  if (!policySignals) return null;
  const activeReasons = policySignals.reasons || [];
  const activeFlags = policySignals.flags || {};
  const pressureReasons = activeReasons.filter((reason) => !/does not show|no visible/i.test(reason));

  return {
    policy_signal: policySignals.signalLevel,
    primary_reason: activeReasons[0] || policySignals.summaryLabel,
    signal_reasons: activeReasons,
    risk_flags: policySignals.signalLevel === "at_risk" ? pressureReasons : [],
    monitor_flags: policySignals.signalLevel === "monitor" ? pressureReasons : [],
    confidence: policySignals.confidence,
    missing_fields: activeFlags.incompleteData ? ["policy_signal_evidence"] : [],
  };
}

function shouldReferenceSignal(intent, question = "") {
  const text = String(question || "").toLowerCase();
  return (
    ["risk_summary", "performance_summary", "policy_review_priority", "rating_explanation", "generic_summary"].includes(intent) ||
    text.includes("pay attention") ||
    text.includes("watch")
  );
}

function withSignalContext(answer, policySignals, intent, question) {
  if (!policySignals || !shouldReferenceSignal(intent, question)) return answer;
  if (String(answer || "").toLowerCase().includes("policy signal")) return answer;

  const signalLabel = String(policySignals.signalLevel || "monitor").replace(/_/g, " ");
  const reason = policySignals.reasons?.[0] ? ` ${policySignals.reasons[0]}` : "";
  return `Policy signal: ${signalLabel}.${reason} ${answer}`.trim();
}

function buildCurrentPolicyBundle({
  policyInterpretation = null,
  trendSummary = null,
  comparisonData = null,
  signalsOutput = null,
  policySignals = null,
} = {}) {
  const resolvedSignals = toLegacySignal(policySignals) || signalsOutput || comparisonData?.policy_signals || null;
  const comparisonRow = {
    ...(comparisonData || {}),
    policy_signals: resolvedSignals,
  };

  return {
    comparisonRow,
    policyInterpretation,
    trendSummary,
    missingFields: comparisonData?.missing_fields || resolvedSignals?.missing_fields || [],
  };
}

export function runPolicyAiAssistant({
  userQuestion = "",
  policyInterpretation = null,
  trendSummary = null,
  comparisonData = null,
  signalsOutput = null,
  policySignals = null,
  comparisonPolicyBundle = null,
} = {}) {
  const question = String(userQuestion || "").trim();
  const intent = classifyPolicyQuestion(question);
  const response = buildPolicyAiResponse({
    currentPolicyBundle: buildCurrentPolicyBundle({
      policyInterpretation,
      trendSummary,
      comparisonData,
      signalsOutput,
      policySignals,
    }),
    comparisonPolicyBundle,
    userQuestion: question,
    intent,
  });

  const answer = trimToSentenceLimit(
    removeReplacementAdviceLanguage(withSignalContext(response.answer, policySignals, intent, question))
  );

  return {
    answer,
    evidence: response.evidence || [],
    confidence: policySignals?.confidence ?? signalsOutput?.confidence ?? comparisonData?.policy_signals?.confidence ?? null,
    intent,
    missingData: response.missingData || [],
    disclaimers: (response.disclaimers || []).filter((item) => !/replace policy/i.test(item)),
  };
}
