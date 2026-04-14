const BUTTON_STYLE = {
  padding: "8px 12px",
  borderRadius: "999px",
  border: "1px solid #dbeafe",
  background: "#ffffff",
  color: "#1d4ed8",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "12px",
};

export default function AssistantJumpLinks({
  sectionTargets = [],
  sectionLabels = {},
  onJumpToSection,
}) {
  const targets = [...new Set((sectionTargets || []).filter(Boolean))];
  if (targets.length === 0 || typeof onJumpToSection !== "function") return null;

  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
        }}
      >
        Go To Section
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {targets.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => onJumpToSection(target)}
            style={BUTTON_STYLE}
          >
            {sectionLabels[target] || target.replace(/-/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}
