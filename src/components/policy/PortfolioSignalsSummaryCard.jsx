import SectionCard from "../shared/SectionCard";
import { EvidenceDetailRenderer, SurfaceSummaryRenderer } from "../shared/FriendlyIntelligenceUI";
import { PORTFOLIO_SIGNAL_FLAG_LABELS } from "../../lib/policySignals/portfolioSignalRules";
import { mapPortfolioSignalsToFriendlySummary } from "../../lib/presentation/friendlySummaryMappers";

function policyNameById(policies = [], id = "") {
  const match = policies.find((policy) => (policy.policy_id || policy.id) === id);
  return match?.product || match?.product_name || match?.carrier || id || "Policy";
}

export default function PortfolioSignalsSummaryCard({ portfolioSignals, policies = [] }) {
  if (!portfolioSignals) return null;

  const summary = mapPortfolioSignalsToFriendlySummary(portfolioSignals, policies);
  const activeFlags = Object.entries(portfolioSignals.portfolioFlags || {})
    .filter(([, active]) => Boolean(active))
    .map(([key]) => PORTFOLIO_SIGNAL_FLAG_LABELS[key] || key);

  return (
    <SectionCard
      title="Insurance Portfolio Overview"
      subtitle="Start with the plain-language portfolio read, then open the evidence only when you want the deeper comparison."
      accent="rgba(148, 163, 184, 0.16)"
    >
      <SurfaceSummaryRenderer
        summary={{
          ...summary,
          evidenceContent: (
            <EvidenceDetailRenderer title="Portfolio Evidence" subtitle={summary.evidenceSubtitle}>
              <div style={{ display: "grid", gap: "14px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "10px",
                  }}
                >
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.16)" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Priority Policies</div>
                    <div style={{ marginTop: "8px", color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{summary.evidenceSummary.priorityPolicies}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.16)" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Strongest vs Weakest</div>
                    <div style={{ marginTop: "8px", color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{summary.evidenceSummary.strongestVsWeakest}</div>
                  </div>
                </div>

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
                      {(summary.reasons || []).slice(0, 4).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.16)", display: "grid", gap: "8px" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Active Flags</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {(activeFlags.length > 0
                        ? activeFlags
                        : ["No active portfolio pressure flags"]
                      ).map((flag) => (
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

                {(portfolioSignals.priorityPolicyIds || []).length > 0 ? (
                  <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.16)", display: "grid", gap: "8px" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>Priority Policy List</div>
                    <div style={{ color: "#334155", lineHeight: "1.7" }}>
                      {portfolioSignals.priorityPolicyIds.slice(0, 5).map((id) => policyNameById(policies, id)).join(", ")}
                    </div>
                  </div>
                ) : null}
              </div>
            </EvidenceDetailRenderer>
          ),
        }}
      />
    </SectionCard>
  );
}
