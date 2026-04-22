import assert from "node:assert/strict";

import buildInsurancePageFascia from "../src/lib/intelligence/fascia/buildInsurancePageFascia.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makePolicy(overrides = {}) {
  return {
    policy_id: overrides.policy_id || "policy-1",
    product: overrides.product || "Indexed Universal Life",
    policy_type: overrides.policy_type || "iul",
    ranking: overrides.ranking || { status: "Strong", score: 89 },
    gapAnalysis: overrides.gapAnalysis || { coverageGap: false, confidence: 0.82 },
    coi_confidence: overrides.coi_confidence ?? "moderate",
    latest_statement_date: overrides.latest_statement_date ?? "2025-12-31",
    data_completeness_status: overrides.data_completeness_status ?? "detailed",
    missing_fields: overrides.missing_fields || [],
    ...overrides,
  };
}

function makeHealthySignals(overrides = {}) {
  return {
    portfolioSignalLevel: "healthy",
    confidence: 0.81,
    portfolioFlags: {
      concentrationRisk: false,
      incompleteDataSpread: false,
      loanExposureRisk: false,
      chargeDragRisk: false,
      illustrationVarianceRisk: false,
      ...(overrides.portfolioFlags || {}),
    },
    ...overrides,
  };
}

runTest("household summary data drives a stronger fascia interpretation", () => {
  const policies = [
    makePolicy({ policy_id: "p-1", product: "Indexed Universal Life" }),
    makePolicy({ policy_id: "p-2", product: "Whole Life Legacy" }),
  ];

  const fascia = buildInsurancePageFascia({
    householdSummary: {
      totalPolicies: 2,
      totalCoverage: 1500000,
      confidence: 0.88,
      gapDetected: false,
      status: "Better Supported",
      headline: "Household protection reads well supported.",
      notes: ["No obvious protection gap is visible."],
      metrics: {
        lowConfidencePolicies: 0,
        missingDeathBenefitPolicies: 0,
        beneficiaryLimitedPolicies: 0,
      },
    },
    policies,
    protectionSummary: { confidence: 0.72, gapDetected: false },
    portfolioSignals: makeHealthySignals(),
    hasAuthenticatedHousehold: true,
    continuity: {
      gapPolicies: 0,
      atRiskPolicies: 0,
      strongPolicies: 2,
      policiesWithIssues: 0,
    },
    priorityPolicy: policies[0],
  });

  assert.equal(fascia.sourceMode, "household_summary");
  assert.equal(fascia.sourceLabel, "Household summary");
  assert.equal(fascia.status, "Strong");
  assert.match(fascia.completenessNote, /household summary and policy data/i);
  assert.equal(fascia.primaryAction.label, "Compare loaded policies");
  assert.equal(fascia.tertiaryAction.label, "Why this status?");
  assert.match(fascia.explanation.summary, /using the household summary together with the policy data we have loaded/i);
  assert.ok(fascia.explanation.dataSources.some((item) => /household insurance summary/i.test(item)));
});

runTest("summary errors fall back to loaded policy data with honest language", () => {
  const policies = [
    makePolicy({ policy_id: "p-3", product: "Protection Builder IUL" }),
    makePolicy({ policy_id: "p-4", product: "Family Whole Life" }),
  ];

  const fascia = buildInsurancePageFascia({
    householdSummary: null,
    summaryError: "timed out",
    policies,
    protectionSummary: {
      totalPolicies: 2,
      totalCoverage: 900000,
      confidence: 0.79,
      gapDetected: false,
    },
    portfolioSignals: makeHealthySignals(),
    hasAuthenticatedHousehold: true,
    continuity: {
      gapPolicies: 0,
      atRiskPolicies: 0,
      strongPolicies: 2,
      policiesWithIssues: 0,
    },
    priorityPolicy: policies[0],
  });

  assert.equal(fascia.sourceMode, "policy_fallback");
  assert.equal(fascia.sourceLabel, "Policy-only view");
  assert.equal(fascia.status, "Stable");
  assert.match(fascia.meaning, /loaded policy data looks mostly stable/i);
  assert.match(fascia.meaning, /full household summary is not available/i);
  assert.equal(fascia.completenessNote, "Using loaded policy data while the household summary is unavailable.");
  assert.match(fascia.explanation.summary, /based only on the policy records we could load/i);
  assert.ok(fascia.explanation.dataSources.some((item) => /policy-only fallback view/i.test(item)));
  assert.ok(fascia.explanation.limitations.some((item) => /household summary is unavailable right now/i.test(item)));
  assert.equal(fascia.explanation.recommendedAction.label, fascia.primaryAction.label);
});

