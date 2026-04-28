import { useMemo, useRef, useState } from "react";
import {
  buildInsurancePortfolioBrief,
  buildInsurancePortfolioReport,
  buildPolicyListInterpretation,
  buildVaultedPolicyRank,
} from "../lib/domain/intelligenceEngine";
import PortfolioAIChatBox from "../components/policy/PortfolioAIChatBox";
import PortfolioActionFeedCard from "../components/policy/PortfolioActionFeedCard";
import PortfolioSignalsSummaryCard from "../components/policy/PortfolioSignalsSummaryCard";
import InsightExplanationPanel from "../components/shared/InsightExplanationPanel";
import { FriendlyActionTile } from "../components/shared/FriendlyIntelligenceUI";
import { useEffect } from "react";
import { analyzePolicyBasics, detectInsuranceGaps } from "../lib/domain/insurance/insuranceIntelligence";
import buildInsurancePageFascia from "../lib/intelligence/fascia/buildInsurancePageFascia";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { getPolicyDetailRoute, getPolicyEntryLabel, isIulShowcasePolicy } from "../lib/navigation/insurancePolicyRouting";
import { buildPolicySignals } from "../lib/policySignals/buildPolicySignals";
import { buildPortfolioActionFeed } from "../lib/policySignals/buildPortfolioActionFeed";
import { buildPortfolioSignals } from "../lib/policySignals/buildPortfolioSignals";
import { buildReviewWorkspaceRoute } from "../lib/reviewWorkspace/workspaceFilters";
import { getHouseholdInsuranceSummary } from "../lib/supabase/vaultedPolicies";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

const EMPTY_VALUE = "-";
const METRIC_GRID_COLUMNS = "repeat(auto-fit, minmax(180px, 1fr))";
const DETAIL_GRID_COLUMNS = "repeat(auto-fit, minmax(180px, 1fr))";

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
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_VALUE;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatDateValue(value) {
  if (!value) return EMPTY_VALUE;
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
  return value === null || value === undefined || value === "" ? EMPTY_VALUE : value;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getStatusTone(status) {
  if (status === "Strong") return { color: "#166534", background: "rgba(34, 197, 94, 0.12)" };
  if (status === "Moderate") return { color: "#92400e", background: "rgba(245, 158, 11, 0.14)" };
  if (status === "Weak") return { color: "#9f1239", background: "rgba(244, 63, 94, 0.12)" };
  return { color: "#991b1b", background: "rgba(239, 68, 68, 0.14)" };
}

function getGapTone(hasGap, confidence = 0) {
  if (hasGap) return { color: "#991b1b", background: "rgba(239, 68, 68, 0.14)" };
  if (confidence >= 0.75) return { color: "#166534", background: "rgba(34, 197, 94, 0.12)" };
  return { color: "#92400e", background: "rgba(245, 158, 11, 0.14)" };
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

function renderSignalCard({ label, value, detail }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "16px",
        background: "#ffffff",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        display: "grid",
        gap: "8px",
      }}
    >
      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{value}</div>
      {detail ? <div style={{ color: "#475569", lineHeight: "1.65", fontSize: "13px" }}>{detail}</div> : null}
    </div>
  );
}

