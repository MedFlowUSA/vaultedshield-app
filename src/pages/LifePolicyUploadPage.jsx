import { useMemo, useRef, useState } from "react";
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
import { extractDocumentText } from "../utils/documents/extractDocumentText";
import { captureDocumentPhoto, isNativeCameraAvailable } from "../utils/cameraCapture";
import { convertImageToFile } from "../utils/imageToFile";

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

export default function LifePolicyUploadPage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const { debug } = usePlatformShellData();
  const illustrationCameraInputRef = useRef(null);
  const statementCameraInputRef = useRef(null);
  const [illustrationFile, setIllustrationFile] = useState(null);
  const [statementFiles, setStatementFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState(null);
  const [cameraLoadingTarget, setCameraLoadingTarget] = useState("");
  const [extractionStatus, setExtractionStatus] = useState({
    phase: "",
    progress: 0,
    currentFile: "",
  });
  const [documentDiagnostics, setDocumentDiagnostics] = useState({
    illustration: null,
    statements: [],
  });
  const nativeCameraAvailable = isNativeCameraAvailable();

  const summaryItems = useMemo(
    () => [
      {
        label: "Initial Policy File",
        value: illustrationFile ? 1 : 0,
        helper: illustrationFile ? illustrationFile.name : "Upload the baseline illustration or policy PDF first",
      },
      {
        label: "Yearly Statements",
        value: statementFiles.length,
        helper:
          statementFiles.length > 0
            ? `${statementFiles.length} annual statement file${statementFiles.length === 1 ? "" : "s"} queued`
            : "Upload annual statement PDFs separately after the baseline file",
      },
      {
        label: "Ready To Analyze",
        value: illustrationFile ? "Yes" : "No",
        helper: illustrationFile
          ? "VaultedShield can now parse the baseline file and attach statement history."
          : "The baseline illustration/policy file is required before analysis can run.",
      },
    ],
    [illustrationFile, statementFiles]
  );

  async function handleAnalyzeAndSave() {
    if (!illustrationFile) {
      setError("Please upload the initial illustration or policy PDF first.");
      return;
    }

    try {
      setLoading(true);
      setLoadingMessage("Preparing document extraction...");
      setError("");
      setSaveStatus(null);
      setDocumentDiagnostics({ illustration: null, statements: [] });

      const illustrationExtraction = await extractDocumentText(illustrationFile, {
        onProgress: (progressMessage) => {
          setExtractionStatus({
            phase:
              illustrationFile.type?.startsWith("image/")
                ? "Reading text from image..."
                : "Reading PDF text...",
            progress: Math.round((progressMessage?.progress || 0) * 100),
            currentFile: illustrationFile.name,
          });
        },
      });
      if (!illustrationExtraction.text.trim()) {
        throw new Error(
          "We could not reliably read this scan. Retake the photo in better lighting, flatter angle, and closer crop."
        );
      }
      setDocumentDiagnostics({
        illustration: {
          fileName: illustrationFile.name,
          sourceType: illustrationExtraction.sourceType,
          ocrConfidence: illustrationExtraction.ocrConfidence,
          extractionWarnings: illustrationExtraction.extractionWarnings,
        },
        statements: [],
      });

      setLoadingMessage("Parsing initial policy...");
      const baseline = parseIllustrationDocument({
        pages: illustrationExtraction.pages,
        fileName: illustrationFile.name,
      });
      baseline.extractionMeta = {
        source_type: illustrationExtraction.sourceType,
        ocr_confidence: illustrationExtraction.ocrConfidence,
        extraction_method: illustrationExtraction.extractionMethod,
        extraction_warnings: illustrationExtraction.extractionWarnings,
      };

      const statementResults = [];
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
        };

        statementResults.push({
          fileName: statement.fileName,
          text: statement.text,
          summary: statement.summary,
          pages: statement.pages,
          documentType: statement.documentType,
          carrierDetection: statement.carrierDetection,
          parserDebug: statement.parserDebug,
          fields: statement.fields,
          structuredData: statement.structuredData,
          extractionMeta: statement.extractionMeta,
        });
      }

      setDocumentDiagnostics({
        illustration: {
          fileName: illustrationFile.name,
          sourceType: illustrationExtraction.sourceType,
          ocrConfidence: illustrationExtraction.ocrConfidence,
          extractionWarnings: illustrationExtraction.extractionWarnings,
        },
        statements: statementResults.map((statement) => ({
          fileName: statement.fileName,
          sourceType: statement.extractionMeta?.source_type || "pdf",
          ocrConfidence: statement.extractionMeta?.ocr_confidence ?? null,
          extractionWarnings: statement.extractionMeta?.extraction_warnings || [],
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
        illustrationFile: illustrationFile,
        statementFiles,
        scopeOverride: { userId: debug.authUserId, source: "life_policy_upload_page" },
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
      setExtractionStatus({ phase: "", progress: 0, currentFile: "" });
    }
  }

  async function handleCameraCapture(target = "illustration") {
    setError("");
    setCameraLoadingTarget(target);

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

      if (target === "illustration") {
        setIllustrationFile(file);
        return;
      }

      setStatementFiles((current) => [...current, file]);
    } catch (captureError) {
      setError(captureError?.message || "Camera capture failed.");
    } finally {
      setCameraLoadingTarget("");
    }
  }

  function handleCapturedFileSelection(event, target = "illustration") {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    if (target === "illustration") {
      setIllustrationFile(file);
    } else {
      setStatementFiles((current) => [...current, file]);
    }

    event.target.value = "";
  }

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
              onChange={(event) => setIllustrationFile(event.target.files?.[0] || null)}
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
            <button
              type="button"
              onClick={() => handleCameraCapture("illustration")}
              disabled={cameraLoadingTarget === "illustration"}
              style={actionStyle(false)}
            >
              {cameraLoadingTarget === "illustration" ? "Opening Camera..." : "Scan Initial Policy"}
            </button>
            {illustrationFile ? (
              <div style={{ display: "grid", gap: "6px" }}>
                <div style={{ color: "#0f172a", fontWeight: 600, wordBreak: "break-word" }}>{illustrationFile.name}</div>
                {illustrationFile.type?.startsWith("image/") ? (
                  <div style={{ color: "#92400e", fontSize: "14px" }}>
                    Image scan ready. OCR will read this image during analysis.
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ color: "#64748b" }}>No initial policy file selected yet.</div>
            )}
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
              onChange={(event) => setStatementFiles(Array.from(event.target.files || []))}
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
            <button
              type="button"
              onClick={() => handleCameraCapture("statement")}
              disabled={cameraLoadingTarget === "statement"}
              style={actionStyle(false)}
            >
              {cameraLoadingTarget === "statement" ? "Opening Camera..." : "Scan Annual Statement"}
            </button>
            {statementFiles.length > 0 ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {statementFiles.map((file) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}`} style={{ display: "grid", gap: "4px" }}>
                    <div style={{ color: "#0f172a", fontWeight: 600, wordBreak: "break-word" }}>
                      {file.name}
                    </div>
                    {file.type?.startsWith("image/") ? (
                      <div style={{ color: "#92400e", fontSize: "14px" }}>
                        Image scan queued. OCR will read this image during analysis.
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#64748b" }}>No annual statements selected yet.</div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Analyze And Save"
        subtitle="Run the current carrier-aware life-policy parser and save the result into the vaulted policy workflow."
      >
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={handleAnalyzeAndSave} disabled={loading} style={actionStyle(true)}>
            {loading ? "Analyzing Policy..." : "Analyze And Save Policy"}
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
              </div>
            ) : null}
            {documentDiagnostics.statements.map((item) => (
              <div key={item.fileName} style={{ color: "#475569", lineHeight: "1.7" }}>
                <strong>Statement:</strong> {item.fileName} | {item.sourceType}
                {item.sourceType === "image" ? ` | OCR ${getConfidenceLabel(item.ocrConfidence)}` : ""}
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

      {!illustrationFile && statementFiles.length === 0 ? (
        <EmptyState
          title="No life-policy files loaded yet"
          description="Start with the initial illustration or policy PDF, then add yearly statements in the separate statement section."
        />
      ) : null}
    </div>
  );
}
