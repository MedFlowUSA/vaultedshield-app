import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import StatusBadge from "../components/shared/StatusBadge";
import {
  getHealthCarrier,
  getHealthDocumentClass,
  getHealthPlanType,
  listHealthCarriers,
} from "../lib/domain/healthInsurance";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  getHealthPlanBundle,
  listHealthDocumentClasses,
  uploadHealthDocument,
} from "../lib/supabase/healthData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import { buildReviewWorkspaceRoute, deriveReviewWorkspaceCandidateFromQueueItem } from "../lib/reviewWorkspace/workspaceFilters";
import { getAssetDetailBundle } from "../lib/supabase/platformData";
import { buildHealthCommandCenter } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import {
  annotateReviewWorkflowItems,
  buildReviewAssignmentOptions,
  getHouseholdReviewWorkflowState,
  REVIEW_WORKFLOW_STATUSES,
  saveHouseholdReviewWorkflowState,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { buildHealthDetailReviewQueueItems } from "../lib/domain/platformIntelligence/reviewQueue";

const HEALTH_DOCUMENT_CLASSES = listHealthDocumentClasses();
const HEALTH_CARRIERS = listHealthCarriers();

const DEFAULT_UPLOAD_FORM = {
  document_class_key: "summary_of_benefits",
  carrier_key: "",
  document_date: "",
  notes: "",
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

function formatDate(value) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "renewal_pending" || status === "review") return "warning";
  return "info";
}

