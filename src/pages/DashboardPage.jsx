import { useEffect, useMemo, useState } from "react";
import {
  answerHouseholdQuestion,
  buildHouseholdReviewReport,
} from "../lib/domain/platformIntelligence";
import {
  buildReviewAssignmentOptions,
  buildHouseholdReviewDigest,
  getHouseholdReviewDigestSnapshot,
  getHouseholdReviewWorkflowState,
  REVIEW_WORKFLOW_STATUSES,
  saveHouseholdReviewDigestSnapshot,
  saveHouseholdReviewWorkflowState,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { buildHouseholdReviewQueueItems } from "../lib/domain/platformIntelligence/reviewWorkspaceData";
import QuickActionGrid from "../components/onboarding/QuickActionGrid";
import SetupChecklist from "../components/onboarding/SetupChecklist";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import {
  buildHouseholdOnboardingChecklist,
  getHouseholdBlankState,
} from "../lib/onboarding/isHouseholdBlank";
import { buildHouseholdOnboardingMission } from "../lib/onboarding/onboardingMission";
import {
  answerDemoHouseholdQuestion,
  buildDemoHouseholdPreview,
} from "../lib/onboarding/demoHouseholdPreview";
import { executeSmartAction } from "../lib/navigation/smartActions";
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
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

function buttonStyle(primary = false) {
  return {
    padding: "10px 14px",
    borderRadius: "12px",
    border: primary ? "none" : "1px solid rgba(255,255,255,0.08)",
    background: primary ? "#f8fafc" : "rgba(255,255,255,0.04)",
    color: primary ? "#020617" : "#e2e8f0",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "13px",
  };
}

function reportButtonStyle(active = false, primary = false) {
  if (primary) return buttonStyle(true);
  return {
    ...buttonStyle(false),
    border: active ? "1px solid rgba(147,197,253,0.45)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(59,130,246,0.16)" : "rgba(255,255,255,0.04)",
    color: active ? "#dbeafe" : "#e2e8f0",
  };
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : value;
}

function parseDisplayNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function getContinuityStatus(score) {
  if (score >= 80) {
    return {
      label: "Strong",
      explanation: "Core continuity reads are connected across documents, access, and key records.",
    };
  }

  if (score >= 55) {
    return {
      label: "Moderate",
      explanation: "Coverage is usable, but several records still need validation or completion.",
    };
  }

  return {
    label: "At Risk",
    explanation: "Important continuity reads are still missing across assets, statements, or charge visibility.",
  };
}

function buildActionSignals(policyRows = [], fallbackPrompts = []) {
  const signals = [];

  policyRows.forEach((policy) => {
    const label = policy.product || policy.carrier || "Saved policy";
    const missingFields = Array.isArray(policy.missing_fields) ? policy.missing_fields : [];
    const keyFinancialGaps = missingFields.filter((field) =>
      ["accumulation_value", "cash_value", "cash_surrender_value", "death_benefit", "loan_balance"].includes(field)
    );

    if (keyFinancialGaps.length > 0) {
      signals.push({
        id: `${policy.policy_id || label}-financial-gaps`,
        label: `Recover ${keyFinancialGaps.slice(0, 3).join(", ")}`,
        summary: `${label}: recover ${keyFinancialGaps.slice(0, 3).join(", ")}.`,
        route: policy.policy_id ? `/insurance/${policy.policy_id}` : "/insurance",
      });
    }

    if (policy.coi_confidence === "weak") {
      signals.push({
        id: `${policy.policy_id || label}-coi-review`,
        label: "Validate COI and charges",
        summary: `${label}: validate COI and charge visibility.`,
        route: policy.policy_id ? `/insurance/${policy.policy_id}` : "/insurance",
        action_key: "open_insurance_hub",
      });
    }

    if (!policy.latest_statement_date) {
      signals.push({
        id: `${policy.policy_id || label}-statement-date`,
        label: "Resolve latest statement",
        summary: `${label}: resolve the latest statement date.`,
        route: policy.policy_id ? `/insurance/${policy.policy_id}` : "/insurance",
        action_key: "open_insurance_hub",
      });
    }
  });

  const promptSignals = fallbackPrompts.map((item, index) => ({
    id: `fallback-prompt-${index}`,
    label: "Open recommended review",
    summary: item,
    route: resolveActionSignalRoute(item),
  }));

  const uniqueSignals = [];
  const seen = new Set();
  [...signals, ...promptSignals].forEach((item) => {
    const key = `${item?.label || ""}|${item?.summary || ""}|${item?.route || ""}`;
    if (!item || seen.has(key)) return;
    seen.add(key);
    uniqueSignals.push(item);
  });

  return uniqueSignals.slice(0, 5);
}

function buildDependencyActionSignals(dependencySignals = null) {
  const candidates = dependencySignals?.action_candidates || [];
  const flags = dependencySignals?.dependency_flags || [];

  return flags.slice(0, 3).map((flag, index) => {
    const matchedCandidate =
      candidates.find((candidate) => candidate.source_flag === flag.key && candidate.route === flag.route) ||
      candidates.find((candidate) => candidate.source_flag === flag.key) ||
      null;

    return {
      id: `dependency-${flag.key}-${index}`,
      label: flag.action_label || matchedCandidate?.label || flag.title || "Open review",
      summary: flag.explanation,
      route: flag.route || matchedCandidate?.route || resolveActionSignalRoute(flag.explanation),
      action_key: matchedCandidate?.action_key || flag.suggested_smart_action_keys?.[0] || null,
      severity: flag.severity || "moderate",
    };
  });
}

function resolveActionSignalRoute(signal = "") {
  const text = String(signal || "").toLowerCase();

  if (text.includes("homeowners") || text.includes("property") || text.includes("mortgage")) {
    return "/property";
  }
  if (text.includes("retirement")) {
    return "/retirement";
  }
  if (text.includes("banking") || text.includes("portal") || text.includes("access")) {
    return text.includes("portal") || text.includes("access") ? "/portals" : "/banking";
  }
  if (text.includes("estate") || text.includes("trust") || text.includes("will")) {
    return "/estate";
  }
  if (text.includes("health")) {
    return "/insurance/health";
  }
  if (text.includes("auto")) {
    return "/insurance/auto";
  }
  if (
    text.includes("policy") ||
    text.includes("coi") ||
    text.includes("charge") ||
    text.includes("statement") ||
    text.includes("insurance")
  ) {
    return "/insurance";
  }

  return "/dashboard";
}

function getModuleStatus(count) {
  if (count >= 3) return "Strong";
  if (count >= 1) return "Moderate";
  return "Weak";
}

function getStatusColors(status) {
  if (status === "Strong") return { color: "#bbf7d0", background: "rgba(34,197,94,0.12)" };
  if (status === "Moderate") return { color: "#fde68a", background: "rgba(245,158,11,0.12)" };
  if (status === "Weak") return { color: "#fdba74", background: "rgba(249,115,22,0.12)" };
  if (status === "Ready") return { color: "#bbf7d0", background: "rgba(34,197,94,0.12)" };
  if (status === "Building") return { color: "#fde68a", background: "rgba(245,158,11,0.12)" };
  if (status === "Needs Review") return { color: "#fca5a5", background: "rgba(239,68,68,0.12)" };
  if (status === "At Risk") return { color: "#fca5a5", background: "rgba(239,68,68,0.12)" };
  return { color: "#cbd5e1", background: "rgba(148,163,184,0.12)" };
}

function getReadableModuleStatus(scoreLikeValue, goodThreshold = 3, moderateThreshold = 1) {
  if (scoreLikeValue >= goodThreshold) return "Strong";
  if (scoreLikeValue >= moderateThreshold) return "Moderate";
  return "Weak";
}

function normalizeMetricList(metrics) {
  if (Array.isArray(metrics)) return metrics;
  if (metrics && typeof metrics === "object") {
    return Object.entries(metrics).map(([label, value]) => ({ label, value }));
  }
  return [];
}

function buildAiIntroModuleCards({
  savedPolicyCount = 0,
  assetCounts = {},
  propertySummary = {},
  missingStatementCount = 0,
  weakPolicyRows = [],
}) {
  const propertyCount = propertySummary.propertyCount || 0;
  const mortgageCount = assetCounts.mortgage || 0;
  const homeownersCount = propertySummary.homeownersCount || assetCounts.homeowners || 0;
  const retirementCount = assetCounts.retirement || 0;
  const healthCount = assetCounts.health_insurance || 0;
  const autoCount = assetCounts.auto_insurance || 0;
  const bankingCount = assetCounts.banking || 0;
  const estateCount = assetCounts.estate || 0;

  const homeStatus =
    propertyCount > 0 && homeownersCount > 0
      ? "Strong"
      : propertyCount > 0 || mortgageCount > 0 || homeownersCount > 0
        ? "Moderate"
        : "Weak";
  const lifeStatus =
    savedPolicyCount > 0 && weakPolicyRows.length === 0 && missingStatementCount === 0
      ? "Strong"
      : savedPolicyCount > 0
        ? "Moderate"
        : "Weak";

  return [
    {
      key: "home",
      label: "Home",
      route: "/property",
      status: homeStatus,
      summary:
        homeStatus === "Strong"
          ? "Property, mortgage, and homeowners protection are visible enough to review together."
          : homeStatus === "Moderate"
            ? "Some home records are visible, but the property stack is not fully connected yet."
            : "Home visibility is still thin, so housing protection and debt are not easy to review together.",
      metric: `${propertyCount} properties`,
    },
    {
      key: "life",
      label: "Life Insurance",
      route: "/insurance",
      status: lifeStatus,
      summary:
        lifeStatus === "Strong"
          ? "Life policy continuity is readable and current statement support looks cleaner."
          : lifeStatus === "Moderate"
            ? "Life insurance is visible, but some policies still need better statement or charge support."
            : "Life insurance records are not strong enough yet for a confident household read.",
      metric: `${savedPolicyCount} policies`,
    },
    {
      key: "health",
      label: "Health",
      route: "/insurance/health",
      status: getReadableModuleStatus(healthCount),
      summary:
        healthCount > 0
          ? "Health-plan records are present, but they still need deeper continuity and coverage review."
          : "No meaningful health-plan visibility is loaded yet.",
      metric: `${healthCount} plans`,
    },
    {
      key: "auto",
      label: "Auto",
      route: "/insurance/auto",
      status: getReadableModuleStatus(autoCount),
      summary:
        autoCount > 0
          ? "Auto coverage is in the household record set, but policy depth can still improve."
          : "Auto coverage is not clearly visible yet.",
      metric: `${autoCount} auto policies`,
    },
    {
      key: "retirement",
      label: "Retirement",
      route: "/retirement",
      status: getReadableModuleStatus(retirementCount),
      summary:
        retirementCount > 0
          ? "Retirement assets are present, but beneficiary and document depth still matter."
          : "Retirement visibility is still limited, so long-term planning is not fully anchored here yet.",
      metric: `${retirementCount} retirement accounts`,
    },
    {
      key: "banking",
      label: "Banking",
      route: "/banking",
      status: getReadableModuleStatus(bankingCount),
      summary:
        bankingCount > 0
          ? "Banking records are visible, but access and portal continuity still matter."
          : "Banking visibility is still light.",
      metric: `${bankingCount} banking records`,
    },
    {
      key: "estate",
      label: "Estate",
      route: "/estate",
      status: getReadableModuleStatus(estateCount),
      summary:
        estateCount > 0
          ? "Estate records exist, but document depth will determine how dependable the handoff is."
          : "Estate planning records are still missing or too thin to rely on.",
      metric: `${estateCount} estate records`,
    },
  ];
}

function buildAiHouseholdIntro({
  continuityPercent,
  continuityStatus,
  moduleCards,
  totalIssues,
  totalAssets,
}) {
  const strongCount = moduleCards.filter((item) => item.status === "Strong").length;
  const weakCount = moduleCards.filter((item) => item.status === "Weak").length;
  const moderateCount = moduleCards.filter((item) => item.status === "Moderate").length;
  const strongestAreas = moduleCards
    .filter((item) => item.status === "Strong")
    .slice(0, 3)
    .map((item) => item.label.toLowerCase());
  const weakestAreas = moduleCards
    .filter((item) => item.status === "Weak")
    .slice(0, 3)
    .map((item) => item.label.toLowerCase());

  let headline = "Your household picture is still being built.";
  if (continuityPercent >= 80) {
    headline = "Your household picture looks well connected at first glance.";
  } else if (continuityPercent >= 55) {
    headline = "Your household picture is usable, but still has a few weak spots.";
  } else if (continuityPercent > 0) {
    headline = "Your household picture is still too fragmented for a clean read.";
  }

  const body = [
    totalAssets > 0
      ? `Right now VaultedShield can see ${totalAssets} tracked household records across your major financial and protection areas.`
      : "Right now VaultedShield is still waiting on enough household records to give a dependable full-picture read.",
    strongestAreas.length > 0
      ? `The strongest areas currently look like ${strongestAreas.join(", ")}.`
      : "No area is fully strong yet, so this should still be read as a developing household file.",
    weakestAreas.length > 0
      ? `The weakest areas currently look like ${weakestAreas.join(", ")}, which is where missing records or weak support are most likely slowing the read down.`
      : moderateCount > 0
        ? "Most remaining gaps are moderate rather than severe, which means the foundation is there but still needs cleanup."
        : "No major weak area is dominating the read right now.",
    totalIssues > 0
      ? `${totalIssues} active issues or weak-support signals are currently limiting a cleaner household-level read.`
      : "No major review blockers are standing out from the current household evidence.",
    `Overall this reads as ${continuityStatus.label.toLowerCase()} continuity support.`,
  ].join(" ");

  return {
    headline,
    body,
    strongCount,
    moderateCount,
    weakCount,
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

function HouseholdReportView({ report, onPrint, isCompact = false }) {
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
            Household Report
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

export default function DashboardPage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const {
    householdState,
    counts,
    intelligence,
    intelligenceBundle,
    savedPolicies,
    insuranceRows: savedPolicyRows,
    debug,
    errors,
    loadingStates,
  } = usePlatformShellData();
  const [reviewWorkflowState, setReviewWorkflowState] = useState({});
  const [reviewDigestSnapshot, setReviewDigestSnapshot] = useState(null);
  const [showHouseholdReport, setShowHouseholdReport] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantHistory, setAssistantHistory] = useState([]);
  const [demoAssistantQuestion, setDemoAssistantQuestion] = useState("");
  const [demoAssistantHistory, setDemoAssistantHistory] = useState([]);
  const savedPolicyCount = savedPolicies.length;
  const loadError = errors.householdData || "";
  const policyCompareError = errors.insurancePortfolio || "";

  const reviewScope = useMemo(
    () => ({
      householdId: householdState.context.householdId,
      userId: debug.authUserId || null,
    }),
    [debug.authUserId, householdState.context.householdId]
  );

  useEffect(() => {
    setReviewWorkflowState(
      getHouseholdReviewWorkflowState(reviewScope)
    );
    setReviewDigestSnapshot(
      getHouseholdReviewDigestSnapshot(reviewScope)
    );
  }, [reviewScope]);

  const assetCounts = useMemo(
    () => intelligenceBundle?.assetCountsByCategory || {},
    [intelligenceBundle?.assetCountsByCategory]
  );
  const propertySummary = useMemo(
    () => intelligenceBundle?.propertyStackSummary || {},
    [intelligenceBundle?.propertyStackSummary]
  );
  const continuityPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((intelligence?.document_completeness?.score_value || 0) +
          (intelligence?.emergency_readiness?.score_value || 0) +
          (intelligence?.portal_continuity?.score_value || 0)) /
          3
      )
    )
  );
  const continuityStatus = getContinuityStatus(continuityPercent);
  const deathBenefitValues = savedPolicyRows
    .map((policy) => parseDisplayNumber(policy.death_benefit))
    .filter((value) => value !== null);
  const coiValues = savedPolicyRows
    .map((policy) => parseDisplayNumber(policy.total_coi))
    .filter((value) => value !== null);
  const visibleChargeValues = savedPolicyRows
    .map((policy) => parseDisplayNumber(policy.total_visible_charges))
    .filter((value) => value !== null);
  const missingFieldPolicies = savedPolicyRows.filter(
    (policy) => Array.isArray(policy.missing_fields) && policy.missing_fields.length > 0
  );
  const weakPolicyRows = savedPolicyRows.filter((policy) => policy.coi_confidence === "weak");
  const missingStatementCount = savedPolicyRows.filter((policy) => !policy.latest_statement_date).length;
  const totalIssues =
    missingFieldPolicies.length + weakPolicyRows.length + missingStatementCount;
  const totalProtectionCoverage = deathBenefitValues.reduce((sum, value) => sum + value, 0);
  const totalCoi = coiValues.reduce((sum, value) => sum + value, 0);
  const totalVisibleCharges = visibleChargeValues.reduce((sum, value) => sum + value, 0);
  const highestCostPolicy = savedPolicyRows.reduce((best, policy) => {
    const current = parseDisplayNumber(policy.total_coi);
    const currentBest = best ? parseDisplayNumber(best.total_coi) : null;
    if (current === null) return best;
    if (currentBest === null || current > currentBest) return policy;
    return best;
  }, null);
  const weakestConfidencePolicy = weakPolicyRows[0] || null;
  const totalAssets = (counts?.assetCount ?? intelligenceBundle?.assets?.length ?? 0) + savedPolicyCount;
  const assetsSummary = useMemo(
    () => summarizeAssetsModule(intelligenceBundle?.assets || []),
    [intelligenceBundle]
  );
  const vaultSummary = useMemo(
    () => summarizeVaultModule(intelligenceBundle?.documents || []),
    [intelligenceBundle]
  );
  const portalSummary = useMemo(
    () =>
      summarizePortalModule({
        portals: intelligenceBundle?.portals || [],
        readiness: intelligenceBundle?.portalReadiness || {},
      }),
    [intelligenceBundle]
  );
  const bankingSummary = useMemo(
    () =>
      summarizeBankingModule({
        assets: intelligenceBundle?.assets || [],
        portals: intelligenceBundle?.portals || [],
        contacts: intelligenceBundle?.contacts || [],
      }),
    [intelligenceBundle]
  );
  const estateSummary = useMemo(
    () =>
      summarizeEstateModule({
        contacts: intelligenceBundle?.contacts || [],
        assets: intelligenceBundle?.assets || [],
      }),
    [intelligenceBundle]
  );
  const { householdMap, queueItems } = useMemo(
    () =>
      buildHouseholdReviewQueueItems({
        bundle: intelligenceBundle || {},
        intelligence,
        savedPolicyRows: savedPolicyRows || [],
        reviewWorkflowState,
      }),
    [intelligence, intelligenceBundle, reviewWorkflowState, savedPolicyRows]
  );
  const topActions = useMemo(
    () => [
      ...buildDependencyActionSignals(householdMap?.dependency_signals),
      ...buildActionSignals(savedPolicyRows || [], intelligence?.missing_item_prompts || []),
    ].slice(0, 5),
    [householdMap, savedPolicyRows, intelligence]
  );
  const changedSinceReviewItems = queueItems.filter((item) => item.changed_since_review);
  const activeQueueItems = queueItems.filter(
    (item) => item.workflow_status !== REVIEW_WORKFLOW_STATUSES.reviewed.key || item.changed_since_review
  );
  const reviewedQueueItems = queueItems.filter(
    (item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key && !item.changed_since_review
  );
  const pendingDocumentsCount = queueItems.filter(
    (item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.pending_documents.key
  ).length;
  const followUpCount = queueItems.filter(
    (item) => item.workflow_status === REVIEW_WORKFLOW_STATUSES.follow_up.key
  ).length;
  const reviewDigest = useMemo(
    () => buildHouseholdReviewDigest(queueItems || [], reviewDigestSnapshot),
    [queueItems, reviewDigestSnapshot]
  );
  const commandCenter = useMemo(
    () =>
      buildDashboardCommandCenter({
        queueItems,
        topActions,
        reviewDigest,
        householdMap,
      }),
    [householdMap, queueItems, reviewDigest, topActions]
  );
  const housingCommandCenter = useMemo(
    () => buildHousingContinuityCommand(intelligenceBundle || {}),
    [intelligenceBundle]
  );
  const emergencyAccessCommand = useMemo(
    () => buildEmergencyAccessCommand(intelligenceBundle || {}),
    [intelligenceBundle]
  );
  const householdScorecard = useMemo(
    () => buildHouseholdScorecard(householdMap),
    [householdMap]
  );
  const householdPriorityEngine = useMemo(
    () =>
      buildHouseholdPriorityEngine({
        householdMap,
        commandCenter,
        housingCommand: housingCommandCenter,
        emergencyAccessCommand,
      }),
    [commandCenter, emergencyAccessCommand, householdMap, housingCommandCenter]
  );
  const householdReviewReport = useMemo(
    () =>
      showHouseholdReport
        ? buildHouseholdReviewReport({
            bundle: intelligenceBundle || {},
            intelligence,
            householdMap,
            queueItems,
            reviewDigest,
          })
        : null,
    [showHouseholdReport, intelligenceBundle, intelligence, householdMap, queueItems, reviewDigest]
  );
  const latestAssistantEntry = assistantHistory[assistantHistory.length - 1] || null;
  const moduleRows = useMemo(
    () => [
      {
        module: "Insurance",
        status: getModuleStatus(savedPolicyCount),
        insight:
          savedPolicyCount > 0
            ? weakPolicyRows.length > 0 || missingStatementCount > 0
              ? "Policies are visible, but some still need stronger statement or charge support."
              : "Comparison, continuity, and protection reads are available."
            : "No saved insurance policy set is visible yet.",
        watchpoint:
          savedPolicyCount > 0
            ? weakPolicyRows.length > 0
              ? `${weakPolicyRows.length} polic${weakPolicyRows.length === 1 ? "y still needs" : "ies still need"} stronger charge confidence.`
              : missingStatementCount > 0
                ? `${missingStatementCount} polic${missingStatementCount === 1 ? "y is" : "ies are"} still missing a visible latest statement date.`
                : "Ready for household review."
            : "Upload a baseline illustration or statement packet to start the insurance read.",
      },
      {
        module: "Property",
        status: getModuleStatus(propertySummary.propertyCount ?? 0),
        insight:
          (propertySummary.propertiesWithValuationCount || 0) > 0
            ? "Property stack linkage and valuation support are active."
            : "Property stack visibility is still building.",
        watchpoint:
          (propertySummary.propertiesWithValuationCount || 0) > 0
            ? "Review whether the current property set is running on official comps or simulated support."
            : "Add or refresh a property so valuation and equity context can join the household read.",
      },
      buildModuleReadinessOverview("Assets", assetsSummary),
      buildModuleReadinessOverview("Vault", vaultSummary),
      buildModuleReadinessOverview("Portals", portalSummary),
      buildModuleReadinessOverview("Banking", bankingSummary),
      buildModuleReadinessOverview("Estate", estateSummary),
    ],
    [
      savedPolicyCount,
      weakPolicyRows,
      missingStatementCount,
      propertySummary,
      assetsSummary,
      vaultSummary,
      portalSummary,
      bankingSummary,
      estateSummary,
    ]
  );
  const aiIntroModuleCards = useMemo(
    () =>
      buildAiIntroModuleCards({
        savedPolicyCount,
        assetCounts,
        propertySummary,
        missingStatementCount,
        weakPolicyRows,
      }),
    [savedPolicyCount, assetCounts, propertySummary, missingStatementCount, weakPolicyRows]
  );
  const aiHouseholdIntro = useMemo(
    () =>
      buildAiHouseholdIntro({
        continuityPercent,
        continuityStatus,
        moduleCards: aiIntroModuleCards,
        totalIssues,
        totalAssets,
      }),
    [continuityPercent, continuityStatus, aiIntroModuleCards, totalIssues, totalAssets]
  );
  const showLoadingShell =
    (loadingStates.household || loadingStates.householdData) && !counts && !intelligenceBundle;
  const sectionPadding = isMobile ? "20px 16px" : isTablet ? "24px 22px" : "28px 30px";
  const sectionRadius = isMobile ? "20px" : "24px";
  const metricGridColumns = isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(180px, 1fr))";
  const assigneeChoices = useMemo(() => buildReviewAssignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);

  function handleReviewWorkflowUpdate(itemId, status) {
    const householdId = householdState.context.householdId;
    if (!householdId || !itemId) return;

    const nextState = {
      ...reviewWorkflowState,
      [itemId]: {
        ...(reviewWorkflowState[itemId] || {}),
        status,
        updated_at: new Date().toISOString(),
      },
    };

    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

  function handleReviewAssignmentUpdate(itemId, assigneeKey) {
    const householdId = householdState.context.householdId;
    if (!householdId || !itemId) return;
    const assignee = assigneeChoices.find((option) => option.key === assigneeKey) || assigneeChoices[0];
    const nextState = {
      ...reviewWorkflowState,
      [itemId]: {
        ...(reviewWorkflowState[itemId] || {}),
        assignee_key: assignee?.key || "",
        assignee_label: assignee?.label || "Unassigned",
        assigned_at: assignee?.key ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
    };

    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

  function handleRefreshDigestSnapshot() {
    const householdId = householdState.context.householdId;
    if (!householdId) return;
    const snapshot = reviewDigest.current_snapshot;
    setReviewDigestSnapshot(snapshot);
    saveHouseholdReviewDigestSnapshot(reviewScope, snapshot);
  }

  function handlePrintHouseholdReport() {
    setShowHouseholdReport(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.print(), 80);
    }
  }

  function handleAskHouseholdAssistant(questionText) {
    const trimmed = String(questionText || "").trim();
    if (!trimmed) return;

    const response = answerHouseholdQuestion({
      questionText: trimmed,
      householdMap,
      reviewDigest,
      queueItems,
      intelligence,
      bundle: intelligenceBundle || {},
      scorecard: householdScorecard,
      priorityEngine: householdPriorityEngine,
    });

    setAssistantHistory((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        question: trimmed,
        response,
      },
    ]);
    setAssistantQuestion("");
  }

  const starterPrompts = [
    "Am I doing okay financially?",
    "What should I review first?",
    "What changed since last review?",
    "Why is household readiness rated this way?",
    "What is limiting continuity most?",
    "Are my assets and protection aligned?",
    "What parts of my household are under-supported?",
    "How strong is the insurance side right now?",
    "Are portal and access records in good shape?",
    "What is hurting my household score most?",
  ];

  const blankHousehold = useMemo(
    () => getHouseholdBlankState(intelligenceBundle || {}, savedPolicyRows || []),
    [intelligenceBundle, savedPolicyRows]
  );
  const onboardingChecklist = useMemo(
    () => buildHouseholdOnboardingChecklist(blankHousehold, intelligenceBundle || {}, savedPolicyRows || []),
    [blankHousehold, intelligenceBundle, savedPolicyRows]
  );
  const onboardingCompletedCount = onboardingChecklist.filter((item) => item.complete).length;
  const onboardingProgressPercent = onboardingChecklist.length > 0
    ? Math.round((onboardingCompletedCount / onboardingChecklist.length) * 100)
    : 0;
  const onboardingMission = useMemo(
    () =>
      buildHouseholdOnboardingMission({
        blankState: blankHousehold,
        checklist: onboardingChecklist,
        progressPercent: onboardingProgressPercent,
      }),
    [blankHousehold, onboardingChecklist, onboardingProgressPercent]
  );
  const demoHouseholdPreview = useMemo(() => buildDemoHouseholdPreview(), []);
  const onboardingQuickActions = [
    {
      id: "add_household_member",
      label: "Add Household Member",
      description: "Start with the core person record so the rest of the household can be organized around real relationships.",
      route: "/contacts",
    },
    {
      id: "upload_insurance",
      label: "Upload Insurance Policy",
      description: "Start life insurance analysis with a baseline illustration or policy packet.",
      route: "/insurance/life/upload",
    },
    {
      id: "add_property",
      label: "Add Property",
      description: "Create the first home or property record and start the asset picture.",
      route: "/property",
    },
    {
      id: "add_retirement",
      label: "Add Retirement Account",
      description: "Create the first retirement record to unlock account-level visibility.",
      route: "/retirement",
    },
    {
      id: "upload_document",
      label: "Upload Document",
      description: "Drop in a statement, declaration page, will, trust, or other household file.",
      route: "/upload-center",
    },
  ];
  const showGuidedOnboarding =
    !showLoadingShell &&
    blankHousehold.isBlank &&
    !householdState.error &&
    !loadError;

  function handleAskDemoHousehold(questionText) {
    const trimmed = String(questionText || "").trim();
    if (!trimmed) return;
    const response = answerDemoHouseholdQuestion(trimmed, demoHouseholdPreview);
    setDemoAssistantHistory((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        question: trimmed,
        response,
      },
    ]);
    setDemoAssistantQuestion("");
  }

  if (showGuidedOnboarding) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          color: "#e2e8f0",
          padding: isMobile ? "16px" : isTablet ? "22px" : "32px",
        }}
      >
        <div style={{ margin: "0 auto", maxWidth: "1180px", display: "grid", gap: "28px" }}>
          <header
            style={{
              display: "flex",
              alignItems: isMobile ? "stretch" : "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: isMobile ? "16px" : "18px", fontWeight: 700, letterSpacing: "-0.02em" }}>
              VaultedShield
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
              <button style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }} onClick={() => onNavigate?.("/upload-center")}>
                Upload Document
              </button>
              <button style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }} onClick={() => onNavigate?.("/contacts")}>
                Add Household Member
              </button>
            </div>
          </header>

          <section
            style={{
              padding: isMobile ? "24px 18px" : isTablet ? "30px 26px" : "36px 40px",
              borderRadius: isMobile ? "22px" : "28px",
              background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
              border: "1px solid rgba(255,255,255,0.06)",
              display: "grid",
              gap: "22px",
            }}
          >
            <div style={{ display: "grid", gap: "10px", maxWidth: "860px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  width: "fit-content",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "rgba(56,189,248,0.14)",
                  color: "#bae6fd",
                  fontSize: "11px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {onboardingMission.stageLabel}
              </div>
              <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                Guided Setup
              </div>
              <div style={{ fontSize: isMobile ? "34px" : "48px", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>
                Welcome to VaultedShield
              </div>
              <div style={{ fontSize: isMobile ? "18px" : "22px", fontWeight: 700, color: "#f8fafc" }}>
                Let&apos;s build your household profile
              </div>
              <div style={{ fontSize: "15px", lineHeight: "1.8", color: "#cbd5e1" }}>
                Start with one household member, then add a first asset, upload a document, connect a portal, and round out emergency readiness. This setup progress tracks what you&apos;ve actually added without creating fake intelligence.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: "16px",
                padding: "18px 20px",
                borderRadius: "18px",
                background: "linear-gradient(135deg, rgba(56,189,248,0.12) 0%, rgba(96,165,250,0.06) 100%)",
                border: "1px solid rgba(125,211,252,0.18)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "#7dd3fc", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
                    {onboardingMission.urgency}
                  </div>
                  <div style={{ marginTop: "8px", fontSize: isMobile ? "24px" : "28px", fontWeight: 800, color: "#f8fafc" }}>
                    {onboardingMission.headline}
                  </div>
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: "999px",
                    background: "rgba(15,23,42,0.42)",
                    color: "#e2e8f0",
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  {onboardingMission.completionSummary}
                </div>
              </div>
              <div style={{ color: "#dbeafe", lineHeight: "1.8", fontSize: "15px" }}>
                {onboardingMission.explanation}
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {onboardingMission.nextStep ? (
                  <button
                    type="button"
                    onClick={() => onboardingMission.nextStep.route && onNavigate?.(onboardingMission.nextStep.route)}
                    style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }}
                  >
                    Open {onboardingMission.nextStep.label}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onNavigate?.("/guidance")}
                  style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }}
                >
                  Open Guided Setup Help
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc" }}>Household setup progress</div>
                <div style={{ fontSize: "14px", fontWeight: 800, color: "#93c5fd" }}>{onboardingProgressPercent}% complete</div>
              </div>
              <div style={{ height: "12px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${onboardingProgressPercent}%`,
                    minWidth: onboardingProgressPercent > 0 ? "12px" : 0,
                    height: "100%",
                    borderRadius: "999px",
                    background: "linear-gradient(90deg, #38bdf8 0%, #60a5fa 100%)",
                  }}
                />
              </div>
              <div style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.7" }}>
                {onboardingCompletedCount} of {onboardingChecklist.length} core setup steps completed.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "14px",
              }}
            >
              {[
                { label: "Assets", value: blankHousehold.setupCounts.assets },
                { label: "Documents", value: blankHousehold.setupCounts.documents },
                { label: "Policies", value: blankHousehold.setupCounts.policies },
                { label: "Emergency Contacts", value: blankHousehold.setupCounts.emergencyContacts },
              ].map((metric) => (
                <div
                  key={metric.label}
                  style={{
                    padding: "16px 18px",
                    borderRadius: "18px",
                    background: "rgba(15,23,42,0.32)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>{metric.label}</div>
                  <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#f8fafc" }}>{metric.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: isTablet ? "1fr" : "1.1fr 0.9fr",
              gap: "18px",
            }}
          >
            <SetupChecklist
              theme="dark"
              items={onboardingChecklist}
              title="Build the household foundation"
              subtitle="These steps create real household records, which is when VaultedShield starts meaningful analysis."
            />
            <QuickActionGrid
              theme="dark"
              actions={onboardingQuickActions}
              title="Start with the fastest actions"
              subtitle="Each action opens an existing setup flow so you can move from zero data to real household visibility."
              onAction={(action) => action.route && onNavigate?.(action.route)}
            />
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
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "20px", fontWeight: 700 }}>What unlocks after your next step</div>
              <div style={{ color: "#cbd5e1", lineHeight: "1.8" }}>
                The platform starts producing much more useful signals once a few real household records are connected.
              </div>
              <ul style={{ margin: "4px 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#94a3b8" }}>
                {onboardingMission.preview.map((item) => (
                  <li key={item} style={{ lineHeight: "1.7" }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div
              style={{
                padding: sectionPadding,
                borderRadius: sectionRadius,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "20px", fontWeight: 700 }}>Insurance onboarding</div>
              <div style={{ color: "#cbd5e1", lineHeight: "1.8" }}>
                Uploading a life policy is one of the fastest ways to activate real analysis. Start with a baseline illustration, policy packet, or annual statement when you&apos;re ready.
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => onNavigate?.("/insurance/life/upload")} style={buttonStyle(true)}>
                  Upload Insurance Policy
                </button>
                <button type="button" onClick={() => onNavigate?.("/insurance")} style={buttonStyle(false)}>
                  Open Insurance Hub
                </button>
              </div>
            </div>
          </section>

          <section
            style={{
              padding: sectionPadding,
              borderRadius: sectionRadius,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
              display: "grid",
              gap: "18px",
            }}
          >
            <div style={{ display: "grid", gap: "8px", maxWidth: "820px" }}>
              <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                Demo Preview
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800 }}>What a built household looks like</div>
              <div style={{ color: "#cbd5e1", lineHeight: "1.8" }}>
                This is a sample preview so you can see the kind of score, priorities, and module guidance VaultedShield starts generating once real household records are connected.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 0.95fr) minmax(0, 1.05fr)",
                gap: "18px",
              }}
            >
              <div
                style={{
                  padding: "18px 20px",
                  borderRadius: "18px",
                  background: "rgba(15,23,42,0.32)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  display: "grid",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {demoHouseholdPreview.householdLabel}
                  </div>
                  <div style={{ marginTop: "8px", fontSize: "32px", fontWeight: 800, color: "#f8fafc" }}>
                    {demoHouseholdPreview.score.overall}
                  </div>
                  <div style={{ marginTop: "6px", color: "#cbd5e1", fontWeight: 700 }}>
                    {demoHouseholdPreview.score.status}
                  </div>
                </div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {demoHouseholdPreview.score.dimensions.map((item) => (
                    <div key={item.label} style={{ display: "grid", gap: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "14px" }}>
                        <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{item.label}</span>
                        <span style={{ color: "#93c5fd", fontWeight: 800 }}>{item.value}</span>
                      </div>
                      <div style={{ height: "8px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${item.value}%`,
                            height: "100%",
                            borderRadius: "999px",
                            background: "linear-gradient(90deg, #38bdf8 0%, #60a5fa 100%)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gap: "18px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "rgba(15,23,42,0.32)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  <div style={{ fontSize: "16px", fontWeight: 800 }}>Top priorities</div>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {demoHouseholdPreview.priorities.map((item) => (
                      <div
                        key={item.label}
                        style={{
                          padding: "14px 16px",
                          borderRadius: "16px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.04)",
                          display: "grid",
                          gap: "6px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700, color: "#f8fafc" }}>{item.label}</div>
                          <span style={{ color: "#93c5fd", fontSize: "12px", fontWeight: 800 }}>{item.impact}</span>
                        </div>
                        <div style={{ color: "#cbd5e1", lineHeight: "1.7" }}>{item.reason}</div>
                        <div style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.7" }}>
                          <span style={{ color: "#e2e8f0", fontWeight: 700 }}>Next:</span> {item.nextAction}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "rgba(15,23,42,0.32)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontSize: "16px", fontWeight: 800 }}>Module command read</div>
                  {demoHouseholdPreview.modules.map((item) => (
                    <div key={item.label} style={{ display: "grid", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                        <span style={{ color: "#f8fafc", fontWeight: 700 }}>{item.label}</span>
                        <span style={{ color: "#93c5fd", fontWeight: 800, fontSize: "12px" }}>{item.status}</span>
                      </div>
                      <div style={{ color: "#94a3b8", lineHeight: "1.65", fontSize: "14px" }}>{item.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section
            style={{
              padding: sectionPadding,
              borderRadius: sectionRadius,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
              display: "grid",
              gap: "16px",
            }}
          >
            <div style={{ display: "grid", gap: "8px", maxWidth: "860px" }}>
              <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                Demo Advisor
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800 }}>Ask what this system will help with</div>
              <div style={{ color: "#cbd5e1", lineHeight: "1.8" }}>
                These answers use the sample household preview above, so you can see how VaultedShield starts thinking once a few real records exist.
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                "What would improve my score fastest?",
                "What should I do first?",
                "Why do documents matter here?",
                "How does emergency access fit in?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleAskDemoHousehold(prompt)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    border: "1px solid rgba(125,211,252,0.22)",
                    background: "rgba(56,189,248,0.1)",
                    color: "#dbeafe",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "12px",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr auto", gap: "10px" }}>
              <input
                value={demoAssistantQuestion}
                onChange={(event) => setDemoAssistantQuestion(event.target.value)}
                placeholder="Ask how VaultedShield would guide a built household"
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(15,23,42,0.42)",
                  color: "#f8fafc",
                  minWidth: 0,
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAskDemoHousehold(demoAssistantQuestion);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => handleAskDemoHousehold(demoAssistantQuestion)}
                style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }}
              >
                Ask Demo Advisor
              </button>
            </div>

            {demoAssistantHistory.length > 0 ? (
              <div
                style={{
                  padding: "18px 20px",
                  borderRadius: "18px",
                  background: "rgba(15,23,42,0.32)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Demo answer
                </div>
                <div style={{ fontWeight: 800, color: "#f8fafc" }}>
                  {demoAssistantHistory[demoAssistantHistory.length - 1].question}
                </div>
                <div style={{ color: "#cbd5e1", lineHeight: "1.8" }}>
                  {demoAssistantHistory[demoAssistantHistory.length - 1].response.answer_text}
                </div>
                <ul style={{ margin: "4px 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#94a3b8" }}>
                  {demoAssistantHistory[demoAssistantHistory.length - 1].response.evidence_points.map((item) => (
                    <li key={item} style={{ lineHeight: "1.7" }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {import.meta.env.DEV ? (
            <div style={{ color: "#64748b", fontSize: "12px" }}>
              household={householdState.context.householdId || "none"} | onboardingBlank=yes | assets={blankHousehold.setupCounts.assets} | documents={blankHousehold.setupCounts.documents} | policies={blankHousehold.setupCounts.policies} | emergencyContacts={blankHousehold.setupCounts.emergencyContacts}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e2e8f0",
        padding: isMobile ? "16px" : isTablet ? "22px" : "32px",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: "1180px", display: "grid", gap: "28px" }}>
        {showLoadingShell ? (
          <section
            style={{
              padding: sectionPadding,
              borderRadius: sectionRadius,
              background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            Preparing dashboard workspace...
          </section>
        ) : null}
        <header
          style={{
            display: "flex",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: isMobile ? "16px" : "18px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            VaultedShield
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
            <button style={{ ...buttonStyle(false), width: isMobile ? "100%" : "auto" }} onClick={() => onNavigate?.("/upload-center")}>
              Upload
            </button>
            <button style={{ ...buttonStyle(true), width: isMobile ? "100%" : "auto" }} onClick={() => onNavigate?.("/portals")}>
              Open Portal
            </button>
          </div>
        </header>

        <section
          style={{
            padding: isMobile ? "24px 18px" : isTablet ? "30px 26px" : "36px 40px",
            borderRadius: isMobile ? "22px" : "28px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ fontSize: isMobile ? "42px" : "56px", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>
            {intelligence ? `${continuityPercent}%` : "--"}
          </div>
          <div style={{ marginTop: "12px", fontSize: isMobile ? "16px" : "18px", fontWeight: 600, color: "#f8fafc" }}>
            {continuityStatus.label}
          </div>
          <div style={{ marginTop: "10px", maxWidth: "700px", fontSize: "15px", lineHeight: "1.7", color: "#94a3b8" }}>
            {householdState.error || loadError
              ? "Household context is limited, so continuity visibility is partial."
              : continuityStatus.explanation}
          </div>

          <div
            style={{
              marginTop: "28px",
              display: "grid",
              gridTemplateColumns: metricGridColumns,
              gap: "18px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Assets</div>
              <div style={{ marginTop: "6px", fontSize: "20px", fontWeight: 700 }}>{displayValue(totalAssets)}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Protection</div>
              <div style={{ marginTop: "6px", fontSize: "20px", fontWeight: 700 }}>{totalProtectionCoverage > 0 ? formatCurrency(totalProtectionCoverage) : "--"}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Policies</div>
              <div style={{ marginTop: "6px", fontSize: "20px", fontWeight: 700 }}>{displayValue(savedPolicyCount)}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Issues</div>
              <div style={{ marginTop: "6px", fontSize: "20px", fontWeight: 700 }}>{displayValue(totalIssues)}</div>
            </div>
          </div>

          <div style={{ marginTop: "24px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setShowHouseholdReport((current) => !current)}
              style={reportButtonStyle(showHouseholdReport, false)}
            >
              {showHouseholdReport ? "Hide Household Report" : "Open Household Report"}
            </button>
            <button type="button" onClick={handlePrintHouseholdReport} style={buttonStyle(true)}>
              Print Household Report
            </button>
          </div>

          <div
            style={{
              marginTop: "28px",
              display: "grid",
              gridTemplateColumns: isTablet ? "1fr" : "1.1fr 0.9fr",
              gap: "18px",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderRadius: "20px",
                background: "rgba(15,23,42,0.42)",
                border: "1px solid rgba(255,255,255,0.05)",
                display: "grid",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "16px", fontWeight: 700 }}>Household Score</div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#cbd5e1",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  {displayValue(householdScorecard.overallStatus)}
                </div>
              </div>
              <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>{householdScorecard.summary}</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
                  gap: "12px",
                }}
              >
                {householdScorecard.dimensions.map((dimension) => (
                  <div
                    key={dimension.key}
                    style={{
                      padding: "14px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                      {dimension.label}
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.03em" }}>
                      {displayValue(dimension.score)}
                    </div>
                    <div style={{ fontSize: "12px", color: dimension.tone === "ready" ? "#86efac" : dimension.tone === "warning" ? "#fdba74" : "#fca5a5", fontWeight: 700 }}>
                      {dimension.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                padding: "18px 20px",
                borderRadius: "20px",
                background: "rgba(15,23,42,0.42)",
                border: "1px solid rgba(255,255,255,0.05)",
                display: "grid",
                gap: "14px",
              }}
            >
              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "16px", fontWeight: 700 }}>Priority Review Queue</div>
                <div style={{ color: "#e2e8f0", lineHeight: "1.7" }}>{householdPriorityEngine.headline}</div>
                <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>{householdPriorityEngine.summary}</div>
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                {householdPriorityEngine.priorities.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: "4px" }}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                          Priority {index + 1} · {item.source}
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 700 }}>{item.title}</div>
                      </div>
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
                    </div>
                    <div style={{ color: "#e2e8f0", lineHeight: "1.7" }}>{item.blocker}</div>
                    <div style={{ color: "#93c5fd", fontSize: "13px", lineHeight: "1.6" }}>{item.impactLabel}</div>
                    <div style={{ color: "#94a3b8", lineHeight: "1.6" }}>{item.consequence}</div>
                    <div>
                      <button onClick={() => item.route && onNavigate?.(item.route)} style={buttonStyle(false)}>
                        {item.nextAction}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))",
            border: "1px solid rgba(255,255,255,0.06)",
            display: "grid",
            gap: "20px",
          }}
        >
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
              AI Household Intro
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {aiHouseholdIntro.headline}
            </div>
            <div style={{ maxWidth: "980px", fontSize: "15px", lineHeight: "1.8", color: "#cbd5e1" }}>
              {householdState.error || loadError
                ? "VaultedShield is still working with partial household context, so this intro should be read as provisional."
                : aiHouseholdIntro.body}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "18px",
                background: "rgba(15,23,42,0.32)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Strong Areas</div>
              <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#bbf7d0" }}>{aiHouseholdIntro.strongCount}</div>
            </div>
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "18px",
                background: "rgba(15,23,42,0.32)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Watch Areas</div>
              <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#fde68a" }}>{aiHouseholdIntro.moderateCount}</div>
            </div>
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "18px",
                background: "rgba(15,23,42,0.32)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Weak Areas</div>
              <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#fca5a5" }}>{aiHouseholdIntro.weakCount}</div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "14px",
            }}
          >
            {aiIntroModuleCards.map((card) => {
              const tone = getStatusColors(card.status);
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => onNavigate?.(card.route)}
                  style={{
                    padding: "18px",
                    borderRadius: "18px",
                    background: "rgba(15,23,42,0.36)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    display: "grid",
                    gap: "10px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#f8fafc" }}>{card.label}</div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: tone.background,
                        color: tone.color,
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      {card.status}
                    </div>
                  </div>
                  <div style={{ fontSize: "13px", color: "#93c5fd", fontWeight: 700 }}>{card.metric}</div>
                  <div style={{ color: "#cbd5e1", lineHeight: "1.7", fontSize: "14px" }}>{card.summary}</div>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gap: "12px",
              padding: "18px 20px",
              borderRadius: "20px",
              background: "rgba(15,23,42,0.28)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#f8fafc" }}>What To Do Next</div>
              <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                Top 3 Actions
              </div>
            </div>
            <div style={{ display: "grid", gap: "10px" }}>
              {(topActions.length > 0
                ? topActions.slice(0, 3)
                : [{
                    id: "no-urgent-action",
                    label: "No urgent action",
                    summary: "No urgent cross-household action is standing out right now.",
                    route: null,
                    action_key: null,
                  }]).map((item, index) => (
                <button
                  key={item.id || `${index}-${item.summary}`}
                  type="button"
                  onClick={() => {
                    if (item.action_key || item.route) {
                      executeSmartAction(
                        {
                          id: item.id,
                          label: item.label,
                          action_key: item.action_key,
                          route: item.route,
                        },
                        { navigate: onNavigate }
                      );
                    }
                  }}
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                    padding: "12px 14px",
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    textAlign: "left",
                    cursor: item.route || item.action_key ? "pointer" : "default",
                  }}
                  disabled={!item.route && !item.action_key}
                >
                  <div
                    style={{
                      flex: "0 0 auto",
                      width: "24px",
                      height: "24px",
                      borderRadius: "999px",
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(59,130,246,0.16)",
                      color: "#dbeafe",
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                    <div style={{ color: "#f8fafc", fontSize: "14px", fontWeight: 700 }}>{item.label}</div>
                    <div style={{ color: "#cbd5e1", lineHeight: "1.7", fontSize: "14px" }}>{item.summary}</div>
                  </div>
                </button>
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
              <button type="button" onClick={() => onNavigate?.("/guidance")} style={buttonStyle(false)}>
                Open Guidance Center
              </button>
              <button type="button" onClick={() => onNavigate?.("/upload-center")} style={buttonStyle(false)}>
                Upload More Records
              </button>
            </div>
          </div>
        </section>

        {showHouseholdReport ? (
          <HouseholdReportView report={householdReviewReport} onPrint={handlePrintHouseholdReport} isCompact={isTablet} />
        ) : null}

        <section
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
            display: "grid",
            gap: "18px",
          }}
        >
          <div>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>Ask VaultedShield</div>
            <div style={{ marginTop: "10px", maxWidth: "760px", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>
              Ask for a plain-English read on household score, priorities, continuity, changes since review, insurance strength, or access readiness.
            </div>
          </div>

          <div
            style={{
              padding: "16px 18px",
              borderRadius: "18px",
              background: "rgba(15,23,42,0.42)",
              border: "1px solid rgba(255,255,255,0.05)",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
              Advisor Brief
            </div>
            <div style={{ color: "#f8fafc", lineHeight: "1.7" }}>{householdPriorityEngine.headline}</div>
            <div style={{ color: "#cbd5e1", lineHeight: "1.7" }}>{householdPriorityEngine.summary}</div>
            <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>
              Household score: {householdScorecard.overallScore ?? "--"} ({householdScorecard.overallStatus}). Weakest dimension:{" "}
              {householdScorecard.weakestDimension?.label || "—"}.
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleAskHouseholdAssistant(prompt)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "999px",
                  border: "1px solid rgba(147,197,253,0.18)",
                  background: "rgba(59,130,246,0.10)",
                  color: "#dbeafe",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "12px",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
            <input
              value={assistantQuestion}
              onChange={(event) => setAssistantQuestion(event.target.value)}
              placeholder="Ask VaultedShield what matters most"
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(15,23,42,0.55)",
                color: "#e2e8f0",
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAskHouseholdAssistant(assistantQuestion);
                }
              }}
            />
            <button type="button" onClick={() => handleAskHouseholdAssistant(assistantQuestion)} style={buttonStyle(true)}>
              Ask
            </button>
          </div>

          {latestAssistantEntry ? (
            <div
              style={{
                padding: "20px",
                borderRadius: "20px",
                background: "rgba(15,23,42,0.42)",
                border: "1px solid rgba(255,255,255,0.05)",
                display: "grid",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "13px", color: "#93c5fd", fontWeight: 700 }}>Latest Answer</div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color:
                      latestAssistantEntry.response.confidence_label === "strong"
                        ? "#bbf7d0"
                        : latestAssistantEntry.response.confidence_label === "moderate"
                          ? "#fde68a"
                          : "#cbd5e1",
                    background:
                      latestAssistantEntry.response.confidence_label === "strong"
                        ? "rgba(34,197,94,0.12)"
                        : latestAssistantEntry.response.confidence_label === "moderate"
                          ? "rgba(245,158,11,0.12)"
                          : "rgba(148,163,184,0.12)",
                  }}
                >
                  {latestAssistantEntry.response.confidence_label}
                </div>
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                {latestAssistantEntry.question}
              </div>
              <div style={{ fontSize: "15px", lineHeight: "1.8", color: "#e2e8f0" }}>
                {latestAssistantEntry.response.answer_text}
              </div>
              {latestAssistantEntry.response.evidence_points?.length > 0 ? (
                <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#cbd5e1" }}>
                  {latestAssistantEntry.response.evidence_points.map((point) => (
                    <li key={point} style={{ lineHeight: "1.7" }}>
                      {point}
                    </li>
                  ))}
                </ul>
              ) : null}
              {(latestAssistantEntry.response.actions || []).length > 0 ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {latestAssistantEntry.response.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => executeSmartAction(action, { navigate: onNavigate })}
                      style={buttonStyle(false)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(latestAssistantEntry.response.followup_prompts || []).map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => handleAskHouseholdAssistant(prompt.label)}
                    style={{
                      padding: "7px 11px",
                      borderRadius: "999px",
                      border: "1px solid rgba(147,197,253,0.18)",
                      background: "rgba(59,130,246,0.08)",
                      color: "#dbeafe",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: "12px",
                    }}
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {assistantHistory.length > 1 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc" }}>This Session</div>
              {assistantHistory.slice(-3).reverse().map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "16px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#93c5fd", fontWeight: 700 }}>{entry.question}</div>
                  <div style={{ marginTop: "8px", fontSize: "14px", lineHeight: "1.7", color: "#cbd5e1" }}>
                    {entry.response.answer_text}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>Household Review Digest</div>
              <div style={{ marginTop: "10px", maxWidth: "760px", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>
                {reviewDigest.summary}
              </div>
            </div>
            <button onClick={handleRefreshDigestSnapshot} style={buttonStyle(false)}>
              Save Current Snapshot
            </button>
          </div>

          <div
            style={{
              marginTop: "18px",
              display: "grid",
              gridTemplateColumns: metricGridColumns,
              gap: "14px",
            }}
          >
            {[
              { label: "Reopened", value: reviewDigest.reopened_count },
              { label: "Improved", value: reviewDigest.improved_count },
              { label: "Active", value: reviewDigest.active_count },
              {
                label: "Last Snapshot",
                value: reviewDigestSnapshot?.captured_at
                  ? new Date(reviewDigestSnapshot.captured_at).toLocaleDateString("en-US")
                  : "—",
              },
            ].map((metric) => (
              <div
                key={metric.label}
                style={{
                  padding: "16px 18px",
                  borderRadius: "18px",
                  background: "rgba(15,23,42,0.42)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                  {metric.label}
                </div>
                <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, letterSpacing: "-0.03em" }}>
                  {displayValue(metric.value)}
                </div>
              </div>
            ))}
          </div>

          <ul style={{ margin: "18px 0 0 18px", padding: 0, display: "grid", gap: "10px", color: "#e2e8f0" }}>
            {(reviewDigest.bullets.length > 0
              ? reviewDigest.bullets
              : ["Save a review snapshot to start tracking what changed across the household queue."]).map((item) => (
              <li key={item} style={{ lineHeight: "1.7" }}>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>Household Risk and Continuity Map</div>
              <div style={{ marginTop: "10px", maxWidth: "760px", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>
                {householdMap.bottom_line}
              </div>
            </div>
            <div
              style={{
                minWidth: "180px",
                padding: "16px 18px",
                borderRadius: "18px",
                background: "rgba(15,23,42,0.55)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                Household Readiness
              </div>
              <div style={{ marginTop: "6px", fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em" }}>
                {displayValue(householdMap.overall_score)}
              </div>
              <div style={{ marginTop: "6px", fontSize: "14px", fontWeight: 600, color: "#f8fafc" }}>
                {householdMap.overall_status}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "24px",
              display: "grid",
              gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: "18px",
            }}
          >
            {householdMap.focus_areas.map((area) => {
              const tone = getStatusColors(area.status);
              return (
                <div
                  key={area.key}
                  style={{
                    padding: "20px",
                    borderRadius: "20px",
                    background: "rgba(15,23,42,0.42)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    display: "grid",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "17px", fontWeight: 700 }}>{area.title}</div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: tone.color,
                        background: tone.background,
                      }}
                    >
                      {area.status}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                    <div style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "-0.03em" }}>{area.score}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                      score
                    </div>
                  </div>
                  <div style={{ fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>{area.summary}</div>
                  <div>
                    <button
                      onClick={() => area.route && onNavigate?.(area.route)}
                      style={buttonStyle(false)}
                    >
                      {area.action_label || "Open review"}
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
                    {normalizeMetricList(area.metrics).map((metric) => (
                      <div key={`${area.key}-${metric.label}`}>
                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                          {metric.label}
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "18px", fontWeight: 700 }}>
                          {displayValue(metric.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: "22px",
              display: "grid",
              gridTemplateColumns: isTablet ? "1fr" : "1.2fr 1fr",
              gap: "18px",
            }}
          >
            <div
              style={{
                padding: "22px",
                borderRadius: "20px",
                background: "rgba(15,23,42,0.42)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ display: "grid", gap: "12px", marginBottom: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700 }}>Command Center</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {[
                      { label: "Active", value: commandCenter.metrics.active },
                      { label: "Critical", value: commandCenter.metrics.critical },
                      { label: "Warning", value: commandCenter.metrics.warning },
                      { label: "Stalled", value: commandCenter.metrics.stalled },
                    ].map((metric) => (
                      <span
                        key={`command-${metric.label}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#cbd5e1",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        {metric.label}: {metric.value}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ color: "#e2e8f0", lineHeight: "1.7" }}>{commandCenter.headline}</div>
                <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>{commandCenter.summary}</div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {commandCenter.blockers.map((item) => (
                    <div
                      key={`command-center-${item.id}`}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "16px",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.05)",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                        <div style={{ fontSize: "14px", fontWeight: 700 }}>{item.title}</div>
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
                              color: "#cbd5e1",
                              background: "rgba(148,163,184,0.12)",
                            }}
                          >
                            {item.staleLabel}
                          </span>
                        </div>
                      </div>
                      <div style={{ color: "#e2e8f0", lineHeight: "1.7" }}>{item.blocker}</div>
                      <div style={{ color: "#94a3b8", lineHeight: "1.6" }}>{item.consequence}</div>
                      <div>
                        <button onClick={() => item.route && onNavigate?.(item.route)} style={buttonStyle(false)}>
                          {item.nextAction}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div
                style={{
                  marginTop: "18px",
                  paddingTop: "18px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700 }}>Housing Continuity</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {normalizeMetricList(housingCommandCenter.metrics).map((metric) => (
                      <span
                        key={`housing-${metric.label}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#cbd5e1",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        {metric.label}: {metric.value}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ color: "#e2e8f0", lineHeight: "1.7" }}>{housingCommandCenter.headline}</div>
                <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>{housingCommandCenter.summary}</div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {housingCommandCenter.blockers.length > 0 ? (
                    housingCommandCenter.blockers.map((item) => (
                      <div
                        key={`housing-center-${item.id}`}
                        style={{
                          padding: "14px 16px",
                          borderRadius: "16px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.05)",
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ fontSize: "14px", fontWeight: 700 }}>{item.title}</div>
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
                                color: "#cbd5e1",
                                background: "rgba(148,163,184,0.12)",
                              }}
                            >
                              {item.staleLabel}
                            </span>
                          </div>
                        </div>
                        <div style={{ color: "#e2e8f0", lineHeight: "1.7" }}>{item.blocker}</div>
                        <div style={{ color: "#94a3b8", lineHeight: "1.6" }}>{item.consequence}</div>
                        <div>
                          <button onClick={() => item.route && onNavigate?.(item.route)} style={buttonStyle(false)}>
                            {item.nextAction}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>
                      No major housing blockers are standing out across the current property, mortgage, and homeowners stack.
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  marginTop: "18px",
                  paddingTop: "18px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700 }}>Emergency Cash / Access</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {normalizeMetricList(emergencyAccessCommand.metrics).map((metric) => (
                      <span
                        key={`emergency-${metric.label}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#cbd5e1",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        {metric.label}: {metric.value}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ color: "#e2e8f0", lineHeight: "1.7" }}>{emergencyAccessCommand.headline}</div>
                <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>{emergencyAccessCommand.summary}</div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {emergencyAccessCommand.blockers.length > 0 ? (
                    emergencyAccessCommand.blockers.map((item) => (
                      <div
                        key={`emergency-center-${item.id}`}
                        style={{
                          padding: "14px 16px",
                          borderRadius: "16px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.05)",
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ fontSize: "14px", fontWeight: 700 }}>{item.title}</div>
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
                                color: "#cbd5e1",
                                background: "rgba(148,163,184,0.12)",
                              }}
                            >
                              {item.staleLabel}
                            </span>
                          </div>
                        </div>
                        <div style={{ color: "#e2e8f0", lineHeight: "1.7" }}>{item.blocker}</div>
                        <div style={{ color: "#94a3b8", lineHeight: "1.6" }}>{item.consequence}</div>
                        <div>
                          <button onClick={() => item.route && onNavigate?.(item.route)} style={buttonStyle(false)}>
                            {item.nextAction}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>
                      No major emergency cash or access blockers are standing out across liquidity and portal continuity.
                    </div>
                  )}
                </div>
              </div>
              <div style={{ paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "16px", fontWeight: 700 }}>Priority Review Queue</div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {[
                      { label: "Active", value: activeQueueItems.length },
                      { label: "Changed", value: changedSinceReviewItems.length },
                      { label: "Pending Docs", value: pendingDocumentsCount },
                      { label: "Follow Up", value: followUpCount },
                      { label: "Reviewed", value: reviewedQueueItems.length },
                  ].map((metric) => (
                    <span
                      key={metric.label}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "#cbd5e1",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      {metric.label}: {metric.value}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: "10px", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>
                These are the most practical household review items currently limiting stronger continuity and cross-asset clarity.
              </div>
              <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
                {(activeQueueItems.length > 0 ? activeQueueItems : queueItems).map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                        Priority {index + 1}
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: 700 }}>{item.label}</div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: item.workflow_status === "reviewed" ? "#bbf7d0" : item.workflow_status === "pending_documents" ? "#fde68a" : item.workflow_status === "follow_up" ? "#fdba74" : "#cbd5e1",
                          background: item.workflow_status === "reviewed" ? "rgba(34,197,94,0.12)" : item.workflow_status === "pending_documents" ? "rgba(245,158,11,0.12)" : item.workflow_status === "follow_up" ? "rgba(249,115,22,0.12)" : "rgba(148,163,184,0.12)",
                        }}
                      >
                        {item.workflow_label}
                      </span>
                      {item.changed_since_review ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "5px 9px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#93c5fd",
                            background: "rgba(59,130,246,0.14)",
                          }}
                        >
                          {item.changed_since_review_label}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "14px", lineHeight: "1.7", color: "#cbd5e1" }}>
                      {item.summary}
                    </div>
                    <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: item.workflow_assignee_key ? "#93c5fd" : "#94a3b8",
                          background: item.workflow_assignee_key ? "rgba(59,130,246,0.14)" : "rgba(148,163,184,0.12)",
                        }}
                      >
                        Owner: {item.workflow_assignee_label}
                      </span>
                      <select
                        value={item.workflow_assignee_key || ""}
                        onChange={(event) => handleReviewAssignmentUpdate(item.id, event.target.value)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "10px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(15,23,42,0.75)",
                          color: "#e2e8f0",
                        }}
                      >
                        {assigneeChoices.map((option) => (
                          <option key={option.key || "unassigned"} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {item.changed_since_review && item.change_signal ? (
                      <div style={{ marginTop: "8px", fontSize: "13px", lineHeight: "1.6", color: "#93c5fd" }}>
                        {item.change_signal}
                      </div>
                    ) : null}
                    <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => item.route && onNavigate?.(item.route)}
                        style={buttonStyle(false)}
                      >
                        {item.action_label || "Open review"}
                      </button>
                      <button
                        onClick={() => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.pending_documents.key)}
                        style={buttonStyle(false)}
                      >
                        Pending Docs
                      </button>
                      <button
                        onClick={() => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.follow_up.key)}
                        style={buttonStyle(false)}
                      >
                        Follow Up
                      </button>
                      <button
                        onClick={() => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.reviewed.key)}
                        style={buttonStyle(false)}
                      >
                        {item.changed_since_review ? "Review Again" : "Mark Reviewed"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </div>
              {reviewedQueueItems.length > 0 ? (
                <div style={{ marginTop: "18px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc" }}>Recently Reviewed</div>
                  <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                    {reviewedQueueItems.slice(0, 3).map((item) => (
                      <div
                        key={`reviewed-${item.id}`}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "14px",
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ fontSize: "14px", fontWeight: 600 }}>{item.label}</div>
                          <button
                            onClick={() => handleReviewWorkflowUpdate(item.id, REVIEW_WORKFLOW_STATUSES.open.key)}
                            style={buttonStyle(false)}
                          >
                            Reopen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: "18px" }}>
              <div
                style={{
                  padding: "22px",
                  borderRadius: "20px",
                  background: "rgba(15,23,42,0.42)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 700 }}>Strength Signals</div>
                <ul style={{ margin: "14px 0 0 18px", padding: 0, display: "grid", gap: "10px", color: "#e2e8f0" }}>
                  {(householdMap.strength_signals.length > 0
                    ? householdMap.strength_signals
                    : ["Household strengths will become more visible as more linked records and review support are added."]).map((item) => (
                    <li key={item} style={{ lineHeight: "1.7" }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div
                style={{
                  padding: "22px",
                  borderRadius: "20px",
                  background: "rgba(15,23,42,0.42)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 700 }}>Visibility Gaps</div>
                <ul style={{ margin: "14px 0 0 18px", padding: 0, display: "grid", gap: "10px", color: "#e2e8f0" }}>
                  {(householdMap.visibility_gaps.length > 0
                    ? householdMap.visibility_gaps
                    : ["No major visibility gaps are currently standing out across the visible household records."]).map((item) => (
                    <li key={item} style={{ lineHeight: "1.7" }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 700 }}>Action Required</div>
          <div style={{ marginTop: "10px", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>
            {householdState.error || loadError
              ? "Platform visibility is limited until household data loads cleanly."
              : topActions.length > 0
                ? "The system is flagging a small number of concrete issues that block stronger continuity and comparison quality."
                : "No major action items are currently active."}
          </div>
          <ul style={{ margin: "18px 0 0 18px", padding: 0, display: "grid", gap: "10px", color: "#e2e8f0" }}>
            {(topActions.length > 0 ? topActions : ["No major action items are currently active."]).map((item) => (
              <li key={typeof item === "string" ? item : item.id || item.label || item.summary} style={{ lineHeight: "1.7" }}>
                {typeof item === "string" ? item : item.summary || item.label}
              </li>
            ))}
          </ul>
        </section>

        <section
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 700 }}>Insurance Intelligence</div>
          <div
            style={{
              marginTop: "18px",
              display: "grid",
              gridTemplateColumns: metricGridColumns,
              gap: "18px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Total COI Exposure</div>
              <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 700 }}>{totalCoi > 0 ? formatCurrency(totalCoi) : "--"}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Highest Cost Policy</div>
              <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 700 }}>{displayValue(highestCostPolicy?.product || highestCostPolicy?.carrier)}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Weakest Confidence</div>
              <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 700 }}>{displayValue(weakestConfidencePolicy?.product || weakestConfidencePolicy?.carrier)}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>Policies Needing Review</div>
              <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 700 }}>{displayValue(missingFieldPolicies.length)}</div>
            </div>
          </div>
          {policyCompareError ? (
            <div style={{ marginTop: "16px", fontSize: "13px", color: "#94a3b8" }}>
              {policyCompareError}
            </div>
          ) : null}
        </section>

        <section
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 700 }}>Module Overview</div>
          {isMobile ? (
            <div style={{ marginTop: "18px", display: "grid", gap: "12px" }}>
              {moduleRows.map((row) => {
                const tone = getStatusColors(row.status);
                return (
                  <div
                    key={row.module}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      background: "rgba(15,23,42,0.42)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700 }}>{row.module}</div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: tone.color,
                          background: tone.background,
                        }}
                      >
                        {row.status}
                      </span>
                    </div>
                    <div style={{ paddingTop: "2px", color: "#94a3b8", lineHeight: "1.65", fontSize: "14px" }}>{row.insight}</div>
                    <div style={{ color: "#64748b", lineHeight: "1.6", fontSize: "13px" }}>
                      <span style={{ color: "#cbd5e1", fontWeight: 600 }}>Watchpoint:</span> {row.watchpoint}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: "18px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ color: "#64748b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                    <th style={{ padding: "0 0 14px 0", fontWeight: 600 }}>Module</th>
                    <th style={{ padding: "0 0 14px 0", fontWeight: 600 }}>Status</th>
                    <th style={{ padding: "0 0 14px 0", fontWeight: 600 }}>Current Read</th>
                    <th style={{ padding: "0 0 14px 0", fontWeight: 600 }}>Watchpoint</th>
                  </tr>
                </thead>
                <tbody>
                  {moduleRows.map((row) => {
                    const tone = getStatusColors(row.status);
                    return (
                      <tr key={row.module} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "14px 0", fontWeight: 600 }}>{row.module}</td>
                        <td style={{ padding: "14px 0" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "6px 10px",
                              borderRadius: "999px",
                              fontSize: "12px",
                              fontWeight: 700,
                              color: tone.color,
                              background: tone.background,
                            }}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td style={{ padding: "14px 0", color: "#94a3b8" }}>{row.insight}</td>
                        <td style={{ padding: "14px 0", color: "#64748b" }}>{row.watchpoint}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {import.meta.env.DEV ? (
          <div style={{ color: "#64748b", fontSize: "12px" }}>
            household={householdState.context.householdId || "none"} | assets={counts?.assetCount ?? 0} | policies={savedPolicyCount} | weakCoi={weakPolicyRows.length} | missingStatements={missingStatementCount} | dependencyFlags={householdMap.dependency_signals?.dependency_flags?.length || 0} | dependencyPriority={householdMap.dependency_signals?.priority_issues?.length || 0} | totalCharges={totalVisibleCharges > 0 ? formatCurrency(totalVisibleCharges) : "--"} | error={loadError || policyCompareError || "none"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
