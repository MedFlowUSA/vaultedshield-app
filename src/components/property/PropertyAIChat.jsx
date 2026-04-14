import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SectionCard from "../shared/SectionCard";
import StructuredAssistantResponse from "../assistant/StructuredAssistantResponse";
import { PROPERTY_QUESTION_TYPES } from "../../utils/propertyQuestionClassifier.js";
import { routeGlobalAssistantRequest } from "../../utils/globalAssistantRouter.js";

const BASE_PROMPTS = [
  "Is this property stack complete?",
  "What is missing from this property?",
  "Does this property have protection?",
  "Is there a mortgage linked?",
  "How strong is the property record?",
  "What should I review here?",
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
  if (normalized.includes("portal")) return "Reading portal continuity...";
  if (normalized.includes("document")) return "Reviewing property document support...";
  if (normalized.includes("value") || normalized.includes("valuation")) {
    return "Reading current valuation support...";
  }
  return "Reading current property evidence...";
}

class PropertyAiChatErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("[VaultedShield] Property AI chat render failure", error);
  }

  render() {
    if (this.state.error) {
      return (
        <SectionCard
          title="Property AI recovery"
          subtitle="The assistant hit a rendering issue, so VaultedShield reduced it to a safe recovery state instead of blanking the property page."
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
            {this.state.error?.message || "Property AI chat could not be rendered."}
          </div>
        </SectionCard>
      );
    }

    return this.props.children;
  }
}

export default function PropertyAIChat({
  propertyId,
  property,
  propertyAnalyticsContext = {},
  latestPropertyValuation = null,
  valuationChangeSummary = null,
  propertyEquityPosition = null,
  propertyStackAnalytics = null,
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
  propertySignals = null,
  propertyDocuments = [],
  propertySnapshots = [],
  propertyAnalyticsRows = [],
  portalLinks = [],
  sectionLabels = {},
  onJumpToSection,
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Reading current property evidence...");
  const [runtimeError, setRuntimeError] = useState("");
  const scrollRef = useRef(null);

  const starterPrompts = useMemo(() => {
    if ((linkedMortgages || []).length === 0) {
      return [
        BASE_PROMPTS[0],
        BASE_PROMPTS[1],
        BASE_PROMPTS[2],
        "Is there a mortgage linked?",
        "What documents are missing here?",
        BASE_PROMPTS[5],
      ];
    }
    if ((propertyDocuments || []).length === 0) {
      return [
        BASE_PROMPTS[0],
        "What documents are missing here?",
        BASE_PROMPTS[2],
        BASE_PROMPTS[3],
        BASE_PROMPTS[4],
        BASE_PROMPTS[5],
      ];
    }
    return BASE_PROMPTS;
  }, [linkedMortgages, propertyDocuments]);

  useEffect(() => {
    setQuestion("");
    setMessages([
      {
        id: "property-ai-welcome",
        role: "assistant",
        response: {
          answer:
            "Ask about stack completeness, valuation support, linked liabilities, protections, documents, portals, or what deserves review first. VaultedShield will answer from the live property intelligence already visible on this page.",
          confidence: "medium",
          source: "property_engine",
          supportingData: {
            facts: [],
            uncertainties: [],
            review_focus: [],
          },
        },
      },
    ]);
    setRuntimeError("");
  }, [propertyId]);

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
            assistantType: "property",
            question: nextQuestion,
            recordContext: property || {},
            analyticsContext: propertyAnalyticsContext || {},
            precomputed: {
              latestPropertyValuation,
              valuationChangeSummary,
              propertyEquityPosition,
              propertyStackAnalytics,
              linkedMortgages,
              linkedHomeownersPolicies,
              propertySignals,
              propertyDocuments,
              propertySnapshots,
              propertyAnalytics: propertyAnalyticsRows,
              portalLinks,
            },
          });

          setMessages((current) => [
            ...current,
            {
              id: buildId("assistant"),
              role: "assistant",
              type: response.type || PROPERTY_QUESTION_TYPES.general,
              response,
            },
          ]);
        } catch (error) {
          console.error("[VaultedShield] Property AI response failure", error);
          setRuntimeError(error?.message || "Property AI response could not be generated.");
        } finally {
          setIsLoading(false);
        }
      }, 160);
    },
    [
      isLoading,
      latestPropertyValuation,
      linkedHomeownersPolicies,
      linkedMortgages,
      portalLinks,
      property,
      propertyAnalyticsContext,
      propertyAnalyticsRows,
      propertyDocuments,
      propertyEquityPosition,
      propertySignals,
      propertySnapshots,
      propertyStackAnalytics,
      valuationChangeSummary,
    ]
  );

  return (
    <PropertyAiChatErrorBoundary>
      <SectionCard
        title="Ask About This Property"
        subtitle="A deterministic property review layer grounded in the current stack, valuation, linked liabilities, protections, documents, and portal continuity already loaded on this page."
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
            This assistant does not use a raw LLM call. It routes through the structured property
            review engine and answers only from the verified evidence already visible on this page.
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
              placeholder="Ask: Is this stack complete? What is missing? Does it have protection?"
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
    </PropertyAiChatErrorBoundary>
  );
}
