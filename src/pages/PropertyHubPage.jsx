import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  getPropertyType,
  listPropertyTypes,
} from "../lib/domain/property";
import {
  createPropertyWithDependencies,
  listProperties,
} from "../lib/supabase/propertyData";

const PROPERTY_TYPES = listPropertyTypes();

const DEFAULT_FORM = {
  property_type_key: "property_generic",
  property_name: "",
  property_address: "",
  county: "",
  occupancy_type: "",
  owner_name: "",
  purchase_date: "",
  property_status: "active",
};

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "watch" || status === "review") return "warning";
  return "info";
}

export default function PropertyHubPage({ onNavigate }) {
  const { householdState } = usePlatformShellData();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const canCreateProperty =
    Boolean(householdState.context.currentAuthUserId) && !householdState.loading;

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      setProperties([]);
      setLoadError("");
      setLoading(false);
      return;
    }

    let active = true;
    async function loadPropertyRecords() {
      setLoading(true);
      const result = await listProperties(householdState.context.householdId);
      if (!active) return;
      setProperties(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadPropertyRecords();
    return () => {
      active = false;
    };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshPropertyRecords(targetHouseholdId = householdState.context.householdId) {
    if (!targetHouseholdId) return;
    const result = await listProperties(targetHouseholdId);
    setProperties(result.data || []);
    setLoadError(result.error?.message || "");
  }

  const summaryItems = useMemo(() => {
    const activeCount = properties.filter((item) => item.property_status === "active").length;
    const ownerOccupiedCount = properties.filter((item) => {
      const propertyType = getPropertyType(item.property_type_key);
      return propertyType?.major_category === "owner_occupied" || propertyType?.major_category === "attached_residential";
    }).length;
    const investmentCount = properties.filter((item) => {
      const propertyType = getPropertyType(item.property_type_key);
      return Boolean(propertyType?.investment_property_relevant);
    }).length;

    return [
      { label: "Properties", value: properties.length, helper: "Live property module records" },
      { label: "Owner Occupied", value: ownerOccupiedCount, helper: "Primary and attached residential property records" },
      { label: "Investment / Rental", value: investmentCount, helper: "Investment and rental-oriented property records" },
      { label: "Active", value: activeCount, helper: `${properties.length - activeCount} non-active records` },
    ];
  }, [properties]);

  async function handleCreateProperty(event) {
    event.preventDefault();
    if (creating) return;
    if (!canCreateProperty || !form.property_type_key) {
      if (!householdState.context.currentAuthUserId) {
        setCreateError("Please sign in again before creating a property.");
      }
      if (import.meta.env.DEV && !canCreateProperty) {
        console.warn("[VaultedShield] property creation attempted before household ownership was resolved in the UI.", {
          householdId: householdState.context.householdId || null,
          ownershipMode: householdState.context.ownershipMode || "unknown",
        });
      }
      return;
    }

    setCreating(true);
    setCreateError("");
    const result = await createPropertyWithDependencies({
      household_id: householdState.context.householdId || null,
      property_type_key: form.property_type_key,
      property_name: form.property_name,
      property_address: form.property_address,
      county: form.county,
      occupancy_type: form.occupancy_type,
      owner_name: form.owner_name,
      purchase_date: form.purchase_date || null,
      property_status: form.property_status,
    });

    if (result.error) {
      if (import.meta.env.DEV) {
        console.warn("[VaultedShield] property creation failed in PropertyHubPage", {
          error: result.error.message || null,
          householdId: householdState.context.householdId || null,
          authUserId: householdState.context.currentAuthUserId || null,
        });
      }
      setCreateError(result.error.message || "We could not create this property record yet. Please try again.");
      setCreating(false);
      return;
    }

    await refreshPropertyRecords(result.data?.householdId || householdState.context.householdId);
    setForm(DEFAULT_FORM);
    setCreating(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title="Property Hub"
        description="Live property registry for household real estate records, tax and title intake, and future linkage to mortgage, homeowners, and property intelligence."
        actions={
          <button
            onClick={() => refreshPropertyRecords()}
            style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Refresh Property Data
          </button>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Properties" subtitle="Live household property records linked into the broader platform asset layer.">
          {householdState.loading || loading ? (
            <div style={{ color: "#64748b" }}>Loading property records...</div>
          ) : loadError ? (
            <EmptyState title="Property data unavailable" description={loadError} />
          ) : properties.length === 0 ? (
            <EmptyState
              title="No properties yet"
              description="Create the first property record to activate the module and prepare it for tax, title, deed, snapshot, and later cross-module linkage work."
            />
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {properties.map((property) => {
                const propertyType = getPropertyType(property.property_type_key);
                const linkedAsset = property.assets || null;
                return (
                  <button
                    key={property.id}
                    onClick={() => onNavigate(`/property/detail/${property.id}`)}
                    style={{ textAlign: "left", width: "100%", border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "14px", padding: "16px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                          {property.property_name || linkedAsset?.asset_name || property.property_address || "Property"}
                        </div>
                        <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6" }}>
                          {propertyType?.display_name || property.property_type_key}
                          {" | "}
                          {property.county || linkedAsset?.institution_name || "County pending"}
                        </div>
                      </div>
                      <StatusBadge label={property.property_status || "unknown"} tone={getStatusTone(property.property_status)} />
                    </div>

                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <StatusBadge label={propertyType?.major_category || "property"} tone="info" />
                      <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
                    </div>

                    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", color: "#475569" }}>
                      <div><strong>Address:</strong> {property.property_address || "Limited visibility"}</div>
                      <div><strong>Owner:</strong> {property.owner_name || "Limited visibility"}</div>
                      <div><strong>Occupancy:</strong> {property.occupancy_type || "Limited visibility"}</div>
                      <div><strong>Purchased:</strong> {property.purchase_date || "Limited visibility"}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div style={{ display: "grid", gap: "18px" }}>
          <SectionCard title="Create Property" subtitle="Minimal live create flow that writes both the generic asset row and the linked property row.">
            <form onSubmit={handleCreateProperty} style={{ display: "grid", gap: "12px" }}>
              <select value={form.property_type_key} onChange={(event) => setForm((current) => ({ ...current, property_type_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                {PROPERTY_TYPES.map((type) => (
                  <option key={type.property_type_key} value={type.property_type_key}>
                    {type.display_name} | {type.major_category}
                  </option>
                ))}
              </select>
              <input value={form.property_name} onChange={(event) => setForm((current) => ({ ...current, property_name: event.target.value }))} placeholder="Property name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.property_address} onChange={(event) => setForm((current) => ({ ...current, property_address: event.target.value }))} placeholder="Property address" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.county} onChange={(event) => setForm((current) => ({ ...current, county: event.target.value }))} placeholder="County" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.occupancy_type} onChange={(event) => setForm((current) => ({ ...current, occupancy_type: event.target.value }))} placeholder="Occupancy type" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.owner_name} onChange={(event) => setForm((current) => ({ ...current, owner_name: event.target.value }))} placeholder="Owner name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input type="date" value={form.purchase_date} onChange={(event) => setForm((current) => ({ ...current, purchase_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.property_status} onChange={(event) => setForm((current) => ({ ...current, property_status: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="active">active</option>
                <option value="watch">watch</option>
                <option value="inactive">inactive</option>
                <option value="sold">sold</option>
              </select>
              <button type="submit" disabled={creating || !canCreateProperty} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: creating || !canCreateProperty ? "not-allowed" : "pointer", fontWeight: 700, opacity: creating || !canCreateProperty ? 0.7 : 1 }}>
                {creating ? "Creating Property..." : "Create Property"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{createError}</div> : null}
              {householdState.error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{householdState.error}</div> : null}
              {!householdState.context.currentAuthUserId && !householdState.loading ? (
                <div style={{ color: "#991b1b", fontSize: "14px" }}>
                  Please sign in again before creating a property.
                </div>
              ) : null}
              {householdState.context.currentAuthUserId && !canCreateProperty ? (
                <div style={{ color: "#991b1b", fontSize: "14px" }}>
                  We could not initialize your household profile yet. Please try again.
                </div>
              ) : null}
            </form>
          </SectionCard>

          <SectionCard title="Property Readiness">
            <AIInsightPanel
              title="Foundation Readiness"
              summary={
                properties.length > 0
                  ? "Property records are now live in the platform shell and ready for document intake, snapshots, analytics placeholders, and later linkage to mortgage, homeowners, and cross-module intelligence."
                  : "The property module is live-ready but still waiting for its first property record."
              }
              bullets={[
                "Property creation now writes both the generic asset row and the deep property row.",
                "Property detail pages are ready for linked documents, snapshots, analytics placeholders, and platform continuity context.",
              ]}
            />
          </SectionCard>
        </div>
      </div>

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Property Debug: household={householdState.context.householdId || "none"} | properties={properties.length} | loading={loading ? "yes" : "no"} | loadError={loadError || "none"} | createError={createError || "none"}
        </div>
      ) : null}
    </div>
  );
}
