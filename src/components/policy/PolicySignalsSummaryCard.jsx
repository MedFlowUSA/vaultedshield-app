import SectionCard from "../shared/SectionCard";
import { EvidenceDetailRenderer, SurfaceSummaryRenderer } from "../shared/FriendlyIntelligenceUI";
import { POLICY_SIGNAL_FLAG_LABELS } from "../../lib/policySignals/policySignalRules";
import { mapPolicySignalsToFriendlySummary } from "../../lib/presentation/friendlySummaryMappers";

export default function PolicySignalsSummaryCard({ policySignals }) {
  if (!policySignals) return null;

  const summary = mapPolicySignalsToFriendlySummary(policySignals);
  const activeFlags = Object.entries(policySignals.flags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => POLICY_SIGNAL_FLAG_LABELS[key] || key);

  return (
    <SectionCard
      title="Policy Overview"
      subtitle="The policy now opens with a calm summary, while signal drivers and technical evidence stay available underneath."
      accent="rgba(148, 163, 184, 0.16)"
    >
      <SurfaceSummaryRenderer
        summary={{
          ...summary,
          evidenceContent: (
            <EvidenceDetailRenderer title="Policy Evidence" subtitle={summary.evidenceSubtitle}>
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.16)", display: "grid", gap: "8px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Why This Read Happened</div>
                  <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#334155", lineHeight: "1.65" }}>
                    {(summary.reasons || []).slice(0, 6).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.16)", display: "grid", gap: "8px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Pressure Flags</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {(activeFlags.length > 0 ? activeFlags : ["No active pressure flags"]).map((flag) => (
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
            </EvidenceDetailRenderer>
          ),
        }}
      />
    </SectionCard>
  );
}
