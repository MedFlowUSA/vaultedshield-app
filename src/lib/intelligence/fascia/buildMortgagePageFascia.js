import {
  buildFasciaExplanation,
  buildFasciaExplanationToggleAction,
  finalizeFascia,
  normalizeFasciaAction,
} from "./fasciaContract.js";

function safeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildMeaning({ status, loanLabel }) {
  if (status === "Strong") {
    return `${loanLabel} looks strong. We have enough data to understand the loan clearly.`;
  }

  if (status === "Stable") {
    return `${loanLabel} looks mostly stable right now, but it should still be checked from time to time.`;
  }

  if (status === "At Risk") {
    return `${loanLabel} shows a problem that needs attention before you treat it as okay.`;
  }

  if (status === "Incomplete") {
    return `${loanLabel} is partly readable, but key mortgage details are still missing.`;
  }

  if (status === "Partial") {
    return `${loanLabel} has some usable mortgage data, but not enough yet for a full answer.`;
  }

  if (status === "Needs Review") {
    return `${loanLabel} is readable, but something still needs a closer look before you rely on it.`;
  }

  return "There is not enough mortgage data yet to tell what is going on.";
}

function buildExplanationSummary({ meaning, bundleWarnings = [] }) {
  if (bundleWarnings.length > 0) {
    return `${meaning} This is based on the mortgage data we could load, while some supporting details are still unavailable.`;
  }

  return `${meaning} This is based on the mortgage record, documents, and property link we have loaded.`;
}

function buildDrivers({
  mortgageReview,
  mortgageCommandCenter,
  documentCount,
  snapshotCount,
  propertyLinkCount,
  bundleWarnings = [],
}) {
  const drivers = [];
  const blockerIds = new Set((mortgageCommandCenter?.blockers || []).map((item) => item?.id).filter(Boolean));
  const addDriver = (weight, text, condition = true) => {
    if (!condition || !text) return;
    drivers.push({ weight, text });
  };

  addDriver(1, "Mortgage documents are attached", documentCount > 0);
  addDriver(1, "Collateral property linkage is visible", propertyLinkCount > 0);
  addDriver(1, "Critical mortgage blockers are active", safeNumber(mortgageCommandCenter?.metrics?.critical, 0) > 0);
  addDriver(1, "Statement support is still limited", blockerIds.has("mortgage-no-documents") || mortgageReview?.flags?.includes("statement_missing"));
  addDriver(1, "Collateral linkage is still missing", blockerIds.has("mortgage-no-property-link") || propertyLinkCount === 0);
  addDriver(2, "Debt review currently reads better supported", mortgageReview?.readinessStatus === "Better Supported");
  addDriver(2, "Mortgage review should stay active", mortgageReview?.readinessStatus === "Review Soon");
  addDriver(2, "Escrow visibility is still limited", mortgageReview?.flags?.includes("escrow_visibility_limited"));
  addDriver(2, "Parsed mortgage snapshots are visible", snapshotCount > 0);
  addDriver(2, "Some supporting mortgage context is temporarily unavailable", bundleWarnings.length > 0);
  addDriver(3, "Servicer identity still needs confirmation", mortgageReview?.flags?.includes("lender_unconfirmed"));
  addDriver(3, "Command-center follow-up items are still visible", safeNumber(mortgageCommandCenter?.metrics?.warning, 0) > 0);

  return unique(
    drivers
      .sort((left, right) => left.weight - right.weight)
      .map((item) => item.text)
  );
}

function buildDataSources({
  documentCount,
  snapshotCount,
  analyticsCount,
  propertyLinkCount,
  bundleWarnings = [],
}) {
  const sources = [
    "The live mortgage loan record and its current servicing status",
    documentCount > 0
      ? `${pluralize(documentCount, "attached mortgage document")} and statement-support signals`
      : "Current document-support checks for mortgage statements and uploads",
    propertyLinkCount > 0
      ? `${pluralize(propertyLinkCount, "collateral property link")} tied to this loan`
      : "Collateral-linkage checks between this loan and household property records",
  ];

  if (snapshotCount > 0) {
    sources.push(`${pluralize(snapshotCount, "parsed mortgage snapshot")} from normalized mortgage records`);
  }

  if (analyticsCount > 0) {
    sources.push(`${pluralize(analyticsCount, "mortgage analytics output")} from the live bundle`);
  }

  if (bundleWarnings.length > 0) {
    sources.push("A partial-visibility check because some supporting mortgage context is temporarily unavailable");
  }

  return unique(sources).slice(0, 5);
}

