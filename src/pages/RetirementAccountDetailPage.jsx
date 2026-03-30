import { useEffect, useMemo, useRef, useState } from "react";
import AIInsightPanel from "../components/shared/AIInsightPanel";
import EmptyState from "../components/shared/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import {
  getRetirementDocumentClass,
  getRetirementType,
  listRetirementProviders,
} from "../lib/domain/retirement";
import { analyzeRetirementReadiness } from "../lib/domain/retirement/retirementIntelligence";
import { isSupabaseConfigured } from "../lib/supabase/client";
import { getAssetDetailBundle } from "../lib/supabase/platformData";
import {
  getRetirementAccountBundle,
  listRetirementDocumentClasses,
  parseRetirementDocumentToSnapshot,
  uploadRetirementDocument,
} from "../lib/supabase/retirementData";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";

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
  const { householdState, debug: shellDebug } = usePlatformShellData();
  const fileInputRef = useRef(null);
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

  async function loadRetirementBundle(targetRetirementAccountId, options = {}) {
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
  }

  useEffect(() => {
    if (!retirementAccountId) return;

    let active = true;

    async function loadBundle() {
      setLoading(true);
      const result = await loadRetirementBundle(retirementAccountId);
      if (!active) return;

      setLoading(false);
    }

    loadBundle();
    return () => {
      active = false;
    };
  }, [retirementAccountId, scopeKey]);

  const retirementAccount = bundle?.retirementAccount || null;
  const retirementType = retirementAccount ? getRetirementType(retirementAccount.retirement_type_key) : null;
  const linkedAsset = retirementAccount?.assets || null;

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

  return (
    <div>
      <PageHeader
        eyebrow="Retirement Detail"
        title={retirementAccount?.plan_name || linkedAsset?.asset_name || "Retirement Account Detail"}
        description="Live retirement bundle view backed by retirement accounts, documents, snapshots, analytics, positions, and linked platform assets."
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
                  description="This retirement account does not currently show a linked generic asset record."
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

            <SectionCard title="Retirement Review Snapshot">
              <AIInsightPanel
                title="Current Retirement Read"
                summary={retirementRead.headline}
                bullets={[
                  `Balance visibility: ${retirementRead.metrics?.currentBalanceVisible ? "visible" : "limited"}`,
                  `Contribution visibility: ${retirementRead.metrics?.contributionsVisible ? "visible" : "limited"}`,
                  `Extraction quality: ${retirementRead.extractionQuality}`,
                  `Parsed positions: ${retirementRead.metrics?.positionsCount ?? 0}`,
                ]}
              />
            </SectionCard>
          </div>

          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "18px" }}>
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
                        <div><strong>Generic Asset Document:</strong> {document.asset_document_id || "Not linked yet"}</div>
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
                    Upload retirement statements, notices, beneficiary forms, and plan documents into this retirement account. The original file is saved as a generic asset document and then linked into the retirement module.
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
                          {item.duplicate ? " | Existing generic upload reused" : ""}
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

          <div style={{ marginTop: "24px" }}>
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
                <EmptyState
                  title="No retirement analytics yet"
                  description="Retirement intelligence will appear here after a retirement document is parsed into a snapshot and review record."
                />
              )}
            </SectionCard>

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
                <EmptyState
                  title="No retirement positions yet"
                  description="Fund allocations, subaccounts, target-date holdings, and model portfolios will appear here after a statement with usable position rows is parsed."
                />
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

            <SectionCard title="Notes / Tasks / Alerts">
              {assetBundle ? (
                <AIInsightPanel
                  title="Platform Linkage"
                  summary="This retirement record can inherit shared continuity context from the linked platform asset without collapsing retirement-specific data into generic tables."
                  bullets={[
                    `Generic asset documents linked: ${assetBundle.documents?.length || 0}`,
                    `Asset alerts linked: ${assetBundle.alerts?.length || 0}`,
                    `Asset tasks linked: ${assetBundle.tasks?.length || 0}`,
                  ]}
                />
              ) : (
                <EmptyState
                  title="Shared platform context pending"
                  description="Alerts, tasks, notes, and broader continuity context will surface here through the linked generic asset record."
                />
              )}
            </SectionCard>
          </div>

          {import.meta.env.DEV ? (
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
