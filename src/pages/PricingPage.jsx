import { ACCESS_TIERS } from "../lib/auth/accessPortal";

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "info") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

function tierCardStyle(selected = false) {
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
  const resolvedReturnPath = returnPath && returnPath !== "/pricing" ? returnPath : "/insurance";
  const tierOrder = Object.values(ACCESS_TIERS);
  const currentTierConfig = tierOrder.find((tier) => tier.key === currentTier) || tierOrder[0];
  const tierProgress = currentTier === "professional" ? 92 : currentTier === "essential" ? 72 : 44;
  const tierTone = currentTier === "professional" ? "good" : currentTier === "essential" ? "info" : "warning";

  return (
    <div style={{ maxWidth: "1120px", margin: "56px auto 0", padding: "0 20px 48px", display: "grid", gap: "22px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              VaultedShield Access
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              {lockedRouteTitle ? `${lockedRouteTitle} needs a higher tier` : "Choose the access level that fits your household work"}
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>
              {lockedRouteTitle
                ? `${lockedRouteTitle} is part of a higher access tier. Choose the level that fits how deeply you want to run household intelligence.`
                : "Start free, then unlock deeper intelligence, reporting, and continuity workflows as the platform grows."}
            </div>
          </div>
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "18px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              display: "grid",
              gap: "4px",
              textAlign: "center",
              minWidth: "100px",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#94a3b8" }}>{tierProgress}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>access</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onNavigate?.(resolvedReturnPath)}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#1d4ed8", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Continue To Workspace
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/signup")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Create New Account
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Current Access",
            title: `${currentTierConfig?.label || "Free"} tier is active`,
            detail: "This is the current access level connected to your account, and it controls which deeper household workflows are available.",
            metric: currentTierConfig?.priceLabel || "$0",
            tone: tierTone,
            statusLabel: currentTier === "professional" ? "Well Supported" : "Simple Read",
            actionLabel: "See Plans",
            onAction: () => onNavigate?.("/pricing"),
          },
          {
            kicker: "When To Upgrade",
            title: lockedRouteTitle ? `Unlock ${lockedRouteTitle}` : "Upgrade only when the workflow needs it",
            detail: "Higher tiers are meant to unlock practical review depth, not cosmetic extras, so the choice stays tied to how much household complexity you want to run.",
            metric: lockedRouteTitle ? "Targeted unlock" : "Guided expansion",
            tone: lockedRouteTitle ? "warning" : "neutral",
            statusLabel: lockedRouteTitle ? "Needs Review" : "Guided Focus",
            actionLabel: "Compare Tiers",
            onAction: () => onNavigate?.("/pricing"),
          },
          {
            kicker: "Continue",
            title: "Return to the working surface",
            detail: "If you already know the right tier, you can go straight back into the product and keep moving.",
            metric: "No dead end",
            tone: "good",
            statusLabel: "Next Step",
            actionLabel: "Continue",
            onAction: () => onNavigate?.(resolvedReturnPath),
          },
        ].map((tile) => (
          <div
            key={tile.kicker}
            style={{
              padding: "20px",
              borderRadius: "18px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              display: "grid",
              gap: "12px",
              alignContent: "start",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{tile.kicker}</div>
              <div style={{ ...pillStyle(tile.tone), padding: "3px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>{tile.statusLabel}</div>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{tile.title}</div>
            <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{tile.detail}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>{tile.metric}</div>
            <button type="button" onClick={tile.onAction} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer", textAlign: "left" }}>
              {tile.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {/* Plan Tiers */}
      <div
        style={{
          padding: "24px 26px",
          borderRadius: "20px",
          border: "1px solid rgba(226,232,240,0.92)",
          background: "#ffffff",
          boxShadow: "0 4px 16px rgba(15,23,42,0.05)",
          display: "grid",
          gap: "18px",
        }}
      >
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Access Strategy</div>
          <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>The free tier stays useful for discovery. Higher tiers unlock practical review workflows instead of cosmetic add-ons.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          {Object.values(ACCESS_TIERS).map((tier) => {
            const selected = currentTier === tier.key;
            return (
              <div key={tier.key} style={tierCardStyle(selected)}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {tier.label}
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>
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
                    minHeight: "44px",
                  }}
                >
                  {selected ? "Current Plan" : `Choose ${tier.label}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onNavigate?.(resolvedReturnPath)}
          style={{ padding: "12px 16px", borderRadius: "12px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, minHeight: "44px" }}
        >
          Continue To Workspace
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("/signup")}
          style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700, minHeight: "44px" }}
        >
          Create New Account
        </button>
      </div>
    </div>
  );
}
