import SectionCard from "../shared/SectionCard";
import StatusBadge from "../shared/StatusBadge";
import { POLICY_SIGNAL_FLAG_LABELS } from "../../lib/policySignals/policySignalRules";

function getSignalTone(signalLevel) {
  if (signalLevel === "healthy") return "good";
  if (signalLevel === "at_risk") return "alert";
  return "warning";
}

function getSignalCopy(signalLevel) {
  if (signalLevel === "healthy") {
    return "The current evidence reads as stable from the visible policy data.";
  }
  if (signalLevel === "at_risk") {
    return "The current evidence shows pressure that deserves closer review.";
  }
  return "The current evidence is usable, but at least one signal should be watched.";
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

function confidenceLabel(confidence) {
  if (confidence >= 0.8) return "High confidence";
  if (confidence >= 0.55) return "Moderate confidence";
  return "Developing confidence";
}

export default function PolicySignalsSummaryCard({ policySignals }) {
  if (!policySignals) return null;

  const accent = getCardAccent(policySignals.signalLevel);
  const activeFlags = Object.entries(policySignals.flags || {})
    .filter(([, isActive]) => Boolean(isActive))
    .map(([key]) => ({
      key,
      label: POLICY_SIGNAL_FLAG_LABELS[key] || key,
    }));
  const confidencePercent = Math.round((policySignals.confidence ?? 0) * 100);

  return (
    <SectionCard title="Policy Signals Summary" subtitle="Deterministic signal read from policy evidence, trends, and comparison data." accent={accent.border}>
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
              {policySignals.summaryLabel}
            </div>
            <div style={{ color: "#475569", lineHeight: "1.75" }}>
              {getSignalCopy(policySignals.signalLevel)}
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <StatusBadge label={policySignals.signalLevel.replace(/_/g, " ")} tone={getSignalTone(policySignals.signalLevel)} />
            <StatusBadge label={`${confidenceLabel(policySignals.confidence)} ${confidencePercent}%`} tone="info" />
          </div>
        </div>

        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontWeight: 800, color: "#0f172a" }}>Why this signal was assigned</div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#334155", lineHeight: "1.65" }}>
            {(policySignals.reasons || []).slice(0, 6).map((reason) => (
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
              No active pressure flags
            </span>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
