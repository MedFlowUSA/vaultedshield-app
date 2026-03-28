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
import { getPropertyBundle, listProperties } from "../lib/supabase/propertyData";
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

function getPropertyStatus(propertyBundle = {}) {
  const equity = propertyBundle.propertyEquityPosition || null;
  const visibility = equity?.equity_visibility_status || "limited";
  if (visibility === "clear" || visibility === "visible" || visibility === "strong") return "clear";
  if (visibility === "moderate" || visibility === "partial") return "mixed";
  return "limited";
}

function buildHouseholdPriorityItems({ retirementReadiness, collegePlans, propertyBundles }) {
  const items = [];

  if (retirementReadiness && retirementReadiness.readinessStatus !== "On Track") {
    items.push({
      id: "retirement-readiness",
      title: "Retirement readiness needs attention",
      detail: `${retirementReadiness.readinessStatus} at ${retirementReadiness.readinessScore}/100.`,
      actionPath: "/retirement/upload",
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
      });
    });

  return items.slice(0, 5);
}

export default function HouseholdGoalsDashboardPage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const { householdState, debug } = usePlatformShellData();
  const [propertyBundles, setPropertyBundles] = useState([]);
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [propertyError, setPropertyError] = useState("");

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

  const priorityItems = useMemo(
    () =>
      buildHouseholdPriorityItems({
        retirementReadiness,
        collegePlans,
        propertyBundles,
      }),
    [collegePlans, propertyBundles, retirementReadiness]
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
        helper: activeCollegePlan ? `${activeCollegePlan.childLabel} is active` : "No child plans yet",
      },
      {
        label: "Property Equity",
        value: propertySummary.totalEquityMidpoint !== null ? formatCurrency(propertySummary.totalEquityMidpoint) : "Limited",
        helper: `${propertySummary.visibleEquityCount}/${propertySummary.propertyCount} properties with visible equity`,
      },
      {
        label: "Priority Queue",
        value: priorityItems.length,
        helper: priorityItems.length ? "Household goals to review" : "No urgent planning flags yet",
      },
    ],
    [activeCollegePlan, collegePlans.length, priorityItems.length, propertySummary, retirementReadiness]
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

    lines.push("Insurance gap rollups are the next planning layer and are not fully connected into this dashboard yet.");
    return lines.join(" ");
  }, [activeCollegePlan, propertySummary, retirementReadiness]);

  const cardGrid = isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))";

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
          propertySummary.propertyCount > 0
            ? `Visible property equity midpoint: ${propertySummary.totalEquityMidpoint !== null ? formatCurrency(propertySummary.totalEquityMidpoint) : "Limited"}.`
            : "Property equity is not in view yet.",
        ]}
      />

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
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.detail}</div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No immediate planning flags" description="The current retirement, college, and property signals do not show an obvious needs-attention queue yet." />
          )}
        </SectionCard>

        <SectionCard title="Next Layer" subtitle="The next connected planning surfaces that will make this household dashboard stronger.">
          <AIInsightPanel
            title="Coming next"
            summary="This first household dashboard ties together retirement, college planning, and property equity. Insurance gap rollups are the next major household planning layer."
            bullets={[
              "Insurance gap rollups will connect protection shortfalls into the same household planning queue.",
              "Later versions can add a single household readiness narrative that blends goals, protection, and asset continuity.",
              "Persistence is already in place for retirement and college, so this dashboard can grow into an ongoing family planning surface.",
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}
