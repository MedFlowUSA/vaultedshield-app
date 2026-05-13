import { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import StatusBadge from "../components/shared/StatusBadge";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  getVaultedPolicyStatements,
} from "../lib/supabase/vaultedPolicies";
import {
  buildPolicyTrendDeltaComparison,
  buildPolicyTrendSummary,
  buildPolicyComparisonAnalysis,
  buildPolicyComparisonReport,
  buildPolicyListInterpretation,
  buildVaultedPolicyRank,
} from "../lib/domain/intelligenceEngine";
import {
  analyzePolicyBasics,
  buildPolicyAdequacyReview,
  buildProtectionComparisonNarrative,
  detectInsuranceGaps,
} from "../lib/domain/insurance/insuranceIntelligence";
import { getPolicyDetailRoute } from "../lib/navigation/insurancePolicyRouting";

function formatCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "\u2014";
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "alert") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  if (tone === "info") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

function surfaceCard(extra = {}) {
  return {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid rgba(226,232,240,0.92)",
    boxShadow: "0 4px 16px rgba(15,23,42,0.05)",
    ...extra,
  };
}

function formatDate(value) {
  if (!value) return "\u2014";
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
  return value === null || value === undefined || value === "" ? "\u2014" : value;
}

function displayVisibleValue(flag, value) {
  if (value) return value;
  return flag ? "Visible" : "Limited";
}

function getTone(label) {
  if (label === "Well Supported" || label === "Strong") return "good";
  if (label === "Stable but Needs Monitoring" || label === "Moderate") return "warning";
  if (label === "At Risk") return "alert";
  return "info";
}

function getProtectionTone(hasGap, confidence = 0) {
  if (hasGap) return "alert";
  if (confidence >= 0.75) return "good";
  if (confidence >= 0.5) return "warning";
  return "info";
}

function buildComparisonNarrative(basePolicy, comparePolicy) {
  if (!basePolicy || !comparePolicy) return [];

  const bullets = [];
  if (comparePolicy.ranking.score > basePolicy.ranking.score) {
    bullets.push(
      `${comparePolicy.product || "The comparison policy"} carries stronger continuity support than ${basePolicy.product || "the current policy"}.`
    );
  }
  if (!basePolicy.latest_statement_date && comparePolicy.latest_statement_date) {
    bullets.push("The comparison policy has a resolved latest statement date, which improves review confidence.");
  }
  if (basePolicy.coi_confidence === "weak" && comparePolicy.coi_confidence !== "weak") {
    bullets.push("COI support is stronger in the comparison policy.");
  }
  if (
    ["limited", "basic"].includes(basePolicy.charge_visibility_status) &&
    !["limited", "basic"].includes(comparePolicy.charge_visibility_status)
  ) {
    bullets.push("Charge visibility is cleaner in the comparison policy.");
  }
  if (!basePolicy.primary_strategy && comparePolicy.primary_strategy) {
    bullets.push("The comparison policy has clearer strategy visibility.");
  }
  if ((basePolicy.missing_fields || []).length > (comparePolicy.missing_fields || []).length) {
    bullets.push("The current policy is carrying more missing-field pressure.");
  }

  return bullets.slice(0, 5);
}

