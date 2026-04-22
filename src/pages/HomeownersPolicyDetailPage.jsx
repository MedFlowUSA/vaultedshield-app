import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import HomeownersLinkedContextCard from "../components/homeowners/HomeownersLinkedContextCard";
import PageHeader from "../components/layout/PageHeader";
import PlainLanguageBridge from "../components/shared/PlainLanguageBridge";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import {
  buildLinkedPropertyStackCompleteness,
  dedupeLinkedContextRows,
  formatCompletenessScore,
  normalizeLinkedContextRows,
  normalizeLinkedContextRowsForAssets,
} from "../lib/assetLinks/linkedContext";
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
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import { listAssetLinksForAssets } from "../lib/supabase/assetLinks";
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
import { buildReviewWorkspaceRoute, deriveReviewWorkspaceCandidateFromQueueItem } from "../lib/reviewWorkspace/workspaceFilters";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

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

class HomeownersDetailRecoveryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error("[VaultedShield] Homeowners detail render failure", error);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <SectionCard
          title="Homeowners detail recovery"
          subtitle="VaultedShield hit a live rendering issue on this homeowners view, so the page was reduced to a safe fallback instead of failing blank."
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "#fff7ed",
                border: "1px solid #fdba74",
                color: "#9a3412",
                lineHeight: "1.6",
              }}
            >
              {this.state.error?.message || "Homeowners detail could not be fully rendered."}
            </div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              The route is still available, and the recovery state keeps the protection side of the stack from disappearing entirely.
            </div>
          </div>
        </SectionCard>
      );
    }

    return this.props.children;
  }
}

