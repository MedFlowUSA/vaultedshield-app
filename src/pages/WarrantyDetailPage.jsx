import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import PlainLanguageBridge from "../components/shared/PlainLanguageBridge";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import {
  getWarrantyDocumentClass,
  getWarrantyProvider,
  getWarrantyType,
  listWarrantyProviders,
} from "../lib/domain/warranties";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  getWarrantyBundle,
  listWarrantyDocumentClasses,
  uploadWarrantyDocument,
} from "../lib/supabase/warrantyData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import { buildReviewWorkspaceRoute, deriveReviewWorkspaceCandidateFromQueueItem } from "../lib/reviewWorkspace/workspaceFilters";
import { getAssetDetailBundle } from "../lib/supabase/platformData";
import { buildWarrantyCommandCenter } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import {
  annotateReviewWorkflowItems,
  buildReviewAssignmentOptions,
  getHouseholdReviewWorkflowState,
  REVIEW_WORKFLOW_STATUSES,
  saveHouseholdReviewWorkflowState,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { buildWarrantyDetailReviewQueueItems } from "../lib/domain/platformIntelligence/reviewQueue";

const WARRANTY_DOCUMENT_CLASSES = listWarrantyDocumentClasses();
const WARRANTY_PROVIDERS = listWarrantyProviders();

const DEFAULT_UPLOAD_FORM = {
  document_class_key: "warranty_contract",
  provider_key: "",
  document_date: "",
  notes: "",
};

function formatDate(value) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "expiring" || status === "review") return "warning";
  return "info";
}

