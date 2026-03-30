
import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import SectionCard from "../components/shared/SectionCard";
import SummaryPanel from "../components/shared/SummaryPanel";
import {
  buildPolicyRecord,
  buildCashValueGrowthExplanation,
  buildChargeAnalysisExplanation,
  buildStrategyReviewNote,
  buildVaultAiSummary,
  buildVaultAiPolicyExplanation,
  computeDerivedAnalytics,
  parseIllustrationDocument,
  parseStatementDocument,
  sortStatementsChronologically,
} from "../lib/parser/extractionEngine";
import { buildPolicyIntelligence } from "../lib/domain/intelligenceEngine";
import {
  buildInsuranceDocumentPacket,
  classifyPacketQuality,
  normalizeExtractionInput,
} from "../lib/domain/insurance/insuranceDocumentPacket";
import { analyzePolicyBasics } from "../lib/domain/insurance/insuranceIntelligence";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { persistVaultedPolicyAnalysis } from "../lib/supabase/vaultedPolicies";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";
import useScanSession from "../hooks/useScanSession";
import { extractDocumentText } from "../utils/documents/extractDocumentText";
import { captureDocumentPhoto, isNativeCameraAvailable } from "../utils/cameraCapture";
import { convertImageToFile } from "../utils/imageToFile";
import { analyzeScanQuality } from "../utils/ocr/analyzeScanQuality";
import { extractTextFromImage } from "../utils/ocr/extractTextFromImage";
import { preparePageForOCR } from "../utils/ocr/preparePageForOCR";
import { preprocessImageForOCR } from "../utils/ocr/preprocessImageForOCR";

function actionStyle(primary = false) {
  return {
    padding: "12px 16px",
    borderRadius: "10px",
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    cursor: "pointer",
    fontWeight: 700,
  };
}

function getConfidenceLabel(confidence) {
  if (confidence === null || confidence === undefined) return "Not applicable";
  if (confidence >= 85) return "High";
  if (confidence >= 65) return "Moderate";
  return "Low";
}

function getQualityLabel(level) {
  if (level === "good") return "Good";
  if (level === "fair") return "Fair";
  if (level === "poor") return "Poor";
  return "Pending";
}