function buildStatusReasoning({
  status,
  mortgageReview,
  confidence,
  criticalCount,
  warningCount,
  documentCount,
  propertyLinkCount,
  bundleWarnings = [],
  blockerIds = new Set(),
  currentStatus = "",
}) {
  if (status === "Strong") {
    return "This status was assigned because statement support is present, collateral linkage is visible, confidence is high, and the current mortgage review does not show a live operating blocker.";
  }

  if (status === "Stable") {
    return "This status was assigned because the current bundle reads as generally supported and linked, even though routine mortgage review should still stay active.";
  }

  if (status === "At Risk") {
    return currentStatus === "delinquent" || blockerIds.has("mortgage-stale-statement")
      ? "This status was assigned because the mortgage shows active debt pressure or a critical evidence-timing problem that should be reviewed before the loan is treated as steady."
      : "This status was assigned because the current mortgage bundle shows enough critical pressure that it should not be treated as settled yet.";
  }

  if (status === "Incomplete") {
    return "This status was assigned because the mortgage can be read, but missing statement support, missing collateral linkage, or very low confidence materially weaken the current interpretation.";
  }

  if (status === "Partial") {
    return "This status was assigned because some mortgage evidence is present, but the bundle still lacks enough connected support to form a confident interpretation.";
  }

  if (status === "Needs Review") {
    return criticalCount > 0 || warningCount > 0 || mortgageReview?.readinessStatus === "Review Soon"
      ? "This status was assigned because the bundle is usable, but live review pressure, unresolved blockers, or support gaps still need follow-up."
      : "This status was assigned because the current mortgage bundle is readable, but not settled enough to leave unattended.";
  }

  if (bundleWarnings.length > 0) {
    return "This status was assigned because only a partial live mortgage bundle is currently available.";
  }

  if (documentCount === 0 && propertyLinkCount === 0 && confidence <= 0) {
    return "This status was assigned because the page does not yet have enough statement, linkage, or confidence support for a reliable mortgage interpretation.";
  }

  return "This status was assigned because the page does not yet have enough readable mortgage evidence for a dependable interpretation.";
}

function buildLimitations({
  documentCount,
  snapshotCount,
  analyticsCount,
  propertyLinkCount,
  bundleWarnings = [],
  blockerIds = new Set(),
  confidence,
  currentStatus = "",
  mortgageReview,
}) {
  const limitations = [];

  if (bundleWarnings.length > 0) {
    limitations.push("Some supporting mortgage context is temporarily unavailable, so this explanation is based on the verified bundle elements that could be loaded safely.");
  }

  if (documentCount === 0 || blockerIds.has("mortgage-no-documents")) {
    limitations.push("No attached mortgage documents are currently confirming the latest statement view.");
  }

  if (propertyLinkCount === 0 || blockerIds.has("mortgage-no-property-link")) {
    limitations.push("This loan is not yet fully linked to a collateral property record, which limits collateral confidence.");
  }

  if (snapshotCount === 0 && analyticsCount === 0) {
    limitations.push("Parsed mortgage snapshots and downstream analytics are still limited, so the interpretation relies more heavily on core loan and document signals.");
  }

  if (confidence > 0 && confidence < 0.55) {
    limitations.push(`Mortgage review confidence remains limited at ${Math.round(confidence * 100)}%, so the bundle should be treated as provisional.`);
  }

  if (currentStatus === "delinquent") {
    limitations.push("The loan is currently marked delinquent, which overrides an otherwise steady reading.");
  }

  if (mortgageReview?.flags?.includes("escrow_visibility_limited")) {
    limitations.push("Escrow visibility is still limited in the current bundle.");
  }

  if (mortgageReview?.flags?.includes("lender_unconfirmed")) {
    limitations.push("Servicer identity still needs confirmation in the current record.");
  }

  if (limitations.length === 0) {
    limitations.push("No major confidence limitation stands out beyond the normal need to keep mortgage documents and linkage current.");
  }

  return unique(limitations).slice(0, 4);
}

function buildTargetAction(label, section) {
  if (!label || !section) return null;
  return normalizeFasciaAction({
    label,
    target: {
      type: "scroll_section",
      section,
    },
  });
}

