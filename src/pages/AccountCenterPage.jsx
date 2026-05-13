import { useState } from "react";
import {
  ACCOUNT_DELETION_SCOPE_ITEMS,
  requiresDeletionReauth,
} from "../lib/auth/requestAccountDeletion";

function actionButtonStyle(primary = false, destructive = false) {
  if (destructive) {
    return {
      padding: "12px 16px",
      borderRadius: "12px",
      border: "1px solid #fecaca",
      background: "#fef2f2",
      color: "#991b1b",
      cursor: "pointer",
      fontWeight: 700,
    };
  }

  return {
    padding: "12px 16px",
    borderRadius: "12px",
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
  };
}

const EMPTY_DELETE_STATE = {
  open: false,
  step: "confirm",
  acknowledged: false,
  password: "",
  error: "",
  loading: false,
};

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "info") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
  if (tone === "alert") return { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" };
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

function surfaceCard(extra = {}) {
  return {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid rgba(226,232,240,0.92)",
    boxShadow: "0 4px 16px rgba(15,23,42,0.05)",
    ...extra,
  };
}

function overlayStyle() {
  return {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.56)",
    display: "grid",
    placeItems: "center",
    padding: "20px",
    zIndex: 60,
  };
}

function modalStyle() {
  return {
    width: "min(560px, 100%)",
    background: "#ffffff",
    borderRadius: "24px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.22)",
    padding: "24px",
    display: "grid",
    gap: "16px",
  };
}

