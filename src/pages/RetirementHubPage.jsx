import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  getRetirementType,
  listRetirementProviders,
  listRetirementTypes,
} from "../lib/domain/retirement";
import { summarizeRetirementHousehold } from "../lib/domain/retirement/retirementIntelligence";
import { scoreRetirementGoal } from "../lib/domain/retirement/retirementGoalScore";
import { loadRetirementGoalSnapshot } from "../lib/domain/retirement/retirementGoalStorage";
import { buildRetirementHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import {
  createRetirementAssetWithAccount,
  listRetirementAccounts,
} from "../lib/supabase/retirementData";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

function formatCategoryLabel(majorCategory) {
  const labels = {
    employer_plan: "Employer Plan",
    ira: "IRA",
    pension: "Pension",
    special_case: "Legacy / Special",
  };

  return labels[majorCategory] || "Retirement";
}

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "inactive" || status === "terminated" || status === "frozen") return "warning";
  return "info";
}

function getReadinessTone(status) {
  if (status === "On Track") return { background: "#dcfce7", color: "#166534" };
  if (status === "Moderately Behind") return { background: "#fef3c7", color: "#92400e" };
  if (status === "Behind") return { background: "#ffedd5", color: "#c2410c" };
  return { background: "#fee2e2", color: "#991b1b" };
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not recorded";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

const RETIREMENT_TYPES = listRetirementTypes();
const RETIREMENT_PROVIDERS = listRetirementProviders();

const DEFAULT_FORM = {
  retirement_type_key: "401k",
  plan_name: "",
  institution_name: "",
  provider_key: "",
  account_owner: "",
  participant_name: "",
  employer_name: "",
  plan_status: "active",
};

export default function RetirementHubPage({ onNavigate }) {
  const { isTablet } = useResponsiveLayout();
  const { householdState, debug } = usePlatformShellData();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const goalSnapshot = useMemo(
    () =>
      loadRetirementGoalSnapshot({
        userId: debug.authUserId || null,
        householdId: debug.householdId || null,
      }),
    [debug.authUserId, debug.householdId]
  );

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      queueMicrotask(() => {
        setLoading(false);
      });
      return;
    }

    let active = true;

    async function loadAccounts() {
      setLoading(true);
      const result = await listRetirementAccounts(householdState.context.householdId);
      if (!active) return;
      setAccounts(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadAccounts();
    return () => {
      active = false;
    };
  }, [householdState.loading, householdState.context.householdId]);

  const summaryItems = useMemo(() => {
    const majorCategoryCounts = accounts.reduce(
      (accumulator, account) => {
        const retirementType = getRetirementType(account.retirement_type_key);
        const category = retirementType?.major_category || "other";
        accumulator[category] = (accumulator[category] || 0) + 1;
        return accumulator;
      },
      {}
    );

    const activeCount = accounts.filter((account) => account.plan_status === "active").length;

    return [
      {
        label: "Retirement Accounts",
        value: accounts.length,
        helper: "Live retirement module records",
      },
      {
        label: "Employer Plans",
        value: majorCategoryCounts.employer_plan || 0,
        helper: "401(k), 403(b), TSP, and related plans",
      },
      {
        label: "IRAs",
        value: majorCategoryCounts.ira || 0,
        helper: "Traditional, Roth, rollover, and inherited IRA records",
      },
      {
        label: "Pensions",
        value: majorCategoryCounts.pension || 0,
        helper: "Defined benefit and pension-style records",
      },
      {
        label: "Active",
        value: activeCount,
        helper: `${accounts.length - activeCount} non-active records`,
      },
    ];
  }, [accounts]);

  const starterInsightCounts = useMemo(() => {
    return accounts.reduce(
      (accumulator, account) => {
        const retirementType = getRetirementType(account.retirement_type_key);
        const status = String(account.plan_status || "").toLowerCase();
        if (retirementType?.benefit_based || account.is_benefit_based) {
          accumulator.pensionStyle += 1;
        }
        if (
          retirementType?.employer_sponsored &&
          ["inactive", "terminated", "frozen", "payout_only"].includes(status)
        ) {
          accumulator.rolloverCandidates += 1;
        }
        return accumulator;
      },
      {
        pensionStyle: 0,
        rolloverCandidates: 0,
      }
    );
  }, [accounts]);

  const readinessSnapshot = useMemo(() => {
    if (!goalSnapshot?.readiness && !goalSnapshot?.goalForm) return null;
    if (goalSnapshot?.readiness) return goalSnapshot.readiness;
    return scoreRetirementGoal({
      ...goalSnapshot.goalForm,
      currentAssets: goalSnapshot?.plannerSnapshot?.currentAssets || 0,
      annualContribution: goalSnapshot?.plannerSnapshot?.annualContribution || 0,
    });
  }, [goalSnapshot]);

  const retirementHouseholdRead = useMemo(
    () =>
      summarizeRetirementHousehold({
        accounts,
        readinessSnapshot,
      }),
    [accounts, readinessSnapshot]
  );
  const retirementHubCommand = useMemo(
    () =>
      buildRetirementHubCommand({
        accounts,
        readinessSnapshot,
        retirementHouseholdRead,
      }),
    [accounts, readinessSnapshot, retirementHouseholdRead]
  );

  async function refreshAccounts() {
    if (!householdState.context.householdId) return;
    const result = await listRetirementAccounts(householdState.context.householdId);
    setAccounts(result.data || []);
    setLoadError(result.error?.message || "");
  }

  async function handleCreateAccount(event) {
    event.preventDefault();
    if (!householdState.context.householdId || !form.retirement_type_key) return;

    setCreating(true);
    setCreateError("");

    const result = await createRetirementAssetWithAccount({
      household_id: householdState.context.householdId,
      retirement_type_key: form.retirement_type_key,
      plan_name: form.plan_name,
      institution_name: form.institution_name,
      provider_key: form.provider_key || null,
      account_owner: form.account_owner,
      participant_name: form.participant_name,
      employer_name: form.employer_name,
      plan_status: form.plan_status,
    });

    if (result.error) {
      setCreateError(result.error.message || "Retirement account could not be created.");
      setCreating(false);
      return;
    }

    await refreshAccounts();
    setForm(DEFAULT_FORM);
    setCreating(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Retirement"
        title="Retirement Hub"
        description="Live retirement registry for employer plans, IRAs, pensions, and future continuity intelligence."
        actions={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={() => onNavigate?.("/household-goals")}
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                borderRadius: "10px",
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Open Goals Dashboard
            </button>
            <button
              onClick={() => onNavigate?.("/retirement/upload")}
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                borderRadius: "10px",
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Retirement Upload Preview
            </button>
            <button
              onClick={() => refreshAccounts()}
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                borderRadius: "10px",
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Refresh Retirement Data
            </button>
          </div>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div style={{ marginTop: "24px" }}>
        <SectionCard
          title="Retirement Command Center"
          subtitle="The strongest household retirement blockers, why they matter, and what to do next."
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <AIInsightPanel
              title="Household Retirement Command"
              summary={retirementHubCommand.headline}
              bullets={[
                `${retirementHubCommand.metrics.total || 0} retirement account${retirementHubCommand.metrics.total === 1 ? "" : "s"} are tracked.`,
                `${retirementHubCommand.metrics.active || 0} account${retirementHubCommand.metrics.active === 1 ? "" : "s"} are active.`,
                `${retirementHubCommand.metrics.attention || 0} command item${retirementHubCommand.metrics.attention === 1 ? "" : "s"} are surfaced as next moves.`,
              ]}
            />
            {retirementHubCommand.rows.length > 0 ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {retirementHubCommand.rows.map((item) => (
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
                title="No active retirement blockers"
                description="The retirement module currently reads as relatively stable at the household level."
              />
            )}
          </div>
        </SectionCard>
      </div>

      <div
        style={{
          marginTop: "24px",
          display: "grid",
          gridTemplateColumns: isTablet ? "1fr" : "1.35fr 1fr",
          gap: "18px",
          alignItems: "start",
        }}
      >
        <SectionCard title="Retirement Accounts" subtitle="Live household retirement records linked into the broader platform asset layer.">
          {householdState.loading || loading ? (
            <div style={{ color: "#64748b" }}>Loading retirement accounts...</div>
          ) : loadError ? (
            <EmptyState title="Retirement data unavailable" description={loadError} />
          ) : accounts.length === 0 ? (
            <EmptyState
              title="No retirement accounts yet"
              description="Create the first retirement account to start building a usable retirement view with statements, positions, and future planning context."
            />
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {accounts.map((account) => {
                const retirementType = getRetirementType(account.retirement_type_key);
                const linkedAsset = account.assets || null;

                return (
                  <button
                    key={account.id}
                    onClick={() => onNavigate(`/retirement/detail/${account.id}`)}
                    style={{
                      textAlign: "left",
                      width: "100%",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      borderRadius: "14px",
                      padding: "16px",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                          {account.plan_name || linkedAsset?.asset_name || "Retirement Account"}
                        </div>
                        <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6" }}>
                          {retirementType?.display_name || account.retirement_type_key}
                          {" | "}
                          {account.institution_name || linkedAsset?.institution_name || "Institution pending"}
                        </div>
                      </div>
                      <StatusBadge label={account.plan_status || "unknown"} tone={getStatusTone(account.plan_status)} />
                    </div>

                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <StatusBadge label={formatCategoryLabel(retirementType?.major_category)} tone="info" />
                      <StatusBadge label={account.is_account_based ? "Account-Based" : "Not Account-Based"} tone="neutral" />
                      <StatusBadge label={account.is_benefit_based ? "Benefit-Based" : "Not Benefit-Based"} tone="neutral" />
                      <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
                    </div>

                    <div
                      style={{
                        marginTop: "12px",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "10px",
                        color: "#475569",
                      }}
                    >
                      <div><strong>Owner:</strong> {account.account_owner || "Limited visibility"}</div>
                      <div><strong>Participant:</strong> {account.participant_name || "Limited visibility"}</div>
                      <div><strong>Employer:</strong> {account.employer_name || "Limited visibility"}</div>
                      <div><strong>Asset Subcategory:</strong> {linkedAsset?.asset_subcategory || account.retirement_type_key}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div style={{ display: "grid", gap: "18px" }}>
          <SectionCard title="Retirement Goal Snapshot" subtitle="Your saved retirement goal and readiness estimate travel with this household.">
            {readinessSnapshot ? (
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: "999px",
                      background: getReadinessTone(readinessSnapshot.readinessStatus).background,
                      color: getReadinessTone(readinessSnapshot.readinessStatus).color,
                      fontWeight: 700,
                      fontSize: "12px",
                    }}
                  >
                    {readinessSnapshot.readinessStatus}
                  </div>
                  <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>
                    {readinessSnapshot.readinessScore}/100
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", color: "#475569" }}>
                  <div><strong>Projected Balance:</strong> {formatCurrency(readinessSnapshot.projectedRetirementBalance)}</div>
                  <div><strong>Income Gap:</strong> {formatCurrency(readinessSnapshot.estimatedIncomeGapMonthly)}/month</div>
                  <div><strong>Non-Portfolio Income:</strong> {formatCurrency(readinessSnapshot.estimatedNonPortfolioIncomeMonthly)}/month</div>
                  <div><strong>Saved Assets Basis:</strong> {formatCurrency(goalSnapshot?.plannerSnapshot?.currentAssets ?? readinessSnapshot.inputs?.currentAssets)}</div>
                </div>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>{readinessSnapshot.explanation}</div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(readinessSnapshot.assumptionLines || []).map((item) => (
                    <div
                      key={item}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: "#f8fafc",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        color: "#64748b",
                        fontSize: "12px",
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("/household-goals")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Open Goals Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("/retirement/upload")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Update Retirement Goal
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "14px" }}>
                <EmptyState
                  title="No retirement goal saved yet"
                  description="Open the retirement upload planner to set a target retirement age, income goal, and first readiness estimate for this household."
                />
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("/household-goals")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Open Goals Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("/retirement/upload")}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Set Retirement Goal
                  </button>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Create Retirement Account" subtitle="Start with the core account record, then add documents, positions, and deeper review detail over time.">
            <form onSubmit={handleCreateAccount} style={{ display: "grid", gap: "12px" }}>
              <select
                value={form.retirement_type_key}
                onChange={(event) => setForm((current) => ({ ...current, retirement_type_key: event.target.value }))}
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
              >
                {RETIREMENT_TYPES.map((type) => (
                  <option key={type.retirement_type_key} value={type.retirement_type_key}>
                    {type.display_name} | {formatCategoryLabel(type.major_category)}
                  </option>
                ))}
              </select>
              <input
                value={form.plan_name}
                onChange={(event) => setForm((current) => ({ ...current, plan_name: event.target.value }))}
                placeholder="Plan or account name"
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
              />
              <select
                value={form.provider_key}
                onChange={(event) => setForm((current) => ({ ...current, provider_key: event.target.value }))}
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
              >
                <option value="">No provider registry match yet</option>
                {RETIREMENT_PROVIDERS.map((provider) => (
                  <option key={provider.institution_key} value={provider.institution_key}>
                    {provider.display_name}
                  </option>
                ))}
              </select>
              <input
                value={form.institution_name}
                onChange={(event) => setForm((current) => ({ ...current, institution_name: event.target.value }))}
                placeholder="Institution name"
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
              />
              <input
                value={form.account_owner}
                onChange={(event) => setForm((current) => ({ ...current, account_owner: event.target.value }))}
                placeholder="Account owner"
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
              />
              <input
                value={form.participant_name}
                onChange={(event) => setForm((current) => ({ ...current, participant_name: event.target.value }))}
                placeholder="Participant name"
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
              />
              <input
                value={form.employer_name}
                onChange={(event) => setForm((current) => ({ ...current, employer_name: event.target.value }))}
                placeholder="Employer name"
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
              />
              <select
                value={form.plan_status}
                onChange={(event) => setForm((current) => ({ ...current, plan_status: event.target.value }))}
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="terminated">terminated</option>
                <option value="frozen">frozen</option>
                <option value="payout_only">payout_only</option>
              </select>
              <button
                type="submit"
                disabled={creating || !householdState.context.householdId}
                style={{
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#0f172a",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {creating ? "Creating Retirement Account..." : "Create Retirement Account"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{createError}</div> : null}
              {householdState.error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{householdState.error}</div> : null}
            </form>
          </SectionCard>

          <SectionCard title="Retirement Readiness">
            <AIInsightPanel
              title="Foundation Readiness"
              summary={
                accounts.length > 0
                  ? retirementHouseholdRead.headline
                  : "The retirement module is live-ready but still waiting for its first account record."
              }
              bullets={
                accounts.length > 0
                  ? [
                      ...retirementHouseholdRead.notes,
                      `Starter rollover review candidates: ${starterInsightCounts.rolloverCandidates}`,
                      "Loan and beneficiary visibility will strengthen as retirement documents are parsed into analytics records.",
                    ]
                  : [
                      "Retirement account creation now establishes the core record and its linked retirement detail view.",
                      `Pension-style accounts detected: ${starterInsightCounts.pensionStyle}`,
                      `Starter rollover review candidates: ${starterInsightCounts.rolloverCandidates}`,
                      "Loan and beneficiary visibility will strengthen as retirement documents are parsed into analytics records.",
                    ]
              }
            />
          </SectionCard>
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Retirement Debug: household={householdState.context.householdId || "none"} | accounts={accounts.length} | loading={loading ? "yes" : "no"} | loadError={loadError || "none"} | createError={createError || "none"}
        </div>
      ) : null}
    </div>
  );
}