function PortfolioReportView({ report, onPrint, isCompact = false }) {
  if (!report) return null;

  return (
    <section
      style={{
        display: "grid",
        gap: "18px",
        padding: isCompact ? "20px 16px" : "26px 28px",
        borderRadius: isCompact ? "20px" : "24px",
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

function surfaceCardStyle(extra = {}) {
  return {
    background: "#ffffff",
    borderRadius: "24px",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
    ...extra,
  };
}

function normalizeScore(value, fallback = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function insuranceStatusScore(status = "", fallback = 52) {
  const normalized = String(status || "").toLowerCase();
  if (["strong", "healthy"].includes(normalized)) return 88;
  if (["stable", "moderate"].includes(normalized)) return 74;
  if (["partial", "incomplete", "needs review"].includes(normalized)) return 58;
  if (["at risk", "weak"].includes(normalized)) return 38;
  return fallback;
}

function insuranceTonePalette(tone = "info") {
  if (tone === "good") return { accent: "#22c55e", soft: "rgba(34, 197, 94, 0.14)", text: "#166534" };
  if (tone === "warning") return { accent: "#f59e0b", soft: "rgba(245, 158, 11, 0.14)", text: "#92400e" };
  if (tone === "alert") return { accent: "#ef4444", soft: "rgba(239, 68, 68, 0.14)", text: "#991b1b" };
  return { accent: "#3b82f6", soft: "rgba(59, 130, 246, 0.14)", text: "#1d4ed8" };
}

function insuranceToneFromScore(score = 0) {
  if (score >= 82) return "good";
  if (score >= 64) return "info";
  if (score >= 50) return "warning";
  return "alert";
}

function ScoreRing({ value = 0, size = "md", tone = "info", subtitle = "of 100", iconLabel = "" }) {
  const palette = insuranceTonePalette(tone);
  const normalized = normalizeScore(value);
  const sizes = {
    lg: { diameter: 152, stroke: 12, number: "42px", badge: "34px", subtitle: "12px" },
    md: { diameter: 98, stroke: 9, number: "28px", badge: "28px", subtitle: "11px" },
    sm: { diameter: 74, stroke: 7, number: "20px", badge: "24px", subtitle: "10px" },
  };
  const ring = sizes[size] || sizes.md;

  return (
    <div
      style={{
        width: `${ring.diameter}px`,
        height: `${ring.diameter}px`,
        borderRadius: "999px",
        background: `conic-gradient(${palette.accent} ${normalized * 3.6}deg, #e2e8f0 ${normalized * 3.6}deg 360deg)`,
        display: "grid",
        placeItems: "center",
        padding: `${ring.stroke}px`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "999px",
          background: "#ffffff",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          gap: "2px",
          boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
        }}
      >
        {iconLabel ? (
          <div
            style={{
              width: ring.badge,
              height: ring.badge,
              borderRadius: "999px",
              display: "grid",
              placeItems: "center",
              background: palette.soft,
              color: palette.text,
              fontSize: size === "lg" ? "11px" : "10px",
              fontWeight: 800,
              letterSpacing: "0.08em",
            }}
          >
            {iconLabel}
          </div>
        ) : null}
        <div style={{ fontSize: ring.number, fontWeight: 800, lineHeight: 1, color: "#0f172a" }}>{normalized}</div>
        <div style={{ fontSize: ring.subtitle, color: "#64748b", fontWeight: 700 }}>{subtitle}</div>
      </div>
    </div>
  );
}

export default function InsuranceIntelligencePage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const comparisonRef = useRef(null);
  const protectionSignalsRef = useRef(null);
  const technicalAnalysisRef = useRef(null);
  const [expandedPolicyId, setExpandedPolicyId] = useState(null);
  const [showPortfolioReport, setShowPortfolioReport] = useState(false);
  const [showFasciaExplanation, setShowFasciaExplanation] = useState(false);
  const { insuranceRows: rows, loadingStates, errors, debug } = usePlatformShellData();
  const loadError = errors.insurancePortfolio;
  const [householdInsuranceSummary, setHouseholdInsuranceSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const rankedPolicies = useMemo(() => {
    return [...rows]
      .map((row) => {
        const basicAnalysis = analyzePolicyBasics({ comparisonSummary: row });
        const interpretation = buildPolicyListInterpretation(row);
        const policySignals = buildPolicySignals({
          policyInterpretation: interpretation,
          comparisonData: row,
          signalsOutput: row.policy_signals || null,
          normalizedMetrics: {
            fundingPattern: basicAnalysis?.fundingPattern || basicAnalysis?.funding_pattern,
            illustrationStatus: row.illustration_status || row.illustration_comparison_status,
            allocationPercent: row.allocation_percent,
          },
        });

        return {
          ...row,
          ranking: buildVaultedPolicyRank(row),
          interpretation,
          basicAnalysis,
          policySignals,
          gapAnalysis: detectInsuranceGaps(
            {
              comparisonSummary: row,
              basics: basicAnalysis,
            },
            { totalPolicies: rows.length }
          ),
        };
      })
      .sort((left, right) => right.ranking.score - left.ranking.score);
  }, [rows]);

  useEffect(() => {
    let active = true;

    async function loadHouseholdSummary() {
      if (!debug.authUserId) {
        setHouseholdInsuranceSummary(null);
        setSummaryError("");
        setSummaryLoading(false);
        return;
      }

      setSummaryLoading(true);
      setSummaryError("");

      try {
        const result = await getHouseholdInsuranceSummary(debug.authUserId, debug.householdId || null);
        if (!active) return;

        if (result.error) {
          setHouseholdInsuranceSummary(null);
          setSummaryError(result.error.message || "Household insurance summary could not be loaded.");
          return;
        }

        setHouseholdInsuranceSummary(result.data || null);
      } catch (error) {
        if (!active) return;
        setHouseholdInsuranceSummary(null);
        setSummaryError(error?.message || "Household insurance summary could not be loaded.");
      } finally {
        if (active) {
          setSummaryLoading(false);
        }
      }
    }

    loadHouseholdSummary();
    return () => {
      active = false;
    };
  }, [debug.authUserId, debug.householdId]);

  const portfolioBrief = useMemo(() => buildInsurancePortfolioBrief(rankedPolicies), [rankedPolicies]);
  const portfolioSignals = useMemo(
    () =>
      buildPortfolioSignals({
        policies: rankedPolicies,
      }),
    [rankedPolicies]
  );
  const portfolioActionFeed = useMemo(
    () =>
      buildPortfolioActionFeed({
        policies: rankedPolicies,
        portfolioSignals,
      }),
    [portfolioSignals, rankedPolicies]
  );
  const topPriorityPolicy = portfolioBrief.priority_policies[0] || null;
  const insuranceReviewWorkspaceRoute = useMemo(
    () =>
      buildReviewWorkspaceRoute({
        filters: {
          module: "policy",
          issueType: "policy_review_issue",
          severity: topPriorityPolicy ? "high" : "medium",
          householdId: debug.householdId || null,
        },
        openedFromAssistant: true,
      }),
    [debug.householdId, topPriorityPolicy]
  );
  const portfolioReport = useMemo(() => buildInsurancePortfolioReport(rankedPolicies), [rankedPolicies]);
  const topPolicyReportSection = portfolioReport.sections.find((section) => section.id === "top_policy_verdict") || null;
  const carrierSupportReportSection = portfolioReport.sections.find((section) => section.id === "carrier_support") || null;
  const advisorHandoffReportSection = portfolioReport.sections.find((section) => section.id === "advisor_handoff") || null;
  const portfolioBottomLineSection = portfolioReport.sections.find((section) => section.id === "portfolio_bottom_line") || null;

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
  const gapPolicies = rankedPolicies.filter((row) => row.gapAnalysis?.coverageGap);
  const missingStatementPolicies = rankedPolicies.filter((row) => !row.latest_statement_date);
  const systemInsight = useMemo(() => {
    if (rankedPolicies.length === 0) {
      return {
        summary: "No saved vaulted policies are available for comparison yet.",
        bullets: ["Upload a policy illustration or statement to activate insurance intelligence."],
      };
    }

    const bullets = [];
    const weakCoiPolicies = rankedPolicies.filter((row) => row.coi_confidence === "weak");
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
  }, [atRiskPolicies.length, missingStatementPolicies.length, rankedPolicies, strongContinuityPolicies.length]);

  const portfolioDepth = useMemo(() => {
    const structuredPolicies = rankedPolicies.filter((row) => row.structured_data_present);
    const missingStatementPolicies = rankedPolicies.filter((row) => !row.latest_statement_date);
    const limitedChargePolicies = rankedPolicies.filter(
      (row) => row.total_visible_charges === null || row.total_visible_charges === undefined
    );
    const limitedStrategyPolicies = rankedPolicies.filter(
      (row) => row.strategy_visibility === "limited" || row.strategy_visibility === "basic"
    );
    const weakCoiPolicies = rankedPolicies.filter((row) => row.coi_confidence === "weak");
    const missingFieldPolicies = rankedPolicies.filter((row) => (row.missing_fields || []).length > 0);
    const latestStatementPolicy = rankedPolicies
      .filter((row) => row.latest_statement_date)
      .sort((left, right) => new Date(right.latest_statement_date) - new Date(left.latest_statement_date))[0] || null;

    const topReviewPolicy = portfolioBrief.priority_policies[0] || null;
    const deepestReadPolicy = rankedPolicies.find(
      (row) =>
        row.structured_data_present &&
        row.latest_statement_date &&
        row.coi_confidence !== "weak" &&
        (row.missing_fields || []).length === 0
    ) || rankedPolicies[0] || null;

    return {
      cards: [
        {
          title: "Evidence Quality",
          summary:
            structuredPolicies.length === rankedPolicies.length
              ? "Every visible policy is benefiting from persisted structured parser support."
              : `${pluralize(structuredPolicies.length, "policy")} currently have persisted structured parser support, while ${pluralize(
                  Math.max(rankedPolicies.length - structuredPolicies.length, 0),
                  "policy"
                )} still rely on fallback reads.`,
          bullets: [
            `${pluralize(missingFieldPolicies.length, "policy")} still carry missing core fields.`,
            `${pluralize(missingStatementPolicies.length, "policy")} are missing a resolved latest statement date.`,
            deepestReadPolicy
              ? `${deepestReadPolicy.product || "One policy"} is currently the deepest-supported read in the set.`
              : "No policy has a complete evidence stack yet.",
          ],
        },
        {
          title: "Charge And COI Visibility",
          summary:
            weakCoiPolicies.length === 0 && limitedChargePolicies.length === 0
              ? "COI and visible charge support are broadly present across the current portfolio."
              : `${pluralize(weakCoiPolicies.length, "policy")} still show weak COI confidence, and ${pluralize(
                  limitedChargePolicies.length,
                  "policy"
                )} still have limited visible charge support.`,
          bullets: [
            `Total visible COI currently reads as ${formatCurrency(totalCoi)}.`,
            highestCostPolicy
              ? `${highestCostPolicy.product || "Top policy"} is carrying the largest visible COI load at ${displayNullable(
                  highestCostPolicy.total_coi
                )}.`
              : "No policy currently exposes a measurable COI total.",
            weakestConfidencePolicy
              ? `${weakestConfidencePolicy.product || "One policy"} is the weakest current COI-confidence read.`
              : "No policy is currently flagged as weak on COI confidence.",
          ],
        },
        {
          title: "Statement And Strategy Support",
          summary:
            missingStatementPolicies.length === 0 && limitedStrategyPolicies.length === 0
              ? "Statement freshness and strategy visibility are currently well supported."
              : `${pluralize(missingStatementPolicies.length, "policy")} need fresher statement alignment and ${pluralize(
                  limitedStrategyPolicies.length,
                  "policy"
                )} still have partial strategy visibility.`,
          bullets: [
            latestStatementPolicy
              ? `The freshest visible statement is on ${latestStatementPolicy.product || "one policy"} dated ${formatDateValue(
                  latestStatementPolicy.latest_statement_date
                )}.`
              : "No resolved latest statement date is visible yet.",
            `${pluralize(limitedStrategyPolicies.length, "policy")} still need stronger primary-strategy support.`,
            `${pluralize(missingStatementPolicies.length, "policy")} should be refreshed before deeper comparison is trusted.`,
          ],
        },
        {
          title: "Review Pressure",
          summary:
            portfolioBrief.priority_policies.length === 0
              ? "No immediate portfolio-level priority queue is visible from the current continuity reads."
              : `${pluralize(portfolioBrief.priority_policies.length, "policy")} currently sit in the immediate review queue, led by ${
                  topReviewPolicy?.product || "the top flagged policy"
                }.`,
          bullets: [
            `${pluralize(atRiskPolicies.length, "policy")} are currently at-risk on continuity.`,
            `${pluralize(portfolioBrief.metrics.weak_policies, "policy")} are in weak continuity status.`,
            topReviewPolicy
              ? `Current lead review reason: ${topReviewPolicy.review_reason}`
              : "No lead review reason is currently visible.",
          ],
        },
      ],
      scorecard: [
        { label: "Structured Reads", value: `${structuredPolicies.length}/${rankedPolicies.length}` },
        { label: "Latest Statements Resolved", value: `${rankedPolicies.length - missingStatementPolicies.length}/${rankedPolicies.length}` },
        { label: "Strong COI Confidence", value: `${rankedPolicies.length - weakCoiPolicies.length}/${rankedPolicies.length}` },
        { label: "Policies Missing Fields", value: missingFieldPolicies.length },
        { label: "Policies With Limited Charges", value: limitedChargePolicies.length },
        { label: "Policies With Limited Strategy", value: limitedStrategyPolicies.length },
      ],
    };
  }, [
    atRiskPolicies.length,
    highestCostPolicy,
    portfolioBrief.metrics.weak_policies,
    portfolioBrief.priority_policies,
    rankedPolicies,
    totalCoi,
    weakestConfidencePolicy,
  ]);

  const protectionSummary = useMemo(() => {
    if (householdInsuranceSummary) {
      return {
        totalPolicies: householdInsuranceSummary.totalPolicies || 0,
        totalCoverage: householdInsuranceSummary.totalCoverage || 0,
        confidence: householdInsuranceSummary.confidence || 0,
        gapDetected: Boolean(householdInsuranceSummary.gapDetected),
        narrative: householdInsuranceSummary.headline || "Household protection summary is still forming.",
        bullets: householdInsuranceSummary.notes || [],
        status: householdInsuranceSummary.status || "Monitor",
        metrics: householdInsuranceSummary.metrics || {},
      };
    }

    const fallbackConfidence =
      rankedPolicies.length === 0 ? 0 : rankedPolicies.reduce((sum, row) => sum + (row.gapAnalysis?.confidence || 0), 0) / rankedPolicies.length;

    return {
      totalPolicies: rankedPolicies.length,
      totalCoverage,
      confidence: fallbackConfidence,
      gapDetected: gapPolicies.length > 0,
      narrative:
        rankedPolicies.length === 0
          ? "No saved policies are visible yet, so VaultedShield cannot confirm household protection coverage."
          : gapPolicies.length > 0
            ? `The household shows visible protection gaps across ${pluralize(gapPolicies.length, "policy")}, and the current insurance read should be reviewed before treating coverage as complete.`
            : "No obvious household-level protection gap is visible from the currently saved policies, but coverage confidence still depends on document depth and statement quality.",
      bullets: rankedPolicies.length === 0 ? ["No saved policies are currently visible, so protection coverage cannot be confirmed yet."] : [],
      status: gapPolicies.length > 0 ? "Needs Review" : "Monitor",
      metrics: {},
    };
  }, [gapPolicies.length, householdInsuranceSummary, rankedPolicies, totalCoverage]);
  const insurancePortfolioStatus =
    rankedPolicies.length === 0
      ? "Awaiting first upload"
      : rankedPolicies.length === 1
        ? "First policy active"
      : atRiskPolicies.length > 0
        ? "Needs review"
        : "Stable comparison";
  const insuranceAdvisorBrief = useMemo(() => {
    if (rankedPolicies.length === 0) {
      return {
        eyebrow: "Start Here",
        headline: "Upload one baseline life policy to unlock plain-English insurance review.",
        narrative:
          "The insurance workspace becomes most useful after one policy illustration or statement packet is saved. That first upload activates ranking, continuity review, charge visibility, and household protection reads.",
        nextAction: "Upload First Policy",
        route: "/insurance/life/upload",
      };
    }

    if (rankedPolicies.length === 1) {
      const firstPolicy = rankedPolicies[0];
      return {
        eyebrow: "First Policy Loaded",
        headline: "Your first in-force policy is now readable.",
        narrative:
          firstPolicy?.interpretation?.bottom_line_summary ||
          "VaultedShield can now surface baseline policy understanding, charge visibility, continuity support, and policy health. The next gain comes from adding statement history or a second policy for comparison.",
        nextAction: firstPolicy?.policy_id ? getPolicyEntryLabel(firstPolicy) : "Upload Another Policy",
        route: firstPolicy?.policy_id ? getPolicyDetailRoute(firstPolicy) : "/insurance/life/upload",
      };
    }

    const topPriority = portfolioBrief.priority_policies?.[0] || null;
    return {
      eyebrow: "Advisor Brief",
      headline: portfolioBrief.summary,
      narrative:
        topPriority?.review_reason ||
        "The portfolio is strongest where statement freshness, charge visibility, and policy identity are complete, and weakest where evidence is still partial.",
      nextAction: topPriority ? getPolicyEntryLabel(topPriority) : "Upload Another Policy",
      route: topPriority?.policy_id ? getPolicyDetailRoute(topPriority) : "/insurance/life/upload",
    };
  }, [portfolioBrief, rankedPolicies]);
  const portfolioSignalStrip = useMemo(() => {
    if (rankedPolicies.length === 0) {
      return [
        {
          label: "Readiness",
          value: "Awaiting first policy",
          detail: "Upload one illustration or in-force statement to unlock policy intelligence.",
        },
        {
          label: "Comparison",
          value: "Not active yet",
          detail: "A second saved policy unlocks side-by-side strength and charge review.",
        },
      ];
    }

    const resolvedStatements = rankedPolicies.filter((row) => row.latest_statement_date).length;
    const strongChargeSupport = rankedPolicies.filter(
      (row) => row.total_visible_charges !== null && row.total_visible_charges !== undefined && row.coi_confidence !== "weak"
    ).length;

    return [
      {
        label: "Portfolio Readiness",
        value: insurancePortfolioStatus,
        detail:
          rankedPolicies.length === 1
            ? "One policy is readable. More statement history will deepen the annual review."
            : `${resolvedStatements}/${rankedPolicies.length} policies currently show resolved latest-statement support.`,
      },
      {
        label: "Charge Support",
        value: `${strongChargeSupport}/${rankedPolicies.length} stronger reads`,
        detail:
          strongChargeSupport === rankedPolicies.length
            ? "Charge and COI visibility are broadly usable across the current set."
            : "Some policies still need clearer COI or visible-charge support before deeper conclusions.",
      },
      {
        label: "Comparison Readiness",
        value: rankedPolicies.length > 1 ? "Active" : "Waiting for second policy",
        detail:
          rankedPolicies.length > 1
            ? "Side-by-side policy health and charge drag review is available now."
            : "Add another saved policy to unlock a stronger portfolio comparison story.",
      },
    ];
  }, [insurancePortfolioStatus, rankedPolicies]);

  const rankingHighlights = useMemo(() => {
    return rankedPolicies.map((policy) => {
      const penalties = Array.isArray(policy.ranking.penalties) ? policy.ranking.penalties : [];
      const keySignals = [
        policy.latest_statement_date ? `Latest statement ${formatDateValue(policy.latest_statement_date)}` : "Latest statement not resolved",
        policy.coi_confidence ? `COI confidence ${policy.coi_confidence}` : "COI confidence unresolved",
        policy.charge_visibility_status ? `Charge visibility ${policy.charge_visibility_status}` : "Charge visibility unresolved",
        policy.strategy_visibility ? `Strategy visibility ${policy.strategy_visibility}` : "Strategy visibility unresolved",
      ];

      return {
        policyId: policy.policy_id,
        reviewReason:
          policy.ranking.statusExplanation ||
          policy.interpretation.bottom_line_summary ||
          "Visible support is still incomplete.",
        penalties: penalties.slice(0, 4),
        signals: keySignals,
      };
    });
  }, [rankedPolicies]);
  const iulShowcasePolicy = useMemo(
    () => rankedPolicies.find((policy) => isIulShowcasePolicy(policy)) || null,
    [rankedPolicies]
  );
  const insurancePageFascia = useMemo(
    () =>
      buildInsurancePageFascia({
        householdSummary: householdInsuranceSummary,
        summaryLoading,
        summaryError,
        policies: rankedPolicies,
        protectionSummary,
        portfolioSignals,
        hasAuthenticatedHousehold: Boolean(debug.authUserId),
        continuity: {
          gapPolicies: gapPolicies.length,
          atRiskPolicies: atRiskPolicies.length,
          strongPolicies: strongContinuityPolicies.length,
          policiesWithIssues,
        },
        priorityPolicy: portfolioBrief.priority_policies?.[0] || rankedPolicies[0] || null,
      }),
    [
      atRiskPolicies.length,
      debug.authUserId,
      gapPolicies.length,
      householdInsuranceSummary,
      policiesWithIssues,
      portfolioBrief.priority_policies,
      portfolioSignals,
      protectionSummary,
      rankedPolicies,
      strongContinuityPolicies.length,
      summaryError,
      summaryLoading,
    ]
  );
  const plainEnglishGuide = useMemo(() => {
    const topPriority = portfolioBrief.priority_policies?.[0] || rankedPolicies[0] || null;
    const trustBuilder =
      rankedPolicies.length === 0
        ? "Upload the first life policy so VaultedShield has real insurance evidence to read."
        : summaryLoading
          ? "VaultedShield is refreshing the household insurance summary to strengthen the read."
          : summaryError
            ? "The household summary is unavailable right now, so this read is leaning more heavily on the policy records already loaded."
            : policiesWithIssues > 0
              ? `${pluralize(policiesWithIssues, "policy")} still have missing fields, weak charge visibility, or stale statement support, which limits confidence.`
              : "The current read is fairly trustworthy because the visible policies have good statement and charge support.";

    const plainSummary =
      rankedPolicies.length === 0
        ? "No insurance story is visible yet because there are no readable policy records on the page."
        : insurancePageFascia.meaning;

    const everydayVerdict =
      rankedPolicies.length === 0
        ? "Nothing to judge yet"
        : insurancePageFascia.status === "Strong"
          ? "The visible insurance picture looks solid"
          : insurancePageFascia.status === "Stable"
            ? "The visible insurance picture looks mostly okay"
            : insurancePageFascia.status === "Partial"
              ? "There is enough to start reading, but not enough to fully trust the picture"
              : insurancePageFascia.status === "At Risk"
                ? "Something in this insurance set needs attention soon"
                : "The insurance picture is still developing";

    const nextMove =
      rankedPolicies.length === 0
        ? "Start with one upload"
        : topPriority?.product
          ? `Start with ${topPriority.product}`
          : insurancePageFascia.primaryAction?.label || "Take the next recommended step";

    return {
      eyebrow: "Headline Verdict",
      title:
        rankedPolicies.length === 0
          ? "Understand how policies will appear here once the first one is loaded"
          : "Understand how policies are performing and what needs review",
      summary: plainSummary,
      transition:
        rankedPolicies.length === 0
          ? "Once the first policy is loaded, this page moves from setup guidance into a real insurance read with verdicts, next actions, and deeper proof."
          : "This top layer is the calm summary. The deeper sections below are there only when you want proof, evidence depth, charge support, and ranking logic.",
      cards: [
        {
          label: "Current Status",
          value: everydayVerdict,
          detail: plainSummary,
        },
        {
          label: "What To Review First",
          value: nextMove,
          detail:
            topPriority?.review_reason ||
            insurancePageFascia.explanation?.recommendedAction?.detail ||
            "Use the next recommended move before diving deep into the analytics.",
        },
        {
          label: "What Changed",
          value:
            rankedPolicies.length === 0
              ? "No policy read yet"
              : summaryLoading
                ? "Household summary is refreshing"
                : policiesWithIssues > 0
                  ? `${pluralize(policiesWithIssues, "policy")} need stronger evidence`
                  : rankedPolicies.length > 1
                    ? "Multiple policies are now comparable"
                    : "The first policy read is now visible",
          detail: trustBuilder,
        },
      ],
      quickFacts: [
        rankedPolicies.length === 0
          ? "No saved life policies are loaded yet."
          : `${pluralize(rankedPolicies.length, "policy")} are loaded into the current insurance workspace.`,
        protectionSummary.gapDetected
          ? "A protection gap may be present, so coverage should not be treated as complete yet."
          : rankedPolicies.length === 0
            ? "Coverage cannot be judged until the first readable policy is uploaded."
            : "No obvious household-level protection gap is visible from the current records.",
        rankedPolicies.length <= 1
          ? "The next big improvement comes from stronger statement history or a second policy for comparison."
          : "Multiple policies are now available, so the page can move into actual comparison and ranking.",
        rankedPolicies.length === 0
          ? "The first visible win is simply getting one readable policy into the workspace."
          : topPriority?.review_reason || "Start with the top-ranked review item before exploring the rest of the portfolio.",
      ],
    };
  }, [
    insurancePageFascia,
    policiesWithIssues,
    portfolioBrief.priority_policies,
    protectionSummary,
    rankedPolicies,
    summaryError,
    summaryLoading,
  ]);
  const insuranceFasciaCards = useMemo(() => {
    const topPriority = portfolioBrief.priority_policies?.[0] || rankedPolicies[0] || null;
    const topPolicyRoute = topPriority?.policy_id ? getPolicyDetailRoute(topPriority) : "/insurance/life/upload";
    const statusTone =
      insurancePageFascia.status === "Strong" || insurancePageFascia.status === "Stable"
        ? "good"
        : insurancePageFascia.status === "At Risk"
          ? "alert"
          : insurancePageFascia.status === "Partial"
            ? "warning"
            : "info";

    return [
      {
        label: "Insurance Status",
        value: plainEnglishGuide.cards[0]?.value || insurancePageFascia.status || "Developing",
        detail: plainEnglishGuide.cards[0]?.detail || plainEnglishGuide.summary,
        tone: statusTone,
      },
      {
        label: "Needs Attention",
        value: policiesWithIssues > 0 ? `${pluralize(policiesWithIssues, "policy")} need review` : "No obvious issue",
        detail:
          policiesWithIssues > 0
            ? "Some policies still need stronger statement, charge, or field support before the read should be treated as complete."
            : "The visible insurance set is not showing an obvious first-order issue.",
        tone: policiesWithIssues > 0 ? "warning" : "good",
        actionLabel: policiesWithIssues > 0 ? "Open Review Workspace" : "See Portfolio",
        onAction: () => onNavigate?.(policiesWithIssues > 0 ? insuranceReviewWorkspaceRoute : "/insurance"),
      },
      {
        label: "Missing Information",
        value: missingStatementPolicies.length > 0 ? `${pluralize(missingStatementPolicies.length, "policy")} need statements` : "Evidence looks current",
        detail:
          missingStatementPolicies.length > 0
            ? "Fresh statements will make this insurance read more reliable and easier to defend."
            : "The current evidence is enough to support a stronger first read.",
        tone: missingStatementPolicies.length > 0 ? "warning" : "good",
        actionLabel: missingStatementPolicies.length > 0 ? "Upload Statement" : undefined,
        onAction: missingStatementPolicies.length > 0 ? () => onNavigate?.("/insurance/life/upload") : undefined,
      },
      {
        label: "Best Next Step",
        value: topPriority?.product ? `Review ${topPriority.product}` : "Upload one readable policy",
        detail:
          topPriority?.review_reason ||
          "Start with a readable policy or statement so the engine can build a grounded review.",
        tone: "info",
        actionLabel: topPriority?.policy_id ? "Open Policy" : "Upload Policy",
        onAction: () => onNavigate?.(topPolicyRoute),
      },
    ];
  }, [
    insurancePageFascia.status,
    insuranceReviewWorkspaceRoute,
    missingStatementPolicies.length,
    onNavigate,
    plainEnglishGuide.cards,
    plainEnglishGuide.summary,
    policiesWithIssues,
    portfolioBrief.priority_policies,
    rankedPolicies,
  ]);
  const insuranceActionTiles = useMemo(
    () => [
      {
        key: "insurance-status",
        kicker: "Portfolio Status",
        title: insuranceFasciaCards[0]?.value || insurancePageFascia.status || "Developing",
        detail: insuranceFasciaCards[0]?.detail || plainEnglishGuide.summary,
        metric: `${rankedPolicies.length} polic${rankedPolicies.length === 1 ? "y" : "ies"}`,
        tone: insuranceFasciaCards[0]?.tone || "info",
        statusLabel: "Simple Read",
      },
      {
        key: "insurance-attention",
        kicker: "Review Queue",
        title: insuranceFasciaCards[1]?.value || "No obvious issue",
        detail: insuranceFasciaCards[1]?.detail || "Open the guided insurance review path first.",
        metric: `${policiesWithIssues} flagged polic${policiesWithIssues === 1 ? "y" : "ies"}`,
        tone: insuranceFasciaCards[1]?.tone || "warning",
        statusLabel: policiesWithIssues > 0 ? "Needs Review" : "Calm Right Now",
        actionLabel: insuranceFasciaCards[1]?.actionLabel,
        onAction: insuranceFasciaCards[1]?.onAction,
      },
      {
        key: "insurance-missing",
        kicker: "Evidence Support",
        title: insuranceFasciaCards[2]?.value || "Evidence looks current",
        detail: insuranceFasciaCards[2]?.detail || "Fresh statements strengthen the read.",
        metric: `${missingStatementPolicies.length} statement gap${missingStatementPolicies.length === 1 ? "" : "s"}`,
        tone: insuranceFasciaCards[2]?.tone || "good",
        statusLabel: missingStatementPolicies.length > 0 ? "Missing Information" : "Well Supported",
        actionLabel: insuranceFasciaCards[2]?.actionLabel,
        onAction: insuranceFasciaCards[2]?.onAction,
      },
      {
        key: "insurance-next-step",
        kicker: "Best Next Step",
        title: insuranceFasciaCards[3]?.value || "Upload one readable policy",
        detail: insuranceFasciaCards[3]?.detail || "Start with the clearest next insurance move.",
        metric: topPriorityPolicy?.ranking?.status || "Next move ready",
        tone: insuranceFasciaCards[3]?.tone || "info",
        statusLabel: "Guided Action",
        actionLabel: insuranceFasciaCards[3]?.actionLabel,
        onAction: insuranceFasciaCards[3]?.onAction,
      },
    ],
    [
      insuranceFasciaCards,
      insurancePageFascia.status,
      missingStatementPolicies.length,
      plainEnglishGuide.summary,
      policiesWithIssues,
      rankedPolicies.length,
      topPriorityPolicy?.ranking?.status,
    ]
  );
  const resolvedStatementCount = rankedPolicies.filter((row) => row.latest_statement_date).length;
  const strongChargeSupportCount = rankedPolicies.filter(
    (row) => row.total_visible_charges !== null && row.total_visible_charges !== undefined && row.coi_confidence !== "weak"
  ).length;
  const portfolioReadinessScore = normalizeScore(
    insuranceStatusScore(
      insurancePageFascia.status,
      rankedPolicies.length === 0 ? 32 : rankedPolicies.length === 1 ? 61 : 70
    ),
    52
  );
  const protectionConfidenceScore = normalizeScore(Math.round((protectionSummary.confidence || 0) * 100), gapPolicies.length > 0 ? 42 : 64);
  const statementSupportScore = rankedPolicies.length > 0 ? normalizeScore((resolvedStatementCount / rankedPolicies.length) * 100, 0) : 0;
  const chargeSupportScore = rankedPolicies.length > 0 ? normalizeScore((strongChargeSupportCount / rankedPolicies.length) * 100, 0) : 0;
  const comparisonReadinessScore = rankedPolicies.length <= 1 ? (rankedPolicies.length === 1 ? 52 : 20) : normalizeScore(70 + Math.min(20, (rankedPolicies.length - 2) * 8));
  const iulReadinessScore = iulShowcasePolicy ? normalizeScore(84 + Math.min(10, iulShowcasePolicy.ranking?.score ? Math.round((iulShowcasePolicy.ranking.score - 60) / 4) : 0), 86) : 44;
  const insuranceRingCards = useMemo(
    () => [
      {
        key: "portfolio",
        label: "Portfolio",
        score: portfolioReadinessScore,
        status: insurancePortfolioStatus,
        helper: rankedPolicies.length === 0 ? "Waiting for the first readable policy." : `${pluralize(rankedPolicies.length, "policy")} in the current insurance set.`,
        tone: insuranceToneFromScore(portfolioReadinessScore),
        iconLabel: "PF",
      },
      {
        key: "protection",
        label: "Protection",
        score: protectionConfidenceScore,
        status: protectionSummary.gapDetected ? "Needs Review" : protectionConfidenceScore >= 70 ? "Good" : "Partial",
        helper: protectionSummary.gapDetected ? "Coverage may be incomplete." : "Household coverage view from visible records.",
        tone: protectionSummary.gapDetected ? "alert" : insuranceToneFromScore(protectionConfidenceScore),
        iconLabel: "PR",
      },
      {
        key: "statements",
        label: "Statements",
        score: statementSupportScore,
        status: resolvedStatementCount === rankedPolicies.length && rankedPolicies.length > 0 ? "Current" : missingStatementPolicies.length > 0 ? "Missing Items" : "Building",
        helper: rankedPolicies.length === 0 ? "No statements resolved yet." : `${resolvedStatementCount}/${rankedPolicies.length} policies have a visible latest statement.`,
        tone: missingStatementPolicies.length > 0 ? "warning" : insuranceToneFromScore(statementSupportScore),
        iconLabel: "ST",
      },
      {
        key: "charges",
        label: "Charges",
        score: chargeSupportScore,
        status: weakestConfidencePolicy ? "Needs Review" : strongChargeSupportCount === rankedPolicies.length && rankedPolicies.length > 0 ? "Strong" : "Building",
        helper: rankedPolicies.length === 0 ? "No charge visibility yet." : `${strongChargeSupportCount}/${rankedPolicies.length} policies show stronger charge support.`,
        tone: weakestConfidencePolicy ? "warning" : insuranceToneFromScore(chargeSupportScore),
        iconLabel: "CH",
      },
      {
        key: "comparison",
        label: "Comparison",
        score: comparisonReadinessScore,
        status: rankedPolicies.length > 1 ? "Active" : rankedPolicies.length === 1 ? "Building" : "Waiting",
        helper: rankedPolicies.length > 1 ? "Side-by-side policy review is live." : "A second policy unlocks a stronger comparison story.",
        tone: rankedPolicies.length > 1 ? "good" : rankedPolicies.length === 1 ? "warning" : "info",
        iconLabel: "CP",
      },
      {
        key: "iul",
        label: "IUL Review",
        score: iulReadinessScore,
        status: iulShowcasePolicy ? "Available" : "Building",
        helper: iulShowcasePolicy ? "A flagship policy workspace is ready to open." : "The IUL review console appears when a supported policy is loaded.",
        tone: iulShowcasePolicy ? "good" : "info",
        iconLabel: "IU",
      },
    ],
    [
      chargeSupportScore,
      comparisonReadinessScore,
      insurancePortfolioStatus,
      iulReadinessScore,
      iulShowcasePolicy,
      missingStatementPolicies.length,
      portfolioReadinessScore,
      protectionConfidenceScore,
      protectionSummary.gapDetected,
      rankedPolicies.length,
      resolvedStatementCount,
      statementSupportScore,
      strongChargeSupportCount,
      weakestConfidencePolicy,
    ]
  );
  const insurancePriorityRows = useMemo(() => {
    if (portfolioBrief.priority_policies?.length > 0) {
      return portfolioBrief.priority_policies.slice(0, 4).map((policy, index) => ({
        id: policy.policy_id || `${policy.product}-${index}`,
        badge: index + 1,
        title: policy.product || policy.carrier || `Policy ${index + 1}`,
        detail: policy.review_reason || policy.interpretation?.bottom_line_summary || "This policy is worth a closer look first.",
        meta: policy.policy_id ? "Open full policy review" : "Policy detail still forming",
        actionLabel: policy.policy_id ? getPolicyEntryLabel(policy) : "Review Now",
        route: policy.policy_id ? getPolicyDetailRoute(policy) : "/insurance/life/upload",
      }));
    }

    return [
      {
        id: "upload-first-policy",
        badge: 1,
        title: "Upload the first readable policy",
        detail: "This unlocks real policy review, charge visibility, and statement-backed insurance interpretation.",
        meta: "Start the insurance engine",
        actionLabel: "Upload Policy",
        route: "/insurance/life/upload",
      },
    ];
  }, [portfolioBrief.priority_policies]);
  const insuranceReadRows = useMemo(
    () => [
      {
        id: "status",
        title: "What this means",
        detail: plainEnglishGuide.cards[0]?.detail || plainEnglishGuide.summary,
        accent: plainEnglishGuide.cards[0]?.value || insurancePageFascia.status || "Developing",
      },
      {
        id: "review-first",
        title: "What to review first",
        detail: plainEnglishGuide.cards[1]?.detail || "Start with the first recommended policy instead of scanning everything.",
        accent: plainEnglishGuide.cards[1]?.value || "Best next step",
      },
      {
        id: "changed",
        title: "What changed in this read",
        detail: plainEnglishGuide.cards[2]?.detail || "This read strengthens as statement, charge, and policy support improve.",
        accent: plainEnglishGuide.cards[2]?.value || "Still forming",
      },
    ],
    [insurancePageFascia.status, plainEnglishGuide.cards, plainEnglishGuide.summary]
  );
  const transitionGuide = useMemo(() => {
    const topPriority = portfolioBrief.priority_policies?.[0] || rankedPolicies[0] || null;
    const confidencePercent = Math.round((protectionSummary.confidence || 0) * 100);

    return {
      steps: [
        {
          label: "Step 1",
          title: "Read the simple answer first",
          detail:
            rankedPolicies.length === 0
              ? "Start by understanding whether there is enough policy data to read at all."
              : "Use the plain-English verdict above as the fast answer to whether this insurance picture looks solid, partial, or risky.",
        },
        {
          label: "Step 2",
          title: "Check the first action, not every signal",
          detail:
            topPriority?.review_reason ||
            "The best next move matters more than reading every metric at once. Treat the page like guided triage, not homework.",
        },
        {
          label: "Step 3",
          title: "Open the analyst proof only when you want the why",
          detail:
            rankedPolicies.length === 0
              ? "The technical layer becomes useful after the first readable policy is loaded."
              : "The deeper layer explains confidence, weak evidence, charge support, and ranking penalties so you can verify the simple answer.",
        },
      ],
      keys: [
        {
          label: "Confidence",
          simple: rankedPolicies.length === 0 ? "How much the page can trust its own read" : `${confidencePercent}% trust in today's read`,
          detail:
            rankedPolicies.length === 0
              ? "No policy evidence means the page has nothing solid to judge yet."
              : "Confidence means how trustworthy the current read is based on visible statements, charge detail, and completeness. It is not the same thing as policy quality.",
        },
        {
          label: "Charge Visibility",
          simple: weakestConfidencePolicy ? "How clearly the page can see policy drag" : "Whether policy costs are clearly visible",
          detail:
            weakestConfidencePolicy
              ? `${weakestConfidencePolicy.product || "At least one policy"} still has weak charge support, which makes deeper judgment less trustworthy.`
              : "When charge visibility is strong, the page can better judge whether a policy is healthy or quietly under pressure.",
        },
        {
          label: "Statement Freshness",
          simple: missingStatementPolicies.length > 0 ? "Whether the proof is current" : "Whether the evidence looks current",
          detail:
            missingStatementPolicies.length > 0
              ? `${pluralize(missingStatementPolicies.length, "policy")} still need fresher statement support, so the read may lag reality.`
              : "Fresh statements make the portfolio read more believable because they anchor the analysis to current evidence.",
        },
        {
          label: "Ranking",
          simple: "Why one policy deserves attention before another",
          detail:
            rankedPolicies.length === 0
              ? "Rankings appear once there are actual policy records to compare."
              : "The ranking is not a grade for the whole household. It is a prioritization tool that helps surface which policy should be reviewed first.",
        },
      ],
    };
  }, [
    missingStatementPolicies.length,
    portfolioBrief.priority_policies,
    protectionSummary.confidence,
    rankedPolicies,
    weakestConfidencePolicy,
  ]);
  const sectionPadding = isMobile ? "20px 16px" : isTablet ? "22px 20px" : "26px 28px";
  const sectionRadius = isMobile ? "20px" : "24px";
  const briefColumns = isTablet ? "1fr" : "1.15fr 0.85fr";
  const rankingActionDirection = isMobile ? "column" : "row";
  const comparisonTableColumns = [
    { label: "Carrier", value: (policy) => displayNullable(policy.carrier) },
    { label: "Cash Value", value: (policy) => displayNullable(policy.cash_value) },
    { label: "Cash Surrender Value", value: (policy) => displayNullable(policy.surrender_value) },
    { label: "Total COI", value: (policy) => displayNullable(policy.total_coi) },
    { label: "Total Visible Charges", value: (policy) => displayNullable(policy.total_visible_charges) },
    { label: "COI Confidence", value: (policy) => displayNullable(policy.coi_confidence) },
    { label: "Latest Statement Date", value: (policy) => displayNullable(formatDateValue(policy.latest_statement_date)) },
    { label: "Primary Strategy", value: (policy) => displayNullable(policy.primary_strategy) },
    { label: "Status", value: (policy) => `${policy.interpretation.label} (${policy.ranking.score}/100)` },
  ];

  function handlePrintPortfolioReport() {
    setShowPortfolioReport(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.print(), 80);
    }
  }

  function handleFasciaAction(action) {
    if (!action) return;

    if (action.kind === "toggle_explanation") {
      setShowFasciaExplanation((current) => !current);
      return;
    }

    if (action.kind === "scroll_protection_signals") {
      protectionSignalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action.kind === "scroll_policy_comparison") {
      comparisonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action.kind === "navigate" && action.route) {
      onNavigate?.(action.route);
    }
  }

  if (rankedPolicies.length === 0 && !loadingStates.insurancePortfolio && !loadError) {
    return (
      <div style={{ display: "grid", gap: "24px" }}>
        <section
          style={{
            display: "grid",
            gap: "18px",
            padding: isMobile ? "22px 16px" : "28px 30px",
            borderRadius: sectionRadius,
            background: "#ffffff",
            border: "1px solid rgba(15, 23, 42, 0.08)",
          }}
        >
          <div style={{ display: "grid", gap: "10px", maxWidth: "860px" }}>
            <div style={{ fontSize: "12px", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
              Insurance Onboarding
            </div>
            <div style={{ fontSize: isMobile ? "28px" : "34px", fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a" }}>
              Insurance Review
            </div>
            <div style={{ fontSize: isMobile ? "18px" : "22px", fontWeight: 700, color: "#0f172a" }}>
              Start with your first life policy upload
            </div>
            <div style={{ color: "#475569", lineHeight: "1.8" }}>
              Uploading a life policy lets VaultedShield extract baseline policy details, compare annual statements, and build real insurance intelligence over time. Nothing is scored here until actual policy data exists.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            {[
              "IUL",
              "Universal life",
              "Whole life",
              "Term",
              "Final expense",
            ].map((item) => (
              <div
                key={item}
                style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "#f8fafc",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  color: "#0f172a",
                  fontWeight: 700,
                }}
              >
                {item}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isTablet ? "1fr" : "1.05fr 0.95fr",
              gap: "18px",
            }}
          >
            <div
              style={{
                padding: sectionPadding,
                borderRadius: sectionRadius,
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Best first insurance packet</div>
              <div style={{ color: "#475569", lineHeight: "1.8" }}>
                The strongest first demo file is usually one policy with a baseline illustration and a recent in-force statement.
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                <li style={{ lineHeight: "1.7" }}>Original illustration or policy packet</li>
                <li style={{ lineHeight: "1.7" }}>Most recent annual statement</li>
                <li style={{ lineHeight: "1.7" }}>One prior annual statement if available</li>
              </ul>
            </div>

            <div
              style={{
                padding: sectionPadding,
                borderRadius: sectionRadius,
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>What the first policy unlocks</div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                <li style={{ lineHeight: "1.7" }}>Carrier and policy-type normalization</li>
                <li style={{ lineHeight: "1.7" }}>Policy health, charge drag, and plain-English interpretation</li>
                <li style={{ lineHeight: "1.7" }}>A path into the IUL Review Console when the file supports it</li>
              </ul>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onNavigate?.("/insurance/life/upload")}
              style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }}
            >
              Open Life Policy Upload
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.("/guidance")}
              style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
            >
              Open Guidance
            </button>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr",
            gap: "18px",
          }}
        >
          <div
            style={{
              padding: sectionPadding,
              borderRadius: sectionRadius,
              background: "#ffffff",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Insurance intelligence activates with the first policy</div>
            <div style={{ color: "#475569", lineHeight: "1.8" }}>
              Add your first policy illustration, declaration, or annual statement to begin comparison and continuity analysis. VaultedShield will start generating policy-level insights after real records are saved.
            </div>
          </div>

          <div
            style={{
              padding: sectionPadding,
              borderRadius: sectionRadius,
              background: "#ffffff",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>What the first upload unlocks</div>
            <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#475569" }}>
              <li style={{ lineHeight: "1.7" }}>Baseline policy details and carrier visibility</li>
              <li style={{ lineHeight: "1.7" }}>Statement freshness and charge-read support</li>
              <li style={{ lineHeight: "1.7" }}>Portfolio comparison once multiple policies exist</li>
            </ul>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "24px",
        background: "#f6f8fb",
        padding: isMobile ? "4px 0 28px" : "8px 0 34px",
      }}
    >
      <section
        style={surfaceCardStyle({
          padding: isMobile ? "24px 20px" : isTablet ? "28px 24px" : "34px 30px",
          display: "grid",
          gap: "24px",
        })}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "minmax(0, 1fr) 190px" : "minmax(280px, 1.05fr) 220px minmax(280px, 0.95fr)",
            gap: "24px",
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div
              style={{
                width: "fit-content",
                padding: "7px 12px",
                borderRadius: "999px",
                background: "rgba(219, 234, 254, 0.9)",
                color: "#1d4ed8",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Insurance Intelligence
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>Policy And Portfolio Status</div>
            <div style={{ fontSize: isMobile ? "28px" : "32px", fontWeight: 800, lineHeight: "1.05", letterSpacing: "-0.04em", color: "#0f172a" }}>
              {plainEnglishGuide.cards[0]?.value || insuranceAdvisorBrief.headline}
            </div>
            <div style={{ color: "#334155", lineHeight: "1.8", maxWidth: "42rem" }}>{plainEnglishGuide.summary}</div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {insurancePageFascia.primaryAction ? (
                <button type="button" onClick={() => handleFasciaAction(insurancePageFascia.primaryAction)} style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }}>
                  {insurancePageFascia.primaryAction.label}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
              >
                Open Supporting Details
              </button>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <ScoreRing value={portfolioReadinessScore} size="lg" tone={insuranceToneFromScore(portfolioReadinessScore)} subtitle="of 100" iconLabel="IN" />
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: "1.05", letterSpacing: "-0.04em", color: insurancePageFascia.status === "At Risk" ? "#b91c1c" : "#16a34a" }}>
                {insurancePageFascia.status === "At Risk" ? "Needs attention" : rankedPolicies.length > 1 ? "Good progress!" : "Good start"}
              </div>
              <div style={{ color: "#475569", lineHeight: "1.75" }}>{plainEnglishGuide.cards[2]?.detail || insuranceAdvisorBrief.narrative}</div>
            </div>
            <div
              style={{
                padding: "18px 18px 16px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(226, 232, 240, 0.92)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
                At A Glance
              </div>
              {[
                { label: "Policies loaded", value: pluralize(rankedPolicies.length, "policy") },
                { label: "First review target", value: insurancePriorityRows[0]?.title || "Upload a policy" },
                { label: "Statement support", value: `${resolvedStatementCount}/${rankedPolicies.length || 0} current` },
                { label: "Charge support", value: `${strongChargeSupportCount}/${rankedPolicies.length || 0} clearer reads` },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                  <div style={{ color: "#64748b", fontSize: "14px" }}>{item.label}</div>
                  <div style={{ color: "#0f172a", fontWeight: 800, textAlign: "right" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(6, minmax(0, 1fr))",
          gap: isMobile ? "16px" : "20px",
        }}
      >
        {insuranceRingCards.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              if (item.key === "protection") {
                protectionSignalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
              }
              if (item.key === "comparison") {
                comparisonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
              }
              if (item.key === "iul" && iulShowcasePolicy?.policy_id) {
                onNavigate?.(getPolicyDetailRoute(iulShowcasePolicy));
                return;
              }
              technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            style={{
              ...surfaceCardStyle({
                padding: "22px 18px 20px",
                display: "grid",
                gap: "12px",
                textAlign: "center",
                minHeight: "196px",
                alignContent: "start",
                cursor: "pointer",
              }),
            }}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ScoreRing value={item.score} size="md" tone={item.tone} subtitle="%" iconLabel={item.iconLabel} />
            </div>
            <div style={{ display: "grid", gap: "5px", justifyItems: "center" }}>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{item.label}</div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: insuranceTonePalette(item.tone).soft,
                  color: insuranceTonePalette(item.tone).text,
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              >
                {item.status}
              </div>
              <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: "1.45" }}>{item.helper}</div>
            </div>
          </button>
        ))}
      </section>

      <section style={{ display: "grid", gap: "10px" }}>
        <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
          Choose Your Lane
        </div>
        <div style={{ color: "#475569", lineHeight: "1.75", maxWidth: "56rem" }}>
          Start with the simple path that matches what you need right now, then let the deeper charge, confidence, and comparison layers open only when you ask for them.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
            gap: "14px",
          }}
        >
          {insuranceActionTiles.map((tile) => (
            <FriendlyActionTile
              key={tile.key}
              kicker={tile.kicker}
              title={tile.title}
              detail={tile.detail}
              metric={tile.metric}
              tone={tile.tone}
              statusLabel={tile.statusLabel}
              actionLabel={tile.actionLabel}
              onAction={tile.onAction}
            />
          ))}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.08fr) minmax(320px, 0.92fr)",
          gap: "24px",
          alignItems: "stretch",
        }}
      >
        <div
          style={surfaceCardStyle({
            padding: isMobile ? "22px 20px" : "24px 24px 26px",
            display: "grid",
            gap: "18px",
            height: "100%",
          })}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Top Priorities</div>
            <div style={{ color: "#334155", lineHeight: "1.75" }}>
              Start with the one or two policies that matter most instead of trying to digest the whole portfolio.
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {insurancePriorityRows.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0, 1fr) auto",
                  gap: "14px",
                  alignItems: "center",
                  padding: "16px",
                  borderRadius: "20px",
                  background: "#f8fafc",
                  border: "1px solid rgba(226, 232, 240, 0.94)",
                }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "16px",
                    background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                    color: "#1d4ed8",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "14px",
                    fontWeight: 800,
                  }}
                >
                  {item.badge}
                </div>
                <div style={{ minWidth: 0, display: "grid", gap: "4px" }}>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", lineHeight: "1.4" }}>{item.title}</div>
                  <div style={{ color: "#64748b", lineHeight: "1.65", fontSize: "14px" }}>{item.detail}</div>
                  <div style={{ color: "#2563eb", fontWeight: 700, fontSize: "13px" }}>{item.meta}</div>
                </div>
                <button type="button" onClick={() => onNavigate?.(item.route)} style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}>
                  {item.actionLabel}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div
          style={surfaceCardStyle({
            padding: isMobile ? "22px 20px" : "24px 24px 26px",
            display: "grid",
            gap: "18px",
            height: "100%",
          })}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>What This Read Is Saying</div>
            <div style={{ color: "#334155", lineHeight: "1.75" }}>
              This is the plain-English bridge between the simple verdict and the technical evidence underneath.
            </div>
          </div>
          <div style={{ display: "grid", gap: "12px" }}>
            {insuranceReadRows.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: "16px 18px",
                  borderRadius: "18px",
                  background: "#f8fafc",
                  border: "1px solid rgba(226, 232, 240, 0.94)",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                  {item.title}
                </div>
                <div style={{ color: "#0f172a", fontWeight: 800, lineHeight: "1.5" }}>{item.accent}</div>
                <div style={{ color: "#475569", lineHeight: "1.72" }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1fr) minmax(320px, 0.9fr)",
          gap: "24px",
          alignItems: "stretch",
        }}
      >
        <div
          style={surfaceCardStyle({
            padding: isMobile ? "22px 20px" : "24px 24px 26px",
            display: "grid",
            gap: "18px",
            height: "100%",
          })}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Simple Definitions</div>
            <div style={{ color: "#334155", lineHeight: "1.75" }}>
              These are the terms most likely to feel technical. Open one only when you want a longer explanation.
            </div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {transitionGuide.keys.map((item) => (
              <details
                key={item.label}
                style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "#f8fafc",
                  border: "1px solid rgba(226, 232, 240, 0.92)",
                }}
              >
                <summary style={{ cursor: "pointer", listStyle: "none" }}>
                  <div style={{ display: "grid", gap: "4px" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                      {item.label}
                    </div>
                    <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.55" }}>{item.simple}</div>
                  </div>
                </summary>
                <div style={{ marginTop: "10px", color: "#475569", lineHeight: "1.75" }}>{item.detail}</div>
              </details>
            ))}
          </div>
        </div>

        <div
          style={surfaceCardStyle({
            padding: isMobile ? "22px 20px" : "24px 24px 26px",
            display: "grid",
            gap: "16px",
            height: "100%",
            background: "linear-gradient(135deg, #eef4ff 0%, #ffffff 65%, #f8fbff 100%)",
          })}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
              How To Use This Page
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", lineHeight: "1.2" }}>
              Let the simple answer lead, then open the proof
            </div>
            <div style={{ color: "#475569", lineHeight: "1.75" }}>
              The deeper layer is here to support the verdict, not replace it. Use it when you want comparisons, evidence, pressure points, and policy order.
            </div>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {transitionGuide.steps.map((step) => (
              <div
                key={step.label}
                style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "#ffffff",
                  border: "1px solid rgba(226, 232, 240, 0.92)",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div style={{ fontSize: "11px", color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>{step.label}</div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", lineHeight: "1.35" }}>{step.title}</div>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>{step.detail}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setShowPortfolioReport((current) => !current)}
              style={{ ...reportButtonStyle(showPortfolioReport, false), width: isMobile ? "100%" : "auto" }}
            >
              {showPortfolioReport ? "Hide Portfolio Report" : "Open Portfolio Report"}
            </button>
            <button
              type="button"
              onClick={() => setShowFasciaExplanation((current) => !current)}
              style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
            >
              {showFasciaExplanation ? "Hide Explanation" : "Why This Read"}
            </button>
          </div>
        </div>
      </section>

      <InsightExplanationPanel
        isOpen={showFasciaExplanation}
        explanation={insurancePageFascia?.explanation}
        onToggle={() => setShowFasciaExplanation(false)}
        onAction={handleFasciaAction}
        isMobile={isMobile}
      />

      <section
        ref={technicalAnalysisRef}
        style={surfaceCardStyle({
          padding: isMobile ? "22px 20px" : "24px 26px",
          display: "grid",
          gap: "10px",
          background: "linear-gradient(135deg, #f8fbff 0%, #ffffff 45%, #eef6ff 100%)",
        })}
      >
        <div style={{ fontSize: "12px", color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
          Supporting Details Start Here
        </div>
        <div style={{ fontSize: isMobile ? "22px" : "26px", fontWeight: 800, lineHeight: "1.2", letterSpacing: "-0.03em", color: "#0f172a" }}>
          Deeper insurance detail: evidence, pressure points, and policy order
        </div>
        <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "60rem" }}>
          Everything below this point is the supporting layer. Use it to verify the verdict, inspect thin evidence, and understand why certain policies should be reviewed before others.
        </div>
      </section>

      <PortfolioSignalsSummaryCard portfolioSignals={portfolioSignals} policies={rankedPolicies} />

      <PortfolioActionFeedCard actions={portfolioActionFeed} onNavigate={onNavigate} />

      <PortfolioAIChatBox
        key={rankedPolicies.map((policy) => policy.policy_id || policy.id || policy.product || "").join("|")}
        policies={rankedPolicies}
        portfolioSignals={portfolioSignals}
      />

      {showPortfolioReport ? (
        <PortfolioReportView report={portfolioReport} onPrint={handlePrintPortfolioReport} isCompact={isTablet} />
      ) : null}

      {topPolicyReportSection ? (
        <section
          style={{
            display: "grid",
            gap: "18px",
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
          }}
        >
          <div style={{ display: "grid", gap: "8px", maxWidth: "920px" }}>
            <div style={{ fontSize: "12px", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
              Verdict-First Handoff
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
              {topPolicyReportSection.title}
            </div>
            <div style={{ color: "#475569", lineHeight: "1.8" }}>{topPolicyReportSection.summary}</div>
          </div>

          {topPolicyReportSection.items?.length > 0 ? renderReportFactsGrid(topPolicyReportSection.items, 4) : null}

          <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr", gap: "14px" }}>
            {[carrierSupportReportSection, advisorHandoffReportSection].filter(Boolean).map((section) => (
              <div
                key={section.id}
                style={{
                  padding: "18px",
                  borderRadius: "18px",
                  background: "#ffffff",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                  {section.title}
                </div>
                <div style={{ color: "#0f172a", lineHeight: "1.65", fontWeight: 700 }}>{section.summary}</div>
                {section.items?.length > 0 ? renderReportFactsGrid(section.items, 2) : null}
                {section.bullets?.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                    {section.bullets.map((item) => (
                      <li key={item} style={{ lineHeight: "1.7" }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {iulShowcasePolicy ? (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.05fr) minmax(300px, 0.95fr)",
            gap: "18px",
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
            border: "1px solid rgba(147, 197, 253, 0.28)",
          }}
        >
          <div style={{ display: "grid", gap: "12px", minWidth: 0 }}>
            <div style={{ fontSize: "12px", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
              Flagship Insurance Feature
            </div>
            <div style={{ fontSize: isMobile ? "24px" : "30px", fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a", lineHeight: "1.1" }}>
              IUL Review Console
            </div>
            <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>
              VaultedShield’s strongest insurance experience is the in-force IUL review console: a single policy workspace built to judge health, surface drag, compare illustration versus actual, and show what to review next.
            </div>
            <div style={{ color: "#475569", lineHeight: "1.75", maxWidth: "860px" }}>
              The current standout file is {iulShowcasePolicy.product || "this IUL policy"}, where the reader can move from policy verdict to pressure stack to illustration proof without making the reviewer assemble the story manually.
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => iulShowcasePolicy.policy_id && onNavigate?.(getPolicyDetailRoute(iulShowcasePolicy))}
                style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }}
              >
                Open IUL Review Console
              </button>
              <button
                type="button"
                onClick={() => comparisonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
              >
                See Portfolio Context
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: "12px",
              alignContent: "start",
              minWidth: 0,
            }}
          >
            <div style={{ padding: "16px 18px", borderRadius: "18px", background: "#ffffff", border: "1px solid rgba(147, 197, 253, 0.28)", display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Showcase Policy</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{iulShowcasePolicy.product || "IUL Policy"}</div>
              <div style={{ color: "#475569", lineHeight: "1.65" }}>{iulShowcasePolicy.carrier || "Carrier still forming"}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
              <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.18)" }}>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Policy Health</div>
                <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{iulShowcasePolicy.ranking?.status || "Developing"}</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.18)" }}>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Latest Statement</div>
                <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{formatDateValue(iulShowcasePolicy.latest_statement_date)}</div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        {portfolioSignalStrip.map((item) => (
          <div key={item.label}>{renderSignalCard(item)}</div>
        ))}
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: METRIC_GRID_COLUMNS,
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
            {totalCoverage > 0 ? formatCurrency(totalCoverage) : EMPTY_VALUE}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Total COI Exposure
          </div>
          <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800 }}>
            {totalCoi > 0 ? formatCurrency(totalCoi) : EMPTY_VALUE}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Policies With Issues
          </div>
          <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800 }}>{policiesWithIssues}</div>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Coverage Confidence
          </div>
          <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800 }}>
            {summaryLoading ? "..." : `${Math.round((protectionSummary.confidence || 0) * 100)}%`}
          </div>
        </div>
      </section>

      <section
        ref={protectionSignalsRef}
        style={{
          display: "grid",
          gap: "18px",
          padding: sectionPadding,
          borderRadius: sectionRadius,
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Protection Signals</div>
          <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "980px" }}>
            This layer checks whether the saved portfolio is actually giving the household enough protection visibility. It does not assume coverage is complete just because policies exist.
          </div>
          {summaryError ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "14px",
                background: "rgba(254, 249, 195, 0.55)",
                border: "1px solid rgba(250, 204, 21, 0.28)",
                color: "#854d0e",
                lineHeight: "1.7",
              }}
            >
              Household summary refresh is unavailable right now, so these protection signals are falling back to the visible policy reads already loaded in the page.
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: "14px",
          }}
        >
          <div
            style={{
              padding: "18px 18px 20px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
              border: "1px solid rgba(147, 197, 253, 0.28)",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Household Coverage Read
            </div>
            <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{protectionSummary.narrative}</div>
            <div style={{ color: "#475569", fontSize: "13px", lineHeight: "1.7" }}>
              {summaryLoading
                ? "Refreshing household insurance summary..."
                : `${protectionSummary.totalPolicies} visible polic${protectionSummary.totalPolicies === 1 ? "y" : "ies"} | ${protectionSummary.totalCoverage > 0 ? formatCurrency(protectionSummary.totalCoverage) : "Coverage still unresolved"} total visible death benefit`}
            </div>
          </div>

          <div
            style={{
              padding: "18px 18px 20px",
              borderRadius: "18px",
              background: "#f8fafc",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Gap Watch
            </div>
            <div
              style={{
                justifySelf: "start",
                padding: "7px 12px",
                borderRadius: "999px",
                background: getGapTone(protectionSummary.gapDetected, protectionSummary.confidence).background,
                color: getGapTone(protectionSummary.gapDetected, protectionSummary.confidence).color,
                fontWeight: 700,
                fontSize: "12px",
              }}
            >
              {protectionSummary.gapDetected ? "Gap Review Needed" : "No Obvious Gap"}
            </div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              {gapPolicies.length > 0
                ? `${pluralize(gapPolicies.length, "policy")} currently show visible gap pressure or incomplete protection support.`
                : "The saved portfolio does not currently show a clear household-level protection gap."}
            </div>
          </div>

          <div
            style={{
              padding: "18px 18px 20px",
              borderRadius: "18px",
              background: "#f8fafc",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Confidence Notes
            </div>
            <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>
              {summaryLoading ? "Refreshing..." : `${Math.round((protectionSummary.confidence || 0) * 100)}% portfolio coverage confidence`}
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
              {protectionSummary.bullets.map((item) => (
                <li key={item} style={{ lineHeight: "1.7" }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "18px",
          padding: sectionPadding,
          borderRadius: sectionRadius,
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Portfolio Read Depth</div>
          <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "980px" }}>
            This layer explains how strong the current insurance read actually is. It separates portfolio quality into evidence depth, charge support, statement freshness, strategy visibility, and active review pressure so the household view feels more like an analyst brief than a thin dashboard.
          </div>
        </div>

        {renderReportFactsGrid(portfolioDepth.scorecard, 3)}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: "14px",
          }}
        >
          {portfolioDepth.cards.map((card) => (
            <div
              key={card.title}
              style={{
                padding: "18px 18px 20px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {card.title}
              </div>
              <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{card.summary}</div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                {card.bullets.map((item) => (
                  <li key={item} style={{ lineHeight: "1.7" }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "18px",
          padding: sectionPadding,
          borderRadius: sectionRadius,
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Portfolio Summary</div>
          <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "960px" }}>{portfolioBrief.summary}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: briefColumns, gap: "18px" }}>
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
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span>Visible Charges</span>
                <strong>{formatCurrency(portfolioBrief.metrics.total_visible_charges)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>Review Workspace Handoff</div>
          <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "940px" }}>
            The live portfolio actions already handle the on-page next move. Shared insurance follow-up now belongs in Review Workspace so policy work sits beside property, mortgage, and continuity issues instead of repeating as a second queue here.
          </div>
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
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8", fontWeight: 700, fontSize: "12px" }}>
                {pluralize(portfolioBrief.priority_policies.length, "priority policy", "priority policies")}
              </div>
              <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#e2e8f0", color: "#475569", fontWeight: 700, fontSize: "12px" }}>
                {pluralize(portfolioBrief.focus_areas.length, "focus area")}
              </div>
            </div>
            <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>
              {topPriorityPolicy
                ? `${topPriorityPolicy.product || "Top policy"} is still the clearest insurance handoff, but the shared queue is now better handled in Review Workspace where it can be tracked, assigned, and cleared alongside the rest of the household work.`
                : "No immediate insurance queue item stands out above the rest, so Review Workspace is the better place to watch cross-module follow-up as new signals appear."}
            </div>
            {topPriorityPolicy ? (
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                {topPriorityPolicy.review_reason}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => onNavigate?.(insuranceReviewWorkspaceRoute)}
                style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }}
              >
                Open Review Workspace
              </button>
              {topPriorityPolicy ? (
                <button
                  type="button"
                  onClick={() => topPriorityPolicy.policy_id && onNavigate?.(getPolicyDetailRoute(topPriorityPolicy))}
                  style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
                >
                  Open Top Policy Review
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gap: "18px",
          padding: sectionPadding,
          borderRadius: sectionRadius,
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
              const highlight = rankingHighlights.find((item) => item.policyId === policy.policy_id) || null;
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
                      alignItems: isMobile ? "flex-start" : "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "grid", gap: "4px", minWidth: 0, flex: "1 1 300px" }}>
                      <button
                        type="button"
                        onClick={() => policy.policy_id && onNavigate?.(getPolicyDetailRoute(policy))}
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
                    <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", gap: "10px", flexWrap: "wrap", flexDirection: rankingActionDirection, width: isMobile ? "100%" : "auto" }}>
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
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: "999px",
                          background: getGapTone(policy.gapAnalysis?.coverageGap, policy.gapAnalysis?.confidence).background,
                          color: getGapTone(policy.gapAnalysis?.coverageGap, policy.gapAnalysis?.confidence).color,
                          fontWeight: 700,
                          fontSize: "12px",
                        }}
                      >
                        {policy.gapAnalysis?.coverageGap ? "Coverage Gap" : "Coverage Check"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569", minWidth: "72px", textAlign: "right" }}>
                        {policy.ranking.score}/100
                      </div>
                      <button
                        type="button"
                        onClick={() => policy.policy_id && onNavigate?.(getPolicyDetailRoute(policy))}
                        style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
                      >
                        {getPolicyEntryLabel(policy)}
                      </button>
                      <button
                        onClick={() =>
                          setExpandedPolicyId(isExpanded ? null : policy.policy_id)
                        }
                        style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
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
                        <div style={{ display: "grid", gridTemplateColumns: DETAIL_GRID_COLUMNS, gap: "12px", fontSize: "13px" }}>
                          <div><strong>Missing Fields:</strong> {(policy.missing_fields || []).join(", ") || EMPTY_VALUE}</div>
                          <div><strong>COI Source:</strong> {displayNullable(policy.coi_source_kind)}</div>
                         <div><strong>COI Confidence:</strong> {displayNullable(policy.coi_confidence)}</div>
                         <div><strong>Charge Visibility:</strong> {displayNullable(policy.charge_visibility_status)}</div>
                        <div><strong>Latest Statement:</strong> {displayNullable(formatDateValue(policy.latest_statement_date))}</div>
                        <div><strong>Data Completeness:</strong> {displayNullable(policy.data_completeness_status)}</div>
                          <div><strong>Policy Health:</strong> {displayNullable(policy.policy_health_status)}</div>
                          <div><strong>Continuity Score:</strong> {policy.ranking.score}</div>
                          <div><strong>Funding Pattern:</strong> {displayNullable(policy.basicAnalysis?.fundingPattern)}</div>
                          <div><strong>COI Trend:</strong> {displayNullable(policy.basicAnalysis?.coiTrend)}</div>
                          <div><strong>Coverage Confidence:</strong> {`${Math.round((policy.gapAnalysis?.confidence || 0) * 100)}%`}</div>
                          <div><strong>Coverage Gap:</strong> {policy.gapAnalysis?.coverageGap ? "Possible gap" : "No obvious gap"}</div>
                        </div>
                      <div
                        style={{
                          padding: "14px 16px",
                          borderRadius: "14px",
                          background: "#ffffff",
                          border: "1px solid rgba(148, 163, 184, 0.18)",
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>Coverage And Protection Notes</div>
                        <div style={{ color: "#475569", lineHeight: "1.7" }}>
                          {policy.gapAnalysis?.coverageGap
                            ? "This policy shows at least one visible protection gap or incomplete coverage signal based on the current extracted read."
                            : "This policy does not show an obvious gap from the current extracted read, but coverage confidence still depends on document quality and missing fields."}
                        </div>
                        {policy.gapAnalysis?.notes?.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                            {policy.gapAnalysis.notes.map((item) => (
                              <li key={item} style={{ lineHeight: "1.6" }}>
                                {item}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div style={{ color: "#475569" }}>
                            No additional gap notes are visible from the current extracted evidence.
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          padding: "14px 16px",
                          borderRadius: "14px",
                          background: "#ffffff",
                          border: "1px solid rgba(148, 163, 184, 0.18)",
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>Why This Policy Lands Here</div>
                        <div style={{ color: "#475569", lineHeight: "1.7" }}>
                          {highlight?.reviewReason || policy.ranking.statusExplanation || policy.interpretation.bottom_line_summary}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: DETAIL_GRID_COLUMNS, gap: "10px" }}>
                          <div>
                            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              Core Signals
                            </div>
                            <ul style={{ margin: "8px 0 0 18px", padding: 0, display: "grid", gap: "6px", color: "#475569" }}>
                              {(highlight?.signals || []).map((item) => (
                                <li key={item} style={{ lineHeight: "1.6" }}>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              Ranking Penalties
                            </div>
                            {highlight?.penalties?.length > 0 ? (
                              <ul style={{ margin: "8px 0 0 18px", padding: 0, display: "grid", gap: "6px", color: "#475569" }}>
                                {highlight.penalties.map((item, penaltyIndex) => (
                                  <li key={`${policy.policy_id || policy.product}-penalty-${penaltyIndex}`} style={{ lineHeight: "1.6" }}>
                                    {typeof item === "string" ? item : JSON.stringify(item)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div style={{ marginTop: "8px", color: "#475569" }}>
                                No material ranking penalties are visible beyond the current interpretation summary.
                              </div>
                            )}
                          </div>
                        </div>
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
                                    : getPolicyDetailRoute(policy)
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
                        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Why This Policy Scored Here</summary>
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
                        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Comparison Snapshot</summary>
                        <pre style={{ marginTop: "10px", fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                          {JSON.stringify(policy.raw_comparison_summary || {}, null, 2)}
                        </pre>
                      </details>
                      <details>
                        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Charge Snapshot</summary>
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
              {loadingStates.insurancePortfolio
                ? "Building the insurance read from the current policy records..."
                : loadError || "Upload the first readable policy to start the insurance comparison view."}
            </div>
          )}
        </div>
      </section>

      <section
        ref={comparisonRef}
        style={{
          display: "grid",
          gap: "18px",
          padding: sectionPadding,
          borderRadius: sectionRadius,
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Policy Comparison</div>
        {isMobile ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {rankedPolicies.map((policy) => (
              <div
                key={policy.policy_id || policy.product}
                style={{
                  padding: "16px",
                  borderRadius: "16px",
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                  background: policy.ranking.status === "Weak" || policy.ranking.status === "At Risk" ? "rgba(248, 250, 252, 0.75)" : "#ffffff",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div style={{ display: "grid", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => policy.policy_id && onNavigate?.(getPolicyDetailRoute(policy))}
                    style={{
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      fontWeight: 700,
                      fontSize: "16px",
                      color: "#0f172a",
                      textAlign: "left",
                      cursor: policy.policy_id ? "pointer" : "default",
                    }}
                  >
                    {displayNullable(policy.product)}
                  </button>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>Missing fields: {(policy.missing_fields || []).length || 0}</div>
                  <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.65" }}>{policy.interpretation.bottom_line_summary}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "10px 12px" }}>
                  {comparisonTableColumns.map((column) => (
                    <div key={`${policy.policy_id || policy.product}-${column.label}`} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {column.label}
                      </div>
                      <div style={{ marginTop: "4px", color: "#0f172a", fontSize: "13px", lineHeight: "1.5", wordBreak: "break-word" }}>
                        {column.value(policy)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: isMobile ? "920px" : "1020px", borderCollapse: "collapse", textAlign: "left", color: "#0f172a" }}>
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
                      onClick={() => policy.policy_id && onNavigate?.(getPolicyDetailRoute(policy))}
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
        )}
      </section>

      <section
        style={{
          display: "grid",
          gap: "14px",
          padding: sectionPadding,
          borderRadius: sectionRadius,
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>System Insight</div>
        <div style={{ fontSize: "14px", lineHeight: "1.7", color: "#475569" }}>
          {rankedPolicies.length === 1
            ? "This first saved policy is enough to start an in-force read, but the portfolio story is still early. Statement continuity, charge support, and a second comparable policy will make this hub much more useful."
            : systemInsight.summary}
        </div>
        <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#0f172a" }}>
          {(rankedPolicies.length === 1
            ? [
                "One saved policy now supports baseline health, continuity, and charge interpretation.",
                "Comparison becomes much stronger after a second policy or deeper statement history is added.",
                "Missing statement dates, limited COI visibility, and partial strategy detail still weaken confidence where present.",
              ]
            : systemInsight.bullets).map((bullet) => (
            <li key={bullet} style={{ lineHeight: "1.7" }}>
              {bullet}
            </li>
          ))}
        </ul>
        <div
          style={{
            padding: "16px 18px",
            borderRadius: "16px",
            background: "#f8fafc",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ fontWeight: 700, color: "#0f172a" }}>Portfolio Bottom Line</div>
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            {portfolioBottomLineSection?.summary || portfolioBrief.summary}
          </div>
        </div>
      </section>
    </div>
  );
}
