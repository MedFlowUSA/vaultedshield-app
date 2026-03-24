export default function SectionCard({ title, subtitle, children, accent = "#e2e8f0" }) {
  return (
    <section
      style={{
        background: "#ffffff",
        border: `1px solid ${accent}`,
        borderRadius: "16px",
        padding: "20px",
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
      }}
    >
      {(title || subtitle) ? (
        <div style={{ marginBottom: "16px" }}>
          {title ? <h3 style={{ margin: 0, color: "#0f172a" }}>{title}</h3> : null}
          {subtitle ? <p style={{ marginTop: "6px", marginBottom: 0, color: "#64748b", lineHeight: "1.5" }}>{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
