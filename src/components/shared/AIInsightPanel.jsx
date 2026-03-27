export default function AIInsightPanel({ title = "AI Insight", summary, bullets = [] }) {
  return (
    <div style={{ background: "#eef4ff", border: "1px solid #c7d2fe", borderRadius: "16px", padding: "clamp(16px, 3.5vw, 18px)", minWidth: 0, overflowX: "clip" }}>
      <h3 style={{ marginTop: 0, color: "#1e3a8a", lineHeight: "1.3", wordBreak: "break-word" }}>{title}</h3>
      <p style={{ marginTop: "8px", color: "#334155", lineHeight: "1.6", wordBreak: "break-word" }}>{summary}</p>
      <div style={{ display: "grid", gap: "8px", minWidth: 0 }}>
        {bullets.map((bullet) => (
          <div key={bullet} style={{ color: "#475569", lineHeight: "1.6", wordBreak: "break-word" }}>{bullet}</div>
        ))}
      </div>
    </div>
  );
}
