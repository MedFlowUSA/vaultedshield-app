import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import { FriendlyActionTile } from "../components/shared/FriendlyIntelligenceUI";
import InsightExplanationPanel from "../components/shared/InsightExplanationPanel";
import PageHeader from "../components/layout/PageHeader";
import IntelligenceFasciaCard from "../components/shared/IntelligenceFasciaCard";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import RetirementActionFeedCard from "../components/retirement/RetirementActionFeedCard";
import RetirementAIChatBox from "../components/retirement/RetirementAIChatBox";
import RetirementSignalsSummaryCard from "../components/retirement/RetirementSignalsSummaryCard";
import {
  getRetirementDocumentClass,
  getRetirementType,
  listRetirementProviders,
} from "../lib/domain/retirement";
import { analyzeRetirementReadiness } from "../lib/domain/retirement/retirementIntelligence";
import buildRetirementPageFascia from "../lib/intelligence/fascia/buildRetirementPageFascia";
import { buildRetirementSignals } from "../lib/retirementSignals/buildRetirementSignals";
import { buildRetirementActionFeed } from "../lib/retirementSignals/buildRetirementActionFeed";
import { buildRetirementCommandCenter } from "../lib/domain/platformIntelligence/continuityCommandCenter";
import {
  annotateReviewWorkflowItems,
  buildReviewAssignmentOptions,
  getHouseholdReviewWorkflowState,
  REVIEW_WORKFLOW_STATUSES,
  saveHouseholdReviewWorkflowState,
} from "../lib/domain/platformIntelligence/reviewWorkflowState";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
import { buildRetirementDetailReviewQueueItems } from "../lib/domain/platformIntelligence/reviewQueue";
import { buildReviewWorkspaceRoute, deriveReviewWorkspaceCandidateFromQueueItem } from "../lib/reviewWorkspace/workspaceFilters";
import { isSupabaseConfigured } from "../lib/supabase/client";
import { getAssetDetailBundle } from "../lib/supabase/platformData";
import {
  getRetirementAccountBundle,
  listRetirementDocumentClasses,
  parseRetirementDocumentToSnapshot,
  uploadRetirementDocument,
} from "../lib/supabase/retirementData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { executeSmartAction } from "../lib/navigation/smartActions";

const RETIREMENT_DOCUMENT_CLASSES = listRetirementDocumentClasses();
const RETIREMENT_PROVIDERS = listRetirementProviders();

const DEFAULT_UPLOAD_FORM = {
  document_class_key: "quarterly_statement",
  provider_key: "",
  statement_date: "",
  notes: "",
};

function formatCategoryLabel(majorCategory) {
  const labels = {
    employer_plan: "Employer Plan",
    ira: "IRA",
    pension: "Pension",
    special_case: "Legacy / Special",
  };

  return labels[majorCategory] || "Retirement";
}

function getStatusTone(status) {
  if (status === "active") return "good";
  if (status === "inactive" || status === "terminated" || status === "frozen") return "warning";
  return "info";
}

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

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "Not available";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBoolean(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Unknown";
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "Not available";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return `${number.toFixed(number % 1 === 0 ? 0 : 2)}%`;
}

function getProviderLabel(providerKey) {
  if (!providerKey) return "Limited visibility";
  const provider = RETIREMENT_PROVIDERS.find((item) => item.institution_key === providerKey);
  return provider?.display_name || providerKey;
}

function getDocumentClassLabel(documentClassKey) {
  if (!documentClassKey) return "Limited visibility";
  return getRetirementDocumentClass(documentClassKey)?.display_name || documentClassKey;
}

function formatFlagLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function RetirementAccountDetailPage({ retirementAccountId, onNavigate }) {
  const { householdState, debug: shellDebug, intelligenceBundle } = usePlatformShellData();
  const fileInputRef = useRef(null);
  const sectionRefs = useRef({});
  const technicalAnalysisRef = useRef(null);
  const [bundle, setBundle] = useState(null);
  const [assetBundle, setAssetBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadForm, setUploadForm] = useState(DEFAULT_UPLOAD_FORM);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [parsingDocumentId, setParsingDocumentId] = useState("");
  const [parseError, setParseError] = useState("");
  const [parseDebug, setParseDebug] = useState(null);
  const [showFasciaExplanation, setShowFasciaExplanation] = useState(false);
  const [reviewWorkflowState, setReviewWorkflowState] = useState({});
  const platformScope = useMemo(
    () => ({
      householdId: householdState.context.householdId || null,
      authUserId: shellDebug.authUserId || null,
      ownershipMode: householdState.context.ownershipMode || "unknown",
      guestFallbackActive: householdState.context.guestFallbackActive,
      scopeSource: "retirement_detail_page",
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

  const loadRetirementBundle = useCallback(async (targetRetirementAccountId, options = {}) => {
    const result = await getRetirementAccountBundle(targetRetirementAccountId);

    if (result.error || !result.data?.retirementAccount) {
      if (!options.silent) {
        setBundle(null);
        setAssetBundle(null);
        setLoadError(result.error?.message || "Retirement account bundle could not be loaded.");
      }

      return { data: null, error: result.error || new Error("Retirement account bundle could not be loaded.") };
    }

    setBundle(result.data);
    if (!options.silent) {
      setLoadError("");
    }

    const linkedAssetId = result.data.retirementAccount.assets?.id;
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
    if (!retirementAccountId) return;

    let active = true;

    async function loadBundle() {
      setLoading(true);
      await loadRetirementBundle(retirementAccountId);
      if (!active) return;

      setLoading(false);
    }

    loadBundle();
    return () => {
      active = false;
    };
  }, [loadRetirementBundle, retirementAccountId, scopeKey]);

  const retirementAccount = bundle?.retirementAccount || null;
  const retirementType = retirementAccount ? getRetirementType(retirementAccount.retirement_type_key) : null;
  const linkedAsset = retirementAccount?.assets || null;
  const latestAnalytics = bundle?.retirementAnalytics?.[0] || null;
  const latestSnapshot = bundle?.retirementSnapshots?.[0] || null;
  const retirementRead = useMemo(
    () =>
      analyzeRetirementReadiness({
        snapshot: latestSnapshot,
        analytics: latestAnalytics,
        positions: bundle?.retirementPositions || [],
      }),
    [bundle?.retirementPositions, latestAnalytics, latestSnapshot]
  );

  const summaryItems = useMemo(() => {
    if (!retirementAccount) return [];

    return [
      {
        label: "Plan Status",
        value: retirementAccount.plan_status || "unknown",
        helper: formatCategoryLabel(retirementType?.major_category),
      },
      {
        label: "Documents",
        value: bundle?.retirementDocuments?.length || 0,
        helper: "Retirement-specific document records",
      },
      {
        label: "Snapshots",
        value: bundle?.retirementSnapshots?.length || 0,
        helper: "Normalized retirement records",
      },
      {
        label: "Analytics",
        value: bundle?.retirementAnalytics?.length || 0,
        helper: "Future intelligence outputs",
      },
      {
        label: "Positions",
        value: bundle?.retirementPositions?.length || 0,
        helper: "Funds, subaccounts, and allocation detail",
      },
      {
        label: "Read Status",
        value: retirementRead.readinessStatus,
        helper: `${Math.round((retirementRead.confidence || 0) * 100)}% read confidence`,
      },
    ];
  }, [bundle, retirementAccount, retirementRead.confidence, retirementRead.readinessStatus, retirementType]);

  const derivedFlags = retirementType
    ? [
        { label: formatCategoryLabel(retirementType.major_category), tone: "info" },
        { label: retirementType.account_based ? "Account-Based" : "Not Account-Based", tone: "neutral" },
        { label: retirementType.benefit_based ? "Benefit-Based" : "Not Benefit-Based", tone: "neutral" },
        { label: retirementType.rollover_relevant ? "Rollover-Relevant" : "No Rollover Flag", tone: "neutral" },
        { label: retirementType.beneficiary_relevant ? "Beneficiary-Relevant" : "No Beneficiary Flag", tone: "neutral" },
        { label: retirementType.loan_possible ? "Loan Possible" : "Loan Not Expected", tone: "neutral" },
      ]
    : [];

  const positionSummary = useMemo(() => {
    const positions = bundle?.retirementPositions || [];
    if (!positions.length) {
      return {
        count: 0,
        topHolding: null,
        concentrationNote: "",
      };
    }

    const positionsByValue = positions
      .filter((position) => position.current_value !== null && position.current_value !== undefined)
      .sort((a, b) => (b.current_value || 0) - (a.current_value || 0));
    const topHolding = positionsByValue[0] || null;
    const concentratedHolding = positions.find(
      (position) => Number(position.allocation_percent || 0) >= 60
    );

    return {
      count: positions.length,
      topHolding,
      concentrationNote: concentratedHolding
        ? `${concentratedHolding.position_name || "A single holding"} appears to dominate parsed allocation data.`
        : "",
    };
  }, [bundle]);
  const retirementSignals = useMemo(
    () =>
      buildRetirementSignals({
        retirementRead,
        latestSnapshot,
        latestAnalytics,
        positions: bundle?.retirementPositions || [],
      }),
    [bundle?.retirementPositions, latestAnalytics, latestSnapshot, retirementRead]
  );
  const retirementActionFeed = useMemo(
    () =>
      buildRetirementActionFeed({
        retirementSignals,
        retirementRead,
        positions: bundle?.retirementPositions || [],
      }),
    [bundle?.retirementPositions, retirementRead, retirementSignals]
  );
  const retirementPageFascia = useMemo(
    () =>
      buildRetirementPageFascia({
        retirementAccount,
        retirementRead,
        retirementSignals,
        retirementActionFeed,
        latestSnapshot,
        latestAnalytics,
        positions: bundle?.retirementPositions || [],
      }),
    [
      bundle?.retirementPositions,
      latestAnalytics,
      latestSnapshot,
      retirementAccount,
      retirementActionFeed,
      retirementRead,
      retirementSignals,
    ]
  );
  const retirementPageFasciaDisplay = useMemo(() => {
    if (!retirementPageFascia) return null;

    return {
      ...retirementPageFascia,
      tertiaryAction: retirementPageFascia.tertiaryAction
        ? {
            ...retirementPageFascia.tertiaryAction,
            label: showFasciaExplanation ? "Hide explanation" : "Why am I seeing this?",
          }
        : null,
    };
  }, [retirementPageFascia, showFasciaExplanation]);

  const retirementPlainEnglishGuide = useMemo(() => {
    const documentCount = bundle?.retirementDocuments?.length || 0;
    const positionCount = bundle?.retirementPositions?.length || 0;
    const everydayVerdict =
      retirementPageFascia?.status === "Strong"
        ? "This retirement account looks well supported"
        : retirementPageFascia?.status === "Stable"
          ? "This retirement account looks mostly okay"
          : retirementPageFascia?.status === "Partial"
            ? "There is enough to start reading the account, but not enough to fully trust it"
            : retirementPageFascia?.status === "At Risk"
              ? "This retirement account may need attention soon"
              : "The retirement picture is still developing";

    const confidenceDriver =
      documentCount === 0
        ? "There are no retirement statements or plan documents attached yet, so this read is still thin."
        : !latestSnapshot
          ? "Documents are visible, but there is no normalized snapshot yet, which limits how much structure the page can trust."
          : positionCount === 0
            ? "The account has some document support, but there are no parsed positions yet, so allocation detail is still limited."
            : "The account has document, snapshot, and position support, which makes the current retirement read more trustworthy.";

    return {
      eyebrow: "Plain-English First",
      title: "Start here before the technical retirement analysis",
      summary: retirementPageFascia?.meaning || "This page simplifies what the retirement account is saying before you move into the deeper analytics.",
      transition:
        "The short version tells you whether the account looks stable, thin, concentrated, or risky. The technical sections below explain signals, positions, documents, and the command-center blockers behind that call.",
      cards: [
        {
          label: "In plain English",
          value: everydayVerdict,
          detail: retirementPageFascia?.meaning || confidenceDriver,
        },
        {
          label: "What to do first",
          value: retirementPageFascia?.primaryAction?.label || "Review the top retirement issue",
          detail:
            retirementPageFascia?.explanation?.recommendedAction?.detail ||
            "Take the first recommended retirement step before opening the deeper evidence.",
        },
        {
          label: "Why confidence is limited or strong",
          value: `${documentCount} retirement document${documentCount === 1 ? "" : "s"} visible`,
          detail: confidenceDriver,
        },
      ],
      quickFacts: [
        latestSnapshot
          ? `A normalized account snapshot dated ${formatDate(latestSnapshot.statement_date || latestSnapshot.snapshot_date)} is visible.`
          : "No normalized retirement snapshot is visible yet.",
        positionCount > 0
          ? `${positionCount} parsed position${positionCount === 1 ? "" : "s"} are visible in this account.`
          : "No parsed positions are visible yet for this account.",
        retirementPageFascia?.explanation?.recommendedAction?.detail ||
          "No single retirement issue is standing out above the rest right now.",
      ],
    };
  }, [
    bundle?.retirementDocuments?.length,
    bundle?.retirementPositions?.length,
    latestSnapshot,
    retirementPageFascia,
  ]);
  const retirementTransitionGuide = useMemo(() => {
    const positionCount = bundle?.retirementPositions?.length || 0;
    const confidencePercent = Math.round((retirementRead.confidence || 0) * 100);

    return {
      steps: [
        {
          label: "Step 1",
          title: "Read the account story first",
          detail:
            "Start with the plain-English summary so you know whether this account looks stable, thin, concentrated, or risky before reading the technical layer.",
        },
        {
          label: "Step 2",
          title: "Take the first retirement move",
          detail:
            retirementPageFascia?.primaryAction?.label
            || "Focus on the first improvement that would strengthen this retirement read.",
        },
        {
          label: "Step 3",
          title: "Open the deeper proof when needed",
          detail:
            "The sections below explain signals, parsed positions, documents, and review logic when you want to see the evidence behind the summary.",
        },
      ],
      keys: [
        {
          term: "Confidence",
          meaning: `Confidence means how much support the page has for its current read of the account. Right now it sits around ${confidencePercent}%.`,
        },
        {
          term: "Snapshot",
          meaning:
            "A snapshot is the normalized version of a statement or account record, so the page can read balances and account facts in a structured way.",
        },
        {
          term: "Parsed Positions",
          meaning:
            positionCount > 0
              ? `${positionCount} parsed position${positionCount === 1 ? "" : "s"} are visible, which means the system could identify some of the holdings inside the account.`
              : "Parsed positions are the holdings inside the account. None are visible yet, so allocation detail is still limited.",
        },
        {
          term: "Signal Level",
          meaning:
            "Signal level is a shorthand for how strong the account evidence looks after the page weighs documents, snapshots, allocations, and review flags together.",
        },
      ],
    };
  }, [
    bundle?.retirementPositions?.length,
    retirementPageFascia?.primaryAction?.label,
    retirementRead.confidence,
  ]);
  const retirementCommandCenter = useMemo(
    () =>
      buildRetirementCommandCenter({
        retirementAccount,
        retirementRead,
        retirementDocuments: bundle?.retirementDocuments || [],
        retirementSnapshots: bundle?.retirementSnapshots || [],
        retirementAnalytics: bundle?.retirementAnalytics || [],
        retirementPositions: bundle?.retirementPositions || [],
        assetBundle,
      }),
    [
      assetBundle,
      bundle?.retirementAnalytics,
      bundle?.retirementDocuments,
      bundle?.retirementPositions,
      bundle?.retirementSnapshots,
      retirementAccount,
      retirementRead,
    ]
  );
  const retirementReviewQueueItems = useMemo(
    () =>
      annotateReviewWorkflowItems(
        buildRetirementDetailReviewQueueItems({
          retirementAccount,
          retirementRead,
          retirementBundle: bundle,
          assetBundle,
          retirementCommandCenter,
        }),
        reviewWorkflowState || {}
      ),
    [assetBundle, bundle, retirementAccount, retirementCommandCenter, retirementRead, reviewWorkflowState]
  );
  const retirementReviewItemsById = useMemo(
    () => Object.fromEntries(retirementReviewQueueItems.map((item) => [item.id, item])),
    [retirementReviewQueueItems]
  );
  const topRetirementReviewItem = retirementReviewQueueItems[0] || null;
  const retirementReviewWorkspaceRoute = useMemo(() => {
    const filters =
      deriveReviewWorkspaceCandidateFromQueueItem(
        topRetirementReviewItem,
        reviewScope.householdId || retirementAccount?.household_id || null
      ) || {
        module: "retirement",
        issueType: "sparse_documentation",
        severity: bundle?.retirementDocuments?.length > 0 ? "medium" : "high",
        householdId: reviewScope.householdId || retirementAccount?.household_id || null,
        assetId: linkedAsset?.id || null,
        recordId: retirementAccount?.id || null,
      };

    return buildReviewWorkspaceRoute({
      filters,
      openedFromAssistant: true,
    });
  }, [
    bundle?.retirementDocuments?.length,
    linkedAsset?.id,
    retirementAccount?.household_id,
    retirementAccount?.id,
    reviewScope.householdId,
    topRetirementReviewItem,
  ]);
  const retirementActionTiles = useMemo(
    () => [
      {
        key: "retirement-verdict",
        kicker: "Simple Read",
        title: retirementPlainEnglishGuide.cards[0]?.value || "Account read still forming",
        detail: retirementPlainEnglishGuide.cards[0]?.detail || retirementPlainEnglishGuide.summary,
        metric: `${bundle?.retirementDocuments?.length || 0} document${(bundle?.retirementDocuments?.length || 0) === 1 ? "" : "s"}`,
        tone:
          retirementPageFascia?.status === "Strong"
            ? "good"
            : retirementPageFascia?.status === "Stable"
              ? "warning"
              : retirementPageFascia?.status === "At Risk"
                ? "alert"
                : "info",
        statusLabel: "Account Status",
        actionLabel: "See Why",
        actionKey: "details",
      },
      {
        key: "retirement-next-step",
        kicker: "First Move",
        title: retirementPlainEnglishGuide.cards[1]?.value || "Review the top retirement issue",
        detail: retirementPlainEnglishGuide.cards[1]?.detail || "Take the first retirement step before opening the full evidence stack.",
        metric: topRetirementReviewItem?.title || "Review path ready",
        tone: "warning",
        statusLabel: "Guided Action",
        actionLabel: retirementPageFascia?.primaryAction?.label || "Open Review Workspace",
        actionKey: "next-step",
      },
      {
        key: "retirement-support",
        kicker: "Support",
        title: retirementPlainEnglishGuide.cards[2]?.value || "Confidence still forming",
        detail: retirementPlainEnglishGuide.cards[2]?.detail || "Documents, snapshots, and positions determine how much this page can trust the read.",
        metric: latestSnapshot ? formatDate(latestSnapshot.statement_date || latestSnapshot.snapshot_date) : "No snapshot yet",
        tone: latestSnapshot && (bundle?.retirementPositions?.length || 0) > 0 ? "good" : "info",
        statusLabel: "Evidence Depth",
        actionLabel: "Open Details",
        actionKey: "details",
      },
    ],
    [
      bundle?.retirementDocuments?.length,
      bundle?.retirementPositions?.length,
      latestSnapshot,
      retirementPageFascia,
      retirementPlainEnglishGuide.cards,
      retirementPlainEnglishGuide.summary,
      topRetirementReviewItem?.title,
    ]
  );
  const assigneeChoices = useMemo(() => buildReviewAssignmentOptions(intelligenceBundle || {}), [intelligenceBundle]);

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
      retirementDocumentId: null,
      storagePath: "",
      duplicate: false,
      errorSummary: "",
    }));

    setUploadQueue((current) => [...entries, ...current]);
  }

  async function handleUploadDocuments(event) {
    event.preventDefault();
    if (!retirementAccount || !linkedAsset?.id || uploadQueue.length === 0) return;

    setUploading(true);
    setUploadError("");
    setParseError("");

    for (const item of uploadQueue) {
      if (item.status !== "queued" && item.status !== "failed") {
        continue;
      }

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", errorSummary: "" } : entry
        )
      );

      const result = await uploadRetirementDocument({
        household_id: retirementAccount.household_id,
        asset_id: linkedAsset.id,
        retirement_account_id: retirementAccount.id,
        file: item.file,
        document_class_key: uploadForm.document_class_key,
        provider_key: uploadForm.provider_key || retirementAccount.provider_key || null,
        statement_date: uploadForm.statement_date || null,
        notes: uploadForm.notes || null,
        metadata: {
          retirement_detail_upload: true,
        },
      });

      const nextStatus = result.error ? "failed" : "saved";

      setUploadQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: nextStatus,
                assetDocumentId: result.data?.assetDocument?.id || null,
                retirementDocumentId: result.data?.retirementDocument?.id || null,
                storagePath: result.upload?.storagePath || "",
                duplicate: Boolean(result.duplicate),
                errorSummary: result.error?.message || result.upload?.errorSummary || "",
              }
            : entry
        )
      );

      if (result.error) {
        setUploadError(result.error.message || "Retirement upload failed.");
        continue;
      }

      await loadRetirementBundle(retirementAccount.id, { silent: true });
    }

    setUploading(false);
  }

  async function handleParseDocument(document) {
    if (!retirementAccount || !document?.id) return;

    setParsingDocumentId(document.id);
    setParseError("");

    const result = await parseRetirementDocumentToSnapshot({
      retirementAccount,
      retirementDocument: document,
    });

    setParseDebug({
      documentId: document.id,
      documentClassKey: document.document_class_key || null,
      providerKey: document.provider_key || retirementAccount.provider_key || null,
      snapshotId: result.data?.snapshot?.id || null,
      classifier: result.data?.parserResult?.classifier || null,
      extractedFields: result.data?.parserResult?.extractedFields || null,
      parsedPositionsCount: result.data?.parserResult?.positions?.length || 0,
      rawPositionRowsCount:
        result.data?.parserResult?.extractionMeta?.raw_position_rows?.length || 0,
      skippedPositionRowsCount:
        result.data?.parserResult?.positionSummary?.skipped_position_row_count || 0,
      parsedPositions: result.data?.parserResult?.positions || [],
      intelligence: result.data?.intelligence || result.data?.analytics?.normalized_intelligence || null,
      confidenceMap: result.data?.parserResult?.extractionMeta?.confidence_map || null,
      textSource: result.data?.textSource || null,
      errorSummary: result.error?.message || "",
    });

    if (result.error) {
      setParseError(result.error.message || "Retirement parse failed.");
      setParsingDocumentId("");
      return;
    }

    await loadRetirementBundle(retirementAccount.id, { silent: true });
    setParsingDocumentId("");
  }

  function scrollToSection(section) {
    const target = sectionRefs.current[section];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleRetirementAction(action) {
    if (!action?.target) return;

    executeSmartAction(action.target, {
      navigate: onNavigate,
      scrollToSection,
    });
  }

  function handleRetirementFasciaAction(action) {
    if (!action) return;
    if (action.kind === "toggle_explanation") {
      setShowFasciaExplanation((current) => !current);
      return;
    }

    if (!action.target) return;
    handleRetirementAction({ target: action.target });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Retirement Detail"
        title={retirementAccount?.plan_name || linkedAsset?.asset_name || "Retirement Account Detail"}
        description="Get a readable account summary first, then open positions, documents, and supporting detail when you want the fuller picture."
        actions={
          <button
            onClick={() => onNavigate("/retirement")}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "10px",
              padding: "10px 14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to Retirement Hub
          </button>
        }
      />

      {loading ? (
        <SectionCard>
          <div style={{ color: "#64748b" }}>Loading retirement account bundle...</div>
        </SectionCard>
      ) : !retirementAccount ? (
        <EmptyState
          title="Retirement account not found"
          description={loadError || "This retirement detail page could not load a matching account record."}
        />
      ) : (
        <>
          <SummaryPanel items={summaryItems} />

          <div style={{ marginTop: "18px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {derivedFlags.map((flag) => (
              <StatusBadge key={flag.label} label={flag.label} tone={flag.tone} />
            ))}
          </div>

          <div style={{ marginTop: "24px" }}>
            <IntelligenceFasciaCard fascia={retirementPageFasciaDisplay} onAction={handleRetirementFasciaAction} />
            <InsightExplanationPanel
              isOpen={showFasciaExplanation}
              explanation={retirementPageFascia?.explanation}
              onToggle={() => setShowFasciaExplanation(false)}
              onAction={handleRetirementFasciaAction}
            />
          </div>

          <section
            style={{
              marginTop: "24px",
              display: "grid",
              gap: "20px",
              padding: "30px 32px",
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
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                gap: "18px",
                alignItems: "start",
              }}
            >
              <div style={{ display: "grid", gap: "12px", minWidth: 0, padding: "4px 4px 0" }}>
                <div style={{ width: "fit-content", padding: "7px 11px", borderRadius: "999px", background: "rgba(255,255,255,0.82)", border: "1px solid rgba(251, 146, 60, 0.18)", boxShadow: "0 8px 20px rgba(251, 146, 60, 0.08)", fontSize: "11px", color: "#c2410c", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
                  {retirementPlainEnglishGuide.eyebrow}
                </div>
                <div style={{ fontSize: "34px", fontWeight: 800, color: "#0f172a", lineHeight: "1.08", letterSpacing: "-0.04em" }}>
                  {retirementPlainEnglishGuide.title}
                </div>
                <div style={{ fontSize: "20px", color: "#0f172a", fontWeight: 700, lineHeight: "1.45", maxWidth: "42rem" }}>
                  {retirementPlainEnglishGuide.summary}
                </div>
                <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "46rem" }}>{retirementPlainEnglishGuide.transition}</div>
              </div>

              <div
                style={{
                  padding: "20px 20px 22px",
                  borderRadius: "24px",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.94) 100%)",
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  display: "grid",
                  gap: "14px",
                  boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "999px", background: "linear-gradient(135deg, #f97316 0%, #fb7185 100%)", boxShadow: "0 0 0 5px rgba(249,115,22,0.12)" }} />
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                    Quick Read
                  </div>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "10px", color: "#334155" }}>
                  {retirementPlainEnglishGuide.quickFacts.map((item) => (
                    <li key={item} style={{ display: "grid", gridTemplateColumns: "16px minmax(0, 1fr)", gap: "10px", alignItems: "start", padding: "10px 12px", borderRadius: "14px", background: "rgba(255,255,255,0.78)", border: "1px solid rgba(226,232,240,0.9)", lineHeight: "1.65" }}>
                      <span style={{ width: "8px", height: "8px", marginTop: "8px", borderRadius: "999px", background: "#0f172a" }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {retirementPageFascia?.primaryAction ? (
                    <button
                      type="button"
                      onClick={() => handleRetirementFasciaAction(retirementPageFascia.primaryAction)}
                      style={{ padding: "11px 16px", borderRadius: "999px", border: "none", background: "#0f172a", color: "#ffffff", cursor: "pointer", fontWeight: 700, fontSize: "13px", boxShadow: "0 12px 24px rgba(15, 23, 42, 0.18)" }}
                    >
                      {retirementPageFascia.primaryAction.label}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    style={{ padding: "11px 16px", borderRadius: "999px", border: "1px solid rgba(15, 23, 42, 0.12)", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700, fontSize: "13px", boxShadow: "0 10px 22px rgba(148, 163, 184, 0.12)" }}
                  >
                    See Supporting Details
                  </button>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
                gap: "14px",
              }}
            >
              {retirementActionTiles.map((tile) => (
                <FriendlyActionTile
                  key={tile.key}
                  kicker={tile.kicker}
                  title={tile.title}
                  detail={tile.detail}
                  metric={tile.metric}
                  tone={tile.tone}
                  statusLabel={tile.statusLabel}
                  actionLabel={tile.actionLabel}
                  onAction={() => {
                    if (tile.actionKey === "next-step") {
                      if (retirementPageFascia?.primaryAction) {
                        handleRetirementFasciaAction(retirementPageFascia.primaryAction);
                        return;
                      }
                      onNavigate?.(retirementReviewWorkspaceRoute);
                      return;
                    }
                    technicalAnalysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                />
              ))}
            </div>
          </section>

          <section
            style={{
              marginTop: "20px",
              display: "grid",
              gap: "18px",
              padding: "24px 26px",
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
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a", lineHeight: "1.15", letterSpacing: "-0.03em" }}>
                Read this retirement page in layers
              </div>
              <div style={{ color: "#475569", lineHeight: "1.8", maxWidth: "56rem" }}>
                You do not need the full retirement diagnostics to understand the account. Read the summary, take the first move, and only drop into the deeper proof when you want the details behind the call.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                gap: "14px",
              }}
            >
              {retirementTransitionGuide.steps.map((step) => (
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
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
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
                  Helpful Definitions
                </div>
                {retirementTransitionGuide.keys.map((item) => (
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
                  When You Want More Detail
                </div>
                <div style={{ fontSize: "20px", fontWeight: 800, lineHeight: "1.25" }}>
                  Use the next layer as supporting detail
                </div>
                <div style={{ color: "rgba(226, 232, 240, 0.9)", lineHeight: "1.8" }}>
                  The darker section below is where the account shows its analyst evidence: signals, parsed positions, documents, and review context.
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => scrollToSection("signals")}
                    style={{ padding: "11px 16px", borderRadius: "999px", border: "none", background: "#ffffff", color: "#0f172a", cursor: "pointer", fontWeight: 700, fontSize: "13px", boxShadow: "0 10px 20px rgba(255,255,255,0.16)" }}
                  >
                    Start With Signals
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection("positions")}
                    style={{ padding: "11px 16px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#ffffff", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}
                  >
                    Jump To Positions
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
              padding: "22px 26px",
              borderRadius: "28px",
              background: "radial-gradient(circle at top right, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0) 34%), linear-gradient(180deg, #0f172a 0%, #111827 100%)",
              color: "#ffffff",
              border: "1px solid rgba(15, 23, 42, 0.12)",
              boxShadow: "0 20px 40px rgba(15, 23, 42, 0.16)",
            }}
          >
                <div style={{ fontSize: "12px", color: "rgba(191, 219, 254, 0.92)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
              Supporting Details Start Here
            </div>
            <div style={{ fontSize: "26px", fontWeight: 800, lineHeight: "1.2", letterSpacing: "-0.03em" }}>
              Supporting detail: signals, positions, account records, and retirement review context
            </div>
            <div style={{ color: "rgba(226, 232, 240, 0.9)", lineHeight: "1.8", maxWidth: "60rem" }}>
              Everything below this point is the proof layer. It explains the retirement signals, action feed, parsed positions, document support, and the command-center logic behind the simpler read above.
            </div>
          </section>

          <div style={{ marginTop: "24px" }}>
            <RetirementSignalsSummaryCard retirementSignals={retirementSignals} />
          </div>

          <div style={{ marginTop: "24px" }}>
            <RetirementActionFeedCard actions={retirementActionFeed} onAction={handleRetirementAction} />
          </div>

          <div style={{ marginTop: "24px" }}>
            <RetirementAIChatBox
              retirementSignals={retirementSignals}
              retirementRead={retirementRead}
              retirementActionFeed={retirementActionFeed}
              positionSummary={positionSummary}
              latestSnapshot={latestSnapshot}
              latestAnalytics={latestAnalytics}
            />
          </div>

          <div style={{ marginTop: "24px" }} ref={(node) => { sectionRefs.current.signals = node; }}>
            <SectionCard
              title="Retirement Command"
              subtitle="The strongest blockers on this account, what they put at risk, and the best next move."
            >
              <div style={{ display: "grid", gap: "16px" }}>
                <AIInsightPanel
                  title="Account Command"
                  summary={retirementCommandCenter.headline}
                  bullets={[
                    `${retirementCommandCenter.metrics.critical || 0} critical blocker${retirementCommandCenter.metrics.critical === 1 ? "" : "s"} are active.`,
                    `${retirementCommandCenter.metrics.warning || 0} warning item${retirementCommandCenter.metrics.warning === 1 ? "" : "s"} should be reviewed soon.`,
                    `${retirementCommandCenter.metrics.documents || 0} retirement document${retirementCommandCenter.metrics.documents === 1 ? "" : "s"} are attached.`,
                    `${retirementCommandCenter.metrics.snapshots || 0} snapshot${retirementCommandCenter.metrics.snapshots === 1 ? "" : "s"} and ${retirementCommandCenter.metrics.positions || 0} parsed position${retirementCommandCenter.metrics.positions === 1 ? "" : "s"} are visible.`,
                  ]}
                />
                {retirementCommandCenter.blockers.length > 0 ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    {retirementCommandCenter.blockers.map((item) => (
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
                            retirementReviewItemsById[`retirement:${retirementAccount?.id}:${item.id}`] || null;
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
                                style={{
                                  padding: "9px 12px",
                                  borderRadius: "10px",
                                  border: "1px solid #cbd5e1",
                                  background: "#ffffff",
                                  cursor: "pointer",
                                  fontWeight: 700,
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
                                padding: "9px 12px",
                                borderRadius: "10px",
                                border: "1px solid #cbd5e1",
                                background: "#ffffff",
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              Pending Docs
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewWorkflowUpdate(workflowItem.id, REVIEW_WORKFLOW_STATUSES.follow_up.key)}
                              style={{
                                padding: "9px 12px",
                                borderRadius: "10px",
                                border: "1px solid #cbd5e1",
                                background: "#ffffff",
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              Follow Up
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewWorkflowUpdate(workflowItem.id, REVIEW_WORKFLOW_STATUSES.reviewed.key)}
                              style={{
                                padding: "9px 12px",
                                borderRadius: "10px",
                                border: "none",
                                background: "#0f172a",
                                color: "#ffffff",
                                cursor: "pointer",
                                fontWeight: 700,
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
                    title="No active retirement blockers"
                    description="This retirement account currently looks relatively steady across statements, read quality, holdings, and continuity."
                  />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "18px" }}>
            <SectionCard title="Retirement Account Summary">
              <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
                <div><strong>Plan / Account:</strong> {retirementAccount.plan_name || linkedAsset?.asset_name || "Limited visibility"}</div>
                <div><strong>Retirement Type:</strong> {retirementType?.display_name || retirementAccount.retirement_type_key}</div>
                <div><strong>Institution / Provider:</strong> {retirementAccount.institution_name || linkedAsset?.institution_name || "Limited visibility"}</div>
                <div><strong>Account Owner:</strong> {retirementAccount.account_owner || "Limited visibility"}</div>
                <div><strong>Participant:</strong> {retirementAccount.participant_name || "Limited visibility"}</div>
                <div><strong>Employer:</strong> {retirementAccount.employer_name || "Limited visibility"}</div>
                <div>
                  <strong>Status:</strong>{" "}
                  <StatusBadge label={retirementAccount.plan_status || "unknown"} tone={getStatusTone(retirementAccount.plan_status)} />
                </div>
                <div><strong>Account Number:</strong> {retirementAccount.account_number_masked || "Not recorded"}</div>
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
                    This retirement record remains linked to the broader platform asset layer so shared documents, portals, alerts, and tasks can continue to coexist cleanly.
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No linked asset summary"
                  description="This retirement account is not yet connected to a broader household asset summary."
                />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "18px" }}>
            <SectionCard
              title="Retirement Read Signals"
              subtitle="A practical first-pass read of retirement statement quality, balance visibility, contribution support, and planning readiness."
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
                  {retirementRead.headline}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Read Status</div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{retirementRead.readinessStatus}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Read Confidence</div>
                    <div style={{ marginTop: "8px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{Math.round((retirementRead.confidence || 0) * 100)}%</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Extraction Quality</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{retirementRead.extractionQuality}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Current Balance</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{retirementRead.metrics?.currentBalanceVisible ? "Visible" : "Limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Contributions</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{retirementRead.metrics?.contributionsVisible ? "Visible" : "Limited"}</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Parsed Positions</div>
                    <div style={{ marginTop: "8px", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{retirementRead.metrics?.positionsCount ?? 0}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Retirement Read Notes</div>
                  {retirementRead.notes?.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
                      {retirementRead.notes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: "#475569" }}>No additional retirement read notes are visible yet.</div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Review Workspace Handoff">
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>
                  The retirement read above already explains the current account signal. Shared follow-up belongs in Review Workspace once this turns into trackable household work instead of another restatement of the same read.
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
                      {bundle.retirementDocuments.length} document{bundle.retirementDocuments.length === 1 ? "" : "s"}
                    </div>
                    <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#e2e8f0", color: "#475569", fontWeight: 700, fontSize: "12px" }}>
                      {retirementRead.extractionQuality} extraction quality
                    </div>
                    <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#ecfccb", color: "#3f6212", fontWeight: 700, fontSize: "12px" }}>
                      {retirementRead.metrics?.positionsCount ?? 0} parsed position{retirementRead.metrics?.positionsCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>
                    {topRetirementReviewItem?.summary || retirementRead.headline}
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onNavigate?.(retirementReviewWorkspaceRoute)}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Open Review Workspace
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToSection("documents")}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
                    >
                      Jump To Documents
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToSection("positions")}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
                    >
                      Jump To Positions
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "18px" }} ref={(node) => { sectionRefs.current.documents = node; }}>
            <SectionCard title="Retirement Documents">
              {bundle.retirementDocuments.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.retirementDocuments.map((document) => (
                    <div key={document.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          {document.asset_documents?.file_name || document.document_class_key || "Retirement document"}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleParseDocument(document)}
                          disabled={parsingDocumentId === document.id}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "10px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          {parsingDocumentId === document.id ? "Parsing..." : "Parse Document"}
                        </button>
                      </div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Document Class:</strong> {getDocumentClassLabel(document.document_class_key)}</div>
                        <div><strong>Provider:</strong> {getProviderLabel(document.provider_key)}</div>
                        <div><strong>Statement Date:</strong> {formatDate(document.statement_date)}</div>
                        <div><strong>Created:</strong> {formatDate(document.created_at)}</div>
                        <div><strong>Household Document Link:</strong> {document.asset_document_id || "Not linked yet"}</div>
                        <div><strong>Asset Document Status:</strong> {document.asset_documents?.processing_status || "Not available"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No retirement documents yet"
                  description="Retirement-specific document records will appear here as uploads are classified and linked."
                />
              )}
            </SectionCard>

            <SectionCard title="Retirement Document Intake">
              <form onSubmit={handleUploadDocuments} style={{ display: "grid", gap: "12px" }}>
                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    enqueueFiles(event.dataTransfer.files);
                  }}
                  style={{
                    border: "1px dashed #94a3b8",
                    borderRadius: "16px",
                    padding: "20px",
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop retirement documents here</div>
                  <p style={{ marginTop: "8px", color: "#64748b", lineHeight: "1.6" }}>
                    Upload retirement statements, notices, beneficiary forms, and plan documents into this retirement account. The original file is saved in the household vault and then linked into the retirement module.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={(event) => enqueueFiles(event.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Select Retirement Documents
                  </button>
                </div>

                <select
                  value={uploadForm.document_class_key}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, document_class_key: event.target.value }))
                  }
                  style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
                >
                  {RETIREMENT_DOCUMENT_CLASSES.map((documentClass) => (
                    <option key={documentClass.document_class_key} value={documentClass.document_class_key}>
                      {documentClass.display_name}
                    </option>
                  ))}
                </select>

                <select
                  value={uploadForm.provider_key}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, provider_key: event.target.value }))
                  }
                  style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
                >
                  <option value="">No provider selected</option>
                  {RETIREMENT_PROVIDERS.map((provider) => (
                    <option key={provider.institution_key} value={provider.institution_key}>
                      {provider.display_name}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={uploadForm.statement_date}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, statement_date: event.target.value }))
                  }
                  style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                />

                <textarea
                  value={uploadForm.notes}
                  onChange={(event) =>
                    setUploadForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  rows={3}
                  placeholder="Optional intake notes"
                  style={{ padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
                />

                <button
                  type="submit"
                  disabled={uploading || uploadQueue.length === 0 || !linkedAsset?.id}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#0f172a",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {uploading ? "Uploading Retirement Documents..." : "Upload Retirement Documents"}
                </button>

                {uploadError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{uploadError}</div> : null}
                {parseError ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{parseError}</div> : null}
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
                          {uploadForm.statement_date ? ` | ${uploadForm.statement_date}` : ""}
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
                  <EmptyState
                    title="No retirement files queued"
                    description="Add one or more retirement documents to create linked generic and retirement-specific document records."
                  />
                )}
              </div>
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px" }} ref={(node) => { sectionRefs.current.snapshots = node; }}>
            <SectionCard title="Retirement Snapshots">
              {bundle.retirementSnapshots.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {bundle.retirementSnapshots.map((snapshot) => (
                    <div key={snapshot.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{snapshot.snapshot_type || "retirement_snapshot"}</div>
                        <div style={{ color: "#64748b" }}>{formatDate(snapshot.snapshot_date)}</div>
                      </div>
                      <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Detected Provider:</strong> {snapshot.provider_profile?.display_name || getProviderLabel(snapshot.extraction_meta?.provider_key)}</div>
                        <div><strong>Detected Document Class:</strong> {getDocumentClassLabel(snapshot.extraction_meta?.document_class_key || snapshot.retirement_documents?.document_class_key)}</div>
                        <div><strong>Extraction Confidence:</strong> {snapshot.normalized_retirement?.statement_context?.extraction_confidence || "Not assessed yet"}</div>
                        <div>
                          <strong>Completeness:</strong>{" "}
                          {snapshot.completeness_assessment?.status ||
                            snapshot.normalized_retirement?.statement_context?.completeness_assessment?.status ||
                            "Not assessed yet"}
                        </div>
                        <div><strong>Current Balance:</strong> {formatCurrency(snapshot.normalized_retirement?.balance_metrics?.current_balance)}</div>
                        <div><strong>Vested Balance:</strong> {formatCurrency(snapshot.normalized_retirement?.balance_metrics?.vested_balance)}</div>
                        <div><strong>Loan Balance:</strong> {formatCurrency(snapshot.normalized_retirement?.loan_distribution_metrics?.loan_balance || snapshot.normalized_retirement?.balance_metrics?.loan_balance)}</div>
                        <div><strong>Beneficiary Present:</strong> {formatBoolean(snapshot.normalized_retirement?.beneficiary_metrics?.beneficiary_present)}</div>
                        <div><strong>Monthly Benefit Estimate:</strong> {formatCurrency(snapshot.normalized_retirement?.pension_metrics?.accrued_monthly_benefit || snapshot.normalized_retirement?.balance_metrics?.monthly_benefit_estimate)}</div>
                        <div><strong>Linked Retirement Document:</strong> {snapshot.retirement_document_id || "None"}</div>
                        <div>
                          <strong>Completeness Detail:</strong>{" "}
                          {(snapshot.completeness_assessment?.captured_field_count ??
                            snapshot.normalized_retirement?.statement_context?.completeness_assessment?.captured_field_count ??
                            0)}
                          {" fields captured"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No retirement snapshots yet"
                  description="Parsed retirement snapshots will land here after a retirement document is analyzed."
                />
              )}
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
            <div ref={(node) => { sectionRefs.current.analytics = node; }}>
            <SectionCard title="Retirement Analytics">
              {bundle.retirementAnalytics.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {latestAnalytics?.normalized_intelligence?.summary?.account_summary ? (
                    <AIInsightPanel
                      title="Retirement Review Summary"
                      summary={latestAnalytics.normalized_intelligence.summary.account_summary}
                      bullets={[
                        `Beneficiary flags: ${
                          latestAnalytics.review_flags?.filter((flag) => String(flag).includes("beneficiary")).map(formatFlagLabel).join(", ") || "None"
                        }`,
                        `Loan flags: ${
                          latestAnalytics.review_flags?.filter((flag) => String(flag).includes("loan")).map(formatFlagLabel).join(", ") || "None"
                        }`,
                        `Pension flags: ${
                          latestAnalytics.review_flags?.filter((flag) => String(flag).includes("pension") || String(flag).includes("benefit")).map(formatFlagLabel).join(", ") || "None"
                        }`,
                        `Completeness prompts: ${
                          latestAnalytics.normalized_intelligence?.completeness_flags?.statement_missing_sections?.map(formatFlagLabel).join(", ") || "None"
                        }`,
                      ]}
                    />
                  ) : null}

                  {bundle.retirementAnalytics.map((analytics) => (
                    <div key={analytics.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{analytics.analytics_type || "retirement_analytics"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Readiness Status:</strong> {analytics.readiness_status || "Not set yet"}</div>
                        <div><strong>Review Flags:</strong> {analytics.review_flags?.length ? analytics.review_flags.map(formatFlagLabel).join(", ") : "None yet"}</div>
                        <div><strong>Beneficiary Status:</strong> {analytics.normalized_intelligence?.beneficiary_flags?.beneficiary_missing ? "Beneficiary appears missing" : analytics.normalized_intelligence?.beneficiary_flags?.beneficiary_status_unknown ? "Beneficiary visibility limited" : "Beneficiary appears present or not flagged"}</div>
                        <div><strong>Loan Status:</strong> {analytics.normalized_intelligence?.loan_flags?.outstanding_loan_detected ? "Outstanding loan detected" : analytics.normalized_intelligence?.loan_flags?.loan_payment_visibility_limited ? "Loan data incomplete" : "No clear loan flag"}</div>
                        <div><strong>Pension Notes:</strong> {analytics.normalized_intelligence?.pension_flags?.pension_estimate_detected ? "Pension estimate detected" : "No pension estimate flag"}</div>
                        <div><strong>Concentration:</strong> {analytics.normalized_intelligence?.concentration_flags?.concentration_warning ? "Concentration warning triggered" : analytics.normalized_intelligence?.concentration_flags?.allocation_visibility_limited ? "Allocation visibility limited" : "No clear concentration warning"}</div>
                        <div><strong>Completeness Prompts:</strong> {analytics.normalized_intelligence?.completeness_flags?.statement_missing_sections?.length ? analytics.normalized_intelligence.completeness_flags.statement_missing_sections.map(formatFlagLabel).join(", ") : "None"}</div>
                        <div><strong>Created:</strong> {formatDate(analytics.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  <AIInsightPanel
                    title="Working retirement intelligence"
                    summary={`No persisted retirement analytics rows are stored yet, but this account currently reads ${retirementSignals.signalLevel.replace(/_/g, " ")} from the live statement, holdings, and review evidence.`}
                    bullets={(retirementSignals.reasons || []).slice(0, 4)}
                  />
                  {topRetirementReviewItem ? (
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
                        The retirement action feed already carries the live next move on this page. Shared follow-up stays cleaner in Review Workspace once you need to track, assign, or clear the issue across the household.
                      </div>
                      <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>{topRetirementReviewItem.summary}</div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => onNavigate?.(retirementReviewWorkspaceRoute)}
                          style={{ padding: "10px 14px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                        >
                          Open Review Workspace
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollToSection("documents")}
                          style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
                        >
                          Jump To Documents
                        </button>
                        {topRetirementReviewItem.route ? (
                          <button
                            type="button"
                            onClick={() => onNavigate?.(topRetirementReviewItem.route)}
                            style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
                          >
                            Open Top Retirement Review
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </SectionCard>
            </div>

            <div ref={(node) => { sectionRefs.current.positions = node; }}>
            <SectionCard title="Retirement Positions">
              {bundle.retirementPositions.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", lineHeight: "1.7" }}>
                    <div><strong>Total Parsed Positions:</strong> {positionSummary.count}</div>
                    <div>
                      <strong>Top Holding:</strong>{" "}
                      {positionSummary.topHolding
                        ? `${positionSummary.topHolding.position_name || "Unnamed"} (${formatCurrency(positionSummary.topHolding.current_value)})`
                        : "Not available"}
                    </div>
                    <div><strong>Concentration Note:</strong> {positionSummary.concentrationNote || "No clear concentration detected from parsed allocation data."}</div>
                  </div>

                  {bundle.retirementPositions.map((position) => (
                    <div key={position.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{position.position_name || "Unnamed position"}</div>
                      <div style={{ marginTop: "6px", color: "#475569", lineHeight: "1.7" }}>
                        <div><strong>Type:</strong> {position.position_type || "Limited visibility"}</div>
                        <div><strong>Ticker:</strong> {position.ticker_symbol || "Limited visibility"}</div>
                        <div><strong>Asset Class:</strong> {position.asset_class || position.metadata?.asset_class || "Limited visibility"}</div>
                        <div><strong>Current Value:</strong> {formatCurrency(position.current_value)}</div>
                        <div><strong>Allocation:</strong> {formatPercent(position.allocation_percent)}</div>
                        <div><strong>Units:</strong> {position.units ?? "Not available"}</div>
                        <div><strong>Unit Value:</strong> {formatCurrency(position.unit_value)}</div>
                        <div><strong>Snapshot Link:</strong> {position.snapshot_id || "Not linked"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  <AIInsightPanel
                    title="Live allocation read"
                    summary={
                      retirementSignals.flags.positionVisibility
                        ? "Parsed position detail is still missing, so concentration and allocation review remain limited."
                        : "Position detail is available, but a deeper allocation review will sharpen this account read further."
                    }
                    bullets={[
                      `Parsed positions visible: ${positionSummary.count}.`,
                      positionSummary.concentrationNote || "No clear concentration note is currently visible.",
                      ...(retirementSignals.reasons || []).filter((reason) => reason.includes("allocation") || reason.includes("holding")).slice(0, 2),
                    ]}
                  />
                </div>
              )}
            </SectionCard>
            </div>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
            <SectionCard title="Linked Portals">
              {assetBundle?.portalLinks?.length > 0 ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {assetBundle.portalLinks.map((link) => {
                    const portal = link.portal_profiles || {};
                    return (
                      <div key={link.id} style={{ padding: "14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a" }}>{portal.portal_name || "Linked portal"}</div>
                          <StatusBadge label={portal.access_status || "unknown"} tone={portal.access_status === "active" ? "good" : portal.access_status === "limited" ? "warning" : "info"} />
                        </div>
                        <div style={{ marginTop: "8px", color: "#475569", lineHeight: "1.7" }}>
                          <div><strong>Institution:</strong> {portal.institution_name || "Limited visibility"}</div>
                          <div><strong>Recovery Hint:</strong> {portal.recovery_contact_hint || "Limited visibility"}</div>
                          <div><strong>Link Type:</strong> {link.link_type || "supporting_access"}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No linked portals yet"
                  description="Portal continuity records will surface here through the linked platform asset when access continuity is mapped."
                />
              )}
            </SectionCard>

            <SectionCard title="Review Workspace Handoff">
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ color: "#475569", lineHeight: "1.7" }}>
                  Retirement Command and the account read already explain the active retirement issues on this page. Shared follow-up belongs in Review Workspace so document, alert, and continuity work is tracked in one place instead of restated in a second linkage card.
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
                      {retirementReviewQueueItems.length} open retirement workstream{retirementReviewQueueItems.length === 1 ? "" : "s"}
                    </div>
                    <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#e2e8f0", color: "#475569", fontWeight: 700, fontSize: "12px" }}>
                      {assetBundle?.alerts?.length || 0} alert{assetBundle?.alerts?.length === 1 ? "" : "s"}
                    </div>
                    <div style={{ padding: "7px 12px", borderRadius: "999px", background: "#ecfccb", color: "#3f6212", fontWeight: 700, fontSize: "12px" }}>
                      {assetBundle?.tasks?.length || 0} task{assetBundle?.tasks?.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div style={{ color: "#0f172a", fontWeight: 700, lineHeight: "1.7" }}>
                    {topRetirementReviewItem?.summary || retirementCommandCenter.headline}
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onNavigate?.(retirementReviewWorkspaceRoute)}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700 }}
                    >
                      Open Review Workspace
                    </button>
                    {topRetirementReviewItem?.route ? (
                      <button
                        type="button"
                        onClick={() => onNavigate?.(topRetirementReviewItem.route)}
                        style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", cursor: "pointer", fontWeight: 700 }}
                      >
                        Open Top Retirement Review
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {shouldShowDevDiagnostics() ? (
            <SectionCard title="Retirement Debug">
              <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                retirement_account_id={retirementAccount.id} | asset_id={linkedAsset?.id || "none"} | household_id={retirementAccount.household_id || "none"} | documents={bundle.retirementDocuments.length} | snapshots={bundle.retirementSnapshots.length} | analytics={bundle.retirementAnalytics.length} | positions={bundle.retirementPositions.length} | uploadAttempts={uploadQueue.length} | assetDocumentIds={uploadQueue.map((item) => item.assetDocumentId).filter(Boolean).join(", ") || "none"} | retirementDocumentIds={uploadQueue.map((item) => item.retirementDocumentId).filter(Boolean).join(", ") || "none"} | storageConfigured={isSupabaseConfigured() ? "yes" : "no"} | error={loadError || uploadError || parseError || "none"}
              </div>
              {parseDebug ? (
                <pre
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    borderRadius: "12px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    color: "#334155",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(parseDebug, null, 2)}
                </pre>
              ) : null}
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
