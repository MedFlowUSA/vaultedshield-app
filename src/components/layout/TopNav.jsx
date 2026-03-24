import logo from "../../assets/vaultedshield-logo.png";

export default function TopNav({
  title,
  subtitle,
  onNavigate,
  currentPlanLabel = "Free",
  householdName = "Working Household",
  onSignOut,
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "16px",
        padding: "22px 28px",
        borderBottom: "1px solid #e2e8f0",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <img
          src={logo}
          alt="VaultedShield"
          style={{
            height: "44px",
            width: "auto",
          }}
        />
        <div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a" }}>{title}</div>
          <div style={{ marginTop: "4px", color: "#64748b" }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <div
          style={{
            display: "grid",
            gap: "2px",
            padding: "8px 12px",
            borderRadius: "10px",
            background: "#eff6ff",
            color: "#1d4ed8",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {currentPlanLabel}
          </div>
          <div style={{ fontSize: "12px", color: "#475569" }}>{householdName}</div>
        </div>
        <button
          onClick={() => onNavigate("/pricing")}
          style={{
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            borderRadius: "10px",
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Upgrade
        </button>
        <button
          onClick={() => onNavigate("/upload-center")}
          style={{
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            borderRadius: "10px",
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 600,
          }}
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
          }}
        >
          Open Life Policy Portal
        </button>
        <button
          onClick={() => onSignOut?.()}
          style={{
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            borderRadius: "10px",
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
