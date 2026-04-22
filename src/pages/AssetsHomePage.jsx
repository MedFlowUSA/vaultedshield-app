import { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import PlainLanguageBridge from "../components/shared/PlainLanguageBridge";
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

export default function AssetsHomePage({ onNavigate }) {
  const { isTablet } = useResponsiveLayout();
  const { householdState } = usePlatformShellData();
  const assetReadinessRef = useRef(null);
  const createAssetRef = useRef(null);
  const assetRegistryRef = useRef(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
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
      asset_subcategory: getDefaultAssetSubcategory("insurance"),
      institution_name: "",
      status: "active",
    });
    setSubmitError("");
    setLoading(false);
  }

  const assetRead = useMemo(() => summarizeAssetsModule(assets), [assets]);
  const topRailLayout = isTablet ? "1fr" : "1.35fr 1fr";
  const contentRailLayout = isTablet ? "1fr" : "1fr 1.25fr";
  const assetPlainLanguageGuide = useMemo(() => {
    const householdName = householdState.household?.household_name || "this household";
    const isEmpty = assets.length === 0;

    return {
      title: "Build the household map without overthinking it",
      summary: isEmpty
        ? "Start with a few real-world things you already know, not a perfect inventory."
        : assetRead.status === "Ready"
          ? "Your household map already has enough structure to support the deeper tools across the app."
          : "The household map is taking shape, and a few missing basics are the main reason the rest of the app can still feel more technical than it needs to.",
      transition: `This page gives ${householdName} a simple backbone. Once the core assets exist here, the deeper insurance, mortgage, retirement, and continuity reads stop feeling abstract and start feeling useful.`,
      quickFacts: [
        `${assets.length} household asset${assets.length === 1 ? "" : "s"} are currently tracked.`,
        `${assetRead.metrics.categories || 0} asset categor${assetRead.metrics.categories === 1 ? "y is" : "ies are"} represented so far.`,
        `${assetRead.metrics.missingInstitution || 0} asset${assetRead.metrics.missingInstitution === 1 ? "" : "s"} still need an institution name to feel fully grounded.`,
      ],
      cards: [
        {
          label: "What This Page Does",
          value: "Turns a pile of life admin into a usable household map",
          detail: "You only need enough records here for VaultedShield to understand the shape of the household.",
        },
        {
          label: "Best First Records",
          value: isEmpty ? "Start with insurance, banking, property, or retirement" : "Fill the obvious gaps first",
          detail: isEmpty
            ? "One or two anchor assets are enough to make the platform feel much easier to navigate."
            : "The fastest wins usually come from adding the categories or institution names that are still missing.",
        },
        {
          label: "What Can Wait",
          value: "Detailed tagging and edge cases come later",
          detail: "The point of this page is to create a clean starting map first. The technical detail can follow once the basics are visible.",
        },
      ],
    };
  }, [assetRead, assets.length, householdState.household?.household_name]);

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title="Household Asset Map"
        description="Start with the core things this household owns or relies on. The deeper analysis can come after the basic map feels right."
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

      <PlainLanguageBridge
        eyebrow="Start Here"
        title={assetPlainLanguageGuide.title}
        summary={assetPlainLanguageGuide.summary}
        transition={assetPlainLanguageGuide.transition}
        quickFacts={assetPlainLanguageGuide.quickFacts}
        cards={assetPlainLanguageGuide.cards}
        primaryActionLabel={assets.length > 0 ? "Add Another Asset" : "Add First Asset"}
        onPrimaryAction={() => createAssetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        secondaryActionLabel={assets.length > 0 ? "See Asset Registry" : "See Readiness Snapshot"}
        onSecondaryAction={() =>
          (assets.length > 0 ? assetRegistryRef.current : assetReadinessRef.current)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }
        compact={isTablet}
        showAnalysisDivider={false}
      />

      <div ref={assetReadinessRef} style={{ marginTop: "24px", display: "grid", gridTemplateColumns: topRailLayout, gap: "18px" }}>
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
        <div ref={createAssetRef}>
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
              onChange={(event) => {
                const nextCategory = event.target.value;
                setForm((current) => ({
                  ...current,
                  asset_category: nextCategory,
                  asset_subcategory: getDefaultAssetSubcategory(nextCategory),
                }));
              }}
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              {ASSET_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select
              key={form.asset_category}
              value={form.asset_subcategory}
              onChange={(event) => setForm((current) => ({ ...current, asset_subcategory: event.target.value }))}
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              {assetSubcategoryOptions.map((subcategory) => (
                <option key={subcategory} value={subcategory}>
                  {formatAssetSubcategoryLabel(subcategory)}
                </option>
              ))}
            </select>
            <div style={{ color: "#64748b", fontSize: "13px", lineHeight: "1.6" }}>
              Type suggestions update automatically when you switch categories so the new record starts in the right module lane.
            </div>
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
        </div>

        <div ref={assetRegistryRef}>
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
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px" }}>
          Household Debug: {householdState.context.householdId || "none"} | Source: {householdState.context.source} | Assets: {assets.length}
        </div>
      ) : null}
    </div>
  );
}
