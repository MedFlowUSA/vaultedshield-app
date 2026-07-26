
function metricStatusColor(status) {
  if (status === "good" || status === "confirmed") return "#166534";
  if (status === "watch" || status === "review") return "#92400e";
  if (status === "risk" || status === "missing") return "#991b1b";
  return "#475569";
}

function metricStatusBg(status) {
  if (status === "good" || status === "confirmed") return { bg: "#dcfce7", border: "#bbf7d0", text: "#166534" };
  if (status === "watch" || status === "review") return { bg: "#fef3c7", border: "#fde68a", text: "#92400e" };
  if (status === "risk" || status === "missing") return { bg: "#fee2e2", border: "#fecaca", text: "#991b1b" };
  return { bg: "#f1f5f9", border: "#e2e8f0", text: "#475569" };
}

function SectionHeading({ title, subtitle }) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{title}</div>
      {subtitle ? <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.55" }}>{subtitle}</div> : null}
    </div>
  );
}

function PerformanceMetricCard({ label, value, note, status }) {
  const tone = metricStatusBg(status);
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "14px",
        border: `1px solid ${tone.border}`,
        background: "#ffffff",
        display: "grid",
        gap: "8px",
        boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: "999px",
            background: tone.bg,
            color: tone.text,
            border: `1px solid ${tone.border}`,
            whiteSpace: "nowrap",
          }}
        >
          {status === "good" || status === "confirmed" ? "Healthy" : status === "watch" || status === "review" ? "Watch" : status === "risk" || status === "missing" ? "Needs Review" : "Developing"}
        </div>
      </div>
      <div style={{ fontSize: "20px", fontWeight: 800, color: metricStatusColor(status), lineHeight: "1.2" }}>{value}</div>
      <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>{note}</div>
    </div>
  );
}

function TimelineRow({ point, index }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr 1fr 1fr 1fr 1fr",
        gap: "10px",
        padding: "10px 14px",
        background: index % 2 === 0 ? "#ffffff" : "#f8fafc",
        borderTop: index === 0 ? "none" : "1px solid #f1f5f9",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>{point.date}</div>
      <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>{point.cashValue || "—"}</div>
      <div style={{ fontSize: "13px", color: "#475569" }}>{point.surrenderValue || "—"}</div>
      <div style={{ fontSize: "13px", color: point.loanBalance ? "#991b1b" : "#475569" }}>{point.loanBalance || "—"}</div>
      <div style={{ fontSize: "13px", color: "#475569" }}>{point.coi || "—"}</div>
      <div style={{ fontSize: "13px", color: "#166534", fontWeight: 600 }}>{point.creditingRate || point.capRate || "—"}</div>
    </div>
  );
}

