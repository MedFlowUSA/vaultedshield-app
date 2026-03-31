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

function getConfidenceRank(meta) {
  if (!meta?.confidence) return 0;
  if (meta.confidence === "high") return 3;
  if (meta.confidence === "medium") return 2;
  if (meta.confidence === "low") return 1;
  return 0;
}

function normalizeComparableValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function maskPolicyNumber(value) {
  if (!value || value === "Not found") return "Limited visibility";
  const cleaned = String(value).trim();
  if (cleaned.length <= 4) return cleaned;
  return `****${cleaned.slice(-4)}`;
}

function buildReaderField(label, value, meta, options = {}) {
  const fallback = options.fallback || "Needs review";
  const requiredConfidence = options.requiredConfidence || "medium";
  const confidenceRank = getConfidenceRank(meta);
  const requiredRank = requiredConfidence === "high" ? 3 : requiredConfidence === "medium" ? 2 : 1;
  const missing = !value || value === "Not found";

  return {
    label,
    value: missing ? fallback : value,
    rawValue: value,
    meta,
    confidence: getConfidence(meta),
    confidenceLevel: getConfidenceLevel(meta),
    status: missing ? "missing" : confidenceRank >= requiredRank ? "confirmed" : "review",
    source: options.source || "uploaded pages",
  };
}

function formatPercentValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Limited";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatCurrencyValue(value) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "Limited";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function buildBenchmark(label, status, value, explanation) {
  return { label, status, value, explanation };
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "" && value !== "Not found") || "";
}

function buildUniformRow(label, value, options = {}) {
  const resolvedValue = value === null || value === undefined || value === "" ? "Limited" : value;
  return {
    label,
    value: resolvedValue,
    status: options.status || (resolvedValue === "Limited" ? "missing" : "confirmed"),
    note: options.note || "",
  };
}

function buildUniformTable(title, description, rows) {
  return {
    title,
    description,
    rows: rows.filter((row) => row && (row.value !== "Limited" || row.note)),
  };
}

function buildResolvedBaselineSnapshot(results, baselineSummary = {}) {
  const policyIdentity = results.normalizedPolicy?.policy_identity || {};
  const deathBenefit = results.normalizedPolicy?.death_benefit || {};
  const funding = results.normalizedPolicy?.funding || {};

  return {
    carrier: firstNonEmpty(policyIdentity.carrier_name, baselineSummary.carrier),
    productName: firstNonEmpty(policyIdentity.product_name, baselineSummary.productName),
    policyType: firstNonEmpty(policyIdentity.policy_type, baselineSummary.policyType),
    policyNumber: firstNonEmpty(policyIdentity.policy_number, baselineSummary.policyNumber),
    issueDate: firstNonEmpty(policyIdentity.issue_date, baselineSummary.issueDate),
    deathBenefit: firstNonEmpty(
      deathBenefit.current_death_benefit?.display_value,
      deathBenefit.death_benefit?.display_value,
      deathBenefit.initial_face_amount?.display_value,
      baselineSummary.deathBenefit
    ),
    plannedPremium: firstNonEmpty(
      funding.planned_premium?.display_value,
      funding.guideline_premium_limit?.display_value,
      funding.annual_target_premium?.display_value,
      baselineSummary.periodicPremium
    ),
  };
}

function buildResolvedLiveSnapshot(results, latestSummary = {}) {
  const normalizedPolicy = results.normalizedPolicy || {};
  const values = normalizedPolicy.values || {};
  const loans = normalizedPolicy.loans || {};
  const strategy = normalizedPolicy.strategy || {};
  const funding = normalizedPolicy.funding || {};
  const chargeSummary = results.normalizedAnalytics?.charge_summary || {};
  const comparison = results.normalizedAnalytics?.comparison_summary || {};
  const performanceSummary = results.normalizedAnalytics?.performance_summary || {};

  return {
    statementDate: firstNonEmpty(
      performanceSummary.latest_statement_date,
      comparison.latest_statement_date,
      latestSummary.statementDate
    ),
    accumulationValue: firstNonEmpty(values.accumulation_value?.display_value, latestSummary.accumulationValue),
    cashValue: firstNonEmpty(values.cash_value?.display_value, latestSummary.cashValue),
    cashSurrenderValue: firstNonEmpty(values.cash_surrender_value?.display_value, latestSummary.cashSurrenderValue),
    loanBalance: firstNonEmpty(loans.loan_balance?.display_value, latestSummary.loanBalance),
    costOfInsurance: firstNonEmpty(
      latestSummary.costOfInsurance,
      formatCurrencyValue(chargeSummary.total_coi)
    ),
    expenseCharge: firstNonEmpty(
      latestSummary.expenseCharge,
      formatCurrencyValue(chargeSummary.total_visible_policy_charges)
    ),
    indexStrategy: firstNonEmpty(strategy.current_index_strategy, latestSummary.indexStrategy),
    allocationPercent: firstNonEmpty(strategy.allocation_percent?.display_value, latestSummary.allocationPercent),
    capRate: firstNonEmpty(strategy.cap_rate?.display_value, latestSummary.capRate),
    participationRate: firstNonEmpty(strategy.participation_rate?.display_value),
    spread: firstNonEmpty(strategy.spread?.display_value),
    plannedPremium: firstNonEmpty(
      funding.planned_premium?.display_value,
      funding.guideline_premium_limit?.display_value
    ),
  };
}

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatScoreValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "Limited";
  return `${Math.round(Number(value))}/100`;
}

