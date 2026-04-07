import SectionCard from "../shared/SectionCard";

export default function AccessValuePreview({
  title = "What VaultedShield unlocks",
  subtitle = "See the workflow without exposing or simulating a live household record.",
  compact = false,
}) {
  const unlockItems = [
    {
      label: "Household score and priorities",
      reason: "VaultedShield can rank the next best actions once real household records are connected.",
      nextAction: "Connect your first real record to unlock household scoring.",
    },
    {
      label: "Cross-module review workflow",
      reason: "Assets, property, retirement, insurance, and warranty issues roll into one operating queue.",
      nextAction: "Work blockers from the dashboard or from each detail page.",
    },
    {
      label: "Continuity and access guidance",
      reason: "Documents, portals, alerts, and follow-up tasks start lining up around the same household scope.",
      nextAction: "Use shared review states like Pending Docs, Follow Up, and Reviewed.",
    },
  ];
  const visibleItems = compact ? unlockItems.slice(0, 2) : unlockItems;
  const privatePoints = compact
    ? [
        "Protected routes require authentication before household data loads.",
        "This preview is descriptive only and does not represent your live account.",
      ]
    : [
        "Protected routes still require authentication before household data loads.",
        "The right-hand panel on auth screens is descriptive only and does not represent your actual account.",
        "Real scores, blockers, and review state appear only after you enter the platform.",
      ];

  return (
    <SectionCard title={title} subtitle={subtitle} accent="#bfdbfe">
      <div style={{ display: "grid", gap: "16px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: "16px",
            }}
          >
            <div
              style={{
                padding: "16px",
              borderRadius: "16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>What opens up after login</div>
              {visibleItems.map((item, index) => (
              <div
                key={item.label}
                style={{
                  padding: "12px",
                  borderRadius: "14px",
                  background: "#ffffff",
                  border: "1px solid #dbe4f0",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                  <div style={{ color: "#0f172a", fontWeight: 800, lineHeight: "1.4" }}>
                    {index + 1}. {item.label}
                  </div>
                  <div style={{ padding: "4px 8px", borderRadius: "999px", background: "#e2e8f0", color: "#475569", fontSize: "12px", fontWeight: 800, whiteSpace: "nowrap" }}>
                    After login
                  </div>
                </div>
                <div style={{ color: "#475569", lineHeight: "1.6" }}>{item.reason}</div>
                <div style={{ color: "#1d4ed8", fontWeight: 700 }}>{item.nextAction}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: "16px",
              borderRadius: "16px",
              background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
              border: "1px solid #1e293b",
              color: "#e2e8f0",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 800 }}>What stays private here</div>
            <div style={{ color: "#cbd5e1", lineHeight: "1.65" }}>
              This screen does not load a live household score, priorities, or private records before sign-in.
            </div>
            <div
              style={{
                padding: "14px",
                borderRadius: "14px",
                background: "rgba(15, 23, 42, 0.35)",
                border: "1px solid rgba(148, 163, 184, 0.25)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                {privatePoints.map((point) => (
                  <div key={point} style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: "1.6" }}>
                    {point}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
