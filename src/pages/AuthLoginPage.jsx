import { useState } from "react";
import AccessValuePreview from "../components/auth/AccessValuePreview";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";

function inputStyle() {
  return { padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" };
}

function actionStyle(primary = false) {
  return {
    padding: "12px 16px",
    borderRadius: "10px",
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "#fff",
    color: primary ? "#fff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
  };
}

export default function AuthLoginPage({ onNavigate, accessPortal, returnPath = "/dashboard" }) {
  const [entering, setEntering] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [form, setForm] = useState({ email: "", password: "" });

  async function handleEnterPlatform() {
    const loginResult = await accessPortal?.signIn({
      email: form.email,
      password: form.password,
    });

    if (!loginResult?.ok) {
      setRefreshError(loginResult?.error || "Login could not be completed.");
      return;
    }

    setEntering(true);
    setRefreshError("");
    setRefreshNote("Login complete. Opening your workspace...");
    onNavigate(returnPath || "/dashboard");
    setEntering(false);
  }

  function handleFreeAccess() {
    accessPortal?.continueWithFreeAccess();
    onNavigate(returnPath || "/dashboard");
  }

  return (
    <div style={{ maxWidth: "1180px", margin: "64px auto", padding: "0 20px", display: "grid", gap: "22px" }}>
      <PageHeader
        eyebrow="VaultedShield Access"
        title="Login"
        description="Securely enter the platform and continue working inside your existing VaultedShield access tier. Even before login, you can preview how VaultedShield prioritizes the next best move."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "18px", alignItems: "start" }}>
        <SectionCard
          title="Account Login"
          subtitle="Enter the platform and continue where you left off without needing a storage reset."
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email address"
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
              onClick={handleEnterPlatform}
              disabled={entering}
              style={{
                ...actionStyle(true),
                cursor: entering ? "progress" : "pointer",
                opacity: entering ? 0.8 : 1,
              }}
            >
              {entering ? "Opening Workspace..." : "Enter Platform"}
            </button>
            <button onClick={() => onNavigate("/signup")} style={actionStyle(false)}>
              Create Account
            </button>
            <button onClick={handleFreeAccess} style={actionStyle(false)}>
              Continue With Free Access
            </button>
            {refreshNote ? <div style={{ color: "#166534", fontSize: "14px" }}>{refreshNote}</div> : null}
            {refreshError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{refreshError}</div> : null}
          </div>
        </SectionCard>

        <AccessValuePreview
          title="See the value before you sign in"
          subtitle="VaultedShield works best when it tells you what matters first. This preview shows the score, priorities, and advisor flow new households grow into."
        />
      </div>
    </div>
  );
}
