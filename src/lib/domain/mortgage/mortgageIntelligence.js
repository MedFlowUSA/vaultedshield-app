function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthsBetween(start, end) {
  if (!start || !end) return null;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function roundConfidence(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function buildMortgageReviewSignals({
  mortgageLoan = {},
  documents = [],
  propertyLinks = [],
} = {}) {
  const safeDocuments = safeArray(documents);
  const safeLinks = safeArray(propertyLinks);
  const now = new Date();

  const originationDate = toDate(mortgageLoan?.origination_date);
  const maturityDate = toDate(mortgageLoan?.maturity_date);
  const monthsSinceOrigination = monthsBetween(originationDate, now);
  const monthsToMaturity = monthsBetween(now, maturityDate);
  const yearsSinceOrigination =
    monthsSinceOrigination === null ? null : Number((monthsSinceOrigination / 12).toFixed(1));
  const yearsToMaturity =
    monthsToMaturity === null ? null : Number((monthsToMaturity / 12).toFixed(1));

  const documentClasses = safeDocuments
    .map((document) => document?.document_class_key)
    .filter(Boolean);
  const hasMonthlyStatement = documentClasses.includes("monthly_statement");
  const hasClosingDisclosure = documentClasses.includes("closing_disclosure");
  const hasPayoffStatement = documentClasses.includes("payoff_statement");
  const hasEscrowAnalysis = documentClasses.includes("escrow_analysis");
  const hasRefinancePacket = documentClasses.includes("refinance_packet");
  const primaryPropertyLink = safeLinks.find((link) => link?.is_primary) || safeLinks[0] || null;
  const isActive = ["active", "current"].includes(mortgageLoan?.current_status);
  const isArm = mortgageLoan?.mortgage_loan_type_key === "adjustable_rate_mortgage";

  const flags = [];
  const notes = [];
  let confidence = 0.2;

  if (mortgageLoan?.lender_key) confidence += 0.15;
  if (originationDate) confidence += 0.1;
  if (maturityDate) confidence += 0.1;
  if (hasMonthlyStatement) confidence += 0.2;
  if (hasClosingDisclosure) confidence += 0.1;
  if (hasPayoffStatement) confidence += 0.1;
  if (safeLinks.length > 0) confidence += 0.15;

  if (!safeLinks.length) {
    flags.push("property_link_missing");
    notes.push("No linked property is visible yet, so collateral context is still incomplete.");
  } else if (!primaryPropertyLink?.is_primary) {
    notes.push("A property link is visible, but a clear primary financing link is not yet confirmed.");
  }

  let refinanceStatus = "limited";
  if (!isActive) {
    refinanceStatus = "not_active";
  } else if (hasRefinancePacket) {
    refinanceStatus = "in_review";
    notes.push("A refinance packet is already visible, so this loan is actively being reviewed.");
  } else if (isArm) {
    refinanceStatus = "review";
    flags.push("arm_review_needed");
    notes.push("This loan appears to be adjustable-rate, so periodic refinance or reset review is worth monitoring.");
  } else if (yearsSinceOrigination !== null && yearsSinceOrigination >= 5) {
    refinanceStatus = "review";
    flags.push("seasoned_loan_review");
    notes.push("This loan has been in place for several years and may be worth a refinance review if rates or goals have changed.");
  } else {
    refinanceStatus = "monitor";
  }

  let payoffStatus = "limited";
  if (mortgageLoan?.current_status === "paid_off" || mortgageLoan?.current_status === "closed") {
    payoffStatus = "closed";
  } else if (hasPayoffStatement) {
    payoffStatus = "ready";
    notes.push("A payoff statement is visible, which improves payoff-readiness visibility.");
  } else if (yearsToMaturity !== null && yearsToMaturity <= 1) {
    payoffStatus = "review";
    flags.push("maturity_near");
    notes.push("This loan is within about a year of maturity, so payoff timing should be reviewed.");
  } else {
    payoffStatus = "limited";
  }

  let documentSupport = "limited";
  const supportCount = [hasMonthlyStatement, hasClosingDisclosure, hasPayoffStatement, hasEscrowAnalysis].filter(Boolean).length;
  if (supportCount >= 3) {
    documentSupport = "strong";
  } else if (supportCount >= 1) {
    documentSupport = "moderate";
  }

  if (!hasMonthlyStatement) {
    flags.push("statement_missing");
    notes.push("No monthly statement is visible yet, so payment and escrow visibility remain limited.");
  }
  if (!mortgageLoan?.lender_key) {
    flags.push("lender_unconfirmed");
    notes.push("Servicer/lender identity is still limited in the current mortgage record.");
  }
  if (!originationDate || !maturityDate) {
    flags.push("term_visibility_limited");
    notes.push("Origination or maturity timing is still incomplete, which limits payoff and refinance review.");
  }

  let readinessStatus = "Monitor";
  if (flags.includes("property_link_missing") || flags.includes("statement_missing")) {
    readinessStatus = "Needs Review";
  } else if (refinanceStatus === "review" || payoffStatus === "review" || documentSupport === "moderate") {
    readinessStatus = "Review Soon";
  } else if (documentSupport === "strong" && safeLinks.length > 0) {
    readinessStatus = "Better Supported";
  }

  const headline =
    readinessStatus === "Better Supported"
      ? "This mortgage record has enough core structure to support a more reliable debt review."
      : readinessStatus === "Review Soon"
        ? "This mortgage record is usable, but a refinance, payoff, or document review should stay on the radar."
        : "This mortgage record still needs stronger debt-review support before it can be treated as fully reliable.";

  return {
    readinessStatus,
    confidence: roundConfidence(confidence),
    headline,
    notes: [...new Set(notes)].slice(0, 5),
    flags: [...new Set(flags)],
    metrics: {
      yearsSinceOrigination,
      yearsToMaturity,
      documentSupport,
      refinanceStatus,
      payoffStatus,
      propertyLinkCount: safeLinks.length,
      primaryLinkVisible: Boolean(primaryPropertyLink),
      documentCount: safeDocuments.length,
    },
  };
}

export function summarizeMortgageHousehold(loans = []) {
  const reads = safeArray(loans).map((loan) => ({
    loan,
    review: buildMortgageReviewSignals({ mortgageLoan: loan }),
  }));

  if (!reads.length) {
    return {
      totalLoans: 0,
      needsReviewCount: 0,
      reviewSoonCount: 0,
      averageConfidence: 0,
      headline: "No household mortgage loans are visible yet.",
      notes: ["Create or link a mortgage to start building debt visibility and payoff/refinance review context."],
    };
  }

  const needsReviewCount = reads.filter((item) => item.review.readinessStatus === "Needs Review").length;
  const reviewSoonCount = reads.filter((item) => item.review.readinessStatus === "Review Soon").length;
  const averageConfidence =
    reads.reduce((sum, item) => sum + item.review.confidence, 0) / Math.max(reads.length, 1);

  const notes = [];
  if (needsReviewCount > 0) {
    notes.push(`${pluralize(needsReviewCount, "loan")} still need stronger statement or property-link support.`);
  }
  if (reviewSoonCount > 0) {
    notes.push(`${pluralize(reviewSoonCount, "loan")} merit refinance, maturity, or payoff review soon.`);
  }
  if (averageConfidence >= 0.7) {
    notes.push("Overall household mortgage visibility is becoming more usable for debt review.");
  }

  const headline =
    needsReviewCount > 0
      ? "Some household mortgage records still need stronger support before they can be treated as fully reliable."
      : reviewSoonCount > 0
        ? "Household mortgage visibility is usable, with a few loans that deserve refinance or payoff review."
        : "Household mortgage visibility looks relatively well supported from the current records.";

  return {
    totalLoans: reads.length,
    needsReviewCount,
    reviewSoonCount,
    averageConfidence: roundConfidence(averageConfidence),
    headline,
    notes: notes.slice(0, 4),
  };
}
