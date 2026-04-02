import { useEffect, useState } from "react";
import AccessValuePreview from "../components/auth/AccessValuePreview";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import { ACCESS_TIERS } from "../lib/auth/accessPortal";

function inputStyle() {
  return { padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" };
}

export default function AuthSignupPage({ onNavigate, accessPortal, returnPath = "/dashboard" }) {
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
    <div style={{ maxWidth: "1120px", margin: "64px auto", padding: "0 20px", display: "grid", gap: "22px" }}>
      <PageHeader
        eyebrow="Household Setup"
        title="Create Platform Access"
        description="Start free, then move into deeper review and continuity tiers as household usage grows. Before you create the account, you can preview the score, priorities, and advisor guidance the platform is built around."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "18px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "18px" }}>
        <SectionCard title="Create Account" subtitle="This access layer is local for now, but it is structured to evolve into full authentication and billing later.">
          <div style={{ display: "grid", gap: "12px" }}>
            <input
              value={form.householdName}
              onChange={(event) => setForm((current) => ({ ...current, householdName: event.target.value }))}
              placeholder="Household name"
              style={inputStyle()}
            />
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Primary email"
              style={inputStyle()}
            />
            <input
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Password"
              type="password"
              style={inputStyle()}
            />
            <button
              onClick={handleCreateAccount}
              disabled={submitting || retryCountdown > 0}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
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
              style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}
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
        </SectionCard>

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
                    borderRadius: "16px",
                    border: selected ? "1px solid #93c5fd" : "1px solid rgba(148, 163, 184, 0.18)",
                    background: selected ? "#eff6ff" : "#ffffff",
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
        </div>

        <AccessValuePreview
          title="What your household workspace grows into"
          subtitle="This sample shows how VaultedShield turns documents, access records, and asset intelligence into priorities you can act on."
        />
      </div>
    </div>
  );
}
