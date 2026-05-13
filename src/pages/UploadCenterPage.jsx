import { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import DocumentTable from "../components/shared/DocumentTable";
import StatusBadge from "../components/shared/StatusBadge";
import { summarizeUploadCenterModule } from "../lib/domain/platformIntelligence/moduleReadiness";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  listHouseholdAssetsForSelection,
  listHouseholdDocuments,
  uploadGenericAssetDocument,
} from "../lib/supabase/platformData";
import { usePlatformHousehold } from "../lib/supabase/usePlatformHousehold";
import { shouldShowDevDiagnostics } from "../lib/ui/devDiagnostics";
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
  const uploadHeroScore = Math.round(
    Math.max(
      26,
      Math.min(90, 34 + Number(uploadRead.metrics.assetLinkedDocuments || 0) * 5 + Number(uploadRead.metrics.savedQueue || 0) * 6 + documents.length)
    )
  );
  const uploadHeroTone =
    uploadHeroScore >= 80 ? "good" : uploadHeroScore >= 60 ? "info" : uploadHeroScore >= 44 ? "warning" : "alert";
  const uploadHeroGlanceItems = [
    { label: "Working Household", value: householdState.household?.household_name || "Loading" },
    { label: "Assets Available", value: assets.length },
    { label: "Queued Files", value: queue.length },
    { label: "Saved Documents", value: documents.length },
  ];

  return (
    <div style={{ display: "grid", gap: "24px", minWidth: 0, maxWidth: "100%", overflowX: "clip" }}>
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #0c4a6e 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>Upload Center</div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>Unified Upload Center</div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>{uploadRead.headline}</div>
          </div>
          <div style={{ padding: "16px 20px", borderRadius: "18px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", display: "grid", gap: "4px", textAlign: "center", minWidth: "100px", flexShrink: 0 }}>
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#7dd3fc" }}>{uploadHeroScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>intake score</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {uploadHeroGlanceItems.map((item) => (
            <div key={item.label} style={{ padding: "10px 14px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: "11px", opacity: 0.55, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "2px" }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#0c4a6e", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            Select Files
          </button>
          {nativeCameraAvailable ? (
            <button type="button" onClick={handleCameraCapture} style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
              Use Camera
            </button>
          ) : (
            <button type="button" onClick={() => document.querySelector('[data-upload-queue="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
              Review Queue
            </button>
          )}
          <button type="button" onClick={() => document.querySelector('[data-upload-queue="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            Open Queue
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        {[
          {
            kicker: "Simple Read",
            title: uploadRead.status === "Ready" ? "Intake pipeline looks usable" : "Intake pipeline is still building",
            detail: uploadRead.headline,
            metric: `${queue.length} queued`,
            tone: uploadHeroTone,
            statusLabel: "Simple Read",
            actionLabel: "Select Files",
            onAction: () => fileInputRef.current?.click(),
          },
          {
            kicker: "Best First Step",
            title: queue.length > 0 ? "Finish the current upload queue" : "Choose the document category first",
            detail: uploadRead.notes[0] || "A clean category choice makes the rest of the upload feel much easier.",
            metric: `${queueReadyCount} ready`,
            tone: "warning",
            statusLabel: "Guided Focus",
            actionLabel: "Review Queue",
            onAction: () => document.querySelector('[data-upload-queue="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "What Can Wait",
            title: "Advanced metadata can come later",
            detail: "Start with the file and the closest category. VaultedShield can deepen the record after intake.",
            metric: `${queueSavedCount} saved`,
            tone: "info",
            statusLabel: "Building",
            actionLabel: "Open Queue",
            onAction: () => document.querySelector('[data-upload-queue="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" }),
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.18fr) minmax(0, 0.82fr)",
          gap: "18px",
          minWidth: 0,
        }}
      >
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Upload Pipeline Readiness</div>
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
        </div>

        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Upload Metrics</div>
          <div style={{ display: "grid", gap: "10px", color: "#475569", lineHeight: "1.7" }}>
            <div><strong>Asset-linked docs:</strong> {uploadRead.metrics.assetLinkedDocuments}</div>
            <div><strong>Queued:</strong> {uploadRead.metrics.queued}</div>
            <div><strong>Queue failures:</strong> {uploadRead.metrics.failedQueue}</div>
            <div><strong>Saved this session:</strong> {uploadRead.metrics.savedQueue}</div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isTablet ? "1fr" : "minmax(0, 1.18fr) minmax(0, 0.82fr)",
          gap: "18px",
          minWidth: 0,
        }}
      >
        <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Guided Document Intake</div>
            <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Start with what you are uploading, then add deeper metadata only if you need it.</div>
          </div>
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
                Upload a {selectedCategory.label.toLowerCase()} document to the household vault. Use Insurance {" > "} Life Policy Intake only when you want deeper life-policy illustration and annual-statement analysis.
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
        </div>

        <div
          data-upload-queue="true"
          style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}
        >
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Ready For Upload</div>
            <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Selected files, current status, and what will happen next.</div>
          </div>
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
        </div>
      </div>

      <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Recent Household Uploads</div>
          <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>These documents will appear in the Vault view on refresh or navigation.</div>
        </div>
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
      </div>

      {loadError ? (
        <div style={{ color: "#991b1b", lineHeight: "1.65", overflowWrap: "anywhere" }}>{loadError}</div>
      ) : null}

      {shouldShowDevDiagnostics() ? (
        <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7", overflowWrap: "anywhere" }}>
          Upload Debug: household={householdState.context.householdId || "none"} | asset={assetId || "none"} | storageConfigured={supabaseConfigured ? "yes" : "no"} | queue={queue.length} | uploadedPaths={queue.map((item) => item.storagePath).filter(Boolean).join(", ") || "none"} | documentIds={queue.map((item) => item.documentId).filter(Boolean).join(", ") || "none"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
