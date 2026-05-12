import { useEffect, useMemo, useRef, useState } from "react";
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
          {tone === "good" ? "Good" : tone === "warning" ? "Watch" : "Act"}
        </span>
      </div>
      <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>{detail}</div>
    </div>
  );
}

function LoanStatusTone(status) {
  if (status === "active" || status === "current") return "good";
  if (status === "watch" || status === "modification_review") return "warning";
  if (status === "delinquent") return "alert";
  return "neutral";
}

function LoanCard({ loan, onNavigate }) {
  const loanType = getMortgageLoanType(loan.mortgage_loan_type_key);
  const linkedAsset = loan.assets || null;
  const loanReview = buildMortgageReviewSignals({ mortgageLoan: loan });
  const name = loan.loan_name || linkedAsset?.asset_name || loan.property_address || "Mortgage Loan";
  const statusTone = LoanStatusTone(loan.current_status);

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(`/mortgage/detail/${loan.id}`)}
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
            {loanType?.display_name || loan.mortgage_loan_type_key}
            {linkedAsset?.institution_name || loan.lender_key ? ` · ${linkedAsset?.institution_name || loan.lender_key}` : ""}
          </div>
        </div>
        <StatusPill label={loan.current_status || "unknown"} tone={statusTone} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: "8px" }}>
        {loan.borrower_name ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Borrower:</span> {loan.borrower_name}</div> : null}
        {loan.property_address ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Property:</span> {loan.property_address}</div> : null}
        {loan.origination_date ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Originated:</span> {loan.origination_date}</div> : null}
        {loan.maturity_date ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Matures:</span> {loan.maturity_date}</div> : null}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <StatusPill label={loanType?.major_category?.replace("_", " ") || "mortgage"} tone="neutral" />
        <StatusPill label={linkedAsset?.id ? "Asset Linked" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
        <StatusPill
          label={loanReview.readinessStatus}
          tone={loanReview.readinessStatus === "Better Supported" ? "good" : loanReview.readinessStatus === "Review Soon" ? "warning" : "alert"}
        />
      </div>

      {loanReview.headline ? (
        <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>{loanReview.headline}</div>
      ) : null}
    </button>
  );
}

function EmptyLoansPanel({ onScrollToForm }) {
  const types = [
    { icon: "🏠", label: "Primary Mortgage", desc: "Fixed or adjustable home loan" },
    { icon: "🏦", label: "FHA / VA Loan", desc: "Government-backed mortgage" },
    { icon: "💳", label: "HELOC", desc: "Home equity line of credit" },
    { icon: "🏗️", label: "Construction Loan", desc: "Financing for new builds" },
  ];
  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div style={{ fontSize: "15px", color: "#475569", lineHeight: "1.7" }}>
        Start with the primary home loan. One record gives the household its financing anchor — statements, payoff analysis, and refinance review can follow.
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
      <ActionButton label="Add First Loan" onClick={onScrollToForm} primary />
    </div>
  );
}

