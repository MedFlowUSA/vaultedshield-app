import { buildMortgageReviewSignals } from "../lib/domain/mortgage/mortgageIntelligence.js";
import { MORTGAGE_QUESTION_TYPES } from "./mortgageQuestionClassifier.js";

function dedupe(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[$,%\s,]/g, ""));
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function buildFact(label, value, source = "mortgage_engine") {
  if (value === null || value === undefined || value === "") return null;
  return { label, value: String(value), source };
}

function mapConfidence(score = 0) {
  if (score >= 0.74) return "high";
  if (score >= 0.48) return "medium";
  return "low";
}

function buildSectionTargets(type, context) {
  switch (type) {
    case MORTGAGE_QUESTION_TYPES.payment_structure:
      return ["loan-summary"];
    case MORTGAGE_QUESTION_TYPES.balance_status:
      return context.balanceVisible ? ["loan-summary"] : ["documents", "loan-summary"];
    case MORTGAGE_QUESTION_TYPES.escrow:
      return context.review.metrics?.escrowVisible ? ["loan-summary"] : ["documents"];
    case MORTGAGE_QUESTION_TYPES.rate_structure:
      return ["loan-summary"];
    case MORTGAGE_QUESTION_TYPES.linkage_status:
      return ["linked-context", "continuity-command"];
    case MORTGAGE_QUESTION_TYPES.missing_data:
      return ["documents", "linked-context"];
    case MORTGAGE_QUESTION_TYPES.general:
    default:
      return context.review.flags?.length > 0
        ? ["continuity-command", "documents"]
        : ["loan-summary"];
  }
}

function buildMortgageContext({
  mortgage = {},
  analytics = {},
  precomputed = {},
} = {}) {
  const documents = Array.isArray(precomputed.mortgageDocuments) ? precomputed.mortgageDocuments : [];
  const snapshots = Array.isArray(precomputed.mortgageSnapshots) ? precomputed.mortgageSnapshots : [];
  const propertyLinks = Array.isArray(precomputed.propertyLinks) ? precomputed.propertyLinks : [];
  const linkedContext = precomputed.linkedContext || null;
  const review =
    precomputed.mortgageReview ||
    buildMortgageReviewSignals({
      mortgageLoan: mortgage,
      documents,
      propertyLinks,
      snapshots,
    });
  const latestSnapshot = snapshots[0] || null;
  const normalizedMortgage = latestSnapshot?.normalized_mortgage || analytics?.normalized_mortgage || {};
  const balanceMetrics = normalizedMortgage.balance_metrics || {};
  const paymentMetrics = normalizedMortgage.payment_metrics || {};
  const rateTerms = normalizedMortgage.rate_terms || {};
  const escrowMetrics = normalizedMortgage.escrow_metrics || {};

  return {
    mortgage,
    analytics,
    documents,
    snapshots,
    propertyLinks,
    linkedContext,
    review,
    balanceVisible: Boolean(
      balanceMetrics.current_principal_balance ||
        balanceMetrics.unpaid_principal_balance ||
        balanceMetrics.payoff_amount
    ),
    paymentValue: paymentMetrics.monthly_payment || mortgage.monthly_payment || null,
    rateValue: rateTerms.interest_rate || mortgage.interest_rate || null,
    payoffValue: balanceMetrics.payoff_amount || null,
    principalBalance:
      balanceMetrics.current_principal_balance ||
      balanceMetrics.unpaid_principal_balance ||
      mortgage.current_principal_balance ||
      null,
    escrowBalance: escrowMetrics.escrow_balance || null,
  };
}

function buildSharedFacts(context) {
  return [
    buildFact("Loan status", context.mortgage.current_status || "unknown"),
    buildFact("Lender", context.mortgage.lender_key || "Limited visibility"),
    buildFact("Monthly payment", formatCurrency(context.paymentValue)),
    buildFact("Principal balance", formatCurrency(context.principalBalance)),
    buildFact("Interest rate", context.rateValue),
    buildFact("Payoff status", context.review.metrics?.payoffStatus || "limited"),
    buildFact("Escrow visibility", context.review.metrics?.escrowVisible ? "Visible" : "Limited"),
    buildFact("Property links", context.propertyLinks.length),
    buildFact("Documents", context.documents.length),
    buildFact("Snapshots", context.snapshots.length),
  ].filter(Boolean);
}

