import { useMemo, useRef, useState } from "react";
import SectionCard from "../shared/SectionCard";
import StatusBadge from "../shared/StatusBadge";
import { runRetirementAiAssistant } from "../../utils/runRetirementAiAssistant.js";

const STARTER_PROMPTS = [
  "Is this account in good shape?",
  "What are the risks here?",
  "What should I review first?",
  "Is my data incomplete?",
  "Am I too concentrated?",
  "Is there any loan or beneficiary risk?",
];

export default function RetirementAIChatBox({
  retirementSignals = null,
  retirementRead = null,
  retirementActionFeed = [],
  positionSummary = null,
  latestSnapshot = null,
  latestAnalytics = null,
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const starterPrompts = useMemo(() => STARTER_PROMPTS, []);

  function appendResponse(userQuestion) {
    const response = runRetirementAiAssistant({
      userQuestion,
      retirementSignals,
      retirementRead,
      retirementActionFeed,
      positionSummary,
      latestSnapshot,
      latestAnalytics,
    });

    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        question: userQuestion,
        response,
      },
    ]);
    window.setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 30);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const cleanQuestion = String(question || "").trim();
    if (!cleanQuestion) return;
    setLoading(true);
    appendResponse(cleanQuestion);
    setQuestion("");
    setLoading(false);
  }

  function handlePrompt(prompt) {
    setLoading(true);
    appendResponse(prompt);
    setLoading(false);
  }

  return (
    <SectionCard title="Ask About This Account" subtitle="Deterministic retirement Q&A using the current account evidence already loaded on this page.">
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handlePrompt(prompt)}
              style={{
                padding: "10px 12px",
                borderRadius: "999px",
                border: "1px solid #dbeafe",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontWeight: 700,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "12px", alignItems: "center" }}>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about risks, concentration, missing data, or what to review first"
            style={{
              padding: "14px 16px",
              borderRadius: "14px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              width: "100%",
              minWidth: 0,
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            disabled={!question.trim() || loading}
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              border: "none",
              background: question.trim() ? "#0f172a" : "#94a3b8",
              color: "#ffffff",
              cursor: question.trim() ? "pointer" : "not-allowed",
              fontWeight: 700,
            }}
          >
            {loading ? "Working..." : "Ask"}
          </button>
        </form>

        <div
          ref={scrollRef}
          style={{
            display: "grid",
            gap: "12px",
            maxHeight: "420px",
            overflowY: "auto",
            paddingRight: "4px",
          }}
        >
          {messages.length === 0 ? (
            <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", lineHeight: "1.7" }}>
              Ask a focused question and this account will answer from its current deterministic signals, not a generic model response.
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} style={{ display: "grid", gap: "10px" }}>
                <div style={{ justifySelf: "end", maxWidth: "85%", padding: "12px 14px", borderRadius: "16px", background: "#0f172a", color: "#ffffff", lineHeight: "1.6" }}>
                  {message.question}
                </div>
                <div style={{ maxWidth: "92%", padding: "16px 18px", borderRadius: "18px", background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)", border: "1px solid rgba(147, 197, 253, 0.28)", display: "grid", gap: "12px" }}>
                  <div style={{ color: "#0f172a", lineHeight: "1.8", fontWeight: 600 }}>{message.response.answer}</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <StatusBadge label={`Intent: ${message.response.intent.replace(/_/g, " ")}`} tone="info" />
                    <StatusBadge label={`${Math.round((message.response.confidence || 0) * 100)}% confidence`} tone="info" />
                  </div>
                  {message.response.evidence?.length ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                      {message.response.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </SectionCard>
  );
}
