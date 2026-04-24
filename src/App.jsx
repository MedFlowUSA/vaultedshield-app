import { useCallback, useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import logo from "./assets/vaultedshield-logo.png";
import { IulReaderPanel } from "./features/iul-reader/IulReaderPanel.jsx";
import { buildIulReaderModel } from "./features/iul-reader/readerModel.js";
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
} from "./lib/parser/extractionEngine";
import { buildPolicyIntelligence } from "./lib/domain/intelligenceEngine";
import { isSupabaseConfigured } from "./lib/supabase/client";
import {
  compareVaultedPolicies,
  getVaultedPolicyBundle,
  listVaultedPolicies,
  persistVaultedPolicyAnalysis,
  rehydrateVaultedPolicyBundle,
} from "./lib/supabase/vaultedPolicies";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function getConfidence(value) {
  if (value && typeof value === "object" && value.confidence) {
    return value.confidence.charAt(0).toUpperCase() + value.confidence.slice(1);
  }

  if (!value || value === "Not found") return "Low";
  if (String(value).length <= 2) return "Low";
  return "Medium";
}

function getConfidenceLevel(value) {
  if (value && typeof value === "object" && value.confidence) {
    return value.confidence;
  }

  if (!value || value === "Not found") return "low";
  if (String(value).length <= 2) return "low";
  return "medium";
}

function createEmptyResults() {
  return {
    illustrationText: "",
    illustrationSummary: null,
    baseline_illustration: null,
    statementResults: [],
    statement_history: [],
    analytics: {},
    vaultAiInterpretation: [],
    vaultAiStatus: {
      limitations: [],
    },
    cashValueGrowthExplanation: [],
    chargeAnalysisExplanation: [],
    strategyReviewNote: "",
    vaultAiPolicyExplanation: [],
    policyRecord: null,
    normalizedPolicy: null,
    normalizedAnalytics: null,
    comparisonSummary: null,
    comparisonRows: [],
    completenessAssessment: null,
    carrierProfile: null,
    productProfile: null,
    strategyReferenceHits: [],
    persistenceStatus: {
      attempted: false,
      configured: false,
      succeeded: false,
      mode: "local_only",
      policyId: null,
      documentCount: 0,
      snapshotCount: 0,
      statementRowCount: 0,
      errorSummary: "",
      storageConfigured: false,
      fileUploadAttempted: false,
      uploadedFileCount: 0,
      uploadedStoragePaths: [],
      duplicateDetections: [],
    },
    readbackStatus: {
      mode: "local_session",
      policyId: null,
      documentCount: 0,
      snapshotCount: 0,
      statementCount: 0,
      analyticsId: null,
      latestStatementDate: null,
      lastSavedAt: null,
      storageConfigured: false,
      storedDocumentCount: 0,
      storagePaths: [],
      errorSummary: "",
    },
    savedDocuments: [],
    documentStatus: {
      totalDocuments: 0,
      storedDocuments: 0,
      duplicateDocuments: 0,
      documentRoles: [],
      latestStatementDate: null,
      storagePaths: [],
    },
  };
}

function formatAnalyticsValue(result, formatter = null) {
  if (!result) return "Limited visibility";
  if (result.value === null || result.value === undefined || result.value === "") return "Limited visibility";
  return formatter ? formatter(result.value) : result.value;
}

function formatCurrencyNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Limited visibility";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercentNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Limited visibility";
  return `${(value * 100).toFixed(1)}%`;
}

function demoDisplayValue(value, fallback = "Limited visibility") {
  if (!value || value === "Not found") return fallback;
  return value;
}

function _maskPolicyNumberLegacy(value) {
  if (!value || value === "Not found") return "Limited visibility";
  const cleaned = String(value).trim();
  if (cleaned.length <= 4) return cleaned;
  return `••••${cleaned.slice(-4)}`;
}

function maskPolicyNumber(value) {
  if (!value || value === "Not found") return "Limited visibility";
  const cleaned = String(value).trim();
  if (cleaned.length <= 4) return cleaned;
  return `****${cleaned.slice(-4)}`;
}

function polishedFieldValue(value, meta, fallback = "Limited visibility") {
  if (getConfidenceLevel(meta) === "low") return fallback;
  return demoDisplayValue(value, fallback);
}

function formatSavedTimestamp(value) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSavedDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function comparisonDisplayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : value;
}

function buildComparisonSections(rows = []) {
  return [
    {
      title: "Identity",
      fields: [
        ["Carrier", "carrier"],
        ["Product", "product"],
        ["Issue Date", "issue_date"],
        ["Latest Statement", "latest_statement_date"],
        ["Latest Statement Source", "latest_statement_date_source"],
      ],
    },
    {
      title: "Funding",
      fields: [
        ["Premium", "premium"],
        ["Annual Target Premium", "annual_target_premium"],
      ],
    },
    {
      title: "Current Values",
      fields: [
        ["Death Benefit", "death_benefit"],
        ["Account Value", "account_value"],
        ["Cash Value", "cash_value"],
        ["Surrender Value", "surrender_value"],
        ["Loan Balance", "loan_balance"],
      ],
    },
    {
      title: "Charges",
      fields: [
        ["Total COI", "total_coi"],
        ["COI Source Kind", "coi_source_kind"],
        ["COI Confidence", "coi_confidence"],
        ["Total Visible Charges", "total_visible_charges"],
        ["Charge Visibility", "charge_visibility_status"],
        ["COI Ratio", "coi_ratio"],
        ["Charge Drag Ratio", "charge_drag_ratio"],
      ],
    },
    {
      title: "Strategy",
      fields: [
        ["Primary Strategy", "primary_strategy"],
        ["Cap Rate", "cap_rate"],
        ["Participation Rate", "participation_rate"],
        ["Spread", "spread"],
        ["Strategy Visibility", "strategy_visibility"],
      ],
    },
    {
      title: "Health / Completeness",
      fields: [
        ["Policy Health", "policy_health_display"],
        ["Data Completeness", "data_completeness_status"],
        ["Missing Fields", "missing_fields_display"],
      ],
    },
  ].map((section) => ({
    ...section,
    rows: section.fields.map(([label, key]) => ({
      label,
      key,
      values: rows.map((row) => row[key]),
    })),
  }));
}

const ILLUSTRATION_COVERAGE_FIELDS = [
  "carrier_name",
  "product_name",
  "policy_type",
  "policy_number",
  "issue_date",
  "death_benefit",
  "initial_face_amount",
  "option_type",
  "planned_premium",
  "minimum_premium",
  "guideline_premium_limit",
];

const STATEMENT_COVERAGE_FIELDS = [
  "statement_date",
  "policy_year",
  "insured_age",
  "accumulation_value",
  "cash_value",
  "cash_surrender_value",
  "loan_balance",
  "cost_of_insurance",
  "admin_fee",
  "monthly_deduction",
  "expense_charge",
  "rider_charge",
  "index_strategy",
  "allocation_percent",
  "index_credit",
  "crediting_rate",
  "participation_rate",
  "cap_rate",
  "spread",
  "indexed_account_value",
  "fixed_account_value",
];

function buildCoverageSummary(fields, targetKeys) {
  const summary = {
    attempted: targetKeys.length,
    captured: 0,
    high: 0,
    medium: 0,
    missing: 0,
    missingFields: [],
  };

  targetKeys.forEach((fieldKey) => {
    const field = fields?.[fieldKey];
    if (field && !field.missing && field.display_value && field.display_value !== "Not found") {
      summary.captured += 1;
      if (field.confidence === "high") {
        summary.high += 1;
      } else if (field.confidence === "medium") {
        summary.medium += 1;
      }
      return;
    }

    summary.missing += 1;
    summary.missingFields.push(fieldKey);
  });

  return summary;
}

function getConfidenceRank(meta) {
  if (!meta?.confidence) return 0;
  if (meta.confidence === "high") return 3;
  if (meta.confidence === "medium") return 2;
  if (meta.confidence === "low") return 1;
  return 0;
}

function buildAnalysisCoverage(results) {
  const latestStatement = results.statementResults?.at(-1);
  const trackedFields = [
    { label: "Issue Date", meta: results.illustrationSummary?.__meta?.issueDate },
    { label: "Death Benefit", meta: results.illustrationSummary?.__meta?.deathBenefit },
    { label: "Planned Premium", meta: results.illustrationSummary?.__meta?.periodicPremium },
    { label: "Statement Date", meta: latestStatement?.summary?.__meta?.statementDate },
    { label: "Accumulation Value", meta: latestStatement?.summary?.__meta?.accumulationValue },
    { label: "Cash Surrender Value", meta: latestStatement?.summary?.__meta?.cashSurrenderValue },
    { label: "Loan Balance", meta: latestStatement?.summary?.__meta?.loanBalance },
    { label: "Cost of Insurance", meta: latestStatement?.summary?.__meta?.costOfInsurance },
    { label: "Expense Charges", meta: latestStatement?.summary?.__meta?.expenseCharge },
    { label: "Index Strategy", meta: latestStatement?.summary?.__meta?.indexStrategy },
    { label: "Allocation %", meta: latestStatement?.summary?.__meta?.allocationPercent },
    { label: "Cap Rate", meta: latestStatement?.summary?.__meta?.capRate },
  ];

  const highConfidenceFields = trackedFields.filter((field) => getConfidenceRank(field.meta) >= 3);
  const mediumOrHigherFields = trackedFields.filter((field) => getConfidenceRank(field.meta) >= 2);
  const missingFields = trackedFields.filter((field) => getConfidenceRank(field.meta) < 2);

  let level = "Basic";
  if (highConfidenceFields.length >= 9) {
    level = "Strong";
  } else if (highConfidenceFields.length >= 5) {
    level = "Moderate";
  }

  return {
    level,
    highCount: highConfidenceFields.length,
    trackedCount: trackedFields.length,
    confirmed: mediumOrHigherFields.map((field) => field.label),
    limited: missingFields.map((field) => field.label),
  };
}

