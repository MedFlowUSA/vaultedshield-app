import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import { scoreCollegeGoal } from "../lib/domain/college/collegeGoalScore";
import { loadCollegeGoalState, saveCollegeGoalState } from "../lib/domain/college/collegeGoalStorage";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

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

function inputStyle() {
  return {
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    boxSizing: "border-box",
  };
}

function getStatusTone(status) {
  if (status === "On Track") return { background: "#dcfce7", color: "#166534" };
  if (status === "Slightly Behind") return { background: "#fef3c7", color: "#92400e" };
  if (status === "Behind") return { background: "#ffedd5", color: "#c2410c" };
  return { background: "#fee2e2", color: "#991b1b" };
}

export default function CollegePlanningPage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
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

  useEffect(() => {
    if (!hydrated) return;
    const safeKey = String(form.childLabel || activePlanKey || "Child Plan").trim() || "Child Plan";
    const nextPlan = { ...form, childLabel: safeKey };
    const nextPlans = {
      ...plans,
      [safeKey]: nextPlan,
    };
    if (activePlanKey && activePlanKey !== safeKey && nextPlans[activePlanKey]) {
      delete nextPlans[activePlanKey];
    }
    setPlans(nextPlans);
    if (activePlanKey !== safeKey) {
      setActivePlanKey(safeKey);
    }
    saveCollegeGoalState(storageScope, {
      plans: nextPlans,
      activePlanKey: safeKey,
      updatedAt: new Date().toISOString(),
    });
    // We intentionally persist on form change to make this feel like an ongoing plan.
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

  const summaryItems = useMemo(
    () => [
      { label: "Active Child Plan", value: score.childLabel, helper: `${planKeys.length} saved child plan${planKeys.length === 1 ? "" : "s"}` },
      { label: "Current Savings", value: formatCurrency(score.inputs.currentSavings), helper: "College savings entered for this child" },
      { label: "Monthly Contribution", value: formatCurrency(score.inputs.monthlyContribution), helper: "Current savings pace" },
      { label: "Projected Savings", value: formatCurrency(score.projectedSavings), helper: `By age ${score.inputs.collegeStartAge}` },
      { label: "Readiness", value: `${score.readinessScore}/100`, helper: score.readinessStatus },
    ],
    [planKeys.length, score]
  );

  const whatChangesThis = useMemo(() => {
    const items = [];
    if (score.inputs.monthlyContribution < 500) items.push("Increasing monthly contributions improves projected college savings the fastest.");
    if (score.inputs.collegeStartAge <= score.inputs.currentAge + 8) items.push("A later college start age gives the savings more time to compound.");
    if (score.inputs.targetSavings > 150000) items.push("A lower target savings goal reduces the amount the plan needs to fully fund.");
    if (score.inputs.currentSavings < score.inputs.targetSavings * 0.25) items.push("Adding to current savings now can meaningfully improve the plan's starting position.");
    return items.slice(0, 4);
  }, [score]);

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <PageHeader
        eyebrow="College Planning"
        title="Kids' College Planning Tracker"
        description="Track a child's college savings goal in plain English with a simple readiness score and visible assumptions."
        actions={
          <button
            type="button"
            onClick={() => onNavigate?.("/guidance")}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to Guidance
          </button>
        }
      />

      <SummaryPanel items={summaryItems} />

      <SectionCard
        title="College Goal"
        subtitle="Enter a practical savings target for one child at a time. This estimate is designed for planning clarity, not certainty."
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {planKeys.length > 0 ? (
              <select value={activePlanKey} onChange={handlePlanSelection} style={{ ...inputStyle(), width: isMobile ? "100%" : "280px" }}>
                {planKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={handleCreateNewPlan}
              style={{
                padding: "12px 14px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Add Child Plan
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: "14px 16px",
            }}
          >
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>Child name or label</span>
              <input value={form.childLabel} onChange={(event) => updateField("childLabel", event.target.value)} style={inputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>Child current age</span>
              <input value={form.currentAge} onChange={(event) => updateField("currentAge", event.target.value)} inputMode="numeric" style={inputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>College start age</span>
              <input value={form.collegeStartAge} onChange={(event) => updateField("collegeStartAge", event.target.value)} inputMode="numeric" style={inputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>Target college savings amount</span>
              <input value={form.targetSavings} onChange={(event) => updateField("targetSavings", event.target.value)} inputMode="decimal" style={inputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>Current college savings</span>
              <input value={form.currentSavings} onChange={(event) => updateField("currentSavings", event.target.value)} inputMode="decimal" placeholder="Optional if starting from zero" style={inputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>Monthly contribution</span>
              <input value={form.monthlyContribution} onChange={(event) => updateField("monthlyContribution", event.target.value)} inputMode="decimal" style={inputStyle()} />
            </label>
            <label style={{ display: "grid", gap: "6px", gridColumn: isMobile ? "auto" : "1 / -1" }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>Expected annual growth rate (%)</span>
              <input value={form.annualGrowthRate} onChange={(event) => updateField("annualGrowthRate", event.target.value)} inputMode="decimal" style={inputStyle()} />
            </label>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="College Readiness Summary"
        subtitle="A simple first-pass estimate of how the current savings plan compares with the target."
      >
        <div style={{ display: "grid", gap: "18px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isTablet ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
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
              <div
                key={item.label}
                style={{
                  padding: "14px 16px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.label}</div>
                <div style={{ fontWeight: 800, fontSize: "20px", color: "#0f172a" }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "999px",
                background: getStatusTone(score.readinessStatus).background,
                color: getStatusTone(score.readinessStatus).color,
                fontWeight: 800,
                fontSize: "13px",
              }}
            >
              {score.readinessStatus}
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>{score.readinessScore}/100</div>
            <div style={{ color: "#64748b" }}>
              Projected by age {score.inputs.collegeStartAge}
            </div>
          </div>

          {score.validationMessages.length > 0 ? (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "14px",
                background: "#fff7ed",
                border: "1px solid rgba(251, 191, 36, 0.35)",
                color: "#92400e",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 700 }}>Planning guardrails</div>
              <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "6px" }}>
                {score.validationMessages.map((item) => (
                  <li key={item} style={{ lineHeight: "1.6" }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            style={{
              padding: "16px 18px",
              borderRadius: "16px",
              background: "#ffffff",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              color: "#475569",
              lineHeight: "1.8",
            }}
          >
            {score.explanation}
          </div>

          <div
            style={{
              padding: "14px 16px",
              borderRadius: "14px",
              background: "#f8fafc",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              display: "grid",
              gap: "8px",
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a" }}>Assumptions Used</div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {score.assumptionLines.map((item) => (
                <div
                  key={item}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: "#ffffff",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    color: "#475569",
                    fontSize: "13px",
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          {whatChangesThis.length > 0 ? (
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "16px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ fontWeight: 700, color: "#0f172a" }}>What Changes This Result?</div>
              <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#475569" }}>
                {whatChangesThis.map((item) => (
                  <li key={item} style={{ lineHeight: "1.7" }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="College Planning Notes" subtitle="Starter family-planning context for this v1 tracker.">
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            This planner is intentionally simple. It does not yet model tuition inflation, scholarships, grants, tax treatment, or multiple education phases. It is meant to help a household see whether the current savings pace feels close to the stated target.
          </div>
          <EmptyState
            title="Household summary card deferred"
            description="This v1 includes light multi-child support on the page itself through saved child labels. A household-level dashboard card can be added next once we decide where the shared planning surface should live."
          />
        </div>
      </SectionCard>
    </div>
  );
}
