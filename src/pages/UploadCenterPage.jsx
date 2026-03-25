import { useEffect, useRef, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import DocumentTable from "../components/shared/DocumentTable";
import PageHeader from "../components/layout/PageHeader";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
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
      setLoadError(assetsResult.error?.message || documentsResult.error?.message || "");
    }

    loadContextData();
    return () => {
      active = false;
    };
  }, [householdState.context.householdId]);

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
                errorSummary: result.error?.message || result.upload?.errorSummary || "",
                duplicate: result.duplicate,
              }
            : entry
        )
      );

      if (!result.error && result.data) {
        setDocuments((current) => [result.data, ...current]);
      }
    }
  }

  const documentRows = documents.slice(0, 12).map((document) => ({
    name: document.file_name || "Unnamed document",
    role: [
      document.document_type,
      document.document_role,
      document.assets?.asset_name,
    ]
      .filter(Boolean)
      .join(" | "),
    status: document.processing_status || "uploaded",
    updatedAt: formatDate(document.created_at),
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Upload Center"
        title="Unified Upload Center"
        description="Live generic intake for household documents, separate from the specialized Insurance > Life analysis workflow."
      />

      <SummaryPanel
        items={[
          { label: "Working Household", value: householdState.household?.household_name || "Loading", helper: "Current platform context" },
          { label: "Assets Available", value: assets.length, helper: "Optional document attachment targets" },
          { label: "Queued Files", value: queue.length, helper: "Current upload queue" },
          { label: "Saved Documents", value: documents.length, helper: "Generic household documents" },
        ]}
      />

      <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1.2fr 1fr", gap: "18px" }}>
        <SectionCard title="Generic Document Intake" subtitle="Upload household documents into the broad platform vault without invoking the specialized IUL parser.">
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
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a" }}>Drop files here</div>
            <p style={{ marginTop: "8px", color: "#64748b", lineHeight: "1.6" }}>
              Upload generic household documents to the platform vault. This flow does not replace the specialized life-policy analysis flow.
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
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700, width: isMobile ? "100%" : "auto" }}
            >
              Select Files
            </button>
            <button
              type="button"
              onClick={handleCameraCapture}
              disabled={cameraLoading}
              style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", cursor: "pointer", fontWeight: 700, width: isMobile ? "100%" : "auto" }}
            >
              {cameraLoading ? "Opening Camera..." : "Scan Document"}
            </button>
          </div>

          <div style={{ marginTop: "18px", display: "grid", gap: "12px" }}>
            <select
              value={assetId}
              onChange={(event) => setAssetId(event.target.value)}
              style={{ width: "100%", maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              <option value="">No asset selected (household-level document)</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.asset_name} ({asset.asset_category}{asset.asset_subcategory ? ` / ${asset.asset_subcategory}` : ""})
                </option>
              ))}
            </select>

            <select
              value={assetCategoryHint}
              onChange={(event) => setAssetCategoryHint(event.target.value)}
              style={{ width: "100%", maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              <option value="insurance">insurance</option>
              <option value="banking">banking</option>
              <option value="retirement">retirement</option>
              <option value="estate">estate</option>
              <option value="property">property</option>
              <option value="health">health</option>
              <option value="business">business</option>
              <option value="digital_asset">digital_asset</option>
              <option value="misc">misc</option>
            </select>

            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
              style={{ width: "100%", maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            <select
              value={documentRole}
              onChange={(event) => setDocumentRole(event.target.value)}
              style={{ width: "100%", maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}
            >
              {DOCUMENT_ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Notes or tag for this upload batch"
              style={{ width: "100%", maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
            />

            <button
              onClick={handleUploadQueuedFiles}
              disabled={!householdState.context.householdId || queue.length === 0}
              style={{ padding: "12px 16px", borderRadius: "10px", border: "none", background: "#0f172a", color: "#fff", cursor: "pointer", fontWeight: 700, width: isMobile ? "100%" : "auto" }}
            >
              Upload Queue
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Upload Queue" subtitle="Per-file platform upload status.">
          {queue.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {queue.map((item) => (
                <div key={item.id} style={{ padding: "12px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>{item.file.name}</div>
                  <div style={{ marginTop: "4px", color: "#64748b" }}>
                    {item.documentType} | {item.documentRole} | {item.assetId ? "Asset-linked" : "Household-level"}
                  </div>
                  <div style={{ marginTop: "8px", color: "#475569" }}>
                    Status: {item.status}
                    {item.duplicate ? " | Duplicate reused" : ""}
                    {item.storagePath ? ` | ${item.storagePath}` : ""}
                  </div>
                  {item.errorSummary ? <div style={{ marginTop: "6px", color: "#991b1b" }}>{item.errorSummary}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No files queued"
              description="Add one or more files to the queue to create generic platform document records."
            />
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: "24px" }}>
        <SectionCard title="Recent Generic Uploads" subtitle="These household documents will appear in the Vault view on refresh/navigation.">
          {documentRows.length > 0 ? (
            <DocumentTable rows={documentRows} />
          ) : (
            <EmptyState
              title="No generic documents yet"
              description="Upload generic documents here to populate the broader platform vault without affecting the specialized IUL workflow."
            />
          )}
        </SectionCard>
      </div>

      {loadError ? (
        <div style={{ marginTop: "18px", color: "#991b1b" }}>{loadError}</div>
      ) : null}

      {import.meta.env.DEV ? (
        <div style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
          Upload Debug: household={householdState.context.householdId || "none"} | asset={assetId || "none"} | storageConfigured={supabaseConfigured ? "yes" : "no"} | queue={queue.length} | uploadedPaths={queue.map((item) => item.storagePath).filter(Boolean).join(", ") || "none"} | documentIds={queue.map((item) => item.documentId).filter(Boolean).join(", ") || "none"} | error={loadError || "none"}
        </div>
      ) : null}
    </div>
  );
}
