function currencyToNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,%\s,()]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceFromSignals(signals = []) {
  if (signals.length === 0) return 0;
  const score = signals.reduce((sum, signal) => sum + signal, 0) / signals.length;
  return Math.max(0, Math.min(1, score));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function currencyToDisplay(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function resolveBeneficiarySignals(policy = {}) {
  const normalizedPolicy = policy?.normalizedPolicy || {};
  const lifePolicy = policy?.lifePolicy || {};
  const identity = normalizedPolicy?.policy_identity || {};

  const primaryName = normalizeText(
    lifePolicy?.identity?.primaryBeneficiaryName || identity?.primary_beneficiary_name
  );
  const primaryShare = normalizeText(
    lifePolicy?.identity?.primaryBeneficiaryShare || identity?.primary_beneficiary_share
  );
  const contingentName = normalizeText(
    lifePolicy?.identity?.contingentBeneficiaryName || identity?.contingent_beneficiary_name
  );
  const contingentShare = normalizeText(
    lifePolicy?.identity?.contingentBeneficiaryShare || identity?.contingent_beneficiary_share
  );
  const statusLabel = normalizeText(
    lifePolicy?.identity?.beneficiaryStatus || identity?.beneficiary_status
  );

  const anyVisible = Boolean(primaryName || contingentName || statusLabel);
  const visibility =
    primaryName || contingentName
      ? "named"
      : statusLabel
        ? "mentioned"
        : "limited";

  return {
    primaryName,
    primaryShare,
    contingentName,
    contingentShare,
    statusLabel,
    anyVisible,
    visibility,
  };
}

function resolveOwnershipSignals(policy = {}) {
  const normalizedPolicy = policy?.normalizedPolicy || {};
  const lifePolicy = policy?.lifePolicy || {};
  const comparisonSummary = policy?.comparisonSummary || {};
  const identity = normalizedPolicy?.policy_identity || {};

  const ownerName = normalizeText(
    lifePolicy?.identity?.ownerName || identity?.owner_name || comparisonSummary?.owner_name
  );
  const jointInsuredName = normalizeText(
    lifePolicy?.identity?.jointInsuredName || identity?.joint_insured_name || comparisonSummary?.joint_insured_name
  );
  const insuredName = normalizeText(
    lifePolicy?.identity?.insuredName || identity?.insured_name || comparisonSummary?.insured_name
  );
  const payorName = normalizeText(
    lifePolicy?.identity?.payorName || identity?.payor_name || comparisonSummary?.payor_name
  );
  const trusteeName = normalizeText(
    lifePolicy?.identity?.trusteeName || identity?.trustee_name || comparisonSummary?.trustee_name
  );
  const trustName = normalizeText(
    lifePolicy?.identity?.trustName || identity?.trust_name || comparisonSummary?.trust_name
  );
  const ownershipStructure = normalizeText(
    lifePolicy?.identity?.ownershipStructure ||
      identity?.ownership_structure ||
      comparisonSummary?.ownership_structure
  );
  const trustOwned = /trust|trustee|revocable|irrevocable/i.test(
    [ownerName, trusteeName, trustName, ownershipStructure].filter(Boolean).join(" ")
  );

  return {
    ownerName,
    jointInsuredName,
    insuredName,
    payorName,
    trusteeName,
    trustName,
    ownershipStructure,
    ownerVisible: Boolean(ownerName),
    jointInsuredVisible: Boolean(jointInsuredName),
    insuredVisible: Boolean(insuredName),
    payorVisible: Boolean(payorName),
    trusteeVisible: Boolean(trusteeName),
    trustNameVisible: Boolean(trustName),
    trustOwned,
  };
}

function resolveCoverageStructureSignals(policy = {}) {
  const normalizedPolicy = policy?.normalizedPolicy || {};
  const lifePolicy = policy?.lifePolicy || {};
  const deathBenefit = normalizedPolicy?.death_benefit || {};
  const riders = normalizedPolicy?.riders || {};
  const lifePolicyRiders = lifePolicy?.riders || {};

  const optionType = normalizeText(
    lifePolicy?.coverage?.optionType ||
      lifePolicy?.riders?.deathBenefitOption ||
      deathBenefit?.option_type?.display_value ||
      deathBenefit?.option_type?.value ||
      deathBenefit?.option_type
  );
  const detectedRiders = [
    ...safeArray(riders?.detected_riders),
    ...safeArray(riders?.rider_names),
    ...safeArray(lifePolicyRiders?.detectedRiders),
    ...safeArray(lifePolicyRiders?.riderNames),
    normalizeText(riders?.rider_summary),
    normalizeText(lifePolicyRiders?.riderSummary),
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const riderChargeVisible = Boolean(
    lifePolicyRiders?.riderCharge || riders?.rider_charge?.display_value || riders?.rider_charge?.value || riders?.rider_charge
  );
  const highlightedRiders = detectedRiders.filter((value) =>
    /waiver|accelerated|chronic|terminal|overloan|disability|long term care|ltc|benefit rider/i.test(value)
  );

  return {
    optionType,
    optionVisible: Boolean(optionType),
    riderVisible: detectedRiders.length > 0 || riderChargeVisible,
    riderChargeVisible,
    detectedRiders: [...new Set(detectedRiders)].slice(0, 5),
    highlightedRiders: [...new Set(highlightedRiders)].slice(0, 3),
  };
}

function resolveProtectionPurposeSignals(policy = {}, householdContext = {}) {
  const ownershipSignals = resolveOwnershipSignals(policy);
  const beneficiarySignals = resolveBeneficiarySignals(policy);
  const coverageStructure = resolveCoverageStructureSignals(policy);
  const mortgageCount = Number(householdContext.mortgageCount || 0);
  const dependentPlanCount = Number(householdContext.dependentPlanCount || 0);
  const riderText = coverageStructure.detectedRiders.join(" ").toLowerCase();

  const livingBenefitsVisible = /accelerated|chronic|terminal|critical|long term care|ltc/.test(riderText);
  const incomeProtectionVisible = /waiver|disability/.test(riderText);
  const loanProtectionPressure = mortgageCount > 0;
  const familyProtectionVisible =
    Boolean(beneficiarySignals.primaryName || beneficiarySignals.contingentName) ||
    dependentPlanCount > 0 ||
    mortgageCount > 0;

  const notes = [];
  if (familyProtectionVisible && beneficiarySignals.anyVisible) {
    notes.push("Family-protection support is more believable because beneficiary visibility is present.");
  } else if (familyProtectionVisible) {
    notes.push("Family-protection intent is plausible, but beneficiary visibility is still limited.");
  }
  if (loanProtectionPressure && !ownershipSignals.trustOwned) {
    notes.push("Mortgage-linked household pressure suggests death-benefit adequacy should be reviewed closely.");
  }
  if (livingBenefitsVisible) {
    notes.push("Living-benefit style rider support is visible in the current packet.");
  }
  if (incomeProtectionVisible) {
    notes.push("Income-protection style rider support is visible in the current packet.");
  }

  const purposeLabels = [
    familyProtectionVisible ? "family protection" : "",
    loanProtectionPressure ? "mortgage protection" : "",
    livingBenefitsVisible ? "living benefits" : "",
    incomeProtectionVisible ? "income protection" : "",
  ].filter(Boolean);

  return {
    familyProtectionVisible,
    loanProtectionPressure,
    livingBenefitsVisible,
    incomeProtectionVisible,
    purposeLabels,
    notes: [...new Set(notes)].slice(0, 4),
  };
}

export function analyzePolicyBasics(parsedData = {}) {
  const normalizedPolicy = parsedData?.normalizedPolicy || parsedData?.policyRecord || {};
  const statements = Array.isArray(parsedData?.statements) ? parsedData.statements : [];
  const normalizedAnalytics = parsedData?.normalizedAnalytics || {};
  const flags = [];

  const deathBenefit =
    currencyToNumber(normalizedPolicy?.death_benefit?.death_benefit?.value) ??
    currencyToNumber(normalizedPolicy?.death_benefit?.death_benefit?.display_value) ??
    currencyToNumber(normalizedPolicy?.death_benefit?.initial_face_amount?.value) ??
    currencyToNumber(normalizedPolicy?.death_benefit?.initial_face_amount?.display_value) ??
    currencyToNumber(parsedData?.comparisonSummary?.death_benefit);
  const cashValue =
    currencyToNumber(normalizedPolicy?.values?.cash_value?.value) ??
    currencyToNumber(normalizedPolicy?.values?.cash_value?.display_value) ??
    currencyToNumber(parsedData?.comparisonSummary?.cash_value);

  const plannedPremium =
    currencyToNumber(normalizedPolicy?.funding?.planned_premium?.value) ??
    currencyToNumber(normalizedPolicy?.funding?.planned_premium?.display_value);
  const minimumPremium =
    currencyToNumber(normalizedPolicy?.funding?.minimum_premium?.value) ??
    currencyToNumber(normalizedPolicy?.funding?.minimum_premium?.display_value);
  const guidelinePremium =
    currencyToNumber(normalizedPolicy?.funding?.guideline_premium_limit?.value) ??
    currencyToNumber(normalizedPolicy?.funding?.guideline_premium_limit?.display_value);

  const coiValues = statements
    .map((statement) =>
      currencyToNumber(statement?.fields?.cost_of_insurance?.display_value) ??
      currencyToNumber(statement?.cost_of_insurance) ??
      currencyToNumber(statement?.summary?.costOfInsurance)
    )
    .filter((value) => value !== null);

  let fundingPattern = "unknown";
  if (plannedPremium !== null && guidelinePremium !== null && plannedPremium >= guidelinePremium * 0.9) {
    fundingPattern = "overfunded";
  } else if (plannedPremium !== null && minimumPremium !== null && plannedPremium > minimumPremium * 1.1) {
    fundingPattern = "adequate";
  } else if (plannedPremium !== null && minimumPremium !== null && plannedPremium <= minimumPremium) {
    fundingPattern = "underfunded";
  }

  let coiTrend = "unknown";
  if (coiValues.length >= 2) {
    const first = coiValues[0];
    const last = coiValues[coiValues.length - 1];
    if (last > first * 1.05) {
      coiTrend = "increasing";
    } else if (Math.abs(last - first) <= Math.max(first * 0.05, 25)) {
      coiTrend = "stable";
    }
  }

  if (deathBenefit === null) flags.push("Missing death benefit visibility");
  if (cashValue === null) flags.push("Missing cash value visibility");
  if (plannedPremium === null && minimumPremium === null) flags.push("Missing funding pattern visibility");
  if (coiValues.length === 0) flags.push("Missing COI trend visibility");
  if (flags.length >= 2) flags.push("Missing key policy fields");

  const confidenceScore = confidenceFromSignals([
    deathBenefit !== null ? 1 : 0,
    cashValue !== null ? 1 : 0,
    fundingPattern !== "unknown" ? 0.75 : 0,
    coiTrend !== "unknown" ? 0.75 : 0,
    normalizedAnalytics?.policy_health_score?.score ? 0.5 : 0,
  ]);

  return {
    hasDeathBenefit: deathBenefit !== null,
    hasCashValue: cashValue !== null,
    fundingPattern,
    coiTrend,
    confidenceScore,
    flags,
  };
}

export function buildPolicyAdequacyReview(policy = {}, householdContext = {}) {
  const basics = policy?.basics || analyzePolicyBasics(policy || {});
  const normalizedPolicy = policy?.normalizedPolicy || {};
  const comparisonSummary = policy?.comparisonSummary || {};
  const ownershipSignals = resolveOwnershipSignals(policy);

  const deathBenefitValue =
    currencyToNumber(comparisonSummary?.death_benefit) ??
    currencyToNumber(normalizedPolicy?.death_benefit?.death_benefit?.display_value) ??
    currencyToNumber(normalizedPolicy?.death_benefit?.initial_face_amount?.display_value) ??
    null;
  const beneficiarySignals = resolveBeneficiarySignals(policy);
  const mortgageCount = Number(householdContext.mortgageCount || 0);
  const dependentPlanCount = Number(householdContext.dependentPlanCount || 0);
  const coverageStructure = resolveCoverageStructureSignals(policy);
  const purposeSignals = resolveProtectionPurposeSignals(policy, householdContext);

  const targetFloor =
    mortgageCount > 0 || dependentPlanCount > 0
      ? 500000
      : 250000;

  const notes = [];
  let adequacyStatus = "review";

  if (deathBenefitValue === null) {
    notes.push("Visible death benefit is still missing, so adequacy cannot be judged confidently.");
  } else if (deathBenefitValue < targetFloor) {
    notes.push(`Visible death benefit of ${currencyToDisplay(deathBenefitValue)} may be modest for the current household risk picture.`);
  } else {
    adequacyStatus = "more_supported";
    notes.push(`Visible death benefit of ${currencyToDisplay(deathBenefitValue)} is at least clearing the current starter review threshold.`);
  }

  if (basics.fundingPattern === "underfunded") {
    adequacyStatus = "review";
    notes.push("Funding appears under target, which can weaken long-term policy durability.");
  }

  if (basics.coiTrend === "increasing") {
    notes.push("COI pressure is increasing in the visible statement trail.");
  }

  if (!ownershipSignals.ownerVisible) {
    notes.push("Policy owner visibility is limited in the current extracted record.");
  }
  if (!ownershipSignals.insuredVisible) {
    notes.push("Insured-name visibility is limited in the current extracted record.");
  }
  if (ownershipSignals.jointInsuredVisible) {
    notes.push(`Joint-insured visibility is present for ${ownershipSignals.jointInsuredName}.`);
  }
  if (ownershipSignals.payorVisible) {
    notes.push(`Payor visibility is present for ${ownershipSignals.payorName}.`);
  }
  if (ownershipSignals.trustOwned && !ownershipSignals.trusteeVisible) {
    notes.push("Trust-style ownership is suggested, but trustee visibility is still limited.");
  } else if (ownershipSignals.trustOwned && ownershipSignals.trusteeVisible) {
    notes.push(`Trust-style ownership is visible with trustee support for ${ownershipSignals.trusteeName}.`);
  }
  if (ownershipSignals.trustNameVisible) {
    notes.push(`Trust-name visibility is present for ${ownershipSignals.trustName}.`);
  }
  if (coverageStructure.optionVisible) {
    notes.push(`Death benefit option is visible as ${coverageStructure.optionType}.`);
  }
  if (coverageStructure.highlightedRiders.length > 0) {
    notes.push(`Visible rider support includes ${coverageStructure.highlightedRiders.join(", ")}.`);
  } else if (coverageStructure.detectedRiders.length > 0) {
    notes.push(`Visible rider support is present across ${coverageStructure.detectedRiders.join(", ")}.`);
  } else if (coverageStructure.riderChargeVisible) {
    notes.push("Rider charges are visible, but rider detail is still limited.");
  }
  if (!beneficiarySignals.anyVisible) {
    notes.push("Beneficiary visibility is still limited in the current extracted record.");
  } else if (beneficiarySignals.primaryName) {
    notes.push(`Primary beneficiary visibility is present for ${beneficiarySignals.primaryName}.`);
  } else {
    notes.push("Beneficiary information is mentioned, but a clean beneficiary name is not yet resolved.");
  }
  if (beneficiarySignals.primaryShare || beneficiarySignals.contingentShare) {
    notes.push(
      `Beneficiary share support is visible${beneficiarySignals.primaryShare ? ` with primary share ${beneficiarySignals.primaryShare}` : ""}${beneficiarySignals.contingentShare ? `${beneficiarySignals.primaryShare ? " and" : " with"} contingent share ${beneficiarySignals.contingentShare}` : ""}.`
    );
  }
  purposeSignals.notes.forEach((note) => notes.push(note));

  if (basics.confidenceScore < 0.45) {
    adequacyStatus = "review";
  }

  const headline =
    adequacyStatus === "more_supported"
      ? "This policy currently looks more supported from a basic adequacy standpoint, but ownership and beneficiary visibility should still be confirmed."
      : "This policy needs review before it can be treated as adequately protective for the household.";

  const displayStatus =
    adequacyStatus === "more_supported"
      ? "More Supported"
      : "Needs Review";

  return {
    adequacyStatus,
    displayStatus,
    ownerVisible: ownershipSignals.ownerVisible,
    jointInsuredVisible: ownershipSignals.jointInsuredVisible,
    insuredVisible: ownershipSignals.insuredVisible,
    payorVisible: ownershipSignals.payorVisible,
    trusteeVisible: ownershipSignals.trusteeVisible,
    trustNameVisible: ownershipSignals.trustNameVisible,
    trustOwned: ownershipSignals.trustOwned,
    ownerName: ownershipSignals.ownerName,
    jointInsuredName: ownershipSignals.jointInsuredName,
    insuredName: ownershipSignals.insuredName,
    payorName: ownershipSignals.payorName,
    trusteeName: ownershipSignals.trusteeName,
    trustName: ownershipSignals.trustName,
    ownershipStructure: ownershipSignals.ownershipStructure,
    benefitOption: coverageStructure.optionType,
    benefitOptionVisible: coverageStructure.optionVisible,
    riderVisible: coverageStructure.riderVisible,
    riderChargeVisible: coverageStructure.riderChargeVisible,
    detectedRiders: coverageStructure.detectedRiders,
    highlightedRiders: coverageStructure.highlightedRiders,
    protectionPurposeLabels: purposeSignals.purposeLabels,
    familyProtectionVisible: purposeSignals.familyProtectionVisible,
    loanProtectionPressure: purposeSignals.loanProtectionPressure,
    livingBenefitsVisible: purposeSignals.livingBenefitsVisible,
    incomeProtectionVisible: purposeSignals.incomeProtectionVisible,
    beneficiaryVisibility: beneficiarySignals.visibility,
    primaryBeneficiaryName: beneficiarySignals.primaryName,
    primaryBeneficiaryShare: beneficiarySignals.primaryShare,
    contingentBeneficiaryName: beneficiarySignals.contingentName,
    contingentBeneficiaryShare: beneficiarySignals.contingentShare,
    beneficiaryStatusLabel: beneficiarySignals.statusLabel,
    targetFloor,
    notes: [...new Set(notes)].slice(0, 6),
    headline,
  };
}

export function detectInsuranceGaps(policy, householdContext = {}) {
  const notes = [];
  const basics = policy?.basics || analyzePolicyBasics(policy || {});
  const totalPolicies = Number(householdContext.totalPolicies || 0);
  const ownershipSignals = resolveOwnershipSignals(policy);
  const coverageStructure = resolveCoverageStructureSignals(policy);
  let coverageGap = false;

  if (totalPolicies === 0 && !policy) {
    return {
      coverageGap: true,
      confidence: 0.2,
      notes: ["No policies are visible yet for this household."],
    };
  }

  const deathBenefitValue =
    currencyToNumber(policy?.comparisonSummary?.death_benefit) ??
    currencyToNumber(policy?.normalizedPolicy?.death_benefit?.death_benefit?.display_value) ??
    null;

  if (!basics.hasDeathBenefit) {
    coverageGap = true;
    notes.push("Death benefit visibility is limited.");
  } else if (deathBenefitValue !== null && deathBenefitValue < 250000) {
    coverageGap = true;
    notes.push("Visible death benefit may be modest relative to household protection needs.");
  }

  if (basics.fundingPattern === "underfunded") {
    coverageGap = true;
    notes.push("Funding pattern appears underfunded from the visible policy values.");
  }

  if (basics.coiTrend === "increasing") {
    notes.push("COI trend appears to be increasing across visible statement support.");
  }

  if (basics.confidenceScore < 0.45) {
    notes.push("Confidence is low because key policy fields are still missing.");
  }

  const beneficiarySignals = resolveBeneficiarySignals(policy);
  if (!beneficiarySignals.anyVisible) {
    notes.push("Beneficiary visibility is limited, so protection review is still incomplete.");
  }
  if (ownershipSignals.trustOwned && !ownershipSignals.trusteeVisible) {
    notes.push("Trust ownership may be present, but trustee visibility is limited.");
  }
  if (coverageStructure.riderChargeVisible && !coverageStructure.riderVisible) {
    notes.push("Rider charges may be present, but rider detail is still limited.");
  }

  return {
    coverageGap,
    confidence: basics.confidenceScore,
    notes,
  };
}

export function summarizeInsuranceHousehold(policies = [], householdContext = {}) {
  const safePolicies = safeArray(policies);
  if (safePolicies.length === 0) {
    return {
      totalPolicies: 0,
      totalCoverage: 0,
      gapDetected: true,
      confidence: 0.15,
      status: "Needs Review",
      headline: "No saved policies are visible yet, so household protection coverage cannot be confirmed.",
      notes: ["Upload at least one life policy or annual statement to begin building a household protection read."],
      metrics: {
        gapPolicies: 0,
        lowConfidencePolicies: 0,
        confidentPolicies: 0,
        missingDeathBenefitPolicies: 0,
        ownerVisiblePolicies: 0,
        jointInsuredVisiblePolicies: 0,
        insuredVisiblePolicies: 0,
        payorVisiblePolicies: 0,
        trusteeVisiblePolicies: 0,
        trustNameVisiblePolicies: 0,
        trustOwnedPolicies: 0,
        benefitOptionVisiblePolicies: 0,
        riderVisiblePolicies: 0,
        livingBenefitVisiblePolicies: 0,
        incomeProtectionVisiblePolicies: 0,
        beneficiaryNamedPolicies: 0,
        beneficiaryLimitedPolicies: 0,
        beneficiaryShareVisiblePolicies: 0,
      },
    };
  }

  const reads = safePolicies.map((policy) => {
    const basics = analyzePolicyBasics({ comparisonSummary: policy });
    const adequacy = buildPolicyAdequacyReview(
      {
        comparisonSummary: policy,
        normalizedPolicy: {
          policy_identity: {
            owner_name: policy?.owner_name || "",
            insured_name: policy?.insured_name || "",
            trustee_name: policy?.trustee_name || "",
            ownership_structure: policy?.ownership_structure || "",
            primary_beneficiary_name: policy?.primary_beneficiary_name || "",
            contingent_beneficiary_name: policy?.contingent_beneficiary_name || "",
            beneficiary_status: policy?.beneficiary_status || "",
          },
        },
      },
      householdContext
    );
    const gap = detectInsuranceGaps(
      {
        comparisonSummary: policy,
        basics,
        normalizedPolicy: {
          policy_identity: {
            owner_name: policy?.owner_name || "",
            insured_name: policy?.insured_name || "",
            trustee_name: policy?.trustee_name || "",
            ownership_structure: policy?.ownership_structure || "",
            primary_beneficiary_name: policy?.primary_beneficiary_name || "",
            contingent_beneficiary_name: policy?.contingent_beneficiary_name || "",
            beneficiary_status: policy?.beneficiary_status || "",
          },
        },
      },
      { ...householdContext, totalPolicies: safePolicies.length }
    );
    return { policy, basics, adequacy, gap };
  });

  const totalCoverage = safePolicies.reduce((sum, policy) => {
    const value = currencyToNumber(policy?.death_benefit);
    return sum + (value || 0);
  }, 0);
  const gapPolicies = reads.filter((item) => item.gap.coverageGap);
  const lowConfidencePolicies = reads.filter((item) => (item.gap.confidence || 0) < 0.5);
  const confidentPolicies = reads.filter((item) => (item.gap.confidence || 0) >= 0.75);
  const missingDeathBenefitPolicies = reads.filter((item) => !item.basics.hasDeathBenefit);
  const increasingCoiPolicies = reads.filter((item) => item.basics.coiTrend === "increasing");
  const ownerVisiblePolicies = reads.filter((item) => item.adequacy.ownerVisible);
  const jointInsuredVisiblePolicies = reads.filter((item) => item.adequacy.jointInsuredVisible);
  const insuredVisiblePolicies = reads.filter((item) => item.adequacy.insuredVisible);
  const payorVisiblePolicies = reads.filter((item) => item.adequacy.payorVisible);
  const trusteeVisiblePolicies = reads.filter((item) => item.adequacy.trusteeVisible);
  const trustNameVisiblePolicies = reads.filter((item) => item.adequacy.trustNameVisible);
  const trustOwnedPolicies = reads.filter((item) => item.adequacy.trustOwned);
  const benefitOptionVisiblePolicies = reads.filter((item) => item.adequacy.benefitOptionVisible);
  const riderVisiblePolicies = reads.filter((item) => item.adequacy.riderVisible);
  const livingBenefitVisiblePolicies = reads.filter((item) => item.adequacy.livingBenefitsVisible);
  const incomeProtectionVisiblePolicies = reads.filter((item) => item.adequacy.incomeProtectionVisible);
  const beneficiaryNamedPolicies = reads.filter(
    (item) => item.adequacy.beneficiaryVisibility === "named"
  );
  const beneficiaryLimitedPolicies = reads.filter(
    (item) => item.adequacy.beneficiaryVisibility !== "named" && item.adequacy.beneficiaryVisibility !== "mentioned"
  );
  const beneficiaryShareVisiblePolicies = reads.filter(
    (item) => item.adequacy.primaryBeneficiaryShare || item.adequacy.contingentBeneficiaryShare
  );
  const averageConfidence =
    reads.reduce((sum, item) => sum + Number(item.gap.confidence || 0), 0) / Math.max(reads.length, 1);

  const status =
    gapPolicies.length > 0 ||
    lowConfidencePolicies.length > Math.ceil(safePolicies.length / 2) ||
    beneficiaryLimitedPolicies.length > Math.ceil(safePolicies.length / 2)
      ? "Needs Review"
      : averageConfidence >= 0.75
        ? "Better Supported"
        : "Monitor";

  const notes = [];
  if (gapPolicies.length > 0) {
    notes.push(`${pluralize(gapPolicies.length, "policy")} currently show visible protection gap pressure.`);
  }
  if (missingDeathBenefitPolicies.length > 0) {
    notes.push(`${pluralize(missingDeathBenefitPolicies.length, "policy")} still do not show a clean visible death benefit.`);
  }
  if (lowConfidencePolicies.length > 0) {
    notes.push(`${pluralize(lowConfidencePolicies.length, "policy")} still read with low confidence and should be refreshed with stronger document support.`);
  }
  if (ownerVisiblePolicies.length < safePolicies.length) {
    notes.push(`${pluralize(safePolicies.length - ownerVisiblePolicies.length, "policy")} still have limited owner visibility.`);
  }
  if (insuredVisiblePolicies.length < safePolicies.length) {
    notes.push(`${pluralize(safePolicies.length - insuredVisiblePolicies.length, "policy")} still have limited insured-name visibility.`);
  }
  if (jointInsuredVisiblePolicies.length > 0) {
    notes.push(`${pluralize(jointInsuredVisiblePolicies.length, "policy")} now show visible joint-insured support.`);
  }
  if (payorVisiblePolicies.length > 0) {
    notes.push(`${pluralize(payorVisiblePolicies.length, "policy")} now show visible payor support in the extracted packet.`);
  }
  if (trustOwnedPolicies.length > 0) {
    notes.push(`${pluralize(trustOwnedPolicies.length, "policy")} appear to use trust-style ownership in the visible packet.`);
  }
  if (trustNameVisiblePolicies.length > 0) {
    notes.push(`${pluralize(trustNameVisiblePolicies.length, "policy")} now show visible trust-name support.`);
  }
  if (trustOwnedPolicies.length > trusteeVisiblePolicies.length) {
    notes.push(`${pluralize(trustOwnedPolicies.length - trusteeVisiblePolicies.length, "policy")} suggest trust ownership but still have limited trustee visibility.`);
  }
  if (benefitOptionVisiblePolicies.length > 0) {
    notes.push(`${pluralize(benefitOptionVisiblePolicies.length, "policy")} now show a visible death benefit option in the extracted packet.`);
  }
  if (riderVisiblePolicies.length > 0) {
    notes.push(`${pluralize(riderVisiblePolicies.length, "policy")} show visible rider support or rider-charge evidence.`);
  }
  if (livingBenefitVisiblePolicies.length > 0) {
    notes.push(`${pluralize(livingBenefitVisiblePolicies.length, "policy")} show visible living-benefit style rider support.`);
  }
  if (incomeProtectionVisiblePolicies.length > 0) {
    notes.push(`${pluralize(incomeProtectionVisiblePolicies.length, "policy")} show visible income-protection or waiver-style rider support.`);
  }
  if (beneficiaryNamedPolicies.length > 0) {
    notes.push(`${pluralize(beneficiaryNamedPolicies.length, "policy")} now show named beneficiary visibility in the saved packet.`);
  }
  if (beneficiaryLimitedPolicies.length > 0) {
    notes.push(`${pluralize(beneficiaryLimitedPolicies.length, "policy")} still have limited beneficiary visibility and should be reviewed with fuller identity pages.`);
  }
  if (beneficiaryShareVisiblePolicies.length > 0) {
    notes.push(`${pluralize(beneficiaryShareVisiblePolicies.length, "policy")} now show beneficiary share support in the visible packet.`);
  }
  if (increasingCoiPolicies.length > 0) {
    notes.push(`${pluralize(increasingCoiPolicies.length, "policy")} show increasing COI pressure in the visible statements.`);
  }
  if (totalCoverage > 0) {
    notes.push(`Visible household death benefit currently totals about ${currencyToDisplay(totalCoverage)}.`);
  }

  const headline =
    gapPolicies.length > 0
      ? `The household insurance read shows protection gaps across ${pluralize(gapPolicies.length, "policy")}, so coverage should be reviewed before it is treated as complete.`
      : averageConfidence >= 0.75
        ? "The current household insurance read looks relatively well supported, with no obvious protection gap visible from saved policy evidence."
        : "The household insurance read is usable, but confidence is still limited by missing fields, document quality, or incomplete coverage visibility.";

  return {
    totalPolicies: safePolicies.length,
    totalCoverage,
    gapDetected: gapPolicies.length > 0,
    confidence: averageConfidence,
    status,
    headline,
    notes: notes.slice(0, 5),
    metrics: {
      gapPolicies: gapPolicies.length,
      lowConfidencePolicies: lowConfidencePolicies.length,
      confidentPolicies: confidentPolicies.length,
        missingDeathBenefitPolicies: missingDeathBenefitPolicies.length,
        ownerVisiblePolicies: ownerVisiblePolicies.length,
        jointInsuredVisiblePolicies: jointInsuredVisiblePolicies.length,
        insuredVisiblePolicies: insuredVisiblePolicies.length,
        payorVisiblePolicies: payorVisiblePolicies.length,
        trusteeVisiblePolicies: trusteeVisiblePolicies.length,
        trustNameVisiblePolicies: trustNameVisiblePolicies.length,
        trustOwnedPolicies: trustOwnedPolicies.length,
        benefitOptionVisiblePolicies: benefitOptionVisiblePolicies.length,
        riderVisiblePolicies: riderVisiblePolicies.length,
      livingBenefitVisiblePolicies: livingBenefitVisiblePolicies.length,
        incomeProtectionVisiblePolicies: incomeProtectionVisiblePolicies.length,
        beneficiaryNamedPolicies: beneficiaryNamedPolicies.length,
        beneficiaryLimitedPolicies: beneficiaryLimitedPolicies.length,
        beneficiaryShareVisiblePolicies: beneficiaryShareVisiblePolicies.length,
      },
    };
  }

export function buildProtectionComparisonNarrative(basePolicy = {}, comparePolicy = {}) {
  if (!basePolicy || !comparePolicy) {
    return {
      headline: "Protection comparison is not available yet.",
      bullets: [],
    };
  }

  const baseBasics = basePolicy?.basicAnalysis || analyzePolicyBasics({ comparisonSummary: basePolicy });
  const compareBasics = comparePolicy?.basicAnalysis || analyzePolicyBasics({ comparisonSummary: comparePolicy });
  const baseGap = basePolicy?.gapAnalysis || detectInsuranceGaps({ comparisonSummary: basePolicy, basics: baseBasics }, { totalPolicies: 2 });
  const compareGap = comparePolicy?.gapAnalysis || detectInsuranceGaps({ comparisonSummary: comparePolicy, basics: compareBasics }, { totalPolicies: 2 });

  const bullets = [];
  if (!compareGap.coverageGap && baseGap.coverageGap) {
    bullets.push(`${comparePolicy.product || "The comparison policy"} currently shows a cleaner protection read than ${basePolicy.product || "the current policy"}.`);
  }
  if (compareGap.coverageGap && !baseGap.coverageGap) {
    bullets.push(`${comparePolicy.product || "The comparison policy"} is stronger on continuity, but it still shows visible protection gap pressure.`);
  }
  if ((compareGap.confidence || 0) > (baseGap.confidence || 0)) {
    bullets.push(`${comparePolicy.product || "The comparison policy"} carries stronger protection confidence from the visible evidence.`);
  } else if ((compareGap.confidence || 0) < (baseGap.confidence || 0)) {
    bullets.push(`${basePolicy.product || "The current policy"} carries stronger protection confidence from the visible evidence.`);
  }
  if (baseBasics.fundingPattern === "underfunded" && compareBasics.fundingPattern !== "underfunded") {
    bullets.push("The current policy shows weaker funding support than the comparison file.");
  }
  if (compareBasics.coiTrend === "increasing" && baseBasics.coiTrend !== "increasing") {
    bullets.push("The comparison policy shows more visible COI pressure in the statement trail.");
  }

  const headline =
    !compareGap.coverageGap && baseGap.coverageGap
      ? `${comparePolicy.product || "The comparison policy"} currently looks stronger from a protection perspective, not just a continuity perspective.`
      : compareGap.coverageGap && !baseGap.coverageGap
        ? `${basePolicy.product || "The current policy"} currently looks cleaner on protection support, even if the comparison file is stronger elsewhere.`
        : "Both policies are usable for review, but protection confidence still depends on document support, visible death benefit data, and funding visibility.";

  return {
    headline,
    bullets: bullets.slice(0, 5),
  };
}
