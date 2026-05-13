import { useEffect, useMemo, useRef, useState } from "react";
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

function formatCategoryLabel(majorCategory) {
  const labels = { employer_plan: "Employer Plan", ira: "IRA", pension: "Pension", special_case: "Legacy / Special" };
  return labels[majorCategory] || "Retirement";
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not recorded";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function pillStyle(tone) {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "alert") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

function readinessTone(status) {
  if (status === "On Track") return { background: "#dcfce7", color: "#166534" };
  if (status === "Moderately Behind") return { background: "#fef3c7", color: "#92400e" };
  if (status === "Behind") return { background: "#ffedd5", color: "#c2410c" };
  return { background: "#fee2e2", color: "#991b1b" };
}

function surfaceCard(extra = {}) {
  return { background: "#ffffff", borderRadius: "18px", border: "1px solid #e8edf3", boxShadow: "0 2px 12px rgba(15,23,42,0.05)", padding: "22px 24px", ...extra };
}

function StatusPill({ label, tone }) {
  const s = pillStyle(tone);
  return <span style={{ ...s, fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", whiteSpace: "nowrap" }}>{label}</span>;
}

function ActionButton({ label, onClick, primary, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ padding: "11px 18px", borderRadius: "10px", border: primary ? "none" : "1px solid #cbd5e1", background: primary ? (disabled ? "#94a3b8" : "#0f172a") : "#ffffff", color: primary ? "#ffffff" : "#0f172a", fontWeight: 700, fontSize: "14px", cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap", opacity: disabled ? 0.7 : 1 }}>
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

function AccountCard({ account, onNavigate }) {
  const retirementType = getRetirementType(account.retirement_type_key);
  const linkedAsset = account.assets || null;
  const name = account.plan_name || linkedAsset?.asset_name || "Retirement Account";
  const statusTone = account.plan_status === "active" ? "good" : ["inactive", "terminated", "frozen"].includes(account.plan_status) ? "warning" : "neutral";

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(`/retirement/detail/${account.id}`)}
      style={{ textAlign: "left", width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px 20px", cursor: "pointer", display: "grid", gap: "12px", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>{name}</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>
            {retirementType?.display_name || account.retirement_type_key}
            {account.institution_name || linkedAsset?.institution_name ? ` · ${account.institution_name || linkedAsset?.institution_name}` : ""}
          </div>
        </div>
        <StatusPill label={account.plan_status || "unknown"} tone={statusTone} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: "8px" }}>
        {account.account_owner ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Owner:</span> {account.account_owner}</div> : null}
        {account.participant_name ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Participant:</span> {account.participant_name}</div> : null}
        {account.employer_name ? <div style={{ fontSize: "13px", color: "#475569" }}><span style={{ fontWeight: 700 }}>Employer:</span> {account.employer_name}</div> : null}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <StatusPill label={formatCategoryLabel(retirementType?.major_category)} tone="neutral" />
        {account.is_benefit_based ? <StatusPill label="Benefit-Based" tone="neutral" /> : null}
        <StatusPill label={linkedAsset?.id ? "Asset Linked" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
      </div>
    </button>
  );
}

function EmptyAccountsPanel({ onScrollToForm, onNavigate }) {
  const types = [
    { icon: "🏦", label: "401(k) / 403(b)", desc: "Employer-sponsored plan" },
    { icon: "📈", label: "IRA / Roth IRA", desc: "Individual retirement account" },
    { icon: "🎯", label: "Pension", desc: "Defined benefit plan" },
    { icon: "🔄", label: "Rollover IRA", desc: "Rolled-over employer plan" },
  ];
  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div style={{ fontSize: "15px", color: "#475569", lineHeight: "1.7" }}>
        Start with the accounts you know today. One employer plan, IRA, or pension record is enough to begin building a real retirement picture.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
        {types.map((t) => (
          <button key={t.label} type="button" onClick={onScrollToForm} style={{ textAlign: "left", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 16px", cursor: "pointer", display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "22px" }}>{t.icon}</span>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{t.label}</div>
            <div style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.5" }}>{t.desc}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <ActionButton label="Add First Account" onClick={onScrollToForm} primary />
        <ActionButton label="Set Retirement Goal" onClick={() => onNavigate?.("/household-goals")} />
      </div>
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

export default function RetirementHubPage({ onNavigate }) {
  const { householdState, debug } = usePlatformShellData();
  const accountsRef = useRef(null);
  const addFormRef = useRef(null);

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [showAddForm, setShowAddForm] = useState(false);

  const goalSnapshot = useMemo(
    () => loadRetirementGoalSnapshot({ userId: debug.authUserId || null, householdId: debug.householdId || null }),
    [debug.authUserId, debug.householdId]
  );

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      queueMicrotask(() => setLoading(false));
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
    return () => { active = false; };
  }, [householdState.loading, householdState.context.householdId]);

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
    setShowAddForm(false);
  }

  const readinessSnapshot = useMemo(() => {
    if (!goalSnapshot?.readiness && !goalSnapshot?.goalForm) return null;
    if (goalSnapshot?.readiness) return goalSnapshot.readiness;
    return scoreRetirementGoal({
      ...goalSnapshot.goalForm,
      currentAssets: goalSnapshot?.plannerSnapshot?.currentAssets || 0,
      annualContribution: goalSnapshot?.plannerSnapshot?.annualContribution || 0,
    });
  }, [goalSnapshot]);

  const retirementHouseholdRead = useMemo(() => summarizeRetirementHousehold({ accounts, readinessSnapshot }), [accounts, readinessSnapshot]);
  const retirementHubCommand = useMemo(() => buildRetirementHubCommand({ accounts, readinessSnapshot, retirementHouseholdRead }), [accounts, readinessSnapshot, retirementHouseholdRead]);

  const { activeCount, rolloverCandidates, pensionStyle } = useMemo(() => {
    return accounts.reduce((acc, account) => {
      const retirementType = getRetirementType(account.retirement_type_key);
      const status = String(account.plan_status || "").toLowerCase();
      if (account.plan_status === "active") acc.activeCount += 1;
      if (retirementType?.benefit_based || account.is_benefit_based) acc.pensionStyle += 1;
      if (retirementType?.employer_sponsored && ["inactive", "terminated", "frozen", "payout_only"].includes(status)) acc.rolloverCandidates += 1;
      return acc;
    }, { activeCount: 0, rolloverCandidates: 0, pensionStyle: 0 });
  }, [accounts]);

  const checkpoints = useMemo(() => [
    {
      icon: "📋",
      label: "Accounts on Record",
      status: accounts.length > 0 ? "good" : "alert",
      detail: accounts.length > 0
        ? `${accounts.length} retirement account${accounts.length === 1 ? "" : "s"} tracked — ${activeCount} active.${rolloverCandidates > 0 ? ` ${rolloverCandidates} rollover candidate${rolloverCandidates === 1 ? "" : "s"} detected.` : ""}`
        : "No retirement accounts logged yet. Start with the current employer plan, an IRA, or a pension estimate.",
    },
    {
      icon: "🎯",
      label: "Retirement Goal Set",
      status: readinessSnapshot ? (readinessSnapshot.readinessStatus === "On Track" ? "good" : "warning") : "alert",
      detail: readinessSnapshot
        ? `Goal score: ${readinessSnapshot.readinessScore}/100 — ${readinessSnapshot.readinessStatus}. ${readinessSnapshot.explanation || ""}`
        : "No retirement goal saved yet. Open the Goals Dashboard to set a target age and income goal.",
    },
    {
      icon: "🛡️",
      label: "No Active Retirement Blockers",
      status: retirementHubCommand.rows.length === 0 ? "good" : "warning",
      detail: retirementHubCommand.rows.length > 0
        ? `${retirementHubCommand.rows.length} command item${retirementHubCommand.rows.length === 1 ? "" : "s"} need attention — see the command center below.`
        : accounts.length > 0 ? "No active retirement blockers across tracked accounts." : "Add accounts to enable blocker detection.",
    },
  ], [accounts, activeCount, rolloverCandidates, readinessSnapshot, retirementHubCommand]);

  function scrollToAddForm() {
    setShowAddForm(true);
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const inputStyle = { padding: "11px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "14px", background: "#ffffff", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ display: "grid", gap: "24px" }}>

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1e3a5f 100%)", borderRadius: "22px", padding: "32px 32px 28px", color: "#ffffff", display: "grid", gap: "20px" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#93c5fd" }}>Retirement Planning</div>
          <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.15" }}>Retirement Hub</div>
          <div style={{ fontSize: "15px", color: "#cbd5e1", lineHeight: "1.6", maxWidth: "600px" }}>
            Are the household's retirement accounts tracked, the goal set, and the path clear? This module connects account records, goal scoring, and planning in one place.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
          {[
            { label: "Total Accounts", value: loading ? "—" : accounts.length },
            { label: "Active", value: loading ? "—" : activeCount },
            { label: "Goal Score", value: loading ? "—" : readinessSnapshot ? `${readinessSnapshot.readinessScore}/100` : "Not set" },
            { label: "Command Items", value: loading ? "—" : retirementHubCommand.rows.length },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px", display: "grid", gap: "4px" }}>
              <div style={{ fontSize: "22px", fontWeight: 900 }}>{stat.value}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton label={accounts.length > 0 ? "Add Another Account" : "Add First Account"} onClick={scrollToAddForm} primary />
          <ActionButton label="Goals Dashboard" onClick={() => onNavigate?.("/household-goals")} />
        </div>
      </div>

      {/* Action tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            icon: "🏦",
            label: "Account Coverage",
            value: accounts.length > 0 ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} tracked` : "No accounts yet",
            sub: accounts.length > 0 ? retirementHouseholdRead.headline : "Add the first account to start building the retirement picture.",
            tone: accounts.length > 0 ? "good" : "alert",
          },
          {
            icon: "🎯",
            label: "Goal Readiness",
            value: readinessSnapshot ? readinessSnapshot.readinessStatus : "Goal not set",
            sub: readinessSnapshot ? `Score: ${readinessSnapshot.readinessScore}/100 — ${readinessSnapshot.explanation?.substring(0, 80) || ""}...` : "Open the Goals Dashboard to set a retirement target.",
            tone: readinessSnapshot?.readinessStatus === "On Track" ? "good" : readinessSnapshot ? "warning" : "alert",
          },
          {
            icon: "🔄",
            label: "Rollover Opportunities",
            value: rolloverCandidates > 0 ? `${rolloverCandidates} candidate${rolloverCandidates === 1 ? "" : "s"}` : "None detected",
            sub: rolloverCandidates > 0 ? "Inactive employer plans may be eligible for rollover — review each account detail." : "No obvious rollover candidates among tracked accounts.",
            tone: rolloverCandidates > 0 ? "warning" : accounts.length > 0 ? "good" : "neutral",
          },
        ].map((tile) => {
          const s = pillStyle(tile.tone);
          return (
            <div key={tile.label} style={{ ...surfaceCard(), display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: "22px" }}>{tile.icon}</span>
                <span style={{ ...s, fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "999px" }}>{tile.tone === "good" ? "Good" : tile.tone === "warning" ? "Watch" : tile.tone === "alert" ? "Act" : "—"}</span>
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
        <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Retirement Readiness Checkpoints</div>
        <div style={{ display: "grid", gap: "10px" }}>
          {checkpoints.map((cp) => <ReadinessCheckpoint key={cp.label} {...cp} />)}
        </div>
      </div>

      {/* Goal Snapshot */}
      {readinessSnapshot ? (
        <div style={{ ...surfaceCard(), display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Retirement Goal Snapshot</div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Saved goal and readiness estimate for this household.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ ...readinessTone(readinessSnapshot.readinessStatus), padding: "5px 12px", borderRadius: "999px", fontWeight: 700, fontSize: "13px" }}>
                {readinessSnapshot.readinessStatus}
              </div>
              <div style={{ fontSize: "26px", fontWeight: 900, color: "#0f172a" }}>{readinessSnapshot.readinessScore}/100</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
            {[
              { label: "Projected Balance", value: formatCurrency(readinessSnapshot.projectedRetirementBalance) },
              { label: "Income Gap / Month", value: formatCurrency(readinessSnapshot.estimatedIncomeGapMonthly) },
              { label: "Non-Portfolio Income", value: formatCurrency(readinessSnapshot.estimatedNonPortfolioIncomeMonthly) },
              { label: "Assets Basis", value: formatCurrency(goalSnapshot?.plannerSnapshot?.currentAssets ?? readinessSnapshot.inputs?.currentAssets) },
            ].map((item) => (
              <div key={item.label} style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px 14px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>{item.label}</div>
                <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{item.value}</div>
              </div>
            ))}
          </div>

          {readinessSnapshot.explanation ? (
            <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.7" }}>{readinessSnapshot.explanation}</div>
          ) : null}

          {Array.isArray(readinessSnapshot.assumptionLines) && readinessSnapshot.assumptionLines.length > 0 ? (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {readinessSnapshot.assumptionLines.map((item) => (
                <div key={item} style={{ padding: "5px 10px", borderRadius: "999px", background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px" }}>{item}</div>
              ))}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <ActionButton label="Open Goals Dashboard" onClick={() => onNavigate?.("/household-goals")} />
            <ActionButton label="Update Retirement Goal" onClick={() => onNavigate?.("/retirement/upload")} />
          </div>
        </div>
      ) : (
        <div style={{ ...surfaceCard(), display: "grid", gap: "14px" }}>
          <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Retirement Goal</div>
          <div style={{ fontSize: "15px", color: "#475569", lineHeight: "1.7" }}>
            No retirement goal has been saved yet. Set a target retirement age and income goal to unlock the household readiness score.
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <ActionButton label="Open Goals Dashboard" onClick={() => onNavigate?.("/household-goals")} primary />
            <ActionButton label="Set Retirement Goal" onClick={() => onNavigate?.("/retirement/upload")} />
          </div>
        </div>
      )}

      {/* Command center */}
      {retirementHubCommand.rows.length > 0 ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Retirement Command Center</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Active blockers across household retirement accounts.</div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {retirementHubCommand.rows.map((item) => <CommandRow key={item.id} item={item} />)}
          </div>
        </div>
      ) : null}

      {/* Account list */}
      <div ref={accountsRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Retirement Accounts</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
              {accounts.length > 0 ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} — click to open detail view` : "No accounts recorded yet"}
            </div>
          </div>
          <ActionButton label="+ Add Account" onClick={scrollToAddForm} primary />
        </div>

        {householdState.loading || loading ? (
          <div style={{ ...surfaceCard(), color: "#64748b", fontSize: "14px" }}>Loading retirement accounts...</div>
        ) : loadError ? (
          <div style={{ ...surfaceCard(), color: "#991b1b", fontSize: "14px" }}>{loadError}</div>
        ) : accounts.length === 0 ? (
          <div style={{ ...surfaceCard() }}><EmptyAccountsPanel onScrollToForm={scrollToAddForm} onNavigate={onNavigate} /></div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {accounts.map((a) => <AccountCard key={a.id} account={a} onNavigate={onNavigate} />)}
          </div>
        )}
      </div>

      {/* Add account form */}
      <div ref={addFormRef} style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Add a Retirement Account</div>
            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>Start with the basics — positions, documents, and planning detail can be added in the detail view.</div>
          </div>
          <button type="button" onClick={() => setShowAddForm((v) => !v)} style={{ padding: "9px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            {showAddForm ? "Collapse" : "Expand Form"}
          </button>
        </div>

        {showAddForm ? (
          <div style={{ ...surfaceCard() }}>
            <form onSubmit={handleCreateAccount} style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { key: "retirement_type_key", label: "Account Type", isSelect: true, options: RETIREMENT_TYPES.map((t) => ({ value: t.retirement_type_key, label: `${t.display_name} — ${formatCategoryLabel(t.major_category)}` })) },
                  { key: "plan_name", label: "Plan / Account Name", placeholder: "e.g. My 401(k)" },
                  { key: "account_owner", label: "Account Owner", placeholder: "Name on account" },
                  { key: "participant_name", label: "Participant Name", placeholder: "Participant (if different)" },
                  { key: "employer_name", label: "Employer", placeholder: "Employer name (if applicable)" },
                  { key: "institution_name", label: "Institution Name", placeholder: "Custodian / institution" },
                  { key: "provider_key", label: "Provider Registry", isSelect: true, options: [{ value: "", label: "No match yet" }, ...RETIREMENT_PROVIDERS.map((p) => ({ value: p.institution_key, label: p.display_name }))] },
                  { key: "plan_status", label: "Status", isSelect: true, options: ["active", "inactive", "terminated", "frozen", "payout_only"].map((v) => ({ value: v, label: v })) },
                ].map((field) => (
                  <div key={field.key}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: "5px" }}>{field.label}</label>
                    {field.isSelect ? (
                      <select value={form[field.key]} onChange={(e) => setForm((c) => ({ ...c, [field.key]: e.target.value }))} style={inputStyle}>
                        {field.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={form[field.key]} onChange={(e) => setForm((c) => ({ ...c, [field.key]: e.target.value }))} placeholder={field.placeholder} style={inputStyle} />
                    )}
                  </div>
                ))}
              </div>
              <button type="submit" disabled={creating || !householdState.context.householdId} style={{ padding: "13px 20px", borderRadius: "10px", border: "none", background: creating ? "#94a3b8" : "#0f172a", color: "#ffffff", fontWeight: 800, fontSize: "15px", cursor: creating ? "default" : "pointer", marginTop: "4px" }}>
                {creating ? "Saving..." : "Save Retirement Account"}
              </button>
              {createError ? <div style={{ color: "#991b1b", fontSize: "13px" }}>{createError}</div> : null}
            </form>
          </div>
        ) : null}
      </div>

      {/* Why This Matters */}
      <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #1e3a8a 50%, #0f172a 100%)", borderRadius: "22px", padding: "36px 32px", color: "#ffffff", display: "grid", gap: "28px" }}>
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#93c5fd" }}>Why This Module Matters</div>
          <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: "1.25" }}>Most Americans are behind on retirement savings — but most don't know by how much.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {[
            { stat: "55%", label: "Of Americans have less than $50K saved for retirement", detail: "The gap between what households have saved and what they'll need is frequently invisible — until it's too late to change." },
            { stat: "$240K+", label: "Left behind in forgotten 401(k)s annually across the US", detail: "Job changes leave old employer plans idle, accumulating fees and missing growth opportunities for years." },
            { stat: "20 years", label: "Potential impact of early rollover optimization", detail: "Consolidating and optimizing contributions in working years has compounding benefits that dwarf any single market move." },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#93c5fd", marginBottom: "6px" }}>{item.stat}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "6px" }}>{item.label}</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "12px", lineHeight: "1.7" }}>
          Debug: household={householdState.context.householdId || "none"} | accounts={accounts.length} | loading={loading ? "yes" : "no"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
