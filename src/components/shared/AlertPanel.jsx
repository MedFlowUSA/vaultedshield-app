import { EvidenceDetailRenderer, SurfaceSummaryRenderer } from "./FriendlyIntelligenceUI";

export default function AlertPanel({ title, items = [] }) {
  return (
    <SurfaceSummaryRenderer
      summary={{
        eyebrow: "Review Prompt",
        icon: items.length > 0 ? "⚠️" : "🟢",
        title,
        verdict: items.length > 0 ? "A few items still need attention." : "Nothing urgent is standing out.",
        statusLabel: items.length > 0 ? "Needs review" : "Stable",
        tone: items.length > 0 ? "warning" : "good",
        supportLabel: items.length > 0 ? `${items.length} visible prompt${items.length === 1 ? "" : "s"}` : "Clear for now",
        supportTone: items.length > 0 ? "warning" : "good",
        whatFound:
          items.length > 0
            ? "VaultedShield found a small set of issues that should be reviewed before they become easier to miss."
            : "VaultedShield is not surfacing active warning prompts in this area right now.",
        whyCare:
          items.length > 0
            ? "Keeping these prompts visible helps the household act on what matters without digging through a larger technical view."
            : "A quiet panel here means the user can stay focused on higher-priority areas.",
        evidenceTitle: "See the review prompts",
        evidenceSubtitle: "The individual prompts are still available without forcing them into the first read.",
        evidenceContent: (
          <EvidenceDetailRenderer title="Open Prompts" subtitle="These are the currently visible prompts behind this summary.">
            <div style={{ display: "grid", gap: "10px" }}>
              {items.map((item) => (
                <div
                  key={item}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "14px",
                    background: "#ffffff",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                    color: "#334155",
                    lineHeight: "1.7",
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </EvidenceDetailRenderer>
        ),
      }}
    />
  );
}
