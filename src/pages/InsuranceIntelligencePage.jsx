import { useMemo, useRef, useState } from "react";
import {
  buildInsurancePortfolioBrief,
  buildInsurancePortfolioReport,
  buildPolicyListInterpretation,
  buildVaultedPolicyRank,
} from "../lib/domain/intelligenceEngine";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";

function buttonStyle(primary = false) {
  return {
    padding: "10px 14px",
    borderRadius: "12px",
    border: primary ? "none" : "1px solid rgba(15, 23, 42, 0.10)",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "13px",
  };
}

function parseDisplayNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatDateValue(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function displayNullable(value) {
  return value === null || value === undefined || value === "" ? "—" : value;
}

function getStatusTone(status) {
  if (status === "Strong") return { color: "#166534", background: "rgba(34, 197, 94, 0.12)" };
  if (status === "Moderate") return { color: "#92400e", background: "rgba(245, 158, 11, 0.14)" };
  if (status === "Weak") return { color: "#9f1239", background: "rgba(244, 63, 94, 0.12)" };
  return { color: "#991b1b", background: "rgba(239, 68, 68, 0.14)" };
}

function buildChargeSummaryPreview(row) {
  return {
    total_coi: row.total_coi ?? null,
    total_visible_charges: row.total_visible_charges ?? null,
    coi_confidence: row.coi_confidence ?? null,
    coi_source_kind: row.coi_source_kind ?? null,
    charge_visibility_status: row.charge_visibility_status ?? null,
  };
}

function reportButtonStyle(active = false, primary = false) {
  if (primary) return buttonStyle(true);
  return {
    ...buttonStyle(false),
    border: active ? "1px solid #93c5fd" : "1px solid rgba(15, 23, 42, 0.10)",
    background: active ? "#eff6ff" : "#ffffff",
    color: active ? "#1d4ed8" : "#0f172a",
  };
}

function renderReportFactsGrid(items = [], columns = 3) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${Math.max(180, Math.floor(720 / Math.max(columns, 1)))}px, 1fr))`,
        gap: "12px",
      }}
    >
      {items.map((item) => (
        <div
          key={`${item.label}-${item.value}`}
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            background: "#ffffff",
            border: "1px solid rgba(148, 163, 184, 0.18)",
          }}
        >
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {item.label}
          </div>
          <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a", lineHeight: "1.6" }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderReportSection(section) {
  if (!section) return null;

  return (
    <div
      key={section.id || section.title}
      style={{
        padding: "22px 24px",
        borderRadius: "18px",
        background: "#f8fafc",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        display: "grid",
        gap: "14px",
      }}
    >
      <div>
        <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{section.title}</div>
        {section.summary ? <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.8" }}>{section.summary}</div> : null}
      </div>

      {Array.isArray(section.items) && section.items.length > 0 ? renderReportFactsGrid(section.items, section.columns || 3) : null}

      {section.kind === "bullets" && Array.isArray(section.bullets) && section.bullets.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
          {section.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}

      {section.kind === "table" ? (
        section.rows?.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: "860px", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {section.columns.map((column) => (
                    <th
                      key={column.key}
                      style={{
                        textAlign: "left",
                        padding: "0 0 10px",
                        fontSize: "11px",
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, index) => (
                  <tr key={`${section.id || section.title}-${index}`}>
                    {section.columns.map((column) => (
                      <td
                        key={column.key}
                        style={{
                          padding: "12px 0",
                          borderTop: index === 0 ? "none" : "1px solid rgba(226, 232, 240, 0.8)",
                          color: "#0f172a",
                          verticalAlign: "top",
                        }}
                      >
                        {row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: "#475569" }}>{section.empty_message || "No table rows available."}</div>
        )
      ) : null}
    </div>
  );
}

function PortfolioReportView({ report, onPrint }) {
  if (!report) return null;

  return (
    <section
      style={{
        display: "grid",
        gap: "18px",
        padding: "26px 28px",
        borderRadius: "24px",
        background: "#ffffff",
        border: "1px solid rgba(15, 23, 42, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          alignItems: "flex-start",
          flexWrap: "wrap",
          padding: "18px 20px",
          borderRadius: "18px",
          background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
          border: "1px solid rgba(147, 197, 253, 0.28)",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Portfolio Report
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{report.title}</div>
          <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "820px" }}>{report.subtitle}</div>
        </div>
        <button type="button" onClick={onPrint} style={buttonStyle(true)}>
          Print Report
        </button>
      </div>
      {report.sections.map((section) => renderReportSection(section))}
    </section>
  );
}

export default function InsuranceIntelligencePage({ onNavigate }) {
  const comparisonRef = useRef(null);
  const [expandedPolicyId, setExpandedPolicyId] = useState(null);
  const [showPortfolioReport, setShowPortfolioReport] = useState(false);
  const { insuranceRows: rows, loadingStates, errors } = usePlatformShellData();
  const loadError = errors.insurancePortfolio;

  const rankedPolicies = useMemo(() => {
    return [...rows]
      .map((row) => ({
        ...row,
        ranking: buildVaultedPolicyRank(row),
        interpretation: buildPolicyListInterpretation(row),
      }))
      .sort((left, right) => right.ranking.score - left.ranking.score);
  }, [rows]);

  const portfolioBrief = useMemo(() => buildInsurancePortfolioBrief(rankedPolicies), [rankedPolicies]);
  const portfolioReport = useMemo(() => buildInsurancePortfolioReport(rankedPolicies), [rankedPolicies]);

  const totalCoverage = rankedPolicies
    .map((row) => parseDisplayNumber(row.death_benefit))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);

  const totalCoi = rankedPolicies
    .map((row) => parseDisplayNumber(row.total_coi))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);

  const policiesWithIssues = rankedPolicies.filter((row) => {
    const missingCount = Array.isArray(row.missing_fields) ? row.missing_fields.length : 0;
    return (
      row.coi_confidence === "weak" ||
      missingCount > 0 ||
      !row.latest_statement_date ||
      row.data_completeness_status === "basic"
    );
  }).length;

  const highestCostPolicy = rankedPolicies.reduce((best, row) => {
    const current = parseDisplayNumber(row.total_coi);
    const bestValue = best ? parseDisplayNumber(best.total_coi) : null;
    if (current === null) return best;
    if (bestValue === null || current > bestValue) return row;
    return best;
  }, null);

  const weakestConfidencePolicy =
    rankedPolicies.find((row) => row.coi_confidence === "weak") || null;

  const atRiskPolicies = rankedPolicies.filter((row) => row.ranking.status === "At Risk");
  const strongContinuityPolicies = rankedPolicies.filter((row) => row.ranking.status === "Strong");

  const systemInsight = useMemo(() => {
    if (rankedPolicies.length === 0) {
      return {
        summary: "No saved vaulted policies are available for comparison yet.",
        bullets: ["Upload a policy illustration or statement to activate insurance intelligence."],
      };
    }

    const bullets = [];
    const weakCoiPolicies = rankedPolicies.filter((row) => row.coi_confidence === "weak");
    const missingStatementPolicies = rankedPolicies.filter((row) => !row.latest_statement_date);
    const incompleteChargePolicies = rankedPolicies.filter(
      (row) => row.total_visible_charges === null || row.total_visible_charges === undefined
    );
    const weakStrategyPolicies = rankedPolicies.filter(
      (row) => row.strategy_visibility === "limited" || row.strategy_visibility === "basic"
    );
    const highChargeDragPolicies = rankedPolicies.filter((row) => {
      const ratio = parseDisplayNumber(row.charge_drag_ratio);
      return ratio !== null && ratio > 5;
    });

    if (weakCoiPolicies.length > 0) {
      bullets.push(`${weakCoiPolicies.length} polic${weakCoiPolicies.length === 1 ? "y" : "ies"} still have weak COI visibility and need stronger charge validation.`);
    }
    if (missingStatementPolicies.length > 0) {
      bullets.push(`${missingStatementPolicies.length} polic${missingStatementPolicies.length === 1 ? "y is" : "ies are"} missing a resolved latest statement date.`);
    }
    if (incompleteChargePolicies.length > 0) {
      bullets.push(`${incompleteChargePolicies.length} polic${incompleteChargePolicies.length === 1 ? "y has" : "ies have"} incomplete visible charge totals.`);
    }
    if (weakStrategyPolicies.length > 0) {
      bullets.push(`Strategy visibility is limited on ${weakStrategyPolicies.length} polic${weakStrategyPolicies.length === 1 ? "y" : "ies"}, reducing comparison strength.`);
    }
    if (highChargeDragPolicies.length > 0) {
      bullets.push(`${highChargeDragPolicies.length} polic${highChargeDragPolicies.length === 1 ? "y shows" : "ies show"} elevated visible charge drag based on current reads.`);
    }
    if (atRiskPolicies.length > 0) {
      bullets.push(`${atRiskPolicies.length} polic${atRiskPolicies.length === 1 ? "y is" : "ies are"} currently in at-risk continuity status.`);
    }

    const uniqueBullets = [];
    const seen = new Set();
    bullets.forEach((bullet) => {
      if (!bullet || seen.has(bullet)) return;
      seen.add(bullet);
      uniqueBullets.push(bullet);
    });

    const summaryParts = [];
    if (weakCoiPolicies.length > 0) summaryParts.push("charge visibility");
    if (missingStatementPolicies.length > 0) summaryParts.push("statement freshness");
    if (weakStrategyPolicies.length > 0) summaryParts.push("strategy visibility");
    if (incompleteChargePolicies.length > 0 || rankedPolicies.some((row) => (row.missing_fields || []).length > 0)) {
      summaryParts.push("data completeness");
    }

    return {
      summary:
        strongContinuityPolicies.length === rankedPolicies.length
          ? `Insurance intelligence is comparing ${rankedPolicies.length} saved polic${rankedPolicies.length === 1 ? "y" : "ies"} with strong continuity support across statements, charges, and core fields.`
          : summaryParts.length > 0
            ? `Continuity is strongest where ${summaryParts.join(", ")} are complete, and weakens where those categories remain partial.`
            : `Insurance intelligence is comparing ${rankedPolicies.length} saved polic${rankedPolicies.length === 1 ? "y" : "ies"} using live continuity inputs.`,
      bullets: uniqueBullets.slice(0, 5),
    };
  }, [atRiskPolicies.length, rankedPolicies, strongContinuityPolicies.length]);

  function handlePrintPortfolioReport() {
    setShowPortfolioReport(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.print(), 80);
    }
  }

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <section
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          padding: "28px 30px",
          borderRadius: "24px",
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a" }}>
          Insurance Intelligence
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={() => setShowPortfolioReport((current) => !current)}
            style={reportButtonStyle(showPortfolioReport, false)}
          >
            {showPortfolioReport ? "Hide Portfolio Report" : "Open Portfolio Report"}
          </button>
          <button type="button" onClick={handlePrintPortfolioReport} style={buttonStyle(false)}>
            Print Report
          </button>
          <button
            onClick={() => comparisonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            style={buttonStyle(false)}
          >
            Compare Policies
          </button>
          <button onClick={() => onNavigate?.("/insurance/life/upload")} style={buttonStyle(true)}>
            Upload Policy
          </button>
        </div>
      </section>

      {showPortfolioReport ? (
        <PortfolioReportView report={portfolioReport} onPrint={handlePrintPortfolioReport} />
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "22px",
          padding: "0 4px",
          color: "#0f172a",
        }}
      >
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Total Policies
          </div>
          <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800 }}>{rankedPolicies.length}</div>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Total Coverage
          </div>
          <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800 }}>
            {totalCoverage > 0 ? formatCurrency(totalCoverage) : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Total COI Exposure
          </div>
          <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800 }}>
            {totalCoi > 0 ? formatCurrency(totalCoi) : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Policies With Issues
          </div>
          <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800 }}>{policiesWithIssues}</div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "18px",
          padding: "26px 28px",
          borderRadius: "24px",
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Portfolio Review Brief</div>
          <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "960px" }}>{portfolioBrief.summary}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "18px" }}>
          <div
            style={{
              padding: "18px 20px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
              border: "1px solid rgba(147, 197, 253, 0.28)",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Focus Areas
            </div>
            {portfolioBrief.focus_areas.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#0f172a" }}>
                {portfolioBrief.focus_areas.map((item) => (
                  <li key={item} style={{ lineHeight: "1.7" }}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: "#166534", fontWeight: 700 }}>
                The current portfolio does not show any major household-level visibility pressure points.
              </div>
            )}
          </div>

          <div
            style={{
              padding: "18px 20px",
              borderRadius: "18px",
              background: "#f8fafc",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Portfolio Mix
            </div>
            <div style={{ display: "grid", gap: "10px", color: "#0f172a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span>Well Supported</span>
                <strong>{portfolioBrief.metrics.strong_policies}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span>Needs Monitoring</span>
                <strong>{portfolioBrief.metrics.moderate_policies}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span>Weak</span>
                <strong>{portfolioBrief.metrics.weak_policies}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span>At Risk</span>
                <strong>{portfolioBrief.metrics.at_risk_policies}</strong>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>Priority Review Queue</div>
          {portfolioBrief.priority_policies.length > 0 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {portfolioBrief.priority_policies.map((policy) => (
                <button
                  key={policy.policy_id || policy.product}
                  type="button"
                  onClick={() => policy.policy_id && onNavigate?.(`/insurance/${policy.policy_id}`)}
                  style={{
                    padding: "16px 18px",
                    borderRadius: "16px",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    background: "#f8fafc",
                    textAlign: "left",
                    display: "grid",
                    gap: "6px",
                    cursor: policy.policy_id ? "pointer" : "default",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{policy.product}</div>
                    <div style={{ fontSize: "12px", color: "#475569" }}>
                      {policy.status} | {policy.continuity_score}/100
                    </div>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "13px" }}>{policy.carrier}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{policy.review_reason}</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: "#475569" }}>
              No immediate priority review queue is visible from the current portfolio.
            </div>
          )}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "18px",
          padding: "26px 28px",
          borderRadius: "24px",
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Policy Ranking</div>
        <div style={{ display: "grid", gap: "12px" }}>
          {rankedPolicies.length > 0 ? (
            rankedPolicies.map((policy, index) => {
              const tone = getStatusTone(policy.ranking.status);
              const isExpanded = expandedPolicyId === policy.policy_id;
              return (
                <div
                  key={policy.policy_id || `${policy.product}-${index}`}
                  style={{
                    padding: "16px 0",
                    borderTop: index === 0 ? "none" : "1px solid rgba(15, 23, 42, 0.08)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                    }}
                  >
                    <div style={{ display: "grid", gap: "4px" }}>
                      <button
                        type="button"
                        onClick={() => policy.policy_id && onNavigate?.(`/insurance/${policy.policy_id}`)}
                        style={{
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          textAlign: "left",
                          fontSize: "16px",
                          fontWeight: 700,
                          color: "#0f172a",
                          cursor: policy.policy_id ? "pointer" : "default",
                        }}
                      >
                        {policy.product || "Unnamed policy"}
                      </button>
                      <div style={{ fontSize: "13px", color: "#64748b" }}>
                        {policy.carrier || "Carrier unavailable"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.7", maxWidth: "760px" }}>
                        {policy.interpretation.bottom_line_summary}
                      </div>
                      {policy.ranking.caveat ? (
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>{policy.ranking.caveat}</div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: "999px",
                          background: tone.background,
                          color: tone.color,
                          fontWeight: 700,
                          fontSize: "12px",
                        }}
                      >
                        {policy.interpretation.label}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569", minWidth: "72px", textAlign: "right" }}>
                        {policy.ranking.score}/100
                      </div>
                      <button
                        type="button"
                        onClick={() => policy.policy_id && onNavigate?.(`/insurance/${policy.policy_id}`)}
                        style={buttonStyle(false)}
                      >
                        Open Policy
                      </button>
                      <button
                        onClick={() =>
                          setExpandedPolicyId(isExpanded ? null : policy.policy_id)
                        }
                        style={buttonStyle(false)}
                      >
                        {isExpanded ? "Hide Details" : "View Details"}
                      </button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div
                      style={{
                        marginTop: "14px",
                        padding: "16px",
                        borderRadius: "16px",
                        background: "rgba(248, 250, 252, 0.9)",
                        display: "grid",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", fontSize: "13px" }}>
                        <div><strong>Missing Fields:</strong> {(policy.missing_fields || []).join(", ") || "—"}</div>
                        <div><strong>COI Source:</strong> {displayNullable(policy.coi_source_kind)}</div>
                        <div><strong>COI Confidence:</strong> {displayNullable(policy.coi_confidence)}</div>
                        <div><strong>Charge Visibility:</strong> {displayNullable(policy.charge_visibility_status)}</div>
                        <div><strong>Latest Statement:</strong> {displayNullable(formatDateValue(policy.latest_statement_date))}</div>
                        <div><strong>Data Completeness:</strong> {displayNullable(policy.data_completeness_status)}</div>
                        <div><strong>Policy Health:</strong> {displayNullable(policy.policy_health_status)}</div>
                        <div><strong>Continuity Score:</strong> {policy.ranking.score}</div>
                      </div>
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>Interpretation Summary</div>
                        <div style={{ color: "#475569", lineHeight: "1.7" }}>
                          {policy.interpretation.bottom_line_summary}
                        </div>
                        {policy.interpretation.review_items?.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                            {policy.interpretation.review_items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {(policy.interpretation.followups || []).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() =>
                                policy.policy_id &&
                                onNavigate?.(
                                  item.id === "compare-stronger"
                                    ? `/insurance/compare/${policy.policy_id}`
                                    : `/insurance/${policy.policy_id}`
                                )
                              }
                              style={{
                                padding: "6px 10px",
                                borderRadius: "999px",
                                background: "#eff6ff",
                                border: "1px solid #dbeafe",
                                color: "#1d4ed8",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: policy.policy_id ? "pointer" : "default",
                              }}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <details>
                        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Continuity Debug</summary>
                        <pre style={{ marginTop: "10px", fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                          {JSON.stringify(
                            {
                              inputs: policy.ranking.inputs,
                              penalties: policy.ranking.penalties || [],
                              final_score: policy.ranking.score,
                              status: policy.ranking.status,
                              explanation: policy.ranking.statusExplanation,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </details>
                      <details>
                        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Comparison Summary Preview</summary>
                        <pre style={{ marginTop: "10px", fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                          {JSON.stringify(policy.raw_comparison_summary || {}, null, 2)}
                        </pre>
                      </details>
                      <details>
                        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Charge Summary Preview</summary>
                        <pre style={{ marginTop: "10px", fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                          {JSON.stringify(buildChargeSummaryPreview(policy), null, 2)}
                        </pre>
                      </details>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div style={{ color: "#64748b" }}>
              {loadingStates.insurancePortfolio ? "Loading insurance portfolio..." : loadError || "No saved policies available yet."}
            </div>
          )}
        </div>
      </section>

      <section
        ref={comparisonRef}
        style={{
          display: "grid",
          gap: "18px",
          padding: "26px 28px",
          borderRadius: "24px",
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Policy Comparison</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", color: "#0f172a" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(15, 23, 42, 0.10)" }}>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Policy</th>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Carrier</th>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Cash Value</th>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Cash Surrender Value</th>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Total COI</th>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Total Visible Charges</th>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>COI Confidence</th>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Latest Statement Date</th>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Primary Strategy</th>
                <th style={{ padding: "0 0 14px 0", fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rankedPolicies.map((policy) => (
                <tr
                  key={policy.policy_id || policy.product}
                  style={{
                    borderTop: "1px solid rgba(15, 23, 42, 0.06)",
                    background:
                      policy.ranking.status === "Weak" || policy.ranking.status === "At Risk"
                        ? "rgba(248, 250, 252, 0.7)"
                        : "transparent",
                  }}
                >
                  <td style={{ padding: "14px 0", fontWeight: 600 }}>
                    <button
                      type="button"
                      onClick={() => policy.policy_id && onNavigate?.(`/insurance/${policy.policy_id}`)}
                      style={{
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        fontWeight: 600,
                        color: "#0f172a",
                        cursor: policy.policy_id ? "pointer" : "default",
                      }}
                    >
                      {displayNullable(policy.product)}
                    </button>
                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#94a3b8" }}>
                      Missing fields: {(policy.missing_fields || []).length || 0}
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#475569" }}>
                      {policy.interpretation.bottom_line_summary}
                    </div>
                  </td>
                  <td style={{ padding: "14px 0" }}>{displayNullable(policy.carrier)}</td>
                  <td style={{ padding: "14px 0" }}>{displayNullable(policy.cash_value)}</td>
                  <td style={{ padding: "14px 0" }}>{displayNullable(policy.surrender_value)}</td>
                  <td style={{ padding: "14px 0" }}>{displayNullable(policy.total_coi)}</td>
                  <td style={{ padding: "14px 0" }}>{displayNullable(policy.total_visible_charges)}</td>
                  <td style={{ padding: "14px 0" }}>{displayNullable(policy.coi_confidence)}</td>
                  <td style={{ padding: "14px 0" }}>{displayNullable(formatDateValue(policy.latest_statement_date))}</td>
                  <td style={{ padding: "14px 0" }}>{displayNullable(policy.primary_strategy)}</td>
                  <td style={{ padding: "14px 0" }}>
                    <div>{policy.interpretation.label}</div>
                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#64748b" }}>
                      {policy.ranking.score}/100
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "14px",
          padding: "26px 28px",
          borderRadius: "24px",
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>System Insight</div>
        <div style={{ fontSize: "14px", lineHeight: "1.7", color: "#475569" }}>{systemInsight.summary}</div>
        <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#0f172a" }}>
          {systemInsight.bullets.map((bullet) => (
            <li key={bullet} style={{ lineHeight: "1.7" }}>
              {bullet}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
