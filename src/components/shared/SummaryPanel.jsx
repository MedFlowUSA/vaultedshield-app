export default function SummaryPanel({ items = [] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
        gap: "14px",
        minWidth: 0,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            background:
              "radial-gradient(circle at top left, rgba(96,165,250,0.08) 0%, rgba(96,165,250,0) 28%), linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(255,255,255,0.98) 100%)",
            padding: "clamp(16px, 3vw, 18px)",
            borderRadius: "18px",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.04)",
            minWidth: 0,
            overflowWrap: "anywhere",
            display: "grid",
            gap: "8px",
          }}
        >
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
            {item.label}
          </div>
          <div style={{ fontSize: "clamp(1.3rem, 4vw, 1.7rem)", fontWeight: 800, color: "#0f172a", lineHeight: "1.15", wordBreak: "break-word" }}>
            {item.value}
          </div>
          {item.helper ? <div style={{ color: "#475569", fontSize: "13px", lineHeight: "1.6" }}>{item.helper}</div> : null}
        </div>
      ))}
    </div>
  );
}
