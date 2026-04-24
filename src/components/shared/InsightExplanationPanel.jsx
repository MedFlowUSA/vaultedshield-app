function actionButtonStyle(primary = false) {
  return {
    padding: "11px 16px",
    borderRadius: "999px",
    border: primary ? "none" : "1px solid rgba(15, 23, 42, 0.12)",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "13px",
    boxShadow: primary ? "0 14px 28px rgba(15, 23, 42, 0.14)" : "0 10px 22px rgba(148, 163, 184, 0.12)",
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

function cardStyle(background = "#ffffff", border = "1px solid rgba(148, 163, 184, 0.16)") {
  return {
    display: "grid",
    gap: "10px",
    padding: "18px 18px",
    borderRadius: "18px",
    background,
    border,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.04)",
  };
}

function renderBulletList(items = [], tone = "neutral") {
  if (!Array.isArray(items) || items.length === 0) return null;

  const bulletBackground = tone === "soft-blue" ? "rgba(96, 165, 250, 0.12)" : "rgba(148, 163, 184, 0.12)";
  const bulletColor = tone === "soft-blue" ? "#1d4ed8" : "#475569";

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {items.map((item, index) => (
        <div
          key={`${item}-${index}`}
          style={{
            display: "grid",
            gridTemplateColumns: "22px minmax(0, 1fr)",
            gap: "10px",
            alignItems: "start",
            color: "#334155",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "999px",
              background: bulletBackground,
              color: bulletColor,
              display: "grid",
              placeItems: "center",
              fontSize: "11px",
              fontWeight: 800,
              marginTop: "2px",
            }}
          >
            {index + 1}
          </span>
          <span style={{ lineHeight: "1.7" }}>{item}</span>
        </div>
      ))}
    </div>
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

  const openHeight = isMobile ? "2200px" : "1900px";

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
          padding: isMobile ? "22px 16px" : "28px 28px",
          borderRadius: isMobile ? "22px" : "26px",
          background:
            "radial-gradient(circle at top left, rgba(96,165,250,0.12) 0%, rgba(96,165,250,0) 28%), linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,250,252,0.98) 100%)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          boxShadow: "0 18px 42px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "6px", minWidth: 0 }}>
            <div
              style={{
                width: "fit-content",
                padding: "7px 12px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.8)",
                border: "1px solid rgba(96, 165, 250, 0.18)",
                color: "#1d4ed8",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              Behind The Answer
            </div>
            <div style={{ fontSize: isMobile ? "24px" : "28px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>
              Here is the simple explanation before the deeper proof.
            </div>
            <div style={{ color: "#475569", lineHeight: "1.7", maxWidth: "72ch" }}>
              This section is meant to help a normal reader understand the result first. The lower proof layers are still available whenever you
              want the technical reasoning.
            </div>
          </div>
          <button type="button" onClick={onToggle} style={actionButtonStyle(false)}>
            Hide this layer
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gap: "10px",
            padding: "16px 18px",
            borderRadius: "18px",
            background: "linear-gradient(180deg, rgba(239,246,255,0.82) 0%, rgba(255,255,255,0.96) 100%)",
            border: "1px solid rgba(147, 197, 253, 0.24)",
          }}
        >
          <div style={sectionTitleStyle()}>How To Read This</div>
          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))" }}>
            {[
              "Start with the short explanation so you know what this result means.",
              "Use the next-step card if you just want the most useful action.",
              "Open the lower proof sections only when you want evidence, comparisons, or workflow detail.",
            ].map((item, index) => (
              <div
                key={item}
                style={{
                  display: "grid",
                  gap: "8px",
                  padding: "14px 14px",
                  borderRadius: "16px",
                  background: "rgba(255,255,255,0.86)",
                  border: "1px solid rgba(255,255,255,0.9)",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "999px",
                    background: "rgba(96, 165, 250, 0.14)",
                    color: "#1d4ed8",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: "12px",
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ color: "#334155", lineHeight: "1.7" }}>{item}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <div style={cardStyle()}>
            <div style={sectionTitleStyle()}>Simple Explanation</div>
            <div style={{ color: "#334155", lineHeight: "1.8" }}>{explanation.summary}</div>
          </div>

          <div
            style={{
              display: "grid",
              gap: "16px",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            }}
          >
            <div style={cardStyle()}>
              <div style={sectionTitleStyle()}>What We Looked At</div>
              {renderBulletList(explanation.dataSources, "soft-blue")}
            </div>

            <div style={cardStyle()}>
              <div style={sectionTitleStyle()}>Why We Landed Here</div>
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
            <div style={cardStyle("rgba(255,255,255,0.96)", "1px solid rgba(148, 163, 184, 0.18)")}>
              <div style={sectionTitleStyle()}>What Could Change This Read</div>
              {renderBulletList(explanation.limitations)}
            </div>

            <div style={cardStyle("linear-gradient(180deg, rgba(239,246,255,0.9) 0%, rgba(255,255,255,1) 100%)", "1px solid rgba(147, 197, 253, 0.24)")}>
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

          <div
            style={{
              padding: "16px 18px",
              borderRadius: "18px",
              background: "rgba(15, 23, 42, 0.94)",
              color: "#e2e8f0",
              display: "grid",
              gap: "8px",
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.14)",
            }}
          >
            <div style={{ ...sectionTitleStyle(), color: "rgba(191, 219, 254, 0.9)" }}>Deeper Review</div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#f8fafc" }}>The technical proof is still here when you want it.</div>
            <div style={{ color: "rgba(226, 232, 240, 0.86)", lineHeight: "1.7", maxWidth: "72ch" }}>
              Evidence, comparisons, timelines, supporting metrics, and workflow depth are still part of this page. This layer just makes the
              first read easier before you step into the full analysis.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
