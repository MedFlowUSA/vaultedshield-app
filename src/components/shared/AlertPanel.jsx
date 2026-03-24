export default function AlertPanel({ title, items = [] }) {
  return (
    <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "14px", padding: "18px" }}>
      <h3 style={{ marginTop: 0, color: "#9a3412" }}>{title}</h3>
      <div style={{ display: "grid", gap: "10px" }}>
        {items.map((item) => (
          <div key={item} style={{ color: "#7c2d12", lineHeight: "1.6" }}>{item}</div>
        ))}
      </div>
    </div>
  );
}
