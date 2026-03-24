export default function UploadDropzone({ title, description, buttonLabel = "Select Files" }) {
  return (
    <div
      style={{
        border: "1px dashed #94a3b8",
        borderRadius: "16px",
        padding: "24px",
        background: "#f8fafc",
      }}
    >
      <div style={{ fontWeight: 700, color: "#0f172a" }}>{title}</div>
      <p style={{ marginTop: "8px", marginBottom: "14px", color: "#64748b", lineHeight: "1.6" }}>
        {description}
      </p>
      <button
        style={{
          border: "1px solid #cbd5e1",
          background: "#ffffff",
          borderRadius: "10px",
          padding: "10px 14px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
