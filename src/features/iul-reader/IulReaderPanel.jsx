import { useRef } from "react";

function ReaderStatusBadge({ status, children }) {
  const tone =
    status === "confirmed"
      ? { background: "#dcfce7", color: "#166534", border: "#bbf7d0" }
      : status === "review"
        ? { background: "#fef3c7", color: "#92400e", border: "#fde68a" }
        : { background: "#e2e8f0", color: "#334155", border: "#cbd5e1" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 8px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 700,
        background: tone.background,
        color: tone.color,
        border: `1px solid ${tone.border}`,
      }}
    >
      {children}
    </span>
  );
}

function VerdictBannerTone(status) {
  if (status === "green") {
    return {
      background: "linear-gradient(135deg, rgba(220,252,231,1) 0%, rgba(240,253,244,1) 48%, rgba(255,255,255,1) 100%)",
      border: "#86efac",
      text: "#14532d",
      chipBackground: "#166534",
      chipText: "#f0fdf4",
      buttonBackground: "#14532d",
      buttonText: "#f8fafc",
    };
  }
  if (status === "red") {
    return {
      background: "linear-gradient(135deg, rgba(254,242,242,1) 0%, rgba(255,245,245,1) 48%, rgba(255,255,255,1) 100%)",
      border: "#fca5a5",
      text: "#7f1d1d",
      chipBackground: "#991b1b",
      chipText: "#fef2f2",
      buttonBackground: "#7f1d1d",
      buttonText: "#fff7f7",
    };
  }
  return {
    background: "linear-gradient(135deg, rgba(254,249,195,1) 0%, rgba(255,251,235,1) 48%, rgba(255,255,255,1) 100%)",
    border: "#fcd34d",
    text: "#78350f",
    chipBackground: "#92400e",
    chipText: "#fffbeb",
    buttonBackground: "#78350f",
    buttonText: "#fffbeb",
  };
}

