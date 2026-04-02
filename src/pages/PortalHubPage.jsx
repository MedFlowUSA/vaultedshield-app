import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import StatusBadge from "../components/shared/StatusBadge";
import { summarizePortalModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { buildPortalHubCommand } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import { getPortalHubBundle } from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

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
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getPortalTone(accessStatus) {
  if (accessStatus === "active") return "good";
  if (accessStatus === "limited") return "warning";
  if (accessStatus === "locked") return "alert";
  return "info";
}

export default function PortalHubPage({ onNavigate }) {
  const { isTablet } = useResponsiveLayout();
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
    return () => {
      active = false;
    };
  }, [householdState.context.householdId]);

  const filteredPortals = useMemo(() => {
    switch (activeFilter) {
      case "emergency":
        return bundle.portals.filter((portal) => portal.emergency_relevance);
      case "active":
        return bundle.portals.filter((portal) => portal.access_status === "active");
      case "limited":
        return bundle.portals.filter((portal) =>
          ["limited", "locked"].includes(portal.access_status)
        );
      case "missing_verification":
        return bundle.portals.filter((portal) => !portal.last_verified_at);
      default:
        return bundle.portals;
    }
  }, [activeFilter, bundle.portals]);

  const portalRead = useMemo(() => summarizePortalModule(bundle), [bundle]);
  const portalCommand = useMemo(
    () =>
      buildPortalHubCommand({
        bundle,
        portalRead,
      }),
    [bundle, portalRead]
  );
  const topSplitLayout = isTablet ? "1fr" : "1.3fr 1fr";
  const metricsLayout = isTablet ? "1fr" : "1fr 1fr";

  return (
    <div>
      <PageHeader
        eyebrow="Portal Hub"
        title="Household Access Continuity"
        description="Reusable portal profiles for household-wide continuity, emergency access mapping, and multi-asset linking."
        actions={
          <button
            onClick={() => onNavigate("/assets")}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "10px",
              padding: "10px 14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            View Assets
          </button>
        }
      />

      <SummaryPanel
        items={[
          {
            label: "Household",
            value:
              bundle.household?.household_name ||
              householdState.household?.household_name ||
              "Working household",
            helper: "Current portal continuity context",
          },
          { label: "Portals", value: bundle.readiness.portalCount, helper: "Household portal profiles" },
          { label: "Linked Assets", value: bundle.readiness.linkedPortalCount, helper: "Portal-to-asset links" },
          {
            label: "Emergency Relevant",
            value: bundle.readiness.emergencyRelevantCount,
            helper: "Marked for continuity",
          },
          {
            label: "Missing Recovery",
            value: bundle.readiness.missingRecoveryCount,
            helper: "Recovery hints still missing",
          },
          {
            label: "Critical Assets Without Portals",
            value: bundle.readiness.criticalAssetsWithoutLinkedPortals.length,
            helper: "Insurance, banking, retirement, estate, property",
          },
          {
            label: "Continuity Status",
            value: portalRead.status,
            helper: "High-level household access-readiness view",
          },
        ]}
      />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: topSplitLayout, gap: "18px" }}>
        <SectionCard title="Portal Continuity Summary">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div>
              Household portal continuity is based on reusable portal profiles, linked asset coverage,
              verification status, and recovery visibility.
            </div>
            <div>
              {bundle.readiness.criticalAssetsWithoutLinkedPortals.length > 0
                ? `${bundle.readiness.criticalAssetsWithoutLinkedPortals.length} critical assets still do not have a linked portal profile.`
                : "All currently flagged critical assets have at least one linked portal profile."}
            </div>
            <div>
              {bundle.readiness.missingRecoveryCount > 0
                ? `${bundle.readiness.missingRecoveryCount} portal profiles still need recovery contact hints.`
                : "Recovery contact visibility looks stronger on the current portal set."}
            </div>
            <div>
              {portalRead.headline}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Filter Portals">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "999px",
                  border: activeFilter === filter.key ? "1px solid #0f172a" : "1px solid #cbd5e1",
                  background: activeFilter === filter.key ? "#0f172a" : "#ffffff",
                  color: activeFilter === filter.key ? "#ffffff" : "#334155",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px" }}>
        <SectionCard
          title="Portal Command Center"
          subtitle="The strongest current access, recovery, and verification blockers across the household portal layer."
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{portalCommand.headline}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { label: "Portals", value: portalCommand.metrics.portals },
                  { label: "Emergency", value: portalCommand.metrics.emergencyPortals },
                  { label: "Missing Recovery", value: portalCommand.metrics.missingRecovery },
                  { label: "Attention", value: portalCommand.metrics.attention },
                ].map((metric) => (
                  <span
                    key={metric.label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#334155",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {metric.label}: {metric.value}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ color: "#64748b", lineHeight: "1.7" }}>{portalCommand.summary}</div>

            {portalCommand.rows.length > 0 ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {portalCommand.rows.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "16px",
                      borderRadius: "14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <StatusBadge label={item.urgencyMeta.badge} tone={item.urgency === "critical" ? "alert" : item.urgency === "warning" ? "warning" : "good"} />
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#64748b",
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {item.staleLabel}
                        </span>
                      </div>
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.blocker}</div>
                    <div style={{ color: "#64748b", lineHeight: "1.7" }}>{item.consequence}</div>
                    <div>
                      <button
                        type="button"
                        onClick={() => onNavigate?.(item.route)}
                        style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                      >
                        {item.nextAction}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                Portal continuity currently looks steady enough that no major access or recovery blockers are standing out.
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "18px", display: "grid", gridTemplateColumns: metricsLayout, gap: "18px" }}>
        <SectionCard title="Continuity Watchlist">
          {portalRead.notes.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
              {portalRead.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <div style={{ color: "#475569" }}>No major portal watchpoints are visible right now.</div>
          )}
        </SectionCard>

        <SectionCard title="Continuity Metrics">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Limited / Locked:</strong> {portalRead.metrics.limitedPortals}</div>
            <div><strong>Unverified:</strong> {portalRead.metrics.unverifiedPortals}</div>
            <div><strong>Missing recovery:</strong> {portalRead.metrics.missingRecovery}</div>
            <div><strong>Total portals:</strong> {portalRead.metrics.portals}</div>
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
        {filteredPortals.length > 0 ? (
          filteredPortals.map((portal) => (
            <SectionCard
              key={portal.id}
              title={portal.portal_name || "Portal Profile"}
              subtitle={portal.institution_name || "Institution not recorded"}
            >
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <StatusBadge label={portal.access_status || "unknown"} tone={getPortalTone(portal.access_status)} />
                  <StatusBadge
                    label={portal.emergency_relevance ? "Emergency Relevant" : "General Access"}
                    tone={portal.emergency_relevance ? "warning" : "info"}
                  />
                  <StatusBadge
                    label={`${portal.linked_asset_count || 0} linked asset${portal.linked_asset_count === 1 ? "" : "s"}`}
                    tone="neutral"
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", color: "#475569" }}>
                  <div><strong>Portal URL:</strong> {portal.portal_url || "Limited visibility"}</div>
                  <div><strong>MFA Type:</strong> {portal.mfa_type || "unknown"}</div>
                  <div><strong>Username Hint:</strong> {portal.username_hint || "Limited visibility"}</div>
                  <div><strong>Recovery Hint:</strong> {portal.recovery_contact_hint || "Limited visibility"}</div>
                  <div><strong>Support Contact:</strong> {portal.support_contact || "Limited visibility"}</div>
                  <div><strong>Last Verified:</strong> {formatDate(portal.last_verified_at)}</div>
                </div>

                <div style={{ color: "#475569" }}>
                  <strong>Linked Assets:</strong>{" "}
                  {portal.linked_assets.length > 0
                    ? portal.linked_assets
                        .map((asset) => `${asset.asset_name} (${asset.asset_category}${asset.asset_subcategory ? ` / ${asset.asset_subcategory}` : ""})`)
                        .join(", ")
                    : "No linked assets yet."}
                </div>

                <div style={{ display: "grid", gap: "8px" }}>
                  {portal.continuity_signals.length > 0 ? (
                    portal.continuity_signals.map((signal) => (
                      <div key={signal} style={{ color: "#7c2d12", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "10px", padding: "10px 12px" }}>
                        {signal}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#166534", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "10px", padding: "10px 12px" }}>
                      Current portal continuity inputs look reasonably complete for a first-pass household registry.
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {portal.portal_url ? (
                    <a
                      href={portal.portal_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        background: "#0f172a",
                        color: "#ffffff",
                        textDecoration: "none",
                        fontWeight: 700,
                      }}
                    >
                      Open Portal
                    </a>
                  ) : (
                    <div style={{ color: "#64748b" }}>Portal URL has not been recorded yet.</div>
                  )}
                </div>
              </div>
            </SectionCard>
          ))
        ) : (
          <EmptyState
            title="No portal profiles yet"
            description="Create linked portal continuity records from Asset Detail pages to build household-wide access visibility."
          />
        )}
      </div>

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Portal Debug: household={householdState.context.householdId || "none"} | portals={bundle.portals.length} | links={bundle.links.length} | assets_without_links={bundle.readiness.criticalAssetsWithoutLinkedPortals.length} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
