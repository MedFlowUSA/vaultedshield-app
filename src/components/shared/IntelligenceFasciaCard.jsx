import StatusBadge from "./StatusBadge";

function buttonStyle(primary = false) {
  return {
    padding: "10px 14px",
    borderRadius: "12px",
    border: primary ? "none" : "1px solid rgba(15, 23, 42, 0.12)",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "13px",
  };
}

function tertiaryButtonStyle(color = "#1d4ed8") {
  return {
    padding: 0,
    border: "none",
    background: "transparent",
    color,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "13px",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  };
}

function getPalette(statusTone = "neutral") {
  if (statusTone === "good") {
    return {
      background: "linear-gradient(140deg, rgba(240,253,244,0.98) 0%, rgba(255,255,255,1) 58%, rgba(248,250,252,0.96) 100%)",
      border: "rgba(34, 197, 94, 0.22)",
      accent: "#166534",
      panel: "rgba(255,255,255,0.92)",
    };
  }

  if (statusTone === "info") {
    return {
      background: "linear-gradient(140deg, rgba(239,246,255,0.98) 0%, rgba(255,255,255,1) 58%, rgba(248,250,252,0.96) 100%)",
      border: "rgba(96, 165, 250, 0.26)",
      accent: "#1d4ed8",
      panel: "rgba(255,255,255,0.92)",
    };
  }

  if (statusTone === "warning") {
    return {
      background: "linear-gradient(140deg, rgba(255,251,235,0.98) 0%, rgba(255,255,255,1) 58%, rgba(248,250,252,0.96) 100%)",
      border: "rgba(245, 158, 11, 0.24)",
      accent: "#92400e",
      panel: "rgba(255,255,255,0.94)",
    };
  }

  if (statusTone === "alert") {
    return {
      background: "linear-gradient(140deg, rgba(254,242,242,0.98) 0%, rgba(255,255,255,1) 58%, rgba(248,250,252,0.96) 100%)",
      border: "rgba(248, 113, 113, 0.26)",
      accent: "#991b1b",
      panel: "rgba(255,255,255,0.94)",
    };
  }

  return {
    background: "linear-gradient(140deg, rgba(248,250,252,0.98) 0%, rgba(255,255,255,1) 58%, rgba(248,250,252,0.96) 100%)",
    border: "rgba(148, 163, 184, 0.22)",
    accent: "#475569",
    panel: "rgba(255,255,255,0.92)",
  };
}

export default function IntelligenceFasciaCard({ fascia, onAction, isMobile = false }) {
  if (!fascia) return null;

  const palette = getPalette(fascia.statusTone);
  const badgeLabel = fascia.sourceLabel || fascia.sourceMode || "";
  const badgeTone = fascia.sourceTone || (fascia.statusTone === "neutral" ? "neutral" : "info");

  return (
    <section
      style={{
        display: "grid",
        gap: "18px",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(280px, 0.9fr)",
        padding: isMobile ? "22px 16px" : "28px 30px",
        borderRadius: isMobile ? "20px" : "24px",
        background: palette.background,
        border: `1px solid ${palette.border}`,
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div style={{ display: "grid", gap: "14px", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px", minWidth: 0 }}>
            <div style={{ fontSize: "12px", color: palette.accent, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
              {fascia.title}
            </div>
            <div style={{ fontSize: isMobile ? "24px" : "30px", fontWeight: 800, color: "#0f172a", lineHeight: "1.1", letterSpacing: "-0.03em" }}>
              {fascia.status}
            </div>
          </div>
          {badgeLabel ? <StatusBadge label={badgeLabel} tone={badgeTone} /> : null}
        </div>

        <div style={{ color: "#334155", lineHeight: "1.8", fontSize: isMobile ? "15px" : "16px", maxWidth: "60ch" }}>
          {fascia.meaning}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {fascia.primaryAction ? (
            <button type="button" onClick={() => onAction?.(fascia.primaryAction)} style={buttonStyle(true)}>
              {fascia.primaryAction.label}
            </button>
          ) : null}
          {fascia.secondaryAction ? (
            <button type="button" onClick={() => onAction?.(fascia.secondaryAction)} style={buttonStyle(false)}>
              {fascia.secondaryAction.label}
            </button>
          ) : null}
        </div>

        {fascia.tertiaryAction ? (
          <div>
            <button type="button" onClick={() => onAction?.(fascia.tertiaryAction)} style={tertiaryButtonStyle(palette.accent)}>
              {fascia.tertiaryAction.label}
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: "12px", alignContent: "start", minWidth: 0 }}>
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "18px",
            background: palette.panel,
            border: "1px solid rgba(148, 163, 184, 0.18)",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
            Why
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#334155" }}>
            {(fascia.drivers || []).map((driver) => (
              <li key={driver} style={{ lineHeight: "1.65" }}>
                {driver}
              </li>
            ))}
          </ul>
        </div>

        {fascia.completenessNote ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.78)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              color: "#475569",
              lineHeight: "1.7",
              fontSize: "13px",
            }}
          >
            {fascia.completenessNote}
          </div>
        ) : null}
      </div>
    </section>
  );
}