runTest("auth loss keeps fallback fascia conservative instead of confident", () => {
  const policies = [
    makePolicy({ policy_id: "p-5", product: "Core Family IUL" }),
    makePolicy({ policy_id: "p-6", product: "Supplemental Term", policy_type: "term" }),
  ];

  const fascia = buildInsurancePageFascia({
    householdSummary: null,
    summaryLoading: false,
    policies,
    protectionSummary: {
      totalPolicies: 2,
      totalCoverage: 1000000,
      confidence: 0.84,
      gapDetected: false,
    },
    portfolioSignals: makeHealthySignals(),
    hasAuthenticatedHousehold: false,
    continuity: {
      gapPolicies: 0,
      atRiskPolicies: 0,
      strongPolicies: 2,
      policiesWithIssues: 0,
    },
    priorityPolicy: policies[0],
  });

  assert.equal(fascia.sourceMode, "policy_fallback");
  assert.equal(fascia.status, "Partial");
  assert.equal(fascia.completenessNote, "Using loaded policy data while the household summary is not active.");
  assert.doesNotMatch(fascia.meaning, /insurance picture looks strong/i);
  assert.ok(fascia.explanation.limitations.some((item) => /household summary is not active right now/i.test(item)));
});

runTest("very weak data falls back to partial instead of fake certainty", () => {
  const policies = [
    makePolicy({
      policy_id: "p-7",
      product: "Unresolved Policy Read",
      ranking: { status: "Monitor", score: 52 },
      gapAnalysis: { coverageGap: false, confidence: 0.22 },
      coi_confidence: "weak",
      latest_statement_date: null,
      data_completeness_status: "basic",
      missing_fields: ["carrier", "beneficiary", "statement_date"],
    }),
  ];

  const fascia = buildInsurancePageFascia({
    householdSummary: null,
    policies,
    protectionSummary: {
      totalPolicies: 1,
      totalCoverage: 0,
      confidence: 0.22,
      gapDetected: false,
    },
    portfolioSignals: makeHealthySignals({ confidence: 0.22 }),
    hasAuthenticatedHousehold: false,
    continuity: {
      gapPolicies: 0,
      atRiskPolicies: 0,
      strongPolicies: 0,
      policiesWithIssues: 1,
    },
    priorityPolicy: policies[0],
  });

  assert.equal(fascia.sourceMode, "policy_fallback");
  assert.equal(fascia.status, "Partial");
  assert.match(fascia.meaning, /have some insurance data, but not enough yet to give you a full, confident read/i);
  assert.ok(fascia.explanation.limitations.some((item) => /missing fields or weak document support/i.test(item)));
});

runTest("missing household summary and policy reads yields not-enough-data state", () => {
  const fascia = buildInsurancePageFascia({
    householdSummary: null,
    policies: [],
    protectionSummary: {
      totalPolicies: 0,
      totalCoverage: 0,
      confidence: 0,
      gapDetected: false,
    },
    portfolioSignals: makeHealthySignals({ confidence: 0 }),
    hasAuthenticatedHousehold: false,
    continuity: {
      gapPolicies: 0,
      atRiskPolicies: 0,
      strongPolicies: 0,
      policiesWithIssues: 0,
    },
  });

  assert.equal(fascia.sourceMode, "policy_fallback");
  assert.equal(fascia.status, "Not Enough Data");
  assert.equal(fascia.primaryAction.label, "Upload a policy");
  assert.match(fascia.explanation.whyStatusAssigned, /not enough readable insurance evidence yet/i);
});
