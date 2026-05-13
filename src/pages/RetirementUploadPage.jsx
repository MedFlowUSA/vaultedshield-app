import { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../components/shared/EmptyState";
import { usePlatformShellData } from "../lib/intelligence/PlatformShellDataContext";
import { extractRetirementSummary } from "../lib/domain/retirement/retirementExtraction";
import { analyzeRetirementReadiness } from "../lib/domain/retirement/retirementIntelligence";
import { scoreRetirementGoal } from "../lib/domain/retirement/retirementGoalScore";
import { loadRetirementGoalSnapshot, saveRetirementGoalSnapshot } from "../lib/domain/retirement/retirementGoalStorage";
import useResponsiveLayout from "../lib/ui/useResponsiveLayout";
import { extractPdfTextSafe } from "../utils/pdf/safePdfExtraction";

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

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not detected";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function numericInputStyle() {
  return {
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    boxSizing: "border-box",
  };
}

function getStatusTone(status) {
  if (status === "On Track") return { background: "#dcfce7", color: "#166534" };
  if (status === "Moderately Behind") return { background: "#fef3c7", color: "#92400e" };
  if (status === "Behind") return { background: "#fee2e2", color: "#b45309" };
  return { background: "#fee2e2", color: "#991b1b" };
}

function mapExtractionError(error) {
  switch (error?.extractionKind) {
    case "invalid_file":
      return error.message || "Please choose a valid retirement PDF and retry.";
    case "oversized_mobile_pdf":
      return error.message || "This PDF is too large for reliable mobile processing.";
    case "file_read_failed":
      return "We could not read this retirement PDF on the current device. Try re-exporting or rescanning it.";
    case "pdf_open_failed":
      return "We could not open this retirement PDF. Try a fresh portal export or a cleaner scan.";
    case "page_extraction_failed":
      return error.message || "One or more pages in this retirement PDF could not be read.";
    default:
      return "We could not process this retirement PDF yet. Please retry with a clearer export or scan.";
  }
}

function buildEmptyResult(file) {
  return {
    id: `${file.name}-${file.lastModified}-${file.size}`,
    fileName: file.name,
    pageCount: 0,
    success: false,
    status: "error",
    statusLabel: "Extraction failed",
    extraction: null,
    summary: {
      accountValue: null,
      contributions: null,
      accountType: null,
      statementDate: null,
      status: "limited",
      missingFields: [],
    },
    warnings: [],
    classifiedError: null,
    errorMessage: "",
  };
}

const DEFAULT_GOAL_FORM = {
  currentAge: "40",
  retirementAge: "65",
  retirementHorizonYears: "",
  desiredMonthlyIncome: "9000",
  socialSecurityMonthly: "",
  pensionMonthly: "",
  annualContribution: "",
  annualGrowthRate: "5",
  currentAssets: "",
};