function getQualityBadgeStyle(level) {
  if (level === "good") {
    return { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  }
  if (level === "poor") {
    return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  }
  return { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" };
}

function buildSessionFileName(label, pageCount) {
  return `${label.toLowerCase().replace(/\s+/g, "-")}-scan-${pageCount}-page${pageCount === 1 ? "" : "s"}.jpg`;
}

function buildAverageConfidence(items) {
  const values = items.filter((value) => typeof value === "number");
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function flattenDiagnostics(items, key) {
  return ensureArray(items).reduce((all, item) => {
    return [...all, ...ensureArray(item?.[key])];
  }, []);
}

function safeDevLog(label, payload) {
  if (!import.meta.env.DEV || typeof console === "undefined") {
    return;
  }

  if (typeof console.groupCollapsed === "function") {
    console.groupCollapsed(label);
    if (typeof console.log === "function") {
      console.log(payload);
    }
    if (typeof console.groupEnd === "function") {
      console.groupEnd();
    }
    return;
  }

  if (typeof console.log === "function") {
    console.log(label, payload);
  }
}

function buildStageError(stageLabel, error, fallbackMessage) {
  const baseError = error instanceof Error ? error : new Error(String(error || fallbackMessage));
  const nextError = new Error(baseError.message || fallbackMessage);
  nextError.analysisStage = stageLabel;
  nextError.cause = baseError;
  return nextError;
}

async function runAnalysisStage(stageLabel, work, fallbackMessage) {
  try {
    return await work();
  } catch (error) {
    throw buildStageError(stageLabel, error, fallbackMessage);
  }
}

function formatAnalyzeFailure(error) {
  const stageLabel = error?.analysisStage || "";
  const rawMessage = String(error?.message || "").trim();
  const normalizedMessage = rawMessage.toLowerCase();
  const extractionKind = error?.extractionKind || error?.cause?.extractionKind || "";

  if (normalizedMessage.includes("undefined is not a function")) {
    return stageLabel
      ? `Life policy analysis hit a mobile compatibility issue during ${stageLabel}. Please retry after refresh.`
      : "Life policy analysis hit a mobile compatibility issue. Please retry after refresh.";
  }

  if (extractionKind === "invalid_file") {
    return rawMessage || "Invalid or missing PDF file.";
  }

  if (extractionKind === "oversized_mobile_pdf") {
    return rawMessage || "This PDF is too large for reliable mobile processing. Try a smaller export or rescan.";
  }

  if (extractionKind === "file_read_failed" || extractionKind === "file_read_failure") {
    return "We could not read the selected PDF on this device. Try re-exporting the PDF or rescanning it if this file came from a portal.";
  }

  if (extractionKind === "pdf_open_failed" || extractionKind === "pdf_open_failure") {
    return "We could not open the baseline PDF on this device. Try re-exporting the PDF or rescanning it if this file was created from a portal.";
  }

  if (extractionKind === "page_extraction_failed" || extractionKind === "page_extraction_failure") {
    return rawMessage || "The baseline illustration could not be read from one or more pages in the selected PDF.";
  }

  if (rawMessage) {
    return stageLabel ? `${rawMessage} (${stageLabel})` : rawMessage;
  }

  return stageLabel
    ? `There was a problem during ${stageLabel}. Please retry with the same files.`
    : "There was a problem extracting or parsing one of the selected documents.";
}

function normalizeExtractionDocument(extraction, fallbackFileName = "document") {
  const packet = buildInsuranceDocumentPacket({
    source: extraction?.sourceType === "image" ? "scan" : "upload",
    pages: ensureArray(extraction?.pages).filter((page) => typeof page === "string"),
    text: typeof extraction?.text === "string" ? extraction.text : "",
    pageCount: extraction?.pageCount,
    fileName: extraction?.fileName || fallbackFileName,
    extractionMethod: extraction?.extractionMethod || "unknown",
    extractionWarnings: ensureArray(extraction?.extractionWarnings).filter(Boolean),
    pageOcr: ensureArray(extraction?.pageOcr),
    ocrConfidence: extraction?.ocrConfidence ?? null,
    metadata: {
      sourceType: extraction?.sourceType || "unknown",
    },
  });

  return {
    text: packet.text,
    pages: packet.pages,
    sourceType: packet.source === "scan" ? "image" : "pdf",
    ocrConfidence: packet.metadata.ocrConfidence ?? null,
    extractionWarnings: packet.metadata.extractionWarnings || [],
    extractionMethod: packet.metadata.extractionMethod || "unknown",
    pageCount: packet.pageCount || packet.pages.length,
    pageOcr: packet.metadata.pageOcr || [],
    fileName: packet.metadata.fileName || fallbackFileName,
  };
}

function buildAnnualStatementAnalysisInput(statementFiles, statementPages) {
  const uploadedFiles = ensureArray(statementFiles).filter(Boolean);
  const scannedPages = ensureArray(statementPages).filter((page) => page?.file);
  const input = [];

  // Normalize uploaded PDFs and scanned statement pages into one analysis packet
  // so the parser never has to care which capture path the user chose.
  uploadedFiles.forEach((file, index) => {
    input.push({
      id: `upload-${file.name}-${file.lastModified}-${index}`,
      kind: "uploaded_pdf",
      branch: "upload",
      label: file.name,
      file,
      documentCount: 1,
      pageCount: null,
    });
  });

  if (scannedPages.length > 0) {
    input.push({
      id: `scan-session-${scannedPages.length}`,
      kind: "scan_session",
      branch: "scan",
      label: `Scanned annual statement packet (${scannedPages.length} page${scannedPages.length === 1 ? "" : "s"})`,
      pages: scannedPages,
      documentCount: 1,
      pageCount: scannedPages.length,
    });
  }

  return input;
}

function ensureLifePolicyAnalyzeDependencies() {
  const requiredHelpers = [
    ["extractDocumentText", extractDocumentText],
    ["parseIllustrationDocument", parseIllustrationDocument],
    ["parseStatementDocument", parseStatementDocument],
    ["sortStatementsChronologically", sortStatementsChronologically],
    ["computeDerivedAnalytics", computeDerivedAnalytics],
  ];
  const missing = requiredHelpers.find(([, helper]) => typeof helper !== "function");

  if (missing) {
    throw new Error(
      `VaultedShield could not initialize the life-policy analyzer completely. Missing helper: ${missing[0]}.`
    );
  }
}

async function extractScanSessionDocument(pages, label, options = {}) {
  if (!pages.length) {
    throw new Error("At least one scan page is required.");
  }

  const pageResults = [];
  const extractionWarnings = [];

  if (typeof options.onStage === "function") {
    options.onStage("Preparing scan pages...", 4);
  }

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const pageNumber = index + 1;

    if (typeof options.patchPage === "function") {
      options.patchPage(page.id, { ocrStatus: "processing" });
    }

    if (typeof options.onStage === "function") {
      options.onStage("Checking scan quality...", Math.round((pageNumber / pages.length) * 12));
    }

    const quality = page.quality || (await analyzeScanQuality(page.file));
    const prepared = await preparePageForOCR(page.file, page.crop);
    const preprocessed = await preprocessImageForOCR(prepared);

    if (typeof options.patchPage === "function") {
      options.patchPage(page.id, {
        quality,
        warnings: quality.warnings || [],
        preprocessed: true,
      });
    }

    if (typeof options.onStage === "function") {
      options.onStage(`Reading page ${pageNumber} of ${pages.length}...`, 12 + Math.round((pageNumber / pages.length) * 70));
    }

    const result = await extractTextFromImage(preprocessed, (progressMessage) => {
      const progress = progressMessage?.progress || 0;
      const overall = 12 + ((index + progress) / pages.length) * 70;
      if (typeof options.onProgress === "function") {
        options.onProgress({
          phase: `Reading page ${pageNumber} of ${pages.length}...`,
          progress: Math.round(overall),
          currentFile: `Page ${pageNumber}`,
        });
      }
    });

    const warnings = [...new Set([...(quality.warnings || []), ...(result.warnings || [])])];
    extractionWarnings.push(...warnings);

    if (typeof options.patchPage === "function") {
      options.patchPage(page.id, {
        ocrStatus: result.text.trim() ? "done" : "error",
        ocrConfidence: result.confidence ?? null,
        warnings,
      });
    }

    pageResults.push({
      page_number: pageNumber,
      confidence: result.confidence ?? null,
      warnings,
      quality_level: quality.level,
      quality_score: quality.score,
      suggestions: quality.suggestions || [],
      text: result.text || "",
    });
  }

  if (typeof options.onStage === "function") {
    options.onStage("Merging extracted text...", 88);
  }

  const mergedPages = pageResults.map(
    (pageResult) => `--- PAGE ${pageResult.page_number} ---\n${pageResult.text}`.trim()
  );
  const text = mergedPages.join("\n\n");
  const ocrConfidence = buildAverageConfidence(pageResults.map((pageResult) => pageResult.confidence));

  return {
    text,
    pages: mergedPages,
    sourceType: "image",
    ocrConfidence,
    extractionWarnings: [...new Set(extractionWarnings.filter(Boolean))],
    extractionMethod: "tesseractjs",
    pageCount: pages.length,
    pageOcr: pageResults.map((pageResult) => ({
      page_number: pageResult.page_number,
      confidence: pageResult.confidence,
      warnings: pageResult.warnings,
      quality_level: pageResult.quality_level,
      quality_score: pageResult.quality_score,
    })),
    fileName: buildSessionFileName(label, pages.length),
  };
}
function ScanReview({
  title,
  description,
  pages,
  emptyMessage,
  selectedPageId,
  onSelectPage,
  onAddPage,
  onRetakePage,
  onRemovePage,
  onMovePage,
  onClearSession,
  cameraLoading,
  isMobile,
}) {
  const selectedPage = pages.find((page) => page.id === selectedPageId) || pages[0] || null;
  const quality = selectedPage?.quality;
  const qualityTone = getQualityBadgeStyle(quality?.level);

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "16px",
        border: "1px solid #e2e8f0",
        background: "#f8fafc",
        display: "grid",
        gap: "14px",
      }}
    >
      <div style={{ display: "grid", gap: "6px" }}>
        <div style={{ fontWeight: 700, color: "#0f172a" }}>{title}</div>
        <div style={{ color: "#475569", lineHeight: "1.6" }}>{description}</div>
      </div>

      {!pages.length ? (
        <div
          style={{
            padding: "18px",
            borderRadius: "14px",
            border: "1px dashed #cbd5e1",
            color: "#64748b",
            background: "#ffffff",
          }}
        >
          {emptyMessage || "No scanned pages yet. Capture the first page to start a scan session."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              gap: "10px",
              overflowX: "auto",
              paddingBottom: "4px",
            }}
          >
            {pages.map((page, index) => (
              <button
                key={page.id}
                type="button"
                onClick={() => onSelectPage(page.id)}
                style={{
                  flex: "0 0 auto",
                  width: isMobile ? "92px" : "108px",
                  padding: "8px",
                  borderRadius: "14px",
                  border: page.id === selectedPageId ? "2px solid #0f172a" : "1px solid #cbd5e1",
                  background: "#ffffff",
                  cursor: "pointer",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <img
                  src={page.previewUrl}
                  alt={`Scanned page ${index + 1}`}
                  style={{
                    width: "100%",
                    height: isMobile ? "92px" : "104px",
                    objectFit: "cover",
                    borderRadius: "10px",
                    background: "#e2e8f0",
                  }}
                />
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Page {index + 1}</div>
                {page.quality?.level ? (
                  <div
                    style={{
                      ...getQualityBadgeStyle(page.quality.level),
                      padding: "4px 8px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {getQualityLabel(page.quality.level)}
                  </div>
                ) : null}
              </button>
            ))}
          </div>

          {selectedPage ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(260px, 0.8fr)",
                gap: "14px",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  borderRadius: "16px",
                  overflow: "hidden",
                  border: "1px solid #dbe4ee",
                  background: "#ffffff",
                  minWidth: 0,
                }}
              >
                <img
                  src={selectedPage.previewUrl}
                  alt="Selected scan preview"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: isMobile ? "340px" : "500px",
                    objectFit: "contain",
                    background: "#f8fafc",
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: "12px", minWidth: 0 }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>
                    Page {pages.findIndex((page) => page.id === selectedPage.id) + 1}
                  </div>
                  <div style={{ color: "#475569", wordBreak: "break-word" }}>{selectedPage.file.name}</div>
                  <div style={{ color: "#64748b", fontSize: "14px" }}>
                    {selectedPage.width || "?"} x {selectedPage.height || "?"} px
                  </div>
                </div>

                <div
                  style={{
                    ...qualityTone,
                    padding: "10px 12px",
                    borderRadius: "12px",
                    display: "grid",
                    gap: "4px",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    Quality: {getQualityLabel(quality?.level)}{quality?.score ? ` (${quality.score}/100)` : ""}
                  </div>
                  {quality?.warnings?.map((warning, index) => (
                    <div key={`${warning}-${index}`} style={{ fontSize: "13px" }}>
                      {warning}
                    </div>
                  ))}
                </div>

                {quality?.suggestions?.length ? (
                  <div style={{ display: "grid", gap: "6px", color: "#475569" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>Suggestions</div>
                    {quality.suggestions.map((suggestion, index) => (
                      <div key={`${suggestion}-${index}`} style={{ fontSize: "14px", lineHeight: "1.6" }}>
                        {suggestion}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div style={{ color: "#475569", fontSize: "14px" }}>
                  OCR will use the full page for now. Crop support is prepared in the data model for a later manual trim tool.
                </div>

                {selectedPage.warnings?.length ? (
                  <div style={{ display: "grid", gap: "6px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>Page Warnings</div>
                    {selectedPage.warnings.map((warning, index) => (
                      <div key={`${warning}-${index}`} style={{ color: "#92400e", fontSize: "14px" }}>
                        {warning}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" onClick={onAddPage} style={actionStyle(false)}>
                    {cameraLoading ? "Opening Camera..." : "Add Another Page"}
                  </button>
                  <button type="button" onClick={() => onRetakePage(selectedPage.id)} style={actionStyle(false)}>
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={() => onMovePage(selectedPage.id, "up")}
                    disabled={pages[0]?.id === selectedPage.id}
                    style={actionStyle(false)}
                  >
                    Move Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onMovePage(selectedPage.id, "down")}
                    disabled={pages[pages.length - 1]?.id === selectedPage.id}
                    style={actionStyle(false)}
                  >
                    Move Down
                  </button>
                  <button type="button" onClick={() => onRemovePage(selectedPage.id)} style={actionStyle(false)}>
                    Remove
                  </button>
                  <button type="button" onClick={onClearSession} style={actionStyle(false)}>
                    Clear Session
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function LifePolicyUploadPage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const { debug } = usePlatformShellData();
  const nativeCameraAvailable = isNativeCameraAvailable();
  const illustrationCameraInputRef = useRef(null);
  const statementCameraInputRef = useRef(null);
  const [illustrationFile, setIllustrationFile] = useState(null);
  const [statementFiles, setStatementFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState(null);
  const [cameraLoadingTarget, setCameraLoadingTarget] = useState("");
  const [selectedIllustrationPageId, setSelectedIllustrationPageId] = useState(null);
  const [selectedStatementPageId, setSelectedStatementPageId] = useState(null);
  const [pendingReplacement, setPendingReplacement] = useState({ target: "", pageId: null });
  const [extractionStatus, setExtractionStatus] = useState({
    phase: "",
    progress: 0,
    currentFile: "",
    detail: "",
  });
  const [documentDiagnostics, setDocumentDiagnostics] = useState({
    illustration: null,
    statements: [],
  });
  const [qualityNotice, setQualityNotice] = useState("");

  const illustrationScan = useScanSession();
  const statementScan = useScanSession();
  const normalizedStatementInput = useMemo(
    () => buildAnnualStatementAnalysisInput(statementFiles, statementScan.pages),
    [statementFiles, statementScan.pages]
  );
  const uploadedStatementFiles = useMemo(() => ensureArray(statementFiles).filter(Boolean), [statementFiles]);
  const statementScanPages = useMemo(() => ensureArray(statementScan.pages).filter((page) => page?.file), [statementScan.pages]);
  const hasBaselineInput = Boolean(illustrationFile) || illustrationScan.hasPages;
  const hasStatementPacketGap = uploadedStatementFiles.length > 0 && normalizedStatementInput.length === 0;

  useEffect(() => {
    setIllustrationFile(null);
    setStatementFiles([]);
    setLoading(false);
    setLoadingMessage("");
    setError("");
    setSaveStatus(null);
    setCameraLoadingTarget("");
    setSelectedIllustrationPageId(null);
    setSelectedStatementPageId(null);
    setPendingReplacement({ target: "", pageId: null });
    setExtractionStatus({ phase: "", progress: 0, currentFile: "", detail: "" });
    setDocumentDiagnostics({ illustration: null, statements: [] });
    setQualityNotice("");
    illustrationScan.clearSession();
    statementScan.clearSession();
  }, [debug.authUserId, debug.householdId]);

  useEffect(() => {
    if (!selectedIllustrationPageId && illustrationScan.pages[0]) {
      setSelectedIllustrationPageId(illustrationScan.pages[0].id);
    }
    if (selectedIllustrationPageId && !illustrationScan.pages.some((page) => page.id === selectedIllustrationPageId)) {
      setSelectedIllustrationPageId(illustrationScan.pages[0]?.id || null);
    }
  }, [illustrationScan.pages, selectedIllustrationPageId]);

  useEffect(() => {
    if (!selectedStatementPageId && statementScan.pages[0]) {
      setSelectedStatementPageId(statementScan.pages[0].id);
    }
    if (selectedStatementPageId && !statementScan.pages.some((page) => page.id === selectedStatementPageId)) {
      setSelectedStatementPageId(statementScan.pages[0]?.id || null);
    }
  }, [statementScan.pages, selectedStatementPageId]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    safeDevLog("[VaultedShield] life policy annual statement input", {
      selectedFiles: uploadedStatementFiles.length,
      scanSessionPages: statementScanPages.length,
      normalizedInputCount: normalizedStatementInput.length,
      branches: normalizedStatementInput.map((item) => item.branch).join(", ") || "none",
      selectedFileNames: uploadedStatementFiles.map((file) => file.name),
      scanSessionState: statementScanPages.map((page) => ({ id: page.id, fileName: page.file?.name || null })),
      normalizedAnalysisInput: normalizedStatementInput,
    });
  }, [normalizedStatementInput, statementScanPages, uploadedStatementFiles]);

  const summaryItems = useMemo(
    () => [
      {
        label: "Initial Policy File",
        value: illustrationFile || illustrationScan.hasPages ? 1 : 0,
        helper: illustrationFile
          ? illustrationFile.name
          : illustrationScan.hasPages
            ? `${illustrationScan.pages.length} scanned page${illustrationScan.pages.length === 1 ? "" : "s"} ready`
            : "Upload the baseline illustration or scan the policy pages first",
      },
      {
        label: "Yearly Statements",
        value: statementFiles.length + (statementScan.hasPages ? 1 : 0),
        helper:
          statementFiles.length + (statementScan.hasPages ? 1 : 0) > 0
            ? `${statementFiles.length} PDF file${statementFiles.length === 1 ? "" : "s"} and ${statementScan.hasPages ? `${statementScan.pages.length} scanned page${statementScan.pages.length === 1 ? "" : "s"}` : "no scanned statement pages"} queued`
            : "Upload annual statement PDFs or build one scanned statement packet",
      },
      {
        label: "Ready To Analyze",
        value: illustrationFile || illustrationScan.hasPages ? "Yes" : "No",
        helper: illustrationFile || illustrationScan.hasPages
          ? "VaultedShield can now parse the baseline file and attach statement history."
          : "The baseline illustration/policy file is required before analysis can run.",
      },
    ],
    [illustrationFile, illustrationScan.hasPages, illustrationScan.pages.length, statementFiles, statementScan.hasPages, statementScan.pages.length]
  );

  function handleIllustrationFileChange(event) {
    const file = event.target.files?.[0] || null;
    setIllustrationFile(file);
    if (file && illustrationScan.hasPages) {
      illustrationScan.clearSession();
      setSelectedIllustrationPageId(null);
    }
  }
  async function addScannedPage(target, file, source = "picker", replacePageId = null) {
    const scanSession = target === "illustration" ? illustrationScan : statementScan;
    const setSelected = target === "illustration" ? setSelectedIllustrationPageId : setSelectedStatementPageId;

    if (target === "illustration" && illustrationFile) {
      setIllustrationFile(null);
    }

    let pageId = replacePageId;
    if (replacePageId) {
      await scanSession.replacePage(replacePageId, file, source);
    } else {
      const page = await scanSession.addPage(file, source);
      pageId = page.id;
    }

    setSelected(pageId);

    try {
      const quality = await analyzeScanQuality(file);
      scanSession.patchPage(pageId, {
        quality,
        warnings: quality.warnings || [],
      });
    } catch {
      scanSession.patchPage(pageId, {
        quality: {
          score: 70,
          level: "fair",
          warnings: ["Quality analysis could not complete for this page."],
          suggestions: ["Proceed with OCR or retake the scan if text looks weak."],
        },
        warnings: ["Quality analysis could not complete for this page."],
      });
    }
  }

  async function handleCameraCapture(target = "illustration", replacePageId = null) {
    setError("");
    setCameraLoadingTarget(target);
    setPendingReplacement({ target, pageId: replacePageId });

    try {
      if (!nativeCameraAvailable) {
        if (target === "illustration") {
          illustrationCameraInputRef.current?.click();
        } else {
          statementCameraInputRef.current?.click();
        }
        return;
      }

      const image = await captureDocumentPhoto();
      const file = await convertImageToFile(image);
      await addScannedPage(target, file, "camera", replacePageId);
    } catch (captureError) {
      setError(captureError?.message || "Camera capture failed.");
    } finally {
      setCameraLoadingTarget("");
      setPendingReplacement({ target: "", pageId: null });
    }
  }

  async function handleCapturedFileSelection(event, target = "illustration") {
    const file = event.target.files?.[0] || null;
    const replacementId =
      pendingReplacement.target === target ? pendingReplacement.pageId || null : null;

    if (!file) {
      event.target.value = "";
      return;
    }

    try {
      await addScannedPage(target, file, "picker", replacementId);
    } finally {
      setPendingReplacement({ target: "", pageId: null });
      event.target.value = "";
    }
  }

  async function handleAnalyzeAndSave() {
    // Guard baseline requirements before we build any statement packet or start parsing.
    if (!hasBaselineInput) {
      setError("Please upload the initial illustration or policy PDF first.");
      return;
    }

    if (hasStatementPacketGap) {
      setError("We found statement files, but could not prepare them for analysis. Please retry or re-upload the PDF.");
      return;
    }

    try {
      ensureLifePolicyAnalyzeDependencies();
      setLoading(true);
      setLoadingMessage("Preparing document extraction...");
      setError("");
      setQualityNotice("");
      setSaveStatus(null);
      setDocumentDiagnostics({ illustration: null, statements: [] });

      let illustrationExtraction;
      let illustrationPersistenceFile = illustrationFile;

      if (illustrationFile) {
        illustrationExtraction = normalizeExtractionDocument(
          await runAnalysisStage(
            "baseline extraction",
            () =>
              extractDocumentText(illustrationFile, {
                onProgress: (progressMessage) => {
                  setExtractionStatus({
                    phase:
                      illustrationFile.type?.startsWith("image/")
                        ? "Reading text from image..."
                        : "Reading PDF text...",
                    progress: Math.round((progressMessage?.progress || 0) * 100),
                    currentFile: illustrationFile.name,
                    detail: "",
                  });
                },
              }),
            "We could not extract the initial policy PDF."
          ),
          illustrationFile.name
        );
      } else {
        illustrationPersistenceFile = null;
        illustrationExtraction = normalizeExtractionDocument(
          await runAnalysisStage(
            "baseline scan extraction",
            () =>
              extractScanSessionDocument(illustrationScan.pages, "Initial Policy", {
                patchPage: illustrationScan.patchPage,
                onStage: (phase, progress) => {
                  setExtractionStatus({
                    phase,
                    progress,
                    currentFile: "Initial policy scan session",
                    detail: `${illustrationScan.pages.length} page${illustrationScan.pages.length === 1 ? "" : "s"}`,
                  });
                },
                onProgress: setExtractionStatus,
              }),
            "We could not extract the scanned initial policy pages."
          ),
          "initial-policy-scan.jpg"
        );
      }

      const baselinePacket = normalizeExtractionInput(
        buildInsuranceDocumentPacket({
          source: illustrationExtraction.sourceType === "image" ? "scan" : "upload",
          pages: illustrationExtraction.pages,
          text: illustrationExtraction.text,
          pageCount: illustrationExtraction.pageCount,
          fileName: illustrationExtraction.fileName,
          extractionMethod: illustrationExtraction.extractionMethod,
          extractionWarnings: illustrationExtraction.extractionWarnings,
          pageOcr: illustrationExtraction.pageOcr,
          ocrConfidence: illustrationExtraction.ocrConfidence,
        })
      );
      const baselinePacketQuality = classifyPacketQuality(baselinePacket);

      if (baselinePacket.pageCount === 0) {
        throw new Error("No policy pages were ready for analysis.");
      }

      if (!baselinePacket.text.trim()) {
        throw new Error(
          "We could not reliably read this scan. Retake the photo in better lighting, flatter angle, and closer crop."
        );
      }

      if (baselinePacketQuality.isLowQuality) {
        setQualityNotice("Low-quality document detected. Analysis can continue, but confidence may be limited.");
      }

      setLoadingMessage("Analyzing policy data...");
      const baseline = await runAnalysisStage("baseline parsing", () => Promise.resolve(parseIllustrationDocument({
        pages: baselinePacket.pages,
        fileName: illustrationFile?.name || illustrationExtraction.fileName || "initial-policy-scan.jpg",
      })), "We could not parse the initial policy document.");
      baseline.extractionMeta = {
        source_type: illustrationExtraction.sourceType,
        ocr_confidence: illustrationExtraction.ocrConfidence,
        extraction_method: illustrationExtraction.extractionMethod,
        extraction_warnings: illustrationExtraction.extractionWarnings,
        page_count: illustrationExtraction.pageCount || illustrationExtraction.pages.length,
        page_ocr: illustrationExtraction.pageOcr || [],
      };

      const statementResults = [];
      const statementPersistenceFiles = [];
      const statementDiagnostics = [];

      if (import.meta.env.DEV) {
        safeDevLog("[VaultedShield] life policy analysis branch selection", {
          baselineBranch: illustrationFile ? "upload" : "scan",
          statementBranches: normalizedStatementInput.map((item) => item.branch),
          statementDocumentCount: normalizedStatementInput.length,
        });
      }

      for (const input of normalizedStatementInput) {
        // Branch by normalized packet source, but always converge back into the
        // same extraction + parse shape before statement analysis continues.
        let extraction;
        let fileName = input.label;
        let persistenceFile = null;

        if (input.branch === "upload" && input.file) {
          setLoadingMessage(`Extracting ${input.file.name}...`);
          extraction = normalizeExtractionDocument(
            await runAnalysisStage(
              `statement extraction: ${input.file.name}`,
              () =>
                extractDocumentText(input.file, {
                  onProgress: (progressMessage) => {
                    setExtractionStatus({
                      phase:
                        input.file.type?.startsWith("image/")
                          ? "Reading text from image..."
                          : "Reading PDF text...",
                      progress: Math.round((progressMessage?.progress || 0) * 100),
                      currentFile: input.file.name,
                      detail: "",
                    });
                  },
                }),
              `We could not extract ${input.file.name}.`
            ),
            input.file.name
          );
          fileName = input.file.name;
          persistenceFile = input.file;
        } else if (input.branch === "scan" && input.pages?.length) {
          extraction = normalizeExtractionDocument(
            await runAnalysisStage(
              "statement scan extraction",
              () =>
                extractScanSessionDocument(input.pages, "Annual Statement", {
                  patchPage: statementScan.patchPage,
                  onStage: (phase, progress) => {
                    setExtractionStatus({
                      phase,
                      progress,
                      currentFile: "Annual statement scan session",
                      detail: `${input.pages.length} page${input.pages.length === 1 ? "" : "s"}`,
                    });
                  },
                  onProgress: setExtractionStatus,
                }),
              "We could not extract the scanned annual statement pages."
            ),
            buildSessionFileName("Annual Statement", input.pages.length)
          );
          fileName = extraction.fileName;
        } else {
          throw new Error("No annual statement pages are ready for analysis.");
        }

        const normalizedPacket = normalizeExtractionInput(
          buildInsuranceDocumentPacket({
            source: extraction.sourceType === "image" ? "scan" : "upload",
            pages: extraction.pages,
            text: extraction.text,
            pageCount: extraction.pageCount,
            fileName,
            extractionMethod: extraction.extractionMethod,
            extractionWarnings: extraction.extractionWarnings,
            pageOcr: extraction.pageOcr,
            ocrConfidence: extraction.ocrConfidence,
          })
        );
        const packetQuality = classifyPacketQuality(normalizedPacket);

        if (normalizedPacket.pageCount === 0) {
          throw new Error("No annual statement pages are ready for analysis.");
        }

        if (!normalizedPacket.text.trim()) {
          throw new Error(
            input.branch === "scan"
              ? "We could not reliably read the scanned annual statement pages. Retake the photo in better lighting, flatter angle, and closer crop."
              : `We found statement files, but could not prepare them for analysis. Please retry or re-upload the PDF.`
          );
        }

        if (packetQuality.isLowQuality) {
          setQualityNotice("Low-quality document detected. Analysis can continue, but confidence may be limited.");
        }

        setLoadingMessage(`Parsing ${fileName}...`);
        const statement = await runAnalysisStage(`statement parsing: ${fileName}`, () => Promise.resolve(parseStatementDocument({
          pages: normalizedPacket.pages,
          fileName,
        })), `We could not parse ${fileName}.`);
        if (!statement || typeof statement !== "object") {
          throw new Error(`VaultedShield could not parse ${fileName} into a statement result.`);
        }

        statement.extractionMeta = {
          source_type: extraction.sourceType,
          ocr_confidence: extraction.ocrConfidence,
          extraction_method: extraction.extractionMethod,
          extraction_warnings: extraction.extractionWarnings,
          page_count: extraction.pageCount || extraction.pages.length,
          page_ocr: extraction.pageOcr || [],
        };
        statementResults.push(statement);
        statementPersistenceFiles.push(persistenceFile);
        statementDiagnostics.push({
          fileName: statement.fileName,
          sourceType: statement.extractionMeta?.source_type || "pdf",
          ocrConfidence: statement.extractionMeta?.ocr_confidence ?? null,
          extractionWarnings: statement.extractionMeta?.extraction_warnings || [],
          pageCount: statement.extractionMeta?.page_count || statement.pages?.length || 0,
          pageOcr: statement.extractionMeta?.page_ocr || [],
        });
      }

      setDocumentDiagnostics({
        illustration: {
          fileName: illustrationFile?.name || illustrationExtraction.fileName || "Initial policy scan session",
          sourceType: illustrationExtraction.sourceType,
          ocrConfidence: illustrationExtraction.ocrConfidence,
          extractionWarnings: illustrationExtraction.extractionWarnings,
          pageCount: illustrationExtraction.pageCount || illustrationExtraction.pages.length,
          pageOcr: illustrationExtraction.pageOcr || [],
        },
        statements: statementDiagnostics,
      });

      const sortedStatements = sortStatementsChronologically(ensureArray(statementResults));
      setLoadingMessage("Computing policy analytics...");
      const analytics = await runAnalysisStage("analytics computation", () => Promise.resolve(computeDerivedAnalytics(baseline, sortedStatements)), "We could not compute policy analytics from the uploaded files.");
      const vaultAiSummary = await runAnalysisStage("vault summary generation", () => Promise.resolve(buildVaultAiSummary(baseline, sortedStatements, analytics)), "We could not generate the policy summary from the uploaded files.");
      await runAnalysisStage("growth explanation", () => Promise.resolve(buildCashValueGrowthExplanation(baseline, sortedStatements, analytics)), "We could not build the growth explanation.");
      await runAnalysisStage("charge explanation", () => Promise.resolve(buildChargeAnalysisExplanation(sortedStatements, analytics)), "We could not build the charge explanation.");
      await runAnalysisStage("strategy review", () => Promise.resolve(buildStrategyReviewNote(sortedStatements, analytics)), "We could not build the strategy review.");
      await runAnalysisStage("policy explanation", () => Promise.resolve(buildVaultAiPolicyExplanation(baseline, sortedStatements, analytics)), "We could not build the policy explanation.");
      await runAnalysisStage("policy record assembly", () => Promise.resolve(buildPolicyRecord({
        baseline,
        statements: sortedStatements,
        vaultAiSummary,
      })), "We could not assemble the policy record from the extracted data.");

      const intelligence = await runAnalysisStage("intelligence assembly", () => Promise.resolve(buildPolicyIntelligence({
        baseline,
        statements: sortedStatements,
        legacyAnalytics: analytics,
        vaultAiSummary,
      })), "We could not assemble the insurance intelligence output.");
      const basicPolicyAnalysis = analyzePolicyBasics({
        normalizedPolicy: intelligence.normalizedPolicy,
        normalizedAnalytics: intelligence.normalizedAnalytics,
        comparisonSummary: intelligence.normalizedAnalytics?.comparison_summary || null,
        statements: sortedStatements,
      });

      setLoadingMessage("Saving policy record...");
      const persistenceStatus = await runAnalysisStage("policy persistence", () => persistVaultedPolicyAnalysis({
        normalizedPolicy: intelligence.normalizedPolicy,
        normalizedAnalytics: intelligence.normalizedAnalytics,
        completenessAssessment: intelligence.completenessAssessment,
        carrierProfile: intelligence.carrierProfile,
        productProfile: intelligence.productProfile,
        strategyReferenceHits: intelligence.strategyReferenceHits,
        baseline,
        statements: sortedStatements,
        illustrationFile: illustrationPersistenceFile,
        statementFiles: statementPersistenceFiles,
        scopeOverride: {
          userId: debug.authUserId,
          householdId: debug.householdId,
          ownershipMode: debug.ownershipMode,
          guestFallbackActive: debug.sharedFallbackActive,
          source: "life_policy_upload_page",
        },
      }), "We could not save the analyzed policy record.");

      setSaveStatus({
        succeeded: Boolean(persistenceStatus?.succeeded),
        policyId: persistenceStatus?.policyId || null,
        partialPolicyCreated: Boolean(persistenceStatus?.partialPolicyCreated),
        failedStep: persistenceStatus?.failedStep || "",
        lastCompletedStep: persistenceStatus?.lastCompletedStep || "",
        stepResults: persistenceStatus?.stepResults || null,
        carrier:
          intelligence.normalizedPolicy?.policy_identity?.carrier_name ||
          baseline.summary?.carrier ||
          "Carrier pending",
        product:
          intelligence.normalizedPolicy?.policy_identity?.product_name ||
          intelligence.normalizedPolicy?.policy_identity?.policy_type ||
          "Life policy",
        statementCount: sortedStatements.length,
        errorSummary: persistenceStatus?.errorSummary || "",
        basicPolicyAnalysis,
      });
    } catch (analysisError) {
      if (import.meta.env.DEV) {
        safeDevLog("[VaultedShield] life policy analysis failure", {
          stage: analysisError?.analysisStage || "unknown",
          message: analysisError?.message || null,
          stack: analysisError?.stack || null,
          causeMessage: analysisError?.cause?.message || null,
        });
      }
      setError(formatAnalyzeFailure(analysisError));
    } finally {
      setLoading(false);
      setLoadingMessage("");
      setExtractionStatus({ phase: "", progress: 0, currentFile: "", detail: "" });
    }
  }

  function handleStatementFilesChange(event) {
    setStatementFiles(ensureArray(Array.from(event.target.files || [])));
  }

  function handleClearSession(target) {
    const scanSession = target === "illustration" ? illustrationScan : statementScan;
    if (!scanSession.hasPages) {
      return;
    }
    if (!window.confirm("Clear this scan session? All scanned pages in the tray will be removed.")) {
      return;
    }
    scanSession.clearSession();
    if (target === "illustration") {
      setSelectedIllustrationPageId(null);
    } else {
      setSelectedStatementPageId(null);
    }
  }

  const hasAnyFiles =
    Boolean(illustrationFile) ||
    Boolean(statementFiles.length) ||
    illustrationScan.hasPages ||
    statementScan.hasPages;

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <PageHeader
        eyebrow="Life Policy Intelligence"
        title="Life Policy Upload Workspace"
        description="Start with the initial policy illustration, then add annual statements separately to build performance history and a stronger current read."
        actions={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
            <button type="button" onClick={() => onNavigate?.("/insurance/life/policy-detail")} style={actionStyle(false)}>
              Back To Life Policy Portal
            </button>
            <button type="button" onClick={() => onNavigate?.("/insurance")} style={actionStyle(false)}>
              Open Insurance Intelligence
            </button>
          </div>
        }
      />

      <SummaryPanel items={summaryItems} />

      <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "18px" }}>
        <SectionCard
          title="1. Initial Policy / Illustration Upload"
          subtitle="Upload the original illustration or baseline policy PDF first."
        >
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              This establishes the policy identity, original design assumptions, issue date, death benefit, and illustration structure.
            </div>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleIllustrationFileChange}
              style={{ width: "100%", maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff" }}
            />
            <input
              ref={illustrationCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(event) => handleCapturedFileSelection(event, "illustration")}
            />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleCameraCapture("illustration")}
                disabled={cameraLoadingTarget === "illustration"}
                style={actionStyle(false)}
              >
                {cameraLoadingTarget === "illustration" ? "Opening Camera..." : "Scan Initial Policy"}
              </button>
              {illustrationScan.hasPages ? (
                <button type="button" onClick={() => handleClearSession("illustration")} style={actionStyle(false)}>
                  Clear Scan Session
                </button>
              ) : null}
            </div>
            {illustrationFile ? (
              <div style={{ display: "grid", gap: "6px" }}>
                <div style={{ color: "#0f172a", fontWeight: 600, wordBreak: "break-word" }}>{illustrationFile.name}</div>
                <div style={{ color: "#64748b", fontSize: "14px" }}>
                  PDF upload path stays unchanged. Use scan mode only when you need OCR from photos.
                </div>
              </div>
            ) : (
              <div style={{ color: "#64748b" }}>
                {illustrationScan.hasPages
                  ? `${illustrationScan.pages.length} scanned page${illustrationScan.pages.length === 1 ? "" : "s"} ready for OCR.`
                  : "No initial policy file selected yet."}
              </div>
            )}

            <ScanReview
              title="Initial Policy Scan Session"
              description="Capture one or more pages, review order, and retake weak scans before analysis."
              pages={illustrationScan.pages}
              selectedPageId={selectedIllustrationPageId}
              onSelectPage={setSelectedIllustrationPageId}
              onAddPage={() => handleCameraCapture("illustration")}
              onRetakePage={(pageId) => handleCameraCapture("illustration", pageId)}
              onRemovePage={illustrationScan.removePage}
              onMovePage={illustrationScan.movePage}
              onClearSession={() => handleClearSession("illustration")}
              cameraLoading={cameraLoadingTarget === "illustration"}
              isMobile={isMobile}
            />
          </div>
        </SectionCard>
        <SectionCard
          title="2. Annual Statement History Upload"
          subtitle="Upload yearly statement PDFs separately after the baseline file."
        >
          <div style={{ display: "grid", gap: "14px" }}>
            <div style={{ color: "#475569", lineHeight: "1.7" }}>
              Add annual statements, charge pages, and allocation pages to improve trend history, charge visibility, and current policy interpretation.
            </div>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleStatementFilesChange}
              style={{ width: "100%", maxWidth: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff" }}
            />
            <input
              ref={statementCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(event) => handleCapturedFileSelection(event, "statement")}
            />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleCameraCapture("statement")}
                disabled={cameraLoadingTarget === "statement"}
                style={actionStyle(false)}
              >
                {cameraLoadingTarget === "statement" ? "Opening Camera..." : "Scan Annual Statement"}
              </button>
              {statementScan.hasPages ? (
                <button type="button" onClick={() => handleClearSession("statement")} style={actionStyle(false)}>
                  Clear Statement Scan
                </button>
              ) : null}
            </div>
            {uploadedStatementFiles.length > 0 ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {uploadedStatementFiles.map((file) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}`} style={{ display: "grid", gap: "4px" }}>
                    <div style={{ color: "#0f172a", fontWeight: 600, wordBreak: "break-word" }}>
                      {file.name}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#64748b" }}>
                {statementScan.hasPages
                  ? `${statementScan.pages.length} scanned statement page${statementScan.pages.length === 1 ? "" : "s"} ready.`
                  : "No annual statements selected yet. Upload PDF statements or scan pages to prepare a statement packet."}
              </div>
            )}

            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid #dbe4ee",
                background: normalizedStatementInput.length > 0 ? "#f8fafc" : "#ffffff",
                display: "grid",
                gap: "6px",
              }}
            >
              <div style={{ fontWeight: 700, color: "#0f172a" }}>Annual Statement Analysis Packet</div>
              <div style={{ color: "#475569", lineHeight: "1.6" }}>
                {normalizedStatementInput.length > 0
                  ? `${normalizedStatementInput.length} annual statement input${normalizedStatementInput.length === 1 ? "" : "s"} ready for analysis.`
                  : "No annual statement pages are ready for analysis yet."}
              </div>
              {normalizedStatementInput.length > 0 ? (
                <div style={{ color: "#64748b", fontSize: "14px" }}>
                  {normalizedStatementInput.map((item) => item.label).join(" | ")}
                </div>
              ) : null}
              {uploadedStatementFiles.length > 0 ? (
                <div style={{ color: "#64748b", fontSize: "14px" }}>
                  Uploaded PDF statements are ready for analysis. Camera scanning is optional for pages you cannot upload cleanly.
                </div>
              ) : null}
            </div>

            <ScanReview
              title="Annual Statement Scan Session"
              description="Build one scanned statement packet, reorder pages, and proceed even if quality is fair. Uploaded PDFs feed the same analysis packet above, so camera scanning is optional."
              pages={statementScan.pages}
              emptyMessage={
                uploadedStatementFiles.length > 0
                  ? "No scanned pages yet. Uploaded PDF statements are still ready for analysis."
                  : undefined
              }
              selectedPageId={selectedStatementPageId}
              onSelectPage={setSelectedStatementPageId}
              onAddPage={() => handleCameraCapture("statement")}
              onRetakePage={(pageId) => handleCameraCapture("statement", pageId)}
              onRemovePage={statementScan.removePage}
              onMovePage={statementScan.movePage}
              onClearSession={() => handleClearSession("statement")}
              cameraLoading={cameraLoadingTarget === "statement"}
              isMobile={isMobile}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Analyze And Save"
        subtitle="Run the current carrier-aware life-policy parser and save the result into the vaulted policy workflow."
      >
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleAnalyzeAndSave}
            disabled={loading || !hasBaselineInput || hasStatementPacketGap}
            style={actionStyle(true)}
          >
            {loading ? "Analyzing Policy..." : "Analyze Statement Packet"}
          </button>
          {saveStatus?.succeeded && saveStatus.policyId ? (
            <button
              type="button"
              onClick={() => onNavigate?.(`/insurance/${saveStatus.policyId}`)}
              style={actionStyle(false)}
            >
              Open Saved Policy
            </button>
          ) : null}
        </div>

        {loadingMessage ? (
          <div style={{ marginTop: "14px", display: "grid", gap: "6px", color: "#475569" }}>
            <div>{loadingMessage}</div>
            {extractionStatus.phase ? (
              <div>
                {extractionStatus.phase}
                {extractionStatus.currentFile ? ` | ${extractionStatus.currentFile}` : ""}
                {extractionStatus.detail ? ` | ${extractionStatus.detail}` : ""}
                {extractionStatus.progress > 0 ? ` | ${extractionStatus.progress}%` : ""}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <div style={{ marginTop: "14px", color: "#991b1b" }}>{error}</div> : null}
        {qualityNotice ? <div style={{ marginTop: "14px", color: "#92400e" }}>{qualityNotice}</div> : null}

        {!hasBaselineInput ? (
          <div style={{ marginTop: "14px", color: "#475569" }}>
            Upload the initial illustration or policy document before analysis can run.
          </div>
        ) : null}
        {hasStatementPacketGap ? (
          <div style={{ marginTop: "14px", color: "#9a3412" }}>
            We found uploaded files, but they were not converted into an analysis packet.
          </div>
        ) : null}

        {(documentDiagnostics.illustration || documentDiagnostics.statements.length > 0) ? (
          <div
            style={{
              marginTop: "16px",
              padding: "14px 16px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              display: "grid",
              gap: "10px",
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a" }}>Extraction Status</div>
            {documentDiagnostics.illustration ? (
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                <strong>Initial Policy:</strong> {documentDiagnostics.illustration.fileName} | {documentDiagnostics.illustration.sourceType}
                {documentDiagnostics.illustration.sourceType === "image"
                  ? ` | OCR ${getConfidenceLabel(documentDiagnostics.illustration.ocrConfidence)}`
                  : ""}
                {documentDiagnostics.illustration.pageCount ? ` | ${documentDiagnostics.illustration.pageCount} page${documentDiagnostics.illustration.pageCount === 1 ? "" : "s"}` : ""}
              </div>
            ) : null}
            {documentDiagnostics.statements.map((item) => (
              <div key={item.fileName} style={{ color: "#475569", lineHeight: "1.7" }}>
                <strong>Statement:</strong> {item.fileName} | {item.sourceType}
                {item.sourceType === "image" ? ` | OCR ${getConfidenceLabel(item.ocrConfidence)}` : ""}
                {item.pageCount ? ` | ${item.pageCount} page${item.pageCount === 1 ? "" : "s"}` : ""}
              </div>
            ))}
            {flattenDiagnostics(
              [documentDiagnostics.illustration, ...documentDiagnostics.statements].filter(Boolean),
              "pageOcr"
            )
              .map((pageOcr) => (
                <div key={`${pageOcr.page_number}-${pageOcr.quality_level}-${pageOcr.confidence ?? "na"}`} style={{ color: "#64748b", fontSize: "14px" }}>
                  Page {pageOcr.page_number}: {getQualityLabel(pageOcr.quality_level)} quality
                  {typeof pageOcr.confidence === "number" ? ` | OCR ${getConfidenceLabel(pageOcr.confidence)}` : ""}
                </div>
              ))}
            {flattenDiagnostics(
              [documentDiagnostics.illustration, ...documentDiagnostics.statements].filter(Boolean),
              "extractionWarnings"
            )
              .filter(Boolean)
              .map((warning, index) => (
                <div key={`${warning}-${index}`} style={{ color: "#92400e", fontSize: "14px" }}>
                  {warning}
                </div>
              ))}
          </div>
        ) : null}

        {saveStatus ? (
          <div
            style={{
              marginTop: "16px",
              padding: "clamp(14px, 3vw, 16px)",
              borderRadius: "14px",
              background: saveStatus.succeeded ? "#f0fdf4" : "#fff7ed",
              border: saveStatus.succeeded ? "1px solid #bbf7d0" : "1px solid #fed7aa",
              display: "grid",
              gap: "8px",
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {saveStatus.succeeded
                ? "Policy saved successfully."
                : saveStatus.partialPolicyCreated
                  ? "Policy record was created, but downstream save steps were blocked."
                  : "Policy save needs review."}
            </div>
            <div style={{ color: "#475569", wordBreak: "break-word" }}>
              {saveStatus.product} | {saveStatus.carrier}
            </div>
            <div style={{ color: "#475569" }}>
              Annual statements processed: {saveStatus.statementCount}
            </div>
            {saveStatus.basicPolicyAnalysis ? (
              <div style={{ color: "#475569", lineHeight: "1.7" }}>
                Confidence: {Math.round((saveStatus.basicPolicyAnalysis.confidenceScore || 0) * 100)}% | Funding: {saveStatus.basicPolicyAnalysis.fundingPattern} | COI trend: {saveStatus.basicPolicyAnalysis.coiTrend}
              </div>
            ) : null}
            {saveStatus.failedStep ? <div style={{ color: "#9a3412" }}>Failed step: {saveStatus.failedStep}</div> : null}
            {saveStatus.errorSummary ? <div style={{ color: "#9a3412" }}>{saveStatus.errorSummary}</div> : null}
            {import.meta.env.DEV && saveStatus.stepResults ? (
              <div
                style={{
                  marginTop: "8px",
                  padding: "12px",
                  borderRadius: "12px",
                  background: "#0f172a",
                  color: "#e2e8f0",
                  overflowX: "auto",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "8px" }}>Dev Save Diagnostics</div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: "12px",
                    lineHeight: 1.6,
                  }}
                >
                  {JSON.stringify(
                    {
                      policyId: saveStatus.policyId,
                      partialPolicyCreated: saveStatus.partialPolicyCreated,
                      lastCompletedStep: saveStatus.lastCompletedStep,
                      failedStep: saveStatus.failedStep,
                      stepResults: saveStatus.stepResults,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {!hasAnyFiles ? (
        <EmptyState
          title="No life-policy files loaded yet"
          description="Start with the initial illustration or policy PDF, then add yearly statements in the separate statement section."
        />
      ) : null}
    </div>
  );
}