function buildEvidenceAudit(results, sections, warnings) {
  const statementResults = Array.isArray(results.statementResults) ? results.statementResults : [];
  const comparison = results.normalizedAnalytics?.comparison_summary || {};
  const performanceSummary = results.normalizedAnalytics?.performance_summary || {};
  const chargeSummary = results.normalizedAnalytics?.charge_summary || {};
  const trendSummary = results.normalizedAnalytics?.trend_summary || {};
  const issueGroups = Array.isArray(results.groupedIssues) ? results.groupedIssues : [];

  const allFields = sections.flatMap((section) => section.fields);
  const confirmedCount = allFields.filter((field) => field.status === "confirmed").length;
  const reviewCount = allFields.filter((field) => field.status === "review").length;
  const missingCount = allFields.filter((field) => field.status === "missing").length;

  const statementDates = statementResults
    .map((statement) => statement?.summary?.statementDate)
    .filter(Boolean);
  const parsedDates = statementDates.map((value) => toDate(value)).filter(Boolean);
  const sortedDates = [...parsedDates].sort((left, right) => left.getTime() - right.getTime());
  const chronologyAligned =
    parsedDates.length > 1 &&
    parsedDates.length === sortedDates.length &&
    parsedDates.every((date, index) => date.getTime() === sortedDates[index].getTime());
  const duplicateStatementDates =
    parsedDates.length - new Set(parsedDates.map((date) => date.toISOString().slice(0, 10))).size;
  const widestGapDays = parsedDates.length > 1
    ? parsedDates.slice(1).reduce((widest, date, index) => {
        const prior = parsedDates[index];
        const gap = Math.round((date.getTime() - prior.getTime()) / 86400000);
        return widest === null || gap > widest ? gap : widest;
      }, null)
    : null;
  const irregularGapCount =
    parsedDates.length > 1
      ? parsedDates.slice(1).filter((date, index) => {
          const prior = parsedDates[index];
          const gap = Math.round((date.getTime() - prior.getTime()) / 86400000);
          return gap > 430;
        }).length
      : 0;

  const identityWarnings = warnings.filter((warning) =>
    /policy numbers do not match|carrier identity differs/i.test(warning)
  );

  const signals = [
    comparison.continuity_score !== null && comparison.continuity_score !== undefined
      ? Math.min(Math.max(Number(comparison.continuity_score) / 100, 0), 1)
      : 0,
    confirmedCount / Math.max(allFields.length || 1, 1),
    statementResults.length >= 2 ? 1 : statementResults.length === 1 ? 0.65 : 0.25,
    chargeSummary.coi_confidence === "strong" ? 1 : chargeSummary.coi_confidence === "moderate" ? 0.7 : 0.3,
    performanceSummary.latest_statement_date ? 0.85 : 0.35,
    warnings.length === 0 ? 1 : 0.45,
    issueGroups.length <= 1 ? 0.85 : issueGroups.length <= 3 ? 0.65 : 0.45,
  ];
  const evidenceScore = Math.round(
    (signals.reduce((sum, signal) => sum + signal, 0) / Math.max(signals.length, 1)) * 100
  );

  const overallStatus =
    evidenceScore >= 80
      ? "strong"
      : evidenceScore >= 62
        ? "usable"
        : "provisional";

  const notes = [];
  if (statementResults.length === 0) {
    notes.push("Only the baseline illustration is visible, so live performance remains mostly unverified.");
  } else if (statementResults.length === 1) {
    notes.push("One statement is enough for current position, but not enough for a strong direction-of-travel read.");
  } else {
    notes.push(`${pluralize(statementResults.length, "statement")} are visible, which improves chronology and trend support.`);
  }

  if (comparison.continuity_score !== null && comparison.continuity_score !== undefined) {
    notes.push(`Continuity support is ${comparison.continuity_score}/100 across the visible illustration and statement packet.`);
  }

  if (chargeSummary.coi_confidence === "strong") {
    notes.push("COI support is directly visible enough to anchor a stronger charge read.");
  } else if (chargeSummary.coi_confidence === "moderate") {
    notes.push("COI support is usable, but still partly inferred from the visible charge packet.");
  } else {
    notes.push("COI support is still thin, so charge interpretation should stay conservative.");
  }

  if (parsedDates.length >= 2) {
    notes.push(
      duplicateStatementDates > 0
        ? "Duplicate statement dates are visible, so chronology may need cleanup before trusting trend detail."
        : irregularGapCount > 0
          ? "Statement spacing looks irregular, so annual continuity may be incomplete."
          : chronologyAligned
        ? "Statement chronology looks internally consistent across the visible packet."
        : "Statement chronology may be out of order or incompletely dated, which weakens trend trust."
    );
  }

  if (identityWarnings.length > 0) {
    notes.push("There are cross-document identity mismatches that should be resolved before trusting fine-grained conclusions.");
  }

  if (trendSummary?.periods_count >= 2 && trendSummary?.cash_value_trend?.note) {
    notes.push(trendSummary.cash_value_trend.note);
  }

  const headline =
    overallStatus === "strong"
      ? "The current packet is strong enough to support a relatively dependable IUL read."
      : overallStatus === "usable"
        ? "The current packet is usable, but some conclusions still depend on partial charge, chronology, or strategy support."
        : "The current packet is still provisional, so the reader should be treated as a guided review rather than a final judgment.";

  return {
    evidenceScore,
    overallStatus,
    confirmedCount,
    reviewCount,
    missingCount,
    statementCount: statementResults.length,
    chronologyStatus: parsedDates.length >= 2 ? (chronologyAligned ? "aligned" : "mixed") : "limited",
    chronologyLabel:
      parsedDates.length >= 2
        ? duplicateStatementDates > 0
          ? "Chronology duplicated"
          : irregularGapCount > 0
            ? "Chronology irregular"
            : chronologyAligned
              ? "Chronology aligned"
              : "Chronology mixed"
        : "Chronology limited",
    identityStatus: identityWarnings.length > 0 ? "review" : "clear",
    identityLabel: identityWarnings.length > 0 ? "Identity mismatches" : "Identity aligned",
    duplicateStatementDates,
    widestGapDays,
    headline,
    notes: notes.slice(0, 6),
  };
}

