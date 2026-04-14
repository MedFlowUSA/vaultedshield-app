import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import {
  buildMortgageReviewSignals,
  getMortgageLoanType,
  listMortgageLenders,
  listMortgageLoanTypes,
  summarizeMortgageHousehold,
} from "../lib/domain/mortgage";
import {
  createMortgageLoanWithDependencies,
  listMortgageLoans,
} from "../lib/supabase/mortgageData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import { buildMortgageHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";

const MORTGAGE_LOAN_TYPES = listMortgageLoanTypes();
const MORTGAGE_LENDERS = listMortgageLenders();

const DEFAULT_FORM = {
  mortgage_loan_type_key: "conventional_fixed_mortgage",
  loan_name: "",
  property_address: "",
  lender_key: "",
  borrower_name: "",
  origination_date: "",
  maturity_date: "",
  current_status: "active",
};

function getStatusTone(status) {
  if (status === "active" || status === "current") return "good";
  if (status === "watch" || status === "modification_review") return "warning";
  if (status === "paid_off" || status === "closed" || status === "delinquent") return "info";
  return "info";
}

export default function MortgageHubPage({ onNavigate }) {
  const { householdState } = usePlatformShellData();
  const [mortgageLoans, setMortgageLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const canCreateMortgage =
    Boolean(householdState.context.currentAuthUserId) && !householdState.loading;

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      setLoading(false);
      return;
    }

    let active = true;
    async function loadMortgageLoans() {
      setLoading(true);
      const result = await listMortgageLoans(householdState.context.householdId);
      if (!active) return;
      setMortgageLoans(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadMortgageLoans();
    return () => {
      active = false;
    };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshMortgageLoans(targetHouseholdId = householdState.context.householdId) {
    if (!targetHouseholdId) return;
    const result = await listMortgageLoans(targetHouseholdId);
    setMortgageLoans(result.data || []);
    setLoadError(result.error?.message || "");
  }

  const summaryItems = useMemo(() => {
    const activeCount = mortgageLoans.filter((loan) =>
      ["active", "current"].includes(loan.current_status)
    ).length;
    const householdSummary = summarizeMortgageHousehold(mortgageLoans);

    const categoryCount = mortgageLoans.reduce((accumulator, loan) => {
      const loanType = getMortgageLoanType(loan.mortgage_loan_type_key);
      const key = loanType?.major_category || "other";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return [
      { label: "Mortgage Loans", value: mortgageLoans.length, helper: "Live mortgage module records" },
      { label: "Primary Loans", value: (categoryCount.primary_mortgage || 0) + (categoryCount.government_backed || 0), helper: "Primary home and government-backed mortgage records" },
      { label: "Equity / Junior", value: (categoryCount.equity_line || 0) + (categoryCount.junior_lien || 0), helper: "HELOC and second-lien style records" },
      { label: "Active", value: activeCount, helper: `${mortgageLoans.length - activeCount} non-active records` },
      { label: "Needs Review", value: householdSummary.needsReviewCount, helper: `${householdSummary.reviewSoonCount} more loans merit near-term review` },
    ];
  }, [mortgageLoans]);

  const householdMortgageSummary = useMemo(
    () => summarizeMortgageHousehold(mortgageLoans),
    [mortgageLoans]
  );
  const mortgageHubCommand = useMemo(
    () =>
      buildMortgageHubCommand({
        mortgageLoans,
        householdMortgageSummary,
      }),
    [householdMortgageSummary, mortgageLoans]
  );

  async function handleCreateMortgageLoan(event) {
    event.preventDefault();
    if (creating) return;
    if (!canCreateMortgage || !form.mortgage_loan_type_key) {
      if (!householdState.context.currentAuthUserId) {
        setCreateError("Please sign in before creating a mortgage loan.");
      }
      if (import.meta.env.DEV && !canCreateMortgage) {
        console.warn("[VaultedShield] mortgage creation attempted before household ownership was resolved in the UI.", {
          householdId: householdState.context.householdId || null,
          ownershipMode: householdState.context.ownershipMode || "unknown",
        });
      }
      return;
    }

    setCreating(true);
    setCreateError("");
    const result = await createMortgageLoanWithDependencies({
      household_id: householdState.context.householdId || null,
      mortgage_loan_type_key: form.mortgage_loan_type_key,
      loan_name: form.loan_name,
      property_address: form.property_address,
      lender_key: form.lender_key || null,
      borrower_name: form.borrower_name,
      origination_date: form.origination_date || null,
      maturity_date: form.maturity_date || null,
      current_status: form.current_status,
    });

    if (result.error) {
      if (import.meta.env.DEV) {
        console.warn("[VaultedShield] mortgage creation failed in MortgageHubPage", {
          error: result.error.message || null,
          householdId: householdState.context.householdId || null,
          authUserId: householdState.context.currentAuthUserId || null,
        });
      }
      setCreateError(result.error.message || "We could not create this mortgage loan yet. Please try again.");
      setCreating(false);
      return;
    }

    await refreshMortgageLoans(result.data?.householdId || householdState.context.householdId);
    setForm(DEFAULT_FORM);
    setCreating(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title="Mortgage Hub"
        description="Live mortgage registry for loan shells, document intake, payoff tracking, and future servicing intelligence."
        actions={
          <button
            onClick={() => refreshMortgageLoans()}
            style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
          >
            Refresh Mortgage Data
          </button>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div style={{ marginTop: "24px" }}>
        <SectionCard
          title="Mortgage Command Center"
          subtitle="The strongest debt blockers, what they put at risk, and the next move to keep household financing steady."
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <AIInsightPanel
              title="Household Mortgage Command"
              summary={mortgageHubCommand.headline}
              bullets={[
                `${mortgageHubCommand.metrics.total || 0} mortgage loan${mortgageHubCommand.metrics.total === 1 ? "" : "s"} are tracked.`,
                `${mortgageHubCommand.metrics.active || 0} loan${mortgageHubCommand.metrics.active === 1 ? "" : "s"} are active or current.`,
                `${mortgageHubCommand.metrics.attention || 0} command item${mortgageHubCommand.metrics.attention === 1 ? "" : "s"} are surfaced as next moves.`,
              ]}
            />
            {mortgageHubCommand.rows.length > 0 ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {mortgageHubCommand.rows.map((item) => (
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
                title="No active mortgage blockers"
                description="The mortgage module currently reads as relatively steady at the household level."
              />
            )}
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "18px", alignItems: "start" }}>
        <SectionCard title="Mortgage Loans" subtitle="Live household mortgage records linked into the broader platform asset layer.">
          {householdState.loading || loading ? (
            <div style={{ color: "#64748b" }}>Loading mortgage loans...</div>
          ) : loadError ? (
            <EmptyState title="Mortgage data unavailable" description={loadError} />
          ) : mortgageLoans.length === 0 ? (
            <EmptyState
              title="No mortgage loans yet"
              description="Create the first mortgage loan to start building a usable financing view with statements, escrow visibility, and ongoing review support."
            />
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {mortgageLoans.map((loan) => {
                const loanType = getMortgageLoanType(loan.mortgage_loan_type_key);
                const linkedAsset = loan.assets || null;
                const loanReview = buildMortgageReviewSignals({ mortgageLoan: loan });
                return (
                  <button
                    key={loan.id}
                    onClick={() => onNavigate(`/mortgage/detail/${loan.id}`)}
                    style={{ textAlign: "left", width: "100%", border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "14px", padding: "16px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                          {loan.loan_name || linkedAsset?.asset_name || loan.property_address || "Mortgage Loan"}
                        </div>
                        <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6" }}>
                          {loanType?.display_name || loan.mortgage_loan_type_key}
                          {" | "}
                          {linkedAsset?.institution_name || loan.lender_key || "Servicer pending"}
                        </div>
                      </div>
                      <StatusBadge label={loan.current_status || "unknown"} tone={getStatusTone(loan.current_status)} />
                    </div>

                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <StatusBadge label={loanType?.major_category || "mortgage"} tone="info" />
                      <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
                      <StatusBadge label={loanReview.readinessStatus} tone={loanReview.readinessStatus === "Better Supported" ? "good" : loanReview.readinessStatus === "Review Soon" ? "warning" : "alert"} />
                    </div>

                    <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", color: "#475569" }}>
                      <div><strong>Borrower:</strong> {loan.borrower_name || "Limited visibility"}</div>
                      <div><strong>Property:</strong> {loan.property_address || "Limited visibility"}</div>
                      <div><strong>Originated:</strong> {loan.origination_date || "Limited visibility"}</div>
                      <div><strong>Matures:</strong> {loan.maturity_date || "Limited visibility"}</div>
                    </div>
                    <div style={{ marginTop: "12px", color: "#475569", lineHeight: "1.7" }}>
                      {loanReview.headline}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div style={{ display: "grid", gap: "18px" }}>
          <SectionCard title="Create Mortgage Loan" subtitle="Start with the core loan record, then deepen it with documents, property linkage, and review details.">
            <form onSubmit={handleCreateMortgageLoan} style={{ display: "grid", gap: "12px" }}>
              <select value={form.mortgage_loan_type_key} onChange={(event) => setForm((current) => ({ ...current, mortgage_loan_type_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                {MORTGAGE_LOAN_TYPES.map((type) => (
                  <option key={type.mortgage_loan_type_key} value={type.mortgage_loan_type_key}>
                    {type.display_name} | {type.major_category}
                  </option>
                ))}
              </select>
              <input value={form.loan_name} onChange={(event) => setForm((current) => ({ ...current, loan_name: event.target.value }))} placeholder="Loan name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input value={form.property_address} onChange={(event) => setForm((current) => ({ ...current, property_address: event.target.value }))} placeholder="Property address" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.lender_key} onChange={(event) => setForm((current) => ({ ...current, lender_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="">No lender registry match yet</option>
                {MORTGAGE_LENDERS.map((lender) => (
                  <option key={lender.lender_key} value={lender.lender_key}>
                    {lender.display_name}
                  </option>
                ))}
              </select>
              <input value={form.borrower_name} onChange={(event) => setForm((current) => ({ ...current, borrower_name: event.target.value }))} placeholder="Borrower name" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input type="date" value={form.origination_date} onChange={(event) => setForm((current) => ({ ...current, origination_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <input type="date" value={form.maturity_date} onChange={(event) => setForm((current) => ({ ...current, maturity_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
              <select value={form.current_status} onChange={(event) => setForm((current) => ({ ...current, current_status: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                <option value="active">active</option>
                <option value="current">current</option>
                <option value="watch">watch</option>
                <option value="modification_review">modification_review</option>
                <option value="delinquent">delinquent</option>
                <option value="paid_off">paid_off</option>
                <option value="closed">closed</option>
              </select>
              <button type="submit" disabled={creating || !canCreateMortgage} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: creating || !canCreateMortgage ? "not-allowed" : "pointer", fontWeight: 700, opacity: creating || !canCreateMortgage ? 0.7 : 1 }}>
                {creating ? "Creating Mortgage Loan..." : "Create Mortgage Loan"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{createError}</div> : null}
              {householdState.error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{householdState.error}</div> : null}
              {!householdState.context.currentAuthUserId && !householdState.loading ? (
                <div style={{ color: "#991b1b", fontSize: "14px" }}>
                  Please sign in before creating a mortgage loan.
                </div>
              ) : null}
              {householdState.context.currentAuthUserId && !canCreateMortgage ? (
                <div style={{ color: "#991b1b", fontSize: "14px" }}>
                  We could not initialize your household profile yet. Please try again.
                </div>
              ) : null}
            </form>
          </SectionCard>

          <SectionCard title="Mortgage Readiness">
            <AIInsightPanel
              title="Foundation Readiness"
              summary={
                mortgageLoans.length > 0
                  ? householdMortgageSummary.headline
                  : "The mortgage module is live-ready but still waiting for its first loan record."
              }
              bullets={
                mortgageLoans.length > 0
                  ? [
                      ...householdMortgageSummary.notes,
                      "Mortgage detail pages now surface payoff-readiness, refinance review, and document-support signals from current records.",
                    ]
                  : [
                      "Mortgage loan creation now establishes the core record and its linked financing detail view.",
                      "Mortgage detail pages are ready for linked documents, snapshots, and broader continuity context.",
                    ]
              }
            />
          </SectionCard>
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Mortgage Debug: household={householdState.context.householdId || "none"} | loans={mortgageLoans.length} | loading={loading ? "yes" : "no"} | loadError={loadError || "none"} | createError={createError || "none"}
        </div>
      ) : null}
    </div>
  );
}
