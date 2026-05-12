import { useEffect, useMemo, useRef, useState } from "react";
import { summarizeHealthModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import {
  getHealthPlanType,
  listHealthCarriers,
  listHealthPlanTypes,
} from "../lib/domain/healthInsurance";
import {
  createHealthAssetWithPlan,
  listHealthPlans,
} from "../lib/supabase/healthData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

const HEALTH_PLAN_TYPES = listHealthPlanTypes();
const HEALTH_CARRIERS = listHealthCarriers();

const DEFAULT_FORM = {
  health_plan_type_key: "health_plan_generic",
  plan_name: "",
  subscriber_name: "",
  employer_group_name: "",
  carrier_key: "",
  effective_date: "",
  renewal_date: "",
  plan_status: "active",
};

function pillStyle(tone) {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "alert") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

function surfaceCard(extra = {}) {
  return { background: "#ffffff", borderRadius: "18px", border: "1px solid #e8edf3", boxShadow: "0 2px 12px rgba(15,23,42,0.05)", padding: "22px 24px", ...extra };
}

function StatusPill({ label, tone }) {
  const s = pillStyle(tone);
  return <span style={{ ...s, fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", whiteSpace: "nowrap" }}>{label}</span>;
}

function ActionButton({ label, onClick, primary, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ padding: "11px 18px", borderRadius: "10px", border: primary ? "none" : "1px solid #cbd5e1", background: primary ? (disabled ? "#94a3b8" : "#0f172a") : "#ffffff", color: primary ? "#ffffff" : "#0f172a", fontWeight: 700, fontSize: "14px", cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap", opacity: disabled ? 0.7 : 1 }}>
      {label}
    </button>
  );
}

function ReadinessCheckpoint({ icon, label, status, detail }) {
  const tone = status === "good" ? "good" : status === "warning" ? "warning" : "alert";
  const s = pillStyle(tone);
  const borderColor = tone === "good" ? "#bbf7d0" : tone === "warning" ? "#fde68a" : "#fecaca";
  return (
    <div style={{ ...surfaceCard(), display: "grid", gap: "10px", borderLeft: `4px solid ${borderColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>{icon}</span>
          <span style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{label}</span>
        </div>
        <span style={{ ...s, fontSize: "11px", fontWeight: 700, padding: "3px 9px", borderRadius: "999px" }}>
          {tone === "good" ? "Covered" : tone === "warning" ? "Watch" : "Gap"}
        </span>
      </div>
      <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>{detail}</div>
    </div>
  );
}

function HealthPlanCard({ plan, onNavigate }) {
  const planType = getHealthPlanType(plan.health_plan_type_key);
  const linkedAsset = plan.assets || null;
  const name = plan.plan_name || linkedAsset?.asset_name || plan.employer_group_name || "Health Plan";
  const statusTone = plan.plan_status === "active" ? "good" : plan.plan_status === "renewal_pending" ? "warning" : "alert";

  const daysToRenewal = (() => {
    if (!plan.renewal_date) return null;
    return Math.ceil((new Date(plan.renewal_date) - new Date()) / (1000 * 60 * 60 * 24));
  })();

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(`/insurance/health/detail/${plan.id}`)}
      style={{ textAlign: "left", width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px 20px", cursor: "pointer", display: "grid", gap: "12px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>{name}</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>
            {planType?.display_name || plan.health_plan_type_key}
            {linkedAsset?.institution_name || plan.carrier_key ? ` · ${linkedAsset?.institution_name || plan.carrier_key}` : ""}
          </div>
        </div>
        <StatusPill label={plan.plan_status || "unknown"} tone={statusTone} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: "8px" }}>
        {plan.subscriber_name ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Subscriber:</span> {plan.subscriber_name}</div> : null}
        {plan.employer_group_name ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Employer:</span> {plan.employer_group_name}</div> : null}
        {plan.effective_date ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Effective:</span> {plan.effective_date}</div> : null}
        {plan.renewal_date ? (
          <div style={{ fontSize: "13px", color: daysToRenewal !== null && daysToRenewal < 90 ? "#92400e" : "#475569" }}>
            <span style={{ fontWeight: 700 }}>Renews:</span> {plan.renewal_date}
            {daysToRenewal !== null && daysToRenewal < 90 && daysToRenewal > 0 ? ` (${daysToRenewal}d)` : ""}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <StatusPill label={planType?.major_category?.replace(/_/g, " ") || "health"} tone="neutral" />
        <StatusPill label={linkedAsset?.id ? "Asset Linked" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
      </div>
    </button>
  );
}

function EmptyPlansPanel({ onScrollToForm }) {
  const types = [
    { icon: "🏥", label: "Employer Group Plan", desc: "Employer-sponsored health benefits" },
    { icon: "💊", label: "Individual / ACA Plan", desc: "Marketplace or individual coverage" },
    { icon: "👴", label: "Medicare", desc: "Parts A, B, C, or D coverage" },
    { icon: "👨‍👩‍👧", label: "Medicaid / CHIP", desc: "Government program coverage" },
  ];
  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div style={{ fontSize: "15px", color: "#475569", lineHeight: "1.7" }}>
        Start with the primary health plan. One record establishes benefits visibility — dependents, supplemental plans, and dental/vision can be layered in over time.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
        {types.map((t) => (
          <button key={t.label} type="button" onClick={onScrollToForm} style={{ textAlign: "left", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 16px", cursor: "pointer", display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "22px" }}>{t.icon}</span>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{t.label}</div>
            <div style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.5" }}>{t.desc}</div>
          </button>
        ))}
      </div>
      <ActionButton label="Add First Health Plan" onClick={onScrollToForm} primary />
    </div>
  );
}

export default function HealthInsuranceHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const plansRef = useRef(null);
  const addFormRef = useRef(null);

  const [healthPlans, setHealthPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      setLoading(false);
      return;
    }

    let active = true;
    async function loadPlans() {
      setLoading(true);
      const result = await listHealthPlans(householdState.context.householdId);
      if (!active) return;
      setHealthPlans(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadPlans();
    return () => { active = false; };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshPlans() {
    if (!householdState.context.householdId) return;
    const result = await listHealthPlans(householdState.context.householdId);
    setHealthPlans(result.data || []);
    setLoadError(result.error?.message || "");
  }

  async function handleCreatePlan(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.health_plan_type_key) return;

    setCreating(true);
    setCreateError("");
    const result = await createHealthAssetWithPlan({
      household_id: householdState.context.householdId,
      health_plan_type_key: form.health_plan_type_key,
      plan_name: form.plan_name,
      subscriber_name: form.subscriber_name,
      employer_group_name: form.employer_group_name,
      carrier_key: form.carrier_key || null,
      effective_date: form.effective_date || null,
      renewal_date: form.renewal_date || null,
      plan_status: form.plan_status,
    });

    if (result.error) {
      setCreateError(result.error.message || "Plan could not be created.");
      setCreating(false);
      return;
    }

    await refreshPlans();
    setForm(DEFAULT_FORM);
    setCreating(false);
    setShowAddForm(false);
  }

  const healthRead = useMemo(() => summarizeHealthModule(healthPlans), [healthPlans]);

  const { activeCount, renewalSoonCount, missingSubscriber } = useMemo(() => {
    const now = new Date();
    return {
      activeCount: healthPlans.filter((p) => p.plan_status === "active").length,
      renewalSoonCount: healthPlans.filter((p) => {
        if (!p.renewal_date) return false;
        const days = Math.ceil((new Date(p.renewal_date) - now) / (1000 * 60 * 60 * 24));
        return days > 0 && days <= 120;
      }).length,
      missingSubscriber: healthRead.metrics.missingSubscriber || 0,
    };
  }, [healthPlans, healthRead]);

  const checkpoints = useMemo(() => [
    {
      icon: "🏥",
      label: "Active Health Coverage",
      status: activeCount > 0 ? "good" : healthPlans.length > 0 ? "warning" : "alert",
      detail: activeCount > 0
        ? `${activeCount} active health plan${activeCount === 1 ? "" : "s"} covering household members.`
        : healthPlans.length > 0 ? "Plans on file but none marked active — verify current coverage status." : "No health plans recorded. Medical coverage is untracked.",
    },
    {
      icon: "📅",
      label: "Open Enrollment Visibility",
      status: renewalSoonCount === 0 ? "good" : "warning",
      detail: renewalSoonCount > 0
        ? `${renewalSoonCount} plan${renewalSoonCount === 1 ? "" : "s"} renewing within 120 days — review before open enrollment closes.`
        : healthPlans.length > 0 ? "No near-term renewal windows — benefits timing looks clear." : "Add plans to track open enrollment windows.",
    },
    {
      icon: "✏️",
      label: "Subscriber Recorded",
      status: missingSubscriber === 0 && healthPlans.length > 0 ? "good" : missingSubscriber > 0 ? "warning" : "alert",
      detail: missingSubscriber > 0
        ? `${missingSubscriber} plan${missingSubscriber === 1 ? "" : "s"} missing a subscriber name — claims and enrollment changes route through this field.`
        : healthPlans.length > 0 ? "Subscriber information is on file for all plans." : "Add plans to track subscriber coverage.",
    },
  ], [activeCount, renewalSoonCount, missingSubscriber, healthPlans.length]);

  function scrollToAddForm() {
    setShowAddForm(true);
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const inputStyle = { padding: "11px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "14px", background: "#ffffff", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "grid", gap: "24px" }}>

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #134e4a 100%)", borderRadius: "22px", padding: "32px 32px 28px", color: "#ffffff", display: "grid", gap: "20px" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#5eead4" }}>Health Benefits</div>
          <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.15" }}>Health Insurance Hub</div>
          <div style={{ fontSize: "15px", color: "#cbd5e1", lineHeight: "1.6", maxWidth: "600px" }}>
            Does every household member have active coverage — and are open enrollment windows visible before they close? This module keeps benefits continuity in view year-round.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
          {[
            { label: "Total Plans", value: loading ? "—" : healthPlans.length },
            { label: "Active", value: loading ? "—" : activeCount },
            { label: "Renewing Soon", value: loading ? "—" : renewalSoonCount },
            { label: "Missing Subscriber", value: loading ? "—" : missingSubscriber },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px", display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "22px", fontWeight: 900 }}>{stat.value}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton label={healthPlans.length > 0 ? "Add Another Plan" : "Add First Plan"} onClick={scrollToAddForm} primary />
          <ActionButton label="View Plans" onClick={() => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        </div>
      </div>

      {/* Action tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          { icon: "💊", label: "Coverage Status", value: activeCount > 0 ? `${activeCount} active plan${activeCount === 1 ? "" : "s"}` : "No active coverage", sub: activeCount > 0 ? healthRead.headline : "Add the primary health plan to establish coverage visibility.", tone: activeCount > 0 ? "good" : "alert" },
          { icon: "📋", label: "Open Enrollment Watch", value: renewalSoonCount > 0 ? `${renewalSoonCount} renewing soon` : "No near-term renewals", sub: renewalSoonCount > 0 ? "Review plan options before open enrollment closes." : "No imminent open enrollment windows.", tone: renewalSoonCount > 0 ? "warning" : "good" },
          { icon: "📝", label: "Record Completeness", value: missingSubscriber > 0 ? `${missingSubscriber} missing subscriber` : "All records complete", sub: missingSubscriber > 0 ? "Add subscriber info to complete plan records." : "Plan records look complete.", tone: missingSubscriber > 0 ? "warning" : healthPlans.length > 0 ? "good" : "alert" },
        ].map((tile) => {
          const s = pillStyle(tile.tone);
          return (
            <div key={tile.label} style={{ ...surfaceCard(), display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: "22px" }}>{tile.icon}</span>
                <span style={{ ...s, fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "999px" }}>{tile.tone === "good" ? "Good" : tile.tone === "warning" ? "Watch" : "Act"}</span>
              </div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{tile.label}</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{tile.value}</div>
              <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.5" }}>{tile.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Readiness checkpoints */}
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Benefits Readiness Checkpoints</div>
        <div style={{ display: "grid", gap: "10px" }}>
          {checkpoints.map((cp) => <ReadinessCheckpoint key={cp.label} {...cp} />)}
        </div>
      </div>

      {/* Plan list */}
      <div ref={plansRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Health Plans</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>{healthPlans.length > 0 ? `${healthPlans.length} plan${healthPlans.length === 1 ? "" : "s"} — click to open detail` : "No plans recorded yet"}</div>
          </div>
          <ActionButton label="+ Add Plan" onClick={scrollToAddForm} primary />
        </div>

        {householdState.loading || loading ? (
          <div style={{ ...surfaceCard(), color: "#64748b", fontSize: "14px" }}>Loading health plans...</div>
        ) : loadError ? (
          <div style={{ ...surfaceCard(), color: "#991b1b", fontSize: "14px" }}>{loadError}</div>
        ) : healthPlans.length === 0 ? (
          <div style={{ ...surfaceCard() }}><EmptyPlansPanel onScrollToForm={scrollToAddForm} /></div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {healthPlans.map((p) => <HealthPlanCard key={p.id} plan={p} onNavigate={onNavigate} />)}
          </div>
        )}
      </div>

      {/* Add form */}
      <div ref={addFormRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Add a Health Plan</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Start with the basics — benefits documents and dependent details can be added in the detail view.</div>
          </div>
          <button type="button" onClick={() => setShowAddForm((v) => !v)} style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            {showAddForm ? "Collapse" : "Expand Form"}
          </button>
        </div>

        {showAddForm ? (
          <div style={{ ...surfaceCard() }}>
            <form onSubmit={handleCreatePlan} style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { key: "health_plan_type_key", label: "Plan Type", isSelect: true, options: HEALTH_PLAN_TYPES.map((t) => ({ value: t.health_plan_type_key, label: t.display_name })) },
                  { key: "plan_name", label: "Plan Name", placeholder: "e.g. Family PPO 2025" },
                  { key: "subscriber_name", label: "Subscriber Name", placeholder: "Name on plan" },
                  { key: "employer_group_name", label: "Employer / Group", placeholder: "Employer or group name" },
                  { key: "carrier_key", label: "Carrier", isSelect: true, options: [{ value: "", label: "No match yet" }, ...HEALTH_CARRIERS.map((c) => ({ value: c.carrier_key, label: c.display_name }))] },
                  { key: "plan_status", label: "Status", isSelect: true, options: ["active", "renewal_pending", "inactive", "terminated"].map((v) => ({ value: v, label: v })) },
                  { key: "effective_date", label: "Effective Date", type: "date" },
                  { key: "renewal_date", label: "Renewal Date", type: "date" },
                ].map((field) => (
                  <div key={field.key}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>{field.label}</label>
                    {field.isSelect ? (
                      <select value={form[field.key]} onChange={(e) => setForm((c) => ({ ...c, [field.key]: e.target.value }))} style={inputStyle}>
                        {field.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    ) : (
                      <input type={field.type || "text"} value={form[field.key]} onChange={(e) => setForm((c) => ({ ...c, [field.key]: e.target.value }))} placeholder={field.placeholder} style={inputStyle} />
                    )}
                  </div>
                ))}
              </div>
              <button type="submit" disabled={creating || !householdState.context.householdId} style={{ padding: "13px 20px", borderRadius: "10px", border: "none", background: creating ? "#94a3b8" : "#0f172a", color: "#ffffff", fontWeight: 800, fontSize: "15px", cursor: creating ? "default" : "pointer", marginTop: "4px" }}>
                {creating ? "Saving..." : "Save Health Plan"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "13px" }}>{createError}</div> : null}
            </form>
          </div>
        ) : null}
      </div>

      {/* Why This Matters */}
      <div style={{ background: "linear-gradient(135deg, #134e4a 0%, #0f766e 50%, #0f172a 100%)", borderRadius: "22px", padding: "36px 32px", color: "#ffffff", display: "grid", gap: "28px" }}>
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#5eead4" }}>Why This Module Matters</div>
          <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: "1.25" }}>Missing open enrollment by one day can leave a household uninsured for a full year.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {[
            { stat: "$13,800", label: "Average out-of-pocket maximum for a family plan", detail: "Knowing the plan's out-of-pocket cap is the difference between a manageable medical bill and a financial crisis." },
            { stat: "65%", label: "Of medical bankruptcies involve people who had insurance", detail: "Coverage gaps, wrong plan tier, or missing supplemental coverage cause most of the harm — not simply being uninsured." },
            { stat: "Nov 1–Jan 15", label: "ACA open enrollment window — a narrow annual deadline", detail: "Missing it means no coverage changes until the next year unless a qualifying life event occurs." },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#5eead4", marginBottom: "6px" }}>{item.stat}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "6px" }}>{item.label}</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "12px", lineHeight: "1.7" }}>
          Debug: household={householdState.context.householdId || "none"} | plans={healthPlans.length} | loading={loading ? "yes" : "no"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
