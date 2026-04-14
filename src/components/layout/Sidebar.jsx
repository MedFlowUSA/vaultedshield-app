import { APP_NAVIGATION, ROUTES } from "../../lib/navigation/routes";
import logo from "../../assets/vaultedshield-logo.png";
import { hasTierAccess } from "../../lib/auth/accessPortal";

export default function Sidebar({
  currentPath,
  onNavigate,
  currentTier = "free",
  currentPlanLabel = "Free",
  onUpgrade,
  isCompact = false,
  isOpen = true,
  onClose,
}) {
  const isDrawer = isCompact;
  const drawerTopInset = "max(12px, calc(env(safe-area-inset-top, 0px) + 8px))";
  const drawerBottomInset = "max(12px, calc(env(safe-area-inset-bottom, 0px) + 8px))";

  return (
    <aside
      style={{
        width: isDrawer ? "min(78vw, 292px)" : "260px",
        maxWidth: "100%",
        background: "#0f172a",
        color: "#e2e8f0",
        minHeight: isDrawer ? "auto" : "100vh",
        height: isDrawer ? `calc(100dvh - ${drawerTopInset} - ${drawerBottomInset})` : "auto",
        maxHeight: isDrawer ? "min(78dvh, 680px)" : "none",
        padding: isDrawer
          ? "16px 14px 18px"
          : "28px 18px",
        boxSizing: "border-box",
        position: isDrawer ? "fixed" : "sticky",
        top: isDrawer ? drawerTopInset : 0,
        left: isDrawer ? "12px" : 0,
        bottom: isDrawer ? "auto" : "auto",
        zIndex: isDrawer ? 80 : "auto",
        transform: isDrawer ? (isOpen ? "translateX(0)" : "translateX(-100%)") : "none",
        transition: isDrawer ? "transform 220ms ease, box-shadow 220ms ease" : "none",
        overflowY: "auto",
        overflowX: "hidden",
        borderRadius: isDrawer ? "22px" : 0,
        border: isDrawer ? "1px solid rgba(255,255,255,0.08)" : "none",
        boxShadow: isDrawer ? "0 24px 48px rgba(2, 6, 23, 0.34)" : "none",
        overscrollBehavior: isDrawer ? "contain" : "auto",
        WebkitOverflowScrolling: isDrawer ? "touch" : "auto",
        willChange: isDrawer ? "transform" : "auto",
      }}
      aria-hidden={isDrawer ? !isOpen : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <img
            src={logo}
            alt="VaultedShield"
            style={{
              height: isDrawer ? "34px" : "56px",
              width: "auto",
              flex: "0 0 auto",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: isDrawer ? "10px" : "12px", letterSpacing: "1px", opacity: 0.7 }}>
              {isDrawer ? "VAULTEDSHIELD" : "VAULTEDSHIELD PLATFORM"}
            </div>
            <div style={{ marginTop: isDrawer ? "4px" : "6px", fontSize: isDrawer ? "17px" : "22px", fontWeight: 700 }}>
              {isDrawer ? "Navigation" : "Family Continuity"}
            </div>
          </div>
        </div>
        {isDrawer ? (
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Close navigation"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)",
              color: "#ffffff",
              borderRadius: "12px",
              padding: "9px 11px",
              fontWeight: 700,
              cursor: "pointer",
              flex: "0 0 auto",
              minHeight: "44px",
            }}
          >
            Close
          </button>
        ) : null}
      </div>
      <div style={{ marginTop: isDrawer ? "10px" : "12px", fontSize: isDrawer ? "12px" : "14px", opacity: 0.8, lineHeight: "1.5" }}>
        {isDrawer
          ? "Quick access to the household operating system."
          : "Modular household asset-intelligence shell with insurance continuity at the core."}
      </div>
      <div
        style={{
          marginTop: isDrawer ? "14px" : "18px",
          padding: isDrawer ? "12px" : "14px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.06)",
          display: "grid",
          gap: isDrawer ? "6px" : "8px",
        }}
      >
        <div style={{ fontSize: "11px", opacity: 0.7, letterSpacing: "0.8px", textTransform: "uppercase" }}>
          Active Plan
        </div>
        <div style={{ fontSize: isDrawer ? "16px" : "18px", fontWeight: 700 }}>{currentPlanLabel}</div>
        <button
          type="button"
          onClick={() => onUpgrade?.()}
          style={{
            textAlign: "left",
            border: "1px solid rgba(255,255,255,0.16)",
            cursor: "pointer",
            borderRadius: "10px",
            padding: isDrawer ? "9px 11px" : "10px 12px",
            background: "rgba(255,255,255,0.04)",
            color: "#ffffff",
            fontWeight: 700,
            minHeight: "44px",
          }}
        >
          View Plans
        </button>
      </div>

      <div
        style={{
          marginTop: isDrawer ? "18px" : "28px",
          display: "grid",
          gap: isDrawer ? "16px" : "20px",
          paddingBottom: isDrawer ? "8px" : 0,
        }}
      >
        {APP_NAVIGATION.map((section) => (
          <div key={section.label}>
            <div
              style={{
                fontSize: isDrawer ? "10px" : "11px",
                opacity: 0.6,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
              }}
            >
              {section.label}
            </div>
            <div style={{ marginTop: isDrawer ? "8px" : "10px", display: "grid", gap: isDrawer ? "6px" : "8px" }}>
              {section.items
                .filter((item) => hasTierAccess(currentTier, ROUTES[item.routeKey]?.minimumTier || "free"))
                .map((item) => {
                  const route = ROUTES[item.routeKey];
                  const active = currentPath === route.path;
                  return (
                    <button
                      key={item.routeKey}
                      onClick={() => {
                        onNavigate(route.path);
                        onClose?.();
                      }}
                      style={{
                        textAlign: "left",
                        border: "none",
                        cursor: "pointer",
                        borderRadius: "12px",
                        padding: isDrawer ? "10px 12px" : "12px 14px",
                        background: active ? "#1d4ed8" : "rgba(255,255,255,0.04)",
                        color: "#ffffff",
                        fontWeight: active ? 700 : 500,
                        minHeight: "44px",
                        fontSize: isDrawer ? "14px" : "15px",
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
