import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import { summarizeAssetsModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { createAsset, listAssets } from "../lib/supabase/platformData";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

const EMPTY_ASSETS = [];

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
  const { isTablet } = useResponsiveLayout();
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
      queueMicrotask(() => {
        setAssets(EMPTY_ASSETS);
      });
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

  const assetRead = useMemo(() => summarizeAssetsModule(assets), [assets]);
  const topRailLayout = isTablet ? "1fr" : "1.35fr 1fr";
  const contentRailLayout = isTablet ? "1fr" : "1fr 1.25fr";

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title="Household Asset Map"
        description="Track the core accounts, policies, properties, and records that make up the household so the rest of VaultedShield has real structure to work from."
      />
      <SummaryPanel
        items={[
          { label: "Working Household", value: householdState.household?.household_name || "Loading", helper: "Current platform context" },
          { label: "Tracked Assets", value: assets.length, helper: "Visible household asset records" },
          { label: "Insurance Assets", value: assets.filter((item) => item.asset_category === "insurance").length, helper: "Policies and insurance-linked records" },
          { label: "Active Assets", value: assets.filter((item) => item.status === "active").length, helper: "Current active records" },
          { label: "Readiness", value: assetRead.status, helper: "How usable the household asset map looks right now" },
        ]}
      />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: topRailLayout, gap: "18px" }}>
        <SectionCard title="Asset Map Readiness">
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{assetRead.headline}</div>
              <StatusBadge label={assetRead.status} tone={assetRead.status === "Ready" ? "good" : assetRead.status === "Building" ? "warning" : "alert"} />
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
              {assetRead.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Coverage Metrics">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Categories represented:</strong> {assetRead.metrics.categories}</div>
            <div><strong>Missing institution:</strong> {assetRead.metrics.missingInstitution}</div>
            <div><strong>Active assets:</strong> {assetRead.metrics.active}</div>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: contentRailLayout, gap: "18px" }}>
        <SectionCard title="Add Asset" subtitle="Create a simple household record first. You can deepen the details later.">
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
              placeholder="Type or subtype"
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

        <SectionCard title="Household Asset Registry" subtitle="The current records shaping your household map.">
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
              description="Add the first policy, account, property, or household record to start building a usable asset map."
            >
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ color: "#475569", fontSize: "14px", lineHeight: "1.7" }}>
                  Strong first records for a demo household:
                </div>
                <div style={{ display: "grid", gap: "8px", color: "#64748b", fontSize: "14px" }}>
                  <div>Life insurance policy</div>
                  <div>Primary residence or property</div>
                  <div>Retirement account or banking relationship</div>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("/insurance/life/upload")}
                    style={{ padding: "10px 14px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                  >
                    Upload First Policy
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("/upload-center")}
                    style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700 }}
                  >
                    Add Household Document
                  </button>
                </div>
              </div>
            </EmptyState>
          )}
        </SectionCard>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Assets: {assets.length}
        </div>
      ) : null}
    </div>
  );
}
