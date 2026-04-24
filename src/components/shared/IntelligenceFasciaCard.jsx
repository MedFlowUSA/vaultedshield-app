import StatusBadge from "./StatusBadge";

function buttonStyle(primary = false) {
  return {
    padding: "11px 16px",
    borderRadius: "999px",
    border: primary ? "none" : "1px solid rgba(15, 23, 42, 0.12)",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "13px",
    boxShadow: primary ? "0 14px 28px rgba(15, 23, 42, 0.16)" : "0 10px 22px rgba(148, 163, 184, 0.12)",
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
      background:
        "radial-gradient(circle at top left, rgba(34,197,94,0.14) 0%, rgba(34,197,94,0) 30%), linear-gradient(140deg, rgba(240,253,244,0.98) 0%, rgba(255,255,255,1) 60%, rgba(248,250,252,0.96) 100%)",
      border: "rgba(34, 197, 94, 0.20)",
      accent: "#166534",
      accentSoft: "rgba(34, 197, 94, 0.10)",
      panel: "rgba(255,255,255,0.88)",
    };
  }

  if (statusTone === "info") {
    return {
      background:
        "radial-gradient(circle at top left, rgba(96,165,250,0.14) 0%, rgba(96,165,250,0) 30%), linear-gradient(140deg, rgba(239,246,255,0.98) 0%, rgba(255,255,255,1) 60%, rgba(248,250,252,0.96) 100%)",
      border: "rgba(96, 165, 250, 0.22)",
      accent: "#1d4ed8",
      accentSoft: "rgba(96, 165, 250, 0.10)",
      panel: "rgba(255,255,255,0.90)",
    };
  }

  if (statusTone === "warning") {
    return {
      background:
        "radial-gradient(circle at top left, rgba(245,158,11,0.14) 0%, rgba(245,158,11,0) 30%), linear-gradient(140deg, rgba(255,251,235,0.98) 0%, rgba(255,255,255,1) 60%, rgba(248,250,252,0.96) 100%)",
      border: "rgba(245, 158, 11, 0.22)",
      accent: "#92400e",
      accentSoft: "rgba(245, 158, 11, 0.12)",
      panel: "rgba(255,255,255,0.92)",
    };
  }

  if (statusTone === "alert") {
    return {
      background:
        "radial-gradient(circle at top left, rgba(248,113,113,0.16) 0%, rgba(248,113,113,0) 30%), linear-gradient(140deg, rgba(254,242,242,0.98) 0%, rgba(255,255,255,1) 60%, rgba(248,250,252,0.96) 100%)",
      border: "rgba(248, 113, 113, 0.22)",
      accent: "#991b1b",
      accentSoft: "rgba(248, 113, 113, 0.10)",
      panel: "rgba(255,255,255,0.92)",
    };
  }

  return {
    background:
      "radial-gradient(circle at top left, rgba(148,163,184,0.12) 0%, rgba(148,163,184,0) 30%), linear-gradient(140deg, rgba(248,250,252,0.98) 0%, rgba(255,255,255,1) 60%, rgba(248,250,252,0.96) 100%)",
    border: "rgba(148, 163, 184, 0.20)",
    accent: "#475569",
    accentSoft: "rgba(148, 163, 184, 0.10)",
    panel: "rgba(255,255,255,0.90)",
  };
}

function getFriendlyHeadline(status = "") {
  if (status === "Strong") return "This looks strong at a glance.";
  if (status === "Stable") return "This looks mostly okay.";
  if (status === "Needs Review") return "This deserves a closer look.";
  if (status === "Partial" || status === "Incomplete") return "We can only see part of the picture.";
  if (status === "At Risk") return "This needs attention soon.";
  return "We need a little more information first.";
}

function getFriendlySupportCopy(status = "") {
  if (status === "Strong") return "You can start from the simple answer and only open the deeper proof if you want the details.";
  if (status === "Stable") return "Nothing immediately threatening is standing out, but it is still worth checking the main recommendation.";
  if (status === "Needs Review") return "The goal is not to panic. It is to look at the first useful next step before going deeper.";
  if (status === "Partial" || status === "Incomplete") return "This is a starting read, not a final verdict, because some important evidence is still missing.";
  if (status === "At Risk") return "Take the first recommended step, then use the deeper layer to understand what is causing pressure.";
  return "Once a little more evidence is available, the deeper analysis will become much more useful.";
}

