import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SectionCard from "../shared/SectionCard";
import StructuredAssistantResponse from "../assistant/StructuredAssistantResponse";
import { useDemoMode } from "../../lib/demo/DemoModeContext";
import { classifyPolicyQuestionType, POLICY_QUESTION_TYPES } from "../../utils/policyQuestionClassifier.js";
import { routeGlobalAssistantRequest } from "../../utils/globalAssistantRouter.js";

const BASE_PROMPTS = [
  "Is this policy performing well?",
  "Why is this rated weak?",
  "Are we ahead of illustration?",
  "How much are charges affecting this?",
  "What should I watch here?",
  "Is there anything missing?",
  "Compare this to another policy",
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

function getStarterPrompts({ missingFields = [], comparisonOptions = [], illustrationVisible = false }) {
  const prompts = [...BASE_PROMPTS];
  if (!illustrationVisible) {
    prompts[2] = "Is illustration support missing?";
  }
  if (missingFields.length >= 4) {
    prompts[5] = "What data is still missing?";
  }
  if (comparisonOptions.length === 0) {
    prompts[6] = "What should I review first?";
  }
  return prompts;
}

function getLoadingMessage(type) {
  if (type === POLICY_QUESTION_TYPES.comparison) return "Comparing current policy evidence...";
  if (type === POLICY_QUESTION_TYPES.illustration_vs_actual) return "Reading illustration support...";
  if (type === POLICY_QUESTION_TYPES.charges) return "Reviewing charge visibility...";
  return "Reading current policy evidence...";
}

class PolicyAiChatErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("[VaultedShield] Policy AI chat render failure", error);
  }

  render() {
    if (this.state.error) {
      return (
        <SectionCard
          title="Policy AI recovery"
          subtitle="The assistant hit a rendering issue, so VaultedShield reduced it to a safe recovery state instead of blanking the policy page."
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
            {this.state.error?.message || "Policy AI chat could not be rendered."}
          </div>
        </SectionCard>
      );
    }

    return this.props.children;
  }
}

export default function PolicyAIChat({
  policyId,
  policy,
  parsedPolicy,
  analytics,
  comparisonRow,
  chargeSummary,
  statementTimeline = [],
  policyInterpretation,
  trendSummary,
  reviewReport,
  policySignals,
  iulV2,
  comparisonOptions = [],
  householdContext = null,
  onLatestEntryChange,
  sectionLabels = {},
  onJumpToSection,
}) {
  const { assistantCue } = useDemoMode();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [selectedComparisonId, setSelectedComparisonId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Reading current policy evidence...");
  const [runtimeError, setRuntimeError] = useState("");
  const scrollRef = useRef(null);
  const lastDemoPromptKeyRef = useRef("");

  const selectedComparison = useMemo(
    () => comparisonOptions.find((option) => option.id === selectedComparisonId) || null,
    [comparisonOptions, selectedComparisonId]
  );

  const starterPrompts = useMemo(
    () =>
      getStarterPrompts({
        missingFields: comparisonRow?.missing_fields || [],
        comparisonOptions,
        illustrationVisible: Boolean(iulV2?.illustrationComparison),
      }),
    [comparisonOptions, comparisonRow?.missing_fields, iulV2?.illustrationComparison]
  );

  useEffect(() => {
    setQuestion("");
    setMessages([
      {
        id: "policy-ai-welcome",
        role: "assistant",
        response: {
          answer:
            "Ask about performance, charges, illustration alignment, missing data, or what deserves review first. VaultedShield will answer from the current policy engine instead of guessing beyond the evidence.",
          confidence: "medium",
          source: "policy_engine",
          supporting_data: {
            why: [
              "This assistant uses the live policy interpretation, continuity score, statement trend, and review report already computed on this page.",
            ],
            facts: [],
            uncertainties: [],
            review_focus: [],
          },
        },
      },
    ]);
    setSelectedComparisonId("");
    setRuntimeError("");
  }, [policyId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    if (assistantCue) return;
    lastDemoPromptKeyRef.current = "";
  }, [assistantCue]);

  const submitQuestion = useCallback(
    (rawQuestion) => {
      const nextQuestion = String(rawQuestion || "").trim();
      if (!nextQuestion || isLoading) return;

      const questionType = classifyPolicyQuestionType(nextQuestion);
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
      setLoadingLabel(getLoadingMessage(questionType));
      setIsLoading(true);

      window.setTimeout(() => {
        try {
          const response = routeGlobalAssistantRequest({
            assistantType: "policy",
            question: nextQuestion,
            recordContext: parsedPolicy || policy || {},
            analyticsContext: analytics || {},
            householdContext,
            comparisonContext: selectedComparison?.bundle || null,
            precomputed: {
              policyRecord: policy || null,
              comparisonRow: comparisonRow || null,
              chargeSummary: chargeSummary || null,
              statementTimeline,
              policyInterpretation,
              trendSummary,
              reviewReport,
              policySignals,
              iulV2,
            },
          });

          const assistantEntry = {
            id: buildId("assistant"),
            role: "assistant",
            type: questionType,
            comparisonPolicyId: selectedComparison?.id || null,
            response,
          };

          setMessages((current) => [...current, assistantEntry]);
          onLatestEntryChange?.({
            policyId,
            question: nextQuestion,
            type: questionType,
            comparisonPolicyId: selectedComparison?.id || null,
            response,
          });
        } catch (error) {
          console.error("[VaultedShield] Policy AI response failure", error);
          setRuntimeError(error?.message || "Policy AI response could not be generated.");
        } finally {
          setIsLoading(false);
        }
      }, 160);
    },
    [
      analytics,
      chargeSummary,
      comparisonRow,
      householdContext,
      iulV2,
      isLoading,
      onLatestEntryChange,
      parsedPolicy,
      policy,
      policyId,
      policyInterpretation,
      policySignals,
      reviewReport,
      selectedComparison,
      statementTimeline,
      trendSummary,
    ]
  );

  useEffect(() => {
    if (!assistantCue?.prompt || !assistantCue?.key) return;
    if (lastDemoPromptKeyRef.current === assistantCue.key) return;
    if (isLoading) return;
    lastDemoPromptKeyRef.current = assistantCue.key;
    const timer = window.setTimeout(() => submitQuestion(assistantCue.prompt), 240);
    return () => window.clearTimeout(timer);
  }, [assistantCue, isLoading, submitQuestion]);

  return (
    <PolicyAiChatErrorBoundary>
      <div data-demo-id="policy-ai-assistant">
        <SectionCard
          title="Ask About This Policy"
          subtitle="A deterministic policy chat layer grounded in the current policy interpretation, continuity, statement trend, and review report."
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
              This assistant does not use a raw LLM call. It classifies the question, reads the current policy engine outputs, and returns a plain-English explanation without making unsupported recommendations.
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
                  <option value="">Select another saved policy for comparison questions</option>
                  {comparisonOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
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
                        comparisonActive={Boolean(message.comparisonPolicyId)}
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
                placeholder="Ask: Is this policy performing well? What should I watch here? Is anything missing?"
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
    </PolicyAiChatErrorBoundary>
  );
}
