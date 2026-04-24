import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildHouseholdReviewReport,
} from "../lib/domain/platformIntelligence";
import HouseholdAIChat from "../components/household/HouseholdAIChat";
import {
  buildReviewWorkflowStateEntry,
  buildHouseholdReviewDigest,
  getHouseholdReviewDigestSnapshot,
  getHouseholdReviewWorkflowState,
  REVIEW_WORKFLOW_STATUSES,
  saveHouseholdReviewDigestSnapshot,
  saveHouseholdReviewWorkflowState,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { buildHouseholdReviewQueueItems } from "../lib/domain/platformIntelligence/reviewWorkspaceData";
import { buildWorkflowAwareHouseholdContext } from "../lib/domain/platformIntelligence/workflowMemory";
import QuickActionGrid from "../components/onboarding/QuickActionGrid";
import SetupChecklist from "../components/onboarding/SetupChecklist";
import { useDemoMode } from "../lib/demo/DemoModeContext";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import { getPolicyDetailRoute } from "../lib/navigation/insurancePolicyRouting";
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
  summarizeWarrantyModule,
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
    border: primary ? "none" : "1px solid rgba(203, 213, 225, 0.92)",
    background: primary ? "#2563eb" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "13px",
    boxShadow: primary ? "0 14px 28px rgba(37, 99, 235, 0.18)" : "0 8px 20px rgba(15, 23, 42, 0.06)",
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
        route: getPolicyDetailRoute(policy),
      });
    }

    if (policy.coi_confidence === "weak") {
      signals.push({
        id: `${policy.policy_id || label}-coi-review`,
        label: "Validate COI and charges",
        summary: `${label}: validate COI and charge visibility.`,
        route: getPolicyDetailRoute(policy),
        action_key: "open_insurance_hub",
      });
    }

    if (!policy.latest_statement_date) {
      signals.push({
        id: `${policy.policy_id || label}-statement-date`,
        label: "Resolve latest statement",
        summary: `${label}: resolve the latest statement date.`,
        route: getPolicyDetailRoute(policy),
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
  if (status === "Strong") return { color: "#15803d", background: "rgba(34,197,94,0.12)" };
  if (status === "Moderate") return { color: "#b45309", background: "rgba(245,158,11,0.12)" };
  if (status === "Weak") return { color: "#fdba74", background: "rgba(249,115,22,0.12)" };
  if (status === "Ready") return { color: "#15803d", background: "rgba(34,197,94,0.12)" };
  if (status === "Building") return { color: "#b45309", background: "rgba(245,158,11,0.12)" };
  if (status === "Needs Review") return { color: "#b91c1c", background: "rgba(239,68,68,0.12)" };
  if (status === "At Risk") return { color: "#b91c1c", background: "rgba(239,68,68,0.12)" };
  return { color: "#475569", background: "rgba(148,163,184,0.12)" };
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

function fasciaButtonStyle(primary = false) {
  return {
    border: primary ? "none" : "1px solid rgba(203, 213, 225, 0.92)",
    background: primary ? "#2563eb" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    borderRadius: "999px",
    padding: "11px 16px",
    fontWeight: 700,
    fontSize: "13px",
    cursor: "pointer",
    boxShadow: primary ? "0 14px 28px rgba(37, 99, 235, 0.18)" : "0 8px 20px rgba(15, 23, 42, 0.06)",
  };
}

function dashboardSurfaceCardStyle(extra = {}) {
  return {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid rgba(226, 232, 240, 0.92)",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.06)",
    ...extra,
  };
}

function DashboardCard({ children, style = {}, ...rest }) {
  return (
    <div style={dashboardSurfaceCardStyle(style)} {...rest}>
      {children}
    </div>
  );
}

function getDashboardTone(score = 0) {
  if (score >= 82) return "good";
  if (score >= 64) return "info";
  if (score >= 50) return "warning";
  return "alert";
}

function getDashboardPalette(tone = "info") {
  if (tone === "good") {
    return {
      accent: "#22c55e",
      soft: "rgba(34, 197, 94, 0.14)",
      text: "#166534",
    };
  }
  if (tone === "warning") {
    return {
      accent: "#f59e0b",
      soft: "rgba(245, 158, 11, 0.14)",
      text: "#92400e",
    };
  }
  if (tone === "alert") {
    return {
      accent: "#ef4444",
      soft: "rgba(239, 68, 68, 0.14)",
      text: "#991b1b",
    };
  }
  return {
    accent: "#3b82f6",
    soft: "rgba(59, 130, 246, 0.14)",
    text: "#1d4ed8",
  };
}

function normalizeDashboardScore(value, fallback = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function scoreFromReadinessStatus(status = "", fallback = 46) {
  const normalized = String(status || "").toLowerCase();
  if (["excellent", "strong", "healthy", "ready"].includes(normalized)) return 88;
  if (["good", "moderate", "building", "usable"].includes(normalized)) return 72;
  if (["needs review", "watch", "starter"].includes(normalized)) return 56;
  if (["needs attention", "at risk", "weak"].includes(normalized)) return 42;
  return fallback;
}

function getFriendlyRingStatus(score, { count = 1, allowExcellent = true, emptyLabel = "Missing Items" } = {}) {
  if ((count || 0) === 0) return emptyLabel;
  if (allowExcellent && score >= 90) return "Excellent";
  if (score >= 80) return "Strong";
  if (score >= 65) return "Good";
  if (score >= 50) return "Needs Review";
  return "Needs Attention";
}

function getPriorityActionLabel(item = null) {
  const route = String(item?.route || "").toLowerCase();
  const action = String(item?.nextAction || item?.label || "").toLowerCase();
  if (action.includes("upload") || route.includes("upload")) return "Upload";
  if (action.includes("connect") || route.includes("portal")) return "Connect";
  if (action.includes("update") || route.includes("property")) return "Update";
  if (action.includes("report") || route.includes("reports")) return "Open";
  return "Review Now";
}

function getCategoryBadge(label = "") {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("insurance")) return "IN";
  if (normalized.includes("property")) return "PR";
  if (normalized.includes("document")) return "DC";
  if (normalized.includes("access")) return "AC";
  if (normalized.includes("retirement")) return "RT";
  if (normalized.includes("warranty")) return "WR";
  return "VS";
}

function getGreetingLabel() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardGlyph({ kind = "spark", size = 18, stroke = 1.8 }) {
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (kind === "sun") {
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2.5v2.5M12 19v2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12H5M19 12h2.5M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </svg>
    );
  }

  if (kind === "bell") {
    return (
      <svg {...shared}>
        <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 5.3 2.1 6.5 2.1 6.5H4.4s2.1-1.2 2.1-6.5Z" />
        <path d="M10 18a2.3 2.3 0 0 0 4 0" />
      </svg>
    );
  }

  if (kind === "help") {
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.6 9.2a2.6 2.6 0 1 1 4.4 2c-.8.7-1.6 1.1-1.6 2.3" />
        <path d="M12 16.8h.01" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
    </svg>
  );
}

function HeaderUtilityButton({ kind, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: "42px",
        height: "42px",
        borderRadius: "999px",
        border: "1px solid rgba(203, 213, 225, 0.92)",
        background: "#ffffff",
        color: "#475569",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
      }}
    >
      <DashboardGlyph kind={kind} size={18} />
    </button>
  );
}

