import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import PolicyAiAssistantCard from "../components/policy/PolicyAiAssistantCard";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import { IulReaderPanel } from "../features/iul-reader/IulReaderPanel.jsx";
import { buildIulReaderModel } from "../features/iul-reader/readerModel.js";
import {
  buildPolicyInterpretation,
  buildPolicyReviewReport,
  buildPolicyTrendSummary,
  buildVaultedPolicyRank,
} from "../lib/domain/intelligenceEngine";
import { buildPolicyInsightSummary } from "../lib/ai/policyInsightEngine";
import { normalizeLifePolicy } from "../lib/insurance/normalizeLifePolicy";
import { buildIulV2Analytics } from "../lib/insurance/iulV2Analytics";
import { buildPolicyOptimizationEngine } from "../lib/insurance/policyOptimizationEngine";
import {
  analyzePolicyBasics,
  buildPolicyAdequacyReview,
  detectInsuranceGaps,
} from "../lib/domain/insurance/insuranceIntelligence";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  getVaultedPolicyAnalytics,
  getVaultedPolicyById,
  getVaultedPolicyDocuments,
  getVaultedPolicySnapshots,
  getVaultedPolicyStatements,
  rehydrateVaultedPolicyBundle,
} from "../lib/supabase/vaultedPolicies";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

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

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "\u2014";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDisplayValue(value) {
  return value === null || value === undefined || value === "" ? "\u2014" : value;
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

function formatConfidencePercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `${Math.round(Number(value) * 100)}%`;
}

function getTone(status) {
  if (status === "Strong") return "good";
  if (status === "Moderate") return "warning";
  if (status === "Weak") return "alert";
  return "alert";
}

function getVisibilityTone(value) {
  if (value === "strong" || value === "available") return "good";
  if (value === "moderate" || value === "basic") return "warning";
  return "info";
}

function getInterpretationTone(status) {
  if (status === "performing_well") return "good";
  if (status === "mixed_needs_review") return "warning";
  if (status === "underperforming") return "alert";
  return "info";
}

function getProtectionTone(hasGap, confidence = 0) {
  if (hasGap) return "alert";
  if (confidence >= 0.75) return "good";
  if (confidence >= 0.5) return "warning";
  return "info";
}

function getAiStatusTone(status) {
  if (status === "strong") return "good";
  if (status === "moderate") return "warning";
  if (status === "insufficient_data") return "info";
  return "alert";
}

function getIulStatusTone(value) {
  if (["ahead", "on_track", "sufficient", "low", "strong", "diversified"].includes(value)) return "good";
  if (["behind", "underfunded", "high", "limited", "concentrated"].includes(value)) return "alert";
  if (["moderate", "mixed", "rising", "aggressive"].includes(value)) return "warning";
  return "info";
}

function getOptimizationTone(value) {
  if (["healthy", "low"].includes(value)) return "good";
  if (["watch", "medium"].includes(value)) return "warning";
  if (["at_risk", "high"].includes(value)) return "alert";
  return "info";
}

function getCoiInterpretation(sourceKind, confidence) {
  if (confidence === "strong") {
    return "Extracted from explicit statement totals";
  }
  if (confidence === "moderate" && sourceKind === "monthly_rollup") {
    return "Derived from monthly rollup with moderate confidence";
  }
  if (confidence === "moderate") {
    return "Supported by a visible table rollup with moderate confidence";
  }
  return "Limited visibility; direct COI total not fully supported";
}

function getStatementCompletenessCue(statement) {
  const visibleCount = [
    statement?.cash_value,
    statement?.cash_surrender_value,
    statement?.loan_balance,
    statement?.cost_of_insurance,
  ].filter((value) => value !== null && value !== undefined).length;

  if (visibleCount >= 4) return "Strong detail";
  if (visibleCount >= 2) return "Partial detail";
  return "Limited detail";
}

function getDetailQualityTone(value) {
  if (value === "Strong detail") return { color: "#166534", background: "#f0fdf4" };
  if (value === "Partial detail") return { color: "#92400e", background: "#fffbeb" };
  return { color: "#475569", background: "#f8fafc" };
}

function renderInterpretationCard({ eyebrow, title, body, accent = false }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "16px",
        background: accent ? "#eff6ff" : "#f8fafc",
        border: accent ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
        display: "grid",
        gap: "8px",
      }}
    >
      <div style={{ fontSize: "11px", color: accent ? "#1d4ed8" : "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
        {eyebrow}
      </div>
      <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{title}</div>
      {body ? <div style={{ color: "#475569", lineHeight: "1.7" }}>{body}</div> : null}
    </div>
  );
}

function buildIssueGroups(row, ranking) {
  const groups = [];
  const missingFields = row?.missing_fields || [];

  const dedupe = (items) => [...new Set(items.filter(Boolean))];

  const statementItems = dedupe([
    !row?.latest_statement_date ? "Latest statement date is missing." : "",
    row?.latest_statement_date_source === "missing" ? "Statement recency could not be resolved cleanly." : "",
  ]);
  if (statementItems.length > 0) {
    groups.push({ title: "Statement freshness", items: statementItems });
  }

  const chargeItems = dedupe([
    row?.coi_confidence === "weak" ? "COI confidence is weak." : "",
    row?.coi_confidence === "moderate" ? "COI confidence is moderate." : "",
    row?.charge_visibility_status === "limited" || row?.charge_visibility_status === "basic"
      ? `Charge visibility is ${row.charge_visibility_status}.`
      : "",
    missingFields.includes("total_coi") ? "Total COI is missing." : "",
    missingFields.includes("total_visible_policy_charges") ? "Total visible charges are incomplete." : "",
  ]);
  if (chargeItems.length > 0) {
    groups.push({ title: "Charge visibility", items: chargeItems });
  }

  const strategyItems = dedupe([
    row?.strategy_visibility === "limited" || row?.strategy_visibility === "basic"
      ? `Strategy visibility is ${row.strategy_visibility}.`
      : "",
    !row?.primary_strategy ? "Primary strategy is not clearly visible." : "",
  ]);
  if (strategyItems.length > 0) {
    groups.push({ title: "Strategy visibility", items: strategyItems });
  }

  const coreFieldLabels = {
    carrier_name: "Carrier",
    product_name: "Product",
    issue_date: "Issue date",
    death_benefit: "Death benefit",
    planned_premium: "Planned premium",
    accumulation_value: "Account value",
    cash_value: "Cash value",
    cash_surrender_value: "Cash surrender value",
    loan_balance: "Loan balance",
  };

  const coreItems = dedupe(
    missingFields
      .filter((field) => coreFieldLabels[field])
      .map((field) => `${coreFieldLabels[field]} is missing.`)
  );
  if (coreItems.length > 0) {
    groups.push({ title: "Core policy fields", items: coreItems });
  }

  if (groups.length === 0 && ranking?.caveat) {
    groups.push({ title: "Review note", items: [ranking.caveat] });
  }

  return groups;
}

function reportActionButtonStyle(active = false, primary = false) {
  if (primary) return actionButtonStyle(true);
  return {
    ...actionButtonStyle(false),
    border: active ? "1px solid #93c5fd" : "1px solid #cbd5e1",
    background: active ? "#eff6ff" : "#ffffff",
    color: active ? "#1d4ed8" : "#0f172a",
  };
}

