import { buildPortfolioAiResponse } from "../lib/policyAi/buildPortfolioAiResponse.js";
import { classifyPortfolioQuestion } from "../lib/policyAi/classifyPortfolioQuestion.js";

const MAX_SENTENCES = 6;

function trimToSentenceLimit(value = "", limit = MAX_SENTENCES) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return sentences.slice(0, limit).join(" ").trim();
}

function stripAdviceLanguage(value = "") {
  return String(value || "")
    .replace(/\bshould\s+buy\b/gi, "can review")
    .replace(/\bshould\s+switch\b/gi, "can review")
    .replace(/\bshould\s+replace\b/gi, "can review")
    .trim();
}

export function runPortfolioAiAssistant({
  userQuestion = "",
  policies = [],
  portfolioSignals = null,
} = {}) {
  const question = String(userQuestion || "").trim();
  const intent = classifyPortfolioQuestion(question);
  const response = buildPortfolioAiResponse({
    policies,
    portfolioSignals,
    userQuestion: question,
    intent,
  });

  return {
    answer: trimToSentenceLimit(stripAdviceLanguage(response.answer)),
    evidence: response.evidence || [],
    confidence: response.confidence ?? portfolioSignals?.confidence ?? null,
    intent,
  };
}
