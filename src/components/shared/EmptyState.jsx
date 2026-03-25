export default function EmptyState({ title, description }) {
  return (
    <div
      style={{
        padding: "clamp(18px, 3vw, 24px)",
        borderRadius: "14px",
        border: "1px dashed #cbd5e1",
        background: "#f8fafc",
      }}
    >
      <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "clamp(1rem, 2.8vw, 1.15rem)" }}>{title}</div>
      <p style={{ marginTop: "8px", marginBottom: 0, color: "#64748b", lineHeight: "1.6", maxWidth: "64ch" }}>
        {description}
      </p>
    </div>
  );
}
