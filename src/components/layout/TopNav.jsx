import { useMemo, useState } from "react";
import logo from "../../assets/vaultedshield-logo.png";
import { buildHouseholdIntelligence, buildHouseholdRiskContinuityMap } from "../../lib/domain/platformIntelligence";
import { useDemoMode } from "../../lib/demo/DemoModeContext";
import {
  buildDashboardCommandCenter,
  buildEmergencyAccessCommand,
  buildHousingContinuityCommand,
} from "../../lib/domain/platformIntelligence/continuityCommandCenter";
import {
  buildHouseholdPriorityEngine,
  buildHouseholdScorecard,
} from "../../lib/domain/platformIntelligence/householdOperatingSystem";
import {
  annotateReviewWorkflowItems,
  buildHouseholdReviewDigest,
  getHouseholdReviewDigestSnapshot,
  getHouseholdReviewWorkflowState,
} from "../../lib/domain/platformIntelligence/reviewWorkflowState";
import { usePlatformShellData } from "../../lib/intelligence/PlatformShellDataContext";
import { shouldShowDevDiagnostics } from "../../lib/ui/devDiagnostics";

function CompactSummaryCard({ label, value, accent = false }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "2px",
        padding: "10px 12px",
        borderRadius: "12px",
        background: accent ? "#eff6ff" : "#f8fafc",
        border: accent ? "none" : "1px solid #e2e8f0",
        color: accent ? "#1d4ed8" : "#0f172a",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: accent ? "#1d4ed8" : "#64748b",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "13px",
          color: accent ? "#475569" : "#0f172a",
          fontWeight: 700,
          lineHeight: "1.5",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CompactMetaPill({ label, value, accent = false }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "2px",
        padding: "8px 10px",
        borderRadius: "999px",
        background: accent ? "#eff6ff" : "#f8fafc",
        border: accent ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: accent ? "#1d4ed8" : "#64748b",
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: "#0f172a",
          lineHeight: 1.25,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PriorityCard({ priority }) {
  if (!priority) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: "4px",
        padding: "10px 12px",
        borderRadius: "12px",
        background: priority.urgencyMeta.background,
        border: priority.urgencyMeta.border,
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: priority.urgencyMeta.accent,
        }}
      >
        Priority: {priority.urgencyMeta.label}
      </div>
      <div style={{ fontSize: "12px", color: "#0f172a", fontWeight: 700, lineHeight: "1.45" }}>
        {priority.title}
      </div>
      <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.45" }}>
        {priority.impactLabel} | {priority.nextAction}
      </div>
    </div>
  );
}

function DesktopSignalCard({ prefix, signal }) {
  if (!signal) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: "4px",
        padding: "10px 12px",
        borderRadius: "12px",
        background: signal.urgencyMeta.background,
        border: signal.urgencyMeta.border,
        minWidth: "240px",
        maxWidth: "320px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: signal.urgencyMeta.accent,
        }}
      >
        {prefix}: {signal.urgencyMeta.badge || signal.urgencyMeta.label}
      </div>
      <div style={{ fontSize: "12px", color: "#0f172a", fontWeight: 700, lineHeight: "1.45" }}>
        {signal.title}
      </div>
      <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.45" }}>
        {signal.staleLabel || signal.impactLabel} | {signal.nextAction}
      </div>
    </div>
  );
}

function DesktopSignalPill({ prefix, signal }) {
  if (!signal) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: "2px",
        padding: "10px 12px",
        borderRadius: "12px",
        background: signal.urgencyMeta.background,
        border: signal.urgencyMeta.border,
        minWidth: "160px",
        maxWidth: "220px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: signal.urgencyMeta.accent,
        }}
      >
        {prefix}: {signal.urgencyMeta.badge || signal.urgencyMeta.label}
      </div>
      <div style={{ fontSize: "12px", color: "#0f172a", fontWeight: 700, lineHeight: "1.35" }}>
        {signal.title}
      </div>
    </div>
  );
}

function DesktopPriorityStrip({ priority }) {
  if (!priority) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: "2px",
        padding: "10px 12px",
        borderRadius: "12px",
        background: priority.urgencyMeta.background,
        border: priority.urgencyMeta.border,
        minWidth: "220px",
        maxWidth: "300px",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: priority.urgencyMeta.accent,
        }}
      >
        Priority: {priority.urgencyMeta.label}
      </div>
      <div style={{ fontSize: "12px", color: "#0f172a", fontWeight: 700, lineHeight: "1.35" }}>
        {priority.title}
      </div>
    </div>
  );
}

