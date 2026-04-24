import { useMemo, useState } from "react";
import {
  buildHouseholdIntelligence,
  buildHouseholdReviewReport,
} from "../lib/domain/platformIntelligence";
import {
  getHouseholdReviewDigestSnapshot,
  getHouseholdReviewWorkflowState,
  buildHouseholdReviewDigest,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import {
  buildInsurancePortfolioBrief,
  buildInsurancePortfolioReport,
  buildPolicyListInterpretation,
  buildVaultedPolicyRank,
} from "../lib/domain/intelligenceEngine";
import OperatingGraphSummaryCards from "../components/household/OperatingGraphSummaryCards";
import QuickActionGrid from "../components/onboarding/QuickActionGrid";
import SetupChecklist from "../components/onboarding/SetupChecklist";
import { FriendlyActionTile } from "../components/shared/FriendlyIntelligenceUI";
import PlainLanguageBridge from "../components/shared/PlainLanguageBridge";
import { buildPropertyOperatingGraphSummary } from "../lib/assetLinks/linkedContext";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { getPolicyDetailRoute, getPolicyEntryLabel, isIulShowcasePolicy } from "../lib/navigation/insurancePolicyRouting";
import {
  buildHouseholdOnboardingChecklist,
  getHouseholdBlankState,
} from "../lib/onboarding/isHouseholdBlank";
import {
  buildModuleReadinessOverview,
  summarizeAssetsModule,
  summarizeBankingModule,
  summarizeEstateModule,
  summarizePortalModule,
  summarizeVaultModule,
} from "../lib/domain/platformIntelligence/moduleReadiness";
import {
  buildDashboardCommandCenter,
  buildEmergencyAccessCommand,
  buildHousingContinuityCommand,
} from "../lib/domain/platformIntelligence/continuityCommandCenter";
import {
  buildHouseholdPriorityEngine,
  buildHouseholdScorecard,
} from "../lib/domain/platformIntelligence/householdOperatingSystem";
import { buildWorkflowAwareHouseholdContext } from "../lib/domain/platformIntelligence/workflowMemory";
import { buildHouseholdReviewQueueItems } from "../lib/domain/platformIntelligence/reviewWorkspaceData";
import { useDemoMode } from "../lib/demo/DemoModeContext";

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
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "-" : value;
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

function scrollToReportsSection(sectionId) {
  if (typeof document === "undefined") return;
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function buildExecutiveSummaryLines({
  householdMap,
  reviewDigest,
  moduleReadinessRows,
  rankedPolicies,
  operatingGraphSummary,
}) {
  const lines = [];
  if (householdMap?.bottom_line) lines.push(householdMap.bottom_line);
  if (reviewDigest?.summary) lines.push(reviewDigest.summary);

  const needsReviewModules = moduleReadinessRows
    .filter((row) => row.status === "Needs Review")
    .map((row) => row.module);
  const buildingModules = moduleReadinessRows
    .filter((row) => row.status === "Building")
    .map((row) => row.module);

  if (needsReviewModules.length > 0) {
    lines.push(`Modules needing the most reinforcement right now: ${needsReviewModules.join(", ")}.`);
  } else if (buildingModules.length > 0) {
    lines.push(`Modules still building toward stronger household coverage: ${buildingModules.join(", ")}.`);
  } else {
    lines.push("Core module readiness is broadly usable across the currently tracked household surfaces.");
  }

  if (rankedPolicies.length > 0) {
    lines.push(`Insurance reporting is live across ${rankedPolicies.length} visible polic${rankedPolicies.length === 1 ? "y" : "ies"}.`);
  } else {
    lines.push("Insurance reporting will deepen once at least one saved policy is visible.");
  }

  if ((operatingGraphSummary?.propertyCount || 0) > 0) {
    lines.push(
      `${operatingGraphSummary.completeCount || 0} complete property stack${operatingGraphSummary.completeCount === 1 ? "" : "s"} and ${operatingGraphSummary.partialCount || 0} partially connected stack${operatingGraphSummary.partialCount === 1 ? "" : "s"} are currently visible.`
    );
  }

  return lines.slice(0, 4);
}

export default function ReportsPage({ onNavigate }) {
  const { reportCue } = useDemoMode();
  const { householdState, intelligenceBundle: bundle, insuranceRows: rows, debug, errors, loadingStates } = usePlatformShellData();
  const [selectedReport, setSelectedReport] = useState("household");
  const activeReport = reportCue?.reportKey || selectedReport;
  const loadError = errors.householdData || errors.insurancePortfolio;
  const reviewScope = useMemo(
    () => ({
      householdId: householdState.context.householdId,
      userId: debug.authUserId || null,
    }),
    [debug.authUserId, householdState.context.householdId]
  );

  const intelligence = useMemo(() => (bundle ? buildHouseholdIntelligence(bundle) : null), [bundle]);
  const reviewWorkflowState = useMemo(
    () => getHouseholdReviewWorkflowState(reviewScope),
    [reviewScope]
  );
  const reviewDigestSnapshot = useMemo(
    () => getHouseholdReviewDigestSnapshot(reviewScope),
    [reviewScope]
  );
  const { householdMap, queueItems } = useMemo(
    () =>
      buildHouseholdReviewQueueItems({
        bundle: bundle || {},
        intelligence,
        savedPolicyRows: rows || [],
        reviewWorkflowState,
      }),
    [bundle, intelligence, reviewWorkflowState, rows]
  );
  const reviewDigest = useMemo(
    () => buildHouseholdReviewDigest(queueItems, reviewDigestSnapshot),
    [queueItems, reviewDigestSnapshot]
  );
  const commandCenter = useMemo(
    () =>
      buildDashboardCommandCenter({
        queueItems,
        topActions: [],
        reviewDigest,
        householdMap,
      }),
    [householdMap, queueItems, reviewDigest]
  );
  const housingCommandCenter = useMemo(
    () => buildHousingContinuityCommand(bundle || {}),
    [bundle]
  );
  const emergencyAccessCommand = useMemo(
    () => buildEmergencyAccessCommand(bundle || {}),
    [bundle]
  );
  const baseHouseholdScorecard = useMemo(() => buildHouseholdScorecard(householdMap), [householdMap]);
  const workflowAwareHouseholdContext = useMemo(
    () =>
      buildWorkflowAwareHouseholdContext({
        householdMap,
        queueItems,
        reviewDigest,
        commandCenter,
        housingCommand: housingCommandCenter,
        emergencyAccessCommand,
        bundle,
      }),
    [
      bundle,
      commandCenter,
      emergencyAccessCommand,
      householdMap,
      housingCommandCenter,
      queueItems,
      reviewDigest,
    ]
  );
  const householdScorecard = useMemo(
    () => workflowAwareHouseholdContext.scorecard || baseHouseholdScorecard,
    [baseHouseholdScorecard, workflowAwareHouseholdContext.scorecard]
  );
  const assistantHouseholdMap = workflowAwareHouseholdContext.householdMap || householdMap;
  const assistantReviewDigest = workflowAwareHouseholdContext.reviewDigest || reviewDigest;
  const activeQueueItems = workflowAwareHouseholdContext.activeQueueItems || queueItems;
  const resolvedQueueItems = workflowAwareHouseholdContext.resolvedQueueItems || [];
  const workflowResolutionMemory = workflowAwareHouseholdContext.resolutionMemory || {
    activeIssueCount: activeQueueItems.length,
    resolvedIssueCount: resolvedQueueItems.length,
    recentlyResolved: [],
  };
  const scoreLift = Math.max(
    0,
    Number(householdScorecard?.overallScore || 0) - Number(baseHouseholdScorecard?.overallScore || 0)
  );
  const householdPriorityEngine = useMemo(
    () =>
      workflowAwareHouseholdContext.priorityEngine ||
      buildHouseholdPriorityEngine({
        householdMap,
        commandCenter,
        housingCommand: housingCommandCenter,
        emergencyAccessCommand,
        bundle,
      }),
    [
      bundle,
      commandCenter,
      emergencyAccessCommand,
      householdMap,
      housingCommandCenter,
      workflowAwareHouseholdContext.priorityEngine,
    ]
  );
  const householdReport = useMemo(
    () =>
      buildHouseholdReviewReport({
        bundle: bundle || {},
        intelligence,
        householdMap: assistantHouseholdMap,
        queueItems: activeQueueItems,
        reviewDigest: assistantReviewDigest,
      }),
    [activeQueueItems, assistantHouseholdMap, assistantReviewDigest, bundle, intelligence]
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
      buildModuleReadinessOverview("Assets", assetsSummary),
      buildModuleReadinessOverview("Vault", vaultSummary),
      buildModuleReadinessOverview("Portals", portalSummary),
      buildModuleReadinessOverview("Banking", bankingSummary),
      buildModuleReadinessOverview("Estate", estateSummary),
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
  const operatingGraphSummary = useMemo(
    () => buildPropertyOperatingGraphSummary(bundle || {}),
    [bundle]
  );
  const executiveSummaryLines = useMemo(
    () =>
      buildExecutiveSummaryLines({
        householdMap,
        reviewDigest,
        moduleReadinessRows,
        rankedPolicies,
        operatingGraphSummary,
      }),
    [householdMap, moduleReadinessRows, operatingGraphSummary, rankedPolicies, reviewDigest]
  );
  const blankHousehold = useMemo(() => getHouseholdBlankState(bundle || {}, rows), [bundle, rows]);
  const reportsVerdict = useMemo(() => {
    if (activeQueueItems.length === 0 && (householdScorecard?.overallScore || 0) >= 80) {
      return {
        label: "Strong",
        summary: "The household report picture reads clearly, with little active review pressure and enough structure to support a calm executive summary.",
      };
    }
    if (activeQueueItems.length <= 2) {
      return {
        label: "Stable",
        summary: "The reporting layer is usable and organized, with only a small amount of review work still affecting the story.",
      };
    }
    if (activeQueueItems.length <= 5) {
      return {
        label: "Watch",
        summary: "The report story is visible, but a few active issues still deserve attention before you treat it as fully settled.",
      };
    }
    return {
      label: "Needs Review",
      summary: "The reporting layer already shows real value, but the best presentation is still to start with the summary and be honest about the active work remaining.",
    };
  }, [activeQueueItems.length, householdScorecard?.overallScore]);
  const reportsWelcomeGuide = useMemo(() => {
    const topPriority = householdPriorityEngine.priorities[0] || null;
    const readyModules = moduleReadinessCounts.ready + moduleReadinessCounts.building;

    return {
      title: "See what is ready, what improved, and what still needs attention",
      summary: reportsVerdict.summary,
      transition: topPriority
        ? `Start with the short status and progress story, then open ${topPriority.title.toLowerCase()} or a deeper report packet only when you want the supporting detail.`
        : "Start with the short status and progress story, then open a deeper report packet only when you want the supporting detail.",
      quickFacts: [
        `Household status: ${householdScorecard?.overallStatus || "Starter"} at ${displayValue(householdScorecard?.overallScore)}.`,
        `${activeQueueItems.length} active review item${activeQueueItems.length === 1 ? "" : "s"} and ${resolvedQueueItems.length} completed review${resolvedQueueItems.length === 1 ? "" : "s"} are shaping the report story.`,
        scoreLift > 0 ? `Completed work is currently lifting the household read by +${scoreLift}.` : "Completed work is still being remembered even where the score lift is modest.",
        `${readyModules} core module${readyModules === 1 ? "" : "s"} are already report-ready or actively building toward it.`,
      ],
      cards: [
        {
          label: "Current Status",
          value: reportsVerdict.label,
          detail: executiveSummaryLines[0] || "The top of this page is designed to work as an executive read before any deeper packet is opened.",
        },
        {
          label: "What Changed",
          value: resolvedQueueItems.length > 0 ? `${resolvedQueueItems.length} completed review${resolvedQueueItems.length === 1 ? "" : "s"}` : "No completed reviews yet",
          detail:
            workflowResolutionMemory.recentlyResolved.length > 0
              ? workflowResolutionMemory.recentlyResolved.slice(0, 2).join(" | ")
              : "As review work is completed, this page highlights progress instead of showing only open issues.",
        },
        {
          label: "What To Open First",
          value: topPriority?.title || "Household Review Brief",
          detail:
            topPriority?.blocker ||
            "Open the household brief first for the cleanest read, then move into insurance or executive export layers only when needed.",
        },
      ],
    };
  }, [
    activeQueueItems.length,
    executiveSummaryLines,
    householdPriorityEngine.priorities,
    householdScorecard?.overallScore,
    householdScorecard?.overallStatus,
    moduleReadinessCounts.building,
    moduleReadinessCounts.ready,
    reportsVerdict,
    resolvedQueueItems.length,
    scoreLift,
    workflowResolutionMemory.recentlyResolved,
  ]);
  const reportsFasciaCards = useMemo(() => {
    const topPriority = householdPriorityEngine.priorities[0] || null;
    const activeReviewTone = activeQueueItems.length > 5 ? "alert" : activeQueueItems.length > 0 ? "warning" : "good";
    const statusTone =
      reportsVerdict.label === "Strong" || reportsVerdict.label === "Stable"
        ? "good"
        : reportsVerdict.label === "Needs Review"
          ? "warning"
          : "info";

    return [
      {
        label: "Executive Status",
        value: reportsVerdict.label,
        detail: executiveSummaryLines[0] || "The report opens with the simplest household story before any export or module detail.",
        tone: statusTone,
      },
      {
        label: "Active Reviews",
        value: activeQueueItems.length > 0 ? `${activeQueueItems.length} open item${activeQueueItems.length === 1 ? "" : "s"}` : "No active items",
        detail:
          activeQueueItems.length > 0
            ? "These are the items still shaping the report story and worth reviewing first."
            : "The active queue is quiet right now, so the report can lead with progress and readiness.",
        tone: activeReviewTone,
        actionLabel: activeQueueItems.length > 0 ? "Open Review Workspace" : undefined,
        onAction: activeQueueItems.length > 0 ? () => onNavigate?.("/review-workspace") : undefined,
      },
      {
        label: "Completed Progress",
        value: resolvedQueueItems.length > 0 ? `${resolvedQueueItems.length} completed review${resolvedQueueItems.length === 1 ? "" : "s"}` : "Progress will appear here",
        detail:
          scoreLift > 0
            ? `Completed work is currently lifting the readiness read by +${scoreLift}.`
            : "Completed work is still remembered here even when the visible lift is modest.",
        tone: resolvedQueueItems.length > 0 ? "good" : "neutral",
      },
      {
        label: "Best Report To Open",
        value: topPriority?.title || "Household Brief",
        detail:
          topPriority?.blocker ||
          "Open the household brief first for the cleanest read, then move into executive or insurance packets when needed.",
        tone: "info",
        actionLabel: "Open Household Brief",
        onAction: () => {
          setSelectedReport("household");
          scrollToReportsSection("reports-active-view");
        },
      },
    ];
  }, [
    activeQueueItems.length,
    executiveSummaryLines,
    householdPriorityEngine.priorities,
    onNavigate,
    reportsVerdict.label,
    resolvedQueueItems.length,
    scoreLift,
  ]);
  const reportsActionTiles = useMemo(
    () => [
      {
        key: "reports-status",
        kicker: "Executive Status",
        title: reportsFasciaCards[0]?.value || reportsVerdict.label,
        detail: reportsFasciaCards[0]?.detail || reportsVerdict.summary,
        metric: `${displayValue(householdScorecard?.overallScore)} score`,
        tone: reportsFasciaCards[0]?.tone || "info",
        statusLabel: "Simple Read",
      },
      {
        key: "reports-active",
        kicker: "Open Work",
        title: reportsFasciaCards[1]?.value || "No active items",
        detail: reportsFasciaCards[1]?.detail || "These items still shape the report story.",
        metric: `${activeQueueItems.length} active item${activeQueueItems.length === 1 ? "" : "s"}`,
        tone: reportsFasciaCards[1]?.tone || "warning",
        statusLabel: activeQueueItems.length > 0 ? "Needs Review" : "Calm Right Now",
        actionLabel: reportsFasciaCards[1]?.actionLabel,
        onAction: reportsFasciaCards[1]?.onAction,
      },
      {
        key: "reports-progress",
        kicker: "Progress",
        title: reportsFasciaCards[2]?.value || "Progress will appear here",
        detail: reportsFasciaCards[2]?.detail || "Completed work is remembered here.",
        metric: scoreLift > 0 ? `+${scoreLift} lift` : `${resolvedQueueItems.length} completed`,
        tone: reportsFasciaCards[2]?.tone || "good",
        statusLabel: resolvedQueueItems.length > 0 ? "Recently Improved" : "Building",
      },
      {
        key: "reports-next",
        kicker: "Best Report To Open",
        title: reportsFasciaCards[3]?.value || "Household Brief",
        detail: reportsFasciaCards[3]?.detail || "Open the report that fits the audience.",
        metric: selectedReport === "household" ? "Household view active" : "Executive path ready",
        tone: reportsFasciaCards[3]?.tone || "info",
        statusLabel: "Guided Action",
        actionLabel: reportsFasciaCards[3]?.actionLabel,
        onAction: reportsFasciaCards[3]?.onAction,
      },
    ],
    [
      activeQueueItems.length,
      householdScorecard?.overallScore,
      reportsFasciaCards,
      reportsVerdict.label,
      reportsVerdict.summary,
      resolvedQueueItems.length,
      scoreLift,
      selectedReport,
    ]
  );
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
      description: "Add the first household file to begin building report evidence.",
      route: "/upload-center",
    },
    {
      key: "module_readiness",
      title: "Platform Snapshot",
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
              Reports
            </div>
            <div style={{ color: "#475569", lineHeight: "1.8" }}>
              Reports unlock once the household has enough real records to support a trustworthy read. Until then, this page stays focused on the setup steps that create report-ready evidence.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => onNavigate?.("/dashboard")} style={buttonStyle(true)}>
              Open Guided Dashboard
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
              VaultedShield starts producing stronger household and insurance reporting after you add meaningful records like policies, documents, contacts, and core assets. Until then, setup progress is the clearest signal to show.
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
            subtitle="Jump into the live creation flows that move the household from blank to evidence-ready."
            onAction={(action) => action.route && onNavigate?.(action.route)}
          />
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "18px",
          }}
        >
          <div
            style={{
              padding: "26px 28px",
              borderRadius: "24px",
              background: "#ffffff",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Best first reporting packet</div>
            <div style={{ color: "#475569", lineHeight: "1.8" }}>
              One good policy, one property or account, one shared document, and one key household contact are usually enough to make the reporting side feel real.
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
              <li style={{ lineHeight: "1.7" }}>Life policy illustration or annual statement</li>
              <li style={{ lineHeight: "1.7" }}>Property, banking, or retirement record</li>
              <li style={{ lineHeight: "1.7" }}>Household document in the vault</li>
              <li style={{ lineHeight: "1.7" }}>Primary contact or advisor record</li>
            </ul>
          </div>

          <div
            style={{
              padding: "26px 28px",
              borderRadius: "24px",
              background: "#ffffff",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              display: "grid",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>What appears first</div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
              <li style={{ lineHeight: "1.7" }}>Current readiness, active work, and progress already made</li>
              <li style={{ lineHeight: "1.7" }}>Insurance portfolio review and top-policy routing</li>
              <li style={{ lineHeight: "1.7" }}>A cleaner priority view for follow-up items</li>
            </ul>
          </div>
        </section>
      </div>
    );
  }

  const reportCards = [
    {
      key: "executive",
      title: "Executive Summary",
      status: bundle ? "Live" : "Loading",
      description: "Top-line household read, review pressure, module watchpoints, and insurance visibility in one export-oriented surface.",
      metrics: [
        { label: "Bottom Line", value: assistantHouseholdMap?.overall_score ?? "-" },
        { label: "Active Work", value: activeQueueItems.length },
        { label: "Modules Needing Review", value: moduleReadinessCounts.needsReview },
      ],
    },
    {
      key: "household",
      title: "Household Summary",
      status: "Live",
      description: "Cross-asset continuity, workflow, and change digest for the current household.",
      metrics: [
        { label: "Readiness", value: displayValue(assistantHouseholdMap?.overall_score) },
        { label: "Active Work", value: activeQueueItems.length },
        { label: "Completed Reviews", value: resolvedQueueItems.length },
      ],
    },
    {
      key: "insurance",
      title: "Insurance Portfolio Report",
      status: rankedPolicies.length > 0 ? "Live" : "Waiting",
      description: "Continuity-ranked policy portfolio summary with focus areas and priority review queue.",
      metrics: [
        { label: "Policies", value: rankedPolicies.length },
        { label: "Coverage", value: totalCoverage > 0 ? formatCurrency(totalCoverage) : "-" },
        { label: "COI Exposure", value: totalCoi > 0 ? formatCurrency(totalCoi) : "-" },
      ],
    },
    {
      key: "policy_detail",
      title: isIulShowcasePolicy(rankedPolicies[0]) ? "IUL Review" : "Single Policy Detail",
      status: rankedPolicies.length > 0 ? (isIulShowcasePolicy(rankedPolicies[0]) ? "Flagship review ready" : "Ready in policy detail") : "Waiting",
      description: isIulShowcasePolicy(rankedPolicies[0])
        ? "Open the flagship IUL review view for verdict, supporting detail, annual review, and printable policy reporting."
        : "Open any policy detail page for interpretation, AI assistant, annual review, and printable policy report.",
      metrics: [
        { label: "Top Policy", value: rankedPolicies[0]?.product || "-" },
        { label: "Status", value: rankedPolicies[0]?.ranking?.status || "-" },
        { label: "Route", value: rankedPolicies[0]?.policy_id ? getPolicyDetailRoute(rankedPolicies[0]) : "-" },
      ],
    },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <PlainLanguageBridge
        eyebrow="Executive View"
        title={reportsWelcomeGuide.title}
        summary={reportsWelcomeGuide.summary}
        transition={reportsWelcomeGuide.transition}
        quickFacts={reportsWelcomeGuide.quickFacts}
        cards={reportsWelcomeGuide.cards}
        primaryActionLabel="Open Household Brief"
        onPrimaryAction={() => {
          setSelectedReport("household");
          scrollToReportsSection("reports-active-view");
        }}
        secondaryActionLabel="See Report Choices"
        onSecondaryAction={() => scrollToReportsSection("report-cards")}
        guideTitle="Use this page in three passes"
        guideDescription="Start with the executive story, then check progress and active work, and only open the deeper report when you want supporting detail, export, or module-level detail."
        guideSteps={[
          {
            label: "Step 1",
            title: "Read the short status first",
            detail: "The top of the page is meant to answer what is okay, what changed, and what deserves attention without making you read the full packet.",
          },
          {
            label: "Step 2",
            title: "Check progress before open issues",
            detail: "Completed reviews and readiness lift help show the household is moving forward, not just accumulating work.",
          },
          {
            label: "Step 3",
            title: "Open the report that fits the audience",
            detail: "Use household, executive, or insurance report views depending on whether the audience is a family, advisor, or decision-maker.",
          },
        ]}
        translatedTerms={[
          {
            term: "Household Score",
            meaning: "A simple operating read of how complete and review-ready the household currently looks.",
          },
          {
            term: "Active Reviews",
            meaning: "Items still affecting the report story right now and worth looking at next.",
          },
          {
            term: "Completed Reviews",
            meaning: "Work already handled and kept out of the active queue unless new evidence changes the story.",
          },
          {
            term: "Module Readiness",
            meaning: "How usable each major part of the platform already is for real reporting.",
          },
        ]}
        depthTitle="Open the deeper report only when you want supporting detail, export, or module breakdown"
        depthDescription="The report layers below are where the platform earns respect, but the first read should stay calm and executive."
        depthPrimaryActionLabel="Jump To Active Report"
        onDepthPrimaryAction={() => scrollToReportsSection("reports-active-view")}
        depthSecondaryActionLabel="Print Current Report"
        onDepthSecondaryAction={handlePrintActiveReport}
        showAnalysisDivider={false}
      />

      <section style={{ display: "grid", gap: "10px" }}>
        <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
          Choose Your Lane
        </div>
        <div style={{ color: "#475569", lineHeight: "1.75", maxWidth: "56rem" }}>
          Start with the report path that fits the audience, then open the fuller packet only when you want exports, module detail, or supporting proof.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "14px",
          }}
        >
          {reportsActionTiles.map((tile) => (
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
          gap: "18px",
          padding: "26px 28px",
          borderRadius: "24px",
          background: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Home And Financing Snapshot</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            Property, mortgage, and homeowners now stay in one report lane so the home picture can be reviewed together instead of as three separate modules.
          </div>
        </div>

        {renderReportFactsGrid(housingCommandCenter.metrics, 4)}

        <div style={{ display: "grid", gap: "12px" }}>
          {housingCommandCenter.blockers.length > 0 ? (
            housingCommandCenter.blockers.map((item) => (
              <div
                key={`report-housing-${item.id}`}
                style={{
                  padding: "18px 20px",
                  borderRadius: "18px",
                  background: "#f8fafc",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "5px 9px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: item.urgencyMeta.accent,
                        background: item.urgencyMeta.background,
                        border: item.urgencyMeta.border,
                      }}
                    >
                      {item.urgencyMeta.badge}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "5px 9px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#475569",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      {item.staleLabel}
                    </span>
                  </div>
                </div>
                <div style={{ color: "#0f172a", lineHeight: "1.7" }}>{item.blocker}</div>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.consequence}</div>
                <div>
                  <button type="button" onClick={() => onNavigate?.(item.route)} style={buttonStyle(false)}>
                    {item.nextAction}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                padding: "18px 20px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                color: "#475569",
                lineHeight: "1.7",
              }}
            >
              No major home or financing blockers are standing out right now, so this part of the household looks relatively settled.
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
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Current Readiness And Priorities</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            Reports now carry the same operating scorecard and ranked priorities as the dashboard, so exported review stays tied to what matters most right now.
          </div>
        </div>

        {renderReportFactsGrid(
          [
            { label: "Household Score", value: householdScorecard.overallScore ?? "-" },
            { label: "Status", value: householdScorecard.overallStatus || "Starter" },
            { label: "Weakest Dimension", value: householdScorecard.weakestDimension?.label || "-" },
            { label: "Strongest Dimension", value: householdScorecard.strongestDimension?.label || "-" },
          ],
          4
        )}

        {renderReportFactsGrid(
          householdScorecard.dimensions.map((dimension) => ({
            label: dimension.label,
            value: `${dimension.score ?? "-"} - ${dimension.status}`,
          })),
          5
        )}

        <div style={{ display: "grid", gap: "12px" }}>
          {householdPriorityEngine.priorities.map((item) => (
            <div
              key={`report-priority-${item.id}`}
              style={{
                padding: "18px 20px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: "4px" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {item.source}
                  </div>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "5px 9px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: item.urgencyMeta.accent,
                      background: item.urgencyMeta.background,
                      border: item.urgencyMeta.border,
                    }}
                  >
                    {item.urgencyMeta.label}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "5px 9px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#475569",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {item.impactLabel}
                  </span>
                </div>
              </div>
              <div style={{ color: "#0f172a", lineHeight: "1.7" }}>{item.blocker}</div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.consequence}</div>
              <div>
                <button type="button" onClick={() => onNavigate?.(item.route)} style={buttonStyle(false)}>
                  {item.nextAction}
                </button>
              </div>
            </div>
          ))}
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
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Emergency Cash / Access</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            Banking liquidity and portal recovery now stay in one report lane so emergency access risk is visible as a single operating system, not two separate module stories.
          </div>
        </div>

        {renderReportFactsGrid(emergencyAccessCommand.metrics, 4)}

        <div style={{ display: "grid", gap: "12px" }}>
          {emergencyAccessCommand.blockers.length > 0 ? (
            emergencyAccessCommand.blockers.map((item) => (
              <div
                key={`report-emergency-${item.id}`}
                style={{
                  padding: "18px 20px",
                  borderRadius: "18px",
                  background: "#f8fafc",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "5px 9px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: item.urgencyMeta.accent,
                        background: item.urgencyMeta.background,
                        border: item.urgencyMeta.border,
                      }}
                    >
                      {item.urgencyMeta.badge}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "5px 9px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#475569",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      {item.staleLabel}
                    </span>
                  </div>
                </div>
                <div style={{ color: "#0f172a", lineHeight: "1.7" }}>{item.blocker}</div>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.consequence}</div>
                <div>
                  <button type="button" onClick={() => onNavigate?.(item.route)} style={buttonStyle(false)}>
                    {item.nextAction}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                padding: "18px 20px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                color: "#475569",
                lineHeight: "1.7",
              }}
            >
              No major emergency cash or access blockers are standing out right now, so this part of the household looks relatively settled.
            </div>
          )}
        </div>
      </section>

      <section
        id="report-cards"
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
            data-demo-id={card.key === "insurance" ? "reports-insurance-card" : undefined}
            onClick={() => {
              if (card.key === "policy_detail" && rankedPolicies[0]?.policy_id) {
                onNavigate?.(getPolicyDetailRoute(rankedPolicies[0]));
                return;
              }
              setSelectedReport(card.key);
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
        id="reports-active-view"
        data-demo-id="reports-active-view"
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
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>What Needs Attention First</div>
          <div style={{ color: "#475569", lineHeight: "1.8" }}>
            The same operating blockers that drive the dashboard stay visible here too, so reports remain tied to current household reality instead of drifting into a static export.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          {renderReportFactsGrid(
            [
              { label: "Active", value: commandCenter.metrics.active },
              { label: "Critical", value: commandCenter.metrics.critical },
              { label: "Warning", value: commandCenter.metrics.warning },
              { label: "Stalled", value: commandCenter.metrics.stalled },
            ],
            4
          )}
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          {commandCenter.blockers.map((item) => (
            <div
              key={`report-command-${item.id}`}
              style={{
                padding: "18px 20px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "5px 9px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: item.urgencyMeta.accent,
                      background: item.urgencyMeta.background,
                      border: item.urgencyMeta.border,
                    }}
                  >
                    {item.urgencyMeta.badge}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "5px 9px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#475569",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {item.staleLabel}
                  </span>
                </div>
              </div>
              <div style={{ color: "#0f172a", lineHeight: "1.7" }}>{item.blocker}</div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.consequence}</div>
              <div>
                <button type="button" onClick={() => onNavigate?.(item.route)} style={buttonStyle(false)}>
                  {item.nextAction}
                </button>
              </div>
            </div>
          ))}
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
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setSelectedReport("executive")}
            style={reportButtonStyle(activeReport === "executive")}
          >
            Executive Summary
          </button>
          <button
            type="button"
            onClick={() => setSelectedReport("household")}
            style={reportButtonStyle(activeReport === "household")}
          >
            Household Summary
          </button>
          <button
            type="button"
            onClick={() => setSelectedReport("insurance")}
            style={reportButtonStyle(activeReport === "insurance")}
          >
            Insurance Portfolio
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.(rankedPolicies[0]?.policy_id ? getPolicyDetailRoute(rankedPolicies[0]) : "/insurance")}
            style={reportButtonStyle(false)}
          >
            {rankedPolicies[0] ? getPolicyEntryLabel(rankedPolicies[0]) : "Open Insurance Hub"}
          </button>
        </div>

        <div
          style={{
            padding: "22px 24px",
            borderRadius: "18px",
            background: "#f8fafc",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            display: "grid",
            gap: "14px",
          }}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Property Summary</div>
            <div style={{ color: "#475569", lineHeight: "1.8" }}>
              The household operating graph stays visible across reports, so linked liabilities, protections, documents, and portal continuity do not disappear behind the review queue.
            </div>
          </div>
          <OperatingGraphSummaryCards
            cards={operatingGraphSummary.cards}
            highlights={operatingGraphSummary.highlights.slice(0, 4)}
            onNavigate={onNavigate}
            theme="light"
          />
        </div>

        {activeReport === "insurance" ? (
          <ReportView report={insurancePortfolioReport} onPrint={handlePrintActiveReport} label="Portfolio Report" />
        ) : activeReport === "executive" ? (
          <section
            style={{
              display: "grid",
              gap: "18px",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "14px",
                padding: "24px",
                borderRadius: "18px",
                background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                border: "1px solid rgba(147, 197, 253, 0.28)",
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Executive Summary
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>Household Summary</div>
              <div style={{ color: "#475569", lineHeight: "1.8" }}>
            A clean household summary for planning, readiness review, and executive-friendly sharing.
              </div>
              <button type="button" onClick={handlePrintActiveReport} style={buttonStyle(true)}>
                Print Executive Summary
              </button>
            </div>

            <div
              style={{
                padding: "22px 24px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "14px",
              }}
            >
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Executive Narrative</div>
              <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.8" }}>
                {executiveSummaryLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
              }}
            >
              {renderReportFactsGrid(
                [
                  { label: "Household Readiness", value: displayValue(assistantHouseholdMap?.overall_score) },
                  { label: "Active Work", value: activeQueueItems.length },
                  { label: "Reopened Items", value: assistantReviewDigest.reopened_count || 0 },
                  { label: "Modules Needing Review", value: moduleReadinessCounts.needsReview },
                  { label: "Modules Building", value: moduleReadinessCounts.building },
                  { label: "Visible Policies", value: rankedPolicies.length },
                ],
                3
              )}
            </div>

            <div
              style={{
                padding: "22px 24px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "14px",
              }}
            >
              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Property Connections</div>
                <div style={{ color: "#475569", lineHeight: "1.8" }}>
                  The household property stack now carries the same asset-liability-protection read into reporting, so connected records and missing dependencies stay visible in the export layer.
                </div>
              </div>
              <OperatingGraphSummaryCards
                cards={operatingGraphSummary.cards}
                highlights={operatingGraphSummary.highlights.slice(0, 4)}
                onNavigate={onNavigate}
                theme="light"
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 0.9fr",
                gap: "18px",
              }}
            >
              <div
                style={{
                  padding: "22px 24px",
                  borderRadius: "18px",
                  background: "#f8fafc",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  display: "grid",
                  gap: "14px",
                }}
              >
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Areas To Watch</div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {moduleReadinessRows
                    .filter((row) => row.status !== "Ready")
                    .slice(0, 4)
                    .map((row) => (
                      <div key={row.module} style={{ color: "#475569", lineHeight: "1.7" }}>
                        <strong style={{ color: "#0f172a" }}>{row.module}:</strong> {row.watchpoint}
                      </div>
                    ))}
                  {moduleReadinessRows.filter((row) => row.status !== "Ready").length === 0 ? (
                    <div style={{ color: "#475569", lineHeight: "1.7" }}>
                      No major module watchpoints are currently standing out above the others.
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                style={{
                  padding: "22px 24px",
                  borderRadius: "18px",
                  background: "#f8fafc",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  display: "grid",
                  gap: "14px",
                }}
              >
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>What This Summary Includes</div>
                <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
                  <li>Household continuity bottom line and review digest.</li>
                  <li>Cross-module readiness watchpoints for assets, vault, portals, banking, and estate.</li>
                  <li>Insurance portfolio visibility and continuity ranking status.</li>
                  <li>A cleaner top-line summary for advisor, family, or executive review.</li>
                </ul>
              </div>
            </div>
          </section>
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
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>Platform Snapshot</div>
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
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>{row.status}</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{row.insight}</div>
              <div style={{ display: "grid", gap: "6px", color: "#64748b", fontSize: "13px" }}>
                <div>
                  <span style={{ color: "#334155", fontWeight: 600 }}>What to watch:</span> {row.watchpoint}
                </div>
                {row.summary?.notes?.slice(1, 2).map((note) => <div key={`${row.module}-${note}`}>{note}</div>)}
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
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>What This Reporting Layer Shows</div>
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
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Progress Memory</div>
          <div style={{ display: "grid", gap: "10px", color: "#0f172a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span>Active Work</span>
              <strong>{activeQueueItems.length}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span>Completed Reviews</span>
              <strong>{resolvedQueueItems.length}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span>Readiness Lift</span>
              <strong>{scoreLift > 0 ? `+${scoreLift}` : "0"}</strong>
            </div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>{assistantReviewDigest.summary}</div>
            {workflowResolutionMemory.recentlyResolved.length > 0 ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {workflowResolutionMemory.recentlyResolved.map((item) => (
                  <span
                    key={item}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#166534",
                      background: "#dcfce7",
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {loadingStates.householdData || loadingStates.insurancePortfolio ? (
        <div style={{ color: "#475569", fontSize: "14px" }}>Loading household reporting signals...</div>
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

