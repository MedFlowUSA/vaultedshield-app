function getTheme(theme) {
  if (theme === "dark") {
    return {
      cardBackground: "rgba(15,23,42,0.28)",
      cardBorder: "1px solid rgba(255,255,255,0.06)",
      labelColor: "#f8fafc",
      hintColor: "#cbd5e1",
      doneBackground: "rgba(34,197,94,0.16)",
      doneColor: "#bbf7d0",
      todoBackground: "rgba(148,163,184,0.14)",
      todoColor: "#cbd5e1",
      headingColor: "#f8fafc",
      subheadingColor: "#93c5fd",
    };
  }

  return {
    cardBackground: "#f8fafc",
    cardBorder: "1px solid rgba(148, 163, 184, 0.18)",
    labelColor: "#0f172a",
    hintColor: "#475569",
    doneBackground: "rgba(34,197,94,0.12)",
    doneColor: "#166534",
    todoBackground: "rgba(148,163,184,0.12)",
    todoColor: "#475569",
    headingColor: "#0f172a",
    subheadingColor: "#1d4ed8",
  };
}

export default function SetupChecklist({
  title = "Setup checklist",
  subtitle = "Complete the core setup steps to unlock richer household intelligence.",
  items = [],
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
          Setup Progress
        </div>
        <div style={{ fontSize: "20px", fontWeight: 800, color: colors.headingColor }}>{title}</div>
        <div style={{ color: colors.hintColor, lineHeight: "1.7" }}>{subtitle}</div>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {items.map((item) => (
          <div
            key={item.id || item.label}
            style={{
              display: "grid",
              gap: "6px",
              padding: "14px 16px",
              borderRadius: "16px",
              background: theme === "dark" ? "rgba(255,255,255,0.03)" : "#ffffff",
              border: theme === "dark" ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(148, 163, 184, 0.14)",
            }}
          >
            <div style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: colors.labelColor }}>{item.label}</div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 800,
                  background: item.complete ? colors.doneBackground : colors.todoBackground,
                  color: item.complete ? colors.doneColor : colors.todoColor,
                }}
              >
                {item.complete ? "Complete" : "Incomplete"}
              </span>
            </div>
            {item.hint ? <div style={{ color: colors.hintColor, lineHeight: "1.65", fontSize: "14px" }}>{item.hint}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
