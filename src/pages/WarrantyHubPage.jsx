import { useEffect, useMemo, useRef, useState } from "react";
import {
  getWarrantyType,
  listWarrantyProviders,
  listWarrantyTypes,
} from "../lib/domain/warranties";
import {
  createWarrantyAssetWithContract,
  listWarranties,
} from "../lib/supabase/warrantyData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { summarizeWarrantyModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

const WARRANTY_TYPES = listWarrantyTypes();
const WARRANTY_PROVIDERS = listWarrantyProviders();

const DEFAULT_FORM = {
  warranty_type_key: "warranty_generic",
  contract_name: "",
  covered_item_name: "",
  purchaser_name: "",
  provider_key: "",
  effective_date: "",
  expiration_date: "",
  contract_status: "active",
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

function ActionButton({ label, onClick, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "11px 18px",
        borderRadius: "10px",
        border: primary ? "none" : "1px solid #cbd5e1",
        background: primary ? "#0f172a" : "#ffffff",
        color: primary ? "#ffffff" : "#0f172a",
        fontWeight: 700,
        fontSize: "14px",
        cursor: "pointer",
        whiteSpace: "nowrap",
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
          {tone === "good" ? "Covered" : tone === "warning" ? "Partial" : "Missing"}
        </span>
      </div>
      <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>{detail}</div>
    </div>
  );
}

function WarrantyCard({ warranty, onNavigate }) {
  const warrantyType = getWarrantyType(warranty.warranty_type_key);
  const linkedAsset = warranty.assets || null;
  const name = warranty.contract_name || linkedAsset?.asset_name || warranty.covered_item_name || "Warranty Contract";
  const statusTone = warranty.contract_status === "active" ? "good" : warranty.contract_status === "expiring" ? "warning" : "alert";

  const daysLeft = (() => {
    if (!warranty.expiration_date) return null;
    const diff = new Date(warranty.expiration_date) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  })();

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(`/warranties/detail/${warranty.id}`)}
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
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{name}</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>
            {warrantyType?.display_name || warranty.warranty_type_key}
            {warranty.covered_item_name && warranty.covered_item_name !== name ? ` · ${warranty.covered_item_name}` : ""}
          </div>
        </div>
        <StatusPill label={warranty.contract_status || "unknown"} tone={statusTone} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
        {warranty.expiration_date ? (
          <div style={{ fontSize: "13px", color: daysLeft !== null && daysLeft < 90 ? "#92400e" : "#475569" }}>
            <span style={{ fontWeight: 700 }}>Expires:</span> {warranty.expiration_date}
            {daysLeft !== null && daysLeft < 90 && daysLeft > 0 ? ` (${daysLeft}d left)` : ""}
            {daysLeft !== null && daysLeft <= 0 ? " (expired)" : ""}
          </div>
        ) : (
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>Expiration date not recorded</div>
        )}
        {warranty.purchaser_name ? (
          <div style={{ fontSize: "13px", color: "#475569" }}>
            <span style={{ fontWeight: 700 }}>Purchaser:</span> {warranty.purchaser_name}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <StatusPill label={warrantyType?.major_category || "warranty"} tone="neutral" />
        <StatusPill
          label={linkedAsset?.id ? "Asset Linked" : "Asset Link Pending"}
          tone={linkedAsset?.id ? "good" : "warning"}
        />
      </div>
    </button>
  );
}

function EmptyWarrantiesPanel({ onNavigate, onScrollToForm }) {
  const categories = [
    { icon: "🏠", label: "Home Warranty", desc: "Systems, structure, or builder coverage" },
    { icon: "❄️", label: "HVAC / Appliance", desc: "Service contracts on key home systems" },
    { icon: "💻", label: "Electronics", desc: "Device protection or extended warranty" },
    { icon: "🚗", label: "Vehicle Service", desc: "Extended auto warranty or service plan" },
  ];
  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div style={{ fontSize: "15px", color: "#475569", lineHeight: "1.7" }}>
        Start with the coverage most likely to matter. A home warranty, HVAC contract, or appliance plan is enough to make this module useful.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
        {categories.map((c) => (
          <button
            key={c.label}
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
            <span style={{ fontSize: "22px" }}>{c.icon}</span>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{c.label}</div>
            <div style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.5" }}>{c.desc}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <ActionButton label="Add First Warranty" onClick={onScrollToForm} primary />
        <ActionButton label="Upload a Contract" onClick={() => onNavigate?.("/upload-center")} />
      </div>
    </div>
  );
}

function QuickAddForm({ form, setForm, creating, createError, householdState, onSubmit }) {
  const inputStyle = {
    padding: "11px 14px",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    fontSize: "14px",
    background: "#ffffff",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Warranty Type
          </label>
          <select
            value={form.warranty_type_key}
            onChange={(e) => setForm((c) => ({ ...c, warranty_type_key: e.target.value }))}
            style={inputStyle}
          >
            {WARRANTY_TYPES.map((type) => (
              <option key={type.warranty_type_key} value={type.warranty_type_key}>
                {type.display_name} — {type.major_category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Contract Name
          </label>
          <input
            value={form.contract_name}
            onChange={(e) => setForm((c) => ({ ...c, contract_name: e.target.value }))}
            placeholder="e.g. Home Warranty 2024"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Covered Item
          </label>
          <input
            value={form.covered_item_name}
            onChange={(e) => setForm((c) => ({ ...c, covered_item_name: e.target.value }))}
            placeholder="e.g. HVAC System"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Purchaser Name
          </label>
          <input
            value={form.purchaser_name}
            onChange={(e) => setForm((c) => ({ ...c, purchaser_name: e.target.value }))}
            placeholder="Name on contract"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Provider
          </label>
          <select
            value={form.provider_key}
            onChange={(e) => setForm((c) => ({ ...c, provider_key: e.target.value }))}
            style={inputStyle}
          >
            <option value="">No match yet</option>
            {WARRANTY_PROVIDERS.map((p) => (
              <option key={p.provider_key} value={p.provider_key}>{p.display_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Effective Date
          </label>
          <input
            type="date"
            value={form.effective_date}
            onChange={(e) => setForm((c) => ({ ...c, effective_date: e.target.value }))}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Expiration Date
          </label>
          <input
            type="date"
            value={form.expiration_date}
            onChange={(e) => setForm((c) => ({ ...c, expiration_date: e.target.value }))}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Status
          </label>
          <select
            value={form.contract_status}
            onChange={(e) => setForm((c) => ({ ...c, contract_status: e.target.value }))}
            style={inputStyle}
          >
            <option value="active">Active</option>
            <option value="expiring">Expiring Soon</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={creating || !householdState.context.householdId}
        style={{
          padding: "13px 20px",
          borderRadius: "10px",
          border: "none",
          background: creating ? "#94a3b8" : "#0f172a",
          color: "#ffffff",
          fontWeight: 800,
          fontSize: "15px",
          cursor: creating ? "default" : "pointer",
          marginTop: "4px",
        }}
      >
        {creating ? "Saving..." : "Save Warranty Contract"}
      </button>
      {createError ? <div style={{ color: "#991b1b", fontSize: "13px" }}>{createError}</div> : null}
    </form>
  );
}

export default function WarrantyHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const contractsRef = useRef(null);
  const addFormRef = useRef(null);

  const [warranties, setWarranties] = useState([]);
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
    async function loadWarranties() {
      setLoading(true);
      const result = await listWarranties(householdState.context.householdId);
      if (!active) return;
      setWarranties(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadWarranties();
    return () => { active = false; };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshWarranties() {
    if (!householdState.context.householdId) return;
    const result = await listWarranties(householdState.context.householdId);
    setWarranties(result.data || []);
    setLoadError(result.error?.message || "");
  }

  async function handleCreateWarranty(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.warranty_type_key) return;

    setCreating(true);
    setCreateError("");
    const result = await createWarrantyAssetWithContract({
      household_id: householdState.context.householdId,
      warranty_type_key: form.warranty_type_key,
      contract_name: form.contract_name,
      covered_item_name: form.covered_item_name,
      purchaser_name: form.purchaser_name,
      provider_key: form.provider_key || null,
      effective_date: form.effective_date || null,
      expiration_date: form.expiration_date || null,
      contract_status: form.contract_status,
    });

    if (result.error) {
      setCreateError(result.error.message || "Warranty contract could not be created.");
      setCreating(false);
      return;
    }

    await refreshWarranties();
    setForm(DEFAULT_FORM);
    setCreating(false);
    setShowAddForm(false);
  }

  const warrantyRead = useMemo(() => summarizeWarrantyModule(warranties), [warranties]);

  const { activeCount, expiringCount, missingExpirationCount } = useMemo(() => {
    const now = new Date();
    const active = warranties.filter((w) => w.contract_status === "active").length;
    const expiring = warranties.filter((w) => {
      if (!w.expiration_date) return false;
      const days = Math.ceil((new Date(w.expiration_date) - now) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= 90;
    }).length;
    const missingExp = warranties.filter((w) => !w.expiration_date).length;
    return { activeCount: active, expiringCount: expiring, missingExpirationCount: missingExp };
  }, [warranties]);

  const checkpoints = useMemo(() => {
    const hasCoverage = warranties.length > 0;
    const hasDates = missingExpirationCount === 0 && warranties.length > 0;
    const noGaps = expiringCount === 0;

    return [
      {
        icon: "📋",
        label: "Coverage Catalogued",
        status: hasCoverage ? "good" : "alert",
        detail: hasCoverage
          ? `${warranties.length} contract${warranties.length === 1 ? "" : "s"} tracked — ${activeCount} active.`
          : "No warranties logged yet. Start with the coverage most likely to be needed: home, HVAC, or appliances.",
      },
      {
        icon: "📅",
        label: "Expiration Dates Recorded",
        status: hasDates ? "good" : missingExpirationCount > 0 ? "warning" : "alert",
        detail: hasDates
          ? "All contracts have expiration dates — you'll see renewals coming before they sneak up."
          : `${missingExpirationCount} contract${missingExpirationCount === 1 ? "" : "s"} missing an expiration date. You can't renew what you don't see coming.`,
      },
      {
        icon: "🔍",
        label: "No Imminent Coverage Gaps",
        status: noGaps ? "good" : "warning",
        detail: expiringCount > 0
          ? `${expiringCount} contract${expiringCount === 1 ? "" : "s"} expiring within 90 days — review and renew before the window closes.`
          : "No contracts expiring within the next 90 days.",
      },
    ];
  }, [warranties, activeCount, expiringCount, missingExpirationCount]);

  function scrollToAddForm() {
    setShowAddForm(true);
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <div style={{ display: "grid", gap: "24px" }}>

      {/* Hero */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #164e63 100%)",
          borderRadius: "22px",
          padding: "32px 32px 28px",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#7dd3fc" }}>
            Protection Coverage
          </div>
          <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.15" }}>
            Warranty & Service Contracts
          </div>
          <div style={{ fontSize: "15px", color: "#cbd5e1", lineHeight: "1.6", maxWidth: "600px" }}>
            If something breaks tomorrow — which protections are still in force? This module keeps every coverage window visible so nothing expires quietly.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
          {[
            { label: "Total Contracts", value: loading ? "—" : warranties.length },
            { label: "Active", value: loading ? "—" : activeCount },
            { label: "Expiring Soon", value: loading ? "—" : expiringCount },
            { label: "Missing Dates", value: loading ? "—" : missingExpirationCount },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px", display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "22px", fontWeight: 900 }}>{stat.value}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton
            label={warranties.length > 0 ? "Add Another Contract" : "Add First Contract"}
            onClick={scrollToAddForm}
            primary
          />
          <ActionButton
            label="View All Contracts"
            onClick={() => contractsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        </div>
      </div>

      {/* Action tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            icon: "✅",
            label: "Active Coverage",
            value: `${activeCount} active contract${activeCount === 1 ? "" : "s"}`,
            sub: "Protections currently in force for the household.",
            tone: activeCount > 0 ? "good" : "alert",
          },
          {
            icon: "⏰",
            label: "Expiring Soon",
            value: expiringCount > 0 ? `${expiringCount} within 90 days` : "None expiring soon",
            sub: expiringCount > 0 ? "Review and renew before the window closes." : "No imminent coverage gaps detected.",
            tone: expiringCount > 0 ? "warning" : "good",
          },
          {
            icon: "📝",
            label: "Missing Dates",
            value: missingExpirationCount > 0 ? `${missingExpirationCount} contract${missingExpirationCount === 1 ? "" : "s"}` : "All dates recorded",
            sub: missingExpirationCount > 0 ? "Add expiration dates so renewals stay visible." : "Expiration visibility is complete.",
            tone: missingExpirationCount > 0 ? "warning" : "good",
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
          {checkpoints.map((cp) => (
            <ReadinessCheckpoint key={cp.label} {...cp} />
          ))}
        </div>
      </div>

      {/* Warranty contracts list */}
      <div ref={contractsRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>
              Warranty Contracts
            </div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
              {warranties.length > 0
                ? `${warranties.length} contract${warranties.length === 1 ? "" : "s"} on file — click any to open the detail view`
                : "No contracts recorded yet"}
            </div>
          </div>
          <ActionButton label="+ Add Contract" onClick={scrollToAddForm} primary />
        </div>

        {householdState.loading || loading ? (
          <div style={{ ...surfaceCard(), color: "#64748b", fontSize: "14px" }}>Loading warranty contracts...</div>
        ) : loadError ? (
          <div style={{ ...surfaceCard(), color: "#991b1b", fontSize: "14px" }}>{loadError}</div>
        ) : warranties.length === 0 ? (
          <div style={{ ...surfaceCard() }}>
            <EmptyWarrantiesPanel onNavigate={onNavigate} onScrollToForm={scrollToAddForm} />
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {warranties.map((w) => (
              <WarrantyCard key={w.id} warranty={w} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>

      {/* Add form — toggle */}
      <div ref={addFormRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Add a Warranty Contract</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Start with the basics — you can add documents and detail later.</div>
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
            <QuickAddForm
              form={form}
              setForm={setForm}
              creating={creating}
              createError={createError}
              householdState={householdState}
              onSubmit={handleCreateWarranty}
            />
          </div>
        ) : null}
      </div>

      {/* Why This Matters */}
      <div
        style={{
          background: "linear-gradient(135deg, #164e63 0%, #0c4a6e 50%, #0f172a 100%)",
          borderRadius: "22px",
          padding: "36px 32px",
          color: "#ffffff",
          display: "grid",
          gap: "28px",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#7dd3fc" }}>
            Why This Module Matters
          </div>
          <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: "1.25" }}>
            Coverage that expires quietly costs more than coverage that never existed.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {[
            {
              stat: "1 in 3",
              label: "Home warranties expire unnoticed",
              detail: "Most households don't track expiration — they discover the gap when they need to file a claim.",
            },
            {
              stat: "$3,500+",
              label: "Average uncovered HVAC repair",
              detail: "An expired service contract on a major system typically means full out-of-pocket cost at the worst time.",
            },
            {
              stat: "72%",
              label: "Extended warranties go unused — but the ones used are critical",
              detail: "The goal isn't to use every contract. It's to have the ones that matter when they're needed.",
            },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#7dd3fc", marginBottom: "6px" }}>{item.stat}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "6px" }}>{item.label}</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "12px", lineHeight: "1.7" }}>
          Debug: household={householdState.context.householdId || "none"} | warranties={warranties.length} | loading={loading ? "yes" : "no"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
