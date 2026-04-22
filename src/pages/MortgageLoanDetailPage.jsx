import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import InsightExplanationPanel from "../components/shared/InsightExplanationPanel";
import PageHeader from "../components/layout/PageHeader";
import MortgageAIChat from "../components/mortgage/MortgageAIChat";
import MortgageLinkedContextCard from "../components/mortgage/MortgageLinkedContextCard";
import IntelligenceFasciaCard from "../components/shared/IntelligenceFasciaCard";
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
  buildMortgageReviewSignals,
  getMortgageDocumentClass,
  getMortgageLender,
  getMortgageLoanType,
  listMortgageLenders,
} from "../lib/domain/mortgage";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  getMortgageLoanBundle,
  getMortgageLinkageStatus,
  linkMortgageToProperty,
  listMortgagePropertyLinks,
  listMortgageDocumentClasses,
  unlinkMortgageFromProperty,
  updatePropertyMortgageLink,
  uploadMortgageDocument,
} from "../lib/supabase/mortgageData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import { buildReviewWorkspaceRoute } from "../lib/reviewWorkspace/workspaceFilters";
import { listAssetLinksForAssets } from "../lib/supabase/assetLinks";
import { listProperties } from "../lib/supabase/propertyData";
import { getAssetDetailBundle } from "../lib/supabase/platformData";
import { buildMortgageCommandCenter } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import buildMortgagePageFascia from "../lib/intelligence/fascia/buildMortgagePageFascia";
import { executeSmartAction } from "../lib/navigation/smartActions";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";

const MORTGAGE_DOCUMENT_CLASSES = listMortgageDocumentClasses();
const MORTGAGE_LENDERS = listMortgageLenders();

const DEFAULT_UPLOAD_FORM = {
  document_class_key: "monthly_statement",
  lender_key: "",
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
  if (status === "active" || status === "current") return "good";
  if (status === "watch" || status === "modification_review") return "warning";
  if (status === "paid_off" || status === "closed" || status === "delinquent") return "info";
  return "info";
}

class MortgageDetailRecoveryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error("[VaultedShield] Mortgage detail render failure", error);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <SectionCard
          title="Mortgage detail recovery"
          subtitle="VaultedShield hit a live rendering issue on this mortgage view, so the page was reduced to a safe fallback instead of failing blank."
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
              {this.state.error?.message || "Mortgage detail could not be fully rendered."}
            </div>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              The core route is still available. A follow-up debugging pass should now have a stable recovery surface instead of an empty shell.
            </div>
          </div>
        </SectionCard>
      );
    }

    return this.props.children;
  }
}

