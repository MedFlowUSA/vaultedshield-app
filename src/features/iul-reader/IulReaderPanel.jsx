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

export function IulReaderPanel({ reader, results }) {
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
          <div style={{ fontSize: "12px", letterSpacing: "0.7px", color: "#475569" }}>LIFE POLICY READER</div>
          <h2 style={{ margin: "8px 0 10px 0" }}>Start Here</h2>
          <p style={{ margin: 0, color: "#475569", lineHeight: "1.7" }}>
            This reader separates confirmed facts from AI interpretation so product type, values, and concerns are easier to trust at first glance.
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

      <div style={{ marginTop: "20px", display: "grid", gap: "18px", alignItems: "start" }}>
        {reader.evidenceAudit ? (
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Packet Audit</div>
                <h3 style={{ margin: "8px 0 0 0" }}>How Trustworthy This IUL Read Is</h3>
                <p style={{ margin: "6px 0 0 0", color: "#64748b", lineHeight: "1.6" }}>
                  Evidence strength, chronology sanity, and identity consistency in one place before you trust the finer conclusions.
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
            <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Evidence Score</div>
                <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {reader.evidenceAudit.evidenceScore}/100
                </div>
              </div>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Statements Visible</div>
                <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 700, color: "#0f172a" }}>
                  {reader.evidenceAudit.statementCount}
                </div>
              </div>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Chronology</div>
                <div style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                  {reader.evidenceAudit.chronologyLabel}
                </div>
              </div>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Identity Match</div>
                <div style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                  {reader.evidenceAudit.identityLabel}
                </div>
              </div>
            </div>
            <div style={{ marginTop: "14px", color: "#475569", lineHeight: "1.7" }}>{reader.evidenceAudit.headline}</div>
            {reader.evidenceAudit.notes?.length > 0 ? (
              <ul style={{ margin: "12px 0 0 18px", padding: 0, display: "grid", gap: "6px", color: "#475569" }}>
                {reader.evidenceAudit.notes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div style={{ background: "#f8fbff", border: "1px solid #dbe7ff", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "16px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>AI Interpretation</div>
              <h3 style={{ marginTop: "8px", marginBottom: "8px" }}>What This Policy Appears To Be Doing</h3>
              <div style={{ marginBottom: "12px", fontWeight: 700, color: "#0f172a", lineHeight: "1.6" }}>{reader.headline}</div>
              <p style={{ margin: "0 0 12px 0", color: "#475569", lineHeight: "1.7" }}>{reader.laymanSummary}</p>
              {reader.narrative ? (
                <p style={{ margin: "0 0 12px 0", color: "#475569", lineHeight: "1.7" }}>{reader.narrative}</p>
              ) : null}
              <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>Direction Of Travel</div>
                <div style={{ color: "#0f172a", lineHeight: "1.7" }}>{reader.projectionSummary}</div>
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>What This Policy Is</div>
              <h3 style={{ marginTop: "8px", marginBottom: "8px" }}>Confirmed Vs Inferred Product Read</h3>
              <div style={{ display: "grid", gap: "10px" }}>
                <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Product Name</div>
                  <div style={{ marginTop: "4px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{reader.classification.productNameDisplay}</div>
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#64748b", lineHeight: "1.6" }}>{reader.classification.productNameNote}</div>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Policy Type</div>
                  <div style={{ marginTop: "4px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{reader.classification.policyTypeDisplay}</div>
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "#64748b", lineHeight: "1.6" }}>{reader.classification.policyTypeNote}</div>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Initial Policy Reading</div>
                  <div style={{ marginTop: "6px", color: "#0f172a", lineHeight: "1.7" }}>{reader.initialReading}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "16px", alignItems: "start" }}>
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Confirmed Facts</div>
                <h3 style={{ margin: "8px 0 0 0" }}>What We Know For Sure</h3>
                <p style={{ margin: "6px 0 0 0", color: "#64748b", lineHeight: "1.6" }}>
                  Core identity and packet support, kept separate from AI interpretation.
                </p>
              </div>
              <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                <ReaderStatusBadge status={reader.overview.latestStatementStatus}>
                  Latest Statement: {reader.overview.latestStatement}
                </ReaderStatusBadge>
                <ReaderStatusBadge status={reader.confirmed.length >= 10 ? "confirmed" : reader.confirmed.length >= 6 ? "review" : "missing"}>
                  Continuity: {reader.overview.continuityScore}
                </ReaderStatusBadge>
              </div>
            </div>
            <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Carrier</div>
                <div style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{reader.overview.carrier}</div>
                <div style={{ marginTop: "6px", fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{reader.overview.carrierNote}</div>
              </div>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Assessment</div>
                <div style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{reader.overview.assessment}</div>
                <div style={{ marginTop: "6px", fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{reader.overview.assessmentNote}</div>
              </div>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Product Explanation</div>
                <div style={{ marginTop: "6px", fontSize: "14px", color: "#0f172a", lineHeight: "1.7" }}>{reader.productExplanation}</div>
              </div>
            </div>
          </div>

          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
            <h3 style={{ marginTop: 0, marginBottom: "10px" }}>Action Center</h3>
            <div style={{ display: "grid", gap: "12px" }}>
              {reader.pressureSummary ? (
                <div style={{ paddingBottom: "12px", borderBottom: "1px solid #fdba74", display: "grid", gap: "8px" }}>
                  <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    What Matters Most Right Now
                  </div>
                  <div style={{ color: "#7c2d12", lineHeight: "1.7", fontWeight: 700 }}>{reader.pressureSummary.headline}</div>
                  {reader.pressureSummary.items?.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#7c2d12" }}>
                      {reader.pressureSummary.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div>
                <div style={{ fontSize: "12px", color: "#9a3412", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Audit Flags</div>
                {reader.warnings.length > 0 ? (
                  <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                    {reader.warnings.map((warning, index) => (
                      <div key={index} style={{ padding: "10px 12px", borderRadius: "12px", background: "#ffffff", border: "1px solid #fed7aa", color: "#9a3412", lineHeight: "1.6" }}>
                        {warning}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: "8px 0 0 0", color: "#475569", lineHeight: "1.6" }}>
                    No cross-document mismatches were detected among the strongest extracted identity fields.
                  </p>
                )}
              </div>

              <div>
                <div style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Best Next Uploads</div>
                <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                  {(reader.pressureSummary?.checklist?.length ? reader.pressureSummary.checklist : reader.nextSteps).map((step, index) => (
                    <div key={index} style={{ padding: "10px 12px", borderRadius: "12px", background: "#ffffff", border: "1px solid #dbeafe", lineHeight: "1.6" }}>
                      {step}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ paddingTop: "4px", borderTop: "1px solid #fdba74" }}>
                <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "10px" }}>Reader Notes</div>
                <p style={{ margin: "8px 0 8px 0", color: "#475569", lineHeight: "1.6" }}>
                  Latest statement used: {reader.latestStatement?.fileName || "No statement uploaded yet."}
                </p>
                <p style={{ margin: "0 0 8px 0", color: "#475569", lineHeight: "1.6" }}>
                  Trend quality: {results.analytics?.growth_trend?.value ? "Multi-statement growth trend available." : "Trend remains provisional."}
                </p>
                <p style={{ margin: 0, color: "#475569", lineHeight: "1.6" }}>
                  Health read: {results.analytics?.policy_health_score?.value ? `${results.analytics.policy_health_score.value.label} (${results.analytics.policy_health_score.value.value}/10)` : "Insufficient trusted data for a stable score."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
          {reader.unifiedCards?.length > 0 ? (
            <div style={{ marginBottom: "18px", display: "grid", gap: "14px" }}>
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

          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
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
              <h4 style={{ margin: 0 }}>Projected Vs Actual</h4>
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
                  <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
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
                  <div style={{ marginTop: "10px", color: "#7c2d12", lineHeight: "1.7" }}>{reader.projectionView.chronologyNote}</div>
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
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
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
          </div>
        ) : null}

        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "18px", minWidth: 0 }}>
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
        </div>
      </div>
    </div>
  );
}
