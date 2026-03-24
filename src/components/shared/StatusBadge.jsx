export default function StatusBadge({ label, tone = "neutral" }) {
  const tones = {
    neutral: { background: "#e2e8f0", color: "#334155" },
    good: { background: "#dcfce7", color: "#166534" },
    warning: { background: "#fef3c7", color: "#92400e" },
    alert: { background: "#fee2e2", color: "#991b1b" },
    info: { background: "#dbeafe", color: "#1d4ed8" },
  };

  const palette = tones[tone] || tones.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 700,
        background: palette.background,
        color: palette.color,
      }}
    >
      {label}
    </span>
  );
}
