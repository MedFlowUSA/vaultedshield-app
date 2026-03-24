import StatusBadge from "./StatusBadge";

export default function AssetCard({ title, category, status, description }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>{title}</div>
          <div style={{ marginTop: "4px", color: "#64748b", fontSize: "13px" }}>{category}</div>
        </div>
        <StatusBadge label={status} tone="info" />
      </div>
      <p style={{ marginTop: "12px", marginBottom: 0, color: "#475569", lineHeight: "1.6" }}>{description}</p>
    </div>
  );
}
