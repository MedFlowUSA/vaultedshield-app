import { useEffect, useMemo, useState } from "react";
import SectionCard from "../shared/SectionCard";
import StatusBadge from "../shared/StatusBadge";
import { classifyPolicyQuestion } from "../../lib/policyAi/classifyPolicyQuestion";
import { buildPolicyAiResponse } from "../../lib/policyAi/buildPolicyAiResponse";

const STARTER_PROMPTS = [
  "Is this policy performing well?",
  "Why is this policy rated the way it is?",
  "Are we ahead or behind illustration?",
  "How much are charges hurting this policy?",
  "What should I review first?",
  "What data is missing?",
  "Compare this policy to another one",
];

function getDisclaimerTone(hasMissingData = false) {
  return hasMissingData ? "warning" : "info";
}

function sourcePillStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: "999px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1d4ed8",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.01em",
  };
}

export default function PolicyAiAssistantCard({
  policyBundle,
  comparisonOptions = [],
  onLatestEntryChange,
}) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState([]);
  const [selectedComparisonId, setSelectedComparisonId] = useState("");

  const latestEntry = history[0] || null;
  const selectedComparison = useMemo(
    () => comparisonOptions.find((item) => item.id === selectedComparisonId) || null,
    [comparisonOptions, selectedComparisonId]
  );
  const lowDataMissingCount = (policyBundle?.missingFields || []).length;
  const hasLowDataState =
    !policyBundle?.comparisonRow?.latest_statement_date &&
    (policyBundle?.lifePolicy?.meta?.statementCount || 0) === 0 &&
    lowDataMissingCount >= 3;

  useEffect(() => {
    setQuestion("");
    setHistory([]);
    setSelectedComparisonId("");
  }, [policyBundle?.comparisonRow?.policy_id]);

  useEffect(() => {
    onLatestEntryChange?.(latestEntry);
  }, [latestEntry, onLatestEntryChange]);

  function handleAsk(rawQuestion) {
    const nextQuestion = String(rawQuestion || "").trim();
    if (!nextQuestion) return;

    const intent = classifyPolicyQuestion(nextQuestion);
    const response = buildPolicyAiResponse({
      currentPolicyBundle: policyBundle,
      comparisonPolicyBundle: selectedComparison?.bundle || null,
      userQuestion: nextQuestion,
      intent,
    });

    setHistory((current) => [
      {
        id: `${Date.now()}-${current.length}`,
        question: nextQuestion,
        intent,
        comparisonPolicyId: selectedComparison?.id || null,
        response,
      },
      ...current,
    ].slice(0, 5));
    setQuestion("");
  }

  return (
    <SectionCard
      title="Policy AI Assistant"
      subtitle="Ask questions about this policy in plain English."
    >
      <div style={{ display: "grid", gap: "18px" }}>
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "18px",
            background: "#f8fafc",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            display: "grid",
            gap: "8px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Structured Assistant
          </div>
          <div style={{ color: "#475569", lineHeight: "1.75" }}>
            This assistant uses the current policy analytics, statement history, charge visibility, and comparison logic already on this page. It does not guess beyond the available evidence.
          </div>
        </div>

        {hasLowDataState ? (
          <div
            style={{
              padding: "16px 18px",
              borderRadius: "18px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              display: "grid",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#9a3412", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
              Limited Policy Data
            </div>
            <div style={{ color: "#7c2d12", lineHeight: "1.75" }}>
              This policy does not yet have enough structured data for the strongest AI explanations. Upload the baseline illustration and at least one in-force statement to unlock deeper performance, charge, and illustration reads.
            </div>
          </div>
        ) : null}

        {comparisonOptions.length > 0 ? (
          <label style={{ display: "grid", gap: "6px", color: "#475569", fontSize: "14px" }}>
            <span>Optional comparison policy</span>
            <select
              value={selectedComparisonId}
              onChange={(event) => setSelectedComparisonId(event.target.value)}
              style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              <option value="">Select a second policy for comparison</option>
              {comparisonOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAsk(question);
              }
            }}
            placeholder="Ask about performance, charges, illustration alignment, missing data, or what to review first"
            style={{
              width: "100%",
              minWidth: 0,
              padding: "12px 14px",
              borderRadius: "12px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
            }}
          />
          <button
            type="button"
            onClick={() => handleAsk(question)}
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              border: "none",
              background: "#0f172a",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Ask Assistant
          </button>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleAsk(prompt)}
              style={{
                padding: "10px 12px",
                borderRadius: "999px",
                border: "1px solid #dbeafe",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        {latestEntry ? (
          <div
            style={{
              display: "grid",
              gap: "16px",
              padding: "20px 22px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
              border: "1px solid rgba(147, 197, 253, 0.28)",
            }}
          >
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Latest Answer
              </div>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>{latestEntry.question}</div>
              <div style={{ color: "#0f172a", lineHeight: "1.8", fontSize: "16px", fontWeight: 600 }}>
                {latestEntry.response.answer}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <StatusBadge label={`Intent: ${latestEntry.intent.replace(/_/g, " ")}`} tone="info" />
              {selectedComparison ? <StatusBadge label={`Compare: ${selectedComparison.label}`} tone="warning" /> : null}
            </div>

            {latestEntry.response.evidence?.length > 0 ? (
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Evidence Used</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                  {latestEntry.response.evidence.map((point) => (
                    <div
                      key={`${point.label}-${point.value}`}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "14px",
                        background: "#ffffff",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        display: "grid",
                        gap: "6px",
                      }}
                    >
                      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{point.label}</div>
                      <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{point.value}</div>
                      {point.source ? <div style={sourcePillStyle()}>{point.source}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {latestEntry.response.missingData?.length > 0 ? (
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Missing Data</div>
                <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                  {latestEntry.response.missingData.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {latestEntry.response.disclaimers?.length > 0 ? (
              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>Review Notes</div>
                <div style={{ display: "grid", gap: "8px" }}>
                  {latestEntry.response.disclaimers.map((item) => (
                    <div
                      key={item}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "12px",
                        background: getDisclaimerTone((latestEntry.response.missingData || []).length > 0) === "warning" ? "#fffbeb" : "#f8fafc",
                        border: getDisclaimerTone((latestEntry.response.missingData || []).length > 0) === "warning" ? "1px solid #fde68a" : "1px solid #e2e8f0",
                        color: "#475569",
                        lineHeight: "1.7",
                        fontSize: "14px",
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              padding: "18px 20px",
              borderRadius: "18px",
              background: "#f8fafc",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              color: "#475569",
              lineHeight: "1.8",
            }}
          >
            Ask about performance, policy health, charges, missing data, or illustration alignment to get a grounded explanation based on the current policy evidence.
          </div>
        )}

        {history.length > 1 ? (
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>Session History</div>
            <div style={{ display: "grid", gap: "10px" }}>
              {history.slice(1, 4).map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleAsk(entry.question)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "14px",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    background: "#ffffff",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{entry.question}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{entry.response.answer}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