function clampScore(value) {
  if (!Number.isFinite(Number(value))) return 50;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function scoreBand(score) {
  if (score >= 80) return "good";
  if (score >= 62) return "warning";
  return "alert";
}

function buildGeneralLifeScorecard({
  lifePolicy,
  ranking,
  policyInterpretation,
  policyAiSummary,
  basicPolicyAnalysis,
  adequacyReview,
  comparisonRow,
  gapAnalysis,
}) {
  const continuityScore = clampScore((ranking?.score ?? 5) * 10);
  const adequacyScore =
    adequacyReview?.status === "strong"
      ? 84
      : adequacyReview?.status === "moderate"
        ? 64
        : adequacyReview?.status === "weak"
          ? 36
          : basicPolicyAnalysis?.protection_confidence >= 0.75
            ? 76
            : basicPolicyAnalysis?.protection_confidence >= 0.5
              ? 58
              : 44;
  const beneficiaryScore =
    basicPolicyAnalysis?.beneficiary_visibility === "named"
      ? 84
      : basicPolicyAnalysis?.beneficiary_visibility === "mentioned"
        ? 62
        : 38;
  const fundingScore =
    basicPolicyAnalysis?.funding_pattern === "adequate" || basicPolicyAnalysis?.funding_pattern === "overfunded"
      ? 78
      : basicPolicyAnalysis?.funding_pattern === "underfunded"
        ? 36
        : 54;
  const evidenceScore =
    comparisonRow?.latest_statement_date
      ? continuityScore
      : lifePolicy?.meta?.statementCount > 0
        ? 62
        : 42;

  const overallScore = clampScore(
    continuityScore * 0.28 +
      adequacyScore * 0.24 +
      beneficiaryScore * 0.16 +
      fundingScore * 0.14 +
      evidenceScore * 0.18
  );

  const nextAction =
    gapAnalysis?.recommendations?.[0] ||
    adequacyReview?.notes?.[0] ||
    policyInterpretation?.review_items?.[0] ||
    "Upload the next clean statement or beneficiary-support page so the policy read becomes more complete.";

  return {
    overallScore,
    overallTone: scoreBand(overallScore),
    headline:
      overallScore >= 80
        ? "This life policy looks reasonably well-supported from the current packet."
        : overallScore >= 62
          ? "This life policy looks usable but still needs review in at least one important area."
          : "This life policy still needs closer review before you rely on the current read.",
    plainEnglish:
      overallScore >= 80
        ? "In plain English: the visible policy structure, support, and continuity look fairly solid."
        : overallScore >= 62
          ? "In plain English: the policy is understandable, but there are still enough gaps that it should not be treated as self-explanatory."
          : "In plain English: the current file does not yet make this policy feel comfortably clear or fully supported.",
    nextAction,
    cards: [
      {
        title: "Continuity",
        score: continuityScore,
        tone: scoreBand(continuityScore),
        summary: comparisonRow?.latest_statement_date
          ? `The visible statement trail supports a continuity score of ${ranking?.score ?? "?"}/10.`
          : "Statement continuity is still thin, so the current read depends more heavily on the baseline packet.",
      },
      {
        title: "Coverage Fit",
        score: adequacyScore,
        tone: scoreBand(adequacyScore),
        summary: adequacyReview?.headline || policyAiSummary?.summary || "Coverage-fit support is still forming from the current packet.",
      },
      {
        title: "Beneficiary Clarity",
        score: beneficiaryScore,
        tone: scoreBand(beneficiaryScore),
        summary:
          basicPolicyAnalysis?.beneficiary_visibility === "named"
            ? "Beneficiary support is visible enough to make the intended protection path more believable."
            : basicPolicyAnalysis?.beneficiary_visibility === "mentioned"
              ? "Beneficiary support is present, but still not fully named or cleanly structured."
              : "Beneficiary support is still too limited to make family-protection intent feel complete.",
      },
      {
        title: "Funding / Premium",
        score: fundingScore,
        tone: scoreBand(fundingScore),
        summary:
          basicPolicyAnalysis?.funding_pattern === "adequate" || basicPolicyAnalysis?.funding_pattern === "overfunded"
            ? "Visible premium structure looks reasonably supportive."
            : basicPolicyAnalysis?.funding_pattern === "underfunded"
              ? "Visible premium support looks light relative to what the policy may need."
              : "Funding structure is still only partly visible from the current packet.",
      },
      {
        title: "Evidence Strength",
        score: evidenceScore,
        tone: scoreBand(evidenceScore),
        summary:
          comparisonRow?.latest_statement_date
            ? "A current statement is visible, which materially improves trust in the read."
            : "This read still needs stronger statement or support-page evidence to feel dependable.",
      },
    ],
  };
}

function buildPolicyAdvisorBrief({
  policyType = "unknown",
  scorecard = null,
  interpretation = null,
  insightSummary = null,
  basicPolicyAnalysis = null,
}) {
  const score = scorecard?.overallScore ?? null;
  const scoreLabel = score === null ? "still forming" : score >= 80 ? "strong" : score >= 62 ? "mixed" : "fragile";

  const byType = {
    whole_life: {
      eyebrow: "Whole Life Advisor Brief",
      title: "Read this like a stability and structure review.",
      summary:
        "For whole life, the first questions are whether cash value behavior looks steady, dividends are visible enough to trust, and loan activity is creating pressure.",
    },
    term: {
      eyebrow: "Term Policy Advisor Brief",
      title: "Read this like an expiration and conversion review.",
      summary:
        "For term coverage, the first things that matter are when coverage ends, whether conversion is visible, and whether the current term structure still fits the household need.",
    },
    final_expense: {
      eyebrow: "Final Expense Advisor Brief",
      title: "Read this like a permanence and benefit-structure review.",
      summary:
        "For final expense, the first questions are whether the benefit is truly permanent, whether any waiting period is visible, and whether the structure really matches burial or final-expense intent.",
    },
    ul: {
      eyebrow: "Universal Life Advisor Brief",
      title: "Read this like a funding and cost-pressure review.",
      summary:
        "For universal life, start with funding strength, visible charges, continuity support, and whether the current structure still looks durable from the packet.",
    },
    unknown: {
      eyebrow: "Life Policy Advisor Brief",
      title: "Start with the clearest risk and fit questions first.",
      summary:
        "This policy type is usable, but the best first move is to focus on the clearest review path before diving into every technical field.",
    },
  };

  const resolved = byType[policyType] || byType.unknown;
  const nextMove =
    scorecard?.nextAction ||
    interpretation?.review_items?.[0] ||
    insightSummary?.missingData?.[0] ||
    "Use the recommended question set first, then review deeper evidence if anything still feels unclear.";

  return {
    eyebrow: resolved.eyebrow,
    title: resolved.title,
    summary: resolved.summary,
    scoreLabel,
    confidenceSummary:
      interpretation?.confidence_summary ||
      insightSummary?.summary ||
      "Confidence is still driven by how much visible structure and continuity the current packet provides.",
    fundingRead:
      basicPolicyAnalysis?.fundingPattern
        ? `Visible funding pattern currently reads as ${String(basicPolicyAnalysis.fundingPattern).replace(/_/g, " ")}.`
        : "Funding behavior is still only partially visible from the current packet.",
    nextMove,
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

      {section.kind === "groups" ? (
        section.groups?.length > 0 ? (
          <div style={{ display: "grid", gap: "14px" }}>
            {section.groups.map((group) => (
              <div key={group.title}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>{group.title}</div>
                <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#166534", fontWeight: 700 }}>{section.empty_message || "No report items available."}</div>
        )
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
  if (!report) return null;
  const { isTablet } = useResponsiveLayout();

  return (
    <SectionCard title={title} subtitle={subtitle} accent="#bfdbfe">
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
    </SectionCard>
  );
}

export default function PolicyDetailPage({ policyId, onNavigate }) {
  const { isTablet } = useResponsiveLayout();
  const { insuranceRows, errors, debug } = usePlatformShellData();
  const sectionRefs = useRef({});
  const [bundle, setBundle] = useState({
    policy: null,
    documents: [],
    snapshots: [],
    analytics: [],
    statements: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeFollowupSection, setActiveFollowupSection] = useState("");
  const [showReviewReport, setShowReviewReport] = useState(false);
  const [latestPolicyAiEntry, setLatestPolicyAiEntry] = useState(null);

  function setSectionRef(key, node) {
    if (!key) return;
    sectionRefs.current[key] = node;
  }

  function getSectionHighlight(key) {
    return activeFollowupSection === key
      ? {
          borderRadius: "22px",
          boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.18)",
        }
      : {};
  }

  function handleInterpretationFollowup(item) {
    if (!item?.section) return;
    if (item.section === "comparison") {
      onNavigate?.(policyId ? `/insurance/compare/${policyId}` : "/insurance");
      return;
    }

    const target = sectionRefs.current[item.section];
    if (target) {
      setActiveFollowupSection(item.section);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handlePrintReport() {
    setShowReviewReport(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.print(), 80);
    }
  }

  function scrollToPolicySection(section) {
    const target = sectionRefs.current[section];
    if (target) {
      setActiveFollowupSection(section);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function getGeneralLifeScorecardSection(cardTitle) {
    const normalized = String(cardTitle || "").toLowerCase();
    if (normalized.includes("continuity")) return "charge_summary";
    if (normalized.includes("funding")) return "interpretation";
    if (normalized.includes("evidence")) return "confidence";
    if (normalized.includes("beneficiary")) return "policy_overview";
    if (normalized.includes("coverage")) return "policy_overview";
    return "interpretation";
  }

  useEffect(() => {
    setBundle({
      policy: null,
      documents: [],
      snapshots: [],
      analytics: [],
      statements: [],
    });
    setLoadError("");

    if (!policyId) return;

    let active = true;

    async function loadPolicyDetail() {
      setLoading(true);
      setLoadError("");
      const policyScope = {
        userId: debug.authUserId,
        householdId: debug.householdId,
        ownershipMode: debug.ownershipMode,
        guestFallbackActive: debug.sharedFallbackActive,
        source: "policy_detail_page",
      };

      const [policyResult, analyticsResult, statementsResult] = await Promise.all([
        getVaultedPolicyById(policyId, policyScope),
        getVaultedPolicyAnalytics(policyId, policyScope),
        getVaultedPolicyStatements(policyId, policyScope),
      ]);

      if (!active) return;

      setBundle({
        policy: policyResult.data || null,
        documents: [],
        snapshots: [],
        analytics: analyticsResult.data || [],
        statements: statementsResult.data || [],
      });
      setLoadError(
        policyResult.error?.message ||
          (!policyResult.data ? "This policy is not available in the current account scope." : "") ||
          analyticsResult.error?.message ||
          statementsResult.error?.message ||
          ""
      );
      setLoading(false);

      if (!policyResult.data?.id) {
        return;
      }

      const [documentsResult, snapshotsResult] = await Promise.all([
        getVaultedPolicyDocuments(policyId, policyScope),
        getVaultedPolicySnapshots(policyId, policyScope),
      ]);

      if (!active) return;

      setBundle((current) => ({
        ...current,
        documents: documentsResult.data || [],
        snapshots: snapshotsResult.data || [],
      }));
      setLoadError((current) => current || documentsResult.error?.message || snapshotsResult.error?.message || "");
    }

    loadPolicyDetail();
    return () => {
      active = false;
    };
  }, [debug.authUserId, debug.householdId, policyId]);

  useEffect(() => {
    setLatestPolicyAiEntry(null);
  }, [policyId]);

  const comparisonRow = useMemo(
    () => insuranceRows.find((row) => row.policy_id === policyId) || null,
    [insuranceRows, policyId]
  );
  const ranking = useMemo(
    () => (comparisonRow ? buildVaultedPolicyRank(comparisonRow) : null),
    [comparisonRow]
  );
  const latestAnalytics = bundle.analytics[0] || null;
  const readerResults = useMemo(() => rehydrateVaultedPolicyBundle(bundle), [bundle]);
  const normalizedPolicy = latestAnalytics?.normalized_policy || {};
  const normalizedAnalytics = latestAnalytics?.normalized_analytics || {};
  const chargeSummary = latestAnalytics?.normalized_analytics?.charge_summary || {};
  const comparisonSummary =
    comparisonRow?.raw_comparison_summary ||
    latestAnalytics?.normalized_analytics?.comparison_summary ||
    null;
  const missingFields = comparisonRow?.missing_fields || [];
  const groupedIssues = buildIssueGroups(comparisonRow, ranking);
  const statementPresence = comparisonRow?.latest_statement_date
    ? `Available (${formatDate(comparisonRow.latest_statement_date)})`
    : "Missing";

  const statementTimeline = useMemo(
    () =>
      [...(bundle.statements || [])].sort((left, right) => {
        const leftDate = left?.statement_date || "";
        const rightDate = right?.statement_date || "";
        return leftDate.localeCompare(rightDate);
      }),
    [bundle.statements]
  );
  const trendSummary = useMemo(() => buildPolicyTrendSummary(statementTimeline), [statementTimeline]);
  const policyInterpretation = useMemo(
    () => buildPolicyInterpretation(normalizedPolicy, normalizedAnalytics, statementTimeline),
    [normalizedAnalytics, normalizedPolicy, statementTimeline]
  );
  const lifePolicy = useMemo(
    () =>
      normalizeLifePolicy({
        normalizedPolicy,
        normalizedAnalytics,
        comparisonSummary,
        statementRows: statementTimeline,
      }),
    [comparisonSummary, normalizedAnalytics, normalizedPolicy, statementTimeline]
  );
  const basicPolicyAnalysis = useMemo(
    () =>
      analyzePolicyBasics({
        normalizedPolicy,
        normalizedAnalytics,
        comparisonSummary,
        statements: statementTimeline,
      }),
    [comparisonSummary, normalizedAnalytics, normalizedPolicy, statementTimeline]
  );
  const gapAnalysis = useMemo(
    () =>
      detectInsuranceGaps(
        {
          normalizedPolicy,
          comparisonSummary,
          statements: statementTimeline,
          basics: basicPolicyAnalysis,
        },
        { totalPolicies: insuranceRows.length }
      ),
    [basicPolicyAnalysis, comparisonSummary, insuranceRows.length, normalizedPolicy, statementTimeline]
  );
  const adequacyReview = useMemo(
    () =>
      buildPolicyAdequacyReview(
        {
          normalizedPolicy,
          comparisonSummary,
          lifePolicy,
          basics: basicPolicyAnalysis,
        },
        {
          mortgageCount: debug?.scopedMortgageCount || 0,
        }
      ),
    [basicPolicyAnalysis, comparisonSummary, debug?.scopedMortgageCount, lifePolicy, normalizedPolicy]
  );
  const policyAiSummary = useMemo(
    () =>
      buildPolicyInsightSummary({
        lifePolicy,
        normalizedAnalytics,
        statementRows: statementTimeline,
        comparisonSummary,
        interpretation: policyInterpretation,
      }),
    [comparisonSummary, lifePolicy, normalizedAnalytics, policyInterpretation, statementTimeline]
  );
  const iulV2 = useMemo(
    () =>
      ["iul", "ul"].includes(lifePolicy?.meta?.policyType)
        ? buildIulV2Analytics({
            lifePolicy,
            normalizedAnalytics,
            statementRows: statementTimeline,
          })
        : null,
    [lifePolicy, normalizedAnalytics, statementTimeline]
  );
  const optimizationAnalysis = useMemo(
    () =>
      buildPolicyOptimizationEngine({
        lifePolicy,
        normalizedPolicy,
        normalizedAnalytics,
        iulV2,
        illustrationComparison: iulV2?.illustrationComparison || null,
        statementRows: statementTimeline,
        policyType: lifePolicy?.meta?.policyType || "unknown",
      }),
    [iulV2, lifePolicy, normalizedAnalytics, normalizedPolicy, statementTimeline]
  );
  const showUnifiedIulReader = ["iul", "ul"].includes(lifePolicy?.meta?.policyType);
  const iulReader = useMemo(
    () =>
      showUnifiedIulReader
        ? buildIulReaderModel({
            ...readerResults,
            iulV2,
            optimizationAnalysis,
            policyInterpretation,
            groupedIssues,
          })
        : null,
    [groupedIssues, iulV2, optimizationAnalysis, policyInterpretation, readerResults, showUnifiedIulReader]
  );
  const generalLifeScorecard = useMemo(
    () =>
      !showUnifiedIulReader
        ? buildGeneralLifeScorecard({
            lifePolicy,
            ranking,
            policyInterpretation,
            policyAiSummary,
            basicPolicyAnalysis,
            adequacyReview,
            comparisonRow,
            gapAnalysis,
          })
        : null,
    [
      adequacyReview,
      basicPolicyAnalysis,
      comparisonRow,
      gapAnalysis,
      lifePolicy,
      policyAiSummary,
      policyInterpretation,
      ranking,
      showUnifiedIulReader,
    ]
  );
  const reviewReport = useMemo(
    () =>
      buildPolicyReviewReport({
        comparisonRow,
        policy: bundle.policy,
        ranking,
        policyInterpretation,
        trendSummary,
        chargeSummary,
        groupedIssues,
        statementTimeline,
        normalizedPolicy,
        normalizedAnalytics,
        basicPolicyAnalysis,
        gapAnalysis,
        adequacyReview,
      }),
    [
      adequacyReview,
      basicPolicyAnalysis,
      bundle.policy,
      chargeSummary,
      comparisonRow,
      gapAnalysis,
      groupedIssues,
      normalizedAnalytics,
      normalizedPolicy,
      policyInterpretation,
      ranking,
      statementTimeline,
      trendSummary,
    ]
  );

  const snapshotTitle =
    comparisonRow?.product ||
    bundle.policy?.product_name ||
    bundle.policy?.policy_number_masked ||
    "Policy Detail";
  const snapshotCarrier = comparisonRow?.carrier || bundle.policy?.carrier_name || "Carrier unavailable";
  const snapshotDescription = `${snapshotCarrier} | In-force policy intelligence with live statement interpretation, charge visibility, and evidence support.`;

  const snapshotMetrics = [
    { label: "Cash Value", value: formatDisplayValue(comparisonRow?.cash_value) },
    { label: "Death Benefit", value: formatDisplayValue(comparisonRow?.death_benefit) },
    { label: "Total COI", value: formatDisplayValue(comparisonRow?.total_coi) },
    { label: "Latest Statement", value: formatDate(comparisonRow?.latest_statement_date) },
  ];
  const policyAdvisorBrief = useMemo(
    () =>
      buildPolicyAdvisorBrief({
        policyType: lifePolicy?.meta?.policyType || "unknown",
        scorecard: generalLifeScorecard,
        interpretation: policyInterpretation,
        insightSummary: policyAiSummary,
        basicPolicyAnalysis,
      }),
    [basicPolicyAnalysis, generalLifeScorecard, lifePolicy?.meta?.policyType, policyAiSummary, policyInterpretation]
  );
  const interpretationSignalCards = useMemo(
    () => [
      {
        eyebrow: "Growth Read",
        title: policyInterpretation.growth_summary,
        body: "How current value support and trajectory appear based on visible statements.",
      },
      {
        eyebrow: "Charge Read",
        title: policyInterpretation.charge_summary_explanation,
        body: "How COI and visible charges appear to be influencing current performance.",
      },
      {
        eyebrow: "Confidence Read",
        title: policyInterpretation.confidence_summary,
        body: "How complete the visible evidence stack appears right now.",
      },
      {
        eyebrow: "Best Next Move",
        title: policyAdvisorBrief.nextMove,
        body: "The first review path that appears most useful from the current file set.",
        accent: true,
      },
    ],
    [
      policyAdvisorBrief.nextMove,
      policyInterpretation.charge_summary_explanation,
      policyInterpretation.confidence_summary,
      policyInterpretation.growth_summary,
    ]
  );
  const policyAiContext = useMemo(
    () => ({
      lifePolicy,
      normalizedPolicy,
      normalizedAnalytics,
      statementRows: statementTimeline,
      comparisonSummary,
      policyInterpretation,
      policyAiSummary,
      iulV2,
      optimizationAnalysis,
      comparisonRow,
      ranking,
      trendSummary,
      generalLifeScorecard,
      reviewReport,
      chargeSummary,
      missingFields,
      basicPolicyAnalysis,
      adequacyReview,
    }),
    [
      adequacyReview,
      basicPolicyAnalysis,
      chargeSummary,
      comparisonRow,
      comparisonSummary,
      generalLifeScorecard,
      iulV2,
      lifePolicy,
      missingFields,
      normalizedAnalytics,
      normalizedPolicy,
      optimizationAnalysis,
      policyAiSummary,
      policyInterpretation,
      ranking,
      reviewReport,
      statementTimeline,
      trendSummary,
    ]
  );
  const policyAiComparisonOptions = useMemo(
    () =>
      insuranceRows
        .filter((row) => row.policy_id && row.policy_id !== policyId)
        .slice(0, 6)
        .map((row) => ({
          id: row.policy_id,
          label: row.product || row.carrier || `Policy ${row.policy_id}`,
          bundle: {
            comparisonRow: row,
            policyAiSummary: {
              status: row.ranking_status || row.status || "Unavailable",
              missingData: row.missing_fields || [],
            },
          },
        })),
    [insuranceRows, policyId]
  );
  const quickReviewSections = [
    { label: "Health Snapshot", section: !showUnifiedIulReader ? "interpretation" : "policy_overview" },
    { label: "Charge Drag", section: "charge_summary" },
    { label: "Evidence Gaps", section: "confidence" },
    { label: "Policy AI Assistant", section: "policy_ai_assistant" },
    { label: "Annual Review", section: "annual_review" },
  ];
  const primaryProtectionMetrics = [
    {
      label: "Coverage Confidence",
      value: formatConfidencePercent(gapAnalysis?.confidence) || "\u2014",
    },
    {
      label: "Funding Pattern",
      value: formatDisplayValue(basicPolicyAnalysis?.fundingPattern),
    },
    {
      label: "COI Trend",
      value: formatDisplayValue(basicPolicyAnalysis?.coiTrend),
    },
    {
      label: "Visible Gap Status",
      value: gapAnalysis?.coverageGap ? "Possible gap" : "No obvious gap",
    },
    {
      label: "Adequacy Status",
      value: formatDisplayValue(adequacyReview?.displayStatus),
    },
    {
      label: "Beneficiary Visibility",
      value:
        adequacyReview?.primaryBeneficiaryName || adequacyReview?.contingentBeneficiaryName
          ? [adequacyReview?.primaryBeneficiaryName, adequacyReview?.contingentBeneficiaryName].filter(Boolean).join(" / ")
          : adequacyReview?.beneficiaryStatusLabel || formatDisplayValue(adequacyReview?.beneficiaryVisibility),
    },
  ];
  const secondaryProtectionMetrics = [
    {
      label: "Owner Visible",
      value: adequacyReview?.ownerName || (adequacyReview?.ownerVisible ? "Yes" : "Limited"),
    },
    {
      label: "Insured Visible",
      value: adequacyReview?.insuredName || (adequacyReview?.insuredVisible ? "Yes" : "Limited"),
    },
    {
      label: "Joint Insured",
      value: adequacyReview?.jointInsuredName || (adequacyReview?.jointInsuredVisible ? "Yes" : "Limited"),
    },
    {
      label: "Ownership Structure",
      value: adequacyReview?.ownershipStructure || (adequacyReview?.trustOwned ? "Trust-style ownership" : "Limited"),
    },
    {
      label: "Payor Visibility",
      value: adequacyReview?.payorName || (adequacyReview?.payorVisible ? "Yes" : "Limited"),
    },
    {
      label: "Trustee Visibility",
      value: adequacyReview?.trusteeName || (adequacyReview?.trusteeVisible ? "Yes" : "Limited"),
    },
    {
      label: "Trust Name",
      value: adequacyReview?.trustName || (adequacyReview?.trustNameVisible ? "Yes" : "Limited"),
    },
    {
      label: "Benefit Option",
      value: adequacyReview?.benefitOption || (adequacyReview?.benefitOptionVisible ? "Visible" : "Limited"),
    },
    {
      label: "Rider Visibility",
      value: adequacyReview?.highlightedRiders?.length
        ? adequacyReview.highlightedRiders.join(" / ")
        : adequacyReview?.detectedRiders?.length
          ? adequacyReview.detectedRiders.join(" / ")
          : adequacyReview?.riderChargeVisible
            ? "Charge visible"
            : "Limited",
    },
    {
      label: "Protection Purpose",
      value: adequacyReview?.protectionPurposeLabels?.length
        ? adequacyReview.protectionPurposeLabels.join(" / ")
        : "Limited",
    },
    {
      label: "Beneficiary Shares",
      value:
        [
          adequacyReview?.primaryBeneficiaryShare ? `Primary ${adequacyReview.primaryBeneficiaryShare}` : "",
          adequacyReview?.contingentBeneficiaryShare ? `Contingent ${adequacyReview.contingentBeneficiaryShare}` : "",
        ]
          .filter(Boolean)
          .join(" / ") || "Limited",
    },
  ];

  const pageHeader = (
    <PageHeader
      eyebrow="In-Force Policy Intelligence"
      title={snapshotTitle}
      description={snapshotDescription}
      actions={
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => onNavigate?.("/insurance")} style={actionButtonStyle(false)}>
            Back
          </button>
          <button type="button" onClick={() => onNavigate?.("/insurance")} style={actionButtonStyle(false)}>
            Compare
          </button>
          <button
            type="button"
            onClick={() => setShowReviewReport((current) => !current)}
            style={reportActionButtonStyle(showReviewReport, false)}
          >
            {showReviewReport ? "Hide Review Report" : "Open Review Report"}
          </button>
          <button type="button" onClick={handlePrintReport} style={reportActionButtonStyle(false, true)}>
            Print Report
          </button>
          <button type="button" onClick={() => onNavigate?.("/insurance/life/upload")} style={actionButtonStyle(true)}>
            Upload
          </button>
        </div>
      }
    />
  );

  if (loading) {
    return (
      <div>
        {pageHeader}
        <SectionCard>
          <div style={{ color: "#64748b" }}>Loading policy detail...</div>
        </SectionCard>
      </div>
    );
  }

  if (!bundle.policy && !comparisonRow) {
    return (
      <div>
        {pageHeader}
        <EmptyState
          title="Policy not found"
          description={
            loadError || "This vaulted policy could not be loaded from the insurance intelligence workspace."
          }
        />
      </div>
    );
  }

  return (
    <div>
      {pageHeader}
      <div style={{ display: "grid", gap: "20px" }}>
          {showReviewReport ? (
            <ReportView
              title="Policy Review Report"
              subtitle="A structured export-ready review built from the current policy detail intelligence."
              report={reviewReport}
              onPrint={handlePrintReport}
            />
          ) : null}

          <section
            ref={(node) => setSectionRef("policy_overview", node)}
            style={{
              display: "grid",
              gap: "18px",
              padding: "24px 26px",
              borderRadius: "20px",
              background:
                "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(248,250,252,0.98) 60%, rgba(239,246,255,0.9) 100%)",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
              ...getSectionHighlight("policy_overview"),
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: "6px" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Policy Snapshot
                </div>
                <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>
                  {snapshotTitle}
                </div>
                <div style={{ fontSize: "14px", color: "#64748b" }}>{snapshotCarrier}</div>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <StatusBadge label={ranking?.status || "Limited"} tone={getTone(ranking?.status)} />
                <StatusBadge label={`Continuity ${ranking?.score ?? "\u2014"}`} tone={getTone(ranking?.status)} />
                <StatusBadge
                  label={`COI ${formatDisplayValue(comparisonRow?.coi_confidence)}`}
                  tone={getVisibilityTone(comparisonRow?.coi_confidence)}
                />
                <StatusBadge
                  label={gapAnalysis?.coverageGap ? "Gap Review Needed" : "Protection Check"}
                  tone={getProtectionTone(gapAnalysis?.coverageGap, gapAnalysis?.confidence)}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: "14px",
              }}
            >
              {snapshotMetrics.map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: "15px 16px",
                    borderRadius: "16px",
                    background: "rgba(255,255,255,0.72)",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ marginTop: "8px", fontSize: "22px", fontWeight: 750, color: "#0f172a" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                paddingTop: "4px",
              }}
            >
              {quickReviewSections.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => scrollToPolicySection(item.section)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    border: "1px solid rgba(148, 163, 184, 0.22)",
                    background: "rgba(255,255,255,0.82)",
                    color: "#0f172a",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "12px",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          <SectionCard
            title="Protection Confidence"
            subtitle="A high-level protection check built from visible death-benefit support, funding pattern, COI trend, and the current evidence trail."
          >
            <div style={{ display: "grid", gap: "16px" }}>
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
                {gapAnalysis?.coverageGap
                  ? "This policy shows visible protection pressure or incomplete support in the current read, so coverage should be reviewed before it is treated as complete."
                  : "No obvious protection gap is visible from the current extracted read, but confidence still depends on document depth and missing fields."}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                {primaryProtectionMetrics.map((item) => (
                  <div key={item.label} style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {item.label}
                    </div>
                    <div style={{ marginTop: "8px", fontSize: item.label === "Coverage Confidence" ? "22px" : "16px", fontWeight: 800, color: "#0f172a" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <details>
                <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Show More Protection Detail</summary>
                <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                  {secondaryProtectionMetrics.map((item) => (
                    <div key={item.label} style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {item.label}
                      </div>
                      <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              {basicPolicyAnalysis?.flags?.length > 0 ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Visibility Flags</div>
                  <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                    {basicPolicyAnalysis.flags.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>Protection Notes</div>
                {gapAnalysis?.notes?.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                    {gapAnalysis.notes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: "#475569" }}>
                    No additional protection notes are visible from the current extracted evidence.
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>Adequacy Review</div>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>
                  {adequacyReview?.headline || "Adequacy review is not available yet."}
                </div>
                {adequacyReview?.notes?.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                    {adequacyReview.notes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </SectionCard>

          {showUnifiedIulReader && iulReader ? (
            <IulReaderPanel reader={iulReader} results={readerResults} />
          ) : null}

          {!showUnifiedIulReader ? (
            <>
              {generalLifeScorecard ? (
                <SectionCard
                  title="Policy Health Snapshot"
                  subtitle="A plain-English policy health read before the deeper in-force performance interpretation."
                  accent="#bfdbfe"
                >
                  <div style={{ display: "grid", gap: "18px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "16px",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "grid", gap: "10px", maxWidth: "820px" }}>
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
                          {generalLifeScorecard.headline}
                        </div>
                        <div style={{ color: "#475569", lineHeight: "1.8" }}>{generalLifeScorecard.plainEnglish}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => scrollToPolicySection("interpretation")}
                        style={{
                          minWidth: "150px",
                          padding: "16px 18px",
                          borderRadius: "16px",
                          background: "#ffffff",
                          border: "1px solid #dbeafe",
                          display: "grid",
                          gap: "6px",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Overall Score
                        </div>
                        <div style={{ fontSize: "34px", fontWeight: 800, color: "#0f172a" }}>{generalLifeScorecard.overallScore}/100</div>
                        <StatusBadge
                          label={
                            generalLifeScorecard.overallScore >= 80
                              ? "Strong"
                              : generalLifeScorecard.overallScore >= 62
                                ? "Moderate"
                                : "Needs Attention"
                          }
                          tone={generalLifeScorecard.overallTone}
                        />
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                      {generalLifeScorecard.cards.map((card) => (
                        <button
                          type="button"
                          key={card.title}
                          onClick={() => scrollToPolicySection(getGeneralLifeScorecardSection(card.title))}
                          style={{
                            padding: "14px 16px",
                            borderRadius: "16px",
                            background: card.tone === "good" ? "#dcfce7" : card.tone === "warning" ? "#fef3c7" : "#fee2e2",
                            border:
                              card.tone === "good"
                                ? "1px solid #bbf7d0"
                              : card.tone === "warning"
                                  ? "1px solid #fde68a"
                                  : "1px solid #fecaca",
                            display: "grid",
                            gap: "8px",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "baseline" }}>
                            <div style={{ fontSize: "12px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>{card.title}</div>
                            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{card.score}</div>
                          </div>
                          <div style={{ color: "#334155", lineHeight: "1.7" }}>{card.summary}</div>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => scrollToPolicySection("interpretation")}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "16px",
                        background: "#ffffff",
                        border: "1px solid #dbeafe",
                        color: "#0f172a",
                        display: "grid",
                        gap: "8px",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                        Best Next Move
                      </div>
                      <div style={{ lineHeight: "1.7", fontWeight: 600 }}>{generalLifeScorecard.nextAction}</div>
                    </button>
                  </div>
                </SectionCard>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "18px", alignItems: "start" }}>
                <div ref={(node) => setSectionRef("charge_summary", node)} style={getSectionHighlight("charge_summary")}>
                  <SectionCard title="COI and Charge Drag" subtitle="The clearest plain-English read on cost of insurance, visible charges, and how much drag they may be creating.">
                    <div style={{ display: "grid", gap: "14px" }}>
                      <div
                        style={{
                          padding: "18px 20px",
                          borderRadius: "18px",
                          background: "linear-gradient(135deg, rgba(238,242,255,1) 0%, rgba(224,231,255,0.86) 55%, rgba(255,255,255,0.95) 100%)",
                          border: "1px solid rgba(99, 102, 241, 0.18)",
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#4c1d95", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Total COI
                        </div>
                        <div style={{ marginTop: "8px", fontSize: "34px", fontWeight: 800, color: "#0f172a" }}>
                          {formatDisplayValue(comparisonRow?.total_coi)}
                        </div>
                        <div style={{ marginTop: "10px", fontSize: "14px", color: "#4338ca", lineHeight: "1.6" }}>
                          {getCoiInterpretation(comparisonRow?.coi_source_kind, comparisonRow?.coi_confidence)}
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ color: "#64748b" }}>Continuity Score</div>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{ranking?.score ?? "\u2014"} {ranking?.status ? `(${ranking.status})` : ""}</div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ color: "#64748b" }}>COI Confidence</div>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{formatDisplayValue(comparisonRow?.coi_confidence)}</div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ color: "#64748b" }}>Visible Charges</div>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{formatCurrency(chargeSummary.total_visible_policy_charges ?? null)}</div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ color: "#64748b" }}>Statement Support</div>
                          <div style={{ fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{statementPresence}</div>
                        </div>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                <div ref={(node) => setSectionRef("confidence", node)} style={getSectionHighlight("confidence")}>
                  <SectionCard title="Evidence Gaps" subtitle="The biggest evidence gaps still affecting this in-force policy read.">
                    {groupedIssues.length > 0 ? (
                      <div style={{ display: "grid", gap: "14px" }}>
                        {groupedIssues.map((group) => (
                          <div key={group.title}>
                            <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>{group.title}</div>
                            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                              {group.items.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "14px 16px",
                          borderRadius: "14px",
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          color: "#166534",
                          fontWeight: 600,
                        }}
                      >
                        No critical missing data detected
                      </div>
                    )}
                  </SectionCard>
                </div>
              </div>
            </>
          ) : null}

          {!showUnifiedIulReader ? (
          <div ref={(node) => setSectionRef("interpretation", node)} style={getSectionHighlight("interpretation")}>
          <SectionCard
            title="Performance Interpretation"
            subtitle="A plain-English in-force policy read built from visible statements, charges, funding, strategy detail, and continuity support."
          >
            <div style={{ display: "grid", gap: "18px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "16px",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: "10px", maxWidth: "820px" }}>
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
                    {policyInterpretation.bottom_line_summary}
                  </div>
                  <div style={{ fontSize: "18px", lineHeight: "1.7", color: "#0f172a", fontWeight: 600 }}>
                    {policyInterpretation.policy_overview_summary}
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.8" }}>
                    {policyInterpretation.current_position_summary}
                  </div>
                </div>
                <StatusBadge
                  label={policyInterpretation.performance_assessment?.label || "Insufficient Visibility"}
                  tone={getInterpretationTone(policyInterpretation.performance_assessment?.status)}
                />
              </div>

              <div
                style={{
                  padding: "18px 20px",
                  borderRadius: "18px",
                  background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                }}
              >
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Performance Assessment
                </div>
                <div style={{ marginTop: "10px", fontSize: "16px", color: "#0f172a", lineHeight: "1.8", fontWeight: 600 }}>
                  {policyInterpretation.performance_assessment?.explanation}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {interpretationSignalCards.map((card) => (
                  <div key={card.eyebrow}>
                    {renderInterpretationCard(card)}
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Review Items</div>
                  {policyInterpretation.review_items?.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                      {policyInterpretation.review_items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "#475569", lineHeight: "1.7" }}>
                      No immediate review items are visible from the current policy evidence.
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Follow-Up Paths</div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {(policyInterpretation.interactive_followups || []).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleInterpretationFollowup(item)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "999px",
                          border: "1px solid #dbeafe",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                        title={item.prompt}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <details style={{ padding: "4px 0 0" }}>
                <summary style={{ cursor: "pointer", color: "#1d4ed8", fontWeight: 700 }}>
                  Open Deeper Interpretation Context
                </summary>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", marginTop: "14px" }}>
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>Strategy Interpretation</div>
                    <div style={{ color: "#475569", lineHeight: "1.8" }}>
                      {policyInterpretation.strategy_summary}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>Current Position Context</div>
                    <div style={{ color: "#475569", lineHeight: "1.8" }}>
                      {policyInterpretation.current_position_summary}
                    </div>
                  </div>
                </div>
              </details>
            </div>
            </SectionCard>
          </div>
          ) : null}

          <div ref={(node) => setSectionRef("policy_ai_assistant", node)} style={getSectionHighlight("policy_ai_assistant")}>
          <SectionCard
            title="Policy AI Assistant"
            subtitle="These answers are grounded in the uploaded policy data and visible statement history."
            accent="#bfdbfe"
          >
            <div style={{ display: "grid", gap: "18px" }}>
              <div
                style={{
                  display: "grid",
                  gap: "14px",
                  padding: "20px 22px",
                  borderRadius: "20px",
                  background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                  border: "1px solid rgba(147, 197, 253, 0.28)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: "8px", maxWidth: "820px" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Plain-English Summary
                    </div>
                    <div style={{ fontSize: "18px", lineHeight: "1.7", color: "#0f172a", fontWeight: 700 }}>
                      {policyAiSummary.summary}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <StatusBadge
                      label={lifePolicy?.meta?.policyTypeLabel || "Life Insurance Policy"}
                      tone="info"
                    />
                    {lifePolicy?.meta?.policyTypeDetection?.confidence ? (
                      <StatusBadge
                        label={`Type confidence ${formatConfidencePercent(lifePolicy.meta.policyTypeDetection.confidence)}`}
                        tone={
                          lifePolicy.meta.policyTypeDetection.confidence >= 0.8
                            ? "good"
                            : lifePolicy.meta.policyTypeDetection.confidence >= 0.6
                              ? "warning"
                              : "info"
                        }
                      />
                    ) : null}
                    <StatusBadge
                      label={
                        policyAiSummary.status === "strong"
                          ? "Performing Well"
                          : policyAiSummary.status === "moderate"
                            ? "Needs Review"
                            : policyAiSummary.status === "insufficient_data"
                              ? "Insufficient Data"
                              : "Below Expectations"
                      }
                      tone={getAiStatusTone(policyAiSummary.status)}
                    />
                  </div>
                </div>

                {lifePolicy?.meta?.policyType === "iul" && iulV2 ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "14px",
                      padding: "16px 18px",
                      borderRadius: "18px",
                      background: "#ffffff",
                      border: "1px solid rgba(147, 197, 253, 0.28)",
                    }}
                  >
                    <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        IUL Monitoring Read
                      </div>
                      <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>
                        {iulV2.summary.headline}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <StatusBadge
                        label={`Illustration ${iulV2.illustrationComparison.status.replace(/_/g, " ")}`}
                        tone={getIulStatusTone(iulV2.illustrationComparison.status)}
                      />
                      <StatusBadge
                        label={`Charge Drag ${iulV2.chargeAnalysis.chargeDragLevel}`}
                        tone={getIulStatusTone(iulV2.chargeAnalysis.chargeDragLevel)}
                      />
                      <StatusBadge
                        label={`Funding ${iulV2.fundingAnalysis.status}`}
                        tone={getIulStatusTone(iulV2.fundingAnalysis.status)}
                      />
                      <StatusBadge
                        label={`Risk ${iulV2.riskAnalysis.overallRisk}`}
                        tone={getIulStatusTone(iulV2.riskAnalysis.overallRisk)}
                      />
                      <StatusBadge
                        label={`Strategy ${iulV2.summary.strategyVisibility}`}
                        tone={getIulStatusTone(iulV2.summary.strategyVisibility)}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "grid", gap: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Illustration vs Actual</div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <StatusBadge
                              label={iulV2.illustrationComparison.status.replace(/_/g, " ")}
                              tone={getIulStatusTone(iulV2.illustrationComparison.status)}
                            />
                            <StatusBadge
                              label={`Confidence ${iulV2.illustrationComparison.confidence}`}
                              tone={
                                iulV2.illustrationComparison.confidence === "high"
                                  ? "good"
                                  : iulV2.illustrationComparison.confidence === "moderate"
                                    ? "warning"
                                    : "info"
                              }
                            />
                          </div>
                        </div>
                        <div style={{ color: "#475569", fontSize: "13px", lineHeight: "1.6" }}>
                          {iulV2.illustrationComparison.confidenceExplanation}
                        </div>
                        {iulV2.illustrationComparison.reviewSupport ? (
                          <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #dbeafe", display: "grid", gap: "8px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                Statement Match Support
                              </div>
                              <StatusBadge
                                label={iulV2.illustrationComparison.reviewSupport.supportStatus.replace(/_/g, " ")}
                                tone={
                                  iulV2.illustrationComparison.reviewSupport.supportStatus === "clean"
                                    ? "good"
                                    : iulV2.illustrationComparison.reviewSupport.supportStatus === "partial"
                                      ? "warning"
                                      : "info"
                                }
                              />
                            </div>
                            <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>
                              {iulV2.illustrationComparison.reviewSupport.headline}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "10px 12px" }}>
                                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Year Match</div>
                                <div style={{ marginTop: "4px", color: "#0f172a", fontWeight: 700 }}>
                                  {iulV2.illustrationComparison.reviewSupport.matchQuality.replace(/_/g, " ")}
                                </div>
                              </div>
                              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "10px 12px" }}>
                                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Chronology</div>
                                <div style={{ marginTop: "4px", color: "#0f172a", fontWeight: 700 }}>
                                  {iulV2.illustrationComparison.chronologySupport?.status?.replace(/_/g, " ") || "limited"}
                                </div>
                              </div>
                              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "10px 12px" }}>
                                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Selected Metric</div>
                                <div style={{ marginTop: "4px", color: "#0f172a", fontWeight: 700 }}>
                                  {iulV2.illustrationComparison.selectedMetricLabel || "Value"}
                                </div>
                              </div>
                            </div>
                            <div style={{ color: "#475569", lineHeight: "1.6" }}>
                              {iulV2.illustrationComparison.reviewSupport.note}
                            </div>
                          </div>
                        ) : null}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
                          <div>
                            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Policy-Year Match</div>
                            <div style={{ marginTop: "4px", color: "#0f172a", fontWeight: 700 }}>
                              {iulV2.illustrationComparison.policyYearAlignment?.actualPolicyYear ?? "?"} vs {iulV2.illustrationComparison.policyYearAlignment?.matchedPolicyYear ?? "?"}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              Illustrated {iulV2.illustrationComparison.selectedMetricLabel || "Value"}
                            </div>
                            <div style={{ marginTop: "4px", color: "#0f172a", fontWeight: 700 }}>
                              {iulV2.illustrationComparison.selectedMetricData?.illustratedDisplay || "Unavailable"}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              Actual {iulV2.illustrationComparison.selectedMetricLabel || "Value"}
                            </div>
                            <div style={{ marginTop: "4px", color: "#0f172a", fontWeight: 700 }}>
                              {iulV2.illustrationComparison.selectedMetricData?.actualDisplay || "Unavailable"}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Variance</div>
                            <div style={{ marginTop: "4px", color: "#0f172a", fontWeight: 700 }}>
                              {iulV2.illustrationComparison.varianceDisplay || "Unavailable"} ({iulV2.illustrationComparison.variancePercentDisplay || "Unavailable"})
                            </div>
                          </div>
                        </div>
                        {iulV2.illustrationComparison.reviewRecommendations?.length > 0 ? (
                          <div style={{ display: "grid", gap: "6px" }}>
                            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              Monitoring Next Steps
                            </div>
                            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                              {iulV2.illustrationComparison.reviewRecommendations.slice(0, 4).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {iulV2.illustrationComparison.drivers?.length > 0 ? (
                          <div style={{ display: "grid", gap: "6px" }}>
                            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Drivers</div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {iulV2.illustrationComparison.drivers.slice(0, 3).map((driver) => (
                                <div
                                  key={driver.key}
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: "999px",
                                    background: "#ffffff",
                                    border: "1px solid #dbeafe",
                                    color: "#1d4ed8",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {driver.label}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div style={{ color: "#0f172a", lineHeight: "1.7", fontWeight: 600 }}>
                          {iulV2.illustrationComparison.shortExplanation}
                        </div>
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Illustration vs Actual Read</div>
                        <div style={{ marginTop: "8px", color: "#0f172a", fontWeight: 700 }}>
                          {iulV2.illustrationComparison.context}
                        </div>
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Charge Drag Read</div>
                        <div style={{ marginTop: "8px", color: "#0f172a", fontWeight: 700 }}>
                          {iulV2.chargeAnalysis.explanation}
                        </div>
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Funding Read</div>
                        <div style={{ marginTop: "8px", color: "#0f172a", fontWeight: 700 }}>
                          {iulV2.fundingAnalysis.explanation}
                        </div>
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Strategy Read</div>
                        <div style={{ marginTop: "8px", color: "#0f172a", fontWeight: 700 }}>
                          {iulV2.strategyAnalysis.explanation}
                        </div>
                      </div>
                    </div>

                    {iulV2.missingData?.length > 0 ? (
                      <div style={{ display: "grid", gap: "8px" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>IUL V2 Missing Data</div>
                        <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                          {iulV2.missingData.slice(0, 5).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {optimizationAnalysis ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "14px",
                      padding: "16px 18px",
                      borderRadius: "18px",
                      background: "#ffffff",
                      border: "1px solid rgba(148, 163, 184, 0.18)",
                    }}
                  >
                    <div style={{ display: "grid", gap: "6px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Optimization
                      </div>
                      <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>
                        {optimizationAnalysis.explanation}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <StatusBadge
                        label={optimizationAnalysis.overallStatus.replace(/_/g, " ")}
                        tone={getOptimizationTone(optimizationAnalysis.overallStatus)}
                      />
                      <StatusBadge
                        label={`Priority ${optimizationAnalysis.priorityLevel}`}
                        tone={getOptimizationTone(optimizationAnalysis.priorityLevel)}
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "grid", gap: "10px" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Top Recommendations</div>
                        <div style={{ display: "grid", gap: "10px" }}>
                          {optimizationAnalysis.recommendations.slice(0, 2).map((item) => (
                            <div key={item.title} style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid #dbeafe", display: "grid", gap: "6px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                                <div style={{ color: "#0f172a", fontWeight: 700 }}>{item.title}</div>
                                <StatusBadge label={item.impact} tone={getOptimizationTone(item.impact)} />
                              </div>
                              <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.message}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "10px" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Risk Flags</div>
                        {optimizationAnalysis.risks.length > 0 ? (
                          <div style={{ display: "grid", gap: "10px" }}>
                            {optimizationAnalysis.risks.slice(0, 2).map((item) => (
                              <div key={item.type} style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.18)", display: "grid", gap: "6px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                                  <div style={{ color: "#0f172a", fontWeight: 700 }}>{item.type.replace(/_/g, " ")}</div>
                                  <StatusBadge label={item.severity} tone={getOptimizationTone(item.severity)} />
                                </div>
                                <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.message}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: "#475569", lineHeight: "1.7" }}>
                            No major optimization risk is standing out from the current visible data.
                          </div>
                        )}
                      </div>

                      <div style={{ padding: "14px 16px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "10px" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Opportunities</div>
                        {optimizationAnalysis.opportunities.length > 0 ? (
                          <div style={{ display: "grid", gap: "10px" }}>
                            {optimizationAnalysis.opportunities.slice(0, 2).map((item) => (
                              <div key={item.type} style={{ padding: "12px 14px", borderRadius: "14px", background: "#ffffff", border: "1px solid rgba(148, 163, 184, 0.18)", display: "grid", gap: "6px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                                  <div style={{ color: "#0f172a", fontWeight: 700 }}>{item.type.replace(/_/g, " ")}</div>
                                  <StatusBadge label={item.potentialImpact} tone={getOptimizationTone(item.potentialImpact)} />
                                </div>
                                <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.message}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: "#475569", lineHeight: "1.7" }}>
                            No clear optimization opportunity stands out beyond regular monitoring yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {policyAiSummary.insights.length > 0 ? (
                  <div style={{ display: "grid", gap: "10px" }}>
                    {policyAiSummary.insights.slice(0, 3).map((insight, index) => (
                      <div
                        key={`${insight.type}-${index}`}
                        style={{
                          padding: "14px 16px",
                          borderRadius: "16px",
                          background: "#ffffff",
                          border: "1px solid rgba(148, 163, 184, 0.18)",
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                          <StatusBadge
                            label={insight.type.charAt(0).toUpperCase() + insight.type.slice(1)}
                            tone={insight.severity === "high" ? "alert" : insight.severity === "medium" ? "warning" : "good"}
                          />
                          <StatusBadge
                            label={`${insight.severity.charAt(0).toUpperCase() + insight.severity.slice(1)} severity`}
                            tone={insight.severity === "high" ? "alert" : insight.severity === "medium" ? "warning" : "good"}
                          />
                        </div>
                        <div style={{ color: "#0f172a", lineHeight: "1.7", fontWeight: 600 }}>{insight.message}</div>
                        {insight.supporting_data?.length > 0 ? (
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            {insight.supporting_data.map((item) => (
                              <div
                                key={`${insight.type}-${item.label}`}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: "999px",
                                  background: "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                  color: "#475569",
                                  fontSize: "13px",
                                }}
                              >
                                <strong style={{ color: "#0f172a" }}>{item.label}:</strong> {item.value}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {policyAiSummary.missingData?.length > 0 ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>Missing Data Notes</div>
                    <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                      {policyAiSummary.missingData.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {lifePolicy?.meta?.policyTypeDetection?.evidence?.length > 0 ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>Policy Type Evidence</div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {lifePolicy.meta.policyTypeDetection.evidence.slice(0, 4).map((item) => (
                        <div
                          key={item}
                          style={{
                            padding: "8px 10px",
                            borderRadius: "999px",
                            background: "#ffffff",
                            border: "1px solid #dbeafe",
                            color: "#1d4ed8",
                            fontSize: "13px",
                            fontWeight: 600,
                          }}
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

                {!showUnifiedIulReader ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "12px",
                      padding: "16px 18px",
                      borderRadius: "18px",
                      background: "#ffffff",
                      border: "1px solid rgba(148, 163, 184, 0.18)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: "6px", maxWidth: "820px" }}>
                        <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {policyAdvisorBrief.eyebrow}
                        </div>
                        <div style={{ color: "#0f172a", fontWeight: 800, fontSize: "18px", lineHeight: "1.5" }}>
                          {policyAdvisorBrief.title}
                        </div>
                      </div>
                      <StatusBadge label={`Current read: ${policyAdvisorBrief.scoreLabel}`} tone={generalLifeScorecard?.overallTone || "info"} />
                    </div>

                    <div style={{ color: "#475569", lineHeight: "1.75" }}>{policyAdvisorBrief.summary}</div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                      <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "6px" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Confidence Read</div>
                        <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{policyAdvisorBrief.confidenceSummary}</div>
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "6px" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Funding Read</div>
                        <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{policyAdvisorBrief.fundingRead}</div>
                      </div>
                      <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "grid", gap: "6px" }}>
                        <div style={{ fontSize: "11px", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Best Next Move</div>
                        <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{policyAdvisorBrief.nextMove}</div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <PolicyAiAssistantCard
                  policyBundle={policyAiContext}
                  comparisonOptions={policyAiComparisonOptions}
                  onLatestEntryChange={setLatestPolicyAiEntry}
                />
              </div>
            </SectionCard>

          <div ref={(node) => setSectionRef("annual_review", node)} style={getSectionHighlight("annual_review")}>
          <SectionCard
            title="Annual Review"
            subtitle="A factual change review built from live statement history, shown oldest to newest."
          >
            {trendSummary.periods_count > 0 ? (
              <div style={{ display: "grid", gap: "18px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Oldest Statement
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                      {formatDate(trendSummary.oldest_statement_date)}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Newest Statement
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                      {formatDate(trendSummary.newest_statement_date)}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Periods Reviewed
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                      {trendSummary.periods_count}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Detail Continuity
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>
                      {formatDisplayValue(trendSummary.continuity_trend)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Change Summary
                  </div>
                  <div style={{ marginTop: "10px", fontSize: "16px", lineHeight: "1.7", color: "#0f172a", fontWeight: 600 }}>
                    {trendSummary.summary}
                  </div>
                  <ul style={{ margin: "12px 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#475569" }}>
                    {trendSummary.concise_change_notes.slice(0, 5).map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No annual review yet"
                description="Statement history will appear here once vaulted statement rows are available for this policy."
              />
            )}
          </SectionCard>
          </div>
          </div>

          <SectionCard title="Statement Timeline" subtitle="Statement records shown oldest to newest using live vaulted statement rows.">
            {trendSummary.timeline_rows.length > 0 ? (
              <div
                style={{
                  overflowX: "auto",
                  padding: "12px",
                  borderRadius: "18px",
                  background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                }}
              >
                <div style={{ minWidth: isTablet ? "920px" : "1060px", display: "grid", gap: "10px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isTablet ? "130px 140px 160px 130px 120px 130px 130px" : "140px 150px 170px 140px 130px 140px 140px",
                      gap: "12px",
                      padding: "0 8px 10px 8px",
                      borderBottom: "1px solid #dbe3f1",
                      fontSize: "11px",
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    <div>Statement Date</div>
                    <div>Cash Value</div>
                    <div>Cash Surrender Value</div>
                    <div>Loan Balance</div>
                    <div>COI</div>
                    <div>Charges</div>
                    <div>Detail Quality</div>
                  </div>

                  {trendSummary.timeline_rows.map((statement, index) => {
                    const detailTone = getDetailQualityTone(
                      statement.detail_quality || getStatementCompletenessCue(statement)
                    );
                    return (
                    <div
                      key={`${statement.id || statement.statement_date || index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: isTablet ? "130px 140px 160px 130px 120px 130px 130px" : "140px 150px 170px 140px 130px 140px 140px",
                        gap: "12px",
                        padding: "14px 8px",
                        borderTop: index === 0 ? "none" : "1px solid rgba(226, 232, 240, 0.8)",
                        borderRadius: "14px",
                        background: index % 2 === 0 ? "rgba(255,255,255,0.95)" : "rgba(248,250,252,0.95)",
                        color: "#0f172a",
                        alignItems: "center",
                      }}
                    >
                      <div>{formatDate(statement.statement_date)}</div>
                      <div>{formatCurrency(statement.cash_value)}</div>
                      <div>{formatCurrency(statement.cash_surrender_value)}</div>
                      <div>{formatCurrency(statement.loan_balance)}</div>
                      <div>{formatCurrency(statement.cost_of_insurance)}</div>
                      <div>{formatCurrency(statement.visible_charges ?? null)}</div>
                      <div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            background: detailTone.background,
                            color: detailTone.color,
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {statement.detail_quality || getStatementCompletenessCue(statement)}
                        </span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState
                title="No statement timeline yet"
                description="Statement records will appear here once vaulted statement rows are available for this policy."
              />
            )}
          </SectionCard>

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>Advanced Detail</summary>
            <div style={{ marginTop: "14px", display: "grid", gap: "16px" }}>
              <SectionCard title="Debug Payloads" subtitle="Live comparison and charge payloads used by the policy detail view.">
                <div style={{ display: "grid", gap: "14px" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>Missing Fields</div>
                    <pre style={{ margin: 0, fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                      {JSON.stringify(missingFields, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>Charge Summary</div>
                    <pre style={{ margin: 0, fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                      {JSON.stringify(chargeSummary || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>Comparison Summary</div>
                    <pre style={{ margin: 0, fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                      {JSON.stringify(comparisonSummary || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>COI Source Kind</div>
                    <pre style={{ margin: 0, fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                      {JSON.stringify(comparisonRow?.coi_source_kind || null, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>Ranking Inputs</div>
                    <pre style={{ margin: 0, fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                      {JSON.stringify(
                        {
                          inputs: ranking?.inputs || {},
                          penalties: ranking?.penalties || [],
                          final_score: ranking?.score ?? null,
                          status: ranking?.status || null,
                          explanation: ranking?.statusExplanation || "",
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>Trend Summary</div>
                    <pre style={{ margin: 0, fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                      {JSON.stringify(trendSummary.debug || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>Policy Interpretation</div>
                    <pre style={{ margin: 0, fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                      {JSON.stringify(policyInterpretation.debug || {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>Policy Assistant</div>
                    <pre style={{ margin: 0, fontSize: "12px", color: "#475569", overflowX: "auto" }}>
                        {JSON.stringify(
                          latestPolicyAiEntry
                            ? {
                                intent: latestPolicyAiEntry.intent || null,
                                question: latestPolicyAiEntry.question || null,
                                evidence: latestPolicyAiEntry.response?.evidence || [],
                                missing_data: latestPolicyAiEntry.response?.missingData || [],
                                disclaimers: latestPolicyAiEntry.response?.disclaimers || [],
                                iul_v2: iulV2,
                              }
                            : { note: "No policy AI assistant question asked in this session." },
                          null,
                          2
                        )}
                    </pre>
                  </div>
                </div>
              </SectionCard>
            </div>
          </details>

          {loadError || errors.insurancePortfolio ? (
            <div style={{ color: "#b91c1c", fontSize: "13px" }}>
              Load note: {loadError || errors.insurancePortfolio}
            </div>
          ) : null}
      </div>
    </div>
  );
}
