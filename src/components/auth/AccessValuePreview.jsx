import { useMemo, useState } from "react";
import SectionCard from "../shared/SectionCard";
import {
  answerDemoHouseholdQuestion,
  buildDemoHouseholdPreview,
} from "../../lib/onboarding/demoHouseholdPreview";

const STARTER_PROMPTS = [
  "What would improve my score fastest?",
  "What should I do first?",
  "Why do documents matter here?",
  "How does emergency access fit in?",
];

function scorePillStyle(value = 0) {
  if (value >= 80) return { background: "#dcfce7", color: "#166534" };
  if (value >= 65) return { background: "#fef3c7", color: "#92400e" };
  return { background: "#fee2e2", color: "#991b1b" };
}

export default function AccessValuePreview({
  title = "What VaultedShield unlocks",
  subtitle = "Preview the operating system before you upload personal data.",
}) {
  const preview = useMemo(() => buildDemoHouseholdPreview(), []);
  const [question, setQuestion] = useState(STARTER_PROMPTS[0]);
  const advisor = useMemo(() => answerDemoHouseholdQuestion(question, preview), [preview, question]);

  return (
    <SectionCard title={title} subtitle={subtitle} accent="#bfdbfe">
      <div style={{ display: "grid", gap: "16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              padding: "16px",
              borderRadius: "16px",
              background: "linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)",
              border: "1px solid #bfdbfe",
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "#1d4ed8", fontWeight: 800 }}>
              Sample household
            </div>
            <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 900, color: "#0f172a" }}>
              {preview.score.overall}
            </div>
            <div style={{ color: "#334155", fontWeight: 700 }}>{preview.score.status}</div>
          </div>
          {preview.score.dimensions.map((dimension) => {
            const tone = scorePillStyle(dimension.value);
            return (
              <div
                key={dimension.label}
                style={{
                  padding: "16px",
                  borderRadius: "16px",
                  background: "#ffffff",
                  border: "1px solid #dbe4f0",
                }}
              >
                <div style={{ color: "#64748b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 700 }}>
                  {dimension.label}
                </div>
                <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: "999px", fontWeight: 800, fontSize: "13px", ...tone }}>
                  {dimension.value}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: "16px",
          }}
        >
          <div
            style={{
              padding: "16px",
              borderRadius: "16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Top priorities</div>
            {preview.priorities.map((item, index) => (
              <div
                key={item.label}
                style={{
                  padding: "12px",
                  borderRadius: "14px",
                  background: "#ffffff",
                  border: "1px solid #dbe4f0",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                  <div style={{ color: "#0f172a", fontWeight: 800, lineHeight: "1.4" }}>
                    {index + 1}. {item.label}
                  </div>
                  <div
                    style={{
                      padding: "4px 8px",
                      borderRadius: "999px",
                      background: item.impact === "Important" ? "#fef3c7" : "#e2e8f0",
                      color: item.impact === "Important" ? "#92400e" : "#475569",
                      fontSize: "12px",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.impact}
                  </div>
                </div>
                <div style={{ color: "#475569", lineHeight: "1.6" }}>{item.reason}</div>
                <div style={{ color: "#1d4ed8", fontWeight: 700 }}>{item.nextAction}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: "16px",
              borderRadius: "16px",
              background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
              border: "1px solid #1e293b",
              color: "#e2e8f0",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 800 }}>Ask VaultedShield</div>
            <div style={{ color: "#cbd5e1", lineHeight: "1.65" }}>
              See how the advisor answers plain-English questions before you connect a real household.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setQuestion(prompt)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "999px",
                    border: prompt === question ? "1px solid #7dd3fc" : "1px solid rgba(148, 163, 184, 0.25)",
                    background: prompt === question ? "rgba(14, 165, 233, 0.18)" : "rgba(15, 23, 42, 0.25)",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask what matters most"
              style={{
                padding: "12px",
                borderRadius: "12px",
                border: "1px solid rgba(125, 211, 252, 0.35)",
                background: "rgba(15, 23, 42, 0.45)",
                color: "#f8fafc",
              }}
            />
            <div
              style={{
                padding: "14px",
                borderRadius: "14px",
                background: "rgba(15, 23, 42, 0.35)",
                border: "1px solid rgba(148, 163, 184, 0.25)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ color: "#f8fafc", fontWeight: 700, lineHeight: "1.7" }}>{advisor.answer_text}</div>
              <div style={{ display: "grid", gap: "6px" }}>
                {advisor.evidence_points.map((point) => (
                  <div key={point} style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: "1.6" }}>
                    {point}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
