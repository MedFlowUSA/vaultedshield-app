import SectionCard from "../shared/SectionCard";

function urgencyStyle(urgency = "info") {
  if (urgency === "high") {
    return {
      background: "rgba(254, 226, 226, 0.88)",
      border: "1px solid rgba(248, 113, 113, 0.28)",
      color: "#991b1b",
    };
  }
  if (urgency === "warning") {
    return {
      background: "rgba(254, 243, 199, 0.88)",
      border: "1px solid rgba(245, 158, 11, 0.24)",
      color: "#92400e",
    };
  }
  return {
    background: "rgba(239, 246, 255, 0.92)",
    border: "1px solid rgba(147, 197, 253, 0.26)",
    color: "#1d4ed8",
  };
}

export default function RetirementActionFeedCard({ actions = [], onAction }) {
  if (!actions.length) return null;

  return (
    <SectionCard title="Retirement Action Feed" subtitle="The next deterministic review moves generated from the current account signals.">
      <div style={{ display: "grid", gap: "12px" }}>
        {actions.map((action) => {
          const tone = urgencyStyle(action.urgency);
          return (
            <div
              key={action.id}
              style={{
                padding: "16px 18px",
                borderRadius: "18px",
                background: "#ffffff",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: "6px", maxWidth: "860px" }}>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{action.title}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{action.summary}</div>
                </div>
                <div
                  style={{
                    padding: "7px 10px",
                    borderRadius: "999px",
                    background: tone.background,
                    border: tone.border,
                    color: tone.color,
                    fontSize: "12px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {action.urgency}
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => onAction?.(action)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "12px",
                    border: "none",
                    background: "#0f172a",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  {action.actionLabel}
                </button>
                <div style={{ alignSelf: "center", color: "#64748b", fontSize: "13px" }}>
                  {action.category.replace(/_/g, " ")}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
