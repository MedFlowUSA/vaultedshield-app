import { classifyLifePolicyType } from "./policyTypeClassifier";
import { LIFE_POLICY_TYPE_CONFIGS } from "./policyTypeConfigs";

function display(field) {
  return field?.display_value || field?.value || field || null;
}

function extractTypeSpecific(policyType, normalizedPolicy = {}, normalizedAnalytics = {}) {
  const strategy = normalizedPolicy?.strategy || {};
  const values = normalizedPolicy?.values || {};
  const charges = normalizedPolicy?.charges || {};
  const loans = normalizedPolicy?.loans || {};

  switch (policyType) {
    case "iul":
      return {
        accumulationValue: display(values?.accumulation_value),
        cashSurrenderValue: display(values?.cash_surrender_value),
        coi: display(charges?.cost_of_insurance),
        adminFee: display(charges?.admin_fee),
        monthlyDeduction: display(charges?.monthly_deduction),
        strategy: display(strategy?.current_index_strategy),
        participationRate: display(strategy?.participation_rate),
        capRate: display(strategy?.cap_rate),
        spread: display(strategy?.spread),
        illustrationVarianceAvailable: Boolean(normalizedAnalytics?.illustration_comparison?.comparison_possible),
      };
    case "ul":
      return {
        accumulationValue: display(values?.accumulation_value),
        cashSurrenderValue: display(values?.cash_surrender_value),
        coi: display(charges?.cost_of_insurance),
        adminFee: display(charges?.admin_fee),
        loanBalance: display(loans?.loan_balance),
      };
    case "whole_life":
      return {
        guaranteedCashValue: display(values?.cash_value),
        surrenderValue: display(values?.cash_surrender_value),
        dividendOption: normalizedPolicy?.riders?.dividend_option || null,
        paidUpAdditions: normalizedPolicy?.riders?.paid_up_additions || null,
        loanBalance: display(loans?.loan_balance),
      };
    case "term":
      return {
        termEndDate: normalizedPolicy?.policy_timing?.term_end_date || null,
        conversionOption: normalizedPolicy?.riders?.conversion_option || null,
        renewalStructure: normalizedPolicy?.funding?.renewal_structure || null,
      };
    case "final_expense":
      return {
        waitingPeriod: normalizedPolicy?.riders?.waiting_period || null,
        gradedBenefit: normalizedPolicy?.riders?.graded_benefit || null,
        premiumMode: normalizedPolicy?.funding?.payment_mode?.display_value || null,
      };
    default:
      return {};
  }
}

export function normalizeLifePolicy({
  normalizedPolicy = {},
  normalizedAnalytics = {},
  comparisonSummary = {},
  statementRows = [],
} = {}) {
  const policyTypeDetection = classifyLifePolicyType({
    normalizedPolicy,
    normalizedAnalytics,
    comparisonSummary,
  });
  const config = LIFE_POLICY_TYPE_CONFIGS[policyTypeDetection.policyType] || LIFE_POLICY_TYPE_CONFIGS.unknown;
  const identity = normalizedPolicy?.policy_identity || {};
  const coverage = normalizedPolicy?.death_benefit || {};
  const funding = normalizedPolicy?.funding || {};
  const values = normalizedPolicy?.values || {};
  const charges = normalizedPolicy?.charges || {};
  const loans = normalizedPolicy?.loans || {};
  const riders = normalizedPolicy?.riders || {};
  const timing = normalizedPolicy?.policy_timing || {};

  return {
    identity: {
      carrierName: display(identity?.carrier_name),
      productName: display(identity?.product_name),
      policyTypeLabel: display(identity?.policy_type),
      policyNumber: display(identity?.policy_number),
      insuredName: display(identity?.insured_name),
      jointInsuredName: display(identity?.joint_insured_name),
      ownerName: display(identity?.owner_name),
      payorName: display(identity?.payor_name),
      trusteeName: display(identity?.trustee_name),
      trustName: display(identity?.trust_name),
      ownershipStructure: display(identity?.ownership_structure),
      primaryBeneficiaryName: display(identity?.primary_beneficiary_name),
      primaryBeneficiaryShare: display(identity?.primary_beneficiary_share),
      contingentBeneficiaryName: display(identity?.contingent_beneficiary_name),
      contingentBeneficiaryShare: display(identity?.contingent_beneficiary_share),
      beneficiaryStatus: display(identity?.beneficiary_status),
    },
    coverage: {
      deathBenefit: display(coverage?.death_benefit || coverage?.current_death_benefit || coverage?.initial_face_amount),
      faceAmount: display(coverage?.initial_face_amount),
      optionType: display(coverage?.option_type),
      status: comparisonSummary?.policy_status || null,
    },
    funding: {
      plannedPremium: display(funding?.planned_premium),
      minimumPremium: display(funding?.minimum_premium),
      guidelinePremiumLimit: display(funding?.guideline_premium_limit),
      totalPremiumPaid:
        funding?.total_premium_paid ??
        normalizedAnalytics?.growth_attribution?.visible_total_premium_paid ??
        null,
      paymentMode: display(funding?.payment_mode),
    },
    values: {
      accumulationValue: display(values?.accumulation_value),
      cashValue: display(values?.cash_value),
      cashSurrenderValue: display(values?.cash_surrender_value),
      fixedAccountValue: display(values?.fixed_account_value),
      indexedAccountValue: display(values?.indexed_account_value),
    },
    charges: {
      costOfInsurance: display(charges?.cost_of_insurance),
      adminFee: display(charges?.admin_fee),
      monthlyDeduction: display(charges?.monthly_deduction),
      expenseCharge: display(charges?.expense_charge),
      riderCharge: display(charges?.rider_charge),
      totalVisibleCharges: normalizedAnalytics?.charge_summary?.total_visible_policy_charges ?? null,
    },
    loans: {
      loanBalance: display(loans?.loan_balance),
    },
    riders: {
      ...riders,
      detectedRiders: Array.isArray(riders?.detected_riders) ? riders.detected_riders : [],
      riderNames: Array.isArray(riders?.rider_names) ? riders.rider_names : [],
      riderSummary: display(riders?.rider_summary),
      riderCharge: display(riders?.rider_charge),
      deathBenefitOption: display(riders?.death_benefit_option),
    },
    timing: {
      issueDate: identity?.issue_date || timing?.issue_date || null,
      statementDate: comparisonSummary?.latest_statement_date || timing?.statement_date || null,
      policyYear: timing?.policy_year || null,
    },
    typeSpecific: extractTypeSpecific(policyTypeDetection.policyType, normalizedPolicy, normalizedAnalytics),
    meta: {
      policyType: policyTypeDetection.policyType,
      policyTypeLabel: config.label,
      policyTypeDetection,
      supportedInterpretationAreas: config.interpretationAreas,
      suggestedQuestions: config.assistantQuestions,
      keyFields: config.keyFields,
      statementCount: statementRows.length,
      dataCompletenessStatus: normalizedAnalytics?.completeness_assessment?.status || null,
      iulReadiness: {
        hasIndexStrategy: Boolean(display(normalizedPolicy?.strategy?.current_index_strategy)),
        hasChargeVisibility: normalizedAnalytics?.charge_summary?.total_coi !== null,
        hasIllustrationVariance: Boolean(normalizedAnalytics?.illustration_comparison?.comparison_possible),
      },
    },
  };
}
