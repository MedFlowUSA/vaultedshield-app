import NotesPanel from "../components/shared/NotesPanel";

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "info") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
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

export default function SettingsPage() {
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
              Settings
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              Platform Settings
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>
              Keep profile, access, and notification controls understandable before they grow into a bigger settings system.
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
              minWidth: "90px",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: 1, color: "#94a3b8" }}>4</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>areas</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[
            { label: "User Profile", value: "Ready" },
            { label: "Household Roles", value: "Planned" },
            { label: "Notifications", value: "Planned" },
            { label: "Security", value: "Planned" },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#cbd5e1" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Simple Read",
            title: "Settings layout is understandable",
            detail: "The major control areas are already staged clearly even though the deeper configuration work is still coming.",
            metric: "4 core areas",
            tone: "info",
            statusLabel: "Simple Read",
            actionLabel: "View Profile",
            onAction: () => document.querySelector('[data-settings-profile="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "Best First Step",
            title: "Start with profile and household roles",
            detail: "Those two areas usually matter first because they shape identity, continuity access, and household coordination.",
            metric: "identity first",
            tone: "warning",
            statusLabel: "Guided Focus",
            actionLabel: "Open Roles",
            onAction: () => document.querySelector('[data-settings-roles="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "What Can Wait",
            title: "Notification tuning can come after access",
            detail: "Alert routing and security detail matter, but they do not need to block the first clean settings experience.",
            metric: "alerts later",
            tone: "info",
            statusLabel: "Building",
            actionLabel: "See Security",
            onAction: () => document.querySelector('[data-settings-security="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
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

      {/* Settings Sections */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        <div data-settings-profile="true" style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "10px" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>User Profile</div>
          <NotesPanel notes={["Primary profile details, advisor visibility, and personal settings will live here."]} />
        </div>
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "10px" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Household Profile</div>
          <NotesPanel notes={["Household structure, continuity preferences, and family identity settings will live here."]} />
        </div>
        <div data-settings-roles="true" style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "10px" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Roles and Access</div>
          <NotesPanel notes={["Member roles, advisor access, trustee visibility, and future permissions will live here."]} />
        </div>
        <div data-settings-security="true" style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "10px" })}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Notifications and Security</div>
          <NotesPanel notes={["Notification routing, document alerts, and security preferences will live here."]} />
        </div>
      </div>
    </div>
  );
}
