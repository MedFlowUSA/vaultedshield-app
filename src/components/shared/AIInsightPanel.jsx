export default function AIInsightPanel({ title = "AI Insight", summary, bullets = [] }) {
  return (
    <div style={{ background: "#eef4ff", border: "1px solid #c7d2fe", borderRadius: "16px", padding: "18px" }}>
      <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>{title}</h3>
      <p style={{ marginTop: "8px", color: "#334155", lineHeight: "1.6" }}>{summary}</p>
      <div style={{ display: "grid", gap: "8px" }}>
        {bullets.map((bullet) => (
          <div key={bullet} style={{ color: "#475569", lineHeight: "1.6" }}>{bullet}</div>
        ))}
      </div>
    </div>
  );
}
