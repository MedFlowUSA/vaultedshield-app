function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "info") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" };
}

export default function NotFoundPage({ onNavigate, requestedPath = "" }) {
  return (
    <div style={{ display: "grid", gap: "24px", padding: "24px 0 40px" }}>
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
        <div style={{ display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
            Navigation
          </div>
          <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
            Page Not Found
          </div>
          <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>
            {requestedPath
              ? `Requested path: ${requestedPath}`
              : "VaultedShield could not match this link to a live page. The safest next move is to return to a known area and keep working from there."}
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onNavigate?.("/dashboard")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#1d4ed8", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Dashboard
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/guidance")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Open Guidance
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Best First Step",
            title: "Return to the household overview",
            detail: "Go back to the dashboard when you want the clearest read on what matters next.",
            metric: "Overview",
            tone: "info",
            statusLabel: "Guided Focus",
            actionLabel: "Open Dashboard",
            onAction: () => onNavigate?.("/dashboard"),
          },
          {
            kicker: "If You Were Uploading",
            title: "Use the right intake path",
            detail: "Upload Center is for general records. Life Policy Intake is for life-policy illustrations and annual statements.",
            metric: "2 paths",
            tone: "warning",
            statusLabel: "Needs Review",
            actionLabel: "Open Upload Center",
            onAction: () => onNavigate?.("/upload-center"),
          },
          {
            kicker: "If You Were Reviewing",
            title: "Jump back into insurance",
            detail: "Insurance Intelligence is the easiest way to reopen saved policies, priorities, and deeper technical review.",
            metric: "Policy read",
            tone: "good",
            statusLabel: "Simple Read",
            actionLabel: "Open Insurance",
            onAction: () => onNavigate?.("/insurance"),
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

      {/* Recovery Note */}
      <div
        style={{
          padding: "22px 24px",
          borderRadius: "18px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          display: "grid",
          gap: "8px",
        }}
      >
        <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Need a stable entry point?</div>
        <div style={{ color: "#64748b", lineHeight: "1.7" }}>
          Use Guidance if you want VaultedShield to explain where a workflow belongs before you choose a page.
        </div>
        <div style={{ marginTop: "4px" }}>
          <button
            type="button"
            onClick={() => onNavigate?.("/guidance")}
            style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer" }}
          >
            Open Guidance
          </button>
        </div>
      </div>
    </div>
  );
}
