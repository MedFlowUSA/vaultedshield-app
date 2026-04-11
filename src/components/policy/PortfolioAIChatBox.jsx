import { useEffect, useRef, useState } from "react";
import SectionCard from "../shared/SectionCard";
import StatusBadge from "../shared/StatusBadge";
import { runPortfolioAiAssistant } from "../../utils/runPortfolioAiAssistant.js";

const STARTER_QUESTIONS = [
  "Which policy needs attention first?",
  "Which policy looks strongest?",
  "What are the biggest risks across my policies?",
  "Do I have any weak policies?",
  "Where is my data incomplete?",
];

function buildId(prefix) {
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

export default function PortfolioAIChatBox({ policies = [], portfolioSignals = null }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    {
      id: "portfolio-assistant-welcome",
      role: "assistant",
      answer:
        "Ask about the overall insurance portfolio, which policy needs review first, where the risks cluster, or where data is incomplete. I will answer from the structured portfolio signals already on this page.",
      evidence: [],
      intent: "general_summary",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  function handleSubmit(rawQuestion = question) {
    const nextQuestion = String(rawQuestion || "").trim();
    if (!nextQuestion || isLoading) return;

    setQuestion("");
    setMessages((current) => [
      ...current,
      {
        id: buildId("user"),
        role: "user",
        answer: nextQuestion,
      },
    ]);
    setIsLoading(true);

    window.setTimeout(() => {
      const response = runPortfolioAiAssistant({
        userQuestion: nextQuestion,
        policies,
        portfolioSignals,
      });

      setMessages((current) => [
        ...current,
        {
          id: buildId("assistant"),
          role: "assistant",
          ...response,
        },
      ]);
      setIsLoading(false);
    }, 120);
  }

  return (
    <SectionCard
      title="Ask About Your Portfolio"
      subtitle="Deterministic portfolio assistant using the current policy list and portfolio signals."
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
          This assistant does not use an outside LLM. It classifies your question, reads the portfolio signal object and the saved policy set, and responds from deterministic portfolio evidence.
        </div>

        <div
          ref={scrollRef}
          style={{
            minHeight: "260px",
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
                  {message.confidence !== null && message.confidence !== undefined ? (
                    <StatusBadge label={`Confidence: ${Math.round(Number(message.confidence) * 100)}%`} tone="good" />
                  ) : null}
                </div>
              ) : null}
              {message.role === "assistant" && message.evidence?.length > 0 ? (
                <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
                  {message.evidence.slice(0, 4).map((point) => (
                    <div
                      key={`${message.id}-${point.label}-${point.value}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "12px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        display: "grid",
                        gap: "4px",
                      }}
                    >
                      <div style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                        {point.label}
                      </div>
                      <div style={{ color: "#0f172a", fontWeight: 700 }}>{point.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {isLoading ? <div style={bubbleStyle("assistant")}>Reading the portfolio evidence...</div> : null}
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
            placeholder="Ask: Which policy needs attention first? What are my biggest risks?"
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
  );
}