function buildUncertainties(context) {
  return dedupe([
    !context.documents.some((document) => document?.document_class_key === "monthly_statement")
      ? "No monthly statement is visible yet, so payment and escrow support remain incomplete."
      : null,
    context.propertyLinks.length === 0
      ? "No linked property is visible yet, so collateral linkage cannot be fully confirmed."
      : null,
    !context.review.metrics?.interestRateVisible
      ? "Interest-rate visibility is still limited in the current mortgage read."
      : null,
    !context.review.metrics?.monthlyPaymentVisible
      ? "Monthly payment visibility is still limited in the current mortgage read."
      : null,
    !context.review.metrics?.escrowVisible && context.mortgage?.mortgage_loan_type_key !== "heloc"
      ? "Escrow support is not yet clear from the available records."
      : null,
    !context.review.metrics?.principalBalanceVisible
      ? "Current principal or payoff balance is not clearly visible yet."
      : null,
  ]);
}

function buildReviewFocus(context) {
  return dedupe([
    context.review.notes?.[0],
    context.review.notes?.[1],
    context.review.metrics?.documentSupport
      ? `Document support currently reads ${context.review.metrics.documentSupport}.`
      : null,
  ]).slice(0, 4);
}

function buildResponseByType(type, context) {
  switch (type) {
    case MORTGAGE_QUESTION_TYPES.payment_structure:
      return {
        answer: context.review.metrics?.monthlyPaymentVisible
          ? "Based on available data, the payment structure is partly readable because monthly payment support is visible in the current mortgage record."
          : "Based on available data, the payment structure is still only partly readable because a current monthly-payment view is not yet visible.",
        whyThisRead: dedupe([
          context.review.headline,
          context.review.metrics?.amortizationSupport === "supported"
            ? "Amortization support is visible enough to read payment structure more confidently."
            : "Amortization support is still limited, so payment structure should be reviewed with care.",
          context.paymentValue ? `Visible monthly payment: ${formatCurrency(context.paymentValue)}.` : null,
        ]).slice(0, 4),
      };
    case MORTGAGE_QUESTION_TYPES.balance_status:
      return {
        answer: context.balanceVisible
          ? "Based on available data, balance visibility is usable enough to review payoff status and current loan positioning."
          : "Based on available data, balance visibility is still incomplete, so payoff and remaining-loan positioning are not fully supported yet.",
        whyThisRead: dedupe([
          context.payoffValue ? `Visible payoff amount: ${formatCurrency(context.payoffValue)}.` : null,
          context.principalBalance
            ? `Visible principal balance: ${formatCurrency(context.principalBalance)}.`
            : null,
          context.review.metrics?.yearsToMaturity !== null && context.review.metrics?.yearsToMaturity !== undefined
            ? `Years to maturity: ${context.review.metrics.yearsToMaturity}.`
            : "Maturity timing is still limited in the current read.",
        ]).slice(0, 4),
      };
    case MORTGAGE_QUESTION_TYPES.escrow:
      return {
        answer: context.review.metrics?.escrowVisible
          ? "Based on available data, escrow appears to be visible enough for a basic review."
          : "Based on available data, escrow is not clearly visible yet, so tax-and-insurance handling should be treated as incomplete.",
        whyThisRead: dedupe([
          context.escrowBalance ? `Visible escrow balance: ${formatCurrency(context.escrowBalance)}.` : null,
          context.documents.some((document) =>
            ["escrow_analysis", "escrow_statement", "tax_and_insurance_escrow_notice"].includes(
              document?.document_class_key
            )
          )
            ? "Escrow-related documents are attached to this mortgage."
            : "No dedicated escrow document is currently visible.",
          context.review.notes?.find((item) => item.toLowerCase().includes("escrow")) || null,
        ]).slice(0, 4),
      };
    case MORTGAGE_QUESTION_TYPES.rate_structure:
      return {
        answer: context.review.metrics?.interestRateVisible
          ? "Based on available data, rate structure is visible enough for a practical review."
          : "Based on available data, rate structure is still only partly visible, so the current loan terms should be treated cautiously.",
        whyThisRead: dedupe([
          context.rateValue ? `Visible interest rate: ${context.rateValue}.` : null,
          context.mortgage?.mortgage_loan_type_key
            ? `Loan type reads as ${context.mortgage.mortgage_loan_type_key.replace(/_/g, " ")}.`
            : null,
          context.review.metrics?.refinanceStatus
            ? `Rate-review status currently reads ${context.review.metrics.refinanceStatus}.`
            : null,
        ]).slice(0, 4),
      };
    case MORTGAGE_QUESTION_TYPES.linkage_status:
      return {
        answer: context.propertyLinks.length > 0
          ? "Based on available data, this mortgage appears linked into the property stack, although the strength of that linkage still depends on the visible primary connection and supporting context."
          : "Based on available data, this mortgage is not yet linked cleanly enough to a property record, so the broader household read stays fragmented.",
        whyThisRead: dedupe([
          `Linked properties visible: ${context.propertyLinks.length}.`,
          context.review.metrics?.primaryLinkVisible
            ? "A primary property connection is visible."
            : "A clear primary property connection is not yet confirmed.",
          context.linkedContext?.propertyRows?.length
            ? `Linked context includes ${context.linkedContext.propertyRows.length} property-side row${context.linkedContext.propertyRows.length === 1 ? "" : "s"}.`
            : null,
        ]).slice(0, 4),
      };
    case MORTGAGE_QUESTION_TYPES.missing_data:
      return {
        answer: buildUncertainties(context).length > 0
          ? `Based on available data, the clearest missing areas are ${buildUncertainties(context)
              .slice(0, 2)
              .join(" ")}`
          : "Based on available data, no major missing-data blocker is standing out in the current mortgage review.",
        whyThisRead: buildUncertainties(context).slice(0, 4),
      };
    case MORTGAGE_QUESTION_TYPES.general:
    default:
      return {
        answer:
          context.review.headline ||
          "Based on available data, this mortgage is readable at a high level, but stronger debt review still depends on documents, payment visibility, and property linkage.",
        whyThisRead: dedupe([
          context.review.headline,
          context.review.notes?.[0],
          context.review.notes?.[1],
        ]).slice(0, 4),
      };
  }
}