function buildEvidenceLookup(basePolicy, comparePolicy, comparisonAnalysis, trendDeltaAnalysis, statementBundles) {
  if (!basePolicy || !comparePolicy) return {};

  const baseStatements = statementBundles[basePolicy.policy_id] || [];
  const compareStatements = statementBundles[comparePolicy.policy_id] || [];
  const baseTrend = trendDeltaAnalysis?.current_trend || null;
  const compareTrend = trendDeltaAnalysis?.comparison_trend || null;

  return {
    continuity: {
      title: "Continuity Support Evidence",
      summary: comparisonAnalysis?.analysis_items?.find((item) => item.id === "continuity")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [
            `Continuity score: ${basePolicy.ranking.score}/100`,
            `Interpretation: ${basePolicy.interpretation.label}`,
            `Explanation: ${basePolicy.ranking.statusExplanation}`,
          ],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [
            `Continuity score: ${comparePolicy.ranking.score}/100`,
            `Interpretation: ${comparePolicy.interpretation.label}`,
            `Explanation: ${comparePolicy.ranking.statusExplanation}`,
          ],
        },
      ],
    },
    statement_support: {
      title: "Statement Support Evidence",
      summary: comparisonAnalysis?.analysis_items?.find((item) => item.id === "statement_support")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [
            `Latest statement: ${formatDate(basePolicy.latest_statement_date)}`,
            `Visible periods: ${baseTrend?.periods_count ?? 0}`,
            `Trend continuity: ${displayNullable(baseTrend?.continuity_trend)}`,
            `Statement dates: ${(baseStatements || []).map((row) => formatDate(row.statement_date)).join(", ") || "\u2014"}`,
          ],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [
            `Latest statement: ${formatDate(comparePolicy.latest_statement_date)}`,
            `Visible periods: ${compareTrend?.periods_count ?? 0}`,
            `Trend continuity: ${displayNullable(compareTrend?.continuity_trend)}`,
            `Statement dates: ${(compareStatements || []).map((row) => formatDate(row.statement_date)).join(", ") || "\u2014"}`,
          ],
        },
      ],
    },
    coi_support: {
      title: "COI Support Evidence",
      summary: comparisonAnalysis?.analysis_items?.find((item) => item.id === "coi_support")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [
            `Total COI: ${displayNullable(basePolicy.total_coi)}`,
            `COI confidence: ${displayNullable(basePolicy.coi_confidence)}`,
            `COI source: ${displayNullable(basePolicy.coi_source_kind)}`,
          ],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [
            `Total COI: ${displayNullable(comparePolicy.total_coi)}`,
            `COI confidence: ${displayNullable(comparePolicy.coi_confidence)}`,
            `COI source: ${displayNullable(comparePolicy.coi_source_kind)}`,
          ],
        },
      ],
    },
    charge_visibility: {
      title: "Charge Visibility Evidence",
      summary: comparisonAnalysis?.analysis_items?.find((item) => item.id === "charge_visibility")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [
            `Charge visibility: ${displayNullable(basePolicy.charge_visibility_status)}`,
            `Total visible charges: ${displayNullable(basePolicy.total_visible_charges)}`,
            `Trend note: ${baseTrend?.visible_charge_trend?.note || "\u2014"}`,
          ],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [
            `Charge visibility: ${displayNullable(comparePolicy.charge_visibility_status)}`,
            `Total visible charges: ${displayNullable(comparePolicy.total_visible_charges)}`,
            `Trend note: ${compareTrend?.visible_charge_trend?.note || "\u2014"}`,
          ],
        },
      ],
    },
    strategy_visibility: {
      title: "Strategy Visibility Evidence",
      summary: comparisonAnalysis?.analysis_items?.find((item) => item.id === "strategy_visibility")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [
            `Primary strategy: ${displayNullable(basePolicy.primary_strategy)}`,
            `Cap rate: ${displayNullable(basePolicy.cap_rate)}`,
            `Participation rate: ${displayNullable(basePolicy.participation_rate)}`,
            `Spread: ${displayNullable(basePolicy.spread)}`,
          ],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [
            `Primary strategy: ${displayNullable(comparePolicy.primary_strategy)}`,
            `Cap rate: ${displayNullable(comparePolicy.cap_rate)}`,
            `Participation rate: ${displayNullable(comparePolicy.participation_rate)}`,
            `Spread: ${displayNullable(comparePolicy.spread)}`,
          ],
        },
      ],
    },
    missing_fields: {
      title: "Missing Data Evidence",
      summary: comparisonAnalysis?.analysis_items?.find((item) => item.id === "missing_fields")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [
            `Missing fields (${(basePolicy.missing_fields || []).length}): ${(basePolicy.missing_fields || []).join(", ") || "none"}`,
          ],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [
            `Missing fields (${(comparePolicy.missing_fields || []).length}): ${(comparePolicy.missing_fields || []).join(", ") || "none"}`,
          ],
        },
      ],
    },
    cash_value: {
      title: "Cash Value Trend Evidence",
      summary: trendDeltaAnalysis?.items?.find((item) => item.id === "cash_value")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [
            `Oldest statement: ${formatDate(baseTrend?.oldest_statement_date)}`,
            `Newest statement: ${formatDate(baseTrend?.newest_statement_date)}`,
            `Trend note: ${baseTrend?.cash_value_trend?.note || "\u2014"}`,
          ],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [
            `Oldest statement: ${formatDate(compareTrend?.oldest_statement_date)}`,
            `Newest statement: ${formatDate(compareTrend?.newest_statement_date)}`,
            `Trend note: ${compareTrend?.cash_value_trend?.note || "\u2014"}`,
          ],
        },
      ],
    },
    cash_surrender_value: {
      title: "Surrender Value Trend Evidence",
      summary: trendDeltaAnalysis?.items?.find((item) => item.id === "cash_surrender_value")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [`Trend note: ${baseTrend?.cash_surrender_value_trend?.note || "\u2014"}`],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [`Trend note: ${compareTrend?.cash_surrender_value_trend?.note || "\u2014"}`],
        },
      ],
    },
    coi: {
      title: "COI Trend Evidence",
      summary: trendDeltaAnalysis?.items?.find((item) => item.id === "coi")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [
            `Trend note: ${baseTrend?.total_coi_trend?.note || "\u2014"}`,
            `Latest visible statement COI: ${formatCurrency(baseStatements.at(-1)?.cost_of_insurance)}`,
          ],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [
            `Trend note: ${compareTrend?.total_coi_trend?.note || "\u2014"}`,
            `Latest visible statement COI: ${formatCurrency(compareStatements.at(-1)?.cost_of_insurance)}`,
          ],
        },
      ],
    },
    visible_charges: {
      title: "Visible Charge Trend Evidence",
      summary: trendDeltaAnalysis?.items?.find((item) => item.id === "visible_charges")?.summary || "",
      rows: [
        {
          label: basePolicy.product || "Current policy",
          values: [`Trend note: ${baseTrend?.visible_charge_trend?.note || "\u2014"}`],
        },
        {
          label: comparePolicy.product || "Comparison policy",
          values: [`Trend note: ${compareTrend?.visible_charge_trend?.note || "\u2014"}`],
        },
      ],
    },
  };
}

