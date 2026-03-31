import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { loadRetirementGoalSnapshot } from "../lib/domain/retirement/retirementGoalStorage";
import { scoreRetirementGoal } from "../lib/domain/retirement/retirementGoalScore";
import { loadCollegeGoalState } from "../lib/domain/college/collegeGoalStorage";
import { scoreCollegeGoal } from "../lib/domain/college/collegeGoalScore";
import { summarizeCollegeHousehold } from "../lib/domain/college/collegeIntelligence";
import { summarizeMortgageHousehold } from "../lib/domain/mortgage";
import { evaluateInsuranceGaps } from "../lib/domain/insurance/insuranceGapEngine";
import { getPropertyBundle, listProperties } from "../lib/supabase/propertyData";
import { listMortgageLoans } from "../lib/supabase/mortgageData";
import { getHouseholdInsuranceSummary, listVaultedPolicies } from "../lib/supabase/vaultedPolicies";
import { listHomeownersPolicies } from "../lib/supabase/homeownersData";
import { listAutoPolicies } from "../lib/supabase/autoData";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Not recorded";
  return `$${Math.round(Number(value)).toLocaleString("en-US")}`;
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Not scored";
  return `${Math.round(Number(value))}/100`;
}

function getReadinessTone(status) {
  if (status === "On Track") return { background: "#dcfce7", color: "#166534" };
  if (status === "Moderately Behind" || status === "Slightly Behind") return { background: "#fef3c7", color: "#92400e" };
  if (status === "Behind") return { background: "#ffedd5", color: "#c2410c" };
  return { background: "#fee2e2", color: "#991b1b" };
}

function getEquityTone(status) {
  if (status === "clear") return { background: "#dcfce7", color: "#166534" };
  if (status === "mixed") return { background: "#fef3c7", color: "#92400e" };
  return { background: "#e2e8f0", color: "#334155" };
}

function getSeverityTone(severity) {
  if (severity === "high") return { background: "#fee2e2", color: "#991b1b" };
  if (severity === "medium") return { background: "#ffedd5", color: "#c2410c" };
  return { background: "#e2e8f0", color: "#334155" };
}

function getInsuranceStatusTone(status) {
  if (status === "covered") return { background: "#dcfce7", color: "#166534" };
  if (status === "partial") return { background: "#fef3c7", color: "#92400e" };
  if (status === "missing" || status === "gap") return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#e2e8f0", color: "#334155" };
}

function getMortgageStatusTone(status) {
  if (status === "Better Supported") return { background: "#dcfce7", color: "#166534" };
  if (status === "Review Soon") return { background: "#fef3c7", color: "#92400e" };
  return { background: "#fee2e2", color: "#991b1b" };
}

