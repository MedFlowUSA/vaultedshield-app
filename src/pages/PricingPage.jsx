import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import { ACCESS_TIERS } from "../lib/auth/accessPortal";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

function cardStyle(selected = false) {
  return {
    padding: "22px",
    borderRadius: "18px",
    border: selected ? "1px solid #93c5fd" : "1px solid rgba(148, 163, 184, 0.18)",
    background: selected ? "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)" : "#ffffff",
    display: "grid",
    gap: "14px",
    minWidth: 0,
    alignContent: "start",
  };
}

export default function PricingPage({
  onNavigate,
  accessPortal,
  lockedRouteTitle = "",
  returnPath = "/insurance",
}) {
  const currentTier = accessPortal?.currentTier || "free";
  const { isMobile, isTablet } = useResponsiveLayout();
  const pagePadding = isMobile ? "0 12px 28px" : isTablet ? "0 18px 36px" : "0 20px 48px";
  const pageMargin = isMobile ? "20px auto 0" : "56px auto 0";
  const planColumns = isMobile ? "1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))";
  const cardPadding = isMobile ? "18px 16px" : "22px";
  const actionRowDirection = isMobile ? "column" : "row";
  const resolvedReturnPath = returnPath && returnPath !== "/pricing" ? returnPath : "/insurance";

  return (
    <div style={{ maxWidth: "1120px", margin: pageMargin, padding: pagePadding, display: "grid", gap: isMobile ? "18px" : "22px" }}>
      <PageHeader
        eyebrow="VaultedShield Access"
        title="Plans And Tool Tiers"
        description={
          lockedRouteTitle
            ? `${lockedRouteTitle} is part of a higher access tier. Choose the level that fits how deeply you want to run household intelligence.`
            : "Start free, then unlock deeper intelligence, reporting, and continuity workflows as the platform grows."
        }
      />

      <SectionCard
        title="Access Strategy"
        subtitle="The free tier stays useful for discovery. Higher tiers unlock practical review workflows instead of cosmetic add-ons."
      >
        <div style={{ display: "grid", gridTemplateColumns: planColumns, gap: isMobile ? "12px" : "16px" }}>
          {Object.values(ACCESS_TIERS).map((tier) => {
            const selected = currentTier === tier.key;
            return (
              <div key={tier.key} style={{ ...cardStyle(selected), padding: cardPadding }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {tier.label}
                  </div>
                  <div style={{ fontSize: isMobile ? "24px" : "28px", fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>
                    {tier.priceLabel}
                  </div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{tier.tagline}</div>
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#0f172a", lineHeight: "1.6", minWidth: 0 }}>
                  {tier.features.map((feature) => (
                    <li key={feature} style={{ wordBreak: "break-word" }}>{feature}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    accessPortal?.upgradePlan(tier.key);
                    onNavigate?.(resolvedReturnPath);
                  }}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: selected ? "1px solid #93c5fd" : "none",
                    background: selected ? "#eff6ff" : "#0f172a",
                    color: selected ? "#1d4ed8" : "#ffffff",
                    cursor: "pointer",
                    fontWeight: 700,
                    width: "100%",
                    minHeight: isMobile ? "46px" : "44px",
                  }}
                >
                  {selected ? "Current Plan" : `Choose ${tier.label}`}
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", flexDirection: actionRowDirection }}>
        <button
          type="button"
          onClick={() => onNavigate?.(resolvedReturnPath)}
          style={{
            padding: "12px 16px",
            borderRadius: "12px",
            border: "none",
            background: "#0f172a",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
            width: isMobile ? "100%" : "auto",
            minHeight: isMobile ? "46px" : "44px",
          }}
        >
          Continue To Workspace
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("/signup")}
          style={{
            padding: "12px 16px",
            borderRadius: "12px",
            border: "1px solid #cbd5e1",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 700,
            width: isMobile ? "100%" : "auto",
            minHeight: isMobile ? "46px" : "44px",
          }}
        >
          Create New Account
        </button>
      </div>
    </div>
  );
}