function actionButtonStyle(primary = false) {
  return {
    padding: "10px 14px",
    borderRadius: "10px",
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
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

function renderReportSection(section, isTablet = false) {
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
            <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse" }}>
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

      {section.kind === "side_by_side" ? (
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
          {(section.panels || []).map((panel) => (
            <div
              key={panel.title}
              style={{
                padding: "16px",
                borderRadius: "16px",
                background: "#ffffff",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>{panel.title}</div>
                {panel.subtitle ? <div style={{ marginTop: "4px", color: "#64748b" }}>{panel.subtitle}</div> : null}
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                {(panel.items || []).map((item) => (
                  <div key={`${panel.title}-${item.label}`} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                    <div style={{ color: "#64748b" }}>{item.label}</div>
                    <div style={{ color: "#0f172a", fontWeight: 700, textAlign: "right", lineHeight: "1.6" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReportView({ title, subtitle, report, onPrint }) {
  const isTablet = false;
  if (!report) return null;

  return (
    <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
      <div>
        <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{title}</div>
        {subtitle ? <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>{subtitle}</div> : null}
      </div>
      <div style={{ display: "grid", gap: "18px" }}>
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
              Report View
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{report.title}</div>
            <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "820px" }}>{report.subtitle}</div>
          </div>
          <button type="button" onClick={onPrint} style={actionButtonStyle(true)}>
            Print Report
          </button>
        </div>
        {report.sections.map((section) => renderReportSection(section, isTablet))}
      </div>
    </div>
  );
}

function PolicyCard({ title, policy, onOpen }) {
  return (
    <div
      style={{
        padding: "18px 20px",
        borderRadius: "18px",
        background: "#f8fafc",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        display: "grid",
        gap: "14px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {title}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
            {policy.product || "Unnamed policy"}
          </div>
          <div style={{ color: "#64748b" }}>{policy.carrier || "Carrier unavailable"}</div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <StatusBadge label={policy.interpretation.label} tone={getTone(policy.interpretation.label)} />
          <StatusBadge label={`${policy.ranking.score}/100`} tone={getTone(policy.interpretation.label)} />
        </div>
      </div>

      <div style={{ color: "#475569", lineHeight: "1.8" }}>
        {policy.interpretation.bottom_line_summary}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", color: "#475569" }}>
        <div><strong>Cash Value:</strong> {displayNullable(policy.cash_value)}</div>
        <div><strong>Total COI:</strong> {displayNullable(policy.total_coi)}</div>
        <div><strong>Total Visible Charges:</strong> {displayNullable(policy.total_visible_charges)}</div>
        <div><strong>Latest Statement:</strong> {formatDate(policy.latest_statement_date)}</div>
        <div><strong>COI Confidence:</strong> {displayNullable(policy.coi_confidence)}</div>
        <div><strong>Primary Strategy:</strong> {displayNullable(policy.primary_strategy)}</div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        style={{
          justifySelf: "start",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          background: "#ffffff",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Open Policy
      </button>
    </div>
  );
}

export default function PolicyComparisonPage({ policyId, comparePolicyId = "", onNavigate }) {
  const isTablet = false;
  const reportSectionRef = useRef(null);
  const comparisonSectionRef = useRef(null);
  const [statementBundles, setStatementBundles] = useState({});
  const [activeEvidenceId, setActiveEvidenceId] = useState("");
  const [showComparisonReport, setShowComparisonReport] = useState(false);
  const { insuranceRows, loadingStates, errors, debug } = usePlatformShellData();
  const loadError = errors.insurancePortfolio || "";
  const loading = loadingStates.insurancePortfolio && insuranceRows.length === 0;

  const rankedPolicies = useMemo(
    () =>
      [...insuranceRows]
        .map((row) => {
          const basicAnalysis = analyzePolicyBasics({ comparisonSummary: row });
          const adequacyReview = buildPolicyAdequacyReview(
            {
              comparisonSummary: row,
              basics: basicAnalysis,
            },
            { totalPolicies: insuranceRows.length }
          );
          return {
            ...row,
            ranking: buildVaultedPolicyRank(row),
            interpretation: buildPolicyListInterpretation(row),
            basicAnalysis,
            adequacyReview,
            gapAnalysis: detectInsuranceGaps(
              {
                comparisonSummary: row,
                basics: basicAnalysis,
                adequacyReview,
              },
              { totalPolicies: insuranceRows.length }
            ),
          };
        })
        .sort((left, right) => right.ranking.score - left.ranking.score),
    [insuranceRows]
  );

  const basePolicy = rankedPolicies.find((policy) => policy.policy_id === policyId) || null;
  const compareOptions = rankedPolicies.filter((policy) => policy.policy_id && policy.policy_id !== policyId);
  const comparisonPolicy =
    compareOptions.find((policy) => policy.policy_id === comparePolicyId) ||
    compareOptions.find((policy) => policy.ranking.score > (basePolicy?.ranking.score ?? -1)) ||
    compareOptions[0] ||
    null;

  const narrativeBullets = buildComparisonNarrative(basePolicy, comparisonPolicy);
  const protectionNarrative = useMemo(
    () => buildProtectionComparisonNarrative(basePolicy, comparisonPolicy),
    [basePolicy, comparisonPolicy]
  );
  const comparisonAnalysis = useMemo(
    () => (basePolicy && comparisonPolicy ? buildPolicyComparisonAnalysis(basePolicy, comparisonPolicy) : null),
    [basePolicy, comparisonPolicy]
  );
  const trendDeltaAnalysis = useMemo(
    () =>
      basePolicy && comparisonPolicy
        ? buildPolicyTrendDeltaComparison(
            statementBundles[basePolicy.policy_id] || [],
            statementBundles[comparisonPolicy.policy_id] || []
          )
        : null,
    [basePolicy, comparisonPolicy, statementBundles]
  );
  const evidenceLookup = useMemo(
    () =>
      buildEvidenceLookup(
        basePolicy,
        comparisonPolicy,
        comparisonAnalysis,
        trendDeltaAnalysis,
        statementBundles
      ),
    [basePolicy, comparisonPolicy, comparisonAnalysis, trendDeltaAnalysis, statementBundles]
  );
  const activeEvidence = activeEvidenceId ? evidenceLookup[activeEvidenceId] || null : null;
  const baseTrendSummary = useMemo(
    () => buildPolicyTrendSummary(basePolicy?.policy_id ? statementBundles[basePolicy.policy_id] || [] : []),
    [basePolicy?.policy_id, statementBundles]
  );
  const comparisonTrendSummary = useMemo(
    () =>
      buildPolicyTrendSummary(comparisonPolicy?.policy_id ? statementBundles[comparisonPolicy.policy_id] || [] : []),
    [comparisonPolicy?.policy_id, statementBundles]
  );
  const comparisonReport = useMemo(
    () =>
      basePolicy && comparisonPolicy
        ? buildPolicyComparisonReport(
            {
              row: basePolicy,
              ranking: basePolicy.ranking,
              interpretation: basePolicy.interpretation,
              statementRows: statementBundles[basePolicy.policy_id] || [],
              trendSummary: baseTrendSummary,
              comparisonAnalysis,
              trendDeltaAnalysis,
            },
            {
              row: comparisonPolicy,
              ranking: comparisonPolicy.ranking,
              interpretation: comparisonPolicy.interpretation,
              statementRows: statementBundles[comparisonPolicy.policy_id] || [],
              trendSummary: comparisonTrendSummary,
              comparisonAnalysis,
              trendDeltaAnalysis,
            }
          )
        : null,
    [
      basePolicy,
      baseTrendSummary,
      comparisonAnalysis,
      comparisonPolicy,
      comparisonTrendSummary,
      statementBundles,
      trendDeltaAnalysis,
    ]
  );

  const protectionComparison = useMemo(() => {
    if (!basePolicy || !comparisonPolicy) return null;

    const baseConfidence = basePolicy.gapAnalysis?.confidence || 0;
    const compareConfidence = comparisonPolicy.gapAnalysis?.confidence || 0;
    const strongerPolicy =
      compareConfidence > baseConfidence
        ? "comparison"
        : compareConfidence < baseConfidence
          ? "current"
          : "even";

    const summary =
      comparisonPolicy.gapAnalysis?.coverageGap && !basePolicy.gapAnalysis?.coverageGap
        ? `${comparisonPolicy.product || "The comparison policy"} still shows a visible protection gap even though it is the stronger continuity read.`
        : !comparisonPolicy.gapAnalysis?.coverageGap && basePolicy.gapAnalysis?.coverageGap
          ? `${comparisonPolicy.product || "The comparison policy"} currently shows a cleaner protection read than ${basePolicy.product || "the current policy"}.`
          : strongerPolicy === "comparison"
            ? `${comparisonPolicy.product || "The comparison policy"} currently carries stronger protection confidence from the visible evidence.`
            : strongerPolicy === "current"
              ? `${basePolicy.product || "The current policy"} currently carries stronger protection confidence from the visible evidence.`
              : "Both policies currently show a similar protection-confidence profile from the available evidence.";

    return {
      summary,
      strongerPolicy,
      baseConfidence,
      compareConfidence,
      items: [
        {
          label: "Coverage Confidence",
          baseValue: `${Math.round(baseConfidence * 100)}%`,
          comparisonValue: `${Math.round(compareConfidence * 100)}%`,
          strongerPolicy,
        },
        {
          label: "Funding Pattern",
          baseValue: displayNullable(basePolicy.basicAnalysis?.fundingPattern),
          comparisonValue: displayNullable(comparisonPolicy.basicAnalysis?.fundingPattern),
          strongerPolicy:
            comparisonPolicy.basicAnalysis?.fundingPattern === "adequate" || comparisonPolicy.basicAnalysis?.fundingPattern === "overfunded"
              ? basePolicy.basicAnalysis?.fundingPattern === "adequate" || basePolicy.basicAnalysis?.fundingPattern === "overfunded"
                ? "even"
                : "comparison"
              : basePolicy.basicAnalysis?.fundingPattern === "adequate" || basePolicy.basicAnalysis?.fundingPattern === "overfunded"
                ? "current"
                : "even",
        },
        {
          label: "COI Trend",
          baseValue: displayNullable(basePolicy.basicAnalysis?.coiTrend),
          comparisonValue: displayNullable(comparisonPolicy.basicAnalysis?.coiTrend),
          strongerPolicy:
            comparisonPolicy.basicAnalysis?.coiTrend === "stable"
              ? basePolicy.basicAnalysis?.coiTrend === "stable"
                ? "even"
                : "comparison"
              : basePolicy.basicAnalysis?.coiTrend === "stable"
                ? "current"
                : "even",
        },
        {
          label: "Gap Pressure",
          baseValue: basePolicy.gapAnalysis?.coverageGap ? "Possible gap" : "No obvious gap",
          comparisonValue: comparisonPolicy.gapAnalysis?.coverageGap ? "Possible gap" : "No obvious gap",
          strongerPolicy:
            !comparisonPolicy.gapAnalysis?.coverageGap && basePolicy.gapAnalysis?.coverageGap
              ? "comparison"
              : comparisonPolicy.gapAnalysis?.coverageGap && !basePolicy.gapAnalysis?.coverageGap
                ? "current"
                : "even",
        },
      ],
    };
  }, [basePolicy, comparisonPolicy]);
  const advisorComparisonRead = useMemo(() => {
    if (!basePolicy || !comparisonPolicy || !protectionNarrative) return null;
    return {
      summary: `${comparisonPolicy.product || "The comparison policy"} is the stronger working reference if you want the cleaner current read, but protection confidence should still be judged separately from continuity strength.`,
      bullets: [
        protectionNarrative.headline,
        comparisonAnalysis?.summary,
        trendDeltaAnalysis?.summary,
        ...(protectionNarrative.bullets || []),
      ].filter(Boolean).slice(0, 5),
    };
  }, [basePolicy, comparisonAnalysis?.summary, comparisonPolicy, protectionNarrative, trendDeltaAnalysis?.summary]);

  useEffect(() => {
    setStatementBundles({});
  }, [debug.authUserId, debug.householdId]);

  useEffect(() => {
    let active = true;

    async function loadStatementBundles() {
      if (!basePolicy?.policy_id || !comparisonPolicy?.policy_id) return;
      const policyScope = {
        userId: debug.authUserId,
        householdId: debug.householdId,
        ownershipMode: debug.ownershipMode,
        guestFallbackActive: debug.sharedFallbackActive,
        source: "policy_comparison_page",
      };

      const [baseStatementsResult, compareStatementsResult] = await Promise.all([
        getVaultedPolicyStatements(basePolicy.policy_id, policyScope),
        getVaultedPolicyStatements(comparisonPolicy.policy_id, policyScope),
      ]);

      if (!active) return;

      setStatementBundles((current) => ({
        ...current,
        [basePolicy.policy_id]: baseStatementsResult.data || [],
        [comparisonPolicy.policy_id]: compareStatementsResult.data || [],
      }));
    }

    loadStatementBundles();
    return () => {
      active = false;
    };
  }, [
    basePolicy?.policy_id,
    comparisonPolicy?.policy_id,
    debug.authUserId,
    debug.householdId,
    debug.ownershipMode,
    debug.sharedFallbackActive,
  ]);

  function handlePrintReport() {
    setShowComparisonReport(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.print(), 80);
    }
  }

  const comparisonHeroTone = getTone(comparisonPolicy?.interpretation?.label || basePolicy?.interpretation?.label);
  const strongerPolicyLabel = comparisonPolicy?.product || "The comparison policy";
  const currentPolicyLabel = basePolicy?.product || "the current policy";
  const comparisonHeroHeadline =
    comparisonPolicy && basePolicy
      ? `${strongerPolicyLabel} currently looks stronger`
      : "Compare two policy reads side by side";
  const comparisonHeroSummary =
    comparisonPolicy && basePolicy
      ? `${strongerPolicyLabel} currently reads ${String(comparisonPolicy.interpretation?.label || "more clearly").toLowerCase()} versus ${String(basePolicy.interpretation?.label || "the current read").toLowerCase()} for ${currentPolicyLabel}.`
      : "This page compares statement support, charges, continuity strength, and protection confidence across two saved policy files.";

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              Insurance Comparison
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>{comparisonHeroHeadline}</div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>{comparisonHeroSummary}</div>
          </div>
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "18px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              display: "grid",
              gap: "4px",
              textAlign: "center",
              minWidth: "100px",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#93c5fd" }}>{comparisonPolicy?.ranking?.score || basePolicy?.ranking?.score || 0}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>strength</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
          {[
            { label: "Current policy", value: basePolicy?.product || "Loading" },
            { label: "Comparison policy", value: comparisonPolicy?.product || "Needed" },
            { label: "Current score", value: basePolicy?.ranking?.score ? `${basePolicy.ranking.score}/100` : "--" },
            { label: "Comparison score", value: comparisonPolicy?.ranking?.score ? `${comparisonPolicy.ranking.score}/100` : "--" },
          ].map((item) => (
            <div key={item.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.label}</div>
              <div style={{ fontSize: "16px", fontWeight: 800, marginTop: "4px", lineHeight: "1.3" }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onNavigate?.(policyId ? `/insurance/${policyId}` : "/insurance")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#1e40af", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            {policyId ? "Back To Policy" : "Back To Insurance"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowComparisonReport((current) => !current);
              reportSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            {showComparisonReport ? "Hide Comparison Report" : "Open Comparison Report"}
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Print Report
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isTablet ? "1fr" : "repeat(3, minmax(0, 1fr))",
          gap: "14px",
        }}
      >
        {[
          {
            kicker: "Simple Read",
            title: comparisonPolicy && basePolicy ? `${strongerPolicyLabel} is the stronger working file` : "Choose two saved policies to compare",
            detail: "Use this when you want the fastest answer to which current policy file looks cleaner before getting into the technical proof.",
            metric: comparisonPolicy && basePolicy ? `${Math.max(0, (comparisonPolicy.ranking?.score || 0) - (basePolicy.ranking?.score || 0))} point gap` : "2 files",
            tone: comparisonHeroTone,
            statusLabel: "Simple Read",
            actionLabel: "Open Comparison",
            onAction: () => comparisonSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "Evidence Path",
            title: "See the report-ready proof",
            detail: "Open the structured comparison report when you want the export-style evidence bundle instead of just the headline call.",
            metric: showComparisonReport ? "Report open" : "Report hidden",
            tone: "info",
            statusLabel: "Well Supported",
            actionLabel: showComparisonReport ? "Hide Report" : "Open Report",
            onAction: () => {
              setShowComparisonReport((current) => !current);
              reportSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
          {
            kicker: "Best Next Step",
            title: "Go back into the policy that needs attention",
            detail: "After the side-by-side read, reopen the policy page or Insurance Intelligence to keep the deeper review moving.",
            metric: policyId ? "Policy route ready" : "Insurance route ready",
            tone: "warning",
            statusLabel: "Guided Action",
            actionLabel: policyId ? "Back To Policy" : "Open Insurance",
            onAction: () => onNavigate?.(policyId ? `/insurance/${policyId}` : "/insurance"),
          },
        ].map((tile) => (
          <div
            key={tile.kicker}
            style={{ padding: "20px", borderRadius: "18px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "12px", alignContent: "start" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{tile.kicker}</div>
              <div style={{ ...pillStyle(tile.tone), padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>{tile.statusLabel}</div>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{tile.title}</div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{tile.detail}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>{tile.metric}</div>
            <button type="button" onClick={tile.onAction} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer", textAlign: "left" }}>
              {tile.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={surfaceCard({ padding: "22px 24px" })}>
          <div style={{ color: "#64748b" }}>Loading comparison view...</div>
        </div>
      ) : !basePolicy ? (
        <EmptyState
          title="Policy comparison unavailable"
          description={loadError || "The selected base policy could not be loaded for side-by-side review."}
        />
      ) : !comparisonPolicy ? (
        <EmptyState
          title="No comparison candidate yet"
          description="At least one additional vaulted policy is needed to run a focused comparison."
        />
      ) : (
        <>
          {showComparisonReport ? (
            <div ref={reportSectionRef}>
              <ReportView
                title="Policy Comparison Report"
                subtitle="A structured export-ready comparison built from the current side-by-side intelligence."
                report={comparisonReport}
                onPrint={handlePrintReport}
              />
            </div>
          ) : null}

          <div ref={comparisonSectionRef} style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Policy Health Comparison</div>
              <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>This view highlights which in-force policy currently looks stronger, where charge drag and evidence support differ, and which file needs closer attention.</div>
            </div>
            <div style={{ display: "grid", gap: "14px" }}>
              <div
                style={{
                  padding: "18px 20px",
                  borderRadius: "18px",
                  background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                  border: "1px solid rgba(147, 197, 253, 0.28)",
                  color: "#0f172a",
                  fontSize: "16px",
                  lineHeight: "1.8",
                  fontWeight: 600,
                }}
              >
                {comparisonPolicy.product || "The comparison policy"} is the stronger reference file for this review.
                {" "}
                It currently carries a {comparisonPolicy.interpretation.label.toLowerCase()} read versus{" "}
                {basePolicy.interpretation.label.toLowerCase()} for {basePolicy.product || "the current policy"}.
              </div>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>{protectionNarrative.headline}</div>
                {narrativeBullets.length > 0 || protectionNarrative.bullets.length > 0 ? (
                 <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                  {[...narrativeBullets, ...protectionNarrative.bullets].slice(0, 6).map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {protectionComparison ? (
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Protection Confidence</div>
                <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>This layer compares protection-read confidence, funding visibility, and visible gap pressure so stronger policy monitoring is not mistaken for complete protection.</div>
              </div>
              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    color: "#0f172a",
                    fontSize: "16px",
                    lineHeight: "1.8",
                    fontWeight: 600,
                  }}
                >
                  {protectionComparison.summary}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
                  {[basePolicy, comparisonPolicy].map((policy, index) => (
                    <div
                      key={policy.policy_id || index}
                      style={{
                        padding: "16px",
                        borderRadius: "16px",
                        background: "#f8fafc",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{policy.product || "Unnamed policy"}</div>
                        <StatusBadge
                          label={policy.gapAnalysis?.coverageGap ? "Gap Review Needed" : "Protection Check"}
                          
                          tone={getProtectionTone(policy.gapAnalysis?.coverageGap, policy.gapAnalysis?.confidence)}
                        />
                      </div>
                      <div style={{ color: "#475569", lineHeight: "1.7" }}>
                        {policy.gapAnalysis?.coverageGap
                          ? "Visible protection gaps or incomplete support are present in the current read."
                          : "No obvious protection gap is visible from the current extracted evidence."}
                      </div>
                      <div style={{ display: "grid", gap: "8px", color: "#0f172a", fontSize: "14px" }}>
                        <div><strong>Coverage confidence:</strong> {Math.round((policy.gapAnalysis?.confidence || 0) * 100)}%</div>
                        <div><strong>Funding pattern:</strong> {displayNullable(policy.basicAnalysis?.fundingPattern)}</div>
                        <div><strong>COI trend:</strong> {displayNullable(policy.basicAnalysis?.coiTrend)}</div>
                      </div>
                      {policy.gapAnalysis?.notes?.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                          {policy.gapAnalysis.notes.map((item) => (
                            <li key={`${policy.policy_id}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
                  {protectionComparison.items.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        padding: "16px",
                        borderRadius: "16px",
                        background: "#ffffff",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.label}</div>
                        <StatusBadge
                          label={
                            item.strongerPolicy === "comparison"
                              ? "Comparison Stronger"
                            : item.strongerPolicy === "current"
                                ? "Current Stronger"
                                : "Even"
                          }
                          tone={
                            item.strongerPolicy === "comparison"
                              ? "good"
                              : item.strongerPolicy === "current"
                                ? "warning"
                                : "info"
                          }
                        />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                        <div>
                          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Current Policy
                          </div>
                          <div style={{ marginTop: "4px", color: "#0f172a" }}>{item.baseValue}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Comparison Policy
                          </div>
                          <div style={{ marginTop: "4px", color: "#0f172a" }}>{item.comparisonValue}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {basePolicy?.adequacyReview || comparisonPolicy?.adequacyReview ? (
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Policy Parties</div>
                <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>This layer compares owner, trust, payor, and beneficiary visibility so side-by-side review is not limited to values and charges.</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
                {[basePolicy, comparisonPolicy].map((policy, index) => {
                  const adequacyReview = policy?.adequacyReview || {};
                  const beneficiaryNames =
                    adequacyReview.primaryBeneficiaryName || adequacyReview.contingentBeneficiaryName
                      ? [adequacyReview.primaryBeneficiaryName, adequacyReview.contingentBeneficiaryName]
                          .filter(Boolean)
                          .join(" / ")
                      : displayNullable(adequacyReview.beneficiaryVisibility);
                  const beneficiaryShares =
                    [
                      adequacyReview.primaryBeneficiaryShare ? `Primary ${adequacyReview.primaryBeneficiaryShare}` : "",
                      adequacyReview.contingentBeneficiaryShare ? `Contingent ${adequacyReview.contingentBeneficiaryShare}` : "",
                    ]
                      .filter(Boolean)
                      .join(" / ") || "Limited";

                  return (
                    <div
                      key={policy.policy_id || index}
                      style={{
                        padding: "16px",
                        borderRadius: "16px",
                        background: "#f8fafc",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{policy.product || "Unnamed policy"}</div>
                        <StatusBadge
                          label={adequacyReview.displayStatus || "Needs Review"}
                          tone={adequacyReview.adequacyStatus === "more_supported" ? "good" : "warning"}
                        />
                      </div>
                      <div style={{ color: "#475569", lineHeight: "1.7" }}>
                        {adequacyReview.headline || "Party visibility is still limited in the current extracted read."}
                      </div>
                      <div style={{ display: "grid", gap: "8px", color: "#0f172a", fontSize: "14px" }}>
                        <div><strong>Owner:</strong> {displayVisibleValue(adequacyReview.ownerVisible, adequacyReview.ownerName)}</div>
                        <div><strong>Insured:</strong> {displayVisibleValue(adequacyReview.insuredVisible, adequacyReview.insuredName)}</div>
                        <div><strong>Joint insured:</strong> {displayVisibleValue(adequacyReview.jointInsuredVisible, adequacyReview.jointInsuredName)}</div>
                        <div><strong>Payor:</strong> {displayVisibleValue(adequacyReview.payorVisible, adequacyReview.payorName)}</div>
                        <div><strong>Trustee:</strong> {displayVisibleValue(adequacyReview.trusteeVisible, adequacyReview.trusteeName)}</div>
                        <div><strong>Trust name:</strong> {displayVisibleValue(adequacyReview.trustNameVisible, adequacyReview.trustName)}</div>
                        <div><strong>Beneficiaries:</strong> {beneficiaryNames}</div>
                        <div><strong>Beneficiary shares:</strong> {beneficiaryShares}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {advisorComparisonRead ? (
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Plain-English Comparison Read</div>
                <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>A practical recommendation layer that separates cleaner monitoring support from actual protection confidence.</div>
              </div>
              <div style={{ display: "grid", gap: "14px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                    border: "1px solid rgba(147, 197, 253, 0.28)",
                    color: "#0f172a",
                    fontSize: "16px",
                    lineHeight: "1.8",
                    fontWeight: 600,
                  }}
                >
                  {advisorComparisonRead.summary}
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                  {advisorComparisonRead.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {comparisonAnalysis ? (
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Why One Policy Looks Stronger</div>
                <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>This layer compares continuity, statement support, charge drag, COI support, strategy visibility, and missing-data pressure side by side.</div>
              </div>
              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    color: "#0f172a",
                    fontSize: "16px",
                    lineHeight: "1.8",
                    fontWeight: 600,
                  }}
                >
                  {comparisonAnalysis.summary}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: "14px" }}>
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "16px",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "#166534", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Stronger Areas
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#166534" }}>
                      {comparisonAnalysis.stronger_areas.length}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "16px",
                      background: "#fff7ed",
                      border: "1px solid #fed7aa",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "#9a3412", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Current Policy Leads
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#9a3412" }}>
                      {comparisonAnalysis.weaker_areas.length}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "16px",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Score Gap
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#1d4ed8" }}>
                      {comparisonAnalysis.comparison_policy.score - comparisonAnalysis.current_policy.score}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
                  {comparisonAnalysis.analysis_items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveEvidenceId(item.id)}
                      style={{
                        padding: "16px",
                        borderRadius: "16px",
                        background: activeEvidenceId === item.id ? "#eff6ff" : "#f8fafc",
                        border: activeEvidenceId === item.id ? "1px solid #93c5fd" : "1px solid rgba(148, 163, 184, 0.18)",
                        display: "grid",
                        gap: "8px",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.label}</div>
                        <StatusBadge
                          label={
                            item.stronger_policy === "comparison"
                              ? "Comparison Stronger"
                              : item.stronger_policy === "current"
                                ? "Current Stronger"
                                : "Even"
                          }
                          tone={
                            item.stronger_policy === "comparison"
                              ? "good"
                              : item.stronger_policy === "current"
                                ? "warning"
                                : "info"
                          }
                        />
                      </div>
                      <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.summary}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {trendDeltaAnalysis ? (
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Performance Trend Comparison</div>
                <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>This layer compares how cash value, surrender value, COI, charge drag, and statement support are moving over time in each policy.</div>
              </div>
              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    color: "#0f172a",
                    fontSize: "16px",
                    lineHeight: "1.8",
                    fontWeight: 600,
                  }}
                >
                  {trendDeltaAnalysis.summary}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
                  {trendDeltaAnalysis.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveEvidenceId(item.id)}
                      style={{
                        padding: "16px",
                        borderRadius: "16px",
                        background: activeEvidenceId === item.id ? "#eff6ff" : "#f8fafc",
                        border: activeEvidenceId === item.id ? "1px solid #93c5fd" : "1px solid rgba(148, 163, 184, 0.18)",
                        display: "grid",
                        gap: "8px",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.label}</div>
                        <StatusBadge
                          label={
                            item.stronger_policy === "comparison"
                              ? "Comparison Stronger"
                              : item.stronger_policy === "current"
                                ? "Current Stronger"
                                : item.stronger_policy === "limited"
                                  ? "Limited"
                                  : "Even"
                          }
                          tone={
                            item.stronger_policy === "comparison"
                              ? "good"
                              : item.stronger_policy === "current"
                                ? "warning"
                                : "info"
                          }
                        />
                      </div>
                      <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.summary}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeEvidence ? (
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{activeEvidence.title}</div>
                <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>This drill-down shows the specific side-by-side evidence currently driving the policy comparison call.</div>
              </div>
              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                    border: "1px solid rgba(147, 197, 253, 0.28)",
                    color: "#0f172a",
                    fontSize: "15px",
                    lineHeight: "1.8",
                    fontWeight: 600,
                  }}
                >
                  {activeEvidence.summary || "Evidence details are shown below."}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr", gap: "16px" }}>
                  {activeEvidence.rows.map((row) => (
                    <div
                      key={row.label}
                      style={{
                        padding: "16px",
                        borderRadius: "16px",
                        background: "#f8fafc",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{row.label}</div>
                      <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                        {row.values.map((value) => (
                          <li key={value}>{value}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr", gap: "18px" }}>
            <PolicyCard
              title="Current Policy"
              policy={basePolicy}
              onOpen={() => onNavigate?.(getPolicyDetailRoute(basePolicy))}
            />
            <PolicyCard
              title="Comparison Policy"
              policy={comparisonPolicy}
              onOpen={() => onNavigate?.(getPolicyDetailRoute(comparisonPolicy))}
            />
          </div>

          <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Try Another Comparison</div>
              <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Choose a different policy to use as the comparison reference.</div>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {compareOptions.map((policy) => (
                <button
                  key={policy.policy_id}
                  type="button"
                  onClick={() => onNavigate?.(`/insurance/compare/${policyId}/${policy.policy_id}`)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "999px",
                    border: policy.policy_id === comparisonPolicy.policy_id ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
                    background: policy.policy_id === comparisonPolicy.policy_id ? "#eff6ff" : "#ffffff",
                    color: policy.policy_id === comparisonPolicy.policy_id ? "#1d4ed8" : "#0f172a",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {policy.product || "Unnamed policy"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
