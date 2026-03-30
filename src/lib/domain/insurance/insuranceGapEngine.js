function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function buildSignal(status, message, severity, extra = {}) {
  return {
    status,
    message,
    severity,
    ...extra,
  };
}

function hasUmbrellaReference(homeownersPolicies = [], autoPolicies = []) {
  const homeownersMatch = normalizeArray(homeownersPolicies).some((policy) =>
    normalizeText(policy?.homeowners_policy_type_key).includes("umbrella")
  );
  const autoMatch = normalizeArray(autoPolicies).some((policy) =>
    normalizeText(policy?.auto_policy_type_key).includes("umbrella")
  );
  return homeownersMatch || autoMatch;
}

function hasMortgage(bundle) {
  return normalizeArray(bundle?.linkedMortgages).length > 0;
}

function hasLinkedHomeowners(bundle) {
  return normalizeArray(bundle?.linkedHomeownersPolicies).length > 0;
}

export function evaluateInsuranceGaps({
  propertyBundles = [],
  lifePolicies = [],
  homeownersPolicies = [],
  autoPolicies = [],
  collegePlans = [],
} = {}) {
  const safePropertyBundles = normalizeArray(propertyBundles);
  const safeLifePolicies = normalizeArray(lifePolicies);
  const safeHomeownersPolicies = normalizeArray(homeownersPolicies);
  const safeAutoPolicies = normalizeArray(autoPolicies);
  const safeCollegePlans = normalizeArray(collegePlans);

  const dependentProxy = safeCollegePlans.length > 0;
  const propertyCount = safePropertyBundles.length;
  const mortgagedPropertyCount = safePropertyBundles.filter((bundle) => hasMortgage(bundle)).length;
  const propertiesMissingLinkedHomeowners = safePropertyBundles.filter((bundle) => !hasLinkedHomeowners(bundle));
  const umbrellaDetected = hasUmbrellaReference(safeHomeownersPolicies, safeAutoPolicies);
  const propertyRiskPresent = propertyCount > 0;
  const broaderLiabilityExposure = propertyRiskPresent && (safeAutoPolicies.length > 0 || mortgagedPropertyCount > 0);

  const life = safeLifePolicies.length > 0
    ? buildSignal(
        "covered",
        `${safeLifePolicies.length} life ${safeLifePolicies.length === 1 ? "policy is" : "policies are"} visible in the household record.`,
        "low",
        { detectedCount: safeLifePolicies.length }
      )
    : buildSignal(
        "missing",
        dependentProxy
          ? "No life insurance detected. This may leave dependents financially exposed."
          : "No life insurance detected in the household record. Protection needs may still deserve review.",
        dependentProxy || mortgagedPropertyCount > 0 ? "high" : "medium",
        { detectedCount: 0 }
      );

  let homeowners;
  if (propertyCount === 0) {
    homeowners = buildSignal(
      "unknown",
      "No household property records are currently linked, so homeowners coverage could not be evaluated yet.",
      "low",
      { coveredPropertyCount: 0, propertyCount: 0, missingPropertyCount: 0 }
    );
  } else if (propertiesMissingLinkedHomeowners.length === 0) {
    homeowners = buildSignal(
      "covered",
      propertyCount === 1
        ? "The linked property currently shows homeowners coverage in the household record."
        : `All ${propertyCount} tracked properties currently show linked homeowners coverage.`,
      "low",
      { coveredPropertyCount: propertyCount, propertyCount, missingPropertyCount: 0 }
    );
  } else if (propertiesMissingLinkedHomeowners.length < propertyCount || safeHomeownersPolicies.length > 0) {
    homeowners = buildSignal(
      "partial",
      `${propertiesMissingLinkedHomeowners.length} ${propertiesMissingLinkedHomeowners.length === 1 ? "property does" : "properties do"} not yet show linked homeowners coverage.`,
      mortgagedPropertyCount > 0 ? "high" : "medium",
      {
        coveredPropertyCount: propertyCount - propertiesMissingLinkedHomeowners.length,
        propertyCount,
        missingPropertyCount: propertiesMissingLinkedHomeowners.length,
      }
    );
  } else {
    homeowners = buildSignal(
      "missing",
      mortgagedPropertyCount > 0
        ? "Property records are present, but no homeowners coverage is linked. Mortgaged homes usually require this protection."
        : "Property records are present, but no homeowners coverage is linked yet.",
      mortgagedPropertyCount > 0 ? "high" : "medium",
      { coveredPropertyCount: 0, propertyCount, missingPropertyCount: propertyCount }
    );
  }

  const auto = safeAutoPolicies.length > 0
    ? buildSignal(
        "covered",
        `${safeAutoPolicies.length} auto ${safeAutoPolicies.length === 1 ? "policy is" : "policies are"} visible in the household record.`,
        "low",
        { detectedCount: safeAutoPolicies.length }
      )
    : buildSignal(
        "unknown",
        "No auto coverage is visible yet. This may be fine if household vehicles are not being tracked here yet.",
        "low",
        { detectedCount: 0 }
      );

  let umbrella;
  if (umbrellaDetected) {
    umbrella = buildSignal(
      "covered",
      "Umbrella or excess-liability coverage is referenced in the household record.",
      "low",
      { detectedCount: 1 }
    );
  } else if (broaderLiabilityExposure) {
    umbrella = buildSignal(
      "gap",
      "No umbrella liability coverage detected. Higher-liability events could exceed standard policy limits.",
      propertyCount > 1 || mortgagedPropertyCount > 0 ? "medium" : "low",
      { detectedCount: 0 }
    );
  } else {
    umbrella = buildSignal(
      "unknown",
      "Umbrella coverage was not detected, but the current household data does not show enough exposure detail to rate this strongly yet.",
      "low",
      { detectedCount: 0 }
    );
  }

  const gaps = { life, homeowners, auto, umbrella };

  return {
    ...gaps,
    note: "This is a high-level coverage check based on available data. It may not reflect all policies.",
    summary: {
      propertyCount,
      mortgagedPropertyCount,
      policyCounts: {
        life: safeLifePolicies.length,
        homeowners: safeHomeownersPolicies.length,
        auto: safeAutoPolicies.length,
      },
      dependentProxy,
      protectionFlags: Object.entries(gaps)
        .filter(([, gap]) => gap.status !== "covered")
        .map(([key]) => key),
    },
  };
}

