import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import {
  buildPolicyInterpretation,
  buildPolicyReviewReport,
  buildPolicyTrendSummary,
  buildVaultedPolicyRank,
} from "../lib/domain/intelligenceEngine";
import { buildPolicyInsightSummary } from "../lib/ai/policyInsightEngine";
import { answerPolicyQuestion as answerPolicyAssistantQuestion } from "../lib/ai/policyQuestionHandlers";
import { normalizeLifePolicy } from "../lib/insurance/normalizeLifePolicy";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  getVaultedPolicyAnalytics,
  getVaultedPolicyById,
  getVaultedPolicyDocuments,
  getVaultedPolicySnapshots,
  getVaultedPolicyStatements,
} from "../lib/supabase/vaultedPolicies";

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

function getAiStatusTone(status) {
  if (status === "strong") return "good";
  if (status === "moderate") return "warning";
  if (status === "insufficient_data") return "info";
  return "alert";
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px" }}>
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
        {report.sections.map((section) => renderReportSection(section))}
      </div>
    </SectionCard>
  );
}

export default function PolicyDetailPage({ policyId, onNavigate }) {
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
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantHistory, setAssistantHistory] = useState([]);

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

  function handleAssistantPrompt(questionText) {
    const cleanQuestion = String(questionText || "").trim();
    if (!cleanQuestion) return;

    const response = answerPolicyAssistantQuestion(cleanQuestion, {
      lifePolicy,
      normalizedPolicy,
      normalizedAnalytics,
      statementRows: statementTimeline,
      comparisonSummary,
      interpretation: policyInterpretation,
      insightSummary: policyAiSummary,
    });

    setAssistantHistory((current) => [
      {
        id: `${Date.now()}-${current.length}`,
        question: cleanQuestion,
        response,
      },
      ...current,
    ].slice(0, 6));
    setAssistantQuestion("");
  }

  function handleAssistantSubmit(event) {
    event.preventDefault();
    handleAssistantPrompt(assistantQuestion);
  }

  function scrollToPolicySection(section) {
    const target = sectionRefs.current[section];
    if (target) {
      setActiveFollowupSection(section);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
      const policyScope = { userId: debug.authUserId, source: "policy_detail_page" };

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
          analyticsResult.error?.message ||
          statementsResult.error?.message ||
          ""
      );
      setLoading(false);

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
    setAssistantHistory([]);
    setAssistantQuestion("");
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
      }),
    [
      bundle.policy,
      chargeSummary,
      comparisonRow,
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

  const snapshotMetrics = [
    { label: "Cash Value", value: formatDisplayValue(comparisonRow?.cash_value) },
    { label: "Death Benefit", value: formatDisplayValue(comparisonRow?.death_benefit) },
    { label: "Total COI", value: formatDisplayValue(comparisonRow?.total_coi) },
    { label: "Latest Statement", value: formatDate(comparisonRow?.latest_statement_date) },
  ];
  const assistantPrompts = lifePolicy?.meta?.suggestedQuestions || [
    "What kind of policy is this?",
    "Is this policy healthy?",
    "What should I review first?",
    "Is the data complete enough to trust?",
  ];
  const latestAssistantEntry = assistantHistory[0] || null;

  return (
    <div>
      <PageHeader
        eyebrow="Insurance"
        title={snapshotTitle}
        description={snapshotCarrier}
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

      {loading ? (
        <SectionCard>
          <div style={{ color: "#64748b" }}>Loading policy detail...</div>
        </SectionCard>
      ) : !bundle.policy && !comparisonRow ? (
        <EmptyState
          title="Policy not found"
          description={
            loadError || "This vaulted policy could not be loaded from the insurance intelligence workspace."
          }
        />
      ) : (
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
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px", alignItems: "start" }}>
            <SectionCard
              title="Cost of Insurance"
              subtitle="Current COI visibility and source confidence from vaulted policy intelligence."
              accent="#c7d2fe"
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background:
                      "linear-gradient(135deg, rgba(238,242,255,1) 0%, rgba(224,231,255,0.86) 55%, rgba(255,255,255,0.95) 100%)",
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

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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
                      Source Kind
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                      {formatDisplayValue(comparisonRow?.coi_source_kind)}
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
                      Confidence
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                      {formatDisplayValue(comparisonRow?.coi_confidence)}
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <div ref={(node) => setSectionRef("confidence", node)} style={getSectionHighlight("confidence")}>
            <SectionCard title="Data Confidence" subtitle="Live confidence signals derived from vaulted policy comparison data.">
              <div style={{ display: "grid", gap: "12px" }}>
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "14px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Continuity Score
                  </div>
                  <div style={{ marginTop: "8px", display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>
                      {ranking?.score ?? "\u2014"}
                    </div>
                    <div style={{ fontSize: "14px", color: "#475569" }}>
                      {ranking?.status || "Limited"}
                    </div>
                  </div>
                  <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.6" }}>
                    {ranking?.statusExplanation || "Continuity inputs are still limited."}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ color: "#64748b" }}>COI Confidence</div>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>
                    {formatDisplayValue(comparisonRow?.coi_confidence)}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ color: "#64748b" }}>Charge Visibility</div>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>
                    {formatDisplayValue(comparisonRow?.charge_visibility_status)}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ color: "#64748b" }}>Statement Data Presence</div>
                  <div style={{ fontWeight: 700, color: "#0f172a", textAlign: "right" }}>{statementPresence}</div>
                </div>
              </div>
            </SectionCard>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px", alignItems: "start" }}>
            <div ref={(node) => setSectionRef("charge_summary", node)} style={getSectionHighlight("charge_summary")}>
            <SectionCard title="Charge Breakdown" subtitle="Visible charge components from the current vaulted analytics bundle.">
              <div style={{ display: "grid", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ color: "#64748b" }}>COI</div>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{formatCurrency(chargeSummary.total_coi ?? null)}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ color: "#64748b" }}>Admin Fees</div>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{formatCurrency(chargeSummary.total_admin_fees ?? null)}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ color: "#64748b" }}>Expense Charges</div>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{formatCurrency(chargeSummary.total_expense_charges ?? null)}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ color: "#64748b" }}>Rider Charges</div>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{formatCurrency(chargeSummary.total_rider_charges ?? null)}</div>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                    paddingTop: "10px",
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ color: "#0f172a", fontWeight: 700 }}>Total Visible Charges</div>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {formatCurrency(chargeSummary.total_visible_policy_charges ?? null)}
                  </div>
                </div>
              </div>
            </SectionCard>
            </div>

            <div ref={(node) => setSectionRef("confidence", node)} style={getSectionHighlight("confidence")}>
            <SectionCard title="Missing / Weak Data" subtitle="Grouped review cues that affect current visibility and confidence.">
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

          <div ref={(node) => setSectionRef("interpretation", node)} style={getSectionHighlight("interpretation")}>
          <SectionCard
            title="Policy Interpretation"
            subtitle="A plain-English policy read built from visible statements, charges, funding, strategy detail, and continuity support."
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Growth Interpretation</div>
                  <div style={{ color: "#475569", lineHeight: "1.8" }}>
                    {policyInterpretation.growth_summary}
                  </div>
                </div>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Charge Interpretation</div>
                  <div style={{ color: "#475569", lineHeight: "1.8" }}>
                    {policyInterpretation.charge_summary_explanation}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Strategy Interpretation</div>
                  <div style={{ color: "#475569", lineHeight: "1.8" }}>
                    {policyInterpretation.strategy_summary}
                  </div>
                </div>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Confidence Summary</div>
                  <div style={{ color: "#475569", lineHeight: "1.8" }}>
                    {policyInterpretation.confidence_summary}
                  </div>
                </div>
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
            </div>
          </SectionCard>
          </div>

          <SectionCard
            title="Ask Vault AI"
            subtitle="A policy-aware assistant that explains this policy using the analytics and statement evidence already loaded on this page."
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
                      AI Summary
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

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {assistantPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleAssistantPrompt(prompt)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "999px",
                      border: "1px solid #dbeafe",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAssistantSubmit} style={{ display: "grid", gap: "12px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <input
                    value={assistantQuestion}
                    onChange={(event) => setAssistantQuestion(event.target.value)}
                    placeholder="Ask a question about this policy..."
                    style={{
                      padding: "14px 16px",
                      borderRadius: "14px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!assistantQuestion.trim()}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "12px",
                      border: "none",
                      background: assistantQuestion.trim() ? "#0f172a" : "#94a3b8",
                      color: "#ffffff",
                      cursor: assistantQuestion.trim() ? "pointer" : "not-allowed",
                      fontWeight: 700,
                      width: "100%",
                    }}
                  >
                    Ask
                  </button>
                </div>
              </form>

              {latestAssistantEntry ? (
                <div
                  style={{
                    display: "grid",
                    gap: "16px",
                    padding: "20px 22px",
                    borderRadius: "20px",
                    background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                    border: "1px solid rgba(147, 197, 253, 0.28)",
                  }}
                >
                    <div style={{ display: "grid", gap: "8px" }}>
                      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Latest Answer
                      </div>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{latestAssistantEntry.question}</div>
                      <div style={{ color: "#0f172a", lineHeight: "1.8", fontSize: "16px", fontWeight: 600 }}>
                        {latestAssistantEntry.response.answer}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <StatusBadge
                        label="Grounded answer"
                        tone="info"
                      />
                      <StatusBadge
                        label={`Confidence: ${latestAssistantEntry.response.confidence}`}
                        tone={
                          latestAssistantEntry.response.confidence === "high"
                            ? "good"
                            : latestAssistantEntry.response.confidence === "moderate"
                              ? "warning"
                              : "info"
                        }
                      />
                    </div>

                    {latestAssistantEntry.response.supporting_data?.length > 0 ? (
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Supporting Evidence</div>
                        <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                          {latestAssistantEntry.response.supporting_data.map((point) => (
                            <li key={`${point.label}-${point.value}`}>
                              <strong style={{ color: "#0f172a" }}>{point.label}:</strong> {point.value}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {latestAssistantEntry.response.missing_data?.length > 0 ? (
                      <div>
                        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Missing Data</div>
                        <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                          {latestAssistantEntry.response.missing_data.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div>
                      <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "10px" }}>Follow-Up Prompts</div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {(latestAssistantEntry.response.suggested_followups || []).map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                          onClick={() => handleAssistantPrompt(prompt)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "999px",
                            border: "1px solid #dbeafe",
                            background: "#ffffff",
                            color: "#1d4ed8",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                ) : (
                  <div
                    style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "#f8fafc",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                      color: "#475569",
                      lineHeight: "1.8",
                    }}
                  >
                  Ask a focused question to get a policy-specific answer grounded in live statements, charges, performance support, and known evidence gaps.
                  </div>
                )}

              {assistantHistory.length > 1 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Session History</div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {assistantHistory.slice(1, 4).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleAssistantPrompt(entry.question)}
                        style={{
                          padding: "14px 16px",
                          borderRadius: "14px",
                          border: "1px solid rgba(148, 163, 184, 0.18)",
                          background: "#ffffff",
                          textAlign: "left",
                          cursor: "pointer",
                          display: "grid",
                          gap: "6px",
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{entry.question}</div>
                        <div style={{ color: "#475569", lineHeight: "1.7" }}>{entry.response.answer}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
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
                <div style={{ minWidth: "1060px", display: "grid", gap: "10px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 150px 170px 140px 130px 140px 140px",
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
                        gridTemplateColumns: "140px 150px 170px 140px 130px 140px 140px",
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
                          latestAssistantEntry
                            ? {
                              response_confidence: latestAssistantEntry.response?.confidence || null,
                              supporting_data: latestAssistantEntry.response?.supporting_data || [],
                              suggested_followups: latestAssistantEntry.response?.suggested_followups || [],
                              }
                            : { note: "No assistant question asked in this session." },
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
      )}
    </div>
  );
}