export default function HealthPlanDetailPage({ healthPlanId, onNavigate }) {
  const { householdState, debug: shellDebug, intelligenceBundle } = usePlatformShellData();
  const fileInputRef = useRef(null);
  const technicalAnalysisRef = useRef(null);
  const [bundle, setBundle] = useState(null);
  const [assetBundle, setAssetBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadForm, setUploadForm] = useState(DEFAULT_UPLOAD_FORM);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [reviewWorkflowState, setReviewWorkflowState] = useState({});
  const platformScope = useMemo(
    () => ({
      householdId: householdState.context.householdId || null,
      authUserId: shellDebug.authUserId || null,
      ownershipMode: householdState.context.ownershipMode || "unknown",
      guestFallbackActive: householdState.context.guestFallbackActive,
      scopeSource: "health_detail_page",
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

  const loadHealthBundle = useCallback(async (targetHealthPlanId, options = {}) => {
    const result = await getHealthPlanBundle(targetHealthPlanId);
    if (result.error || !result.data?.healthPlan) {
      if (!options.silent) {
        setBundle(null);
        setAssetBundle(null);
        setLoadError(result.error?.message || "Health plan bundle could not be loaded.");
      }
      return { data: null, error: result.error || new Error("Health plan bundle could not be loaded.") };
    }

    setBundle(result.data);
    if (!options.silent) setLoadError("");

    const linkedAssetId = result.data.healthPlan.assets?.id;
    if (linkedAssetId) {
      const assetResult = await getAssetDetailBundle(linkedAssetId, platformScope);
      if (!assetResult.error) {
        setAssetBundle(assetResult.data || null);
      } else if (!options.silent) {
        setAssetBundle(null);
        setLoadError(assetResult.error.message || "");
      }
    } else {
      setAssetBundle(null);
    }

    return { data: result.data, error: null };
  }, [platformScope]);

  useEffect(() => {
    if (!healthPlanId) return;
    let active = true;
    async function loadBundle() {
      setLoading(true);
      await loadHealthBundle(healthPlanId);
      if (!active) return;
      setLoading(false);
    }
    loadBundle();
    return () => {
      active = false;
    };
  }, [healthPlanId, loadHealthBundle, scopeKey]);

  const healthPlan = bundle?.healthPlan || null;
  const healthPlanType = healthPlan
    ? getHealthPlanType(healthPlan.health_plan_type_key)
    : null;
  const linkedAsset = healthPlan?.assets || null;
  const healthCommandCenter = useMemo(
    () =>
      buildHealthCommandCenter({
        healthPlan,
        healthDocuments: bundle?.healthDocuments || [],
        healthSnapshots: bundle?.healthSnapshots || [],
        healthAnalytics: bundle?.healthAnalytics || [],
        assetBundle,
      }),
    [
      assetBundle,
      bundle?.healthAnalytics,
      bundle?.healthDocuments,
      bundle?.healthSnapshots,
      healthPlan,
    ]
  );
  const healthReviewQueueItems = useMemo(
    () =>
      annotateReviewWorkflowItems(
        buildHealthDetailReviewQueueItems({
          healthPlan,
          healthBundle: bundle,
          assetBundle,
          healthCommandCenter,
        }),
        reviewWorkflowState || {}
      ),
    [assetBundle, bundle, healthCommandCenter, healthPlan, reviewWorkflowState]
  );
  const healthReviewItemsById = useMemo(
    () => Object.fromEntries(healthReviewQueueItems.map((item) => [item.id, item])),
    [healthReviewQueueItems]
  );
  const topHealthReviewItem = healthReviewQueueItems[0] || null;
  const healthReviewWorkspaceRoute = useMemo(() => {
    const filters =
      deriveReviewWorkspaceCandidateFromQueueItem(topHealthReviewItem, reviewScope.householdId || healthPlan?.household_id || null) || {
        module: "health",
        issueType: "policy_review_issue",
        severity: healthCommandCenter.metrics.critical > 0 ? "high" : healthCommandCenter.metrics.warning > 0 ? "medium" : "low",
        householdId: reviewScope.householdId || healthPlan?.household_id || null,
        assetId: linkedAsset?.id || null,
        recordId: healthPlan?.id || null,
      };

    return buildReviewWorkspaceRoute({
      filters,
      openedFromAssistant: true,
    });
  }, [
    healthCommandCenter.metrics.critical,
    healthCommandCenter.metrics.warning,
    healthPlan?.household_id,
    healthPlan?.id,
    linkedAsset?.id,
    reviewScope.householdId,
    topHealthReviewItem,
  ]);
  const assigneeChoices = useMemo(() => buildReviewAssignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);

  const plainLanguageGuide = useMemo(() => {
    const documentCount = bundle?.healthDocuments?.length || 0;
    const snapshotCount = bundle?.healthSnapshots?.length || 0;
    const topBlocker = healthCommandCenter.blockers?.[0] || null;
    const everydayVerdict =
      healthCommandCenter.metrics.critical > 0
        ? "This health plan has important coverage or continuity gaps"
        : healthCommandCenter.metrics.warning > 0
          ? "This health plan looks usable but needs review"
          : "This health plan looks reasonably supported";

    return {
      title: "Start here before the technical health-plan review",
      summary: healthCommandCenter.headline,
      transition:
        "This top layer gives the simple read first. The technical section below breaks out blockers, workflow, linked records, documents, snapshots, and analytics.",
      quickFacts: [
        documentCount > 0
          ? `${documentCount} health-plan document${documentCount === 1 ? "" : "s"} are visible.`
          : "No health-plan documents are visible yet.",
        snapshotCount > 0
          ? `${snapshotCount} normalized health snapshot${snapshotCount === 1 ? "" : "s"} are available.`
          : "No normalized health snapshots are available yet.",
        topHealthReviewItem?.summary || "No single health-plan issue is standing out above the rest right now.",
      ],
      cards: [
        { label: "In plain English", value: everydayVerdict, detail: healthCommandCenter.headline },
        { label: "What to do first", value: topHealthReviewItem?.title || "Open the review workspace", detail: topBlocker?.nextAction || topHealthReviewItem?.summary || "Review the top health-plan blocker first." },
        { label: "Why confidence is limited or strong", value: `${documentCount} document${documentCount === 1 ? "" : "s"} visible`, detail: documentCount === 0 ? "Without benefit summaries or supporting records, this read stays fairly thin." : "Document support gives this health-plan review a more reliable starting point." },
      ],
    };
  }, [bundle?.healthDocuments?.length, bundle?.healthSnapshots?.length, healthCommandCenter, topHealthReviewItem]);

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

  function enqueueFiles(fileList) {
    const entries = Array.from(fileList || []).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      status: "queued",
      assetDocumentId: null,
      healthDocumentId: null,
      storagePath: "",
      duplicate: false,
      errorSummary: "",
    }));
    setUploadQueue((current) => [...entries, ...current]);
  }

  async function handleUploadDocuments(event) {
    event.preventDefault();
    if (!healthPlan || !linkedAsset?.id || uploadQueue.length === 0) return;

    setUploading(true);
    setUploadError("");

    for (const item of uploadQueue) {
      if (item.status !== "queued" && item.status !== "failed") continue;

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", errorSummary: "" } : entry
        )
      );

      const result = await uploadHealthDocument({
        household_id: healthPlan.household_id,
        asset_id: linkedAsset.id,
        health_plan_id: healthPlan.id,
        file: item.file,
        document_class_key: uploadForm.document_class_key,
        carrier_key: uploadForm.carrier_key || healthPlan.carrier_key || null,
        document_date: uploadForm.document_date || null,
        notes: uploadForm.notes || null,
        metadata: { health_detail_upload: true },
      });

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: result.error ? "failed" : "saved",
                assetDocumentId: result.data?.assetDocument?.id || null,
                healthDocumentId: result.data?.healthDocument?.id || null,
                storagePath: result.upload?.storagePath || "",
                duplicate: Boolean(result.duplicate),
                errorSummary: result.error?.message || result.upload?.errorSummary || "",
              }
            : entry
        )
      );

      if (result.error) {
        setUploadError(result.error.message || "Health upload failed.");
        continue;
      }

      await loadHealthBundle(healthPlan.id, { silent: true });
    }

    setUploading(false);
  }

  function scrollToHealthTechnicalAnalysis() {
    technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const healthHeroGlanceItems = [
    { label: "Plan Status", value: healthPlan?.plan_status || "Unknown" },
    { label: "Documents", value: bundle?.healthDocuments?.length || 0 },
    { label: "Snapshots", value: bundle?.healthSnapshots?.length || 0 },
    { label: "Analytics", value: bundle?.healthAnalytics?.length || 0 },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {loading ? (
        <div style={{ padding: "40px 24px", borderRadius: "20px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: "18px" }}>Loading health plan detail</div>
          <div style={{ marginTop: "8px", color: "#334155" }}>VaultedShield is pulling together the plan, benefits documents, and supporting coverage evidence.</div>
        </div>
      ) : !healthPlan ? (
        <div style={{ padding: "40px 24px", borderRadius: "20px", background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e", textAlign: "center", display: "grid", gap: "16px" }}>
          <div style={{ fontWeight: 800, fontSize: "18px" }}>Health plan not found</div>
          <div style={{ color: "#78350f" }}>{loadError || "This health plan detail page could not load a matching plan record."}</div>
          <button type="button" onClick={() => onNavigate("/insurance/health")} style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#92400e", color: "#ffffff", fontWeight: 700, cursor: "pointer", justifySelf: "center" }}>
            Back To Health Hub
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: "20px" }}>
            <div
              style={{
                padding: "32px 36px",
                borderRadius: "24px",
                background: "linear-gradient(135deg, #0f172a 0%, #065f46 100%)",
                color: "#ffffff",
                display: "grid",
                gap: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>Insurance</div>
                  <div style={{ fontSize: "24px", fontWeight: 900, lineHeight: "1.2" }}>{healthPlan.plan_name || linkedAsset?.asset_name || "Health Plan Detail"}</div>
                  <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>{plainLanguageGuide.summary}</div>
                </div>
                <div style={{ padding: "16px 20px", borderRadius: "18px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", display: "grid", gap: "4px", textAlign: "center", minWidth: "100px", flexShrink: 0 }}>
                  <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#6ee7b7" }}>{Math.min(100, Math.max(0, 42 + (bundle?.healthDocuments?.length || 0) * 8 + (bundle?.healthSnapshots?.length || 0) * 6))}</div>
                  <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>support</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
                {healthHeroGlanceItems.map((item) => (
                  <div key={item.label} style={{ padding: "10px 14px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                    <div style={{ fontSize: "11px", opacity: 0.55, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
                    <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "2px" }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#065f46", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                  Upload Plan Files
                </button>
                <button type="button" onClick={() => onNavigate(healthReviewWorkspaceRoute)} style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                  Open Review Workspace
                </button>
                <button type="button" onClick={() => onNavigate("/insurance/health")} style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                  Back To Health Hub
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
              {[
                {
                  kicker: "Simple Read",
                  title: plainLanguageGuide.cards[0]?.value || "Read the plan status first",
                  detail: plainLanguageGuide.cards[0]?.detail || healthCommandCenter.headline,
                  metric: `${bundle?.healthDocuments?.length || 0} document${bundle?.healthDocuments?.length === 1 ? "" : "s"}`,
                  tone: healthCommandCenter.metrics.critical > 0 ? "alert" : healthCommandCenter.metrics.warning > 0 ? "warning" : "good",
                  statusLabel: "Simple Read",
                  actionLabel: "See Supporting Details",
                  onAction: scrollToHealthTechnicalAnalysis,
                },
                {
                  kicker: "Best First Step",
                  title: plainLanguageGuide.cards[1]?.value || "Open the review workspace",
                  detail: plainLanguageGuide.cards[1]?.detail || topHealthReviewItem?.summary || "Take the next health-plan step.",
                  metric: `${healthReviewQueueItems.length} review item${healthReviewQueueItems.length === 1 ? "" : "s"}`,
                  tone: "warning",
                  statusLabel: "Guided Focus",
                  actionLabel: "Open Review Workspace",
                  onAction: () => onNavigate(healthReviewWorkspaceRoute),
                },
                {
                  kicker: "Evidence Support",
                  title: plainLanguageGuide.cards[2]?.value || "Confidence is still forming",
                  detail: plainLanguageGuide.cards[2]?.detail || "The read strengthens as benefits documents and evidence become more visible.",
                  metric: `${bundle?.healthSnapshots?.length || 0} snapshot${bundle?.healthSnapshots?.length === 1 ? "" : "s"}`,
                  tone: bundle?.healthDocuments?.length ? "good" : "warning",
                  statusLabel: bundle?.healthDocuments?.length ? "Well Supported" : "Missing Information",
                  actionLabel: "Upload Files",
                  onAction: () => fileInputRef.current?.click(),
                },
              ].map((tile) => (
                <div key={tile.kicker} style={{ padding: "20px", borderRadius: "18px", background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: "12px", alignContent: "start" }}>
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

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <StatusBadge label={healthPlanType?.display_name || healthPlan.health_plan_type_key} tone="info" />
              <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
            </div>
          </div>

          <div ref={technicalAnalysisRef} style={{ ...surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" }), marginTop: "24px" }}>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Health Command</div>
              <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>The strongest health coverage blockers, why they matter, and what to do next on this plan.</div>
            </div>
            <div style={{ display: "grid", gap: "16px" }}>
              <AIInsightPanel
                title="Coverage Command"
                summary={healthCommandCenter.headline}
                bullets={[
                  `${healthCommandCenter.metrics.critical || 0} critical blocker${healthCommandCenter.metrics.critical === 1 ? "" : "s"} are active.`,
                  `${healthCommandCenter.metrics.warning || 0} warning item${healthCommandCenter.metrics.warning === 1 ? "" : "s"} should be reviewed soon.`,
                  `${healthCommandCenter.metrics.documents || 0} health document${healthCommandCenter.metrics.documents === 1 ? "" : "s"} are attached.`,
                  `${healthCommandCenter.metrics.snapshots || 0} snapshot${healthCommandCenter.metrics.snapshots === 1 ? "" : "s"} and ${healthCommandCenter.metrics.analytics || 0} analytic${healthCommandCenter.metrics.analytics === 1 ? "" : "s"} are visible.`,
                ]}
              />
              {healthCommandCenter.blockers.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {healthCommandCenter.blockers.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "16px",
                        borderRadius: "14px",
                        background: item.urgencyMeta.background,
                        border: item.urgencyMeta.border,
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      {(() => {
                        const workflowItem = healthReviewItemsById[`health:${healthPlan?.id}:${item.id}`] || null;
                        return (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                <StatusBadge label={item.urgencyMeta.badge} tone={item.urgency === "critical" ? "alert" : "warning"} />
                                <StatusBadge label={item.staleLabel} tone="info" />
                                {workflowItem ? (
                                  <StatusBadge
                                    label={workflowItem.workflow_label}
                                    tone={
                                      workflowItem.workflow_status === REVIEW_WORKFLOW_STATUSES.reviewed.key
                                        ? "good"
                                        : workflowItem.workflow_status === REVIEW_WORKFLOW_STATUSES.pending_documents.key
                                          ? "warning"
                                          : workflowItem.workflow_status === REVIEW_WORKFLOW_STATUSES.follow_up.key
                                            ? "alert"
                                            : "info"
                                    }
                                  />
                                ) : null}
                              </div>
                            </div>
                            <div style={{ color: "#0f172a", lineHeight: "1.7" }}>
                              <strong>Blocker:</strong> {item.blocker}
                            </div>
                            <div style={{ color: "#475569", lineHeight: "1.7" }}>
                              <strong>Consequence:</strong> {item.consequence}
                            </div>
                            <div style={{ color: item.urgencyMeta.accent, fontWeight: 700, lineHeight: "1.7" }}>
                              Next action: {item.nextAction}
                            </div>
                            {workflowItem ? (
                              <div style={{ display: "grid", gap: "8px" }}>
                                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                                  <StatusBadge
                                    label={`Owner: ${workflowItem.workflow_assignee_label}`}
                                    tone={workflowItem.workflow_assignee_key ? "info" : "neutral"}
                                  />
                                  <select
                                    value={workflowItem.workflow_assignee_key || ""}
                                    onChange={(event) => handleReviewAssignmentUpdate(workflowItem.id, event.target.value)}
                                    style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}
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
                                  style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}
                                >
                                  Pending Docs
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewWorkflowUpdate(workflowItem.id, REVIEW_WORKFLOW_STATUSES.follow_up.key)}
                                  style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}
                                >
                                  Follow Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewWorkflowUpdate(workflowItem.id, REVIEW_WORKFLOW_STATUSES.reviewed.key)}
                                  style={{ padding: "9px 12px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
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
                  title="No active health blockers"
                  description="This health plan currently looks relatively steady across evidence, renewal, and access continuity."
                />
              )}
            </div>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "18px" }}>
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Health Plan Summary</div>
              <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Plan Name:</strong> {healthPlan.plan_name || linkedAsset?.asset_name || "Limited visibility"}</div>
                <div><strong>Plan Type:</strong> {healthPlanType?.display_name || healthPlan.health_plan_type_key}</div>
                <div><strong>Carrier:</strong> {getHealthCarrier(healthPlan.carrier_key)?.display_name || healthPlan.carrier_key || linkedAsset?.institution_name || "Limited visibility"}</div>
                <div><strong>Subscriber:</strong> {healthPlan.subscriber_name || "Limited visibility"}</div>
                <div><strong>Employer Group:</strong> {healthPlan.employer_group_name || "Limited visibility"}</div>
                <div><strong>Effective:</strong> {formatDate(healthPlan.effective_date)}</div>
                <div><strong>Renewal:</strong> {formatDate(healthPlan.renewal_date)}</div>
                <div><strong>Status:</strong> <StatusBadge label={healthPlan.plan_status || "unknown"} tone={getStatusTone(healthPlan.plan_status)} /></div>
              </div>
            </div>

            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Linked Platform Asset Summary</div>
              {linkedAsset ? (
                <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                  <div><strong>Asset Name:</strong> {linkedAsset.asset_name}</div>
                  <div><strong>Category:</strong> {linkedAsset.asset_category}</div>
                  <div><strong>Subcategory:</strong> {linkedAsset.asset_subcategory || "Limited visibility"}</div>
                  <div><strong>Institution:</strong> {linkedAsset.institution_name || "Limited visibility"}</div>
                  <div><strong>Status:</strong> {linkedAsset.status || "Limited visibility"}</div>
                  <div style={{ color: "#64748b" }}>
                    This health record remains linked to the broader platform asset layer so shared documents, portals, alerts, and tasks can continue to coexist cleanly.
                  </div>
                </div>
              ) : (
                <EmptyState title="No linked household summary" description="This health plan is not yet connected to a broader household asset summary." />
              )}
            </div>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "18px" }}>
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Health Documents</div>
              {bundle.healthDocuments.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.healthDocuments.map((document) => (
                    <div key={document.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {document.asset_documents?.file_name || document.document_class_key || "Health document"}
                      </div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Document Class:</strong> {getHealthDocumentClass(document.document_class_key)?.display_name || document.document_class_key || "Limited visibility"}</div>
                        <div><strong>Carrier:</strong> {getHealthCarrier(document.carrier_key)?.display_name || document.carrier_key || "Limited visibility"}</div>
                        <div><strong>Document Date:</strong> {formatDate(document.document_date)}</div>
                        <div><strong>Created:</strong> {formatDate(document.created_at)}</div>
                        <div><strong>Household Document Link:</strong> {document.asset_document_id || "Not linked yet"}</div>
                        <div><strong>Asset Document Status:</strong> {document.asset_documents?.processing_status || "Not available"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No health documents yet" description="Health-specific document records will appear here as uploads are classified and linked." />
              )}
            </div>

            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Health Document Intake</div>
              <form onSubmit={handleUploadDocuments} style={{ display: "grid", gap: "12px" }}>
                <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); enqueueFiles(event.dataTransfer.files); }} style={{ border: "1px dashed #94a3b8", borderRadius: "16px", padding: "20px", background: "#f8fafc" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop health documents here</div>
                  <p style={{ marginTop: "8px", color: "#64748b", lineHeight: "1.6" }}>
                    Upload summaries of benefits, ID-card references, renewal notices, EOBs, and related health documents into this plan. The original file is saved in the household vault and then linked into the health module.
                  </p>
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(event) => enqueueFiles(event.target.files)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700 }}>
                    Select Health Documents
                  </button>
                </div>
                <select value={uploadForm.document_class_key} onChange={(event) => setUploadForm((current) => ({ ...current, document_class_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  {HEALTH_DOCUMENT_CLASSES.map((documentClass) => (
                    <option key={documentClass.document_class_key} value={documentClass.document_class_key}>
                      {documentClass.display_name}
                    </option>
                  ))}
                </select>
                <select value={uploadForm.carrier_key} onChange={(event) => setUploadForm((current) => ({ ...current, carrier_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">No carrier selected</option>
                  {HEALTH_CARRIERS.map((carrier) => (
                    <option key={carrier.carrier_key} value={carrier.carrier_key}>
                      {carrier.display_name}
                    </option>
                  ))}
                </select>
                <input type="date" value={uploadForm.document_date} onChange={(event) => setUploadForm((current) => ({ ...current, document_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
                <textarea value={uploadForm.notes} onChange={(event) => setUploadForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Optional intake notes" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }} />
                <button type="submit" disabled={uploading || uploadQueue.length === 0 || !linkedAsset?.id} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                  {uploading ? "Uploading Health Documents..." : "Upload Health Documents"}
                </button>
                {uploadError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{uploadError}</div> : null}
              </form>

              <div style={{ marginTop: "16px" }}>
                {uploadQueue.length > 0 ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {uploadQueue.map((item) => (
                      <div key={item.id} style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.file.name}</div>
                        <div style={{ marginTop: "4px", color: "#64748b" }}>
                          {uploadForm.document_class_key}
                          {uploadForm.carrier_key ? ` | ${uploadForm.carrier_key}` : ""}
                          {uploadForm.document_date ? ` | ${uploadForm.document_date}` : ""}
                        </div>
                        <div style={{ marginTop: "8px", color: "#475569" }}>
                          Status: {item.status}
                          {item.duplicate ? " | Existing household upload reused" : ""}
                          {item.storagePath ? ` | ${item.storagePath}` : ""}
                        </div>
                        {item.errorSummary ? <div style={{ marginTop: "6px", color: "#991b1b" }}>{item.errorSummary}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No health files queued" description="Add one or more health documents to create linked generic and health-specific document records." />
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Health Snapshots</div>
              {bundle.healthSnapshots.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.healthSnapshots.map((snapshot) => (
                    <div key={snapshot.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{snapshot.snapshot_type || "health_snapshot"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Snapshot Date:</strong> {formatDate(snapshot.snapshot_date)}</div>
                        <div><strong>Completeness:</strong> {snapshot.completeness_assessment?.status || "Not assessed yet"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No health snapshots yet" description="Health snapshots will land here after later health-plan parsing is added." />
              )}
            </div>

            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Health Analytics</div>
              {bundle.healthAnalytics.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.healthAnalytics.map((analytics) => (
                    <div key={analytics.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{analytics.analytics_type || "health_analytics"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Review Flags:</strong> {analytics.review_flags?.length ? analytics.review_flags.join(", ") : "None yet"}</div>
                        <div><strong>Created:</strong> {formatDate(analytics.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No health analytics yet" description="Health intelligence will appear here after future parsing and review passes are added." />
              )}
            </div>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Linked Portals</div>
              {assetBundle?.portalLinks?.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {assetBundle.portalLinks.map((link) => {
                    const portal = link.portal_profiles || {};
                    return (
                      <div key={link.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{portal.portal_name || "Linked portal"}</div>
                        <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.7" }}>
                          <div><strong>Institution:</strong> {portal.institution_name || "Limited visibility"}</div>
                          <div><strong>Recovery Hint:</strong> {portal.recovery_contact_hint || "Limited visibility"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No linked portals yet" description="Portal continuity records will surface here through the linked platform asset when health carrier access continuity is mapped." />
              )}
            </div>

          </div>

          {shouldShowDevDiagnostics() ? (
            <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "8px" })}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Health Debug</div>
              <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                health_plan_id={healthPlan.id} | asset_id={linkedAsset?.id || "none"} | household_id={healthPlan.household_id || "none"} | documents={bundle.healthDocuments.length} | snapshots={bundle.healthSnapshots.length} | analytics={bundle.healthAnalytics.length} | uploadAttempts={uploadQueue.length} | assetDocumentIds={uploadQueue.map((item) => item.assetDocumentId).filter(Boolean).join(", ") || "none"} | healthDocumentIds={uploadQueue.map((item) => item.healthDocumentId).filter(Boolean).join(", ") || "none"} | storageConfigured={isSupabaseConfigured() ? "yes" : "no"} | error={loadError || uploadError || "none"}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
