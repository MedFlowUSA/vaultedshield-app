import assert from "node:assert/strict";

import { buildPolicyOptimizationEngine } from "../src/lib/insurance/policyOptimizationEngine.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const baseIulV2 = {
  chargeAnalysis: { chargeDragLevel: "low", confidence: "high" },
  fundingAnalysis: { status: "sufficient", confidence: "high" },
  riskAnalysis: { overallRisk: "low", confidence: "moderate" },
  missingData: [],
};

runTest("underfunded policies produce funding recommendations", () => {
  const result = buildPolicyOptimizationEngine({
    lifePolicy: {
      meta: { policyType: "iul" },
      loans: {},
      values: { accumulationValue: 70000 },
    },
    iulV2: {
      ...baseIulV2,
      fundingAnalysis: { status: "underfunded", confidence: "high" },
      riskAnalysis: { overallRisk: "high", confidence: "high" },
      illustrationComparison: {
        status: "behind",
        confidence: "high",
        confidenceExplanation: "Confidence is high due to strong alignment between the illustration year and current policy duration.",
        drivers: [{ key: "underfunding" }],
        missingData: [],
      },
    },
    illustrationComparison: {
      status: "behind",
      confidence: "high",
      confidenceExplanation: "Confidence is high due to strong alignment between the illustration year and current policy duration.",
      drivers: [{ key: "underfunding" }],
      missingData: [],
    },
    statementRows: [{}, {}],
    policyType: "iul",
  });

  assert.equal(result.overallStatus, "at_risk");
  assert.equal(result.priorityLevel, "high");
  assert.equal(result.recommendations[0].type, "funding");
});

runTest("good funding but weak value produces efficiency recommendations", () => {
  const result = buildPolicyOptimizationEngine({
    lifePolicy: {
      meta: { policyType: "iul" },
      loans: {},
      values: { accumulationValue: 70000 },
    },
    iulV2: {
      ...baseIulV2,
      chargeAnalysis: { chargeDragLevel: "high", confidence: "high" },
      fundingAnalysis: { status: "sufficient", confidence: "high" },
      riskAnalysis: { overallRisk: "moderate", confidence: "high" },
      illustrationComparison: {
        status: "behind",
        confidence: "high",
        confidenceExplanation: "Confidence is high due to strong alignment between the illustration year and current policy duration.",
        drivers: [{ key: "charge_drag" }],
        missingData: [],
      },
    },
    illustrationComparison: {
      status: "behind",
      confidence: "high",
      confidenceExplanation: "Confidence is high due to strong alignment between the illustration year and current policy duration.",
      drivers: [{ key: "charge_drag" }],
      missingData: [],
    },
    statementRows: [{}, {}],
    policyType: "iul",
  });

  assert.equal(result.overallStatus, "at_risk");
  assert.equal(result.recommendations[0].type, "efficiency");
  assert.equal(result.recommendations.some((item) => item.title === "Review policy efficiency"), true);
});

runTest("loan-heavy policies produce loan management recommendations", () => {
  const result = buildPolicyOptimizationEngine({
    lifePolicy: {
      meta: { policyType: "iul" },
      loans: { loanBalance: 50000 },
      values: { accumulationValue: 100000 },
    },
    iulV2: {
      ...baseIulV2,
      riskAnalysis: { overallRisk: "high", confidence: "high" },
      illustrationComparison: {
        status: "on_track",
        confidence: "moderate",
        confidenceExplanation: "Confidence is moderate due to partial alignment between the illustration and current policy timing.",
        drivers: [],
        missingData: [],
      },
    },
    illustrationComparison: {
      status: "on_track",
      confidence: "moderate",
      confidenceExplanation: "Confidence is moderate due to partial alignment between the illustration and current policy timing.",
      drivers: [],
      missingData: [],
    },
    statementRows: [{}, {}],
    policyType: "iul",
  });

  assert.equal(result.recommendations[0].type, "loan");
  assert.equal(result.risks.some((item) => item.type === "loan_pressure"), true);
});

runTest("strong policies recommend maintaining discipline", () => {
  const result = buildPolicyOptimizationEngine({
    lifePolicy: {
      meta: { policyType: "iul" },
      loans: {},
      values: { accumulationValue: 120000 },
    },
    iulV2: {
      ...baseIulV2,
      illustrationComparison: {
        status: "ahead",
        confidence: "high",
        confidenceExplanation: "Confidence is high due to strong alignment between the illustration year and current policy duration.",
        drivers: [],
        missingData: [],
      },
    },
    illustrationComparison: {
      status: "ahead",
      confidence: "high",
      confidenceExplanation: "Confidence is high due to strong alignment between the illustration year and current policy duration.",
      drivers: [],
      missingData: [],
    },
    statementRows: [{}, {}, {}],
    policyType: "iul",
  });

  assert.equal(result.overallStatus, "healthy");
  assert.equal(result.priorityLevel, "low");
  assert.equal(result.recommendations[0].title, "Maintain current funding discipline");
});

runTest("insufficient data asks for more uploads", () => {
  const result = buildPolicyOptimizationEngine({
    lifePolicy: {
      meta: { policyType: "iul" },
      loans: {},
      values: {},
    },
    iulV2: {
      ...baseIulV2,
      riskAnalysis: { overallRisk: "unclear", confidence: "low" },
      missingData: ["Need more statements", "Need fuller illustration"],
      illustrationComparison: {
        status: "indeterminate",
        confidence: "low",
        confidenceExplanation: "Confidence is limited due to weak alignment between illustration data and current policy duration.",
        drivers: [{ key: "incomplete_data" }],
        missingData: ["Weak alignment"],
      },
    },
    illustrationComparison: {
      status: "indeterminate",
      confidence: "low",
      confidenceExplanation: "Confidence is limited due to weak alignment between illustration data and current policy duration.",
      drivers: [{ key: "incomplete_data" }],
      missingData: ["Weak alignment"],
    },
    statementRows: [{}],
    policyType: "iul",
  });

  assert.equal(result.overallStatus, "insufficient_data");
  assert.equal(result.recommendations[0].type, "data");
  assert.equal(result.missingData.includes("Weak alignment"), true);
});

console.log("All policy optimization checks passed.");
