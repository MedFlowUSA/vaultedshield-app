import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import {
  getAutoCarrier,
  getAutoDocumentClass,
  getAutoPolicyType,
  listAutoCarriers,
} from "../lib/domain/autoInsurance";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  getAutoPolicyBundle,
  listAutoDocumentClasses,
  uploadAutoDocument,
} from "../lib/supabase/autoData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import { getAssetDetailBundle } from "../lib/supabase/platformData";
import { buildAutoCommandCenter } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import {
  annotateReviewWorkflowItems,
  buildReviewAssignmentOptions,
  getHouseholdReviewWorkflowState,
  REVIEW_WORKFLOW_STATUSES,
  saveHouseholdReviewWorkflowState,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { buildAutoDetailReviewQueueItems } from "../lib/domain/platformIntelligence/reviewQueue";

const AUTO_DOCUMENT_CLASSES = listAutoDocumentClasses();
const AUTO_CARRIERS = listAutoCarriers();

const DEFAULT_UPLOAD_FORM = {
  document_class_key: "declarations_page",
  carrier_key: "",
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
  if (status === "renewal_pending" || status === "review") return "warning";
  return "info";
}

export default function AutoPolicyDetailPage({ autoPolicyId, onNavigate }) {
  const { householdState, debug: shellDebug, intelligenceBundle } = usePlatformShellData();
  const fileInputRef = useRef(null);
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
      scopeSource: "auto_detail_page",
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

  const loadAutoBundle = useCallback(async (targetAutoPolicyId, options = {}) => {
    const result = await getAutoPolicyBundle(targetAutoPolicyId);
    if (result.error || !result.data?.autoPolicy) {
      if (!options.silent) {
        setBundle(null);
        setAssetBundle(null);
        setLoadError(result.error?.message || "Auto policy bundle could not be loaded.");
      }
      return { data: null, error: result.error || new Error("Auto policy bundle could not be loaded.") };
    }

    setBundle(result.data);
    if (!options.silent) setLoadError("");

    const linkedAssetId = result.data.autoPolicy.assets?.id;
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
    if (!autoPolicyId) return;
    let active = true;
    async function loadBundle() {
      setLoading(true);
      await loadAutoBundle(autoPolicyId);
      if (!active) return;
      setLoading(false);
    }
    loadBundle();
    return () => {
      active = false;
    };
  }, [autoPolicyId, loadAutoBundle, scopeKey]);

  const autoPolicy = bundle?.autoPolicy || null;
  const autoPolicyType = autoPolicy
    ? getAutoPolicyType(autoPolicy.auto_policy_type_key)
    : null;
  const linkedAsset = autoPolicy?.assets || null;
  const autoCommandCenter = useMemo(
    () =>
      buildAutoCommandCenter({
        autoPolicy,
        autoDocuments: bundle?.autoDocuments || [],
        autoSnapshots: bundle?.autoSnapshots || [],
        autoAnalytics: bundle?.autoAnalytics || [],
        assetBundle,
      }),
    [
      assetBundle,
      autoPolicy,
      bundle?.autoAnalytics,
      bundle?.autoDocuments,
      bundle?.autoSnapshots,
    ]
  );
  const autoReviewQueueItems = useMemo(
    () =>
      annotateReviewWorkflowItems(
        buildAutoDetailReviewQueueItems({
          autoPolicy,
          autoBundle: bundle,
          assetBundle,
          autoCommandCenter,
        }),
        reviewWorkflowState || {}
      ),
    [assetBundle, autoCommandCenter, autoPolicy, bundle, reviewWorkflowState]
  );
  const autoReviewItemsById = useMemo(
    () => Object.fromEntries(autoReviewQueueItems.map((item) => [item.id, item])),
    [autoReviewQueueItems]
  );
  const assigneeChoices = useMemo(() => buildReviewAssignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);

  const summaryItems = useMemo(() => {
    if (!autoPolicy) return [];
    return [
      { label: "Policy Status", value: autoPolicy.policy_status || "unknown", helper: autoPolicyType?.display_name || "Auto" },
      { label: "Documents", value: bundle?.autoDocuments?.length || 0, helper: "Auto-specific document records" },
      { label: "Snapshots", value: bundle?.autoSnapshots?.length || 0, helper: "Normalized auto records" },
      { label: "Analytics", value: bundle?.autoAnalytics?.length || 0, helper: "Future auto review outputs" },
    ];
  }, [bundle, autoPolicy, autoPolicyType]);

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
      autoDocumentId: null,
      storagePath: "",
      duplicate: false,
      errorSummary: "",
    }));
    setUploadQueue((current) => [...entries, ...current]);
  }

  async function handleUploadDocuments(event) {
    event.preventDefault();
    if (!autoPolicy || !linkedAsset?.id || uploadQueue.length === 0) return;

    setUploading(true);
    setUploadError("");

    for (const item of uploadQueue) {
      if (item.status !== "queued" && item.status !== "failed") continue;

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", errorSummary: "" } : entry
        )
      );

      const result = await uploadAutoDocument({
        household_id: autoPolicy.household_id,
        asset_id: linkedAsset.id,
        auto_policy_id: autoPolicy.id,
        file: item.file,
        document_class_key: uploadForm.document_class_key,
        carrier_key: uploadForm.carrier_key || autoPolicy.carrier_key || null,
        document_date: uploadForm.document_date || null,
        notes: uploadForm.notes || null,
        metadata: { auto_detail_upload: true },
      });

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: result.error ? "failed" : "saved",
                assetDocumentId: result.data?.assetDocument?.id || null,
                autoDocumentId: result.data?.autoDocument?.id || null,
                storagePath: result.upload?.storagePath || "",
                duplicate: Boolean(result.duplicate),
                errorSummary: result.error?.message || result.upload?.errorSummary || "",
              }
            : entry
        )
      );

      if (result.error) {
        setUploadError(result.error.message || "Auto upload failed.");
        continue;
      }

      await loadAutoBundle(autoPolicy.id, { silent: true });
    }

    setUploading(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Insurance"
        title={autoPolicy?.policy_name || linkedAsset?.asset_name || "Auto Policy Detail"}
        description="Live auto policy bundle view backed by auto policies, documents, snapshots, analytics, and linked platform assets."
        actions={
          <button onClick={() => onNavigate("/insurance/auto")} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
            Back to Auto Hub
          </button>
        }
      />

      {loading ? (
        <SectionCard><div style={{ color: "#64748b" }}>Loading auto policy bundle...</div></SectionCard>
      ) : !autoPolicy ? (
        <EmptyState title="Auto policy not found" description={loadError || "This auto policy detail page could not load a matching policy record."} />
      ) : (
        <>
          <SummaryPanel items={summaryItems} />
          <div style={{ marginTop: "18px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusBadge label={autoPolicyType?.display_name || autoPolicy.auto_policy_type_key} tone="info" />
            <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
          </div>

          <div style={{ marginTop: "24px" }}>
            <SectionCard
              title="Auto Command"
              subtitle="The strongest auto protection blockers, why they matter, and what to do next on this policy."
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <AIInsightPanel
                  title="Coverage Command"
                  summary={autoCommandCenter.headline}
                  bullets={[
                    `${autoCommandCenter.metrics.critical || 0} critical blocker${autoCommandCenter.metrics.critical === 1 ? "" : "s"} are active.`,
                    `${autoCommandCenter.metrics.warning || 0} warning item${autoCommandCenter.metrics.warning === 1 ? "" : "s"} should be reviewed soon.`,
                    `${autoCommandCenter.metrics.documents || 0} auto document${autoCommandCenter.metrics.documents === 1 ? "" : "s"} are attached.`,
                    `${autoCommandCenter.metrics.snapshots || 0} snapshot${autoCommandCenter.metrics.snapshots === 1 ? "" : "s"} and ${autoCommandCenter.metrics.analytics || 0} analytic${autoCommandCenter.metrics.analytics === 1 ? "" : "s"} are visible.`,
                  ]}
                />
                {autoCommandCenter.blockers.length > 0 ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {autoCommandCenter.blockers.map((item) => (
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
                          const workflowItem = autoReviewItemsById[`auto:${autoPolicy?.id}:${item.id}`] || null;
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
                    title="No active auto blockers"
                    description="This auto policy currently looks relatively steady across evidence, renewal, and access continuity."
                  />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "18px" }}>
            <SectionCard title="Auto Policy Summary">
              <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Policy Name:</strong> {autoPolicy.policy_name || linkedAsset?.asset_name || "Limited visibility"}</div>
                <div><strong>Policy Type:</strong> {autoPolicyType?.display_name || autoPolicy.auto_policy_type_key}</div>
                <div><strong>Carrier:</strong> {getAutoCarrier(autoPolicy.carrier_key)?.display_name || autoPolicy.carrier_key || linkedAsset?.institution_name || "Limited visibility"}</div>
                <div><strong>Named Insured:</strong> {autoPolicy.named_insured || "Limited visibility"}</div>
                <div><strong>Effective:</strong> {formatDate(autoPolicy.effective_date)}</div>
                <div><strong>Expiration:</strong> {formatDate(autoPolicy.expiration_date)}</div>
                <div><strong>Status:</strong> <StatusBadge label={autoPolicy.policy_status || "unknown"} tone={getStatusTone(autoPolicy.policy_status)} /></div>
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
                    This auto record remains linked to the broader platform asset layer so shared documents, portals, alerts, and tasks can continue to coexist cleanly.
                  </div>
                </div>
              ) : (
                <EmptyState title="No linked household summary" description="This auto policy is not yet connected to a broader household asset summary." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "18px" }}>
            <SectionCard title="Auto Documents">
              {bundle.autoDocuments.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.autoDocuments.map((document) => (
                    <div key={document.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {document.asset_documents?.file_name || document.document_class_key || "Auto document"}
                      </div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Document Class:</strong> {getAutoDocumentClass(document.document_class_key)?.display_name || document.document_class_key || "Limited visibility"}</div>
                        <div><strong>Carrier:</strong> {getAutoCarrier(document.carrier_key)?.display_name || document.carrier_key || "Limited visibility"}</div>
                        <div><strong>Document Date:</strong> {formatDate(document.document_date)}</div>
                        <div><strong>Created:</strong> {formatDate(document.created_at)}</div>
                        <div><strong>Household Document Link:</strong> {document.asset_document_id || "Not linked yet"}</div>
                        <div><strong>Asset Document Status:</strong> {document.asset_documents?.processing_status || "Not available"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No auto documents yet" description="Auto-specific document records will appear here as uploads are classified and linked." />
              )}
            </SectionCard>

            <SectionCard title="Auto Document Intake">
              <form onSubmit={handleUploadDocuments} style={{ display: "grid", gap: "12px" }}>
                <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); enqueueFiles(event.dataTransfer.files); }} style={{ border: "1px dashed #94a3b8", borderRadius: "16px", padding: "20px", background: "#f8fafc" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop auto documents here</div>
                  <p style={{ marginTop: "8px", color: "#64748b", lineHeight: "1.6" }}>
                    Upload declarations pages, ID-card references, renewal notices, vehicle schedules, and related auto documents into this policy. The original file is saved in the household vault and then linked into the auto module.
                  </p>
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(event) => enqueueFiles(event.target.files)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700 }}>
                    Select Auto Documents
                  </button>
                </div>
                <select value={uploadForm.document_class_key} onChange={(event) => setUploadForm((current) => ({ ...current, document_class_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  {AUTO_DOCUMENT_CLASSES.map((documentClass) => (
                    <option key={documentClass.document_class_key} value={documentClass.document_class_key}>
                      {documentClass.display_name}
                    </option>
                  ))}
                </select>
                <select value={uploadForm.carrier_key} onChange={(event) => setUploadForm((current) => ({ ...current, carrier_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">No carrier selected</option>
                  {AUTO_CARRIERS.map((carrier) => (
                    <option key={carrier.carrier_key} value={carrier.carrier_key}>
                      {carrier.display_name}
                    </option>
                  ))}
                </select>
                <input type="date" value={uploadForm.document_date} onChange={(event) => setUploadForm((current) => ({ ...current, document_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
                <textarea value={uploadForm.notes} onChange={(event) => setUploadForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Optional intake notes" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }} />
                <button type="submit" disabled={uploading || uploadQueue.length === 0 || !linkedAsset?.id} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                  {uploading ? "Uploading Auto Documents..." : "Upload Auto Documents"}
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
                  <EmptyState title="No auto files queued" description="Add one or more auto documents to create linked generic and auto-specific document records." />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
            <SectionCard title="Auto Snapshots">
              {bundle.autoSnapshots.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.autoSnapshots.map((snapshot) => (
                    <div key={snapshot.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{snapshot.snapshot_type || "auto_snapshot"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Snapshot Date:</strong> {formatDate(snapshot.snapshot_date)}</div>
                        <div><strong>Completeness:</strong> {snapshot.completeness_assessment?.status || "Not assessed yet"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No auto snapshots yet" description="Auto snapshots will land here after later auto-policy parsing is added." />
              )}
            </SectionCard>

            <SectionCard title="Auto Analytics">
              {bundle.autoAnalytics.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.autoAnalytics.map((analytics) => (
                    <div key={analytics.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{analytics.analytics_type || "auto_analytics"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Review Flags:</strong> {analytics.review_flags?.length ? analytics.review_flags.join(", ") : "None yet"}</div>
                        <div><strong>Created:</strong> {formatDate(analytics.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No auto analytics yet" description="Auto intelligence will appear here after future parsing and review passes are added." />
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
                <EmptyState title="No linked portals yet" description="Portal continuity records will surface here through the linked platform asset when auto carrier access continuity is mapped." />
              )}
            </SectionCard>

            <SectionCard title="Notes / Tasks / Alerts">
              {assetBundle ? (
                <AIInsightPanel
                  title="Platform Linkage"
                  summary="This auto record can inherit shared continuity context from the linked platform asset without collapsing auto-specific data into generic tables."
                  bullets={[
                    `Household documents linked: ${assetBundle.documents?.length || 0}`,
                    `Asset alerts linked: ${assetBundle.alerts?.length || 0}`,
                    `Asset tasks linked: ${assetBundle.tasks?.length || 0}`,
                  ]}
                />
              ) : (
                <EmptyState title="Shared household context pending" description="Alerts, tasks, notes, and broader continuity context will appear here once this policy is linked into the broader household record." />
              )}
            </SectionCard>
          </div>

          {shouldShowDevDiagnostics() ? (
            <SectionCard title="Auto Debug">
              <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                auto_policy_id={autoPolicy.id} | asset_id={linkedAsset?.id || "none"} | household_id={autoPolicy.household_id || "none"} | documents={bundle.autoDocuments.length} | snapshots={bundle.autoSnapshots.length} | analytics={bundle.autoAnalytics.length} | uploadAttempts={uploadQueue.length} | assetDocumentIds={uploadQueue.map((item) => item.assetDocumentId).filter(Boolean).join(", ") || "none"} | autoDocumentIds={uploadQueue.map((item) => item.autoDocumentId).filter(Boolean).join(", ") || "none"} | storageConfigured={isSupabaseConfigured() ? "yes" : "no"} | error={loadError || uploadError || "none"}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
