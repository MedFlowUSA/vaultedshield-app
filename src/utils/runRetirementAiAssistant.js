import { classifyRetirementQuestion } from "../lib/retirementAi/classifyRetirementQuestion.js";
import { buildRetirementAiResponse } from "../lib/retirementAi/buildRetirementAiResponse.js";

export function runRetirementAiAssistant({
  userQuestion,
  retirementSignals = null,
  retirementRead = null,
  retirementActionFeed = [],
  positionSummary = null,
  latestSnapshot = null,
  latestAnalytics = null,
} = {}) {
  const question = String(userQuestion || "").trim();
  const intent = classifyRetirementQuestion(question);
  const response = buildRetirementAiResponse({
    intent,
    retirementSignals,
    retirementRead,
    retirementActionFeed,
    positionSummary,
    latestSnapshot,
    latestAnalytics,
  });

  return {
    ...response,
    intent: intent.intent,
  };
}

export default runRetirementAiAssistant;