export default function HomeownersPolicyDetailPage({ homeownersPolicyId, onNavigate }) {
  const { isTablet } = useResponsiveLayout();
  const { householdState, debug: shellDebug, intelligenceBundle } = usePlatformShellData();
  const fileInputRef = useRef(null);
  const technicalAnalysisRef = useRef(null);
  const [bundle, setBundle] = useState(null);
  const [assetBundle, setAssetBundle] = useState(null);
  const [propertyLinks, setPropertyLinks] = useState([]);
  const [linkedPropertyAssetLinks, setLinkedPropertyAssetLinks] = useState([]);
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
    try {
      const result = await getHomeownersPolicyBundle(targetHomeownersPolicyId, platformScope);
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
        const nextPropertyLinks = propertyLinksResult.data || [];
        setPropertyLinks(nextPropertyLinks);
        if (!options.silent && propertyLinksResult.error) {
          setLinkError(propertyLinksResult.error.message || "");
        }

        const linkedPropertyAssetIds = nextPropertyLinks
          .map((link) => link.properties?.assets?.id)
          .filter(Boolean);
        const propertyAssetLinksResult = await listAssetLinksForAssets(linkedPropertyAssetIds, platformScope);
        setLinkedPropertyAssetLinks(propertyAssetLinksResult.data || []);
        if (!options.silent && propertyAssetLinksResult.error) {
          setLinkError(propertyAssetLinksResult.error.message || "");
        }
      } else {
        setLinkedPropertyAssetLinks([]);
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
    } catch (error) {
      if (!options.silent) {
        setBundle(null);
        setAssetBundle(null);
        setPropertyLinks([]);
        setLinkedPropertyAssetLinks([]);
        setAvailableProperties([]);
        setLoadError(error?.message || "Homeowners policy bundle could not be loaded.");
      }
      return { data: null, error: error || new Error("Homeowners policy bundle could not be loaded.") };
    }
  }, [platformScope]);

  useEffect(() => {
    if (!homeownersPolicyId) return;
    let active = true;
    async function loadBundle() {
      setLoading(true);
      try {
        await loadHomeownersBundle(homeownersPolicyId);
      } finally {
        if (active) setLoading(false);
      }
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
    setLinkedPropertyAssetLinks([]);
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
  const homeownersAssetLinks = useMemo(
    () => bundle?.homeownersAssetLinks || [],
    [bundle?.homeownersAssetLinks]
  );
  const bundleWarnings = useMemo(() => bundle?.bundleWarnings || [], [bundle?.bundleWarnings]);
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
  const topHomeownersReviewItem = homeownersReviewQueueItems[0] || null;
  const homeownersReviewWorkspaceRoute = useMemo(() => {
    const filters =
      deriveReviewWorkspaceCandidateFromQueueItem(
        topHomeownersReviewItem,
        reviewScope.householdId || homeownersPolicy?.household_id || null
      ) || {
        module: "homeowners",
        issueType: "policy_review_issue",
        severity: propertyLinks.length > 0 ? "medium" : "high",
        householdId: reviewScope.householdId || homeownersPolicy?.household_id || null,
        assetId: linkedAsset?.id || null,
        recordId: homeownersPolicy?.id || null,
      };

    return buildReviewWorkspaceRoute({
      filters,
      openedFromAssistant: true,
    });
  }, [
    homeownersPolicy?.household_id,
    homeownersPolicy?.id,
    linkedAsset?.id,
    propertyLinks.length,
    reviewScope.householdId,
    topHomeownersReviewItem,
  ]);
  const assigneeChoices = useMemo(() => buildReviewAssignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);
  const plainLanguageGuide = useMemo(() => {
    const documentCount = bundle?.homeownersDocuments?.length || 0;
    const snapshotCount = bundle?.homeownersSnapshots?.length || 0;
    const topBlocker = homeownersCommandCenter.blockers?.[0] || null;
    const everydayVerdict =
      homeownersCommandCenter.metrics.critical > 0
        ? "This homeowners policy has important protection gaps"
        : homeownersCommandCenter.metrics.warning > 0
          ? "This homeowners policy looks usable but needs review"
          : "This homeowners policy looks reasonably supported";

    const confidenceDriver =
      bundleWarnings.length > 0
        ? "Some supporting homeowners context is unavailable right now, so this read is leaning on the verified records that did load."
        : propertyLinks.length === 0
          ? "No linked property is visible yet, so stack confidence is weaker than it should be."
          : "The policy has property-stack context, which makes the current read more trustworthy.";

    return {
      title: "Start here before the technical homeowners review",
      summary: homeownersCommandCenter.headline,
      transition:
        "This top layer gives the simple read first. The technical section below breaks out blockers, workflow, property linkage, documents, snapshots, and analytics.",
      quickFacts: [
        propertyLinks.length > 0
          ? `${propertyLinks.length} linked propert${propertyLinks.length === 1 ? "y is" : "ies are"} visible for this policy.`
          : "No linked property is visible yet for this policy.",
        documentCount > 0
          ? `${documentCount} homeowners document${documentCount === 1 ? "" : "s"} and ${snapshotCount} snapshot${snapshotCount === 1 ? "" : "s"} are visible.`
          : "No homeowners-specific documents are visible yet.",
        bundleWarnings.length > 0
          ? "Some supporting homeowners context is temporarily unavailable."
          : topHomeownersReviewItem?.summary || "No single homeowners issue is standing out above the rest right now.",
      ],
      cards: [
        { label: "In plain English", value: everydayVerdict, detail: homeownersCommandCenter.headline },
        { label: "What to do first", value: topHomeownersReviewItem?.title || "Open the review workspace", detail: topBlocker?.nextAction || topHomeownersReviewItem?.summary || "Review the top homeowners blocker first." },
        { label: "Why confidence is limited or strong", value: `Stack ${formatCompletenessScore(linkedStackCompleteness.score)}`, detail: confidenceDriver },
      ],
    };
  }, [bundle?.homeownersDocuments?.length, bundle?.homeownersSnapshots?.length, bundleWarnings.length, homeownersCommandCenter, linkedStackCompleteness.score, propertyLinks.length, topHomeownersReviewItem]);

  const summaryItems = useMemo(() => {
    if (!homeownersPolicy) return [];
    return [
      { label: "Policy Status", value: homeownersPolicy.policy_status || "unknown", helper: homeownersPolicyType?.display_name || "Homeowners" },
      { label: "Documents", value: bundle?.homeownersDocuments?.length || 0, helper: "Homeowners-specific document records" },
      { label: "Snapshots", value: bundle?.homeownersSnapshots?.length || 0, helper: "Normalized homeowners records" },
      { label: "Analytics", value: bundle?.homeownersAnalytics?.length || 0, helper: "Future homeowners review outputs" },
    ];
  }, [bundle, homeownersPolicy, homeownersPolicyType]);
  const propertyAssetIds = useMemo(
    () => propertyLinks.map((link) => link.properties?.assets?.id).filter(Boolean),
    [propertyLinks]
  );
  const propertyAnalyticsById = useMemo(
    () => intelligenceBundle?.propertyStackSummary?.analyticsByPropertyId || {},
    [intelligenceBundle?.propertyStackSummary?.analyticsByPropertyId]
  );
  const linkedStackCompleteness = useMemo(
    () => buildLinkedPropertyStackCompleteness(propertyLinks, propertyAnalyticsById),
    [propertyAnalyticsById, propertyLinks]
  );
  const homeownersLinkedContext = useMemo(() => {
    const normalizedHomeownersLinks = dedupeLinkedContextRows(
      normalizeLinkedContextRows(homeownersAssetLinks, linkedAsset?.id)
    );
    const normalizedPropertyLinks = dedupeLinkedContextRows(
      normalizeLinkedContextRowsForAssets(linkedPropertyAssetLinks, propertyAssetIds)
    );

    return {
      propertyRows: normalizedHomeownersLinks.filter((row) => row.bucket === "property"),
      liabilityRows: normalizedPropertyLinks.filter((row) => row.bucket === "liability"),
    };
  }, [homeownersAssetLinks, linkedAsset?.id, linkedPropertyAssetLinks, propertyAssetIds]);
  const documentRailLayout = isTablet ? "1fr" : "1.15fr 1fr";
  const dualLayout = isTablet ? "1fr" : "1fr 1fr";

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

      <HomeownersDetailRecoveryBoundary>
        {loading ? (
          <SectionCard><div style={{ color: "#64748b" }}>Loading homeowners policy bundle...</div></SectionCard>
        ) : !homeownersPolicy ? (
          <EmptyState title="Homeowners policy not found" description={loadError || "This homeowners detail page could not load a matching policy record."} />
        ) : (
          <>
          {bundleWarnings.length > 0 ? (
            <SectionCard
              title="Partial visibility"
              subtitle="The core homeowners policy loaded, but some supporting policy context is still unavailable. VaultedShield is showing the verified data that could be read safely."
            >
              <div style={{ display: "grid", gap: "8px" }}>
                {bundleWarnings.map((warning) => (
                  <div
                    key={warning.area}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "12px",
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                      color: "#9a3412",
                      lineHeight: "1.6",
                    }}
                  >
                    {warning.message}
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}
          <SummaryPanel items={summaryItems} />
          <div style={{ marginTop: "18px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <StatusBadge label={homeownersPolicyType?.display_name || homeownersPolicy.homeowners_policy_type_key} tone="info" />
            <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
            <StatusBadge
              label={`Stack ${formatCompletenessScore(linkedStackCompleteness.score)}`}
              tone={linkedStackCompleteness.tone}
            />
          </div>

          <PlainLanguageBridge
            compact
            title={plainLanguageGuide.title}
            summary={plainLanguageGuide.summary}
            transition={plainLanguageGuide.transition}
            quickFacts={plainLanguageGuide.quickFacts}
            cards={plainLanguageGuide.cards}
            primaryActionLabel="Open Review Workspace"
            onPrimaryAction={() => onNavigate?.(homeownersReviewWorkspaceRoute)}
            secondaryActionLabel="Step Into The Deeper Breakdown"
            onSecondaryAction={() => technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            guideTitle="Read this homeowners page in layers"
            guideDescription="You do not need the full homeowners analysis to understand the policy. Start with the simple answer, take the first action, and only open the deeper proof when you want the reasoning behind it."
            guideSteps={[
              {
                label: "Step 1",
                title: "Read the simple answer first",
                detail: "Use the plain-English summary above to decide whether the policy looks supported, thin, or risky before reading the analyst detail.",
              },
              {
                label: "Step 2",
                title: "Check the first protection move",
                detail: topHomeownersReviewItem?.summary || "Focus on the top homeowners blocker first so the stack becomes safer and easier to trust.",
              },
              {
                label: "Step 3",
                title: "Use the deeper review as proof",
                detail: "The darker layer exists to show the evidence: blockers, property linkage, documents, snapshots, analytics, and workflow detail.",
              },
            ]}
            translatedTerms={[
              {
                term: "Stack Score",
                meaning: `Stack score is a shortcut for how complete the surrounding property context is. This policy currently reads as ${formatCompletenessScore(linkedStackCompleteness.score)}.`,
              },
              {
                term: "Property Linkage",
                meaning: propertyLinks.length > 0
                  ? "Property linkage means this homeowners policy is attached to at least one property record, so the system can read it as part of a real protection stack."
                  : "Property linkage means whether this policy is attached to the home it is meant to protect.",
              },
              {
                term: "Snapshot",
                meaning: "A snapshot is the normalized version of a policy record or statement, so the page can read coverage facts in a structured way.",
              },
              {
                term: "Review Workspace",
                meaning: "Review Workspace is the shared place to track, assign, and clear follow-up work when a homeowners issue needs more than a quick read.",
              },
            ]}
            depthTitle="Use the deeper breakdown as supporting proof"
            depthDescription="The darker section below is there to explain why this homeowners policy was scored this way, not to make the first read harder."
            depthPrimaryActionLabel="Start With Homeowners Command"
            onDepthPrimaryAction={() => technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            depthSecondaryActionLabel="Open Review Workspace"
            onDepthSecondaryAction={() => onNavigate?.(homeownersReviewWorkspaceRoute)}
            analysisRef={technicalAnalysisRef}
            analysisEyebrow="Deeper Review Starts Here"
            analysisTitle="Technical breakdown: homeowners blockers, property linkage, documents, snapshots, analytics, and workflow"
            analysisDescription="Everything below this point is the proof layer. It explains the live homeowners blockers, property linkage, documents, snapshots, analytics, and the workflow behind the simpler read above."
          />

          <div style={{ marginTop: "24px" }} ref={technicalAnalysisRef}>
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
                <EmptyState title="No linked household summary" description="This homeowners policy is not yet connected to a broader household asset summary." />
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
                <div
                  style={{
                    padding: "16px 18px",
                    borderRadius: "14px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Review Workspace Handoff</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>
                    The command center and linked context already explain this policy’s place in the property stack. Shared follow-up is cleaner in Review Workspace once the issue needs tracking or assignment.
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>
                    {topHomeownersReviewItem?.summary || `Current linkage status: ${linkageStatus}`}
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onNavigate?.(homeownersReviewWorkspaceRoute)}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Open Review Workspace
                    </button>
                    {topHomeownersReviewItem?.route ? (
                      <button
                        type="button"
                        onClick={() => onNavigate?.(topHomeownersReviewItem.route)}
                        style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
                      >
                        Open Top Homeowners Review
                      </button>
                    ) : null}
                  </div>
                </div>
                {linkSuccess ? <div style={{ color: "#166534", fontSize: "14px" }}>{linkSuccess}</div> : null}
                {linkError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{linkError}</div> : null}
              </form>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px" }}>
            <SectionCard
              title="Linked Context"
              subtitle="Read this homeowners policy as part of the broader operating graph across property, liabilities, documents, and access continuity."
            >
              <HomeownersLinkedContextCard
                propertyRows={homeownersLinkedContext.propertyRows}
                liabilityRows={homeownersLinkedContext.liabilityRows}
                propertyLinks={propertyLinks}
                stackCompleteness={linkedStackCompleteness}
                homeownersDocuments={bundle.homeownersDocuments || []}
                assetBundle={assetBundle}
                onNavigate={onNavigate}
                isMobile={isTablet}
              />
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: documentRailLayout, gap: "18px" }}>
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
                        <div><strong>Household Document Link:</strong> {document.asset_document_id || "Not linked yet"}</div>
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
                    Upload declarations pages, renewals, billing notices, endorsements, and related homeowners documents into this policy. The original file is saved in the household vault and then linked into the homeowners module.
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
                          {item.duplicate ? " | Existing household upload reused" : ""}
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

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualLayout, gap: "18px" }}>
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

          {shouldShowDevDiagnostics() ? (
            <SectionCard title="Homeowners Debug">
              <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                homeowners_policy_id={homeownersPolicy.id} | asset_id={linkedAsset?.id || "none"} | household_id={homeownersPolicy.household_id || "none"} | propertyLinkIds={propertyLinks.map((link) => link.id).join(", ") || "none"} | propertyLinkTypes={propertyLinks.map((link) => link.link_type).join(", ") || "none"} | propertyLinkPrimary={propertyLinks.map((link) => String(Boolean(link.is_primary))).join(", ") || "none"} | linkageStatus={linkageStatus} | homeownersAssetLinks={homeownersAssetLinks.length} | linkedPropertyAssetLinks={linkedPropertyAssetLinks.length} | documents={bundle.homeownersDocuments.length} | snapshots={bundle.homeownersSnapshots.length} | analytics={bundle.homeownersAnalytics.length} | uploadAttempts={uploadQueue.length} | assetDocumentIds={uploadQueue.map((item) => item.assetDocumentId).filter(Boolean).join(", ") || "none"} | homeownersDocumentIds={uploadQueue.map((item) => item.homeownersDocumentId).filter(Boolean).join(", ") || "none"} | storageConfigured={isSupabaseConfigured() ? "yes" : "no"} | error={loadError || uploadError || linkError || "none"}
              </div>
            </SectionCard>
          ) : null}
          </>
        )}
      </HomeownersDetailRecoveryBoundary>
    </div>
  );
}
