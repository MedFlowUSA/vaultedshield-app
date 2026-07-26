import { useEffect, useMemo, useRef, useState } from "react";
import {
  getPropertyType,
  listPropertyTypes,
} from "../lib/domain/property";
import {
  createPropertyWithDependencies,
  listProperties,
} from "../lib/supabase/propertyData";
import { buildPropertyHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

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
          {tone === "good" ? "Good" : tone === "warning" ? "Partial" : "Missing"}
        </span>
      </div>
      <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>{detail}</div>
    </div>
  );
}

function PropertyCard({ property, onNavigate }) {
  const propertyType = getPropertyType(property.property_type_key);
  const linkedAsset = property.assets || null;
  const name = property.property_name || linkedAsset?.asset_name || property.property_address || "Property";
  const statusTone = property.property_status === "active" ? "good" : property.property_status === "watch" ? "warning" : "neutral";

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(`/property/detail/${property.id}`)}
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
            {propertyType?.display_name || property.property_type_key}
            {property.county ? ` · ${property.county} County` : ""}
          </div>
        </div>
        <StatusPill label={property.property_status || "unknown"} tone={statusTone} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
        {property.property_address ? (
          <div style={{ fontSize: "13px", color: "#475569" }}>
            <span style={{ fontWeight: 700 }}>Address:</span> {property.property_address}
          </div>
        ) : null}
        {property.owner_name ? (
          <div style={{ fontSize: "13px", color: "#475569" }}>
            <span style={{ fontWeight: 700 }}>Owner:</span> {property.owner_name}
          </div>
        ) : null}
        {property.occupancy_type ? (
          <div style={{ fontSize: "13px", color: "#475569" }}>
            <span style={{ fontWeight: 700 }}>Occupancy:</span> {property.occupancy_type}
          </div>
        ) : null}
        {property.purchase_date ? (
          <div style={{ fontSize: "13px", color: "#475569" }}>
            <span style={{ fontWeight: 700 }}>Purchased:</span> {property.purchase_date}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <StatusPill label={propertyType?.major_category?.replace("_", " ") || "property"} tone="neutral" />
        <StatusPill
          label={linkedAsset?.id ? "Asset Linked" : "Asset Link Pending"}
          tone={linkedAsset?.id ? "good" : "warning"}
        />
      </div>
    </button>
  );
}

function EmptyPropertiesPanel({ onScrollToForm }) {
  const types = [
    { icon: "🏠", label: "Primary Home", desc: "The household's main residence" },
    { icon: "🏢", label: "Investment Property", desc: "Rental or income-generating property" },
    { icon: "🏖️", label: "Vacation / Second Home", desc: "Secondary or seasonal property" },
    { icon: "🏗️", label: "Land / Other", desc: "Undeveloped land or other real estate" },
  ];
  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div style={{ fontSize: "15px", color: "#475569", lineHeight: "1.7" }}>
        Start with the primary home. One property record gives mortgage review, homeowners coverage check, and estate continuity a shared home base.
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
      <ActionButton label="Add First Property" onClick={onScrollToForm} primary />
    </div>
  );
}

