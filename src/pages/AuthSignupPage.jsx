import { useState } from "react";
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

  async function handleCreateAccount() {
    setSubmitError("");
    setSubmitNote("");
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
    setSubmitError(result?.error || "Account creation could not be completed.");
  }

  return (
    <div style={{ maxWidth: "1120px", margin: "64px auto", padding: "0 20px", display: "grid", gap: "22px" }}>
      <PageHeader
        eyebrow="Household Setup"
        title="Create Platform Access"
        description="Start free, then move into deeper review and continuity tiers as household usage grows."
      />

      <div style={{ display: "grid", gridTemplateColumns: "0.92fr 1.08fr", gap: "18px" }}>
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
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              Create Account And Enter Platform
            </button>
            <button
              onClick={() => onNavigate("/login")}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              Back To Login
            </button>
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
    </div>
  );
}
