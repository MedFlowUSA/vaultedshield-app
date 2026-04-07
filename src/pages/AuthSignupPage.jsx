import { useEffect, useState } from "react";
import AuthPortalLayout, { AuthPrimaryShell } from "../components/auth/AuthPortalLayout";
import { authActionStyle, authInputStyle } from "../components/auth/authPortalStyles";
import SectionCard from "../components/shared/SectionCard";
import { ACCESS_TIERS } from "../lib/auth/accessPortal";

export default function AuthSignupPage({ onNavigate, accessPortal, returnPath = "/insurance" }) {
  const [form, setForm] = useState({
    householdName: "",
    email: "",
    password: "",
    tier: "free",
  });
  const [submitError, setSubmitError] = useState("");
  const [submitNote, setSubmitNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);

  useEffect(() => {
    if (retryCountdown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setRetryCountdown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryCountdown]);

  async function handleCreateAccount() {
    if (submitting || retryCountdown > 0) return;
    setSubmitError("");
    setSubmitNote("");
    setSubmitting(true);
    try {
      const result = await accessPortal?.signUp(form);
      if (result?.ok) {
        if (result.requiresEmailConfirmation) {
          setSubmitNote(result.message || "Account created. Confirm your email, then log in.");
          onNavigate("/login");
          return;
        }
        onNavigate(returnPath || "/dashboard");
        return;
      }
      if (result?.rateLimited && result?.retryAfterSeconds) {
        setRetryCountdown(result.retryAfterSeconds);
      }
      setSubmitError(result?.error || "Account creation could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPortalLayout
      eyebrow="Household Setup"
      title="Create Platform Access"
      description="Start free, then move into deeper review and continuity tiers as household usage grows. This setup portal explains the workflow without showing a live household record."
      previewTitle="What your household workspace grows into"
      previewSubtitle="A quick product overview of what becomes available once your household is authenticated."
      left={
        <>
          <AuthPrimaryShell
            title="Create Account"
            subtitle="Set up your household workspace and choose the access tier that fits your starting point."
          >
                <div style={{ display: "grid", gap: "14px" }}>
                  <div
                    style={{
                      padding: "16px 18px",
                      borderRadius: "18px",
                      background: "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(239,246,255,0.92) 100%)",
                      border: "1px solid #dbeafe",
                      color: "#334155",
                      lineHeight: "1.7",
                      fontSize: "14px",
                    }}
                  >
                    Create your account to unlock the protected workspace, review flow, and guided household operating system.
                  </div>
                  <input
                    value={form.householdName}
                    onChange={(event) => setForm((current) => ({ ...current, householdName: event.target.value }))}
                    placeholder="Household name"
                    style={authInputStyle()}
                  />
                  <input
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="Primary email"
                    style={authInputStyle()}
                  />
                  <input
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Password"
                    type="password"
                    style={authInputStyle()}
                  />
                  <button
                    onClick={handleCreateAccount}
                    disabled={submitting || retryCountdown > 0}
                    style={authActionStyle(true)}
                  >
                    {submitting
                      ? "Creating Account..."
                      : retryCountdown > 0
                        ? `Try Again In ${retryCountdown}s`
                        : "Create Account And Enter Platform"}
                  </button>
                  <button
                    onClick={() => onNavigate("/login")}
                    disabled={submitting}
                    style={authActionStyle(false)}
                  >
                    Back To Login
                  </button>
                  {retryCountdown > 0 ? (
                    <div style={{ color: "#92400e", fontSize: "14px" }}>
                      Email sending is temporarily cooling down. Retry in {retryCountdown} seconds.
                    </div>
                  ) : null}
                  {submitNote ? <div style={{ color: "#166534", fontSize: "14px" }}>{submitNote}</div> : null}
                  {submitError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{submitError}</div> : null}
                </div>
          </AuthPrimaryShell>

            <SectionCard title="Choose Your Starting Tier" subtitle="Free is the recommended starting point. Higher tiers unlock practical review depth as usage grows.">
              <div style={{ display: "grid", gap: "14px" }}>
                {Object.values(ACCESS_TIERS).map((tier) => {
                  const selected = form.tier === tier.key;
                  return (
                    <button
                      key={tier.key}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, tier: tier.key }))}
                      style={{
                        padding: "18px 20px",
                        borderRadius: "18px",
                        border: selected ? "1px solid #93c5fd" : "1px solid rgba(148, 163, 184, 0.18)",
                        background: selected
                          ? "linear-gradient(180deg, rgba(239,246,255,1) 0%, rgba(219,234,254,0.9) 100%)"
                          : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)",
                        boxShadow: selected ? "0 14px 28px rgba(59, 130, 246, 0.12)" : "0 8px 22px rgba(15, 23, 42, 0.04)",
                        cursor: "pointer",
                        textAlign: "left",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{tier.label}</div>
                        <div style={{ fontWeight: 700, color: selected ? "#1d4ed8" : "#475569" }}>{tier.priceLabel}</div>
                      </div>
                      <div style={{ color: "#475569", lineHeight: "1.7" }}>{tier.tagline}</div>
                      <div style={{ color: "#0f172a", fontSize: "13px" }}>{tier.features.join(" | ")}</div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>
        </>
      }
    />
  );
}
