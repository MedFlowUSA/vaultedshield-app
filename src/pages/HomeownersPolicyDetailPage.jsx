import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import {
  getHomeownersCarrier,
  getHomeownersDocumentClass,
  getHomeownersPolicyType,
  listHomeownersCarriers,
} from "../lib/domain/homeowners";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  getHomeownersPolicyBundle,
  getHomeownersLinkageStatus,
  linkHomeownersToProperty,
  listHomeownersPropertyLinks,
  listHomeownersDocumentClasses,
  unlinkHomeownersFromProperty,
  updatePropertyHomeownersLink,
  uploadHomeownersDocument,
} from "../lib/supabase/homeownersData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { listProperties } from "../lib/supabase/propertyData";
import { getAssetDetailBundle } from "../lib/supabase/platformData";
import { buildHomeownersCommandCenter } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import {
  annotateReviewWorkflowItems,
  buildReviewAssignmentOptions,
  getHouseholdReviewWorkflowState,
  REVIEW_WORKFLOW_STATUSES,
  saveHouseholdReviewWorkflowState,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { buildHomeownersDetailReviewQueueItems } from "../lib/domain/platformIntelligence/reviewQueue";

const HOMEOWNERS_DOCUMENT_CLASSES = listHomeownersDocumentClasses();
const HOMEOWNERS_CARRIERS = listHomeownersCarriers();

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
  if (status === "cancelled" || status === "nonrenewed" || status === "expired") return "warning";
  return "info";
}