export function generateMortgageResponse({
  question = "",
  type = MORTGAGE_QUESTION_TYPES.general,
  mortgage = {},
  analytics = {},
  precomputed = {},
} = {}) {
  const context = buildMortgageContext({
    mortgage,
    analytics,
    precomputed,
  });
  const core = buildResponseByType(type, context);
  const facts = buildSharedFacts(context);
  const uncertainties = buildUncertainties(context);
  const safeReviewFocus = buildReviewFocus(context);

  return {
    answer: core.answer,
    whyThisRead: core.whyThisRead || [],
    why_this_read: core.whyThisRead || [],
    supportingData: {
      question: String(question || "").trim(),
      type,
      facts,
      uncertainties,
      review_focus: safeReviewFocus,
    },
    supporting_data: {
      question: String(question || "").trim(),
      type,
      facts,
      uncertainties,
      review_focus: safeReviewFocus,
      why: core.whyThisRead || [],
    },
    uncertainty:
      uncertainties.length > 0
        ? "A more complete mortgage review would require stronger statement, balance, or linkage support."
        : null,
    safeReviewFocus: safeReviewFocus,
    safe_review_focus: safeReviewFocus,
    confidence: mapConfidence(context.review.confidence),
    source: "mortgage_engine",
    sourceMetadata: {
      label: "mortgage_engine",
      recordId: mortgage?.id || null,
      documentCount: context.documents.length,
      snapshotCount: context.snapshots.length,
      propertyLinkCount: context.propertyLinks.length,
    },
    source_metadata: {
      label: "mortgage_engine",
      record_id: mortgage?.id || null,
      document_count: context.documents.length,
      snapshot_count: context.snapshots.length,
      property_link_count: context.propertyLinks.length,
    },
    sectionTargets: buildSectionTargets(type, context),
  };
}

export default generateMortgageResponse;
