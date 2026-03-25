export default function SummaryPanel({ items = [] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "14px",
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            background: "#f8fafc",
            padding: "clamp(14px, 2.8vw, 16px)",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {item.label}
          </div>
          <div style={{ fontSize: "clamp(1.25rem, 4vw, 1.5rem)", fontWeight: 700, marginTop: "6px", color: "#0f172a", wordBreak: "break-word" }}>
            {item.value}
          </div>
          {item.helper ? <div style={{ marginTop: "6px", color: "#64748b", fontSize: "13px", lineHeight: "1.55" }}>{item.helper}</div> : null}
        </div>
      ))}
    </div>
  );
}
