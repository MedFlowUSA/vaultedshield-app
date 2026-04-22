import assert from "node:assert/strict";

import buildPropertyPageFascia from "../src/lib/intelligence/fascia/buildPropertyPageFascia.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makeProperty(overrides = {}) {
  return {
    id: overrides.id || "property-1",
    property_name: overrides.property_name || "Harbor View Home",
    property_address: overrides.property_address || "101 Harbor View",
    ...overrides,
  };
}

function makeSignals(overrides = {}) {
  return {
    signalLevel: "healthy",
    confidence: 0.82,
    reasons: ["Value support, linkage visibility, and protection context are all currently reading as relatively stable."],
    flags: {
      valuationMissing: false,
      weakValuation: false,
      linkageGap: false,
      stackCompletenessGap: false,
      stackCompletenessCritical: false,
      debtVisibilityGap: false,
      protectionGap: false,
      incompleteFacts: false,
      marketSupportGap: false,
      compQualityRisk: false,
      equityPressure: false,
      ...(overrides.flags || {}),
    },
    metadata: {
      stackCompletenessScore: 0.86,
      stackCompletenessLabel: "Strong",
      ...(overrides.metadata || {}),
    },
    ...overrides,
  };
}

function makeAction(overrides = {}) {
  return {
    id: "property-review-valuation",
    actionLabel: "Open valuation review",
    target: { type: "scroll_section", section: "valuation" },
    summary: "Review valuation support.",
    ...overrides,
  };
}

runTest("property fascia becomes strong when value debt and protection read cleanly", () => {
  const fascia = buildPropertyPageFascia({
    property: makeProperty(),
    propertySignals: makeSignals(),
    propertyActionFeed: [
      makeAction(),
      makeAction({
        id: "property-review-equity",
        actionLabel: "Open equity review",
        target: { type: "scroll_section", section: "equity" },
      }),
    ],
    linkedMortgages: [{ id: "mortgage-1" }],
    linkedHomeownersPolicies: [{ id: "homeowners-1" }],
    latestValuation: { id: "valuation-1" },
    propertyStackAnalytics: { id: "stack-1" },
  });

  assert.equal(fascia.status, "Strong");
  assert.equal(fascia.sourceLabel, "Current property data");
  assert.equal(fascia.primaryAction.label, "Open valuation review");
  assert.equal(fascia.tertiaryAction.label, "Why this status?");
  assert.equal(fascia.recommendedAction.label, "Open valuation review");
  assert.match(fascia.explanation.summary, /current property data together with saved valuation/i);
  assert.match(fascia.explanation.whyStatusAssigned, /valuation support is present/i);
});

runTest("property fascia stays incomplete when valuation and facts are thin", () => {
  const fascia = buildPropertyPageFascia({
    property: makeProperty(),
    propertySignals: makeSignals({
      signalLevel: "monitor",
      confidence: 0.43,
      reasons: ["No saved virtual valuation is available yet, so the property still lacks a current value range."],
      flags: {
        valuationMissing: true,
        incompleteFacts: true,
        stackCompletenessCritical: true,
      },
      metadata: {
        stackCompletenessScore: 0.31,
        stackCompletenessLabel: "Limited",
      },
    }),
    propertyActionFeed: [makeAction({ actionLabel: "Review property facts", target: { type: "scroll_section", section: "facts" } })],
    linkedMortgages: [],
    linkedHomeownersPolicies: [],
    latestValuation: null,
    propertyStackAnalytics: null,
  });

  assert.equal(fascia.status, "Incomplete");
  assert.match(fascia.meaning, /partly readable, but key property details are still missing/i);
  assert.equal(fascia.recommendedAction.label, "Review property facts");
  assert.match(fascia.explanation.summary, /property data we could load/i);
  assert.match(fascia.explanation.whyStatusAssigned, /missing valuation support, incomplete facts/i);
  assert.match(fascia.explanation.limitations.join(" "), /No current saved virtual valuation is available/i);
});

runTest("property fascia stays partial when the page has only very early bundle evidence", () => {
  const fascia = buildPropertyPageFascia({
    property: makeProperty(),
    propertySignals: makeSignals({
      signalLevel: "monitor",
      confidence: 0.34,
      reasons: ["No saved virtual valuation is available yet, so the property still lacks a current value range."],
      flags: {
        valuationMissing: true,
        linkageGap: true,
      },
      metadata: {
        stackCompletenessScore: null,
        stackCompletenessLabel: null,
      },
    }),
    propertyActionFeed: [makeAction({ actionLabel: "Review property facts", target: { type: "scroll_section", section: "facts" } })],
    linkedMortgages: [],
    linkedHomeownersPolicies: [],
    latestValuation: null,
    propertyStackAnalytics: null,
  });

  assert.equal(fascia.status, "Partial");
  assert.match(fascia.completenessNote, /financing or insurance links are still incomplete/i);
  assert.equal(fascia.recommendedAction.label, "Review property facts");
  assert.match(fascia.explanation.limitations.join(" "), /Persisted property stack analytics are not stored yet/i);
});

runTest("property fascia reports at risk when the live property signal is at risk", () => {
  const fascia = buildPropertyPageFascia({
    property: makeProperty(),
    propertySignals: makeSignals({
      signalLevel: "at_risk",
      confidence: 0.57,
      reasons: ["Estimated loan-to-value appears elevated from the visible debt and valuation inputs."],
      flags: {
        equityPressure: true,
      },
    }),
    propertyActionFeed: [makeAction({ actionLabel: "Open equity review", target: { type: "scroll_section", section: "equity" } })],
    linkedMortgages: [{ id: "mortgage-1" }],
    linkedHomeownersPolicies: [{ id: "homeowners-1" }],
    latestValuation: { id: "valuation-1" },
    propertyStackAnalytics: { id: "stack-1" },
  });

  assert.equal(fascia.status, "At Risk");
  assert.match(fascia.meaning, /shows a problem that needs attention/i);
  assert.equal(fascia.recommendedAction.label, "Open equity review");
  assert.match(fascia.explanation.whyStatusAssigned, /shows visible pressure in valuation or equity support/i);
});
