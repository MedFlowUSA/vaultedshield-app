import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildReviewAssignmentOptions,
  getHouseholdReviewWorkflowState,
  saveHouseholdReviewWorkflowState,
  annotateReviewWorkflowItems,
  REVIEW_WORKFLOW_STATUSES,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { buildAssetDetailReviewQueueItems } from "../lib/domain/platformIntelligence/reviewQueue";
import { buildReviewWorkspaceRoute, deriveReviewWorkspaceCandidateFromQueueItem } from "../lib/reviewWorkspace/workspaceFilters";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
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
  const { isTablet } = useResponsiveLayout();
  const { householdState, debug: shellDebug, intelligenceBundle } = usePlatformShellData();
  const technicalAnalysisRef = useRef(null);
  const [bundle, setBundle] = useState({
    asset: null,
    documents: [],
    alerts: [],
    tasks: [],
    snapshots: [],
    portalLinks: [],
  });
  const [loadError, setLoadError] = useState("");
  const [reviewWorkflowState, setReviewWorkflowState] = useState({});
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
  const reviewScope = useMemo(
    () => ({
      householdId: householdState.context.householdId,
      userId: shellDebug.authUserId || null,
    }),
    [householdState.context.householdId, shellDebug.authUserId]
  );

  useEffect(() => {
    setReviewWorkflowState(getHouseholdReviewWorkflowState(reviewScope));
  }, [reviewScope]);

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
  }, [assetId, householdState.context.householdId, platformScope]);

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
  const reviewQueueItems = useMemo(
    () => annotateReviewWorkflowItems(buildAssetDetailReviewQueueItems(bundle), reviewWorkflowState || {}),
    [bundle, reviewWorkflowState]
  );
  const reviewItemsById = useMemo(
    () => Object.fromEntries(reviewQueueItems.map((item) => [item.id, item])),
    [reviewQueueItems]
  );
  const topReviewItem = reviewQueueItems[0] || null;
  const reviewWorkspaceRoute = useMemo(() => {
    const filters =
      deriveReviewWorkspaceCandidateFromQueueItem(topReviewItem, reviewScope.householdId || bundle.asset?.household_id || null) || {
        module: "asset",
        issueType: "continuity_gap",
        severity: commandCenter.metrics.critical > 0 ? "high" : commandCenter.metrics.warning > 0 ? "medium" : "low",
        householdId: reviewScope.householdId || bundle.asset?.household_id || null,
        assetId: bundle.asset?.id || null,
        recordId: bundle.asset?.id || null,
      };

    return buildReviewWorkspaceRoute({
      filters,
      openedFromAssistant: true,
    });
  }, [
    bundle.asset?.household_id,
    bundle.asset?.id,
    commandCenter.metrics.critical,
    commandCenter.metrics.warning,
    reviewScope.householdId,
    topReviewItem,
  ]);
  const assetPlainEnglishGuide = useMemo(() => {
    const everydayVerdict =
      commandCenter.metrics.critical > 0
        ? "This asset has important continuity gaps"
        : commandCenter.metrics.warning > 0
          ? "This asset is mostly usable but needs cleanup"
          : "This asset looks reasonably organized";

    const confidenceDriver =
      bundle.portalLinks.length === 0
        ? "There are no linked portals yet, so access continuity is still thin."
        : (bundle.portalContinuity?.missingRecoveryCount || 0) > 0
          ? `${bundle.portalContinuity?.missingRecoveryCount || 0} linked portal${(bundle.portalContinuity?.missingRecoveryCount || 0) === 1 ? "" : "s"} still lack recovery hints, which weakens resilience.`
          : bundle.documents.length === 0
            ? "Portal continuity exists, but the asset still has no linked documents, so the record is lighter than it should be."
            : "The asset has both documentation and portal continuity support, which makes the current read stronger.";

    return {
      eyebrow: "Plain-English First",
      title: "Start here before the continuity details",
      summary: commandCenter.headline,
      transition:
        "This top layer tells you whether the asset looks organized, thin, or risky. The continuity details below explain the blockers, review workflow, documents, alerts, tasks, and portal access setup behind that summary.",
      cards: [
        {
          label: "In plain English",
          value: everydayVerdict,
          detail: commandCenter.headline,
        },
        {
          label: "What to do first",
          value: topReviewItem?.title || "Review the top continuity blocker",
          detail: topReviewItem?.summary || commandCenter.blockers?.[0]?.nextAction || "Use Continuity Command to clear the next blocker.",
        },
        {
          label: "Why confidence is limited or strong",
          value: `${bundle.portalLinks.length} portal link${bundle.portalLinks.length === 1 ? "" : "s"} visible`,
          detail: confidenceDriver,
        },
      ],
      quickFacts: [
        bundle.documents.length > 0
          ? `${bundle.documents.length} linked document${bundle.documents.length === 1 ? "" : "s"} are visible for this asset.`
          : "No linked documents are visible for this asset yet.",
        bundle.alerts.length > 0
          ? `${bundle.alerts.length} open alert${bundle.alerts.length === 1 ? "" : "s"} are attached to this asset.`
          : "No open alerts are currently attached to this asset.",
        bundle.tasks.length > 0
          ? `${bundle.tasks.length} task${bundle.tasks.length === 1 ? "" : "s"} are visible for this asset.`
          : "No open tasks are currently linked to this asset.",
      ],
    };
  }, [bundle.alerts.length, bundle.documents.length, bundle.portalContinuity?.missingRecoveryCount, bundle.portalLinks.length, bundle.tasks.length, commandCenter, topReviewItem]);
  const assigneeChoices = useMemo(() => buildReviewAssignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);
  const dualRailLayout = isTablet ? "1fr" : "1.25fr 1fr";
  const splitLayout = isTablet ? "1fr" : "1fr 1fr";
  const portalLayout = isTablet ? "1fr" : "1.1fr 1fr";

  function handleReviewWorkflowUpdate(itemId, status) {
    if (!reviewScope.householdId || !itemId) return;

    const nextState = {
      ...reviewWorkflowState,
      [itemId]: {
        ...(reviewWorkflowState[itemId] || {}),
        status,
        updated_at: new Date().toISOString(),
      },
    };

    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

  function handleReviewAssignmentUpdate(itemId, assigneeKey) {
    if (!reviewScope.householdId || !itemId) return;
    const assignee = assigneeChoices.find((option) => option.key === assigneeKey) || assigneeChoices[0];
    const nextState = {
      ...reviewWorkflowState,
      [itemId]: {
        ...(reviewWorkflowState[itemId] || {}),
        assignee_key: assignee?.key || "",
        assignee_label: assignee?.label || "Unassigned",
        assigned_at: assignee?.key ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
    };

    setReviewWorkflowState(nextState);
    saveHouseholdReviewWorkflowState(reviewScope, nextState);
  }

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

      <section
        style={{
          marginTop: "24px",
          display: "grid",
          gap: "20px",
          padding: isTablet ? "24px 18px" : "30px 32px",
          borderRadius: "24px",
          background:
            "radial-gradient(circle at top left, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0) 30%), radial-gradient(circle at top right, rgba(56,189,248,0.14) 0%, rgba(56,189,248,0) 34%), linear-gradient(135deg, rgba(255,247,237,0.98) 0%, rgba(255,255,255,1) 58%, rgba(240,249,255,0.96) 100%)",
          border: "1px solid rgba(251, 146, 60, 0.18)",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.15fr) minmax(280px, 0.85fr)",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "12px", minWidth: 0, padding: isTablet ? "2px 2px 0" : "4px 4px 0" }}>
            <div
              style={{
                width: "fit-content",
                padding: "7px 11px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.82)",
                border: "1px solid rgba(251, 146, 60, 0.18)",
                boxShadow: "0 8px 20px rgba(251, 146, 60, 0.08)",
                fontSize: "11px",
                color: "#c2410c",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontWeight: 800,
              }}
            >
              {assetPlainEnglishGuide.eyebrow}
            </div>
            <div style={{ fontSize: isTablet ? "26px" : "34px", fontWeight: 800, color: "#0f172a", lineHeight: "1.08", letterSpacing: "-0.04em" }}>
              {assetPlainEnglishGuide.title}
            </div>
            <div style={{ fontSize: "20px", color: "#0f172a", fontWeight: 700, lineHeight: "1.45", maxWidth: "42rem" }}>
              {assetPlainEnglishGuide.summary}
            </div>
            <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "46rem" }}>{assetPlainEnglishGuide.transition}</div>
          </div>

          <div
            style={{
              padding: isTablet ? "18px 18px 20px" : "20px 20px 22px",
              borderRadius: "24px",
              background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)",
              border: "1px solid rgba(148, 163, 184, 0.16)",
              display: "grid",
              gap: "14px",
              boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "999px",
                  background: "linear-gradient(135deg, #f97316 0%, #fb7185 100%)",
                  boxShadow: "0 0 0 5px rgba(249,115,22,0.12)",
                }}
              />
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Quick Read
              </div>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "10px", color: "#334155" }}>
              {assetPlainEnglishGuide.quickFacts.map((item) => (
                <li
                  key={item}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "16px minmax(0, 1fr)",
                    gap: "10px",
                    alignItems: "start",
                    padding: "10px 12px",
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.78)",
                    border: "1px solid rgba(226,232,240,0.9)",
                    lineHeight: "1.65",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      marginTop: "8px",
                      borderRadius: "999px",
                      background: "#0f172a",
                    }}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{ padding: "11px 16px", borderRadius: "999px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, boxShadow: "0 12px 24px rgba(15, 23, 42, 0.18)" }}
              >
                Open Continuity Details
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.(reviewWorkspaceRoute)}
                style={{ padding: "11px 16px", borderRadius: "999px", border: "1px solid rgba(148, 163, 184, 0.35)", background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 700, boxShadow: "0 10px 22px rgba(148, 163, 184, 0.12)" }}
              >
                Open Review Workspace
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: "14px",
          }}
        >
          {assetPlainEnglishGuide.cards.map((card) => (
            <div
              key={card.label}
              style={{
                padding: isTablet ? "18px 18px 20px" : "20px 20px 22px",
                borderRadius: "22px",
                background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.94) 100%)",
                border: "1px solid rgba(148, 163, 184, 0.16)",
                display: "grid",
                gap: "10px",
                boxShadow: "0 12px 28px rgba(15, 23, 42, 0.05)",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                {card.label}
              </div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", lineHeight: "1.25" }}>{card.value}</div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{card.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section
        ref={technicalAnalysisRef}
        style={{
          marginTop: "24px",
          display: "grid",
          gap: "10px",
          padding: isTablet ? "20px 18px" : "22px 26px",
          borderRadius: "24px",
          background: "radial-gradient(circle at top right, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0) 34%), linear-gradient(180deg, #0f172a 0%, #111827 100%)",
          color: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.12)",
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.16)",
        }}
      >
        <div style={{ fontSize: "12px", color: "rgba(191, 219, 254, 0.92)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
          Deeper Review Starts Here
        </div>
        <div style={{ fontSize: isTablet ? "22px" : "26px", fontWeight: 800, lineHeight: "1.2", letterSpacing: "-0.03em" }}>
          Continuity blockers, review workflow, documents, alerts, tasks, and portal-access resilience
        </div>
        <div style={{ color: "rgba(226, 232, 240, 0.9)", lineHeight: "1.8", maxWidth: "60rem" }}>
          Everything below this point is the proof layer. It explains what is blocking this asset, how follow-up work should be tracked, and whether access and recovery details are strong enough to trust in a real handoff.
        </div>
      </section>

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
                  {(() => {
                    const workflowItem = reviewItemsById[`asset:${bundle.asset?.id}:${item.id}`] || null;
                    return (
                      <>
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
                        {workflowItem ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "5px 9px",
                              borderRadius: "999px",
                              fontSize: "11px",
                              fontWeight: 700,
                              color:
                                workflowItem.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key
                                  ? "#166534"
                                  : workflowItem.workflow_status === REVIEW_WORKFLOW_STATUSES.pending_documents.key
                                    ? "#92400e"
                                    : workflowItem.workflow_status === REVIEW_WORKFLOW_STATUSES.follow_up.key
                                      ? "#9a3412"
                                      : "#475569",
                              background:
                                workflowItem.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key
                                  ? "#dcfce7"
                                  : workflowItem.workflow_status === REVIEW_WORKFLOW_STATUSES.pending_documents.key
                                    ? "#fef3c7"
                                    : workflowItem.workflow_status === REVIEW_WORKFLOW_STATUSES.follow_up.key
                                      ? "#ffedd5"
                                      : "#ffffff",
                              border: "1px solid #e2e8f0",
                            }}
                          >
                            {workflowItem.workflow_label}
                          </span>
                        ) : null}
                      </div>
                  </div>
                  <div style={{ color: "#0f172a", lineHeight: "1.7" }}>{item.blocker}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{item.consequence}</div>
                  <div style={{ color: "#334155", fontWeight: 700 }}>{item.nextAction}</div>
                  {workflowItem ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "5px 9px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: workflowItem.workflow_assignee_key ? "#1d4ed8" : "#64748b",
                            background: workflowItem.workflow_assignee_key ? "#dbeafe" : "#e2e8f0",
                          }}
                        >
                          Owner: {workflowItem.workflow_assignee_label}
                        </span>
                        <select
                          value={workflowItem.workflow_assignee_key || ""}
                          onChange={(event) => handleReviewAssignmentUpdate(workflowItem.id, event.target.value)}
                          style={{
                            border: "1px solid #e2e8f0",
                            background: "#ffffff",
                            borderRadius: "10px",
                            padding: "9px 12px",
                            fontWeight: 700,
                            color: "#475569",
                            cursor: "pointer",
                          }}
                        >
                          {assigneeChoices.map((option) => (
                            <option key={option.key || "unassigned"} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleReviewWorkflowUpdate(workflowItem.id, REVIEW_WORKFLOW_STATUSES.pending_documents.key)}
                        style={{
                          border: "1px solid #e2e8f0",
                          background: "#ffffff",
                          borderRadius: "10px",
                          padding: "9px 12px",
                          fontWeight: 700,
                          color: "#475569",
                          cursor: "pointer",
                        }}
                      >
                        Pending Docs
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewWorkflowUpdate(workflowItem.id, REVIEW_WORKFLOW_STATUSES.follow_up.key)}
                        style={{
                          border: "1px solid #e2e8f0",
                          background: "#ffffff",
                          borderRadius: "10px",
                          padding: "9px 12px",
                          fontWeight: 700,
                          color: "#475569",
                          cursor: "pointer",
                        }}
                      >
                        Follow Up
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewWorkflowUpdate(workflowItem.id, REVIEW_WORKFLOW_STATUSES.reviewed.key)}
                        style={{
                          border: "none",
                          background: "#0f172a",
                          borderRadius: "10px",
                          padding: "9px 12px",
                          fontWeight: 700,
                          color: "#ffffff",
                          cursor: "pointer",
                        }}
                      >
                        {workflowItem.changed_since_review ? "Review Again" : "Mark Reviewed"}
                      </button>
                      </div>
                    </div>
                  ) : null}
                      </>
                    );
                  })()}
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

        <SectionCard title="Review Workspace Handoff">
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              Continuity Command already explains the current blockers on this asset. Shared follow-up belongs in Review Workspace so portal, document, task, and alert gaps can be tracked without repeating the same summary in a second AI card.
            </div>
            <div
              style={{
                padding: "18px 20px",
                borderRadius: "18px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#dbeafe", color: "#1d4ed8", fontWeight: 700, fontSize: "12px" }}>
                  {reviewQueueItems.length} open asset workstream{reviewQueueItems.length === 1 ? "" : "s"}
                </div>
                <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#e2e8f0", color: "#475569", fontWeight: 700, fontSize: "12px" }}>
                  {bundle.portalLinks.length} portal link{bundle.portalLinks.length === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>
                {topReviewItem?.summary || commandCenter.headline}
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => onNavigate?.(reviewWorkspaceRoute)}
                  style={{ padding: "10px 14px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                >
                  Open Review Workspace
                </button>
                {topReviewItem?.route ? (
                  <button
                    type="button"
                    onClick={() => onNavigate?.(topReviewItem.route)}
                    style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
                  >
                    Open Top Asset Review
                  </button>
                ) : null}
              </div>
            </div>
          </div>
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

      {shouldShowDevDiagnostics() ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Asset Debug: asset={assetId} | household={householdState.context.householdId || "none"} | documents={bundle.documents.length} | alerts={bundle.alerts.length} | tasks={bundle.tasks.length} | portals={bundle.portalLinks.length} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