function VehicleComparisonTable({ vehicles, dimensions }) {
  return (
    <div style={{ borderRadius: "16px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
      <div style={{ minWidth: "900px" }}>
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `180px repeat(${vehicles.length}, 1fr)`,
            gap: "0",
            background: "#0f172a",
            borderRadius: "15px 15px 0 0",
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Dimension
          </div>
          {vehicles.map((v) => (
            <div
              key={v.key}
              style={{
                fontSize: "12px",
                fontWeight: 800,
                color: v.isThis ? "#93c5fd" : "#e2e8f0",
                textAlign: "center",
                padding: "0 4px",
                borderLeft: v.isThis ? "1px solid rgba(147,197,253,0.3)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {v.label}
              {v.isThis ? (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "999px",
                    background: "rgba(147,197,253,0.18)",
                    color: "#93c5fd",
                    display: "inline-block",
                  }}
                >
                  THIS POLICY
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {dimensions.map((dim, dimIndex) => (
          <div
            key={dim.key}
            style={{
              display: "grid",
              gridTemplateColumns: `180px repeat(${vehicles.length}, 1fr)`,
              background: dimIndex % 2 === 0 ? "#ffffff" : "#f8fafc",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                fontSize: "12px",
                fontWeight: 700,
                color: "#334155",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderRight: "1px solid #e2e8f0",
              }}
            >
              {dim.label}
            </div>
            {vehicles.map((v) => (
              <div
                key={v.key}
                style={{
                  padding: "12px 14px",
                  fontSize: "13px",
                  color: v.isThis ? "#0f172a" : "#475569",
                  fontWeight: v.isThis ? 600 : 400,
                  lineHeight: "1.55",
                  borderLeft: "1px solid #e2e8f0",
                  background: v.isThis ? "rgba(219,234,254,0.18)" : "transparent",
                }}
              >
                {v[dim.key] || "—"}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RetirementVehicleContext() {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "14px",
        background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(239,246,255,0.9) 100%)",
        border: "1px solid #dbeafe",
        fontSize: "13px",
        color: "#475569",
        lineHeight: "1.7",
        display: "grid",
        gap: "8px",
      }}
    >
      <div style={{ fontWeight: 700, color: "#0f172a" }}>How to read this comparison</div>
      <div>
        IULs are not inherently better or worse than other vehicles — they serve a different purpose. The value of an IUL comes from the combination of tax-free access, downside protection, and permanent death benefit inside a single premium. The cost is internal charges (COI, admin) that reduce the effective return below the raw index.
      </div>
      <div>
        A 401(k) or Roth IRA can outperform an IUL on gross return in strong bull markets. An IUL can outperform in flat or volatile markets where the 0% floor prevents loss. The right comparison is not "which earns more" — it is "does the death benefit + tax-free access justify the internal cost given this household's situation."
      </div>
      <div style={{ fontWeight: 700, color: "#0f172a" }}>What this reader shows</div>
      <div>
        The metrics above are extracted from the uploaded policy files. The vehicle comparison uses industry-standard reference ranges, not projections. The IUL column is filled from the actual visible packet where data is confirmed.
      </div>
    </div>
  );
}

export function CashValuePerformancePanel({ performanceModel }) {
  if (!performanceModel) return null;

  const { metrics, timeline, vehicles, vehicleDimensions, summaryHeadline, statementCount } = performanceModel;

  return (
    <div style={{ display: "grid", gap: "28px" }}>
      {/* Summary strip */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: "16px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "8px",
        }}
      >
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.7 }}>
          Cash Value Performance Reading
        </div>
        <div style={{ fontSize: "17px", fontWeight: 700, lineHeight: "1.4" }}>{summaryHeadline}</div>
        {statementCount === 0 ? (
          <div style={{ fontSize: "13px", opacity: 0.8 }}>
            No annual statements loaded yet. Upload at least one statement to unlock the live performance metrics.
          </div>
        ) : (
          <div style={{ fontSize: "13px", opacity: 0.8 }}>
            Based on {statementCount} uploaded statement{statementCount === 1 ? "" : "s"} plus the baseline illustration packet.
          </div>
        )}
      </div>

      {/* Performance metrics grid */}
      {metrics.length > 0 ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <SectionHeading
            title="Cash Value Account Readings"
            subtitle="Key performance signals extracted from the uploaded policy packet. Each metric reflects what is actually visible in the file — not projected or assumed values."
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "12px",
            }}
          >
            {metrics.map((metric) => (
              <PerformanceMetricCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                note={metric.note}
                status={metric.status}
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: "20px",
            borderRadius: "14px",
            border: "1px dashed #cbd5e1",
            color: "#64748b",
            textAlign: "center",
            lineHeight: "1.7",
          }}
        >
          Upload at least one annual statement and the initial illustration to unlock the full cash value performance reading.
        </div>
      )}

      {/* Year-over-year timeline */}
      {timeline.length >= 2 ? (
        <div style={{ display: "grid", gap: "16px" }}>
          <SectionHeading
            title="Year-Over-Year Value Timeline"
            subtitle="Cash value progression across uploaded annual statements. Loan balances are shown separately — they reduce net accessible value."
          />
          <div style={{ borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", overflowX: "auto" }}>
            <div style={{ minWidth: "720px" }}>
              {/* Timeline header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 1fr 1fr 1fr 1fr",
                  gap: "10px",
                  padding: "10px 14px",
                  background: "#f8fafc",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                <div>Statement</div>
                <div>Cash Value</div>
                <div>Surrender Value</div>
                <div>Loan Balance</div>
                <div>COI</div>
                <div>Credited / Cap</div>
              </div>
              {timeline.map((point, index) => (
                <TimelineRow key={point.date} point={point} index={index} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Vehicle comparison */}
      <div style={{ display: "grid", gap: "16px" }}>
        <SectionHeading
          title="IUL vs Other Retirement Vehicles"
          subtitle="Side-by-side comparison of how an IUL stacks up against other common accumulation and income vehicles on the dimensions that matter most."
        />
        <VehicleComparisonTable vehicles={vehicles} dimensions={vehicleDimensions} />
        <RetirementVehicleContext />
      </div>
    </div>
  );
}
