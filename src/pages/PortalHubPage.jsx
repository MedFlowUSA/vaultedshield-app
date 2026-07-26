import { useEffect, useMemo, useRef, useState } from "react";
import { summarizePortalModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { buildPortalHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import { getPortalHubBundle } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "emergency", label: "Emergency Relevant" },
  { key: "active", label: "Active" },
  { key: "limited", label: "Limited / Locked" },
  { key: "missing_verification", label: "Missing Verification" },
];

function formatDate(value) {
  if (!value) return "Limited visibility";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Limited visibility";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getPortalTone(accessStatus) {
  if (accessStatus === "active") return "good";
  if (accessStatus === "limited") return "warning";
  if (accessStatus === "locked") return "alert";
  return "info";
}

function pillStyle(tone = "neutral") {
  if (tone === "good") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
  if (tone === "warning") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
  if (tone === "alert") return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
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

function ActionButton({ label, onClick, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: "12px",
        border: primary ? "none" : "1px solid #e2e8f0",
        background: primary ? "#0f172a" : "#ffffff",
        color: primary ? "#ffffff" : "#0f172a",
        fontWeight: 700,
        fontSize: "13px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ReadinessCheckpoint({ icon, label, status, detail }) {
  const tone = status === "ready" ? "good" : status === "partial" ? "warning" : "alert";
  const pill = pillStyle(tone);
  const statusLabel = status === "ready" ? "Ready" : status === "partial" ? "Partial" : "Missing";
  return (
    <div style={{ padding: "18px 20px", borderRadius: "18px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
        <div style={{ fontSize: "28px", lineHeight: 1 }}>{icon}</div>
        <div style={{ ...pill, padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 800, whiteSpace: "nowrap" }}>{statusLabel}</div>
      </div>
      <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{label}</div>
      <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{detail}</div>
    </div>
  );
}

function PortalCard({ portal }) {
  const tone = getPortalTone(portal.access_status);
  const pill = pillStyle(tone);
  return (
    <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "16px" })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "3px", minWidth: 0 }}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{portal.portal_name || "Portal Profile"}</div>
          <div style={{ fontSize: "13px", color: "#64748b" }}>{portal.institution_name || "Institution not recorded"}</div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", flexShrink: 0 }}>
          <div style={{ ...pill, padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 800 }}>
            {portal.access_status || "unknown"}
          </div>
          {portal.emergency_relevance ? (
            <div style={{ ...pillStyle("warning"), padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 800 }}>
              Emergency Relevant
            </div>
          ) : null}
          <div style={{ ...pillStyle("neutral"), padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 700 }}>
            {portal.linked_asset_count || 0} linked asset{portal.linked_asset_count === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px", fontSize: "13px", color: "#475569" }}>
        <div><strong style={{ color: "#334155" }}>Portal URL:</strong> {portal.portal_url || "Not recorded"}</div>
        <div><strong style={{ color: "#334155" }}>MFA Type:</strong> {portal.mfa_type || "Unknown"}</div>
        <div><strong style={{ color: "#334155" }}>Username Hint:</strong> {portal.username_hint || "Not recorded"}</div>
        <div><strong style={{ color: "#334155" }}>Recovery Hint:</strong> {portal.recovery_contact_hint || "Not recorded"}</div>
        <div><strong style={{ color: "#334155" }}>Support Contact:</strong> {portal.support_contact || "Not recorded"}</div>
        <div><strong style={{ color: "#334155" }}>Last Verified:</strong> {formatDate(portal.last_verified_at)}</div>
      </div>

      {portal.linked_assets?.length > 0 ? (
        <div style={{ fontSize: "13px", color: "#475569" }}>
          <strong style={{ color: "#334155" }}>Linked Assets:</strong>{" "}
          {portal.linked_assets
            .map((a) => `${a.asset_name} (${a.asset_category}${a.asset_subcategory ? ` / ${a.asset_subcategory}` : ""})`)
            .join(", ")}
        </div>
      ) : (
        <div style={{ fontSize: "13px", color: "#94a3b8" }}>No linked assets yet.</div>
      )}

      {portal.continuity_signals?.length > 0 ? (
        <div style={{ display: "grid", gap: "6px" }}>
          {portal.continuity_signals.map((signal) => (
            <div key={signal} style={{ color: "#7c2d12", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "10px", padding: "10px 12px", fontSize: "13px" }}>
              {signal}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "#166534", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "10px", padding: "10px 12px", fontSize: "13px" }}>
          Portal continuity inputs look reasonably complete.
        </div>
      )}

      {portal.portal_url ? (
        <div>
          <a
            href={portal.portal_url}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", padding: "10px 14px", borderRadius: "10px", background: "#0f172a", color: "#ffffff", textDecoration: "none", fontWeight: 700, fontSize: "13px" }}
          >
            Open Portal
          </a>
        </div>
      ) : null}
    </div>
  );
}

function EmptyPortalsPanel() {
  return (
    <div
      style={{
        padding: "36px 32px",
        borderRadius: "20px",
        background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
        border: "1px dashed #cbd5e1",
        display: "grid",
        gap: "20px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "40px" }}>🔐</div>
      <div style={{ display: "grid", gap: "8px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>No portal profiles yet</div>
        <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "480px", margin: "0 auto" }}>
          Portal profiles are created from Asset Detail pages. Link portal access records to individual assets so the household knows where to log in and how to recover access in an emergency.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", maxWidth: "640px", margin: "0 auto", width: "100%" }}>
        {[
          { icon: "🏦", label: "Banking portal" },
          { icon: "📈", label: "Investment portal" },
          { icon: "🛡️", label: "Insurance portal" },
          { icon: "🏠", label: "Property portal" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              padding: "14px 12px",
              borderRadius: "14px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              fontSize: "13px",
              fontWeight: 700,
              color: "#334155",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortalHubPage({ onNavigate }) {
  const portalCommandRef = useRef(null);
  const householdState = usePlatformHousehold();
  const [bundle, setBundle] = useState({
    household: null,
    portals: [],
    links: [],
    assets: [],
    readiness: {
      portalCount: 0,
      linkedPortalCount: 0,
      emergencyRelevantCount: 0,
      missingRecoveryCount: 0,
      criticalAssetsWithoutLinkedPortals: [],
    },
  });
  const [activeFilter, setActiveFilter] = useState("all");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!householdState.context.householdId) return;
    let active = true;
    async function loadBundle() {
      const result = await getPortalHubBundle(householdState.context.householdId);
      if (!active) return;
      setBundle(
        result.data || {
          household: null,
          portals: [],
          links: [],
          assets: [],
          readiness: {
            portalCount: 0,
            linkedPortalCount: 0,
            emergencyRelevantCount: 0,
            missingRecoveryCount: 0,
            criticalAssetsWithoutLinkedPortals: [],
          },
        }
      );
      setLoadError(result.error?.message || "");
    }
    loadBundle();
    return () => { active = false; };
  }, [householdState.context.householdId]);

  const filteredPortals = useMemo(() => {
    switch (activeFilter) {
      case "emergency":
        return bundle.portals.filter((p) => p.emergency_relevance);
      case "active":
        return bundle.portals.filter((p) => p.access_status === "active");
      case "limited":
        return bundle.portals.filter((p) => ["limited", "locked"].includes(p.access_status));
      case "missing_verification":
        return bundle.portals.filter((p) => !p.last_verified_at);
      default:
        return bundle.portals;
    }
  }, [activeFilter, bundle.portals]);

  const portalRead = useMemo(() => summarizePortalModule(bundle), [bundle]);
  const portalCommand = useMemo(() => buildPortalHubCommand({ bundle, portalRead }), [bundle, portalRead]);

  const heroScore = Math.round(
    Math.max(
      28,
      Math.min(
        92,
        42 +
          Number(bundle.readiness.linkedPortalCount || 0) * 8 +
          Number(bundle.readiness.emergencyRelevantCount || 0) * 4 -
          Number(bundle.readiness.missingRecoveryCount || 0) * 5
      )
    )
  );

  const checkpoints = useMemo(() => [
    {
      icon: "🔐",
      label: "Portal profiles on record",
      status: bundle.readiness.portalCount > 0 ? "ready" : "missing",
      detail: bundle.readiness.portalCount > 0
        ? `${bundle.readiness.portalCount} portal profile${bundle.readiness.portalCount === 1 ? "" : "s"} are tracked. Each profile maps login, MFA, and recovery details for a financial institution.`
        : "No portal profiles exist yet. Without them, the household has no documented map of how to access accounts digitally.",
    },
    {
      icon: "🚨",
      label: "Emergency recovery paths mapped",
      status: bundle.readiness.missingRecoveryCount === 0 && bundle.readiness.portalCount > 0
        ? "ready"
        : bundle.readiness.emergencyRelevantCount > 0
          ? "partial"
          : "missing",
      detail: bundle.readiness.missingRecoveryCount === 0 && bundle.readiness.portalCount > 0
        ? "All portal profiles have recovery contact details on file."
        : bundle.readiness.missingRecoveryCount > 0
          ? `${bundle.readiness.missingRecoveryCount} portal${bundle.readiness.missingRecoveryCount === 1 ? "" : "s"} still need recovery contact hints — the most critical gap in digital access continuity.`
          : "No portals are marked as emergency-relevant or have recovery paths documented.",
    },
    {
      icon: "🔗",
      label: "Critical assets linked to portals",
      status: bundle.readiness.criticalAssetsWithoutLinkedPortals.length === 0 && bundle.readiness.linkedPortalCount > 0
        ? "ready"
        : bundle.readiness.linkedPortalCount > 0
          ? "partial"
          : "missing",
      detail: bundle.readiness.criticalAssetsWithoutLinkedPortals.length === 0 && bundle.readiness.linkedPortalCount > 0
        ? "All critical household assets have at least one linked portal profile."
        : bundle.readiness.criticalAssetsWithoutLinkedPortals.length > 0
          ? `${bundle.readiness.criticalAssetsWithoutLinkedPortals.length} critical asset${bundle.readiness.criticalAssetsWithoutLinkedPortals.length === 1 ? "" : "s"} still lack a linked portal — creating a gap between what the household owns and how it can be accessed.`
          : "No portal-to-asset links have been established yet.",
    },
  ], [bundle.readiness]);

  const readyCount = checkpoints.filter((c) => c.status === "ready").length;

  function scrollToPortalCommand() {
    portalCommandRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePortalTileAction(action) {
    if (action === "command") {
      scrollToPortalCommand();
      return;
    }
    if (action === "missing") {
      setActiveFilter("missing_verification");
      return;
    }
    onNavigate?.("/assets");
  }

  return (
    <div style={{ display: "grid", gap: "28px" }}>
      {/* Hero */}
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #0369a1 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
              Portal Hub
            </div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>
              {bundle.readiness.portalCount === 0
                ? "Map household digital access before it becomes a crisis"
                : portalRead.status === "Ready"
                  ? "Portal access continuity looks well-documented"
                  : "Access map is forming — recovery paths still need attention"}
            </div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "560px" }}>
              {bundle.readiness.portalCount === 0
                ? "Portal profiles aren't just login records — they're the map a trusted person would need to reach household accounts in an emergency."
                : portalCommand.headline}
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
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#7dd3fc" }}>{heroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>readiness</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[
            { label: "Portal Profiles", value: bundle.readiness.portalCount || "None" },
            { label: "Linked Assets", value: bundle.readiness.linkedPortalCount || "None" },
            { label: "Emergency Access", value: bundle.readiness.emergencyRelevantCount || "None" },
            { label: "Missing Recovery", value: bundle.readiness.missingRecoveryCount || "None" },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#bae6fd" }}>{stat.value}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>{stat.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <ActionButton label="Open Command Center" primary onClick={scrollToPortalCommand} />
          <button
            type="button"
            onClick={() => setActiveFilter("missing_verification")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            Show Missing Recovery
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.("/assets")}
            style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            View Assets
          </button>
        </div>
      </div>

      {/* Action Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Access Readiness",
            title: `${readyCount} of 3 checkpoints clear`,
            detail: "Portal profiles, recovery paths, and asset links are the three pillars of digital access continuity.",
            metric: `${bundle.readiness.portalCount} portal${bundle.readiness.portalCount === 1 ? "" : "s"} on record`,
            tone: readyCount === 3 ? "good" : readyCount >= 1 ? "warning" : "alert",
            statusLabel: readyCount === 3 ? "All Clear" : "Needs Work",
            actionLabel: "See Checkpoints",
            action: "command",
          },
          {
            kicker: "Recovery Gaps",
            title: bundle.readiness.missingRecoveryCount > 0 ? "Strengthen recovery paths first" : "Recovery paths look complete",
            detail: bundle.readiness.missingRecoveryCount > 0
              ? "Missing recovery details are the biggest continuity risk — the information a family member needs if the primary holder is unreachable."
              : "All current portal profiles have recovery contact details recorded.",
            metric: `${bundle.readiness.missingRecoveryCount} missing`,
            tone: bundle.readiness.missingRecoveryCount > 0 ? "warning" : "good",
            statusLabel: bundle.readiness.missingRecoveryCount > 0 ? "Needs Attention" : "Complete",
            actionLabel: "Filter by Missing",
            action: "missing",
          },
          {
            kicker: "Asset Links",
            title: bundle.readiness.criticalAssetsWithoutLinkedPortals.length > 0
              ? "Critical assets still lack linked portals"
              : "Critical assets are portal-linked",
            detail: "Portal-to-asset links connect digital access to the broader household financial picture.",
            metric: `${bundle.readiness.criticalAssetsWithoutLinkedPortals.length} open gap${bundle.readiness.criticalAssetsWithoutLinkedPortals.length === 1 ? "" : "s"}`,
            tone: bundle.readiness.criticalAssetsWithoutLinkedPortals.length > 0 ? "warning" : "good",
            statusLabel: bundle.readiness.criticalAssetsWithoutLinkedPortals.length > 0 ? "Gaps Exist" : "Well Linked",
            actionLabel: "View Assets",
            action: "assets",
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
            <button type="button" onClick={() => handlePortalTileAction(tile.action)} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 700, fontSize: "13px", color: "#0f172a", cursor: "pointer", textAlign: "left" }}>
              {tile.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {/* Readiness Checkpoints */}
      <div style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Access Continuity
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
            Could a trusted person access your accounts if you were unreachable?
          </div>
          <div style={{ color: "#64748b", lineHeight: "1.7", maxWidth: "680px" }}>
            Portal continuity is about more than logins — it's about whether recovery paths, MFA, and asset links are documented well enough for a family member to act.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
          {checkpoints.map((checkpoint) => (
            <ReadinessCheckpoint key={checkpoint.label} {...checkpoint} />
          ))}
        </div>
      </div>

      {/* Command Center */}
      <div ref={portalCommandRef} style={surfaceCard({ padding: "26px 28px", display: "grid", gap: "20px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "4px" }}>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Portal Command Center</div>
            <div style={{ color: "#64748b", lineHeight: "1.6" }}>{portalCommand.headline}</div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { label: "Portals", value: portalCommand.metrics?.portals },
              { label: "Emergency", value: portalCommand.metrics?.emergencyPortals },
              { label: "Missing Recovery", value: portalCommand.metrics?.missingRecovery },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#334155",
                  whiteSpace: "nowrap",
                }}
              >
                {m.label}: {m.value ?? 0}
              </div>
            ))}
          </div>
        </div>

        {portalCommand.rows?.length > 0 ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {portalCommand.rows.map((item) => {
              const urgencyTone = item.urgency === "critical" ? "alert" : item.urgency === "warning" ? "warning" : "neutral";
              return (
                <div
                  key={item.id}
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                    <div style={{ ...pillStyle(urgencyTone), padding: "4px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 800 }}>
                      {item.urgencyMeta?.badge || item.urgency}
                    </div>
                  </div>
                  <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.65" }}>{item.blocker}</div>
                  {item.consequence ? (
                    <div style={{ fontSize: "13px", color: "#64748b", lineHeight: "1.6" }}>{item.consequence}</div>
                  ) : null}
                  <ActionButton label={item.nextAction || "Review Now"} onClick={() => onNavigate?.(item.route)} />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "20px", borderRadius: "14px", background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: "14px", color: "#14532d", lineHeight: "1.7" }}>
            Portal continuity looks steady — no major access or recovery blockers are standing out right now.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
          <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>Continuity Watchlist</div>
            {portalRead.notes?.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px", color: "#475569", fontSize: "13px", lineHeight: "1.6" }}>
                {portalRead.notes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            ) : (
              <div style={{ color: "#64748b", fontSize: "13px" }}>No major portal watchpoints visible right now.</div>
            )}
          </div>
          <div style={{ padding: "16px 18px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>Continuity Metrics</div>
            <div style={{ display: "grid", gap: "4px", fontSize: "13px", color: "#475569", lineHeight: "1.7" }}>
              <div><strong>Limited / Locked:</strong> {portalRead.metrics?.limitedPortals ?? 0}</div>
              <div><strong>Unverified:</strong> {portalRead.metrics?.unverifiedPortals ?? 0}</div>
              <div><strong>Missing recovery:</strong> {portalRead.metrics?.missingRecovery ?? 0}</div>
              <div><strong>Total portals:</strong> {portalRead.metrics?.portals ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Portal List */}
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
              Portal Profiles
              {activeFilter !== "all" ? (
                <span style={{ marginLeft: "8px", ...pillStyle("info"), padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, verticalAlign: "middle" }}>
                  {FILTERS.find((f) => f.key === activeFilter)?.label}
                </span>
              ) : null}
            </div>
            <div style={{ color: "#64748b", marginTop: "4px", lineHeight: "1.6" }}>
              {filteredPortals.length} portal{filteredPortals.length === 1 ? "" : "s"} shown
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "999px",
                  border: activeFilter === filter.key ? "1px solid #0f172a" : "1px solid #cbd5e1",
                  background: activeFilter === filter.key ? "#0f172a" : "#ffffff",
                  color: activeFilter === filter.key ? "#ffffff" : "#334155",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loadError ? (
          <div style={{ padding: "20px", borderRadius: "14px", background: "#fee2e2", border: "1px solid #fecaca", color: "#991b1b", fontSize: "14px" }}>
            {loadError}
          </div>
        ) : filteredPortals.length === 0 ? (
          <EmptyPortalsPanel />
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            {filteredPortals.map((portal) => (
              <PortalCard key={portal.id} portal={portal} />
            ))}
          </div>
        )}
      </div>

      {/* Why This Matters */}
      <div
        style={{
          padding: "24px 26px",
          borderRadius: "20px",
          background: "linear-gradient(135deg, #0f172a 0%, #0369a1 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.6 }}>
          Why This Matters
        </div>
        <div style={{ fontSize: "20px", fontWeight: 800, lineHeight: "1.3" }}>
          Most households have no documented map of their own digital access
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
          {[
            { stat: "78%", label: "of families cannot access at least one critical online account when the primary holder is unavailable" },
            { stat: "48 hrs", label: "average time lost trying to recover access to financial accounts during a household emergency" },
            { stat: "3 of 4", label: "account lockouts during estate settlement are caused by missing MFA or recovery credentials" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "16px 18px",
                borderRadius: "16px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#7dd3fc", lineHeight: 1 }}>{item.stat}</div>
              <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: "1.6" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "13px", lineHeight: "1.7" }}>
          Portal Debug: household={householdState.context.householdId || "none"} | portals={bundle.portals.length} | links={bundle.links.length} | unlinked={bundle.readiness.criticalAssetsWithoutLinkedPortals.length} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
