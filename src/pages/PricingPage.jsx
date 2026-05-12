import {
  FriendlyActionTile,
  FriendlyPageHero,
} from "../components/shared/FriendlyIntelligenceUI";
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
  const tierOrder = Object.values(ACCESS_TIERS);
  const currentTierConfig = tierOrder.find((tier) => tier.key === currentTier) || tierOrder[0];
  const tierProgress = currentTier === "professional" ? 92 : currentTier === "essential" ? 72 : 44;
  const tierTone = currentTier === "professional" ? "good" : currentTier === "essential" ? "info" : "warning";

  return (
    <div style={{ maxWidth: "1120px", margin: pageMargin, padding: pagePadding, display: "grid", gap: isMobile ? "18px" : "22px" }}>
      <FriendlyPageHero
        eyebrow="VaultedShield Access"
        sectionTitle="Plans And Tool Tiers"
        headline={lockedRouteTitle ? `${lockedRouteTitle} needs a higher tier` : "Choose the access level that fits your household work"}
        summary={
          lockedRouteTitle
            ? `${lockedRouteTitle} is part of a higher access tier. Choose the level that fits how deeply you want to run household intelligence.`
            : "Start free, then unlock deeper intelligence, reporting, and continuity workflows as the platform grows."
        }
        transition="The free tier stays useful for discovery. Higher tiers unlock deeper workflows, stronger review tooling, and more complete household operating coverage."
        actions={[
          {
            label: "View Plan Options",
            onClick: () => onNavigate?.("/pricing"),
            kind: "primary",
          },
          {
            label: "Continue To Workspace",
            onClick: () => onNavigate?.(resolvedReturnPath),
          },
          {
            label: "Create New Account",
            onClick: () => onNavigate?.("/signup"),
          },
        ]}
        score={tierProgress}
        scoreTone={tierTone}
        scoreSubtitle="access"
        scoreIconLabel="tier"
        asideHeadline={currentTierConfig?.label || "Free"}
        asideSummary={
          currentTier === "professional"
            ? "You already have the deepest access tier, including the broadest household intelligence and workflow coverage."
            : currentTier === "essential"
              ? "You have the guided middle tier. Upgrade only if you need wider household coverage and deeper operating workflows."
              : "Free stays useful for early exploration. Upgrade when you want deeper review workflows and broader module access."
        }
        glanceEyebrow="At A Glance"
        glanceItems={[
          { label: "Current tier", value: currentTierConfig?.label || "Free" },
          { label: "Return path", value: lockedRouteTitle || "Main workspace" },
          { label: "Best next move", value: lockedRouteTitle ? "Choose a plan" : "Keep exploring" },
          { label: "Technical depth", value: "Unlocked by tier" },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: planColumns, gap: isMobile ? "12px" : "14px" }}>
        <FriendlyActionTile
          kicker="Current Access"
          title={`${currentTierConfig?.label || "Free"} tier is active`}
          detail="This is the current access level connected to your account, and it controls which deeper household workflows are available."
          metric={currentTierConfig?.priceLabel || "$0"}
          tone={tierTone}
          statusLabel={currentTier === "professional" ? "Well Supported" : "Simple Read"}
          actionLabel="See Plans"
          onAction={() => onNavigate?.("/pricing")}
        />
        <FriendlyActionTile
          kicker="When To Upgrade"
          title={lockedRouteTitle ? `Unlock ${lockedRouteTitle}` : "Upgrade only when the workflow needs it"}
          detail="Higher tiers are meant to unlock practical review depth, not cosmetic extras, so the choice stays tied to how much household complexity you want to run."
          metric={lockedRouteTitle ? "Targeted unlock" : "Guided expansion"}
          tone={lockedRouteTitle ? "warning" : "neutral"}
          statusLabel={lockedRouteTitle ? "Needs Review" : "Guided Focus"}
          actionLabel="Compare Tiers"
          onAction={() => onNavigate?.("/pricing")}
        />
        <FriendlyActionTile
          kicker="Continue"
          title="Return to the working surface"
          detail="If you already know the right tier, you can go straight back into the product and keep moving."
          metric="No dead end"
          tone="good"
          statusLabel="Next Step"
          actionLabel="Continue"
          onAction={() => onNavigate?.(resolvedReturnPath)}
        />
      </div>

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
