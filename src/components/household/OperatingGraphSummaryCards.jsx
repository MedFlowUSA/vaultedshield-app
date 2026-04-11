export default function OperatingGraphSummaryCards({
  cards = [],
  highlights = [],
  onNavigate,
  theme = "light",
}) {
  const isDark = theme === "dark";
  const cardBackground = isDark ? "rgba(15,23,42,0.36)" : "#f8fafc";
  const cardBorder = isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(148, 163, 184, 0.18)";
  const bodyColor = isDark ? "#cbd5e1" : "#475569";
  const valueColor = isDark ? "#93c5fd" : "#0f172a";
  const eyebrowColor = isDark ? "#64748b" : "#64748b";
  const highlightBackground = isDark ? "rgba(255,255,255,0.04)" : "#ffffff";
  const highlightBorder = isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(226, 232, 240, 0.8)";
  const highlightColor = isDark ? "#cbd5e1" : "#475569";

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => card.route && onNavigate?.(card.route)}
            disabled={!card.route}
            style={{
              padding: "18px",
              borderRadius: "18px",
              background: cardBackground,
              border: cardBorder,
              display: "grid",
              gap: "10px",
              textAlign: "left",
              cursor: card.route ? "pointer" : "default",
            }}
          >
            <div style={{ fontSize: "11px", color: eyebrowColor, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {card.title}
            </div>
            <div style={{ fontSize: "26px", fontWeight: 800, color: valueColor }}>{card.value}</div>
            <div style={{ color: bodyColor, lineHeight: "1.7", fontSize: "14px" }}>{card.summary}</div>
          </button>
        ))}
      </div>

      {highlights.length > 0 ? (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {highlights.map((item) => (
            <div
              key={item}
              style={{
                padding: "10px 12px",
                borderRadius: "999px",
                background: highlightBackground,
                border: highlightBorder,
                color: highlightColor,
                fontSize: "13px",
                lineHeight: "1.5",
              }}
            >
              {item}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
