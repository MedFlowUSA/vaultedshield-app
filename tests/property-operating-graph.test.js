import assert from "node:assert/strict";

import { buildHouseholdPriorityEngine } from "../src/lib/domain/platformIntelligence/householdOperatingSystem.js";
import { buildPropertySignals } from "../src/lib/propertySignals/buildPropertySignals.js";
import { runPropertyAiAssistant } from "../src/utils/runPropertyAiAssistant.js";

function testPropertySignalsExposeStackCompleteness() {
  const propertySignals = buildPropertySignals({
    property: {
      city: "Austin",
      state: "TX",
      postal_code: "78701",
      square_feet: 2200,
      beds: 4,
      baths: 3,
      year_built: 2018,
      last_purchase_price: 420000,
      last_purchase_date: "2021-03-01",
    },
    latestValuation: {
      id: "valuation-1",
      confidence_label: "moderate",
      confidence_score: 0.68,
      metadata: {
        subject_completeness: 0.92,
        comp_fit_score: 0.8,
        strong_comp_count: 2,
        valuation_range_ratio: 0.1,
        official_market_support: "aligned",
      },
    },
    propertyEquityPosition: {
      financing_status: "linked_balance_missing",
      protection_status: "missing",
      review_flags: [],
    },
    propertyStackAnalytics: {
      id: "stack-1",
      completeness_score: 0.42,
      continuity_status: "weak",
      linkage_status: "mortgage_only",
    },
    linkedMortgages: [{ id: "mortgage-1" }],
    linkedHomeownersPolicies: [],
  });

  assert.equal(propertySignals.flags.stackCompletenessGap, true);
  assert.equal(propertySignals.metadata.stackCompletenessLabel, "Partial");
  assert.match(propertySignals.reasons.join(" "), /42%/);
}

function testPropertyAssistantExplainsStackCompleteness() {
  const propertySignals = buildPropertySignals({
    property: { city: "Austin", state: "TX" },
    latestValuation: {
      id: "valuation-1",
      confidence_label: "moderate",
      confidence_score: 0.68,
      metadata: {
        subject_completeness: 0.5,
        comp_fit_score: 0.71,
        strong_comp_count: 1,
        valuation_range_ratio: 0.13,
        official_market_support: "mixed",
      },
    },
    propertyEquityPosition: {
      financing_status: "missing",
      protection_status: "missing",
      equity_visibility_status: "limited",
      review_flags: [],
    },
    propertyStackAnalytics: {
      id: "stack-1",
      completeness_score: 0.38,
      continuity_status: "weak",
      linkage_status: "property_only",
    },
    linkedMortgages: [],
    linkedHomeownersPolicies: [],
  });

  const response = runPropertyAiAssistant({
    userQuestion: "Why is this property stack partial?",
    property: { id: "property-1", city: "Austin", state: "TX" },
    latestValuation: {
      id: "valuation-1",
      confidence_label: "moderate",
      confidence_score: 0.68,
      metadata: {
        subject_completeness: 0.5,
        comp_fit_score: 0.71,
        average_comp_recency_months: 8,
        official_market_support: "mixed",
        review_flags: [],
      },
      comps_count: 3,
    },
    valuationChangeSummary: {
      change_status: "insufficient_history",
      summary: "Valuation history is still shallow.",
      bullets: [],
    },
    propertyEquityPosition: {
      financing_status: "missing",
      protection_status: "missing",
      equity_visibility_status: "limited",
      review_flags: [],
    },
    propertyStackAnalytics: {
      id: "stack-1",
      completeness_score: 0.38,
      continuity_status: "weak",
      linkage_status: "property_only",
    },
    linkedMortgages: [],
    linkedHomeownersPolicies: [],
    propertyId: "property-1",
    propertySignals,
    propertyActionFeed: [],
  });

  assert.equal(response.intent, "stack_completeness");
  assert.match(response.answer_text, /partial|limited/i);
  assert.match(response.evidence_points.join(" "), /38%/);
}

function testHouseholdPriorityEngineSynthesizesPropertyGraphPriority() {
  const householdPriorityEngine = buildHouseholdPriorityEngine({
    householdMap: {
      bottom_line: "Household priorities are still forming.",
      dependency_signals: { priority_issues: [] },
    },
    commandCenter: { blockers: [] },
    housingCommand: { blockers: [] },
    emergencyAccessCommand: { blockers: [] },
    bundle: {
      propertyStackSummary: {
        propertyCount: 2,
        mortgageCount: 1,
        homeownersCount: 1,
        analyticsByPropertyId: {
          "property-1": { completeness_score: 0.42 },
          "property-2": { completeness_score: 0.58 },
        },
        propertiesMissingHomeownersLink: [{ id: "property-1" }],
        propertiesMissingMortgageLink: [{ id: "property-2" }],
        assetGraphSummary: {
          completePropertyAssetGraph: [],
          partialPropertyAssetGraph: [{ id: "property-1" }, { id: "property-2" }],
          propertiesMissingAssetGraphHomeownersLink: [{ id: "property-1" }],
          propertiesMissingAssetGraphMortgageLink: [{ id: "property-2" }],
        },
      },
      documentCountsByCategory: {
        property: 1,
        mortgage: 0,
        homeowners: 0,
      },
      portalReadiness: {
        linkedPortalCount: 0,
        criticalAssetsWithoutLinkedPortals: [{ asset_category: "property" }],
      },
    },
  });

  assert.match(householdPriorityEngine.headline, /Property stack completeness/i);
  assert.equal(householdPriorityEngine.priorities[0]?.source, "Operating Graph");
  assert.match(householdPriorityEngine.priorities[0]?.blocker || "", /50%/);
}

testPropertySignalsExposeStackCompleteness();
testPropertyAssistantExplainsStackCompleteness();
testHouseholdPriorityEngineSynthesizesPropertyGraphPriority();

console.log("property operating graph tests passed");
