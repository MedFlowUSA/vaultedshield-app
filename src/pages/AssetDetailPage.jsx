import { useEffect, useMemo, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import DocumentTable from "../components/shared/DocumentTable";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import StatusBadge from "../components/shared/StatusBadge";
import {
  createPortalProfile,
  getAssetDetailBundle,
  linkExistingPortalToAsset,
  listPortalProfiles,
} from "../lib/supabase/platformData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { buildAssetCommandCenter } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

const MFA_TYPES = ["sms", "authenticator", "email", "hardware_key", "unknown", "none"];
const ACCESS_STATUS = ["active", "limited", "locked", "unknown"];
const LINK_TYPES = ["primary_access", "supporting_access", "advisor_access", "institution_access", "other"];

function formatDate(value) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AssetDetailPage({ assetId, onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const { householdState, debug: shellDebug } = usePlatformShellData();
  const [bundle, setBundle] = useState({
    asset: null,
    documents: [],
    alerts: [],
    tasks: [],
    snapshots: [],
    portalLinks: [],
  });
  const [loadError, setLoadError] = useState("");
  const [existingPortalOptions, setExistingPortalOptions] = useState([]);
  const [existingPortalForm, setExistingPortalForm] = useState({
    portal_profile_id: "",
    link_type: "supporting_access",
    is_primary: false,
    notes: "",
  });
  const [portalForm, setPortalForm] = useState({
    portal_name: "",
    institution_name: "",
    portal_url: "",
    username_hint: "",
    recovery_contact_hint: "",
    mfa_type: "unknown",
    support_contact: "",
    access_status: "unknown",
    emergency_relevance: true,
    notes: "",
    link_type: "primary_access",
  });
  const platformScope = useMemo(
    () => ({
      householdId: householdState.context.householdId || null,
      authUserId: shellDebug.authUserId || null,
      ownershipMode: householdState.context.ownershipMode || "unknown",
      guestFallbackActive: householdState.context.guestFallbackActive,
      scopeSource: "asset_detail_page",
    }),
    [
      householdState.context.guestFallbackActive,
      householdState.context.householdId,
      householdState.context.ownershipMode,
      shellDebug.authUserId,
    ]
  );
  const scopeKey = `${platformScope.authUserId || "guest"}:${platformScope.householdId || "none"}:${platformScope.ownershipMode}`;

  useEffect(() => {
    if (!assetId) return;

    let active = true;

    async function loadBundle() {
      const [result, portalsResult] = await Promise.all([
        getAssetDetailBundle(assetId, platformScope),
        householdState.context.householdId
          ? listPortalProfiles(householdState.context.householdId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!active) return;
      setBundle(result.data || {
        asset: null,
        documents: [],
        alerts: [],
        tasks: [],
        snapshots: [],
        portalLinks: [],
        portalContinuity: {
          linkedCount: 0,
          missingRecoveryCount: 0,
        },
      });
      setExistingPortalOptions(portalsResult.data || []);
      setLoadError(result.error?.message || "");
    }

    loadBundle();
    return () => {
      active = false;
    };
  }, [assetId, householdState.context.householdId, scopeKey]);

  useEffect(() => {
    setBundle({
      asset: null,
      documents: [],
      alerts: [],
      tasks: [],
      snapshots: [],
      portalLinks: [],
      portalContinuity: {
        linkedCount: 0,
        missingRecoveryCount: 0,
      },
    });
    setLoadError("");
    setExistingPortalOptions([]);
  }, [scopeKey]);

  async function handleCreatePortal(event) {
    event.preventDefault();
    if (!bundle.asset?.id || !householdState.context.householdId || !portalForm.portal_name.trim()) {
      return;
    }

    const portalResult = await createPortalProfile({
      household_id: householdState.context.householdId,
      portal_name: portalForm.portal_name,
      institution_name: portalForm.institution_name,
      portal_url: portalForm.portal_url,
      username_hint: portalForm.username_hint,
      recovery_contact_hint: portalForm.recovery_contact_hint,
      mfa_type: portalForm.mfa_type,
      support_contact: portalForm.support_contact,
      access_status: portalForm.access_status,
      emergency_relevance: portalForm.emergency_relevance,
      notes: portalForm.notes,
      metadata: { asset_detail_create: true },
    });

    if (portalResult.error || !portalResult.data?.id) {
      setLoadError(portalResult.error?.message || "Portal profile could not be created.");
      return;
    }

    const linkResult = await linkExistingPortalToAsset(bundle.asset.id, portalResult.data.id, {
      link_type: portalForm.link_type,
      is_primary: portalForm.link_type === "primary_access",
      notes: portalForm.notes,
      metadata: { asset_detail_create: true },
      scopeOverride: platformScope,
    });

    if (linkResult.error) {
      setLoadError(linkResult.error.message || "Portal link could not be created.");
      return;
    }

    setBundle((current) => ({
      ...current,
      portalLinks: [
        linkResult.data,
        ...current.portalLinks,
      ],
      portalContinuity: {
        linkedCount: current.portalLinks.length + 1,
        missingRecoveryCount:
          current.portalContinuity.missingRecoveryCount +
          (portalResult.data.recovery_contact_hint ? 0 : 1),
      },
    }));
    setExistingPortalOptions((current) => {
      if (current.some((portal) => portal.id === portalResult.data.id)) return current;
      return [portalResult.data, ...current];
    });
    setPortalForm({
      portal_name: "",
      institution_name: "",
      portal_url: "",
      username_hint: "",
      recovery_contact_hint: "",
      mfa_type: "unknown",
      support_contact: "",
      access_status: "unknown",
      emergency_relevance: true,
      notes: "",
      link_type: "primary_access",
    });
    setLoadError("");
  }

  async function handleLinkExistingPortal(event) {
    event.preventDefault();
    if (!bundle.asset?.id || !existingPortalForm.portal_profile_id) {
      return;
    }

    const linkResult = await linkExistingPortalToAsset(
      bundle.asset.id,
      existingPortalForm.portal_profile_id,
      {
        link_type: existingPortalForm.link_type,
        is_primary: existingPortalForm.is_primary,
        notes: existingPortalForm.notes,
        metadata: { asset_detail_existing_link: true },
        scopeOverride: platformScope,
      }
    );

    if (linkResult.error || !linkResult.data) {
      setLoadError(linkResult.error?.message || "Existing portal could not be linked.");
      return;
    }

    if (!linkResult.duplicate) {
      setBundle((current) => ({
        ...current,
        portalLinks: [linkResult.data, ...current.portalLinks],
        portalContinuity: {
          linkedCount: current.portalLinks.length + 1,
          missingRecoveryCount:
            current.portalContinuity.missingRecoveryCount +
            (linkResult.data.portal_profiles?.recovery_contact_hint ? 0 : 1),
        },
      }));
    }

    setExistingPortalForm({
      portal_profile_id: "",
      link_type: "supporting_access",
      is_primary: false,
      notes: "",
    });
    setLoadError("");
  }

  const documentRows = bundle.documents.map((document) => ({
    name: document.file_name || "Unnamed document",
    role: [document.document_type, document.document_role].filter(Boolean).join(" | "),
    status: document.processing_status || "uploaded",
    updatedAt: formatDate(document.created_at),
  }));
  const commandCenter = useMemo(() => buildAssetCommandCenter(bundle), [bundle]);
  const dualRailLayout = isTablet ? "1fr" : "1.25fr 1fr";
  const splitLayout = isTablet ? "1fr" : "1fr 1fr";
  const portalLayout = isTablet ? "1fr" : "1.1fr 1fr";

  return (
    <div>
      <PageHeader
        eyebrow="Asset Detail"
        title={bundle.asset?.asset_name || "Asset Detail"}
        description="Live asset home with documents, alerts, tasks, notes, and linked portal continuity scaffolding."
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
            Back to Assets
          </button>
        }
      />

      <SummaryPanel
        items={[
          { label: "Category", value: bundle.asset?.asset_category || "--", helper: bundle.asset?.asset_subcategory || "No subcategory" },
          { label: "Institution", value: bundle.asset?.institution_name || "--", helper: "Institution context" },
          { label: "Status", value: bundle.asset?.status || "--", helper: "Current asset status" },
          { label: "Documents", value: bundle.documents.length, helper: "Linked asset documents" },
          { label: "Alerts", value: bundle.alerts.length, helper: "Asset-level alerts" },
          { label: "Tasks", value: bundle.tasks.length, helper: "Asset-level tasks" },
          { label: "Portal Links", value: bundle.portalLinks.length, helper: "Access continuity records" },
          {
            label: "Recovery Gaps",
            value: bundle.portalContinuity?.missingRecoveryCount ?? 0,
            helper: "Linked portals missing recovery hints",
          },
        ]}
      />

      <SectionCard title="Continuity Command" subtitle="The clearest blockers and next steps for keeping this asset dependable.">
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ color: "#475569", lineHeight: "1.7", maxWidth: "820px" }}>{commandCenter.headline}</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {[
                { label: "Critical", value: commandCenter.metrics.critical },
                { label: "Warning", value: commandCenter.metrics.warning },
                { label: "Docs", value: commandCenter.metrics.documents },
                { label: "Portals", value: commandCenter.metrics.linkedPortals },
              ].map((metric) => (
                <span
                  key={`asset-command-${metric.label}`}
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

          {commandCenter.blockers.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {commandCenter.blockers.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "16px 18px",
                    borderRadius: "16px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.title}</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: item.urgencyMeta.accent,
                          background: item.urgencyMeta.background,
                          border: item.urgencyMeta.border,
                        }}
                      >
                        {item.urgencyMeta.badge}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#475569",
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        {item.staleLabel}
                      </span>
                    </div>
                  </div>
                  <div style={{ color: "#0f172a", lineHeight: "1.7" }}>{item.blocker}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.consequence}</div>
                  <div style={{ color: "#334155", fontWeight: 700 }}>{item.nextAction}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No active blockers"
              description="This asset does not currently show major continuity issues across documents, tasks, alerts, or portal access."
            />
          )}
        </div>
      </SectionCard>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualRailLayout, gap: "18px" }}>
        <SectionCard title="Asset Summary">
          {bundle.asset ? (
            <div style={{ display: "grid", gap: "10px", color: "#475569" }}>
              <div><strong>Asset Name:</strong> {bundle.asset.asset_name}</div>
              <div><strong>Category:</strong> {bundle.asset.asset_category}</div>
              <div><strong>Subcategory:</strong> {bundle.asset.asset_subcategory || "Limited visibility"}</div>
              <div><strong>Institution:</strong> {bundle.asset.institution_name || "Limited visibility"}</div>
              <div><strong>Status:</strong> {bundle.asset.status || "Limited visibility"}</div>
              <div><strong>Household Context:</strong> {householdState.household?.household_name || "Working household"}</div>
              <div><strong>Owner:</strong> {bundle.asset.household_members?.full_name || "Owner/member not yet linked"}</div>
              <div><strong>Created:</strong> {formatDate(bundle.asset.created_at)}</div>
              <div><strong>Updated:</strong> {formatDate(bundle.asset.updated_at)}</div>
            </div>
          ) : (
            <EmptyState title="Asset not found" description="This asset detail record could not be loaded." />
          )}
        </SectionCard>

        <SectionCard title="AI Summary / Insight">
          <AIInsightPanel
            summary={
              bundle.snapshots.length > 0
                ? "This asset has snapshot history available for deeper intelligence expansion."
                : "Asset-specific intelligence is limited because no module-specific snapshots have been recorded yet."
            }
            bullets={[
              "Documents, alerts, tasks, and access continuity can already be managed here.",
              "Linked portal records are designed for continuity and emergency access mapping, not credential storage.",
            ]}
          />
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualRailLayout, gap: "18px" }}>
        <SectionCard title="Documents">
          {documentRows.length > 0 ? (
            <DocumentTable rows={documentRows} />
          ) : (
            <EmptyState title="No linked documents" description="No documents are currently linked to this asset." />
          )}
        </SectionCard>

        <SectionCard title="Notes">
          {bundle.asset?.metadata?.notes || bundle.asset?.summary?.notes ? (
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              {bundle.asset.metadata?.notes || bundle.asset.summary?.notes}
            </div>
          ) : (
            <EmptyState title="No notes yet" description="Asset notes will appear here as continuity context is added later." />
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: splitLayout, gap: "18px" }}>
        <SectionCard title="Alerts">
          {bundle.alerts.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {bundle.alerts.map((alert) => (
                <div key={alert.id} style={{ padding: "12px 14px", borderRadius: "12px", background: "#fff7ed", border: "1px solid #fdba74" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700, color: "#9a3412" }}>{alert.title}</div>
                    <StatusBadge label={alert.severity} tone={alert.severity === "urgent" ? "alert" : alert.severity === "warning" ? "warning" : "info"} />
                  </div>
                  <div style={{ marginTop: "6px", color: "#7c2d12" }}>{alert.description || alert.alert_type}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No alerts" description="No open asset-level alerts are currently recorded." />
          )}
        </SectionCard>

        <SectionCard title="Tasks">
          {bundle.tasks.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {bundle.tasks.map((task) => (
                <div key={task.id} style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>{task.title}</div>
                  <div style={{ marginTop: "6px", color: "#475569" }}>{task.description || task.task_type || "Task"}</div>
                  <div style={{ marginTop: "6px", color: "#64748b" }}>Due: {formatDate(task.due_date)} | Status: {task.status}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No tasks" description="No open tasks are currently linked to this asset." />
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: portalLayout, gap: "18px" }}>
        <SectionCard title="Linked Portals">
          {bundle.portalLinks.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {bundle.portalLinks.map((link) => {
                const portal = link.portal_profiles || {};
                return (
                  <div key={link.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{portal.portal_name || "Linked portal"}</div>
                      <StatusBadge label={portal.access_status || "unknown"} tone={portal.access_status === "active" ? "good" : portal.access_status === "limited" ? "warning" : "info"} />
                    </div>
                    <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.7", overflowWrap: "anywhere" }}>
                      <div><strong>Institution:</strong> {portal.institution_name || "Limited visibility"}</div>
                      <div><strong>URL:</strong> {portal.portal_url || "Limited visibility"}</div>
                      <div><strong>Username Hint:</strong> {portal.username_hint || "Limited visibility"}</div>
                      <div><strong>Recovery Hint:</strong> {portal.recovery_contact_hint || "Limited visibility"}</div>
                      <div><strong>MFA Type:</strong> {portal.mfa_type || "unknown"}</div>
                      <div><strong>Support Contact:</strong> {portal.support_contact || "Limited visibility"}</div>
                      <div><strong>Emergency Relevance:</strong> {portal.emergency_relevance ? "Yes" : "No"}</div>
                      <div><strong>Last Verified:</strong> {portal.last_verified_at ? formatDate(portal.last_verified_at) : "Unknown"}</div>
                      <div><strong>Link Type:</strong> {link.link_type || "supporting_access"}</div>
                      <div><strong>Primary Link:</strong> {link.is_primary ? "Yes" : "No"}</div>
                    </div>
                    <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                      {!portal.recovery_contact_hint ? (
                        <div style={{ color: "#7c2d12", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "10px", padding: "10px 12px" }}>
                          Recovery contact hint is still missing for this linked portal.
                        </div>
                      ) : null}
                      {!portal.last_verified_at ? (
                        <div style={{ color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "10px", padding: "10px 12px" }}>
                          Portal verification date has not been recorded yet.
                        </div>
                      ) : null}
                    </div>
                    <div style={{ marginTop: "10px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      {portal.portal_url ? (
                        <a
                          href={portal.portal_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: "10px 14px",
                            borderRadius: "10px",
                            background: "#0f172a",
                            color: "#fff",
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
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No linked portals"
              description="No linked access portals have been recorded for this asset yet."
            />
          )}
        </SectionCard>

        <SectionCard title="Link Existing Portal">
          {existingPortalOptions.length > 0 ? (
            <form onSubmit={handleLinkExistingPortal} style={{ display: "grid", gap: "12px" }}>
              <select
                value={existingPortalForm.portal_profile_id}
                onChange={(event) =>
                  setExistingPortalForm((current) => ({
                    ...current,
                    portal_profile_id: event.target.value,
                  }))
                }
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
              >
                <option value="">Select an existing household portal</option>
                {existingPortalOptions.map((portal) => (
                  <option key={portal.id} value={portal.id}>
                    {portal.portal_name} {portal.institution_name ? `| ${portal.institution_name}` : ""}
                  </option>
                ))}
              </select>
              <select
                value={existingPortalForm.link_type}
                onChange={(event) =>
                  setExistingPortalForm((current) => ({
                    ...current,
                    link_type: event.target.value,
                  }))
                }
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
              >
                {LINK_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#475569" }}>
                <input
                  type="checkbox"
                  checked={existingPortalForm.is_primary}
                  onChange={(event) =>
                    setExistingPortalForm((current) => ({
                      ...current,
                      is_primary: event.target.checked,
                    }))
                  }
                />
                Mark this as the primary linked access record
              </label>
              <textarea
                value={existingPortalForm.notes}
                onChange={(event) =>
                  setExistingPortalForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Link-specific notes"
                style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
              />
              <button
                type="submit"
                disabled={!bundle.asset?.id || !existingPortalForm.portal_profile_id}
                style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
              >
                Link Existing Portal
              </button>
            </form>
          ) : (
            <EmptyState
              title="No reusable portals yet"
              description="Create the first household portal below, then it can be reused across multiple assets."
            />
          )}
        </SectionCard>

        <SectionCard title="Create and Link New Portal">
          <form onSubmit={handleCreatePortal} style={{ display: "grid", gap: "12px" }}>
            <input
              value={portalForm.portal_name}
              onChange={(event) => setPortalForm((current) => ({ ...current, portal_name: event.target.value }))}
              placeholder="Portal name"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <input
              value={portalForm.institution_name}
              onChange={(event) => setPortalForm((current) => ({ ...current, institution_name: event.target.value }))}
              placeholder="Institution name"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <input
              value={portalForm.portal_url}
              onChange={(event) => setPortalForm((current) => ({ ...current, portal_url: event.target.value }))}
              placeholder="Portal URL"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <input
              value={portalForm.username_hint}
              onChange={(event) => setPortalForm((current) => ({ ...current, username_hint: event.target.value }))}
              placeholder="Username hint"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <input
              value={portalForm.recovery_contact_hint}
              onChange={(event) => setPortalForm((current) => ({ ...current, recovery_contact_hint: event.target.value }))}
              placeholder="Recovery contact hint"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <select
              value={portalForm.mfa_type}
              onChange={(event) => setPortalForm((current) => ({ ...current, mfa_type: event.target.value }))}
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              {MFA_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <input
              value={portalForm.support_contact}
              onChange={(event) => setPortalForm((current) => ({ ...current, support_contact: event.target.value }))}
              placeholder="Support contact"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <select
              value={portalForm.access_status}
              onChange={(event) => setPortalForm((current) => ({ ...current, access_status: event.target.value }))}
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              {ACCESS_STATUS.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select
              value={portalForm.link_type}
              onChange={(event) => setPortalForm((current) => ({ ...current, link_type: event.target.value }))}
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              {LINK_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#475569" }}>
              <input
                type="checkbox"
                checked={portalForm.emergency_relevance}
                onChange={(event) => setPortalForm((current) => ({ ...current, emergency_relevance: event.target.checked }))}
              />
              Mark as emergency relevant
            </label>
            <textarea
              value={portalForm.notes}
              onChange={(event) => setPortalForm((current) => ({ ...current, notes: event.target.value }))}
              rows={4}
              placeholder="Portal continuity notes"
              style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
            />
            <button
              type="submit"
              disabled={!bundle.asset?.id || !householdState.context.householdId}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              Create Linked Portal
            </button>
            {loadError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{loadError}</div> : null}
          </form>
        </SectionCard>
      </div>

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Asset Debug: asset={assetId} | household={householdState.context.householdId || "none"} | documents={bundle.documents.length} | alerts={bundle.alerts.length} | tasks={bundle.tasks.length} | portals={bundle.portalLinks.length} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