function CommandRow({ item }) {
  const tone = item.urgency === "critical" ? "alert" : "warning";
  return (
    <div style={{ ...surfaceCard({ padding: "16px 20px" }), display: "grid", gap: "8px", borderLeft: `4px solid ${tone === "alert" ? "#fecaca" : "#fde68a"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
        <StatusPill label={item.urgencyMeta?.badge || item.urgency} tone={tone} />
      </div>
      {item.blocker ? <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}><strong>Gap:</strong> {item.blocker}</div> : null}
      {item.consequence ? <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}><strong>Risk:</strong> {item.consequence}</div> : null}
      {item.nextAction ? <div style={{ fontSize: "13px", color: tone === "alert" ? "#991b1b" : "#92400e", fontWeight: 700 }}>Next: {item.nextAction}</div> : null}
    </div>
  );
}

export default function MortgageHubPage({ onNavigate }) {
  const { householdState } = usePlatformShellData();
  const loansRef = useRef(null);
  const addFormRef = useRef(null);

  const [mortgageLoans, setMortgageLoans] = useState([]);
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
      setLoading(false);
      return;
    }

    let active = true;
    async function loadLoans() {
      setLoading(true);
      const result = await listMortgageLoans(householdState.context.householdId);
      if (!active) return;
      setMortgageLoans(result.data || []);
      setLoadError(result.error?.message || "");
      setLoading(false);
    }

    loadLoans();
    return () => { active = false; };
  }, [householdState.loading, householdState.context.householdId]);

  async function refreshLoans(targetId = householdState.context.householdId) {
    if (!targetId) return;
    const result = await listMortgageLoans(targetId);
    setMortgageLoans(result.data || []);
    setLoadError(result.error?.message || "");
  }

  async function handleCreateLoan(event) {
    event.preventDefault();
    if (creating || !canCreate || !form.mortgage_loan_type_key) return;

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
      setCreateError(result.error.message || "Loan could not be created. Please try again.");
      setCreating(false);
      return;
    }

    await refreshLoans(result.data?.householdId || householdState.context.householdId);
    setForm(DEFAULT_FORM);
    setCreating(false);
    setShowAddForm(false);
  }

  const householdMortgageSummary = useMemo(() => summarizeMortgageHousehold(mortgageLoans), [mortgageLoans]);
  const mortgageHubCommand = useMemo(
    () => buildMortgageHubCommand({ mortgageLoans, householdMortgageSummary }),
    [mortgageLoans, householdMortgageSummary]
  );

  const { activeCount, delinquentCount, missingMaturity } = useMemo(() => ({
    activeCount: mortgageLoans.filter((l) => ["active", "current"].includes(l.current_status)).length,
    delinquentCount: mortgageLoans.filter((l) => l.current_status === "delinquent").length,
    missingMaturity: mortgageLoans.filter((l) => !l.maturity_date).length,
  }), [mortgageLoans]);

  const checkpoints = useMemo(() => [
    {
      icon: "📋",
      label: "Financing Documented",
      status: mortgageLoans.length > 0 ? "good" : "alert",
      detail: mortgageLoans.length > 0
        ? `${mortgageLoans.length} loan${mortgageLoans.length === 1 ? "" : "s"} on record — ${activeCount} active.`
        : "No mortgage loans logged yet. The primary home loan is the most impactful first record.",
    },
    {
      icon: "✅",
      label: "No Delinquency Signals",
      status: delinquentCount === 0 ? "good" : "alert",
      detail: delinquentCount > 0
        ? `${delinquentCount} loan${delinquentCount === 1 ? "" : "s"} flagged as delinquent — review immediately to protect credit and homeownership.`
        : mortgageLoans.length > 0
          ? "All loans are current — no delinquency signals detected."
          : "Add loans to enable delinquency monitoring.",
    },
    {
      icon: "📅",
      label: "Maturity Dates Recorded",
      status: missingMaturity === 0 && mortgageLoans.length > 0 ? "good" : missingMaturity > 0 ? "warning" : "alert",
      detail: missingMaturity > 0
        ? `${missingMaturity} loan${missingMaturity === 1 ? "" : "s"} missing a maturity date — add it so payoff and balloon risk are visible.`
        : mortgageLoans.length > 0
          ? "All loans have maturity dates — payoff timelines are visible."
          : "Add loans to track maturity dates.",
    },
  ], [mortgageLoans, activeCount, delinquentCount, missingMaturity]);

  function scrollToAddForm() {
    setShowAddForm(true);
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const inputStyle = { padding: "11px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "14px", background: "#ffffff", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "grid", gap: "24px" }}>

      {/* Hero */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #3b0764 100%)",
          borderRadius: "22px",
          padding: "32px 32px 28px",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#d8b4fe" }}>
            Financing & Debt
          </div>
          <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.15" }}>Mortgage Hub</div>
          <div style={{ fontSize: "15px", color: "#cbd5e1", lineHeight: "1.6", maxWidth: "600px" }}>
            The household's largest monthly obligation — and the most frequently undermanaged. Know what's owed, to whom, and when each loan matures.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
          {[
            { label: "Total Loans", value: loading ? "—" : mortgageLoans.length },
            { label: "Active", value: loading ? "—" : activeCount },
            { label: "Delinquent", value: loading ? "—" : delinquentCount },
            { label: "Action Items", value: loading ? "—" : mortgageHubCommand.rows.length },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px", display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "22px", fontWeight: 900 }}>{stat.value}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton label={mortgageLoans.length > 0 ? "Add Another Loan" : "Add First Loan"} onClick={scrollToAddForm} primary />
          <ActionButton label="View Loans" onClick={() => loansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        </div>
      </div>

      {/* Action tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            icon: "🏦",
            label: "Loans Tracked",
            value: `${mortgageLoans.length} loan${mortgageLoans.length === 1 ? "" : "s"}`,
            sub: mortgageLoans.length > 0 ? `${activeCount} active · ${mortgageLoans.length - activeCount} other` : "No loans on record.",
            tone: mortgageLoans.length > 0 ? "good" : "alert",
          },
          {
            icon: "⚠️",
            label: "Command Items",
            value: mortgageHubCommand.rows.length > 0 ? `${mortgageHubCommand.rows.length} need attention` : "No gaps detected",
            sub: mortgageHubCommand.rows.length > 0 ? mortgageHubCommand.rows[0]?.blocker || "See below." : householdMortgageSummary.headline || "Financing appears steady.",
            tone: mortgageHubCommand.rows.length > 0 ? "warning" : "good",
          },
          {
            icon: "📊",
            label: "Review Status",
            value: delinquentCount > 0 ? `${delinquentCount} delinquent` : missingMaturity > 0 ? `${missingMaturity} missing dates` : "All current",
            sub: delinquentCount > 0 ? "Delinquency detected — immediate review needed." : missingMaturity > 0 ? "Add maturity dates to complete financing visibility." : "Loan records are current and complete.",
            tone: delinquentCount > 0 ? "alert" : missingMaturity > 0 ? "warning" : "good",
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
        <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Financing Readiness Checkpoints</div>
        <div style={{ display: "grid", gap: "10px" }}>
          {checkpoints.map((cp) => <ReadinessCheckpoint key={cp.label} {...cp} />)}
        </div>
      </div>

      {/* Command center */}
      {mortgageHubCommand.rows.length > 0 ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Continuity Command Center</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Active blockers across household mortgage records.</div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {mortgageHubCommand.rows.map((item) => <CommandRow key={item.id} item={item} />)}
          </div>
        </div>
      ) : null}

      {/* Loan list */}
      <div ref={loansRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Mortgage Loans</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
              {mortgageLoans.length > 0 ? `${mortgageLoans.length} loan${mortgageLoans.length === 1 ? "" : "s"} — click to open detail` : "No loans recorded yet"}
            </div>
          </div>
          <ActionButton label="+ Add Loan" onClick={scrollToAddForm} primary />
        </div>

        {householdState.loading || loading ? (
          <div style={{ ...surfaceCard(), color: "#64748b", fontSize: "14px" }}>Loading mortgage loans...</div>
        ) : loadError ? (
          <div style={{ ...surfaceCard(), color: "#991b1b", fontSize: "14px" }}>{loadError}</div>
        ) : mortgageLoans.length === 0 ? (
          <div style={{ ...surfaceCard() }}>
            <EmptyLoansPanel onScrollToForm={scrollToAddForm} />
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {mortgageLoans.map((loan) => <LoanCard key={loan.id} loan={loan} onNavigate={onNavigate} />)}
          </div>
        )}
      </div>

      {/* Add loan form */}
      <div ref={addFormRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Add a Mortgage Loan</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Start with the basics — statements and payoff analysis come in the detail view.</div>
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
            <form onSubmit={handleCreateLoan} style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { key: "mortgage_loan_type_key", label: "Loan Type", isSelect: true, options: MORTGAGE_LOAN_TYPES.map((t) => ({ value: t.mortgage_loan_type_key, label: t.display_name })) },
                  { key: "loan_name", label: "Loan Name", placeholder: "e.g. Primary Home Loan" },
                  { key: "borrower_name", label: "Borrower Name", placeholder: "Name on loan" },
                  { key: "property_address", label: "Property Address", placeholder: "Street address" },
                  { key: "lender_key", label: "Lender", isSelect: true, options: [{ value: "", label: "No match yet" }, ...MORTGAGE_LENDERS.map((l) => ({ value: l.lender_key, label: l.display_name }))] },
                  { key: "current_status", label: "Status", isSelect: true, options: ["active", "current", "watch", "modification_review", "delinquent", "paid_off", "closed"].map((v) => ({ value: v, label: v })) },
                  { key: "origination_date", label: "Origination Date", type: "date" },
                  { key: "maturity_date", label: "Maturity Date", type: "date" },
                ].map((field) => (
                  <div key={field.key} style={field.key === "property_address" ? { gridColumn: "1 / -1" } : {}}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>
                      {field.label}
                    </label>
                    {field.isSelect ? (
                      <select value={form[field.key]} onChange={(e) => setForm((c) => ({ ...c, [field.key]: e.target.value }))} style={inputStyle}>
                        {field.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.type || "text"}
                        value={form[field.key]}
                        onChange={(e) => setForm((c) => ({ ...c, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        style={inputStyle}
                      />
                    )}
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={creating || !canCreate}
                style={{ padding: "13px 20px", borderRadius: "10px", border: "none", background: creating || !canCreate ? "#94a3b8" : "#0f172a", color: "#ffffff", fontWeight: 800, fontSize: "15px", cursor: creating || !canCreate ? "default" : "pointer", marginTop: "4px" }}
              >
                {creating ? "Saving..." : "Save Loan Record"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "13px" }}>{createError}</div> : null}
              {!householdState.context.currentAuthUserId && !householdState.loading ? (
                <div style={{ color: "#991b1b", fontSize: "13px" }}>Please sign in before creating a loan.</div>
              ) : null}
            </form>
          </div>
        ) : null}
      </div>

      {/* Why This Matters */}
      <div
        style={{
          background: "linear-gradient(135deg, #3b0764 0%, #1e1b4b 50%, #0f172a 100%)",
          borderRadius: "22px",
          padding: "36px 32px",
          color: "#ffffff",
          display: "grid",
          gap: "28px",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#d8b4fe" }}>
            Why This Module Matters
          </div>
          <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: "1.25" }}>
            Most households manage their mortgage reactively — they know the payment but not the position.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {[
            {
              stat: "$1,800",
              label: "Average monthly mortgage payment — the single largest household expense",
              detail: "Yet most households have little visibility into payoff trajectory, refinance break-even, or escrow accuracy.",
            },
            {
              stat: "3 in 10",
              label: "Homeowners don't know their remaining loan balance",
              detail: "Without a clear record, continuity planning, estate handoff, and refinance comparison are all flying blind.",
            },
            {
              stat: "$22,000+",
              label: "Average savings from an optimized refinance decision",
              detail: "The data to make that decision lives in loan documents most households haven't looked at since closing.",
            },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#d8b4fe", marginBottom: "6px" }}>{item.stat}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "6px" }}>{item.label}</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "12px", lineHeight: "1.7" }}>
          Debug: household={householdState.context.householdId || "none"} | loans={mortgageLoans.length} | loading={loading ? "yes" : "no"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
