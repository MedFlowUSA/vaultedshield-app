import assert from "node:assert/strict";

import buildRetirementPageFascia from "../src/lib/intelligence/fascia/buildRetirementPageFascia.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makeAccount(overrides = {}) {
  return {
    id: overrides.id || "retirement-1",
    plan_name: overrides.plan_name || "401(k) Core Plan",
    ...overrides,
  };
}

function makeRead(overrides = {}) {
  return {
    readinessStatus: "Better Supported",
    confidence: 0.82,
    headline: "This retirement read has enough visible balance, type, and statement support to be treated as more dependable.",
    metrics: {
      currentBalanceVisible: true,
      contributionsVisible: true,
      completenessStatus: "strong",
      ...((overrides.metrics) || {}),
    },
    ...overrides,
  };
}

function makeSignals(overrides = {}) {
  return {
    signalLevel: "healthy",
    confidence: 0.84,
    reasons: ["Balance, statement, and allocation support currently look relatively stable."],
    flags: {
      balanceVisibility: false,
      contributionVisibility: false,
      staleStatement: false,
      beneficiaryRisk: false,
      loanRisk: false,
      concentrationRisk: false,
      incompleteData: false,
      positionVisibility: false,
      ...((overrides.flags) || {}),
    },
    metadata: {
      statementAgeMonths: 4,
      positionsCount: 4,
      ...((overrides.metadata) || {}),
    },
    ...overrides,
  };
}

function makeAction(overrides = {}) {
  return {
    id: "retirement-monitor",
    actionLabel: "Open read summary",
    target: { type: "scroll_section", section: "signals" },
    summary: "Monitor current retirement read.",
    ...overrides,
  };
}

runTest("retirement fascia becomes strong when visible account support is complete", () => {
  const fascia = buildRetirementPageFascia({
    retirementAccount: makeAccount(),
    retirementRead: makeRead(),
    retirementSignals: makeSignals(),
    retirementActionFeed: [
      makeAction(),
      makeAction({
        id: "retirement-open-positions",
        actionLabel: "Open positions",
        target: { type: "scroll_section", section: "positions" },
      }),
    ],
    latestSnapshot: { id: "snapshot-1" },
    latestAnalytics: { id: "analytics-1" },
    positions: [{ id: "position-1" }, { id: "position-2" }],
  });

  assert.equal(fascia.status, "Strong");
  assert.equal(fascia.sourceLabel, "Current retirement data");
  assert.equal(fascia.primaryAction.label, "Open read summary");
  assert.equal(fascia.tertiaryAction.label, "Why this status?");
  assert.equal(fascia.recommendedAction.label, "Open read summary");
  assert.match(fascia.explanation.summary, /current retirement data together with statement, analytics, and holdings support/i);
  assert.match(fascia.explanation.whyStatusAssigned, /statement support is present/i);
});

runTest("retirement fascia marks incomplete when evidence is thin and visibility gaps are real", () => {
  const fascia = buildRetirementPageFascia({
    retirementAccount: makeAccount(),
    retirementRead: makeRead({
      readinessStatus: "Needs Review",
      confidence: 0.41,
      metrics: {
        currentBalanceVisible: false,
        contributionsVisible: false,
        completenessStatus: "limited",
      },
    }),
    retirementSignals: makeSignals({
      signalLevel: "monitor",
      confidence: 0.46,
      reasons: ["The current retirement evidence stack is still incomplete, so this account should stay in a review state."],
      flags: {
        incompleteData: true,
        balanceVisibility: true,
        positionVisibility: true,
      },
      metadata: {
        statementAgeMonths: null,
        positionsCount: 0,
      },
    }),
    retirementActionFeed: [
      makeAction({
        id: "retirement-complete-evidence",
        actionLabel: "Review documents",
        target: { type: "scroll_section", section: "documents" },
      }),
    ],
    latestSnapshot: { id: "snapshot-1" },
    latestAnalytics: null,
    positions: [],
  });

  assert.equal(fascia.status, "Incomplete");
  assert.match(fascia.meaning, /partly readable, but key retirement details are still missing/i);
  assert.equal(fascia.recommendedAction.label, "Review documents");
  assert.match(fascia.explanation.summary, /using current retirement data, but allocation detail is still limited/i);
  assert.match(fascia.explanation.whyStatusAssigned, /missing statement support, incomplete balance visibility, or limited allocation detail/i);
  assert.match(fascia.explanation.limitations.join(" "), /Persisted retirement analytics are not stored yet/i);
});

runTest("retirement fascia stays partial for very early account bundles", () => {
  const fascia = buildRetirementPageFascia({
    retirementAccount: makeAccount(),
    retirementRead: makeRead({
      readinessStatus: "Usable",
      confidence: 0.39,
      metrics: {
        currentBalanceVisible: true,
        contributionsVisible: false,
        completenessStatus: "basic",
      },
    }),
    retirementSignals: makeSignals({
      signalLevel: "monitor",
      confidence: 0.38,
      reasons: ["Parsed position detail is not available yet, so allocation review is still thin."],
      flags: {
        incompleteData: false,
        positionVisibility: true,
      },
      metadata: {
        statementAgeMonths: null,
        positionsCount: 0,
      },
    }),
    retirementActionFeed: [
      makeAction({
        id: "retirement-parse-positions",
        actionLabel: "Open positions",
        target: { type: "scroll_section", section: "positions" },
      }),
    ],
    latestSnapshot: null,
    latestAnalytics: null,
    positions: [],
  });

  assert.equal(fascia.status, "Partial");
  assert.match(fascia.completenessNote, /allocation detail is still limited/i);
  assert.equal(fascia.recommendedAction.label, "Open positions");
  assert.match(fascia.explanation.limitations.join(" "), /Parsed allocation detail is still limited/i);
});

runTest("retirement fascia reports at risk when the retirement signal is at risk", () => {
  const fascia = buildRetirementPageFascia({
    retirementAccount: makeAccount(),
    retirementRead: makeRead({
      readinessStatus: "Needs Review",
      confidence: 0.52,
    }),
    retirementSignals: makeSignals({
      signalLevel: "at_risk",
      confidence: 0.57,
      reasons: ["Loan-related pressure is visible in the current retirement account evidence."],
      flags: {
        loanRisk: true,
        incompleteData: true,
      },
    }),
    retirementActionFeed: [
      makeAction({
        id: "retirement-review-loan",
        actionLabel: "Open analytics",
        target: { type: "scroll_section", section: "analytics" },
      }),
    ],
    latestSnapshot: { id: "snapshot-1" },
    latestAnalytics: { id: "analytics-1" },
    positions: [{ id: "position-1" }],
  });

  assert.equal(fascia.status, "At Risk");
  assert.match(fascia.meaning, /shows a problem that needs attention/i);
  assert.equal(fascia.recommendedAction.label, "Open analytics");
  assert.match(fascia.explanation.whyStatusAssigned, /loan, beneficiary, or concentration risk/i);
  assert.match(fascia.explanation.limitations.join(" "), /Loan-related pressure is visible/i);
});