function formatInsuranceStatus(status) {
  if (status === "gap") return "Gap";
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getPropertyStatus(propertyBundle = {}) {
  const equity = propertyBundle.propertyEquityPosition || null;
  const visibility = equity?.equity_visibility_status || "limited";
  if (visibility === "clear" || visibility === "visible" || visibility === "strong") return "clear";
  if (visibility === "moderate" || visibility === "partial") return "mixed";
  return "limited";
}

function buildHouseholdPriorityItems({ retirementReadiness, collegePlans, propertyBundles, insuranceGaps, mortgageSummary }) {
  const items = [];
  const severityWeight = { high: 0, medium: 1, low: 2 };

  if (retirementReadiness && retirementReadiness.readinessStatus !== "On Track") {
    items.push({
      id: "retirement-readiness",
      title: "Retirement readiness needs attention",
      detail: `${retirementReadiness.readinessStatus} at ${retirementReadiness.readinessScore}/100.`,
      actionPath: "/retirement/upload",
      severity: retirementReadiness.readinessStatus === "Needs Attention" || retirementReadiness.readinessStatus === "Behind" ? "medium" : "low",
    });
  }

  collegePlans
    .filter((plan) => plan.readinessStatus !== "On Track")
    .slice(0, 2)
    .forEach((plan) => {
      items.push({
        id: `college-${plan.childLabel}`,
        title: `${plan.childLabel} college plan needs review`,
        detail: `${plan.readinessStatus} at ${plan.readinessScore}/100 with ${formatCurrency(Math.abs(plan.fundingDifference))} ${plan.fundingDifference >= 0 ? "surplus" : "gap"}.`,
        actionPath: "/college-planning",
        severity: plan.readinessStatus === "Needs Attention" || plan.readinessStatus === "Behind" ? "medium" : "low",
      });
    });

  propertyBundles
    .filter((bundle) => getPropertyStatus(bundle) !== "clear")
    .slice(0, 2)
    .forEach((bundle) => {
      items.push({
        id: `property-${bundle.property?.id || bundle.property?.property_name || "property"}`,
        title: `${bundle.property?.property_name || bundle.property?.property_address || "Property"} has limited equity visibility`,
        detail: `Equity visibility is ${bundle.propertyEquityPosition?.equity_visibility_status || "limited"} and may still need clearer financing or valuation support.`,
        actionPath: bundle.property?.id ? `/property/detail/${bundle.property.id}` : "/property",
        severity: "low",
      });
    });

  if ((mortgageSummary?.needsReviewCount || 0) > 0) {
    items.push({
      id: "mortgage-readiness",
      title: "Mortgage records need stronger review support",
      detail: `${mortgageSummary.needsReviewCount} loan${mortgageSummary.needsReviewCount === 1 ? "" : "s"} still need stronger statement, payment, or property-link visibility.`,
      actionPath: "/mortgage",
      severity: "medium",
    });
  } else if ((mortgageSummary?.reviewSoonCount || 0) > 0) {
    items.push({
      id: "mortgage-review-soon",
      title: "Mortgage review should stay on the radar",
      detail: `${mortgageSummary.reviewSoonCount} loan${mortgageSummary.reviewSoonCount === 1 ? "" : "s"} merit refinance, payoff, or maturity review soon.`,
      actionPath: "/mortgage",
      severity: "low",
    });
  }

  const insuranceItems = [
    {
      id: "insurance-life",
      title: "Life coverage needs review",
      detail: insuranceGaps?.life?.message,
      actionPath: "/insurance/life/upload",
      severity: insuranceGaps?.life?.severity || "low",
      include: insuranceGaps?.life?.status && insuranceGaps.life.status !== "covered",
    },
    {
      id: "insurance-homeowners",
      title: "Homeowners protection needs review",
      detail: insuranceGaps?.homeowners?.message,
      actionPath: "/insurance/homeowners",
      severity: insuranceGaps?.homeowners?.severity || "low",
      include: insuranceGaps?.homeowners?.status && insuranceGaps.homeowners.status !== "covered" && insuranceGaps.homeowners.status !== "unknown",
    },
    {
      id: "insurance-umbrella",
      title: "Umbrella coverage may be missing",
      detail: insuranceGaps?.umbrella?.message,
      actionPath: "/insurance",
      severity: insuranceGaps?.umbrella?.severity || "low",
      include: insuranceGaps?.umbrella?.status === "gap",
    },
    {
      id: "insurance-auto",
      title: "Auto coverage visibility is limited",
      detail: insuranceGaps?.auto?.message,
      actionPath: "/insurance/auto",
      severity: insuranceGaps?.auto?.severity || "low",
      include: insuranceGaps?.auto?.status === "missing",
    },
  ]
    .filter((item) => item.include)
    .map(({ include, ...item }) => item);

  return [...insuranceItems, ...items]
    .sort((left, right) => (severityWeight[left.severity] ?? 3) - (severityWeight[right.severity] ?? 3))
    .slice(0, 5);
}

export default function HouseholdGoalsDashboardPage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const { householdState, debug } = usePlatformShellData();
  const [propertyBundles, setPropertyBundles] = useState([]);
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [propertyError, setPropertyError] = useState("");
  const [mortgageLoans, setMortgageLoans] = useState([]);
  const [mortgageLoading, setMortgageLoading] = useState(true);
  const [mortgageError, setMortgageError] = useState("");
  const [insuranceLoading, setInsuranceLoading] = useState(true);
  const [insuranceError, setInsuranceError] = useState("");
  const [lifePolicies, setLifePolicies] = useState([]);
  const [homeownersPolicies, setHomeownersPolicies] = useState([]);
  const [autoPolicies, setAutoPolicies] = useState([]);
  const [insuranceSummary, setInsuranceSummary] = useState(null);

  const storageScope = useMemo(
    () => ({
      userId: debug.authUserId || null,
      householdId: debug.householdId || null,
    }),
    [debug.authUserId, debug.householdId]
  );

  const retirementSnapshot = useMemo(
    () => loadRetirementGoalSnapshot(storageScope),
    [storageScope]
  );

  const retirementReadiness = useMemo(() => {
    if (!retirementSnapshot) return null;
    if (retirementSnapshot.readiness) return retirementSnapshot.readiness;
    if (!retirementSnapshot.goalForm) return null;
    return scoreRetirementGoal({
      ...retirementSnapshot.goalForm,
      currentAssets: retirementSnapshot?.plannerSnapshot?.currentAssets || 0,
      annualContribution: retirementSnapshot?.plannerSnapshot?.annualContribution || 0,
    });
  }, [retirementSnapshot]);

  const collegeState = useMemo(() => loadCollegeGoalState(storageScope), [storageScope]);
  const collegePlans = useMemo(() => {
    const plans = collegeState?.plans || {};
    return Object.values(plans)
      .map((plan) =>
        scoreCollegeGoal({
          childLabel: plan.childLabel,
          currentAge: Number(plan.currentAge),
          collegeStartAge: Number(plan.collegeStartAge),
          targetSavings: Number(plan.targetSavings),
          currentSavings: Number(plan.currentSavings || 0),
          monthlyContribution: Number(plan.monthlyContribution || 0),
          annualGrowthRate: Number(plan.annualGrowthRate || 5),
        })
      )
      .sort((left, right) => right.readinessScore - left.readinessScore);
  }, [collegeState]);

  const collegeHouseholdRead = useMemo(
    () => summarizeCollegeHousehold(collegePlans),
    [collegePlans]
  );

  const mortgageSummary = useMemo(
    () => summarizeMortgageHousehold(mortgageLoans),
    [mortgageLoans]
  );

  useEffect(() => {
    if (householdState.loading) return;

    const householdId = householdState.context.householdId || null;
    const authUserId = debug.authUserId || null;
    if (!householdId || !authUserId) {
      setLifePolicies([]);
      setHomeownersPolicies([]);
      setAutoPolicies([]);
      setInsuranceSummary(null);
      setInsuranceError("");
      setInsuranceLoading(false);
      return;
    }

    let active = true;

    async function loadInsuranceSignals() {
      setInsuranceLoading(true);
      const scopeOverride = {
        authUserId,
        ownershipMode: householdState.context.ownershipMode || "authenticated_owned",
        householdId,
        userId: authUserId,
        source: "household_goals_dashboard",
      };

      const [lifeResult, homeownersResult, autoResult, summaryResult] = await Promise.all([
        listVaultedPolicies(scopeOverride),
        listHomeownersPolicies(householdId),
        listAutoPolicies(householdId),
        getHouseholdInsuranceSummary(authUserId, householdId),
      ]);

      if (!active) return;

      setLifePolicies(lifeResult.data || []);
      setHomeownersPolicies(homeownersResult.data || []);
      setAutoPolicies(autoResult.data || []);
      setInsuranceSummary(summaryResult.data || null);
      setInsuranceError(
        lifeResult.error?.message ||
          summaryResult.error?.message ||
          homeownersResult.error?.message ||
          autoResult.error?.message ||
          ""
      );
      setInsuranceLoading(false);
    }

    loadInsuranceSignals();
    return () => {
      active = false;
    };
  }, [
    debug.authUserId,
    householdState.context.householdId,
    householdState.context.ownershipMode,
    householdState.loading,
  ]);

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      setMortgageLoans([]);
      setMortgageError("");
      setMortgageLoading(false);
      return;
    }

    let active = true;

    async function loadMortgageSignals() {
      setMortgageLoading(true);
      const result = await listMortgageLoans(householdState.context.householdId);
      if (!active) return;
      setMortgageLoans(result.data || []);
      setMortgageError(result.error?.message || "");
      setMortgageLoading(false);
    }

    loadMortgageSignals();
    return () => {
      active = false;
    };
  }, [householdState.context.householdId, householdState.loading]);

  useEffect(() => {
    if (householdState.loading) return;
    if (!householdState.context.householdId) {
      setPropertyBundles([]);
      setPropertyLoading(false);
      return;
    }

    let active = true;

    async function loadPropertySnapshots() {
      setPropertyLoading(true);
      const propertiesResult = await listProperties(householdState.context.householdId);
      if (!active) return;
      if (propertiesResult.error) {
        setPropertyError(propertiesResult.error.message || "Property records could not be loaded.");
        setPropertyBundles([]);
        setPropertyLoading(false);
        return;
      }

      const rows = propertiesResult.data || [];
      const bundleResults = await Promise.all(
        rows.slice(0, 6).map((property) => getPropertyBundle(property.id, {
          householdId: householdState.context.householdId,
          authUserId: debug.authUserId || null,
          ownershipMode: householdState.context.ownershipMode || "authenticated_owned",
        }))
      );
      if (!active) return;

      const bundles = bundleResults
        .map((result) => result.data)
        .filter(Boolean);

      setPropertyBundles(bundles);
      setPropertyError(bundleResults.find((result) => result.error)?.error?.message || "");
      setPropertyLoading(false);
    }

    loadPropertySnapshots();
    return () => {
      active = false;
    };
  }, [
    debug.authUserId,
    householdState.context.householdId,
    householdState.context.ownershipMode,
    householdState.loading,
  ]);

  const activeCollegePlan = useMemo(() => {
    if (!collegePlans.length) return null;
    const preferredKey = collegeState?.activePlanKey || null;
    return collegePlans.find((plan) => plan.childLabel === preferredKey) || collegePlans[0];
  }, [collegePlans, collegeState?.activePlanKey]);

  const propertySummary = useMemo(() => {
    const visibleEquity = propertyBundles.filter((bundle) => {
      const status = bundle.propertyEquityPosition?.equity_visibility_status || "";
      return ["clear", "visible", "strong", "moderate", "partial"].includes(status);
    });
    const totalEquity = visibleEquity.reduce(
      (sum, bundle) => sum + Number(bundle.propertyEquityPosition?.estimated_equity_midpoint || 0),
      0
    );
    return {
      propertyCount: propertyBundles.length,
      visibleEquityCount: visibleEquity.length,
      totalEquityMidpoint: visibleEquity.length ? totalEquity : null,
    };
  }, [propertyBundles]);

  const insuranceGaps = useMemo(
    () =>
      evaluateInsuranceGaps({
        propertyBundles,
        lifePolicies,
        homeownersPolicies,
        autoPolicies,
        collegePlans,
      }),
    [autoPolicies, collegePlans, homeownersPolicies, lifePolicies, propertyBundles]
  );

  const priorityItems = useMemo(
    () =>
      buildHouseholdPriorityItems({
        retirementReadiness,
        collegePlans,
        propertyBundles,
        insuranceGaps,
        mortgageSummary,
      }),
    [collegePlans, insuranceGaps, mortgageSummary, propertyBundles, retirementReadiness]
  );

  const summaryItems = useMemo(
    () => [
      {
        label: "Retirement",
        value: retirementReadiness ? formatScore(retirementReadiness.readinessScore) : "No goal yet",
        helper: retirementReadiness?.readinessStatus || "Set a retirement goal",
      },
      {
        label: "College Plans",
        value: collegePlans.length,
        helper: collegeHouseholdRead.headline || (activeCollegePlan ? `${activeCollegePlan.childLabel} is active` : "No child plans yet"),
      },
      {
        label: "Property Equity",
        value: propertySummary.totalEquityMidpoint !== null ? formatCurrency(propertySummary.totalEquityMidpoint) : "Limited",
        helper: `${propertySummary.visibleEquityCount}/${propertySummary.propertyCount} properties with visible equity`,
      },
      {
        label: "Mortgage",
        value: mortgageSummary.totalLoans ? formatScore((mortgageSummary.averageConfidence || 0) * 100) : "No loans yet",
        helper: mortgageSummary.headline,
      },
      {
        label: "Protection",
        value: insuranceSummary ? formatScore((insuranceSummary.confidence || 0) * 100) : insuranceGaps.summary.protectionFlags.length,
        helper: insuranceSummary?.headline ||
          (insuranceGaps.summary.protectionFlags.length
            ? `${insuranceGaps.summary.protectionFlags.length} coverage areas need review`
            : "No obvious protection gaps detected"),
      },
      {
        label: "Priority Queue",
        value: priorityItems.length,
        helper: priorityItems.length ? "Household goals to review" : "No urgent planning flags yet",
      },
    ],
    [activeCollegePlan, collegePlans.length, insuranceGaps.summary.protectionFlags.length, insuranceSummary, mortgageSummary, priorityItems.length, propertySummary, retirementReadiness]
  );

  const householdNarrative = useMemo(() => {
    const lines = [];

    if (retirementReadiness) {
      lines.push(`Retirement is currently ${retirementReadiness.readinessStatus.toLowerCase()} at ${retirementReadiness.readinessScore}/100.`);
    } else {
      lines.push("Retirement planning has not been saved yet.");
    }

    if (activeCollegePlan) {
      lines.push(`${activeCollegePlan.childLabel} college planning is ${activeCollegePlan.readinessStatus.toLowerCase()} at ${activeCollegePlan.readinessScore}/100.`);
    } else {
      lines.push("No college savings plan has been saved yet.");
    }

    if (propertySummary.propertyCount > 0) {
      lines.push(
        propertySummary.visibleEquityCount > 0
          ? `${propertySummary.visibleEquityCount} of ${propertySummary.propertyCount} properties currently show usable equity visibility.`
          : "Property equity visibility is still limited across the household."
      );
    } else {
      lines.push("No property records are currently linked into the household goals view.");
    }

    if (mortgageSummary.totalLoans > 0) {
      lines.push(mortgageSummary.headline);
    } else {
      lines.push("No household mortgage loans are currently visible in the dashboard.");
    }

    if (insuranceSummary?.headline) {
      lines.push(insuranceSummary.headline);
    } else if (insuranceGaps.summary.protectionFlags.length === 0) {
      lines.push("No obvious insurance protection gaps were detected from the policies currently visible here.");
    } else {
      const protectionMessages = [];
      if (insuranceGaps.life.status !== "covered") protectionMessages.push("life coverage needs review");
      if (insuranceGaps.homeowners.status === "missing" || insuranceGaps.homeowners.status === "partial") protectionMessages.push("homeowners linkage is incomplete");
      if (insuranceGaps.umbrella.status === "gap") protectionMessages.push("umbrella coverage is not visible");
      if (protectionMessages.length > 0) {
        lines.push(`Protection gaps should be reviewed because ${protectionMessages.join(", ")}.`);
      }
    }
    return lines.join(" ");
  }, [activeCollegePlan, insuranceGaps, insuranceSummary, mortgageSummary, propertySummary, retirementReadiness]);

  const cardGrid = isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))";

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <PageHeader
        eyebrow="Household Goals"
        title="Household Goals Dashboard"
        description="One planning surface for retirement readiness, college savings, and property equity visibility across the household."
        actions={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onNavigate?.("/retirement/upload")}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Open Retirement Planner
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.("/college-planning")}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Open College Planner
            </button>
          </div>
        }
      />

      <SummaryPanel items={summaryItems} />

      <AIInsightPanel
        title="Household planning read"
        summary={householdNarrative}
        bullets={[
          retirementReadiness
            ? `Retirement projected balance: ${formatCurrency(retirementReadiness.projectedRetirementBalance)}.`
            : "Retirement goal has not been saved yet.",
          activeCollegePlan
            ? `${activeCollegePlan.childLabel} projected college savings: ${formatCurrency(activeCollegePlan.projectedSavings)}.`
            : "No active college plan is available yet.",
          collegePlans.length > 0
            ? `College planning status: ${collegeHouseholdRead.status}.`
            : "College planning has not been set up yet.",
          propertySummary.propertyCount > 0
            ? `Visible property equity midpoint: ${propertySummary.totalEquityMidpoint !== null ? formatCurrency(propertySummary.totalEquityMidpoint) : "Limited"}.`
            : "Property equity is not in view yet.",
          mortgageSummary.totalLoans > 0
            ? `Mortgage read: ${mortgageSummary.headline}`
            : "No household mortgage loans are visible yet.",
          insuranceGaps.summary.protectionFlags.length > 0
            ? `Protection review flags: ${insuranceGaps.summary.protectionFlags.join(", ")}.`
            : "No obvious insurance protection gaps were detected from the current household data.",
        ]}
      />

      <SectionCard title="Protection & Insurance" subtitle="A simple household protection health check based on visible policy and property data.">
        {insuranceLoading ? (
          <div style={{ color: "#64748b" }}>Loading insurance visibility...</div>
        ) : insuranceError ? (
          <EmptyState title="Insurance visibility is limited" description={insuranceError} />
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {insuranceSummary ? (
              <div
                style={{
                  padding: "16px 18px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                  border: "1px solid rgba(147, 197, 253, 0.28)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>Household Protection Read</div>
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: "999px",
                      background: getSeverityTone(insuranceSummary.status === "Needs Review" ? "high" : insuranceSummary.status === "Monitor" ? "medium" : "low").background,
                      color: getSeverityTone(insuranceSummary.status === "Needs Review" ? "high" : insuranceSummary.status === "Monitor" ? "medium" : "low").color,
                      fontWeight: 800,
                      fontSize: "12px",
                    }}
                  >
                    {insuranceSummary.status || "Monitor"}
                  </div>
                </div>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>{insuranceSummary.headline}</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Policies</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>{insuranceSummary.totalPolicies || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Visible Coverage</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>{insuranceSummary.totalCoverage ? formatCurrency(insuranceSummary.totalCoverage) : "Not recorded"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Confidence</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>{formatScore((insuranceSummary.confidence || 0) * 100)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Gap Flags</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>{insuranceSummary.metrics?.gapPolicies || 0}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Owner Visible</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>
                      {insuranceSummary.metrics?.ownerVisiblePolicies || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Insured Visible</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>
                      {insuranceSummary.metrics?.insuredVisiblePolicies || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Named Beneficiaries</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>
                      {insuranceSummary.metrics?.beneficiaryNamedPolicies || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Beneficiary Limited</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>
                      {insuranceSummary.metrics?.beneficiaryLimitedPolicies || 0}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Trust-Owned</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>
                      {insuranceSummary.metrics?.trustOwnedPolicies || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Trustee Visible</div>
                    <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>
                      {insuranceSummary.metrics?.trusteeVisiblePolicies || 0}
                    </div>
                  </div>
                </div>
                {Array.isArray(insuranceSummary.notes) && insuranceSummary.notes.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                    {insuranceSummary.notes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
              {[
                { label: "Life", gap: insuranceGaps.life },
                { label: "Homeowners", gap: insuranceGaps.homeowners },
                { label: "Auto", gap: insuranceGaps.auto },
                { label: "Umbrella", gap: insuranceGaps.umbrella },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: "16px",
                    borderRadius: "14px",
                    background: "#f8fafc",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.label}</div>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: getInsuranceStatusTone(item.gap.status).background,
                        color: getInsuranceStatusTone(item.gap.status).color,
                        fontWeight: 800,
                        fontSize: "12px",
                      }}
                    >
                      {formatInsuranceStatus(item.gap.status)}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      width: "fit-content",
                      padding: "5px 9px",
                      borderRadius: "999px",
                      background: getSeverityTone(item.gap.severity).background,
                      color: getSeverityTone(item.gap.severity).color,
                      fontWeight: 700,
                      fontSize: "12px",
                    }}
                  >
                    {item.gap.severity === "high" ? "High priority" : item.gap.severity === "medium" ? "Review soon" : "Lower priority"}
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.gap.message}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ color: "#64748b", lineHeight: "1.7" }}>
                {insuranceSummary?.headline
                  ? `${insuranceGaps.note} This remains a high-level review based on the policies currently visible in VaultedShield.`
                  : insuranceGaps.note}
              </div>
              <button
                type="button"
                onClick={() => onNavigate?.("/insurance")}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Review Coverage
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: cardGrid, gap: "18px" }}>
        <SectionCard title="Retirement Readiness" subtitle="Saved retirement goal status for this household.">
          {retirementReadiness ? (
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    background: getReadinessTone(retirementReadiness.readinessStatus).background,
                    color: getReadinessTone(retirementReadiness.readinessStatus).color,
                    fontWeight: 800,
                    fontSize: "13px",
                  }}
                >
                  {retirementReadiness.readinessStatus}
                </div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>
                  {retirementReadiness.readinessScore}/100
                </div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Projected Balance:</strong> {formatCurrency(retirementReadiness.projectedRetirementBalance)}</div>
                <div><strong>Income Gap:</strong> {formatCurrency(retirementReadiness.estimatedIncomeGapMonthly)}/month</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{retirementReadiness.explanation}</div>
            </div>
          ) : (
            <EmptyState title="No retirement goal saved" description="Set a retirement goal to activate a household readiness view." />
          )}
        </SectionCard>

        <SectionCard title="College Planning" subtitle="Saved child plans and current education-funding readiness.">
          {activeCollegePlan ? (
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    background: getReadinessTone(activeCollegePlan.readinessStatus).background,
                    color: getReadinessTone(activeCollegePlan.readinessStatus).color,
                    fontWeight: 800,
                    fontSize: "13px",
                  }}
                >
                  {activeCollegePlan.readinessStatus}
                </div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>
                  {activeCollegePlan.readinessScore}/100
                </div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Active Child Plan:</strong> {activeCollegePlan.childLabel}</div>
                <div><strong>Projected Savings:</strong> {formatCurrency(activeCollegePlan.projectedSavings)}</div>
                <div><strong>{activeCollegePlan.fundingDifference >= 0 ? "Projected Surplus" : "Funding Gap"}:</strong> {formatCurrency(Math.abs(activeCollegePlan.fundingDifference))}</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{activeCollegePlan.explanation}</div>
              <div style={{ color: "#64748b", lineHeight: "1.7" }}>
                Household college read: {collegeHouseholdRead.headline}
              </div>
            </div>
          ) : (
            <EmptyState title="No college plans saved" description="Add a child plan to activate college readiness tracking for the household." />
          )}
        </SectionCard>

        <SectionCard title="Property Equity Snapshot" subtitle="Current equity visibility across linked household properties.">
          {propertyLoading ? (
            <div style={{ color: "#64748b" }}>Loading property equity snapshot...</div>
          ) : propertyError ? (
            <EmptyState title="Property snapshot unavailable" description={propertyError} />
          ) : propertyBundles.length === 0 ? (
            <EmptyState title="No properties linked yet" description="Add a property and run valuation/linkage review to bring equity visibility into household planning." />
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Tracked Properties:</strong> {propertySummary.propertyCount}</div>
                <div><strong>Properties With Visible Equity:</strong> {propertySummary.visibleEquityCount}</div>
                <div><strong>Visible Equity Midpoint:</strong> {propertySummary.totalEquityMidpoint !== null ? formatCurrency(propertySummary.totalEquityMidpoint) : "Limited"}</div>
              </div>
              {propertyBundles.slice(0, 3).map((bundle) => {
                const propertyStatus = getPropertyStatus(bundle);
                const property = bundle.property || {};
                const equity = bundle.propertyEquityPosition || {};
                return (
                  <div
                    key={property.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "14px",
                      background: "#f8fafc",
                      border: "1px solid rgba(148, 163, 184, 0.18)",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {property.property_name || property.property_address || "Property"}
                      </div>
                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: getEquityTone(propertyStatus).background,
                          color: getEquityTone(propertyStatus).color,
                          fontWeight: 700,
                          fontSize: "12px",
                        }}
                      >
                        {equity.equity_visibility_status || "limited"}
                      </div>
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.7" }}>
                      <div><strong>Equity Midpoint:</strong> {equity.estimated_equity_midpoint !== null && equity.estimated_equity_midpoint !== undefined ? formatCurrency(equity.estimated_equity_midpoint) : "Limited"}</div>
                      <div><strong>Estimated LTV:</strong> {equity.estimated_ltv !== null && equity.estimated_ltv !== undefined ? `${Math.round(Number(equity.estimated_ltv) * 100)}%` : "Limited"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Mortgage Readiness" subtitle="Debt review, payoff visibility, and refinance readiness across household mortgage loans.">
          {mortgageLoading ? (
            <div style={{ color: "#64748b" }}>Loading mortgage readiness...</div>
          ) : mortgageError ? (
            <EmptyState title="Mortgage readiness is limited" description={mortgageError} />
          ) : mortgageSummary.totalLoans === 0 ? (
            <EmptyState title="No mortgage loans linked yet" description="Add or link a mortgage to bring debt-readiness signals into the household dashboard." />
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    background: getMortgageStatusTone(
                      mortgageSummary.needsReviewCount > 0 ? "Needs Review" : mortgageSummary.reviewSoonCount > 0 ? "Review Soon" : "Better Supported"
                    ).background,
                    color: getMortgageStatusTone(
                      mortgageSummary.needsReviewCount > 0 ? "Needs Review" : mortgageSummary.reviewSoonCount > 0 ? "Review Soon" : "Better Supported"
                    ).color,
                    fontWeight: 800,
                    fontSize: "13px",
                  }}
                >
                  {mortgageSummary.needsReviewCount > 0 ? "Needs Review" : mortgageSummary.reviewSoonCount > 0 ? "Review Soon" : "Better Supported"}
                </div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>
                  {formatScore((mortgageSummary.averageConfidence || 0) * 100)}
                </div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Loans in View:</strong> {mortgageSummary.totalLoans}</div>
                <div><strong>Needs Review:</strong> {mortgageSummary.needsReviewCount}</div>
                <div><strong>Review Soon:</strong> {mortgageSummary.reviewSoonCount}</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{mortgageSummary.headline}</div>
              {Array.isArray(mortgageSummary.notes) && mortgageSummary.notes.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                  {mortgageSummary.notes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 0.8fr", gap: "18px" }}>
        <SectionCard title="Priority Queue" subtitle="The next household planning items that deserve attention first.">
          {priorityItems.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {priorityItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate?.(item.actionPath)}
                  style={{
                    textAlign: "left",
                    padding: "14px 16px",
                    borderRadius: "14px",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    background: "#f8fafc",
                    cursor: "pointer",
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                    <div
                      style={{
                        padding: "5px 9px",
                        borderRadius: "999px",
                        background: getSeverityTone(item.severity).background,
                        color: getSeverityTone(item.severity).color,
                        fontWeight: 700,
                        fontSize: "12px",
                      }}
                    >
                      {item.severity === "high" ? "High" : item.severity === "medium" ? "Medium" : "Low"}
                    </div>
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.detail}</div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No immediate planning flags" description="The current retirement, college, property, and visible insurance signals do not show an obvious needs-attention queue yet." />
          )}
        </SectionCard>

        <SectionCard title="Next Layer" subtitle="The next connected planning surfaces that will make this household dashboard stronger.">
          <AIInsightPanel
            title="Coming next"
            summary="This first household dashboard now ties together retirement, college planning, property equity, and a simple protection check. Later versions can deepen policy adequacy and household continuity planning."
            bullets={[
              "Future insurance layers can move from policy presence checks into adequacy, liability limit, and beneficiary review.",
              "Mortgage layers can deepen from debt-read visibility into payment trend, escrow pressure, and amortization planning.",
              "Later versions can add a single household readiness narrative that blends goals, protection, and asset continuity.",
              "Persistence is already in place for retirement and college, so this dashboard can grow into an ongoing family planning surface.",
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}
