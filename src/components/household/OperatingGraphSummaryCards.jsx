export default function OperatingGraphSummaryCards({
  cards = [],
  highlights = [],
  onNavigate,
  theme = "light",
}) {
  const isDark = theme === "dark";
  const cardBackground = isDark ? "linear-gradient(180deg, rgba(15,23,42,0.52), rgba(15,23,42,0.34))" : "linear-gradient(180deg, #ffffff, #f8fafc)";
  const cardBorder = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(148, 163, 184, 0.16)";
  const cardShadow = isDark ? "0 20px 44px rgba(2, 6, 23, 0.22)" : "0 18px 36px rgba(15, 23, 42, 0.08)";
  const bodyColor = isDark ? "#cbd5e1" : "#475569";
  const valueColor = isDark ? "#f8fafc" : "#0f172a";
  const eyebrowColor = isDark ? "#93c5fd" : "#475569";
  const highlightBackground = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.92)";
  const highlightBorder = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(226, 232, 240, 0.85)";
  const highlightColor = isDark ? "#e2e8f0" : "#334155";

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
              padding: "20px",
              borderRadius: "22px",
              background: cardBackground,
              border: cardBorder,
              boxShadow: cardShadow,
              display: "grid",
              gap: "12px",
              textAlign: "left",
              cursor: card.route ? "pointer" : "default",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                color: eyebrowColor,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontWeight: 700,
              }}
            >
              {card.title}
            </div>
            <div style={{ fontSize: "26px", fontWeight: 800, color: valueColor }}>{card.value}</div>
            <div style={{ color: bodyColor, lineHeight: "1.7", fontSize: "14px" }}>{card.summary}</div>
            {card.route ? (
              <div style={{ color: isDark ? "#bfdbfe" : "#2563eb", fontSize: "13px", fontWeight: 700 }}>
                Open details
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {highlights.length > 0 ? (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {highlights.map((item) => (
            <div
              key={item}
              style={{
                padding: "10px 14px",
                borderRadius: "999px",
                background: highlightBackground,
                border: highlightBorder,
                color: highlightColor,
                fontSize: "13px",
                lineHeight: "1.5",
                boxShadow: isDark ? "none" : "0 8px 20px rgba(15, 23, 42, 0.06)",
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
