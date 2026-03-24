import {
  createEmptyRetirementIntelligenceSchema,
  getRetirementProvider,
  getRetirementType,
} from "../../domain/retirement";

function addFlag(collection, value, condition) {
  if (condition && !collection.includes(value)) {
    collection.push(value);
  }
}

function formatCurrency(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (Number.isNaN(number)) return null;
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildRetirementIntelligence({
  retirementAccount,
  latestSnapshot,
  retirementPositions = [],
  linkedAssetContext = null,
}) {
  const intelligence = createEmptyRetirementIntelligenceSchema();
  const reviewFlags = [];

  const normalized = latestSnapshot?.normalized_retirement || {};
  const accountIdentity = normalized.account_identity || {};
  const balanceMetrics = normalized.balance_metrics || {};
  const beneficiaryMetrics = normalized.beneficiary_metrics || {};
  const pensionMetrics = normalized.pension_metrics || {};
  const statementContext = normalized.statement_context || {};
  const completeness = latestSnapshot?.completeness_assessment || statementContext.completeness_assessment || {};
  const providerKey = latestSnapshot?.provider_profile?.key || accountIdentity.institution_key || retirementAccount?.provider_key || null;
  const provider = providerKey ? getRetirementProvider(providerKey) : null;
  const retirementType = getRetirementType(
    accountIdentity.account_type || retirementAccount?.retirement_type_key || null
  );

  const topHolding = retirementPositions
    .filter((position) => position.current_value !== null && position.current_value !== undefined)
    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))[0] || null;
  const concentrationHolding = retirementPositions.find(
    (position) => Number(position.allocation_percent || 0) >= 60
  );
  const targetDateDetected = retirementPositions.some(
    (position) =>
      position.position_type === "target_date" ||
      /target retirement|target date|freedom|lifecycle/i.test(position.position_name || "")
  );
  const modelPortfolioDetected = retirementPositions.some(
    (position) => position.position_type === "model_portfolio"
  );

  intelligence.beneficiary_flags.beneficiary_missing =
    beneficiaryMetrics.beneficiary_present === false;
  intelligence.beneficiary_flags.beneficiary_status_unknown =
    beneficiaryMetrics.beneficiary_present === null ||
    beneficiaryMetrics.beneficiary_present === undefined;
  intelligence.beneficiary_flags.contingent_beneficiary_missing =
    beneficiaryMetrics.beneficiary_present === true &&
    !beneficiaryMetrics.contingent_beneficiary_name;

  intelligence.rollover_flags.rollover_review_candidate =
    Boolean(retirementType?.employer_sponsored) &&
    ["inactive", "terminated", "frozen", "payout_only"].includes(
      String(retirementAccount?.plan_status || accountIdentity.plan_status || "").toLowerCase()
    );
  intelligence.rollover_flags.old_employer_plan_possible =
    intelligence.rollover_flags.rollover_review_candidate &&
    Boolean(retirementAccount?.employer_name);
  intelligence.rollover_flags.terminated_plan_detected = ["terminated", "frozen"].includes(
    String(retirementAccount?.plan_status || accountIdentity.plan_status || "").toLowerCase()
  );

  intelligence.loan_flags.outstanding_loan_detected =
    Number(balanceMetrics.loan_balance || normalized.loan_distribution_metrics?.loan_balance || 0) > 0;
  intelligence.loan_flags.loan_payment_visibility_limited =
    intelligence.loan_flags.outstanding_loan_detected &&
    !normalized.loan_distribution_metrics?.loan_payment_amount;

  intelligence.pension_flags.pension_estimate_detected =
    latestSnapshot?.snapshot_type === "pension_estimate" || Boolean(balanceMetrics.monthly_benefit_estimate);
  intelligence.pension_flags.survivor_option_visibility_limited = !pensionMetrics.survivor_option;
  intelligence.pension_flags.commencement_status_needs_review =
    Boolean(pensionMetrics.accrued_monthly_benefit || balanceMetrics.monthly_benefit_estimate) &&
    !pensionMetrics.benefit_commencement_status;

  intelligence.concentration_flags.concentration_warning = Boolean(concentrationHolding);
  intelligence.concentration_flags.target_date_fund_detected = targetDateDetected;
  intelligence.concentration_flags.allocation_visibility_limited = retirementPositions.length === 0;

  const missingSections = [];
  addFlag(missingSections, "missing_beneficiary_section", !beneficiaryMetrics.beneficiary_present && beneficiaryMetrics.beneficiary_present !== false);
  addFlag(missingSections, "missing_allocation_section", retirementPositions.length === 0);
  addFlag(
    missingSections,
    "missing_balance_section",
    balanceMetrics.current_balance === null &&
      balanceMetrics.vested_balance === null &&
      balanceMetrics.monthly_benefit_estimate === null
  );
  addFlag(missingSections, "missing_statement_period", !statementContext.statement_period);
  addFlag(
    missingSections,
    "sparse_document_visibility",
    (completeness.captured_field_count || 0) <= 3
  );

  intelligence.completeness_flags.statement_missing_sections = missingSections;
  intelligence.completeness_flags.provider_unconfirmed = !providerKey;
  intelligence.completeness_flags.account_type_unconfirmed = !retirementType?.retirement_type_key;
  intelligence.completeness_flags.document_class_unconfirmed = !statementContext.document_type;

  addFlag(reviewFlags, "beneficiary_missing", intelligence.beneficiary_flags.beneficiary_missing);
  addFlag(reviewFlags, "beneficiary_unknown", intelligence.beneficiary_flags.beneficiary_status_unknown);
  addFlag(reviewFlags, "beneficiary_present", beneficiaryMetrics.beneficiary_present === true);
  addFlag(reviewFlags, "rollover_review_candidate", intelligence.rollover_flags.rollover_review_candidate);
  addFlag(reviewFlags, "old_employer_plan_possible", intelligence.rollover_flags.old_employer_plan_possible);
  addFlag(reviewFlags, "active_employer_plan_indeterminate", Boolean(retirementType?.employer_sponsored) && !retirementAccount?.plan_status);
  addFlag(reviewFlags, "outstanding_loan_detected", intelligence.loan_flags.outstanding_loan_detected);
  addFlag(reviewFlags, "loan_balance_visible", Number(balanceMetrics.loan_balance || normalized.loan_distribution_metrics?.loan_balance || 0) > 0);
  addFlag(reviewFlags, "no_loan_detected", !intelligence.loan_flags.outstanding_loan_detected);
  addFlag(reviewFlags, "loan_data_incomplete", intelligence.loan_flags.loan_payment_visibility_limited);
  addFlag(reviewFlags, "pension_estimate_detected", intelligence.pension_flags.pension_estimate_detected);
  addFlag(
    reviewFlags,
    "monthly_benefit_estimate_detected",
    Boolean(balanceMetrics.monthly_benefit_estimate || pensionMetrics.accrued_monthly_benefit)
  );
  addFlag(reviewFlags, "survivor_option_visible", Boolean(pensionMetrics.survivor_option));
  addFlag(
    reviewFlags,
    "pension_data_incomplete",
    intelligence.pension_flags.pension_estimate_detected && !pensionMetrics.survivor_option
  );
  addFlag(reviewFlags, "concentration_warning", intelligence.concentration_flags.concentration_warning);
  addFlag(reviewFlags, "target_date_detected", intelligence.concentration_flags.target_date_fund_detected);
  addFlag(reviewFlags, "model_portfolio_detected", modelPortfolioDetected);
  addFlag(reviewFlags, "allocation_data_incomplete", intelligence.concentration_flags.allocation_visibility_limited);
  missingSections.forEach((flag) => addFlag(reviewFlags, flag, true));

  const summaryParts = [
    retirementType?.display_name
      ? `${retirementType.display_name} detected`
      : "Retirement account type is not fully confirmed",
    provider?.display_name
      ? `provider appears to be ${provider.display_name}`
      : "provider visibility is limited",
    retirementAccount?.is_benefit_based || retirementType?.benefit_based
      ? "record appears benefit-based"
      : "record appears account-based",
    formatCurrency(balanceMetrics.current_balance)
      ? `current balance is visible at ${formatCurrency(balanceMetrics.current_balance)}`
      : null,
    formatCurrency(balanceMetrics.vested_balance)
      ? `vested balance is visible at ${formatCurrency(balanceMetrics.vested_balance)}`
      : null,
    formatCurrency(balanceMetrics.monthly_benefit_estimate || pensionMetrics.accrued_monthly_benefit)
      ? `monthly pension estimate appears at ${formatCurrency(
          balanceMetrics.monthly_benefit_estimate || pensionMetrics.accrued_monthly_benefit
        )}`
      : null,
    retirementPositions.length > 0
      ? `${retirementPositions.length} parsed position${retirementPositions.length === 1 ? "" : "s"} identified`
      : "allocation detail was not clearly parsed",
    beneficiaryMetrics.beneficiary_present === true
      ? "beneficiary information was found"
      : beneficiaryMetrics.beneficiary_present === false
        ? "beneficiary information appears missing"
        : "beneficiary visibility is limited",
    intelligence.loan_flags.outstanding_loan_detected
      ? "an outstanding loan appears visible"
      : "no clear loan balance was detected",
  ].filter(Boolean);

  intelligence.summary.account_summary = `${summaryParts.join(". ")}.`;
  intelligence.summary.balance_visibility =
    formatCurrency(balanceMetrics.current_balance) || formatCurrency(balanceMetrics.monthly_benefit_estimate) || "Limited visibility";
  intelligence.summary.provider_visibility = provider?.display_name || providerKey || "Limited visibility";
  intelligence.summary.retirement_type_visibility = retirementType?.display_name || retirementAccount?.retirement_type_key || "Limited visibility";
  intelligence.review_flags = reviewFlags;
  intelligence.household_retirement_rollup_stub.retirement_accounts_visible = 1;
  intelligence.household_retirement_rollup_stub.pensions_visible =
    retirementType?.benefit_based || retirementAccount?.is_benefit_based ? 1 : 0;
  intelligence.household_retirement_rollup_stub.rollover_candidates_visible =
    intelligence.rollover_flags.rollover_review_candidate ? 1 : 0;
  intelligence.intelligence_meta.generated_at = new Date().toISOString();
  intelligence.intelligence_meta.analysis_status = "starter_review_ready";

  return {
    normalizedIntelligence: intelligence,
    reviewFlags,
    readinessStatus: missingSections.length > 2 ? "needs_review" : "starter_ready",
    summaryText: intelligence.summary.account_summary,
    metadata: {
      snapshot_id: latestSnapshot?.id || null,
      provider_key: providerKey,
      position_count: retirementPositions.length,
      top_holding_name: topHolding?.position_name || null,
      linked_asset_id: linkedAssetContext?.id || retirementAccount?.asset_id || null,
    },
  };
}
