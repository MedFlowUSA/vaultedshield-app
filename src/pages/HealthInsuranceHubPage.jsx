import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import { summarizeHealthModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import {
  getHealthPlanType,
  listHealthCarriers,
  listHealthPlanTypes,
} from "../lib/domain/healthInsurance";
import {
  createHealthAssetWithPlan,
  listHealthPlans,
} from "../lib/supabase/healthData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";

const HEALTH_PLAN_TYPES = listHealthPlanTypes();
const HEALTH_CARRIERS = listHealthCarriers();

const DEFAULT_FORM = {
  health_plan_type_key: "health_plan_generic",
  plan_name: "",
  subscriber_name: "",
  employer_group_name: "",
  carrier_key: "",
  effective_date: "",
  renewal_date: "",
  plan_status: "active",
};

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "renewal_pending" || status === "review") return "warning";
  return "info";
}

export default function HealthInsuranceHubPage({ onNavigate }) {
  const householdState = usePlatformHousehold();
  const [healthPlans, setHealthPlans] = useState([]);
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
    async function loadHealthPlans() {
      setLoading(true);
      const result = await listHealthPlans(householdState.context.householdId);
      if (!active) return;
      setHealthPlans(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadHealthPlans();
    return () => {
      active = false;
    };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshHealthPlans() {
    if (!householdState.context.householdId) return;
    const result = await listHealthPlans(householdState.context.householdId);
    setHealthPlans(result.data || []);
    setLoadError(result.error?.message || "");
  }

  const summaryItems = useMemo(() => {
    const activeCount = healthPlans.filter((plan) => plan.plan_status === "active").length;
    const typeCounts = healthPlans.reduce((accumulator, plan) => {
      const planType = getHealthPlanType(plan.health_plan_type_key);
      const key = planType?.major_category || "other";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return [
      { label: "Health Plans", value: healthPlans.length, helper: "Live health-insurance records" },
      { label: "Commercial", value: (typeCounts.commercial || 0) + (typeCounts.employer_group || 0) + (typeCounts.individual_market || 0), helper: "Commercial, employer, and marketplace plans" },
      { label: "Government", value: typeCounts.government_program || 0, helper: "Medicare and Medicaid-related plans" },
      { label: "Active", value: activeCount, helper: `${healthPlans.length - activeCount} non-active records` },
    ];
  }, [healthPlans]);

  const healthRead = useMemo(() => summarizeHealthModule(healthPlans), [healthPlans]);

  async function handleCreateHealthPlan(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.health_plan_type_key) return;

    setCreating(true);
    setCreateError("");
    const result = await createHealthAssetWithPlan({
      household_id: householdState.context.householdId,
      health_plan_type_key: form.health_plan_type_key,
      plan_name: form.plan_name,
      subscriber_name: form.subscriber_name,
      employer_group_name: form.employer_group_name,
      carrier_key: form.carrier_key || null,
      effective_date: form.effective_date || null,
      renewal_date: form.renewal_date || null,
      plan_status: form.plan_status,
    });

    if (result.error) {
      setCreateError(result.error.message || "Health plan could not be created.");
      setCreating(false);
      return;
    }

    await refreshHealthPlans();
    setForm(DEFAULT_FORM);
    setCreating(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Insurance"
        title="Health Insurance Hub"
        description="Live health plan registry for coverage shells, benefits intake, member continuity, and future health-plan parsing."
        actions={
          <button
            onClick={() => refreshHealthPlans()}
            style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Refresh Health Data
          </button>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Benefits Readiness">
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{healthRead.headline}</div>
              <StatusBadge label={healthRead.status} tone={healthRead.status === "Ready" ? "good" : healthRead.status === "Building" ? "warning" : "alert"} />
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
              {healthRead.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Watchpoints">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Renewal pending:</strong> {healthRead.metrics.renewalPending}</div>
            <div><strong>Renewal soon:</strong> {healthRead.metrics.renewalSoon}</div>
            <div><strong>Missing subscriber:</strong> {healthRead.metrics.missingSubscriber}</div>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Health Plans" subtitle="Live household health-insurance records linked into the broader platform asset layer.">
          {householdState.loading || loading ? (
            <div style={{ color: "#64748b" }}>Loading health plans...</div>
          ) : loadError ? (
            <EmptyState title="Health data unavailable" description={loadError} />
          ) : healthPlans.length === 0 ? (
            <EmptyState
              title="No health plans yet"
              description="Create the first health plan to activate the module and prepare it for benefits documents, snapshots, analytics, and later health-plan parsing."
            />
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {healthPlans.map((plan) => {
                const planType = getHealthPlanType(plan.health_plan_type_key);
                const linkedAsset = plan.assets || null;
                return (
                  <button
                    key={plan.id}
                    onClick={() => onNavigate(`/insurance/health/detail/${plan.id}`)}
                    style={{ textAlign: "left", width: "100%", border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "14px", padding: "16px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                          {plan.plan_name || linkedAsset?.asset_name || plan.employer_group_name || "Health Plan"}
                        </div>
                        <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6" }}>
                          {planType?.display_name || plan.health_plan_type_key}
                          {" | "}
                          {linkedAsset?.institution_name || plan.carrier_key || "Carrier pending"}
                        </div>
                      </div>
                      <StatusBadge label={plan.plan_status || "unknown"} tone={getStatusTone(plan.plan_status)} />
                    </div>

                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <StatusBadge label={planType?.major_category || "health"} tone="info" />
                      <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
                    </div>

                    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", color: "#475569" }}>
                      <div><strong>Subscriber:</strong> {plan.subscriber_name || "Limited visibility"}</div>
                      <div><strong>Employer Group:</strong> {plan.employer_group_name || "Limited visibility"}</div>
                      <div><strong>Effective:</strong> {plan.effective_date || "Limited visibility"}</div>
                      <div><strong>Renewal:</strong> {plan.renewal_date || "Limited visibility"}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div style={{ display: "grid", gap: "18px" }}>
          <SectionCard title="Create Health Plan" subtitle="Minimal live create flow that writes both the generic asset row and the linked health plan row.">
            <form onSubmit={handleCreateHealthPlan} style={{ display: "grid", gap: "12px" }}>
              <select value={form.health_plan_type_key} onChange={(event) => setForm((current) => ({ ...current, health_plan_type_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                {HEALTH_PLAN_TYPES.map((type) => (
                  <option key={type.health_plan_type_key} value={type.health_plan_type_key}>
                    {type.display_name} | {type.major_category}
                  </option>
                ))}
              </select>
              <input value={form.plan_name} onChange={(event) => setForm((current) => ({ ...current, plan_name: event.target.value }))} placeholder="Plan name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.subscriber_name} onChange={(event) => setForm((current) => ({ ...current, subscriber_name: event.target.value }))} placeholder="Subscriber name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.employer_group_name} onChange={(event) => setForm((current) => ({ ...current, employer_group_name: event.target.value }))} placeholder="Employer group name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.carrier_key} onChange={(event) => setForm((current) => ({ ...current, carrier_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="">No carrier registry match yet</option>
                {HEALTH_CARRIERS.map((carrier) => (
                  <option key={carrier.carrier_key} value={carrier.carrier_key}>
                    {carrier.display_name}
                  </option>
                ))}
              </select>
              <input type="date" value={form.effective_date} onChange={(event) => setForm((current) => ({ ...current, effective_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input type="date" value={form.renewal_date} onChange={(event) => setForm((current) => ({ ...current, renewal_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.plan_status} onChange={(event) => setForm((current) => ({ ...current, plan_status: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="active">active</option>
                <option value="renewal_pending">renewal_pending</option>
                <option value="inactive">inactive</option>
                <option value="terminated">terminated</option>
              </select>
              <button type="submit" disabled={creating || !householdState.context.householdId} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                {creating ? "Creating Health Plan..." : "Create Health Plan"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{createError}</div> : null}
              {householdState.error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{householdState.error}</div> : null}
            </form>
          </SectionCard>

          <SectionCard title="Health Readiness">
            <AIInsightPanel
              title="Foundation Readiness"
              summary={
                healthPlans.length > 0
                  ? "Health plans are now live in the platform shell and ready for document intake, snapshots, analytics placeholders, and later benefits parsing."
                  : "The health-insurance module is live-ready but still waiting for its first plan record."
              }
              bullets={[
                "Health plan creation now writes both the generic asset row and the deep health plan row.",
                "Health detail pages are ready for linked documents, snapshots, analytics placeholders, and platform continuity context.",
              ]}
            />
          </SectionCard>
        </div>
      </div>

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Health Debug: household={householdState.context.householdId || "none"} | plans={healthPlans.length} | loading={loading ? "yes" : "no"} | loadError={loadError || "none"} | createError={createError || "none"}
        </div>
      ) : null}
    </div>
  );
}