export default function AccountCenterPage({ onNavigate, accessPortal }) {
  const [deleteState, setDeleteState] = useState(EMPTY_DELETE_STATE);
  const [surfaceError, setSurfaceError] = useState("");

  const session = accessPortal?.session || {};
  const authMode = accessPortal?.authMode || "local";
  const isSupabaseAccount = authMode === "supabase";
  const needsReauth = isSupabaseAccount && requiresDeletionReauth(session);
  const accountHeroScore = Math.round(
    Math.max(
      34,
      Math.min(
        92,
        38 +
          (session.email ? 16 : 0) +
          (session.householdName ? 12 : 0) +
          (accessPortal?.currentPlan?.label ? 12 : 0) +
          (isSupabaseAccount ? 10 : 6)
      )
    )
  );
  const accountHeroTone =
    accountHeroScore >= 80 ? "good" : accountHeroScore >= 60 ? "info" : accountHeroScore >= 44 ? "warning" : "alert";
  const accountHeroGlanceItems = [
    { label: "Email", value: session.email || "Signed out" },
    { label: "Household", value: session.householdName || "Working Household" },
    { label: "Plan", value: accessPortal?.currentPlan?.label || "Free" },
    { label: "Auth Mode", value: isSupabaseAccount ? "Supabase" : "Local" },
  ];

  function openDeleteModal() {
    setSurfaceError("");
    setDeleteState({
      ...EMPTY_DELETE_STATE,
      open: true,
    });
  }

  function closeDeleteModal() {
    if (deleteState.loading) return;
    setDeleteState(EMPTY_DELETE_STATE);
  }

  async function submitDelete(options = {}) {
    if (!accessPortal?.deleteAccount || deleteState.loading) return;

    setDeleteState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    const result = await accessPortal.deleteAccount(options);
    if (!result?.ok) {
      if (result?.status === "reauth_required" && isSupabaseAccount) {
        setDeleteState((current) => ({
          ...current,
          loading: false,
          step: "reauth",
          error: result.message || "For security, re-enter your password before deleting your account.",
        }));
        return;
      }

      setDeleteState((current) => ({
        ...current,
        loading: false,
        error: result?.message || result?.error || "Account deletion could not be completed.",
      }));
      return;
    }

    setDeleteState(EMPTY_DELETE_STATE);
    onNavigate?.("/login");
  }

  async function handleDeleteContinue() {
    if (deleteState.loading) return;
    if (needsReauth) {
      setDeleteState((current) => ({
        ...current,
        step: "reauth",
        error: "",
      }));
      return;
    }
    await submitDelete();
  }

  async function handleReauthAndDelete() {
    if (!accessPortal?.reauthenticate || deleteState.loading) return;

    setDeleteState((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    const reauthResult = await accessPortal.reauthenticate({
      password: deleteState.password,
    });

    if (!reauthResult?.ok) {
      setDeleteState((current) => ({
        ...current,
        loading: false,
        error: reauthResult?.error || "We couldn't verify your password. Please try again.",
      }));
      return;
    }

    await submitDelete({ skipRecentAuthCheck: true });
  }

  async function handleSignOut() {
    setSurfaceError("");
    try {
      await accessPortal?.signOut?.();
      onNavigate?.("/login");
    } catch {
      setSurfaceError("Sign out could not be completed right now.");
    }
  }

  const actionTiles = [
    {
      kicker: "Simple Read",
      title: session.email ? "Account looks reachable" : "Account needs sign-in context",
      detail: "Legal links, account controls, and the active workspace details are grouped here without forcing the technical or compliance details first.",
      metric: accessPortal?.currentPlan?.label || "Free plan",
      tone: accountHeroTone,
      statusLabel: "Simple Read",
      actionLabel: "Open Privacy Policy",
      onAction: () => onNavigate?.("/privacy-policy"),
    },
    {
      kicker: "Best First Step",
      title: "Review the account control path",
      detail: "Make sure sign-out and permanent deletion are understandable before you need them in a real household handoff.",
      metric: needsReauth ? "reauth needed" : "controls ready",
      tone: "warning",
      statusLabel: "Guided Focus",
      actionLabel: "Open Controls",
      onAction: () => document.querySelector('[data-account-controls="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
    },
    {
      kicker: "What Can Wait",
      title: "Store and compliance polish can come after the core controls",
      detail: "The most important work is still making the account actions understandable and safe. Release-detail cleanup can follow.",
      metric: isSupabaseAccount ? "managed auth" : "local auth",
      tone: "info",
      statusLabel: "Building",
      actionLabel: "See Notes",
      onAction: () => document.querySelector('[data-store-readiness="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
    },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
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
              Account
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>Account Center</div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>
              {session.email
                ? "Your session details, legal links, and account controls are available in one place."
                : "This surface is ready, but the account still needs an active signed-in session to feel complete."}
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
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#94a3b8" }}>{accountHeroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>account</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {accountHeroGlanceItems.map((item) => (
            <div key={item.label} style={{ padding: "10px 14px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: "11px", opacity: 0.55, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "2px", wordBreak: "break-all" }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onNavigate?.("/privacy-policy")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#1d4ed8", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/terms-of-service")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Terms Of Service
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {actionTiles.map((tile) => (
          <div
            key={tile.kicker}
            style={{ padding: "20px", borderRadius: "18px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "12px", alignContent: "start" }}
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

      <div style={{ display: "grid", gap: "18px" }}>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Legal</div>
            <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>These links should remain reachable in the app and in store metadata.</div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => onNavigate?.("/privacy-policy")} style={actionButtonStyle()}>
              Open Privacy Policy
            </button>
            <button type="button" onClick={() => onNavigate?.("/terms-of-service")} style={actionButtonStyle()}>
              Open Terms of Service
            </button>
          </div>
          <div style={{ color: "#475569", lineHeight: "1.75" }}>
            The current privacy page still reads like beta legal copy and should be replaced with reviewed production language before store submission.
          </div>
        </div>

        <div data-account-controls="true" style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Account Controls</div>
            <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Users can request permanent deletion directly in-app without contacting support.</div>
          </div>
          <div style={{ display: "grid", gap: "14px" }}>
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "16px",
                background: isSupabaseAccount ? "#fff7ed" : "#f8fafc",
                border: isSupabaseAccount ? "1px solid #fed7aa" : "1px solid #e2e8f0",
                color: isSupabaseAccount ? "#9a3412" : "#475569",
                lineHeight: "1.75",
              }}
            >
              {isSupabaseAccount
                ? "Delete Account permanently removes your VaultedShield login, your owned household workspace data, and your uploaded policy intelligence. Some records may be retained only where legally required."
                : "Local sandbox accounts can be deleted directly from this device for demo and development use."}
            </div>

            {surfaceError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{surfaceError}</div> : null}

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" onClick={handleSignOut} style={actionButtonStyle()}>
                Sign Out
              </button>

              <button type="button" onClick={openDeleteModal} style={actionButtonStyle(false, true)}>
                {isSupabaseAccount ? "Delete Account" : "Delete Local Account"}
              </button>
            </div>
          </div>
        </div>

        <div data-store-readiness="true" style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Store Readiness Notes</div>
            <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Highest-signal account and compliance items still open.</div>
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
            <li>Native iOS and Android project folders now exist, but signing and archive validation still need a native release pass.</li>
            <li>Camera usage text and manifest coverage are now started, but the final permission review still needs to be completed against the shipped feature set.</li>
            <li>Store privacy disclosures and data safety answers still need to be aligned with real backend behavior.</li>
            <li>Release signing, screenshots, icons, and review-access instructions still need a native submission pass.</li>
          </ul>
        </div>
      </div>

      {deleteState.open ? (
        <div style={overlayStyle()}>
          <div style={modalStyle()}>
            <div>
              <div style={{ fontSize: "12px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#b91c1c", fontWeight: 700 }}>
                Permanent Deletion
              </div>
              <div style={{ marginTop: "6px", fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>
                {deleteState.step === "reauth" ? "Verify your password" : "Delete your account"}
              </div>
            </div>

            {deleteState.step === "confirm" ? (
              <>
                <div style={{ color: "#475569", lineHeight: "1.75" }}>
                  This action is permanent. It removes your account access and the data VaultedShield treats as owned by your household account.
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  {ACCOUNT_DELETION_SCOPE_ITEMS.map((item) => (
                    <div
                      key={item.title}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "16px",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                      <div style={{ marginTop: "4px", color: "#475569", lineHeight: "1.65", fontSize: "14px" }}>
                        {item.description}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ color: "#64748b", lineHeight: "1.7", fontSize: "14px" }}>
                  Some records may be retained only where law, security, or fraud-prevention obligations require it.
                </div>

                {needsReauth && isSupabaseAccount ? (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "14px",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      color: "#1d4ed8",
                      lineHeight: "1.7",
                      fontSize: "14px",
                    }}
                  >
                    Your session is no longer recent enough for a destructive action. We will ask for your password before finishing deletion.
                  </div>
                ) : null}

                <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", color: "#334155", lineHeight: "1.6" }}>
                  <input
                    type="checkbox"
                    checked={deleteState.acknowledged}
                    onChange={(event) =>
                      setDeleteState((current) => ({
                        ...current,
                        acknowledged: event.target.checked,
                      }))
                    }
                    disabled={deleteState.loading}
                    style={{ marginTop: "4px" }}
                  />
                  <span>I understand this permanently deletes my account and owned household data.</span>
                </label>

                {deleteState.error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{deleteState.error}</div> : null}

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" onClick={closeDeleteModal} style={actionButtonStyle()} disabled={deleteState.loading}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteContinue}
                    style={actionButtonStyle(false, true)}
                    disabled={!deleteState.acknowledged || deleteState.loading}
                  >
                    {deleteState.loading ? "Deleting..." : needsReauth ? "Continue to Verification" : "Confirm Delete"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ color: "#475569", lineHeight: "1.75" }}>
                  Re-enter your current password to confirm this destructive action. After the deletion request succeeds, you will be signed out immediately.
                </div>

                <input
                  type="password"
                  value={deleteState.password}
                  onChange={(event) =>
                    setDeleteState((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  placeholder="Current password"
                  disabled={deleteState.loading}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "14px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                    fontSize: "15px",
                  }}
                />

                {deleteState.error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{deleteState.error}</div> : null}

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteState((current) => ({
                        ...current,
                        step: "confirm",
                        error: "",
                        loading: false,
                      }))
                    }
                    style={actionButtonStyle()}
                    disabled={deleteState.loading}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleReauthAndDelete}
                    style={actionButtonStyle(false, true)}
                    disabled={!deleteState.password || deleteState.loading}
                  >
                    {deleteState.loading ? "Verifying..." : "Verify & Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