export default function WarrantyDetailPage({ warrantyId, onNavigate }) {
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
      scopeSource: "warranty_detail_page",
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

  const loadWarrantyBundle = useCallback(async (targetWarrantyId, options = {}) => {
    const result = await getWarrantyBundle(targetWarrantyId);
    if (result.error || !result.data?.warranty) {
      if (!options.silent) {
        setBundle(null);
        setAssetBundle(null);
        setLoadError(result.error?.message || "Warranty bundle could not be loaded.");
      }
      return { data: null, error: result.error || new Error("Warranty bundle could not be loaded.") };
    }

    setBundle(result.data);
    if (!options.silent) setLoadError("");

    const linkedAssetId = result.data.warranty.assets?.id;
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
    if (!warrantyId) return;
    let active = true;
    async function loadBundle() {
      setLoading(true);
      await loadWarrantyBundle(warrantyId);
      if (!active) return;
      setLoading(false);
    }
    loadBundle();
    return () => {
      active = false;
    };
  }, [warrantyId, loadWarrantyBundle, scopeKey]);

  const warranty = bundle?.warranty || null;
  const warrantyType = warranty ? getWarrantyType(warranty.warranty_type_key) : null;
  const linkedAsset = warranty?.assets || null;
  const warrantyCommandCenter = useMemo(
    () =>
      buildWarrantyCommandCenter({
        warranty,
        warrantyDocuments: bundle?.warrantyDocuments || [],
        warrantySnapshots: bundle?.warrantySnapshots || [],
        warrantyAnalytics: bundle?.warrantyAnalytics || [],
        assetBundle,
      }),
    [
      assetBundle,
      bundle?.warrantyAnalytics,
      bundle?.warrantyDocuments,
      bundle?.warrantySnapshots,
      warranty,
    ]
  );
  const warrantyReviewQueueItems = useMemo(
    () =>
      annotateReviewWorkflowItems(
        buildWarrantyDetailReviewQueueItems({
          warranty,
          warrantyBundle: bundle,
          assetBundle,
          warrantyCommandCenter,
        }),
        reviewWorkflowState || {}
      ),
    [assetBundle, bundle, reviewWorkflowState, warranty, warrantyCommandCenter]
  );
  const warrantyReviewItemsById = useMemo(
    () => Object.fromEntries(warrantyReviewQueueItems.map((item) => [item.id, item])),
    [warrantyReviewQueueItems]
  );
  const topWarrantyReviewItem = warrantyReviewQueueItems[0] || null;
  const warrantyReviewWorkspaceRoute = useMemo(() => {
    const filters =
      deriveReviewWorkspaceCandidateFromQueueItem(topWarrantyReviewItem, reviewScope.householdId || warranty?.household_id || null) || {
        module: "warranty",
        issueType: "review_needed",
        severity: warrantyCommandCenter.metrics.critical > 0 ? "high" : warrantyCommandCenter.metrics.warning > 0 ? "medium" : "low",
        householdId: reviewScope.householdId || warranty?.household_id || null,
        assetId: linkedAsset?.id || null,
        recordId: warranty?.id || null,
      };

    return buildReviewWorkspaceRoute({
      filters,
      openedFromAssistant: true,
    });
  }, [
    linkedAsset?.id,
    reviewScope.householdId,
    topWarrantyReviewItem,
    warranty?.household_id,
    warranty?.id,
    warrantyCommandCenter.metrics.critical,
    warrantyCommandCenter.metrics.warning,
  ]);
  const assigneeChoices = useMemo(() => buildReviewAssignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);

  const summaryItems = useMemo(() => {
    if (!warranty) return [];
    return [
      { label: "Contract Status", value: warranty.contract_status || "unknown", helper: warrantyType?.display_name || "Warranty" },
      { label: "Documents", value: bundle?.warrantyDocuments?.length || 0, helper: "Warranty-specific document records" },
      { label: "Snapshots", value: bundle?.warrantySnapshots?.length || 0, helper: "Normalized warranty records" },
      { label: "Analytics", value: bundle?.warrantyAnalytics?.length || 0, helper: "Future warranty review outputs" },
    ];
  }, [bundle, warranty, warrantyType]);
  const plainLanguageGuide = useMemo(() => {
    const documentCount = bundle?.warrantyDocuments?.length || 0;
    const snapshotCount = bundle?.warrantySnapshots?.length || 0;
    const topBlocker = warrantyCommandCenter.blockers?.[0] || null;
    const everydayVerdict =
      warrantyCommandCenter.metrics.critical > 0
        ? "This warranty has important continuity gaps"
        : warrantyCommandCenter.metrics.warning > 0
          ? "This warranty looks usable but needs review"
          : "This warranty looks reasonably supported";

    return {
      title: "Start here before the technical warranty review",
      summary: warrantyCommandCenter.headline,
      transition:
        "This top layer gives the simple read first. The technical section below breaks out blockers, workflow, linked records, documents, snapshots, and analytics.",
      quickFacts: [
        documentCount > 0
          ? `${documentCount} warranty document${documentCount === 1 ? "" : "s"} are visible.`
          : "No warranty-specific documents are visible yet.",
        snapshotCount > 0
          ? `${snapshotCount} normalized warranty snapshot${snapshotCount === 1 ? "" : "s"} are available.`
          : "No normalized warranty snapshots are available yet.",
        topWarrantyReviewItem?.summary || "No single warranty issue is standing out above the rest right now.",
      ],
      cards: [
        { label: "In plain English", value: everydayVerdict, detail: warrantyCommandCenter.headline },
        { label: "What to do first", value: topWarrantyReviewItem?.title || "Open the review workspace", detail: topBlocker?.nextAction || topWarrantyReviewItem?.summary || "Review the top warranty blocker first." },
        { label: "Why confidence is limited or strong", value: `${documentCount} document${documentCount === 1 ? "" : "s"} visible`, detail: documentCount === 0 ? "Without warranty records, this read stays fairly thin." : "Document support gives this warranty review a more reliable starting point." },
      ],
    };
  }, [bundle?.warrantyDocuments?.length, bundle?.warrantySnapshots?.length, topWarrantyReviewItem, warrantyCommandCenter]);

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
      warrantyDocumentId: null,
      storagePath: "",
      duplicate: false,
      errorSummary: "",
    }));
    setUploadQueue((current) => [...entries, ...current]);
  }

  async function handleUploadDocuments(event) {
    event.preventDefault();
    if (!warranty || !linkedAsset?.id || uploadQueue.length === 0) return;

    setUploading(true);
    setUploadError("");

    for (const item of uploadQueue) {
      if (item.status !== "queued" && item.status !== "failed") continue;

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", errorSummary: "" } : entry
        )
      );

      const result = await uploadWarrantyDocument({
        household_id: warranty.household_id,
        asset_id: linkedAsset.id,
        warranty_id: warranty.id,
        file: item.file,
        document_class_key: uploadForm.document_class_key,
        provider_key: uploadForm.provider_key || warranty.provider_key || null,
        document_date: uploadForm.document_date || null,
        notes: uploadForm.notes || null,
        metadata: { warranty_detail_upload: true },
      });

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: result.error ? "failed" : "saved",
                assetDocumentId: result.data?.assetDocument?.id || null,
                warrantyDocumentId: result.data?.warrantyDocument?.id || null,
                storagePath: result.upload?.storagePath || "",
                duplicate: Boolean(result.duplicate),
                errorSummary: result.error?.message || result.upload?.errorSummary || "",
              }
            : entry
        )
      );

      if (result.error) {
        setUploadError(result.error.message || "Warranty upload failed.");
        continue;
      }

      await loadWarrantyBundle(warranty.id, { silent: true });
    }

    setUploading(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title={warranty?.contract_name || linkedAsset?.asset_name || "Warranty Detail"}
        description="Live warranty bundle view backed by contracts, documents, snapshots, analytics, and linked platform assets."
        actions={
          <button onClick={() => onNavigate("/warranties")} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
            Back to Warranty Hub
          </button>
        }
      />

      {loading ? (
        <SectionCard><div style={{ color: "#64748b" }}>Loading warranty bundle...</div></SectionCard>
      ) : !warranty ? (
        <EmptyState title="Warranty not found" description={loadError || "This warranty detail page could not load a matching contract record."} />
      ) : (
        <>
          <SummaryPanel items={summaryItems} />
          <div style={{ marginTop: "18px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusBadge label={warrantyType?.display_name || warranty.warranty_type_key} tone="info" />
            <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
          </div>

          <PlainLanguageBridge
            compact
            title={plainLanguageGuide.title}
            summary={plainLanguageGuide.summary}
            transition={plainLanguageGuide.transition}
            quickFacts={plainLanguageGuide.quickFacts}
            cards={plainLanguageGuide.cards}
            primaryActionLabel="Open Review Workspace"
            onPrimaryAction={() => onNavigate?.(warrantyReviewWorkspaceRoute)}
            secondaryActionLabel="Step Into The Deeper Breakdown"
            onSecondaryAction={() => technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            guideTitle="Read this warranty page in layers"
            guideDescription="You can understand this warranty without starting in operations mode. Read the short answer first, take the first move, and only use the deeper proof when you want the reasoning behind it."
            guideSteps={[
              {
                label: "Step 1",
                title: "Start with the simple answer",
                detail: "Use the plain-English summary above to understand whether this warranty looks supported, thin, or risky before reading the deeper detail.",
              },
              {
                label: "Step 2",
                title: "Take the first continuity move",
                detail: topWarrantyReviewItem?.summary || "Focus on the top warranty blocker first so the most important service or coverage gap is easier to clear.",
              },
              {
                label: "Step 3",
                title: "Use the deeper layer as proof",
                detail: "The darker section below explains the evidence: blockers, linked records, documents, snapshots, analytics, and workflow detail.",
              },
            ]}
            translatedTerms={[
              {
                term: "Confidence",
                meaning: bundle?.warrantyDocuments?.length
                  ? "Confidence means how much contract evidence the page has to support its current read of the warranty."
                  : "Confidence is limited right now because the page does not have enough warranty evidence yet.",
              },
              {
                term: "Snapshot",
                meaning: "A snapshot is the normalized version of a contract record, so the page can read warranty facts in a structured way.",
              },
              {
                term: "Linked Records",
                meaning: "Linked records are the connected household records that help this warranty make sense in the broader asset and service picture.",
              },
              {
                term: "Review Workspace",
                meaning: "Review Workspace is the shared place to track and assign follow-up when a warranty issue needs more than a quick page read.",
              },
            ]}
            depthTitle="Use the deeper breakdown as supporting proof"
            depthDescription="The darker section below is where the system shows the analyst evidence behind the simpler warranty story."
            depthPrimaryActionLabel="Start With Warranty Command"
            onDepthPrimaryAction={() => technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            depthSecondaryActionLabel="Open Review Workspace"
            onDepthSecondaryAction={() => onNavigate?.(warrantyReviewWorkspaceRoute)}
            analysisRef={technicalAnalysisRef}
            analysisEyebrow="Deeper Review Starts Here"
            analysisTitle="Technical breakdown: warranty blockers, linked records, documents, snapshots, analytics, and workflow"
            analysisDescription="Everything below this point is the proof layer. It explains the live warranty blockers, linked records, documents, snapshots, analytics, and the workflow behind the simpler read above."
          />

          <div style={{ marginTop: "24px" }} ref={technicalAnalysisRef}>
            <SectionCard
              title="Warranty Command"
              subtitle="The strongest warranty blockers, why they matter, and what to do next on this contract."
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <AIInsightPanel
                  title="Coverage Command"
                  summary={warrantyCommandCenter.headline}
                  bullets={[
                    `${warrantyCommandCenter.metrics.critical || 0} critical blocker${warrantyCommandCenter.metrics.critical === 1 ? "" : "s"} are active.`,
                    `${warrantyCommandCenter.metrics.warning || 0} warning item${warrantyCommandCenter.metrics.warning === 1 ? "" : "s"} should be reviewed soon.`,
                    `${warrantyCommandCenter.metrics.documents || 0} warranty document${warrantyCommandCenter.metrics.documents === 1 ? "" : "s"} are attached.`,
                    `${warrantyCommandCenter.metrics.snapshots || 0} snapshot${warrantyCommandCenter.metrics.snapshots === 1 ? "" : "s"} and ${warrantyCommandCenter.metrics.analytics || 0} analytic${warrantyCommandCenter.metrics.analytics === 1 ? "" : "s"} are visible.`,
                  ]}
                />
                {warrantyCommandCenter.blockers.length > 0 ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {warrantyCommandCenter.blockers.map((item) => (
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
                          const workflowItem = warrantyReviewItemsById[`warranty:${warranty?.id}:${item.id}`] || null;
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
                    title="No active warranty blockers"
                    description="This warranty currently looks relatively steady across evidence, expiration, and access continuity."
                  />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "18px" }}>
            <SectionCard title="Warranty Summary">
              <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Contract Name:</strong> {warranty.contract_name || linkedAsset?.asset_name || "Limited visibility"}</div>
                <div><strong>Warranty Type:</strong> {warrantyType?.display_name || warranty.warranty_type_key}</div>
                <div><strong>Provider:</strong> {getWarrantyProvider(warranty.provider_key)?.display_name || warranty.provider_key || linkedAsset?.institution_name || "Limited visibility"}</div>
                <div><strong>Covered Item:</strong> {warranty.covered_item_name || "Limited visibility"}</div>
                <div><strong>Purchaser:</strong> {warranty.purchaser_name || "Limited visibility"}</div>
                <div><strong>Effective:</strong> {formatDate(warranty.effective_date)}</div>
                <div><strong>Expiration:</strong> {formatDate(warranty.expiration_date)}</div>
                <div><strong>Status:</strong> <StatusBadge label={warranty.contract_status || "unknown"} tone={getStatusTone(warranty.contract_status)} /></div>
              </div>
            </SectionCard>

            <SectionCard title="Linked Platform Asset Summary">
              {linkedAsset ? (
                <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                  <div><strong>Asset Name:</strong> {linkedAsset.asset_name}</div>
                  <div><strong>Category:</strong> {linkedAsset.asset_category}</div>
                  <div><strong>Subcategory:</strong> {linkedAsset.asset_subcategory || "Limited visibility"}</div>
                  <div><strong>Institution:</strong> {linkedAsset.institution_name || "Limited visibility"}</div>
                  <div><strong>Status:</strong> {linkedAsset.status || "Limited visibility"}</div>
                  <div style={{ color: "#64748b" }}>
                    This warranty record remains linked to the broader platform asset layer so shared documents, portals, alerts, and tasks can continue to coexist cleanly.
                  </div>
                </div>
              ) : (
                <EmptyState title="No linked household summary" description="This warranty contract is not yet connected to a broader household asset summary." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "18px" }}>
            <SectionCard title="Warranty Documents">
              {bundle.warrantyDocuments.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.warrantyDocuments.map((document) => (
                    <div key={document.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {document.asset_documents?.file_name || document.document_class_key || "Warranty document"}
                      </div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Document Class:</strong> {getWarrantyDocumentClass(document.document_class_key)?.display_name || document.document_class_key || "Limited visibility"}</div>
                        <div><strong>Provider:</strong> {getWarrantyProvider(document.provider_key)?.display_name || document.provider_key || "Limited visibility"}</div>
                        <div><strong>Document Date:</strong> {formatDate(document.document_date)}</div>
                        <div><strong>Created:</strong> {formatDate(document.created_at)}</div>
                        <div><strong>Household Document Link:</strong> {document.asset_document_id || "Not linked yet"}</div>
                        <div><strong>Asset Document Status:</strong> {document.asset_documents?.processing_status || "Not available"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No warranty documents yet" description="Warranty-specific document records will appear here as uploads are classified and linked." />
              )}
            </SectionCard>

            <SectionCard title="Warranty Document Intake">
              <form onSubmit={handleUploadDocuments} style={{ display: "grid", gap: "12px" }}>
                <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); enqueueFiles(event.dataTransfer.files); }} style={{ border: "1px dashed #94a3b8", borderRadius: "16px", padding: "20px", background: "#f8fafc" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop warranty documents here</div>
                  <p style={{ marginTop: "8px", color: "#64748b", lineHeight: "1.6" }}>
                    Upload contracts, protection plans, proofs of purchase, renewal notices, and related warranty documents into this contract. The original file is saved in the household vault and then linked into the warranty module.
                  </p>
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(event) => enqueueFiles(event.target.files)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700 }}>
                    Select Warranty Documents
                  </button>
                </div>
                <select value={uploadForm.document_class_key} onChange={(event) => setUploadForm((current) => ({ ...current, document_class_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  {WARRANTY_DOCUMENT_CLASSES.map((documentClass) => (
                    <option key={documentClass.document_class_key} value={documentClass.document_class_key}>
                      {documentClass.display_name}
                    </option>
                  ))}
                </select>
                <select value={uploadForm.provider_key} onChange={(event) => setUploadForm((current) => ({ ...current, provider_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">No provider selected</option>
                  {WARRANTY_PROVIDERS.map((provider) => (
                    <option key={provider.provider_key} value={provider.provider_key}>
                      {provider.display_name}
                    </option>
                  ))}
                </select>
                <input type="date" value={uploadForm.document_date} onChange={(event) => setUploadForm((current) => ({ ...current, document_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
                <textarea value={uploadForm.notes} onChange={(event) => setUploadForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Optional intake notes" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }} />
                <button type="submit" disabled={uploading || uploadQueue.length === 0 || !linkedAsset?.id} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                  {uploading ? "Uploading Warranty Documents..." : "Upload Warranty Documents"}
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
                          {uploadForm.provider_key ? ` | ${uploadForm.provider_key}` : ""}
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
                  <EmptyState title="No warranty files queued" description="Add one or more warranty documents to create linked generic and warranty-specific document records." />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
            <SectionCard title="Warranty Snapshots">
              {bundle.warrantySnapshots.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.warrantySnapshots.map((snapshot) => (
                    <div key={snapshot.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{snapshot.snapshot_type || "warranty_snapshot"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Snapshot Date:</strong> {formatDate(snapshot.snapshot_date)}</div>
                        <div><strong>Completeness:</strong> {snapshot.completeness_assessment?.status || "Not assessed yet"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No warranty snapshots yet" description="Warranty snapshots will land here after later warranty parsing is added." />
              )}
            </SectionCard>

            <SectionCard title="Warranty Analytics">
              {bundle.warrantyAnalytics.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.warrantyAnalytics.map((analytics) => (
                    <div key={analytics.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{analytics.analytics_type || "warranty_analytics"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Review Flags:</strong> {analytics.review_flags?.length ? analytics.review_flags.join(", ") : "None yet"}</div>
                        <div><strong>Created:</strong> {formatDate(analytics.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No warranty analytics yet" description="Warranty intelligence will appear here after future parsing and review passes are added." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
            <SectionCard title="Linked Portals">
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
                <EmptyState title="No linked portals yet" description="Portal continuity records will surface here through the linked platform asset when warranty-provider access continuity is mapped." />
              )}
            </SectionCard>

            <SectionCard title="Review Workspace Handoff">
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>
                  Warranty Command already explains the active blockers on this contract. Shared follow-up belongs in Review Workspace so documents, alerts, and continuity work can be tracked once instead of restated in a second linkage card.
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
                      {warrantyReviewQueueItems.length} open warranty workstream{warrantyReviewQueueItems.length === 1 ? "" : "s"}
                    </div>
                    <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#e2e8f0", color: "#475569", fontWeight: 700, fontSize: "12px" }}>
                      {assetBundle?.alerts?.length || 0} alert{assetBundle?.alerts?.length === 1 ? "" : "s"}
                    </div>
                    <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#ecfccb", color: "#3f6212", fontWeight: 700, fontSize: "12px" }}>
                      {assetBundle?.tasks?.length || 0} task{assetBundle?.tasks?.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>
                    {topWarrantyReviewItem?.summary || warrantyCommandCenter.headline}
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onNavigate?.(warrantyReviewWorkspaceRoute)}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Open Review Workspace
                    </button>
                    {topWarrantyReviewItem?.route ? (
                      <button
                        type="button"
                        onClick={() => onNavigate?.(topWarrantyReviewItem.route)}
                        style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
                      >
                        Open Top Warranty Review
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {shouldShowDevDiagnostics() ? (
            <SectionCard title="Warranty Debug">
              <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                warranty_id={warranty.id} | asset_id={linkedAsset?.id || "none"} | household_id={warranty.household_id || "none"} | documents={bundle.warrantyDocuments.length} | snapshots={bundle.warrantySnapshots.length} | analytics={bundle.warrantyAnalytics.length} | uploadAttempts={uploadQueue.length} | assetDocumentIds={uploadQueue.map((item) => item.assetDocumentId).filter(Boolean).join(", ") || "none"} | warrantyDocumentIds={uploadQueue.map((item) => item.warrantyDocumentId).filter(Boolean).join(", ") || "none"} | storageConfigured={isSupabaseConfigured() ? "yes" : "no"} | error={loadError || uploadError || "none"}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
