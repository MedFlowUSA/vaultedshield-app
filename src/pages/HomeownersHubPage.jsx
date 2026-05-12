import { useEffect, useMemo, useRef, useState } from "react";
import { summarizeHomeownersModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { buildHomeownersHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import {
  getHomeownersPolicyType,
  listHomeownersCarriers,
  listHomeownersPolicyTypes,
} from "../lib/domain/homeowners";
import {
  createHomeownersAssetWithPolicy,
  listHomeownersPolicies,
} from "../lib/supabase/homeownersData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

const HOMEOWNERS_POLICY_TYPES = listHomeownersPolicyTypes();
const HOMEOWNERS_CARRIERS = listHomeownersCarriers();

const DEFAULT_FORM = {
  homeowners_policy_type_key: "homeowners_standard",
  policy_name: "",
  property_address: "",
  carrier_key: "",
  named_insured: "",
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
  return {
    background: "#ffffff",
    borderRadius: "18px",
    border: "1px solid #e8edf3",
    boxShadow: "0 2px 12px rgba(15,23,42,0.05)",
    padding: "22px 24px",
    ...extra,
  };
}

function StatusPill({ label, tone }) {
  const s = pillStyle(tone);
  return (
    <span style={{ ...s, fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function ActionButton({ label, onClick, primary, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "11px 18px",
        borderRadius: "10px",
        border: primary ? "none" : "1px solid #cbd5e1",
        background: primary ? (disabled ? "#94a3b8" : "#0f172a") : "#ffffff",
        color: primary ? "#ffffff" : "#0f172a",
        fontWeight: 700,
        fontSize: "14px",
        cursor: disabled ? "default" : "pointer",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.7 : 1,
      }}
    >
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

function PolicyCard({ policy, onNavigate }) {
  const policyType = getHomeownersPolicyType(policy.homeowners_policy_type_key);
  const linkedAsset = policy.assets || null;
  const name = policy.policy_name || linkedAsset?.asset_name || policy.property_address || "Homeowners Policy";
  const statusTone = policy.policy_status === "active" ? "good" : policy.policy_status === "renewal_pending" ? "warning" : "alert";

  const daysLeft = (() => {
    if (!policy.expiration_date) return null;
    return Math.ceil((new Date(policy.expiration_date) - new Date()) / (1000 * 60 * 60 * 24));
  })();

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(`/insurance/homeowners/detail/${policy.id}`)}
      style={{
        textAlign: "left",
        width: "100%",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "18px 20px",
        cursor: "pointer",
        display: "grid",
        gap: "12px",
        boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>{name}</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>
            {policyType?.display_name || policy.homeowners_policy_type_key}
            {linkedAsset?.institution_name || policy.carrier_key ? ` · ${linkedAsset?.institution_name || policy.carrier_key}` : ""}
          </div>
        </div>
        <StatusPill label={policy.policy_status || "unknown"} tone={statusTone} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: "8px" }}>
        {policy.named_insured ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Named Insured:</span> {policy.named_insured}</div> : null}
        {policy.property_address ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Property:</span> {policy.property_address}</div> : null}
        {policy.effective_date ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Effective:</span> {policy.effective_date}</div> : null}
        {policy.expiration_date ? (
          <div style={{ fontSize: "13px", color: daysLeft !== null && daysLeft < 90 ? "#92400e" : "#475569" }}>
            <span style={{ fontWeight: 700 }}>Expires:</span> {policy.expiration_date}
            {daysLeft !== null && daysLeft < 90 && daysLeft > 0 ? ` (${daysLeft}d)` : ""}
            {daysLeft !== null && daysLeft <= 0 ? " (expired)" : ""}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <StatusPill label={policyType?.major_category?.replace(/_/g, " ") || "homeowners"} tone="neutral" />
        <StatusPill label={linkedAsset?.id ? "Asset Linked" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
      </div>
    </button>
  );
}

function EmptyPoliciesPanel({ onScrollToForm }) {
  const types = [
    { icon: "🏠", label: "HO-3 Standard", desc: "Primary home all-risk policy" },
    { icon: "🏢", label: "Condo / HO-6", desc: "Unit owner's policy" },
    { icon: "🏘️", label: "Landlord / DP-3", desc: "Rental property coverage" },
    { icon: "🌊", label: "Specialty / Flood", desc: "Flood, earthquake, or specialty lines" },
  ];
  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div style={{ fontSize: "15px", color: "#475569", lineHeight: "1.7" }}>
        Start with the primary home policy. One record gives the household its coverage anchor — endorsements, flood addons, and linked properties can follow.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
        {types.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={onScrollToForm}
            style={{
              textAlign: "left",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "14px 16px",
              cursor: "pointer",
              display: "grid",
              gap: "6px",
            }}
          >
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

function CommandRow({ item }) {
  const tone = item.urgency === "critical" ? "alert" : "warning";
  return (
    <div style={{ ...surfaceCard({ padding: "16px 20px" }), display: "grid", gap: "8px", borderLeft: `4px solid ${tone === "alert" ? "#fecaca" : "#fde68a"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
        <StatusPill label={item.urgencyMeta?.badge || item.urgency} tone={tone} />
      </div>
      {item.blocker ? <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}><strong>Gap:</strong> {item.blocker}</div> : null}
      {item.consequence ? <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}><strong>Risk:</strong> {item.consequence}</div> : null}
      {item.nextAction ? <div style={{ fontSize: "13px", color: tone === "alert" ? "#991b1b" : "#92400e", fontWeight: 700 }}>Next: {item.nextAction}</div> : null}
    </div>
  );
}

export default function HomeownersHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const policiesRef = useRef(null);
  const addFormRef = useRef(null);

  const [policies, setPolicies] = useState([]);
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
    async function loadPolicies() {
      setLoading(true);
      const result = await listHomeownersPolicies(householdState.context.householdId);
      if (!active) return;
      setPolicies(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadPolicies();
    return () => { active = false; };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshPolicies() {
    if (!householdState.context.householdId) return;
    const result = await listHomeownersPolicies(householdState.context.householdId);
    setPolicies(result.data || []);
    setLoadError(result.error?.message || "");
  }

  async function handleCreatePolicy(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.homeowners_policy_type_key) return;

    setCreating(true);
    setCreateError("");
    const result = await createHomeownersAssetWithPolicy({
      household_id: householdState.context.householdId,
      homeowners_policy_type_key: form.homeowners_policy_type_key,
      policy_name: form.policy_name,
      property_address: form.property_address,
      carrier_key: form.carrier_key || null,
      named_insured: form.named_insured,
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

  const homeownersRead = useMemo(() => summarizeHomeownersModule(policies), [policies]);
  const homeownersHubCommand = useMemo(
    () => buildHomeownersHubCommand({ policies, homeownersRead }),
    [policies, homeownersRead]
  );

  const { activeCount, expiringCount, missingInsured, missingProperty } = useMemo(() => {
    const now = new Date();
    return {
      activeCount: policies.filter((p) => p.policy_status === "active").length,
      expiringCount: policies.filter((p) => {
        if (!p.expiration_date) return false;
        const days = Math.ceil((new Date(p.expiration_date) - now) / (1000 * 60 * 60 * 24));
        return days > 0 && days <= 90;
      }).length,
      missingInsured: homeownersRead.metrics.missingNamedInsured || 0,
      missingProperty: homeownersRead.metrics.missingProperty || 0,
    };
  }, [policies, homeownersRead]);

  const checkpoints = useMemo(() => [
    {
      icon: "🏠",
      label: "Active Coverage on Record",
      status: activeCount > 0 ? "good" : policies.length > 0 ? "warning" : "alert",
      detail: activeCount > 0
        ? `${activeCount} active homeowners polic${activeCount === 1 ? "y" : "ies"} covering household property.`
        : policies.length > 0
          ? "Policies exist but none are marked active — verify current coverage status."
          : "No homeowners policies on record. The primary home is likely untracked.",
    },
    {
      icon: "📅",
      label: "No Policies Expiring Within 90 Days",
      status: expiringCount === 0 ? "good" : "warning",
      detail: expiringCount > 0
        ? `${expiringCount} polic${expiringCount === 1 ? "y is" : "ies are"} expiring within 90 days — review and renew to avoid a coverage gap.`
        : policies.length > 0
          ? "No near-term expirations — coverage windows look stable."
          : "Add policies to track renewal windows.",
    },
    {
      icon: "✏️",
      label: "Named Insured and Property Recorded",
      status: missingInsured === 0 && missingProperty === 0 && policies.length > 0 ? "good" : missingInsured > 0 || missingProperty > 0 ? "warning" : "alert",
      detail: missingInsured > 0 || missingProperty > 0
        ? `${missingInsured > 0 ? `${missingInsured} missing named insured` : ""}${missingInsured > 0 && missingProperty > 0 ? " · " : ""}${missingProperty > 0 ? `${missingProperty} missing property address` : ""}. Claims route through this information.`
        : policies.length > 0
          ? "Named insured and property addresses are on file — claim routing is clear."
          : "Add policies to track named insured and property coverage.",
    },
  ], [activeCount, expiringCount, missingInsured, missingProperty, policies.length]);

  function scrollToAddForm() {
    setShowAddForm(true);
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const inputStyle = { padding: "11px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "14px", background: "#ffffff", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "grid", gap: "24px" }}>

      {/* Hero */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #065f46 100%)",
          borderRadius: "22px",
          padding: "32px 32px 28px",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6ee7b7" }}>
            Property Protection
          </div>
          <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.15" }}>Homeowners Hub</div>
          <div style={{ fontSize: "15px", color: "#cbd5e1", lineHeight: "1.6", maxWidth: "600px" }}>
            Is the home covered — and will the claim get paid when it matters? This module tracks every homeowners policy, renewal window, and coverage gap in one place.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
          {[
            { label: "Total Policies", value: loading ? "—" : policies.length },
            { label: "Active", value: loading ? "—" : activeCount },
            { label: "Expiring Soon", value: loading ? "—" : expiringCount },
            { label: "Action Items", value: loading ? "—" : homeownersHubCommand.rows.length },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px", display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "22px", fontWeight: 900 }}>{stat.value}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton label={policies.length > 0 ? "Add Another Policy" : "Add First Policy"} onClick={scrollToAddForm} primary />
          <ActionButton label="View Policies" onClick={() => policiesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        </div>
      </div>

      {/* Action tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            icon: "🛡️",
            label: "Coverage Status",
            value: activeCount > 0 ? `${activeCount} active polic${activeCount === 1 ? "y" : "ies"}` : "No active coverage",
            sub: activeCount > 0 ? homeownersRead.headline : "Add the primary homeowners policy to establish coverage visibility.",
            tone: activeCount > 0 ? "good" : "alert",
          },
          {
            icon: "⏰",
            label: "Renewal Watch",
            value: expiringCount > 0 ? `${expiringCount} expiring in 90 days` : "No near-term expirations",
            sub: expiringCount > 0 ? "Review and renew before the coverage window closes." : "No imminent renewal deadlines.",
            tone: expiringCount > 0 ? "warning" : "good",
          },
          {
            icon: "⚠️",
            label: "Command Items",
            value: homeownersHubCommand.rows.length > 0 ? `${homeownersHubCommand.rows.length} need attention` : "No gaps detected",
            sub: homeownersHubCommand.rows.length > 0 ? homeownersHubCommand.rows[0]?.blocker || "See command center below." : "Coverage looks steady.",
            tone: homeownersHubCommand.rows.length > 0 ? "warning" : "good",
          },
        ].map((tile) => {
          const s = pillStyle(tile.tone);
          return (
            <div key={tile.label} style={{ ...surfaceCard(), display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: "22px" }}>{tile.icon}</span>
                <span style={{ ...s, fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "999px" }}>
                  {tile.tone === "good" ? "Good" : tile.tone === "warning" ? "Watch" : "Act"}
                </span>
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
        <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Coverage Readiness Checkpoints</div>
        <div style={{ display: "grid", gap: "10px" }}>
          {checkpoints.map((cp) => <ReadinessCheckpoint key={cp.label} {...cp} />)}
        </div>
      </div>

      {/* Command center */}
      {homeownersHubCommand.rows.length > 0 ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Protection Command Center</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Active gaps across household homeowners coverage.</div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {homeownersHubCommand.rows.map((item) => <CommandRow key={item.id} item={item} />)}
          </div>
        </div>
      ) : null}

      {/* Policy list */}
      <div ref={policiesRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Homeowners Policies</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
              {policies.length > 0 ? `${policies.length} polic${policies.length === 1 ? "y" : "ies"} — click to open detail` : "No policies recorded yet"}
            </div>
          </div>
          <ActionButton label="+ Add Policy" onClick={scrollToAddForm} primary />
        </div>

        {householdState.loading || loading ? (
          <div style={{ ...surfaceCard(), color: "#64748b", fontSize: "14px" }}>Loading homeowners policies...</div>
        ) : loadError ? (
          <div style={{ ...surfaceCard(), color: "#991b1b", fontSize: "14px" }}>{loadError}</div>
        ) : policies.length === 0 ? (
          <div style={{ ...surfaceCard() }}>
            <EmptyPoliciesPanel onScrollToForm={scrollToAddForm} />
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {policies.map((p) => <PolicyCard key={p.id} policy={p} onNavigate={onNavigate} />)}
          </div>
        )}
      </div>

      {/* Add policy form */}
      <div ref={addFormRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Add a Homeowners Policy</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Start with the basics — declarations, endorsements, and linked property can follow in the detail view.</div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            {showAddForm ? "Collapse" : "Expand Form"}
          </button>
        </div>

        {showAddForm ? (
          <div style={{ ...surfaceCard() }}>
            <form onSubmit={handleCreatePolicy} style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { key: "homeowners_policy_type_key", label: "Policy Type", isSelect: true, options: HOMEOWNERS_POLICY_TYPES.map((t) => ({ value: t.homeowners_policy_type_key, label: t.display_name })) },
                  { key: "policy_name", label: "Policy Name", placeholder: "e.g. Primary Home HO-3" },
                  { key: "named_insured", label: "Named Insured", placeholder: "Name on policy" },
                  { key: "property_address", label: "Property Address", placeholder: "Street address", fullWidth: true },
                  { key: "carrier_key", label: "Carrier", isSelect: true, options: [{ value: "", label: "No match yet" }, ...HOMEOWNERS_CARRIERS.map((c) => ({ value: c.carrier_key, label: c.display_name }))] },
                  { key: "policy_status", label: "Status", isSelect: true, options: ["active", "renewal_pending", "expired", "cancelled", "nonrenewed"].map((v) => ({ value: v, label: v })) },
                  { key: "effective_date", label: "Effective Date", type: "date" },
                  { key: "expiration_date", label: "Expiration Date", type: "date" },
                ].map((field) => (
                  <div key={field.key} style={field.fullWidth ? { gridColumn: "1 / -1" } : {}}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
                      {field.label}
                    </label>
                    {field.isSelect ? (
                      <select value={form[field.key]} onChange={(e) => setForm((c) => ({ ...c, [field.key]: e.target.value }))} style={inputStyle}>
                        {field.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.type || "text"}
                        value={form[field.key]}
                        onChange={(e) => setForm((c) => ({ ...c, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        style={inputStyle}
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={creating || !householdState.context.householdId}
                style={{ padding: "13px 20px", borderRadius: "10px", border: "none", background: creating ? "#94a3b8" : "#0f172a", color: "#ffffff", fontWeight: 800, fontSize: "15px", cursor: creating ? "default" : "pointer", marginTop: "4px" }}
              >
                {creating ? "Saving..." : "Save Homeowners Policy"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "13px" }}>{createError}</div> : null}
            </form>
          </div>
        ) : null}
      </div>

      {/* Why This Matters */}
      <div
        style={{
          background: "linear-gradient(135deg, #065f46 0%, #064e3b 50%, #0f172a 100%)",
          borderRadius: "22px",
          padding: "36px 32px",
          color: "#ffffff",
          display: "grid",
          gap: "28px",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6ee7b7" }}>
            Why This Module Matters
          </div>
          <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: "1.25" }}>
            A lapsed homeowners policy can trigger a lender-placed policy that costs 3–5× more and covers less.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {[
            {
              stat: "40%",
              label: "Of homeowners are underinsured by 20% or more",
              detail: "The coverage limit was set at purchase and hasn't kept up with rising replacement costs — a gap that only shows up at claim time.",
            },
            {
              stat: "$350B+",
              label: "In annual uninsured or underinsured property losses",
              detail: "Most of these losses come from households who thought they were covered — but faced exclusions, sublimits, or lapsed renewals.",
            },
            {
              stat: "14 days",
              label: "Average window before mortgage lender force-places coverage after a lapse",
              detail: "Lender-placed insurance is expensive and covers the structure — not the household's contents or liability.",
            },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#6ee7b7", marginBottom: "6px" }}>{item.stat}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "6px" }}>{item.label}</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "12px", lineHeight: "1.7" }}>
          Debug: household={householdState.context.householdId || "none"} | policies={policies.length} | loading={loading ? "yes" : "no"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