function CommandRow({ item }) {
  const tone = item.urgency === "critical" ? "alert" : "warning";
  return (
    <div
      style={{
        ...surfaceCard({ padding: "16px 20px" }),
        display: "grid",
        gap: "8px",
        borderLeft: `4px solid ${tone === "alert" ? "#fecaca" : "#fde68a"}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
        <StatusPill label={item.urgencyMeta?.badge || item.urgency} tone={tone} />
      </div>
      {item.blocker ? <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}><strong>Gap:</strong> {item.blocker}</div> : null}
      {item.nextAction ? (
        <div style={{ fontSize: "13px", color: tone === "alert" ? "#991b1b" : "#92400e", fontWeight: 700 }}>
          Next: {item.nextAction}
        </div>
      ) : null}
    </div>
  );
}

function AddPropertyForm({ form, setForm, creating, createError, householdState, canCreate, onSubmit }) {
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
            Property Type
          </label>
          <select
            value={form.property_type_key}
            onChange={(e) => setForm((c) => ({ ...c, property_type_key: e.target.value }))}
            style={inputStyle}
          >
            {PROPERTY_TYPES.map((type) => (
              <option key={type.property_type_key} value={type.property_type_key}>
                {type.display_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Property Name
          </label>
          <input
            value={form.property_name}
            onChange={(e) => setForm((c) => ({ ...c, property_name: e.target.value }))}
            placeholder="e.g. Main Residence"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Owner Name
          </label>
          <input
            value={form.owner_name}
            onChange={(e) => setForm((c) => ({ ...c, owner_name: e.target.value }))}
            placeholder="Name on title"
            style={inputStyle}
          />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Property Address
          </label>
          <input
            value={form.property_address}
            onChange={(e) => setForm((c) => ({ ...c, property_address: e.target.value }))}
            placeholder="Street address"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            County
          </label>
          <input
            value={form.county}
            onChange={(e) => setForm((c) => ({ ...c, county: e.target.value }))}
            placeholder="County name"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Occupancy Type
          </label>
          <input
            value={form.occupancy_type}
            onChange={(e) => setForm((c) => ({ ...c, occupancy_type: e.target.value }))}
            placeholder="e.g. Primary, Rental"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Purchase Date
          </label>
          <input
            type="date"
            value={form.purchase_date}
            onChange={(e) => setForm((c) => ({ ...c, purchase_date: e.target.value }))}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
            Status
          </label>
          <select
            value={form.property_status}
            onChange={(e) => setForm((c) => ({ ...c, property_status: e.target.value }))}
            style={inputStyle}
          >
            <option value="active">Active</option>
            <option value="watch">Watch</option>
            <option value="inactive">Inactive</option>
            <option value="sold">Sold</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={creating || !canCreate}
        style={{
          padding: "13px 20px",
          borderRadius: "10px",
          border: "none",
          background: creating || !canCreate ? "#94a3b8" : "#0f172a",
          color: "#ffffff",
          fontWeight: 800,
          fontSize: "15px",
          cursor: creating || !canCreate ? "default" : "pointer",
          marginTop: "4px",
        }}
      >
        {creating ? "Saving..." : "Save Property Record"}
      </button>
      {createError ? <div style={{ color: "#991b1b", fontSize: "13px" }}>{createError}</div> : null}
      {!householdState.context.currentAuthUserId && !householdState.loading ? (
        <div style={{ color: "#991b1b", fontSize: "13px" }}>Please sign in again before creating a property.</div>
      ) : null}
    </form>
  );
}

export default function PropertyHubPage({ onNavigate }) {
  const { householdState } = usePlatformShellData();
  const propertiesRef = useRef(null);
  const addFormRef = useRef(null);

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [showAddForm, setShowAddForm] = useState(false);

  const canCreate = Boolean(householdState.context.currentAuthUserId) && !householdState.loading;

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
    return () => { active = false; };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshPropertyRecords(targetId = householdState.context.householdId) {
    if (!targetId) return;
    const result = await listProperties(targetId);
    setProperties(result.data || []);
    setLoadError(result.error?.message || "");
  }

  async function handleCreateProperty(event) {
    event.preventDefault();
    if (creating || !canCreate || !form.property_type_key) return;

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
      setCreateError(result.error.message || "Property could not be created. Please try again.");
      setCreating(false);
      return;
    }

    await refreshPropertyRecords(result.data?.householdId || householdState.context.householdId);
    setForm(DEFAULT_FORM);
    setCreating(false);
    setShowAddForm(false);
  }

  const propertyHubCommand = useMemo(() => buildPropertyHubCommand(properties), [properties]);

  const { activeCount, linkedCount, totalCount } = useMemo(() => ({
    totalCount: properties.length,
    activeCount: properties.filter((p) => p.property_status === "active").length,
    linkedCount: properties.filter((p) => p.assets?.id).length,
  }), [properties]);

  const checkpoints = useMemo(() => {
    const hasPrimary = properties.some((p) => {
      const type = getPropertyType(p.property_type_key);
      return type?.major_category === "owner_occupied" || type?.major_category === "attached_residential";
    });
    const allLinked = properties.length > 0 && linkedCount === properties.length;
    const hasCommandItems = propertyHubCommand.rows.length > 0;

    return [
      {
        icon: "🏠",
        label: "Primary Residence on Record",
        status: hasPrimary ? "good" : properties.length > 0 ? "warning" : "alert",
        detail: hasPrimary
          ? "The household's primary home is recorded — mortgage, homeowners, and estate planning all have a shared anchor."
          : properties.length > 0
            ? "Properties exist but no primary residence is identified. Add the main home so linked modules have a clear anchor."
            : "No properties recorded yet. The primary home is the most critical first record in the platform.",
      },
      {
        icon: "🔗",
        label: "Properties Linked to Asset Layer",
        status: allLinked ? "good" : linkedCount > 0 ? "warning" : properties.length > 0 ? "alert" : "alert",
        detail: allLinked
          ? `All ${properties.length} propert${properties.length === 1 ? "y is" : "ies are"} linked into the shared asset layer — valuations, documents, and continuity reads are available.`
          : linkedCount > 0
            ? `${linkedCount} of ${properties.length} properties are linked. Open each detail page to complete the remaining links.`
            : properties.length > 0
              ? "Properties exist but haven't been linked to the asset layer yet. Open each property to connect it."
              : "Add a property to enable asset layer linking.",
      },
      {
        icon: "🛡️",
        label: "No Outstanding Continuity Gaps",
        status: !hasCommandItems ? "good" : "warning",
        detail: hasCommandItems
          ? `${propertyHubCommand.rows.length} continuity item${propertyHubCommand.rows.length === 1 ? "" : "s"} need attention — see the command center below.`
          : properties.length > 0
            ? "No active continuity gaps across household property records."
            : "Add properties to enable continuity gap detection.",
      },
    ];
  }, [properties, linkedCount, propertyHubCommand]);

  function scrollToAddForm() {
    setShowAddForm(true);
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <div style={{ display: "grid", gap: "24px" }}>

      {/* Hero */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #14532d 100%)",
          borderRadius: "22px",
          padding: "32px 32px 28px",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#86efac" }}>
            Real Estate & Property
          </div>
          <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.15" }}>
            Property Hub
          </div>
          <div style={{ fontSize: "15px", color: "#cbd5e1", lineHeight: "1.6", maxWidth: "600px" }}>
            Real estate represents most of the household's net worth — and anchors mortgage review, homeowners coverage, and estate continuity. Start here.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
          {[
            { label: "Total Properties", value: loading ? "—" : totalCount },
            { label: "Active", value: loading ? "—" : activeCount },
            { label: "Asset Linked", value: loading ? "—" : linkedCount },
            { label: "Action Items", value: loading ? "—" : propertyHubCommand.rows.length },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px", display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "22px", fontWeight: 900 }}>{stat.value}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton
            label={properties.length > 0 ? "Add Another Property" : "Add First Property"}
            onClick={scrollToAddForm}
            primary
          />
          <ActionButton
            label="View Properties"
            onClick={() => propertiesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        </div>
      </div>

      {/* Action tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            icon: "🏘️",
            label: "Properties Tracked",
            value: `${totalCount} propert${totalCount === 1 ? "y" : "ies"}`,
            sub: totalCount > 0 ? `${activeCount} active · ${linkedCount} asset-linked` : "No properties on record yet.",
            tone: totalCount > 0 ? "good" : "alert",
          },
          {
            icon: "⚠️",
            label: "Continuity Gaps",
            value: propertyHubCommand.rows.length > 0 ? `${propertyHubCommand.rows.length} item${propertyHubCommand.rows.length === 1 ? "" : "s"} need attention` : "No gaps detected",
            sub: propertyHubCommand.rows.length > 0 ? propertyHubCommand.rows[0]?.blocker || "Review the command center below." : "Property continuity is in good shape.",
            tone: propertyHubCommand.rows.length > 0 ? "warning" : "good",
          },
          {
            icon: "🔗",
            label: "Asset Linkage",
            value: totalCount > 0 ? `${linkedCount} of ${totalCount} linked` : "No properties yet",
            sub: linkedCount < totalCount && totalCount > 0 ? "Open property detail pages to complete linking." : "All properties connected to the asset layer.",
            tone: linkedCount < totalCount && totalCount > 0 ? "warning" : totalCount > 0 ? "good" : "alert",
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
        <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Property Readiness Checkpoints</div>
        <div style={{ display: "grid", gap: "10px" }}>
          {checkpoints.map((cp) => (
            <ReadinessCheckpoint key={cp.label} {...cp} />
          ))}
        </div>
      </div>

      {/* Command center */}
      {propertyHubCommand.rows.length > 0 ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Continuity Command Center</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Action items surfaced across household property records.</div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {propertyHubCommand.rows.map((item) => (
              <CommandRow key={item.id} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Property list */}
      <div ref={propertiesRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Property Records</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
              {properties.length > 0
                ? `${properties.length} propert${properties.length === 1 ? "y" : "ies"} on record — click to open detail view`
                : "No properties recorded yet"}
            </div>
          </div>
          <ActionButton label="+ Add Property" onClick={scrollToAddForm} primary />
        </div>

        {householdState.loading || loading ? (
          <div style={{ ...surfaceCard(), color: "#64748b", fontSize: "14px" }}>Loading property records...</div>
        ) : loadError ? (
          <div style={{ ...surfaceCard(), color: "#991b1b", fontSize: "14px" }}>{loadError}</div>
        ) : properties.length === 0 ? (
          <div style={{ ...surfaceCard() }}>
            <EmptyPropertiesPanel onScrollToForm={scrollToAddForm} />
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {properties.map((p) => (
              <PropertyCard key={p.id} property={p} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>

      {/* Add property form */}
      <div ref={addFormRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Add a Property</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Start with the basics — documents, valuation, and linked financing can be added in the detail view.</div>
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
            <AddPropertyForm
              form={form}
              setForm={setForm}
              creating={creating}
              createError={createError}
              householdState={householdState}
              canCreate={canCreate}
              onSubmit={handleCreateProperty}
            />
          </div>
        ) : null}
      </div>

      {/* Why This Matters */}
      <div
        style={{
          background: "linear-gradient(135deg, #14532d 0%, #166534 50%, #0f172a 100%)",
          borderRadius: "22px",
          padding: "36px 32px",
          color: "#ffffff",
          display: "grid",
          gap: "28px",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#86efac" }}>
            Why This Module Matters
          </div>
          <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: "1.25" }}>
            Real estate is the largest asset most households own — and the most under-documented.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {[
            {
              stat: "~70%",
              label: "Of household net worth tied to real estate",
              detail: "For most families, the primary home is their single largest financial asset — but it's rarely fully documented.",
            },
            {
              stat: "1 in 4",
              label: "Homes have title or deed discrepancies",
              detail: "Ownership records, lien histories, and beneficiary alignment on property are frequently incomplete or outdated.",
            },
            {
              stat: "18 mo.",
              label: "Average estate settlement time when property records are unclear",
              detail: "Clear property records — including who owns it, what's owed, and what covers it — dramatically speed up the handoff process.",
            },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#86efac", marginBottom: "6px" }}>{item.stat}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "6px" }}>{item.label}</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "12px", lineHeight: "1.7" }}>
          Debug: household={householdState.context.householdId || "none"} | properties={properties.length} | loading={loading ? "yes" : "no"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
