function average(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function median(values = []) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function normalizeConfidenceLabel(score) {
  if (score >= 0.75) return "strong";
  if (score >= 0.5) return "moderate";
  return "weak";
}

function roundMoney(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isOfficialMarketSource(sourceName = "") {
  return String(sourceName || "").toLowerCase().includes("fhfa");
}

function sanitizePositiveEstimate(value, floor = 10000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(floor, numeric);
}

function sortValuationsByDateDesc(valuations = []) {
  return [...valuations].sort((left, right) => {
    const leftTime = new Date(left?.valuation_date || 0).getTime();
    const rightTime = new Date(right?.valuation_date || 0).getTime();
    return rightTime - leftTime;
  });
}

function formatDeltaCurrency(delta) {
  if (!Number.isFinite(delta)) return null;
  const direction = delta > 0 ? "+" : "";
  return `${direction}${roundMoney(delta).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })}`;
}

function formatDeltaPercent(delta) {
  if (!Number.isFinite(delta)) return null;
  const direction = delta > 0 ? "+" : "";
  return `${direction}${Math.round(delta * 100)}%`;
}

function monthsSince(dateValue) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  return Math.max(
    0,
    (now.getUTCFullYear() - parsed.getUTCFullYear()) * 12 + (now.getUTCMonth() - parsed.getUTCMonth())
  );
}

function getSubjectCompleteness(subject = {}) {
  const weightedFields = [
    { key: "address", weight: 1.2, value: subject.address || subject.property_address || subject.street_1 },
    { key: "city", weight: 0.7, value: subject.city },
    { key: "state", weight: 0.5, value: subject.state },
    { key: "postal_code", weight: 0.6, value: subject.postal_code },
    { key: "property_type_key", weight: 0.8, value: subject.property_type || subject.property_type_key },
    { key: "beds", weight: 0.8, value: subject.beds },
    { key: "baths", weight: 0.8, value: subject.baths },
    { key: "square_feet", weight: 1.2, value: subject.square_feet },
    { key: "lot_size", weight: 0.4, value: subject.lot_size },
    { key: "year_built", weight: 0.9, value: subject.year_built },
    { key: "last_purchase_price", weight: 0.5, value: subject.last_purchase_price },
    { key: "last_purchase_date", weight: 0.4, value: subject.last_purchase_date },
  ];

  const totalWeight = weightedFields.reduce((sum, field) => sum + field.weight, 0);
  const capturedWeight = weightedFields.reduce((sum, field) => {
    const hasValue = field.value !== null && field.value !== undefined && field.value !== "";
    return sum + (hasValue ? field.weight : 0);
  }, 0);

  return totalWeight > 0 ? capturedWeight / totalWeight : 0;
}

function buildCompAnalysis(subject = {}, comps = []) {
  const subjectSquareFeet = toNumber(subject.square_feet);
  const subjectBeds = toNumber(subject.beds);
  const subjectBaths = toNumber(subject.baths);
  const subjectYearBuilt = toNumber(subject.year_built);
  const subjectPropertyType = subject.property_type || subject.property_type_key || null;

  return comps
    .map((comp) => {
      const compSquareFeet = toNumber(comp.square_feet);
      const compBeds = toNumber(comp.beds);
      const compBaths = toNumber(comp.baths);
      const compYearBuilt = toNumber(comp.year_built);
      const compSalePrice = toNumber(comp.sale_price);
      const compPricePerSqft =
        toNumber(comp.price_per_sqft) ||
        (compSalePrice !== null && compSquareFeet ? compSalePrice / compSquareFeet : null);
      const distance = toNumber(comp.distance_miles);
      const monthsOld = monthsSince(comp.sale_date);
      const squareFootRatio =
        subjectSquareFeet && compSquareFeet ? Math.abs(subjectSquareFeet - compSquareFeet) / subjectSquareFeet : null;
      const bedGap = subjectBeds !== null && compBeds !== null ? Math.abs(subjectBeds - compBeds) : null;
      const bathGap = subjectBaths !== null && compBaths !== null ? Math.abs(subjectBaths - compBaths) : null;
      const yearGap =
        subjectYearBuilt !== null && compYearBuilt !== null ? Math.abs(subjectYearBuilt - compYearBuilt) : null;

      const distanceWeight = distance === null ? 0.72 : clamp(1 - distance / 4, 0.2, 1);
      const recencyWeight =
        monthsOld === null ? 0.7 : monthsOld <= 6 ? 1 : monthsOld <= 12 ? 0.9 : monthsOld <= 24 ? 0.78 : 0.6;
      const sqftWeight = squareFootRatio === null ? 0.72 : clamp(1 - squareFootRatio * 1.2, 0.35, 1);
      const bedWeight = bedGap === null ? 0.82 : clamp(1 - bedGap * 0.18, 0.45, 1);
      const bathWeight = bathGap === null ? 0.82 : clamp(1 - bathGap * 0.16, 0.45, 1);
      const yearWeight = yearGap === null ? 0.8 : clamp(1 - yearGap / 80, 0.45, 1);
      const propertyTypeWeight =
        !subjectPropertyType || !comp.property_type || comp.property_type === subjectPropertyType ? 1 : 0.74;
      const similarityScore = Number(
        clamp(
          distanceWeight * 0.24 +
            recencyWeight * 0.16 +
            sqftWeight * 0.24 +
            bedWeight * 0.12 +
            bathWeight * 0.1 +
            yearWeight * 0.08 +
            propertyTypeWeight * 0.06,
          0.2,
          1
        ).toFixed(2)
      );

      const sqftAdjustment =
        subjectSquareFeet !== null && compSquareFeet !== null && compPricePerSqft !== null
          ? (subjectSquareFeet - compSquareFeet) * compPricePerSqft * 0.38
          : 0;
      const bedAdjustment =
        subjectBeds !== null && compBeds !== null ? (subjectBeds - compBeds) * 5500 : 0;
      const bathAdjustment =
        subjectBaths !== null && compBaths !== null ? (subjectBaths - compBaths) * 8000 : 0;
      const yearAdjustment =
        subjectYearBuilt !== null && compYearBuilt !== null ? (subjectYearBuilt - compYearBuilt) * 350 : 0;
      const adjustedEstimate =
        compSalePrice !== null
          ? compSalePrice + sqftAdjustment + bedAdjustment + bathAdjustment + yearAdjustment
          : compPricePerSqft !== null && subjectSquareFeet !== null
            ? compPricePerSqft * subjectSquareFeet + bedAdjustment + bathAdjustment + yearAdjustment
            : null;

      return {
        ...comp,
        sale_price: compSalePrice,
        price_per_sqft: compPricePerSqft,
        months_old: monthsOld,
        similarity_score: similarityScore,
        adjusted_estimate: adjustedEstimate !== null ? roundMoney(adjustedEstimate) : null,
        adjustment_summary: {
          sqft_adjustment: roundMoney(sqftAdjustment),
          bed_adjustment: roundMoney(bedAdjustment),
          bath_adjustment: roundMoney(bathAdjustment),
          year_adjustment: roundMoney(yearAdjustment),
        },
      };
    })
    .filter((comp) => Number.isFinite(comp.adjusted_estimate));
}

function buildRecentPurchaseAnchor(subject = {}) {
  const price = toNumber(subject.last_purchase_price);
  const monthsOld = monthsSince(subject.last_purchase_date);
  if (price === null || monthsOld === null) return null;

  const appreciationFactor =
    monthsOld <= 12 ? 1.035 : monthsOld <= 24 ? 1.06 : monthsOld <= 48 ? 1.1 : 1.16;
  const recencyWeight =
    monthsOld <= 12 ? 0.24 : monthsOld <= 24 ? 0.18 : monthsOld <= 48 ? 0.12 : 0.06;

  return {
    estimate: roundMoney(price * appreciationFactor),
    recency_months: monthsOld,
    weight: recencyWeight,
  };
}

export function buildVirtualValuation(subject = {}, providerResult = {}) {
  const sources = Array.isArray(providerResult.sources) ? providerResult.sources : [];
  const comps = Array.isArray(providerResult.comps) ? providerResult.comps : [];
  const subjectCompleteness = getSubjectCompleteness(subject);
  const analyzedComps = buildCompAnalysis(subject, comps);
  const recentPurchaseAnchor = buildRecentPurchaseAnchor(subject);

  const sourceSignals = sources
    .map((source) => {
      const estimate = toNumber(source.estimate);
      const sanitizedEstimate = sanitizePositiveEstimate(estimate);
      if (sanitizedEstimate === null) return null;
      const officialSource = isOfficialMarketSource(source.source_name);
      return {
        source_name: source.source_name || "Valuation source",
        estimate: sanitizedEstimate,
        confidence: clamp(toNumber(source.confidence) ?? 0.6, officialSource ? 0.3 : 0.25, 0.95),
        notes: Array.isArray(source.notes) ? source.notes : [],
        official_source: officialSource,
      };
    })
    .filter(Boolean);

  const compSignals = analyzedComps.map((comp) => ({
    source_name: comp.source_name || "Comparable sale",
    estimate: sanitizePositiveEstimate(comp.adjusted_estimate),
    confidence: clamp(comp.similarity_score * 0.92, 0.25, 0.94),
    notes: [
      `Comp at ${comp.distance_miles ?? "?"} miles with similarity ${Math.round(comp.similarity_score * 100)}%.`,
      comp.months_old !== null ? `Sale is ${comp.months_old} month${comp.months_old === 1 ? "" : "s"} old.` : "Sale recency is limited.",
    ],
  })).filter((signal) => signal.estimate !== null);

  const blendedSignals = [
    ...sourceSignals,
    ...compSignals,
    ...(recentPurchaseAnchor
      ? [
          {
            source_name: "Recent purchase anchor",
            estimate: recentPurchaseAnchor.estimate,
            confidence: recentPurchaseAnchor.weight,
            notes: [
              `Anchored to the last recorded purchase approximately ${recentPurchaseAnchor.recency_months} month${recentPurchaseAnchor.recency_months === 1 ? "" : "s"} ago.`,
            ],
          },
        ]
      : []),
  ];

  const totalWeight = blendedSignals.reduce((sum, signal) => sum + signal.confidence, 0);
  const rawMidpointEstimate =
    totalWeight > 0
      ? blendedSignals.reduce((sum, signal) => sum + signal.estimate * signal.confidence, 0) / totalWeight
      : null;
  const midpointEstimate = sanitizePositiveEstimate(rawMidpointEstimate);

  const signalEstimates = blendedSignals.map((signal) => signal.estimate).filter(Number.isFinite);
  const weightedVariance =
    midpointEstimate !== null && totalWeight > 0
      ? blendedSignals.reduce(
          (sum, signal) => sum + signal.confidence * Math.pow(signal.estimate - midpointEstimate, 2),
          0
        ) / totalWeight
      : null;
  const weightedStdDev = weightedVariance !== null ? Math.sqrt(weightedVariance) : null;
  const divergenceRatio =
    midpointEstimate && weightedStdDev ? clamp(weightedStdDev / midpointEstimate, 0, 0.28) : 0.12;
  const medianCompSimilarity = median(
    analyzedComps.map((comp) => comp.similarity_score).filter((value) => Number.isFinite(value))
  );
  const averageCompRecencyMonths = average(
    analyzedComps.map((comp) => comp.months_old).filter((value) => Number.isFinite(value))
  );

  const providerSupport = Math.min(0.2, sourceSignals.length * 0.045);
  const compSupport = Math.min(0.24, analyzedComps.length * 0.04);
  const officialSignals = sourceSignals.filter((signal) => signal.official_source);
  const officialSupport = officialSignals.length > 0 ? Math.min(0.08, officialSignals.length * 0.035) : 0;
  const officialAligned =
    midpointEstimate !== null && officialSignals.length > 0
      ? officialSignals.every((signal) => Math.abs(signal.estimate - midpointEstimate) / midpointEstimate <= 0.12)
      : false;
  const officialAlignmentBonus = officialAligned ? 0.04 : officialSignals.length > 0 ? 0.015 : 0;
  const compFitBonus = clamp((medianCompSimilarity ?? 0.45) * 0.18, 0.04, 0.18);
  const recencyBonus =
    averageCompRecencyMonths === null
      ? 0.03
      : averageCompRecencyMonths <= 6
        ? 0.09
        : averageCompRecencyMonths <= 12
          ? 0.06
          : averageCompRecencyMonths <= 24
            ? 0.03
            : 0;
  const disagreementPenalty = divergenceRatio * 0.75;
  const sparseCompPenalty = analyzedComps.length === 0 ? 0.16 : analyzedComps.length < 3 ? 0.08 : 0;
  const unusualPropertyPenalty =
    ["vacant_land", "multifamily_property"].includes(subject.property_type || subject.property_type_key) ? 0.08 : 0;

  const confidenceScore = midpointEstimate
    ? clamp(
        0.24 +
          subjectCompleteness * 0.24 +
          providerSupport +
          officialSupport +
          officialAlignmentBonus +
          compSupport +
          compFitBonus +
          recencyBonus -
          disagreementPenalty -
          sparseCompPenalty -
          unusualPropertyPenalty,
        0.2,
        0.94
      )
    : 0.2;
  const confidenceLabel = normalizeConfidenceLabel(confidenceScore);

  const rangeRatio = clamp(
    0.07 +
      divergenceRatio * 0.8 +
      (subjectCompleteness < 0.7 ? 0.04 : 0) +
      (medianCompSimilarity !== null && medianCompSimilarity < 0.65 ? 0.03 : 0) -
      Math.min(0.04, analyzedComps.length * 0.008),
    0.06,
    0.2
  );
  const lowEstimate = midpointEstimate ? sanitizePositiveEstimate(midpointEstimate * (1 - rangeRatio)) : null;
  const highEstimate = midpointEstimate ? sanitizePositiveEstimate(midpointEstimate * (1 + rangeRatio)) : null;
  const pricePerSqftEstimate =
    midpointEstimate && toNumber(subject.square_feet) && toNumber(subject.square_feet) > 0
      ? midpointEstimate / toNumber(subject.square_feet)
      : median(analyzedComps.map((comp) => comp.price_per_sqft).filter(Number.isFinite));

  const sourceSummary = blendedSignals.map((signal) => ({
    source_name: signal.source_name,
    estimate: roundMoney(signal.estimate),
    confidence: Number(signal.confidence.toFixed(2)),
    contribution_weight:
      totalWeight > 0 ? Number((signal.confidence / totalWeight).toFixed(2)) : 0,
    notes: signal.notes || [],
    official_source: Boolean(signal.official_source),
  }));

  const reviewFlags = [];
  if (subjectCompleteness < 0.7) reviewFlags.push("subject_facts_incomplete");
  if (analyzedComps.length < 3) reviewFlags.push("limited_comp_support");
  if ((medianCompSimilarity ?? 0) < 0.65) reviewFlags.push("comp_similarity_mixed");
  if (divergenceRatio > 0.12) reviewFlags.push("source_divergence_elevated");
  if (averageCompRecencyMonths !== null && averageCompRecencyMonths > 18) reviewFlags.push("stale_comp_recency");
  if (officialSignals.length === 0) reviewFlags.push("official_market_support_unavailable");
  if (officialSignals.length > 0 && !officialAligned) reviewFlags.push("official_market_signals_mixed");
  if (midpointEstimate === null || lowEstimate === null || highEstimate === null) {
    reviewFlags.push("invalid_value_signals_removed");
  }

  const adjustmentNotes = [
    `${sourceSignals.length} provider source${sourceSignals.length === 1 ? "" : "s"} and ${analyzedComps.length} weighted comp${analyzedComps.length === 1 ? "" : "s"} contributed to the blended estimate.`,
    subjectCompleteness < 0.75
      ? "Subject property facts are still incomplete, which keeps the value range wider."
      : "Subject property facts are sufficiently complete for a tighter virtual value review.",
    medianCompSimilarity !== null && medianCompSimilarity >= 0.75
      ? "Comparable sales align closely with the subject on size, recency, and property fit."
      : "Comparable sales are usable, but subject-to-comp similarity is mixed.",
    divergenceRatio > 0.12
      ? "Source divergence is elevated, so the valuation range stays wider."
      : "Provider and comparable-sale signals are reasonably aligned for this pass.",
    officialSignals.length > 0
      ? officialAligned
        ? "Official FHFA market trend signals aligned with the blended estimate and improved market-context support."
        : "Official FHFA market trend signals were available, but they only partially aligned with the rest of the valuation inputs."
      : "No official FHFA market trend signal was available for this property context, so the estimate relies on local heuristic and comp support only.",
    recentPurchaseAnchor
      ? "Recent purchase history was included as a light anchor to improve valuation stability."
      : "No recent purchase anchor was available, so the estimate leans more heavily on current source and comp signals.",
  ];

  return {
    valuation_status: "completed",
    valuation_method: "weighted_virtual_valuation_v2",
    low_estimate: roundMoney(lowEstimate),
    midpoint_estimate: roundMoney(midpointEstimate),
    high_estimate: roundMoney(highEstimate),
    confidence_score: Number(confidenceScore.toFixed(2)),
    confidence_label: confidenceLabel,
    source_summary: sourceSummary,
    adjustment_notes: adjustmentNotes,
    comps_count: analyzedComps.length,
    price_per_sqft_estimate: pricePerSqftEstimate ? Number(pricePerSqftEstimate.toFixed(2)) : null,
    disclaimer_text:
      "Virtual valuation only. This is an explainable multi-source and comparable-sales review, not a licensed appraisal or underwriting decision.",
    metadata: {
      subject_completeness: Number(subjectCompleteness.toFixed(2)),
      weighted_std_dev: roundMoney(weightedStdDev),
      divergence_ratio: Number(divergenceRatio.toFixed(3)),
      comp_fit_score: medianCompSimilarity !== null ? Number(medianCompSimilarity.toFixed(2)) : null,
      average_comp_recency_months:
        averageCompRecencyMonths !== null ? Number(averageCompRecencyMonths.toFixed(1)) : null,
      provider_source_count: sourceSignals.length,
      official_source_count: officialSignals.length,
      official_market_support: officialSignals.length > 0 ? (officialAligned ? "aligned" : "mixed") : "unavailable",
      weighted_comp_count: analyzedComps.length,
      recent_purchase_anchor: recentPurchaseAnchor,
      valuation_range_ratio: Number(rangeRatio.toFixed(3)),
      review_flags: reviewFlags,
      analyzed_comps: analyzedComps.map((comp) => ({
        comp_address: comp.comp_address || null,
        distance_miles: comp.distance_miles ?? null,
        sale_price: comp.sale_price ?? null,
        sale_date: comp.sale_date || null,
        similarity_score: comp.similarity_score,
        adjusted_estimate: comp.adjusted_estimate,
        adjustment_summary: comp.adjustment_summary,
      })),
    },
  };
}

export function buildValuationChangeSummary(valuationHistory = []) {
  const orderedHistory = sortValuationsByDateDesc(valuationHistory).filter((valuation) => valuation?.valuation_date);
  const latest = orderedHistory[0] || null;
  const previous = orderedHistory[1] || null;

  if (!latest || !previous) {
    return {
      periods_compared: orderedHistory.length,
      latest,
      previous,
      change_status: "insufficient_history",
      summary:
        latest
          ? "One valuation run is available. A second run will allow change tracking across value, support, and confidence."
          : "No valuation history is available yet.",
      bullets: [],
      deltas: {},
      debug: {
        history_count: orderedHistory.length,
      },
    };
  }

  const latestMidpoint = toNumber(latest.midpoint_estimate);
  const previousMidpoint = toNumber(previous.midpoint_estimate);
  const latestConfidence = toNumber(latest.confidence_score);
  const previousConfidence = toNumber(previous.confidence_score);
  const latestComps = toNumber(latest.comps_count) ?? 0;
  const previousComps = toNumber(previous.comps_count) ?? 0;
  const latestOfficialCount = toNumber(latest.metadata?.official_source_count) ?? 0;
  const previousOfficialCount = toNumber(previous.metadata?.official_source_count) ?? 0;
  const latestOfficialSupport = latest.metadata?.official_market_support || "unavailable";
  const previousOfficialSupport = previous.metadata?.official_market_support || "unavailable";

  const midpointDelta =
    latestMidpoint !== null && previousMidpoint !== null ? latestMidpoint - previousMidpoint : null;
  const midpointDeltaRatio =
    midpointDelta !== null && previousMidpoint ? midpointDelta / previousMidpoint : null;
  const confidenceDelta =
    latestConfidence !== null && previousConfidence !== null ? latestConfidence - previousConfidence : null;
  const compDelta = latestComps - previousComps;
  const officialCountDelta = latestOfficialCount - previousOfficialCount;

  const bullets = [];
  if (midpointDelta !== null) {
    bullets.push(
      midpointDelta === 0
        ? "Estimated midpoint value held steady between the two most recent runs."
        : `Estimated midpoint value ${midpointDelta > 0 ? "increased" : "decreased"} by ${formatDeltaCurrency(midpointDelta)}.`
    );
  }
  if (confidenceDelta !== null) {
    bullets.push(
      confidenceDelta === 0
        ? "Confidence held steady across the two most recent valuation runs."
        : `Confidence ${confidenceDelta > 0 ? "improved" : "softened"} by ${formatDeltaPercent(confidenceDelta)}.`
    );
  }
  if (compDelta !== 0) {
    bullets.push(
      `Comparable-sale support ${compDelta > 0 ? "expanded" : "narrowed"} by ${Math.abs(compDelta)} comp${Math.abs(compDelta) === 1 ? "" : "s"}.`
    );
  }
  if (latestOfficialSupport !== previousOfficialSupport || officialCountDelta !== 0) {
    bullets.push(
      latestOfficialSupport === "aligned"
        ? "Official market support is now aligned with the blended estimate."
        : latestOfficialSupport === "mixed"
          ? "Official market support is available, but still mixed against the blended estimate."
          : "Official market support was not available in the latest run."
    );
  }

  const changeStatus =
    midpointDeltaRatio !== null && Math.abs(midpointDeltaRatio) >= 0.06
      ? "material_change"
      : confidenceDelta !== null && Math.abs(confidenceDelta) >= 0.08
        ? "support_change"
        : "stable_change";

  const summary =
    changeStatus === "material_change"
      ? `The latest valuation moved meaningfully versus the prior run, with value support now ${latestOfficialSupport}.`
      : changeStatus === "support_change"
        ? `The valuation range stayed relatively stable, but support quality changed between runs.`
        : "The latest valuation is broadly consistent with the prior run, with only modest movement in value and support.";

  return {
    periods_compared: 2,
    latest,
    previous,
    change_status: changeStatus,
    summary,
    bullets: bullets.slice(0, 4),
    deltas: {
      midpoint_delta: midpointDelta,
      midpoint_delta_ratio: midpointDeltaRatio,
      confidence_delta: confidenceDelta,
      comp_delta: compDelta,
      official_source_delta: officialCountDelta,
      latest_official_market_support: latestOfficialSupport,
      previous_official_market_support: previousOfficialSupport,
    },
    debug: {
      latest_valuation_id: latest.id || null,
      previous_valuation_id: previous.id || null,
      latest_date: latest.valuation_date || null,
      previous_date: previous.valuation_date || null,
      latest_midpoint: latestMidpoint,
      previous_midpoint: previousMidpoint,
      latest_confidence: latestConfidence,
      previous_confidence: previousConfidence,
      latest_comps: latestComps,
      previous_comps: previousComps,
      latest_official_count: latestOfficialCount,
      previous_official_count: previousOfficialCount,
    },
  };
}

export function classifyPropertyQuestion(questionText = "") {
  const normalized = String(questionText || "").toLowerCase();

  const matchers = [
    { intent: "comp_quality", patterns: ["comp", "comparable", "sale", "sales", "strong comps", "comp quality"] },
    { intent: "value_change", patterns: ["change", "changed", "moved", "different", "last run", "history"] },
    { intent: "market_support", patterns: ["market", "fhfa", "official", "price per foot", "price per sq", "trend"] },
    { intent: "debt_coverage_linkage", patterns: ["mortgage", "coverage", "homeowners", "equity", "debt", "protection"] },
    { intent: "missing_property_facts", patterns: ["missing", "incomplete", "facts", "unknown", "confidence low"] },
    { intent: "valuation_strength", patterns: ["accurate", "accuracy", "value", "valuation", "confidence", "price"] },
  ];

  const matched = matchers
    .map((matcher) => ({
      intent: matcher.intent,
      score: matcher.patterns.filter((pattern) => normalized.includes(pattern)).length,
    }))
    .sort((left, right) => right.score - left.score)[0];

  return {
    intent: matched?.score ? matched.intent : "general_property_summary",
    confidence: matched?.score >= 2 ? "high" : matched?.score === 1 ? "medium" : "low",
    extracted_keywords: normalized.split(/\s+/).filter(Boolean).slice(0, 8),
  };
}

function buildPropertyAssistantFollowups(intent) {
  const followupsByIntent = {
    valuation_strength: [
      "How strong are the comps?",
      "What official market support is being used?",
      "What changed since the last valuation?",
      "What property facts are still missing?",
    ],
    comp_quality: [
      "Why are these comps considered strong or weak?",
      "What is the best comp on this property?",
      "How recent are the comparable sales?",
      "What official market support is being used?",
    ],
    value_change: [
      "Why did this valuation change?",
      "How did confidence move between runs?",
      "Did official market support improve?",
      "How strong are the current comps?",
    ],
    market_support: [
      "How much is official market support affecting the estimate?",
      "How strong are the comps?",
      "What changed since the last valuation?",
      "What property facts are still missing?",
    ],
    debt_coverage_linkage: [
      "How strong is the current equity picture?",
      "Is financing linked cleanly?",
      "Is homeowners protection linked?",
      "What should I review first on this property?",
    ],
    missing_property_facts: [
      "How are missing facts affecting confidence?",
      "How strong are the comps anyway?",
      "What official market support is being used?",
      "What should I review first on this property?",
    ],
    general_property_summary: [
      "How strong is this valuation?",
      "How strong are the comps?",
      "What changed since the last valuation?",
      "Is financing and coverage linked cleanly?",
    ],
  };

  return followupsByIntent[intent] || followupsByIntent.general_property_summary;
}

function buildPropertyAssistantActions(intent, propertyId) {
  const actions = {
    valuation_strength: [
      { id: "open-valuation", label: "Open Valuation", type: "scroll_section", section: "valuation" },
      { id: "open-comps", label: "Review Comps", type: "scroll_section", section: "comps" },
    ],
    comp_quality: [
      { id: "review-comps", label: "Review Comps", type: "scroll_section", section: "comps" },
      { id: "open-valuation", label: "Open Valuation", type: "scroll_section", section: "valuation" },
    ],
    value_change: [
      { id: "review-history", label: "Review History", type: "scroll_section", section: "valuation_history" },
      { id: "rerun-valuation", label: "Refresh Valuation", route: propertyId ? `/property/detail/${propertyId}` : "/property" },
    ],
    market_support: [
      { id: "open-valuation-market", label: "Open Market Support", type: "scroll_section", section: "valuation" },
      { id: "review-comps", label: "Review Comps", type: "scroll_section", section: "comps" },
    ],
    debt_coverage_linkage: [
      { id: "open-equity", label: "Open Equity Review", type: "scroll_section", section: "equity" },
      { id: "open-mortgages", label: "Open Mortgages", type: "scroll_section", section: "mortgages" },
      { id: "open-homeowners", label: "Open Homeowners", type: "scroll_section", section: "homeowners" },
    ],
    missing_property_facts: [
      { id: "open-facts", label: "Open Property Facts", type: "scroll_section", section: "facts" },
      { id: "open-valuation", label: "Open Valuation", type: "scroll_section", section: "valuation" },
    ],
    general_property_summary: [
      { id: "open-valuation", label: "Open Valuation", type: "scroll_section", section: "valuation" },
      { id: "open-equity", label: "Open Equity Review", type: "scroll_section", section: "equity" },
    ],
  };

  return actions[intent] || actions.general_property_summary;
}

function displayPropertyReportValue(value) {
  return value === null || value === undefined || value === "" ? "\u2014" : value;
}

export function answerPropertyQuestion({
  questionText,
  property,
  latestValuation,
  valuationChangeSummary,
  propertyEquityPosition,
  propertyStackAnalytics,
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
  propertyId,
} = {}) {
  const classification = classifyPropertyQuestion(questionText);
  const metadata = latestValuation?.metadata || {};
  const missingFacts = [];
  ["city", "state", "postal_code", "square_feet", "beds", "baths", "year_built", "last_purchase_price", "last_purchase_date"].forEach((field) => {
    const value = property?.[field];
    if (value === null || value === undefined || value === "") missingFacts.push(field);
  });

  const confidenceLabel =
    latestValuation?.confidence_label === "strong"
      ? "strong"
      : latestValuation?.confidence_label === "moderate"
        ? "moderate"
        : "limited";

  const compFitText = metadata.comp_fit_score !== null && metadata.comp_fit_score !== undefined
    ? `${Math.round(Number(metadata.comp_fit_score) * 100)}%`
    : "not available";
  const compRecencyText = metadata.average_comp_recency_months !== null && metadata.average_comp_recency_months !== undefined
    ? `${metadata.average_comp_recency_months} months`
    : "not available";
  const officialSupport = metadata.official_market_support || "unavailable";

  let answerText = "";
  let evidencePoints = [];

  switch (classification.intent) {
    case "valuation_strength":
      answerText =
        latestValuation?.confidence_label === "strong"
          ? "This valuation is well supported for a virtual review because the comp fit, subject facts, and market context are lining up cleanly."
          : latestValuation?.confidence_label === "moderate"
            ? "This valuation is usable, but it still needs monitoring because the support is mixed rather than fully tight."
            : "This valuation is still limited because the support stack is not yet strong enough to treat the range as tight.";
      evidencePoints = [
        `Current valuation confidence is ${latestValuation?.confidence_label || "unavailable"} at ${latestValuation?.confidence_score !== null && latestValuation?.confidence_score !== undefined ? `${Math.round(Number(latestValuation.confidence_score) * 100)}%` : "not scored"}.`,
        `Comp fit is ${compFitText} and average comp recency is ${compRecencyText}.`,
        `Official market support is ${officialSupport}.`,
        `Subject completeness is ${metadata.subject_completeness !== null && metadata.subject_completeness !== undefined ? `${Math.round(Number(metadata.subject_completeness) * 100)}%` : "not available"}.`,
      ];
      break;
    case "comp_quality":
      answerText =
        (metadata.comp_fit_score ?? 0) >= 0.75
          ? "The comps are reading as strong because the best visible sales are close in fit, reasonably recent, and aligned with the local market profile."
          : (metadata.comp_fit_score ?? 0) >= 0.6
            ? "The comps are usable, but they are mixed enough that the valuation still needs a wider review range."
            : "The comps are currently thin or mixed, which is one of the main reasons the valuation range stays broader.";
      evidencePoints = [
        `Overall comp fit score is ${compFitText}.`,
        `Average comp recency is ${compRecencyText}.`,
        `Selected comparable sales count is ${latestValuation?.comps_count || 0}.`,
        `Review flags: ${(metadata.review_flags || []).join(", ") || "none currently visible"}.`,
      ];
      break;
    case "value_change":
      answerText = valuationChangeSummary?.summary || "There is not enough valuation history yet to compare changes across runs.";
      evidencePoints = valuationChangeSummary?.bullets?.length
        ? valuationChangeSummary.bullets
        : ["Only one valuation run is available right now, so change tracking is still limited."];
      break;
    case "market_support":
      answerText =
        officialSupport === "aligned"
          ? "Official market support is reinforcing the current estimate, so the broader market context is lining up with the comp-driven value read."
          : officialSupport === "mixed"
            ? "Official market support is available, but it is not fully lining up with the rest of the valuation inputs yet."
            : "This valuation is relying mostly on local heuristic and comp support because official market support was not available in the latest run.";
      evidencePoints = [
        `Official market support is ${officialSupport}.`,
        `Matched market context is ${metadata.official_market_signals?.market_city && metadata.official_market_signals?.market_state ? `${metadata.official_market_signals.market_city}, ${metadata.official_market_signals.market_state}` : "limited"}.`,
        `Current market price per square foot is ${metadata.market_profile?.current_ppsf ? `$${Number(metadata.market_profile.current_ppsf).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "not available"}.`,
        `Annual market trend input is ${metadata.market_profile?.annual_growth_rate !== null && metadata.market_profile?.annual_growth_rate !== undefined ? `${Math.round(Number(metadata.market_profile.annual_growth_rate) * 100)}%` : "not available"}.`,
      ];
      break;
    case "debt_coverage_linkage":
      answerText =
        linkedMortgages.length > 0 && linkedHomeownersPolicies.length > 0
          ? "The property stack is broadly connected, so value, debt, and protection can be reviewed together."
          : "This property stack still has linkage gaps, which weakens the household-level review even if the value estimate itself is usable.";
      evidencePoints = [
        `Linked mortgages: ${linkedMortgages.length}.`,
        `Linked homeowners policies: ${linkedHomeownersPolicies.length}.`,
        `Equity visibility is ${propertyEquityPosition?.equity_visibility_status || "limited"}.`,
        `Property stack continuity is ${propertyStackAnalytics?.continuity_status || "not available"}.`,
      ];
      break;
    case "missing_property_facts":
      answerText =
        missingFacts.length === 0
          ? "The core property fact set looks reasonably complete for this valuation pass."
          : "Some property facts are still missing, and that keeps the valuation confidence lower than it otherwise could be.";
      evidencePoints = [
        missingFacts.length ? `Missing facts: ${missingFacts.join(", ")}.` : "No major core property facts are currently missing.",
        `Subject completeness is ${metadata.subject_completeness !== null && metadata.subject_completeness !== undefined ? `${Math.round(Number(metadata.subject_completeness) * 100)}%` : "not available"}.`,
        `Review flags: ${(metadata.review_flags || []).join(", ") || "none currently visible"}.`,
      ];
      break;
    default:
      answerText = `This property currently shows a ${latestValuation?.confidence_label || "limited"} virtual valuation with ${latestValuation?.midpoint_estimate ? `$${Number(latestValuation.midpoint_estimate).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "no midpoint yet"}, and the review is strongest when value, debt, protection, and market context are all visible together.`;
      evidencePoints = [
        `Valuation confidence is ${latestValuation?.confidence_label || "unavailable"}.`,
        `Comparable sales count is ${latestValuation?.comps_count || 0}.`,
        `Official market support is ${officialSupport}.`,
        `Equity visibility is ${propertyEquityPosition?.equity_visibility_status || "limited"}.`,
      ];
      break;
  }

  return {
    answer_text: answerText,
    intent: classification.intent,
    evidence_points: evidencePoints.slice(0, 4),
    confidence_label: confidenceLabel,
    followup_prompts: buildPropertyAssistantFollowups(classification.intent),
    actions: buildPropertyAssistantActions(classification.intent, propertyId),
    debug: {
      classified_intent: classification.intent,
      classifier_confidence: classification.confidence,
      evidence_fields_used: {
        valuation_confidence: latestValuation?.confidence_label || null,
        comp_fit_score: metadata.comp_fit_score ?? null,
        average_comp_recency_months: metadata.average_comp_recency_months ?? null,
        official_market_support: officialSupport,
        review_flags: metadata.review_flags || [],
        equity_visibility_status: propertyEquityPosition?.equity_visibility_status || null,
        linked_mortgage_count: linkedMortgages.length,
        linked_homeowners_count: linkedHomeownersPolicies.length,
        missing_facts: missingFacts,
      },
    },
  };
}

export function buildPropertyReviewReport({
  property = {},
  latestValuation = null,
  valuationChangeSummary = null,
  propertyEquityPosition = null,
  propertyStackAnalytics = null,
  linkedMortgages = [],
  linkedHomeownersPolicies = [],
  propertyComps = [],
} = {}) {
  const metadata = latestValuation?.metadata || {};
  const bestComp = metadata.analyzed_comps?.[0] || null;

  return {
    title: property?.property_name || property?.property_address || "Property Review",
    subtitle: [property?.city, property?.state].filter(Boolean).join(", ") || "Property Intelligence",
    sections: [
      {
        id: "property_snapshot",
        title: "Property Snapshot",
        kind: "facts",
        columns: 4,
        items: [
          { label: "Property", value: displayPropertyReportValue(property?.property_name || property?.property_address) },
          { label: "Type", value: displayPropertyReportValue(property?.property_type_key) },
          { label: "Address", value: displayPropertyReportValue(property?.property_address) },
          { label: "County", value: displayPropertyReportValue(property?.county) },
          { label: "Beds / Baths", value: property?.beds || property?.baths ? `${displayPropertyReportValue(property?.beds)} / ${displayPropertyReportValue(property?.baths)}` : "\u2014" },
          { label: "Square Feet", value: displayPropertyReportValue(property?.square_feet) },
          { label: "Year Built", value: displayPropertyReportValue(property?.year_built) },
          { label: "Occupancy", value: displayPropertyReportValue(property?.occupancy_type) },
        ],
      },
      {
        id: "valuation_snapshot",
        title: "Virtual Valuation",
        kind: "facts",
        columns: 4,
        items: [
          { label: "Midpoint", value: latestValuation?.midpoint_estimate !== null && latestValuation?.midpoint_estimate !== undefined ? `$${Number(latestValuation.midpoint_estimate).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "\u2014" },
          { label: "Low", value: latestValuation?.low_estimate !== null && latestValuation?.low_estimate !== undefined ? `$${Number(latestValuation.low_estimate).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "\u2014" },
          { label: "High", value: latestValuation?.high_estimate !== null && latestValuation?.high_estimate !== undefined ? `$${Number(latestValuation.high_estimate).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "\u2014" },
          { label: "Confidence", value: displayPropertyReportValue(latestValuation?.confidence_label) },
          { label: "Comp Count", value: displayPropertyReportValue(latestValuation?.comps_count) },
          { label: "Comp Fit", value: metadata.comp_fit_score !== null && metadata.comp_fit_score !== undefined ? `${Math.round(Number(metadata.comp_fit_score) * 100)}%` : "\u2014" },
          { label: "Official Market", value: displayPropertyReportValue(metadata.official_market_support) },
          { label: "Market Context", value: [metadata.official_market_signals?.market_city, metadata.official_market_signals?.market_state].filter(Boolean).join(", ") || "\u2014" },
        ],
      },
      {
        id: "valuation_change",
        title: "Valuation Change Review",
        kind: "bullets",
        summary: valuationChangeSummary?.summary || "Valuation history is not yet deep enough to compare changes across runs.",
        bullets: valuationChangeSummary?.bullets || [],
      },
      {
        id: "comp_market_review",
        title: "Comp and Market Review",
        kind: "bullets",
        summary: "The valuation now uses a broader local comp pool, local market price-per-foot context, and official market support when available.",
        items: [
          { label: "Best Comp Fit", value: bestComp?.similarity_score !== null && bestComp?.similarity_score !== undefined ? `${Math.round(Number(bestComp.similarity_score) * 100)}%` : "\u2014" },
          { label: "Best Comp Distance", value: bestComp?.distance_miles !== null && bestComp?.distance_miles !== undefined ? `${bestComp.distance_miles} mi` : "\u2014" },
          { label: "Current Market $/Sq Ft", value: metadata.market_profile?.current_ppsf ? `$${Number(metadata.market_profile.current_ppsf).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "\u2014" },
          { label: "Annual Market Trend", value: metadata.market_profile?.annual_growth_rate !== null && metadata.market_profile?.annual_growth_rate !== undefined ? `${Math.round(Number(metadata.market_profile.annual_growth_rate) * 100)}%` : "\u2014" },
        ],
        bullets: [
          latestValuation?.adjustment_notes?.[0],
          latestValuation?.adjustment_notes?.[1],
          latestValuation?.adjustment_notes?.[2],
          latestValuation?.adjustment_notes?.[3],
        ].filter(Boolean),
      },
      {
        id: "equity_linkage",
        title: "Equity and Linkage Review",
        kind: "facts",
        columns: 4,
        items: [
          { label: "Equity Visibility", value: displayPropertyReportValue(propertyEquityPosition?.equity_visibility_status) },
          { label: "Estimated Equity Midpoint", value: propertyEquityPosition?.estimated_equity_midpoint !== null && propertyEquityPosition?.estimated_equity_midpoint !== undefined ? `$${Number(propertyEquityPosition.estimated_equity_midpoint).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "\u2014" },
          { label: "Estimated LTV", value: propertyEquityPosition?.estimated_ltv !== null && propertyEquityPosition?.estimated_ltv !== undefined ? `${Math.round(Number(propertyEquityPosition.estimated_ltv) * 100)}%` : "\u2014" },
          { label: "Primary Mortgage Balance", value: propertyEquityPosition?.primary_mortgage_balance !== null && propertyEquityPosition?.primary_mortgage_balance !== undefined ? `$${Number(propertyEquityPosition.primary_mortgage_balance).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "\u2014" },
          { label: "Mortgage Links", value: linkedMortgages.length },
          { label: "Homeowners Links", value: linkedHomeownersPolicies.length },
          { label: "Stack Continuity", value: displayPropertyReportValue(propertyStackAnalytics?.continuity_status) },
          { label: "Stack Completeness", value: propertyStackAnalytics?.completeness_score !== null && propertyStackAnalytics?.completeness_score !== undefined ? `${Math.round(Number(propertyStackAnalytics.completeness_score) * 100)}%` : "\u2014" },
        ],
      },
      {
        id: "comparable_sales",
        title: "Comparable Sales",
        kind: "table",
        columns: [
          { key: "comp_address", label: "Comparable" },
          { key: "distance", label: "Distance" },
          { key: "sale_price", label: "Sale Price" },
          { key: "sale_date", label: "Sale Date" },
          { key: "price_per_sqft", label: "$ / Sq Ft" },
          { key: "similarity", label: "Similarity" },
        ],
        rows: (propertyComps || []).slice(0, 8).map((comp) => ({
          comp_address: comp.comp_address || "\u2014",
          distance: comp.distance_miles !== null && comp.distance_miles !== undefined ? `${comp.distance_miles} mi` : "\u2014",
          sale_price: comp.sale_price !== null && comp.sale_price !== undefined ? `$${Number(comp.sale_price).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "\u2014",
          sale_date: comp.sale_date || "\u2014",
          price_per_sqft: comp.price_per_sqft !== null && comp.price_per_sqft !== undefined ? `$${Number(comp.price_per_sqft).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "\u2014",
          similarity: comp.raw_payload?.similarity_score !== null && comp.raw_payload?.similarity_score !== undefined ? `${Math.round(Number(comp.raw_payload.similarity_score) * 100)}%` : "\u2014",
        })),
        empty_message: "No comparable sales are available yet.",
      },
      {
        id: "review_flags",
        title: "Review Flags",
        kind: "bullets",
        bullets: [
          ...(metadata.review_flags || []),
          ...(propertyEquityPosition?.review_flags || []),
          ...(propertyStackAnalytics?.review_flags || []),
        ].filter(Boolean),
      },
    ],
    debug: {
      valuation_metadata: metadata,
      valuation_change_debug: valuationChangeSummary?.debug || {},
      equity_position: propertyEquityPosition || {},
      property_stack_analytics: propertyStackAnalytics || {},
    },
  };
}
