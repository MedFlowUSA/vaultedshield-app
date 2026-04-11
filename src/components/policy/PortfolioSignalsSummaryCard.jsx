import SectionCard from "../shared/SectionCard";
import StatusBadge from "../shared/StatusBadge";
import { PORTFOLIO_SIGNAL_FLAG_LABELS } from "../../lib/policySignals/portfolioSignalRules";

function getSignalTone(signalLevel) {
  if (signalLevel === "healthy") return "good";
  if (signalLevel === "at_risk") return "alert";
  return "warning";
}

function getCardAccent(signalLevel) {
  if (signalLevel === "healthy") {
    return {
      background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 74%)",
      border: "#bbf7d0",
      text: "#14532d",
    };
  }
  if (signalLevel === "at_risk") {
    return {
      background: "linear-gradient(135deg, #fef2f2 0%, #ffffff 74%)",
      border: "#fecaca",
      text: "#7f1d1d",
    };
  }
  return {
    background: "linear-gradient(135deg, #fffbeb 0%, #ffffff 74%)",
    border: "#fde68a",
    text: "#78350f",
  };
}

function confidenceLabel(confidence) {
  if (confidence >= 0.8) return "High confidence";
  if (confidence >= 0.55) return "Moderate confidence";
  return "Developing confidence";
}

function policyNameById(policies = [], id = "") {
  const match = policies.find((policy) => (policy.policy_id || policy.id) === id);
  return match?.product || match?.product_name || match?.carrier || id || "Policy";
}

export default function PortfolioSignalsSummaryCard({ portfolioSignals, policies = [] }) {
  if (!portfolioSignals) return null;

  const accent = getCardAccent(portfolioSignals.portfolioSignalLevel);
  const confidencePercent = Math.round((portfolioSignals.confidence ?? 0) * 100);
  const activeFlags = Object.entries(portfolioSignals.portfolioFlags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => PORTFOLIO_SIGNAL_FLAG_LABELS[key] || key);

  return (
    <SectionCard title="Portfolio Signals Summary" subtitle="Deterministic portfolio-wide read across the saved policy set." accent={accent.border}>
      <div
        style={{
          display: "grid",
          gap: "16px",
          padding: "18px 20px",
          borderRadius: "20px",
          background: accent.background,
          border: `1px solid ${accent.border}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px", maxWidth: "760px" }}>
            <div style={{ fontSize: "12px", color: accent.text, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900 }}>
              Portfolio Signal
            </div>
            <div style={{ color: "#0f172a", fontSize: "24px", lineHeight: "1.25", fontWeight: 900 }}>
              {portfolioSignals.summaryLabel}
            </div>
            <div style={{ color: "#475569", lineHeight: "1.75" }}>
              {portfolioSignals.reasons?.[0] || "The saved portfolio now has a deterministic signal read."}
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <StatusBadge label={portfolioSignals.portfolioSignalLevel.replace(/_/g, " ")} tone={getSignalTone(portfolioSignals.portfolioSignalLevel)} />
            <StatusBadge label={`${confidenceLabel(portfolioSignals.confidence)} ${confidencePercent}%`} tone="info" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
          <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.22)" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Policies</div>
            <div style={{ marginTop: "8px", color: "#0f172a", fontWeight: 900, fontSize: "22px" }}>{portfolioSignals.totals.totalPolicies}</div>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.22)" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Healthy</div>
            <div style={{ marginTop: "8px", color: "#166534", fontWeight: 900, fontSize: "22px" }}>{portfolioSignals.totals.healthyCount}</div>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.22)" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Monitor</div>
            <div style={{ marginTop: "8px", color: "#92400e", fontWeight: 900, fontSize: "22px" }}>{portfolioSignals.totals.monitorCount}</div>
          </div>
          <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.22)" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>At Risk</div>
            <div style={{ marginTop: "8px", color: "#991b1b", fontWeight: 900, fontSize: "22px" }}>{portfolioSignals.totals.atRiskCount}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
          <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.22)", display: "grid", gap: "8px" }}>
            <div style={{ fontWeight: 800, color: "#0f172a" }}>Top Reasons</div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#334155", lineHeight: "1.65" }}>
              {(portfolioSignals.reasons || []).slice(0, 3).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>

          <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.22)", display: "grid", gap: "8px" }}>
            <div style={{ fontWeight: 800, color: "#0f172a" }}>Priority Policies</div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              {portfolioSignals.priorityPolicyIds.length > 0
                ? portfolioSignals.priorityPolicyIds.slice(0, 3).map((id) => policyNameById(policies, id)).join(", ")
                : "No immediate priority grouping is standing out."}
            </div>
            <div style={{ fontWeight: 800, color: "#0f172a" }}>Strongest vs Weakest</div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              Strongest: {portfolioSignals.strongestPolicyIds.length > 0 ? policyNameById(policies, portfolioSignals.strongestPolicyIds[0]) : "Unavailable"}
              <br />
              Weakest: {portfolioSignals.weakestPolicyIds.length > 0 ? policyNameById(policies, portfolioSignals.weakestPolicyIds[0]) : "Unavailable"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {activeFlags.length > 0 ? (
            activeFlags.map((flag) => (
              <span
                key={flag}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: "999px",
                  background: "#ffffff",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  color: "#0f172a",
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              >
                {flag}
              </span>
            ))
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 10px",
                borderRadius: "999px",
                background: "#ffffff",
                border: "1px solid rgba(34, 197, 94, 0.28)",
                color: "#166534",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              No active portfolio pressure flags
            </span>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
