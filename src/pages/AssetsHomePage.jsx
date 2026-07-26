import { useEffect, useMemo, useRef, useState } from "react";
import { summarizeAssetsModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { createAsset, listAssets } from "../lib/supabase/platformData";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

const EMPTY_ASSETS = [];

const ASSET_CATEGORIES = [
  "insurance", "banking", "mortgage", "retirement", "warranty",
  "estate", "property", "health", "health_insurance", "auto_insurance",
  "business", "digital_asset", "misc",
];

const ASSET_SUBCATEGORY_OPTIONS = {
  insurance: ["life", "term", "whole_life", "iul", "annuity", "disability", "ltc"],
  banking: ["checking", "savings", "money_market", "cd", "brokerage_cash", "credit_union"],
  mortgage: ["primary_mortgage", "refinance", "heloc", "second_lien", "investment_property"],
  retirement: ["401k", "403b", "traditional_ira", "roth_ira", "pension", "sep_ira"],
  warranty: ["home_warranty", "appliance", "electronics", "vehicle_service", "service_contract"],
  estate: ["will", "trust", "power_of_attorney", "beneficiary_designation", "estate_note"],
  property: ["primary_residence", "investment_property", "vacation_home", "rental_unit", "land"],
  health: ["medical", "dental", "vision", "hsa", "fsa"],
  health_insurance: ["ppo", "hmo", "medicare", "marketplace", "supplemental"],
  auto_insurance: ["personal_auto", "commercial_auto", "motorcycle", "rv", "specialty_vehicle"],
  business: ["operating_business", "key_person", "buy_sell", "business_property", "commercial_policy"],
  digital_asset: ["crypto", "exchange_account", "hardware_wallet", "domain", "password_vault"],
  misc: ["general", "household_record", "safe_deposit", "other"],
};

function getAssetSubcategoryOptions(category) {
  return ASSET_SUBCATEGORY_OPTIONS[category] || ["general"];
}

function getDefaultAssetSubcategory(category) {
  return getAssetSubcategoryOptions(category)[0] || "general";
}

function formatAssetSubcategoryLabel(value) {
  return String(value || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function ActionButton({ label, onClick, primary = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 16px",
        borderRadius: "12px",
        border: primary ? "none" : "1px solid #e2e8f0",
        background: primary ? "#0f172a" : "#ffffff",
        color: primary ? "#ffffff" : "#0f172a",
        fontWeight: 700,
        fontSize: "13px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function EmptyAssetsPanel({ onNavigate }) {
  return (
    <div
      style={{
        padding: "36px 32px",
        borderRadius: "20px",
        background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
        border: "1px dashed #cbd5e1",
        display: "grid",
        gap: "20px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "40px" }}>📋</div>
      <div style={{ display: "grid", gap: "8px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>No assets in the household map yet</div>
        <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "480px", margin: "0 auto" }}>
          Start with one or two anchor records. A life insurance policy, primary residence, retirement account, or banking relationship gives VaultedShield enough structure to make the rest of the platform feel useful.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", maxWidth: "640px", margin: "0 auto", width: "100%" }}>
        {[
          { icon: "🛡️", label: "Life insurance" },
          { icon: "🏠", label: "Property / home" },
          { icon: "🏦", label: "Banking account" },
          { icon: "📈", label: "Retirement account" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              padding: "14px 12px",
              borderRadius: "14px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              fontSize: "13px",
              fontWeight: 700,
              color: "#334155",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
        <ActionButton label="Upload First Policy" primary onClick={() => onNavigate?.("/insurance/life/upload")} />
        <ActionButton label="Add Document" onClick={() => onNavigate?.("/upload-center")} />
      </div>
    </div>
  );
}

export default function AssetsHomePage({ onNavigate }) {
  const { householdState } = usePlatformShellData();
  const createAssetRef = useRef(null);
  const assetRegistryRef = useRef(null);
  const [assets, setAssets] = useState(EMPTY_ASSETS);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    asset_name: "",
    asset_category: "insurance",
    asset_subcategory: getDefaultAssetSubcategory("insurance"),
    institution_name: "",
    status: "active",
  });
  const assetSubcategoryOptions = useMemo(
    () => getAssetSubcategoryOptions(form.asset_category),
    [form.asset_category]
  );

  useEffect(() => {
    if (assetSubcategoryOptions.includes(form.asset_subcategory)) return;
    setForm((current) => ({
      ...current,
      asset_subcategory: getDefaultAssetSubcategory(current.asset_category),
    }));
  }, [assetSubcategoryOptions, form.asset_subcategory]);

  useEffect(() => {
    if (!householdState.context.householdId) {
      queueMicrotask(() => setAssets(EMPTY_ASSETS));
      return;
    }
    let active = true;
    async function loadAssets() {
      setLoading(true);
      const result = await listAssets(householdState.context.householdId);
      if (!active) return;
      setAssets(result.data || []);
      setSubmitError(result.error?.message || "");
      setLoading(false);
    }
    loadAssets();
    return () => { active = false; };
  }, [householdState.context.householdId]);

  async function handleCreateAsset(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.asset_name.trim()) return;
    setLoading(true);
    const result = await createAsset({
      household_id: householdState.context.householdId,
      ...form,
    });
    if (result.error) {
      setSubmitError(result.error.message || "Asset creation failed.");
      setLoading(false);
      return;
    }
    setAssets((current) => [result.data, ...current]);
    setForm({
      asset_name: "",
      asset_category: "insurance",
      asset_subcategory: getDefaultAssetSubcategory("insurance"),
      institution_name: "",
      status: "active",
    });
    setSubmitError("");
    setShowAddForm(false);
    setLoading(false);
  }

  const assetRead = useMemo(() => summarizeAssetsModule(assets), [assets]);
  const assetHeroScore = Math.round(
    assets.length > 0
      ? Math.min(88, 38 + assets.length * 4 + Number(assetRead.metrics.categories || 0) * 6)
      : 26
  );
  const scoreTone =
    assetHeroScore >= 80 ? "good" : assetHeroScore >= 60 ? "info" : assetHeroScore >= 44 ? "warning" : "alert";
  const scrollToAssetRegistry = () => assetRegistryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const openAddAssetForm = () => {
    setShowAddForm(true);
    setTimeout(() => createAssetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const handleTileAction = (action) => {
    if (action === "add_asset") {
      openAddAssetForm();
      return;
    }
    scrollToAssetRegistry();
  };

  return (
    <div style={{ display: "grid", gap: "28px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              Assets
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              {assets.length === 0
                ? "Build the household map without overthinking it"
                : assetRead.status === "Ready"
                  ? "Household map has enough structure to support the deeper tools"
                  : "Asset map is taking shape — a few basics are still missing"}
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "560px" }}>
              {assets.length === 0
                ? "Start with a few real-world things you already know. One or two anchor records are enough to make the platform feel useful."
                : assetRead.headline}
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
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#93c5fd" }}>{assetHeroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>map score</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[
            { label: "Tracked Assets", value: assets.length || "None" },
            { label: "Categories", value: assetRead.metrics.categories || "None" },
            { label: "Active", value: assetRead.metrics.active || 0 },
            { label: "Missing Institution", value: assetRead.metrics.missingInstitution || 0 },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#bfdbfe" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={openAddAssetForm}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#ffffff", color: "#0f172a", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            {assets.length > 0 ? "Add Another Asset" : "Add First Asset"}
          </button>
          <button
            type="button"
            onClick={scrollToAssetRegistry}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            See Registry
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Map Readiness",
            title: assetRead.status === "Ready" ? "Asset map has solid structure" : "Asset map needs anchor records",
            detail: assetRead.headline,
            metric: `${assets.length} asset${assets.length === 1 ? "" : "s"} tracked`,
            tone: scoreTone,
            statusLabel: assetRead.status,
            actionLabel: "See Readiness",
            action: "registry",
          },
          {
            kicker: "Best First Step",
            title: assets.length === 0 ? "Start with insurance, banking, or property" : "Fill the most visible gaps",
            detail: assets.length === 0
              ? "One or two anchor assets make the entire platform easier to navigate and trust."
              : "The fastest wins usually come from adding the categories or institution names still missing.",
            metric: `${assetRead.metrics.categories || 0} categor${assetRead.metrics.categories === 1 ? "y" : "ies"} covered`,
            tone: "warning",
            statusLabel: "Guided Focus",
            actionLabel: assets.length > 0 ? "Add Asset" : "Get Started",
            action: "add_asset",
          },
          {
            kicker: "What Can Wait",
            title: "Detailed tagging comes after the basics",
            detail: "You only need enough records here for VaultedShield to understand the shape of the household. Technical detail can follow once the basics are visible.",
            metric: `${assetRead.metrics.missingInstitution || 0} missing institution${assetRead.metrics.missingInstitution === 1 ? "" : "s"}`,
            tone: "info",
            statusLabel: "Building",
            actionLabel: "Open Registry",
            action: "registry",
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
            <button type="button" onClick={() => handleTileAction(tile.action)} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer", textAlign: "left" }}>
              {tile.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {/* Add Asset Form */}
      <div ref={createAssetRef} style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "16px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#1e3a5f", textTransform: "uppercase", letterSpacing: "0.1em" }}>Asset Registry</div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Add a Household Asset</div>
            <div style={{ color: "#64748b", lineHeight: "1.6" }}>Create a simple household record first. You can deepen the details later.</div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            style={{
              padding: "10px 16px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              background: showAddForm ? "#0f172a" : "#f8fafc",
              color: showAddForm ? "#ffffff" : "#0f172a",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {showAddForm ? "Cancel" : "Add Asset"}
          </button>
        </div>

        {showAddForm ? (
          <form onSubmit={handleCreateAsset} style={{ display: "grid", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Asset name</span>
                <input
                  value={form.asset_name}
                  onChange={(event) => setForm((current) => ({ ...current, asset_name: event.target.value }))}
                  placeholder="e.g. Term Life Policy — State Farm"
                  style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Institution name</span>
                <input
                  value={form.institution_name}
                  onChange={(event) => setForm((current) => ({ ...current, institution_name: event.target.value }))}
                  placeholder="e.g. State Farm, Chase, Fidelity"
                  style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Category</span>
                <select
                  value={form.asset_category}
                  onChange={(event) => {
                    const nextCategory = event.target.value;
                    setForm((current) => ({
                      ...current,
                      asset_category: nextCategory,
                      asset_subcategory: getDefaultAssetSubcategory(nextCategory),
                    }));
                  }}
                  style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "14px" }}
                >
                  {ASSET_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{formatAssetSubcategoryLabel(category)}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Type</span>
                <select
                  key={form.asset_category}
                  value={form.asset_subcategory}
                  onChange={(event) => setForm((current) => ({ ...current, asset_subcategory: event.target.value }))}
                  style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "14px" }}
                >
                  {assetSubcategoryOptions.map((subcategory) => (
                    <option key={subcategory} value={subcategory}>{formatAssetSubcategoryLabel(subcategory)}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "14px" }}
                >
                  <option value="active">Active</option>
                  <option value="watch">Watch</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            {submitError ? (
              <div style={{ padding: "12px 16px", borderRadius: "10px", background: "#fee2e2", border: "1px solid #fecaca", color: "#991b1b", fontSize: "14px" }}>
                {submitError}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="submit"
                disabled={loading || !householdState.context.householdId}
                style={{ padding: "12px 20px", borderRadius: "12px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: "14px", opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Saving..." : "Add Asset"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                style={{ padding: "12px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Asset Registry */}
      <div ref={assetRegistryRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Household Asset Registry</div>
            <div style={{ color: "#64748b", marginTop: "4px", lineHeight: "1.6" }}>
              {assets.length > 0
                ? `${assets.length} asset${assets.length === 1 ? "" : "s"} shaping your household map.`
                : "No assets yet — add the first record above."}
            </div>
          </div>
          {assets.length > 0 ? (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ ...pillStyle(assetRead.status === "Ready" ? "good" : "warning"), padding: "5px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 800 }}>
                {assetRead.status}
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", alignSelf: "center" }}>
                {assetRead.metrics.categories} categor{assetRead.metrics.categories === 1 ? "y" : "ies"}
              </div>
            </div>
          ) : null}
        </div>

        {loading && assets.length === 0 ? (
          <div style={{ padding: "24px", color: "#64748b", textAlign: "center" }}>Loading asset records...</div>
        ) : assets.length === 0 ? (
          <EmptyAssetsPanel onNavigate={onNavigate} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
            {assets.map((asset) => (
              <div
                key={asset.id}
                style={{
                  padding: "18px 20px",
                  borderRadius: "18px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ display: "grid", gap: "3px", minWidth: 0 }}>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{asset.asset_name}</div>
                    <div style={{ fontSize: "13px", color: "#64748b" }}>
                      {formatAssetSubcategoryLabel(asset.asset_category)}
                      {asset.asset_subcategory ? ` / ${formatAssetSubcategoryLabel(asset.asset_subcategory)}` : ""}
                    </div>
                  </div>
                  <div style={{ ...pillStyle(asset.status === "active" ? "good" : asset.status === "watch" ? "warning" : "neutral"), padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {asset.status || "active"}
                  </div>
                </div>
                <div style={{ fontSize: "13px", color: "#475569" }}>
                  {asset.institution_name || "No institution recorded"}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate?.(`/assets/detail/${asset.id}`)}
                  style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontWeight: 700, fontSize: "13px", color: "#0f172a", textAlign: "left" }}
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        )}

        {assets.length > 0 && assetRead.notes.length > 0 ? (
          <div style={{ padding: "16px 18px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Map Readiness Notes</div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px", color: "#64748b", fontSize: "13px" }}>
              {assetRead.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        ) : null}
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "13px", lineHeight: "1.7" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Assets: {assets.length}
        </div>
      ) : null}
    </div>
  );
}
