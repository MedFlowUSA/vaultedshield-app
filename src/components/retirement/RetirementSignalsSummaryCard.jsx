import SectionCard from "../shared/SectionCard";
import { EvidenceDetailRenderer, SurfaceSummaryRenderer } from "../shared/FriendlyIntelligenceUI";
import { RETIREMENT_SIGNAL_FLAG_LABELS } from "../../lib/retirementSignals/retirementSignalRules";
import { mapRetirementSignalsToFriendlySummary } from "../../lib/presentation/friendlySummaryMappers";

export default function RetirementSignalsSummaryCard({ retirementSignals }) {
  if (!retirementSignals) return null;

  const summary = mapRetirementSignalsToFriendlySummary(retirementSignals);
  const activeFlags = Object.entries(retirementSignals.flags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => RETIREMENT_SIGNAL_FLAG_LABELS[key] || key);

  return (
    <SectionCard
      title="Retirement Overview"
      subtitle="Start with the simple account read, then expand into positions, evidence support, and signal drivers only when needed."
      accent="rgba(148, 163, 184, 0.16)"
    >
      <SurfaceSummaryRenderer
        summary={{
          ...summary,
          evidenceContent: (
            <EvidenceDetailRenderer title="Retirement Evidence" subtitle={summary.evidenceSubtitle}>
              <div style={{ display: "grid", gap: "14px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.16)", display: "grid", gap: "8px" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Why This Read Happened</div>
                    <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#334155", lineHeight: "1.65" }}>
                      {(summary.reasons || []).slice(0, 5).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.16)", display: "grid", gap: "8px" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Open Review Signals</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {(activeFlags.length > 0 ? activeFlags : ["No active account pressure flags"]).map((flag) => (
                        <span
                          key={flag}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "8px 10px",
                            borderRadius: "999px",
                            background: "#f8fafc",
                            border: "1px solid rgba(148, 163, 184, 0.16)",
                            color: "#0f172a",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </EvidenceDetailRenderer>
          ),
        }}
      />
    </SectionCard>
  );
}