function ScoreRing({ value = 0, size = "md", tone = "info", iconLabel = "", subtitle = "" }) {
  const palette = getDashboardPalette(tone);
  const normalizedScore = normalizeDashboardScore(value);
  const sizeMap = {
    lg: { diameter: 148, stroke: 12, number: "42px", badge: "34px", subtitle: "12px" },
    md: { diameter: 96, stroke: 9, number: "28px", badge: "28px", subtitle: "11px" },
    sm: { diameter: 72, stroke: 7, number: "20px", badge: "24px", subtitle: "10px" },
  };
  const ring = sizeMap[size] || sizeMap.md;

  return (
    <div
      style={{
        width: `${ring.diameter}px`,
        height: `${ring.diameter}px`,
        borderRadius: "999px",
        background: `conic-gradient(${palette.accent} ${normalizedScore * 3.6}deg, #e2e8f0 ${normalizedScore * 3.6}deg 360deg)`,
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
        <div style={{ fontSize: ring.number, fontWeight: 800, lineHeight: 1, color: "#0f172a" }}>
          {normalizedScore}
        </div>
        <div style={{ fontSize: ring.subtitle, color: "#64748b", fontWeight: 700 }}>{subtitle || "of 100"}</div>
      </div>
    </div>
  );
}

function DashboardRingCard({ label, score, statusLabel, helper, iconLabel, tone = "info", onClick }) {
  const palette = getDashboardPalette(tone);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...dashboardSurfaceCardStyle({
          padding: "22px 18px 20px",
          display: "grid",
          gap: "12px",
          textAlign: "center",
          cursor: onClick ? "pointer" : "default",
          minWidth: 0,
          minHeight: "198px",
          alignContent: "start",
        }),
        border: `1px solid rgba(226, 232, 240, 0.9)`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ScoreRing value={score} size="md" tone={tone} iconLabel={iconLabel} subtitle="%" />
      </div>
      <div style={{ display: "grid", gap: "5px", justifyItems: "center", textAlign: "center" }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{label}</div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: "999px",
            background: palette.soft,
            color: palette.text,
            fontSize: "12px",
            fontWeight: 800,
          }}
        >
          {statusLabel}
        </div>
        <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: "1.45" }}>{helper}</div>
      </div>
    </button>
  );
}

