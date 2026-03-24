export default function ExportModal() {
  return (
    <div style={{ padding: "18px", borderRadius: "16px", border: "1px dashed #cbd5e1", background: "#f8fafc" }}>
      <div style={{ fontWeight: 700, color: "#0f172a" }}>Export Package</div>
      <p style={{ marginTop: "8px", marginBottom: "12px", color: "#64748b", lineHeight: "1.6" }}>
        Export and handoff packaging will connect household records, emergency documents, and intelligence summaries in a later pass.
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
        Export Placeholder
      </button>
    </div>
  );
}
