import { useEffect, useState } from "react";
import AuthPortalLayout, { AuthPrimaryShell, AuthSupportTiles } from "../components/auth/AuthPortalLayout";
import { authActionStyle, authInputStyle } from "../components/auth/authPortalStyles";
import { clearAuthLandingStateFromUrl, getAuthLandingState } from "../lib/auth/authLandingState";
import { consumeAccountDeletionFlash } from "../lib/auth/requestAccountDeletion";

export default function AuthLoginPage({ onNavigate, accessPortal, returnPath = "/insurance" }) {
  const initialLandingState = getAuthLandingState();
  const [entering, setEntering] = useState(false);
  const [refreshNote, setRefreshNote] = useState(
    () => consumeAccountDeletionFlash() || (initialLandingState.status === "verification_complete" ? initialLandingState.message : "")
  );
  const [refreshError, setRefreshError] = useState(() => (initialLandingState.status === "error" ? initialLandingState.message : ""));
  const [landingState, setLandingState] = useState(initialLandingState);
  const [form, setForm] = useState({
    email: accessPortal?.session?.email || "",
    password: "",
  });

  useEffect(() => {
    if (landingState.status === "verification_complete" || landingState.status === "error") {
      clearAuthLandingStateFromUrl();
    }
  }, [landingState.status]);

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

  const showVerificationLanding =
    landingState.status === "verification_complete" && Boolean(accessPortal?.isAuthenticated);

  return (
    <AuthPortalLayout
      eyebrow="VaultedShield Access"
      title="Login"
      description="Securely enter the platform and return to your authenticated workspace. This portal explains what unlocks after sign-in without loading a live household record first."
      previewTitle="What unlocks after sign in"
      previewSubtitle="A quick preview of what becomes available once you enter the authenticated workspace."
      left={
        <>
          <AuthPrimaryShell
            title={showVerificationLanding ? "Email Confirmed" : "Account Login"}
            subtitle={
              showVerificationLanding
                ? "Your VaultedShield account is verified. Open the protected workspace whenever you're ready."
                : "Enter the platform and continue where you left off."
            }
          >
            {showVerificationLanding ? (
              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "20px",
                    background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(224,242,254,0.86) 100%)",
                    border: "1px solid #bfdbfe",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1d4ed8" }}>
                    VaultedShield Verification Complete
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", lineHeight: "1.25" }}>
                    Your account is ready
                  </div>
                  <div style={{ color: "#334155", lineHeight: "1.7", fontSize: "14px" }}>
                    The email address <strong>{accessPortal?.session?.email || form.email || "for this account"}</strong> has been verified. Your protected household workspace is ready to open.
                  </div>
                </div>

                <AuthSupportTiles
                  items={[
                    { label: "Verified Email", value: accessPortal?.session?.email || form.email || "Confirmed" },
                    { label: "Workspace", value: accessPortal?.session?.householdName || "VaultedShield Household" },
                    { label: "Next Step", value: "Enter the platform securely" },
                  ]}
                />

                <div style={{ display: "grid", gap: "10px" }}>
                  <button
                    onClick={() => onNavigate(returnPath || "/insurance")}
                    style={authActionStyle(true)}
                  >
                    Open Workspace
                  </button>
                  <button
                    onClick={() => {
                      accessPortal?.signOut?.();
                      setLandingState({ status: "idle", message: "" });
                    }}
                    style={authActionStyle(false)}
                  >
                    Return To Login Form
                  </button>
                </div>

                {refreshNote ? <div style={{ color: "#166534", fontSize: "14px" }}>{refreshNote}</div> : null}
              </div>
            ) : (
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
            )}
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
