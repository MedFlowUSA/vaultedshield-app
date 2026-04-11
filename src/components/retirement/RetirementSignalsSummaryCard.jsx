import SectionCard from "../shared/SectionCard";
import StatusBadge from "../shared/StatusBadge";
import { RETIREMENT_SIGNAL_FLAG_LABELS } from "../../lib/retirementSignals/retirementSignalRules";

function getSignalTone(signalLevel) {
  if (signalLevel === "healthy") return "good";
  if (signalLevel === "at_risk") return "alert";
  return "warning";
}

function getCardAccent(signalLevel) {
  if (signalLevel === "healthy") {
    return {
      background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 72%)",
      border: "#bbf7d0",
      text: "#14532d",
    };
  }
  if (signalLevel === "at_risk") {
    return {
      background: "linear-gradient(135deg, #fef2f2 0%, #ffffff 72%)",
      border: "#fecaca",
      text: "#7f1d1d",
    };
  }
  return {
    background: "linear-gradient(135deg, #fffbeb 0%, #ffffff 72%)",
    border: "#fde68a",
    text: "#78350f",
  };
}

export default function RetirementSignalsSummaryCard({ retirementSignals }) {
  if (!retirementSignals) return null;

  const accent = getCardAccent(retirementSignals.signalLevel);
  const activeFlags = Object.entries(retirementSignals.flags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => ({
      key,
      label: RETIREMENT_SIGNAL_FLAG_LABELS[key] || key,
    }));

  return (
    <SectionCard title="Retirement Signals Summary" subtitle="Deterministic account read from statement quality, parsed holdings, and retirement review flags." accent={accent.border}>
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
              Signal Level
            </div>
            <div style={{ color: "#0f172a", fontSize: "24px", lineHeight: "1.25", fontWeight: 900 }}>
              {retirementSignals.summaryLabel}
            </div>
            <div style={{ color: "#475569", lineHeight: "1.75" }}>
              {retirementSignals.signalLevel === "healthy"
                ? "The current retirement read looks relatively stable from the visible account evidence."
                : retirementSignals.signalLevel === "at_risk"
                  ? "The current retirement read shows pressure that deserves closer review."
                  : "The current retirement read is usable, but a few areas still need attention."}
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <StatusBadge label={retirementSignals.signalLevel.replace(/_/g, " ")} tone={getSignalTone(retirementSignals.signalLevel)} />
            <StatusBadge label={`${Math.round((retirementSignals.confidence || 0) * 100)}% confidence`} tone="info" />
          </div>
        </div>

        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Why this account reads this way</div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#334155", lineHeight: "1.65" }}>
            {(retirementSignals.reasons || []).slice(0, 6).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {activeFlags.length > 0 ? (
            activeFlags.map((flag) => (
              <span
                key={flag.key}
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
                {flag.label}
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
              No active account pressure flags
            </span>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
