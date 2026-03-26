
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
          No scanned pages yet. Capture the first page to start a scan session.
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

  const illustrationScan = useScanSession();
  const statementScan = useScanSession();

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
    if (!illustrationFile && !illustrationScan.hasPages) {
      setError("Please upload the initial illustration or policy PDF first.");
      return;
    }

    try {
      setLoading(true);
      setLoadingMessage("Preparing document extraction...");
      setError("");
      setSaveStatus(null);
      setDocumentDiagnostics({ illustration: null, statements: [] });

      let illustrationExtraction;
      let illustrationPersistenceFile = illustrationFile;

      if (illustrationFile) {
        illustrationExtraction = await extractDocumentText(illustrationFile, {
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
        });
      } else {
        illustrationPersistenceFile = null;
        illustrationExtraction = await extractScanSessionDocument(illustrationScan.pages, "Initial Policy", {
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
        });
      }

      if (!illustrationExtraction.text.trim()) {
        throw new Error(
          "We could not reliably read this scan. Retake the photo in better lighting, flatter angle, and closer crop."
        );
      }

      setLoadingMessage("Analyzing policy data...");
      const baseline = parseIllustrationDocument({
        pages: illustrationExtraction.pages,
        fileName: illustrationFile?.name || illustrationExtraction.fileName || "initial-policy-scan.jpg",
      });
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

      for (const file of statementFiles) {
        setLoadingMessage(`Extracting ${file.name}...`);
        const extraction = await extractDocumentText(file, {
          onProgress: (progressMessage) => {
            setExtractionStatus({
              phase:
                file.type?.startsWith("image/")
                  ? "Reading text from image..."
                  : "Reading PDF text...",
              progress: Math.round((progressMessage?.progress || 0) * 100),
              currentFile: file.name,
              detail: "",
            });
          },
        });

        if (!extraction.text.trim()) {
          throw new Error(
            `We could not reliably read ${file.name}. Retake the photo in better lighting, flatter angle, and closer crop.`
          );
        }

        setLoadingMessage(`Parsing ${file.name}...`);
        const statement = parseStatementDocument({
          pages: extraction.pages,
          fileName: file.name,
        });
        statement.extractionMeta = {
          source_type: extraction.sourceType,
          ocr_confidence: extraction.ocrConfidence,
          extraction_method: extraction.extractionMethod,
          extraction_warnings: extraction.extractionWarnings,
          page_count: extraction.pageCount || extraction.pages.length,
          page_ocr: extraction.pageOcr || [],
        };
        statementResults.push(statement);
        statementPersistenceFiles.push(file);
      }

      if (statementScan.hasPages) {
        const scannedStatementExtraction = await extractScanSessionDocument(statementScan.pages, "Annual Statement", {
          patchPage: statementScan.patchPage,
          onStage: (phase, progress) => {
            setExtractionStatus({
              phase,
              progress,
              currentFile: "Annual statement scan session",
              detail: `${statementScan.pages.length} page${statementScan.pages.length === 1 ? "" : "s"}`,
            });
          },
          onProgress: setExtractionStatus,
        });

        if (!scannedStatementExtraction.text.trim()) {
          throw new Error(
            "We could not reliably read the scanned annual statement pages. Retake the photo in better lighting, flatter angle, and closer crop."
          );
        }

        setLoadingMessage("Parsing scanned statement packet...");
        const scannedStatement = parseStatementDocument({
          pages: scannedStatementExtraction.pages,
          fileName: scannedStatementExtraction.fileName,
        });
        scannedStatement.extractionMeta = {
          source_type: scannedStatementExtraction.sourceType,
          ocr_confidence: scannedStatementExtraction.ocrConfidence,
          extraction_method: scannedStatementExtraction.extractionMethod,
          extraction_warnings: scannedStatementExtraction.extractionWarnings,
          page_count: scannedStatementExtraction.pageCount,
          page_ocr: scannedStatementExtraction.pageOcr || [],
        };
        statementResults.push(scannedStatement);
        statementPersistenceFiles.push(null);
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
        statements: statementResults.map((statement) => ({
          fileName: statement.fileName,
          sourceType: statement.extractionMeta?.source_type || "pdf",
          ocrConfidence: statement.extractionMeta?.ocr_confidence ?? null,
          extractionWarnings: statement.extractionMeta?.extraction_warnings || [],
          pageCount: statement.extractionMeta?.page_count || statement.pages?.length || 0,
          pageOcr: statement.extractionMeta?.page_ocr || [],
        })),
      });

      const sortedStatements = sortStatementsChronologically(statementResults);
      setLoadingMessage("Computing policy analytics...");
      const analytics = computeDerivedAnalytics(baseline, sortedStatements);
      const vaultAiSummary = buildVaultAiSummary(baseline, sortedStatements, analytics);
      buildCashValueGrowthExplanation(baseline, sortedStatements, analytics);
      buildChargeAnalysisExplanation(sortedStatements, analytics);
      buildStrategyReviewNote(sortedStatements, analytics);
      buildVaultAiPolicyExplanation(baseline, sortedStatements, analytics);
      buildPolicyRecord({
        baseline,
        statements: sortedStatements,
        vaultAiSummary,
      });

      const intelligence = buildPolicyIntelligence({
        baseline,
        statements: sortedStatements,
        legacyAnalytics: analytics,
        vaultAiSummary,
      });

      setLoadingMessage("Saving policy record...");
      const persistenceStatus = await persistVaultedPolicyAnalysis({
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
      });

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
      });
    } catch (analysisError) {
      setError(
        analysisError?.message ||
          "There was a problem extracting or parsing one of the selected documents."
      );
    } finally {
      setLoading(false);
      setLoadingMessage("");
      setExtractionStatus({ phase: "", progress: 0, currentFile: "", detail: "" });
    }
  }

  function handleStatementFilesChange(event) {
    setStatementFiles(Array.from(event.target.files || []));
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
            {statementFiles.length > 0 ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {statementFiles.map((file) => (
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
                  : "No annual statements selected yet."}
              </div>
            )}

            <ScanReview
              title="Annual Statement Scan Session"
              description="Build one scanned statement packet, reorder pages, and proceed even if quality is fair."
              pages={statementScan.pages}
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
          <button type="button" onClick={handleAnalyzeAndSave} disabled={loading} style={actionStyle(true)}>
            {loading ? "Analyzing Policy..." : "Analyze Scan"}
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
            {[documentDiagnostics.illustration, ...documentDiagnostics.statements]
              .filter(Boolean)
              .flatMap((item) => item.pageOcr || [])
              .map((pageOcr) => (
                <div key={`${pageOcr.page_number}-${pageOcr.quality_level}-${pageOcr.confidence ?? "na"}`} style={{ color: "#64748b", fontSize: "14px" }}>
                  Page {pageOcr.page_number}: {getQualityLabel(pageOcr.quality_level)} quality
                  {typeof pageOcr.confidence === "number" ? ` | OCR ${getConfidenceLabel(pageOcr.confidence)}` : ""}
                </div>
              ))}
            {[documentDiagnostics.illustration, ...documentDiagnostics.statements]
              .filter(Boolean)
              .flatMap((item) => item.extractionWarnings || [])
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