function buildActions({
  status,
  mortgageReview,
  mortgageCommandCenter,
  documentCount,
  propertyLinkCount,
}) {
  const blockerIds = new Set((mortgageCommandCenter?.blockers || []).map((item) => item?.id).filter(Boolean));

  if (status === "Not Enough Data") {
    return {
      primaryAction: buildTargetAction("Review loan summary", "loan-summary"),
      secondaryAction: null,
    };
  }

  if (blockerIds.has("mortgage-no-documents") || documentCount === 0) {
    return {
      primaryAction: buildTargetAction("Upload mortgage documents", "documents"),
      secondaryAction: propertyLinkCount === 0 ? buildTargetAction("Link property", "property-linking") : buildTargetAction("Review mortgage command", "continuity-command"),
    };
  }

  if (blockerIds.has("mortgage-no-property-link") || propertyLinkCount === 0) {
    return {
      primaryAction: buildTargetAction("Link property", "property-linking"),
      secondaryAction: buildTargetAction("Review mortgage command", "continuity-command"),
    };
  }

  if (status === "At Risk" || status === "Needs Review" || mortgageReview?.readinessStatus === "Review Soon") {
    return {
      primaryAction: buildTargetAction("Review mortgage command", "continuity-command"),
      secondaryAction: buildTargetAction("Review loan summary", "loan-summary"),
    };
  }

  if (status === "Strong" || status === "Stable") {
    return {
      primaryAction: buildTargetAction("Review loan summary", "loan-summary"),
      secondaryAction: buildTargetAction("Review linked context", "linked-context"),
    };
  }

  return {
    primaryAction: buildTargetAction("Review mortgage command", "continuity-command"),
    secondaryAction: buildTargetAction("Review loan summary", "loan-summary"),
  };
}

function buildRecommendedAction(primaryAction = null) {
  if (!primaryAction?.label) {
    return {
      label: "Review mortgage command",
      detail: "Start with the highest-priority operating blocker so the next mortgage decision is based on the strongest available evidence.",
      action: buildTargetAction("Review mortgage command", "continuity-command"),
    };
  }

  const detailsByLabel = {
    "Upload mortgage documents":
      "Add the latest mortgage statement or related loan documents so the page can confirm the current balance, timing, and support level more confidently.",
    "Link property":
      "Connect this loan to the correct property record so the mortgage can be interpreted with its collateral context instead of as a standalone debt record.",
    "Review mortgage command":
      "Open the mortgage command section first to see the clearest blockers, why they matter, and what needs attention next.",
    "Review loan summary":
      "Open the loan summary to confirm the core mortgage facts, servicing details, and current loan attributes behind this interpretation.",
    "Review linked context":
      "Open linked context to see how this mortgage fits into the broader property, protection, and document graph before making a final read.",
  };

  return {
    label: primaryAction.label,
    detail:
      detailsByLabel[primaryAction.label] ||
      "Use the recommended section to strengthen the mortgage interpretation with the most relevant supporting context.",
    action: primaryAction,
  };
}

function buildCompletenessNote({
  confidence,
  documentCount,
  snapshotCount,
  propertyLinkCount,
  bundleWarnings = [],
  status,
}) {
  if (status === "Not Enough Data") {
    return "There is not enough mortgage data yet for a reliable read.";
  }

  if (bundleWarnings.length > 0) {
    return "Using current mortgage data while some supporting details are temporarily unavailable.";
  }

  if (documentCount === 0 && propertyLinkCount === 0) {
    return "Using current mortgage data with limited statement and property-link support.";
  }

  if (snapshotCount === 0) {
    return `Using current mortgage data while deeper parsed support is still limited at ${Math.round(confidence * 100)}% confidence.`;
  }

  return `Using current mortgage data from the loan, documents, and property link at ${Math.round(confidence * 100)}% confidence.`;
}

