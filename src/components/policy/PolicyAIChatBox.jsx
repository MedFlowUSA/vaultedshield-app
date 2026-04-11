import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SectionCard from "../shared/SectionCard";
import StatusBadge from "../shared/StatusBadge";
import { useDemoMode } from "../../lib/demo/DemoModeContext";
import { runPolicyAiAssistant } from "../../utils/runPolicyAiAssistant";

const STARTER_QUESTIONS = [
  "Is this policy performing well?",
  "What are the risks?",
  "How much are charges affecting this?",
  "How does this compare to my other policy?",
  "What does this mean?",
];

const WELCOME_MESSAGE = {
  id: "assistant-welcome",
  role: "assistant",
  answer:
    "Ask me about this policy's performance, risks, charges, or how it compares with another saved policy. I will use the structured policy data already on this page.",
  evidence: [],
  intent: "general",
};

function buildMessageId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function bubbleStyle(role) {
  const isUser = role === "user";
  return {
    justifySelf: isUser ? "end" : "start",
    maxWidth: "min(760px, 92%)",
    padding: "12px 14px",
    borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
    background: isUser ? "#0f172a" : "#ffffff",
    color: isUser ? "#ffffff" : "#0f172a",
    border: isUser ? "1px solid #0f172a" : "1px solid rgba(148, 163, 184, 0.24)",
    boxShadow: isUser ? "none" : "0 10px 24px rgba(15, 23, 42, 0.06)",
    lineHeight: "1.65",
  };
}

function evidenceCardStyle() {
  return {
    padding: "10px 12px",
    borderRadius: "12px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "grid",
    gap: "4px",
  };
}

