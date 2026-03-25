import logo from "../../assets/vaultedshield-logo.png";
import { usePlatformShellData } from "../../lib/intelligence/PlatformShellDataContext";

export default function TopNav({
  title,
  subtitle,
  onNavigate,
  currentPlanLabel = "Free",
  householdName = "Working Household",
  onSignOut,
  onToggleSidebar,
  showSidebarToggle = false,
  isCompact = false,
}) {
  const { householdState } = usePlatformShellData();
  const resolvedHouseholdName = householdState.household?.household_name || householdName;
  const actionButtonStyle = {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    borderRadius: "10px",
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 600,
    width: isCompact ? "100%" : "auto",
    justifyContent: "center",
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: isCompact ? "stretch" : "center",
        gap: "16px",
        flexWrap: "wrap",
        padding: isCompact ? "16px 18px" : "22px 28px",
        borderBottom: "1px solid #e2e8f0",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0, flex: "1 1 320px" }}>
        {showSidebarToggle ? (
          <button
            type="button"
            onClick={() => onToggleSidebar?.()}
            aria-label="Open navigation"
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "10px 12px",
              cursor: "pointer",
              fontWeight: 700,
              flex: "0 0 auto",
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
          <div style={{ fontSize: isCompact ? "18px" : "22px", fontWeight: 700, color: "#0f172a", lineHeight: 1.15 }}>
            {title}
          </div>
          <div style={{ marginTop: "4px", color: "#64748b", fontSize: isCompact ? "13px" : "14px" }}>{subtitle}</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          justifyContent: isCompact ? "stretch" : "flex-end",
          flex: isCompact ? "1 1 100%" : "0 1 auto",
          width: isCompact ? "100%" : "auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "2px",
            padding: "8px 12px",
            borderRadius: "10px",
            background: "#eff6ff",
            color: "#1d4ed8",
            minWidth: isCompact ? "100%" : "auto",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {currentPlanLabel}
          </div>
          <div style={{ fontSize: "12px", color: "#475569" }}>{resolvedHouseholdName}</div>
        </div>
        <button
          onClick={() => onNavigate("/pricing")}
          style={actionButtonStyle}
        >
          Upgrade
        </button>
        <button
          onClick={() => onNavigate("/upload-center")}
          style={actionButtonStyle}
        >
          Upload Center
        </button>
        <button
          onClick={() => onNavigate("/insurance/life/policy-detail")}
          style={{
            border: "none",
            background: "#0f172a",
            color: "#ffffff",
            borderRadius: "10px",
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 700,
            width: isCompact ? "100%" : "auto",
          }}
        >
          Open Life Policy Portal
        </button>
        <button
          onClick={() => onSignOut?.()}
          style={actionButtonStyle}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
