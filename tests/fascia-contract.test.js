import assert from "node:assert/strict";

import {
  buildFasciaExplanation,
  buildFasciaExplanationToggleAction,
  buildFasciaSource,
  buildFasciaStatusTone,
  finalizeFascia,
  normalizeFasciaAction,
} from "../src/lib/intelligence/fascia/fasciaContract.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("status tones normalize consistently across fascia pages", () => {
  assert.equal(buildFasciaStatusTone("Strong"), "good");
  assert.equal(buildFasciaStatusTone("Stable"), "info");
  assert.equal(buildFasciaStatusTone("Needs Review"), "warning");
  assert.equal(buildFasciaStatusTone("Incomplete"), "warning");
  assert.equal(buildFasciaStatusTone("Partial"), "warning");
  assert.equal(buildFasciaStatusTone("At Risk"), "alert");
  assert.equal(buildFasciaStatusTone("Not Enough Data"), "neutral");
});

runTest("source metadata defaults to client-safe tones", () => {
  assert.deepEqual(
    buildFasciaSource({
      sourceMode: "policy_fallback",
      sourceLabel: "Policy-only view",
      status: "Stable",
    }),
    {
      sourceMode: "policy_fallback",
      sourceLabel: "Policy-only view",
      sourceTone: "info",
    }
  );

  assert.deepEqual(
    buildFasciaSource({
      sourceMode: "policy_fallback",
      sourceLabel: "Policy-only view",
      status: "Not Enough Data",
    }),
    {
      sourceMode: "policy_fallback",
      sourceLabel: "Policy-only view",
      sourceTone: "neutral",
    }
  );
});

runTest("fascia actions normalize shared target and navigate shapes", () => {
  assert.deepEqual(
    normalizeFasciaAction({
      label: "Open policy details",
      route: "/insurance/policy/p-1",
    }),
    {
      label: "Open policy details",
      route: "/insurance/policy/p-1",
      kind: "navigate",
    }
  );

  assert.deepEqual(
    normalizeFasciaAction({
      label: "Open valuation review",
      target: { type: "scroll_section", section: "valuation" },
    }),
    {
      label: "Open valuation review",
      target: { type: "scroll_section", section: "valuation" },
      kind: "target",
    }
  );
});

runTest("fascia explanation helpers normalize lists and toggle actions", () => {
  const explanation = buildFasciaExplanation({
    summary: "Fallback explanation.",
    drivers: ["Policy reads are available", "Policy reads are available", "Household summary unavailable", "Trim me"],
    dataSources: [
      "Loaded policy records",
      "Loaded policy records",
      "Protection signals",
      "Policy fallback",
      "Document support",
      "Trim me",
    ],
    whyStatusAssigned: "Policy fallback is active.",
    limitations: [
      "Household summary is unavailable.",
      "Household summary is unavailable.",
      "One policy is missing a statement.",
      "Confidence remains limited.",
      "Trim me",
    ],
    recommendedAction: {
      label: "Review protection signals",
      action: {
        label: "Review protection signals",
        kind: "scroll_protection_signals",
      },
    },
    sourceMode: "policy_fallback",
  });

  assert.deepEqual(explanation.drivers, [
    "Policy reads are available",
    "Household summary unavailable",
    "Trim me",
  ]);
  assert.deepEqual(explanation.dataSources, [
    "Loaded policy records",
    "Protection signals",
    "Policy fallback",
    "Document support",
    "Trim me",
  ]);
  assert.deepEqual(explanation.limitations, [
    "Household summary is unavailable.",
    "One policy is missing a statement.",
    "Confidence remains limited.",
    "Trim me",
  ]);
  assert.deepEqual(buildFasciaExplanationToggleAction(), {
    label: "Why this status?",
    kind: "toggle_explanation",
  });
  assert.deepEqual(explanation.recommendedAction.action, {
    label: "Review protection signals",
    kind: "scroll_protection_signals",
  });
});

runTest("finalized fascia trims duplicate drivers and duplicate actions", () => {
  const fascia = finalizeFascia({
    title: "Insurance Overview",
    status: "Stable",
    sourceMode: "policy_fallback",
    sourceLabel: "Policy-only view",
    meaning: "Your loaded policy data looks mostly stable, but the full household summary is not available right now.",
    drivers: [
      "Policy reads are available",
      "Policy reads are available",
      "The loaded policies do not show the full household picture yet",
      "The household summary is unavailable right now",
      "Extra driver that should be trimmed",
    ],
    primaryAction: {
      label: "Review protection signals",
      kind: "scroll_protection_signals",
    },
    secondaryAction: {
      label: "Review protection signals",
      kind: "scroll_protection_signals",
    },
    tertiaryAction: {
      label: "Why this status?",
      kind: "toggle_explanation",
    },
    completenessNote: "Using loaded policy data while the household summary is unavailable.",
    explanation: {
      summary: "Fallback explanation.",
      drivers: ["Policy reads are available", "Policy reads are available"],
      dataSources: ["Loaded policy records"],
      whyStatusAssigned: "Fallback view is active.",
      limitations: ["Household summary is unavailable."],
      recommendedAction: {
        label: "Review protection signals",
        action: {
          label: "Review protection signals",
          kind: "scroll_protection_signals",
        },
      },
      sourceMode: "policy_fallback",
    },
  });

  assert.deepEqual(fascia.drivers, [
    "Policy reads are available",
    "The loaded policies do not show the full household picture yet",
    "The household summary is unavailable right now",
  ]);
  assert.equal(fascia.secondaryAction, null);
  assert.equal(fascia.sourceTone, "info");
  assert.equal(fascia.tertiaryAction.label, "Why this status?");
  assert.equal(fascia.explanation.summary, "Fallback explanation.");
});
