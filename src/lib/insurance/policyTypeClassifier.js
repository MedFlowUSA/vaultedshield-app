import { LIFE_POLICY_TYPE_CONFIGS } from "./policyTypeConfigs";

function addEvidence(bucket, text, weight = 1) {
  bucket.push({ text, weight });
}

function stringify(value) {
  return String(value || "").toLowerCase();
}

export function classifyLifePolicyType({
  normalizedPolicy = {},
  normalizedAnalytics = {},
  comparisonSummary = {},
} = {}) {
  const scores = {
    iul: [],
    ul: [],
    whole_life: [],
    term: [],
    final_expense: [],
  };

  const policyIdentity = normalizedPolicy?.policy_identity || {};
  const strategy = normalizedPolicy?.strategy || {};
  const values = normalizedPolicy?.values || {};
  const charges = normalizedPolicy?.charges || {};
  const illustrationComparison = normalizedAnalytics?.illustration_comparison || {};
  const sourceText = [
    policyIdentity?.policy_type,
    policyIdentity?.product_name,
    comparisonSummary?.product_name,
    comparisonSummary?.policy_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  Object.entries(LIFE_POLICY_TYPE_CONFIGS).forEach(([policyType, config]) => {
    if (policyType === "unknown") return;
    config.aliases.forEach((alias) => {
      if (sourceText.includes(alias)) {
        addEvidence(scores[policyType], `Matched product label: ${alias}`, 3);
      }
    });
  });

  if (
    strategy?.current_index_strategy ||
    strategy?.cap_rate?.display_value ||
    strategy?.participation_rate?.display_value ||
    strategy?.spread?.display_value
  ) {
    addEvidence(scores.iul, "Indexed strategy fields are present.", 3);
  }

  if (
    values?.accumulation_value?.display_value &&
    charges?.cost_of_insurance?.display_value &&
    !scores.iul.length
  ) {
    addEvidence(scores.ul, "Universal-life style account value and COI fields are present.", 2);
  }

  if (
    /dividend|paid up additions|whole life/.test(sourceText) ||
    normalizedPolicy?.riders?.dividend_option ||
    normalizedPolicy?.riders?.paid_up_additions
  ) {
    addEvidence(scores.whole_life, "Whole life dividend or paid-up-additions signals are present.", 3);
  }

  if (/term|level term|conversion/.test(sourceText)) {
    addEvidence(scores.term, "Term-life labels are present.", 3);
  }

  if (
    /final expense|burial|funeral|graded benefit|simplified issue/.test(sourceText)
  ) {
    addEvidence(scores.final_expense, "Final expense labels are present.", 3);
  }

  if (
    illustrationComparison?.comparison_possible &&
    (scores.iul.length > 0 || scores.ul.length > 0)
  ) {
    addEvidence(scores.iul, "Illustration-versus-actual support is available.", 1);
  }

  const ranked = Object.entries(scores)
    .map(([policyType, evidence]) => ({
      policyType,
      score: evidence.reduce((total, item) => total + item.weight, 0),
      evidence: evidence.map((item) => item.text),
    }))
    .sort((left, right) => right.score - left.score);

  const winner = ranked[0];
  if (!winner || winner.score <= 0) {
    return {
      policyType: "unknown",
      confidence: 0.25,
      evidence: ["No strong product-type evidence was detected."],
    };
  }

  const runnerUpScore = ranked[1]?.score || 0;
  const confidence = Math.max(0.35, Math.min(0.98, 0.45 + (winner.score - runnerUpScore) * 0.12));

  return {
    policyType: winner.policyType,
    confidence: Number(confidence.toFixed(2)),
    evidence: winner.evidence,
  };
}
