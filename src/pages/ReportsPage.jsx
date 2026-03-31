import { useMemo, useState } from "react";
import {
  buildHouseholdIntelligence,
  buildHouseholdReviewReport,
  buildHouseholdRiskContinuityMap,
} from "../lib/domain/platformIntelligence";
import {
  getHouseholdReviewDigestSnapshot,
  getHouseholdReviewWorkflowState,
  annotateReviewWorkflowItems,
  buildHouseholdReviewDigest,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import {
  buildInsurancePortfolioBrief,
  buildInsurancePortfolioReport,
  buildPolicyListInterpretation,
  buildVaultedPolicyRank,
} from "../lib/domain/intelligenceEngine";
import QuickActionGrid from "../components/onboarding/QuickActionGrid";
import SetupChecklist from "../components/onboarding/SetupChecklist";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  buildHouseholdOnboardingChecklist,
  getHouseholdBlankState,
} from "../lib/onboarding/isHouseholdBlank";
import {
  summarizeAssetsModule,
  summarizeBankingModule,
  summarizeEstateModule,
  summarizePortalModule,
  summarizeVaultModule,
} from "../lib/domain/platformIntelligence/moduleReadiness";

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

function reportButtonStyle(active = false) {
  return {
    ...buttonStyle(false),
    border: active ? "1px solid #93c5fd" : "1px solid rgba(15, 23, 42, 0.10)",
    background: active ? "#eff6ff" : "#ffffff",
    color: active ? "#1d4ed8" : "#0f172a",
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

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : value;
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
            <table style={{ width: "100%", minWidth: "820px", borderCollapse: "collapse" }}>
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

function ReportView({ report, onPrint, label }) {
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
            {label}
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

export default function ReportsPage({ onNavigate }) {
  const { householdState, intelligenceBundle: bundle, insuranceRows: rows, debug, errors, loadingStates } = usePlatformShellData();
  const [activeReport, setActiveReport] = useState("household");
  const loadError = errors.householdData || errors.insurancePortfolio;
  const reviewScope = useMemo(
    () => ({
      householdId: householdState.context.householdId,
      userId: debug.authUserId || null,
    }),
    [debug.authUserId, householdState.context.householdId]
  );

  const intelligence = useMemo(() => (bundle ? buildHouseholdIntelligence(bundle) : null), [bundle]);
  const householdMap = useMemo(
    () => buildHouseholdRiskContinuityMap(bundle || {}, intelligence, rows),
    [bundle, intelligence, rows]
  );
  const reviewWorkflowState = useMemo(
    () => getHouseholdReviewWorkflowState(reviewScope),
    [reviewScope]
  );
  const reviewDigestSnapshot = useMemo(
    () => getHouseholdReviewDigestSnapshot(reviewScope),
    [reviewScope]
  );
  const queueItems = useMemo(
    () => annotateReviewWorkflowItems(householdMap.review_priorities || [], reviewWorkflowState),
    [householdMap.review_priorities, reviewWorkflowState]
  );
  const reviewDigest = useMemo(
    () => buildHouseholdReviewDigest(queueItems, reviewDigestSnapshot),
    [queueItems, reviewDigestSnapshot]
  );
  const householdReport = useMemo(
    () =>
      buildHouseholdReviewReport({
        bundle: bundle || {},
        intelligence,
        householdMap,
        queueItems,
        reviewDigest,
      }),
    [bundle, intelligence, householdMap, queueItems, reviewDigest]
  );

  const rankedPolicies = useMemo(() => {
    return [...rows]
      .map((row) => ({
        ...row,
        ranking: buildVaultedPolicyRank(row),
        interpretation: buildPolicyListInterpretation(row),
      }))
      .sort((left, right) => right.ranking.score - left.ranking.score);
  }, [rows]);

  const insurancePortfolioBrief = useMemo(
    () => buildInsurancePortfolioBrief(rankedPolicies),
    [rankedPolicies]
  );
  const insurancePortfolioReport = useMemo(
    () => buildInsurancePortfolioReport(rankedPolicies),
    [rankedPolicies]
  );
  const assetsSummary = useMemo(() => summarizeAssetsModule(bundle?.assets || []), [bundle]);
  const vaultSummary = useMemo(() => summarizeVaultModule(bundle?.documents || []), [bundle]);
  const portalSummary = useMemo(
    () =>
      summarizePortalModule({
        portals: bundle?.portals || [],
        readiness: bundle?.portalReadiness || {},
      }),
    [bundle]
  );
  const bankingSummary = useMemo(
    () =>
      summarizeBankingModule({
        assets: bundle?.assets || [],
        portals: bundle?.portals || [],
        contacts: bundle?.contacts || [],
      }),
    [bundle]
  );
  const estateSummary = useMemo(
    () =>
      summarizeEstateModule({
        contacts: bundle?.contacts || [],
        assets: bundle?.assets || [],
      }),
    [bundle]
  );
  const moduleReadinessRows = useMemo(
    () => [
      { module: "Assets", summary: assetsSummary },
      { module: "Vault", summary: vaultSummary },
      { module: "Portals", summary: portalSummary },
      { module: "Banking", summary: bankingSummary },
      { module: "Estate", summary: estateSummary },
    ],
    [assetsSummary, vaultSummary, portalSummary, bankingSummary, estateSummary]
  );
  const moduleReadinessCounts = useMemo(
    () =>
      moduleReadinessRows.reduce(
        (accumulator, row) => {
          const status = row.summary?.status || "Needs Review";
          if (status === "Ready") accumulator.ready += 1;
          else if (status === "Building") accumulator.building += 1;
          else accumulator.needsReview += 1;
          return accumulator;
        },
        { ready: 0, building: 0, needsReview: 0 }
      ),
    [moduleReadinessRows]
  );
  const blankHousehold = useMemo(() => getHouseholdBlankState(bundle || {}, rows), [bundle, rows]);
  const onboardingChecklist = useMemo(
    () => buildHouseholdOnboardingChecklist(blankHousehold, bundle || {}, rows),
    [blankHousehold, bundle, rows]
  );
  const onboardingQuickActions = [
    {
      id: "reports-add-property",
      label: "Add Property",
      description: "Create the first property record so household reporting has real asset context.",
      route: "/property",
    },
    {
      id: "reports-upload-policy",
      label: "Upload Insurance Policy",
      description: "Start the life insurance flow with a baseline illustration or statement.",
      route: "/insurance/life/upload",
    },
    {
      id: "reports-add-contact",
      label: "Add Contact",
      description: "Add an emergency or advisor contact to begin the continuity directory.",
      route: "/contacts",
    },
    {
      id: "reports-upload-document",
      label: "Upload Document",
      description: "Add the first household file to begin report-ready evidence collection.",
      route: "/upload-center",
    },
    {
      key: "module_readiness",
      title: "Module Readiness Snapshot",
      status: "Live",
      description: "High-level operating read across assets, vault, portals, banking, and estate.",
      metrics: [
        { label: "Ready", value: moduleReadinessCounts.ready },
        { label: "Building", value: moduleReadinessCounts.building },
        { label: "Needs Review", value: moduleReadinessCounts.needsReview },
      ],
    },
  ];

  const totalCoverage = rankedPolicies
    .map((row) => parseDisplayNumber(row.death_benefit))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);
  const totalCoi = rankedPolicies
    .map((row) => parseDisplayNumber(row.total_coi))
    .filter((value) => value !== null)
    .reduce((sum, value) => sum + value, 0);

  function handlePrintActiveReport() {
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.print(), 80);
    }
  }

  if (blankHousehold.isBlank && !loadingStates.householdData && !loadingStates.insurancePortfolio && !loadError) {
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
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: "8px", maxWidth: "860px" }}>
            <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a" }}>
              Reports and Exports
            </div>
            <div style={{ color: "#475569", lineHeight: "1.8" }}>
              No household analysis yet. Reports become available once real household records are added, so this screen stays neutral until your setup has enough evidence to support trustworthy output.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => onNavigate?.("/dashboard")} style={buttonStyle(true)}>
              Open Dashboard
            </button>
            <button type="button" onClick={() => onNavigate?.("/upload-center")} style={buttonStyle(false)}>
              Upload First Document
            </button>
          </div>
        </section>

        <section
          style={{
            padding: "26px 28px",
            borderRadius: "24px",
            background: "#ffffff",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            display: "grid",
            gap: "18px",
          }}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Report readiness starts with setup progress</div>
            <div style={{ color: "#475569", lineHeight: "1.8" }}>
              VaultedShield will start generating household and insurance reports after you add meaningful records like properties, policies, documents, and contacts. Until then, setup progress is the right signal to show.
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
              { label: "Assets", value: blankHousehold.setupCounts.assets },
              { label: "Documents", value: blankHousehold.setupCounts.documents },
              { label: "Policies", value: blankHousehold.setupCounts.policies },
              { label: "Emergency Contacts", value: blankHousehold.setupCounts.emergencyContacts },
              { label: "Portals", value: blankHousehold.setupCounts.portals },
            ].map((metric) => (
              <div
                key={metric.label}
                style={{
                  padding: "14px 16px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                }}
              >
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{metric.label}</div>
                <div style={{ marginTop: "8px", fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>{metric.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "18px",
          }}
        >
          <SetupChecklist
            items={onboardingChecklist}
            title="Complete the core household setup"
            subtitle="These steps unlock real reporting later, but they are not a readiness score."
          />
          <QuickActionGrid
            actions={onboardingQuickActions}
            title="Use the fastest setup paths"
            subtitle="Jump into the live creation flows that move the household from blank to report-ready."
            onAction={(action) => action.route && onNavigate?.(action.route)}
          />
        </section>
      </div>
    );
  }

  const reportCards = [
    {
      key: "household",
      title: "Household Review Brief",
      status: "Live",
      description: "Cross-asset continuity, workflow, and change digest for the current household.",
      metrics: [
        { label: "Readiness", value: displayValue(householdMap.overall_score) },
        { label: "Active Queue", value: queueItems.filter((item) => item.workflow_status !== "reviewed" || item.changed_since_review).length },
        { label: "Reopened", value: reviewDigest.reopened_count },
      ],
    },
    {
      key: "insurance",
      title: "Insurance Portfolio Report",
      status: rankedPolicies.length > 0 ? "Live" : "Waiting",
      description: "Continuity-ranked policy portfolio summary with focus areas and priority review queue.",
      metrics: [
        { label: "Policies", value: rankedPolicies.length },
        { label: "Coverage", value: totalCoverage > 0 ? formatCurrency(totalCoverage) : "—" },
        { label: "COI Exposure", value: totalCoi > 0 ? formatCurrency(totalCoi) : "—" },
      ],
    },
    {
      key: "policy_detail",
      title: "Single Policy Reviews",
      status: rankedPolicies.length > 0 ? "Live in policy detail" : "Waiting",
      description: "Open any policy detail page for interpretation, AI assistant, annual review, and printable policy report.",
      metrics: [
        { label: "Top Policy", value: rankedPolicies[0]?.product || "—" },
        { label: "Status", value: rankedPolicies[0]?.ranking?.status || "—" },
        { label: "Route", value: rankedPolicies[0]?.policy_id ? `/insurance/${rankedPolicies[0].policy_id}` : "—" },
      ],
    },
  ];

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
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a" }}>
            Reports and Exports
          </div>
          <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "860px" }}>
            VaultedShield now has enough real intelligence depth to support live household and insurance reporting. This hub centralizes the strongest current artifacts instead of leaving reports scattered across individual screens.
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" onClick={handlePrintActiveReport} style={buttonStyle(true)}>
            Print Active Report
          </button>
          <button type="button" onClick={() => onNavigate?.("/dashboard")} style={buttonStyle(false)}>
            Open Dashboard
          </button>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "18px",
        }}
      >
        {reportCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => {
              if (card.key === "policy_detail" && rankedPolicies[0]?.policy_id) {
                onNavigate?.(`/insurance/${rankedPolicies[0].policy_id}`);
                return;
              }
              setActiveReport(card.key);
            }}
            style={{
              padding: "22px",
              borderRadius: "20px",
              border: activeReport === card.key ? "1px solid #93c5fd" : "1px solid rgba(15, 23, 42, 0.08)",
              background: activeReport === card.key ? "#eff6ff" : "#ffffff",
              textAlign: "left",
              display: "grid",
              gap: "14px",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{card.title}</div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: activeReport === card.key ? "#1d4ed8" : "#475569" }}>
                {card.status}
              </div>
            </div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>{card.description}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
              {card.metrics.map((metric) => (
                <div key={`${card.key}-${metric.label}`}>
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {metric.label}
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          </button>
        ))}
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
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveReport("household")}
            style={reportButtonStyle(activeReport === "household")}
          >
            Household Brief
          </button>
          <button
            type="button"
            onClick={() => setActiveReport("insurance")}
            style={reportButtonStyle(activeReport === "insurance")}
          >
            Insurance Portfolio
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.(rankedPolicies[0]?.policy_id ? `/insurance/${rankedPolicies[0].policy_id}` : "/insurance")}
            style={reportButtonStyle(false)}
          >
            Open Policy Review
          </button>
        </div>

        {activeReport === "insurance" ? (
          <ReportView report={insurancePortfolioReport} onPrint={handlePrintActiveReport} label="Portfolio Report" />
        ) : (
          <ReportView report={householdReport} onPrint={handlePrintActiveReport} label="Household Report" />
        )}
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
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Module Readiness Snapshot</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            Reports now carry the same high-level readiness model used by the module hubs, so operating context for assets, vault, portals, banking, and estate is visible here too instead of living in separate corners of the app.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          {moduleReadinessRows.map((row) => (
            <div
              key={row.module}
              style={{
                padding: "18px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{row.module}</div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>{row.summary.status}</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{row.summary.headline}</div>
              <div style={{ display: "grid", gap: "6px", color: "#64748b", fontSize: "13px" }}>
                {row.summary.notes.slice(0, 2).map((note) => (
                  <div key={`${row.module}-${note}`}>{note}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: "18px",
          padding: "26px 28px",
          borderRadius: "24px",
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Strategic Report Readout</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            The audit showed that reporting depth already existed in several parts of the app, but the central reports route was still shell-only. This update turns Reports into a real output hub that reflects the strongest live intelligence already available.
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
            <li>Household reporting is now tied to the live continuity map, workflow queue, and review digest.</li>
            <li>Insurance reporting is now available from both the insurance module and the central reports hub.</li>
            <li>Single-policy reporting remains strongest inside Policy Detail, where the interpretation and assistant evidence are deepest.</li>
          </ul>
        </div>

        <div
          style={{
            padding: "20px",
            borderRadius: "18px",
            background: "#f8fafc",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            display: "grid",
            gap: "12px",
          }}
        >
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Current Report Readiness</div>
          <div style={{ display: "grid", gap: "10px", color: "#0f172a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span>Household Review</span>
              <strong>{bundle ? "Live" : "Loading"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span>Insurance Portfolio</span>
              <strong>{rankedPolicies.length > 0 ? "Live" : "Waiting"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span>Single Policy Review</span>
              <strong>{rankedPolicies.length > 0 ? "Live" : "Waiting"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span>Cross-module Export Packet</span>
              <strong>Next Layer</strong>
            </div>
          </div>
        </div>
      </section>

      {loadingStates.householdData || loadingStates.insurancePortfolio ? (
        <div style={{ color: "#475569", fontSize: "14px" }}>Loading reports data...</div>
      ) : null}

      {loadError ? (
        <div style={{ color: "#991b1b", fontSize: "14px" }}>{loadError}</div>
      ) : null}

      {activeReport === "insurance" && insurancePortfolioBrief ? (
        <div style={{ color: "#475569", fontSize: "13px", lineHeight: "1.7" }}>
          Portfolio brief: {insurancePortfolioBrief.summary}
        </div>
      ) : null}
    </div>
  );
}
