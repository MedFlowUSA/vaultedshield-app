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
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryForm, setRecoveryForm] = useState({ password: "", confirmPassword: "" });

  useEffect(() => {
    if (landingState.status === "verification_complete" || landingState.status === "error") {
      clearAuthLandingStateFromUrl();
    }
  }, [landingState.status]);

  async function handleEnterPlatform() {
    if (!form.email.trim() || !form.password) {
      setRefreshError("Enter both your email address and password.");
      return;
    }
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

  async function handleForgotPassword() {
    setRefreshError("");
    setRefreshNote("");
    const result = await accessPortal?.requestPasswordReset?.(form.email);
    if (!result?.ok) {
      setRefreshError(result?.error || "Password recovery could not be started.");
      return;
    }
    setRefreshNote(result.message);
  }

  async function handlePasswordUpdate() {
    if (recoveryForm.password !== recoveryForm.confirmPassword) {
      setRefreshError("The passwords do not match.");
      return;
    }
    const result = await accessPortal?.updatePassword?.(recoveryForm.password);
    if (!result?.ok) {
      setRefreshError(result?.error || "The password could not be updated.");
      return;
    }
    clearAuthLandingStateFromUrl();
    setLandingState({ status: "idle", message: "" });
    setRefreshError("");
    setRefreshNote(result.message);
  }

  const showVerificationLanding = landingState.status === "verification_complete";
  const showPasswordRecovery = landingState.status === "password_recovery";

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
            title={showPasswordRecovery ? "Choose A New Password" : showVerificationLanding ? "Email Confirmed" : "Account Login"}
            subtitle={
              showPasswordRecovery
                ? "Use a new, unique password with at least 8 characters."
                : showVerificationLanding
                ? "Your VaultedShield account is verified. Open the protected workspace whenever you're ready."
                : "Enter the platform and continue where you left off."
            }
          >
            {showPasswordRecovery ? (
              <form onSubmit={(event) => { event.preventDefault(); handlePasswordUpdate(); }} style={{ display: "grid", gap: "14px" }}>
                <label style={{ display: "grid", gap: "6px", color: "#334155", fontWeight: 700 }}>
                  New password
                  <input
                    value={recoveryForm.password}
                    onChange={(event) => setRecoveryForm((current) => ({ ...current, password: event.target.value }))}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    style={authInputStyle()}
                  />
                </label>
                <label style={{ display: "grid", gap: "6px", color: "#334155", fontWeight: 700 }}>
                  Confirm new password
                  <input
                    value={recoveryForm.confirmPassword}
                    onChange={(event) => setRecoveryForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    style={authInputStyle()}
                  />
                </label>
                <button type="button" onClick={() => setShowPassword((current) => !current)} style={authActionStyle(false)}>
                  {showPassword ? "Hide passwords" : "Show passwords"}
                </button>
                <button type="submit" style={authActionStyle(true)}>Update Password</button>
                {refreshError ? <div role="alert" style={{ color: "#991b1b", fontSize: "14px" }}>{refreshError}</div> : null}
              </form>
            ) : showVerificationLanding ? (
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
                    Thanks for verifying your account request
                  </div>
                  <div style={{ color: "#334155", lineHeight: "1.7", fontSize: "14px" }}>
                    {accessPortal?.session?.email || form.email ? (
                      <>
                        The email address <strong>{accessPortal?.session?.email || form.email}</strong> has been verified for VaultedShield. Your protected workspace is ready for sign-in.
                      </>
                    ) : (
                      <>
                        Your VaultedShield account request has been verified. Continue to sign in and open your protected workspace.
                      </>
                    )}
                  </div>
                </div>

                <AuthSupportTiles
                  items={[
                    { label: "Verified Email", value: accessPortal?.session?.email || form.email || "Confirmed" },
                    { label: "Workspace", value: accessPortal?.session?.householdName || "VaultedShield Household" },
                    { label: "Next Step", value: accessPortal?.isAuthenticated ? "Open the workspace" : "Sign in securely" },
                  ]}
                />

                <div style={{ display: "grid", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (accessPortal?.isAuthenticated) {
                        onNavigate(returnPath || "/insurance");
                        return;
                      }
                      setLandingState({ status: "idle", message: "" });
                    }}
                    style={authActionStyle(true)}
                  >
                    {accessPortal?.isAuthenticated ? "Open Workspace" : "Continue To Login"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (accessPortal?.isAuthenticated) {
                        accessPortal?.signOut?.();
                      }
                      setLandingState({ status: "idle", message: "" });
                    }}
                    style={authActionStyle(false)}
                  >
                    {accessPortal?.isAuthenticated ? "Return To Login Form" : "Use A Different Account"}
                  </button>
                </div>

                {refreshNote ? <div style={{ color: "#166534", fontSize: "14px" }}>{refreshNote}</div> : null}
              </div>
            ) : (
              <form
                style={{ display: "grid", gap: "14px" }}
                onSubmit={(event) => { event.preventDefault(); handleEnterPlatform(); }}
              >
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
                  <label style={{ display: "grid", gap: "6px", color: "#334155", fontWeight: 700 }}>
                    Email address
                    <input
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      type="email"
                      autoComplete="email"
                      required
                      style={authInputStyle()}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px", color: "#334155", fontWeight: 700 }}>
                    Password
                    <input
                      value={form.password}
                      onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      style={authInputStyle()}
                    />
                  </label>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => setShowPassword((current) => !current)} style={authActionStyle(false)}>
                      {showPassword ? "Hide password" : "Show password"}
                    </button>
                    <button type="button" onClick={handleForgotPassword} style={authActionStyle(false)}>
                      Forgot password?
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={entering}
                    style={{
                      ...authActionStyle(true),
                      cursor: entering ? "progress" : "pointer",
                      opacity: entering ? 0.8 : 1,
                    }}
                  >
                    {entering ? "Opening Workspace..." : "Enter Platform"}
                  </button>
                  <button type="button" onClick={() => onNavigate("/signup")} style={authActionStyle(false)}>
                    Create Account
                  </button>
                  {refreshNote ? <div role="status" aria-live="polite" style={{ color: "#166534", fontSize: "14px" }}>{refreshNote}</div> : null}
                  {refreshError ? <div role="alert" style={{ color: "#991b1b", fontSize: "14px" }}>{refreshError}</div> : null}
              </form>
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
