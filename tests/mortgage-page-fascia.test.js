import assert from "node:assert/strict";

import buildMortgagePageFascia from "../src/lib/intelligence/fascia/buildMortgagePageFascia.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makeLoan(overrides = {}) {
  return {
    id: overrides.id || "mortgage-1",
    loan_name: overrides.loan_name || "Harbor View Mortgage",
    current_status: overrides.current_status || "active",
    property_address: overrides.property_address || "101 Harbor View",
    ...overrides,
  };
}

function makeReview(overrides = {}) {
  return {
    readinessStatus: "Better Supported",
    confidence: 0.84,
    headline: "This mortgage record has enough core structure to support a more reliable debt review.",
    flags: [],
    metrics: {
      documentSupport: "strong",
      refinanceStatus: "monitor",
      payoffStatus: "ready",
      propertyLinkCount: 1,
      snapshotCount: 1,
      ...((overrides.metrics) || {}),
    },
    ...overrides,
  };
}

function makeCommandCenter(overrides = {}) {
  return {
    headline: "This mortgage currently looks operationally steady.",
    blockers: [],
    metrics: {
      critical: 0,
      warning: 0,
      documents: 1,
      snapshots: 1,
      analytics: 0,
      ...((overrides.metrics) || {}),
    },
    ...overrides,
  };
}

runTest("mortgage fascia becomes strong when statement support and collateral linkage are solid", () => {
  const fascia = buildMortgagePageFascia({
    mortgageLoan: makeLoan(),
    mortgageReview: makeReview(),
    mortgageCommandCenter: makeCommandCenter(),
    mortgageDocuments: [{ id: "doc-1" }],
    mortgageSnapshots: [{ id: "snapshot-1" }],
    mortgageAnalytics: [],
    propertyLinks: [{ id: "link-1", is_primary: true }],
    bundleWarnings: [],
  });

  assert.equal(fascia.status, "Strong");
  assert.equal(fascia.sourceLabel, "Current mortgage data");
  assert.equal(fascia.primaryAction.label, "Review loan summary");
  assert.equal(fascia.tertiaryAction.label, "Why this status?");
  assert.equal(fascia.recommendedAction.label, "Review loan summary");
  assert.match(fascia.explanation.summary, /mortgage record, documents, and property link we have loaded/i);
  assert.match(fascia.explanation.whyStatusAssigned, /statement support is present/i);
});

runTest("mortgage fascia stays incomplete when statement and collateral support are thin", () => {
  const fascia = buildMortgagePageFascia({
    mortgageLoan: makeLoan(),
    mortgageReview: makeReview({
      readinessStatus: "Needs Review",
      confidence: 0.34,
      flags: ["statement_missing", "property_link_missing"],
      metrics: {
        documentSupport: "limited",
        propertyLinkCount: 0,
        snapshotCount: 0,
      },
    }),
    mortgageCommandCenter: makeCommandCenter({
      headline: "Critical mortgage command items are visible.",
      blockers: [
        { id: "mortgage-no-documents" },
        { id: "mortgage-no-property-link" },
      ],
      metrics: {
        critical: 2,
        warning: 0,
        documents: 0,
        snapshots: 0,
        analytics: 0,
      },
    }),
    mortgageDocuments: [],
    mortgageSnapshots: [],
    mortgageAnalytics: [],
    propertyLinks: [],
    bundleWarnings: [],
  });

  assert.equal(fascia.status, "Incomplete");
  assert.equal(fascia.primaryAction.label, "Upload mortgage documents");
  assert.match(fascia.meaning, /partly readable, but key mortgage details are still missing/i);
  assert.match(fascia.explanation.summary, /mortgage record, documents, and property link we have loaded/i);
  assert.match(fascia.explanation.whyStatusAssigned, /missing statement support, missing collateral linkage, or very low confidence/i);
  assert.match(fascia.explanation.limitations.join(" "), /No attached mortgage documents are currently confirming the latest statement view/i);
});

runTest("mortgage fascia stays partial for an early bundle with very little connected evidence", () => {
  const fascia = buildMortgagePageFascia({
    mortgageLoan: makeLoan(),
    mortgageReview: makeReview({
      readinessStatus: "Monitor",
      confidence: 0.39,
      metrics: {
        documentSupport: "limited",
        propertyLinkCount: 0,
        snapshotCount: 0,
      },
    }),
    mortgageCommandCenter: makeCommandCenter({
      metrics: {
        critical: 0,
        warning: 0,
        documents: 0,
        snapshots: 0,
        analytics: 0,
      },
    }),
    mortgageDocuments: [],
    mortgageSnapshots: [],
    mortgageAnalytics: [],
    propertyLinks: [],
    bundleWarnings: [],
  });

  assert.equal(fascia.status, "Partial");
  assert.match(fascia.completenessNote, /limited statement and property-link support/i);
  assert.equal(fascia.recommendedAction.label, "Upload mortgage documents");
  assert.match(fascia.explanation.limitations.join(" "), /No attached mortgage documents are currently confirming the latest statement view/i);
});

runTest("mortgage fascia reports at risk when delinquency or critical operational pressure is visible", () => {
  const fascia = buildMortgagePageFascia({
    mortgageLoan: makeLoan({ current_status: "delinquent" }),
    mortgageReview: makeReview({
      readinessStatus: "Needs Review",
      confidence: 0.58,
    }),
    mortgageCommandCenter: makeCommandCenter({
      headline: "Critical mortgage command items are visible.",
      blockers: [{ id: "mortgage-stale-statement" }],
      metrics: {
        critical: 1,
        warning: 1,
        documents: 1,
        snapshots: 1,
        analytics: 0,
      },
    }),
    mortgageDocuments: [{ id: "doc-1" }],
    mortgageSnapshots: [{ id: "snapshot-1" }],
    mortgageAnalytics: [],
    propertyLinks: [{ id: "link-1", is_primary: true }],
    bundleWarnings: [],
  });

  assert.equal(fascia.status, "At Risk");
  assert.equal(fascia.primaryAction.label, "Review mortgage command");
  assert.match(fascia.meaning, /shows a problem that needs attention/i);
  assert.equal(fascia.recommendedAction.label, "Review mortgage command");
  assert.match(fascia.explanation.whyStatusAssigned, /active debt pressure or a critical evidence-timing problem/i);
  assert.match(fascia.explanation.limitations.join(" "), /currently marked delinquent/i);
});
