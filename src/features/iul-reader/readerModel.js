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

  return {
    available: Boolean(projection.comparison_possible),
    benchmarkRows,
    currentMatch,
    narrative:
      projection.narrative ||
      "Projection support is limited because extracted illustration ledger checkpoints were not available.",
    limitations: projection.limitations || [],
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

  const sections = [
    {
      title: "Policy Identity",
      description: "Core policy facts pulled from the baseline illustration.",
      fields: [
        buildReaderField("Carrier", baselineSummary.carrier, baselineMeta.carrier, { source: "baseline illustration" }),
        buildReaderField("Product", baselineSummary.productName, baselineMeta.productName, { source: "baseline illustration" }),
        buildReaderField("Policy Type", baselineSummary.policyType, baselineMeta.policyType, { source: "baseline illustration" }),
        buildReaderField("Policy Number", maskPolicyNumber(baselineSummary.policyNumber), baselineMeta.policyNumber, {
          source: "baseline illustration",
        }),
        buildReaderField("Issue Date", baselineSummary.issueDate, baselineMeta.issueDate, { source: "baseline illustration" }),
        buildReaderField("Death Benefit", baselineSummary.deathBenefit, baselineMeta.deathBenefit, {
          source: "baseline illustration",
        }),
        buildReaderField("Planned Premium", baselineSummary.periodicPremium, baselineMeta.periodicPremium, {
          source: "baseline illustration",
        }),
      ],
    },
    {
      title: "Current Policy Position",
      description: "Latest statement values used for the live reading.",
      fields: [
        buildReaderField("Latest Statement Date", latestSummary.statementDate, latestMeta.statementDate, {
          source: latestStatement?.fileName || "latest statement",
        }),
        buildReaderField("Accumulation Value", latestSummary.accumulationValue, latestMeta.accumulationValue, {
          source: latestStatement?.fileName || "latest statement",
        }),
        buildReaderField("Cash Value", latestSummary.cashValue, latestMeta.cashValue, {
          source: latestStatement?.fileName || "latest statement",
        }),
        buildReaderField("Cash Surrender Value", latestSummary.cashSurrenderValue, latestMeta.cashSurrenderValue, {
          source: latestStatement?.fileName || "latest statement",
        }),
        buildReaderField("Loan Balance", latestSummary.loanBalance, latestMeta.loanBalance, {
          source: latestStatement?.fileName || "latest statement",
        }),
      ],
    },
    {
      title: "Charges And Strategy",
      description: "Terms that usually require statement activity pages or allocation detail.",
      fields: [
        buildReaderField("Cost of Insurance", latestSummary.costOfInsurance, latestMeta.costOfInsurance, {
          source: latestStatement?.fileName || "latest statement",
        }),
        buildReaderField("Expense Charges", latestSummary.expenseCharge, latestMeta.expenseCharge, {
          source: latestStatement?.fileName || "latest statement",
        }),
        buildReaderField("Index Strategy", latestSummary.indexStrategy, latestMeta.indexStrategy, {
          source: latestStatement?.fileName || "latest statement",
        }),
        buildReaderField("Allocation Percent", latestSummary.allocationPercent, latestMeta.allocationPercent, {
          source: latestStatement?.fileName || "latest statement",
        }),
        buildReaderField("Cap Rate", latestSummary.capRate, latestMeta.capRate, {
          source: latestStatement?.fileName || "latest statement",
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
    baselineSummary.policyNumber &&
    latestSummary.policyNumber &&
    getConfidenceRank(baselineMeta.policyNumber) >= 2 &&
    getConfidenceRank(latestMeta.policyNumber) >= 2 &&
    normalizeComparableValue(baselineSummary.policyNumber) !== normalizeComparableValue(latestSummary.policyNumber)
  ) {
    warnings.push("Baseline and latest statement policy numbers do not match. Review the uploaded packet before trusting the reading.");
  }
  if (
    baselineSummary.carrier &&
    latestSummary.carrier &&
    getConfidenceRank(baselineMeta.carrier) >= 2 &&
    getConfidenceRank(latestMeta.carrier) >= 2 &&
    normalizeComparableValue(baselineSummary.carrier) !== normalizeComparableValue(latestSummary.carrier)
  ) {
    warnings.push("Carrier identity differs between the illustration and latest statement. This can indicate a misclassified page or mixed packet.");
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
      buildUniformRow("Visible COI", firstNonEmpty(latestSummary.costOfInsurance, formatCurrencyValue(chargeSummary.total_coi)), {
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
      buildUniformRow("Index Strategy", firstNonEmpty(strategy.current_index_strategy, latestSummary.indexStrategy), {
        note: results.productProfile?.known_strategies?.length
          ? `Expected options often include ${results.productProfile.known_strategies.join(", ")}.`
          : "",
      }),
      buildUniformRow("Allocation", firstNonEmpty(strategy.allocation_percent?.display_value, latestSummary.allocationPercent)),
      buildUniformRow("Cap / Participation / Spread", [
        firstNonEmpty(strategy.cap_rate?.display_value, latestSummary.capRate),
        firstNonEmpty(strategy.participation_rate?.display_value),
        firstNonEmpty(strategy.spread?.display_value),
      ].filter(Boolean).join(" / "), {
        status: strategy.cap_rate?.display_value || strategy.participation_rate?.display_value || strategy.spread?.display_value ? "confirmed" : "missing",
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
