export default function TimelinePanel({ title = "Timeline", rows = [] }) {
  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: "14px", color: "#0f172a" }}>{title}</h3>
      <div style={{ display: "grid", gap: "12px" }}>
        {rows.map((row) => (
          <div key={row.title} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.title}</div>
            <div style={{ marginTop: "4px", color: "#64748b", fontSize: "14px" }}>{row.subtitle}</div>
            <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.6" }}>{row.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
