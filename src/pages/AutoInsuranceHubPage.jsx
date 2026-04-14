import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import { summarizeAutoInsuranceModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import {
  getAutoPolicyType,
  listAutoCarriers,
  listAutoPolicyTypes,
} from "../lib/domain/autoInsurance";
import {
  createAutoAssetWithPolicy,
  listAutoPolicies,
} from "../lib/supabase/autoData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

const AUTO_POLICY_TYPES = listAutoPolicyTypes();
const AUTO_CARRIERS = listAutoCarriers();

const DEFAULT_FORM = {
  auto_policy_type_key: "auto_policy_generic",
  policy_name: "",
  named_insured: "",
  carrier_key: "",
  effective_date: "",
  expiration_date: "",
  policy_status: "active",
};

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "renewal_pending" || status === "review") return "warning";
  return "info";
}

export default function AutoInsuranceHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const [autoPolicies, setAutoPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      queueMicrotask(() => {
        setLoading(false);
      });
      return;
    }

    let active = true;
    async function loadAutoPolicies() {
      setLoading(true);
      const result = await listAutoPolicies(householdState.context.householdId);
      if (!active) return;
      setAutoPolicies(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadAutoPolicies();
    return () => {
      active = false;
    };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshAutoPolicies() {
    if (!householdState.context.householdId) return;
    const result = await listAutoPolicies(householdState.context.householdId);
    setAutoPolicies(result.data || []);
    setLoadError(result.error?.message || "");
  }

  const summaryItems = useMemo(() => {
    const activeCount = autoPolicies.filter((policy) => policy.policy_status === "active").length;
    const typeCounts = autoPolicies.reduce((accumulator, policy) => {
      const policyType = getAutoPolicyType(policy.auto_policy_type_key);
      const key = policyType?.major_category || "other";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return [
      { label: "Auto Policies", value: autoPolicies.length, helper: "Live auto-insurance records" },
      { label: "Personal Auto", value: typeCounts.personal_auto || 0, helper: "Personal and household auto policies" },
      { label: "Specialty / Commercial", value: (typeCounts.commercial_auto || 0) + (typeCounts.specialty_vehicle || 0) + (typeCounts.endorsement_reference || 0), helper: "Commercial, specialty, and endorsement references" },
      { label: "Active", value: activeCount, helper: `${autoPolicies.length - activeCount} non-active records` },
    ];
  }, [autoPolicies]);

  const autoRead = useMemo(() => summarizeAutoInsuranceModule(autoPolicies), [autoPolicies]);

  async function handleCreateAutoPolicy(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.auto_policy_type_key) return;

    setCreating(true);
    setCreateError("");
    const result = await createAutoAssetWithPolicy({
      household_id: householdState.context.householdId,
      auto_policy_type_key: form.auto_policy_type_key,
      policy_name: form.policy_name,
      named_insured: form.named_insured,
      carrier_key: form.carrier_key || null,
      effective_date: form.effective_date || null,
      expiration_date: form.expiration_date || null,
      policy_status: form.policy_status,
    });

    if (result.error) {
      setCreateError(result.error.message || "Auto policy could not be created.");
      setCreating(false);
      return;
    }

    await refreshAutoPolicies();
    setForm(DEFAULT_FORM);
    setCreating(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Insurance"
        title="Auto Insurance Hub"
        description="Live auto policy registry for declarations intake, vehicle continuity, and future coverage parsing."
        actions={
          <button
            onClick={() => refreshAutoPolicies()}
            style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Refresh Auto Data
          </button>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Coverage Readiness">
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{autoRead.headline}</div>
              <StatusBadge label={autoRead.status} tone={autoRead.status === "Ready" ? "good" : autoRead.status === "Building" ? "warning" : "alert"} />
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
              {autoRead.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Watchpoints">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Renewal pending:</strong> {autoRead.metrics.renewalPending}</div>
            <div><strong>Expiring soon:</strong> {autoRead.metrics.expiringSoon}</div>
            <div><strong>Missing named insured:</strong> {autoRead.metrics.missingNamedInsured}</div>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Auto Policies" subtitle="Live household auto-insurance records linked into the broader platform asset layer.">
          {householdState.loading || loading ? (
            <div style={{ color: "#64748b" }}>Loading auto policies...</div>
          ) : loadError ? (
            <EmptyState title="Auto data unavailable" description={loadError} />
          ) : autoPolicies.length === 0 ? (
            <EmptyState
              title="No auto policies yet"
              description="Create the first auto policy to start building a real auto-insurance view with documents, renewal visibility, and ongoing review support."
            />
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {autoPolicies.map((policy) => {
                const policyType = getAutoPolicyType(policy.auto_policy_type_key);
                const linkedAsset = policy.assets || null;
                return (
                  <button
                    key={policy.id}
                    onClick={() => onNavigate(`/insurance/auto/detail/${policy.id}`)}
                    style={{ textAlign: "left", width: "100%", border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "14px", padding: "16px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                          {policy.policy_name || linkedAsset?.asset_name || "Auto Policy"}
                        </div>
                        <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6" }}>
                          {policyType?.display_name || policy.auto_policy_type_key}
                          {" | "}
                          {linkedAsset?.institution_name || policy.carrier_key || "Carrier pending"}
                        </div>
                      </div>
                      <StatusBadge label={policy.policy_status || "unknown"} tone={getStatusTone(policy.policy_status)} />
                    </div>

                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <StatusBadge label={policyType?.major_category || "auto"} tone="info" />
                      <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
                    </div>

                    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", color: "#475569" }}>
                      <div><strong>Named Insured:</strong> {policy.named_insured || "Limited visibility"}</div>
                      <div><strong>Effective:</strong> {policy.effective_date || "Limited visibility"}</div>
                      <div><strong>Expires:</strong> {policy.expiration_date || "Limited visibility"}</div>
                      <div><strong>Carrier:</strong> {policy.carrier_key || "Limited visibility"}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div style={{ display: "grid", gap: "18px" }}>
          <SectionCard title="Create Auto Policy" subtitle="Start with the core policy record, then deepen the file with documents and review details.">
            <form onSubmit={handleCreateAutoPolicy} style={{ display: "grid", gap: "12px" }}>
              <select value={form.auto_policy_type_key} onChange={(event) => setForm((current) => ({ ...current, auto_policy_type_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                {AUTO_POLICY_TYPES.map((type) => (
                  <option key={type.auto_policy_type_key} value={type.auto_policy_type_key}>
                    {type.display_name} | {type.major_category}
                  </option>
                ))}
              </select>
              <input value={form.policy_name} onChange={(event) => setForm((current) => ({ ...current, policy_name: event.target.value }))} placeholder="Policy name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.named_insured} onChange={(event) => setForm((current) => ({ ...current, named_insured: event.target.value }))} placeholder="Named insured" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.carrier_key} onChange={(event) => setForm((current) => ({ ...current, carrier_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="">No carrier registry match yet</option>
                {AUTO_CARRIERS.map((carrier) => (
                  <option key={carrier.carrier_key} value={carrier.carrier_key}>
                    {carrier.display_name}
                  </option>
                ))}
              </select>
              <input type="date" value={form.effective_date} onChange={(event) => setForm((current) => ({ ...current, effective_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input type="date" value={form.expiration_date} onChange={(event) => setForm((current) => ({ ...current, expiration_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.policy_status} onChange={(event) => setForm((current) => ({ ...current, policy_status: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="active">active</option>
                <option value="renewal_pending">renewal_pending</option>
                <option value="inactive">inactive</option>
                <option value="cancelled">cancelled</option>
              </select>
              <button type="submit" disabled={creating || !householdState.context.householdId} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                {creating ? "Creating Auto Policy..." : "Create Auto Policy"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{createError}</div> : null}
              {householdState.error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{householdState.error}</div> : null}
            </form>
          </SectionCard>

          <SectionCard title="Auto Readiness">
            <AIInsightPanel
              title="Foundation Readiness"
              summary={
                autoPolicies.length > 0
                  ? "Auto policies are now live in VaultedShield and ready for documents, snapshots, and deeper review as the file grows."
                  : "The auto-insurance module is live-ready but still waiting for its first policy record."
              }
              bullets={[
                "Auto policy creation now establishes the core record and its linked insurance detail view.",
                "Auto detail pages are ready for linked documents, snapshots, and broader continuity context.",
              ]}
            />
          </SectionCard>
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Auto Debug: household={householdState.context.householdId || "none"} | policies={autoPolicies.length} | loading={loading ? "yes" : "no"} | loadError={loadError || "none"} | createError={createError || "none"}
        </div>
      ) : null}
    </div>
  );
}
