export default function SectionCard({ title, subtitle, children, accent = "#e2e8f0" }) {
  return (
    <section
      style={{
        background: "#ffffff",
        border: `1px solid ${accent}`,
        borderRadius: "16px",
        padding: "clamp(16px, 3vw, 20px)",
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)",
      }}
    >
      {(title || subtitle) ? (
        <div style={{ marginBottom: "16px" }}>
          {title ? <h3 style={{ margin: 0, color: "#0f172a", fontSize: "clamp(1.05rem, 2.5vw, 1.35rem)" }}>{title}</h3> : null}
          {subtitle ? <p style={{ marginTop: "6px", marginBottom: 0, color: "#64748b", lineHeight: "1.6", maxWidth: "68ch" }}>{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