export default function PolicyAIChatBox({
  policyInterpretation,
  trendSummary,
  comparisonData,
  signalsOutput,
  policySignals,
  comparisonOptions = [],
  onLatestEntryChange,
}) {
  const { assistantCue } = useDemoMode();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [selectedComparisonId, setSelectedComparisonId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);
  const lastDemoPromptKeyRef = useRef("");

  const selectedComparison = useMemo(
    () => comparisonOptions.find((option) => option.id === selectedComparisonId) || null,
    [comparisonOptions, selectedComparisonId]
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const appendAssistantResponse = useCallback((nextQuestion) => {
    const response = runPolicyAiAssistant({
      userQuestion: nextQuestion,
      policyInterpretation,
      trendSummary,
      comparisonData,
      signalsOutput,
      policySignals,
      comparisonPolicyBundle: selectedComparison?.bundle || null,
    });
    const assistantMessage = {
      id: buildMessageId("assistant"),
      role: "assistant",
      ...response,
      comparisonPolicyId: selectedComparison?.id || null,
    };

    setMessages((current) => [...current, assistantMessage]);
    onLatestEntryChange?.({
      intent: response.intent,
      question: nextQuestion,
      comparisonPolicyId: selectedComparison?.id || null,
      response,
    });
  }, [
    comparisonData,
    onLatestEntryChange,
    policyInterpretation,
    policySignals,
    selectedComparison,
    signalsOutput,
    trendSummary,
  ]);

  const handleSubmit = useCallback((rawQuestion = question) => {
    const nextQuestion = String(rawQuestion || "").trim();
    if (!nextQuestion || isLoading) return;

    setQuestion("");
    setMessages((current) => [
      ...current,
      {
        id: buildMessageId("user"),
        role: "user",
        answer: nextQuestion,
      },
    ]);
    setIsLoading(true);

    window.setTimeout(() => {
      appendAssistantResponse(nextQuestion);
      setIsLoading(false);
    }, 120);
  }, [appendAssistantResponse, isLoading, question]);

  useEffect(() => {
    if (assistantCue) return;
    lastDemoPromptKeyRef.current = "";
  }, [assistantCue]);

  useEffect(() => {
    if (!assistantCue?.prompt || !assistantCue?.key) return;
    if (lastDemoPromptKeyRef.current === assistantCue.key) return;
    if (isLoading) return;

    lastDemoPromptKeyRef.current = assistantCue.key;
    const timer = window.setTimeout(() => {
      handleSubmit(assistantCue.prompt);
    }, 260);

    return () => window.clearTimeout(timer);
  }, [assistantCue, handleSubmit, isLoading]);

  return (
    <div data-demo-id="policy-ai-assistant">
      <SectionCard
        title="Ask About This Policy"
        subtitle="A deterministic policy assistant using the current interpretation, trend summary, comparison data, and signal output."
      >
        <div style={{ display: "grid", gap: "16px" }}>
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "18px",
            background: "linear-gradient(135deg, #f8fafc 0%, #eef6ff 100%)",
            border: "1px solid rgba(147, 197, 253, 0.42)",
            color: "#475569",
            lineHeight: "1.75",
          }}
        >
          This chat does not call an outside LLM. It classifies the question, selects the matching structured evidence, and returns a plain-English read from the policy engine.
        </div>

        {comparisonOptions.length > 0 ? (
          <label style={{ display: "grid", gap: "6px", color: "#475569", fontSize: "14px" }}>
            <span>Optional comparison policy</span>
            <select
              value={selectedComparisonId}
              onChange={(event) => setSelectedComparisonId(event.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
              }}
            >
              <option value="">Select a second policy for comparison questions</option>
              {comparisonOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div
          ref={scrollRef}
          style={{
            minHeight: "280px",
            maxHeight: "420px",
            overflowY: "auto",
            padding: "16px",
            borderRadius: "20px",
            background: "#f8fafc",
            border: "1px solid rgba(148, 163, 184, 0.22)",
            display: "grid",
            gap: "12px",
            alignContent: "start",
          }}
        >
          {messages.map((message) => (
            <div key={message.id} style={bubbleStyle(message.role)}>
              <div style={{ whiteSpace: "pre-wrap" }}>{message.answer}</div>
              {message.role === "assistant" && message.intent ? (
                <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <StatusBadge label={`Intent: ${message.intent.replace(/_/g, " ")}`} tone="info" />
                  {message.confidence ? <StatusBadge label={`Confidence: ${message.confidence}`} tone="good" /> : null}
                  {message.comparisonPolicyId ? <StatusBadge label={`Compared: ${selectedComparison?.label || "selected policy"}`} tone="warning" /> : null}
                </div>
              ) : null}
              {message.role === "assistant" && message.evidence?.length > 0 ? (
                <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
                  {message.evidence.slice(0, 4).map((point) => (
                    <div key={`${message.id}-${point.label}-${point.value}`} style={evidenceCardStyle()}>
                      <div style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                        {point.label}
                      </div>
                      <div style={{ color: "#0f172a", fontWeight: 700 }}>{point.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {message.role === "assistant" && message.disclaimers?.length > 0 ? (
                <div style={{ marginTop: "10px", color: "#64748b", fontSize: "13px" }}>
                  {message.disclaimers[0]}
                </div>
              ) : null}
            </div>
          ))}

          {isLoading ? (
            <div style={bubbleStyle("assistant")}>
              Reading the policy evidence...
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {STARTER_QUESTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleSubmit(item)}
              disabled={isLoading}
              style={{
                padding: "9px 12px",
                borderRadius: "999px",
                border: "1px solid #dbeafe",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontWeight: 700,
                cursor: isLoading ? "not-allowed" : "pointer",
                fontSize: "13px",
              }}
            >
              {item}
            </button>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit(question);
          }}
          style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "10px" }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask: Is this policy good? What are the risks? How are charges affecting it?"
            disabled={isLoading}
            style={{
              width: "100%",
              minWidth: 0,
              padding: "12px 14px",
              borderRadius: "12px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#0f172a",
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              border: "none",
              background: isLoading || !question.trim() ? "#94a3b8" : "#0f172a",
              color: "#ffffff",
              cursor: isLoading || !question.trim() ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            Ask
          </button>
        </form>
        </div>
      </SectionCard>
    </div>
  );
}
