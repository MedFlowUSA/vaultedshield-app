import { useState } from "react";
import {
  FriendlyActionTile,
  FriendlyPageHero,
} from "../components/shared/FriendlyIntelligenceUI";
import SectionCard from "../components/shared/SectionCard";
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

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <FriendlyPageHero
        eyebrow="Account"
        sectionTitle="Account Center"
        headline="Keep the household account easy to understand before anyone needs deeper legal or access controls."
        summary={
          session.email
            ? "Your session details, legal links, and account controls are available in one place."
            : "This surface is ready, but the account still needs an active signed-in session to feel complete."
        }
        transition="This top layer keeps the account page calm: what account is active, where the legal links live, and what control matters next. The destructive actions and compliance notes stay below."
        actions={[
          {
            label: "Open Privacy Policy",
            onClick: () => onNavigate?.("/privacy-policy"),
            kind: "primary",
          },
          {
            label: "Open Terms Of Service",
            onClick: () => onNavigate?.("/terms-of-service"),
          },
          {
            label: "Sign Out",
            onClick: handleSignOut,
          },
        ]}
        score={accountHeroScore}
        scoreTone={accountHeroTone}
        scoreSubtitle="account score"
        scoreIconLabel="account"
        asideHeadline={isSupabaseAccount ? "Managed account controls are active" : "Local account controls are available"}
        asideSummary={
          isSupabaseAccount
            ? "Supabase-backed identity is active, so legal access and destructive controls can stay in one governed place."
            : "This device is using the local account mode, which is useful for demo and sandbox work but lighter on identity controls."
        }
        glanceItems={accountHeroGlanceItems}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <FriendlyActionTile
          kicker="Simple Read"
          title={session.email ? "Account looks reachable" : "Account needs sign-in context"}
          detail="Legal links, account controls, and the active workspace details are grouped here without forcing the technical or compliance details first."
          metric={accessPortal?.currentPlan?.label || "Free plan"}
          tone={accountHeroTone}
          statusLabel="Simple Read"
          actionLabel="Open Privacy Policy"
          onAction={() => onNavigate?.("/privacy-policy")}
        />
        <FriendlyActionTile
          kicker="Best First Step"
          title="Review the account control path"
          detail="Make sure sign-out and permanent deletion are understandable before you need them in a real household handoff."
          metric={needsReauth ? "reauth needed" : "controls ready"}
          tone="warning"
          statusLabel="Guided Focus"
          actionLabel="Open Controls"
          onAction={() => document.querySelector('[data-account-controls="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <FriendlyActionTile
          kicker="What Can Wait"
          title="Store and compliance polish can come after the core controls"
          detail="The most important work is still making the account actions understandable and safe. Release-detail cleanup can follow."
          metric={isSupabaseAccount ? "managed auth" : "local auth"}
          tone="info"
          statusLabel="Building"
          actionLabel="See Notes"
          onAction={() => document.querySelector('[data-store-readiness="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      </div>

      <div style={{ display: "grid", gap: "18px" }}>
        <SectionCard title="Legal" subtitle="These links should remain reachable in the app and in store metadata.">
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => onNavigate?.("/privacy-policy")} style={actionButtonStyle()}>
              Open Privacy Policy
            </button>
            <button type="button" onClick={() => onNavigate?.("/terms-of-service")} style={actionButtonStyle()}>
              Open Terms of Service
            </button>
          </div>
          <div style={{ marginTop: "14px", color: "#475569", lineHeight: "1.75" }}>
            The current privacy page still reads like beta legal copy and should be replaced with reviewed production language before store submission.
          </div>
        </SectionCard>

        <SectionCard
          data-account-controls="true"
          title="Account Controls"
          subtitle="Users can request permanent deletion directly in-app without contacting support."
        >
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
        </SectionCard>

        <SectionCard
          data-store-readiness="true"
          title="Store Readiness Notes"
          subtitle="Highest-signal account and compliance items still open."
        >
          <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "8px", color: "#475569" }}>
            <li>Native iOS and Android project folders now exist, but signing and archive validation still need a native release pass.</li>
            <li>Camera usage text and manifest coverage are now started, but the final permission review still needs to be completed against the shipped feature set.</li>
            <li>Store privacy disclosures and data safety answers still need to be aligned with real backend behavior.</li>
            <li>Release signing, screenshots, icons, and review-access instructions still need a native submission pass.</li>
          </ul>
        </SectionCard>
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
