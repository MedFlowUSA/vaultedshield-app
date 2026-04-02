import { useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  buildHouseholdOnboardingChecklist,
  getHouseholdBlankState,
} from "../lib/onboarding/isHouseholdBlank";
import { buildHouseholdOnboardingMission } from "../lib/onboarding/onboardingMission";
import { buildDemoHouseholdPreview } from "../lib/onboarding/demoHouseholdPreview";
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
  const { counts, savedPolicies, intelligenceBundle } = usePlatformShellData();
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState([]);
  const latestAnswer = history[0] || null;
  const quickStartColumns = isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))";
  const featureColumns = isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))";
  const blankState = useMemo(
    () => getHouseholdBlankState(intelligenceBundle || {}, savedPolicies || []),
    [intelligenceBundle, savedPolicies]
  );
  const onboardingChecklist = useMemo(
    () => buildHouseholdOnboardingChecklist(blankState, intelligenceBundle || {}, savedPolicies || []),
    [blankState, intelligenceBundle, savedPolicies]
  );
  const onboardingProgressPercent = onboardingChecklist.length > 0
    ? Math.round((onboardingChecklist.filter((item) => item.complete).length / onboardingChecklist.length) * 100)
    : 0;
  const onboardingMission = useMemo(
    () =>
      buildHouseholdOnboardingMission({
        blankState,
        checklist: onboardingChecklist,
        progressPercent: onboardingProgressPercent,
      }),
    [blankState, onboardingChecklist, onboardingProgressPercent]
  );
  const demoHouseholdPreview = useMemo(() => buildDemoHouseholdPreview(), []);

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
      {
        label: "Current Household Setup",
        value: `${(counts?.assetCount ?? intelligenceBundle?.assets?.length ?? 0) + (savedPolicies?.length || 0)} records`,
        helper: "Live household context currently visible to the guidance layer",
      },
    ],
    [counts?.assetCount, intelligenceBundle?.assets?.length, savedPolicies?.length]
  );
  const headerActions = (
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
  );
  const contextMetricColumns = isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))";

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <PageHeader
        eyebrow="Guidance Center"
        title="How To Use VaultedShield"
        description="Use this page to understand where to start, what each major feature is for, and how the app is meant to be used as a household operating system."
        actions={headerActions}
      />

      <SectionCard
        title="Start Here"
        subtitle="Use one clear first step, then let the rest of the guidance work off what your household already has in motion."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.15fr) minmax(280px, 0.85fr)",
            gap: "14px",
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              padding: "18px 20px",
              borderRadius: "18px",
              background: blankState.isBlank ? "#eff6ff" : "#f8fafc",
              border: `1px solid ${blankState.isBlank ? "#bfdbfe" : "#e2e8f0"}`,
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <div style={{ fontSize: "12px", color: blankState.isBlank ? "#1d4ed8" : "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                {onboardingMission.stageLabel}
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", lineHeight: "1.2" }}>
                {onboardingMission.headline}
              </div>
            </div>
            <div style={{ color: "#475569", lineHeight: "1.75" }}>{onboardingMission.explanation}</div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {onboardingMission.nextStep ? (
                <button
                  type="button"
                  onClick={() => onNavigate?.(onboardingMission.nextStep.route)}
                  style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }}
                >
                  Open {onboardingMission.nextStep.label}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onNavigate?.("/dashboard")}
                style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
              >
                Open Guided Dashboard
              </button>
            </div>
          </div>

          <div
            style={{
              padding: "18px 20px",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Mission Snapshot
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>{onboardingMission.completionSummary}</div>
            </div>
            <div style={{ color: "#475569", lineHeight: "1.75" }}>{onboardingMission.unlockPreview}</div>
            <div style={{ display: "grid", gap: "8px" }}>
              {summaryItems.slice(0, 3).map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#475569", fontWeight: 700 }}>{item.label}</div>
                  <div style={{ fontSize: "14px", color: "#0f172a", fontWeight: 800 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Current Household Context"
        subtitle="Guidance is more useful when it reflects what the current household has already started."
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <SummaryPanel items={summaryItems} />

          <div style={{ display: "grid", gridTemplateColumns: contextMetricColumns, gap: "12px" }}>
          <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Assets</div>
            <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{counts?.assetCount ?? intelligenceBundle?.assets?.length ?? 0}</div>
          </div>
          <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Saved Policies</div>
            <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{savedPolicies?.length || 0}</div>
          </div>
          <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Documents</div>
            <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{intelligenceBundle?.documents?.length ?? 0}</div>
          </div>
          <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Portals</div>
            <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{intelligenceBundle?.portalReadiness?.portalCount ?? 0}</div>
          </div>
        </div>
        </div>
      </SectionCard>

      {blankState.isBlank ? (
        <SectionCard
          title="Sample Household Preview"
          subtitle="This is a safe preview of what VaultedShield starts surfacing once real household records are added."
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 0.82fr) minmax(0, 1.18fr)", gap: "14px" }}>
            <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{demoHouseholdPreview.householdLabel}</div>
                <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>{demoHouseholdPreview.score.overall}</div>
                <div style={{ marginTop: "6px", color: "#1d4ed8", fontWeight: 700 }}>{demoHouseholdPreview.score.status}</div>
              </div>
              {demoHouseholdPreview.score.dimensions.map((item) => (
                <div key={item.label} style={{ display: "grid", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "14px" }}>
                    <span style={{ color: "#0f172a", fontWeight: 700 }}>{item.label}</span>
                    <span style={{ color: "#1d4ed8", fontWeight: 800 }}>{item.value}</span>
                  </div>
                  <div style={{ height: "8px", borderRadius: "999px", background: "#dbeafe", overflow: "hidden" }}>
                    <div style={{ width: `${item.value}%`, height: "100%", borderRadius: "999px", background: "linear-gradient(90deg, #38bdf8 0%, #2563eb 100%)" }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "10px" }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Sample top priorities</div>
                {demoHouseholdPreview.priorities.map((item) => (
                  <div key={item.label} style={{ display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ color: "#0f172a", fontWeight: 700 }}>{item.label}</span>
                      <span style={{ color: "#1d4ed8", fontWeight: 800, fontSize: "12px" }}>{item.impact}</span>
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.nextAction}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Sample module read</div>
                {demoHouseholdPreview.modules.map((item) => (
                  <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", color: "#475569" }}>
                    <span style={{ color: "#0f172a", fontWeight: 700 }}>{item.label}</span>
                    <span style={{ color: "#1d4ed8", fontWeight: 800, fontSize: "12px" }}>{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

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