function buildPolicyPressureSummary(results, evidenceAudit) {
  const iulV2 = results.iulV2 || {};
  const illustration = iulV2.illustrationComparison || {};
  const charge = iulV2.chargeAnalysis || {};
  const funding = iulV2.fundingAnalysis || {};
  const risk = iulV2.riskAnalysis || {};
  const strategy = iulV2.strategyAnalysis || {};
  const optimization = results.optimizationAnalysis || null;

  const pressureItems = [];
  if (illustration.status === "behind") {
    pressureItems.push("Actual values appear to be trailing the visible illustration checkpoint.");
  } else if (illustration.status === "ahead") {
    pressureItems.push("Actual values appear to be ahead of the visible illustration checkpoint.");
  }

  if (charge.chargeDragLevel === "high") {
    pressureItems.push("Visible charges look heavy relative to visible funding.");
  } else if (charge.chargeDragLevel === "moderate") {
    pressureItems.push("Visible charges are meaningful enough to keep on watch.");
  }

  if (funding.status === "underfunded") {
    pressureItems.push("Funding pace appears below the visible target premium.");
  } else if (funding.status === "aggressive") {
    pressureItems.push("Funding pace appears stronger than the visible target premium.");
  }

  if (risk.overallRisk === "high") {
    pressureItems.push("Overall policy pressure reads high from the currently visible file.");
  } else if (risk.overallRisk === "moderate") {
    pressureItems.push("Overall policy pressure is mixed rather than cleanly healthy.");
  }

  if (strategy.concentrationLevel === "concentrated") {
    pressureItems.push("Strategy allocation looks concentrated in one visible sleeve.");
  }

  if (optimization?.priorityLevel === "high") {
    pressureItems.push("Optimization logic is also pointing to a higher-priority review.");
  }

  const status =
    risk.overallRisk === "high" || funding.status === "underfunded" || charge.chargeDragLevel === "high"
      ? "high"
      : risk.overallRisk === "moderate" || charge.chargeDragLevel === "moderate" || illustration.status === "behind"
        ? "moderate"
        : evidenceAudit.overallStatus === "provisional"
          ? "unclear"
          : "low";

  const headline =
    status === "high"
      ? "The main visible levers suggest material pressure from funding, charges, risk, or illustration drift."
      : status === "moderate"
        ? "The policy looks usable but mixed, with at least one lever that deserves closer annual review."
        : status === "low"
          ? "No major visible stress stands out from the current file."
          : "Pressure is still hard to call because evidence quality is not strong enough yet.";

  const checklist = [];
  if (illustration.status === "behind") checklist.push("Review the illustration mismatch against the latest policy year and actual values.");
  if (charge.chargeDragLevel === "high" || charge.coiVisible === false) checklist.push("Review visible COI and total charges from the statement activity pages.");
  if (funding.status === "underfunded" || funding.status === "unclear") checklist.push("Confirm planned premium, minimum premium, and actual premium pace.");
  if (strategy.allocationsVisible === false) checklist.push("Upload allocation pages to confirm indexed versus fixed exposure.");
  if (risk.factors?.some((item) => item.type === "loan_pressure")) checklist.push("Review loan balance versus current cash value and surrender value.");
  if (checklist.length === 0) checklist.push("Continue annual statement uploads to strengthen trend and projection accuracy.");

  return {
    status,
    headline,
    items: pressureItems.slice(0, 5),
    checklist: [...new Set(checklist)].slice(0, 5),
  };
}

function buildProductExplanation(results) {
  const policyType = firstNonEmpty(
    results.normalizedPolicy?.policy_identity?.policy_type,
    results.illustrationSummary?.policyType
  ) || "indexed universal life policy";
  const carrierName =
    results.carrierProfile?.display_name ||
    firstNonEmpty(results.normalizedPolicy?.policy_identity?.carrier_name, results.illustrationSummary?.carrier);
  const productName =
    results.productProfile?.display_name ||
    firstNonEmpty(results.normalizedPolicy?.policy_identity?.product_name, results.illustrationSummary?.productName);
  const productNotes = results.productProfile?.notes || "";
  const knownStrategies = Array.isArray(results.productProfile?.known_strategies) ? results.productProfile.known_strategies : [];

  const lines = [
    `This appears to be a ${policyType.toLowerCase()}${carrierName ? ` issued by ${carrierName}` : ""}${productName ? ` in the ${productName} product line` : ""}.`,
    "In plain terms, that usually means permanent life insurance coverage plus a cash-value account that can rise or fall based on premiums, policy charges, loans, and indexed or fixed crediting options.",
    productNotes,
    knownStrategies.length > 0 ? `The most common visible account options for this product family include ${knownStrategies.join(", ")}.` : "",
  ];

  return lines.filter(Boolean).join(" ");
}

function buildPolicyClassification(results, baselineSummary = {}, baselineMeta = {}) {
  const confirmedProductField = buildReaderField("Product Name", baselineSummary.productName, baselineMeta.productName, {
    source: "baseline illustration",
  });
  const confirmedTypeField = buildReaderField("Policy Type", baselineSummary.policyType, baselineMeta.policyType, {
    source: "baseline illustration",
  });
  const inferredProductName =
    results.productProfile?.display_name ||
    firstNonEmpty(results.normalizedPolicy?.policy_identity?.product_name, results.illustrationSummary?.productName) ||
    "";
  const inferredPolicyType =
    firstNonEmpty(results.normalizedPolicy?.policy_identity?.policy_type, results.illustrationSummary?.policyType) || "";

  return {
    confirmedProductName: confirmedProductField.status === "confirmed" ? confirmedProductField.value : "",
    confirmedProductStatus: confirmedProductField.status,
    confirmedPolicyType: confirmedTypeField.status === "confirmed" ? confirmedTypeField.value : "",
    confirmedPolicyTypeStatus: confirmedTypeField.status,
    inferredProductName,
    inferredPolicyType,
    productNameDisplay:
      confirmedProductField.status === "confirmed"
        ? confirmedProductField.value
        : inferredProductName
          ? `${inferredProductName} (AI inferred)`
          : "Not confirmed",
    productNameNote:
      confirmedProductField.status === "confirmed"
        ? "Product name is directly supported by the uploaded policy pages."
        : inferredProductName
          ? "Product name is not directly confirmed on the strongest extracted page, so this is an AI-supported inference."
          : "A specific product name is not clearly confirmed yet.",
    policyTypeDisplay:
      confirmedTypeField.status === "confirmed"
        ? confirmedTypeField.value
        : inferredPolicyType
          ? `${inferredPolicyType} (AI inferred)`
          : "Not confirmed",
    policyTypeNote:
      confirmedTypeField.status === "confirmed"
        ? "Policy type is directly supported by the uploaded policy pages."
        : inferredPolicyType
          ? "Policy type is inferred from the visible packet and product patterns."
          : "Policy type is not strongly supported yet.",
  };
}

