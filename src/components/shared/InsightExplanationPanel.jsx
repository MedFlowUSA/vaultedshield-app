function actionButtonStyle(primary = false) {
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

function sectionTitleStyle() {
  return {
    fontSize: "11px",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontWeight: 800,
  };
}

function renderBulletList(items = []) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#334155" }}>
      {items.map((item) => (
        <li key={item} style={{ lineHeight: "1.7" }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function InsightExplanationPanel({
  isOpen = false,
  explanation = null,
  onToggle,
  onAction,
  isMobile = false,
}) {
  if (!explanation) return null;

  const openHeight = isMobile ? "1600px" : "1400px";

  return (
    <section
      aria-hidden={!isOpen}
      style={{
        overflow: "hidden",
        maxHeight: isOpen ? openHeight : "0px",
        opacity: isOpen ? 1 : 0,
        transform: isOpen ? "translateY(0)" : "translateY(-6px)",
        transition: "max-height 260ms ease, opacity 220ms ease, transform 220ms ease",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      <div
        style={{
          marginTop: "14px",
          display: "grid",
          gap: "18px",
          padding: isMobile ? "20px 16px" : "24px 26px",
          borderRadius: isMobile ? "20px" : "22px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          boxShadow: "0 12px 28px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "6px", minWidth: 0 }}>
            <div style={sectionTitleStyle()}>Interpretation Bridge</div>
            <div style={{ fontSize: isMobile ? "22px" : "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>
              Why This Result Is Showing
            </div>
            <div style={{ color: "#475569", lineHeight: "1.7", maxWidth: "72ch" }}>
              This layer explains the diagnosis in guided plain English before you move into the deeper intelligence sections below.
            </div>
          </div>
          <button type="button" onClick={onToggle} style={actionButtonStyle(false)}>
            Hide explanation
          </button>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <div
            style={{
              display: "grid",
              gap: "10px",
              padding: "16px 18px",
              borderRadius: "16px",
              background: "#ffffff",
              border: "1px solid rgba(148, 163, 184, 0.16)",
            }}
          >
            <div style={sectionTitleStyle()}>Summary</div>
            <div style={{ color: "#334155", lineHeight: "1.8" }}>{explanation.summary}</div>
          </div>

          <div
            style={{
              display: "grid",
              gap: "16px",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "10px",
                padding: "16px 18px",
                borderRadius: "16px",
                background: "#ffffff",
                border: "1px solid rgba(148, 163, 184, 0.16)",
              }}
            >
              <div style={sectionTitleStyle()}>What Was Analyzed</div>
              {renderBulletList(explanation.dataSources)}
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
                padding: "16px 18px",
                borderRadius: "16px",
                background: "#ffffff",
                border: "1px solid rgba(148, 163, 184, 0.16)",
              }}
            >
              <div style={sectionTitleStyle()}>Why This Status Was Assigned</div>
              <div style={{ color: "#334155", lineHeight: "1.8" }}>{explanation.whyStatusAssigned}</div>
              {renderBulletList(explanation.drivers)}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: "16px",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "10px",
                padding: "16px 18px",
                borderRadius: "16px",
                background: "#ffffff",
                border: "1px solid rgba(148, 163, 184, 0.16)",
              }}
            >
              <div style={sectionTitleStyle()}>What Is Missing Or Limiting Confidence</div>
              {renderBulletList(explanation.limitations)}
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
                padding: "16px 18px",
                borderRadius: "16px",
                background: "linear-gradient(180deg, rgba(239,246,255,0.9) 0%, rgba(255,255,255,1) 100%)",
                border: "1px solid rgba(147, 197, 253, 0.24)",
              }}
            >
              <div style={sectionTitleStyle()}>Best Next Step</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                {explanation.recommendedAction?.label || "Review the available insurance evidence"}
              </div>
              <div style={{ color: "#334155", lineHeight: "1.8" }}>
                {explanation.recommendedAction?.detail || "Use the next recommended section to strengthen the interpretation."}
              </div>
              {explanation.recommendedAction?.action ? (
                <div>
                  <button type="button" onClick={() => onAction?.(explanation.recommendedAction.action)} style={actionButtonStyle(true)}>
                    {explanation.recommendedAction.label}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
