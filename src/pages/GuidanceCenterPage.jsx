import { useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";
import {
  GUIDE_FAQS,
  GUIDE_FEATURES,
  GUIDE_QUICK_STARTS,
  GUIDE_QUESTION_STARTERS,
  answerGuideQuestion,
} from "../lib/guidance/appGuidance";

function buttonStyle(primary = false) {
  return {
    padding: "10px 14px",
    borderRadius: "12px",
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
    width: "100%",
  };
}

export default function GuidanceCenterPage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState([]);
  const latestAnswer = history[0] || null;
  const quickStartColumns = isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))";
  const featureColumns = isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))";

  function handleAskGuide(rawQuestion) {
    const trimmed = String(rawQuestion || "").trim();
    if (!trimmed) return;
    const response = answerGuideQuestion(trimmed);
    setHistory((current) => [
      {
        id: `${Date.now()}-${current.length}`,
        question: trimmed,
        response,
      },
      ...current,
    ].slice(0, 6));
    setQuestion("");
  }

  const summaryItems = useMemo(
    () => [
      { label: "Quick Starts", value: GUIDE_QUICK_STARTS.length, helper: "Practical ways to begin using the app" },
      { label: "Feature Guides", value: GUIDE_FEATURES.length, helper: "Core pages and what they are for" },
      { label: "FAQ Topics", value: GUIDE_FAQS.length, helper: "Common navigation and workflow questions" },
      { label: "Q&A Starters", value: GUIDE_QUESTION_STARTERS.length, helper: "Built-in prompts for new users" },
    ],
    []
  );

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <PageHeader
        eyebrow="Guidance Center"
        title="How To Use VaultedShield"
        description="Use this page to understand where to start, what each major feature is for, and how the app is meant to be used as a household operating system."
        actions={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
            <button type="button" onClick={() => onNavigate?.("/dashboard")} style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}>
              Open Dashboard
            </button>
            <button type="button" onClick={() => onNavigate?.("/upload-center")} style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}>
              Open Upload Center
            </button>
            <button type="button" onClick={() => onNavigate?.("/insurance")} style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }}>
              Open Insurance Intelligence
            </button>
          </div>
        }
      />

      <SummaryPanel items={summaryItems} />

      <SectionCard
        title="Ask VaultedShield Guide"
        subtitle="Ask practical questions about navigation, uploads, workflows, feature purpose, and where specific work should happen."
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", gap: "10px" }}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask how to use a feature or where a workflow belongs"
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                minWidth: 0,
              }}
            />
            <button type="button" onClick={() => handleAskGuide(question)} style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }}>
              Ask Guide
            </button>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {GUIDE_QUESTION_STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => handleAskGuide(starter)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "999px",
                  border: "1px solid #dbeafe",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "12px",
                }}
              >
                {starter}
              </button>
            ))}
          </div>

          {latestAnswer ? (
            <div
              style={{
                padding: isMobile ? "16px" : "18px 20px",
                borderRadius: "16px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Latest Q&A
              </div>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>{latestAnswer.question}</div>
              <div style={{ color: "#475569", lineHeight: "1.75" }}>{latestAnswer.response.answer_text}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => onNavigate?.(latestAnswer.response.route)}
                  style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
                >
                  Open Related Page
                </button>
                {latestAnswer.response.followup_prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleAskGuide(prompt)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "999px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#0f172a",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: "12px",
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Quick Start Workflows"
        subtitle="These are the practical entry points for new households and active review sessions."
      >
        <div style={{ display: "grid", gridTemplateColumns: quickStartColumns, gap: "14px" }}>
          {GUIDE_QUICK_STARTS.map((item) => (
            <div
              key={item.id}
              style={{
                padding: isMobile ? "16px" : "18px",
                borderRadius: "16px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.summary}</div>
              </div>
              <ol style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#334155", lineHeight: "1.65" }}>
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <button type="button" onClick={() => onNavigate?.(item.route)} style={buttonStyle(false)}>
                {item.ctaLabel}
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Feature Explanations"
        subtitle="Use this when you want to know what a page is for before you spend time there."
      >
        <div style={{ display: "grid", gridTemplateColumns: featureColumns, gap: "14px" }}>
          {GUIDE_FEATURES.map((feature) => (
            <button
              key={feature.id}
              type="button"
              onClick={() => onNavigate?.(feature.route)}
              style={{
                padding: "18px",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                textAlign: "left",
                cursor: "pointer",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>{feature.title}</div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{feature.purpose}</div>
              <div style={{ fontSize: "13px", color: "#1d4ed8", fontWeight: 700 }}>Best for: {feature.bestFor}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Frequently Asked Questions"
        subtitle="Straight answers to the most common workflow and navigation questions."
      >
        <div style={{ display: "grid", gap: "12px" }}>
          {GUIDE_FAQS.map((faq) => (
            <details
              key={faq.id}
              style={{
                padding: "14px 16px",
                borderRadius: "14px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 800, color: "#0f172a" }}>{faq.question}</summary>
              <div style={{ marginTop: "10px", color: "#475569", lineHeight: "1.75" }}>{faq.answer}</div>
              <button
                type="button"
                onClick={() => onNavigate?.(faq.route)}
                style={{
                  marginTop: "12px",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Open Related Page
              </button>
            </details>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
