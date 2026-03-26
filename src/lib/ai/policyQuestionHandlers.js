function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
  return `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function supporting_data(label, value) {
  return { label, value: value ?? "Unavailable" };
}

function followups(...items) {
  return [...new Set(items.filter(Boolean))];
}

function answer(answerText, confidence, supporting = [], missing = [], suggestions = []) {
  return {
    answer: answerText,
    confidence,
    supporting_data: supporting,
    missing_data: missing,
    suggested_followups: suggestions,
  };
}

function buildInsufficientDataAnswer(message, suggested = []) {
  return answer(
    message,
    "low",
    [],
    ["The current file does not contain enough clean evidence for a stronger answer."],
    suggested.length ? suggested : ["What should I review first?", "Is the data complete enough to trust?"]
  );
}

export function explainPolicyType({ lifePolicy }) {
  const detection = lifePolicy?.meta?.policyTypeDetection;
  return answer(
    `This reads most like a ${lifePolicy?.meta?.policyTypeLabel || "life insurance policy"}.`,
    detection?.confidence >= 0.8 ? "high" : detection?.confidence >= 0.55 ? "moderate" : "low",
    [
      supporting_data("Detected type", lifePolicy?.meta?.policyTypeLabel || "Unknown"),
      supporting_data("Confidence", detection?.confidence ?? "Unavailable"),
    ],
    detection?.evidence?.length ? [] : ["Product-type evidence is thin."],
    followups("Is this policy healthy?", "What should I review first?", "Is the data complete enough to trust?")
  );
}

export function explainPolicyHealth({ lifePolicy, insightSummary }) {
  if (!insightSummary) {
    return buildInsufficientDataAnswer("Policy health cannot be resolved because the AI summary is unavailable.");
  }
  const label =
    insightSummary.status === "strong"
      ? "healthy"
      : insightSummary.status === "moderate"
        ? "mixed and needs review"
        : insightSummary.status === "weak"
          ? "weak"
          : "not yet reliable enough to score";
  return answer(
    `This policy currently reads as ${label}. ${insightSummary.summary}`,
    insightSummary.status === "insufficient_data" ? "low" : "moderate",
    insightSummary.insights.slice(0, 3).map((item) => supporting_data(item.type, item.message)),
    insightSummary.missingData || [],
    followups("What should I review first?", "Are there any risk flags?", "What charges are hurting it?")
  );
}

export function explainWhatToReviewFirst({ interpretation, insightSummary }) {
  const reviewItems = interpretation?.review_items || [];
  return answer(
    reviewItems.length
      ? `Start with these items first: ${reviewItems.slice(0, 3).join(" ")}`
      : "Start with statement freshness, charge visibility, and whether the product-type details are complete enough to trust the read.",
    reviewItems.length ? "high" : "moderate",
    reviewItems.slice(0, 3).map((item, index) => supporting_data(`Priority ${index + 1}`, item)),
    insightSummary?.missingData || [],
    followups("Is the data complete enough to trust?", "Are there any risk flags?", "What charges are hurting it?")
  );
}

export function explainDataCompleteness({ lifePolicy, comparisonSummary = {}, insightSummary }) {
  const missing = [
    ...(insightSummary?.missingData || []),
    ...((comparisonSummary?.missing_fields || []).slice(0, 6).map((field) => `${field} is missing.`)),
  ];
  return answer(
    missing.length
      ? "The current read is useful, but confidence is still limited by missing statement support and incomplete field coverage."
      : "The current file has enough visible support for a reasonably grounded read.",
    missing.length >= 4 ? "low" : missing.length >= 1 ? "moderate" : "high",
    [
      supporting_data("Statement count", lifePolicy?.meta?.statementCount ?? 0),
      supporting_data("Completeness status", lifePolicy?.meta?.dataCompletenessStatus || "Unavailable"),
    ],
    [...new Set(missing)],
    followups("What should I review first?", "Are there any risk flags?", "What kind of policy is this?")
  );
}

export function explainPerformance({ normalizedAnalytics = {}, comparisonSummary = {}, insightSummary }) {
  const illustrationComparison = normalizedAnalytics?.illustration_comparison || {};
  const growthAttribution = normalizedAnalytics?.growth_attribution || {};

  if (illustrationComparison?.comparison_possible) {
    return answer(
      illustrationComparison?.narrative || "Illustration variance support is available.",
      "high",
      [
        supporting_data("Illustration support", "Available"),
        supporting_data("Latest statement", comparisonSummary?.latest_statement_date || "Unavailable"),
      ],
      insightSummary?.missingData || [],
      followups("What charges are hurting it?", "Are loans creating risk?", "What should I review first?")
    );
  }

  if (growthAttribution?.efficiency_status) {
    return answer(
      growthAttribution?.efficiency_status === "growth_pressured"
        ? "Visible growth is under pressure relative to the funding support visible in the file."
        : "Visible growth is currently holding up reasonably well relative to the confirmed funding support.",
      "moderate",
      [supporting_data("Net visible growth", growthAttribution?.net_growth_display || "Limited")],
      insightSummary?.missingData || [],
      followups("What charges are hurting it?", "What should I review first?", "Is the data complete enough to trust?")
    );
  }

  return buildInsufficientDataAnswer("There is not enough clean growth support yet to explain performance confidently.");
}

export function explainCharges({ lifePolicy, normalizedAnalytics = {}, comparisonSummary = {} }) {
  const chargeSummary = normalizedAnalytics?.charge_summary || {};
  if (chargeSummary?.total_coi === null && chargeSummary?.total_visible_policy_charges === null) {
    return buildInsufficientDataAnswer("Charges are not visible enough in this file to explain fee drag confidently.");
  }
  return answer(
    "Charges are a meaningful part of this policy read. Cost of insurance should be treated as the first charge line to review.",
    comparisonSummary?.coi_confidence === "weak" ? "low" : "moderate",
    [
      supporting_data("Visible COI", formatCurrency(chargeSummary?.total_coi)),
      supporting_data("Visible charges", formatCurrency(chargeSummary?.total_visible_policy_charges)),
      supporting_data("Charge visibility", comparisonSummary?.charge_visibility_status || "Limited"),
    ],
    comparisonSummary?.charge_visibility_status === "limited" ? ["Charge visibility is limited."] : [],
    followups("Is this policy healthy?", "Are loans creating risk?", "What should I review first?")
  );
}

export function explainLoans({ lifePolicy }) {
  if (!lifePolicy?.loans?.loanBalance) {
    return buildInsufficientDataAnswer("Loan balance is not clearly visible in the current file.");
  }
  return answer(
    `Visible loan balance is ${lifePolicy.loans.loanBalance}. Any loan on a permanent policy should be reviewed together with cash value, charges, and statement trend.`,
    "moderate",
    [supporting_data("Loan balance", lifePolicy.loans.loanBalance)],
    [],
    followups("What charges are hurting it?", "Is this policy healthy?", "What should I review first?")
  );
}

export function explainStrategy({ lifePolicy }) {
  if (!lifePolicy?.typeSpecific?.strategy) {
    return buildInsufficientDataAnswer("Strategy detail is not visible enough to explain the indexed allocation cleanly.");
  }
  return answer(
    `The visible strategy currently points to ${lifePolicy.typeSpecific.strategy}.`,
    "moderate",
    [
      supporting_data("Strategy", lifePolicy.typeSpecific.strategy),
      supporting_data("Participation rate", lifePolicy.typeSpecific.participationRate || "Unavailable"),
      supporting_data("Cap rate", lifePolicy.typeSpecific.capRate || "Unavailable"),
      supporting_data("Spread", lifePolicy.typeSpecific.spread || "Unavailable"),
    ],
    [],
    followups("Is this policy performing well?", "Are we ahead or behind the original illustration?", "What charges are hurting it?")
  );
}

export function explainIllustrationVariancePlaceholder({ normalizedAnalytics = {} }) {
  const illustrationComparison = normalizedAnalytics?.illustration_comparison || {};
  if (!illustrationComparison?.comparison_possible) {
    return buildInsufficientDataAnswer("Illustration-versus-actual comparison is not strong enough yet.");
  }
  return answer(
    illustrationComparison?.narrative || "Illustration comparison is available but still evolving.",
    "high",
    [supporting_data("Illustration support", "Available")],
    [],
    followups("Is this policy performing well?", "What charges are hurting it?", "What should I review first?")
  );
}

export function explainWholeLifeBehavior({ lifePolicy }) {
  return answer(
    lifePolicy?.values?.cashValue
      ? `This looks like a traditional permanent policy read. Visible cash value is ${lifePolicy.values.cashValue}, and the main question is whether guaranteed value and dividend support are both visible enough.`
      : "Whole life behavior is only partially visible because cash-value support is incomplete.",
    lifePolicy?.values?.cashValue ? "moderate" : "low",
    [supporting_data("Cash value", lifePolicy?.values?.cashValue || "Unavailable")],
    lifePolicy?.typeSpecific?.dividendOption ? [] : ["Dividend option is not clearly visible."],
    followups("Are dividends visible?", "Is there loan pressure?", "What should I review first?")
  );
}

export function explainDividendVisibility({ lifePolicy }) {
  if (!lifePolicy?.typeSpecific?.dividendOption) {
    return buildInsufficientDataAnswer("Dividend visibility is limited in the current file.");
  }
  return answer(
    `Dividend option appears visible as ${lifePolicy.typeSpecific.dividendOption}.`,
    "moderate",
    [supporting_data("Dividend option", lifePolicy.typeSpecific.dividendOption)],
    [],
    followups("Is cash value progressing steadily?", "Is there loan pressure?", "What should I review first?")
  );
}

export function explainWholeLifeLoanRisk({ lifePolicy }) {
  return explainLoans({ lifePolicy });
}

export function explainTermCoverage({ lifePolicy }) {
  return answer(
    lifePolicy?.coverage?.deathBenefit
      ? `This reads like pure death-benefit protection with visible coverage of ${lifePolicy.coverage.deathBenefit}.`
      : "This appears to be term coverage, but the visible death-benefit support is incomplete.",
    lifePolicy?.coverage?.deathBenefit ? "moderate" : "low",
    [supporting_data("Death benefit", lifePolicy?.coverage?.deathBenefit || "Unavailable")],
    [],
    followups("When does this coverage end?", "Is there conversion visibility?", "What should I review first?")
  );
}

export function explainTermExpiration({ lifePolicy }) {
  if (!lifePolicy?.typeSpecific?.termEndDate) {
    return buildInsufficientDataAnswer("Term expiration is not clearly visible in the current file.");
  }
  return answer(
    `Coverage appears to continue until ${lifePolicy.typeSpecific.termEndDate}.`,
    "high",
    [supporting_data("Term end date", lifePolicy.typeSpecific.termEndDate)],
    [],
    followups("Is there conversion visibility?", "What should I review first?", "Is the data complete enough to trust?")
  );
}

export function explainTermConversionVisibility({ lifePolicy }) {
  if (!lifePolicy?.typeSpecific?.conversionOption) {
    return buildInsufficientDataAnswer("Conversion-option visibility is limited.");
  }
  return answer(
    `Conversion support appears visible: ${lifePolicy.typeSpecific.conversionOption}.`,
    "moderate",
    [supporting_data("Conversion option", lifePolicy.typeSpecific.conversionOption)],
    [],
    followups("When does this coverage end?", "What should I review first?", "Is this policy healthy?")
  );
}

export function explainFinalExpenseStructure({ lifePolicy }) {
  return answer(
    `This reads like a final expense policy with visible benefit structure centered on ${lifePolicy.coverage?.deathBenefit || "an unresolved face amount"}.`,
    "moderate",
    [
      supporting_data("Detected type", lifePolicy?.meta?.policyTypeLabel || "Final expense"),
      supporting_data("Death benefit", lifePolicy?.coverage?.deathBenefit || "Unavailable"),
    ],
    [],
    followups("Is there a waiting period?", "Is this permanent coverage?", "What should I review first?")
  );
}

export function explainWaitingPeriodVisibility({ lifePolicy }) {
  if (!lifePolicy?.typeSpecific?.waitingPeriod && !lifePolicy?.typeSpecific?.gradedBenefit) {
    return buildInsufficientDataAnswer("Waiting-period or graded-benefit visibility is limited.");
  }
  return answer(
    `Visible waiting-period structure: ${lifePolicy.typeSpecific.waitingPeriod || lifePolicy.typeSpecific.gradedBenefit}.`,
    "moderate",
    [supporting_data("Waiting-period visibility", lifePolicy.typeSpecific.waitingPeriod || lifePolicy.typeSpecific.gradedBenefit)],
    [],
    followups("What is the benefit structure?", "Is this permanent coverage?", "What should I review first?")
  );
}

export function explainFinalExpenseFit({ lifePolicy }) {
  return answer(
    "Final expense fit depends on whether the premium mode, face amount, and any waiting-period structure match the household's shortfall need. This file can support that review only if those basics are visible.",
    "low",
    [
      supporting_data("Death benefit", lifePolicy?.coverage?.deathBenefit || "Unavailable"),
      supporting_data("Premium mode", lifePolicy?.typeSpecific?.premiumMode || "Unavailable"),
    ],
    [],
    followups("Is there a waiting period?", "What is the benefit structure?", "What should I review first?")
  );
}

export function answerPolicyQuestion(questionText, context = {}) {
  const question = String(questionText || "").toLowerCase();
  const policyType = context?.lifePolicy?.meta?.policyType || "unknown";

  if (question.includes("what kind")) return explainPolicyType(context);
  if (question.includes("healthy") || question.includes("performing well")) return explainPolicyHealth(context);
  if (question.includes("review first")) return explainWhatToReviewFirst(context);
  if (question.includes("complete enough") || question.includes("trust")) return explainDataCompleteness(context);
  if (question.includes("risk")) return explainPolicyHealth(context);

  if (policyType === "iul" || policyType === "ul") {
    if (question.includes("loan")) return explainLoans(context);
    if (question.includes("strategy")) return explainStrategy(context);
    if (question.includes("charge") || question.includes("fee")) return explainCharges(context);
    if (question.includes("ahead") || question.includes("behind") || question.includes("illustration")) {
      return explainIllustrationVariancePlaceholder(context);
    }
    return explainPerformance(context);
  }

  if (policyType === "whole_life") {
    if (question.includes("dividend")) return explainDividendVisibility(context);
    if (question.includes("loan")) return explainWholeLifeLoanRisk(context);
    return explainWholeLifeBehavior(context);
  }

  if (policyType === "term") {
    if (question.includes("conversion")) return explainTermConversionVisibility(context);
    if (question.includes("expire") || question.includes("end")) return explainTermExpiration(context);
    return explainTermCoverage(context);
  }

  if (policyType === "final_expense") {
    if (question.includes("waiting") || question.includes("graded")) return explainWaitingPeriodVisibility(context);
    if (question.includes("fit") || question.includes("appropriate")) return explainFinalExpenseFit(context);
    return explainFinalExpenseStructure(context);
  }

  return explainPolicyHealth(context);
}
