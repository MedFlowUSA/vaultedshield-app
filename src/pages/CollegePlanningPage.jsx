import { useEffect, useMemo, useState } from "react";
import { analyzeCollegePlanReadiness, summarizeCollegeHousehold } from "../lib/domain/college/collegeIntelligence";
import { scoreCollegeGoal } from "../lib/domain/college/collegeGoalScore";
import { loadCollegeGoalState, saveCollegeGoalState } from "../lib/domain/college/collegeGoalStorage";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";

const DEFAULT_PLAN = {
  childLabel: "Child Plan",
  currentAge: "8",
  collegeStartAge: "18",
  targetSavings: "120000",
  currentSavings: "",
  monthlyContribution: "400",
  annualGrowthRate: "5",
};

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not recorded";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

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

function inputStyle() {
  return {
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    boxSizing: "border-box",
    fontSize: "14px",
  };
}

function getScoreTone(score) {
  if (score >= 80) return "good";
  if (score >= 60) return "info";
  if (score >= 45) return "warning";
  return "alert";
}

export default function CollegePlanningPage({ onNavigate }) {
  const { debug } = usePlatformShellData();
  const storageScope = useMemo(
    () => ({
      userId: debug.authUserId || null,
      householdId: debug.householdId || null,
    }),
    [debug.authUserId, debug.householdId]
  );

  const [plans, setPlans] = useState({});
  const [activePlanKey, setActivePlanKey] = useState(DEFAULT_PLAN.childLabel);
  const [form, setForm] = useState(DEFAULT_PLAN);
  const [hydrated, setHydrated] = useState(false);

  const planKeys = useMemo(() => Object.keys(plans), [plans]);

  useEffect(() => {
    const stored = loadCollegeGoalState(storageScope);
    if (stored?.plans && typeof stored.plans === "object" && Object.keys(stored.plans).length > 0) {
      setPlans(stored.plans);
      const nextActiveKey = stored.activePlanKey && stored.plans[stored.activePlanKey]
        ? stored.activePlanKey
        : Object.keys(stored.plans)[0];
      setActivePlanKey(nextActiveKey);
      setForm(stored.plans[nextActiveKey]);
    } else {
      setPlans({ [DEFAULT_PLAN.childLabel]: DEFAULT_PLAN });
      setActivePlanKey(DEFAULT_PLAN.childLabel);
      setForm(DEFAULT_PLAN);
    }
    setHydrated(true);
  }, [storageScope]);

  const plannerInputs = useMemo(
    () => ({
      childLabel: form.childLabel,
      currentAge: Number(form.currentAge),
      collegeStartAge: Number(form.collegeStartAge),
      targetSavings: Number(form.targetSavings),
      currentSavings: Number(form.currentSavings || 0),
      monthlyContribution: Number(form.monthlyContribution || 0),
      annualGrowthRate: Number(form.annualGrowthRate || 5),
    }),
    [form]
  );

  const score = useMemo(() => scoreCollegeGoal(plannerInputs), [plannerInputs]);
  const collegeRead = useMemo(() => analyzeCollegePlanReadiness(score), [score]);
  const householdCollegeRead = useMemo(
    () =>
      summarizeCollegeHousehold(
        Object.values(plans).map((plan) =>
          scoreCollegeGoal({
            childLabel: plan.childLabel,
            currentAge: Number(plan.currentAge),
            collegeStartAge: Number(plan.collegeStartAge),
            targetSavings: Number(plan.targetSavings),
            currentSavings: Number(plan.currentSavings || 0),
            monthlyContribution: Number(plan.monthlyContribution || 0),
            annualGrowthRate: Number(plan.annualGrowthRate || 5),
          })
        )
      ),
    [plans]
  );

  useEffect(() => {
    if (!hydrated) return;
    const safeKey = String(form.childLabel || activePlanKey || "Child Plan").trim() || "Child Plan";
    const nextPlan = { ...form, childLabel: safeKey };
    const nextPlans = { ...plans, [safeKey]: nextPlan };
    if (activePlanKey && activePlanKey !== safeKey && nextPlans[activePlanKey]) {
      delete nextPlans[activePlanKey];
    }
    setPlans(nextPlans);
    if (activePlanKey !== safeKey) setActivePlanKey(safeKey);
    saveCollegeGoalState(storageScope, {
      plans: nextPlans,
      activePlanKey: safeKey,
      updatedAt: new Date().toISOString(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, hydrated, storageScope]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handlePlanSelection(event) {
    const nextKey = event.target.value;
    if (!plans[nextKey]) return;
    setActivePlanKey(nextKey);
    setForm(plans[nextKey]);
  }

  function handleCreateNewPlan() {
    let counter = 2;
    let nextLabel = "Child Plan 2";
    while (plans[nextLabel]) {
      counter += 1;
      nextLabel = `Child Plan ${counter}`;
    }
    const nextPlan = { ...DEFAULT_PLAN, childLabel: nextLabel };
    setPlans((current) => ({ ...current, [nextLabel]: nextPlan }));
    setActivePlanKey(nextLabel);
    setForm(nextPlan);
  }

  const whatChangesThis = useMemo(() => {
    const items = [];
    if (score.inputs.monthlyContribution < 500) items.push("Increasing monthly contributions improves projected savings the fastest.");
    if (score.inputs.collegeStartAge <= score.inputs.currentAge + 8) items.push("A later college start age gives savings more time to compound.");
    if (score.inputs.targetSavings > 150000) items.push("A lower target savings goal reduces the amount the plan needs to fully fund.");
    if (score.inputs.currentSavings < score.inputs.targetSavings * 0.25) items.push("Adding to current savings now can meaningfully improve the plan's starting position.");
    return items.slice(0, 4);
  }, [score]);

  const scoreTone = getScoreTone(score.readinessScore);

  return (
    <div style={{ display: "grid", gap: "28px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #78350f 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              College Planning
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              {score.readinessStatus === "On Track" ? "College plan looks on track for the target" : "College plan needs a closer look"}
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "560px" }}>
              {collegeRead.headline}
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
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#fcd34d" }}>{score.readinessScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>readiness</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[
            { label: "Active Plan", value: score.childLabel },
            { label: "Current Savings", value: formatCurrency(score.inputs.currentSavings) },
            { label: "Projected Savings", value: formatCurrency(score.projectedSavings) },
            { label: "Plans Saved", value: planKeys.length },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#fde68a", lineHeight: "1.2", wordBreak: "break-word" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => document.querySelector("[data-college-goal]")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#ffffff", color: "#0f172a", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Edit College Goal
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/guidance")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Back to Guidance
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Plan Status",
            title: score.readinessStatus === "On Track" ? "College plan looks on track" : "College plan needs review",
            detail: collegeRead.headline,
            metric: `${score.readinessScore}/100`,
            tone: scoreTone,
            statusLabel: score.readinessStatus,
            actionLabel: "See Summary",
            onAction: () => document.querySelector("[data-college-summary]")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "Biggest Lever",
            title: "Adjust the most important savings driver",
            detail: whatChangesThis[0] || "A small change in contribution pace or time horizon can shift the college picture quickly.",
            metric: `${formatCurrency(score.inputs.monthlyContribution)}/month`,
            tone: "warning",
            statusLabel: "Review",
            actionLabel: "Edit Goal",
            onAction: () => document.querySelector("[data-college-goal]")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "Household View",
            title: `${planKeys.length} child plan${planKeys.length === 1 ? "" : "s"} saved`,
            detail: householdCollegeRead.headline || "Start with a realistic target. Optimization can follow once the basic plan is visible.",
            metric: `${planKeys.length} saved`,
            tone: "info",
            statusLabel: "Building",
            actionLabel: "Add Child Plan",
            onAction: handleCreateNewPlan,
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

      {/* College Goal Form */}
      <div data-college-goal style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#78350f", textTransform: "uppercase", letterSpacing: "0.1em" }}>College Goal</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Plan assumptions for {score.childLabel}</div>
          <div style={{ color: "#64748b", lineHeight: "1.6" }}>Enter a practical savings target for one child at a time. This estimate is designed for planning clarity, not certainty.</div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {planKeys.length > 0 ? (
            <select
              value={activePlanKey}
              onChange={handlePlanSelection}
              style={{ ...inputStyle(), width: "auto", minWidth: "200px", flex: "1 1 200px", maxWidth: "320px" }}
            >
              {planKeys.map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={handleCreateNewPlan}
            style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Add Child Plan
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px 16px" }}>
          {[
            { field: "childLabel", label: "Child name or label", type: "text", placeholder: "" },
            { field: "currentAge", label: "Child current age", type: "text", inputMode: "numeric" },
            { field: "collegeStartAge", label: "College start age", type: "text", inputMode: "numeric" },
            { field: "targetSavings", label: "Target college savings amount", type: "text", inputMode: "decimal" },
            { field: "currentSavings", label: "Current college savings", type: "text", inputMode: "decimal", placeholder: "Optional if starting from zero" },
            { field: "monthlyContribution", label: "Monthly contribution", type: "text", inputMode: "decimal" },
          ].map(({ field, label, type, inputMode, placeholder }) => (
            <label key={field} style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>{label}</span>
              <input
                value={form[field]}
                onChange={(event) => updateField(field, event.target.value)}
                type={type}
                inputMode={inputMode}
                placeholder={placeholder || ""}
                style={inputStyle()}
              />
            </label>
          ))}
          <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
            <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Expected annual growth rate (%)</span>
            <input
              value={form.annualGrowthRate}
              onChange={(event) => updateField("annualGrowthRate", event.target.value)}
              inputMode="decimal"
              style={{ ...inputStyle(), maxWidth: "240px" }}
            />
          </label>
        </div>
      </div>

      {/* College Readiness Summary */}
      <div data-college-summary style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#78350f", textTransform: "uppercase", letterSpacing: "0.1em" }}>College Readiness Summary</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>How does the current plan compare to the target?</div>
        </div>

        <div style={{ padding: "16px 18px", borderRadius: "16px", background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)", border: "1px solid #fde68a", color: "#0f172a", lineHeight: "1.8", fontWeight: 600 }}>
          {collegeRead.headline}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
          {[
            { label: "Current Savings", value: formatCurrency(score.inputs.currentSavings) },
            { label: "Monthly Contribution", value: formatCurrency(score.inputs.monthlyContribution) },
            { label: "Target Goal", value: formatCurrency(score.inputs.targetSavings) },
            { label: "Projected Savings", value: formatCurrency(score.projectedSavings) },
            {
              label: score.fundingDifference >= 0 ? "Projected Surplus" : "Funding Gap",
              value: formatCurrency(Math.abs(score.fundingDifference)),
            },
          ].map((item) => (
            <div key={item.label} style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "6px" }}>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.label}</div>
              <div style={{ fontWeight: 800, fontSize: "20px", color: "#0f172a" }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ ...pillStyle(scoreTone), padding: "6px 12px", borderRadius: "999px", fontWeight: 800, fontSize: "13px" }}>
            {score.readinessStatus}
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>{score.readinessScore}/100</div>
          <div style={{ color: "#64748b" }}>Projected by age {score.inputs.collegeStartAge}</div>
        </div>

        {score.validationMessages.length > 0 ? (
          <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fde68a", color: "#92400e", display: "grid", gap: "8px" }}>
            <div style={{ fontWeight: 700 }}>Planning guardrails</div>
            <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "6px" }}>
              {score.validationMessages.map((item) => (
                <li key={item} style={{ lineHeight: "1.6", fontSize: "14px" }}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", lineHeight: "1.8", fontSize: "14px" }}>
          {score.explanation}
        </div>

        <div data-college-assumptions style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Assumptions Used</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {score.assumptionLines.map((item) => (
              <div key={item} style={{ padding: "5px 10px", borderRadius: "999px", background: "#ffffff", border: "1px solid #e2e8f0", color: "#475569", fontSize: "12px" }}>
                {item}
              </div>
            ))}
          </div>
        </div>

        {collegeRead.notes.length > 0 ? (
          <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "10px" }}>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Plan Read Notes</div>
            <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#475569", fontSize: "14px" }}>
              {collegeRead.notes.map((item) => <li key={item} style={{ lineHeight: "1.7" }}>{item}</li>)}
            </ul>
          </div>
        ) : null}

        {whatChangesThis.length > 0 ? (
          <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "10px" }}>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>What Changes This Result?</div>
            <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#475569", fontSize: "14px" }}>
              {whatChangesThis.map((item) => <li key={item} style={{ lineHeight: "1.7" }}>{item}</li>)}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Household Notes */}
      {householdCollegeRead.headline || householdCollegeRead.notes?.length > 0 ? (
        <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "16px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Household College Picture</div>
          <div style={{ color: "#475569", lineHeight: "1.7" }}>{householdCollegeRead.headline}</div>
          {householdCollegeRead.notes?.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#64748b", fontSize: "14px" }}>
              {householdCollegeRead.notes.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
          <div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.7" }}>
            This planner does not model tuition inflation, scholarships, grants, or tax treatment. It shows whether the current savings pace feels close to the stated target.
          </div>
        </div>
      ) : null}

      {/* Why This Matters */}
      <div
        style={{
          padding: "24px 26px",
          borderRadius: "20px",
          background: "linear-gradient(135deg, #0f172a 0%, #78350f 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.6 }}>
          Why College Planning Matters Now
        </div>
        <div style={{ fontSize: "20px", fontWeight: 800, lineHeight: "1.3" }}>
          The best time to start a college savings plan was 10 years ago. The second best is now.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          {[
            { stat: "$137K", label: "average 4-year college cost at a public university in 2024 — up 15% from five years ago" },
            { stat: "10 yrs", label: "of consistent monthly contributions doubles a typical family's starting savings position through compounding" },
            { stat: "67%", label: "of parents report college savings as their biggest missed financial planning gap" },
          ].map((item) => (
            <div key={item.label} style={{ padding: "16px 18px", borderRadius: "16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#fcd34d", lineHeight: 1 }}>{item.stat}</div>
              <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: "1.6" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
