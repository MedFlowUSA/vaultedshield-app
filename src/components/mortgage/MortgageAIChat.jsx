import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SectionCard from "../shared/SectionCard";
import StructuredAssistantResponse from "../assistant/StructuredAssistantResponse";
import { MORTGAGE_QUESTION_TYPES } from "../../utils/mortgageQuestionClassifier.js";
import { routeGlobalAssistantRequest } from "../../utils/globalAssistantRouter.js";

const BASE_PROMPTS = [
  "What should I review on this mortgage?",
  "Does this mortgage look complete?",
  "What is missing here?",
  "Is escrow visible?",
  "Is this linked to the property correctly?",
  "What should I watch with this loan?",
];

function buildId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function bubbleStyle(role) {
  const isUser = role === "user";
  return {
    justifySelf: isUser ? "end" : "start",
    maxWidth: "min(840px, 94%)",
    padding: "14px 16px",
    borderRadius: isUser ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
    background: isUser ? "#0f172a" : "#ffffff",
    color: isUser ? "#ffffff" : "#0f172a",
    border: isUser ? "1px solid #0f172a" : "1px solid rgba(148, 163, 184, 0.22)",
    boxShadow: isUser ? "none" : "0 12px 30px rgba(15, 23, 42, 0.08)",
    lineHeight: "1.7",
    display: "grid",
    gap: "12px",
  };
}

function getLoadingMessage(question = "") {
  const normalized = String(question || "").toLowerCase();
  if (normalized.includes("escrow")) return "Reviewing escrow support...";
  if (normalized.includes("link")) return "Checking property linkage...";
  if (normalized.includes("missing") || normalized.includes("complete")) {
    return "Checking mortgage completeness...";
  }
  return "Reading current mortgage evidence...";
}

class MortgageAiChatErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("[VaultedShield] Mortgage AI chat render failure", error);
  }

  render() {
    if (this.state.error) {
      return (
        <SectionCard
          title="Mortgage AI recovery"
          subtitle="The assistant hit a rendering issue, so VaultedShield reduced it to a safe recovery state instead of blanking the mortgage page."
        >
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "12px",
              background: "#fff7ed",
              border: "1px solid #fdba74",
              color: "#9a3412",
              lineHeight: "1.6",
            }}
          >
            {this.state.error?.message || "Mortgage AI chat could not be rendered."}
          </div>
        </SectionCard>
      );
    }

    return this.props.children;
  }
}

export default function MortgageAIChat({
  mortgageLoanId,
  mortgageLoan,
  mortgageAnalytics = {},
  mortgageReview,
  mortgageDocuments = [],
  mortgageSnapshots = [],
  mortgageAnalyticsRows = [],
  propertyLinks = [],
  linkedContext = null,
  sectionLabels = {},
  onJumpToSection,
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Reading current mortgage evidence...");
  const [runtimeError, setRuntimeError] = useState("");
  const scrollRef = useRef(null);

  const starterPrompts = useMemo(() => {
    if ((mortgageDocuments || []).length === 0) {
      return [
        ...BASE_PROMPTS.slice(0, 2),
        "What documents are still missing?",
        ...BASE_PROMPTS.slice(3),
      ];
    }
    if ((propertyLinks || []).length === 0) {
      return [
        ...BASE_PROMPTS.slice(0, 4),
        "Is this linked to the property correctly?",
        "What should I review first?",
      ];
    }
    return BASE_PROMPTS;
  }, [mortgageDocuments, propertyLinks]);

  useEffect(() => {
    setQuestion("");
    setMessages([
      {
        id: "mortgage-ai-welcome",
        role: "assistant",
        response: {
          answer:
            "Ask about payment structure, balance visibility, escrow, property linkage, missing data, or the strongest next review area. VaultedShield will answer from the live mortgage review already loaded on this page.",
          confidence: "medium",
          source: "mortgage_engine",
          supportingData: {
            facts: [],
            uncertainties: [],
            review_focus: [],
          },
        },
      },
    ]);
    setRuntimeError("");
  }, [mortgageLoanId]);

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
            assistantType: "mortgage",
            question: nextQuestion,
            recordContext: mortgageLoan || {},
            analyticsContext: mortgageAnalytics || {},
            precomputed: {
              mortgageReview,
              mortgageDocuments,
              mortgageSnapshots,
              mortgageAnalytics: mortgageAnalyticsRows,
              propertyLinks,
              linkedContext,
            },
          });

          setMessages((current) => [
            ...current,
            {
              id: buildId("assistant"),
              role: "assistant",
              type: response.type || MORTGAGE_QUESTION_TYPES.general,
              response,
            },
          ]);
        } catch (error) {
          console.error("[VaultedShield] Mortgage AI response failure", error);
          setRuntimeError(error?.message || "Mortgage AI response could not be generated.");
        } finally {
          setIsLoading(false);
        }
      }, 160);
    },
    [
      isLoading,
      linkedContext,
      mortgageAnalytics,
      mortgageAnalyticsRows,
      mortgageDocuments,
      mortgageLoan,
      mortgageReview,
      mortgageSnapshots,
      propertyLinks,
    ]
  );

  return (
    <MortgageAiChatErrorBoundary>
      <SectionCard
        title="Ask About This Mortgage"
        subtitle="A deterministic mortgage review layer grounded in the current loan record, linked property context, documents, and mortgage review signals already loaded on this page."
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
            This assistant does not use a raw LLM call. It routes through the structured
            mortgage review engine and answers only from the verified mortgage context visible on
            this page.
          </div>

          {runtimeError ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "#fff7ed",
                border: "1px solid #fdba74",
                color: "#9a3412",
                lineHeight: "1.6",
              }}
            >
              {runtimeError}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => submitQuestion(prompt)}
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
                {prompt}
              </button>
            ))}
          </div>

          <div
            ref={scrollRef}
            style={{
              minHeight: "320px",
              maxHeight: "520px",
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
              placeholder="Ask: Is escrow visible? What is missing? Is this linked correctly?"
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
    </MortgageAiChatErrorBoundary>
  );
}