export default function DashboardPage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const { isDemoMode, startDemo } = useDemoMode();
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
  const [demoAssistantQuestion, setDemoAssistantQuestion] = useState("");
  const [demoAssistantHistory, setDemoAssistantHistory] = useState([]);
  const sectionRefs = useRef({});
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
  const workflowAwareHouseholdContext = useMemo(
    () =>
      buildWorkflowAwareHouseholdContext({
        householdMap,
        queueItems,
        reviewDigest,
        commandCenter,
        housingCommand: housingCommandCenter,
        emergencyAccessCommand,
        bundle: intelligenceBundle,
      }),
    [
      commandCenter,
      emergencyAccessCommand,
      householdMap,
      housingCommandCenter,
      intelligenceBundle,
      queueItems,
      reviewDigest,
    ]
  );
  const householdScorecard = workflowAwareHouseholdContext.scorecard || buildHouseholdScorecard(householdMap);
  const householdPriorityEngine =
    workflowAwareHouseholdContext.priorityEngine ||
    buildHouseholdPriorityEngine({
      householdMap,
      commandCenter,
      housingCommand: housingCommandCenter,
      emergencyAccessCommand,
      bundle: intelligenceBundle,
    });
  const assistantHouseholdMap = workflowAwareHouseholdContext.householdMap || householdMap;
  const assistantReviewDigest = workflowAwareHouseholdContext.reviewDigest || reviewDigest;
  const assistantQueueItems = workflowAwareHouseholdContext.activeQueueItems || activeQueueItems;
  const resolvedQueueItems = workflowAwareHouseholdContext.resolvedQueueItems || reviewedQueueItems;
  const workflowResolutionMemory = workflowAwareHouseholdContext.resolutionMemory || {
    activeIssueCount: activeQueueItems.length,
    resolvedIssueCount: reviewedQueueItems.length,
    recentlyResolved: [],
  };
  const householdReviewReport = useMemo(
    () =>
      showHouseholdReport
        ? buildHouseholdReviewReport({
            bundle: intelligenceBundle || {},
            intelligence,
            householdMap: assistantHouseholdMap,
            queueItems,
            reviewDigest: assistantReviewDigest,
          })
        : null,
    [showHouseholdReport, intelligenceBundle, intelligence, assistantHouseholdMap, queueItems, assistantReviewDigest]
  );
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
  const warrantySummary = useMemo(
    () => summarizeWarrantyModule(intelligenceBundle?.warranties || []),
    [intelligenceBundle?.warranties]
  );
  const householdName =
    householdState.household?.household_name ||
    intelligenceBundle?.household?.household_name ||
    "Working Household";
  const overallReadinessScore = normalizeDashboardScore(
    householdScorecard.overallScore ?? continuityPercent,
    continuityPercent
  );
  const readinessLift = Math.min(8, resolvedQueueItems.length * 4);
  const readinessTone = getDashboardTone(overallReadinessScore);
  const heroHeadline =
    overallReadinessScore >= 82
      ? "Good progress!"
      : overallReadinessScore >= 64
        ? "Steady progress."
        : "Start with one clear next step.";
  const heroSummary =
    householdScorecard.summary ||
    continuityStatus.explanation ||
    "VaultedShield is still building the household picture from the records it can see.";
  const strongestDimension = householdScorecard.strongestDimension || null;
  const weakestDimension = householdScorecard.weakestDimension || null;
  const heroSupportLine =
    strongestDimension && weakestDimension
      ? `${strongestDimension.label} is currently strongest, while ${weakestDimension.label.toLowerCase()} needs the most support.`
      : continuityStatus.explanation;
  const dashboardCategoryRings = useMemo(() => {
    const protectionDimension = householdScorecard.dimensions.find((item) => item.key === "protection") || null;
    const propertyDimension = householdScorecard.dimensions.find((item) => item.key === "property") || null;
    const documentationDimension = householdScorecard.dimensions.find((item) => item.key === "documentation") || null;
    const continuityDimension = householdScorecard.dimensions.find((item) => item.key === "continuity") || null;
    const retirementCount = Number(assetCounts.retirement || 0);
    const retirementScore = retirementCount > 0 ? Math.min(92, 50 + retirementCount * 12) : 42;
    const warrantyCount = Number(assetCounts.warranty || intelligenceBundle?.warranties?.length || 0);
    const warrantyScore = warrantyCount > 0
      ? scoreFromReadinessStatus(warrantySummary.status, 58)
      : 40;

    return [
      {
        key: "insurance",
        label: "Insurance",
        score: normalizeDashboardScore(
          protectionDimension?.score,
          scoreFromReadinessStatus(savedPolicyCount > 0 ? (weakPolicyRows.length > 0 || missingStatementCount > 0 ? "needs review" : "strong") : "needs review", 44)
        ),
        statusLabel: getFriendlyRingStatus(
          normalizeDashboardScore(
            protectionDimension?.score,
            scoreFromReadinessStatus(savedPolicyCount > 0 ? (weakPolicyRows.length > 0 || missingStatementCount > 0 ? "needs review" : "strong") : "needs review", 44)
          ),
          { count: savedPolicyCount, emptyLabel: "Missing Items" }
        ),
        helper:
          savedPolicyCount > 0
            ? `${savedPolicyCount} polic${savedPolicyCount === 1 ? "y" : "ies"} visible`
            : "Add the first policy",
        iconLabel: getCategoryBadge("insurance"),
        tone: getDashboardTone(
          normalizeDashboardScore(
            protectionDimension?.score,
            scoreFromReadinessStatus(savedPolicyCount > 0 ? (weakPolicyRows.length > 0 || missingStatementCount > 0 ? "needs review" : "strong") : "needs review", 44)
          )
        ),
        route: "/insurance",
      },
      {
        key: "property",
        label: "Property",
        score: normalizeDashboardScore(
          propertyDimension?.score,
          scoreFromReadinessStatus(propertySummary.propertyCount > 0 ? ((propertySummary.propertiesWithValuationCount || 0) > 0 ? "good" : "needs review") : "needs review", 46)
        ),
        statusLabel: getFriendlyRingStatus(
          normalizeDashboardScore(
            propertyDimension?.score,
            scoreFromReadinessStatus(propertySummary.propertyCount > 0 ? ((propertySummary.propertiesWithValuationCount || 0) > 0 ? "good" : "needs review") : "needs review", 46)
          ),
          { count: propertySummary.propertyCount || 0, emptyLabel: "Missing Items" }
        ),
        helper:
          (propertySummary.propertyCount || 0) > 0
            ? `${propertySummary.propertyCount || 0} propert${propertySummary.propertyCount === 1 ? "y" : "ies"} tracked`
            : "Home stack still building",
        iconLabel: getCategoryBadge("property"),
        tone: getDashboardTone(
          normalizeDashboardScore(
            propertyDimension?.score,
            scoreFromReadinessStatus(propertySummary.propertyCount > 0 ? ((propertySummary.propertiesWithValuationCount || 0) > 0 ? "good" : "needs review") : "needs review", 46)
          )
        ),
        route: "/property",
      },
      {
        key: "documents",
        label: "Documents",
        score: normalizeDashboardScore(
          documentationDimension?.score,
          scoreFromReadinessStatus(vaultSummary.status, 44)
        ),
        statusLabel: getFriendlyRingStatus(
          normalizeDashboardScore(documentationDimension?.score, scoreFromReadinessStatus(vaultSummary.status, 44)),
          { count: vaultSummary.metrics?.documents || 0, emptyLabel: "Missing Items" }
        ),
        helper:
          (vaultSummary.metrics?.documents || 0) > 0
            ? `${vaultSummary.metrics?.documents || 0} document${vaultSummary.metrics?.documents === 1 ? "" : "s"} loaded`
            : "Document support is light",
        iconLabel: getCategoryBadge("documents"),
        tone: getDashboardTone(
          normalizeDashboardScore(documentationDimension?.score, scoreFromReadinessStatus(vaultSummary.status, 44))
        ),
        route: "/upload-center",
      },
      {
        key: "access",
        label: "Access & Portals",
        score: normalizeDashboardScore(
          continuityDimension?.score,
          scoreFromReadinessStatus(portalSummary.status, 48)
        ),
        statusLabel: getFriendlyRingStatus(
          normalizeDashboardScore(continuityDimension?.score, scoreFromReadinessStatus(portalSummary.status, 48)),
          { count: portalSummary.metrics?.portals || 0, emptyLabel: "Needs Review" }
        ),
        helper:
          (portalSummary.metrics?.portals || 0) > 0
            ? `${portalSummary.metrics?.portals || 0} portal${portalSummary.metrics?.portals === 1 ? "" : "s"} connected`
            : "Access continuity needs setup",
        iconLabel: getCategoryBadge("access"),
        tone: getDashboardTone(
          normalizeDashboardScore(continuityDimension?.score, scoreFromReadinessStatus(portalSummary.status, 48))
        ),
        route: "/portals",
      },
      {
        key: "retirement",
        label: "Retirement",
        score: normalizeDashboardScore(retirementScore, retirementScore),
        statusLabel: getFriendlyRingStatus(retirementScore, { count: retirementCount, emptyLabel: "Missing Items" }),
        helper:
          retirementCount > 0
            ? `${retirementCount} account${retirementCount === 1 ? "" : "s"} visible`
            : "Retirement details are thin",
        iconLabel: getCategoryBadge("retirement"),
        tone: getDashboardTone(retirementScore),
        route: "/retirement",
      },
      {
        key: "warranty",
        label: "Warranty",
        score: normalizeDashboardScore(warrantyScore, warrantyScore),
        statusLabel: getFriendlyRingStatus(warrantyScore, { count: warrantyCount, emptyLabel: "Missing Items" }),
        helper:
          warrantyCount > 0
            ? `${warrantyCount} contract${warrantyCount === 1 ? "" : "s"} tracked`
            : "Protection add-ons still need intake",
        iconLabel: getCategoryBadge("warranty"),
        tone: getDashboardTone(warrantyScore),
        route: "/warranties",
      },
    ];
  }, [
    assetCounts,
    householdScorecard.dimensions,
    intelligenceBundle?.warranties,
    missingStatementCount,
    portalSummary,
    propertySummary,
    savedPolicyCount,
    vaultSummary,
    warrantySummary.status,
    weakPolicyRows.length,
  ]);
  const priorityRows = useMemo(() => {
    const mappedPriorities = householdPriorityEngine.priorities.slice(0, 4).map((item, index) => ({
      id: item.id || `priority-${index}`,
      badge: getCategoryBadge(item.source || item.title),
      title: item.title,
      detail: item.blocker || item.summary || item.consequence || "Open this review item to see the next practical step.",
      actionLabel: getPriorityActionLabel(item),
      route: item.route || "/review-workspace",
      meta: item.impactLabel || item.staleLabel || item.source || "Priority",
    }));

    if (mappedPriorities.length > 0) return mappedPriorities;

    return topActions.slice(0, 4).map((item, index) => ({
      id: item.id || `action-${index}`,
      badge: getCategoryBadge(item.label || item.summary),
      title: item.label || "Open recommended review",
      detail: item.summary || "A guided next step is available.",
      actionLabel: getPriorityActionLabel(item),
      route: item.route || "/review-workspace",
      meta: "Priority",
    }));
  }, [householdPriorityEngine.priorities, topActions]);
  const recentlyImprovedRows = useMemo(() => {
    const derivedRows = assistantReviewDigest.improved_items.slice(0, 3).map((item, index) => ({
      id: item.id || `improved-${index}`,
      title: item.label || item.summary || "Household item improved",
      detail: "Moved into reviewed status and is no longer driving the active queue.",
      delta: `+${Math.max(1, Math.ceil(readinessLift / Math.max(assistantReviewDigest.improved_items.length, 1)))} pts`,
    }));

    if (derivedRows.length > 0) return derivedRows;

    return workflowResolutionMemory.recentlyResolved.slice(0, 3).map((item, index) => ({
      id: `resolved-${index}`,
      title: item,
      detail: "Reviewed work is still being remembered in household readiness.",
      delta: `+${Math.max(1, Math.ceil(readinessLift / Math.max(workflowResolutionMemory.recentlyResolved.length || 1, 1)))} pts`,
    }));
  }, [
    assistantReviewDigest.improved_items,
    readinessLift,
    workflowResolutionMemory.recentlyResolved,
  ]);
  const upcomingReviewRows = useMemo(() => {
    const candidates = householdPriorityEngine.priorities.slice(0, 3).map((item, index) => ({
      id: item.id || `review-${index}`,
      title: item.title,
      dueLabel: item.staleLabel || item.nextAction || "Review soon",
      route: item.route || "/review-workspace",
    }));

    if (candidates.length > 0) return candidates;

    return [
      { id: "fallback-insurance", title: "Insurance annual review", dueLabel: "Review soon", route: "/insurance" },
      { id: "fallback-property", title: "Property stack review", dueLabel: "Review soon", route: "/property" },
      { id: "fallback-retirement", title: "Retirement check-in", dueLabel: "Review soon", route: "/retirement" },
    ];
  }, [householdPriorityEngine.priorities]);
  const showLoadingShell =
    (loadingStates.household || loadingStates.householdData) && !counts && !intelligenceBundle;
  const sectionPadding = isMobile ? "20px 16px" : isTablet ? "24px 22px" : "28px 30px";
  const sectionRadius = isMobile ? "20px" : "24px";
  const metricGridColumns = isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(180px, 1fr))";
  const householdAssistantSectionLabels = useMemo(
    () => ({
      "household-priority": "Top Priorities",
      "household-assistant": "Household Guide",
      "household-review-digest": "Recent Progress",
      "household-risk-map": "Household Readiness Map",
      "property-operating-graph": "Property Connections",
      "action-required": "What Needs Attention Now",
      "insurance-intelligence": "Insurance Review",
      "module-overview": "Platform Overview",
    }),
    []
  );

  function setSectionRef(key, node) {
    if (!key) return;
    sectionRefs.current[key] = node;
  }

  function scrollToDashboardSection(section) {
    const target = sectionRefs.current[section];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleReviewWorkflowUpdate(itemId, status) {
    const householdId = householdState.context.householdId;
    if (!householdId || !itemId) return;
    const targetItem = queueItems.find((item) => item.id === itemId) || null;

    const nextState = {
      ...reviewWorkflowState,
      [itemId]: buildReviewWorkflowStateEntry({
        item: targetItem,
        currentEntry: reviewWorkflowState[itemId] || {},
        householdId,
        updates: {
          status,
          updated_at: new Date().toISOString(),
        },
      }),
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
      description: "Start life insurance review with a baseline illustration or policy packet.",
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
          color: "#334155",
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
              background: "#ffffff",
              border: "1px solid rgba(226, 232, 240, 0.96)",
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
              <div style={{ fontSize: isMobile ? "18px" : "22px", fontWeight: 700, color: "#0f172a" }}>
                Let&apos;s build your household profile
              </div>
              <div style={{ fontSize: "15px", lineHeight: "1.8", color: "#475569" }}>
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
                  <div style={{ marginTop: "8px", fontSize: isMobile ? "24px" : "28px", fontWeight: 800, color: "#0f172a" }}>
                    {onboardingMission.headline}
                  </div>
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: "999px",
                    background: "#f8fafc",
                    color: "#334155",
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  {onboardingMission.completionSummary}
                </div>
              </div>
              <div style={{ color: "#1d4ed8", lineHeight: "1.8", fontSize: "15px" }}>
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
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Household setup progress</div>
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
                    background: "#f8fafc",
                    border: "1px solid rgba(226, 232, 240, 0.96)",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>{metric.label}</div>
                  <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{metric.value}</div>
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
                background: "#ffffff",
                border: "1px solid rgba(226, 232, 240, 0.96)",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "20px", fontWeight: 700 }}>What unlocks after your next step</div>
              <div style={{ color: "#475569", lineHeight: "1.8" }}>
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
                background: "#ffffff",
                border: "1px solid rgba(226, 232, 240, 0.96)",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "20px", fontWeight: 700 }}>Insurance onboarding</div>
              <div style={{ color: "#475569", lineHeight: "1.8" }}>
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
            data-demo-id="dashboard-demo-entry"
            style={{
              padding: sectionPadding,
              borderRadius: sectionRadius,
              background: "#ffffff",
              border: "1px solid rgba(226, 232, 240, 0.96)",
              display: "grid",
              gap: "14px",
            }}
          >
            <div style={{ display: "grid", gap: "8px", maxWidth: "860px" }}>
              <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                Demo Path
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800 }}>A strong first walkthrough</div>
              <div style={{ color: "#475569", lineHeight: "1.8" }}>
                If you want the dashboard to come alive quickly, this is the cleanest setup order for a household demo.
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", paddingTop: "6px" }}>
                <button type="button" onClick={() => startDemo()} style={buttonStyle(true)}>
                  {isDemoMode ? "Restart Demo" : "Start Demo"}
                </button>
                <button type="button" onClick={() => onNavigate?.("/insurance")} style={buttonStyle(false)}>
                  Open Insurance Workspace
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              {[
                "Add one household member",
                "Upload one life policy",
                "Add one property or account",
                "Upload one shared household document",
              ].map((item, index) => (
                <div
                  key={item}
                  style={{
                    padding: "16px 18px",
                    borderRadius: "18px",
                    background: "#f8fafc",
                    border: "1px solid rgba(226, 232, 240, 0.96)",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#7dd3fc", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>
                    Step {index + 1}
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.6" }}>{item}</div>
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              padding: sectionPadding,
              borderRadius: sectionRadius,
              background: "#ffffff",
              border: "1px solid rgba(226, 232, 240, 0.96)",
              display: "grid",
              gap: "18px",
            }}
          >
            <div style={{ display: "grid", gap: "8px", maxWidth: "820px" }}>
              <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                Demo Preview
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800 }}>What a built household looks like</div>
              <div style={{ color: "#475569", lineHeight: "1.8" }}>
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
                  background: "#f8fafc",
                  border: "1px solid rgba(226, 232, 240, 0.96)",
                  display: "grid",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {demoHouseholdPreview.householdLabel}
                  </div>
                  <div style={{ marginTop: "8px", fontSize: "32px", fontWeight: 800, color: "#0f172a" }}>
                    {demoHouseholdPreview.score.overall}
                  </div>
                  <div style={{ marginTop: "6px", color: "#475569", fontWeight: 700 }}>
                    {demoHouseholdPreview.score.status}
                  </div>
                </div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {demoHouseholdPreview.score.dimensions.map((item) => (
                    <div key={item.label} style={{ display: "grid", gap: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "14px" }}>
                        <span style={{ color: "#334155", fontWeight: 600 }}>{item.label}</span>
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
                    background: "#f8fafc",
                    border: "1px solid rgba(226, 232, 240, 0.96)",
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
                          background: "#ffffff",
                          border: "1px solid rgba(226, 232, 240, 0.96)",
                          display: "grid",
                          gap: "6px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.label}</div>
                          <span style={{ color: "#93c5fd", fontSize: "12px", fontWeight: 800 }}>{item.impact}</span>
                        </div>
                        <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.reason}</div>
                        <div style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.7" }}>
                          <span style={{ color: "#334155", fontWeight: 700 }}>Next:</span> {item.nextAction}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "#f8fafc",
                    border: "1px solid rgba(226, 232, 240, 0.96)",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontSize: "16px", fontWeight: 800 }}>Module command read</div>
                  {demoHouseholdPreview.modules.map((item) => (
                    <div key={item.label} style={{ display: "grid", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                        <span style={{ color: "#0f172a", fontWeight: 700 }}>{item.label}</span>
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
              background: "#ffffff",
              border: "1px solid rgba(226, 232, 240, 0.96)",
              display: "grid",
              gap: "16px",
            }}
          >
            <div style={{ display: "grid", gap: "8px", maxWidth: "860px" }}>
              <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
                Demo Advisor
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800 }}>Ask what this system will help with</div>
              <div style={{ color: "#475569", lineHeight: "1.8" }}>
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
                    color: "#1d4ed8",
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
                  background: "#f8fafc",
                  color: "#0f172a",
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
                  background: "#f8fafc",
                  border: "1px solid rgba(226, 232, 240, 0.96)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Demo answer
                </div>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>
                  {demoAssistantHistory[demoAssistantHistory.length - 1].question}
                </div>
                <div style={{ color: "#475569", lineHeight: "1.8" }}>
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

          {shouldShowDevDiagnostics() ? (
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
        background: "#f6f8fb",
        color: "#0f172a",
        padding: isMobile ? "20px 16px 32px" : isTablet ? "24px 22px 40px" : "32px 28px 48px",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: "1280px", display: "grid", gap: "28px" }}>
        {showLoadingShell ? (
          <section
            style={dashboardSurfaceCardStyle({
              padding: sectionPadding,
              color: "#334155",
            })}
          >
            Preparing your household dashboard...
          </section>
        ) : null}
        <header
          style={{
            display: "flex",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: isMobile ? "0" : "4px",
          }}
        >
          <div style={{ display: "grid", gap: "8px", minWidth: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #fff3bf 0%, #fde68a 100%)",
                  boxShadow: "0 10px 24px rgba(245, 158, 11, 0.18)",
                  display: "grid",
                  placeItems: "center",
                  color: "#b45309",
                }}
              >
                <DashboardGlyph kind="sun" size={20} />
              </div>
              <div style={{ fontSize: isMobile ? "28px" : "34px", lineHeight: 1.05, letterSpacing: "-0.04em", fontWeight: 800 }}>
                {getGreetingLabel()}, {householdName}
              </div>
            </div>
            <div style={{ color: "#64748b", fontSize: "15px", lineHeight: "1.7" }}>
              Here's your household overview for today.
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", width: isMobile ? "100%" : "auto", alignItems: "center" }}>
            <HeaderUtilityButton kind="bell" label="Notifications" onClick={() => scrollToDashboardSection("household-priority")} />
            <HeaderUtilityButton kind="help" label="Help" onClick={() => scrollToDashboardSection("household-assistant")} />
            <button
              type="button"
              onClick={() => scrollToDashboardSection("household-assistant")}
              style={{ ...fasciaButtonStyle(true), width: isMobile ? "100%" : "auto" }}
            >
              Assistant
            </button>
          </div>
        </header>

        <section
          style={{
            display: "block",
          }}
        >
          <DashboardCard
            style={{
              padding: isMobile ? "24px 20px" : isTablet ? "28px 26px" : "34px 32px",
              display: "grid",
              gap: "24px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : isTablet
                    ? "minmax(0, 1fr) 170px"
                    : "minmax(280px, 1.05fr) 210px minmax(280px, 0.95fr)",
                gap: isMobile ? "20px" : "24px",
                alignItems: "center",
              }}
            >
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>Household Readiness</div>
                <div style={{ color: "#64748b", lineHeight: "1.7" }}>Overall preparedness across all areas</div>
                <div style={{ color: "#0f172a", fontSize: isMobile ? "28px" : "32px", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em" }}>
                  {continuityStatus.label === "Strong" ? "Good progress!" : heroHeadline}
                </div>
                <div style={{ color: "#334155", lineHeight: "1.75", maxWidth: "560px" }}>{heroSummary}</div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "8px 12px", borderRadius: "999px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 700, fontSize: "13px" }}>
                    {displayValue(householdScorecard.overallStatus)}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "8px 12px", borderRadius: "999px", background: "#f8fafc", color: "#475569", fontWeight: 700, fontSize: "13px" }}>
                    {displayValue(activeQueueItems.length)} open items
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center" }}>
                <ScoreRing value={overallReadinessScore} size="lg" tone={readinessTone} subtitle="of 100" />
              </div>

              <div style={{ display: "grid", gap: "16px" }}>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em", color: "#16a34a" }}>
                    Good progress!
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{heroSupportLine}</div>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => scrollToDashboardSection("household-risk-map")} style={fasciaButtonStyle(true)}>
                    View Full Breakdown
                  </button>
                  <button type="button" onClick={() => setShowHouseholdReport((current) => !current)} style={fasciaButtonStyle(false)}>
                    {showHouseholdReport ? "Hide Brief" : "Open Brief"}
                  </button>
                </div>
                <div
                  style={{
                    padding: "18px 18px 16px",
                    borderRadius: "18px",
                    background: "#f8fafc",
                    border: "1px solid rgba(226, 232, 240, 0.9)",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
                    Since Last Review
                  </div>
              {[
                    { label: "Score lift", value: readinessLift > 0 ? `+${readinessLift} pts` : "0 pts" },
                    { label: "Issues resolved", value: displayValue(resolvedQueueItems.length) },
                    { label: "Items improved", value: displayValue(assistantReviewDigest.improved_items.length || recentlyImprovedRows.length) },
                    { label: "New items added", value: displayValue(changedSinceReviewItems.length) },
                  ].map((item) => (
                    <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                      <div style={{ color: "#64748b", fontSize: "14px" }}>{item.label}</div>
                      <div style={{ color: "#0f172a", fontWeight: 800 }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DashboardCard>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(6, minmax(0, 1fr))",
            gap: isMobile ? "16px" : "22px",
          }}
        >
          {dashboardCategoryRings.map((item) => (
            <DashboardRingCard
              key={item.key}
              label={item.label}
              score={item.score}
              statusLabel={item.statusLabel}
              helper={item.helper}
              iconLabel={item.iconLabel}
              tone={item.tone}
              onClick={() => item.route && onNavigate?.(item.route)}
            />
          ))}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
            gap: "24px",
            alignItems: "stretch",
          }}
        >
          <div
            style={dashboardSurfaceCardStyle({
              padding: isMobile ? "22px 20px" : "24px 24px 26px",
              display: "grid",
              gap: "18px",
              height: "100%",
            })}
            ref={(node) => setSectionRef("household-priority", node)}
          >
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Top Priorities</div>
              <div style={{ color: "#334155", lineHeight: "1.75" }}>
                What needs attention first, without the technical overload.
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {priorityRows.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0, 1fr) auto",
                    gap: "14px",
                    alignItems: "center",
                    padding: "16px 16px",
                    borderRadius: "20px",
                    background: "#f8fafc",
                    border: "1px solid rgba(226, 232, 240, 0.94)",
                  }}
                >
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "16px",
                      background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                      color: "#1d4ed8",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "13px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {item.badge}
                  </div>

                  <div style={{ minWidth: 0, display: "grid", gap: "4px" }}>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", lineHeight: "1.4" }}>{item.title}</div>
                    <div style={{ color: "#64748b", lineHeight: "1.65", fontSize: "14px" }}>{item.detail}</div>
                    <div style={{ color: "#2563eb", fontWeight: 700, fontSize: "13px" }}>{item.meta}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => item.route && onNavigate?.(item.route)}
                    style={{ ...fasciaButtonStyle(false), width: isMobile ? "100%" : "auto" }}
                  >
                    {item.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div
            style={dashboardSurfaceCardStyle({
              padding: isMobile ? "22px 20px" : "24px 24px 26px",
              display: "grid",
              gap: "18px",
              height: "100%",
            })}
          >
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Recently Improved</div>
              <div style={{ color: "#334155", lineHeight: "1.75" }}>
                Reviewed work is remembered here, so progress keeps showing up in household readiness.
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {recentlyImprovedRows.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr) auto",
                    gap: "12px",
                    alignItems: "center",
                    padding: "14px 16px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, rgba(240, 253, 244, 0.95) 0%, rgba(255, 255, 255, 1) 100%)",
                    border: "1px solid rgba(134, 239, 172, 0.42)",
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "999px",
                      background: "#22c55e",
                      color: "#ffffff",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                    }}
                  >
                    +
                  </div>
                  <div style={{ minWidth: 0, display: "grid", gap: "4px" }}>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                    <div style={{ color: "#475569", lineHeight: "1.6", fontSize: "14px" }}>{item.detail}</div>
                  </div>
                  <div style={{ color: "#16a34a", fontWeight: 800, fontSize: "14px" }}>{item.delta}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                paddingTop: "6px",
                borderTop: "1px solid rgba(226, 232, 240, 0.9)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ color: "#475569", fontWeight: 700 }}>Total Score Increase</div>
              <div style={{ color: "#16a34a", fontWeight: 800 }}>
                {readinessLift > 0 ? `+${readinessLift} points` : "Building from new work"}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 0.95fr) minmax(0, 1.05fr)",
            gap: "24px",
            alignItems: "stretch",
          }}
        >
          <div
            style={dashboardSurfaceCardStyle({
              padding: isMobile ? "22px 20px" : "24px 24px 26px",
              display: "grid",
              gap: "18px",
              height: "100%",
            })}
          >
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Upcoming Reviews</div>
              <div style={{ color: "#334155", lineHeight: "1.75" }}>
                A short reminder list for the next household reviews worth opening.
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px" }}>
              {upcomingReviewRows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => item.route && onNavigate?.(item.route)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "12px",
                    alignItems: "center",
                    padding: "14px 16px",
                    borderRadius: "18px",
                    background: "#f8fafc",
                    border: "1px solid rgba(226, 232, 240, 0.92)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ minWidth: 0, display: "grid", gap: "4px" }}>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                    <div style={{ color: "#64748b", fontSize: "14px" }}>{item.dueLabel}</div>
                  </div>
                  <div style={{ color: "#2563eb", fontWeight: 800, fontSize: "13px" }}>Open</div>
                </button>
              ))}
            </div>
          </div>

          <div
            style={dashboardSurfaceCardStyle({
              padding: isMobile ? "22px 20px" : "24px 24px 26px",
              display: "grid",
              gap: "18px",
              background: "linear-gradient(135deg, #eef4ff 0%, #ffffff 55%, #f8fbff 100%)",
              height: "100%",
            })}
          >
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Need Help Understanding Something?</div>
              <div style={{ color: "#475569", lineHeight: "1.75", maxWidth: "520px" }}>
                Ask our AI assistant to explain your policies, scores, or next best steps in plain English.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
                gap: "16px",
                alignItems: "center",
              }}
            >
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ color: "#64748b", lineHeight: "1.7" }}>
                  Use this when you want the calm explanation first, then the evidence and technical reasoning behind it.
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => scrollToDashboardSection("household-assistant")} style={fasciaButtonStyle(true)}>
                    Ask Assistant
                  </button>
                  <button type="button" onClick={() => onNavigate?.("/reports")} style={fasciaButtonStyle(false)}>
                    Open Reports
                  </button>
                </div>
              </div>

              <div
                aria-hidden="true"
                style={{
                  width: isMobile ? "100%" : "170px",
                  minHeight: "144px",
                  borderRadius: "26px",
                  background: "linear-gradient(180deg, #ffffff 0%, #eaf2ff 100%)",
                  border: "1px solid rgba(191, 219, 254, 0.9)",
                  display: "grid",
                  placeItems: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: "92px",
                    height: "112px",
                    borderRadius: "22px",
                    background: "#ffffff",
                    border: "1px solid rgba(226, 232, 240, 0.95)",
                    boxShadow: "0 18px 32px rgba(59, 130, 246, 0.14)",
                    position: "relative",
                    zIndex: 2,
                  }}
                >
                  <div style={{ position: "absolute", top: "18px", left: "18px", right: "18px", height: "8px", borderRadius: "999px", background: "#dbeafe" }} />
                  <div style={{ position: "absolute", top: "34px", left: "18px", right: "24px", height: "8px", borderRadius: "999px", background: "#e2e8f0" }} />
                  <div style={{ position: "absolute", top: "50px", left: "18px", right: "30px", height: "8px", borderRadius: "999px", background: "#e2e8f0" }} />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "18px",
                      right: "14px",
                      width: "38px",
                      height: "44px",
                      borderRadius: "18px 18px 14px 14px",
                      background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
                      boxShadow: "0 10px 18px rgba(37, 99, 235, 0.28)",
                    }}
                  />
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: "24px",
                    right: "24px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    background: "rgba(96, 165, 250, 0.24)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "24px",
                    left: "24px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "999px",
                    background: "rgba(191, 219, 254, 0.7)",
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: "8px", maxWidth: "760px" }}>
            <div style={{ fontSize: "12px", color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
              Details
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Deeper household intelligence</div>
            <div style={{ color: "#64748b", lineHeight: "1.75" }}>
              The dashboard opens simple, but the sections below still carry the evidence-backed readiness map, workflow memory, assistant detail, and cross-module review logic.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setShowHouseholdReport((current) => !current)} style={fasciaButtonStyle(false)}>
              {showHouseholdReport ? "Hide Household Brief" : "Open Household Brief"}
            </button>
            <button type="button" onClick={handlePrintHouseholdReport} style={fasciaButtonStyle(false)}>
              Print Household Report
            </button>
          </div>
        </div>

        <section
          data-demo-id="dashboard-risk-map"
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.96)",
            display: "grid",
            gap: "20px",
          }}
        >
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
              AI Household Intro
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {aiHouseholdIntro.headline}
            </div>
            <div style={{ maxWidth: "980px", fontSize: "15px", lineHeight: "1.8", color: "#475569" }}>
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
                background: "#f8fafc",
                border: "1px solid rgba(226, 232, 240, 0.96)",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Strong Areas</div>
              <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#15803d" }}>{aiHouseholdIntro.strongCount}</div>
            </div>
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(226, 232, 240, 0.96)",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Watch Areas</div>
              <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#b45309" }}>{aiHouseholdIntro.moderateCount}</div>
            </div>
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(226, 232, 240, 0.96)",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Weak Areas</div>
              <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 800, color: "#b91c1c" }}>{aiHouseholdIntro.weakCount}</div>
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
                    background: "#f8fafc",
                    border: "1px solid rgba(226, 232, 240, 0.96)",
                    display: "grid",
                    gap: "10px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{card.label}</div>
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
                  <div style={{ color: "#475569", lineHeight: "1.7", fontSize: "14px" }}>{card.summary}</div>
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
              background: "#f8fafc",
              border: "1px solid rgba(226, 232, 240, 0.96)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>What To Do Next</div>
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
                    background: "rgba(226,232,240,0.5)",
                    border: "1px solid rgba(226, 232, 240, 0.96)",
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
                      color: "#1d4ed8",
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                    <div style={{ color: "#0f172a", fontSize: "14px", fontWeight: 700 }}>{item.label}</div>
                    <div style={{ color: "#475569", lineHeight: "1.7", fontSize: "14px" }}>{item.summary}</div>
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

        <section
          id="property-operating-graph"
          ref={(node) => setSectionRef("property-operating-graph", node)}
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.96)",
            display: "grid",
            gap: "18px",
          }}
        >
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>Property Stack Drill-In</div>
            <div style={{ color: "#94a3b8", lineHeight: "1.8", maxWidth: "900px" }}>
              The dashboard hero already carries the household property stack snapshot. Use the dedicated property and reporting surfaces when you want the full operating graph instead of seeing the same metrics twice here.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => onNavigate?.("/property")} style={buttonStyle(true)}>
              Open Property Hub
            </button>
            <button type="button" onClick={() => onNavigate?.("/reports")} style={buttonStyle(false)}>
              Open Household Report
            </button>
          </div>
        </section>

        {showHouseholdReport ? (
          <HouseholdReportView report={householdReviewReport} onPrint={handlePrintHouseholdReport} isCompact={isTablet} />
        ) : null}

        <section
          data-demo-id="dashboard-household-assistant"
          id="household-assistant"
          ref={(node) => setSectionRef("household-assistant", node)}
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.96)",
            display: "grid",
            gap: "18px",
          }}
        >
          <div>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>Household Guide</div>
            <div style={{ marginTop: "10px", maxWidth: "760px", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>
              Ask for a plain-English read on what matters first, what changed, where support is thin, or which household area is in the best shape right now.
            </div>
          </div>

          <div
            style={{
              padding: "16px 18px",
              borderRadius: "18px",
              background: "#f8fafc",
              border: "1px solid rgba(226, 232, 240, 0.96)",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
              Quick Household Read
            </div>
            <div style={{ color: "#0f172a", lineHeight: "1.7" }}>{householdPriorityEngine.headline}</div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>{householdPriorityEngine.summary}</div>
            <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>
              Household score: {householdScorecard.overallScore ?? "--"} ({householdScorecard.overallStatus}). Area needing the most support:{" "}
              {householdScorecard.weakestDimension?.label || "—"}.
            </div>
          </div>

          <HouseholdAIChat
            householdId={householdState.context.householdId || "dashboard-household"}
            householdMap={assistantHouseholdMap}
            intelligence={intelligence}
            reviewDigest={assistantReviewDigest}
            queueItems={assistantQueueItems}
            bundle={intelligenceBundle || {}}
            scorecard={householdScorecard}
            priorityEngine={householdPriorityEngine}
            onNavigate={onNavigate}
            sectionLabels={householdAssistantSectionLabels}
            onJumpToSection={scrollToDashboardSection}
          />
        </section>

        <section
          id="household-review-digest"
          ref={(node) => setSectionRef("household-review-digest", node)}
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.96)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>Recent Progress</div>
              <div style={{ marginTop: "10px", maxWidth: "760px", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>
                {assistantReviewDigest.summary}
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
              { label: "Reopened", value: assistantReviewDigest.reopened_count },
              { label: "Improved", value: assistantReviewDigest.improved_count },
              { label: "Active", value: assistantReviewDigest.active_count },
              { label: "Resolved", value: workflowResolutionMemory.resolvedIssueCount },
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
                  background: "#f8fafc",
                  border: "1px solid rgba(226, 232, 240, 0.96)",
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

          <ul style={{ margin: "18px 0 0 18px", padding: 0, display: "grid", gap: "10px", color: "#334155" }}>
            {(assistantReviewDigest.bullets.length > 0
              ? assistantReviewDigest.bullets
              : ["Save a review snapshot to start tracking what changed across the household queue."]).map((item) => (
              <li key={item} style={{ lineHeight: "1.7" }}>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section
          id="household-risk-map"
          ref={(node) => setSectionRef("household-risk-map", node)}
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.96)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>Household Readiness Map</div>
              <div style={{ marginTop: "10px", maxWidth: "760px", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>
                {assistantHouseholdMap.bottom_line}
              </div>
            </div>
            <div
              style={{
                minWidth: "180px",
                padding: "16px 18px",
                borderRadius: "18px",
                background: "#eff6ff",
                border: "1px solid rgba(226, 232, 240, 0.96)",
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                Household Readiness
              </div>
              <div style={{ marginTop: "6px", fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em" }}>
                {displayValue(assistantHouseholdMap.overall_score)}
              </div>
              <div style={{ marginTop: "6px", fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                {assistantHouseholdMap.overall_status}
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
            {assistantHouseholdMap.focus_areas.map((area) => {
              const tone = getStatusColors(area.status);
              return (
                <div
                  key={area.key}
                  style={{
                    padding: "20px",
                    borderRadius: "20px",
                    background: "#f8fafc",
                    border: "1px solid rgba(226, 232, 240, 0.96)",
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
                background: "#f8fafc",
                border: "1px solid rgba(226, 232, 240, 0.96)",
              }}
            >
              <div style={{ display: "grid", gap: "12px", marginBottom: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700 }}>What To Look At First</div>
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
                          color: "#475569",
                          background: "rgba(226,232,240,0.5)",
                          border: "1px solid rgba(226, 232, 240, 0.96)",
                        }}
                      >
                        {metric.label}: {metric.value}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ color: "#334155", lineHeight: "1.7" }}>{commandCenter.headline}</div>
                <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>{commandCenter.summary}</div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {commandCenter.blockers.map((item) => (
                    <div
                      key={`command-center-${item.id}`}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "16px",
                        background: "#ffffff",
                        border: "1px solid rgba(226, 232, 240, 0.96)",
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
                              color: "#475569",
                              background: "rgba(148,163,184,0.12)",
                            }}
                          >
                            {item.staleLabel}
                          </span>
                        </div>
                      </div>
                      <div style={{ color: "#334155", lineHeight: "1.7" }}>{item.blocker}</div>
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
                  borderTop: "1px solid rgba(226, 232, 240, 0.96)",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700 }}>Home And Financing Snapshot</div>
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
                          color: "#475569",
                          background: "rgba(226,232,240,0.5)",
                          border: "1px solid rgba(226, 232, 240, 0.96)",
                        }}
                      >
                        {metric.label}: {metric.value}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ color: "#334155", lineHeight: "1.7" }}>{housingCommandCenter.headline}</div>
                <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>{housingCommandCenter.summary}</div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {housingCommandCenter.blockers.length > 0 ? (
                    housingCommandCenter.blockers.map((item) => (
                      <div
                        key={`housing-center-${item.id}`}
                        style={{
                          padding: "14px 16px",
                          borderRadius: "16px",
                          background: "#ffffff",
                          border: "1px solid rgba(226, 232, 240, 0.96)",
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
                                color: "#475569",
                                background: "rgba(148,163,184,0.12)",
                              }}
                            >
                              {item.staleLabel}
                            </span>
                          </div>
                        </div>
                        <div style={{ color: "#334155", lineHeight: "1.7" }}>{item.blocker}</div>
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
                  borderTop: "1px solid rgba(226, 232, 240, 0.96)",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700 }}>Emergency Cash And Access</div>
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
                          color: "#475569",
                          background: "rgba(226,232,240,0.5)",
                          border: "1px solid rgba(226, 232, 240, 0.96)",
                        }}
                      >
                        {metric.label}: {metric.value}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ color: "#334155", lineHeight: "1.7" }}>{emergencyAccessCommand.headline}</div>
                <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>{emergencyAccessCommand.summary}</div>
                <div style={{ display: "grid", gap: "10px" }}>
                  {emergencyAccessCommand.blockers.length > 0 ? (
                    emergencyAccessCommand.blockers.map((item) => (
                      <div
                        key={`emergency-center-${item.id}`}
                        style={{
                          padding: "14px 16px",
                          borderRadius: "16px",
                          background: "#ffffff",
                          border: "1px solid rgba(226, 232, 240, 0.96)",
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
                                color: "#475569",
                                background: "rgba(148,163,184,0.12)",
                              }}
                            >
                              {item.staleLabel}
                            </span>
                          </div>
                        </div>
                        <div style={{ color: "#334155", lineHeight: "1.7" }}>{item.blocker}</div>
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
              <div style={{ paddingTop: "18px", borderTop: "1px solid rgba(226, 232, 240, 0.96)", display: "grid", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700 }}>Review Progress And Next Steps</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {[
                      { label: "Active", value: assistantQueueItems.length },
                      { label: "Changed", value: changedSinceReviewItems.length },
                      { label: "Pending Docs", value: pendingDocumentsCount },
                      { label: "Follow Up", value: followUpCount },
                      { label: "Reviewed", value: resolvedQueueItems.length },
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
                          color: "#475569",
                          background: "rgba(226,232,240,0.5)",
                          border: "1px solid rgba(226, 232, 240, 0.96)",
                        }}
                      >
                        {metric.label}: {metric.value}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ color: "#94a3b8", lineHeight: "1.7" }}>
                  This is the handoff into the active review layer. It shows what is still open, what recently changed, and where completed work is already improving household readiness.
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => onNavigate?.("/review-workspace")} style={buttonStyle(true)}>
                    Open Review Workspace
                  </button>
                  {(assistantQueueItems[0] || queueItems[0])?.route ? (
                    <button
                      type="button"
                      onClick={() => onNavigate?.((assistantQueueItems[0] || queueItems[0]).route)}
                      style={buttonStyle(false)}
                    >
                      Open Top Review Item
                    </button>
                  ) : null}
                </div>
              </div>
              {resolvedQueueItems.length > 0 ? (
                <div style={{ marginTop: "18px", paddingTop: "18px", borderTop: "1px solid rgba(226, 232, 240, 0.96)" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Recently Reviewed</div>
                  <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                    {resolvedQueueItems.slice(0, 3).map((item) => (
                      <div
                        key={`reviewed-${item.id}`}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "14px",
                          background: "#f8fafc",
                          border: "1px solid rgba(226, 232, 240, 0.96)",
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
                  background: "#f8fafc",
                  border: "1px solid rgba(226, 232, 240, 0.96)",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 700 }}>What Looks Strong</div>
                <ul style={{ margin: "14px 0 0 18px", padding: 0, display: "grid", gap: "10px", color: "#334155" }}>
                  {(assistantHouseholdMap.strength_signals.length > 0
                    ? assistantHouseholdMap.strength_signals
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
                  background: "#f8fafc",
                  border: "1px solid rgba(226, 232, 240, 0.96)",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 700 }}>What Still Needs More Visibility</div>
                <ul style={{ margin: "14px 0 0 18px", padding: 0, display: "grid", gap: "10px", color: "#334155" }}>
                  {(assistantHouseholdMap.visibility_gaps.length > 0
                    ? assistantHouseholdMap.visibility_gaps
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
          id="action-required"
          ref={(node) => setSectionRef("action-required", node)}
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.96)",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 700 }}>What Needs Attention Now</div>
          <div style={{ marginTop: "10px", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8" }}>
            {householdState.error || loadError
              ? "Platform visibility is limited until household data loads cleanly."
              : topActions.length > 0
                ? "A small number of concrete items are still worth looking at next, but the list should feel manageable."
                : "No major action items are currently active."}
          </div>
          <ul style={{ margin: "18px 0 0 18px", padding: 0, display: "grid", gap: "10px", color: "#334155" }}>
            {(topActions.length > 0 ? topActions : ["No major action items are currently active."]).map((item) => (
              <li key={typeof item === "string" ? item : item.id || item.label || item.summary} style={{ lineHeight: "1.7" }}>
                {typeof item === "string" ? item : item.summary || item.label}
              </li>
            ))}
          </ul>
        </section>

        <section
          id="insurance-intelligence"
          ref={(node) => setSectionRef("insurance-intelligence", node)}
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.96)",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 700 }}>Insurance Review</div>
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
          id="module-overview"
          ref={(node) => setSectionRef("module-overview", node)}
          style={{
            padding: sectionPadding,
            borderRadius: sectionRadius,
            background: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.96)",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 700 }}>Platform Overview</div>
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
                      background: "#f8fafc",
                      border: "1px solid rgba(226, 232, 240, 0.96)",
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
                      <span style={{ color: "#475569", fontWeight: 600 }}>What to watch:</span> {row.watchpoint}
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
                    <th style={{ padding: "0 0 14px 0", fontWeight: 600 }}>What to watch</th>
                  </tr>
                </thead>
                <tbody>
                  {moduleRows.map((row) => {
                    const tone = getStatusColors(row.status);
                    return (
                      <tr key={row.module} style={{ borderTop: "1px solid rgba(226, 232, 240, 0.96)" }}>
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

        {shouldShowDevDiagnostics() ? (
          <div style={{ color: "#64748b", fontSize: "12px" }}>
            household={householdState.context.householdId || "none"} | assets={counts?.assetCount ?? 0} | policies={savedPolicyCount} | weakCoi={weakPolicyRows.length} | missingStatements={missingStatementCount} | dependencyFlags={householdMap.dependency_signals?.dependency_flags?.length || 0} | dependencyPriority={householdMap.dependency_signals?.priority_issues?.length || 0} | totalCharges={totalVisibleCharges > 0 ? formatCurrency(totalVisibleCharges) : "--"} | error={loadError || policyCompareError || "none"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
