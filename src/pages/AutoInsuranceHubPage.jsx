import { useEffect, useMemo, useRef, useState } from "react";
import { summarizeAutoInsuranceModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import {
  getAutoPolicyType,
  listAutoCarriers,
  listAutoPolicyTypes,
} from "../lib/domain/autoInsurance";
import {
  createAutoAssetWithPolicy,
  listAutoPolicies,
} from "../lib/supabase/autoData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

const AUTO_POLICY_TYPES = listAutoPolicyTypes();
const AUTO_CARRIERS = listAutoCarriers();

const DEFAULT_FORM = {
  auto_policy_type_key: "auto_policy_generic",
  policy_name: "",
  named_insured: "",
  carrier_key: "",
  effective_date: "",
  expiration_date: "",
  policy_status: "active",
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

function AutoPolicyCard({ policy, onNavigate }) {
  const policyType = getAutoPolicyType(policy.auto_policy_type_key);
  const linkedAsset = policy.assets || null;
  const name = policy.policy_name || linkedAsset?.asset_name || "Auto Policy";
  const statusTone = policy.policy_status === "active" ? "good" : policy.policy_status === "renewal_pending" ? "warning" : "alert";

  const daysLeft = (() => {
    if (!policy.expiration_date) return null;
    return Math.ceil((new Date(policy.expiration_date) - new Date()) / (1000 * 60 * 60 * 24));
  })();

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(`/insurance/auto/detail/${policy.id}`)}
      style={{ textAlign: "left", width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px 20px", cursor: "pointer", display: "grid", gap: "12px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>{name}</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>
            {policyType?.display_name || policy.auto_policy_type_key}
            {linkedAsset?.institution_name || policy.carrier_key ? ` · ${linkedAsset?.institution_name || policy.carrier_key}` : ""}
          </div>
        </div>
        <StatusPill label={policy.policy_status || "unknown"} tone={statusTone} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: "8px" }}>
        {policy.named_insured ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Insured:</span> {policy.named_insured}</div> : null}
        {policy.effective_date ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Effective:</span> {policy.effective_date}</div> : null}
        {policy.expiration_date ? (
          <div style={{ fontSize: "13px", color: daysLeft !== null && daysLeft < 90 ? "#92400e" : "#475569" }}>
            <span style={{ fontWeight: 700 }}>Expires:</span> {policy.expiration_date}
            {daysLeft !== null && daysLeft < 90 && daysLeft > 0 ? ` (${daysLeft}d)` : ""}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <StatusPill label={policyType?.major_category?.replace(/_/g, " ") || "auto"} tone="neutral" />
        <StatusPill label={linkedAsset?.id ? "Asset Linked" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
      </div>
    </button>
  );
}

function EmptyPoliciesPanel({ onScrollToForm }) {
  const types = [
    { icon: "🚗", label: "Personal Auto", desc: "Liability, comprehensive, and collision" },
    { icon: "🚐", label: "Multi-Vehicle", desc: "Multiple vehicles on one policy" },
    { icon: "🚛", label: "Commercial Auto", desc: "Business vehicle coverage" },
    { icon: "🏍️", label: "Motorcycle / RV", desc: "Specialty vehicle coverage" },
  ];
  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div style={{ fontSize: "15px", color: "#475569", lineHeight: "1.7" }}>
        Start with the primary vehicle policy. One record establishes coverage visibility — additional vehicles and endorsements can be added to the detail view.
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
      <ActionButton label="Add First Policy" onClick={onScrollToForm} primary />
    </div>
  );
}

export default function AutoInsuranceHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const policiesRef = useRef(null);
  const addFormRef = useRef(null);

  const [autoPolicies, setAutoPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      queueMicrotask(() => setLoading(false));
      return;
    }

    let active = true;
    async function loadPolicies() {
      setLoading(true);
      const result = await listAutoPolicies(householdState.context.householdId);
      if (!active) return;
      setAutoPolicies(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadPolicies();
    return () => { active = false; };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshPolicies() {
    if (!householdState.context.householdId) return;
    const result = await listAutoPolicies(householdState.context.householdId);
    setAutoPolicies(result.data || []);
    setLoadError(result.error?.message || "");
  }

  async function handleCreatePolicy(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.auto_policy_type_key) return;

    setCreating(true);
    setCreateError("");
    const result = await createAutoAssetWithPolicy({
      household_id: householdState.context.householdId,
      auto_policy_type_key: form.auto_policy_type_key,
      policy_name: form.policy_name,
      named_insured: form.named_insured,
      carrier_key: form.carrier_key || null,
      effective_date: form.effective_date || null,
      expiration_date: form.expiration_date || null,
      policy_status: form.policy_status,
    });

    if (result.error) {
      setCreateError(result.error.message || "Policy could not be created.");
      setCreating(false);
      return;
    }

    await refreshPolicies();
    setForm(DEFAULT_FORM);
    setCreating(false);
    setShowAddForm(false);
  }

  const autoRead = useMemo(() => summarizeAutoInsuranceModule(autoPolicies), [autoPolicies]);

  const { activeCount, expiringCount, missingInsured } = useMemo(() => {
    const now = new Date();
    return {
      activeCount: autoPolicies.filter((p) => p.policy_status === "active").length,
      expiringCount: autoPolicies.filter((p) => {
        if (!p.expiration_date) return false;
        const days = Math.ceil((new Date(p.expiration_date) - now) / (1000 * 60 * 60 * 24));
        return days > 0 && days <= 90;
      }).length,
      missingInsured: autoRead.metrics.missingNamedInsured || 0,
    };
  }, [autoPolicies, autoRead]);

  const checkpoints = useMemo(() => [
    {
      icon: "🚗",
      label: "Active Auto Coverage",
      status: activeCount > 0 ? "good" : autoPolicies.length > 0 ? "warning" : "alert",
      detail: activeCount > 0
        ? `${activeCount} active auto polic${activeCount === 1 ? "y" : "ies"} covering household vehicles.`
        : autoPolicies.length > 0 ? "Policies on file but none marked active — verify coverage status." : "No auto policies recorded. Vehicle coverage is untracked.",
    },
    {
      icon: "📅",
      label: "Renewal Visibility",
      status: expiringCount === 0 ? "good" : "warning",
      detail: expiringCount > 0
        ? `${expiringCount} polic${expiringCount === 1 ? "y" : "ies"} expiring within 90 days — act before the coverage lapses.`
        : autoPolicies.length > 0 ? "No near-term expirations — renewal windows are clear." : "Add policies to track renewal dates.",
    },
    {
      icon: "✏️",
      label: "Named Insured Recorded",
      status: missingInsured === 0 && autoPolicies.length > 0 ? "good" : missingInsured > 0 ? "warning" : "alert",
      detail: missingInsured > 0
        ? `${missingInsured} polic${missingInsured === 1 ? "y is" : "ies are"} missing a named insured — claims and renewals route through this field.`
        : autoPolicies.length > 0 ? "Named insured is recorded on all policies." : "Add policies to track named insured coverage.",
    },
  ], [activeCount, expiringCount, missingInsured, autoPolicies.length]);

  function scrollToAddForm() {
    setShowAddForm(true);
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const inputStyle = { padding: "11px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "14px", background: "#ffffff", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "grid", gap: "24px" }}>

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #7c2d12 100%)", borderRadius: "22px", padding: "32px 32px 28px", color: "#ffffff", display: "grid", gap: "20px" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fdba74" }}>Vehicle Protection</div>
          <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.15" }}>Auto Insurance Hub</div>
          <div style={{ fontSize: "15px", color: "#cbd5e1", lineHeight: "1.6", maxWidth: "600px" }}>
            Is every household vehicle and driver covered — and are renewal windows visible before coverage lapses? This module keeps vehicle protection clear and current.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
          {[
            { label: "Total Policies", value: loading ? "—" : autoPolicies.length },
            { label: "Active", value: loading ? "—" : activeCount },
            { label: "Expiring Soon", value: loading ? "—" : expiringCount },
            { label: "Missing Insured", value: loading ? "—" : missingInsured },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px", display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "22px", fontWeight: 900 }}>{stat.value}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton label={autoPolicies.length > 0 ? "Add Another Policy" : "Add First Policy"} onClick={scrollToAddForm} primary />
          <ActionButton label="View Policies" onClick={() => policiesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        </div>
      </div>

      {/* Action tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          { icon: "🛡️", label: "Coverage Status", value: activeCount > 0 ? `${activeCount} active polic${activeCount === 1 ? "y" : "ies"}` : "No active coverage", sub: activeCount > 0 ? autoRead.headline : "Add the primary auto policy to establish coverage visibility.", tone: activeCount > 0 ? "good" : "alert" },
          { icon: "⏰", label: "Renewal Watch", value: expiringCount > 0 ? `${expiringCount} expiring soon` : "No near-term expirations", sub: expiringCount > 0 ? "Review and renew before coverage lapses." : "Renewal windows look clear.", tone: expiringCount > 0 ? "warning" : "good" },
          { icon: "📝", label: "Record Completeness", value: missingInsured > 0 ? `${missingInsured} missing named insured` : "All records complete", sub: missingInsured > 0 ? "Add named insured to complete policy records." : "Policy records look complete.", tone: missingInsured > 0 ? "warning" : autoPolicies.length > 0 ? "good" : "alert" },
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
        <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Auto Coverage Checkpoints</div>
        <div style={{ display: "grid", gap: "10px" }}>
          {checkpoints.map((cp) => <ReadinessCheckpoint key={cp.label} {...cp} />)}
        </div>
      </div>

      {/* Policy list */}
      <div ref={policiesRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Auto Policies</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>{autoPolicies.length > 0 ? `${autoPolicies.length} polic${autoPolicies.length === 1 ? "y" : "ies"} — click to open detail` : "No policies recorded yet"}</div>
          </div>
          <ActionButton label="+ Add Policy" onClick={scrollToAddForm} primary />
        </div>

        {householdState.loading || loading ? (
          <div style={{ ...surfaceCard(), color: "#64748b", fontSize: "14px" }}>Loading auto policies...</div>
        ) : loadError ? (
          <div style={{ ...surfaceCard(), color: "#991b1b", fontSize: "14px" }}>{loadError}</div>
        ) : autoPolicies.length === 0 ? (
          <div style={{ ...surfaceCard() }}><EmptyPoliciesPanel onScrollToForm={scrollToAddForm} /></div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {autoPolicies.map((p) => <AutoPolicyCard key={p.id} policy={p} onNavigate={onNavigate} />)}
          </div>
        )}
      </div>

      {/* Add form */}
      <div ref={addFormRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Add an Auto Policy</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Start with the basics — declarations and vehicle details can be added in the detail view.</div>
          </div>
          <button type="button" onClick={() => setShowAddForm((v) => !v)} style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            {showAddForm ? "Collapse" : "Expand Form"}
          </button>
        </div>

        {showAddForm ? (
          <div style={{ ...surfaceCard() }}>
            <form onSubmit={handleCreatePolicy} style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { key: "auto_policy_type_key", label: "Policy Type", isSelect: true, options: AUTO_POLICY_TYPES.map((t) => ({ value: t.auto_policy_type_key, label: t.display_name })) },
                  { key: "policy_name", label: "Policy Name", placeholder: "e.g. Household Auto Policy" },
                  { key: "named_insured", label: "Named Insured", placeholder: "Name on policy" },
                  { key: "carrier_key", label: "Carrier", isSelect: true, options: [{ value: "", label: "No match yet" }, ...AUTO_CARRIERS.map((c) => ({ value: c.carrier_key, label: c.display_name }))] },
                  { key: "effective_date", label: "Effective Date", type: "date" },
                  { key: "expiration_date", label: "Expiration Date", type: "date" },
                  { key: "policy_status", label: "Status", isSelect: true, options: ["active", "renewal_pending", "inactive", "cancelled"].map((v) => ({ value: v, label: v })) },
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
                {creating ? "Saving..." : "Save Auto Policy"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "13px" }}>{createError}</div> : null}
            </form>
          </div>
        ) : null}
      </div>

      {/* Why This Matters */}
      <div style={{ background: "linear-gradient(135deg, #7c2d12 0%, #92400e 50%, #0f172a 100%)", borderRadius: "22px", padding: "36px 32px", color: "#ffffff", display: "grid", gap: "28px" }}>
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fdba74" }}>Why This Module Matters</div>
          <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: "1.25" }}>A one-day lapse in auto coverage can cost more than a year of premiums.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {[
            { stat: "1 in 8", label: "Drivers on the road are uninsured", detail: "A collision with an uninsured driver exposes the household to full out-of-pocket costs without uninsured motorist coverage." },
            { stat: "$6,800", label: "Average auto liability claim payout", detail: "Without adequate liability limits, the household is personally responsible for the difference — not the carrier." },
            { stat: "30 days", label: "Average SR-22 requirement after a lapse in coverage", detail: "A coverage gap of even one day can trigger higher-risk classification and elevated premiums for years." },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#fdba74", marginBottom: "6px" }}>{item.stat}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "6px" }}>{item.label}</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "12px", lineHeight: "1.7" }}>
          Debug: household={householdState.context.householdId || "none"} | policies={autoPolicies.length} | loading={loading ? "yes" : "no"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
