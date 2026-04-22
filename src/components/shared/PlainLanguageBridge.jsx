export default function PlainLanguageBridge({
  eyebrow = "Plain-English First",
  title,
  summary,
  transition,
  quickFacts = [],
  cards = [],
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel = "Step Into The Deeper Breakdown",
  onSecondaryAction,
  guideEyebrow,
  guideTitle,
  guideDescription,
  guideSteps = [],
  translatedTerms = [],
  depthEyebrow = "When You Want More Depth",
  depthTitle,
  depthDescription,
  depthPrimaryActionLabel,
  onDepthPrimaryAction,
  depthSecondaryActionLabel,
  onDepthSecondaryAction,
  analysisRef,
  analysisEyebrow = "Deeper Review Starts Here",
  analysisTitle = "Technical breakdown",
  analysisDescription,
  compact = false,
  showAnalysisDivider = true,
}) {
  const hasMiddleGuide =
    guideSteps.length > 0 ||
    translatedTerms.length > 0 ||
    (depthPrimaryActionLabel && onDepthPrimaryAction) ||
    (depthSecondaryActionLabel && onDepthSecondaryAction) ||
    guideTitle ||
    guideDescription ||
    depthTitle ||
    depthDescription;

  const heroPadding = compact ? "24px 18px" : "30px 32px";
  const sectionShadow = "0 24px 60px rgba(15, 23, 42, 0.08)";
  const surfaceBorder = "1px solid rgba(148, 163, 184, 0.16)";
  const cardShadow = "0 14px 32px rgba(15, 23, 42, 0.06)";
  const pillButton = {
    padding: "11px 16px",
    borderRadius: "999px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "13px",
    letterSpacing: "-0.01em",
  };

  return (
    <>
      <section
        style={{
          marginTop: "24px",
          display: "grid",
          gap: "20px",
          padding: heroPadding,
          borderRadius: compact ? "26px" : "30px",
          background:
            "radial-gradient(circle at top left, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 28%), radial-gradient(circle at top right, rgba(56,189,248,0.14) 0%, rgba(56,189,248,0) 34%), linear-gradient(135deg, rgba(255,247,237,0.98) 0%, rgba(255,255,255,1) 54%, rgba(240,249,255,0.96) 100%)",
          border: "1px solid rgba(251, 146, 60, 0.18)",
          boxShadow: sectionShadow,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: compact ? "1fr" : "minmax(0, 1.15fr) minmax(280px, 0.85fr)",
            gap: compact ? "16px" : "20px",
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: "12px",
              minWidth: 0,
              padding: compact ? "2px 2px 0" : "4px 4px 0",
            }}
          >
            <div
              style={{
                width: "fit-content",
                padding: "7px 11px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.82)",
                border: "1px solid rgba(251, 146, 60, 0.18)",
                boxShadow: "0 8px 20px rgba(251, 146, 60, 0.08)",
                fontSize: "11px",
                color: "#c2410c",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontWeight: 800,
              }}
            >
              {eyebrow}
            </div>
            <div style={{ fontSize: compact ? "26px" : "34px", fontWeight: 800, color: "#0f172a", lineHeight: "1.08", letterSpacing: "-0.04em" }}>
              {title}
            </div>
            <div style={{ fontSize: compact ? "18px" : "20px", color: "#0f172a", fontWeight: 700, lineHeight: "1.45", maxWidth: "42rem" }}>
              {summary}
            </div>
            <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "46rem" }}>{transition}</div>
          </div>

          <div
            style={{
              padding: compact ? "18px 18px 20px" : "20px 20px 22px",
              borderRadius: "24px",
              background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)",
              border: surfaceBorder,
              display: "grid",
              gap: "14px",
              boxShadow: cardShadow,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "999px",
                  background: "linear-gradient(135deg, #f97316 0%, #fb7185 100%)",
                  boxShadow: "0 0 0 5px rgba(249,115,22,0.12)",
                }}
              />
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Quick Read
              </div>
            </div>

            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "10px", color: "#334155" }}>
              {quickFacts.map((item) => (
                <li
                  key={item}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "16px minmax(0, 1fr)",
                    gap: "10px",
                    alignItems: "start",
                    padding: "10px 12px",
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.78)",
                    border: "1px solid rgba(226,232,240,0.9)",
                    lineHeight: "1.65",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      marginTop: "8px",
                      borderRadius: "999px",
                      background: "#0f172a",
                    }}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {primaryActionLabel && onPrimaryAction ? (
                <button
                  type="button"
                  onClick={onPrimaryAction}
                  style={{
                    ...pillButton,
                    border: "none",
                    background: "#0f172a",
                    color: "#fff",
                    boxShadow: "0 12px 24px rgba(15, 23, 42, 0.18)",
                  }}
                >
                  {primaryActionLabel}
                </button>
              ) : null}
              {secondaryActionLabel && onSecondaryAction ? (
                <button
                  type="button"
                  onClick={onSecondaryAction}
                  style={{
                    ...pillButton,
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    background: "#fff",
                    color: "#0f172a",
                    boxShadow: "0 10px 22px rgba(148, 163, 184, 0.12)",
                  }}
                >
                  {secondaryActionLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: compact ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: "14px",
          }}
        >
          {cards.map((card) => (
            <div
              key={card.label}
              style={{
                padding: compact ? "18px 18px 20px" : "20px 20px 22px",
                borderRadius: "22px",
                background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.94) 100%)",
                border: surfaceBorder,
                display: "grid",
                gap: "10px",
                boxShadow: "0 12px 28px rgba(15, 23, 42, 0.05)",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                {card.label}
              </div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", lineHeight: "1.25" }}>{card.value}</div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{card.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {hasMiddleGuide ? (
        <section
          style={{
            marginTop: "20px",
            display: "grid",
            gap: "18px",
            padding: compact ? "22px 18px" : "24px 26px",
            borderRadius: compact ? "24px" : "28px",
            background:
              "radial-gradient(circle at top right, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0) 30%), linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(255,255,255,1) 100%)",
            border: surfaceBorder,
            boxShadow: "0 20px 42px rgba(15, 23, 42, 0.05)",
          }}
        >
          {guideTitle || guideDescription ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <div
                style={{
                  width: "fit-content",
                  padding: "7px 11px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.9)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  fontSize: "11px",
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  fontWeight: 800,
                }}
              >
                {guideEyebrow || "From Simple To Detailed"}
              </div>
              {guideTitle ? (
                <div style={{ fontSize: compact ? "24px" : "28px", fontWeight: 800, color: "#0f172a", lineHeight: "1.15", letterSpacing: "-0.03em" }}>
                  {guideTitle}
                </div>
              ) : null}
              {guideDescription ? (
                <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "56rem" }}>
                  {guideDescription}
                </div>
              ) : null}
            </div>
          ) : null}

          {guideSteps.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: compact ? "1fr" : "repeat(3, minmax(0, 1fr))",
                gap: "14px",
              }}
            >
              {guideSteps.map((step) => (
                <div
                  key={step.label || step.title}
                  style={{
                    padding: "20px 20px 22px",
                    borderRadius: "22px",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.94) 100%)",
                    border: surfaceBorder,
                    display: "grid",
                    gap: "8px",
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  {step.label ? (
                    <div
                      style={{
                        width: "fit-content",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: "rgba(14, 165, 233, 0.1)",
                        color: "#0369a1",
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontWeight: 800,
                      }}
                    >
                      {step.label}
                    </div>
                  ) : null}
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{step.title}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{step.detail}</div>
                </div>
              ))}
            </div>
          ) : null}

          {translatedTerms.length > 0 || depthTitle || depthDescription || (depthPrimaryActionLabel && onDepthPrimaryAction) || (depthSecondaryActionLabel && onDepthSecondaryAction) ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: compact ? "1fr" : "minmax(0, 1fr) minmax(280px, 0.9fr)",
                gap: "16px",
                alignItems: "start",
              }}
            >
              {translatedTerms.length > 0 ? (
                <div
                  style={{
                    padding: "20px 20px 22px",
                    borderRadius: "22px",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.94) 100%)",
                    border: surfaceBorder,
                    display: "grid",
                    gap: "12px",
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                    Translate The Analyst Terms
                  </div>
                  {translatedTerms.map((item) => (
                    <details
                      key={item.term}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "16px",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>{item.term}</summary>
                      <div style={{ marginTop: "10px", color: "#475569", lineHeight: "1.7" }}>{item.meaning}</div>
                    </details>
                  ))}
                </div>
              ) : null}

              {depthTitle || depthDescription || (depthPrimaryActionLabel && onDepthPrimaryAction) || (depthSecondaryActionLabel && onDepthSecondaryAction) ? (
                <div
                  style={{
                    padding: "20px 20px 22px",
                    borderRadius: "22px",
                    background:
                      "radial-gradient(circle at top right, rgba(56,189,248,0.22) 0%, rgba(56,189,248,0) 36%), linear-gradient(180deg, #0f172a 0%, #111827 100%)",
                    border: "1px solid rgba(15, 23, 42, 0.12)",
                    color: "#ffffff",
                    display: "grid",
                    gap: "12px",
                    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.18)",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "rgba(191, 219, 254, 0.92)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                    {depthEyebrow}
                  </div>
                  {depthTitle ? (
                    <div style={{ fontSize: "20px", fontWeight: 800, lineHeight: "1.25" }}>
                      {depthTitle}
                    </div>
                  ) : null}
                  {depthDescription ? (
                    <div style={{ color: "rgba(226, 232, 240, 0.9)", lineHeight: "1.8" }}>
                      {depthDescription}
                    </div>
                  ) : null}
                  {((depthPrimaryActionLabel && onDepthPrimaryAction) || (depthSecondaryActionLabel && onDepthSecondaryAction)) ? (
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {depthPrimaryActionLabel && onDepthPrimaryAction ? (
                        <button
                          type="button"
                          onClick={onDepthPrimaryAction}
                          style={{
                            ...pillButton,
                            border: "none",
                            background: "#fff",
                            color: "#0f172a",
                            boxShadow: "0 10px 20px rgba(255,255,255,0.16)",
                          }}
                        >
                          {depthPrimaryActionLabel}
                        </button>
                      ) : null}
                      {depthSecondaryActionLabel && onDepthSecondaryAction ? (
                        <button
                          type="button"
                          onClick={onDepthSecondaryAction}
                          style={{
                            ...pillButton,
                            border: "1px solid rgba(255,255,255,0.25)",
                            background: "transparent",
                            color: "#fff",
                          }}
                        >
                          {depthSecondaryActionLabel}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {showAnalysisDivider ? (
        <section
          ref={analysisRef}
          style={{
            marginTop: "24px",
            display: "grid",
            gap: "10px",
            padding: compact ? "20px 18px" : "22px 26px",
            borderRadius: compact ? "24px" : "28px",
            background:
              "radial-gradient(circle at top right, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0) 34%), linear-gradient(180deg, #0f172a 0%, #111827 100%)",
            color: "#ffffff",
            border: "1px solid rgba(15, 23, 42, 0.12)",
            boxShadow: "0 20px 40px rgba(15, 23, 42, 0.16)",
          }}
        >
          <div style={{ fontSize: "12px", color: "rgba(191, 219, 254, 0.92)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
            {analysisEyebrow}
          </div>
          <div style={{ fontSize: compact ? "22px" : "26px", fontWeight: 800, lineHeight: "1.2", letterSpacing: "-0.03em" }}>
            {analysisTitle}
          </div>
          <div style={{ color: "rgba(226, 232, 240, 0.9)", lineHeight: "1.8", maxWidth: "60rem" }}>
            {analysisDescription}
          </div>
        </section>
      ) : null}
    </>
  );
}
