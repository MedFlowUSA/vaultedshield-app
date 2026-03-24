export default function ContactCard({ name, role, details }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px" }}>
      <div style={{ fontWeight: 700, color: "#0f172a" }}>{name}</div>
      <div style={{ marginTop: "4px", color: "#64748b" }}>{role}</div>
      <div style={{ marginTop: "12px", color: "#475569", lineHeight: "1.6" }}>{details}</div>
    </div>
  );
}
