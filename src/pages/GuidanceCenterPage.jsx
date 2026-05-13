import { useMemo, useState } from "react";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  buildHouseholdOnboardingChecklist,
  getHouseholdBlankState,
} from "../lib/onboarding/isHouseholdBlank";
import { buildHouseholdOnboardingMission } from "../lib/onboarding/onboardingMission";
import { buildDemoHouseholdPreview } from "../lib/onboarding/demoHouseholdPreview";
import {
  GUIDE_FAQS,
  GUIDE_FEATURES,
  GUIDE_QUICK_STARTS,
  GUIDE_QUESTION_STARTERS,
  answerGuideQuestion,
} from "../lib/guidance/appGuidance";

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "alert") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  if (tone === "info") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

function surfaceCard(extra = {}) {
  return {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid rgba(226,232,240,0.92)",
    boxShadow: "0 4px 16px rgba(15,23,42,0.05)",
    ...extra,
  };
}

function SectionTitle({ eyebrow, title, subtitle, eyebrowColor = "#0369a1" }) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      {eyebrow ? <div style={{ fontSize: "12px", fontWeight: 800, color: eyebrowColor, textTransform: "uppercase", letterSpacing: "0.1em" }}>{eyebrow}</div> : null}
      <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{title}</div>
      {subtitle ? <div style={{ color: "#64748b", lineHeight: "1.6" }}>{subtitle}</div> : null}
    </div>
  );
}

