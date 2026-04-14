const BUTTON_STYLE = {
  padding: "8px 12px",
  borderRadius: "999px",
  border: "1px solid #dbeafe",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "12px",
};

export default function AssistantWorkflowActions({
  actions = [],
  onAction,
}) {
  const visibleActions = (Array.isArray(actions) ? actions : []).filter(Boolean);
  if (visibleActions.length === 0 || typeof onAction !== "function") return null;

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
        Workflow Action
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {visibleActions.map((action) => (
          <button
            key={action.id || `${action.label}-${action.route || action.target || "action"}`}
            type="button"
            onClick={() => onAction(action)}
            style={BUTTON_STYLE}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
