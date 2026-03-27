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

  return (
    <aside
      style={{
        width: isDrawer ? "min(86vw, 320px)" : "260px",
        maxWidth: "100%",
        background: "#0f172a",
        color: "#e2e8f0",
        minHeight: isDrawer ? "100dvh" : "100vh",
        height: isDrawer ? "100dvh" : "auto",
        padding: isDrawer
          ? "max(22px, calc(env(safe-area-inset-top, 0px) + 12px)) 16px max(28px, calc(env(safe-area-inset-bottom, 0px) + 16px))"
          : "28px 18px",
        boxSizing: "border-box",
        position: isDrawer ? "fixed" : "sticky",
        top: 0,
        left: 0,
        bottom: isDrawer ? 0 : "auto",
        zIndex: isDrawer ? 80 : "auto",
        transform: isDrawer ? (isOpen ? "translateX(0)" : "translateX(-100%)") : "none",
        transition: isDrawer ? "transform 220ms ease, box-shadow 220ms ease" : "none",
        overflowY: "auto",
        overflowX: "hidden",
        boxShadow: isDrawer ? "0 24px 60px rgba(2, 6, 23, 0.42)" : "none",
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
              height: isDrawer ? "48px" : "56px",
              width: "auto",
              flex: "0 0 auto",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "12px", letterSpacing: "1px", opacity: 0.7 }}>
              VAULTEDSHIELD PLATFORM
            </div>
            <div style={{ marginTop: "6px", fontSize: isDrawer ? "20px" : "22px", fontWeight: 700 }}>
              Family Continuity
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
              padding: "10px 12px",
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
            minHeight: "44px",
          }}
        >
          View Plans
        </button>
      </div>

      <div style={{ marginTop: "28px", display: "grid", gap: "20px", paddingBottom: isDrawer ? "20px" : 0 }}>
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
                    onClick={() => {
                      onNavigate(route.path);
                      onClose?.();
                    }}
                    style={{
                      textAlign: "left",
                      border: "none",
                      cursor: "pointer",
                       borderRadius: "12px",
                       padding: "12px 14px",
                       background: active ? "#1d4ed8" : "rgba(255,255,255,0.04)",
                       color: "#ffffff",
                       fontWeight: active ? 700 : 500,
                       minHeight: "44px",
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
