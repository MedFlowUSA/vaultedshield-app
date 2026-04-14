import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
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

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "cancelled" || status === "nonrenewed" || status === "expired") return "warning";
  return "info";
}

export default function HomeownersHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const [policies, setPolicies] = useState([]);
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
    async function loadPolicies() {
      setLoading(true);
      const result = await listHomeownersPolicies(householdState.context.householdId);
      if (!active) return;
      setPolicies(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadPolicies();
    return () => {
      active = false;
    };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshPolicies() {
    if (!householdState.context.householdId) return;
    const result = await listHomeownersPolicies(householdState.context.householdId);
    setPolicies(result.data || []);
    setLoadError(result.error?.message || "");
  }

  const summaryItems = useMemo(() => {
    const activeCount = policies.filter((policy) => policy.policy_status === "active").length;
    const policyTypeCount = policies.reduce((accumulator, policy) => {
      const policyType = getHomeownersPolicyType(policy.homeowners_policy_type_key);
      const key = policyType?.major_category || "other";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return [
      { label: "Homeowners Policies", value: policies.length, helper: "Live homeowners module records" },
      { label: "Owner Occupied", value: policyTypeCount.owner_occupied || 0, helper: "Primary homeowners and condo style policies" },
      { label: "Rental / Specialty", value: (policyTypeCount.investment_property || 0) + (policyTypeCount.property_specialty || 0), helper: "Landlord, dwelling fire, and vacant property references" },
      { label: "Active", value: activeCount, helper: `${policies.length - activeCount} non-active records` },
    ];
  }, [policies]);

  const homeownersRead = useMemo(() => summarizeHomeownersModule(policies), [policies]);
  const homeownersHubCommand = useMemo(
    () =>
      buildHomeownersHubCommand({
        policies,
        homeownersRead,
      }),
    [homeownersRead, policies]
  );

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
      setCreateError(result.error.message || "Homeowners policy could not be created.");
      setCreating(false);
      return;
    }

    await refreshPolicies();
    setForm(DEFAULT_FORM);
    setCreating(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Insurance"
        title="Homeowners Hub"
        description="Live homeowners registry for policy shells, declarations intake, renewals, and future property continuity intelligence."
        actions={
          <button
            onClick={() => refreshPolicies()}
            style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Refresh Homeowners Data
          </button>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div style={{ marginTop: "24px" }}>
        <SectionCard
          title="Homeowners Command Center"
          subtitle="The strongest property-protection blockers, why they matter, and what to do next."
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <AIInsightPanel
              title="Property Protection Command"
              summary={homeownersHubCommand.headline}
              bullets={[
                `${homeownersHubCommand.metrics.total || 0} homeowners polic${homeownersHubCommand.metrics.total === 1 ? "y is" : "ies are"} tracked.`,
                `${homeownersHubCommand.metrics.active || 0} polic${homeownersHubCommand.metrics.active === 1 ? "y is" : "ies are"} active.`,
                `${homeownersHubCommand.metrics.attention || 0} command item${homeownersHubCommand.metrics.attention === 1 ? "" : "s"} are surfaced as next moves.`,
              ]}
            />
            {homeownersHubCommand.rows.length > 0 ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {homeownersHubCommand.rows.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "16px",
                      borderRadius: "14px",
                      background: item.urgencyMeta.background,
                      border: item.urgencyMeta.border,
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                      <StatusBadge label={item.urgencyMeta.badge} tone={item.urgency === "critical" ? "alert" : "warning"} />
                    </div>
                    <div style={{ color: "#0f172a", lineHeight: "1.7" }}>
                      <strong>Blocker:</strong> {item.blocker}
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.7" }}>
                      <strong>Consequence:</strong> {item.consequence}
                    </div>
                    <div style={{ color: item.urgencyMeta.accent, fontWeight: 700, lineHeight: "1.7" }}>
                      Next action: {item.nextAction}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No active homeowners blockers"
                description="The homeowners module currently reads as relatively steady at the household level."
              />
            )}
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Property Protection Readiness">
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{homeownersRead.headline}</div>
              <StatusBadge label={homeownersRead.status} tone={homeownersRead.status === "Ready" ? "good" : homeownersRead.status === "Building" ? "warning" : "alert"} />
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
              {homeownersRead.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Watchpoints">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Expiring soon:</strong> {homeownersRead.metrics.expiringSoon}</div>
            <div><strong>Missing property:</strong> {homeownersRead.metrics.missingProperty}</div>
            <div><strong>Missing named insured:</strong> {homeownersRead.metrics.missingNamedInsured}</div>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Homeowners Policies" subtitle="Live household homeowners records linked into the broader platform asset layer.">
          {householdState.loading || loading ? (
            <div style={{ color: "#64748b" }}>Loading homeowners policies...</div>
          ) : loadError ? (
            <EmptyState title="Homeowners data unavailable" description={loadError} />
          ) : policies.length === 0 ? (
            <EmptyState
              title="No homeowners policies yet"
              description="Create the first homeowners policy to start building a real protection view with declarations, renewals, and linked property context."
            />
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {policies.map((policy) => {
                const policyType = getHomeownersPolicyType(policy.homeowners_policy_type_key);
                const linkedAsset = policy.assets || null;
                return (
                  <button
                    key={policy.id}
                    onClick={() => onNavigate(`/insurance/homeowners/detail/${policy.id}`)}
                    style={{ textAlign: "left", width: "100%", border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "14px", padding: "16px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                          {policy.policy_name || linkedAsset?.asset_name || policy.property_address || "Homeowners Policy"}
                        </div>
                        <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6" }}>
                          {policyType?.display_name || policy.homeowners_policy_type_key}
                          {" | "}
                          {linkedAsset?.institution_name || policy.carrier_key || "Carrier pending"}
                        </div>
                      </div>
                      <StatusBadge label={policy.policy_status || "unknown"} tone={getStatusTone(policy.policy_status)} />
                    </div>

                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <StatusBadge label={policyType?.major_category || "homeowners"} tone="info" />
                      <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
                    </div>

                    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", color: "#475569" }}>
                      <div><strong>Named Insured:</strong> {policy.named_insured || "Limited visibility"}</div>
                      <div><strong>Property:</strong> {policy.property_address || "Limited visibility"}</div>
                      <div><strong>Effective:</strong> {policy.effective_date || "Limited visibility"}</div>
                      <div><strong>Expires:</strong> {policy.expiration_date || "Limited visibility"}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div style={{ display: "grid", gap: "18px" }}>
          <SectionCard title="Create Homeowners Policy" subtitle="Start with the core policy record, then connect documents, property context, and deeper review details.">
            <form onSubmit={handleCreatePolicy} style={{ display: "grid", gap: "12px" }}>
              <select value={form.homeowners_policy_type_key} onChange={(event) => setForm((current) => ({ ...current, homeowners_policy_type_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                {HOMEOWNERS_POLICY_TYPES.map((type) => (
                  <option key={type.homeowners_policy_type_key} value={type.homeowners_policy_type_key}>
                    {type.display_name} | {type.major_category}
                  </option>
                ))}
              </select>
              <input value={form.policy_name} onChange={(event) => setForm((current) => ({ ...current, policy_name: event.target.value }))} placeholder="Policy name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.property_address} onChange={(event) => setForm((current) => ({ ...current, property_address: event.target.value }))} placeholder="Property address" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.carrier_key} onChange={(event) => setForm((current) => ({ ...current, carrier_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="">No carrier registry match yet</option>
                {HOMEOWNERS_CARRIERS.map((carrier) => (
                  <option key={carrier.carrier_key} value={carrier.carrier_key}>
                    {carrier.display_name}
                  </option>
                ))}
              </select>
              <input value={form.named_insured} onChange={(event) => setForm((current) => ({ ...current, named_insured: event.target.value }))} placeholder="Named insured" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input type="date" value={form.effective_date} onChange={(event) => setForm((current) => ({ ...current, effective_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input type="date" value={form.expiration_date} onChange={(event) => setForm((current) => ({ ...current, expiration_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.policy_status} onChange={(event) => setForm((current) => ({ ...current, policy_status: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="active">active</option>
                <option value="renewal_pending">renewal_pending</option>
                <option value="expired">expired</option>
                <option value="cancelled">cancelled</option>
                <option value="nonrenewed">nonrenewed</option>
              </select>
              <button type="submit" disabled={creating || !householdState.context.householdId} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                {creating ? "Creating Homeowners Policy..." : "Create Homeowners Policy"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{createError}</div> : null}
              {householdState.error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{householdState.error}</div> : null}
            </form>
          </SectionCard>

          <SectionCard title="Homeowners Readiness">
            <AIInsightPanel
              title="Foundation Readiness"
              summary={
                policies.length > 0
                  ? "Homeowners records are now live in VaultedShield and ready for documents, snapshots, and deeper review as the file grows."
                  : "The homeowners module is live-ready but still waiting for its first policy record."
              }
              bullets={[
                "Homeowners policy creation now establishes the core record and its linked protection detail view.",
                "Policy detail pages are ready for linked documents, snapshots, and broader continuity context.",
              ]}
            />
          </SectionCard>
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Homeowners Debug: household={householdState.context.householdId || "none"} | policies={policies.length} | loading={loading ? "yes" : "no"} | loadError={loadError || "none"} | createError={createError || "none"}
        </div>
      ) : null}
    </div>
  );
}