export default function buildMortgagePageFascia({
  mortgageLoan = null,
  mortgageReview = null,
  mortgageCommandCenter = null,
  mortgageDocuments = [],
  mortgageSnapshots = [],
  mortgageAnalytics = [],
  propertyLinks = [],
  bundleWarnings = [],
} = {}) {
  const loanLabel = mortgageLoan?.loan_name || mortgageLoan?.property_address || "This mortgage";
  const currentStatus = String(mortgageLoan?.current_status || "").toLowerCase();
  const documentCount = Array.isArray(mortgageDocuments) ? mortgageDocuments.length : 0;
  const snapshotCount = Array.isArray(mortgageSnapshots) ? mortgageSnapshots.length : 0;
  const analyticsCount = Array.isArray(mortgageAnalytics) ? mortgageAnalytics.length : 0;
  const propertyLinkCount = Array.isArray(propertyLinks) ? propertyLinks.length : 0;
  const confidence = safeNumber(mortgageReview?.confidence, 0);
  const criticalCount = safeNumber(mortgageCommandCenter?.metrics?.critical, 0);
  const warningCount = safeNumber(mortgageCommandCenter?.metrics?.warning, 0);
  const blockerIds = new Set((mortgageCommandCenter?.blockers || []).map((item) => item?.id).filter(Boolean));
  const elevatedRisk =
    currentStatus === "delinquent" ||
    blockerIds.has("mortgage-stale-statement") ||
    [...blockerIds].some((id) => id.startsWith("mortgage-urgent-alert-") || id.startsWith("mortgage-overdue-task-"));
  const hasCoreEvidence = documentCount > 0 || snapshotCount > 0 || analyticsCount > 0;

  let status = "Not Enough Data";
  if (!mortgageLoan || !mortgageReview) {
    status = "Not Enough Data";
  } else if (elevatedRisk) {
    status = "At Risk";
  } else if (
    mortgageReview.readinessStatus === "Better Supported" &&
    confidence >= 0.82 &&
    criticalCount === 0 &&
    propertyLinkCount > 0 &&
    documentCount > 0 &&
    mortgageReview.metrics?.documentSupport === "strong"
  ) {
    status = "Strong";
  } else if (
    mortgageReview.readinessStatus === "Better Supported" &&
    confidence >= 0.68 &&
    criticalCount === 0 &&
    propertyLinkCount > 0
  ) {
    status = "Stable";
  } else if (
    mortgageReview.readinessStatus === "Needs Review" &&
    (documentCount === 0 || propertyLinkCount === 0 || confidence < 0.45)
  ) {
    status = "Incomplete";
  } else if (!hasCoreEvidence && propertyLinkCount === 0) {
    status = "Partial";
  } else if (
    mortgageReview.readinessStatus === "Review Soon" ||
    mortgageReview.readinessStatus === "Needs Review" ||
    criticalCount > 0 ||
    warningCount > 0
  ) {
    status = "Needs Review";
  } else {
    status = "Partial";
  }

  const { primaryAction, secondaryAction } = buildActions({
    status,
    mortgageReview,
    mortgageCommandCenter,
    documentCount,
    propertyLinkCount,
  });
  const meaning = buildMeaning({ status, loanLabel });
  const drivers = buildDrivers({
    mortgageReview,
    mortgageCommandCenter,
    documentCount,
    snapshotCount,
    propertyLinkCount,
    bundleWarnings,
  });
  const explanation = buildFasciaExplanation({
    summary: buildExplanationSummary({
      meaning,
      bundleWarnings,
    }),
    drivers,
    dataSources: buildDataSources({
      documentCount,
      snapshotCount,
      analyticsCount,
      propertyLinkCount,
      bundleWarnings,
    }),
    whyStatusAssigned: buildStatusReasoning({
      status,
      mortgageReview,
      confidence,
      criticalCount,
      warningCount,
      documentCount,
      propertyLinkCount,
      bundleWarnings,
      blockerIds,
      currentStatus,
    }),
    limitations: buildLimitations({
      documentCount,
      snapshotCount,
      analyticsCount,
      propertyLinkCount,
      bundleWarnings,
      blockerIds,
      confidence,
      currentStatus,
      mortgageReview,
    }),
    recommendedAction: buildRecommendedAction(primaryAction),
    sourceMode: "live_mortgage_bundle",
  });
  const completenessNote = buildCompletenessNote({
    confidence,
    documentCount,
    snapshotCount,
    propertyLinkCount,
    bundleWarnings,
    status,
  });

  return {
    ...finalizeFascia({
      title: "Mortgage Overview",
      status,
      sourceMode: "live_mortgage_bundle",
      sourceLabel: "Current mortgage data",
      meaning,
      drivers,
      primaryAction,
      secondaryAction,
      tertiaryAction: buildFasciaExplanationToggleAction(),
      completenessNote,
      explanation,
    }),
    summary: explanation.summary,
    dataSources: explanation.dataSources,
    limitations: explanation.limitations,
    recommendedAction: explanation.recommendedAction,
  };
}
