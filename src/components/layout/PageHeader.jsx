export default function PageHeader({ eyebrow, title, description, actions = null }) {
  return (
    <div style={{ marginBottom: "24px", minWidth: 0 }}>
      {eyebrow ? (
        <div style={{ fontSize: "12px", letterSpacing: "1px", color: "#64748b", textTransform: "uppercase", lineHeight: "1.4" }}>
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
        <div style={{ minWidth: 0, flex: "1 1 280px" }}>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: "clamp(1.65rem, 4vw, 2.75rem)", lineHeight: 1.12, wordBreak: "break-word" }}>{title}</h1>
          {description ? (
            <p style={{ marginTop: "8px", marginBottom: 0, color: "#64748b", lineHeight: "1.6", maxWidth: "72ch", wordBreak: "break-word" }}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div style={{ width: "100%", maxWidth: "100%", flex: "1 1 220px" }}>{actions}</div> : null}
      </div>
    </div>
  );
}