function VerdictActionButton({ children, onClick, primary = false, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 14px",
        borderRadius: "999px",
        border: primary ? `1px solid ${tone.buttonBackground}` : `1px solid ${tone.border}`,
        background: primary ? tone.buttonBackground : "#ffffff",
        color: primary ? tone.buttonText : tone.text,
        fontWeight: 700,
        fontSize: "13px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function BenchmarkTone(status) {
  if (status === "good") return { background: "#dcfce7", color: "#166534", border: "#bbf7d0" };
  if (status === "watch") return { background: "#fef3c7", color: "#92400e", border: "#fde68a" };
  if (status === "risk") return { background: "#fee2e2", color: "#991b1b", border: "#fecaca" };
  return { background: "#e2e8f0", color: "#334155", border: "#cbd5e1" };
}

function FocusTone(status) {
  if (["good", "ahead", "on_track", "low", "healthy", "sufficient", "diversified"].includes(status)) {
    return { background: "#dcfce7", color: "#166534", border: "#bbf7d0" };
  }
  if (["watch", "moderate", "mixed", "medium", "concentrated"].includes(status)) {
    return { background: "#fef3c7", color: "#92400e", border: "#fde68a" };
  }
  if (["risk", "behind", "high", "at_risk", "underfunded"].includes(status)) {
    return { background: "#fee2e2", color: "#991b1b", border: "#fecaca" };
  }
  return { background: "#e2e8f0", color: "#334155", border: "#cbd5e1" };
}

function TableTone(status) {
  if (status === "confirmed") return "#166534";
  if (status === "review") return "#92400e";
  return "#64748b";
}

function bandToReaderStatus(band) {
  if (band === "strong") return "confirmed";
  if (band === "watch") return "review";
  return "missing";
}

function bandToLabel(band) {
  if (band === "strong") return "Healthy";
  if (band === "watch") return "Watch";
  return "Attention";
}

function questionStatusToReaderStatus(status) {
  if (status === "good") return "confirmed";
  if (status === "watch") return "review";
  return "missing";
}

function questionStatusToLabel(status) {
  if (status === "good") return "Stable";
  if (status === "watch") return "Watch";
  return "Pressure";
}

function buildWhatMattersRightNow(reader) {
  const topPressure = reader.verdict?.pressureStack?.[0] || null;
  const nextMove =
    reader.verdict?.reviewOrder?.[0] ||
    reader.plainEnglishScorecard?.nextAction ||
    reader.nextSteps?.[0] ||
    "Continue adding cleaner annual statements and support pages.";
  const projectionRead = reader.projectionView?.available
    ? reader.projectionView.currentMatch
      ? "Illustration proof is available and the current policy-year match is visible."
      : "Illustration proof is partially available, but the current policy-year match is still directional."
    : "Illustration proof is still limited because usable ledger checkpoints were not extracted yet.";
  const opening =
    reader.verdict?.verdict === "Healthy"
      ? "This policy currently appears stable from the visible packet."
      : reader.verdict?.verdict === "Under Pressure"
        ? "This policy currently appears to be under visible pressure."
        : "This policy currently appears readable, but not clean enough to leave on autopilot.";
  const driver = topPressure
    ? `${topPressure.label} is the biggest visible driver right now.`
    : "No single driver dominates yet, but the packet still needs a disciplined review.";

  return {
    summary: `${opening} ${driver}`,
    support: topPressure?.explanation || projectionRead,
    action: nextMove,
    proof: projectionRead,
  };
}

function buildSectionSignals(reader) {
  const questions = Array.isArray(reader.verdict?.reviewQuestions) ? reader.verdict.reviewQuestions : [];
  const lookup = new Map(questions.map((item) => [item.label, item]));

  return [
    lookup.get("Is it keeping pace?")
      ? {
          title: "Illustration Pace",
          status: lookup.get("Is it keeping pace?").status,
          label: questionStatusToLabel(lookup.get("Is it keeping pace?").status),
          summary: lookup.get("Is it keeping pace?").answer,
          target: "proof",
        }
      : null,
    lookup.get("Are charges creating drag?")
      ? {
          title: "Charges",
          status: lookup.get("Are charges creating drag?").status,
          label: questionStatusToLabel(lookup.get("Are charges creating drag?").status),
          summary: lookup.get("Are charges creating drag?").answer,
          target: "next_action",
        }
      : null,
    lookup.get("Is funding support adequate?")
      ? {
          title: "Funding",
          status: lookup.get("Is funding support adequate?").status,
          label: questionStatusToLabel(lookup.get("Is funding support adequate?").status),
          summary: lookup.get("Is funding support adequate?").answer,
          target: "funding_pace",
        }
      : null,
    lookup.get("Are loans increasing pressure?")
      ? {
          title: "Loans",
          status: lookup.get("Are loans increasing pressure?").status,
          label: questionStatusToLabel(lookup.get("Are loans increasing pressure?").status),
          summary: lookup.get("Are loans increasing pressure?").answer,
          target: "next_action",
        }
      : null,
    lookup.get("Is the evidence strong enough to trust this read?")
      ? {
          title: "Evidence Quality",
          status: lookup.get("Is the evidence strong enough to trust this read?").status,
          label: questionStatusToLabel(lookup.get("Is the evidence strong enough to trust this read?").status),
          summary: lookup.get("Is the evidence strong enough to trust this read?").answer,
          target: "evidence",
        }
      : null,
  ].filter(Boolean);
}

function renderReaderTable(table) {
  return (
    <div key={table.title} style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ margin: 0 }}>{table.title}</h4>
          <p style={{ margin: "6px 0 0 0", color: "#64748b", lineHeight: "1.6" }}>{table.description}</p>
        </div>
      </div>
      <div style={{ marginTop: "12px", borderRadius: "14px", overflowX: "auto", maxWidth: "100%", border: "1px solid #e2e8f0" }}>
        <div style={{ minWidth: "100%", width: "max-content" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(140px, 0.95fr) minmax(150px, 1fr) minmax(240px, 1.45fr)",
              background: "#f8fafc",
              padding: "10px 14px",
              fontSize: "12px",
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            <div>Field</div>
            <div>Current Read</div>
            <div>Why It Matters</div>
          </div>
          {table.rows.map((row, index) => (
            <div
              key={`${table.title}-${row.label}`}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(140px, 0.95fr) minmax(150px, 1fr) minmax(240px, 1.45fr)",
                gap: "12px",
                padding: "12px 14px",
                background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                borderTop: index === 0 ? "none" : "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: "13px", color: "#334155", fontWeight: 600, overflowWrap: "anywhere" }}>{row.label}</div>
              <div style={{ fontSize: "14px", color: TableTone(row.status), fontWeight: 700, overflowWrap: "anywhere" }}>{row.value}</div>
              <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6", overflowWrap: "anywhere" }}>{row.note || "No extra explanation available yet."}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function IulReaderPanel({ reader }) {
  const trustSectionRef = useRef(null);
  const policyReadSectionRef = useRef(null);
  const prioritiesSectionRef = useRef(null);
  const unifiedLeversSectionRef = useRef(null);
  const performanceSectionRef = useRef(null);
  const verdictSectionRef = useRef(null);
  const proofSectionRef = useRef(null);
  const evidenceSectionRef = useRef(null);

  function scrollToReaderSection(target) {
    const lookup = {
      confidence: trustSectionRef,
      current_position: policyReadSectionRef,
      funding_pace: unifiedLeversSectionRef,
      cost_pressure: unifiedLeversSectionRef,
      strategy_mix: unifiedLeversSectionRef,
      next_action: prioritiesSectionRef,
      benchmarks: performanceSectionRef,
      verdict: verdictSectionRef,
      proof: proofSectionRef,
      evidence: evidenceSectionRef,
    };

    const ref = lookup[target];
    if (ref?.current?.scrollIntoView) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const bannerTone = VerdictBannerTone(reader.verdict?.decisionBanner?.status);
  const mattersNow = buildWhatMattersRightNow(reader);
  const sectionSignals = buildSectionSignals(reader);

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dbe7ff",
        borderRadius: "18px",
        padding: "24px",
        boxShadow: "0 12px 34px rgba(15, 23, 42, 0.06)",
        marginBottom: "28px",
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        overflowX: "clip",
        overflowY: "visible",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ maxWidth: "700px", minWidth: 0 }}>
          <div style={{ fontSize: "12px", letterSpacing: "0.7px", color: "#1d4ed8", fontWeight: 800 }}>IUL REVIEW CONSOLE</div>
          <h2 style={{ margin: "8px 0 10px 0" }}>Start with the verdict, then verify the why</h2>
          <p style={{ margin: 0, color: "#475569", lineHeight: "1.7" }}>
            This review starts with one adjudicated policy read, then moves into pressure, illustration support, charges, funding, and evidence quality.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px", minWidth: 0, width: "100%", flex: "1 1 320px" }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
            <div style={{ fontSize: "12px", color: "#64748b" }}>Confirmed</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px", color: "#166534" }}>{reader.confirmed.length}</div>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
            <div style={{ fontSize: "12px", color: "#64748b" }}>Needs Review</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px", color: "#92400e" }}>{reader.review.length}</div>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
            <div style={{ fontSize: "12px", color: "#64748b" }}>Missing</div>
            <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "4px", color: "#334155" }}>{reader.missing.length}</div>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "16px",
          padding: "12px 14px",
          borderRadius: "14px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          display: "flex",
          gap: "10px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, minWidth: "fit-content" }}>
          Review Flow
        </div>
        <div style={{ color: "#475569", lineHeight: "1.7", flex: "1 1 540px" }}>
          Verdict first. Then pressure stack, review questions, illustration proof, chronology, and source-backed evidence.
        </div>
      </div>

      <div style={{ marginTop: "20px", display: "grid", gap: "18px", alignItems: "start" }}>
        {reader.verdict ? (
          <div
            ref={verdictSectionRef}
            style={{
              background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
              border: "1px solid rgba(147, 197, 253, 0.28)",
              borderRadius: "18px",
              padding: "20px",
              display: "grid",
              gap: "16px",
              minWidth: 0,
              scrollMarginTop: "96px",
            }}
          >
            {reader.verdict.decisionBanner ? (
              <div
                data-demo-id="iul-verdict-banner"
                style={{
                  position: "sticky",
                  top: "12px",
                  zIndex: 1,
                  padding: "18px",
                  borderRadius: "18px",
                  background: bannerTone.background,
                  border: `1px solid ${bannerTone.border}`,
                  display: "grid",
                  gap: "14px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ display: "grid", gap: "8px", maxWidth: "760px" }}>
                    <div style={{ fontSize: "12px", color: bannerTone.text, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                      Verdict Banner
                    </div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "999px",
                          background: bannerTone.chipBackground,
                          boxShadow: `0 0 0 4px ${bannerTone.border}`,
                          flex: "0 0 auto",
                        }}
                      />
                      <div style={{ fontSize: "28px", fontWeight: 800, color: bannerTone.text, lineHeight: "1.2" }}>
                        {reader.verdict.decisionBanner.label}
                      </div>
                    </div>
                    <div style={{ color: bannerTone.text, lineHeight: "1.7", fontWeight: 600 }}>
                      {reader.verdict.decisionBanner.summary}
                    </div>
                    <div style={{ color: bannerTone.text, lineHeight: "1.7", opacity: 0.92 }}>
                      {reader.verdict.headline}
                    </div>
                  </div>
                  <div
                    style={{
                      minWidth: "210px",
                      padding: "14px 16px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.82)",
                      border: `1px solid ${bannerTone.border}`,
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: bannerTone.text, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Current Read
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{reader.verdict.verdict}</div>
                    <div
                      style={{
                        display: "inline-flex",
                        width: "fit-content",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: bannerTone.chipBackground,
                        color: bannerTone.chipText,
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      Confidence {reader.verdict.confidenceLabel}
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.65", fontSize: "13px" }}>
                      Biggest missing link: {reader.verdict.missingLink}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                  {reader.verdict.decisionBanner.quickFacts.map((fact) => (
                    <div
                      key={fact.label}
                      style={{
                        padding: "13px 14px",
                        borderRadius: "14px",
                        background: "rgba(255,255,255,0.84)",
                        border: `1px solid ${bannerTone.border}`,
                        display: "grid",
                        gap: "6px",
                      }}
                    >
                      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{fact.label}</div>
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", lineHeight: "1.35" }}>{fact.value}</div>
                      <div style={{ color: "#475569", lineHeight: "1.55", fontSize: "12px" }}>{fact.note}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <VerdictActionButton primary tone={bannerTone} onClick={() => scrollToReaderSection("proof")}>
                    View Illustration Proof
                  </VerdictActionButton>
                  <VerdictActionButton tone={bannerTone} onClick={() => scrollToReaderSection("evidence")}>
                    View Evidence
                  </VerdictActionButton>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ display: "grid", gap: "8px", maxWidth: "820px" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                  Policy Verdict
                </div>
                <h3 style={{ margin: 0 }}>One adjudicated read before the deeper analytics</h3>
                <div style={{ color: "#0f172a", lineHeight: "1.75", fontWeight: 700 }}>
                  {reader.verdict.headline}
                </div>
                <div style={{ color: "#475569", lineHeight: "1.75" }}>
                  {reader.verdict.rationale}
                </div>
              </div>
              <div
                style={{
                  minWidth: "180px",
                  padding: "16px 18px",
                  borderRadius: "16px",
                  background: "#ffffff",
                  border: "1px solid #dbeafe",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Current Verdict
                </div>
                <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>{reader.verdict.verdict}</div>
                <ReaderStatusBadge status={reader.verdict.verdict === "Healthy" ? "confirmed" : reader.verdict.verdict === "Watch Closely" ? "review" : "missing"}>
                  Confidence {reader.verdict.confidenceLabel}
                </ReaderStatusBadge>
              </div>
            </div>

            {sectionSignals.length > 0 ? (
              <div data-demo-id="iul-key-signals" style={{ display: "grid", gap: "12px" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                  Key Signals Right Now
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                  {sectionSignals.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => scrollToReaderSection(item.target)}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "16px",
                        border: "1px solid #dbeafe",
                        background: "#ffffff",
                        display: "grid",
                        gap: "8px",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "baseline" }}>
                        <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.title}</div>
                        <ReaderStatusBadge status={questionStatusToReaderStatus(item.status)}>{item.label}</ReaderStatusBadge>
                      </div>
                      <div style={{ color: "#0f172a", lineHeight: "1.6", fontWeight: 700 }}>{item.summary}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              data-demo-id="iul-what-matters"
              style={{
                padding: "16px 18px",
                borderRadius: "16px",
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  What Matters Right Now
                </div>
                <ReaderStatusBadge status={reader.verdict.verdict === "Healthy" ? "confirmed" : reader.verdict.verdict === "Watch Closely" ? "review" : "missing"}>
                  {reader.verdict.verdict}
                </ReaderStatusBadge>
              </div>
              <div style={{ color: "#7c2d12", lineHeight: "1.7", fontWeight: 700 }}>{mattersNow.summary}</div>
              <div style={{ color: "#9a3412", lineHeight: "1.7" }}>{mattersNow.support}</div>
              <div style={{ paddingTop: "10px", borderTop: "1px solid #fed7aa", display: "grid", gap: "6px" }}>
                <div style={{ fontSize: "12px", color: "#9a3412", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                  Next Review Move
                </div>
                <div style={{ color: "#7c2d12", lineHeight: "1.7" }}>{mattersNow.action}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#ffffff", border: "1px solid #dbeafe", display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Primary Driver</div>
                <div style={{ fontWeight: 700, color: "#0f172a", lineHeight: "1.6" }}>{reader.verdict.primaryDriver}</div>
                <div style={{ color: "#475569", lineHeight: "1.65", fontSize: "13px" }}>{reader.verdict.primaryDriverDetail}</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#ffffff", border: "1px solid #dbeafe", display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Missing Link</div>
                <div style={{ fontWeight: 700, color: "#0f172a", lineHeight: "1.6" }}>{reader.verdict.missingLink}</div>
                <div style={{ color: "#475569", lineHeight: "1.65", fontSize: "13px" }}>The fastest next item that would sharpen or confirm this read.</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                Five Review Questions
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {reader.verdict.reviewQuestions.map((item) => (
                  <div key={item.label} style={{ padding: "14px 16px", borderRadius: "16px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
                      <div style={{ color: "#0f172a", fontWeight: 700 }}>{item.label}</div>
                      <ReaderStatusBadge status={item.status === "good" ? "confirmed" : item.status === "risk" ? "missing" : "review"}>
                        {item.status === "good" ? "Good" : item.status === "risk" ? "Pressure" : "Watch"}
                      </ReaderStatusBadge>
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.65", fontSize: "13px" }}>{item.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div
          ref={proofSectionRef}
          data-demo-id="iul-illustration-proof"
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "18px",
            padding: "20px",
            display: "grid",
            gap: "14px",
            minWidth: 0,
            scrollMarginTop: "96px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                Illustration Vs Actual
              </div>
              <h3 style={{ margin: "8px 0 0 0" }}>Primary proof layer for whether the policy is keeping pace</h3>
            </div>
            <ReaderStatusBadge
              status={
                reader.projectionView.available
                  ? reader.projectionView.currentMatch
                    ? "confirmed"
                    : "review"
                  : "missing"
              }
            >
              {reader.projectionView.available
                ? reader.projectionView.currentMatch
                  ? "Proof Active"
                  : "Proof Partial"
                : "Proof Limited"}
            </ReaderStatusBadge>
          </div>

          <div style={{ color: "#475569", lineHeight: "1.7" }}>{reader.projectionView.narrative}</div>

          {reader.projectionView.available ? (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fed7aa" }}>
                  <div style={{ fontSize: "11px", color: "#9a3412", textTransform: "uppercase", letterSpacing: "0.08em" }}>Annual Review Support</div>
                  <div style={{ marginTop: "8px", fontWeight: 700, color: "#7c2d12" }}>{reader.projectionView.annualReviewLabel}</div>
                </div>
                <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fbff", border: "1px solid #dbeafe" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Chronology Quality</div>
                  <div style={{ marginTop: "8px", fontWeight: 700, color: "#0f172a" }}>{reader.projectionView.chronologyLabel}</div>
                  <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6", fontSize: "13px" }}>{reader.projectionView.chronologyNote}</div>
                </div>
                <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fbff", border: "1px solid #dbeafe" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Year Match</div>
                  <div style={{ marginTop: "8px", fontWeight: 700, color: "#0f172a" }}>{reader.projectionView.yearMatchLabel}</div>
                </div>
                <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fbff", border: "1px solid #dbeafe" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Statements Used</div>
                  <div style={{ marginTop: "8px", fontWeight: 700, color: "#0f172a" }}>{reader.projectionView.statementCount}</div>
                </div>
              </div>

              {reader.projectionView.currentMatch ? (
                <div style={{ padding: "16px 18px", borderRadius: "16px", background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)", border: "1px solid #e2e8f0", display: "grid", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Current Policy-Year Match</div>
                    <div style={{ marginTop: "6px", fontWeight: 700, color: "#0f172a" }}>
                      Actual year {reader.projectionView.currentMatch.actual_policy_year} vs illustration year {reader.projectionView.currentMatch.matched_policy_year}
                    </div>
                    <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6" }}>
                      The primary checkpoint read is using {reader.projectionView.selectedMetricLabel.toLowerCase()}
                      {reader.projectionView.policyYearGap !== null ? ` with a visible policy-year gap of ${reader.projectionView.policyYearGap}.` : "."}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>Projected Accumulation</div>
                      <div style={{ marginTop: "4px", fontWeight: 700 }}>{reader.projectionView.currentMatch.projected_accumulation_value || "Limited"}</div>
                    </div>
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>Actual Accumulation</div>
                      <div style={{ marginTop: "4px", fontWeight: 700 }}>{reader.projectionView.currentMatch.actual_accumulation_value || "Limited"}</div>
                    </div>
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>Accumulation Variance</div>
                      <div style={{ marginTop: "4px", fontWeight: 700 }}>{reader.projectionView.currentMatch.accumulation_variance_display || "Limited"}</div>
                    </div>
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>CSV Variance</div>
                      <div style={{ marginTop: "4px", fontWeight: 700 }}>{reader.projectionView.currentMatch.cash_surrender_variance_display || "Limited"}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", lineHeight: "1.7" }}>
                  A clean current policy-year match is not visible yet, so the illustration read remains more directional than definitive.
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", lineHeight: "1.7" }}>
              No usable illustration ledger checkpoints were extracted yet. Upload the pages that show yearly illustrated values or the in-force ledger to strengthen this proof layer.
            </div>
          )}
        </div>

        {reader.evidenceLedger?.length > 0 ? (
          <div
            ref={evidenceSectionRef}
            data-demo-id="iul-evidence-ledger"
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "18px",
              padding: "20px",
              display: "grid",
              gap: "14px",
              minWidth: 0,
              scrollMarginTop: "96px",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                  Evidence Ledger
                </div>
                <ReaderStatusBadge status={reader.evidenceAudit?.overallStatus === "strong" ? "confirmed" : reader.evidenceAudit?.overallStatus === "usable" ? "review" : "missing"}>
                  {reader.evidenceAudit?.overallStatus === "strong" ? "Strong evidence" : reader.evidenceAudit?.overallStatus === "usable" ? "Usable evidence" : "Developing evidence"}
                </ReaderStatusBadge>
              </div>
              <h3 style={{ margin: 0 }}>Why the console is making each major read</h3>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                Each conclusion shows the visible support behind it, the confidence of that support, and the next missing dependency that would sharpen the read.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
              {reader.evidenceLedger.map((item) => (
                <div
                  key={item.title}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "16px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }}>
                    <div style={{ color: "#0f172a", fontWeight: 700 }}>{item.title}</div>
                    <ReaderStatusBadge
                      status={item.confidence === "High" ? "confirmed" : item.confidence === "Moderate" ? "review" : "missing"}
                    >
                      {item.confidence}
                    </ReaderStatusBadge>
                  </div>
                  <div style={{ color: "#0f172a", lineHeight: "1.65", fontWeight: 600 }}>{item.conclusion}</div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Source Type</div>
                    <div style={{ color: "#475569", lineHeight: "1.6" }}>{item.sourceType}</div>
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Missing Dependency</div>
                    <div style={{ color: "#475569", lineHeight: "1.6" }}>{item.missingDependency}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {reader.carrierIntelligence ? (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
              border: "1px solid #e2e8f0",
              borderRadius: "18px",
              padding: "20px",
              display: "grid",
              gap: "14px",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ display: "grid", gap: "6px", maxWidth: "760px" }}>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                    Carrier Intelligence Layer
                  </div>
                  <ReaderStatusBadge
                    status={
                      reader.carrierIntelligence.supportStatus === "carrier_aware_active"
                        ? "confirmed"
                        : reader.carrierIntelligence.supportStatus === "carrier_aware_partial"
                          ? "review"
                          : "missing"
                    }
                  >
                    {reader.carrierIntelligence.supportLabel}
                  </ReaderStatusBadge>
                </div>
                <h3 style={{ margin: 0 }}>How much of this read is carrier-aware instead of generic</h3>
                <div style={{ color: "#0f172a", lineHeight: "1.7", fontWeight: 700 }}>{reader.carrierIntelligence.headline}</div>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>{reader.carrierIntelligence.summary}</div>
              </div>
              <div
                style={{
                  minWidth: "190px",
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "#ffffff",
                  border: "1px solid #dbeafe",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Support Level
                </div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>{reader.carrierIntelligence.score}/100</div>
                <ReaderStatusBadge
                  status={
                    reader.carrierIntelligence.supportStatus === "carrier_aware_active"
                      ? "confirmed"
                      : reader.carrierIntelligence.supportStatus === "carrier_aware_partial"
                        ? "review"
                        : "missing"
                  }
                >
                  {reader.carrierIntelligence.supportLabel}
                </ReaderStatusBadge>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
              {reader.carrierIntelligence.facts.map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: "13px 14px",
                    borderRadius: "14px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.label}</div>
                  <div style={{ fontWeight: 800, color: "#0f172a", lineHeight: "1.5" }}>{item.value}</div>
                  <div style={{ color: "#475569", lineHeight: "1.55", fontSize: "13px" }}>{item.note}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
              <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                  What Is Helping The Read
                </div>
                <div style={{ display: "grid", gap: "6px", color: "#475569", lineHeight: "1.6" }}>
                  {reader.carrierIntelligence.bullets.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                  Fastest Next Lift
                </div>
                <div style={{ color: "#0f172a", lineHeight: "1.65", fontWeight: 700 }}>{reader.carrierIntelligence.strongestLift}</div>
                <div style={{ color: "#475569", lineHeight: "1.6" }}>
                  This is the fastest additional artifact that would make the read more carrier-aware and less generic.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {reader.plainEnglishScorecard ? (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
              border: "1px solid rgba(147, 197, 253, 0.28)",
              borderRadius: "18px",
              padding: "20px",
              display: "grid",
              gap: "16px",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, maxWidth: "760px" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                  Extended Signal Scorecard
                </div>
                <h3 style={{ margin: "8px 0 0 0" }}>One plain-English window for the parts that matter most</h3>
                <p style={{ margin: "10px 0 0 0", color: "#475569", lineHeight: "1.7" }}>
                  {reader.plainEnglishScorecard.headline}
                </p>
                <p style={{ margin: "10px 0 0 0", color: "#475569", lineHeight: "1.7" }}>
                  {reader.plainEnglishScorecard.meaning}
                </p>
                <div style={{ marginTop: "10px", fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>
                  Tap a score to jump to the deeper section behind it.
                </div>
              </div>
              <div
                style={{
                  minWidth: "150px",
                  padding: "16px 18px",
                  borderRadius: "16px",
                  background: "#ffffff",
                  border: "1px solid #dbeafe",
                  display: "grid",
                  gap: "6px",
                  justifyItems: "start",
                }}
              >
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Overall Score
                </div>
                <div style={{ fontSize: "34px", fontWeight: 800, color: "#0f172a" }}>
                  {reader.plainEnglishScorecard.overallScore}/100
                </div>
                <ReaderStatusBadge status={bandToReaderStatus(reader.plainEnglishScorecard.overallBand)}>
                  {bandToLabel(reader.plainEnglishScorecard.overallBand)}
                </ReaderStatusBadge>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              {reader.plainEnglishScorecard.cards.map((card) => {
                const tone = FocusTone(card.band);
                return (
                  <div
                    key={card.title}
                    type="button"
                    onClick={() => scrollToReaderSection(
                      card.title === "Current Position"
                        ? "current_position"
                        : card.title === "Funding Pace"
                          ? "funding_pace"
                          : card.title === "Cost Pressure"
                            ? "cost_pressure"
                            : card.title === "Strategy Mix"
                              ? "strategy_mix"
                              : "confidence"
                    )}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      background: tone.background,
                      color: tone.color,
                      border: `1px solid ${tone.border}`,
                      display: "grid",
                      gap: "8px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "baseline" }}>
                      <div style={{ fontSize: "12px", opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {card.title}
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: 800 }}>
                        {card.score}
                      </div>
                    </div>
                    <div style={{ fontSize: "13px", lineHeight: "1.7" }}>{card.summary}</div>
                  </div>
                );
              })}
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => scrollToReaderSection("next_action")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  scrollToReaderSection("next_action");
                }
              }}
              style={{
                padding: "14px 16px",
                borderRadius: "16px",
                background: "#ffffff",
                border: "1px solid #dbeafe",
                color: "#0f172a",
                display: "grid",
                gap: "8px",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                Best Next Move
              </div>
              <div style={{ lineHeight: "1.7", fontWeight: 600 }}>{reader.plainEnglishScorecard.nextAction}</div>
            </div>
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "16px", alignItems: "start" }}>
          {reader.evidenceAudit ? (
            <div ref={trustSectionRef} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px", minWidth: 0, scrollMarginTop: "96px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Trust Read</div>
                  <h3 style={{ margin: "8px 0 0 0" }}>How Trustworthy This Packet Is</h3>
                  <p style={{ margin: "6px 0 0 0", color: "#64748b", lineHeight: "1.6" }}>
                    One place for evidence strength, chronology, and identity alignment before you lean on the policy conclusions.
                  </p>
                </div>
                <ReaderStatusBadge
                  status={
                    reader.evidenceAudit.overallStatus === "strong"
                      ? "confirmed"
                      : reader.evidenceAudit.overallStatus === "usable"
                        ? "review"
                        : "missing"
                  }
                >
                  {reader.evidenceAudit.overallStatus}
                </ReaderStatusBadge>
              </div>
              <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
                <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Evidence Score</div>
                  <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>{reader.evidenceAudit.evidenceScore}/100</div>
                </div>
                <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Statements</div>
                  <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>{reader.evidenceAudit.statementCount}</div>
                </div>
                <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Chronology</div>
                  <div style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{reader.evidenceAudit.chronologyLabel}</div>
                  <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6", fontSize: "13px" }}>
                    {reader.evidenceAudit.chronologyStrength === "strong"
                      ? "Multiple clean dated statements support a stronger direction-of-travel read."
                      : reader.evidenceAudit.chronologyStrength === "usable"
                        ? "The annual trail is usable, though still not especially deep."
                        : reader.evidenceAudit.chronologyStrength === "irregular"
                          ? "Duplicates or irregular spacing weaken continuity confidence."
                          : reader.evidenceAudit.chronologyStrength === "thin"
                            ? "Only one dated statement is visible so far."
                            : "The dated statement trail is still too thin for stronger continuity trust."}
                  </div>
                </div>
                <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Identity</div>
                  <div style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{reader.evidenceAudit.identityLabel}</div>
                </div>
              </div>
              <div style={{ marginTop: "14px", color: "#475569", lineHeight: "1.7" }}>{reader.evidenceAudit.headline}</div>
              {reader.evidenceAudit.notes?.length > 0 ? (
                <ul style={{ margin: "12px 0 0 18px", padding: 0, display: "grid", gap: "6px", color: "#475569" }}>
                  {reader.evidenceAudit.notes.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div ref={policyReadSectionRef} style={{ background: "#f8fbff", border: "1px solid #dbe7ff", borderRadius: "16px", padding: "18px", minWidth: 0, scrollMarginTop: "96px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Policy Read</div>
                <h3 style={{ margin: "8px 0 0 0" }}>What This Policy Appears To Be Doing</h3>
              </div>
              <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                <ReaderStatusBadge status={reader.overview.latestStatementStatus}>Latest Statement: {reader.overview.latestStatement}</ReaderStatusBadge>
                <ReaderStatusBadge status={reader.confirmed.length >= 10 ? "confirmed" : reader.confirmed.length >= 6 ? "review" : "missing"}>
                  Continuity: {reader.overview.continuityScore}
                </ReaderStatusBadge>
              </div>
            </div>
            <div style={{ marginTop: "12px", fontWeight: 700, color: "#0f172a", lineHeight: "1.6" }}>{reader.headline}</div>
            <p style={{ margin: "10px 0 0 0", color: "#475569", lineHeight: "1.7" }}>{reader.laymanSummary}</p>
            {reader.narrative ? <p style={{ margin: "10px 0 0 0", color: "#475569", lineHeight: "1.7" }}>{reader.narrative}</p> : null}

            <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Product Read</div>
                <div style={{ marginTop: "4px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{reader.classification.productNameDisplay}</div>
                <div style={{ marginTop: "6px", fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{reader.classification.productNameNote}</div>
              </div>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Policy Type</div>
                <div style={{ marginTop: "4px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{reader.classification.policyTypeDisplay}</div>
                <div style={{ marginTop: "6px", fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{reader.classification.policyTypeNote}</div>
              </div>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Direction Of Travel</div>
                <div style={{ marginTop: "6px", color: "#0f172a", lineHeight: "1.7" }}>{reader.projectionSummary}</div>
              </div>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Carrier And Context</div>
                <div style={{ marginTop: "4px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{reader.overview.carrier}</div>
                <div style={{ marginTop: "6px", fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{reader.productExplanation}</div>
              </div>
            </div>
          </div>
        </div>

        <div ref={prioritiesSectionRef} style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "16px", padding: "18px", minWidth: 0, scrollMarginTop: "96px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>What Matters Now</div>
              <h3 style={{ margin: "8px 0 0 0" }}>Top Review Priorities</h3>
            </div>
            {reader.pressureSummary ? (
              <ReaderStatusBadge status={reader.pressureSummary.status === "high" ? "missing" : reader.pressureSummary.status === "moderate" ? "review" : "confirmed"}>
                {reader.pressureSummary.status}
              </ReaderStatusBadge>
            ) : null}
          </div>
          {reader.pressureSummary ? (
            <>
              <div style={{ marginTop: "10px", color: "#7c2d12", lineHeight: "1.7", fontWeight: 700 }}>{reader.pressureSummary.headline}</div>
              {reader.pressureSummary.items?.length > 0 ? (
                <ul style={{ margin: "10px 0 0 18px", padding: 0, display: "grid", gap: "6px", color: "#7c2d12" }}>
                  {reader.pressureSummary.items.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}

          <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
            {reader.verdict?.pressureStack?.length > 0 ? (
              <div style={{ padding: "14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #fed7aa" }}>
                <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Pressure Stack</div>
                <div style={{ display: "grid", gap: "10px", marginTop: "8px" }}>
                  {reader.verdict.pressureStack.slice(0, 4).map((item) => (
                    <div key={item.label} style={{ display: "grid", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", alignItems: "baseline" }}>
                        <div style={{ color: "#0f172a", fontWeight: 700 }}>{item.label}</div>
                        <ReaderStatusBadge status={item.severity === "low" ? "confirmed" : item.severity === "high" ? "missing" : "review"}>
                          {item.severity}
                        </ReaderStatusBadge>
                      </div>
                      <div style={{ color: "#7c2d12", fontSize: "13px", lineHeight: "1.6" }}>{item.explanation}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div style={{ padding: "14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #fed7aa" }}>
              <div style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Best Next Uploads</div>
              <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                {(reader.verdict?.reviewOrder?.length ? reader.verdict.reviewOrder : reader.pressureSummary?.checklist?.length ? reader.pressureSummary.checklist : reader.nextSteps).slice(0, 4).map((step, index) => (
                  <div key={index} style={{ lineHeight: "1.6", color: "#0f172a" }}>{step}</div>
                ))}
              </div>
            </div>
            <div style={{ padding: "14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #fed7aa" }}>
              <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Audit Flags</div>
              {reader.warnings.length > 0 ? (
                <div style={{ display: "grid", gap: "8px", marginTop: "8px", color: "#7c2d12" }}>
                  {reader.warnings.slice(0, 3).map((warning, index) => (
                    <div key={index} style={{ lineHeight: "1.6" }}>{warning}</div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: "8px 0 0 0", color: "#475569", lineHeight: "1.6" }}>
                  No cross-document mismatches were detected among the strongest identity fields.
                </p>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
          {reader.unifiedCards?.length > 0 ? (
            <div ref={unifiedLeversSectionRef} style={{ marginBottom: "18px", display: "grid", gap: "14px", scrollMarginTop: "96px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Unified IUL Read</div>
                  <h3 style={{ margin: "8px 0 0 0" }}>Performance, COI, Funding, Risk, And Strategy</h3>
                  <p style={{ margin: "6px 0 0 0", color: "#64748b", lineHeight: "1.6" }}>
                    One canonical read path for the main IUL levers instead of splitting them across separate cards.
                  </p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {reader.unifiedCards.map((card) => {
                  const tone = FocusTone(card.status);
                  return (
                    <div
                      key={card.title}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "16px",
                        background: tone.background,
                        color: tone.color,
                        border: `1px solid ${tone.border}`,
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "12px", opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.08em" }}>{card.title}</div>
                        <ReaderStatusBadge status={card.status === "limited" || card.status === "unknown" || card.status === "unclear" ? "missing" : card.status === "good" || card.status === "healthy" || card.status === "on_track" || card.status === "ahead" || card.status === "low" || card.status === "sufficient" ? "confirmed" : "review"}>
                          {String(card.status || "limited").replace(/_/g, " ")}
                        </ReaderStatusBadge>
                      </div>
                      <div style={{ fontSize: "24px", fontWeight: 700 }}>{card.value}</div>
                      {card.detail ? <div style={{ fontSize: "13px", lineHeight: "1.6" }}>{card.detail}</div> : null}
                      <div style={{ fontSize: "13px", lineHeight: "1.6" }}>{card.explanation}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div ref={performanceSectionRef} style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline", scrollMarginTop: "96px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Policy Performance</div>
              <h3 style={{ margin: "8px 0 0 0" }}>Benchmarks And Projection Support</h3>
              <p style={{ margin: "6px 0 0 0", color: "#64748b", lineHeight: "1.6" }}>
                Growth, charge pressure, statement support, and projection support in one place.
              </p>
            </div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>Directional benchmarks, not carrier projections</div>
          </div>

          <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
            {reader.benchmarks.map((benchmark) => {
              const tone = BenchmarkTone(benchmark.status);
              return (
                <div
                  key={benchmark.label}
                  style={{
                    padding: "14px",
                    borderRadius: "14px",
                    background: tone.background,
                    color: tone.color,
                    border: `1px solid ${tone.border}`,
                  }}
                >
                  <div style={{ fontSize: "12px", opacity: 0.85 }}>{benchmark.label}</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px" }}>{benchmark.value}</div>
                  <div style={{ marginTop: "8px", fontSize: "13px", lineHeight: "1.6" }}>{benchmark.explanation}</div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "18px", paddingTop: "18px", borderTop: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
              <h4 style={{ margin: 0 }}>Detailed Projection Support</h4>
              <div style={{ fontSize: "12px", color: "#64748b" }}>Illustration checkpoints extracted from the baseline packet</div>
            </div>
            <p style={{ margin: "10px 0 14px 0", color: "#475569", lineHeight: "1.7" }}>{reader.projectionView.narrative}</p>
            {reader.projectionView.available ? (
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ padding: "14px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fed7aa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Annual Review Support
                      </div>
                      <div style={{ marginTop: "6px", fontWeight: 700, color: "#7c2d12" }}>{reader.projectionView.annualReviewLabel}</div>
                    </div>
                    <ReaderStatusBadge status={reader.projectionView.annualReviewStatus}>
                      {reader.projectionView.chronologyLabel}
                    </ReaderStatusBadge>
                  </div>
                  {reader.projectionView.reviewSupportHeadline ? (
                    <div style={{ marginTop: "10px", color: "#7c2d12", fontWeight: 700, lineHeight: "1.7" }}>
                      {reader.projectionView.reviewSupportHeadline}
                    </div>
                  ) : null}
                  <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
                    <div style={{ background: "#ffffff", border: "1px solid #fed7aa", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#9a3412" }}>Year Match</div>
                      <div style={{ marginTop: "4px", fontWeight: 700, color: "#0f172a" }}>{reader.projectionView.yearMatchLabel}</div>
                    </div>
                    <div style={{ background: "#ffffff", border: "1px solid #fed7aa", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#9a3412" }}>Statements Used</div>
                      <div style={{ marginTop: "4px", fontWeight: 700, color: "#0f172a" }}>{reader.projectionView.statementCount}</div>
                    </div>
                    <div style={{ background: "#ffffff", border: "1px solid #fed7aa", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#9a3412" }}>Duplicate Dates</div>
                      <div style={{ marginTop: "4px", fontWeight: 700, color: "#0f172a" }}>{reader.projectionView.duplicateCount}</div>
                    </div>
                    <div style={{ background: "#ffffff", border: "1px solid #fed7aa", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#9a3412" }}>Irregular Gaps</div>
                      <div style={{ marginTop: "4px", fontWeight: 700, color: "#0f172a" }}>{reader.projectionView.irregularGapCount}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: "10px", color: "#7c2d12", lineHeight: "1.7" }}>
                    {reader.projectionView.reviewSupportNote || reader.projectionView.chronologyNote}
                  </div>
                  <div style={{ marginTop: "8px", color: "#7c2d12", lineHeight: "1.7" }}>
                    {reader.projectionView.yearMatchNote}
                  </div>
                  {reader.projectionView.annualReviewChecklist?.length > 0 ? (
                    <ul style={{ margin: "10px 0 0 18px", padding: 0, display: "grid", gap: "6px", color: "#7c2d12" }}>
                      {reader.projectionView.annualReviewChecklist.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {reader.projectionView.currentMatch ? (
                  <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fbff", border: "1px solid #dbe7ff" }}>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>Current Policy-Year Match</div>
                    <div style={{ marginTop: "6px", fontWeight: 700, color: "#0f172a" }}>
                      Actual year {reader.projectionView.currentMatch.actual_policy_year} vs illustration year {reader.projectionView.currentMatch.matched_policy_year}
                    </div>
                    <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.6" }}>
                      The primary checkpoint read is using {reader.projectionView.selectedMetricLabel.toLowerCase()}
                      {reader.projectionView.policyYearGap !== null ? ` with a visible policy-year gap of ${reader.projectionView.policyYearGap}.` : "."}
                    </div>
                    <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Projected Accumulation</div>
                        <div style={{ marginTop: "4px", fontWeight: 700 }}>{reader.projectionView.currentMatch.projected_accumulation_value || "Limited"}</div>
                      </div>
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Actual Accumulation</div>
                        <div style={{ marginTop: "4px", fontWeight: 700 }}>{reader.projectionView.currentMatch.actual_accumulation_value || "Limited"}</div>
                      </div>
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Accumulation Variance</div>
                        <div style={{ marginTop: "4px", fontWeight: 700 }}>{reader.projectionView.currentMatch.accumulation_variance_display || "Limited"}</div>
                      </div>
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px" }}>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>CSV Variance</div>
                        <div style={{ marginTop: "4px", fontWeight: 700 }}>{reader.projectionView.currentMatch.cash_surrender_variance_display || "Limited"}</div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {reader.projectionView.benchmarkRows.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
                    {reader.projectionView.benchmarkRows.map((row) => (
                      <div key={row.policy_year} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "14px" }}>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Projection Checkpoint</div>
                        <div style={{ marginTop: "4px", fontSize: "22px", fontWeight: 700, color: "#0f172a" }}>Year {row.policy_year}</div>
                        <div style={{ marginTop: "10px", fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>Premium: {row.premium_outlay || "Limited"}</div>
                        <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>Accumulation: {row.accumulation_value || "Limited"}</div>
                        <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>Surrender: {row.cash_surrender_value || "Limited"}</div>
                        <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>Death Benefit: {row.death_benefit || "Limited"}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", lineHeight: "1.7" }}>
                No usable illustration ledger checkpoints were extracted yet. Upload the pages that show yearly illustrated values or the in-force ledger.
              </div>
            )}
          </div>
        </div>

        {(reader.optimization || reader.issueGroups?.length > 0) ? (
          <details style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Deep Diagnostics And Optimization</summary>
            <div style={{ display: "grid", gap: "16px" }}>
              {reader.optimization ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Optimization</div>
                      <h3 style={{ margin: "8px 0 0 0" }}>What To Watch Next</h3>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <ReaderStatusBadge status={reader.optimization.overallStatus === "healthy" ? "confirmed" : reader.optimization.overallStatus === "watch" ? "review" : "missing"}>
                        {reader.optimization.overallStatus.replace(/_/g, " ")}
                      </ReaderStatusBadge>
                      <ReaderStatusBadge status={reader.optimization.priorityLevel === "low" ? "confirmed" : reader.optimization.priorityLevel === "medium" ? "review" : "missing"}>
                        Priority {reader.optimization.priorityLevel}
                      </ReaderStatusBadge>
                    </div>
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{reader.optimization.explanation}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                    <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "grid", gap: "10px" }}>
                      <div style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Recommendations</div>
                      {reader.optimization.recommendations.slice(0, 2).map((item) => (
                        <div key={item.title} style={{ background: "#ffffff", border: "1px solid #dbeafe", borderRadius: "12px", padding: "10px 12px", display: "grid", gap: "6px" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                          <div style={{ color: "#475569", lineHeight: "1.6" }}>{item.message}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "10px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Risk And Opportunity</div>
                      {reader.optimization.risks.slice(0, 2).map((item) => (
                        <div key={`risk-${item.type}`} style={{ color: "#475569", lineHeight: "1.6" }}>
                          <strong style={{ color: "#0f172a" }}>{item.type.replace(/_/g, " ")}:</strong> {item.message}
                        </div>
                      ))}
                      {reader.optimization.opportunities.slice(0, 2).map((item) => (
                        <div key={`opportunity-${item.type}`} style={{ color: "#475569", lineHeight: "1.6" }}>
                          <strong style={{ color: "#0f172a" }}>{item.type.replace(/_/g, " ")}:</strong> {item.message}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {reader.issueGroups?.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Confidence And Missing Data
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                    {reader.issueGroups.slice(0, 3).map((group) => (
                      <div key={group.title} style={{ padding: "14px 16px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fed7aa", display: "grid", gap: "8px" }}>
                        <div style={{ fontWeight: 700, color: "#9a3412" }}>{group.title}</div>
                        <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#7c2d12" }}>
                          {group.items.slice(0, 4).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}

        <details style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Detailed Readout And Source Evidence</summary>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Detailed Readout</div>
            <h3 style={{ margin: "8px 0 0 0" }}>Unified Policy Readout</h3>
            <p style={{ margin: "6px 0 0 0", color: "#64748b", lineHeight: "1.6" }}>
              Detailed values, charges, crediting terms, and source-backed evidence in one continuous section.
            </p>
          </div>

          <div style={{ marginTop: "16px", display: "grid", gap: "18px" }}>
            {reader.readerTables.map((table) => renderReaderTable(table))}

            {reader.sections.map((section, sectionIndex) => (
              <div
                key={section.title}
                style={{
                  paddingTop: sectionIndex === 0 ? 0 : "18px",
                  borderTop: sectionIndex === 0 ? "none" : "1px solid #e2e8f0",
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ margin: 0 }}>{section.title}</h4>
                    <p style={{ margin: "6px 0 0 0", color: "#64748b", lineHeight: "1.6" }}>{section.description}</p>
                  </div>
                  <ReaderStatusBadge
                    status={
                      section.fields.every((field) => field.status === "confirmed")
                        ? "confirmed"
                        : section.fields.some((field) => field.status === "review")
                          ? "review"
                          : "missing"
                    }
                  >
                    {section.fields.filter((field) => field.status === "confirmed").length}/{section.fields.length} confirmed
                  </ReaderStatusBadge>
                </div>
                <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                  {section.fields.map((field) => (
                    <div
                      key={`${section.title}-${field.label}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "14px",
                        padding: "12px 14px",
                        borderRadius: "12px",
                        background: "#f8fbff",
                        border: "1px solid #dbe7ff",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "13px", color: "#64748b" }}>{field.label}</div>
                        <div style={{ marginTop: "4px", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>{field.value}</div>
                        <div style={{ marginTop: "4px", fontSize: "12px", color: "#64748b" }}>Source: {field.source}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
                        <ReaderStatusBadge status={field.status}>
                          {field.status === "confirmed" ? field.confidence : field.status === "review" ? "Review" : "Missing"}
                        </ReaderStatusBadge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              ))}
            </div>
        </details>
      </div>
    </div>
  );
}
