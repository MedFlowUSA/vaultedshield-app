const GENERIC_PAGE_TYPE_SIGNALS = {
  illustration_summary: ["policy summary", "policy information", "coverage summary", "illustration summary"],
  illustration_ledger: ["policy year", "attained age", "accumulation value", "cash surrender value", "death benefit"],
  statement_summary: ["annual statement", "statement summary", "account summary", "policy values", "statement date"],
  charges_table: ["cost of insurance", "monthly deduction", "expense charge", "administrative fee", "rider charge"],
  allocation_table: ["allocation", "indexed account", "fixed account", "cap rate", "participation rate", "spread"],
};

function confidenceFromScore(score) {
  if (score >= 5) return "strong";
  if (score >= 2.5) return "moderate";
  if (score >= 1) return "weak";
  return "none";
}

export function detectPageType(pageText = "", carrierProfile = null) {
  const lowered = String(pageText || "").toLowerCase();
  const profileSignals = carrierProfile?.pageTypeSignals || {};
  const hasAllocationPrioritySignals =
    lowered.includes("allocation detail") ||
    lowered.includes("current allocation") ||
    lowered.includes("strategy detail") ||
    lowered.includes("indexed account");

  const hardPageTypeChecks = {
    illustration_ledger: () => {
      if (hasAllocationPrioritySignals && !lowered.includes("attained age")) return false;
      const hasStructure = lowered.includes("policy year") || lowered.includes("attained age");
      const hasValues =
        lowered.includes("accumulation value") ||
        lowered.includes("account value") ||
        lowered.includes("cash surrender value") ||
        lowered.includes("death benefit");
      return hasStructure && hasValues;
    },
    statement_summary: () =>
      lowered.includes("annual statement") ||
      lowered.includes("statement summary") ||
      lowered.includes("account summary") ||
      lowered.includes("statement date") ||
      lowered.includes("as of"),
    charges_table: () =>
      lowered.includes("cost of insurance") ||
      lowered.includes("monthly deduction") ||
      lowered.includes("expense charge") ||
      lowered.includes("administrative fee"),
    allocation_table: () =>
      lowered.includes("allocation") ||
      lowered.includes("allocation detail") ||
      lowered.includes("current allocation") ||
      lowered.includes("participation rate") ||
      lowered.includes("cap rate") ||
      lowered.includes("indexed account"),
  };

  const ranked = Object.entries(GENERIC_PAGE_TYPE_SIGNALS)
    .map(([pageType, baseSignals]) => {
      const signals = [...new Set([...(profileSignals[pageType] || []), ...baseSignals])];
      const matchedSignals = signals.filter((signal) => lowered.includes(signal.toLowerCase()));
      const weightedSignalScore = matchedSignals.reduce((sum, signal) => {
        if (["annual statement", "statement summary", "account summary", "policy year", "attained age", "allocation detail", "segment detail"].includes(signal.toLowerCase())) {
          return sum + 2;
        }
        return sum + 1;
      }, 0);
      const gateSatisfied = hardPageTypeChecks[pageType] ? hardPageTypeChecks[pageType]() : matchedSignals.length > 0;
      const score = gateSatisfied ? weightedSignalScore : 0;
      return { page_type: pageType, score, matched_signals: matchedSignals };
    })
    .sort((left, right) => right.score - left.score);

  const best = ranked[0] || { page_type: "unknown", score: 0, matched_signals: [] };
  return {
    page_type: best.score > 0 ? best.page_type : "unknown",
    confidence: confidenceFromScore(best.score),
    matched_signals: best.matched_signals,
  };
}

export function detectDocumentPageTypes(pages = [], carrierProfile = null) {
  return pages.map((pageText, index) => ({
    page_number: index + 1,
    ...detectPageType(pageText, carrierProfile),
  }));
}