function buildInitialReading(results) {
  const statementCount = Array.isArray(results.statementResults) ? results.statementResults.length : 0;
  const continuityScore = results.normalizedAnalytics?.comparison_summary?.continuity_score ?? null;
  const completeness = results.completenessAssessment?.status || results.normalizedAnalytics?.completeness_assessment?.status || "basic";
  const latestStatementDate =
    results.normalizedAnalytics?.comparison_summary?.latest_statement_date ||
    results.normalizedAnalytics?.performance_summary?.latest_statement_date ||
    results.statementResults?.at(-1)?.summary?.statementDate ||
    null;

  const lines = [
    statementCount > 0
      ? `This reading combines the initial illustration with ${statementCount} uploaded statement${statementCount === 1 ? "" : "s"}${latestStatementDate ? ` through ${latestStatementDate}` : ""}.`
      : "This reading is currently based on the initial illustration only, so the app can explain setup better than live performance.",
    continuityScore !== null
      ? `Packet support is currently ${continuityScore >= 85 ? "strong" : continuityScore >= 65 ? "usable but incomplete" : "thin"}, with a continuity score of ${continuityScore}/100.`
      : "Packet support is still forming because the app does not yet have enough statement continuity to benchmark confidently.",
    completeness === "strong"
      ? "Core identity, values, charges, and strategy details are visible enough for a fuller first read."
      : completeness === "moderate"
        ? "Core policy values are visible, but some charge or strategy pages are still limiting the read."
        : "The first read is still provisional because important charge, strategy, or chronology support is missing.",
  ];

  return lines.filter(Boolean).join(" ");
}

function buildReaderBenchmarks(results) {
  const growth = results.normalizedAnalytics?.growth_attribution || {};
  const charges = results.normalizedAnalytics?.charge_attribution || {};
  const trend = results.normalizedAnalytics?.trend_summary || {};
  const comparison = results.normalizedAnalytics?.comparison_summary || {};
  const projection = results.normalizedAnalytics?.illustration_projection || {};
  const continuityScore = comparison?.continuity_score ?? null;
  const chargeDragRatio = charges?.charge_drag_ratio ?? null;

  const fundingBenchmark =
    growth.efficiency_status === "positive_visible_growth"
      ? buildBenchmark(
          "Growth vs Funding",
          "good",
          growth.net_growth_display || "Positive",
          "In simple terms, the visible account value is still staying ahead of the premiums currently visible in the file."
        )
      : growth.efficiency_status === "growth_pressured"
        ? buildBenchmark(
            "Growth vs Funding",
            "watch",
            growth.net_growth_display || "Pressured",
            "In simple terms, the visible value is not keeping up with the funding shown in the file, so drag and policy costs need attention."
          )
        : buildBenchmark(
            "Growth vs Funding",
            "limited",
            "Incomplete",
            "There is not enough clean premium and value history yet to judge whether growth is keeping up."
          );

  const chargeBenchmark =
    chargeDragRatio === null
      ? buildBenchmark(
          "Charge Pressure",
          "limited",
          charges.charge_drag_ratio_display || "Limited",
          "Charges are only partially visible, so this is not yet a reliable drag reading."
        )
      : chargeDragRatio <= 0.15
        ? buildBenchmark(
            "Charge Pressure",
            "good",
            formatPercentValue(chargeDragRatio),
            "Visible charges look moderate relative to the premiums visible in the file."
          )
        : chargeDragRatio <= 0.3
          ? buildBenchmark(
              "Charge Pressure",
              "watch",
              formatPercentValue(chargeDragRatio),
              "Visible charges are meaningful enough that they should be reviewed alongside growth."
            )
          : buildBenchmark(
              "Charge Pressure",
              "risk",
              formatPercentValue(chargeDragRatio),
              "Visible charges look heavy relative to visible funding, which can materially slow policy growth."
            );

  const continuityBenchmark =
    continuityScore === null
      ? buildBenchmark(
          "Statement Support",
          "limited",
          "Limited",
          "The file does not yet have enough clean statement continuity for a strong benchmark read."
        )
      : continuityScore >= 85
        ? buildBenchmark(
            "Statement Support",
            "good",
            `${continuityScore}/100`,
            "The statement trail is strong enough to support a more dependable reading."
          )
        : continuityScore >= 65
          ? buildBenchmark(
              "Statement Support",
              "watch",
              `${continuityScore}/100`,
              "The statement trail is usable, but there are still visibility gaps that can affect the conclusions."
            )
          : buildBenchmark(
              "Statement Support",
              "risk",
              `${continuityScore}/100`,
              "The statement trail is thin or inconsistent, so the reading should be treated as provisional."
            );

  const trendBenchmark =
    trend?.periods_count >= 2 && trend?.cash_value_trend?.status && trend.cash_value_trend.status !== "limited"
      ? buildBenchmark(
          "Value Direction",
          trend.cash_value_trend.status === "increase" ? "good" : trend.cash_value_trend.status === "flat" ? "watch" : "risk",
          trend.cash_value_trend.status === "increase" ? "Upward" : trend.cash_value_trend.status === "flat" ? "Flat" : "Downward",
          trend.cash_value_trend.note || "Visible value direction was identified from the statement history."
        )
      : buildBenchmark(
          "Value Direction",
          "limited",
          trend?.periods_count >= 2 ? "Mixed" : "Not enough history",
          trend?.periods_count >= 2
            ? "Multiple statements exist, but the visible values are not clean enough for a confident trend direction."
            : "A single statement can show current position, but not a meaningful direction of travel."
        );

  const projectionBenchmark =
    projection?.comparison_possible && projection?.current_projection_match
      ? buildBenchmark(
          "Projection Match",
          "good",
          `Year ${projection.current_projection_match.matched_policy_year}`,
          "The latest visible statement lines up cleanly enough with an extracted illustration checkpoint for a projected-versus-actual comparison."
        )
      : projection?.comparison_possible
        ? buildBenchmark(
            "Projection Match",
            "watch",
            `${projection.row_count || 0} checkpoints`,
            "Projection checkpoints were extracted, but the latest actual statement does not line up cleanly enough by policy year yet."
          )
        : buildBenchmark(
            "Projection Match",
            "limited",
            "Not available",
            "No usable illustration checkpoints were identified yet, so projection comparisons remain limited."
          );

  const laymanSummary = [
    fundingBenchmark.explanation,
    chargeBenchmark.explanation,
    continuityBenchmark.explanation,
  ]
    .filter(Boolean)
    .join(" ");

  let projectionSummary =
    "This is not a carrier projection. It is a directional read based on the statements you uploaded.";
  if (trend?.periods_count >= 2 && growth.efficiency_status === "positive_visible_growth") {
    projectionSummary =
      "If the current pattern continues, the policy appears more likely to keep building value than losing ground, but that depends on future charges, credits, and funding staying reasonably similar.";
  } else if (trend?.periods_count >= 2 && growth.efficiency_status === "growth_pressured") {
    projectionSummary =
      "If the current pattern continues, the policy appears more likely to feel ongoing drag from charges or weak value growth, so future reviews should focus on deductions, funding, and loan pressure.";
  } else if (trend?.periods_count < 2) {
    projectionSummary =
      "A real projection read needs more than one usable statement period. Right now the app can describe current position better than future direction.";
  }

  return {
    benchmarks: [fundingBenchmark, chargeBenchmark, continuityBenchmark, trendBenchmark, projectionBenchmark],
    laymanSummary,
    projectionSummary,
  };
}

