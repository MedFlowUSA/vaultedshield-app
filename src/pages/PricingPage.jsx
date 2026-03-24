import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import { ACCESS_TIERS } from "../lib/auth/accessPortal";

function cardStyle(selected = false) {
  return {
    padding: "22px",
    borderRadius: "18px",
    border: selected ? "1px solid #93c5fd" : "1px solid rgba(148, 163, 184, 0.18)",
    background: selected ? "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)" : "#ffffff",
    display: "grid",
    gap: "14px",
  };
}

export default function PricingPage({
  onNavigate,
  accessPortal,
  lockedRouteTitle = "",
  returnPath = "/dashboard",
}) {
  const currentTier = accessPortal?.currentTier || "free";

  return (
    <div style={{ maxWidth: "1120px", margin: "56px auto", padding: "0 20px", display: "grid", gap: "22px" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "16px" }}>
          {Object.values(ACCESS_TIERS).map((tier) => {
            const selected = currentTier === tier.key;
            return (
              <div key={tier.key} style={cardStyle(selected)}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {tier.label}
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>{tier.priceLabel}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{tier.tagline}</div>
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#0f172a" }}>
                  {tier.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    accessPortal?.upgradePlan(tier.key);
                    onNavigate?.(returnPath || "/dashboard");
                  }}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: selected ? "1px solid #93c5fd" : "none",
                    background: selected ? "#eff6ff" : "#0f172a",
                    color: selected ? "#1d4ed8" : "#ffffff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {selected ? "Current Plan" : `Choose ${tier.label}`}
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onNavigate?.(returnPath || "/dashboard")}
          style={{
            padding: "12px 16px",
            borderRadius: "12px",
            border: "none",
            background: "#0f172a",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Continue To Dashboard
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
          }}
        >
          Create New Account
        </button>
      </div>
    </div>
  );
}
