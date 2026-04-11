import { useState } from "react";
import AuthPortalLayout, { AuthPrimaryShell, AuthSupportTiles } from "../components/auth/AuthPortalLayout";
import { authActionStyle, authInputStyle } from "../components/auth/authPortalStyles";
import { consumeAccountDeletionFlash } from "../lib/auth/requestAccountDeletion";

export default function AuthLoginPage({ onNavigate, accessPortal, returnPath = "/insurance" }) {
  const [entering, setEntering] = useState(false);
  const [refreshNote, setRefreshNote] = useState(() => consumeAccountDeletionFlash());
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

  return (
    <AuthPortalLayout
      eyebrow="VaultedShield Access"
      title="Login"
      description="Securely enter the platform and return to your authenticated workspace. This portal explains what unlocks after sign-in without loading a live household record first."
      previewTitle="What unlocks after sign in"
      previewSubtitle="A quick preview of what becomes available once you enter the authenticated workspace."
      left={
        <>
          <AuthPrimaryShell title="Account Login" subtitle="Enter the platform and continue where you left off.">
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
                  Sign in to open your protected workspace, policy review flow, and cross-module operating queue.
                </div>
                <input
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email address"
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
                  onClick={handleEnterPlatform}
                  disabled={entering}
                  style={{
                    ...authActionStyle(true),
                    cursor: entering ? "progress" : "pointer",
                    opacity: entering ? 0.8 : 1,
                  }}
                >
                  {entering ? "Opening Workspace..." : "Enter Platform"}
                </button>
                <button onClick={() => onNavigate("/signup")} style={authActionStyle(false)}>
                  Create Account
                </button>
                {refreshNote ? <div style={{ color: "#166534", fontSize: "14px" }}>{refreshNote}</div> : null}
                {refreshError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{refreshError}</div> : null}
            </div>
          </AuthPrimaryShell>

          <AuthSupportTiles
            items={[
              { label: "Protected Workspace", value: "Enabled after sign-in" },
              { label: "Live Household Data", value: "Hidden before auth" },
              { label: "Cross-Module Review", value: "Available inside platform" },
            ]}
          />
        </>
      }
    />
  );
}
