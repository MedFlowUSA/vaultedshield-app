import { APP_NAVIGATION, ROUTES } from "../../lib/navigation/routes";
import logo from "../../assets/vaultedshield-logo.png";
import { hasTierAccess } from "../../lib/auth/accessPortal";

export default function Sidebar({ currentPath, onNavigate, currentTier = "free", currentPlanLabel = "Free", onUpgrade }) {
  return (
    <aside
      style={{
        width: "260px",
        background: "#0f172a",
        color: "#e2e8f0",
        minHeight: "100vh",
        padding: "28px 18px",
        boxSizing: "border-box",
        position: "sticky",
        top: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <img
          src={logo}
          alt="VaultedShield"
          style={{
            height: "56px",
            width: "auto",
          }}
        />
        <div>
          <div style={{ fontSize: "12px", letterSpacing: "1px", opacity: 0.7 }}>
            VAULTEDSHIELD PLATFORM
          </div>
          <div style={{ marginTop: "6px", fontSize: "22px", fontWeight: 700 }}>
            Family Continuity
          </div>
        </div>
      </div>
      <div style={{ marginTop: "12px", fontSize: "14px", opacity: 0.8, lineHeight: "1.5" }}>
        Modular household asset-intelligence shell with insurance continuity at the core.
      </div>
      <div
        style={{
          marginTop: "18px",
          padding: "14px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.06)",
          display: "grid",
          gap: "8px",
        }}
      >
        <div style={{ fontSize: "11px", opacity: 0.7, letterSpacing: "0.8px", textTransform: "uppercase" }}>
          Active Plan
        </div>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>{currentPlanLabel}</div>
        <button
          type="button"
          onClick={() => onUpgrade?.()}
          style={{
            textAlign: "left",
            border: "1px solid rgba(255,255,255,0.16)",
            cursor: "pointer",
            borderRadius: "10px",
            padding: "10px 12px",
            background: "rgba(255,255,255,0.04)",
            color: "#ffffff",
            fontWeight: 700,
          }}
        >
          View Plans
        </button>
      </div>

      <div style={{ marginTop: "28px", display: "grid", gap: "20px" }}>
        {APP_NAVIGATION.map((section) => (
          <div key={section.label}>
            <div style={{ fontSize: "11px", opacity: 0.6, letterSpacing: "0.8px", textTransform: "uppercase" }}>
              {section.label}
            </div>
            <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
              {section.items
                .filter((item) => hasTierAccess(currentTier, ROUTES[item.routeKey]?.minimumTier || "free"))
                .map((item) => {
                const route = ROUTES[item.routeKey];
                const active = currentPath === route.path;
                return (
                  <button
                    key={item.routeKey}
                    onClick={() => onNavigate(route.path)}
                    style={{
                      textAlign: "left",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: "12px",
                      padding: "12px 14px",
                      background: active ? "#1d4ed8" : "rgba(255,255,255,0.04)",
                      color: "#ffffff",
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