export default function MortgageLoanDetailPage({ mortgageLoanId, onNavigate }) {
  const { isTablet } = useResponsiveLayout();
  const { householdState, debug: shellDebug, intelligenceBundle } = usePlatformShellData();
  const fileInputRef = useRef(null);
  const sectionRefs = useRef({});
  const technicalAnalysisRef = useRef(null);
  const [bundle, setBundle] = useState(null);
  const [assetBundle, setAssetBundle] = useState(null);
  const [propertyLinks, setPropertyLinks] = useState([]);
  const [showFasciaExplanation, setShowFasciaExplanation] = useState(false);
  const [linkedPropertyAssetLinks, setLinkedPropertyAssetLinks] = useState([]);
  const [availableProperties, setAvailableProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkSuccess, setLinkSuccess] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [linkingProperty, setLinkingProperty] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState("");
  const [linkDraft, setLinkDraft] = useState({ link_type: "primary_financing", is_primary: true, notes: "" });
  const [savingLinkId, setSavingLinkId] = useState("");
  const [removingLinkId, setRemovingLinkId] = useState("");
  const [uploadForm, setUploadForm] = useState(DEFAULT_UPLOAD_FORM);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const platformScope = useMemo(
    () => ({
      householdId: householdState.context.householdId || null,
      authUserId: shellDebug.authUserId || null,
      ownershipMode: householdState.context.ownershipMode || "unknown",
      guestFallbackActive: householdState.context.guestFallbackActive,
      scopeSource: "mortgage_detail_page",
    }),
    [
      householdState.context.guestFallbackActive,
      householdState.context.householdId,
      householdState.context.ownershipMode,
      shellDebug.authUserId,
    ]
  );
  const scopeKey = `${platformScope.authUserId || "guest"}:${platformScope.householdId || "none"}:${platformScope.ownershipMode}`;

  const loadMortgageBundle = useCallback(async (targetMortgageLoanId, options = {}) => {
    try {
      const result = await getMortgageLoanBundle(targetMortgageLoanId, platformScope);
      if (result.error || !result.data?.mortgageLoan) {
        if (!options.silent) {
          setBundle(null);
          setAssetBundle(null);
          setLoadError(result.error?.message || "Mortgage loan bundle could not be loaded.");
        }
        return { data: null, error: result.error || new Error("Mortgage loan bundle could not be loaded.") };
      }

      setBundle(result.data);
      if (!options.silent) setLoadError("");
      if (!options.silent) setLinkError("");

      const linkedAssetId = result.data.mortgageLoan.assets?.id;
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

      if (result.data.mortgageLoan?.id) {
        const propertyLinksResult = await listMortgagePropertyLinks(result.data.mortgageLoan.id);
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

      if (result.data.mortgageLoan?.household_id) {
        const propertiesResult = await listProperties(
          platformScope.householdId || result.data.mortgageLoan.household_id
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
        setLoadError(error?.message || "Mortgage loan bundle could not be loaded.");
      }
      return { data: null, error: error || new Error("Mortgage loan bundle could not be loaded.") };
    }
  }, [platformScope]);

  useEffect(() => {
    if (!mortgageLoanId) return;
    let active = true;
    async function loadBundle() {
      setLoading(true);
      try {
        await loadMortgageBundle(mortgageLoanId);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadBundle();
    return () => {
      active = false;
    };
  }, [loadMortgageBundle, mortgageLoanId, scopeKey]);

  const mortgageLoan = bundle?.mortgageLoan || null;
  const mortgageLoanType = mortgageLoan
    ? getMortgageLoanType(mortgageLoan.mortgage_loan_type_key)
    : null;
  const linkedAsset = mortgageLoan?.assets || null;
  const mortgageAssetLinks = useMemo(
    () => bundle?.mortgageAssetLinks || [],
    [bundle?.mortgageAssetLinks]
  );
  const bundleWarnings = useMemo(() => bundle?.bundleWarnings || [], [bundle?.bundleWarnings]);
  const linkageStatus = getMortgageLinkageStatus({
    linkedProperties: propertyLinks,
  });
  const mortgageReview = useMemo(
    () =>
      buildMortgageReviewSignals({
        mortgageLoan,
        documents: bundle?.mortgageDocuments || [],
        propertyLinks,
        snapshots: bundle?.mortgageSnapshots || [],
      }),
    [bundle?.mortgageDocuments, bundle?.mortgageSnapshots, mortgageLoan, propertyLinks]
  );
  const mortgageCommandCenter = useMemo(
    () =>
      buildMortgageCommandCenter({
        mortgageLoan,
        mortgageReview,
        mortgageDocuments: bundle?.mortgageDocuments || [],
        mortgageSnapshots: bundle?.mortgageSnapshots || [],
        mortgageAnalytics: bundle?.mortgageAnalytics || [],
        propertyLinks,
        assetBundle,
      }),
    [
      assetBundle,
      bundle?.mortgageAnalytics,
      bundle?.mortgageDocuments,
      bundle?.mortgageSnapshots,
      mortgageLoan,
      mortgageReview,
      propertyLinks,
    ]
  );
  const mortgageReviewWorkspaceRoute = useMemo(
    () =>
      buildReviewWorkspaceRoute({
        filters: {
          module: "mortgage",
          issueType: mortgageReview.metrics?.documentSupport === "strong" ? "review_needed" : "sparse_documentation",
          severity: propertyLinks.length > 0 ? "medium" : "high",
          householdId: mortgageLoan?.household_id || householdState.context.householdId || null,
          assetId: linkedAsset?.id || null,
          recordId: mortgageLoan?.id || null,
        },
        openedFromAssistant: true,
      }),
    [
      householdState.context.householdId,
      linkedAsset?.id,
      mortgageLoan?.household_id,
      mortgageLoan?.id,
      mortgageReview.metrics?.documentSupport,
      propertyLinks.length,
    ]
  );
  const mortgagePageFascia = useMemo(
    () =>
      buildMortgagePageFascia({
        mortgageLoan,
        mortgageReview,
        mortgageCommandCenter,
        mortgageDocuments: bundle?.mortgageDocuments || [],
        mortgageSnapshots: bundle?.mortgageSnapshots || [],
        mortgageAnalytics: bundle?.mortgageAnalytics || [],
        propertyLinks,
        bundleWarnings,
      }),
    [
      bundle?.mortgageAnalytics,
      bundle?.mortgageDocuments,
      bundle?.mortgageSnapshots,
      bundleWarnings,
      mortgageCommandCenter,
      mortgageLoan,
      mortgageReview,
      propertyLinks,
    ]
  );
  const mortgagePageFasciaDisplay = useMemo(() => {
    if (!mortgagePageFascia) return null;

    return {
      ...mortgagePageFascia,
      tertiaryAction: mortgagePageFascia.tertiaryAction
        ? {
            ...mortgagePageFascia.tertiaryAction,
            label: showFasciaExplanation ? "Hide explanation" : "Why am I seeing this?",
          }
        : null,
    };
  }, [mortgagePageFascia, showFasciaExplanation]);

  const mortgagePlainEnglishGuide = useMemo(() => {
    const documentCount = bundle?.mortgageDocuments?.length || 0;
    const snapshotCount = bundle?.mortgageSnapshots?.length || 0;
    const topBlocker = mortgageCommandCenter.blockers?.[0] || null;
    const everydayVerdict =
      mortgagePageFascia?.status === "Strong"
        ? "This mortgage looks well supported"
        : mortgagePageFascia?.status === "Stable"
          ? "This mortgage looks mostly okay"
          : mortgagePageFascia?.status === "Partial"
            ? "There is enough to start reading the loan, but not enough to fully trust it"
            : mortgagePageFascia?.status === "At Risk"
              ? "This mortgage may need attention soon"
              : "The mortgage picture is still developing";

    const confidenceDriver =
      bundleWarnings.length > 0
        ? "Some supporting mortgage context is unavailable right now, so the page is leaning on the verified records that did load."
        : documentCount === 0
          ? "There are no mortgage-specific documents attached yet, which keeps this read fairly thin."
          : propertyLinks.length === 0
            ? "The loan exists, but it is not yet anchored to a property stack, so continuity context is weaker."
            : "The loan has document and property context, which makes the current mortgage read more trustworthy.";

    return {
      eyebrow: "Plain-English First",
      title: "Start here before the technical mortgage review",
      summary: mortgagePageFascia?.meaning || "This page simplifies what the mortgage record is saying before you move into the technical review.",
      transition:
        "The short version tells you whether this loan looks stable, thin, or risky. The technical sections below explain why, show the blockers, and break out documents, linked property context, and detailed mortgage facts.",
      cards: [
        {
          label: "In plain English",
          value: everydayVerdict,
          detail: mortgagePageFascia?.meaning || mortgageCommandCenter.headline,
        },
        {
          label: "What to do first",
          value: mortgagePageFascia?.primaryAction?.label || "Review the top mortgage blocker",
          detail:
            topBlocker?.blocker ||
            mortgagePageFascia?.explanation?.recommendedAction?.detail ||
            mortgageCommandCenter.headline,
        },
        {
          label: "Why confidence is limited or strong",
          value: `${documentCount} mortgage document${documentCount === 1 ? "" : "s"} visible`,
          detail: confidenceDriver,
        },
      ],
      quickFacts: [
        propertyLinks.length > 0
          ? `${propertyLinks.length} linked propert${propertyLinks.length === 1 ? "y is" : "ies are"} visible for this loan.`
          : "No linked property is visible yet for this mortgage.",
        documentCount > 0
          ? `${documentCount} mortgage document${documentCount === 1 ? "" : "s"} and ${snapshotCount} normalized snapshot${snapshotCount === 1 ? "" : "s"} are available.`
          : "The page still needs mortgage documents before the read can become much stronger.",
        topBlocker
          ? `The current top mortgage issue is ${topBlocker.title.toLowerCase()}.`
          : "No single mortgage blocker is standing out above the rest right now.",
      ],
    };
  }, [
    bundle?.mortgageDocuments?.length,
    bundle?.mortgageSnapshots?.length,
    bundleWarnings.length,
    mortgageCommandCenter,
    mortgagePageFascia,
    propertyLinks.length,
  ]);
  const mortgageTransitionGuide = useMemo(() => {
    const documentCount = bundle?.mortgageDocuments?.length || 0;
    const stackScoreLabel = formatCompletenessScore(linkedStackCompleteness.score);

    return {
      steps: [
        {
          label: "Step 1",
          title: "Read the simple answer first",
          detail:
            "Use the plain-English summary above to decide whether this loan looks solid, thin, or worth attention before you read any mortgage diagnostics.",
        },
        {
          label: "Step 2",
          title: "Check the first move",
          detail:
            mortgagePageFascia?.primaryAction?.label
            || "Focus on the top blocker next so you know what would strengthen this mortgage picture fastest.",
        },
        {
          label: "Step 3",
          title: "Open the proof only when you want it",
          detail:
            "The deeper breakdown below exists to show the evidence: document support, property linkage, command-center blockers, and detailed loan records.",
        },
      ],
      keys: [
        {
          term: "Confidence",
          meaning:
            documentCount > 0
              ? "Confidence means how much evidence this page has to support its read of the loan."
              : "Confidence is low right now because the page does not have enough mortgage evidence yet.",
        },
        {
          term: "Property Linkage",
          meaning:
            propertyLinks.length > 0
              ? "Property linkage means this loan is connected to at least one property record, so the system can read it as part of a real stack."
              : "Property linkage means whether this mortgage is attached to the home it belongs to.",
        },
        {
          term: "Document Support",
          meaning:
            `${documentCount} mortgage document${documentCount === 1 ? "" : "s"} are visible right now, and that count helps determine how trustworthy the read feels.`,
        },
        {
          term: "Stack Score",
          meaning:
            `Stack score is a shortcut for how complete the surrounding property context is. This mortgage currently reads as ${stackScoreLabel}.`,
        },
      ],
    };
  }, [
    bundle?.mortgageDocuments?.length,
    linkedStackCompleteness.score,
    mortgagePageFascia?.primaryAction?.label,
    propertyLinks.length,
  ]);

  const summaryItems = useMemo(() => {
    if (!mortgageLoan) return [];
    return [
      { label: "Loan Status", value: mortgageLoan.current_status || "unknown", helper: mortgageLoanType?.display_name || "Mortgage" },
      { label: "Documents", value: bundle?.mortgageDocuments?.length || 0, helper: "Mortgage-specific document records" },
      { label: "Snapshots", value: bundle?.mortgageSnapshots?.length || 0, helper: "Normalized mortgage records" },
      { label: "Analytics", value: bundle?.mortgageAnalytics?.length || 0, helper: "Future mortgage review outputs" },
      { label: "Review Status", value: mortgageReview.readinessStatus || "unknown", helper: mortgageReview.metrics?.documentSupport || "limited support" },
    ];
  }, [bundle, mortgageLoan, mortgageLoanType, mortgageReview]);
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
  const mortgageLinkedContext = useMemo(() => {
    const normalizedMortgageLinks = dedupeLinkedContextRows(
      normalizeLinkedContextRows(mortgageAssetLinks, linkedAsset?.id)
    );
    const normalizedPropertyLinks = dedupeLinkedContextRows(
      normalizeLinkedContextRowsForAssets(linkedPropertyAssetLinks, propertyAssetIds)
    );

    return {
      propertyRows: normalizedMortgageLinks.filter((row) => row.bucket === "property"),
      protectionRows: normalizedPropertyLinks.filter((row) => row.bucket === "protection"),
    };
  }, [linkedAsset?.id, linkedPropertyAssetLinks, mortgageAssetLinks, propertyAssetIds]);
  const detailRailLayout = isTablet ? "1fr" : "1.2fr 1fr";
  const propertyRailLayout = isTablet ? "1fr" : "1.1fr 1fr";
  const documentRailLayout = isTablet ? "1fr" : "1.15fr 1fr";
  const dualLayout = isTablet ? "1fr" : "1fr 1fr";

  function setSectionRef(key, node) {
    if (!key) return;
    sectionRefs.current[key] = node;
  }

  function scrollToMortgageSection(section) {
    const target = sectionRefs.current[section];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleMortgageAction(action) {
    if (!action?.target) return;

    executeSmartAction(action.target, {
      navigate: onNavigate,
      scrollToSection: scrollToMortgageSection,
    });
  }

  function handleMortgageFasciaAction(action) {
    if (!action) return;
    if (action.kind === "toggle_explanation") {
      setShowFasciaExplanation((current) => !current);
      return;
    }

    if (!action.target) return;
    handleMortgageAction({ target: action.target });
  }

  function enqueueFiles(fileList) {
    const entries = Array.from(fileList || []).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      status: "queued",
      assetDocumentId: null,
      mortgageDocumentId: null,
      storagePath: "",
      duplicate: false,
      errorSummary: "",
    }));
    setUploadQueue((current) => [...entries, ...current]);
  }

  async function handleUploadDocuments(event) {
    event.preventDefault();
    if (!mortgageLoan || !linkedAsset?.id || uploadQueue.length === 0) return;

    setUploading(true);
    setUploadError("");

    for (const item of uploadQueue) {
      if (item.status !== "queued" && item.status !== "failed") continue;

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", errorSummary: "" } : entry
        )
      );

      const result = await uploadMortgageDocument({
        household_id: mortgageLoan.household_id,
        asset_id: linkedAsset.id,
        mortgage_loan_id: mortgageLoan.id,
        file: item.file,
        document_class_key: uploadForm.document_class_key,
        lender_key: uploadForm.lender_key || mortgageLoan.lender_key || null,
        document_date: uploadForm.document_date || null,
        notes: uploadForm.notes || null,
        metadata: { mortgage_detail_upload: true },
      });

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: result.error ? "failed" : "saved",
                assetDocumentId: result.data?.assetDocument?.id || null,
                mortgageDocumentId: result.data?.mortgageDocument?.id || null,
                storagePath: result.upload?.storagePath || "",
                duplicate: Boolean(result.duplicate),
                errorSummary: result.error?.message || result.upload?.errorSummary || "",
              }
            : entry
        )
      );

      if (result.error) {
        setUploadError(result.error.message || "Mortgage upload failed.");
        continue;
      }

      await loadMortgageBundle(mortgageLoan.id, { silent: true });
    }

    setUploading(false);
  }

  async function handleLinkProperty(event) {
    event.preventDefault();
    if (!mortgageLoan?.id || !selectedPropertyId) return;

    setLinkingProperty(true);
    setLinkError("");
    setLinkSuccess("");
    const result = await linkMortgageToProperty(selectedPropertyId, mortgageLoan.id, {
      link_type: propertyLinks.length === 0 ? "primary_financing" : "secondary_financing",
      is_primary: propertyLinks.length === 0,
      metadata: { linked_from: "mortgage_detail" },
      scopeOverride: platformScope,
    });

    if (result.error) {
      setLinkError(result.error.message || "Property link could not be created.");
      setLinkingProperty(false);
      return;
    }

    await loadMortgageBundle(mortgageLoan.id, { silent: true });
    setSelectedPropertyId("");
    setLinkSuccess("Property link saved.");
    setLinkingProperty(false);
  }

  function beginEditLink(link) {
    setEditingLinkId(link.id);
    setLinkDraft({
      link_type: link.link_type || "primary_financing",
      is_primary: Boolean(link.is_primary),
      notes: link.notes || "",
    });
    setLinkError("");
    setLinkSuccess("");
  }

  async function handleSaveLink(linkId) {
    if (!mortgageLoan?.id || !linkId) return;
    setSavingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await updatePropertyMortgageLink(linkId, {
      ...linkDraft,
      scopeOverride: platformScope,
    });
    if (result.error) {
      setLinkError(result.error.message || "Property link could not be updated.");
      setSavingLinkId("");
      return;
    }
    await loadMortgageBundle(mortgageLoan.id, { silent: true });
    setEditingLinkId("");
    setLinkSuccess("Property link updated.");
    setSavingLinkId("");
  }

  async function handleRemoveLink(linkId) {
    if (!mortgageLoan?.id || !linkId || !window.confirm("Remove this property link from the mortgage?")) return;
    setRemovingLinkId(linkId);
    setLinkError("");
    setLinkSuccess("");
    const result = await unlinkMortgageFromProperty(linkId, { scopeOverride: platformScope });
    if (result.error) {
      setLinkError(result.error.message || "Property link could not be removed.");
      setRemovingLinkId("");
      return;
    }
    await loadMortgageBundle(mortgageLoan.id, { silent: true });
    setLinkSuccess("Property link removed.");
    setRemovingLinkId("");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title={mortgageLoan?.loan_name || linkedAsset?.asset_name || "Mortgage Loan Detail"}
        description="Live mortgage bundle view backed by mortgage loans, documents, snapshots, analytics, and linked platform assets."
        actions={
          <button onClick={() => onNavigate("/mortgage")} style={{ border: "1px solid #cbd5e1", background: "#ffffff", borderRadius: "10px", padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>
            Back to Mortgage Hub
          </button>
        }
      />

      <MortgageDetailRecoveryBoundary>
        {loading ? (
          <SectionCard><div style={{ color: "#64748b" }}>Loading mortgage loan bundle...</div></SectionCard>
        ) : !mortgageLoan ? (
          <EmptyState title="Mortgage loan not found" description={loadError || "This mortgage detail page could not load a matching loan record."} />
        ) : (
          <>
          {bundleWarnings.length > 0 ? (
            <SectionCard
              title="Partial visibility"
              subtitle="The core mortgage record loaded, but some supporting mortgage context is still unavailable. VaultedShield is showing the verified data that could be read safely."
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
            <StatusBadge label={mortgageLoanType?.display_name || mortgageLoan.mortgage_loan_type_key} tone="info" />
            <StatusBadge label={linkedAsset?.id ? "Linked Asset" : "Asset Link Pending"} tone={linkedAsset?.id ? "good" : "warning"} />
            <StatusBadge
              label={`Stack ${formatCompletenessScore(linkedStackCompleteness.score)}`}
              tone={linkedStackCompleteness.tone}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <IntelligenceFasciaCard fascia={mortgagePageFasciaDisplay} onAction={handleMortgageFasciaAction} isMobile={isTablet} />
            <InsightExplanationPanel
              isOpen={showFasciaExplanation}
              explanation={mortgagePageFascia?.explanation}
              onToggle={() => setShowFasciaExplanation(false)}
              onAction={handleMortgageFasciaAction}
              isMobile={isTablet}
            />
          </div>

          <section
            style={{
              marginTop: "24px",
              display: "grid",
              gap: "20px",
              padding: isTablet ? "24px 18px" : "30px 32px",
              borderRadius: "28px",
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
                  {mortgagePlainEnglishGuide.eyebrow}
                </div>
                <div style={{ fontSize: isTablet ? "26px" : "34px", fontWeight: 800, color: "#0f172a", lineHeight: "1.08", letterSpacing: "-0.04em" }}>
                  {mortgagePlainEnglishGuide.title}
                </div>
                <div style={{ fontSize: "20px", color: "#0f172a", fontWeight: 700, lineHeight: "1.45", maxWidth: "42rem" }}>
                  {mortgagePlainEnglishGuide.summary}
                </div>
                <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "46rem" }}>{mortgagePlainEnglishGuide.transition}</div>
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
                  {mortgagePlainEnglishGuide.quickFacts.map((item) => (
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
                  {mortgagePageFascia?.primaryAction ? (
                    <button
                      type="button"
                      onClick={() => handleMortgageFasciaAction(mortgagePageFascia.primaryAction)}
                      style={{ padding: "11px 16px", borderRadius: "999px", border: "none", background: "#0f172a", color: "#ffffff", cursor: "pointer", fontWeight: 700, fontSize: "13px", boxShadow: "0 12px 24px rgba(15, 23, 42, 0.18)" }}
                    >
                      {mortgagePageFascia.primaryAction.label}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    style={{ padding: "11px 16px", borderRadius: "999px", border: "1px solid rgba(15, 23, 42, 0.12)", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700, fontSize: "13px", boxShadow: "0 10px 22px rgba(148, 163, 184, 0.12)" }}
                  >
                    Step Into The Deeper Breakdown
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
              {mortgagePlainEnglishGuide.cards.map((card) => (
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
            style={{
              marginTop: "20px",
              display: "grid",
              gap: "18px",
              padding: isTablet ? "22px 18px" : "24px 26px",
              borderRadius: "26px",
              background:
                "radial-gradient(circle at top right, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0) 30%), linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(255,255,255,1) 100%)",
              border: "1px solid rgba(148, 163, 184, 0.16)",
              boxShadow: "0 20px 42px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ width: "fit-content", padding: "7px 11px", borderRadius: "999px", background: "rgba(255,255,255,0.9)", border: "1px solid rgba(148, 163, 184, 0.18)", fontSize: "11px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
                From Simple To Detailed
              </div>
              <div style={{ fontSize: isTablet ? "24px" : "28px", fontWeight: 800, color: "#0f172a", lineHeight: "1.15", letterSpacing: "-0.03em" }}>
                Read this mortgage page in layers
              </div>
              <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "56rem" }}>
                You do not need to read the whole mortgage analysis to understand what matters. Start with the plain answer, take the first action, and only open the deeper proof when you want the reasoning behind it.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isTablet ? "1fr" : "repeat(3, minmax(0, 1fr))",
                gap: "14px",
              }}
            >
              {mortgageTransitionGuide.steps.map((step) => (
                <div
                  key={step.label}
                  style={{
                    padding: "20px 20px 22px",
                    borderRadius: "22px",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.94) 100%)",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                    display: "grid",
                    gap: "8px",
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <div style={{ width: "fit-content", padding: "6px 10px", borderRadius: "999px", background: "rgba(14, 165, 233, 0.1)", color: "#0369a1", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", lineHeight: "1.3" }}>{step.title}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>{step.detail}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1fr) minmax(280px, 0.9fr)",
                gap: "16px",
                alignItems: "start",
              }}
            >
              <div
                style={{
                  padding: "20px 20px 22px",
                  borderRadius: "22px",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.94) 100%)",
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  display: "grid",
                  gap: "12px",
                  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.05)",
                }}
              >
                <div style={{ fontSize: "12px", color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                  Translate The Analyst Terms
                </div>
                {mortgageTransitionGuide.keys.map((item) => (
                  <details
                    key={item.term}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                    }}
                  >
                    <summary style={{ cursor: "pointer", fontWeight: 700, color: "#0f172a" }}>{item.term}</summary>
                    <div style={{ marginTop: "10px", color: "#475569", lineHeight: "1.7" }}>{item.meaning}</div>
                  </details>
                ))}
              </div>

              <div
                style={{
                  padding: "20px 20px 22px",
                  borderRadius: "22px",
                  background: "radial-gradient(circle at top right, rgba(56,189,248,0.22) 0%, rgba(56,189,248,0) 36%), linear-gradient(180deg, #0f172a 0%, #111827 100%)",
                  border: "1px solid rgba(15, 23, 42, 0.12)",
                  color: "#ffffff",
                  display: "grid",
                  gap: "12px",
                  boxShadow: "0 18px 36px rgba(15, 23, 42, 0.18)",
                }}
              >
                <div style={{ fontSize: "12px", color: "rgba(191, 219, 254, 0.92)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                  When You Want More Depth
                </div>
                <div style={{ fontSize: "20px", fontWeight: 800, lineHeight: "1.25" }}>
                  Use the deeper breakdown as supporting proof
                </div>
                <div style={{ color: "rgba(226, 232, 240, 0.9)", lineHeight: "1.8" }}>
                  The darker section below is there to explain why the mortgage was scored this way, not to overwhelm the first read.
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => scrollToMortgageSection("continuity-command")}
                    style={{ padding: "11px 16px", borderRadius: "999px", border: "none", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700, fontSize: "13px", boxShadow: "0 10px 20px rgba(255,255,255,0.16)" }}
                  >
                    Start With Mortgage Command
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToMortgageSection("loan-summary")}
                    style={{ padding: "11px 16px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#ffffff", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}
                  >
                    Jump To Loan Summary
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section
            ref={technicalAnalysisRef}
            style={{
              marginTop: "24px",
              display: "grid",
              gap: "10px",
              padding: isTablet ? "20px 18px" : "22px 26px",
              borderRadius: "28px",
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
              Technical breakdown: blockers, document support, property linkage, and mortgage diagnostics
            </div>
            <div style={{ color: "rgba(226, 232, 240, 0.9)", lineHeight: "1.8", maxWidth: "60rem" }}>
              Everything below this point is the proof layer. It explains the live mortgage command, linked property stack context, document support, and the operational details behind the simpler read above.
            </div>
          </section>

          <div
            id="continuity-command"
            ref={(node) => setSectionRef("continuity-command", node)}
            style={{ marginTop: "24px" }}
          >
            <SectionCard
              title="Mortgage Command"
              subtitle="The strongest loan blockers, why they matter, and what to do next on this mortgage."
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <AIInsightPanel
                  title="Debt Command"
                  summary={mortgageCommandCenter.headline}
                  bullets={[
                    `${mortgageCommandCenter.metrics.critical || 0} critical blocker${mortgageCommandCenter.metrics.critical === 1 ? "" : "s"} are active.`,
                    `${mortgageCommandCenter.metrics.warning || 0} warning item${mortgageCommandCenter.metrics.warning === 1 ? "" : "s"} should be reviewed soon.`,
                    `${mortgageCommandCenter.metrics.documents || 0} mortgage document${mortgageCommandCenter.metrics.documents === 1 ? "" : "s"} are attached.`,
                    `${mortgageCommandCenter.metrics.snapshots || 0} snapshot${mortgageCommandCenter.metrics.snapshots === 1 ? "" : "s"} and ${mortgageCommandCenter.metrics.analytics || 0} analytic${mortgageCommandCenter.metrics.analytics === 1 ? "" : "s"} are visible.`,
                  ]}
                />
                {mortgageCommandCenter.blockers.length > 0 ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {mortgageCommandCenter.blockers.map((item) => (
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
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 800, color: "#0f172a" }}>{item.title}</div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <StatusBadge label={item.urgencyMeta.badge} tone={item.urgency === "critical" ? "alert" : "warning"} />
                            <StatusBadge label={item.staleLabel} tone="info" />
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
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No active mortgage blockers"
                    description="This mortgage currently looks relatively steady across evidence, linkage, debt review, and continuity."
                  />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: detailRailLayout, gap: "18px" }}>
            <div id="loan-summary" ref={(node) => setSectionRef("loan-summary", node)}>
            <SectionCard title="Mortgage Loan Summary">
              <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Loan Name:</strong> {mortgageLoan.loan_name || linkedAsset?.asset_name || "Limited visibility"}</div>
                <div><strong>Loan Type:</strong> {mortgageLoanType?.display_name || mortgageLoan.mortgage_loan_type_key}</div>
                <div><strong>Lender / Servicer:</strong> {getMortgageLender(mortgageLoan.lender_key)?.display_name || mortgageLoan.lender_key || linkedAsset?.institution_name || "Limited visibility"}</div>
                <div><strong>Property Address:</strong> {mortgageLoan.property_address || "Limited visibility"}</div>
                <div><strong>Borrower:</strong> {mortgageLoan.borrower_name || "Limited visibility"}</div>
                <div><strong>Origination:</strong> {formatDate(mortgageLoan.origination_date)}</div>
                <div><strong>Maturity:</strong> {formatDate(mortgageLoan.maturity_date)}</div>
                <div><strong>Status:</strong> <StatusBadge label={mortgageLoan.current_status || "unknown"} tone={getStatusTone(mortgageLoan.current_status)} /></div>
              </div>
            </SectionCard>
            </div>

            <SectionCard title="Linked Platform Asset Summary">
              {linkedAsset ? (
                <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                  <div><strong>Asset Name:</strong> {linkedAsset.asset_name}</div>
                  <div><strong>Category:</strong> {linkedAsset.asset_category}</div>
                  <div><strong>Subcategory:</strong> {linkedAsset.asset_subcategory || "Limited visibility"}</div>
                  <div><strong>Institution:</strong> {linkedAsset.institution_name || "Limited visibility"}</div>
                  <div><strong>Status:</strong> {linkedAsset.status || "Limited visibility"}</div>
                  <div style={{ color: "#64748b" }}>
                    This mortgage record remains linked to the broader platform asset layer so shared documents, portals, alerts, and tasks can continue to coexist cleanly.
                  </div>
                </div>
              ) : (
                <EmptyState title="No linked household summary" description="This mortgage loan is not yet connected to a broader household asset summary." />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: propertyRailLayout, gap: "18px" }}>
            <SectionCard
              title="Mortgage Review Signals"
              subtitle="A practical first-pass debt review based on loan timing, document support, payoff readiness, and property linkage."
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
                    border: "1px solid rgba(147, 197, 253, 0.28)",
                    color: "#0f172a",
                    fontSize: "16px",
                    lineHeight: "1.8",
                    fontWeight: 600,
                  }}
                >
                  {mortgageReview.headline}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Review Status</div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{mortgageReview.readinessStatus}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Confidence</div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{Math.round((mortgageReview.confidence || 0) * 100)}%</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Refinance Review</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.refinanceStatus || "limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Payoff Readiness</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.payoffStatus || "limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Years Since Origination</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.yearsSinceOrigination ?? "Limited visibility"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Years To Maturity</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.yearsToMaturity ?? "Limited visibility"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Payment Visibility</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.monthlyPaymentVisible ? "Visible" : "Limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rate Visibility</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.interestRateVisible ? "Visible" : "Limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Escrow Visibility</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.escrowVisible ? "Visible" : "Limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Amortization Support</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{mortgageReview.metrics?.amortizationSupport || "limited"}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Review Notes</div>
                  {mortgageReview.notes?.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                      {mortgageReview.notes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "#475569" }}>No additional mortgage review notes are visible yet.</div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Review Workspace Handoff">
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>
                  The mortgage signal grid above already summarizes the current debt read. Shared follow-up belongs in Review Workspace so document gaps, property linkage issues, and payoff or refinance questions can be tracked without repeating the same snapshot twice on this page.
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
                      {bundle?.mortgageDocuments?.length || 0} document{bundle?.mortgageDocuments?.length === 1 ? "" : "s"}
                    </div>
                    <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#e2e8f0", color: "#475569", fontWeight: 700, fontSize: "12px" }}>
                      {propertyLinks.length} linked propert{propertyLinks.length === 1 ? "y" : "ies"}
                    </div>
                    <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#ecfccb", color: "#3f6212", fontWeight: 700, fontSize: "12px" }}>
                      {bundle?.mortgageSnapshots?.length || 0} parsed snapshot{bundle?.mortgageSnapshots?.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>{mortgageReview.headline}</div>
                  <div style={{ color: "#475569", lineHeight: "1.7" }}>
                    {mortgageReview.metrics?.documentSupport === "strong"
                      ? "The page has enough live mortgage detail to stay focused on the current signal set here. Use Review Workspace when that work needs cross-household tracking."
                      : "This loan still needs stronger document support or linked context. Review Workspace is the cleaner place to manage that follow-up beside the rest of the household queue."}
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onNavigate?.(mortgageReviewWorkspaceRoute)}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Open Review Workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToMortgageSection("documents")}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Jump To Documents
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToMortgageSection("linked-context")}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Jump To Linked Context
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px" }}>
            <MortgageAIChat
              mortgageLoanId={mortgageLoan.id}
              mortgageLoan={mortgageLoan}
              mortgageAnalytics={bundle.mortgageAnalytics?.[0] || {}}
              mortgageReview={mortgageReview}
              mortgageDocuments={bundle.mortgageDocuments || []}
              mortgageSnapshots={bundle.mortgageSnapshots || []}
              mortgageAnalyticsRows={bundle.mortgageAnalytics || []}
              propertyLinks={propertyLinks}
              linkedContext={mortgageLinkedContext}
              sectionLabels={{
                "continuity-command": "Mortgage Command",
                "loan-summary": "Loan Summary",
                "linked-context": "Linked Context",
                documents: "Mortgage Documents",
              }}
              onJumpToSection={scrollToMortgageSection}
            />
          </div>

          <div
            id="property-linking"
            ref={(node) => setSectionRef("property-linking", node)}
            style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "18px" }}
          >
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
                            <div><strong>Link Type:</strong> {link.link_type || "primary_financing"}</div>
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
                              <option value="primary_financing">primary_financing</option>
                              <option value="secondary_financing">secondary_financing</option>
                              <option value="heloc">heloc</option>
                              <option value="historical_reference">historical_reference</option>
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
                <EmptyState title="No linked property yet" description="Link a property record to make the mortgage relationship visible in the property stack." />
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
                      ? "This mortgage is already visible in the property stack."
                      : "This mortgage is not yet linked to a property record.",
                  ]}
                />
                {linkSuccess ? <div style={{ color: "#166534", fontSize: "14px" }}>{linkSuccess}</div> : null}
                {linkError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{linkError}</div> : null}
              </form>
            </SectionCard>
          </div>

          <div
            id="linked-context"
            ref={(node) => setSectionRef("linked-context", node)}
            style={{ marginTop: "24px" }}
          >
            <SectionCard
              title="Linked Context"
              subtitle="Read this mortgage as part of the broader operating graph across property, protection, documents, and access continuity."
            >
              <MortgageLinkedContextCard
                propertyRows={mortgageLinkedContext.propertyRows}
                protectionRows={mortgageLinkedContext.protectionRows}
                propertyLinks={propertyLinks}
                stackCompleteness={linkedStackCompleteness}
                mortgageDocuments={bundle.mortgageDocuments || []}
                assetBundle={assetBundle}
                onNavigate={onNavigate}
                isMobile={isTablet}
              />
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: documentRailLayout, gap: "18px" }}>
            <div id="documents" ref={(node) => setSectionRef("documents", node)}>
            <SectionCard title="Mortgage Documents">
              {bundle.mortgageDocuments.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.mortgageDocuments.map((document) => (
                    <div key={document.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {document.asset_documents?.file_name || document.document_class_key || "Mortgage document"}
                      </div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Document Class:</strong> {getMortgageDocumentClass(document.document_class_key)?.display_name || document.document_class_key || "Limited visibility"}</div>
                        <div><strong>Lender:</strong> {getMortgageLender(document.lender_key)?.display_name || document.lender_key || "Limited visibility"}</div>
                        <div><strong>Document Date:</strong> {formatDate(document.document_date)}</div>
                        <div><strong>Created:</strong> {formatDate(document.created_at)}</div>
                        <div><strong>Household Document Link:</strong> {document.asset_document_id || "Not linked yet"}</div>
                        <div><strong>Asset Document Status:</strong> {document.asset_documents?.processing_status || "Not available"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No mortgage documents yet" description="Mortgage-specific document records will appear here as uploads are classified and linked." />
              )}
            </SectionCard>
            </div>

            <SectionCard title="Mortgage Document Intake">
              <form onSubmit={handleUploadDocuments} style={{ display: "grid", gap: "12px" }}>
                <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); enqueueFiles(event.dataTransfer.files); }} style={{ border: "1px dashed #94a3b8", borderRadius: "16px", padding: "20px", background: "#f8fafc" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop mortgage documents here</div>
                  <p style={{ marginTop: "8px", color: "#64748b", lineHeight: "1.6" }}>
                    Upload monthly statements, escrow notices, payoff letters, closing disclosures, and related mortgage documents into this loan. The original file is saved in the household vault and then linked into the mortgage module.
                  </p>
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(event) => enqueueFiles(event.target.files)} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700 }}>
                    Select Mortgage Documents
                  </button>
                </div>
                <select value={uploadForm.document_class_key} onChange={(event) => setUploadForm((current) => ({ ...current, document_class_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  {MORTGAGE_DOCUMENT_CLASSES.map((documentClass) => (
                    <option key={documentClass.document_class_key} value={documentClass.document_class_key}>
                      {documentClass.display_name}
                    </option>
                  ))}
                </select>
                <select value={uploadForm.lender_key} onChange={(event) => setUploadForm((current) => ({ ...current, lender_key: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
                  <option value="">No lender selected</option>
                  {MORTGAGE_LENDERS.map((lender) => (
                    <option key={lender.lender_key} value={lender.lender_key}>
                      {lender.display_name}
                    </option>
                  ))}
                </select>
                <input type="date" value={uploadForm.document_date} onChange={(event) => setUploadForm((current) => ({ ...current, document_date: event.target.value }))} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }} />
                <textarea value={uploadForm.notes} onChange={(event) => setUploadForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Optional intake notes" style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }} />
                <button type="submit" disabled={uploading || uploadQueue.length === 0 || !linkedAsset?.id} style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                  {uploading ? "Uploading Mortgage Documents..." : "Upload Mortgage Documents"}
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
                          {uploadForm.lender_key ? ` | ${uploadForm.lender_key}` : ""}
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
                  <EmptyState title="No mortgage files queued" description="Add one or more mortgage documents to create linked generic and mortgage-specific document records." />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: dualLayout, gap: "18px" }}>
            <SectionCard title="Mortgage Snapshots">
              {bundle.mortgageSnapshots.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.mortgageSnapshots.map((snapshot) => (
                    <div key={snapshot.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{snapshot.snapshot_type || "mortgage_snapshot"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Snapshot Date:</strong> {formatDate(snapshot.snapshot_date)}</div>
                        <div><strong>Completeness:</strong> {snapshot.completeness_assessment?.status || "Not assessed yet"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No mortgage snapshots yet" description="Mortgage snapshots will land here after later mortgage statement parsing is added." />
              )}
            </SectionCard>

            <SectionCard title="Mortgage Analytics">
              {bundle.mortgageAnalytics.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.mortgageAnalytics.map((analytics) => (
                    <div key={analytics.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{analytics.analytics_type || "mortgage_analytics"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Review Flags:</strong> {analytics.review_flags?.length ? analytics.review_flags.join(", ") : "None yet"}</div>
                        <div><strong>Created:</strong> {formatDate(analytics.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No mortgage analytics yet" description="Mortgage intelligence will appear here after future parsing and review passes are added." />
              )}
            </SectionCard>
          </div>

          {shouldShowDevDiagnostics() ? (
            <SectionCard title="Mortgage Debug">
              <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                mortgage_loan_id={mortgageLoan.id} | asset_id={linkedAsset?.id || "none"} | household_id={mortgageLoan.household_id || "none"} | propertyLinkIds={propertyLinks.map((link) => link.id).join(", ") || "none"} | propertyLinkTypes={propertyLinks.map((link) => link.link_type).join(", ") || "none"} | propertyLinkPrimary={propertyLinks.map((link) => String(Boolean(link.is_primary))).join(", ") || "none"} | linkageStatus={linkageStatus} | mortgageAssetLinks={mortgageAssetLinks.length} | linkedPropertyAssetLinks={linkedPropertyAssetLinks.length} | documents={bundle.mortgageDocuments.length} | snapshots={bundle.mortgageSnapshots.length} | analytics={bundle.mortgageAnalytics.length} | uploadAttempts={uploadQueue.length} | assetDocumentIds={uploadQueue.map((item) => item.assetDocumentId).filter(Boolean).join(", ") || "none"} | mortgageDocumentIds={uploadQueue.map((item) => item.mortgageDocumentId).filter(Boolean).join(", ") || "none"} | storageConfigured={isSupabaseConfigured() ? "yes" : "no"} | error={loadError || uploadError || linkError || "none"}
              </div>
            </SectionCard>
          ) : null}
          </>
        )}
      </MortgageDetailRecoveryBoundary>
    </div>
  );
}
