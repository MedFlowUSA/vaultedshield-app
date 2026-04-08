import { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import DocumentTable from "../components/shared/DocumentTable";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import StatusBadge from "../components/shared/StatusBadge";
import SummaryPanel from "../components/shared/SummaryPanel";
import { summarizeUploadCenterModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  listHouseholdAssetsForSelection,
  listHouseholdDocuments,
  uploadGenericAssetDocument,
} from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";
import { captureDocumentPhoto, isNativeCameraAvailable } from "../utils/cameraCapture";
import { convertImageToFile } from "../utils/imageToFile";

const DOCUMENT_TYPES = [
  "statement",
  "policy",
  "trust",
  "will",
  "POA",
  "healthcare_directive",
  "bank_statement",
  "retirement_statement",
  "other",
];

const DOCUMENT_ROLES = [
  "uploaded_document",
  "supporting_document",
  "annual_statement",
  "baseline_document",
  "legal_document",
  "financial_document",
  "other",
];

const CATEGORY_OPTIONS = [
  {
    value: "insurance",
    label: "Insurance",
    example: "Life policy, declarations page, annual statement",
    defaultDocumentType: "policy",
    defaultDocumentRole: "supporting_document",
  },
  {
    value: "banking",
    label: "Banking",
    example: "Checking statement, brokerage statement, cash account PDF",
    defaultDocumentType: "bank_statement",
    defaultDocumentRole: "financial_document",
  },
  {
    value: "retirement",
    label: "Retirement",
    example: "401(k), IRA, pension, beneficiary statement",
    defaultDocumentType: "retirement_statement",
    defaultDocumentRole: "financial_document",
  },
  {
    value: "property",
    label: "Property",
    example: "Mortgage statement, deed, tax notice, appraisal",
    defaultDocumentType: "statement",
    defaultDocumentRole: "supporting_document",
  },
  {
    value: "estate",
    label: "Estate",
    example: "Trust, will, power of attorney, healthcare directive",
    defaultDocumentType: "trust",
    defaultDocumentRole: "legal_document",
  },
  {
    value: "health",
    label: "Health",
    example: "Plan summary, claims packet, provider notice",
    defaultDocumentType: "statement",
    defaultDocumentRole: "supporting_document",
  },
  {
    value: "business",
    label: "Business",
    example: "Operating agreement, ownership document, tax file",
    defaultDocumentType: "other",
    defaultDocumentRole: "supporting_document",
  },
  {
    value: "digital_asset",
    label: "Digital Asset",
    example: "Wallet summary, exchange export, access instructions",
    defaultDocumentType: "other",
    defaultDocumentRole: "supporting_document",
  },
  {
    value: "misc",
    label: "Other Household Record",
    example: "Anything that supports the broader household file",
    defaultDocumentType: "other",
    defaultDocumentRole: "uploaded_document",
  },
];

const DOCUMENT_TYPE_LABELS = {
  statement: "Statement",
  policy: "Policy document",
  trust: "Trust",
  will: "Will",
  POA: "Power of attorney",
  healthcare_directive: "Healthcare directive",
  bank_statement: "Bank statement",
  retirement_statement: "Retirement statement",
  other: "Other",
};

const DOCUMENT_ROLE_LABELS = {
  uploaded_document: "General upload",
  supporting_document: "Supporting document",
  annual_statement: "Annual statement",
  baseline_document: "Baseline document",
  legal_document: "Legal document",
  financial_document: "Financial document",
  other: "Other",
};

function normalizeCategoryValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getCategoryConfig(category) {
  return CATEGORY_OPTIONS.find((item) => item.value === category) || CATEGORY_OPTIONS[CATEGORY_OPTIONS.length - 1];
}

function assetMatchesCategory(asset, category) {
  const normalizedCategory = normalizeCategoryValue(category);
  const assetCategory = normalizeCategoryValue(asset?.asset_category);
  const assetSubcategory = normalizeCategoryValue(asset?.asset_subcategory);
  const assetName = normalizeCategoryValue(asset?.asset_name);
  const haystack = `${assetCategory} ${assetSubcategory} ${assetName}`;

  if (!normalizedCategory || normalizedCategory === "misc") return true;
  if (normalizedCategory === "property") return haystack.includes("property") || haystack.includes("home") || haystack.includes("mortgage");
  if (normalizedCategory === "health") return haystack.includes("health");
  if (normalizedCategory === "digital_asset") return haystack.includes("digital") || haystack.includes("crypto") || haystack.includes("wallet");
  return haystack.includes(normalizedCategory);
}

function formatDocumentTypeLabel(value) {
  return DOCUMENT_TYPE_LABELS[value] || value;
}

function formatDocumentRoleLabel(value) {
  return DOCUMENT_ROLE_LABELS[value] || value;
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

function formatFriendlyLoadError(error) {
  if (!error) return "";
  return "We couldn't load the Upload Center right now.";
}

function getQueueStatusTone(status) {
  if (status === "saved") return { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" };
  if (status === "failed") return { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" };
  if (status === "uploading") return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" };
  return { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" };
}

function getDocumentScopeLabel(item, assets) {
  if (!item.assetId) {
    return "Household-level document";
  }
  const linkedAsset = assets.find((asset) => asset.id === item.assetId);
  return linkedAsset ? `Linked asset: ${linkedAsset.asset_name}` : "Asset-linked document";
}

export default function UploadCenterPage() {
  const { isMobile, isTablet } = useResponsiveLayout();
  const householdState = usePlatformHousehold();
  const supabaseConfigured = isSupabaseConfigured();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [assets, setAssets] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [queue, setQueue] = useState([]);
  const [assetId, setAssetId] = useState("");
  const [assetCategoryHint, setAssetCategoryHint] = useState("insurance");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [documentType, setDocumentType] = useState("other");
  const [documentRole, setDocumentRole] = useState("uploaded_document");
  const [notes, setNotes] = useState("");
  const [loadError, setLoadError] = useState("");
  const [cameraLoading, setCameraLoading] = useState(false);
  const nativeCameraAvailable = isNativeCameraAvailable();

  useEffect(() => {
    if (!householdState.context.householdId) {
      setAssets([]);
      setDocuments([]);
      return;
    }

    let active = true;

    async function loadContextData() {
      const [assetsResult, documentsResult] = await Promise.all([
        listHouseholdAssetsForSelection(householdState.context.householdId),
        listHouseholdDocuments(householdState.context.householdId),
      ]);

      if (!active) return;

      setAssets(assetsResult.data || []);
      setDocuments(documentsResult.data || []);
      setLoadError(formatFriendlyLoadError(assetsResult.error || documentsResult.error));

      if (import.meta.env.DEV && (assetsResult.error || documentsResult.error)) {
        console.error("[UploadCenterPage] loadContextData", {
          assetsError: assetsResult.error,
          documentsError: documentsResult.error,
        });
      }
    }

    loadContextData();
    return () => {
      active = false;
    };
  }, [householdState.context.householdId]);

  const selectedCategory = useMemo(() => getCategoryConfig(assetCategoryHint), [assetCategoryHint]);
  const filteredAssets = useMemo(
    () => assets.filter((asset) => assetMatchesCategory(asset, assetCategoryHint)),
    [assets, assetCategoryHint]
  );
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === assetId) || null,
    [assetId, assets]
  );

  useEffect(() => {
    if (!assetId && filteredAssets.length === 1) {
      setAssetId(filteredAssets[0].id);
    }
  }, [assetId, filteredAssets]);

  function applyCategoryPreset(nextCategory) {
    const config = getCategoryConfig(nextCategory);
    setAssetCategoryHint(nextCategory);
    setDocumentType(config.defaultDocumentType);
    setDocumentRole(config.defaultDocumentRole);
    setAssetId((current) => {
      const currentStillFits = assets.some((asset) => asset.id === current && assetMatchesCategory(asset, nextCategory));
      if (currentStillFits) return current;
      const matchingAssets = assets.filter((asset) => assetMatchesCategory(asset, nextCategory));
      return matchingAssets.length === 1 ? matchingAssets[0].id : "";
    });
  }

  function enqueueFiles(fileList) {
    const newEntries = Array.from(fileList || []).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      status: "queued",
      assetId,
      documentType,
      documentRole,
      assetCategoryHint,
      notes,
      storagePath: "",
      documentId: null,
      errorSummary: "",
      duplicate: false,
    }));
    setQueue((current) => [...newEntries, ...current]);
  }

  async function handleCameraCapture() {
    setLoadError("");
    setCameraLoading(true);

    try {
      if (!nativeCameraAvailable) {
        cameraInputRef.current?.click();
        return;
      }

      const image = await captureDocumentPhoto();
      const file = await convertImageToFile(image);
      enqueueFiles([file]);
    } catch (error) {
      setLoadError(error?.message || "Camera capture failed.");
    } finally {
      setCameraLoading(false);
    }
  }

  async function handleUploadQueuedFiles() {
    if (!householdState.context.householdId || queue.length === 0) return;

    for (const item of queue) {
      if (item.status !== "queued" && item.status !== "failed") {
        continue;
      }

      setQueue((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "uploading", errorSummary: "" } : entry
        )
      );

      const result = await uploadGenericAssetDocument({
        householdId: householdState.context.householdId,
        assetId: item.assetId || null,
        file: item.file,
        documentType: item.documentType,
        documentRole: item.documentRole,
        assetCategoryHint: item.assetCategoryHint,
        notes: item.notes,
        metadata: {
          upload_center: true,
        },
      });

      const nextStatus = result.error ? "failed" : "saved";
      setQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: nextStatus,
                storagePath: result.upload?.storagePath || "",
                documentId: result.data?.id || null,
                errorSummary: result.errorSummary || "",
                duplicate: result.duplicate,
              }
            : entry
        )
      );

      if (!result.error && result.data) {
        setDocuments((current) => [result.data, ...current]);
      }

      if (import.meta.env.DEV && result.error) {
        console.error("[UploadCenterPage] uploadGenericAssetDocument", {
          queueId: item.id,
          rawError: result.error,
        });
      }
    }
  }

  const documentRows = documents.slice(0, 12).map((document) => ({
    name: document.file_name || "Unnamed document",
    role: [
      document.metadata?.document_scope === "household" ? "Household-level" : null,
      document.document_type,
      document.document_role,
      document.assets?.asset_name,
    ]
      .filter(Boolean)
      .join(" | "),
    status: document.processing_status || "uploaded",
    updatedAt: formatDate(document.created_at),
  }));
  const uploadRead = summarizeUploadCenterModule({ assets, documents, queue });
  const queueReadyCount = queue.filter((item) => item.status === "queued").length;
  const queueUploadingCount = queue.filter((item) => item.status === "uploading").length;
  const queueSavedCount = queue.filter((item) => item.status === "saved").length;
  const queueFailedCount = queue.filter((item) => item.status === "failed").length;

  return (
    <div style={{ display: "grid", gap: "24px", minWidth: 0, maxWidth: "100%", overflowX: "clip" }}>
      <PageHeader
        eyebrow="Upload Center"
        title="Unified Upload Center"
        description="Bring household documents into VaultedShield quickly, then add deeper metadata only when it helps the review."
      />

      <SummaryPanel
        items={[
          { label: "Working Household", value: householdState.household?.household_name || "Loading", helper: "Current platform context" },
          { label: "Assets Available", value: assets.length, helper: "Optional document attachment targets" },
          { label: "Queued Files", value: queue.length, helper: "Current upload queue" },
          { label: "Saved Documents", value: documents.length, helper: "Household documents already on file" },
          { label: "Intake Status", value: uploadRead.status, helper: "Overall upload readiness" },
        ]}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.18fr) minmax(0, 0.82fr)",
          gap: "18px",
          minWidth: 0,
        }}
      >
        <SectionCard title="Upload Pipeline Readiness">
          <div style={{ display: "grid", gap: "12px", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>{uploadRead.headline}</div>
              <StatusBadge label={uploadRead.status} tone={uploadRead.status === "Ready" ? "good" : uploadRead.status === "Building" ? "warning" : "alert"} />
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "6px", color: "#475569" }}>
              {uploadRead.notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Upload Metrics">
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Asset-linked docs:</strong> {uploadRead.metrics.assetLinkedDocuments}</div>
            <div><strong>Queued:</strong> {uploadRead.metrics.queued}</div>
            <div><strong>Queue failures:</strong> {uploadRead.metrics.failedQueue}</div>
            <div><strong>Saved this session:</strong> {uploadRead.metrics.savedQueue}</div>
          </div>
        </SectionCard>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.18fr) minmax(0, 0.82fr)",
          gap: "18px",
          minWidth: 0,
        }}
      >
        <SectionCard title="Guided Document Intake" subtitle="Start with what you are uploading, then add deeper metadata only if you need it.">
          <div style={{ display: "grid", gap: "18px", minWidth: 0 }}>
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "16px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                Simple Upload Mode
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                What kind of document are you uploading?
              </div>
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                Choose the closest category first. VaultedShield will place it in the household vault and you can add deeper metadata only when it adds review value.
              </div>
              <div style={{ color: "#64748b", lineHeight: "1.7", fontSize: "14px" }}>
                Accepted file types: PDF, JPG, PNG, or a quick camera scan. Example: "{selectedCategory.example}".
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                minWidth: 0,
              }}
            >
              {CATEGORY_OPTIONS.map((option) => {
                const active = option.value === assetCategoryHint;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => applyCategoryPreset(option.value)}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      border: active ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                      background: active ? "#eff6ff" : "#ffffff",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "grid",
                      gap: "6px",
                    }}
                  >
                    <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{option.label}</div>
                    <div style={{ fontSize: "13px", color: active ? "#1d4ed8" : "#64748b", lineHeight: "1.6" }}>{option.example}</div>
                  </button>
                );
              })}
            </div>

            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                enqueueFiles(event.dataTransfer.files);
              }}
              style={{
                border: "1px dashed #94a3b8",
                borderRadius: "16px",
                padding: isMobile ? "18px" : "24px",
                background: "#f8fafc",
                minWidth: 0,
              }}
            >
              <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop files here</div>
              <p style={{ marginTop: "8px", marginBottom: "14px", color: "#64748b", lineHeight: "1.6" }}>
                Upload a {selectedCategory.label.toLowerCase()} document to the household vault. Use the dedicated Insurance {" > "} Life workflow when you want the deeper life-policy review experience.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(event) => enqueueFiles(event.target.files)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(event) => {
                  enqueueFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700, width: isMobile ? "100%" : "auto" }}
                >
                  Select Files
                </button>
                <button
                  type="button"
                  onClick={handleCameraCapture}
                  disabled={cameraLoading}
                  style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700, width: isMobile ? "100%" : "auto" }}
                >
                  {cameraLoading ? "Opening Camera..." : "Scan Document"}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px", minWidth: 0 }}>
              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Link this document to an existing record</div>
                <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
                  {filteredAssets.length === 1
                    ? `VaultedShield found one likely ${selectedCategory.label.toLowerCase()} match and preselected it for you.`
                    : "You can leave this as household-level if the file supports the overall family record instead of one specific asset."}
                </div>
                <select
                  value={assetId}
                  onChange={(event) => setAssetId(event.target.value)}
                  style={{ width: "100%", minWidth: 0, maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
                >
                  <option value="">Keep this as a household-level document</option>
                  {filteredAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.asset_name} ({asset.asset_category}{asset.asset_subcategory ? ` / ${asset.asset_subcategory}` : ""})
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Optional note, tag, or reminder for this upload batch"
                style={{ width: "100%", minWidth: 0, maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
              />

              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                  Current Intake Read
                </div>
                <div style={{ color: "#0f172a", fontWeight: 700 }}>
                  {selectedCategory.label} upload
                  {selectedAsset ? ` linked to ${selectedAsset.asset_name}` : " saved at the household level"}
                </div>
                <div style={{ color: "#475569", lineHeight: "1.7", fontSize: "14px" }}>
                  Document type: {formatDocumentTypeLabel(documentType)}. Processing role: {formatDocumentRoleLabel(documentRole)}.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvancedOptions((current) => !current)}
                style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700, width: isMobile ? "100%" : "fit-content" }}
              >
                {showAdvancedOptions ? "Hide More Options" : "More Options"}
              </button>

              {showAdvancedOptions ? (
                <div
                  style={{
                    display: "grid",
                    gap: "12px",
                    padding: "16px",
                    borderRadius: "14px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Advanced metadata</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                      gap: "12px",
                      minWidth: 0,
                    }}
                  >
                    <label style={{ display: "grid", gap: "6px", color: "#475569", fontSize: "14px" }}>
                      <span>Document category</span>
                      <select
                        value={assetCategoryHint}
                        onChange={(event) => applyCategoryPreset(event.target.value)}
                        style={{ width: "100%", minWidth: 0, maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
                      >
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "6px", color: "#475569", fontSize: "14px" }}>
                      <span>Document type</span>
                      <select
                        value={documentType}
                        onChange={(event) => setDocumentType(event.target.value)}
                        style={{ width: "100%", minWidth: 0, maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
                      >
                        {DOCUMENT_TYPES.map((type) => (
                          <option key={type} value={type}>{formatDocumentTypeLabel(type)}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "6px", color: "#475569", fontSize: "14px" }}>
                      <span>Processing role</span>
                      <select
                        value={documentRole}
                        onChange={(event) => setDocumentRole(event.target.value)}
                        style={{ width: "100%", minWidth: 0, maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
                      >
                        {DOCUMENT_ROLES.map((role) => (
                          <option key={role} value={role}>{formatDocumentRoleLabel(role)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleUploadQueuedFiles}
                disabled={!householdState.context.householdId || queue.length === 0}
                style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, width: isMobile ? "100%" : "auto" }}
              >
                Upload Queue
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Ready For Upload" subtitle="Selected files, current status, and what will happen next.">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
              gap: "10px",
              marginBottom: queue.length > 0 ? "14px" : 0,
            }}
          >
            {[
              { label: "Ready", value: queueReadyCount },
              { label: "Uploading", value: queueUploadingCount },
              { label: "Saved", value: queueSavedCount },
              { label: "Needs Review", value: queueFailedCount },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.label}</div>
                <div style={{ marginTop: "6px", fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{item.value}</div>
              </div>
            ))}
          </div>
          {queue.length > 0 ? (
            <div style={{ display: "grid", gap: "12px", minWidth: 0 }}>
              {queue.map((item) => {
                const statusTone = getQueueStatusTone(item.status);
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      display: "grid",
                      gap: "10px",
                      minWidth: 0,
                      maxWidth: "100%",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "#0f172a", wordBreak: "break-word", overflowWrap: "anywhere" }}>
                      {item.file.name}
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "fit-content",
                        maxWidth: "100%",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        ...statusTone,
                      }}
                    >
                      {item.status}{item.duplicate ? " | Duplicate reused" : ""}
                    </div>
                    <div style={{ display: "grid", gap: "6px", color: "#475569", lineHeight: "1.65", minWidth: 0 }}>
                      <div style={{ overflowWrap: "anywhere" }}>
                        <strong style={{ color: "#0f172a" }}>Scope:</strong> {getDocumentScopeLabel(item, assets)}
                      </div>
                      <div style={{ overflowWrap: "anywhere" }}>
                        <strong style={{ color: "#0f172a" }}>Type:</strong> {item.documentType} | {item.documentRole}
                      </div>
                      {item.storagePath ? (
                        <div style={{ overflowWrap: "anywhere" }}>
                          <strong style={{ color: "#0f172a" }}>Storage Path:</strong> <span style={{ color: "#64748b" }}>{item.storagePath}</span>
                        </div>
                      ) : null}
                    </div>
                    {item.errorSummary ? (
                      <div style={{ color: "#991b1b", lineHeight: "1.65", overflowWrap: "anywhere" }}>
                        {item.errorSummary}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Your upload tray is ready"
              description="Choose a document category, add one or more files, and VaultedShield will show scanning and save status here."
            >
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ color: "#475569", fontSize: "14px", lineHeight: "1.7" }}>
                  Strong first upload packets:
                </div>
                <div style={{ display: "grid", gap: "8px", color: "#64748b", fontSize: "14px" }}>
                  <div>Insurance: illustration plus recent annual statement</div>
                  <div>Property: deed, mortgage statement, or tax record</div>
                  <div>Estate: trust, will, or power-of-attorney file</div>
                </div>
              </div>
            </EmptyState>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent Household Uploads" subtitle="These documents will appear in the Vault view on refresh or navigation.">
        {documentRows.length > 0 ? (
          <DocumentTable rows={documentRows} />
        ) : (
            <EmptyState
              title="No household documents uploaded yet"
              description="Upload the first household document here to start building the shared vault and broader review evidence."
            >
              <div style={{ color: "#475569", fontSize: "14px", lineHeight: "1.7" }}>
                After the first upload, this list becomes the handoff point into the vault and the broader household review flow.
              </div>
            </EmptyState>
          )}
        </SectionCard>

      {loadError ? (
        <div style={{ color: "#991b1b", lineHeight: "1.65", overflowWrap: "anywhere" }}>{loadError}</div>
      ) : null}

      {import.meta.env.DEV ? (
        <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7", overflowWrap: "anywhere" }}>
          Upload Debug: household={householdState.context.householdId || "none"} | asset={assetId || "none"} | storageConfigured={supabaseConfigured ? "yes" : "no"} | queue={queue.length} | uploadedPaths={queue.map((item) => item.storagePath).filter(Boolean).join(", ") || "none"} | documentIds={queue.map((item) => item.documentId).filter(Boolean).join(", ") || "none"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
