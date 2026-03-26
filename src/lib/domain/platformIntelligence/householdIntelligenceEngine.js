import {
  createEmptyHouseholdIntelligenceSchema,
} from "./householdIntelligenceSchema";
import { getHouseholdBlankState } from "../../onboarding/isHouseholdBlank";

const CRITICAL_ASSET_CATEGORIES = [
  "insurance",
  "mortgage",
  "retirement",
  "estate",
  "property",
  "homeowners",
  "health_insurance",
  "auto_insurance",
  "warranty",
];

function toLabel(score) {
  if (score >= 85) return "Strong";
  if (score >= 60) return "Moderate";
  if (score >= 35) return "Basic";
  return "Sparse";
}

function countAssetsByCategory(assets = []) {
  return assets.reduce((accumulator, asset) => {
    const key = asset.asset_category || "unknown";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function countDocumentsByCategory(documents = []) {
  return documents.reduce((accumulator, document) => {
    const key = document.assets?.asset_category || document.metadata?.asset_category_hint || "unassigned";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function buildModuleFlags(assetCounts = {}) {
  return {
    insurance_present: Boolean(assetCounts.insurance),
    mortgage_present: Boolean(assetCounts.mortgage),
    retirement_present: Boolean(assetCounts.retirement),
    estate_present: Boolean(assetCounts.estate),
    homeowners_present: Boolean(assetCounts.homeowners),
    health_present: Boolean(assetCounts.health_insurance),
    auto_present: Boolean(assetCounts.auto_insurance),
    warranties_present: Boolean(assetCounts.warranty),
  };
}

function buildDocumentCompleteness(bundle, assetCounts, documentCounts) {
  const notes = [];
  let score = 0;
  const totalDocuments = bundle.documents?.length || 0;

  if (totalDocuments >= 12) {
    score += 35;
    notes.push("Household document coverage is broad across the platform vault.");
  } else if (totalDocuments >= 5) {
    score += 22;
    notes.push("Household document coverage is present but still uneven.");
  } else if (totalDocuments > 0) {
    score += 10;
    notes.push("Some household documents are present, but coverage is still basic.");
  } else {
    notes.push("Generic household document visibility is still sparse.");
  }

  if (assetCounts.insurance && (documentCounts.insurance || documentCounts.homeowners || documentCounts.health_insurance || documentCounts.auto_insurance)) {
    score += 15;
    notes.push("Insurance-related documents are visible.");
  } else if (assetCounts.insurance) {
    notes.push("Insurance assets exist, but insurance document support appears limited.");
  }

  if (assetCounts.retirement && documentCounts.retirement) {
    score += 12;
    notes.push("Retirement document support is visible.");
  } else if (assetCounts.retirement) {
    notes.push("Retirement assets exist, but retirement document visibility remains limited.");
  }

  if ((assetCounts.mortgage || assetCounts.homeowners) && (documentCounts.mortgage || documentCounts.homeowners || documentCounts.property)) {
    score += 12;
    notes.push("Property and debt-related document support is visible.");
  } else if (assetCounts.mortgage || assetCounts.homeowners) {
    notes.push("Mortgage or homeowners records exist, but related document visibility remains limited.");
  }

  if (assetCounts.estate && documentCounts.estate) {
    score += 14;
    notes.push("Estate document coverage is visible.");
  } else if (assetCounts.estate) {
    notes.push("Estate assets exist, but estate documents are not yet clearly visible.");
  }

  if (assetCounts.warranty && documentCounts.warranty) {
    score += 8;
    notes.push("Warranty contract support documents are visible.");
  } else if (assetCounts.warranty) {
    notes.push("Warranty records exist, but proof-of-purchase or contract support appears limited.");
  }

  score = Math.min(score, 100);

  return {
    score_label: toLabel(score),
    score_value: score,
    document_category_counts: documentCounts,
    sparse_household_documentation: totalDocuments < 5,
    notes,
  };
}

function buildPortalContinuity(bundle) {
  const notes = [];
  const readiness = bundle.portalReadiness || {};
  let score = 0;

  if ((readiness.portalCount || 0) >= 5) {
    score += 35;
    notes.push("Portal continuity coverage is broad.");
  } else if ((readiness.portalCount || 0) >= 2) {
    score += 20;
    notes.push("Some key portals are documented.");
  } else if ((readiness.portalCount || 0) > 0) {
    score += 10;
    notes.push("Portal continuity has started but remains limited.");
  } else {
    notes.push("No portal continuity records are currently visible.");
  }

  if ((readiness.emergencyRelevantCount || 0) > 0) {
    score += 20;
    notes.push("Emergency-relevant portals have been identified.");
  } else {
    notes.push("Emergency-relevant portals have not yet been clearly identified.");
  }

  if ((readiness.missingRecoveryCount || 0) === 0 && (readiness.portalCount || 0) > 0) {
    score += 20;
    notes.push("Visible portals currently include recovery hints.");
  } else if ((readiness.missingRecoveryCount || 0) > 0) {
    notes.push("Some portals are still missing recovery hints.");
  }

  if ((readiness.criticalAssetsWithoutLinkedPortals || []).length === 0 && (bundle.assets || []).some((asset) => CRITICAL_ASSET_CATEGORIES.includes(asset.asset_category))) {
    score += 25;
    notes.push("Critical assets currently show portal continuity coverage.");
  } else if ((readiness.criticalAssetsWithoutLinkedPortals || []).length > 0) {
    notes.push("Some critical assets still do not have linked portal continuity.");
  }

  score = Math.min(score, 100);

  return {
    score_label: toLabel(score),
    score_value: score,
    linked_portal_count: readiness.linkedPortalCount || 0,
    emergency_relevant_portal_count: readiness.emergencyRelevantCount || 0,
    missing_recovery_count: readiness.missingRecoveryCount || 0,
    critical_assets_without_portals: readiness.criticalAssetsWithoutLinkedPortals || [],
    notes,
  };
}

function buildEmergencyReadiness(bundle, portalContinuity) {
  const notes = [];
  let score = 0;

  if ((bundle.householdMembers || []).length > 0) {
    score += 15;
    notes.push("Household members are on record.");
  } else {
    notes.push("Household members are still missing.");
  }

  if ((bundle.emergencyContacts || []).length > 0) {
    score += 18;
    notes.push("Emergency or family contacts are available.");
  } else {
    notes.push("Emergency contacts are still missing.");
  }

  if ((bundle.keyProfessionalContacts || []).length > 0) {
    score += 14;
    notes.push("Professional continuity contacts are available.");
  } else {
    notes.push("Professional support contacts are still sparse.");
  }

  if ((bundle.keyAssets || []).length >= 3) {
    score += 18;
    notes.push("Key household assets are represented.");
  } else if ((bundle.keyAssets || []).length > 0) {
    score += 10;
    notes.push("Some key assets are represented.");
  } else {
    notes.push("Key household assets are still sparse.");
  }

  if ((bundle.documents || []).length > 0) {
    score += 15;
    notes.push("Documents are available for emergency continuity.");
  } else {
    notes.push("Document support is still sparse for emergency continuity.");
  }

  score += Math.round((portalContinuity.score_value || 0) * 0.2);

  if ((bundle.openAlerts || []).length === 0 && (bundle.openTasks || []).length <= 3) {
    score += 10;
    notes.push("Open alert and task load is manageable.");
  } else {
    notes.push("Open alerts or tasks are lowering readiness.");
  }

  score = Math.min(score, 100);

  return {
    score_label: toLabel(score),
    score_value: score,
    emergency_contact_count: (bundle.emergencyContacts || []).length,
    professional_contact_count: (bundle.keyProfessionalContacts || []).length,
    key_asset_count: (bundle.keyAssets || []).length,
    notes,
  };
}

function buildPrompts(bundle, assetCounts, documentCounts, portalContinuity, moduleFlags, documentCompleteness) {
  const prompts = [];
  const flags = [];
  const propertyStack = bundle.propertyStackSummary || {};
  const propertyStackAnalytics = bundle.propertyStackAnalytics || [];

  if (assetCounts.mortgage && !assetCounts.homeowners) {
    prompts.push("A mortgage record is present, but no homeowners policy is visible yet.");
    flags.push("mortgage_without_homeowners_prompt");
  }

  if (assetCounts.retirement && !documentCounts.retirement) {
    prompts.push("Retirement assets are present, but retirement document visibility is still limited.");
    flags.push("missing_retirement_docs");
  }

  if ((assetCounts.insurance || assetCounts.homeowners || assetCounts.health_insurance || assetCounts.auto_insurance) && portalContinuity.linked_portal_count === 0) {
    prompts.push("Insurance-related assets are present, but portal continuity coverage is still sparse.");
    flags.push("missing_insurance_portal_coverage");
  }

  if (assetCounts.warranty && !documentCounts.warranty) {
    prompts.push("Warranty contracts are present, but proof-of-purchase or contract support documents are still limited.");
    flags.push("warranties_missing_proof_of_purchase_prompt");
  }

  if (!moduleFlags.estate_present) {
    prompts.push("No estate module records are visible yet. Add wills, trusts, or estate assets if available.");
    flags.push("missing_estate_docs");
  } else if (!documentCounts.estate) {
    prompts.push("Estate assets are present, but estate document visibility remains limited.");
    flags.push("limited_estate_document_visibility");
  }

  if ((bundle.emergencyContacts || []).length === 0 || (bundle.keyProfessionalContacts || []).length === 0) {
    prompts.push("Household continuity would improve with stronger emergency and professional contact coverage.");
    flags.push("household_contacts_sparse");
  }

  if ((bundle.assets || []).length >= 6 && documentCompleteness.score_label === "Sparse") {
    prompts.push("The household has several assets, but supporting document coverage is still sparse.");
    flags.push("many_assets_low_document_support");
  }

  if (portalContinuity.critical_assets_without_portals.length > 0) {
    prompts.push("Critical assets are still missing linked access portals.");
    flags.push("critical_assets_without_portals");
  }

  if ((propertyStack.propertiesMissingHomeownersLink || []).length > 0) {
    prompts.push("Some property records do not yet show linked homeowners coverage.");
    flags.push("properties_missing_homeowners_link");
  }

  if ((propertyStack.propertiesMissingMortgageLink || []).length > 0) {
    prompts.push("Some property records do not yet show linked financing visibility.");
    flags.push("properties_missing_mortgage_link");
  }

  if ((propertyStack.mortgagesWithoutLinkedProperties || []).length > 0) {
    prompts.push("Some mortgage records are still not linked to a property record.");
    flags.push("mortgages_without_linked_properties");
  }

  if ((propertyStack.homeownersWithoutLinkedProperties || []).length > 0) {
    prompts.push("Some homeowners policies are still not linked to a property record.");
    flags.push("homeowners_without_linked_properties");
  }

  if ((propertyStack.weakContinuityPropertyStacks || []).length > 0) {
    prompts.push("Some property stacks still show weak continuity and should be reviewed.");
    flags.push("properties_with_weak_continuity");
  }

  if ((propertyStack.completePropertyStacksNeedingReview || []).length > 0) {
    prompts.push("Some complete property stacks still show review flags or continuity gaps.");
    flags.push("complete_property_stacks_need_review");
  }

  if ((propertyStack.multipleMortgageLinkReview || []).length > 0) {
    prompts.push("Some properties have multiple linked mortgages that still need financing review.");
    flags.push("multiple_mortgages_need_review");
  }

  if ((propertyStack.multipleHomeownersLinkReview || []).length > 0) {
    prompts.push("Some properties have multiple linked homeowners policies that still need coverage review.");
    flags.push("multiple_homeowners_policies_need_review");
  }

  if ((propertyStack.incompletePropertyStacks || []).length > 0) {
    prompts.push("Some property stacks still need both financing and protection linkage completed.");
    flags.push("incomplete_property_stacks_need_completion");
  }

  if ((propertyStack.propertiesMissingProtectionButWithValue || []).length > 0) {
    prompts.push("Some properties now have value review visibility but still do not show linked homeowners protection.");
    flags.push("properties_with_value_missing_protection");
  }

  if ((propertyStack.propertiesMissingValueReview || []).length > 0) {
    prompts.push("Some property stacks are linked, but virtual value review has not been stored yet.");
    flags.push("properties_missing_value_review");
  }

  if ((propertyStack.weakValuationConfidenceProperties || []).length > 0) {
    prompts.push("Some property value reviews currently have weak confidence and should be treated cautiously.");
    flags.push("weak_property_valuation_confidence");
  }

  if ((propertyStack.highQualityPropertyReviewAvailable || []).length > 0) {
    prompts.push("At least one property currently shows strong value, debt, and protection visibility.");
    flags.push("high_quality_property_review_available");
  }

  if (
    propertyStackAnalytics.length > 0 &&
    propertyStackAnalytics.every((item) => item.continuity_status === "strong")
  ) {
    prompts.push("Visible property stacks currently show strong continuity coverage.");
    flags.push("strong_property_stack_continuity_visible");
  }

  return { prompts, flags };
}

function toUiNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toPercent(score) {
  return Math.max(0, Math.min(100, Math.round(score || 0)));
}

function toStatus(score) {
  if (score === null || score === undefined) return "Starter";
  if (score >= 85) return "Strong";
  if (score >= 65) return "Moderate";
  if (score >= 40) return "Weak";
  return "At Risk";
}

function toVisibilityLabel(value) {
  if (!value) return "Limited";
  if (["strong", "complete", "high"].includes(value)) return "Strong";
  if (["partial", "moderate", "mixed"].includes(value)) return "Moderate";
  if (["weak", "basic", "limited", "low"].includes(value)) return "Weak";
  return "Moderate";
}

function buildPolicyReviewPriority(policy) {
  const label = policy.product || policy.carrier || "Saved policy";
  const missingFields = Array.isArray(policy.missing_fields) ? policy.missing_fields : [];
  const continuityScore = toPercent(
    policy.continuity_score ?? policy.ranking_score ?? policy.policy_health_score ?? 0
  );
  const scorePenalty = Math.max(0, 85 - continuityScore);
  const missingPenalty = missingFields.length * 4;
  const statementPenalty = policy.latest_statement_date ? 0 : 18;
  const coiPenalty =
    policy.coi_confidence === "weak" ? 16 : policy.coi_confidence === "moderate" ? 8 : 0;
  const chargePenalty =
    policy.charge_visibility_status === "weak"
      ? 14
      : policy.charge_visibility_status === "partial"
        ? 7
        : 0;
  const priorityScore = scorePenalty + missingPenalty + statementPenalty + coiPenalty + chargePenalty;

  const reasons = [];
  if (!policy.latest_statement_date) reasons.push("latest statement support is missing");
  if (policy.coi_confidence === "weak") reasons.push("COI confidence is weak");
  if (policy.charge_visibility_status === "weak") reasons.push("charge visibility is weak");
  if (missingFields.length > 0) reasons.push(`${missingFields.length} key fields remain missing`);

  return {
    id: policy.policy_id || label,
    label,
    priority_score: priorityScore,
    route: policy.policy_id ? `/insurance/${policy.policy_id}` : "/insurance",
    action_label: "Open policy review",
    data_updated_at: policy.latest_statement_date || null,
    change_signal:
      policy.latest_statement_date
        ? `Latest statement support is visible through ${policy.latest_statement_date}.`
        : "Latest statement support is still missing.",
    summary:
      reasons.length > 0
        ? `${label} needs review because ${reasons.slice(0, 2).join(" and ")}.`
        : `${label} should stay on review because continuity support is thinner than the rest of the visible set.`,
  };
}

function buildDependencyFlag({
  key,
  severity = "moderate",
  title,
  explanation,
  supportingEvidence = [],
  suggestedSmartActionKeys = [],
  route = "/dashboard",
  actionLabel = "Open review",
  priorityScore = 60,
}) {
  return {
    key,
    severity,
    title,
    explanation,
    supporting_evidence: supportingEvidence.filter(Boolean).slice(0, 4),
    suggested_smart_action_keys: suggestedSmartActionKeys,
    route,
    action_label: actionLabel,
    priority_score: priorityScore,
  };
}

export function buildCrossAssetDependencySignals(bundle = {}, savedPolicyRows = [], intelligence = null) {
  const propertySummary = bundle.propertyStackSummary || {};
  const portalReadiness = bundle.portalReadiness || {};
  const assetCounts = bundle.assetCountsByCategory || {};
  const documentCounts = bundle.documentCountsByCategory || {};
  const properties = bundle.properties || [];
  const propertyMortgageLinks = bundle.propertyMortgageLinks || [];
  const propertyHomeownersLinks = bundle.propertyHomeownersLinks || [];
  const propertyStackAnalytics = bundle.propertyStackAnalytics || [];
  const missingStatementPolicies = savedPolicyRows.filter((policy) => !policy.latest_statement_date);
  const weakCoiPolicies = savedPolicyRows.filter((policy) => policy.coi_confidence === "weak");
  const limitedComparisonPolicies = savedPolicyRows.filter(
    (policy) =>
      policy.coi_confidence === "weak" ||
      policy.strategy_visibility_status === "weak" ||
      policy.data_completeness_status === "basic"
  );

  const propertyIdsWithMortgage = new Set(propertyMortgageLinks.map((link) => link.property_id).filter(Boolean));
  const propertyIdsWithHomeowners = new Set(propertyHomeownersLinks.map((link) => link.property_id).filter(Boolean));
  const mortgagedPropertiesWithoutHomeowners = properties.filter(
    (property) => propertyIdsWithMortgage.has(property.id) && !propertyIdsWithHomeowners.has(property.id)
  );
  const highValueSparseContinuity = propertyStackAnalytics.filter(
    (item) =>
      item.metadata?.valuation_available &&
      (item.continuity_status === "weak" || item.metadata?.valuation_confidence_label === "weak")
  );

  const flags = [];

  if (mortgagedPropertiesWithoutHomeowners.length > 0) {
    flags.push(
      buildDependencyFlag({
        key: "unprotected_real_estate_exposure",
        severity: "high",
        title: "Unprotected Real Estate Exposure",
        explanation: "A financed property does not yet show linked homeowners protection.",
        supportingEvidence: [
          `${mortgagedPropertiesWithoutHomeowners.length} mortgaged ${mortgagedPropertiesWithoutHomeowners.length === 1 ? "property is" : "properties are"} missing linked homeowners coverage.`,
          mortgagedPropertiesWithoutHomeowners[0]?.property_name || mortgagedPropertiesWithoutHomeowners[0]?.address_line_1 || "Property linkage needs review.",
        ],
        suggestedSmartActionKeys: ["open_property_hub", "open_homeowners_hub"],
        route: mortgagedPropertiesWithoutHomeowners[0]?.id ? `/property/detail/${mortgagedPropertiesWithoutHomeowners[0].id}` : "/property",
        actionLabel: "Open property protection review",
        priorityScore: 92,
      })
    );
  }

  if ((propertySummary.propertiesMissingProtectionButWithValue || []).length > 0) {
    flags.push(
      buildDependencyFlag({
        key: "debt_without_protection_visibility",
        severity: "high",
        title: "Debt Without Protection Visibility",
        explanation: "Property value visibility is present, but homeowners protection is still not linked.",
        supportingEvidence: [
          `${propertySummary.propertiesMissingProtectionButWithValue.length} valued ${propertySummary.propertiesMissingProtectionButWithValue.length === 1 ? "property stack still lacks" : "property stacks still lack"} homeowners linkage.`,
          "Value review is stronger than protection linkage in these records.",
        ],
        suggestedSmartActionKeys: ["open_property_hub", "open_homeowners_hub"],
        route: "/property",
        actionLabel: "Open property stacks",
        priorityScore: 88,
      })
    );
  }

  if ((propertySummary.mortgagesWithoutLinkedProperties || []).length > 0) {
    flags.push(
      buildDependencyFlag({
        key: "incomplete_household_dependency_map",
        severity: "moderate",
        title: "Mortgage Records Need Property Linkage",
        explanation: "Debt records exist without a linked property record, which weakens household dependency mapping.",
        supportingEvidence: [
          `${propertySummary.mortgagesWithoutLinkedProperties.length} mortgage ${propertySummary.mortgagesWithoutLinkedProperties.length === 1 ? "record is" : "records are"} missing property linkage.`,
        ],
        suggestedSmartActionKeys: ["open_mortgage_hub", "open_property_hub"],
        route: "/mortgage",
        actionLabel: "Open mortgage review",
        priorityScore: 76,
      })
    );
  }

  if ((propertySummary.multipleMortgageLinkReview || []).length > 0) {
    flags.push(
      buildDependencyFlag({
        key: "multiple_mortgages_without_clear_primary",
        severity: "moderate",
        title: "Multiple Mortgage Links Need Clarification",
        explanation: "A property stack shows multiple mortgage linkage and still needs a cleaner financing read.",
        supportingEvidence: [
          `${propertySummary.multipleMortgageLinkReview.length} property ${propertySummary.multipleMortgageLinkReview.length === 1 ? "stack shows" : "stacks show"} multiple mortgage linkage flags.`,
        ],
        suggestedSmartActionKeys: ["open_property_hub", "open_mortgage_hub"],
        route: "/property",
        actionLabel: "Open financing review",
        priorityScore: 71,
      })
    );
  }

  if ((propertySummary.completePropertyStacksNeedingReview || []).length > 0 && ((portalReadiness.linkedPortalCount || 0) === 0 || (portalReadiness.missingRecoveryCount || 0) > 0)) {
    flags.push(
      buildDependencyFlag({
        key: "complete_property_stack_with_weak_access_continuity",
        severity: "moderate",
        title: "Property Coverage Is Stronger Than Access Continuity",
        explanation: "A property stack is otherwise complete, but portal and recovery continuity remain weak.",
        supportingEvidence: [
          `${propertySummary.completePropertyStacksNeedingReview.length} complete property ${propertySummary.completePropertyStacksNeedingReview.length === 1 ? "stack still shows" : "stacks still show"} continuity review pressure.`,
          `${portalReadiness.missingRecoveryCount || 0} portal ${portalReadiness.missingRecoveryCount === 1 ? "record still needs" : "records still need"} recovery support.`,
        ],
        suggestedSmartActionKeys: ["open_property_hub", "open_portals_hub"],
        route: "/portals",
        actionLabel: "Open access continuity review",
        priorityScore: 73,
      })
    );
  }

  if (highValueSparseContinuity.length > 0) {
    flags.push(
      buildDependencyFlag({
        key: "high_value_assets_with_sparse_continuity",
        severity: "high",
        title: "High-Value Property Visibility With Sparse Continuity",
        explanation: "Property value visibility exists, but continuity support is still thin for one or more higher-value property stacks.",
        supportingEvidence: [
          `${highValueSparseContinuity.length} valued property ${highValueSparseContinuity.length === 1 ? "stack is" : "stacks are"} still weak on continuity support.`,
        ],
        suggestedSmartActionKeys: ["open_property_hub", "open_reports_hub"],
        route: "/property",
        actionLabel: "Open property continuity review",
        priorityScore: 84,
      })
    );
  }

  if (savedPolicyRows.length > 0 && (!assetCounts.estate || (!documentCounts.estate && !assetCounts.estate))) {
    flags.push(
      buildDependencyFlag({
        key: "insurance_without_estate_support",
        severity: "moderate",
        title: "Insurance Layer Exists Without Estate Support",
        explanation: "Insurance intelligence is present, but estate continuity support remains sparse or absent.",
        supportingEvidence: [
          `${savedPolicyRows.length} saved ${savedPolicyRows.length === 1 ? "policy is" : "policies are"} visible in insurance intelligence.`,
          assetCounts.estate ? "Estate assets exist, but estate document support is still limited." : "No estate module records are clearly visible.",
        ],
        suggestedSmartActionKeys: ["open_insurance_hub", "open_estate_hub"],
        route: "/estate",
        actionLabel: "Open estate continuity review",
        priorityScore: 78,
      })
    );
  }

  if (missingStatementPolicies.length > 0) {
    flags.push(
      buildDependencyFlag({
        key: "weak_insurance_statement_support",
        severity: "moderate",
        title: "Insurance Statement Support Is Weak",
        explanation: "Policies exist, but missing statement recency weakens household continuity confidence.",
        supportingEvidence: [
          `${missingStatementPolicies.length} ${missingStatementPolicies.length === 1 ? "policy is" : "policies are"} missing the latest statement date.`,
        ],
        suggestedSmartActionKeys: ["open_insurance_hub", "open_reports_hub"],
        route: "/insurance",
        actionLabel: "Open insurance intelligence",
        priorityScore: 80,
      })
    );
  }

  if (weakCoiPolicies.length > 0) {
    flags.push(
      buildDependencyFlag({
        key: "weak_insurance_charge_visibility",
        severity: "moderate",
        title: "Weak Insurance Charge Visibility",
        explanation: "Policies with weak COI visibility reduce household planning confidence.",
        supportingEvidence: [
          `${weakCoiPolicies.length} ${weakCoiPolicies.length === 1 ? "policy has" : "policies have"} weak COI confidence.`,
        ],
        suggestedSmartActionKeys: ["open_insurance_hub", "open_reports_hub"],
        route: "/insurance",
        actionLabel: "Open policy charge review",
        priorityScore: 74,
      })
    );
  }

  if (savedPolicyRows.length > 1 && limitedComparisonPolicies.length > 0) {
    flags.push(
      buildDependencyFlag({
        key: "multiple_policies_with_limited_comparison_visibility",
        severity: "moderate",
        title: "Multiple Policies Need Stronger Comparison Support",
        explanation: "Multiple policies are present, but comparison strength is limited by weak visibility in some files.",
        supportingEvidence: [
          `${savedPolicyRows.length} policies are in scope, and ${limitedComparisonPolicies.length} still show weak comparison support.`,
        ],
        suggestedSmartActionKeys: ["open_insurance_hub", "open_reports_hub"],
        route: "/insurance",
        actionLabel: "Open portfolio comparison",
        priorityScore: 69,
      })
    );
  }

  if ((portalReadiness.criticalAssetsWithoutLinkedPortals || []).length > 0) {
    flags.push(
      buildDependencyFlag({
        key: "weak_access_continuity",
        severity: "high",
        title: "Critical Assets Lack Access Continuity",
        explanation: "Critical assets do not yet have clear portal or recovery continuity support.",
        supportingEvidence: [
          `${portalReadiness.criticalAssetsWithoutLinkedPortals.length} critical ${portalReadiness.criticalAssetsWithoutLinkedPortals.length === 1 ? "asset is" : "assets are"} missing linked portal continuity.`,
        ],
        suggestedSmartActionKeys: ["open_portals_hub", "open_reports_hub"],
        route: "/portals",
        actionLabel: "Open portal continuity",
        priorityScore: 90,
      })
    );
  }

  if (savedPolicyRows.length > 0 && (portalReadiness.linkedPortalCount || 0) === 0) {
    flags.push(
      buildDependencyFlag({
        key: "insurance_without_access_continuity",
        severity: "moderate",
        title: "Insurance Records Lack Access Continuity",
        explanation: "Insurance records exist, but no portal or recovery visibility is connected yet.",
        supportingEvidence: [
          `${savedPolicyRows.length} saved ${savedPolicyRows.length === 1 ? "policy is" : "policies are"} visible with no linked portal continuity coverage.`,
        ],
        suggestedSmartActionKeys: ["open_insurance_hub", "open_portals_hub"],
        route: "/portals",
        actionLabel: "Open access continuity",
        priorityScore: 72,
      })
    );
  }

  const alignmentPenalty = flags.reduce(
    (sum, flag) => sum + (flag.severity === "high" ? 12 : flag.severity === "moderate" ? 7 : 4),
    0
  );
  const alignmentScore = Math.max(0, 100 - alignmentPenalty);
  const alignmentStrength = {
    score: alignmentScore,
    status: toStatus(alignmentScore),
    summary:
      flags.length === 0
        ? "Cross-asset dependency alignment is currently reading cleanly across the visible household record."
        : "Cross-asset dependency alignment is being weakened by visible linkage, protection, estate, or access gaps.",
  };

  const priorityIssues = flags
    .map((flag) => ({
      id: `dependency-${flag.key}`,
      label: flag.title,
      priority_score: flag.priority_score,
      route: flag.route,
      action_label: flag.action_label,
      data_updated_at: null,
      change_signal: flag.supporting_evidence[0] || null,
      summary: flag.explanation,
      severity: flag.severity,
      smart_action_keys: flag.suggested_smart_action_keys,
    }))
    .sort((left, right) => right.priority_score - left.priority_score);

  const actionCandidates = flags.flatMap((flag) =>
    (flag.suggested_smart_action_keys || []).map((actionKey, index) => ({
      id: `${flag.key}-${actionKey}-${index}`,
      action_key: actionKey,
      route: flag.route,
      label: flag.action_label,
      source_flag: flag.key,
    }))
  );

  const evidenceByFlag = Object.fromEntries(
    flags.map((flag) => [flag.key, flag.supporting_evidence || []])
  );

  return {
    dependency_flags: flags,
    continuity_risks: flags.slice(0, 5).map((flag) => flag.explanation),
    alignment_strength: alignmentStrength,
    priority_issues: priorityIssues,
    action_candidates: actionCandidates,
    evidence_by_flag: evidenceByFlag,
  };
}

export function buildHouseholdRiskContinuityMap(bundle = {}, intelligence = null, savedPolicyRows = []) {
  const blankHousehold = getHouseholdBlankState(bundle, savedPolicyRows);

  if (blankHousehold.isBlank) {
    return {
      overall_score: null,
      overall_status: "Starter",
      bottom_line:
        "This household is still in onboarding. Add contacts, documents, assets, or policies before VaultedShield starts a live continuity review.",
      focus_areas: [
        {
          key: "household_onboarding",
          title: "Household Onboarding",
          score: null,
          status: "Starter",
          route: "/guidance",
          action_label: "Open guidance",
          summary: "No persisted household continuity evidence is visible yet, so the app is holding a neutral onboarding posture.",
          metrics: [
            { label: "Assets", value: 0 },
            { label: "Policies", value: 0 },
            { label: "Documents", value: 0 },
          ],
        },
      ],
      review_priorities: [],
      strength_signals: [],
      visibility_gaps: [],
      dependency_signals: {
        dependency_flags: [],
        continuity_risks: [],
        alignment_strength: {
          score: null,
          status: "Starter",
          summary: "Cross-asset dependency review has not started because the household record is still blank.",
        },
        priority_issues: [],
        action_candidates: [],
        evidence_by_flag: {},
      },
      cross_asset_summary: {
        insurance_visible: 0,
        property_visible: 0,
        retirement_visible: 0,
        estate_visible: 0,
        portals_visible: 0,
      },
      debug: {
        onboardingBlankState: true,
        blankHouseholdReasons: blankHousehold.reasons,
        setupCounts: blankHousehold.setupCounts,
      },
    };
  }

  const documentScore = toPercent(intelligence?.document_completeness?.score_value);
  const portalScore = toPercent(intelligence?.portal_continuity?.score_value);
  const emergencyScore = toPercent(intelligence?.emergency_readiness?.score_value);
  const propertySummary = bundle.propertyStackSummary || {};
  const assets = bundle.assets || [];
  const documents = bundle.documents || [];
  const openAlerts = bundle.openAlerts || [];
  const openTasks = bundle.openTasks || [];
  const keyAssets = bundle.keyAssets || [];
  const emergencyContacts = bundle.emergencyContacts || [];
  const professionalContacts = bundle.keyProfessionalContacts || [];
  const assetCounts = bundle.assetCountsByCategory || {};
  const dependencySignals = buildCrossAssetDependencySignals(bundle, savedPolicyRows, intelligence);

  const policyScores = savedPolicyRows
    .map((policy) => toPercent(policy.continuity_score ?? policy.ranking_score ?? policy.policy_health_score))
    .filter((value) => value !== null);
  const insuranceScore = policyScores.length
    ? Math.round(policyScores.reduce((sum, value) => sum + value, 0) / policyScores.length)
    : 0;
  const weakPolicyCount = savedPolicyRows.filter(
    (policy) => toPercent(policy.continuity_score ?? policy.ranking_score ?? policy.policy_health_score) < 65
  ).length;
  const missingStatementCount = savedPolicyRows.filter((policy) => !policy.latest_statement_date).length;
  const propertyContinuitySignals = [
    propertySummary.propertiesMissingMortgageLink?.length || 0,
    propertySummary.propertiesMissingHomeownersLink?.length || 0,
    propertySummary.incompletePropertyStacks?.length || 0,
    propertySummary.weakContinuityPropertyStacks?.length || 0,
  ].reduce((sum, value) => sum + value, 0);
  const propertySupportScore = Math.max(
    0,
    100 -
      propertyContinuitySignals * 10 -
      ((propertySummary.propertiesMissingValueReview?.length || 0) * 6) -
      ((propertySummary.weakValuationConfidenceProperties?.length || 0) * 6)
  );
  const documentationScore = Math.round((documentScore * 0.65) + (Math.min(documents.length, 12) / 12) * 35);
  const continuityOperationsScore = Math.max(
    0,
    Math.round((portalScore * 0.45) + (emergencyScore * 0.4) + (openAlerts.length === 0 ? 15 : 5) + (openTasks.length <= 3 ? 10 : 3))
  );

  const focusAreas = [
    {
      key: "cross_asset_alignment",
      title: "Cross-Asset Alignment",
      score: dependencySignals.alignment_strength.score,
      status: dependencySignals.alignment_strength.status,
      route: "/reports",
      action_label: "Open household report",
      summary: dependencySignals.alignment_strength.summary,
      metrics: [
        { label: "Flags", value: dependencySignals.dependency_flags.length },
        { label: "High severity", value: dependencySignals.dependency_flags.filter((flag) => flag.severity === "high").length },
        { label: "Priority issues", value: dependencySignals.priority_issues.length },
      ],
    },
    {
      key: "insurance_review_strength",
      title: "Insurance Review Strength",
      score: insuranceScore,
      status: toStatus(insuranceScore),
      route: "/insurance",
      action_label: "Open insurance intelligence",
      summary:
        savedPolicyRows.length > 0
          ? weakPolicyCount > 0
            ? `${weakPolicyCount} saved ${weakPolicyCount === 1 ? "policy needs" : "policies need"} deeper continuity review.`
            : "Visible policies currently show usable continuity support."
          : "No saved policy comparison set is visible yet.",
      metrics: [
        { label: "Policies", value: savedPolicyRows.length },
        { label: "Weak continuity", value: weakPolicyCount },
        { label: "Missing statements", value: missingStatementCount },
      ],
    },
    {
      key: "property_debt_linkage",
      title: "Property and Debt Linkage",
      score: propertySupportScore,
      status: toStatus(propertySupportScore),
      route: "/property",
      action_label: "Open property review",
      summary:
        (propertySummary.propertyCount || 0) > 0
          ? propertyContinuitySignals > 0
            ? "Property ownership, financing, and protection linkage still have visible gaps."
            : "Property, financing, and protection linkage currently reads as connected."
          : "No property stack is visible yet.",
      metrics: [
        { label: "Properties", value: propertySummary.propertyCount || 0 },
        { label: "Missing mortgage links", value: propertySummary.propertiesMissingMortgageLink?.length || 0 },
        { label: "Missing homeowners links", value: propertySummary.propertiesMissingHomeownersLink?.length || 0 },
      ],
    },
    {
      key: "document_readiness",
      title: "Document Readiness",
      score: documentationScore,
      status: toStatus(documentationScore),
      route: "/vault",
      action_label: "Open vault",
      summary:
        documents.length >= 5
          ? "Vault documentation is broad enough to support review, but depth still varies by module."
          : "Document support is still thin relative to the household record set.",
      metrics: [
        { label: "Documents", value: documents.length },
        { label: "Assets", value: assets.length },
        { label: "Key assets", value: keyAssets.length },
      ],
    },
    {
      key: "continuity_operations",
      title: "Continuity Operations",
      score: continuityOperationsScore,
      status: toStatus(continuityOperationsScore),
      route: "/portals",
      action_label: "Open continuity tools",
      summary:
        emergencyContacts.length > 0 || professionalContacts.length > 0
          ? "Emergency contacts, portal recovery, and open workflow load are shaping household continuity readiness."
          : "Household continuity operations remain light because emergency contacts and access coverage are sparse.",
      metrics: [
        { label: "Emergency contacts", value: emergencyContacts.length },
        { label: "Professional contacts", value: professionalContacts.length },
        { label: "Open alerts", value: openAlerts.length },
      ],
    },
  ];

  const reviewPriorities = [
    ...(dependencySignals.priority_issues || []),
    ...(savedPolicyRows || []).map(buildPolicyReviewPriority),
    ...(propertySummary.propertiesMissingHomeownersLink || []).map((property) => ({
      id: `property-homeowners-${property.id || property.property_name || property.address_line_1 || Math.random()}`,
      label: property.property_name || property.address_line_1 || "Property record",
      priority_score: 72,
      route: property.id ? `/property/detail/${property.id}` : "/property",
      action_label: "Open property",
      data_updated_at: property.updated_at || property.created_at || null,
      change_signal: "Protection linkage is still incomplete for this property stack.",
      summary: `${property.property_name || property.address_line_1 || "Property record"} still needs linked homeowners protection.`,
    })),
    ...(propertySummary.propertiesMissingMortgageLink || []).map((property) => ({
      id: `property-mortgage-${property.id || property.property_name || property.address_line_1 || Math.random()}`,
      label: property.property_name || property.address_line_1 || "Property record",
      priority_score: 68,
      route: property.id ? `/property/detail/${property.id}` : "/property",
      action_label: "Open property",
      data_updated_at: property.updated_at || property.created_at || null,
      change_signal: "Financing linkage still needs confirmation for this property stack.",
      summary: `${property.property_name || property.address_line_1 || "Property record"} still needs financing linkage or confirmation.`,
    })),
    ...((intelligence?.missing_item_prompts || []).slice(0, 4).map((prompt, index) => ({
      id: `prompt-${index}`,
      label: "Household continuity",
      priority_score: 60 - index,
      route:
        prompt.includes("portal") || prompt.includes("access")
          ? "/portals"
          : prompt.includes("Estate") || prompt.includes("estate")
            ? "/estate"
            : prompt.includes("Retirement") || prompt.includes("retirement")
              ? "/retirement"
              : prompt.includes("property") || prompt.includes("Property")
                ? "/property"
                : prompt.includes("Insurance") || prompt.includes("insurance")
                  ? "/insurance"
                  : "/dashboard",
      action_label: "Open review path",
      data_updated_at: null,
      change_signal: null,
      summary: prompt,
    }))),
  ]
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 6);

  const strengthSignals = [];
  if (policyScores.length > 0 && weakPolicyCount === 0) {
    strengthSignals.push("Saved policy intelligence is currently well supported.");
  }
  if ((propertySummary.highQualityPropertyReviewAvailable || []).length > 0) {
    strengthSignals.push("At least one property stack shows strong value, debt, and protection linkage.");
  }
  if (portalScore >= 60) {
    strengthSignals.push("Portal continuity coverage is usable across visible household records.");
  }
  if (documentScore >= 60) {
    strengthSignals.push("Document readiness is strong enough to support multi-module review.");
  }
  if (dependencySignals.dependency_flags.length === 0) {
    strengthSignals.push("Cross-asset dependency alignment is currently reading cleanly.");
  }

  const visibilityGaps = [];
  dependencySignals.dependency_flags.slice(0, 2).forEach((flag) => {
    visibilityGaps.push(flag.explanation);
  });
  if (missingStatementCount > 0) {
    visibilityGaps.push(`${missingStatementCount} ${missingStatementCount === 1 ? "policy is" : "policies are"} missing the latest statement date.`);
  }
  if ((propertySummary.propertiesMissingValueReview || []).length > 0) {
    visibilityGaps.push(`${propertySummary.propertiesMissingValueReview.length} ${propertySummary.propertiesMissingValueReview.length === 1 ? "property stack is" : "property stacks are"} still missing value review support.`);
  }
  if ((bundle.portalReadiness?.missingRecoveryCount || 0) > 0) {
    visibilityGaps.push(`${bundle.portalReadiness.missingRecoveryCount} visible portals still need recovery support.`);
  }
  if (professionalContacts.length === 0) {
    visibilityGaps.push("Professional continuity contacts are still missing.");
  }

  const averageScore = focusAreas.length
    ? Math.round(focusAreas.reduce((sum, item) => sum + item.score, 0) / focusAreas.length)
    : 0;
  const overallStatus = toStatus(averageScore);
  const bottomLine =
    overallStatus === "Strong"
      ? "Household continuity is broadly supported across protection, documentation, and access, with only a small number of review items still open."
      : overallStatus === "Moderate"
        ? "The household has a usable continuity foundation, but a few visible gaps are still limiting clean review strength across insurance, property, or access."
        : overallStatus === "Weak"
          ? "Household continuity is partially built, but several support gaps are still weakening review confidence and operational readiness."
          : "Key household continuity layers remain thin, and several linked records still need stronger support before the system is fully dependable.";

  return {
    overall_score: averageScore,
    overall_status: overallStatus,
    bottom_line: bottomLine,
    focus_areas: focusAreas,
    review_priorities: reviewPriorities,
    strength_signals: strengthSignals.slice(0, 4),
    visibility_gaps: visibilityGaps.slice(0, 4),
    dependency_signals: dependencySignals,
    cross_asset_summary: {
      insurance_visible: assetCounts.insurance || 0,
      property_visible: propertySummary.propertyCount || 0,
      retirement_visible: assetCounts.retirement || 0,
      estate_visible: assetCounts.estate || 0,
      portals_visible: bundle.portalReadiness?.portalCount || 0,
    },
    debug: {
      document_score: documentScore,
      portal_score: portalScore,
      emergency_score: emergencyScore,
      insurance_score: insuranceScore,
      property_support_score: propertySupportScore,
      continuity_operations_score: continuityOperationsScore,
      policy_scores: policyScores,
      property_continuity_signals: propertyContinuitySignals,
      dependency_flags: dependencySignals.dependency_flags,
      dependency_priority_order: dependencySignals.priority_issues,
      dependency_actions: dependencySignals.action_candidates,
      dependency_alignment_strength: dependencySignals.alignment_strength,
    },
  };
}

export function buildHouseholdReviewReport({
  bundle = {},
  intelligence = null,
  householdMap = null,
  queueItems = [],
  reviewDigest = null,
} = {}) {
  const safeMap = householdMap || buildHouseholdRiskContinuityMap(bundle, intelligence, []);
  const safeDigest = reviewDigest || {
    summary: "No saved household review snapshot is available yet.",
    reopened_count: 0,
    improved_count: 0,
    active_count: queueItems.filter((item) => item.workflow_status !== "reviewed").length,
    bullets: [],
  };

  const householdName = bundle?.household?.household_name || "Household Review";
  const keyFacts = [
    { label: "Household", value: householdName },
    { label: "Readiness Score", value: safeMap.overall_score ?? "—" },
    { label: "Status", value: safeMap.overall_status || "—" },
    { label: "Assets", value: (bundle.assets || []).length },
    { label: "Documents", value: (bundle.documents || []).length },
    { label: "Open Alerts", value: (bundle.openAlerts || []).length },
  ];

  const focusAreaRows = (safeMap.focus_areas || []).map((area) => ({
    area: area.title,
    score: area.score,
    status: area.status,
    summary: area.summary,
  }));

  const queueRows = (queueItems || []).slice(0, 8).map((item) => ({
    item: item.label,
    status: item.workflow_label || "Open",
    changed: item.changed_since_review ? "Yes" : "No",
    summary: item.summary,
  }));

  return {
    title: `${householdName} Household Review Brief`,
    subtitle: "Cross-asset continuity, review workflow, and recent change summary.",
    sections: [
      {
        id: "snapshot",
        title: "Household Snapshot",
        summary: safeMap.bottom_line,
        items: keyFacts,
        columns: 3,
      },
      {
        id: "digest",
        title: "Review Digest",
        summary: safeDigest.summary,
        kind: "bullets",
        bullets:
          safeDigest.bullets?.length > 0
            ? safeDigest.bullets
            : ["Save a household review snapshot to begin tracking changes over time."],
      },
      {
        id: "focus_areas",
        title: "Focus Areas",
        summary: "The strongest current household review themes across protection, property, documentation, and continuity operations.",
        kind: "table",
        columns: [
          { key: "area", label: "Area" },
          { key: "score", label: "Score" },
          { key: "status", label: "Status" },
          { key: "summary", label: "Summary" },
        ],
        rows: focusAreaRows,
        empty_message: "No focus areas are currently available.",
      },
      {
        id: "priority_queue",
        title: "Priority Review Queue",
        summary: "Highest-value active household review items.",
        kind: "table",
        columns: [
          { key: "item", label: "Item" },
          { key: "status", label: "Workflow Status" },
          { key: "changed", label: "Changed" },
          { key: "summary", label: "Summary" },
        ],
        rows: queueRows,
        empty_message: "No household review items are currently active.",
      },
      {
        id: "cross_asset_dependency",
        title: "Cross-Asset Dependency Review",
        summary: safeMap.dependency_signals?.alignment_strength?.summary || "Cross-asset dependency review is limited.",
        kind: "table",
        columns: [
          { key: "title", label: "Flag" },
          { key: "severity", label: "Severity" },
          { key: "explanation", label: "Explanation" },
        ],
        rows: (safeMap.dependency_signals?.dependency_flags || []).slice(0, 6).map((flag) => ({
          title: flag.title,
          severity: flag.severity,
          explanation: flag.explanation,
        })),
        empty_message: "No cross-asset dependency flags are currently standing out.",
      },
      {
        id: "strengths",
        title: "Strength Signals",
        summary: "Current areas where the visible household record is already supporting stronger continuity review.",
        kind: "bullets",
        bullets:
          safeMap.strength_signals?.length > 0
            ? safeMap.strength_signals
            : ["Household strengths will become clearer as more linked records and review support are added."],
      },
      {
        id: "gaps",
        title: "Visibility Gaps",
        summary: "The most important areas where continuity confidence is still being limited by missing or weak support.",
        kind: "bullets",
        bullets:
          safeMap.visibility_gaps?.length > 0
            ? safeMap.visibility_gaps
            : ["No major visibility gaps are currently standing out across the visible household records."],
      },
    ],
  };
}

function summarizeHouseholdEvidencePoint(label, value) {
  return `${label}: ${value || "—"}`;
}

function buildHouseholdAssistantFollowups(intent) {
  const map = {
    priority_review: [
      "What changed since last review?",
      "Which item is most urgent?",
      "Show pending documents",
      "What is limiting continuity most?",
    ],
    change_review: [
      "What reopened since review?",
      "Which items improved?",
      "Show active review queue",
      "What should I review first?",
    ],
    continuity_status: [
      "Why is household readiness rated this way?",
      "What is limiting continuity most?",
      "Show visibility gaps",
      "What should I review first?",
    ],
    document_readiness: [
      "What documents are missing?",
      "What is limiting continuity most?",
      "Show active review queue",
      "What changed since last review?",
    ],
    portal_readiness: [
      "What is limiting continuity most?",
      "Show active review queue",
      "What changed since last review?",
      "What should I review first?",
    ],
    insurance_strength: [
      "Which policy needs review most?",
      "What changed since last review?",
      "What is limiting continuity most?",
      "Show active review queue",
    ],
    dependency_alignment: [
      "What parts of my household are under-supported?",
      "What should I look at first?",
      "What changed since last review?",
      "Are portal and access records in good shape?",
    ],
    general_summary: [
      "What should I review first?",
      "What changed since last review?",
      "Why is household readiness rated this way?",
      "What is limiting continuity most?",
    ],
  };

  return (map[intent] || map.general_summary).map((label, index) => ({
    id: `${intent}-${index}`,
    label,
  }));
}

function buildHouseholdAssistantActions(intent, { queueItems = [], householdMap = null } = {}) {
  const topQueueItem = (queueItems || []).find(
    (item) => item.workflow_status !== "reviewed" || item.changed_since_review
  );
  const actions = [];

  if (intent === "priority_review") {
    if (topQueueItem?.route) {
      actions.push({
        id: "open-top-review",
        label: topQueueItem.action_label || "Open top review item",
        route: topQueueItem.route,
      });
    }
    actions.push({ id: "open-dashboard-queue", label: "Review household queue", route: "/dashboard" });
  } else if (intent === "change_review") {
    actions.push({ id: "open-dashboard-digest", label: "Review change digest", route: "/dashboard" });
    if (topQueueItem?.route) {
      actions.push({
        id: "open-reopened-item",
        label: "Open changed item",
        route: topQueueItem.route,
      });
    }
  } else if (intent === "document_readiness") {
    actions.push({ id: "open-vault", label: "Open vault", route: "/vault" });
    actions.push({ id: "open-upload", label: "Upload documents", route: "/upload-center" });
  } else if (intent === "portal_readiness") {
    actions.push({ id: "open-portals", label: "Open portals", route: "/portals" });
    actions.push({ id: "open-contacts", label: "Open contacts", route: "/contacts" });
  } else if (intent === "insurance_strength") {
    actions.push({ id: "open-insurance", label: "Open insurance intelligence", route: "/insurance" });
    if (topQueueItem?.route && String(topQueueItem.route).startsWith("/insurance/")) {
      actions.push({ id: "open-policy-review", label: "Open policy review", route: topQueueItem.route });
    }
  } else if (intent === "dependency_alignment") {
    const topDependency = householdMap?.dependency_signals?.priority_issues?.[0];
    actions.push({ id: "open-household-report", label: "Open household report", route: "/reports" });
    if (topDependency?.route) {
      actions.push({
        id: "open-top-dependency",
        label: topDependency.action_label || "Open dependency review",
        route: topDependency.route,
        action_key: topDependency.smart_action_keys?.[0] || null,
      });
    }
  } else if (intent === "continuity_status") {
    const topArea = householdMap?.focus_areas?.[0];
    if (topArea?.route) {
      actions.push({
        id: "open-top-focus-area",
        label: topArea.action_label || "Open top focus area",
        route: topArea.route,
      });
    }
    actions.push({ id: "open-household-report", label: "Open dashboard report", route: "/dashboard" });
  } else {
    actions.push({ id: "open-dashboard", label: "Open dashboard", route: "/dashboard" });
    if (topQueueItem?.route) {
      actions.push({
        id: "open-top-review-item",
        label: topQueueItem.action_label || "Open review item",
        route: topQueueItem.route,
      });
    }
  }

  const unique = [];
  const seen = new Set();
  actions.forEach((action) => {
    const key = `${action.label}|${action.route}`;
    if (!action.route || seen.has(key)) return;
    seen.add(key);
    unique.push(action);
  });

  return unique.slice(0, 3);
}

export function classifyHouseholdQuestion(questionText = "") {
  const text = String(questionText || "").toLowerCase();

  if (/(what should i review first|review first|most urgent|priority)/.test(text)) {
    return { intent: "priority_review", confidence: "strong", keywords: ["priority"] };
  }
  if (/(changed since last review|what changed|reopened|improved)/.test(text)) {
    return { intent: "change_review", confidence: "strong", keywords: ["changed"] };
  }
  if (/(continuity|readiness|how strong|how stable|rated this way|why.*readiness)/.test(text)) {
    return { intent: "continuity_status", confidence: "moderate", keywords: ["continuity"] };
  }
  if (/(document|vault|missing document)/.test(text)) {
    return { intent: "document_readiness", confidence: "moderate", keywords: ["document"] };
  }
  if (/(portal|access|recovery|emergency access)/.test(text)) {
    return { intent: "portal_readiness", confidence: "moderate", keywords: ["portal"] };
  }
  if (/(insurance|policy|coi)/.test(text)) {
    return { intent: "insurance_strength", confidence: "moderate", keywords: ["insurance"] };
  }
  if (/(aligned|alignment|under-supported|dependency|biggest continuity gaps|biggest gaps|household gaps|asset.*protection)/.test(text)) {
    return { intent: "dependency_alignment", confidence: "strong", keywords: ["alignment"] };
  }

  return { intent: "general_summary", confidence: "limited", keywords: [] };
}

export function answerHouseholdQuestion({
  questionText = "",
  householdMap = null,
  reviewDigest = null,
  queueItems = [],
  intelligence = null,
  bundle = {},
} = {}) {
  const classification = classifyHouseholdQuestion(questionText);
  const safeMap = householdMap || buildHouseholdRiskContinuityMap(bundle, intelligence, []);
  const safeDigest = reviewDigest || {
    summary: "No saved review digest is available yet.",
    reopened_count: 0,
    improved_count: 0,
    active_count: queueItems.filter((item) => item.workflow_status !== "reviewed").length,
  };
  const activeQueue = (queueItems || []).filter(
    (item) => item.workflow_status !== "reviewed" || item.changed_since_review
  );
  const dependencySignals = safeMap.dependency_signals || buildCrossAssetDependencySignals(bundle, [], intelligence);

  let answerText = safeMap.bottom_line;
  let evidencePoints = [
    summarizeHouseholdEvidencePoint("Readiness", `${safeMap.overall_score || 0} (${safeMap.overall_status || "—"})`),
    summarizeHouseholdEvidencePoint("Active queue", activeQueue.length),
  ];
  let confidenceLabel = "moderate";

  switch (classification.intent) {
    case "priority_review": {
      const firstItem = activeQueue[0];
      answerText = firstItem
        ? `${firstItem.label} is the strongest first review target right now because it is still active in the queue and directly limits cleaner household continuity.`
        : "The household does not currently show an active priority queue item that clearly outranks the rest.";
      evidencePoints = [
        summarizeHouseholdEvidencePoint("Top queue item", firstItem?.label || "None"),
        summarizeHouseholdEvidencePoint("Workflow status", firstItem?.workflow_label || "—"),
        summarizeHouseholdEvidencePoint("Why it matters", firstItem?.summary || "No active review reason is visible."),
      ];
      confidenceLabel = firstItem ? "strong" : "limited";
      break;
    }
    case "change_review": {
      answerText =
        safeDigest.reopened_count > 0
          ? `${safeDigest.reopened_count} review item${safeDigest.reopened_count === 1 ? " has" : "s have"} changed since the last saved snapshot and moved back into active attention.`
          : safeDigest.improved_count > 0
            ? `${safeDigest.improved_count} item${safeDigest.improved_count === 1 ? " moved" : "s moved"} into reviewed status since the last saved snapshot.`
            : "The current household view does not show a major shift since the last saved review snapshot.";
      evidencePoints = [
        summarizeHouseholdEvidencePoint("Reopened", safeDigest.reopened_count),
        summarizeHouseholdEvidencePoint("Improved", safeDigest.improved_count),
        summarizeHouseholdEvidencePoint("Active", safeDigest.active_count),
        safeDigest.bullets?.[0] || null,
      ].filter(Boolean);
      confidenceLabel = "strong";
      break;
    }
    case "continuity_status": {
      answerText =
        safeMap.overall_status === "Strong"
          ? "Household continuity is reading as strong because the visible protection, document, and access layers are supporting each other reasonably well."
          : safeMap.overall_status === "Moderate"
            ? "Household continuity is usable but not fully settled because a few visible gaps are still weakening cleaner review strength."
            : safeMap.overall_status === "Weak"
              ? "Household continuity is only partially supported right now because several visible gaps are still reducing confidence."
              : "Household continuity is at risk because multiple support layers remain too thin to treat the full record as dependable.";
      evidencePoints = [
        summarizeHouseholdEvidencePoint("Readiness", `${safeMap.overall_score || 0} (${safeMap.overall_status || "—"})`),
        summarizeHouseholdEvidencePoint("Top gap", safeMap.visibility_gaps?.[0] || "No major gap surfaced"),
        summarizeHouseholdEvidencePoint("Top strength", safeMap.strength_signals?.[0] || "No major strength surfaced"),
      ];
      confidenceLabel = "strong";
      break;
    }
    case "document_readiness": {
      const documentArea = safeMap.focus_areas?.find((item) => item.key === "document_readiness");
      answerText =
        documentArea?.status === "Strong"
          ? "Document readiness is in good shape overall, though depth may still vary by module."
          : "Document readiness is still limiting cleaner household review because coverage is not yet broad or even enough across the visible record.";
      evidencePoints = [
        summarizeHouseholdEvidencePoint("Document score", `${documentArea?.score || 0} (${documentArea?.status || "—"})`),
        summarizeHouseholdEvidencePoint("Documents", (bundle.documents || []).length),
        summarizeHouseholdEvidencePoint("Visibility gap", safeMap.visibility_gaps?.find((item) => item.toLowerCase().includes("document")) || safeMap.visibility_gaps?.[0] || "No document gap surfaced"),
      ];
      confidenceLabel = (bundle.documents || []).length > 0 ? "moderate" : "limited";
      break;
    }
    case "portal_readiness": {
      const portalArea = safeMap.focus_areas?.find((item) => item.key === "continuity_operations");
      answerText =
        portalArea?.status === "Strong"
          ? "Continuity operations are reading well because portal access and support contacts are visible enough to help with household recovery workflows."
          : "Portal and continuity operations still need work because access coverage, recovery support, or support contacts are not yet strong enough.";
      evidencePoints = [
        summarizeHouseholdEvidencePoint("Continuity operations", `${portalArea?.score || 0} (${portalArea?.status || "—"})`),
        summarizeHouseholdEvidencePoint("Portals", bundle.portalReadiness?.portalCount || 0),
        summarizeHouseholdEvidencePoint("Missing recovery", bundle.portalReadiness?.missingRecoveryCount || 0),
      ];
      confidenceLabel = bundle.portalReadiness?.portalCount ? "moderate" : "limited";
      break;
    }
    case "insurance_strength": {
      const insuranceArea = safeMap.focus_areas?.find((item) => item.key === "insurance_review_strength");
      const weakestPolicy = activeQueue.find((item) => String(item.route || "").startsWith("/insurance/"));
      answerText =
        insuranceArea?.status === "Strong"
          ? "Insurance review strength is holding up well overall, with most visible policy support reading as usable."
          : "Insurance review strength is still mixed because one or more policy files remain thin on statement, charge, or continuity support.";
      evidencePoints = [
        summarizeHouseholdEvidencePoint("Insurance score", `${insuranceArea?.score || 0} (${insuranceArea?.status || "—"})`),
        summarizeHouseholdEvidencePoint("Weak policy count", insuranceArea?.metrics?.find((item) => item.label === "Weak continuity")?.value ?? "—"),
        summarizeHouseholdEvidencePoint("Top policy review item", weakestPolicy?.label || "None"),
      ];
      confidenceLabel = "moderate";
      break;
    }
    case "dependency_alignment": {
      const topFlag = dependencySignals.dependency_flags?.[0] || null;
      answerText = topFlag
        ? `${topFlag.title} is the clearest household alignment gap right now. ${topFlag.explanation}`
        : "Visible household assets and continuity layers are not currently showing a major cross-asset dependency break.";
      evidencePoints = [
        summarizeHouseholdEvidencePoint("Alignment strength", `${dependencySignals.alignment_strength?.score || 0} (${dependencySignals.alignment_strength?.status || "—"})`),
        summarizeHouseholdEvidencePoint("Top flag", topFlag?.title || "None"),
        summarizeHouseholdEvidencePoint("Supporting evidence", topFlag?.supporting_evidence?.[0] || "No major dependency evidence surfaced"),
        summarizeHouseholdEvidencePoint("Priority issues", dependencySignals.priority_issues?.length || 0),
      ];
      confidenceLabel = topFlag ? "strong" : "moderate";
      break;
    }
    default: {
      answerText = `${safeMap.bottom_line} ${safeDigest.summary}`.trim();
      evidencePoints = [
        summarizeHouseholdEvidencePoint("Readiness", `${safeMap.overall_score || 0} (${safeMap.overall_status || "—"})`),
        summarizeHouseholdEvidencePoint("Active queue", activeQueue.length),
        summarizeHouseholdEvidencePoint("Reopened since review", safeDigest.reopened_count),
        summarizeHouseholdEvidencePoint("Top focus area", safeMap.focus_areas?.[0]?.title || "—"),
        summarizeHouseholdEvidencePoint("Cross-asset flags", dependencySignals.dependency_flags?.length || 0),
      ];
      confidenceLabel = "moderate";
    }
  }

  return {
    intent: classification.intent,
    answer_text: answerText,
    evidence_points: evidencePoints.filter(Boolean).slice(0, 4),
    confidence_label: confidenceLabel,
    followup_prompts: buildHouseholdAssistantFollowups(classification.intent),
    actions: buildHouseholdAssistantActions(classification.intent, {
      queueItems,
      householdMap: safeMap,
    }),
    debug: {
      classified_intent: classification.intent,
      classification_confidence: classification.confidence,
      evidence_fields_used: [
        "householdMap.overall_score",
        "householdMap.focus_areas",
        "reviewDigest",
        "queueItems",
        "bundle.portalReadiness",
        "dependencySignals",
      ],
    },
  };
}

export function buildHouseholdIntelligence(bundle = {}) {
  const intelligence = createEmptyHouseholdIntelligenceSchema();
  const assets = bundle.assets || [];
  const documents = bundle.documents || [];
  const assetCounts = countAssetsByCategory(assets);
  const documentCounts = countDocumentsByCategory(documents);
  const moduleFlags = buildModuleFlags(assetCounts);
  const documentCompleteness = buildDocumentCompleteness(bundle, assetCounts, documentCounts);
  const portalContinuity = buildPortalContinuity(bundle);
  const emergencyReadiness = buildEmergencyReadiness(bundle, portalContinuity);
  const promptData = buildPrompts(
    bundle,
    assetCounts,
    documentCounts,
    portalContinuity,
    moduleFlags,
    documentCompleteness
  );

  intelligence.summary = {
    household_name: bundle.household?.household_name || null,
    asset_count: assets.length,
    document_count: documents.length,
    portal_count: bundle.portalReadiness?.portalCount || 0,
    open_alert_count: (bundle.openAlerts || []).length,
    open_task_count: (bundle.openTasks || []).length,
    intelligence_generated_at: new Date().toISOString(),
  };
  intelligence.document_completeness = documentCompleteness;
  intelligence.emergency_readiness = emergencyReadiness;
  intelligence.portal_continuity = portalContinuity;
  intelligence.asset_linkage_flags = {
    critical_assets_without_portals: portalContinuity.critical_assets_without_portals,
    insurance_assets_sparse_portal_coverage:
      (assetCounts.insurance || assetCounts.homeowners || assetCounts.health_insurance || assetCounts.auto_insurance) &&
      portalContinuity.linked_portal_count === 0,
    many_assets_low_document_support:
      assets.length >= 6 && documentCompleteness.score_label === "Sparse",
  };
  intelligence.module_presence_flags = moduleFlags;
  intelligence.missing_item_prompts = promptData.prompts;
  intelligence.review_flags = promptData.flags;

  return intelligence;
}