function HighlightMetricCard({ label, value, confidence, accent = "#0f172a" }) {
  return (
    <div
      style={{
        background: "#ffffff",
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" }}>
        {label}
      </div>
      <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "8px", color: accent }}>
        {polishedFieldValue(value, { confidence: confidence.toLowerCase() })}
      </div>
      <div style={{ marginTop: "8px", fontSize: "12px", color: "#64748b" }}>
        Confidence: {confidence}
      </div>
    </div>
  );
}

function App() {
  const supabaseConfigured = isSupabaseConfigured();
  const [illustration, setIllustration] = useState(null);
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputResetKey, setInputResetKey] = useState(0);
  const [savedPolicies, setSavedPolicies] = useState([]);
  const [savedPoliciesLoading, setSavedPoliciesLoading] = useState(false);
  const [savedPoliciesError, setSavedPoliciesError] = useState("");
  const [savedPolicyLoadingId, setSavedPolicyLoadingId] = useState(null);
  const [selectedComparisonPolicyIds, setSelectedComparisonPolicyIds] = useState([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [savedPolicyComparisonRows, setSavedPolicyComparisonRows] = useState([]);

  const [results, setResults] = useState(() => {
    const saved = localStorage.getItem("vaultedshield-results");
    return saved ? { ...createEmptyResults(), ...JSON.parse(saved) } : createEmptyResults();
  });

  const illustrationCoverage = buildCoverageSummary(
    results.baseline_illustration?.fields,
    ILLUSTRATION_COVERAGE_FIELDS
  );
  const analysisCoverage = buildAnalysisCoverage(results);
  const iulReader = buildIulReaderModel(results);
  const latestStatement = results.statementResults.at(-1);
  const preparedComparisonRows = savedPolicyComparisonRows.map((row) => ({
    ...row,
    issue_date: row.issue_date ? formatSavedDate(row.issue_date) : null,
    latest_statement_date: row.latest_statement_date ? formatSavedDate(row.latest_statement_date) : null,
    policy_health_display:
      row.policy_health_score !== null && row.policy_health_score !== undefined
        ? `${row.policy_health_score} / ${row.policy_health_status || "limited"}`
        : row.policy_health_status || "limited",
    missing_fields_display: row.missing_fields?.length > 0 ? row.missing_fields.join(", ") : null,
  }));
  const comparisonSections = buildComparisonSections(preparedComparisonRows);
  const visibleBaselineLoaded = Boolean(illustration || results.baseline_illustration);
  const visibleStatementCount = Math.max(statements.length, results.statementResults.length);
  const currentViewMode = results.readbackStatus?.mode || "local_session";
  const currentViewLabel =
    currentViewMode === "supabase_loaded"
      ? "Saved policy loaded"
      : currentViewMode === "local_with_persisted_save"
        ? "Current analysis saved"
        : "Current local analysis";

  useEffect(() => {
    if (!supabaseConfigured) return;
    loadSavedPolicies();
  }, [loadSavedPolicies, supabaseConfigured]);

  const loadSavedPolicies = useCallback(async () => {
    if (!supabaseConfigured) return;

    try {
      setSavedPoliciesLoading(true);
      setSavedPoliciesError("");
      const { data, error } = await listVaultedPolicies();
      if (error) {
        throw error;
      }
      setSavedPolicies(data || []);
    } catch (error) {
      setSavedPolicies([]);
      setSavedPoliciesError(error?.message || "Saved policy list could not be loaded.");
    } finally {
      setSavedPoliciesLoading(false);
    }
  }, [supabaseConfigured]);

  async function handleLoadSavedPolicy(policyId) {
    if (!policyId) return;

    try {
      setSavedPolicyLoadingId(policyId);
      setSavedPoliciesError("");

      const { data, error } = await getVaultedPolicyBundle(policyId);
      if (error || !data) {
        throw error || new Error("Saved policy bundle not available");
      }

      const rehydrated = rehydrateVaultedPolicyBundle(data);
      const nextResults = {
        ...createEmptyResults(),
        ...rehydrated,
      };

      setIllustration(null);
      setStatements([]);
      setInputResetKey((value) => value + 1);
      setResults(nextResults);
      localStorage.setItem("vaultedshield-results", JSON.stringify(nextResults));
    } catch (error) {
      setSavedPoliciesError(error?.message || "Saved policy load failed.");
      setResults((current) => ({
        ...current,
        readbackStatus: {
          ...(current.readbackStatus || {}),
          mode: current.readbackStatus?.mode || "local_session",
          errorSummary: error?.message || "Saved policy load failed.",
        },
      }));
    } finally {
      setSavedPolicyLoadingId(null);
    }
  }

  async function handleCompareSavedPolicies() {
    if (selectedComparisonPolicyIds.length === 0) {
      setSavedPolicyComparisonRows([]);
      setComparisonError("");
      return;
    }

    try {
      setComparisonLoading(true);
      setComparisonError("");
      const { data, error } = await compareVaultedPolicies(selectedComparisonPolicyIds);
      if (error) {
        throw error;
      }
      setSavedPolicyComparisonRows(data?.comparison_rows || []);
    } catch (error) {
      setSavedPolicyComparisonRows([]);
      setComparisonError(error?.message || "Saved policy comparison failed.");
    } finally {
      setComparisonLoading(false);
    }
  }

  function toggleComparisonPolicy(policyId) {
    setSelectedComparisonPolicyIds((current) =>
      current.includes(policyId)
        ? current.filter((id) => id !== policyId)
        : [...current, policyId].slice(-4)
    );
  }

  async function extractPdfPages(file) {
    if (!file) return [];

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join("\n");
      pages.push(pageText);
    }

    return pages;
  }

  async function handleAnalyze() {
    if (!illustration) {
      alert("Please upload the initial illustration or policy PDF first.");
      return;
    }

    try {
      setLoading(true);

      const illustrationPages = await extractPdfPages(illustration);
      const baseline = parseIllustrationDocument({
        pages: illustrationPages,
        fileName: illustration.name,
      });

      const statementResults = [];

      for (const file of statements) {
        const pages = await extractPdfPages(file);
        const statement = parseStatementDocument({
          pages,
          fileName: file.name,
        });

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
        });
      }

      const sortedStatementResults = sortStatementsChronologically(statementResults);

      const analytics = computeDerivedAnalytics(
        baseline,
        sortedStatementResults
      );
      const vaultAiInterpretation = buildVaultAiSummary(baseline, sortedStatementResults, analytics);
      const cashValueGrowthExplanation = buildCashValueGrowthExplanation(
        baseline,
        sortedStatementResults,
        analytics
      );
      const chargeAnalysisExplanation = buildChargeAnalysisExplanation(
        sortedStatementResults,
        analytics
      );
      const strategyReviewNote = buildStrategyReviewNote(sortedStatementResults, analytics);
      const vaultAiPolicyExplanation = buildVaultAiPolicyExplanation(
        baseline,
        sortedStatementResults,
        analytics
      );
      const policyRecord = buildPolicyRecord({
        baseline,
        statements: sortedStatementResults,
        vaultAiSummary: vaultAiInterpretation,
      });
      const intelligence = buildPolicyIntelligence({
        baseline,
        statements: sortedStatementResults,
        legacyAnalytics: analytics,
        vaultAiSummary: vaultAiInterpretation,
      });
      const persistenceStatus = await persistVaultedPolicyAnalysis({
        normalizedPolicy: intelligence.normalizedPolicy,
        normalizedAnalytics: intelligence.normalizedAnalytics,
        completenessAssessment: intelligence.completenessAssessment,
        carrierProfile: intelligence.carrierProfile,
        productProfile: intelligence.productProfile,
        strategyReferenceHits: intelligence.strategyReferenceHits,
        baseline,
        statements: sortedStatementResults,
        illustrationFile: illustration,
        statementFiles: statements,
      });

      const nextResults = {
        illustrationText: baseline.text,
        illustrationSummary: baseline.summary,
        baseline_illustration: baseline,
        statementResults: sortedStatementResults,
        statement_history: sortedStatementResults,
        analytics,
        vaultAiInterpretation,
        vaultAiStatus: {
          limitations: vaultAiInterpretation.filter((line) => line.toLowerCase().includes("limited")),
        },
        cashValueGrowthExplanation,
        chargeAnalysisExplanation,
        strategyReviewNote,
        vaultAiPolicyExplanation,
        policyRecord,
        normalizedPolicy: intelligence.normalizedPolicy,
        normalizedAnalytics: intelligence.normalizedAnalytics,
        comparisonSummary: intelligence.normalizedAnalytics?.comparison_summary || null,
        completenessAssessment: intelligence.completenessAssessment,
        carrierProfile: intelligence.carrierProfile,
        productProfile: intelligence.productProfile,
        strategyReferenceHits: intelligence.strategyReferenceHits,
        persistenceStatus,
        readbackStatus: {
          mode:
            persistenceStatus.succeeded && persistenceStatus.policyId
              ? "local_with_persisted_save"
              : "local_session",
          policyId: persistenceStatus.policyId,
          documentCount: persistenceStatus.documentCount,
          snapshotCount: persistenceStatus.snapshotCount,
          statementCount: persistenceStatus.statementRowCount,
          analyticsId: null,
          latestStatementDate:
            intelligence.normalizedAnalytics?.performance_summary?.latest_statement_date || null,
          lastSavedAt:
            persistenceStatus.succeeded && persistenceStatus.policyId
              ? new Date().toISOString()
              : null,
          errorSummary: persistenceStatus.errorSummary || "",
          storageConfigured: persistenceStatus.storageConfigured,
          storedDocumentCount: persistenceStatus.uploadedFileCount,
          storagePaths: persistenceStatus.uploadedStoragePaths,
        },
        savedDocuments: [
          {
            file_name: illustration.name,
            document_role: "illustration",
            statement_date: null,
            storage_path: persistenceStatus.uploadedStoragePaths[0] || null,
            metadata: {
              duplicate_status:
                persistenceStatus.duplicateDetections?.find((item) => item.fileName === illustration.name)
                  ?.duplicateStatus || "unknown",
            },
          },
          ...statementResults.map((statement, index) => ({
            file_name: statements[index]?.name || statement.fileName,
            document_role: "annual_statement",
            statement_date: statement.fields?.statement_date?.value || null,
            storage_path:
              persistenceStatus.uploadedStoragePaths[
                persistenceStatus.uploadedStoragePaths.length - statementResults.length + index
              ] || null,
            metadata: {
              duplicate_status:
                persistenceStatus.duplicateDetections?.find(
                  (item) => item.fileName === (statements[index]?.name || statement.fileName)
                )?.duplicateStatus || "unknown",
            },
          })),
        ],
        documentStatus: {
          totalDocuments: 1 + statementResults.length,
          storedDocuments: persistenceStatus.uploadedFileCount || 0,
          duplicateDocuments:
            persistenceStatus.duplicateDetections?.filter(
              (item) => item.duplicateStatus === "duplicate_existing"
            ).length || 0,
          documentRoles: [
            "illustration",
            ...(statementResults.length > 0 ? ["annual_statement"] : []),
          ],
          latestStatementDate:
            intelligence.normalizedAnalytics?.performance_summary?.latest_statement_date || null,
          storagePaths: persistenceStatus.uploadedStoragePaths || [],
        },
      };

      setResults(nextResults);
      localStorage.setItem("vaultedshield-results", JSON.stringify(nextResults));
      if (supabaseConfigured) {
        await loadSavedPolicies();
      }
    } catch (error) {
      console.error("PDF read error:", error);
      alert("There was a problem reading one of the PDFs.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "40px", fontFamily: "Arial", maxWidth: "1100px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "10px",
        }}
      >
        <img
          src={logo}
          alt="VaultedShield"
          style={{
            height: "74px",
            width: "auto",
          }}
        />

        <div>
          <h1 style={{ margin: 0 }}>VaultedShield</h1>
          <h3 style={{ margin: 0, color: "#64748b" }}>
            Life. Explained. Protection, Simplified.
          </h3>
        </div>
      </div>

      <hr style={{ margin: "20px 0", opacity: 0.2 }} />

      <div
        style={{
          marginTop: "20px",
          marginBottom: "24px",
          padding: "16px 20px",
          borderRadius: "14px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
          color: "white",
          boxShadow: "0 10px 25px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", letterSpacing: "1px", opacity: 0.8 }}>
              VAULTAI INTELLIGENCE LAYER
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>
              Policy Intelligence Engine Active
            </div>
            <div style={{ marginTop: "6px", opacity: 0.9 }}>
              Ingesting illustration data, tracking annual statements, and translating
              policy performance into plain-English insights.
            </div>
          </div>

          <div
            style={{
              minWidth: "220px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: "12px",
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: "12px", opacity: 0.8 }}>SYSTEM STATUS</div>
            <div style={{ marginTop: "8px", fontWeight: 600 }}>
              {loading ? "Analyzing policy documents..." : "Ready for policy ingestion"}
            </div>
            <div style={{ marginTop: "8px", fontSize: "14px", opacity: 0.9 }}>
              Baseline document: {visibleBaselineLoaded ? "Loaded" : "Not loaded"}
            </div>
            <div style={{ fontSize: "14px", opacity: 0.9 }}>
              Statements tracked: {visibleStatementCount}
            </div>
            <div style={{ fontSize: "14px", opacity: 0.9 }}>
              Current view: {currentViewLabel}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "14px",
          marginBottom: "28px",
        }}
      >
        <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "12px", color: "#64748b" }}>BASELINE POLICY</div>
          <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px" }}>
            {visibleBaselineLoaded ? "Loaded" : "Pending"}
          </div>
        </div>

        <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "12px", color: "#64748b" }}>STATEMENTS</div>
          <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px" }}>
            {visibleStatementCount}
          </div>
        </div>

        <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "12px", color: "#64748b" }}>LATEST ACCUMULATION VALUE</div>
          <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px" }}>
            {results.statementResults.length > 0
              ? results.statementResults[results.statementResults.length - 1].summary.accumulationValue
              : "--"}
          </div>
        </div>

        <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "12px", color: "#64748b" }}>LATEST CASH SURRENDER</div>
          <div style={{ fontSize: "24px", fontWeight: 700, marginTop: "6px" }}>
            {results.statementResults.length > 0
              ? results.statementResults[results.statementResults.length - 1].summary.cashSurrenderValue
              : "--"}
          </div>
        </div>
      </div>

      <div
        style={{
          marginBottom: "28px",
          background: "#f8fbff",
          border: "1px solid #dbe7ff",
          borderRadius: "14px",
          padding: "18px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", color: "#64748b", letterSpacing: "0.5px" }}>ANALYSIS COVERAGE</div>
            <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background:
                    analysisCoverage.level === "Strong"
                      ? "#dcfce7"
                      : analysisCoverage.level === "Moderate"
                        ? "#fef3c7"
                        : "#e2e8f0",
                  color:
                    analysisCoverage.level === "Strong"
                      ? "#166534"
                      : analysisCoverage.level === "Moderate"
                        ? "#92400e"
                        : "#334155",
                  fontWeight: 700,
                  fontSize: "13px",
                }}
              >
                {analysisCoverage.level}
              </span>
              <span style={{ color: "#475569", fontSize: "14px" }}>
                {analysisCoverage.highCount} of {analysisCoverage.trackedCount} key demo fields are currently high-confidence.
              </span>
            </div>
            <p style={{ marginTop: "12px", marginBottom: 0, color: "#475569", lineHeight: "1.6" }}>
              {results.normalizedAnalytics?.presentation_values?.confirmed_summary ||
                "The current reading is built from the strongest confirmed illustration and statement values."}
            </p>
          </div>

          <div style={{ minWidth: "280px", flex: "1 1 320px" }}>
            <p style={{ marginTop: 0, marginBottom: "8px" }}>
              <strong>Successfully identified:</strong>{" "}
              {analysisCoverage.confirmed.length > 0
                ? analysisCoverage.confirmed.join(", ")
                : "Current-value visibility is still limited."}
            </p>
            <p style={{ margin: 0, color: "#475569", lineHeight: "1.6" }}>
              <strong>Additional pages or statements would help with:</strong>{" "}
              {results.completenessAssessment?.missing_sections?.length > 0
                ? results.completenessAssessment.missing_sections.join(", ")
                : analysisCoverage.limited.length > 0
                  ? analysisCoverage.limited.join(", ")
                  : "The current upload already supports the main demo fields."}
            </p>
          </div>
        </div>
      </div>

      {supabaseConfigured ? (
        <div
          style={{
            marginTop: "10px",
            marginBottom: "28px",
            padding: "18px 20px",
            borderRadius: "14px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>Saved Policies</h2>
              <p style={{ margin: "6px 0 0 0", color: "#64748b" }}>
                Load a previously saved policy intelligence record without re-uploading PDFs.
              </p>
            </div>
            <button
              onClick={loadSavedPolicies}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Refresh Saved Policies
            </button>
          </div>

          <div style={{ marginTop: "16px" }}>
            {savedPoliciesLoading ? (
              <p>Loading saved policies...</p>
            ) : savedPoliciesError ? (
              <p style={{ color: "#991b1b" }}>{savedPoliciesError}</p>
            ) : savedPolicies.length === 0 ? (
              <p>No saved policies yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={handleCompareSavedPolicies}
                    disabled={comparisonLoading || selectedComparisonPolicyIds.length === 0}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: "none",
                      background: selectedComparisonPolicyIds.length === 0 ? "#cbd5e1" : "#0f172a",
                      color: "#ffffff",
                      cursor: selectedComparisonPolicyIds.length === 0 ? "not-allowed" : "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {comparisonLoading ? "Building Comparison..." : `Compare Selected (${selectedComparisonPolicyIds.length})`}
                  </button>
                  <span style={{ color: "#64748b", fontSize: "13px" }}>
                    Select up to 4 saved policies for a comparison-ready summary.
                  </span>
                </div>
                {savedPolicies.slice(0, 6).map((policy) => (
                  <div
                    key={policy.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "14px",
                      flexWrap: "wrap",
                      padding: "14px",
                      borderRadius: "12px",
                      background:
                        results.readbackStatus?.policyId === policy.id && currentViewMode === "supabase_loaded"
                          ? "#eff6ff"
                          : "#f8fafc",
                      border:
                        results.readbackStatus?.policyId === policy.id && currentViewMode === "supabase_loaded"
                          ? "1px solid #93c5fd"
                          : "1px solid #e2e8f0",
                    }}
                  >
                    <div style={{ minWidth: "280px", flex: 1 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "13px", color: "#475569" }}>
                        <input
                          type="checkbox"
                          checked={selectedComparisonPolicyIds.includes(policy.id)}
                          onChange={() => toggleComparisonPolicy(policy.id)}
                        />
                        Include in comparison
                      </label>
                      <div style={{ fontWeight: 700 }}>
                        {policy.carrier_name || "Unknown carrier"}
                        {policy.product_name ? ` - ${policy.product_name}` : ""}
                      </div>
                      <div style={{ marginTop: "4px", color: "#475569", fontSize: "14px" }}>
                        Policy: {maskPolicyNumber(policy.policy_number || policy.policy_number_masked || "Not found")}
                        {" | "}
                        Issue Date: {demoDisplayValue(formatSavedDate(policy.issue_date), "Limited visibility")}
                      </div>
                      <div style={{ marginTop: "4px", color: "#64748b", fontSize: "13px" }}>
                        Latest Statement: {demoDisplayValue(formatSavedDate(policy.latest_statement_date), "Additional statement data needed")}
                        {" | "}
                        Last Saved: {formatSavedTimestamp(policy.last_saved_at)}
                      </div>
                    </div>

                    <button
                      onClick={() => handleLoadSavedPolicy(policy.id)}
                      disabled={savedPolicyLoadingId === policy.id}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "10px",
                        border: "none",
                        background: "#0f172a",
                        color: "#ffffff",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      {savedPolicyLoadingId === policy.id ? "Loading..." : "Load Policy"}
                    </button>
                  </div>
                ))}
                {comparisonError ? (
                  <p style={{ color: "#991b1b" }}>{comparisonError}</p>
                ) : null}
                {savedPolicyComparisonRows.length > 0 ? (
                  <div style={{ display: "grid", gap: "14px", marginTop: "10px" }}>
                    {comparisonSections.map((section) => (
                      <div key={section.title} style={{ overflowX: "auto" }}>
                        <div style={{ fontWeight: 700, marginBottom: "8px", color: "#0f172a" }}>{section.title}</div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                          <thead>
                            <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                              <th style={{ padding: "10px", border: "1px solid #e2e8f0", minWidth: "220px" }}>Field</th>
                              {preparedComparisonRows.map((row) => (
                                <th
                                  key={`${section.title}-${row.policy_id || row.carrier || "policy"}`}
                                  style={{ padding: "10px", border: "1px solid #e2e8f0", minWidth: "180px" }}
                                >
                                  {comparisonDisplayValue(row.carrier)}
                                  {row.product ? ` - ${row.product}` : ""}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map((fieldRow) => (
                              <tr key={`${section.title}-${fieldRow.key}`}>
                                <td style={{ padding: "10px", border: "1px solid #e2e8f0", fontWeight: 600 }}>{fieldRow.label}</td>
                                {fieldRow.values.map((value, index) => (
                                  <td
                                    key={`${section.title}-${fieldRow.key}-${preparedComparisonRows[index]?.policy_id || index}`}
                                    style={{ padding: "10px", border: "1px solid #e2e8f0", verticalAlign: "top" }}
                                  >
                                    {comparisonDisplayValue(value)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                    <div style={{ color: "#64748b", fontSize: "12px" }}>
                      Ratios display only when both numerator and denominator were valid and meaningful. Missing or weak inputs remain shown as —.
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: "30px", padding: "20px", border: "1px solid #ddd", borderRadius: "12px" }}>
        <h2 style={{ marginBottom: "6px" }}>VaultedShield Policy Intelligence Workspace</h2>
        <p style={{ marginTop: 0, color: "#64748b" }}>
          Upload a baseline policy document and any number of annual statements to build a live policy history.
        </p>

        <div style={{ marginTop: "20px" }}>
          <label><strong>Upload Initial Illustration PDF</strong></label>
          <br />
          <input
            key={`illustration-${inputResetKey}`}
            type="file"
            accept=".pdf"
            onChange={(e) => setIllustration(e.target.files[0] || null)}
          />
          <div style={{ marginTop: "8px" }}>
            {illustration ? illustration.name : "No illustration selected"}
          </div>
        </div>

        <div style={{ marginTop: "20px" }}>
          <label><strong>Upload Policy Statements (one or many PDFs)</strong></label>
          <br />
          <input
            key={`statements-${inputResetKey}`}
            type="file"
            accept=".pdf"
            multiple
            onChange={(e) => setStatements(Array.from(e.target.files || []))}
          />
          <div style={{ marginTop: "8px" }}>
            {statements.length > 0 ? (
              <ul style={{ paddingLeft: "20px" }}>
                {statements.map((file, index) => (
                  <li key={index}>{file.name}</li>
                ))}
              </ul>
            ) : (
              "No statements selected"
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={handleAnalyze}
            style={{
              marginTop: "30px",
              padding: "12px 20px",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            {loading ? "Analyzing..." : "Analyze Policy History"}
          </button>

          <button
            onClick={() => {
            setIllustration(null);
            setStatements([]);
            setInputResetKey((value) => value + 1);
            const emptyResults = createEmptyResults();
            setResults(emptyResults);
            localStorage.removeItem("vaultedshield-results");
          }}
            style={{
              marginTop: "30px",
              padding: "12px 20px",
              border: "1px solid #cbd5e1",
              background: "white",
              borderRadius: "10px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Reset Workspace
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: "24px",
          padding: "18px 20px",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "10px" }}>Document Status</h2>
        <p><strong>Saved Documents:</strong> {results.documentStatus?.totalDocuments ?? 0}</p>
        <p><strong>Stored File References:</strong> {results.documentStatus?.storedDocuments ?? 0}</p>
        <p><strong>Duplicate Candidates:</strong> {results.documentStatus?.duplicateDocuments ?? 0}</p>
        <p><strong>Document Roles:</strong> {results.documentStatus?.documentRoles?.join(", ") || "Limited visibility"}</p>
        <p><strong>Latest Statement File Date:</strong> {demoDisplayValue(results.documentStatus?.latestStatementDate, "Additional statement files needed")}</p>
        <p style={{ color: "#64748b", marginBottom: 0 }}>
          Stored file references improve saved-policy durability. Detailed read-back still depends on which original packet pages were uploaded and linked successfully.
        </p>
      </div>

      <div style={{ marginTop: "40px" }}>
        <IulReaderPanel reader={iulReader} results={results} />

        <h2>Policy Summary</h2>

        <div
          style={{
            marginTop: "20px",
            background: "#f7f7f7",
            padding: "16px",
            borderRadius: "10px",
          }}
        >
          <h3>Initial Illustration Summary</h3>
          {results.illustrationSummary ? (
            <div>
              <p><strong>Carrier:</strong> {demoDisplayValue(results.illustrationSummary.carrier)}</p>
              <p><strong>Product Name:</strong> {demoDisplayValue(results.illustrationSummary.productName)}</p>
              <p><strong>Policy Type:</strong> {demoDisplayValue(results.illustrationSummary.policyType)}</p>
              <p><strong>Policy Number:</strong> {maskPolicyNumber(results.illustrationSummary.policyNumber)}</p>
              <p><strong>Issue Date:</strong> {demoDisplayValue(results.illustrationSummary.issueDate)}</p>
              <p><strong>Death Benefit:</strong> {demoDisplayValue(results.illustrationSummary.deathBenefit)}</p>
              <p><strong>Periodic Premium:</strong> {demoDisplayValue(results.illustrationSummary.periodicPremium)}</p>
              <p><strong>Payment Mode:</strong> {demoDisplayValue(results.illustrationSummary.paymentMode)}</p>
              <p><strong>Target Premium:</strong> {demoDisplayValue(results.illustrationSummary.targetPremium)}</p>
              <p><strong>Monthly Guarantee Premium:</strong> {demoDisplayValue(results.illustrationSummary.monthlyGuaranteePremium)}</p>
            </div>
          ) : (
            <p>No illustration summary yet.</p>
          )}
        </div>

        <div
          style={{
            marginTop: "30px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          <div
            style={{
              background: "#0f172a",
              color: "white",
              padding: "20px",
              borderRadius: "14px",
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Policy Snapshot</h3>
            <p><strong>Carrier:</strong> {demoDisplayValue(results.illustrationSummary?.carrier)}</p>
            <p><strong>Product:</strong> {demoDisplayValue(results.illustrationSummary?.productName)}</p>
            <p><strong>Policy Type:</strong> {demoDisplayValue(results.illustrationSummary?.policyType)}</p>
            <p>
              <strong>Policy #:</strong> {maskPolicyNumber(results.illustrationSummary?.policyNumber)}
              <span style={{ marginLeft: "8px", color: "#93c5fd", fontSize: "12px" }}>
                Confidence: {getConfidence(results.illustrationSummary?.__meta?.policyNumber)}
              </span>
            </p>
            <p><strong>Issue Date:</strong> {demoDisplayValue(results.illustrationSummary?.issueDate)}</p>
            <p>
              <strong>Death Benefit:</strong> {demoDisplayValue(results.illustrationSummary?.deathBenefit)}
              <span style={{ marginLeft: "8px", color: "#93c5fd", fontSize: "12px" }}>
                Confidence: {getConfidence(results.illustrationSummary?.__meta?.deathBenefit)}
              </span>
            </p>
            <p>
              <strong>Periodic Premium:</strong> {demoDisplayValue(results.illustrationSummary?.periodicPremium)}
              <span style={{ marginLeft: "8px", color: "#93c5fd", fontSize: "12px" }}>
                Confidence: {getConfidence(results.illustrationSummary?.__meta?.periodicPremium)}
              </span>
            </p>
          </div>

          <div
            style={{
              background: "#f8fafc",
              padding: "20px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Current Policy Metrics</h3>
            <p>
              <strong>Latest Accumulation Value:</strong>{" "}
              {results.statementResults.length > 0
                ? polishedFieldValue(
                    results.statementResults[results.statementResults.length - 1].summary.accumulationValue,
                    results.statementResults[results.statementResults.length - 1].summary.__meta?.accumulationValue
                  )
                : "Limited visibility"}
              <span style={{ marginLeft: "8px", color: "#64748b", fontSize: "12px" }}>
                Confidence: {getConfidence(
                  results.statementResults.length > 0
                    ? results.statementResults[results.statementResults.length - 1].summary.__meta?.accumulationValue
                    : null
                )}
              </span>
            </p>
            <p>
              <strong>Latest Cash Value:</strong>{" "}
              {results.statementResults.length > 0
                ? polishedFieldValue(
                    results.statementResults[results.statementResults.length - 1].summary.cashValue,
                    results.statementResults[results.statementResults.length - 1].summary.__meta?.cashValue
                  )
                : "Limited visibility"}
            </p>
            <p>
              <strong>Latest Cash Surrender Value:</strong>{" "}
              {results.statementResults.length > 0
                ? polishedFieldValue(
                    results.statementResults[results.statementResults.length - 1].summary.cashSurrenderValue,
                    results.statementResults[results.statementResults.length - 1].summary.__meta?.cashSurrenderValue
                  )
                : "Limited visibility"}
            </p>
            <p>
              <strong>Latest Loan Balance:</strong>{" "}
              {results.statementResults.length > 0
                ? polishedFieldValue(
                    results.statementResults[results.statementResults.length - 1].summary.loanBalance,
                    results.statementResults[results.statementResults.length - 1].summary.__meta?.loanBalance
                  )
                : "Limited visibility"}
            </p>
            <p><strong>Statements Tracked:</strong> {results.statementResults.length}</p>
          </div>

          <div
            style={{
              background: "#eef6ff",
              padding: "20px",
              borderRadius: "14px",
              border: "1px solid #bfdbfe",
              boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>VaultAI Health Read</h3>
            <p>
              {results.statementResults.length > 0
                ? "VaultAI detected active policy history and is tracking statement-based performance."
                : "VaultAI has the baseline policy document, but no annual statement history has been uploaded yet."}
            </p>
            <p>
              {results.statementResults.some(
                (s) => s.summary.accumulationValue && s.summary.accumulationValue !== "Not found"
              )
                ? "Accumulation value data has been identified in the uploaded statement history."
                : "Accumulation value has not yet been clearly identified from the uploaded statements."}
            </p>
            <p>
              {results.statementResults.some(
                (s) => s.summary.loanBalance && s.summary.loanBalance !== "Not found" && s.summary.loanBalance !== "0.00"
              )
                ? "Loan activity may be present and should be reviewed."
                : "No significant loan activity has been detected in the current statement history."}
            </p>
            <p>
              Additional annual statements will improve policy trend analysis and confidence.
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: "30px",
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
          }}
        >
          <h2>Policy Performance Summary</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <HighlightMetricCard
              label="Issue Date"
              value={results.analytics?.performance_summary?.issue_date}
              confidence={getConfidence(results.illustrationSummary?.__meta?.issueDate)}
              accent="#0f172a"
            />
            <HighlightMetricCard
              label="Death Benefit"
              value={results.analytics?.performance_summary?.death_benefit}
              confidence={getConfidence(results.illustrationSummary?.__meta?.deathBenefit)}
              accent="#0f172a"
            />
            <HighlightMetricCard
              label="Planned Premium"
              value={results.illustrationSummary?.periodicPremium}
              confidence={getConfidence(results.illustrationSummary?.__meta?.periodicPremium)}
              accent="#0f172a"
            />
            <HighlightMetricCard
              label="Accumulation Value"
              value={results.analytics?.performance_summary?.current_accumulation_value}
              confidence={getConfidence(latestStatement?.summary?.__meta?.accumulationValue)}
              accent="#0b5fff"
            />
            <HighlightMetricCard
              label="Cash Surrender Value"
              value={results.analytics?.performance_summary?.current_cash_surrender_value}
              confidence={getConfidence(latestStatement?.summary?.__meta?.cashSurrenderValue)}
              accent="#0b5fff"
            />
            <HighlightMetricCard
              label="Loan Balance"
              value={results.analytics?.performance_summary?.current_loan_balance}
              confidence={getConfidence(latestStatement?.summary?.__meta?.loanBalance)}
              accent="#0b5fff"
            />
            <HighlightMetricCard
              label="Cost of Insurance"
              value={latestStatement?.summary?.costOfInsurance}
              confidence={getConfidence(latestStatement?.summary?.__meta?.costOfInsurance)}
              accent="#7c3aed"
            />
            <HighlightMetricCard
              label="Expense Charges"
              value={latestStatement?.summary?.expenseCharge}
              confidence={getConfidence(latestStatement?.summary?.__meta?.expenseCharge)}
              accent="#7c3aed"
            />
            <HighlightMetricCard
              label="Index Strategy"
              value={latestStatement?.summary?.indexStrategy}
              confidence={getConfidence(latestStatement?.summary?.__meta?.indexStrategy)}
              accent="#047857"
            />
            <HighlightMetricCard
              label="Allocation %"
              value={latestStatement?.summary?.allocationPercent}
              confidence={getConfidence(latestStatement?.summary?.__meta?.allocationPercent)}
              accent="#047857"
            />
            <HighlightMetricCard
              label="Cap Rate"
              value={latestStatement?.summary?.capRate}
              confidence={getConfidence(latestStatement?.summary?.__meta?.capRate)}
              accent="#047857"
            />
          </div>
          <p style={{ marginTop: 0, marginBottom: "18px", color: "#475569", lineHeight: "1.6" }}>
            {results.normalizedAnalytics?.presentation_values?.limitations_summary ||
              "Values highlighted here reflect the strongest current extraction results."}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
            <p><strong>Carrier:</strong> {demoDisplayValue(results.analytics?.performance_summary?.carrier_name)}</p>
            <p><strong>Product Name:</strong> {demoDisplayValue(results.analytics?.performance_summary?.product_name)}</p>
            <p>
              <strong>Policy Number:</strong> {maskPolicyNumber(results.analytics?.performance_summary?.policy_number)}
              <span style={{ marginLeft: "8px", color: "#64748b", fontSize: "12px" }}>
                Confidence: {getConfidence(results.illustrationSummary?.__meta?.policyNumber)}
              </span>
            </p>
            <p><strong>Issue Date:</strong> {demoDisplayValue(results.analytics?.performance_summary?.issue_date)}</p>
            <p><strong>Latest Statement Date:</strong> {demoDisplayValue(results.analytics?.performance_summary?.latest_statement_date)}</p>
            <p>
              <strong>Death Benefit:</strong> {demoDisplayValue(results.analytics?.performance_summary?.death_benefit)}
              <span style={{ marginLeft: "8px", color: "#64748b", fontSize: "12px" }}>
                Confidence: {getConfidence(results.illustrationSummary?.__meta?.deathBenefit)}
              </span>
            </p>
            <p><strong>Total Premium Paid:</strong> {demoDisplayValue(results.analytics?.performance_summary?.total_premium_paid)}</p>
            <p><strong>Current Accumulation Value:</strong> {polishedFieldValue(results.analytics?.performance_summary?.current_accumulation_value, latestStatement?.summary?.__meta?.accumulationValue)}</p>
            <p><strong>Current Cash Value:</strong> {polishedFieldValue(results.analytics?.performance_summary?.current_cash_value, latestStatement?.summary?.__meta?.cashValue)}</p>
            <p><strong>Current Cash Surrender Value:</strong> {polishedFieldValue(results.analytics?.performance_summary?.current_cash_surrender_value, latestStatement?.summary?.__meta?.cashSurrenderValue)}</p>
            <p><strong>Current Loan Balance:</strong> {polishedFieldValue(results.analytics?.performance_summary?.current_loan_balance, latestStatement?.summary?.__meta?.loanBalance)}</p>
            <p><strong>Net Policy Growth:</strong> {demoDisplayValue(results.analytics?.performance_summary?.net_policy_growth, "Additional data needed")}</p>
            <p><strong>Illustration Variance:</strong> {demoDisplayValue(results.analytics?.performance_summary?.illustration_variance, "Additional data needed")}</p>
            <p><strong>Growth Trend:</strong> {results.analytics?.growth_trend?.value ? "Available" : "Limited"}</p>
          </div>
        </div>

        <div
          style={{
            marginTop: "30px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h2>Charge And COI Analysis</h2>
            <p><strong>Total COI:</strong> {formatAnalyticsValue(results.analytics?.charge_analysis?.total_cost_of_insurance, formatCurrencyNumber)}</p>
            <p><strong>Total Admin Fees:</strong> {formatAnalyticsValue(results.analytics?.charge_analysis?.total_admin_fees, formatCurrencyNumber)}</p>
            <p><strong>Total Monthly Deductions:</strong> {formatAnalyticsValue(results.analytics?.charge_analysis?.total_monthly_deductions, formatCurrencyNumber)}</p>
            <p><strong>Total Rider Charges:</strong> {formatAnalyticsValue(results.analytics?.charge_analysis?.total_rider_charges, formatCurrencyNumber)}</p>
            <p><strong>Total Expense Charges:</strong> {formatAnalyticsValue(results.analytics?.charge_analysis?.total_expense_charges, formatCurrencyNumber)}</p>
            <p><strong>Total Policy Charges:</strong> {formatAnalyticsValue(results.analytics?.charge_analysis?.total_policy_charges, formatCurrencyNumber)}</p>
            <p><strong>COI Ratio:</strong> {formatAnalyticsValue(results.analytics?.charge_analysis?.cost_of_insurance_ratio, formatPercentNumber)}</p>
            <p><strong>Charge Drag Ratio:</strong> {formatAnalyticsValue(results.analytics?.charge_analysis?.charge_drag_ratio, formatPercentNumber)}</p>
            <p><strong>COI Trend:</strong> {results.analytics?.charge_analysis?.coi_trend?.value ? "Available" : "Limited"}</p>
            <p style={{ color: "#475569", lineHeight: "1.6" }}>
              These charge figures reflect the current-period rows that were visible in the uploaded carrier statement. Additional statements or deeper charge pages improve trend reliability.
            </p>
            {results.chargeAnalysisExplanation?.length > 0 ? (
              results.chargeAnalysisExplanation.map((line, index) => (
                <p key={index} style={{ marginBottom: "10px", lineHeight: "1.6", color: "#475569" }}>{line}</p>
              ))
            ) : (
              <p style={{ color: "#475569" }}>Additional statement data is needed for a fuller charge explanation.</p>
            )}
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h2>Cash Value Growth Explanation</h2>
            {results.cashValueGrowthExplanation?.length > 0 ? (
              results.cashValueGrowthExplanation.map((line, index) => (
                <p key={index} style={{ marginBottom: "10px", lineHeight: "1.6" }}>{line}</p>
              ))
            ) : (
              <p>Cash value growth explanation is limited until more trusted value data is available.</p>
            )}
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h2>Index / Internal Strategy Review</h2>
            <p><strong>Index Strategy:</strong> {polishedFieldValue(results.statementResults.at(-1)?.summary.indexStrategy, results.statementResults.at(-1)?.summary.__meta?.indexStrategy)}</p>
            <p><strong>Allocation Percent:</strong> {polishedFieldValue(results.statementResults.at(-1)?.summary.allocationPercent, results.statementResults.at(-1)?.summary.__meta?.allocationPercent)}</p>
            <p><strong>Index Credit:</strong> {polishedFieldValue(results.statementResults.at(-1)?.summary.indexCredit, results.statementResults.at(-1)?.summary.__meta?.indexCredit)}</p>
            <p><strong>Crediting Rate:</strong> {polishedFieldValue(results.statementResults.at(-1)?.summary.creditingRate, results.statementResults.at(-1)?.summary.__meta?.creditingRate)}</p>
            <p><strong>Participation Rate:</strong> {polishedFieldValue(results.statementResults.at(-1)?.summary.participationRate, results.statementResults.at(-1)?.summary.__meta?.participationRate)}</p>
            <p><strong>Cap Rate:</strong> {polishedFieldValue(results.statementResults.at(-1)?.summary.capRate, results.statementResults.at(-1)?.summary.__meta?.capRate)}</p>
            <p><strong>Spread:</strong> {polishedFieldValue(results.statementResults.at(-1)?.summary.spread, results.statementResults.at(-1)?.summary.__meta?.spread)}</p>
            <p><strong>Indexed Account Value:</strong> {polishedFieldValue(results.statementResults.at(-1)?.summary.indexedAccountValue, results.statementResults.at(-1)?.summary.__meta?.indexedAccountValue)}</p>
            <p><strong>Fixed Account Value:</strong> {polishedFieldValue(results.statementResults.at(-1)?.summary.fixedAccountValue, results.statementResults.at(-1)?.summary.__meta?.fixedAccountValue)}</p>
            <p style={{ color: "#475569", lineHeight: "1.6" }}>
              Strategy visibility depends on whether the uploaded statement includes allocation and open-account detail pages with current strategy terms.
            </p>
            <p style={{ marginTop: "14px", color: "#475569" }}>{results.strategyReviewNote || "Strategy visibility is currently limited."}</p>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h2>Policy Health Score</h2>
            {results.analytics?.policy_health_score?.value ? (
              <div>
                <p>
                  <strong>Overall Score:</strong>{" "}
                  {results.analytics.policy_health_score.value.label} ({results.analytics.policy_health_score.value.value}/10)
                </p>
                <p style={{ color: "#475569", lineHeight: "1.6" }}>
                  This score is a conservative reading based on current data completeness, growth visibility, charge visibility, and loan pressure.
                  {results.analytics.policy_health_score.value.label === "Limited"
                    ? " It should be treated as provisional until additional high-confidence statement data is available."
                    : ""}
                </p>
                {results.analytics.policy_health_score.value.factors?.slice(0, 5).map((factor, index) => (
                  <p key={index} style={{ marginBottom: "10px", lineHeight: "1.6", color: "#475569" }}>
                    {factor}
                  </p>
                ))}
              </div>
            ) : (
              <p>Policy health score is currently provisional because critical growth inputs are still incomplete.</p>
            )}
          </div>
        </div>

        <div style={{ marginTop: "30px" }}>
          <h2>Statement History</h2>

          {results.statementResults.length > 0 ? (
            results.statementResults.map((statement, idx) => (
              <div
                key={idx}
                style={{
                  marginTop: "20px",
                  background: "#f7f7f7",
                  padding: "16px",
                  borderRadius: "10px",
                }}
              >
                <h3>Statement {idx + 1}: {statement.fileName}</h3>
                <p><strong>Carrier:</strong> {demoDisplayValue(statement.summary.carrier)}</p>
                <p><strong>Product Name:</strong> {demoDisplayValue(statement.summary.productName)}</p>
                <p><strong>Policy Type:</strong> {demoDisplayValue(statement.summary.policyType)}</p>
                <p><strong>Policy Number:</strong> {maskPolicyNumber(statement.summary.policyNumber)}</p>
                <p><strong>Statement Date:</strong> {demoDisplayValue(statement.summary.statementDate)}</p>
                <p><strong>Death Benefit:</strong> {demoDisplayValue(statement.summary.deathBenefit)}</p>
                <p><strong>Periodic Premium:</strong> {demoDisplayValue(statement.summary.periodicPremium)}</p>
                <p><strong>Accumulation Value:</strong> {demoDisplayValue(statement.summary.accumulationValue)}</p>
                <p><strong>Cash Value:</strong> {demoDisplayValue(statement.summary.cashValue)}</p>
                <p><strong>Cash Surrender Value:</strong> {demoDisplayValue(statement.summary.cashSurrenderValue)}</p>
                <p><strong>Loans:</strong> {demoDisplayValue(statement.summary.loanBalance)}</p>
              </div>
            ))
          ) : (
            <p>No statements analyzed yet.</p>
          )}
        </div>

        <div
          style={{
            marginTop: "30px",
            background: "#ffffff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
          }}
        >
          <h2>Policy Performance Timeline</h2>

          {results.normalizedAnalytics?.timeline?.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {results.normalizedAnalytics.timeline.map((statement, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <p><strong>Statement:</strong> {statement.fileName}</p>
                  <p><strong>Date:</strong> {demoDisplayValue(statement.statement_date)}</p>
                  <p><strong>Policy Year:</strong> {demoDisplayValue(statement.policy_year)}</p>
                  <p><strong>Accumulation Value:</strong> {demoDisplayValue(statement.accumulation_value)}</p>
                  <p><strong>Accumulation Change:</strong> {demoDisplayValue(statement.accumulation_change !== null ? formatCurrencyNumber(statement.accumulation_change) : "", "Current baseline point")}</p>
                  <p><strong>Cash Value:</strong> {demoDisplayValue(statement.cash_value)}</p>
                  <p><strong>Cash Surrender Value:</strong> {demoDisplayValue(statement.cash_surrender_value)}</p>
                  <p><strong>Loan Balance:</strong> {demoDisplayValue(statement.loan_balance)}</p>
                  <p><strong>Total Charges Detected:</strong> {demoDisplayValue(statement.total_visible_charges_display || statement.total_charges_detected, "Current-period visibility only")}</p>
                </div>
              ))}
            </div>
          ) : (
            <p>No statement timeline yet.</p>
          )}
        </div>

        <div
          style={{
            marginTop: "40px",
            background: "#f9fbff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #dbe7ff",
          }}
        >
          <h2>Illustration vs Policy History</h2>

          <p><strong>Product Name:</strong> {demoDisplayValue(results.illustrationSummary?.productName)}</p>
          <p><strong>Policy Type:</strong> {demoDisplayValue(results.illustrationSummary?.policyType)}</p>
          <p><strong>Policy Number:</strong> {maskPolicyNumber(results.illustrationSummary?.policyNumber)}</p>
          <p><strong>Issue Date:</strong> {demoDisplayValue(results.illustrationSummary?.issueDate)}</p>
          <p><strong>Death Benefit:</strong> {demoDisplayValue(results.illustrationSummary?.deathBenefit)}</p>
          <p><strong>Periodic Premium:</strong> {demoDisplayValue(results.illustrationSummary?.periodicPremium)}</p>
          <p><strong>Number of Statements Tracked:</strong> {results.statementResults.length}</p>

          <div style={{ marginTop: "16px" }}>
            <strong>Quick Read:</strong>{" "}
            {results.statementResults.length > 0
              ? "The system ingested the original illustration and is now tracking actual policy statements over time."
              : "The system has the baseline illustration but no statement history has been uploaded yet."}
          </div>
        </div>

        <div
          style={{
            marginTop: "40px",
            background: "#eef4ff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #c9dafc",
          }}
        >
          <h2>VaultAI Interpretation</h2>

          {results.vaultAiInterpretation.length > 0 ? (
            <div>
              {results.vaultAiInterpretation.map((item, index) => (
                <p key={index} style={{ marginBottom: "12px", lineHeight: "1.6" }}>
                  {item}
                </p>
              ))}
            </div>
          ) : (
            <p>No VaultAI interpretation yet.</p>
          )}
        </div>

        <div
          style={{
            marginTop: "30px",
            background: "#f8fbff",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #d7e3ff",
          }}
        >
          <h2>VaultAI Policy Explanation</h2>
          {results.vaultAiPolicyExplanation?.length > 0 ? (
            results.vaultAiPolicyExplanation.map((line, index) => (
              <p key={index} style={{ marginBottom: "10px", lineHeight: "1.6" }}>{line}</p>
            ))
          ) : (
            <p>Policy explanation will expand as additional trusted statement data becomes available.</p>
          )}
        </div>

        <div style={{ marginTop: "40px" }}>
          <h2>Debug Text Extraction</h2>
          <p style={{ color: "#666" }}>
            This section is mainly for internal review and validation.
          </p>

          <div style={{ marginTop: "20px", background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <h3>Normalized Intelligence Debug</h3>
            <p><strong>Current View Source:</strong> {currentViewLabel}</p>
            <p><strong>Readback Mode:</strong> {results.readbackStatus?.mode || "local_session"}</p>
            <p><strong>Loaded Policy ID:</strong> {results.readbackStatus?.policyId || "None"}</p>
            <p><strong>Loaded Documents:</strong> {results.readbackStatus?.documentCount ?? 0}</p>
            <p><strong>Loaded Snapshots:</strong> {results.readbackStatus?.snapshotCount ?? 0}</p>
            <p><strong>Loaded Statements:</strong> {results.readbackStatus?.statementCount ?? 0}</p>
            <p><strong>Loaded Analytics Record ID:</strong> {results.readbackStatus?.analyticsId || "None"}</p>
            <p><strong>Stored Documents Available:</strong> {results.readbackStatus?.storedDocumentCount ?? 0}</p>
            <p><strong>Readback Storage Paths:</strong> {results.readbackStatus?.storagePaths?.join(", ") || "None"}</p>
            <p><strong>Readback Error:</strong> {results.readbackStatus?.errorSummary || "None"}</p>
            <p><strong>Persistence Attempted:</strong> {results.persistenceStatus?.attempted ? "Yes" : "No"}</p>
            <p><strong>Persistence Mode:</strong> {results.persistenceStatus?.mode || "local_only"}</p>
            <p><strong>Persistence Succeeded:</strong> {results.persistenceStatus?.succeeded ? "Yes" : "No"}</p>
            <p><strong>Storage Configured:</strong> {results.persistenceStatus?.storageConfigured ? "Yes" : "No"}</p>
            <p><strong>File Upload Attempted:</strong> {results.persistenceStatus?.fileUploadAttempted ? "Yes" : "No"}</p>
            <p><strong>Uploaded File Count:</strong> {results.persistenceStatus?.uploadedFileCount ?? 0}</p>
            <p><strong>Saved Policy ID:</strong> {results.persistenceStatus?.policyId || "None"}</p>
            <p><strong>Saved Snapshots:</strong> {results.persistenceStatus?.snapshotCount ?? 0}</p>
            <p><strong>Saved Statement Rows:</strong> {results.persistenceStatus?.statementRowCount ?? 0}</p>
            <p><strong>Persistence Error:</strong> {results.persistenceStatus?.errorSummary || "None"}</p>
            <p><strong>Uploaded Storage Paths:</strong> {results.persistenceStatus?.uploadedStoragePaths?.join(", ") || "None"}</p>
            <p><strong>Duplicate Detection:</strong> {results.persistenceStatus?.duplicateDetections?.length > 0 ? JSON.stringify(results.persistenceStatus.duplicateDetections) : "None"}</p>
            <p><strong>Carrier Profile:</strong> {results.carrierProfile?.display_name || "None"}</p>
            <p><strong>Product Profile:</strong> {results.productProfile?.display_name || "None"}</p>
            <p><strong>Completeness Status:</strong> {results.completenessAssessment?.status || "Unknown"}</p>
            <p><strong>Missing Sections:</strong> {results.completenessAssessment?.missing_sections?.join(", ") || "None"}</p>
            <p><strong>Strategy Reference Hits:</strong> {results.strategyReferenceHits?.length || 0}</p>
            <p><strong>COI Source Kind:</strong> {results.normalizedAnalytics?.charge_summary?.coi_source_kind || "fallback"}</p>
            <p><strong>COI Confidence:</strong> {results.normalizedAnalytics?.charge_summary?.coi_confidence || "weak"}</p>
            <p><strong>Charge Visibility Status:</strong> {results.normalizedAnalytics?.charge_summary?.charge_visibility_status || "limited"}</p>
            <p><strong>Latest Statement Date Source:</strong> {results.comparisonSummary?.comparison_debug?.latest_statement_date_source || "missing"}</p>
            <h4>Normalized Policy Object</h4>
            <pre style={{ whiteSpace: "pre-wrap", background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              {results.normalizedPolicy ? JSON.stringify(results.normalizedPolicy, null, 2) : "No normalized policy object yet."}
            </pre>
            <h4>Normalized Analytics Object</h4>
            <pre style={{ whiteSpace: "pre-wrap", background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              {results.normalizedAnalytics ? JSON.stringify(results.normalizedAnalytics, null, 2) : "No normalized analytics object yet."}
            </pre>
            <h4>Comparison Summary</h4>
            <pre style={{ whiteSpace: "pre-wrap", background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              {results.comparisonSummary ? JSON.stringify(results.comparisonSummary, null, 2) : "No comparison summary yet."}
            </pre>
            <h4>Charge Summary</h4>
            <pre style={{ whiteSpace: "pre-wrap", background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              {results.normalizedAnalytics?.charge_summary ? JSON.stringify(results.normalizedAnalytics.charge_summary, null, 2) : "No charge summary yet."}
            </pre>
            <h4>Ratio Validation</h4>
            <pre style={{ whiteSpace: "pre-wrap", background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              {results.comparisonSummary?.comparison_debug
                ? JSON.stringify(
                    {
                      ratio_inputs: results.comparisonSummary.comparison_debug.ratio_inputs || {},
                      ratio_omissions: results.comparisonSummary.comparison_debug.ratio_omissions || [],
                      missing_fields: results.comparisonSummary.comparison_debug.missing_fields || [],
                    },
                    null,
                    2
                  )
                : "No ratio validation debug yet."}
            </pre>
            <h4>Completeness Assessment</h4>
            <pre style={{ whiteSpace: "pre-wrap", background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              {results.completenessAssessment ? JSON.stringify(results.completenessAssessment, null, 2) : "No completeness assessment yet."}
            </pre>
            <h4>Strategy Reference Hits</h4>
            <pre style={{ whiteSpace: "pre-wrap", background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              {results.strategyReferenceHits?.length > 0 ? JSON.stringify(results.strategyReferenceHits, null, 2) : "No strategy reference hits yet."}
            </pre>
            <h4>Coverage By Section Group</h4>
            <pre style={{ whiteSpace: "pre-wrap", background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              {results.normalizedPolicy?.extraction_meta?.coverage_summary
                ? JSON.stringify(results.normalizedPolicy.extraction_meta.coverage_summary, null, 2)
                : "No section coverage summary yet."}
            </pre>
          </div>

          <div style={{ marginTop: "20px", background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <h3>Illustration Parser Debug</h3>
            <p>
              <strong>Document Type:</strong> {results.baseline_illustration?.documentType?.document_type || "Unknown"}
              {" | "}
              <strong>Classification Confidence:</strong> {getConfidence(results.baseline_illustration?.documentType)}
              {" | "}
              <strong>Carrier Detection:</strong> {results.baseline_illustration?.carrierDetection?.carrier_name || "Unknown"}
            </p>
            <p>
              <strong>Coverage:</strong> {illustrationCoverage.captured}/{illustrationCoverage.attempted}
              {" | "}
              <strong>High:</strong> {illustrationCoverage.high}
              {" | "}
              <strong>Medium:</strong> {illustrationCoverage.medium}
              {" | "}
              <strong>Missing:</strong> {illustrationCoverage.missing}
            </p>
            {illustrationCoverage.missingFields.length > 0 ? (
              <p>
                <strong>Missing Fields:</strong> {illustrationCoverage.missingFields.join(", ")}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.classification_evidence?.length > 0 ? (
              <p>
                <strong>Classification Evidence:</strong> {results.baseline_illustration.parserDebug.classification_evidence.join(", ")}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.carrier_evidence?.length > 0 ? (
              <p>
                <strong>Carrier Evidence:</strong> {results.baseline_illustration.parserDebug.carrier_evidence.join(", ")}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.section_hits?.length > 0 ? (
              <p>
                <strong>Section Hits:</strong> {results.baseline_illustration.parserDebug.section_hits.join(", ")}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.unmatched_likely_labels?.length > 0 ? (
              <p>
                <strong>Unmatched Likely Labels:</strong> {results.baseline_illustration.parserDebug.unmatched_likely_labels.join(", ")}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.parsing_warnings?.length > 0 ? (
              <p>
                <strong>Parsing Warnings:</strong> {results.baseline_illustration.parserDebug.parsing_warnings.join(" | ")}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug ? (
              <p>
                <strong>Coverage Counts:</strong> Generic {results.baseline_illustration.parserDebug.generic_extraction_field_count ?? 0}
                {" | "}
                F&amp;G {results.baseline_illustration.parserDebug.fg_specific_extraction_field_count ?? 0}
                {" | "}
                Final {results.baseline_illustration.parserDebug.final_merged_field_count ?? 0}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.fields_overridden_by_fg?.length > 0 ? (
              <p>
                <strong>Fields Overridden By F&amp;G:</strong> {results.baseline_illustration.parserDebug.fields_overridden_by_fg.join(", ")}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.fields_reverted_to_generic?.length > 0 ? (
              <p>
                <strong>Fields Reverted To Generic:</strong> {results.baseline_illustration.parserDebug.fields_reverted_to_generic.join(", ")}
              </p>
            ) : null}
            {results.illustrationSummary?.__meta ? (
              Object.entries(results.illustrationSummary.__meta).map(([fieldName, meta]) => (
                <p key={fieldName}>
                  <strong>{fieldName}:</strong> {meta.value}
                  {" | "}
                  <strong>Label:</strong> {meta.raw_label || meta.matchedLabel || "None"}
                  {" | "}
                  <strong>Confidence:</strong> {getConfidence(meta)}
                  {" | "}
                  <strong>Method:</strong> {meta.extraction_method || meta.source}
                  {" | "}
                  <strong>Page:</strong> {meta.page_number || "N/A"}
                  {" | "}
                  <strong>Carrier Hint:</strong> {meta.carrier_hint || "None"}
                  {" | "}
                  <strong>Doc Type:</strong> {meta.document_type || "Unknown"}
                  {" | "}
                  <strong>Source Page Type:</strong> {meta.source_page_type || "generic"}
                  {" | "}
                  <strong>Suppression:</strong> {meta.suppression_reason || "None"}
                </p>
              ))
            ) : (
              <p>No illustration parser metadata yet.</p>
            )}
            {results.baseline_illustration?.parserDebug?.fg_strategy_split ? (
              <p>
                <strong>F&amp;G Strategy Split:</strong> Menu Available: {results.baseline_illustration.parserDebug.fg_strategy_split.strategy_menu_available ? "Yes" : "No"}
                {" | "}
                Current/Dominant Supported Strategy: {results.baseline_illustration.parserDebug.fg_strategy_split.current_or_dominant_strategy_if_supported || "Unconfirmed"}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.fg_premium_debug ? (
              <p>
                <strong>F&amp;G Premium Sources:</strong> Planned Premium {results.baseline_illustration.parserDebug.fg_premium_debug.planned_premium_source_row || "None"}
                {" | "}
                Annual Target Premium {results.baseline_illustration.parserDebug.fg_premium_debug.annual_target_premium_source_row || "None"}
                {" | "}
                Guideline Single Premium {results.baseline_illustration.parserDebug.fg_premium_debug.guideline_single_premium_source_row || "None"}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.fg_carrier_debug ? (
              <p>
                <strong>F&amp;G Carrier Winner:</strong> {results.baseline_illustration.parserDebug.fg_carrier_debug.carrier_name || "None"}
                {" | "}
                Page {results.baseline_illustration.parserDebug.fg_carrier_debug.winning_source_page || "N/A"}
                {" | "}
                Page Type {results.baseline_illustration.parserDebug.fg_carrier_debug.winning_source_page_type || "Unknown"}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.target_field_debug?.issue_date ? (
              <p>
                <strong>F&amp;G Issue Date Debug:</strong> Label {results.baseline_illustration.parserDebug.target_field_debug.issue_date.label_context || "None"}
                {" | "}
                Page Type {results.baseline_illustration.parserDebug.target_field_debug.issue_date.source_page_role || "Unknown"}
              </p>
            ) : null}
            {results.baseline_illustration?.parserDebug?.fg_strategy_menu_rows?.length > 0 ? (
              <p>
                <strong>F&amp;G Strategy Menu Rows:</strong> {JSON.stringify(results.baseline_illustration.parserDebug.fg_strategy_menu_rows)}
              </p>
            ) : null}
          </div>

          <div style={{ marginTop: "20px" }}>
            <h3>Illustration</h3>
            <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: "16px", borderRadius: "10px" }}>
              {results.illustrationText || "No illustration text yet."}
            </pre>
          </div>

          {results.statementResults.map((statement, idx) => (
            <div key={idx} style={{ marginTop: "20px" }}>
              {(() => {
                const statementCoverage = buildCoverageSummary(
                  statement.fields,
                  STATEMENT_COVERAGE_FIELDS
                );

                return (
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "12px" }}>
                <h3>Statement {idx + 1} Parser Debug</h3>
                <p>
                  <strong>Document Type:</strong> {statement.documentType?.document_type || "Unknown"}
                  {" | "}
                  <strong>Classification Confidence:</strong> {getConfidence(statement.documentType)}
                  {" | "}
                  <strong>Carrier Detection:</strong> {statement.carrierDetection?.carrier_name || "Unknown"}
                </p>
                <p>
                  <strong>Coverage:</strong> {statementCoverage.captured}/{statementCoverage.attempted}
                  {" | "}
                  <strong>High:</strong> {statementCoverage.high}
                  {" | "}
                  <strong>Medium:</strong> {statementCoverage.medium}
                  {" | "}
                  <strong>Missing:</strong> {statementCoverage.missing}
                </p>
                {statementCoverage.missingFields.length > 0 ? (
                  <p>
                    <strong>Missing Fields:</strong> {statementCoverage.missingFields.join(", ")}
                  </p>
                ) : null}
                {statement.parserDebug?.classification_evidence?.length > 0 ? (
                  <p>
                    <strong>Classification Evidence:</strong> {statement.parserDebug.classification_evidence.join(", ")}
                  </p>
                ) : null}
                {statement.parserDebug?.carrier_evidence?.length > 0 ? (
                  <p>
                    <strong>Carrier Evidence:</strong> {statement.parserDebug.carrier_evidence.join(", ")}
                  </p>
                ) : null}
                {statement.parserDebug?.section_hits?.length > 0 ? (
                  <p>
                    <strong>Section Hits:</strong> {statement.parserDebug.section_hits.join(", ")}
                  </p>
                ) : null}
                {statement.parserDebug?.unmatched_likely_labels?.length > 0 ? (
                  <p>
                    <strong>Unmatched Likely Labels:</strong> {statement.parserDebug.unmatched_likely_labels.join(", ")}
                  </p>
                ) : null}
                {statement.parserDebug?.parsing_warnings?.length > 0 ? (
                  <p>
                    <strong>Parsing Warnings:</strong> {statement.parserDebug.parsing_warnings.join(" | ")}
                  </p>
                ) : null}
                {statement.parserDebug ? (
                  <p>
                    <strong>Coverage Counts:</strong> Generic {statement.parserDebug.generic_extraction_field_count ?? 0}
                    {" | "}
                    F&amp;G {statement.parserDebug.fg_specific_extraction_field_count ?? 0}
                    {" | "}
                    Final {statement.parserDebug.final_merged_field_count ?? 0}
                  </p>
                ) : null}
                {statement.parserDebug?.fields_overridden_by_fg?.length > 0 ? (
                  <p>
                    <strong>Fields Overridden By F&amp;G:</strong> {statement.parserDebug.fields_overridden_by_fg.join(", ")}
                  </p>
                ) : null}
                {statement.parserDebug?.fields_reverted_to_generic?.length > 0 ? (
                  <p>
                    <strong>Fields Reverted To Generic:</strong> {statement.parserDebug.fields_reverted_to_generic.join(", ")}
                  </p>
                ) : null}
                {statement.summary?.__meta ? (
                  Object.entries(statement.summary.__meta).map(([fieldName, meta]) => (
                    <p key={fieldName}>
                      <strong>{fieldName}:</strong> {meta.value}
                      {" | "}
                      <strong>Label:</strong> {meta.raw_label || meta.matchedLabel || "None"}
                      {" | "}
                      <strong>Confidence:</strong> {getConfidence(meta)}
                      {" | "}
                      <strong>Method:</strong> {meta.extraction_method || meta.source}
                      {" | "}
                      <strong>Page:</strong> {meta.page_number || "N/A"}
                      {" | "}
                      <strong>Carrier Hint:</strong> {meta.carrier_hint || "None"}
                      {" | "}
                      <strong>Doc Type:</strong> {meta.document_type || "Unknown"}
                      {" | "}
                      <strong>Source Page Type:</strong> {meta.source_page_type || "generic"}
                      {" | "}
                      <strong>Suppression:</strong> {meta.suppression_reason || "None"}
                    </p>
                  ))
                ) : (
                  <p>No statement parser metadata yet.</p>
                )}
                {statement.parserDebug?.fg_monthly_activity ? (
                  <p>
                    <strong>F&amp;G Monthly Activity:</strong> Rows {statement.parserDebug.fg_monthly_activity.row_count}
                    {" | "}
                    Ending Account Value {statement.parserDebug.fg_monthly_activity.ending_account_value || "Unknown"}
                  </p>
                ) : null}
                {statement.parserDebug?.fg_statement_date_debug ? (
                  <p>
                    <strong>F&amp;G Statement Date Debug:</strong> {statement.parserDebug.fg_statement_date_debug.parsed_statement_date || "None"}
                    {" | "}
                    Source {statement.parserDebug.fg_statement_date_debug.source_page_type || "Unknown"}
                    {" | "}
                    Filename Fallback {statement.parserDebug.fg_statement_date_debug.used_filename_fallback ? "Yes" : "No"}
                    {" | "}
                    Generated {statement.parserDebug.fg_statement_date_debug.generated_date || "None"}
                    {" | "}
                    Period {statement.parserDebug.fg_statement_date_debug.statement_period_date || "None"}
                    {" | "}
                    Chosen Sort Date {statement.parserDebug.fg_statement_date_debug.chosen_sort_date || "None"}
                  </p>
                ) : null}
                {statement.parserDebug?.rejected_footnote_marker_candidates?.length > 0 ? (
                  <p>
                    <strong>Rejected Footnote Candidates:</strong> {statement.parserDebug.rejected_footnote_marker_candidates.join(", ")}
                  </p>
                ) : null}
                {statement.parserDebug?.charge_field_debug?.cost_of_insurance ? (
                  <p>
                    <strong>Charge Debug:</strong> COI {statement.parserDebug.charge_field_debug.cost_of_insurance.winning_value || "None"}
                    {" | "}
                    COI Source {statement.parserDebug.charge_field_debug.cost_of_insurance.source_kind || "Unknown"}
                    {" | "}
                    COI Confidence {statement.parserDebug.charge_field_debug.cost_of_insurance.charge_confidence_label || "weak"}
                    {" | "}
                    Expense {statement.parserDebug.charge_field_debug.expense_charge?.winning_value || "None"}
                    {" | "}
                    Rider {statement.parserDebug.charge_field_debug.rider_charge?.winning_value || "None"}
                    {" | "}
                    Admin {statement.parserDebug.charge_field_debug.admin_fee?.winning_value || "None"}
                    {" | "}
                    Monthly Deduction {statement.parserDebug.charge_field_debug.monthly_deduction?.winning_value || "None"}
                  </p>
                ) : null}
                {statement.parserDebug?.fg_strategy_split ? (
                  <p>
                    <strong>F&amp;G Strategy Split:</strong> Menu Available: {statement.parserDebug.fg_strategy_split.strategy_menu_available ? "Yes" : "No"}
                    {" | "}
                    Current/Dominant Supported Strategy: {statement.parserDebug.fg_strategy_split.current_or_dominant_strategy_if_supported || "Unconfirmed"}
                  </p>
                ) : null}
                {statement.parserDebug?.fg_strategy_menu_rows?.length > 0 ? (
                  <p>
                    <strong>F&amp;G Strategy Menu Rows:</strong> {JSON.stringify(statement.parserDebug.fg_strategy_menu_rows)}
                  </p>
                ) : null}
                {statement.parserDebug?.fg_strategy_rows_collected?.length > 0 ? (
                  <p>
                    <strong>F&amp;G Strategy Rows Collected:</strong> {JSON.stringify(statement.parserDebug.fg_strategy_rows_collected)}
                  </p>
                ) : null}
                {statement.parserDebug?.fg_strategy_split?.winning_displayed_strategy_row ? (
                  <p>
                    <strong>Winning Strategy Row:</strong> {JSON.stringify(statement.parserDebug.fg_strategy_split.winning_displayed_strategy_row)}
                  </p>
                ) : null}
                {statement.parserDebug?.fg_strategy_split?.suppressed_historical_segment_rows?.length > 0 ? (
                  <p>
                    <strong>Suppressed Historical Segment Rows:</strong> {statement.parserDebug.fg_strategy_split.suppressed_historical_segment_rows.join(", ")}
                  </p>
                ) : null}
              </div>
                );
              })()}
              <h3>Statement {idx + 1}: {statement.fileName}</h3>
              <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: "16px", borderRadius: "10px" }}>
                {statement.text || "No statement text yet."}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
