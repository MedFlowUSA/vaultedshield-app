import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
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

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "expiring" || status === "review") return "warning";
  return "info";
}

export default function WarrantyHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      setLoading(false);
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
    return () => {
      active = false;
    };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshWarranties() {
    if (!householdState.context.householdId) return;
    const result = await listWarranties(householdState.context.householdId);
    setWarranties(result.data || []);
    setLoadError(result.error?.message || "");
  }

  const summaryItems = useMemo(() => {
    const activeCount = warranties.filter((item) => item.contract_status === "active").length;
    const homeRelatedCount = warranties.filter((item) => {
      const warrantyType = getWarrantyType(item.warranty_type_key);
      return Boolean(warrantyType?.home_related_reference);
    }).length;
    const electronicsCount = warranties.filter((item) => {
      const warrantyType = getWarrantyType(item.warranty_type_key);
      return Boolean(warrantyType?.electronics_related_reference);
    }).length;
    const vehicleCount = warranties.filter((item) => {
      const warrantyType = getWarrantyType(item.warranty_type_key);
      return Boolean(warrantyType?.vehicle_related_reference);
    }).length;

    return [
      { label: "Warranties", value: warranties.length, helper: "Live warranty and service-contract records" },
      { label: "Home Related", value: homeRelatedCount, helper: "Home systems, roof, solar, and builder coverage" },
      { label: "Electronics / Specialty", value: electronicsCount + vehicleCount, helper: "Electronics, specialty, and vehicle-related references" },
      { label: "Active", value: activeCount, helper: `${warranties.length - activeCount} non-active records` },
    ];
  }, [warranties]);

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
  }

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title="Warranty Hub"
        description="Live warranty and service-contract registry for item continuity, contract intake, expiration tracking, and future warranty parsing."
        actions={
          <button
            onClick={() => refreshWarranties()}
            style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Refresh Warranty Data
          </button>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Warranty Contracts" subtitle="Live household warranty and service-contract records linked into the broader platform asset layer.">
          {householdState.loading || loading ? (
            <div style={{ color: "#64748b" }}>Loading warranty contracts...</div>
          ) : loadError ? (
            <EmptyState title="Warranty data unavailable" description={loadError} />
          ) : warranties.length === 0 ? (
            <EmptyState
              title="No warranties yet"
              description="Create the first warranty or service contract to activate the module and prepare it for document intake, snapshots, analytics placeholders, and later warranty parsing."
            />
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {warranties.map((warranty) => {
                const warrantyType = getWarrantyType(warranty.warranty_type_key);
                const linkedAsset = warranty.assets || null;
                return (
                  <button
                    key={warranty.id}
                    onClick={() => onNavigate(`/warranties/detail/${warranty.id}`)}
                    style={{ textAlign: "left", width: "100%", border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "14px", padding: "16px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                          {warranty.contract_name || linkedAsset?.asset_name || warranty.covered_item_name || "Warranty Contract"}
                        </div>
                        <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6" }}>
                          {warrantyType?.display_name || warranty.warranty_type_key}
                          {" | "}
                          {linkedAsset?.institution_name || warranty.provider_key || "Provider pending"}
                        </div>
                      </div>
                      <StatusBadge label={warranty.contract_status || "unknown"} tone={getStatusTone(warranty.contract_status)} />
                    </div>

                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <StatusBadge label={warrantyType?.major_category || "warranty"} tone="info" />
                      <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
                    </div>

                    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", color: "#475569" }}>
                      <div><strong>Covered Item:</strong> {warranty.covered_item_name || "Limited visibility"}</div>
                      <div><strong>Purchaser:</strong> {warranty.purchaser_name || "Limited visibility"}</div>
                      <div><strong>Effective:</strong> {warranty.effective_date || "Limited visibility"}</div>
                      <div><strong>Expiration:</strong> {warranty.expiration_date || "Limited visibility"}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div style={{ display: "grid", gap: "18px" }}>
          <SectionCard title="Create Warranty Contract" subtitle="Minimal live create flow that writes both the generic asset row and the linked warranty row.">
            <form onSubmit={handleCreateWarranty} style={{ display: "grid", gap: "12px" }}>
              <select value={form.warranty_type_key} onChange={(event) => setForm((current) => ({ ...current, warranty_type_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                {WARRANTY_TYPES.map((type) => (
                  <option key={type.warranty_type_key} value={type.warranty_type_key}>
                    {type.display_name} | {type.major_category}
                  </option>
                ))}
              </select>
              <input value={form.contract_name} onChange={(event) => setForm((current) => ({ ...current, contract_name: event.target.value }))} placeholder="Contract name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.covered_item_name} onChange={(event) => setForm((current) => ({ ...current, covered_item_name: event.target.value }))} placeholder="Covered item name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.purchaser_name} onChange={(event) => setForm((current) => ({ ...current, purchaser_name: event.target.value }))} placeholder="Purchaser name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.provider_key} onChange={(event) => setForm((current) => ({ ...current, provider_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="">No provider registry match yet</option>
                {WARRANTY_PROVIDERS.map((provider) => (
                  <option key={provider.provider_key} value={provider.provider_key}>
                    {provider.display_name}
                  </option>
                ))}
              </select>
              <input type="date" value={form.effective_date} onChange={(event) => setForm((current) => ({ ...current, effective_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input type="date" value={form.expiration_date} onChange={(event) => setForm((current) => ({ ...current, expiration_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.contract_status} onChange={(event) => setForm((current) => ({ ...current, contract_status: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="active">active</option>
                <option value="expiring">expiring</option>
                <option value="inactive">inactive</option>
                <option value="expired">expired</option>
              </select>
              <button type="submit" disabled={creating || !householdState.context.householdId} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                {creating ? "Creating Warranty..." : "Create Warranty"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{createError}</div> : null}
              {householdState.error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{householdState.error}</div> : null}
            </form>
          </SectionCard>

          <SectionCard title="Warranty Readiness">
            <AIInsightPanel
              title="Foundation Readiness"
              summary={
                warranties.length > 0
                  ? "Warranty and service-contract records are now live in the platform shell and ready for document intake, snapshots, analytics placeholders, and later warranty parsing."
                  : "The warranty module is live-ready but still waiting for its first contract record."
              }
              bullets={[
                "Warranty creation now writes both the generic asset row and the deep warranty contract row.",
                "Warranty detail pages are ready for linked documents, snapshots, analytics placeholders, and platform continuity context.",
              ]}
            />
          </SectionCard>
        </div>
      </div>

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Warranty Debug: household={householdState.context.householdId || "none"} | warranties={warranties.length} | loading={loading ? "yes" : "no"} | loadError={loadError || "none"} | createError={createError || "none"}
        </div>
      ) : null}
    </div>
  );
}