function renderDriver(driver, index, accent, accentSoft) {
  return (
    <div
      key={`${driver}-${index}`}
      style={{
        display: "grid",
        gridTemplateColumns: "16px minmax(0, 1fr)",
        gap: "10px",
        alignItems: "start",
        padding: "10px 12px",
        borderRadius: "14px",
        background: "#ffffff",
        border: "1px solid rgba(226, 232, 240, 0.9)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "16px",
          height: "16px",
          marginTop: "2px",
          borderRadius: "999px",
          background: accentSoft,
          color: accent,
          display: "grid",
          placeItems: "center",
          fontSize: "10px",
          fontWeight: 800,
        }}
      >
        {index + 1}
      </span>
      <span style={{ color: "#334155", lineHeight: "1.65" }}>{driver}</span>
    </div>
  );
}

export default function IntelligenceFasciaCard({ fascia, onAction, isMobile = false }) {
  if (!fascia) return null;

  const palette = getPalette(fascia.statusTone);
  const badgeLabel = fascia.sourceLabel || fascia.sourceMode || "";
  const badgeTone = fascia.sourceTone || (fascia.statusTone === "neutral" ? "neutral" : "info");
  const friendlyHeadline = getFriendlyHeadline(fascia.status);
  const supportCopy = getFriendlySupportCopy(fascia.status);
  const layoutColumns = isMobile ? "1fr" : "minmax(0, 1.12fr) minmax(300px, 0.88fr)";

  return (
    <section
      style={{
        display: "grid",
        gap: "18px",
        gridTemplateColumns: layoutColumns,
        padding: isMobile ? "22px 16px" : "30px 30px",
        borderRadius: isMobile ? "22px" : "28px",
        background: palette.background,
        border: `1px solid ${palette.border}`,
        boxShadow: "0 22px 50px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ display: "grid", gap: "16px", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "10px", minWidth: 0 }}>
            <div
              style={{
                width: "fit-content",
                padding: "7px 12px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.78)",
                border: `1px solid ${palette.border}`,
                color: palette.accent,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontSize: "11px",
                fontWeight: 800,
                boxShadow: "0 10px 22px rgba(15, 23, 42, 0.05)",
              }}
            >
              Start Here
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
              {fascia.title}
            </div>
          </div>
          {badgeLabel ? <StatusBadge label={badgeLabel} tone={badgeTone} /> : null}
        </div>

        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontSize: isMobile ? "26px" : "34px", fontWeight: 800, color: "#0f172a", lineHeight: "1.08", letterSpacing: "-0.04em" }}>
            {friendlyHeadline}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              width: "fit-content",
              padding: "8px 12px",
              borderRadius: "999px",
              background: palette.accentSoft,
              color: palette.accent,
              fontSize: "13px",
              fontWeight: 800,
            }}
          >
            {fascia.status}
          </div>
          <div style={{ color: "#334155", lineHeight: "1.85", fontSize: isMobile ? "15px" : "16px", maxWidth: "62ch" }}>
            {fascia.meaning}
          </div>
          <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "62ch" }}>{supportCopy}</div>
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

      <div style={{ display: "grid", gap: "14px", alignContent: "start", minWidth: 0 }}>
        <div
          style={{
            padding: "18px 18px 20px",
            borderRadius: "22px",
            background: palette.panel,
            border: "1px solid rgba(255, 255, 255, 0.7)",
            boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)",
            display: "grid",
            gap: "12px",
          }}
        >
          <div style={{ display: "grid", gap: "4px" }}>
            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
              What Is Shaping This Answer
            </div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              These are the main reasons the page landed on this first-read verdict.
            </div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {(fascia.drivers || []).map((driver, index) => renderDriver(driver, index, palette.accent, palette.accentSoft))}
          </div>
        </div>

        <div
          style={{
            padding: "16px 18px",
            borderRadius: "20px",
            background: "rgba(255,255,255,0.76)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            display: "grid",
            gap: "8px",
          }}
        >
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
            A Note About Confidence
          </div>
          <div style={{ color: "#475569", lineHeight: "1.7", fontSize: "14px" }}>
            {fascia.completenessNote || "You can use the top answer for quick orientation, then open more detail only when you want the proof underneath it."}
          </div>
        </div>
      </div>
    </section>
  );
}
