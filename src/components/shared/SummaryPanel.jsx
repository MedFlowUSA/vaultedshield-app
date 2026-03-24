export default function SummaryPanel({ items = [] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "14px",
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            background: "#f8fafc",
            padding: "16px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {item.label}
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px", color: "#0f172a" }}>
            {item.value}
          </div>
          {item.helper ? <div style={{ marginTop: "6px", color: "#64748b", fontSize: "13px" }}>{item.helper}</div> : null}
        </div>
      ))}
    </div>
  );
}