export default function HomeownersPolicyDetailPage({ homeownersPolicyId, onNavigate }) {
  const { householdState, debug: shellDebug, intelligenceBundle } = usePlatformShellData();
  const fileInputRef = useRef(null);
  const [bundle, setBundle] = useState(null);
  const [assetBundle, setAssetBundle] = useState(null);
  const [propertyLinks, setPropertyLinks] = useState([]);
  const [availableProperties, setAvailableProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkSuccess, setLinkSuccess] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [linkingProperty, setLinkingProperty] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState("");
  const [linkDraft, setLinkDraft] = useState({ link_type: "primary_property_coverage", is_primary: true, notes: "" });
  const [savingLinkId, setSavingLinkId] = useState("");
  const [removingLinkId, setRemovingLinkId] = useState("");
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
      scopeSource: "homeowners_detail_page",
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

  const loadHomeownersBundle = useCallback(async (targetHomeownersPolicyId, options = {}) => {
    const result = await getHomeownersPolicyBundle(targetHomeownersPolicyId);
    if (result.error || !result.data?.homeownersPolicy) {
      if (!options.silent) {
        setBundle(null);
        setAssetBundle(null);
        setLoadError(result.error?.message || "Homeowners policy bundle could not be loaded.");
      }
      return { data: null, error: result.error || new Error("Homeowners policy bundle could not be loaded.") };
    }

    setBundle(result.data);
    if (!options.silent) setLoadError("");
    if (!options.silent) setLinkError("");

    const linkedAssetId = result.data.homeownersPolicy.assets?.id;
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

    if (result.data.homeownersPolicy?.id) {
      const propertyLinksResult = await listHomeownersPropertyLinks(result.data.homeownersPolicy.id);
      setPropertyLinks(propertyLinksResult.data || []);
      if (!options.silent && propertyLinksResult.error) {
        setLinkError(propertyLinksResult.error.message || "");
      }
    }

    if (result.data.homeownersPolicy?.household_id) {
      const propertiesResult = await listProperties(
        platformScope.householdId || result.data.homeownersPolicy.household_id
      );
      setAvailableProperties(propertiesResult.data || []);
      if (!options.silent && propertiesResult.error) {
        setLinkError(propertiesResult.error.message || "");
      }
    }

    return { data: result.data, error: null };
  }, [platformScope]);

  useEffect(() => {
    if (!homeownersPolicyId) return;
    let active = true;
    async function loadBundle() {
      setLoading(true);
      await loadHomeownersBundle(homeownersPolicyId);
      if (!active) return;
      setLoading(false);
    }
    loadBundle();
    return () => {
      active = false;
    };
  }, [homeownersPolicyId, loadHomeownersBundle, scopeKey]);

  useEffect(() => {
    setBundle(null);
    setAssetBundle(null);
    setPropertyLinks([]);
    setAvailableProperties([]);
    setLoadError("");
    setLinkError("");
    setLinkSuccess("");
  }, [scopeKey]);

  const homeownersPolicy = bundle?.homeownersPolicy || null;
  const homeownersPolicyType = homeownersPolicy
    ? getHomeownersPolicyType(homeownersPolicy.homeowners_policy_type_key)
    : null;
  const linkedAsset = homeownersPolicy?.assets || null;
  const linkageStatus = getHomeownersLinkageStatus({
    linkedProperties: propertyLinks,
  });
  const homeownersCommandCenter = useMemo(
    () =>
      buildHomeownersCommandCenter({
        homeownersPolicy,
        homeownersDocuments: bundle?.homeownersDocuments || [],
        homeownersSnapshots: bundle?.homeownersSnapshots || [],
        homeownersAnalytics: bundle?.homeownersAnalytics || [],
        propertyLinks,
        assetBundle,
      }),
    [
      assetBundle,
      bundle?.homeownersAnalytics,
      bundle?.homeownersDocuments,
      bundle?.homeownersSnapshots,
      homeownersPolicy,
      propertyLinks,
    ]
  );
  const homeownersReviewQueueItems = useMemo(
    () =>
      annotateReviewWorkflowItems(
        buildHomeownersDetailReviewQueueItems({
          homeownersPolicy,
          homeownersBundle: bundle,
          propertyLinks,
          assetBundle,
          homeownersCommandCenter,
        }),
        reviewWorkflowState || {}
      ),
    [assetBundle, bundle, homeownersCommandCenter, homeownersPolicy, propertyLinks, reviewWorkflowState]
  );
  const homeownersReviewItemsById = useMemo(
    () => Object.fromEntries(homeownersReviewQueueItems.map((item) => [item.id, item])),
    [homeownersReviewQueueItems]
  );
  const assigneeChoices = useMemo(() => buildReviewAssignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);

  const summaryItems = useMemo(() => {
    if (!homeownersPolicy) return [];
    return [
      { label: "Policy Status", value: homeownersPolicy.policy_status || "unknown", helper: homeownersPolicyType?.display_name || "Homeowners" },
      { label: "Documents", value: bundle?.homeownersDocuments?.length || 0, helper: "Homeowners-specific document records" },
      { label: "Snapshots", value: bundle?.homeownersSnapshots?.length || 0, helper: "Normalized homeowners records" },
      { label: "Analytics", value: bundle?.homeownersAnalytics?.length || 0, helper: "Future homeowners review outputs" },
    ];
  }, [bundle, homeownersPolicy, homeownersPolicyType]);

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
      homeownersDocumentId: null,
      storagePath: "",
      duplicate: false,
      errorSummary: "",
    }));
    setUploadQueue((current) => [...entries, ...current]);
  }

  async function handleUploadDocuments(event) {
    event.preventDefault();
    if (!homeownersPolicy || !linkedAsset?.id || uploadQueue.length === 0) return;

    setUploading(true);
    setUploadError("");

    for (const item of uploadQueue) {
      if (item.status !== "queued" && item.status !== "failed") continue;

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", errorSummary: "" } : entry
        )
      );

      const result = await uploadHomeownersDocument({
        household_id: homeownersPolicy.household_id,
        asset_id: linkedAsset.id,
        homeowners_policy_id: homeownersPolicy.id,
        file: item.file,
        document_class_key: uploadForm.document_class_key,
        carrier_key: uploadForm.carrier_key || homeownersPolicy.carrier_key || null,
        document_date: uploadForm.document_date || null,
        notes: uploadForm.notes || null,
        metadata: { homeowners_detail_upload: true },
      });

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: result.error ? "failed" : "saved",
                assetDocumentId: result.data?.assetDocument?.id || null,
                homeownersDocumentId: result.data?.homeownersDocument?.id || null,
                storagePath: result.upload?.storagePath || "",
                duplicate: Boolean(result.duplicate),
                errorSummary: result.error?.message || result.upload?.errorSummary || "",
              }
            : entry
        )
      );

      if (result.error) {
        setUploadError(result.error.message || "Homeowners upload failed.");
        continue;
      }

      await loadHomeownersBundle(homeownersPolicy.id, { silent: true });
    }

    setUploading(false);
  }

  async function handleLinkProperty(event) {
    event.preventDefault();
    if (!homeownersPolicy?.id || !selectedPropertyId) return;

    setLinkingProperty(true);
    setLinkError("");
    setLinkSuccess("");
    const result = await linkHomeownersToProperty(selectedPropertyId, homeownersPolicy.id, {
      link_type: propertyLinks.length === 0 ? "primary_property_coverage" : "supplemental_reference",
      is_primary: propertyLinks.length === 0,
      metadata: { linked_from: "homeowners_detail" },
      scopeOverride: platformScope,
    });

    if (result.error) {
      setLinkError(result.error.message || "Property link could not be created.");
      setLinkingProperty(false);
      return;
    }

    await loadHomeownersBundle(homeownersPolicy.id, { silent: true });
    setSelectedPropertyId("");
    setLinkSuccess("Property link saved.");
    setLinkingProperty(false);
  }

  function beginEditLink(link) {
    setEditingLinkId(link.id);
    setLinkDraft({
      link_type: link.link_type || "primary_property_coverage",
      is_primary: Boolean(link.is_primary),
      notes: link.notes || "",
    });
    setLinkError("");
    setLinkSuccess("");
  }

  async function handleSaveLink(linkId) {
    if (!homeownersPolicy?.id || !linkId) return;
    setSavingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await updatePropertyHomeownersLink(linkId, {
      ...linkDraft,
      scopeOverride: platformScope,
    });
    if (result.error) {
      setLinkError(result.error.message || "Property link could not be updated.");
      setSavingLinkId("");
      return;
    }
    await loadHomeownersBundle(homeownersPolicy.id, { silent: true });
    setEditingLinkId("");
    setLinkSuccess("Property link updated.");
    setSavingLinkId("");
  }

  async function handleRemoveLink(linkId) {
    if (!homeownersPolicy?.id || !linkId || !window.confirm("Remove this property link from the homeowners policy?")) return;
    setRemovingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await unlinkHomeownersFromProperty(linkId, { scopeOverride: platformScope });
    if (result.error) {
      setLinkError(result.error.message || "Property link could not be removed.");
      setRemovingLinkId("");
      return;
    }
    await loadHomeownersBundle(homeownersPolicy.id, { silent: true });
    setLinkSuccess("Property link removed.");
    setRemovingLinkId("");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Insurance"
        title={homeownersPolicy?.policy_name || linkedAsset?.asset_name || "Homeowners Policy Detail"}
        description="Live homeowners bundle view backed by homeowners policies, documents, snapshots, analytics, and linked platform assets."
        actions={
          <button onClick={() => onNavigate("/insurance/homeowners")} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
            Back to Homeowners Hub
          </button>
        }
      />

      {loading ? (
        <SectionCard><div style={{ color: "#64748b" }}>Loading homeowners policy bundle...</div></SectionCard>
      ) : !homeownersPolicy ? (
        <EmptyState title="Homeowners policy not found" description={loadError || "This homeowners detail page could not load a matching policy record."} />
      ) : (
        <>
          <SummaryPanel items={summaryItems} />
          <div style={{ marginTop: "18px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusBadge label={homeownersPolicyType?.display_name || homeownersPolicy.homeowners_policy_type_key} tone="info" />
            <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
          </div>

          <div style={{ marginTop: "24px" }}>
            <SectionCard
              title="Homeowners Command"
              subtitle="The strongest protection blockers, why they matter, and what to do next on this policy."
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <AIInsightPanel
                  title="Coverage Command"
                  summary={homeownersCommandCenter.headline}
                  bullets={[
                    `${homeownersCommandCenter.metrics.critical || 0} critical blocker${homeownersCommandCenter.metrics.critical === 1 ? "" : "s"} are active.`,
                    `${homeownersCommandCenter.metrics.warning || 0} warning item${homeownersCommandCenter.metrics.warning === 1 ? "" : "s"} should be reviewed soon.`,
                    `${homeownersCommandCenter.metrics.documents || 0} homeowners document${homeownersCommandCenter.metrics.documents === 1 ? "" : "s"} are attached.`,
                    `${homeownersCommandCenter.metrics.snapshots || 0} snapshot${homeownersCommandCenter.metrics.snapshots === 1 ? "" : "s"} and ${homeownersCommandCenter.metrics.analytics || 0} analytic${homeownersCommandCenter.metrics.analytics === 1 ? "" : "s"} are visible.`,
                  ]}
                />
                {homeownersCommandCenter.blockers.length > 0 ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {homeownersCommandCenter.blockers.map((item) => (
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
                          const workflowItem =
                            homeownersReviewItemsById[`homeowners:${homeownersPolicy?.id}:${item.id}`] || null;
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
                    title="No active homeowners blockers"
                    description="This homeowners policy currently looks relatively steady across evidence, linkage, renewal, and continuity."
                  />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "18px" }}>
            <SectionCard title="Homeowners Policy Summary">
              <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Policy Name:</strong> {homeownersPolicy.policy_name || linkedAsset?.asset_name || "Limited visibility"}</div>
                <div><strong>Policy Type:</strong> {homeownersPolicyType?.display_name || homeownersPolicy.homeowners_policy_type_key}</div>
                <div><strong>Carrier:</strong> {getHomeownersCarrier(homeownersPolicy.carrier_key)?.display_name || homeownersPolicy.carrier_key || linkedAsset?.institution_name || "Limited visibility"}</div>
                <div><strong>Property Address:</strong> {homeownersPolicy.property_address || "Limited visibility"}</div>
                <div><strong>Named Insured:</strong> {homeownersPolicy.named_insured || "Limited visibility"}</div>
                <div><strong>Effective:</strong> {formatDate(homeownersPolicy.effective_date)}</div>
                <div><strong>Expiration:</strong> {formatDate(homeownersPolicy.expiration_date)}</div>
                <div><strong>Status:</strong> <StatusBadge label={homeownersPolicy.policy_status || "unknown"} tone={getStatusTone(homeownersPolicy.policy_status)} /></div>
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
                    This homeowners record remains linked to the broader platform asset layer so shared documents, portals, alerts, and tasks can continue to coexist cleanly.
                  </div>
                </div>
              ) : (
                <EmptyState title="No linked asset summary" description="This homeowners policy does not currently show a linked generic asset record." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "18px" }}>
            <SectionCard title="Linked Property">
              {propertyLinks.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {propertyLinks.map((link) => {
                    const propertyRecord = link.properties || {};
                    return (
                      <div key={link.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>{propertyRecord.property_name || propertyRecord.assets?.asset_name || propertyRecord.property_address || "Property"}</div>
                            <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                              <div><strong>Address:</strong> {propertyRecord.property_address || "Limited visibility"}</div>
                            <div><strong>Status:</strong> {propertyRecord.property_status || "Limited visibility"}</div>
                            <div><strong>Link Type:</strong> {link.link_type || "primary_property_coverage"}</div>
                            <div><strong>Primary:</strong> {link.is_primary ? "Yes" : "No"}</div>
                            <div><strong>Notes:</strong> {link.notes || "None"}</div>
                          </div>
                        </div>
                          <div style={{ display: "grid", gap: "8px" }}>
                            <button onClick={() => onNavigate(`/property/detail/${propertyRecord.id}`)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
                              Open Property
                            </button>
                            <button onClick={() => beginEditLink(link)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
                              Edit Link
                            </button>
                            <button onClick={() => handleRemoveLink(link.id)} disabled={removingLinkId === link.id} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #fecaca", background: "#fff1f2", cursor: "pointer", fontWeight: 700, color: "#991b1b" }}>
                              {removingLinkId === link.id ? "Removing..." : "Remove Link"}
                            </button>
                          </div>
                        </div>
                        {editingLinkId === link.id ? (
                          <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
                            <select value={linkDraft.link_type} onChange={(event) => setLinkDraft((current) => ({ ...current, link_type: event.target.value }))} style={{ padding: "10px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                              <option value="primary_property_coverage">primary_property_coverage</option>
                              <option value="supplemental_reference">supplemental_reference</option>
                              <option value="flood_reference">flood_reference</option>
                              <option value="earthquake_reference">earthquake_reference</option>
                              <option value="other">other</option>
                            </select>
                            <label style={{ color: "#475569", display: "flex", gap: "8px", alignItems: "center" }}>
                              <input type="checkbox" checked={linkDraft.is_primary} onChange={(event) => setLinkDraft((current) => ({ ...current, is_primary: event.target.checked }))} />
                              Primary property link
                            </label>
                            <textarea value={linkDraft.notes} onChange={(event) => setLinkDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Link notes" style={{ padding: "10px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }} />
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                              <button onClick={() => handleSaveLink(link.id)} disabled={savingLinkId === link.id} type="button" style={{ padding: "10px 12px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                                {savingLinkId === link.id ? "Saving..." : "Save Link"}
                              </button>
                              <button onClick={() => setEditingLinkId("")} type="button" style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No linked property yet" description="Link a property record to make the homeowners relationship visible in the property stack." />
              )}
            </SectionCard>

            <SectionCard title="Link Existing Property">
              <form onSubmit={handleLinkProperty} style={{ display: "grid", gap: "12px" }}>
                <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">Select household property</option>
                  {availableProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.property_name || property.property_address || property.assets?.asset_name || property.id}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={linkingProperty || !selectedPropertyId} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                  {linkingProperty ? "Linking Property..." : "Link Property"}
                </button>
                <AIInsightPanel
                  title="Property Stack Status"
                  summary={`Current linkage status: ${linkageStatus}`}
                  bullets={[
                    propertyLinks.length > 0
                      ? "This homeowners policy is already visible in the property stack."
                      : "This homeowners policy is not yet linked to a property record.",
                  ]}
                />
                {linkSuccess ? <div style={{ color: "#166534", fontSize: "14px" }}>{linkSuccess}</div> : null}
                {linkError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{linkError}</div> : null}
              </form>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "18px" }}>
            <SectionCard title="Homeowners Documents">
              {bundle.homeownersDocuments.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.homeownersDocuments.map((document) => (
                    <div key={document.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {document.asset_documents?.file_name || document.document_class_key || "Homeowners document"}
                      </div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Document Class:</strong> {getHomeownersDocumentClass(document.document_class_key)?.display_name || document.document_class_key || "Limited visibility"}</div>
                        <div><strong>Carrier:</strong> {getHomeownersCarrier(document.carrier_key)?.display_name || document.carrier_key || "Limited visibility"}</div>
                        <div><strong>Document Date:</strong> {formatDate(document.document_date)}</div>
                        <div><strong>Created:</strong> {formatDate(document.created_at)}</div>
                        <div><strong>Generic Asset Document:</strong> {document.asset_document_id || "Not linked yet"}</div>
                        <div><strong>Asset Document Status:</strong> {document.asset_documents?.processing_status || "Not available"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No homeowners documents yet" description="Homeowners-specific document records will appear here as uploads are classified and linked." />
              )}
            </SectionCard>

            <SectionCard title="Homeowners Document Intake">
              <form onSubmit={handleUploadDocuments} style={{ display: "grid", gap: "12px" }}>
                <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); enqueueFiles(event.dataTransfer.files); }} style={{ border: "1px dashed #94a3b8", borderRadius: "16px", padding: "20px", background: "#f8fafc" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop homeowners documents here</div>
                  <p style={{ marginTop: "8px", color: "#64748b", lineHeight: "1.6" }}>
                    Upload declarations pages, renewals, billing notices, endorsements, and related homeowners documents into this policy. The original file is saved as a generic asset document and then linked into the homeowners module.
                  </p>
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(event) => enqueueFiles(event.target.files)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700 }}>
                    Select Homeowners Documents
                  </button>
                </div>
                <select value={uploadForm.document_class_key} onChange={(event) => setUploadForm((current) => ({ ...current, document_class_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  {HOMEOWNERS_DOCUMENT_CLASSES.map((documentClass) => (
                    <option key={documentClass.document_class_key} value={documentClass.document_class_key}>
                      {documentClass.display_name}
                    </option>
                  ))}
                </select>
                <select value={uploadForm.carrier_key} onChange={(event) => setUploadForm((current) => ({ ...current, carrier_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">No carrier selected</option>
                  {HOMEOWNERS_CARRIERS.map((carrier) => (
                    <option key={carrier.carrier_key} value={carrier.carrier_key}>
                      {carrier.display_name}
                    </option>
                  ))}
                </select>
                <input type="date" value={uploadForm.document_date} onChange={(event) => setUploadForm((current) => ({ ...current, document_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
                <textarea value={uploadForm.notes} onChange={(event) => setUploadForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Optional intake notes" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }} />
                <button type="submit" disabled={uploading || uploadQueue.length === 0 || !linkedAsset?.id} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                  {uploading ? "Uploading Homeowners Documents..." : "Upload Homeowners Documents"}
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
                          {item.duplicate ? " | Existing generic upload reused" : ""}
                          {item.storagePath ? ` | ${item.storagePath}` : ""}
                        </div>
                        {item.errorSummary ? <div style={{ marginTop: "6px", color: "#991b1b" }}>{item.errorSummary}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No homeowners files queued" description="Add one or more homeowners documents to create linked generic and homeowners-specific document records." />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
            <SectionCard title="Homeowners Snapshots">
              {bundle.homeownersSnapshots.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.homeownersSnapshots.map((snapshot) => (
                    <div key={snapshot.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{snapshot.snapshot_type || "homeowners_snapshot"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Snapshot Date:</strong> {formatDate(snapshot.snapshot_date)}</div>
                        <div><strong>Completeness:</strong> {snapshot.completeness_assessment?.status || "Not assessed yet"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No homeowners snapshots yet" description="Homeowners snapshots will land here after later declarations and policy parsing is added." />
              )}
            </SectionCard>

            <SectionCard title="Homeowners Analytics">
              {bundle.homeownersAnalytics.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.homeownersAnalytics.map((analytics) => (
                    <div key={analytics.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{analytics.analytics_type || "homeowners_analytics"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Review Flags:</strong> {analytics.review_flags?.length ? analytics.review_flags.join(", ") : "None yet"}</div>
                        <div><strong>Created:</strong> {formatDate(analytics.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No homeowners analytics yet" description="Homeowners intelligence will appear here after future parsing and review passes are added." />
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
                <EmptyState title="No linked portals yet" description="Portal continuity records will surface here through the linked platform asset when carrier access continuity is mapped." />
              )}
            </SectionCard>

            <SectionCard title="Notes / Tasks / Alerts">
              {assetBundle ? (
                <AIInsightPanel
                  title="Platform Linkage"
                  summary="This homeowners record can inherit shared continuity context from the linked platform asset without collapsing homeowners-specific data into generic tables."
                  bullets={[
                    `Generic asset documents linked: ${assetBundle.documents?.length || 0}`,
                    `Asset alerts linked: ${assetBundle.alerts?.length || 0}`,
                    `Asset tasks linked: ${assetBundle.tasks?.length || 0}`,
                  ]}
                />
              ) : (
                <EmptyState title="Shared platform context pending" description="Alerts, tasks, notes, and broader continuity context will surface here through the linked generic asset record." />
              )}
            </SectionCard>
          </div>

          {import.meta.env.DEV ? (
            <SectionCard title="Homeowners Debug">
              <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                homeowners_policy_id={homeownersPolicy.id} | asset_id={linkedAsset?.id || "none"} | household_id={homeownersPolicy.household_id || "none"} | propertyLinkIds={propertyLinks.map((link) => link.id).join(", ") || "none"} | propertyLinkTypes={propertyLinks.map((link) => link.link_type).join(", ") || "none"} | propertyLinkPrimary={propertyLinks.map((link) => String(Boolean(link.is_primary))).join(", ") || "none"} | linkageStatus={linkageStatus} | documents={bundle.homeownersDocuments.length} | snapshots={bundle.homeownersSnapshots.length} | analytics={bundle.homeownersAnalytics.length} | uploadAttempts={uploadQueue.length} | assetDocumentIds={uploadQueue.map((item) => item.assetDocumentId).filter(Boolean).join(", ") || "none"} | homeownersDocumentIds={uploadQueue.map((item) => item.homeownersDocumentId).filter(Boolean).join(", ") || "none"} | storageConfigured={isSupabaseConfigured() ? "yes" : "no"} | error={loadError || uploadError || linkError || "none"}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