export default function GuidanceCenterPage({ onNavigate }) {
  const { counts, savedPolicies, intelligenceBundle } = usePlatformShellData();
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState([]);
  const latestAnswer = history[0] || null;

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
    () => buildHouseholdOnboardingMission({ blankState, checklist: onboardingChecklist, progressPercent: onboardingProgressPercent }),
    [blankState, onboardingChecklist, onboardingProgressPercent]
  );
  const demoHouseholdPreview = useMemo(() => buildDemoHouseholdPreview(), []);

  function handleAskGuide(rawQuestion) {
    const trimmed = String(rawQuestion || "").trim();
    if (!trimmed) return;
    const response = answerGuideQuestion(trimmed);
    setHistory((current) => [{ id: `${Date.now()}-${current.length}`, question: trimmed, response }, ...current].slice(0, 6));
    setQuestion("");
  }

  const summaryItems = useMemo(() => [
    { label: "Quick Starts", value: GUIDE_QUICK_STARTS.length, helper: "Practical ways to begin using the app" },
    { label: "Feature Guides", value: GUIDE_FEATURES.length, helper: "Core pages and what they are for" },
    { label: "FAQ Topics", value: GUIDE_FAQS.length, helper: "Common navigation and workflow questions" },
    { label: "Q&A Starters", value: GUIDE_QUESTION_STARTERS.length, helper: "Built-in prompts for new users" },
    {
      label: "Current Household Setup",
      value: `${(counts?.assetCount ?? intelligenceBundle?.assets?.length ?? 0) + (savedPolicies?.length || 0)} records`,
      helper: "Live household context currently visible to the guidance layer",
    },
  ], [counts?.assetCount, intelligenceBundle?.assets?.length, savedPolicies?.length]);

  const heroScore = Math.round(
    Math.max(
      28,
      Math.min(
        92,
        onboardingProgressPercent > 0
          ? onboardingProgressPercent
          : 24 +
            (counts?.assetCount ?? intelligenceBundle?.assets?.length ?? 0) * 4 +
            (savedPolicies?.length || 0) * 6 +
            (intelligenceBundle?.documents?.length ?? 0)
      )
    )
  );
  const scoreTone = heroScore >= 80 ? "good" : heroScore >= 60 ? "info" : heroScore >= 44 ? "warning" : "alert";
  const householdRecordCount = (counts?.assetCount ?? intelligenceBundle?.assets?.length ?? 0) + (savedPolicies?.length || 0);

  return (
    <div style={{ display: "grid", gap: "28px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #0369a1 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              Guidance Center
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              {onboardingMission.headline}
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "560px" }}>
              {onboardingMission.explanation}
            </div>
          </div>
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "18px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              display: "grid",
              gap: "4px",
              textAlign: "center",
              minWidth: "100px",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#7dd3fc" }}>{heroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>guided score</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {summaryItems.slice(0, 4).map((stat) => (
            <div key={stat.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#bae6fd" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onNavigate?.(onboardingMission.nextStep?.route || "/dashboard")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#ffffff", color: "#0f172a", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            {onboardingMission.nextStep ? `Open ${onboardingMission.nextStep.label}` : "Open Dashboard"}
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/upload-center")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Upload Center
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/insurance")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Insurance Hub
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Status Read",
            title: blankState.isBlank ? "Guidance ready for new household" : "Guidance reflects current household state",
            detail: onboardingMission.completionSummary,
            metric: `${onboardingProgressPercent}% mapped`,
            tone: scoreTone,
            statusLabel: onboardingMission.stageLabel,
            actionLabel: "Open Dashboard",
            onAction: () => onNavigate?.("/dashboard"),
          },
          {
            kicker: "Best First Step",
            title: onboardingMission.nextStep ? `Open ${onboardingMission.nextStep.label}` : "Start with the guided dashboard",
            detail: onboardingMission.nextStep?.whyItMatters || "One clear next step first. The rest of the guidance becomes obvious once a real workflow is in motion.",
            metric: `${householdRecordCount} live record${householdRecordCount === 1 ? "" : "s"}`,
            tone: "warning",
            statusLabel: "Guided Focus",
            actionLabel: onboardingMission.nextStep ? `Open ${onboardingMission.nextStep.label}` : "Open Dashboard",
            onAction: () => onNavigate?.(onboardingMission.nextStep?.route || "/dashboard"),
          },
          {
            kicker: "What Can Wait",
            title: "You do not need every module on day one",
            detail: "The app deepens with the household. Start with one lane, then let the rest of the product unfold behind it.",
            metric: `${GUIDE_FEATURES.length} feature guides`,
            tone: "info",
            statusLabel: "Building",
            actionLabel: "Ask Guide",
            onAction: () => document.querySelector("[data-guidance-qa]")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
        ].map((tile) => (
          <div
            key={tile.kicker}
            style={{
              padding: "20px",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              display: "grid",
              gap: "12px",
              alignContent: "start",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{tile.kicker}</div>
              <div style={{ ...pillStyle(tile.tone), padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>{tile.statusLabel}</div>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{tile.title}</div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{tile.detail}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>{tile.metric}</div>
            <button type="button" onClick={tile.onAction} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer", textAlign: "left" }}>
              {tile.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {/* Start Here */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <SectionTitle
          eyebrow="Start Here"
          title="Where to focus first"
          subtitle="Use one clear next step, then let the rest of the guidance follow the records your household already has in motion."
          eyebrowColor="#0369a1"
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
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
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", lineHeight: "1.2" }}>
                {onboardingMission.headline}
              </div>
            </div>
            <div style={{ color: "#475569", lineHeight: "1.75" }}>{onboardingMission.explanation}</div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {onboardingMission.nextStep ? (
                <button type="button" onClick={() => onNavigate?.(onboardingMission.nextStep.route)} style={{ padding: "10px 14px", borderRadius: "12px", border: "none", background: "#0f172a", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                  Open {onboardingMission.nextStep.label}
                </button>
              ) : null}
              <button type="button" onClick={() => onNavigate?.("/dashboard")} style={{ padding: "10px 14px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#ffffff", color: "#0f172a", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                Open Guided Dashboard
              </button>
            </div>
          </div>

          <div style={{ padding: "18px 20px", borderRadius: "18px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Mission Snapshot</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{onboardingMission.completionSummary}</div>
            </div>
            <div style={{ color: "#475569", lineHeight: "1.75" }}>{onboardingMission.unlockPreview}</div>
            <div style={{ display: "grid", gap: "8px" }}>
              {summaryItems.slice(0, 3).map((item) => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", padding: "10px 12px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "13px", color: "#475569", fontWeight: 700 }}>{item.label}</div>
                  <div style={{ fontSize: "14px", color: "#0f172a", fontWeight: 800 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Current Household Context */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <SectionTitle
          eyebrow="Household Context"
          title="Current household setup"
          subtitle="Guidance is more useful when it reflects what the current household has already started."
          eyebrowColor="#0369a1"
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          {summaryItems.map((item) => (
            <div key={item.label} style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>{item.label}</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{item.value}</div>
              {item.helper ? <div style={{ color: "#475569", fontSize: "13px", lineHeight: "1.6" }}>{item.helper}</div> : null}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
          {[
            { label: "Assets", value: counts?.assetCount ?? intelligenceBundle?.assets?.length ?? 0 },
            { label: "Saved Policies", value: savedPolicies?.length || 0 },
            { label: "Documents", value: intelligenceBundle?.documents?.length ?? 0 },
            { label: "Portals", value: intelligenceBundle?.portalReadiness?.portalCount ?? 0 },
          ].map((m) => (
            <div key={m.label} style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{m.label}</div>
              <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sample Household Preview (blank state only) */}
      {blankState.isBlank ? (
        <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
          <SectionTitle
            eyebrow="Sample Preview"
            title="What VaultedShield surfaces once records are added"
            subtitle="A safe preview showing what the platform starts delivering once real household records are in place."
            eyebrowColor="#0369a1"
          />
          <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "grid", gap: "10px" }}>
            <div style={{ fontSize: "12px", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Best First Records</div>
            <div style={{ color: "#0f172a", fontWeight: 800, fontSize: "18px" }}>One member, one policy, one supporting document, one core asset</div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>That combination is usually enough to make the dashboard, insurance, vault, and reports screens feel meaningfully alive without overloading the first walkthrough.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
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
        </div>
      ) : null}

      {/* Ask VaultedShield Guide */}
      <div data-guidance-qa style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <SectionTitle
          eyebrow="Q&A Guide"
          title="Ask VaultedShield Guide"
          subtitle="Ask practical questions about navigation, uploads, workflows, feature purpose, and where specific work should happen."
          eyebrowColor="#0369a1"
        />
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAskGuide(question); }}
              placeholder="Ask how to use a feature or where a workflow belongs"
              style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid #cbd5e1", minWidth: 0, fontSize: "14px" }}
            />
            <button type="button" onClick={() => handleAskGuide(question)} style={{ padding: "12px 16px", borderRadius: "12px", border: "none", background: "#0f172a", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
              Ask Guide
            </button>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {GUIDE_QUESTION_STARTERS.map((starter) => (
              <button key={starter} type="button" onClick={() => handleAskGuide(starter)} style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>
                {starter}
              </button>
            ))}
          </div>
          {latestAnswer ? (
            <div style={{ padding: "18px 20px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "10px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Latest Q&A</div>
              <div style={{ fontWeight: 800, color: "#0f172a" }}>{latestAnswer.question}</div>
              <div style={{ color: "#475569", lineHeight: "1.75" }}>{latestAnswer.response.answer_text}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => onNavigate?.(latestAnswer.response.route)} style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#ffffff", color: "#0f172a", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                  Open Related Page
                </button>
                {latestAnswer.response.followup_prompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => handleAskGuide(prompt)} style={{ padding: "8px 12px", borderRadius: "999px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Quick Start Workflows */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <SectionTitle
          eyebrow="Quick Starts"
          title="Practical workflows to begin"
          subtitle="These are the practical entry points for new households and active review sessions."
          eyebrowColor="#0369a1"
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
          {GUIDE_QUICK_STARTS.map((item) => (
            <div key={item.id} style={{ padding: "18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "12px" }}>
              <div style={{ display: "grid", gap: "6px" }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                <div style={{ color: "#475569", lineHeight: "1.7", fontSize: "14px" }}>{item.summary}</div>
              </div>
              <ol style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#334155", lineHeight: "1.65", fontSize: "14px" }}>
                {item.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <button type="button" onClick={() => onNavigate?.(item.route)} style={{ padding: "10px 14px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#ffffff", color: "#0f172a", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                {item.ctaLabel}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Explanations */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <SectionTitle
          eyebrow="Feature Guides"
          title="What each page is for"
          subtitle="Use this when you want to know what a page is for before you spend time there."
          eyebrowColor="#0369a1"
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
          {GUIDE_FEATURES.map((feature) => (
            <button
              key={feature.id}
              type="button"
              onClick={() => onNavigate?.(feature.route)}
              style={{ padding: "18px", borderRadius: "16px", border: "1px solid #e2e8f0", background: "#ffffff", textAlign: "left", cursor: "pointer", display: "grid", gap: "8px" }}
            >
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{feature.title}</div>
              <div style={{ color: "#475569", lineHeight: "1.7", fontSize: "13px" }}>{feature.purpose}</div>
              <div style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: 700 }}>Best for: {feature.bestFor}</div>
            </button>
          ))}
        </div>
      </div>

      {/* FAQs */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <SectionTitle
          eyebrow="FAQ"
          title="Frequently Asked Questions"
          subtitle="Straight answers to the most common workflow and navigation questions."
          eyebrowColor="#0369a1"
        />
        <div style={{ display: "grid", gap: "10px" }}>
          {GUIDE_FAQS.map((faq) => (
            <details key={faq.id} style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <summary style={{ cursor: "pointer", fontWeight: 800, color: "#0f172a", fontSize: "15px" }}>{faq.question}</summary>
              <div style={{ marginTop: "10px", color: "#475569", lineHeight: "1.75", fontSize: "14px" }}>{faq.answer}</div>
              <button type="button" onClick={() => onNavigate?.(faq.route)} style={{ marginTop: "12px", padding: "8px 12px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>
                Open Related Page
              </button>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
