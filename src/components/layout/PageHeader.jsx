export default function PageHeader({ eyebrow, title, description, actions = null }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      {eyebrow ? (
        <div style={{ fontSize: "12px", letterSpacing: "1px", color: "#64748b", textTransform: "uppercase" }}>
          {eyebrow}
        </div>
      ) : null}
      <div
        style={{
          marginTop: eyebrow ? "8px" : 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, color: "#0f172a" }}>{title}</h1>
          {description ? <p style={{ marginTop: "8px", marginBottom: 0, color: "#64748b", lineHeight: "1.6" }}>{description}</p> : null}
        </div>
        {actions}
      </div>
    </div>
  );
}
