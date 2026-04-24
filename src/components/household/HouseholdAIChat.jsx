import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import StructuredAssistantResponse from "../assistant/StructuredAssistantResponse";
import AssistantWorkflowActions from "../assistant/AssistantWorkflowActions";
import { routeGlobalAssistantRequest } from "../../utils/globalAssistantRouter.js";
import { executeSmartAction } from "../../lib/navigation/smartActions";

const BASE_PROMPTS = [
  "What should I review first?",
  "What changed since last review?",
  "Why is household readiness rated this way?",
  "What is limiting continuity most?",
  "Are my assets and protection aligned?",
  "How strong is the insurance side right now?",
  "Are portal and access records in good shape?",
];

function buildId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function bubbleStyle(role) {
  const isUser = role === "user";
  return {
    justifySelf: isUser ? "end" : "start",
    maxWidth: "min(860px, 94%)",
    padding: "14px 16px",
    borderRadius: isUser ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
    background: isUser ? "rgba(59,130,246,0.2)" : "#ffffff",
    color: isUser ? "#eff6ff" : "#0f172a",
    border: isUser ? "1px solid rgba(147,197,253,0.32)" : "1px solid rgba(148, 163, 184, 0.22)",
    boxShadow: isUser ? "none" : "0 12px 30px rgba(15, 23, 42, 0.08)",
    lineHeight: "1.7",
    display: "grid",
    gap: "12px",
  };
}

function secondaryButtonStyle(disabled = false) {
  return {
    padding: "10px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(248,250,252,0.08)",
    color: "#e2e8f0",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
    fontSize: "12px",
    opacity: disabled ? 0.55 : 1,
  };
}

function primaryButtonStyle(disabled = false) {
  return {
    padding: "12px 16px",
    borderRadius: "12px",
    border: "none",
    background: disabled ? "#475569" : "#f8fafc",
    color: "#020617",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
  };
}

function getLoadingMessage(question = "") {
  const normalized = String(question || "").toLowerCase();
  if (normalized.includes("changed") || normalized.includes("review")) {
    return "Pulling together the latest household review changes...";
  }
  if (normalized.includes("portal") || normalized.includes("access")) {
    return "Checking access and continuity support...";
  }
  if (normalized.includes("property")) {
    return "Looking through the household property picture...";
  }
  if (normalized.includes("insurance") || normalized.includes("policy")) {
    return "Reviewing the current insurance picture...";
  }
  return "Reading the current household picture...";
}

class HouseholdAiChatErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("[VaultedShield] Household AI chat render failure", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "18px",
            background: "rgba(124, 45, 18, 0.28)",
            border: "1px solid rgba(251, 146, 60, 0.35)",
            color: "#fed7aa",
            lineHeight: "1.7",
          }}
        >
          {this.state.error?.message ||
            "Household AI could not be rendered, so VaultedShield left the dashboard available in a safe fallback state."}
        </div>
      );
    }

    return this.props.children;
  }
}