export default function RetirementUploadPage({ onNavigate }) {
  const { isMobile, isTablet } = useResponsiveLayout();
  const { debug } = usePlatformShellData();
  const uploadSectionRef = useRef(null);
  const goalSectionRef = useRef(null);
  const readinessSectionRef = useRef(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [goalForm, setGoalForm] = useState(DEFAULT_GOAL_FORM);
  const [plannerReadyForPersistence, setPlannerReadyForPersistence] = useState(false);
  const storageScope = useMemo(
    () => ({
      userId: debug.authUserId || null,
      householdId: debug.householdId || null,
    }),
    [debug.authUserId, debug.householdId]
  );

  const successful = useMemo(() => results.filter((item) => item.status === "success"), [results]);
  const extractedCurrentAssets = useMemo(
    () => successful.reduce((sum, item) => sum + (item.summary.accountValue || 0), 0),
    [successful]
  );
  const extractedAnnualContribution = useMemo(
    () => successful.reduce((sum, item) => sum + (item.summary.contributions || 0), 0),
    [successful]
  );
  const latestStatement = useMemo(
    () =>
      successful
        .map((item) => item.summary.statementDate)
        .filter(Boolean)
        .sort()
        .at(-1) || "Not detected",
    [successful]
  );

  const plannerInputs = useMemo(() => {
    const currentAssets =
      goalForm.currentAssets !== "" ? Number(goalForm.currentAssets) : extractedCurrentAssets;
    const annualContribution =
      goalForm.annualContribution !== "" ? Number(goalForm.annualContribution) : extractedAnnualContribution;

    return {
      currentAge: Number(goalForm.currentAge),
      retirementAge: Number(goalForm.retirementAge),
      retirementHorizonYears: goalForm.retirementHorizonYears === "" ? null : Number(goalForm.retirementHorizonYears),
      currentAssets,
      annualContribution,
      annualGrowthRate: Number(goalForm.annualGrowthRate),
      desiredMonthlyIncome: Number(goalForm.desiredMonthlyIncome),
      socialSecurityMonthly: Number(goalForm.socialSecurityMonthly || 0),
      pensionMonthly: Number(goalForm.pensionMonthly || 0),
    };
  }, [extractedAnnualContribution, extractedCurrentAssets, goalForm]);

  const readiness = useMemo(() => scoreRetirementGoal(plannerInputs), [plannerInputs]);

  useEffect(() => {
    const stored = loadRetirementGoalSnapshot(storageScope);
    queueMicrotask(() => {
      if (stored?.goalForm) {
        setGoalForm((current) => ({ ...current, ...stored.goalForm }));
      }
      setPlannerReadyForPersistence(true);
    });
  }, [storageScope]);

  useEffect(() => {
    if (!plannerReadyForPersistence) return;
    saveRetirementGoalSnapshot(storageScope, {
      goalForm,
      plannerSnapshot: {
        currentAssets: plannerInputs.currentAssets || 0,
        annualContribution: plannerInputs.annualContribution || 0,
        latestStatement,
      },
      readiness,
      updatedAt: new Date().toISOString(),
    });
  }, [goalForm, latestStatement, plannerInputs.annualContribution, plannerInputs.currentAssets, plannerReadyForPersistence, readiness, storageScope]);

  const whatChangesThis = useMemo(() => {
    const items = [];
    if ((plannerInputs.annualContribution || 0) < 15000) items.push("Increase contributions to improve projected balance growth.");
    if ((plannerInputs.retirementAge || 0) <= 62) items.push("Retiring later adds contribution years and shortens the drawdown horizon.");
    if ((plannerInputs.desiredMonthlyIncome || 0) > 10000) items.push("A lower target retirement income reduces the asset base needed to support the gap.");
    if ((plannerInputs.currentAssets || 0) < readiness.estimatedTargetAssets * 0.4) items.push("Improving current savings pace or consolidating more retirement assets would strengthen readiness.");
    return items.slice(0, 4);
  }, [plannerInputs, readiness.estimatedTargetAssets]);

  async function handleFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    setLoading(true);
    setError("");
    const nextResults = [];

    for (const file of files) {
      try {
        const extraction = await extractPdfTextSafe(file);
        const summary = extractRetirementSummary(extraction.text);
        const retirementRead = analyzeRetirementReadiness({ summary, extraction });
        nextResults.push({
          id: `${file.name}-${file.lastModified}-${file.size}`,
          fileName: file.name,
          pageCount: extraction.pageCount,
          success: extraction.success,
          status: "success",
          statusLabel: summary.status === "complete" ? "Ready for review" : "Ready with limited data",
          extraction,
          summary,
          retirementRead,
          warnings: extraction.warnings || [],
          classifiedError: extraction.classifiedError || null,
          errorMessage: "",
        });
      } catch (fileError) {
        const failedResult = buildEmptyResult(file);
        failedResult.errorMessage = mapExtractionError(fileError);
        failedResult.classifiedError =
          fileError?.extractionResult?.classifiedError ||
          (fileError?.extractionKind ? { kind: fileError.extractionKind, message: fileError.message || "" } : null);
        nextResults.push(failedResult);
      }
    }

    setResults((current) => [...nextResults, ...current]);
    setLoading(false);
  }

  function updateGoalField(field, value) {
    setGoalForm((current) => ({ ...current, [field]: value }));
  }

  const readinessTone =
    readiness.readinessScore >= 75
      ? "good"
      : readiness.readinessScore >= 58
        ? "info"
        : readiness.readinessScore >= 40
          ? "warning"
          : "alert";
  const retirementUploadHeadline =
    successful.length > 0
      ? "Retirement picture is beginning to take shape"
      : "Start with a few retirement statements first";
  const retirementUploadSummary =
    successful.length > 0
      ? `${successful.length} retirement statement${successful.length === 1 ? "" : "s"} have been read, and VaultedShield is using those values to build a first planning view.`
      : "This page is the easiest place to turn retirement PDFs into a plain-English planning read before you go deeper.";

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <div
        style={{
          padding: "32px 36px",
          borderRadius: "24px",
          background: "linear-gradient(135deg, #0f172a 0%, #7c3aed 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>Retirement</div>
            <div style={{ fontSize: "28px", fontWeight: 900, lineHeight: "1.2" }}>Retirement Intake</div>
            <div style={{ fontSize: "15px", opacity: 0.75, lineHeight: "1.6", maxWidth: "520px" }}>{retirementUploadSummary}</div>
          </div>
          <div style={{ padding: "16px 20px", borderRadius: "18px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", display: "grid", gap: "4px", textAlign: "center", minWidth: "100px", flexShrink: 0 }}>
            <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1, color: "#c4b5fd" }}>{readiness.readinessScore}</div>
            <div style={{ fontSize: "11px", opacity: 0.6, fontWeight: 700, textTransform: "uppercase" }}>readiness</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[
            { label: "PDFs processed", value: results.length },
            { label: "Successful reads", value: successful.length },
            { label: "Current assets", value: extractedCurrentAssets > 0 ? formatCurrency(extractedCurrentAssets) : "Not detected" },
            { label: "Latest statement", value: latestStatement },
          ].map((item) => (
            <div key={item.label} style={{ padding: "10px 14px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: "11px", opacity: 0.55, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "2px" }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => uploadSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ padding: "10px 16px", borderRadius: "12px", border: "none", background: "#6d28d9", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            Add Retirement PDFs
          </button>
          <button type="button" onClick={() => goalSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            Adjust Planning Target
          </button>
          <button type="button" onClick={() => onNavigate?.("/retirement")} style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#ffffff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
            Back To Retirement Hub
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        {[
          {
            kicker: "Start Here",
            title: successful.length > 0 ? "Add more statements if you have them" : "Upload the first retirement statements",
            detail: "Use exported 401(k), IRA, pension, or brokerage retirement PDFs. Even a small set is enough to start a useful first read.",
            metric: `${results.length} file${results.length === 1 ? "" : "s"}`,
            tone: successful.length > 0 ? "good" : "info",
            statusLabel: "Simple Read",
            actionLabel: "Open Intake",
            onAction: () => uploadSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "What To Adjust",
            title: "Set the planning target in plain language",
            detail: "If the extracted values are incomplete, you can still enter your retirement age, income target, and contribution pace manually.",
            metric: `${goalForm.retirementAge || "65"} target age`,
            tone: "warning",
            statusLabel: "Guided Focus",
            actionLabel: "Open Goal Inputs",
            onAction: () => goalSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          },
          {
            kicker: "What This Produces",
            title: "See a first-pass readiness result",
            detail: "VaultedShield translates the current records and assumptions into one retirement readiness read before the deeper planning details.",
            metric: `${readiness.readinessScore}/100`,
            tone: readinessTone,
            statusLabel: "Needs Review",
            actionLabel: "See Readiness",
            onAction: () => readinessSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
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

      <div ref={uploadSectionRef} style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Retirement PDF Intake</div>
          <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Upload 401(k), IRA, pension, or brokerage retirement statements. Files are parsed locally and are not saved yet.</div>
        </div>
        <div style={{ display: "grid", gap: "14px" }}>
          <label
            htmlFor="retirement-upload-input"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "fit-content",
              padding: "12px 16px",
              borderRadius: "12px",
              background: "#0f172a",
              color: "#ffffff",
              fontWeight: 700,
              cursor: loading ? "progress" : "pointer",
            }}
          >
            {loading ? "Preparing Retirement PDF Review..." : "Select Retirement PDFs"}
          </label>
          <input
            id="retirement-upload-input"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={loading}
            onChange={handleFilesSelected}
            style={{ display: "none" }}
          />
          <div style={{ color: "#475569", lineHeight: "1.7" }}>
            Supported starter reads include 401(k), IRA, rollover IRA, pension, and brokerage retirement statement PDFs. If extracted data is limited, you can still use the planner manually.
          </div>
          <div style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>
            {results.length > 0
              ? `${successful.length} retirement PDF${successful.length === 1 ? "" : "s"} ready for review.`
              : "No retirement PDFs added yet."}
          </div>
          {error ? <div style={{ color: "#991b1b", fontSize: "14px" }}>{error}</div> : null}
        </div>
      </div>

      <div ref={goalSectionRef} style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Retirement Goal</div>
          <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Enter your planning target in plain terms. This is a practical estimate, not financial advice.</div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: "14px 16px",
          }}
        >
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>Current age</span>
            <input value={goalForm.currentAge} onChange={(event) => updateGoalField("currentAge", event.target.value)} inputMode="numeric" style={numericInputStyle()} />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>Desired retirement age</span>
            <input value={goalForm.retirementAge} onChange={(event) => updateGoalField("retirementAge", event.target.value)} inputMode="numeric" style={numericInputStyle()} />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>Retirement horizon in years</span>
            <input value={goalForm.retirementHorizonYears} onChange={(event) => updateGoalField("retirementHorizonYears", event.target.value)} inputMode="numeric" placeholder="Optional override" style={numericInputStyle()} />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>Desired monthly retirement income</span>
            <input value={goalForm.desiredMonthlyIncome} onChange={(event) => updateGoalField("desiredMonthlyIncome", event.target.value)} inputMode="decimal" style={numericInputStyle()} />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>Expected Social Security monthly income</span>
            <input value={goalForm.socialSecurityMonthly} onChange={(event) => updateGoalField("socialSecurityMonthly", event.target.value)} inputMode="decimal" placeholder="Optional" style={numericInputStyle()} />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>Expected pension monthly income</span>
            <input value={goalForm.pensionMonthly} onChange={(event) => updateGoalField("pensionMonthly", event.target.value)} inputMode="decimal" placeholder="Optional" style={numericInputStyle()} />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>Current retirement assets</span>
            <input
              value={goalForm.currentAssets}
              onChange={(event) => updateGoalField("currentAssets", event.target.value)}
              inputMode="decimal"
              placeholder={extractedCurrentAssets > 0 ? `Using extracted ${formatCurrency(extractedCurrentAssets)}` : "Enter current assets"}
              style={numericInputStyle()}
            />
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>Annual contribution amount</span>
            <input
              value={goalForm.annualContribution}
              onChange={(event) => updateGoalField("annualContribution", event.target.value)}
              inputMode="decimal"
              placeholder={extractedAnnualContribution > 0 ? `Using extracted ${formatCurrency(extractedAnnualContribution)}` : "Enter annual contributions"}
              style={numericInputStyle()}
            />
          </label>
          <label style={{ display: "grid", gap: "6px", gridColumn: isMobile ? "auto" : "1 / -1" }}>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>Expected annual growth rate (%)</span>
            <input value={goalForm.annualGrowthRate} onChange={(event) => updateGoalField("annualGrowthRate", event.target.value)} inputMode="decimal" style={numericInputStyle()} />
          </label>
        </div>
        <div style={{ marginTop: "14px", color: "#64748b", lineHeight: "1.7" }}>
          This estimate uses current inputs plus a simple planning rule. If extracted retirement data is limited, you can still enter values manually and use the planner.
        </div>
        <div
          style={{
            marginTop: "14px",
            padding: "14px 16px",
            borderRadius: "14px",
            background: "#f8fafc",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            display: "grid",
            gap: "8px",
          }}
        >
          <div style={{ fontWeight: 700, color: "#0f172a" }}>Assumptions Used</div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {readiness.assumptionLines.map((item) => (
              <div
                key={item}
                style={{
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "#ffffff",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  color: "#475569",
                  fontSize: "13px",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div ref={readinessSectionRef} style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Retirement Readiness Summary</div>
          <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>A practical first-pass view of how your current savings pace compares with your target.</div>
        </div>
        <div style={{ display: "grid", gap: "18px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isTablet ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            {[
              { label: "Current Retirement Assets", value: formatCurrency(plannerInputs.currentAssets || 0) },
              { label: "Annual Contributions", value: formatCurrency(plannerInputs.annualContribution || 0) },
              { label: "Target Retirement Income", value: formatCurrency(plannerInputs.desiredMonthlyIncome || 0) },
              { label: "Projected Retirement Balance", value: formatCurrency(readiness.projectedRetirementBalance) },
              { label: "Estimated Income Gap", value: formatCurrency(readiness.estimatedIncomeGapMonthly) },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "14px 16px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.label}</div>
                <div style={{ fontWeight: 800, fontSize: "20px", color: "#0f172a" }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "999px",
                background: getStatusTone(readiness.readinessStatus).background,
                color: getStatusTone(readiness.readinessStatus).color,
                fontWeight: 800,
                fontSize: "13px",
              }}
            >
              {readiness.readinessStatus}
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>{readiness.readinessScore}/100</div>
            <div style={{ color: "#64748b" }}>Estimated non-portfolio income: {formatCurrency(readiness.estimatedNonPortfolioIncomeMonthly)}/month</div>
          </div>

          {readiness.validationMessages.length > 0 ? (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "14px",
                background: "#fff7ed",
                border: "1px solid rgba(251, 191, 36, 0.35)",
                color: "#92400e",
                display: "grid",
                gap: "8px",
              }}
            >
              <div style={{ fontWeight: 700 }}>Planning guardrails</div>
              <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "6px" }}>
                {readiness.validationMessages.map((item) => (
                  <li key={item} style={{ lineHeight: "1.6" }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div
            style={{
              padding: "16px 18px",
              borderRadius: "16px",
              background: "#ffffff",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              color: "#475569",
              lineHeight: "1.8",
            }}
          >
            {readiness.explanation}
          </div>

          <div style={{ color: "#64748b", lineHeight: "1.7" }}>
            This score is an estimate based on your current inputs and assumptions, including a {readiness.assumptions.annualGrowthRatePercent}% annual growth rate and a simple 4% planning rule. It is designed for planning clarity and is not financial advice.
          </div>

          {whatChangesThis.length > 0 ? (
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "16px",
                background: "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ fontWeight: 700, color: "#0f172a" }}>What Changes This Result?</div>
              <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "8px", color: "#475569" }}>
                {whatChangesThis.map((item) => (
                  <li key={item} style={{ lineHeight: "1.7" }}>
                    {item}
                  </li>
                ))}
                </ul>
              </div>
            ) : null}
          </div>
      </div>

      <div style={surfaceCard({ padding: "22px 24px", display: "grid", gap: "14px" })}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Retirement Extraction Results</div>
          <div style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>Each file shows extraction status, page count, and a starter retirement summary.</div>
        </div>
        {results.length === 0 ? (
          <EmptyState
            title="No retirement PDFs added yet"
            description="Upload one or more retirement PDFs to preview the shared safe-PDF extraction layer, starter retirement field detection, and readiness scoring."
          />
        ) : (
          <div style={{ display: "grid", gap: "14px" }}>
            {results.map((result) => (
              <div
                key={result.id}
                style={{
                  padding: "16px",
                  borderRadius: "16px",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  background: result.status === "error" ? "#fff7ed" : "#f8fafc",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>{result.fileName}</div>
                    <div style={{ color: "#64748b", fontSize: "14px" }}>
                      {result.pageCount > 0 ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"}` : "No readable pages detected"}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: "999px",
                      background: result.status === "error" ? "#fee2e2" : "#dcfce7",
                      color: result.status === "error" ? "#991b1b" : "#166534",
                      fontWeight: 700,
                      fontSize: "12px",
                    }}
                  >
                    {result.statusLabel}
                  </div>
                </div>

                {result.status === "error" ? (
                  <div style={{ color: "#991b1b", lineHeight: "1.7" }}>{result.errorMessage}</div>
                ) : (
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "10px 14px",
                        color: "#475569",
                      }}
                    >
                      <div><strong>Account Value:</strong> {formatCurrency(result.summary.accountValue)}</div>
                      <div><strong>Contributions:</strong> {formatCurrency(result.summary.contributions)}</div>
                      <div><strong>Account Type:</strong> {result.summary.accountType || "Not detected"}</div>
                      <div><strong>Statement Date:</strong> {result.summary.statementDate || "Not detected"}</div>
                      <div><strong>Read Status:</strong> {result.retirementRead?.readinessStatus || "Needs Review"}</div>
                      <div><strong>Read Confidence:</strong> {Math.round((result.retirementRead?.confidence || 0) * 100)}%</div>
                    </div>
                    <div style={{ color: "#475569", lineHeight: "1.7" }}>
                      {result.retirementRead?.headline || "Retirement read summary is not available yet."}
                    </div>
                    {result.retirementRead?.notes?.length > 0 ? (
                      <ul style={{ margin: "0 0 0 18px", padding: 0, display: "grid", gap: "6px", color: "#64748b" }}>
                        {result.retirementRead.notes.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                    {result.warnings?.length > 0 ? (
                      <div style={{ display: "grid", gap: "6px", color: "#92400e" }}>
                        {result.warnings.map((warning) => (
                          <div key={`${result.id}-${warning}`}>{warning}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}

                {result.status !== "error" ? (
                  <div style={{ color: "#64748b", lineHeight: "1.7" }}>
                    {result.summary.status === "complete"
                      ? "This retirement PDF is ready for review."
                      : `Limited data detected. Missing fields: ${result.summary.missingFields.join(", ") || "none"}. You can still review it and enter planner values manually.`}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
