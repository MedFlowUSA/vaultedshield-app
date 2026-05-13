import { useEffect, useMemo, useState } from "react";
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

function getPriorityUrgencyTone(priority) {
  if (priority === "Now") return { background: "#fee2e2", color: "#991b1b" };
  if (priority === "Soon") return { background: "#ffedd5", color: "#c2410c" };
  return { background: "#e2e8f0", color: "#334155" };
}

function getPriorityUrgencyLabel(severity) {
  if (severity === "high") return "Now";
  if (severity === "medium") return "Soon";
  return "Watch";
}

function scorePriorityItem(item) {
  const severityWeight = { high: 300, medium: 200, low: 100 };
  const moduleWeight = {
    insurance: 40,
    retirement: 32,
    mortgage: 24,
    college: 20,
    property: 12,
  };
  const score = (severityWeight[item.severity] || 0) + (moduleWeight[item.moduleKey] || 0) + Number(item.impactScore || 0);
  return score;
}

function buildHouseholdPriorityItems({ retirementReadiness, collegePlans, propertyBundles, insuranceGaps, mortgageSummary }) {
  const items = [];

  if (retirementReadiness && retirementReadiness.readinessStatus !== "On Track") {
    items.push({
      id: "retirement-readiness",
      title: "Retirement readiness needs attention",
      detail: `${retirementReadiness.readinessStatus} at ${retirementReadiness.readinessScore}/100.`,
      actionPath: "/retirement/upload",
      severity: retirementReadiness.readinessStatus === "Needs Attention" || retirementReadiness.readinessStatus === "Behind" ? "medium" : "low",
      moduleKey: "retirement",
      impactScore: Math.max(0, 100 - Number(retirementReadiness.readinessScore || 0)),
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
        moduleKey: "college",
        impactScore: Math.max(0, 100 - Number(plan.readinessScore || 0)),
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
        severity: getPropertyStatus(bundle) === "limited" ? "medium" : "low",
        moduleKey: "property",
        impactScore: getPropertyStatus(bundle) === "limited" ? 55 : 25,
      });
    });

  if ((mortgageSummary?.needsReviewCount || 0) > 0) {
    items.push({
      id: "mortgage-readiness",
      title: "Mortgage records need stronger review support",
      detail: `${mortgageSummary.needsReviewCount} loan${mortgageSummary.needsReviewCount === 1 ? "" : "s"} still need stronger statement, payment, or property-link visibility.`,
      actionPath: "/mortgage",
      severity: "medium",
      moduleKey: "mortgage",
      impactScore: Math.min(90, (mortgageSummary.needsReviewCount || 0) * 18),
    });
  } else if ((mortgageSummary?.reviewSoonCount || 0) > 0) {
    items.push({
      id: "mortgage-review-soon",
      title: "Mortgage review should stay on the radar",
      detail: `${mortgageSummary.reviewSoonCount} loan${mortgageSummary.reviewSoonCount === 1 ? "" : "s"} merit refinance, payoff, or maturity review soon.`,
      actionPath: "/mortgage",
      severity: "low",
      moduleKey: "mortgage",
      impactScore: Math.min(60, (mortgageSummary.reviewSoonCount || 0) * 10),
    });
  }

  const insuranceItems = [
    {
      id: "insurance-life",
      title: "Life coverage needs review",
      detail: insuranceGaps?.life?.message,
      actionPath: "/insurance/life/upload",
      severity: insuranceGaps?.life?.severity || "low",
      moduleKey: "insurance",
      impactScore: insuranceGaps?.life?.status === "missing" ? 95 : 65,
      include: insuranceGaps?.life?.status && insuranceGaps.life.status !== "covered",
    },
    {
      id: "insurance-homeowners",
      title: "Homeowners protection needs review",
      detail: insuranceGaps?.homeowners?.message,
      actionPath: "/insurance/homeowners",
      severity: insuranceGaps?.homeowners?.severity || "low",
      moduleKey: "insurance",
      impactScore: insuranceGaps?.homeowners?.status === "missing" ? 88 : 58,
      include: insuranceGaps?.homeowners?.status && insuranceGaps.homeowners.status !== "covered" && insuranceGaps.homeowners.status !== "unknown",
    },
    {
      id: "insurance-umbrella",
      title: "Umbrella coverage may be missing",
      detail: insuranceGaps?.umbrella?.message,
      actionPath: "/insurance",
      severity: insuranceGaps?.umbrella?.severity || "low",
      moduleKey: "insurance",
      impactScore: 52,
      include: insuranceGaps?.umbrella?.status === "gap",
    },
    {
      id: "insurance-auto",
      title: "Auto coverage visibility is limited",
      detail: insuranceGaps?.auto?.message,
      actionPath: "/insurance/auto",
      severity: insuranceGaps?.auto?.severity || "low",
      moduleKey: "insurance",
      impactScore: 30,
      include: insuranceGaps?.auto?.status === "missing",
    },
  ].reduce((results, { include, ...item }) => {
    if (include) results.push(item);
    return results;
  }, []);

  return [...insuranceItems, ...items]
    .map((item) => ({
      ...item,
      urgency: getPriorityUrgencyLabel(item.severity),
      priorityScore: scorePriorityItem(item),
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 5);
}

export default function HouseholdGoalsDashboardPage({ onNavigate }) {
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
        helper: priorityItems.length ? `${priorityItems[0].urgency}: ${priorityItems[0].title}` : "No urgent planning flags yet",
      },
    ],
    [
      activeCollegePlan,
      collegeHouseholdRead.headline,
      collegePlans.length,
      insuranceGaps.summary.protectionFlags.length,
      insuranceSummary,
      mortgageSummary,
      priorityItems,
      propertySummary,
      retirementReadiness,
    ]
  );

  const householdNarrative = useMemo(() => {
    const lines = [];
    const leadingPriority = priorityItems[0] || null;
    const secondaryPriority = priorityItems[1] || null;

    if (leadingPriority) {
      lines.push(
        secondaryPriority
          ? `The biggest household priorities right now are ${leadingPriority.title.toLowerCase()} and ${secondaryPriority.title.toLowerCase()}.`
          : `The main household priority right now is ${leadingPriority.title.toLowerCase()}.`
      );
    } else {
      lines.push("No single household issue is rising above the others right now, so the current view reads as more monitor-than-urgent.");
    }

    if (retirementReadiness) {
      lines.push(`Retirement is currently ${retirementReadiness.readinessStatus.toLowerCase()} at ${retirementReadiness.readinessScore}/100.`);
    } else {
      lines.push("Retirement planning has not been saved yet.");
    }

    if (activeCollegePlan) {
      lines.push(`${activeCollegePlan.childLabel} college planning is ${activeCollegePlan.readinessStatus.toLowerCase()} at ${activeCollegePlan.readinessScore}/100.`);
    } else {
      lines.push("No college plan is visible yet in the current household view.");
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
      lines.push("No household mortgage loans are visible yet in the current planning view.");
    }

    if (insuranceSummary?.headline) {
      lines.push(insuranceSummary.headline);
    } else if (insuranceGaps.summary.protectionFlags.length === 0) {
      lines.push("No obvious insurance protection gaps are standing out from the policies currently visible here.");
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
  }, [activeCollegePlan, insuranceGaps, insuranceSummary, mortgageSummary, priorityItems, propertySummary, retirementReadiness]);

  const planningHeroScore = Math.round(
    Math.max(
      34,
      Math.min(
        90,
        (retirementReadiness?.readinessScore || 0) * 0.4 +
          (activeCollegePlan?.readinessScore || 0) * 0.3 +
          (insuranceSummary?.confidence ? Number(insuranceSummary.confidence) * 100 : insuranceGaps.summary.protectionFlags.length === 0 ? 72 : 48) * 0.3
      )
    )
  );
  const planningHeroTone =
    planningHeroScore >= 80 ? "good" : planningHeroScore >= 60 ? "info" : planningHeroScore >= 45 ? "warning" : "alert";

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #064e3b 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              Household Goals
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              {priorityItems.length > 0
                ? "Planning view has clear next steps"
                : "Household planning view looks calm right now"}
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "560px" }}>
              See the household planning picture in one calm view before going deeper into any single goal.
            </div>
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
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#6ee7b7" }}>{planningHeroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>planning score</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[
            { label: "Priority Items", value: priorityItems.length || "None" },
            { label: "Retirement", value: retirementReadiness ? `${retirementReadiness.readinessScore}/100` : "Not set" },
            { label: "College Plans", value: collegePlans.length || "None" },
            { label: "Properties", value: propertySummary.propertyCount || 0 },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#a7f3d0" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onNavigate?.("/retirement")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#065f46", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Retirement Hub
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/college-planning")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open College Planner
          </button>
          <button
            type="button"
            onClick={() => document.querySelector('[data-household-protection="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            See Protection
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Simple Read",
            title: priorityItems.length > 0 ? "Planning view has clear next steps" : "Planning view looks calm right now",
            detail: householdNarrative.split(".")[0] + ".",
            metric: `${priorityItems.length} priorit${priorityItems.length === 1 ? "y" : "ies"}`,
            tone: planningHeroTone,
            statusLabel: "Simple Read",
            actionLabel: "See Priorities",
            onAction: () => document.querySelector('[data-household-priorities="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "Best First Step",
            title: priorityItems[0]?.title || "Start with the strongest planning gap",
            detail: priorityItems[0]?.detail || "Retirement, college, mortgage, and protection signals all roll up here so you can choose the best next workstream.",
            metric: priorityItems[0]?.urgency || "Watch",
            tone: "warning",
            statusLabel: "Guided Focus",
            actionLabel: "Open Priority",
            onAction: () => onNavigate?.(priorityItems[0]?.actionPath || "/retirement"),
          },
          {
            kicker: "What Can Wait",
            title: "Detailed optimization can come later",
            detail: "Use this page to decide which planning lane deserves attention first. The deeper calculators and record-by-record reviews can follow.",
            metric: `${summaryItems.length} signals`,
            tone: "info",
            statusLabel: "Building",
            actionLabel: "See Protection",
            onAction: () => document.querySelector('[data-household-protection="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
        ].map((tile) => (
          <div
            key={tile.kicker}
            style={{
              padding: "20px",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              display: "grid",
              gap: "12px",
              alignContent: "start",
            }}
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

      {/* Household Planning Narrative */}
      <div data-household-priorities="true" style={surfaceCard({ padding: "24px 26px", display: "grid", gap: "16px" })}>
        <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Household Planning Read</div>
        <div style={{ color: "#475569", lineHeight: "1.7" }}>{householdNarrative}</div>
        <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#64748b", fontSize: "13px", lineHeight: "1.7" }}>
          {[
            priorityItems[0]
              ? `Top household priority: ${priorityItems[0].title}. ${priorityItems[0].detail}`
              : "No urgent household planning item is currently outranking the others.",
            retirementReadiness
              ? `Retirement projected balance: ${formatCurrency(retirementReadiness.projectedRetirementBalance)}.`
              : "Retirement goal has not been saved yet.",
            activeCollegePlan
              ? `${activeCollegePlan.childLabel} projected college savings: ${formatCurrency(activeCollegePlan.projectedSavings)}.`
              : "No college plan is visible yet.",
            propertySummary.propertyCount > 0
              ? `Visible property equity midpoint: ${propertySummary.totalEquityMidpoint !== null ? formatCurrency(propertySummary.totalEquityMidpoint) : "Limited"}.`
              : "Property equity is not in view yet.",
            mortgageSummary.totalLoans > 0
              ? `Mortgage read: ${mortgageSummary.headline}`
              : "No mortgage loans are visible yet.",
            insuranceGaps.summary.protectionFlags.length > 0
              ? `Protection review flags: ${insuranceGaps.summary.protectionFlags.join(", ")}.`
              : "No obvious insurance protection gaps were detected from the current household data.",
          ].map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>
      </div>

      {/* Protection & Insurance */}
      <div data-household-protection="true" style={surfaceCard({ padding: "24px 26px", display: "grid", gap: "16px" })}>
        <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Protection & Insurance</div>
        <div style={{ color: "#64748b", fontSize: "14px" }}>A simple household protection health check based on visible policy and property data.</div>
        {insuranceLoading ? (
          <div style={{ color: "#64748b" }}>Loading household protection signals...</div>
        ) : insuranceError ? (
          <div style={{ padding: "20px", borderRadius: "12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>{insuranceError}</div>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
                  {[
                    { label: "Policies", value: insuranceSummary.totalPolicies || 0 },
                    { label: "Visible Coverage", value: insuranceSummary.totalCoverage ? formatCurrency(insuranceSummary.totalCoverage) : "Not recorded" },
                    { label: "Confidence", value: formatScore((insuranceSummary.confidence || 0) * 100) },
                    { label: "Gap Flags", value: insuranceSummary.metrics?.gapPolicies || 0 },
                    { label: "Owner Visible", value: insuranceSummary.metrics?.ownerVisiblePolicies || 0 },
                    { label: "Insured Visible", value: insuranceSummary.metrics?.insuredVisiblePolicies || 0 },
                    { label: "Named Beneficiaries", value: insuranceSummary.metrics?.beneficiaryNamedPolicies || 0 },
                    { label: "Beneficiary Limited", value: insuranceSummary.metrics?.beneficiaryLimitedPolicies || 0 },
                    { label: "Joint Insured", value: insuranceSummary.metrics?.jointInsuredVisiblePolicies || 0 },
                    { label: "Payor Visible", value: insuranceSummary.metrics?.payorVisiblePolicies || 0 },
                    { label: "Trust Name Visible", value: insuranceSummary.metrics?.trustNameVisiblePolicies || 0 },
                    { label: "Beneficiary Shares", value: insuranceSummary.metrics?.beneficiaryShareVisiblePolicies || 0 },
                    { label: "Trust-Owned", value: insuranceSummary.metrics?.trustOwnedPolicies || 0 },
                    { label: "Trustee Visible", value: insuranceSummary.metrics?.trusteeVisiblePolicies || 0 },
                    { label: "Benefit Option Visible", value: insuranceSummary.metrics?.benefitOptionVisiblePolicies || 0 },
                    { label: "Rider Support Visible", value: insuranceSummary.metrics?.riderVisiblePolicies || 0 },
                    { label: "Living Benefit Visible", value: insuranceSummary.metrics?.livingBenefitVisiblePolicies || 0 },
                    { label: "Income Protection Visible", value: insuranceSummary.metrics?.incomeProtectionVisiblePolicies || 0 },
                  ].map((m) => (
                    <div key={m.label}>
                      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{m.label}</div>
                      <div style={{ marginTop: "4px", fontWeight: 800, color: "#0f172a" }}>{m.value}</div>
                    </div>
                  ))}
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
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
                style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontWeight: 700, cursor: "pointer" }}
              >
                Review Coverage
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Retirement + College */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px", alignContent: "start" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Retirement Readiness</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>Saved retirement goal status for this household.</div>
          {retirementReadiness ? (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ padding: "8px 12px", borderRadius: "999px", background: getReadinessTone(retirementReadiness.readinessStatus).background, color: getReadinessTone(retirementReadiness.readinessStatus).color, fontWeight: 800, fontSize: "13px" }}>
                  {retirementReadiness.readinessStatus}
                </div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>{retirementReadiness.readinessScore}/100</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Projected Balance:</strong> {formatCurrency(retirementReadiness.projectedRetirementBalance)}</div>
                <div><strong>Income Gap:</strong> {formatCurrency(retirementReadiness.estimatedIncomeGapMonthly)}/month</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{retirementReadiness.explanation}</div>
            </div>
          ) : (
            <div style={{ padding: "20px", borderRadius: "12px", background: "#f8fafc", border: "1px dashed #cbd5e1", textAlign: "center", display: "grid", gap: "6px" }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>No retirement goal saved</div>
              <div style={{ color: "#64748b", fontSize: "13px" }}>Set a retirement goal to activate a household readiness view.</div>
            </div>
          )}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => onNavigate?.("/retirement")} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
              Open Retirement Hub
            </button>
            <button type="button" onClick={() => onNavigate?.("/retirement/upload")} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
              {retirementReadiness ? "Update Goal" : "Set Retirement Goal"}
            </button>
          </div>
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px", alignContent: "start" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>College Planning</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>Saved child plans and current education-funding readiness.</div>
          {activeCollegePlan ? (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ padding: "8px 12px", borderRadius: "999px", background: getReadinessTone(activeCollegePlan.readinessStatus).background, color: getReadinessTone(activeCollegePlan.readinessStatus).color, fontWeight: 800, fontSize: "13px" }}>
                  {activeCollegePlan.readinessStatus}
                </div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>{activeCollegePlan.readinessScore}/100</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Active Child Plan:</strong> {activeCollegePlan.childLabel}</div>
                <div><strong>Projected Savings:</strong> {formatCurrency(activeCollegePlan.projectedSavings)}</div>
                <div><strong>{activeCollegePlan.fundingDifference >= 0 ? "Projected Surplus" : "Funding Gap"}:</strong> {formatCurrency(Math.abs(activeCollegePlan.fundingDifference))}</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{activeCollegePlan.explanation}</div>
              <div style={{ color: "#64748b", lineHeight: "1.7" }}>Household college read: {collegeHouseholdRead.headline}</div>
            </div>
          ) : (
            <div style={{ padding: "20px", borderRadius: "12px", background: "#f8fafc", border: "1px dashed #cbd5e1", textAlign: "center", display: "grid", gap: "6px" }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>No college plans saved</div>
              <div style={{ color: "#64748b", fontSize: "13px" }}>Add a child plan to activate college readiness tracking for the household.</div>
            </div>
          )}
          <button type="button" onClick={() => onNavigate?.("/college-planning")} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontWeight: 700, cursor: "pointer", fontSize: "13px", textAlign: "left" }}>
            Open College Planner
          </button>
        </div>
      </div>

      {/* Property + Mortgage */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px", alignContent: "start" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Property Equity Snapshot</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>Current equity visibility across linked household properties.</div>
          {propertyLoading ? (
            <div style={{ color: "#64748b" }}>Loading household property equity visibility...</div>
          ) : propertyError ? (
            <div style={{ padding: "20px", borderRadius: "12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: "13px" }}>{propertyError}</div>
          ) : propertyBundles.length === 0 ? (
            <div style={{ padding: "20px", borderRadius: "12px", background: "#f8fafc", border: "1px dashed #cbd5e1", textAlign: "center", display: "grid", gap: "6px" }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>No properties linked yet</div>
              <div style={{ color: "#64748b", fontSize: "13px" }}>Add a property and run valuation/linkage review to bring equity visibility into household planning.</div>
            </div>
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
                    style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid rgba(148, 163, 184, 0.18)", display: "grid", gap: "8px" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{property.property_name || property.property_address || "Property"}</div>
                      <div style={{ padding: "6px 10px", borderRadius: "999px", background: getEquityTone(propertyStatus).background, color: getEquityTone(propertyStatus).color, fontWeight: 700, fontSize: "12px" }}>
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
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px", alignContent: "start" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Mortgage Readiness</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>Debt review, payoff visibility, and refinance readiness across household mortgage loans.</div>
          {mortgageLoading ? (
            <div style={{ color: "#64748b" }}>Loading household mortgage readiness...</div>
          ) : mortgageError ? (
            <div style={{ padding: "20px", borderRadius: "12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: "13px" }}>{mortgageError}</div>
          ) : mortgageSummary.totalLoans === 0 ? (
            <div style={{ padding: "20px", borderRadius: "12px", background: "#f8fafc", border: "1px dashed #cbd5e1", textAlign: "center", display: "grid", gap: "6px" }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>No mortgage loans linked yet</div>
              <div style={{ color: "#64748b", fontSize: "13px" }}>Add or link a mortgage to bring debt-readiness signals into the household dashboard.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "999px",
                    background: getMortgageStatusTone(mortgageSummary.needsReviewCount > 0 ? "Needs Review" : mortgageSummary.reviewSoonCount > 0 ? "Review Soon" : "Better Supported").background,
                    color: getMortgageStatusTone(mortgageSummary.needsReviewCount > 0 ? "Needs Review" : mortgageSummary.reviewSoonCount > 0 ? "Review Soon" : "Better Supported").color,
                    fontWeight: 800,
                    fontSize: "13px",
                  }}
                >
                  {mortgageSummary.needsReviewCount > 0 ? "Needs Review" : mortgageSummary.reviewSoonCount > 0 ? "Review Soon" : "Better Supported"}
                </div>
                <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>{formatScore((mortgageSummary.averageConfidence || 0) * 100)}</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Loans in View:</strong> {mortgageSummary.totalLoans}</div>
                <div><strong>Needs Review:</strong> {mortgageSummary.needsReviewCount}</div>
                <div><strong>Review Soon:</strong> {mortgageSummary.reviewSoonCount}</div>
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{mortgageSummary.headline}</div>
              {Array.isArray(mortgageSummary.notes) && mortgageSummary.notes.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                  {mortgageSummary.notes.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Priority Queue + Next Layer */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px", alignContent: "start" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Priority Queue</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>The next household planning items that deserve attention first.</div>
          {priorityItems.length > 0 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {priorityItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate?.(item.actionPath)}
                  style={{ textAlign: "left", padding: "14px 16px", borderRadius: "14px", border: "1px solid rgba(148, 163, 184, 0.18)", background: "#f8fafc", cursor: "pointer", display: "grid", gap: "6px" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                    <div style={{ padding: "5px 9px", borderRadius: "999px", background: getPriorityUrgencyTone(item.urgency).background, color: getPriorityUrgencyTone(item.urgency).color, fontWeight: 700, fontSize: "12px" }}>
                      {item.urgency}
                    </div>
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.detail}</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ padding: "20px", borderRadius: "12px", background: "#f8fafc", border: "1px dashed #cbd5e1", textAlign: "center", display: "grid", gap: "6px" }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>No immediate planning flags</div>
              <div style={{ color: "#64748b", fontSize: "13px" }}>Current retirement, college, property, mortgage, and visible insurance signals do not show an obvious household priority queue yet.</div>
            </div>
          )}
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px", alignContent: "start" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Next Layer</div>
          <div style={{ color: "#64748b", fontSize: "13px" }}>The next connected planning surfaces that will make this household dashboard stronger.</div>
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            This first household dashboard now ties together retirement, college planning, property equity, and a simple protection check. Later versions can deepen policy adequacy and household continuity planning.
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#64748b", fontSize: "13px", lineHeight: "1.7" }}>
            <li>Future insurance layers can move from policy presence checks into adequacy, liability limit, and beneficiary review.</li>
            <li>Mortgage layers can deepen from debt-read visibility into payment trend, escrow pressure, and amortization planning.</li>
            <li>Later versions can add a single household readiness narrative that blends goals, protection, and asset continuity.</li>
            <li>Persistence is already in place for retirement and college, so this dashboard can grow into an ongoing family planning surface.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