export default function HouseholdAIChat({
  householdId,
  householdMap = null,
  intelligence = null,
  reviewDigest = null,
  queueItems = [],
  bundle = {},
  scorecard = null,
  priorityEngine = null,
  onNavigate,
  sectionLabels = {},
  onJumpToSection,
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Reading the current household picture...");
  const [runtimeError, setRuntimeError] = useState("");
  const scrollRef = useRef(null);

  const starterPrompts = useMemo(() => {
    if ((bundle?.assets || []).length === 0) {
      return [
        "What is missing from this household view?",
        "What should I review first once records are added?",
        "What is limiting continuity most?",
        "Are portal and access records in good shape?",
      ];
    }

    if ((bundle?.documents || []).length === 0) {
      return [
        ...BASE_PROMPTS.slice(0, 3),
        "Are documents limiting the household read?",
        ...BASE_PROMPTS.slice(4, 6),
      ];
    }

    return BASE_PROMPTS;
  }, [bundle?.assets, bundle?.documents]);

  useEffect(() => {
    setQuestion("");
    setMessages([
        {
          id: "household-ai-welcome",
          role: "assistant",
          response: {
            answer:
              "Ask what needs attention first, what changed recently, or where the household picture still needs support. VaultedShield will start with a plain-English answer and keep the deeper evidence close by when you want it.",
            confidence: "medium",
            source: "household_engine",
            supportingData: {
            facts: [],
            uncertainties: [],
            review_focus: [],
          },
        },
      },
    ]);
    setRuntimeError("");
  }, [householdId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const submitQuestion = useCallback(
    (rawQuestion) => {
      const nextQuestion = String(rawQuestion || "").trim();
      if (!nextQuestion || isLoading) return;

      setRuntimeError("");
      setQuestion("");
      setMessages((current) => [
        ...current,
        {
          id: buildId("user"),
          role: "user",
          question: nextQuestion,
        },
      ]);
      setLoadingLabel(getLoadingMessage(nextQuestion));
      setIsLoading(true);

      window.setTimeout(() => {
        try {
          const response = routeGlobalAssistantRequest({
            assistantType: "household",
            question: nextQuestion,
            recordContext: householdMap || null,
            analyticsContext: intelligence || {},
            precomputed: {
              householdId,
              reviewDigest,
              queueItems,
              bundle,
              scorecard,
              priorityEngine,
            },
          });

          setMessages((current) => [
            ...current,
            {
              id: buildId("assistant"),
              role: "assistant",
              type: response.type || "general_summary",
              response,
            },
          ]);
        } catch (error) {
          console.error("[VaultedShield] Household AI response failure", error);
          setRuntimeError(error?.message || "Household AI response could not be generated.");
        } finally {
          setIsLoading(false);
        }
      }, 160);
    },
    [bundle, householdId, householdMap, intelligence, isLoading, priorityEngine, queueItems, reviewDigest, scorecard]
  );

  return (
    <HouseholdAiChatErrorBoundary>
      <div style={{ display: "grid", gap: "16px" }}>
        {runtimeError ? (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "12px",
              background: "rgba(124, 45, 18, 0.28)",
              border: "1px solid rgba(251, 146, 60, 0.35)",
              color: "#fed7aa",
              lineHeight: "1.6",
            }}
          >
            {runtimeError}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
            Quick Questions
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => submitQuestion(prompt)}
                disabled={isLoading}
                style={secondaryButtonStyle(isLoading)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          style={{
            minHeight: "320px",
            maxHeight: "560px",
            overflowY: "auto",
            padding: "16px",
            borderRadius: "20px",
            background: "rgba(15,23,42,0.3)",
            border: "1px solid rgba(255,255,255,0.05)",
            display: "grid",
            gap: "12px",
            alignContent: "start",
          }}
        >
          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} style={bubbleStyle("user")}>
                <div>{message.question}</div>
              </div>
            ) : (
              <div key={message.id} style={bubbleStyle("assistant")}>
                <StructuredAssistantResponse
                  response={message.response}
                  type={message.type}
                  sectionLabels={sectionLabels}
                  onJumpToSection={onJumpToSection}
                />

                <AssistantWorkflowActions
                  actions={message.response?.reviewActions || (message.response?.reviewAction ? [message.response.reviewAction] : [])}
                  onAction={(action) => {
                    if (action?.route && typeof onNavigate === "function") {
                      onNavigate(action.route);
                    }
                  }}
                />

                {(message.response?.actions || []).length > 0 ? (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {message.response.actions.map((action) => (
                      <button
                        key={action.id || `${action.label}-${action.route || "action"}`}
                        type="button"
                        onClick={() =>
                          executeSmartAction(action, {
                            navigate: onNavigate,
                            scrollToSection: onJumpToSection,
                          })
                        }
                        style={{
                          padding: "8px 12px",
                          borderRadius: "999px",
                          border: "1px solid #dbeafe",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {(message.response?.followupPrompts || message.response?.followup_prompts || []).length > 0 ? (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {(message.response.followupPrompts || message.response.followup_prompts).map((prompt) => (
                      <button
                        key={prompt.id || prompt.label}
                        type="button"
                        onClick={() => submitQuestion(prompt.label)}
                        disabled={isLoading}
                        style={{
                          padding: "7px 11px",
                          borderRadius: "999px",
                          border: "1px solid rgba(148, 163, 184, 0.22)",
                          background: "#f8fafc",
                          color: "#334155",
                          cursor: isLoading ? "not-allowed" : "pointer",
                          fontWeight: 700,
                          fontSize: "12px",
                          opacity: isLoading ? 0.55 : 1,
                        }}
                      >
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          )}

          {isLoading ? <div style={bubbleStyle("assistant")}>{loadingLabel}</div> : null}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion(question);
          }}
          style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "10px" }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask what matters most across the household"
            disabled={isLoading}
            style={{
              width: "100%",
              minWidth: 0,
              padding: "12px 14px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(15,23,42,0.55)",
              color: "#e2e8f0",
            }}
          />
          <button type="submit" disabled={isLoading || !question.trim()} style={primaryButtonStyle(isLoading || !question.trim())}>
            Ask
          </button>
        </form>
      </div>
    </HouseholdAiChatErrorBoundary>
  );
}