function buildProjectionView(results) {
  const projection = results.normalizedAnalytics?.illustration_projection || {};
  const benchmarkRows = Array.isArray(projection.benchmark_rows) ? projection.benchmark_rows : [];
  const currentMatch = projection.current_projection_match || null;
  const illustrationComparison = results.iulV2?.illustrationComparison || {};
  const optimization = results.optimizationAnalysis || null;
  const chronology = illustrationComparison.chronologySupport || null;
  const chronologyStatus = chronology?.status || "limited";
  const duplicateCount = Number(chronology?.duplicateDateCount || 0);
  const irregularGapCount = Number(chronology?.irregularGapCount || 0);
  const statementCount = Number(chronology?.statementCount || (Array.isArray(results.statementResults) ? results.statementResults.length : 0));

  const annualReviewStatus =
    chronologyStatus === "healthy" || chronologyStatus === "strong"
      ? "confirmed"
      : chronologyStatus === "mixed"
        ? "missing"
        : "review";

  const annualReviewLabel =
    annualReviewStatus === "confirmed"
      ? "Annual review support is clean"
      : annualReviewStatus === "review"
        ? "Annual review support is usable but limited"
        : "Annual review support needs cleanup";

  const chronologyLabel =
    chronologyStatus === "healthy" || chronologyStatus === "strong"
      ? "Chronology aligned"
      : chronologyStatus === "mixed"
        ? "Chronology mixed"
        : "Chronology limited";

  const chronologyNote =
    chronology?.note ||
    (chronologyStatus === "mixed"
      ? "Visible statement timing is irregular or duplicated, which weakens year-over-year comparison confidence."
      : chronologyStatus === "healthy" || chronologyStatus === "strong"
        ? "Visible statements appear reasonably clean for year-over-year review."
        : "There are not enough dated statements yet for a stronger annual comparison read.");

  const annualReviewChecklist = [];
  if (chronologyStatus === "mixed") {
    annualReviewChecklist.push("Confirm one clean annual statement per policy year before leaning on drift conclusions.");
  } else if (chronologyStatus !== "healthy" && chronologyStatus !== "strong") {
    annualReviewChecklist.push("Add more dated annual statements to improve year-over-year comparison confidence.");
  }

  if (!currentMatch) {
    annualReviewChecklist.push("Upload a fuller illustration ledger or in-force ledger with yearly checkpoints.");
  }

  if (optimization?.recommendations?.length) {
    optimization.recommendations.slice(0, 2).forEach((item) => {
      if (item?.title) annualReviewChecklist.push(item.title);
    });
  }

  return {
    available: Boolean(projection.comparison_possible),
    benchmarkRows,
    currentMatch,
    narrative:
      projection.narrative ||
      "Projection support is limited because extracted illustration ledger checkpoints were not available.",
    limitations: projection.limitations || [],
    chronologyStatus,
    chronologyLabel,
    chronologyNote,
    annualReviewStatus,
    annualReviewLabel,
    statementCount,
    duplicateCount,
    irregularGapCount,
    annualReviewChecklist: [...new Set(annualReviewChecklist)].slice(0, 4),
  };
}

function buildUnifiedFocusCards(results = {}) {
  const iulV2 = results.iulV2 || null;
  if (!iulV2) return [];

  const illustration = iulV2.illustrationComparison || {};
  const charge = iulV2.chargeAnalysis || {};
  const funding = iulV2.fundingAnalysis || {};
  const risk = iulV2.riskAnalysis || {};
  const strategy = iulV2.strategyAnalysis || {};

  return [
    {
      title: "Illustration vs Actual",
      status: illustration.status || "limited",
      value:
        illustration.varianceDisplay ||
        illustration.selectedMetricData?.actualDisplay ||
        illustration.selectedMetricData?.illustratedDisplay ||
        "Limited",
      detail: illustration.confidenceExplanation || "",
      explanation: illustration.shortExplanation || illustration.explanation || "Illustration alignment is still forming.",
    },
    {
      title: "Charge Drag",
      status: charge.chargeDragLevel || "unknown",
      value: charge.totalVisibleCharges !== null && charge.totalVisibleCharges !== undefined
        ? formatCurrencyValue(charge.totalVisibleCharges)
        : "Limited",
      detail: charge.coiVisible ? "Visible COI support is present." : "COI visibility is still limited.",
      explanation: charge.explanation || "Charge visibility is still forming.",
    },
    {
      title: "Funding Pace",
      status: funding.status || "unclear",
      value: funding.observedFundingPace !== null && funding.observedFundingPace !== undefined
        ? formatCurrencyValue(funding.observedFundingPace)
        : "Limited",
      detail:
        funding.plannedPremium !== null && funding.plannedPremium !== undefined
          ? `Visible target premium ${formatCurrencyValue(funding.plannedPremium)}.`
          : "Visible premium target is still limited.",
      explanation: funding.explanation || "Funding sufficiency is still forming.",
    },
    {
      title: "Risk Pressure",
      status: risk.overallRisk || "unclear",
      value: risk.riskScore !== null && risk.riskScore !== undefined ? `${risk.riskScore}/100` : "Limited",
      detail: risk.lapsePressure ? `Lapse pressure reads ${risk.lapsePressure}.` : "",
      explanation: risk.explanation || "Risk pressure is still forming.",
    },
    {
      title: "Strategy Mix",
      status: strategy.concentrationLevel || "unknown",
      value: strategy.strategyCount ? `${strategy.strategyCount} visible ${strategy.strategyCount === 1 ? "strategy" : "strategies"}` : "Limited",
      detail:
        strategy.indexedExposurePercent !== null && strategy.fixedExposurePercent !== null
          ? `Indexed ${strategy.indexedExposurePercent}% / Fixed ${strategy.fixedExposurePercent}%.`
          : "Allocation percentages are still limited.",
      explanation: strategy.explanation || "Strategy visibility is still forming.",
    },
  ].filter((card) => card.explanation || card.value !== "Limited");
}

