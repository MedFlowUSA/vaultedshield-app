function normalizeConfidenceLabel(value) {
  if (!value) return "Developing";
  const normalized = String(value).toLowerCase();
  if (normalized === "high" || normalized === "strong") return "High";
  if (normalized === "moderate" || normalized === "usable") return "Moderate";
  return "Developing";
}

function toSeverity(status) {
  const normalized = String(status || "").toLowerCase();
  if (["behind", "underfunded", "high", "at_risk", "weak", "needs_attention"].includes(normalized)) return "high";
  if (
    ["moderate", "mixed", "watch", "unclear", "limited", "basic", "partial", "review", "unknown", "indeterminate", "developing"].includes(
      normalized
    )
  ) {
    return "medium";
  }
  return "low";
}

function pickHighestSeverity(items = []) {
  const rank = { high: 3, medium: 2, low: 1 };
  return [...items].sort((left, right) => (rank[right.severity] || 0) - (rank[left.severity] || 0))[0] || null;
}

function buildReviewQuestion(label, status, answer) {
  return {
    label,
    status,
    answer,
  };
}

export function buildIulPolicyVerdict({
  results = {},
  evidenceAudit = null,
  pressureSummary = null,
  policyInterpretation = null,
  nextSteps = [],
} = {}) {
  const iulV2 = results.iulV2 || {};
  const illustration = iulV2.illustrationComparison || {};
  const charge = iulV2.chargeAnalysis || {};
  const funding = iulV2.fundingAnalysis || {};
  const risk = iulV2.riskAnalysis || {};
  const strategy = iulV2.strategyAnalysis || {};
  const missingData = Array.isArray(iulV2.missingData) ? iulV2.missingData : [];

  const pressureStack = [
    {
      label: "Illustration Pace",
      severity: toSeverity(illustration.status),
      status: illustration.status || "indeterminate",
      explanation:
        illustration.shortExplanation ||
        illustration.explanation ||
        "Illustration alignment is still developing.",
    },
    {
      label: "Charge Drag",
      severity: toSeverity(charge.chargeDragLevel),
      status: charge.chargeDragLevel || "unknown",
      explanation:
        charge.explanation ||
        "Visible charge drag is still developing.",
    },
    {
      label: "Funding Support",
      severity: toSeverity(funding.status),
      status: funding.status || "unclear",
      explanation:
        funding.explanation ||
        "Funding support is still developing.",
    },
    {
      label: "Loan And Lapse Pressure",
      severity: toSeverity(risk.overallRisk),
      status: risk.overallRisk || "unclear",
      explanation:
        risk.explanation ||
        "Loan and lapse pressure are still developing.",
    },
    {
      label: "Evidence Quality",
      severity:
        evidenceAudit?.overallStatus === "strong"
          ? "low"
          : evidenceAudit?.overallStatus === "usable"
            ? "medium"
            : "high",
      status: evidenceAudit?.overallStatus || "developing",
      explanation:
        evidenceAudit?.headline ||
        "Evidence confidence is still developing.",
    },
    {
      label: "Strategy Visibility",
      severity: toSeverity(strategy.concentrationLevel || strategy.confidence),
      status: strategy.concentrationLevel || strategy.confidence || "limited",
      explanation:
        strategy.explanation ||
        "Strategy visibility is still developing.",
    },
  ].sort((left, right) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return (rank[right.severity] || 0) - (rank[left.severity] || 0);
  });

  const topPressure = pressureStack[0] || null;
  const confidenceLabel = normalizeConfidenceLabel(evidenceAudit?.overallStatus);
  const missingLink =
    missingData[0] ||
    pressureSummary?.checklist?.[0] ||
    nextSteps[0] ||
    "A stronger statement trail would sharpen this read.";

  let verdict = "Watch Closely";
  if (topPressure?.severity === "high") verdict = "Under Pressure";
  else if (topPressure?.severity === "low" && (evidenceAudit?.overallStatus === "strong" || evidenceAudit?.evidenceScore >= 80)) verdict = "Healthy";

  const headline =
    verdict === "Healthy"
      ? "This IUL currently appears broadly stable based on the available in-force evidence."
      : verdict === "Under Pressure"
        ? "This IUL appears to be under visible pressure and should be reviewed before it is treated as on track."
        : "This IUL appears readable, but it should be watched closely because one or more performance drivers still show pressure.";

  const rationale =
    policyInterpretation?.bottom_line_summary ||
    topPressure?.explanation ||
    "The current statement suggests the policy can be interpreted, but the strongest conclusion still depends on the quality of statement, charge, and illustration support.";

  const reviewQuestions = [
    buildReviewQuestion(
      "Is it keeping pace?",
      illustration.status === "ahead" || illustration.status === "on_track" ? "good" : illustration.status === "behind" ? "risk" : "watch",
      illustration.shortExplanation || illustration.explanation || "Illustration pacing is still indeterminate."
    ),
    buildReviewQuestion(
      "Are charges creating drag?",
      charge.chargeDragLevel === "low" ? "good" : charge.chargeDragLevel === "high" ? "risk" : "watch",
      charge.explanation || "Charge drag is still developing."
    ),
    buildReviewQuestion(
      "Is funding support adequate?",
      funding.status === "sufficient" ? "good" : funding.status === "underfunded" ? "risk" : "watch",
      funding.explanation || "Funding support is still developing."
    ),
    buildReviewQuestion(
      "Are loans increasing pressure?",
      risk.overallRisk === "low" ? "good" : risk.overallRisk === "high" ? "risk" : "watch",
      risk.explanation || "Loan and lapse pressure are still developing."
    ),
    buildReviewQuestion(
      "Is the evidence strong enough to trust this read?",
      evidenceAudit?.overallStatus === "strong" ? "good" : evidenceAudit?.overallStatus === "usable" ? "watch" : "risk",
      evidenceAudit?.headline || "Evidence strength is still developing."
    ),
  ];

  return {
    verdict,
    confidenceLabel,
    headline,
    rationale,
    primaryDriver: topPressure?.label || "Evidence quality",
    primaryDriverDetail: topPressure?.explanation || "No single dominant driver is standing out yet.",
    missingLink,
    pressureStack: pressureStack.slice(0, 5),
    reviewQuestions,
    reviewOrder: (pressureSummary?.checklist?.length ? pressureSummary.checklist : nextSteps).slice(0, 4),
  };
}
