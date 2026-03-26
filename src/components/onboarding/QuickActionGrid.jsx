function getTheme(theme) {
  if (theme === "dark") {
    return {
      cardBackground: "rgba(15,23,42,0.28)",
      cardBorder: "1px solid rgba(255,255,255,0.06)",
      buttonBackground: "rgba(255,255,255,0.04)",
      buttonBorder: "1px solid rgba(255,255,255,0.06)",
      buttonColor: "#f8fafc",
      descriptionColor: "#cbd5e1",
      headingColor: "#f8fafc",
      subheadingColor: "#93c5fd",
    };
  }

  return {
    cardBackground: "#f8fafc",
    cardBorder: "1px solid rgba(148, 163, 184, 0.18)",
    buttonBackground: "#ffffff",
    buttonBorder: "1px solid rgba(148, 163, 184, 0.18)",
    buttonColor: "#0f172a",
    descriptionColor: "#475569",
    headingColor: "#0f172a",
    subheadingColor: "#1d4ed8",
  };
}

export default function QuickActionGrid({
  title = "Quick actions",
  subtitle = "Use the fastest paths to start building the household file.",
  actions = [],
  onAction,
  theme = "light",
}) {
  const colors = getTheme(theme);

  return (
    <section
      style={{
        display: "grid",
        gap: "16px",
        padding: "22px",
        borderRadius: "22px",
        background: colors.cardBackground,
        border: colors.cardBorder,
      }}
    >
      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ fontSize: "12px", color: colors.subheadingColor, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
          Next Actions
        </div>
        <div style={{ fontSize: "20px", fontWeight: 800, color: colors.headingColor }}>{title}</div>
        <div style={{ color: colors.descriptionColor, lineHeight: "1.7" }}>{subtitle}</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        {actions.map((action) => (
          <button
            key={action.id || action.label}
            type="button"
            onClick={() => onAction?.(action)}
            style={{
              padding: "16px",
              borderRadius: "16px",
              background: colors.buttonBackground,
              border: colors.buttonBorder,
              textAlign: "left",
              cursor: "pointer",
              display: "grid",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "15px", fontWeight: 800, color: colors.buttonColor }}>{action.label}</div>
            {action.description ? <div style={{ color: colors.descriptionColor, lineHeight: "1.6", fontSize: "14px" }}>{action.description}</div> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
