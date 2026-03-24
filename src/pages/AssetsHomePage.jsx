import { useEffect, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { createAsset, listAssets } from "../lib/supabase/platformData";

const ASSET_CATEGORIES = [
  "insurance",
  "banking",
  "mortgage",
  "retirement",
  "warranty",
  "estate",
  "property",
  "health",
  "health_insurance",
  "auto_insurance",
  "business",
  "digital_asset",
  "misc",
];

export default function AssetsHomePage({ onNavigate }) {
  const { householdState } = usePlatformShellData();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [form, setForm] = useState({
    asset_name: "",
    asset_category: "insurance",
    asset_subcategory: "life",
    institution_name: "",
    status: "active",
  });

  useEffect(() => {
    if (!householdState.context.householdId) {
      setAssets([]);
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
    return () => {
      active = false;
    };
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
      asset_subcategory: "life",
      institution_name: "",
      status: "active",
    });
    setSubmitError("");
    setLoading(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title="Household Asset Modules"
        description="The asset shell now reads and writes live household assets while the deep life-policy workflow stays preserved under Insurance > Life."
      />
      <SummaryPanel
        items={[
          { label: "Working Household", value: householdState.household?.household_name || "Loading", helper: "Current platform context" },
          { label: "Tracked Assets", value: assets.length, helper: "Live generic asset records" },
          { label: "Insurance Assets", value: assets.filter((item) => item.asset_category === "insurance").length, helper: "Generic insurance asset shells" },
          { label: "Active Assets", value: assets.filter((item) => item.status === "active").length, helper: "Current active records" },
        ]}
      />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: "18px" }}>
        <SectionCard title="Add Asset" subtitle="Minimal create flow for the broad household asset registry.">
          <form onSubmit={handleCreateAsset} style={{ display: "grid", gap: "12px" }}>
            <input
              value={form.asset_name}
              onChange={(event) => setForm((current) => ({ ...current, asset_name: event.target.value }))}
              placeholder="Asset name"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <select
              value={form.asset_category}
              onChange={(event) => setForm((current) => ({ ...current, asset_category: event.target.value }))}
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              {ASSET_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <input
              value={form.asset_subcategory}
              onChange={(event) => setForm((current) => ({ ...current, asset_subcategory: event.target.value }))}
              placeholder="Subcategory"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <input
              value={form.institution_name}
              onChange={(event) => setForm((current) => ({ ...current, institution_name: event.target.value }))}
              placeholder="Institution name"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              <option value="active">active</option>
              <option value="watch">watch</option>
              <option value="inactive">inactive</option>
            </select>
            <button
              type="submit"
              disabled={loading || !householdState.context.householdId}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              {loading ? "Saving..." : "Add Asset"}
            </button>
            {submitError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{submitError}</div> : null}
          </form>
        </SectionCard>

        <SectionCard title="Live Asset Registry" subtitle="Current household assets from the broad platform schema.">
          {assets.length > 0 ? (
            <div style={{ display: "grid", gap: "14px" }}>
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "18px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{asset.asset_name}</div>
                      <div style={{ marginTop: "4px", color: "#64748b", fontSize: "13px" }}>
                        {asset.asset_category}{asset.asset_subcategory ? ` / ${asset.asset_subcategory}` : ""}
                      </div>
                    </div>
                    <div style={{ color: "#1d4ed8", fontWeight: 700 }}>{asset.status || "active"}</div>
                  </div>
                  <div style={{ marginTop: "12px", color: "#475569", lineHeight: "1.6" }}>
                    {asset.institution_name || "No institution recorded yet."}
                  </div>
                  <button
                    onClick={() => onNavigate(`/assets/detail/${asset.id}`)}
                    style={{
                      marginTop: "14px",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    View Details
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No assets yet"
              description="Add the first insurance, banking, retirement, estate, or household asset to activate the broader platform shell."
            />
          )}
        </SectionCard>
      </div>

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Assets: {assets.length}
        </div>
      ) : null}
    </div>
  );
}