export default function TopNav({
  title,
  subtitle,
  onNavigate,
  onUpgrade,
  currentPlanLabel = "Free",
  householdName = "Working Household",
  onSignOut,
  onToggleSidebar,
  showSidebarToggle = false,
  isCompact = false,
}) {
  const [compactPanelRouteKey, setCompactPanelRouteKey] = useState("");
  const { householdState, debug, intelligenceBundle, insuranceRows } = usePlatformShellData();
  const { currentMainStepNumber, finishDemo, isDemoMode, mainStepCount, startDemo } = useDemoMode();
  const resolvedHouseholdName = householdState.household?.household_name || householdName;
  const reviewScope = useMemo(
    () => ({
      householdId: householdState.context.householdId,
      userId: debug.authUserId || null,
    }),
    [debug.authUserId, householdState.context.householdId]
  );
  const householdIntelligence = useMemo(
    () => (intelligenceBundle ? buildHouseholdIntelligence(intelligenceBundle) : null),
    [intelligenceBundle]
  );
  const householdMap = useMemo(
    () => buildHouseholdRiskContinuityMap(intelligenceBundle || {}, householdIntelligence, insuranceRows || []),
    [householdIntelligence, intelligenceBundle, insuranceRows]
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
        bundle: intelligenceBundle,
      }),
    [commandCenter, emergencyAccessCommand, householdMap, housingCommandCenter, intelligenceBundle]
  );
  const topBlocker = commandCenter.blockers[0] || null;
  const topHousingBlocker = housingCommandCenter.blockers[0] || null;
  const topEmergencyBlocker = emergencyAccessCommand.blockers[0] || null;
  const topPriority = householdPriorityEngine.priorities[0] || null;
  const compactHeadline =
    topPriority?.title ||
    topBlocker?.title ||
    topHousingBlocker?.title ||
    topEmergencyBlocker?.title ||
    "Household workspace ready";
  const compactSupportLine =
    topPriority?.impactLabel ||
    topBlocker?.nextAction ||
    topHousingBlocker?.nextAction ||
    topEmergencyBlocker?.nextAction ||
    `${householdScorecard.overallScore ?? "--"} - ${householdScorecard.overallStatus}`;
  const actionButtonStyle = {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    borderRadius: "12px",
    padding: isCompact ? "10px 12px" : "12px 14px",
    cursor: "pointer",
    fontWeight: 600,
    width: isCompact ? "100%" : "auto",
    justifyContent: "center",
    minHeight: "44px",
  };
  const desktopQuickActionStyle = {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    borderRadius: "12px",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 700,
    minHeight: "40px",
  };
  const compactPanelKey = `${title}|${subtitle}`;
  const compactPanelOpen = isCompact && compactPanelRouteKey === compactPanelKey;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: isCompact ? "stretch" : "center",
        gap: "16px",
        flexWrap: "wrap",
        padding: isCompact
          ? "max(16px, calc(env(safe-area-inset-top, 0px) + 4px)) 16px 16px"
          : "16px 24px",
        borderBottom: "1px solid #e2e8f0",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 20,
        overflowX: "clip",
      }}
    >
      <div style={{ display: "flex", alignItems: isCompact ? "flex-start" : "center", gap: isCompact ? "12px" : "14px", minWidth: 0, flex: "1 1 320px" }}>
        {showSidebarToggle ? (
          <button
            type="button"
            onClick={() => onToggleSidebar?.()}
            aria-label="Open navigation"
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "12px 12px",
              cursor: "pointer",
              fontWeight: 700,
              flex: "0 0 auto",
              minHeight: "44px",
              minWidth: "44px",
            }}
          >
            Menu
          </button>
        ) : null}
        <img
          src={logo}
          alt="VaultedShield"
          style={{
            height: isCompact ? "38px" : "44px",
            width: "auto",
            flex: "0 0 auto",
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: isCompact ? "17px" : "18px", fontWeight: 700, color: "#0f172a", lineHeight: 1.15, wordBreak: "break-word" }}>
            {title}
          </div>
          <div style={{ marginTop: "4px", color: "#64748b", fontSize: isCompact ? "12px" : "12px", lineHeight: "1.45" }}>
            {subtitle}
          </div>
          {isCompact ? (
            <div style={{ marginTop: "7px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
              <CompactMetaPill
                label="Household Score"
                value={`${householdScorecard.overallScore ?? "--"} - ${householdScorecard.overallStatus}`}
                accent
              />
              <CompactMetaPill label="Household" value={resolvedHouseholdName} />
              {isDemoMode ? (
                <CompactMetaPill label="Demo Mode" value={`Step ${currentMainStepNumber}/${mainStepCount}`} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {isCompact ? (
        <div
          style={{
            display: "grid",
            gap: "10px",
            flex: "1 1 100%",
            width: "100%",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "14px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0, display: "grid", gap: "3px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
                Priority
              </div>
              <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: 700, lineHeight: "1.35" }}>
                {compactHeadline}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", lineHeight: "1.35" }}>
                {compactSupportLine}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCompactPanelRouteKey((current) => (current === compactPanelKey ? "" : compactPanelKey))}
              style={{
                border: compactPanelOpen ? "1px solid #bfdbfe" : "1px solid #cbd5e1",
                background: compactPanelOpen ? "#eff6ff" : "#ffffff",
                color: compactPanelOpen ? "#1d4ed8" : "#0f172a",
                borderRadius: "12px",
                padding: "10px 12px",
                cursor: "pointer",
                fontWeight: 700,
                minHeight: "44px",
                minWidth: "84px",
                whiteSpace: "nowrap",
              }}
            >
              {compactPanelOpen ? "Close" : "Actions"}
            </button>
          </div>

          {compactPanelOpen ? (
            <div
              style={{
                display: "grid",
                gap: "10px",
                padding: "12px",
                borderRadius: "14px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setCompactPanelRouteKey("");
                  if (isDemoMode) {
                    finishDemo();
                    return;
                  }
                  startDemo();
                }}
                style={{
                  border: isDemoMode ? "1px solid #bfdbfe" : "1px solid #dbeafe",
                  background: isDemoMode ? "#eff6ff" : "#f8fbff",
                  color: "#1d4ed8",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  cursor: "pointer",
                  fontWeight: 700,
                  width: "100%",
                  minHeight: "44px",
                }}
              >
                {isDemoMode ? `Demo Mode Active | Step ${currentMainStepNumber}/${mainStepCount}` : "Start Demo"}
              </button>

              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCompactPanelRouteKey("");
                    onNavigate("/upload-center");
                  }}
                  style={actionButtonStyle}
                >
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompactPanelRouteKey("");
                    onNavigate("/insurance");
                  }}
                  style={{
                    border: "none",
                    background: "#0f172a",
                    color: "#ffffff",
                    borderRadius: "12px",
                    padding: "10px 12px",
                    cursor: "pointer",
                    fontWeight: 700,
                    width: "100%",
                    minHeight: "44px",
                  }}
                >
                  Insurance
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompactPanelRouteKey("");
                    onNavigate("/account");
                  }}
                  style={actionButtonStyle}
                >
                  Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompactPanelRouteKey("");
                    onUpgrade?.();
                  }}
                  style={actionButtonStyle}
                >
                  Upgrade
                </button>
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setCompactPanelRouteKey("");
                    onSignOut?.();
                  }}
                  style={actionButtonStyle}
                >
                  Log Out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            flex: "1 1 520px",
            minWidth: 0,
            alignItems: "center",
          }}
        >
          <CompactSummaryCard label={currentPlanLabel} value={resolvedHouseholdName} accent />
          <CompactSummaryCard
            label="Household Score"
            value={`${householdScorecard.overallScore ?? "--"} - ${householdScorecard.overallStatus}`}
          />
          {isDemoMode ? (
            <button
              type="button"
              onClick={() => finishDemo()}
              style={{
                ...desktopQuickActionStyle,
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
                color: "#1d4ed8",
              }}
            >
              Demo Mode Active | Step {currentMainStepNumber}/{mainStepCount}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startDemo()}
              style={{
                ...desktopQuickActionStyle,
                border: "1px solid #dbeafe",
                background: "#f8fbff",
                color: "#1d4ed8",
              }}
            >
              Start Demo
            </button>
          )}
          <DesktopPriorityStrip priority={topPriority} />
          <button type="button" onClick={() => onUpgrade?.()} style={desktopQuickActionStyle}>
            Upgrade
          </button>
          <button type="button" onClick={() => onNavigate("/upload-center")} style={desktopQuickActionStyle}>
            Upload
          </button>
          <button type="button" onClick={() => onNavigate("/account")} style={desktopQuickActionStyle}>
            Account
          </button>
          <button
            type="button"
            onClick={() => onNavigate("/insurance")}
            style={{
              ...desktopQuickActionStyle,
              border: "none",
              background: "#0f172a",
              color: "#ffffff",
            }}
          >
            Insurance
          </button>
          <button type="button" onClick={() => onSignOut?.()} style={desktopQuickActionStyle}>
            Log Out
          </button>
        </div>
      )}

      {shouldShowDevDiagnostics() && isCompact ? (
        <div
          style={{
            width: "100%",
            paddingTop: "6px",
            fontSize: "11px",
            color: "#64748b",
            borderTop: "1px solid rgba(226, 232, 240, 0.8)",
          }}
        >
          auth={debug.authUserId || "guest"} | household={debug.householdId || "none"} | guestMode={debug.guestModeActive ? "yes" : "no"} | sharedFallback={debug.sharedFallbackActive ? "yes" : "no"} | policyScope={debug.policyScopeSource}
        </div>
      ) : null}
    </div>
  );
}