export function buildIulReaderModel(results) {
  const statementResults = Array.isArray(results.statementResults) ? results.statementResults : [];
  const baselineSummary = results.illustrationSummary || {};
  const baselineMeta = baselineSummary.__meta || {};
  const latestStatement = statementResults.at(-1) || null;
  const latestSummary = latestStatement?.summary || {};
  const latestMeta = latestSummary.__meta || {};
  const resolvedBaseline = buildResolvedBaselineSnapshot(results, baselineSummary);
  const resolvedLive = buildResolvedLiveSnapshot(results, latestSummary);

  const sections = [
    {
      title: "Policy Identity",
      description: "Core policy facts pulled from the baseline illustration.",
      fields: [
        buildReaderField("Carrier", resolvedBaseline.carrier, baselineMeta.carrier, { source: "baseline illustration or normalized identity" }),
        buildReaderField("Product", resolvedBaseline.productName, baselineMeta.productName, { source: "baseline illustration or normalized identity" }),
        buildReaderField("Policy Type", resolvedBaseline.policyType, baselineMeta.policyType, { source: "baseline illustration or normalized identity" }),
        buildReaderField("Policy Number", maskPolicyNumber(resolvedBaseline.policyNumber), baselineMeta.policyNumber, {
          source: "baseline illustration",
        }),
        buildReaderField("Issue Date", resolvedBaseline.issueDate, baselineMeta.issueDate, { source: "baseline illustration or normalized identity" }),
        buildReaderField("Death Benefit", resolvedBaseline.deathBenefit, baselineMeta.deathBenefit, {
          source: "baseline illustration or normalized policy",
        }),
        buildReaderField("Planned Premium", resolvedBaseline.plannedPremium, baselineMeta.periodicPremium, {
          source: "baseline illustration or normalized funding",
        }),
      ],
    },
    {
      title: "Current Policy Position",
      description: "Latest statement values used for the live reading.",
      fields: [
        buildReaderField("Latest Statement Date", resolvedLive.statementDate, latestMeta.statementDate, {
          source: latestStatement?.fileName || "latest statement or normalized analytics",
        }),
        buildReaderField("Accumulation Value", resolvedLive.accumulationValue, latestMeta.accumulationValue, {
          source: latestStatement?.fileName || "latest statement or normalized policy",
        }),
        buildReaderField("Cash Value", resolvedLive.cashValue, latestMeta.cashValue, {
          source: latestStatement?.fileName || "latest statement or normalized policy",
        }),
        buildReaderField("Cash Surrender Value", resolvedLive.cashSurrenderValue, latestMeta.cashSurrenderValue, {
          source: latestStatement?.fileName || "latest statement or normalized policy",
        }),
        buildReaderField("Loan Balance", resolvedLive.loanBalance, latestMeta.loanBalance, {
          source: latestStatement?.fileName || "latest statement or normalized policy",
        }),
      ],
    },
    {
      title: "Charges And Strategy",
      description: "Terms that usually require statement activity pages or allocation detail.",
      fields: [
        buildReaderField("Cost of Insurance", resolvedLive.costOfInsurance, latestMeta.costOfInsurance, {
          source: latestStatement?.fileName || "latest statement or normalized analytics",
        }),
        buildReaderField("Expense Charges", resolvedLive.expenseCharge, latestMeta.expenseCharge, {
          source: latestStatement?.fileName || "latest statement or normalized analytics",
        }),
        buildReaderField("Index Strategy", resolvedLive.indexStrategy, latestMeta.indexStrategy, {
          source: latestStatement?.fileName || "latest statement or normalized policy",
        }),
        buildReaderField("Allocation Percent", resolvedLive.allocationPercent, latestMeta.allocationPercent, {
          source: latestStatement?.fileName || "latest statement or normalized policy",
        }),
        buildReaderField("Cap Rate", resolvedLive.capRate, latestMeta.capRate, {
          source: latestStatement?.fileName || "latest statement or normalized policy",
        }),
      ],
    },
  ];

  const allFields = sections.flatMap((section) => section.fields);
  const confirmed = allFields.filter((field) => field.status === "confirmed");
  const review = allFields.filter((field) => field.status === "review");
  const missing = allFields.filter((field) => field.status === "missing");

  const warnings = [];
  if (
    resolvedBaseline.policyNumber &&
    (latestSummary.policyNumber || resolvedBaseline.policyNumber) &&
    getConfidenceRank(baselineMeta.policyNumber) >= 2 &&
    getConfidenceRank(latestMeta.policyNumber) >= 2 &&
    normalizeComparableValue(resolvedBaseline.policyNumber) !== normalizeComparableValue(latestSummary.policyNumber)
  ) {
    warnings.push("Baseline and latest statement policy numbers do not match. Review the uploaded packet before trusting the reading.");
  }
  if (
    resolvedBaseline.carrier &&
    latestSummary.carrier &&
    getConfidenceRank(baselineMeta.carrier) >= 2 &&
    getConfidenceRank(latestMeta.carrier) >= 2 &&
    normalizeComparableValue(resolvedBaseline.carrier) !== normalizeComparableValue(latestSummary.carrier)
  ) {
    warnings.push("Carrier identity differs between the illustration and latest statement. This can indicate a misclassified page or mixed packet.");
  }
  if (!results.carrierProfile) {
    warnings.push("Carrier-specific parser support was not matched, so more of this read depends on generic label recognition.");
  }
  if (!results.productProfile) {
    warnings.push("Product-family recognition is still limited, so some strategy and product-specific interpretation remains generic.");
  }
  if (statementResults.length >= 2 && !results.analytics?.growth_trend?.value) {
    warnings.push("Multiple statements are loaded, but growth trend quality is still limited because one or more statement dates or values were not confirmed strongly enough.");
  }
  if (results.analytics?.performance_summary?.illustration_variance === "Not found") {
    warnings.push("Illustration variance is intentionally withheld until an actual illustrated value field is available. Face amount is not used as a proxy.");
  }

  const nextSteps = [];
  if (statementResults.length === 0) {
    nextSteps.push("Upload the most recent annual statement to unlock the live policy reading.");
  }
  if (missing.some((field) => ["Issue Date", "Policy Number", "Death Benefit", "Planned Premium"].includes(field.label))) {
    nextSteps.push("Include the illustration page that contains the policy summary or face amount and premium details.");
  }
  if (missing.some((field) => ["Cost of Insurance", "Expense Charges"].includes(field.label))) {
    nextSteps.push("Include statement pages with monthly activity, charges, or policy activity summary tables.");
  }
  if (missing.some((field) => ["Index Strategy", "Allocation Percent", "Cap Rate"].includes(field.label))) {
    nextSteps.push("Include strategy allocation or segment detail pages to improve indexed-account accuracy.");
  }
  if (nextSteps.length === 0) {
    nextSteps.push("The current packet supports the main IUL reader. Additional statements would mostly improve trends rather than core identity.");
  }
  if (!results.carrierProfile) {
    nextSteps.push("Upload a clearer carrier-branded policy summary or annual statement cover page to improve carrier-specific parsing.");
  }
  if (!results.productProfile) {
    nextSteps.push("Upload the illustration page that shows the exact product line or plan name to improve product-family interpretation.");
  }

  const benchmarkView = buildReaderBenchmarks(results);
  const projectionView = buildProjectionView(results);
  const classification = buildPolicyClassification(results, baselineSummary, baselineMeta);
  const comparison = results.normalizedAnalytics?.comparison_summary || {};
  const chargeSummary = results.normalizedAnalytics?.charge_summary || {};
  const strategy = results.normalizedPolicy?.strategy || {};
  const values = results.normalizedPolicy?.values || {};
  const funding = results.normalizedPolicy?.funding || {};
  const deathBenefit = results.normalizedPolicy?.death_benefit || {};
  const performanceSummary = results.normalizedAnalytics?.performance_summary || {};
  const policyInterpretation = results.policyInterpretation || null;
  const optimizationAnalysis = results.optimizationAnalysis || null;
  const groupedIssues = Array.isArray(results.groupedIssues) ? results.groupedIssues : [];
  const unifiedCards = buildUnifiedFocusCards(results);
  const evidenceAudit = buildEvidenceAudit(results, sections, warnings);
  const pressureSummary = buildPolicyPressureSummary(
    { ...results, optimizationAnalysis },
    evidenceAudit
  );

  const readerTables = [
    buildUniformTable("Values And Funding", "The main numbers most clients expect in an initial policy read.", [
      buildUniformRow(
        "Death Benefit",
        firstNonEmpty(
          deathBenefit.current_death_benefit?.display_value,
          deathBenefit.death_benefit?.display_value,
          baselineSummary.deathBenefit
        )
      ),
      buildUniformRow(
        "Planned Premium",
        firstNonEmpty(funding.planned_premium?.display_value, baselineSummary.periodicPremium),
        {
          note: "This is the planned or visible scheduled premium, not necessarily what was actually paid every year.",
        }
      ),
      buildUniformRow("Accumulation Value", firstNonEmpty(values.accumulation_value?.display_value, latestSummary.accumulationValue)),
      buildUniformRow("Cash Value", firstNonEmpty(values.cash_value?.display_value, latestSummary.cashValue)),
      buildUniformRow("Cash Surrender Value", firstNonEmpty(values.cash_surrender_value?.display_value, latestSummary.cashSurrenderValue)),
      buildUniformRow("Loan Balance", firstNonEmpty(results.normalizedPolicy?.loans?.loan_balance?.display_value, latestSummary.loanBalance), {
        note: "Loans can materially change how strong a policy looks even when credited growth is still positive.",
      }),
      buildUniformRow("Net Visible Growth", performanceSummary.net_policy_growth || "Limited", {
        status: performanceSummary.net_policy_growth && performanceSummary.net_policy_growth !== "$0.00" ? "confirmed" : "review",
        note: results.normalizedAnalytics?.presentation_values?.growth_note || "",
      }),
    ]),
    buildUniformTable("Charges And Crediting", "Where the policy is gaining support or feeling drag.", [
      buildUniformRow("Visible COI", firstNonEmpty(resolvedLive.costOfInsurance, formatCurrencyValue(chargeSummary.total_coi)), {
        note: chargeSummary.coi_confidence ? `COI confidence: ${chargeSummary.coi_confidence}.` : "",
        status: chargeSummary.coi_confidence === "strong" ? "confirmed" : chargeSummary.coi_confidence ? "review" : "missing",
      }),
      buildUniformRow(
        "Visible Charges",
        firstNonEmpty(formatCurrencyValue(chargeSummary.total_visible_policy_charges), latestSummary.expenseCharge),
        {
          note: results.normalizedAnalytics?.presentation_values?.charge_note || (chargeSummary.charge_notes || []).join(" ") || "",
        }
      ),
      buildUniformRow("Charge Drag", comparison.charge_drag_ratio || "Limited", {
        status:
          comparison.charge_drag_ratio && comparison.charge_visibility_status !== "limited"
            ? "review"
            : "missing",
      }),
      buildUniformRow("Index Strategy", firstNonEmpty(strategy.current_index_strategy, resolvedLive.indexStrategy), {
        note: results.productProfile?.known_strategies?.length
          ? `Expected options often include ${results.productProfile.known_strategies.join(", ")}.`
          : "",
      }),
      buildUniformRow("Allocation", firstNonEmpty(strategy.allocation_percent?.display_value, resolvedLive.allocationPercent)),
      buildUniformRow("Cap / Participation / Spread", [
        firstNonEmpty(strategy.cap_rate?.display_value, resolvedLive.capRate),
        firstNonEmpty(strategy.participation_rate?.display_value, resolvedLive.participationRate),
        firstNonEmpty(strategy.spread?.display_value, resolvedLive.spread),
      ].filter(Boolean).join(" / "), {
        status: strategy.cap_rate?.display_value || strategy.participation_rate?.display_value || strategy.spread?.display_value ? "confirmed" : "missing",
      }),
    ]),
    buildUniformTable("Carrier And Product Support", "How much of this IUL read is using carrier-aware and product-aware pattern recognition.", [
      buildUniformRow("Carrier Profile", results.carrierProfile?.display_name || results.carrierProfile?.name || "Limited", {
        status: results.carrierProfile ? "confirmed" : "review",
        note: results.carrierProfile
          ? "Carrier-specific parsing patterns are active for this packet."
          : "The packet is currently using generic parsing more than carrier-specific parsing.",
      }),
      buildUniformRow("Product Family", results.productProfile?.display_name || results.productProfile?.key || "Limited", {
        status: results.productProfile ? "confirmed" : "review",
        note: results.productProfile
          ? "Product-family hints are helping strategy and behavior interpretation."
          : "Product-family interpretation remains generic until a cleaner product name is visible.",
      }),
      buildUniformRow("Strategy Reference Hits", Array.isArray(results.strategyReferenceHits) ? String(results.strategyReferenceHits.length) : "0", {
        status: Array.isArray(results.strategyReferenceHits) && results.strategyReferenceHits.length > 0 ? "confirmed" : "review",
        note:
          Array.isArray(results.strategyReferenceHits) && results.strategyReferenceHits.length > 0
            ? "Carrier/product-specific strategy references were matched in the packet."
            : "No strong carrier/product strategy references were matched yet.",
      }),
      buildUniformRow("Visible Product-Specific Terms", [
        firstNonEmpty(resolvedLive.capRate),
        firstNonEmpty(resolvedLive.participationRate),
        firstNonEmpty(resolvedLive.spread),
      ].filter(Boolean).join(" / "), {
        status: resolvedLive.capRate || resolvedLive.participationRate || resolvedLive.spread ? "confirmed" : "missing",
        note: "These terms often vary by carrier, so seeing them improves product-specific interpretation.",
      }),
    ]),
    buildUniformTable("Packet Support And Audit", "How dependable the current packet is for a real-world IUL review.", [
      buildUniformRow("Evidence Score", formatScoreValue(evidenceAudit.evidenceScore), {
        status:
          evidenceAudit.overallStatus === "strong"
            ? "confirmed"
            : evidenceAudit.overallStatus === "usable"
              ? "review"
              : "missing",
        note: evidenceAudit.headline,
      }),
      buildUniformRow("Statement Count", evidenceAudit.statementCount ? String(evidenceAudit.statementCount) : "Illustration only", {
        status: evidenceAudit.statementCount >= 2 ? "confirmed" : evidenceAudit.statementCount === 1 ? "review" : "missing",
        note:
          evidenceAudit.statementCount >= 2
            ? "Multiple statements improve trend and chronology support."
            : evidenceAudit.statementCount === 1
              ? "One statement gives current position but not a strong direction-of-travel read."
              : "No annual statements are visible yet.",
      }),
      buildUniformRow("Chronology", evidenceAudit.chronologyLabel, {
        status:
          evidenceAudit.chronologyStatus === "aligned"
            ? "confirmed"
            : evidenceAudit.chronologyStatus === "mixed"
              ? "review"
              : "missing",
        note:
          evidenceAudit.chronologyStatus === "aligned"
            ? "Statement order looks internally consistent."
            : evidenceAudit.chronologyStatus === "mixed"
              ? "Some statement ordering or date support may still need cleanup."
              : "Not enough dated statements are visible to judge chronology.",
      }),
      buildUniformRow("Identity Match", evidenceAudit.identityLabel, {
        status: evidenceAudit.identityStatus === "clear" ? "confirmed" : "review",
        note:
          evidenceAudit.identityStatus === "clear"
            ? "No cross-document carrier or policy-number mismatch was detected in the strongest visible fields."
            : "At least one carrier or policy-number mismatch should be resolved before trusting fine-grained conclusions.",
      }),
    ]),
  ].filter((table) => table.rows.length > 0);

  return {
    sections,
    confirmed,
    review,
    missing,
    warnings,
    nextSteps,
    latestStatement,
    benchmarks: benchmarkView.benchmarks,
    laymanSummary: benchmarkView.laymanSummary,
    projectionSummary: benchmarkView.projectionSummary,
    projectionView,
    classification,
    evidenceAudit,
    pressureSummary,
    overview: {
      continuityScore:
        comparison.continuity_score !== null && comparison.continuity_score !== undefined
          ? `${comparison.continuity_score}/100`
          : "Limited",
      continuityNote: comparison.continuity_explanation || "",
      latestStatement:
        performanceSummary.latest_statement_date || latestSummary.statementDate || "Illustration only so far",
      latestStatementStatus:
        performanceSummary.latest_statement_date || latestSummary.statementDate ? "confirmed" : "review",
      assessment: firstNonEmpty(
        results.analytics?.policy_health_score?.value?.label,
        results.normalizedAnalytics?.policy_health_score?.status
          ? String(results.normalizedAnalytics.policy_health_score.status)
              .replace(/_/g, " ")
              .replace(/\b\w/g, (character) => character.toUpperCase())
          : ""
      ) || "Still forming",
      assessmentNote: results.normalizedAnalytics?.policy_health_score?.score
        ? `Health score: ${results.normalizedAnalytics.policy_health_score.score}/10.`
        : results.normalizedAnalytics?.presentation_values?.confirmed_summary || "",
      carrier:
        results.carrierProfile?.display_name || baselineSummary.carrier || "Needs review",
      carrierNote: results.carrierProfile?.known_document_patterns?.length
        ? `Known document patterns: ${results.carrierProfile.known_document_patterns.slice(0, 3).join(", ")}.`
        : "Carrier-specific pattern support is still generic.",
    },
    headline:
      policyInterpretation?.bottom_line_summary ||
      results.normalizedAnalytics?.presentation_values?.confirmed_summary ||
      "This reader emphasizes the values and comparisons that have enough support to trust first.",
    narrative:
      [
        policyInterpretation?.policy_overview_summary,
        policyInterpretation?.current_position_summary,
      ]
        .filter(Boolean)
        .join(" ") || "",
    productExplanation: buildProductExplanation(results),
    initialReading: buildInitialReading(results),
    readerTables,
    unifiedCards,
    issueGroups: groupedIssues,
    optimization: optimizationAnalysis
      ? {
          explanation: optimizationAnalysis.explanation,
          overallStatus: optimizationAnalysis.overallStatus || "insufficient_data",
          priorityLevel: optimizationAnalysis.priorityLevel || "low",
          recommendations: Array.isArray(optimizationAnalysis.recommendations) ? optimizationAnalysis.recommendations : [],
          risks: Array.isArray(optimizationAnalysis.risks) ? optimizationAnalysis.risks : [],
          opportunities: Array.isArray(optimizationAnalysis.opportunities) ? optimizationAnalysis.opportunities : [],
        }
      : null,
  };
}
