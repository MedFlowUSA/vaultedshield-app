import assert from "node:assert/strict";

import {
  buildPolicyIntelligence,
  buildPolicyComparisonAnalysis,
} from "../src/lib/domain/intelligenceEngine.js";
import { buildPolicyAdequacyReview } from "../src/lib/domain/insurance/insuranceIntelligence.js";
import {
  getStructuredData,
  getStructuredStrategyRows,
  hasStrongStructuredSupport,
} from "../src/lib/domain/structuredAccess.js";
import {
  computeDerivedAnalytics,
  parseIllustrationDocument,
  parseStatementDocument,
  sortStatementsChronologically,
} from "../src/lib/parser/extractionEngine.js";
import {
  buildVaultedPolicyScopeFilter,
  buildInitialPersistenceStepResults,
  buildVaultedSnapshotPayload,
  isMissingUpsertConstraintError,
  normalizeExplicitVaultedPolicyScope,
  VAULTED_PARSER_VERSION,
  rehydrateStructuredParserData,
  rehydrateVaultedPolicyBundle,
  sanitizeParserStructuredData,
} from "../src/lib/supabase/vaultedPolicies.js";
import { isHouseholdOwnedByUser } from "../src/lib/supabase/platformData.js";
import { resolvePlatformDataScope } from "../src/lib/intelligence/platformShellScope.js";
import { resolveCarrierParsingProfile } from "../src/lib/domain/parsing/carrierProfiles.js";
import { detectPageType } from "../src/lib/domain/parsing/pageTypeDetection.js";
import { reconstructTableFromPage } from "../src/lib/domain/parsing/tableReconstruction.js";
import { buildIulReaderModel } from "../src/features/iul-reader/readerModel.js";
import { buildIulV2Analytics } from "../src/lib/insurance/iulV2Analytics.js";
import { resolveResponsiveLayout } from "../src/lib/ui/responsiveLayout.js";

function field(value, confidence = "high", displayValue = null) {
  return {
    value,
    display_value: displayValue ?? (value === null ? "Not found" : String(value)),
    confidence,
    missing: value === null,
  };
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("parseIllustrationDocument rejects implausible future issue dates", () => {
  const result = parseIllustrationDocument({
    pages: [
      [
        "Policy Number: 123456789",
        "Issue Date: 01/01/2099",
        "Carrier: F&G Life Insurance Company",
        "Product Name: Accumulator Universal Life",
      ].join("\n"),
    ],
    fileName: "illustration.pdf",
  });

  assert.equal(result.fields.issue_date.missing, true);
  assert.equal(result.fields.issue_date.value, null);
  assert.equal(result.fields.policy_number.value, "123456789");
});

runTest("parseIllustrationDocument extracts illustration ledger checkpoints when policy-year rows are visible", () => {
  const result = parseIllustrationDocument({
    pages: [
      [
        "Policy Year",
        "Attained Age",
        "Premium Outlay",
        "Accumulation Value",
        "Cash Surrender Value",
        "Death Benefit",
        "1",
        "45",
        "$5,000.00",
        "$4,800.00",
        "$4,200.00",
        "$500,000.00",
        "10",
        "54",
        "$50,000.00",
        "$68,500.00",
        "$60,100.00",
        "$500,000.00",
      ].join("\n"),
    ],
    fileName: "illustration-ledger.pdf",
  });

  assert.equal(result.illustrationProjection.row_count >= 2, true);
  assert.equal(result.illustrationProjection.benchmark_rows.some((row) => row.policy_year === 10), true);
  assert.equal(result.parserDebug.carrier_specific.parser_used.length > 0, true);
});

runTest("carrier-specific parsing detects profile, page types, and attaches provenance", () => {
  const profile = resolveCarrierParsingProfile("F&G Life Insurance Company", [
    "F&G Life Insurance Company\nPolicy Detail\nPolicy Number: 123456789",
  ]);
  assert.equal(profile?.key, "fidelity_guaranty");

  const pageType = detectPageType(
    "Annual Statement\nAccount Summary\nStatement Date: 12/31/2024\nAccumulation Value: $125,000.00",
    profile
  );
  assert.equal(pageType.page_type, "statement_summary");
  assert.equal(["strong", "moderate"].includes(pageType.confidence), true);

  const reconstructed = reconstructTableFromPage(
    [
      "Policy Year",
      "Attained Age",
      "Premium Outlay",
      "Accumulation Value",
      "Cash Surrender Value",
      "Death Benefit",
      "1",
      "45",
      "$5,000.00",
      "$4,800.00",
      "$4,200.00",
      "$500,000.00",
    ].join("\n"),
    { pageType: "illustration_ledger", pageNumber: 1 }
  );
  assert.equal(reconstructed.rows.length >= 1, true);

  const statement = parseStatementDocument({
    fileName: "fg-statement.pdf",
    pages: [
      [
        "F&G Life Insurance Company",
        "Annual Statement",
        "Account Summary",
        "Policy Number: 123456789",
        "Statement Date: 12/31/2024",
        "Accumulation Value: $125,000.00",
        "Cash Surrender Value: $114,000.00",
        "Loan Balance: $0.00",
        "Cost of Insurance $1,200.00",
        "Monthly Deduction $250.00",
        "Indexed Account 100%",
        "Cap Rate 12%",
      ].join("\n"),
    ],
  });

  assert.equal(statement.fields.statement_date.provenance.document, "fg-statement.pdf");
  assert.equal(statement.fields.statement_date.provenance.page, 1);
  assert.equal(statement.parserDebug.carrier_specific.detected_carrier_profile, "fidelity_guaranty");
  assert.equal(statement.parserDebug.carrier_specific.page_types.some((page) => page.page_type === "statement_summary"), true);
});

runTest("F&G deep ledger reconstruction handles repeated headers and preserves structured row detail", () => {
  const result = reconstructTableFromPage(
    [
      "Policy Year",
      "Attained Age",
      "Premium Outlay",
      "Accumulation Value",
      "Cash Surrender Value",
      "Loan Balance",
      "Death Benefit",
      "1",
      "45",
      "$5,000.00",
      "$4,800.00",
      "$4,200.00",
      "$0.00",
      "$500,000.00",
      "Policy Year",
      "Attained Age",
      "Premium Outlay",
      "Accumulation Value",
      "Cash Surrender Value",
      "Loan Balance",
      "Death Benefit",
      "10",
      "54",
      "$50,000.00",
      "$68,500.00",
      "$60,100.00",
      "$1,500.00",
      "$500,000.00",
    ].join("\n"),
    { pageType: "illustration_ledger", pageNumber: 1, carrierKey: "fidelity_guaranty" }
  );

  assert.equal(result.rows.length >= 2, true);
  assert.equal(result.rows.some((row) => row.year === 10 && row.loan_balance === 1500), true);
  assert.equal(["strong", "moderate"].includes(result.quality), true);
  assert.equal(result.quality_inputs.repeated_headers_handled, true);
});

runTest("Protective statement parser prefers summary totals and preserves statement-date provenance", () => {
  const statement = parseStatementDocument({
    fileName: "protective-statement.pdf",
    pages: [
      [
        "Protective Life Insurance Company",
        "Annual Statement",
        "Statement Summary",
        "Policy Number: P1234567",
        "As Of: 12/31/2024",
        "Account Value: $125,000.00",
        "Cash Value: $119,000.00",
        "Net Cash Surrender Value: $114,000.00",
        "Death Benefit: $300,000.00",
        "Loan Balance: $0.00",
        "Annual Charges: $2,200.00",
        "Cost of Insurance: $1,250.00",
        "Premium Paid: $8,000.00",
      ].join("\n"),
    ],
  });

  assert.equal(statement.fields.policy_number.value, "P1234567");
  assert.equal(statement.fields.statement_date.value, "2024-12-31");
  assert.equal(statement.fields.statement_date.provenance.method.includes("carrier"), true);
  assert.equal(statement.fields.policy_charges_total.value, 2200);
  assert.equal(statement.parserDebug.carrier_specific.detected_carrier_profile, "protective");
});

runTest("Pacific Life parser recognizes policy value wording and allocation terminology", () => {
  const statement = parseStatementDocument({
    fileName: "pacific-life-statement.pdf",
    pages: [
      [
        "Pacific Life Insurance Company",
        "Annual Statement",
        "Report Date: 12/31/2024",
        "Policy Value: $143,200.00",
        "Net Surrender Value: $132,100.00",
        "Allocation Option S&P 500 Point-to-Point 80%",
        "Cap Rate 9.75%",
        "Participation Rate 100%",
      ].join("\n"),
    ],
  });

  assert.equal(statement.fields.statement_date.value, "2024-12-31");
  assert.equal(statement.fields.accumulation_value.value, 143200);
  assert.equal(statement.fields.cash_surrender_value.value, 132100);
  assert.equal(statement.fields.index_strategy.value.includes("S&P 500"), true);
  assert.equal(statement.fields.allocation_percent.value, 80);
});

runTest("Nationwide parser recognizes modal premium and death benefit wording on illustration summaries", () => {
  const result = parseIllustrationDocument({
    fileName: "nationwide-illustration.pdf",
    pages: [
      [
        "Nationwide Life Insurance Company",
        "Policy Summary",
        "Policy Number: N123456",
        "Issue Date: 01/15/2017",
        "Modal Premium: $6,000.00",
        "Face Amount: $400,000.00",
        "Death Benefit Option: Increasing Death Benefit",
      ].join("\n"),
    ],
  });

  assert.equal(result.fields.planned_premium.value, 6000);
  assert.equal(result.fields.death_benefit.value, 400000);
  assert.equal(String(result.fields.option_type.value).toLowerCase().includes("increasing"), true);
});

runTest("Principal parser recognizes account value and death benefit option wording", () => {
  const statement = parseStatementDocument({
    fileName: "principal-statement.pdf",
    pages: [
      [
        "Principal Life Insurance Company",
        "Annual Statement",
        "Statement Date: 12/31/2024",
        "Account Value: $88,500.00",
        "Cash Value: $84,200.00",
        "Death Benefit Option Type: Level Death Benefit",
      ].join("\n"),
    ],
  });

  assert.equal(statement.fields.accumulation_value.value, 88500);
  assert.equal(statement.fields.cash_value.value, 84200);
  assert.equal(String(statement.fields.option_type.value).toLowerCase().includes("level"), true);
});

runTest("Corebridge parser recognizes declared rate and net surrender terminology", () => {
  const statement = parseStatementDocument({
    fileName: "corebridge-statement.pdf",
    pages: [
      [
        "American General Life Insurance Company",
        "Annual Statement",
        "Policy Value Summary",
        "Statement Date: 12/31/2024",
        "Net Surrender Value: $76,250.00",
        "Declared Rate 4.25%",
      ].join("\n"),
      [
        "Your Account Values and Allocation",
        "Index Account Strategies",
        "High Cap Rate Account 100%",
      ].join("\n"),
    ],
  });

  assert.equal(statement.fields.cash_surrender_value.value, 76250);
  assert.equal(statement.fields.crediting_rate.value, 4.25);
  assert.equal(statement.fields.allocation_percent.value, 100);
});

runTest("statement parser extracts joint insured, payor, trust, and beneficiary share fields from labeled party sections", () => {
  const statement = parseStatementDocument({
    fileName: "party-detail-statement.pdf",
    pages: [
      [
        "Annual Statement",
        "Policy Number: VS1234567",
        "Owner: Jordan Policyholder",
        "Insured: Jordan Policyholder",
        "Joint Insured: Casey Policyholder",
        "Payor: Morgan Payor",
        "Trust Name: Policyholder Family Trust",
        "Primary Beneficiary: Avery Beneficiary",
        "Primary Beneficiary Share: 75%",
        "Contingent Beneficiary: Riley Beneficiary",
        "Contingent Beneficiary Share: 25%",
        "Statement Date: 12/31/2024",
      ].join("\n"),
    ],
  });

  assert.equal(statement.fields.joint_insured_name.value, "Casey Policyholder");
  assert.equal(statement.fields.payor_name.value, "Morgan Payor");
  assert.equal(statement.fields.trust_name.value, "Policyholder Family Trust");
  assert.equal(statement.fields.primary_beneficiary_share.value, 75);
  assert.equal(statement.fields.contingent_beneficiary_share.value, 25);
});

runTest("statement parser extracts beneficiary schedule rows when names and shares are presented as table-style lines", () => {
  const statement = parseStatementDocument({
    fileName: "beneficiary-schedule-statement.pdf",
    pages: [
      [
        "Beneficiary Designation Schedule",
        "Type Name Share",
        "Primary Avery Beneficiary 75%",
        "Contingent Riley Beneficiary 25%",
        "Statement Date: 12/31/2024",
      ].join("\n"),
    ],
  });

  assert.equal(statement.fields.primary_beneficiary_name.value, "Avery Beneficiary");
  assert.equal(statement.fields.primary_beneficiary_share.value, 75);
  assert.equal(statement.fields.contingent_beneficiary_name.value, "Riley Beneficiary");
  assert.equal(statement.fields.contingent_beneficiary_share.value, 25);
  assert.equal(String(statement.fields.beneficiary_status.value).toLowerCase().includes("beneficiary designation"), true);
});

runTest("policy adequacy review surfaces richer party visibility when normalized policy carries new identity fields", () => {
  const adequacy = buildPolicyAdequacyReview(
    {
      normalizedPolicy: {
        policy_identity: {
          owner_name: "Jordan Policyholder",
          insured_name: "Jordan Policyholder",
          joint_insured_name: "Casey Policyholder",
          payor_name: "Morgan Payor",
          trustee_name: "Taylor Trustee",
          trust_name: "Policyholder Family Trust",
          primary_beneficiary_name: "Avery Beneficiary",
          primary_beneficiary_share: "75%",
          contingent_beneficiary_name: "Riley Beneficiary",
          contingent_beneficiary_share: "25%",
          ownership_structure: "Irrevocable trust owned",
        },
        death_benefit: {
          death_benefit: field(750000),
        },
        funding: {
          planned_premium: field(12000),
          minimum_premium: field(9000),
        },
      },
      lifePolicy: {
        identity: {
          ownerName: "Jordan Policyholder",
          insuredName: "Jordan Policyholder",
          jointInsuredName: "Casey Policyholder",
          payorName: "Morgan Payor",
          trusteeName: "Taylor Trustee",
          trustName: "Policyholder Family Trust",
          primaryBeneficiaryName: "Avery Beneficiary",
          primaryBeneficiaryShare: "75%",
          contingentBeneficiaryName: "Riley Beneficiary",
          contingentBeneficiaryShare: "25%",
          ownershipStructure: "Irrevocable trust owned",
        },
      },
      comparisonSummary: {
        death_benefit: "$750,000",
      },
    },
    {
      mortgageCount: 1,
      dependentPlanCount: 1,
    }
  );

  assert.equal(adequacy.jointInsuredVisible, true);
  assert.equal(adequacy.payorVisible, true);
  assert.equal(adequacy.trustNameVisible, true);
  assert.equal(adequacy.primaryBeneficiaryShare, "75%");
  assert.equal(adequacy.contingentBeneficiaryShare, "25%");
  assert.equal(adequacy.notes.some((note) => note.includes("Joint-insured visibility is present")), true);
  assert.equal(adequacy.notes.some((note) => note.includes("Payor visibility is present")), true);
  assert.equal(adequacy.notes.some((note) => note.includes("Trust-name visibility is present")), true);
  assert.equal(adequacy.primaryBeneficiaryName, "Avery Beneficiary");
  assert.equal(adequacy.contingentBeneficiaryName, "Riley Beneficiary");
  assert.equal(adequacy.beneficiaryVisibility, "named");
});

runTest("illustration parser extracts trust-owned party layouts with trustee and ownership structure support", () => {
  const illustration = parseIllustrationDocument({
    fileName: "trust-owned-illustration.pdf",
    pages: [
      [
        "Policy Detail",
        "Owner: Cedar Family Irrevocable Trust",
        "Trustee: Morgan Trustee",
        "Trust Name: Cedar Family Irrevocable Trust",
        "Ownership Structure: Irrevocable trust owned",
        "Insured: Jordan Policyholder",
        "Issue Date: 01/15/2018",
      ].join("\n"),
    ],
  });

  assert.equal(illustration.fields.owner_name.value, "Cedar Family Irrevocable Trust");
  assert.equal(illustration.fields.trustee_name.value, "Morgan Trustee");
  assert.equal(illustration.fields.trust_name.value, "Cedar Family Irrevocable Trust");
  assert.equal(String(illustration.fields.ownership_structure.value).toLowerCase().includes("irrevocable"), true);
});

runTest("policy adequacy review infers rider-based protection purpose from visible rider support and household pressure", () => {
  const adequacy = buildPolicyAdequacyReview(
    {
      normalizedPolicy: {
        policy_identity: {
          owner_name: "Jordan Policyholder",
          insured_name: "Jordan Policyholder",
          primary_beneficiary_name: "Avery Beneficiary",
        },
        death_benefit: {
          death_benefit: field(600000),
        },
        funding: {
          planned_premium: field(10000),
          minimum_premium: field(9000),
        },
        riders: {
          rider_summary: "Accelerated Benefit Rider; Waiver of Monthly Deduction Rider",
          detected_riders: ["Accelerated Benefit Rider", "Waiver of Monthly Deduction Rider"],
        },
      },
      comparisonSummary: {
        death_benefit: "$600,000",
      },
    },
    {
      mortgageCount: 1,
      dependentPlanCount: 1,
    }
  );

  assert.equal(adequacy.livingBenefitsVisible, true);
  assert.equal(adequacy.incomeProtectionVisible, true);
  assert.equal(adequacy.loanProtectionPressure, true);
  assert.equal(adequacy.protectionPurposeLabels.includes("family protection"), true);
  assert.equal(adequacy.protectionPurposeLabels.includes("mortgage protection"), true);
  assert.equal(adequacy.protectionPurposeLabels.includes("living benefits"), true);
  assert.equal(adequacy.protectionPurposeLabels.includes("income protection"), true);
});

runTest("Symetra strategy parser preserves active strategy rows and structured provenance", () => {
  const statement = parseStatementDocument({
    fileName: "symetra-allocation.pdf",
    pages: [
      [
        "Symetra Life Insurance Company",
        "Allocation Detail",
        "Current Allocation",
        "S&P 500 Index Account 75% Cap Rate 11% Participation Rate 100%",
        "Fixed Account 25% Crediting Rate 4%",
      ].join("\n"),
    ],
  });

  assert.equal(statement.fields.index_strategy.value.includes("S&P 500"), true);
  assert.equal(statement.fields.allocation_percent.value, 75);
  assert.equal(statement.fields.cap_rate.value, 11);
  assert.equal(statement.fields.index_strategy.provenance.method, "carrier_strategy_row");
  assert.equal(statement.parserDebug.carrier_specific.strategy_rows.length >= 1, true);
  assert.equal(statement.parserDebug.carrier_specific.all_strategy_rows.length >= 2, true);
  assert.equal(statement.structuredData.strategyRows.length >= 1, true);
  assert.equal(statement.structuredData.allStrategyRows.length >= 2, true);
  assert.equal(statement.structuredData.extractionSummary.strategy_row_count >= 1, true);
});

runTest("policy intelligence prefers structured strategy rows and gates weak ledger projections", () => {
  const baseline = parseIllustrationDocument({
    fileName: "fg-illustration.pdf",
    pages: [
      [
        "F&G Life Insurance Company",
        "Policy Year",
        "Attained Age",
        "Accumulation Value",
        "Cash Surrender Value",
        "Death Benefit",
        "1",
        "45",
        "$4,800.00",
        "$4,200.00",
        "$500,000.00",
      ].join("\n"),
    ],
  });

  baseline.structuredData.tables = [
    {
      page_type: "illustration_ledger",
      quality: "weak",
      rows: baseline.illustrationProjection.rows || [],
    },
  ];

  const statement = parseStatementDocument({
    fileName: "symetra-intelligence.pdf",
    pages: [
      [
        "Symetra Life Insurance Company",
        "Allocation Detail",
        "Current Allocation",
        "S&P 500 Index Account 75% Cap Rate 11% Participation Rate 100%",
        "Fixed Account 25% Crediting Rate 4%",
        "Statement Date: 12/31/2024",
        "Policy Year: 10",
        "Accumulation Value: $70,000.00",
        "Cash Surrender Value: $60,000.00",
      ].join("\n"),
    ],
  });

  const intelligence = buildPolicyIntelligence({
    baseline,
    statements: [statement],
    legacyAnalytics: {
      policy_health_score: { value: { value: 6, label: "Stable", factors: [] } },
      charge_analysis: {},
    },
    vaultAiSummary: [],
  });

  assert.equal(intelligence.normalizedPolicy.strategy.current_index_strategy.includes("S&P 500"), true);
  assert.equal(intelligence.normalizedPolicy.strategy.available_strategy_menu, true);
  assert.equal(intelligence.normalizedAnalytics.illustration_projection.comparison_possible, false);
  assert.equal(
    intelligence.normalizedAnalytics.illustration_projection.limitations.some((item) => item.includes("reconstruction quality was weak")),
    true
  );
});

runTest("computeDerivedAnalytics does not use face amount as illustration variance proxy", () => {
  const baseline = {
    fields: {
      issue_date: field("2008-06-01", "high", "June 1, 2008"),
      carrier_name: field("F&G Life Insurance Company"),
      product_name: field("Accumulator Universal Life"),
      policy_number: field("123456789"),
      death_benefit: field(500000, "high", "$500,000.00"),
      initial_face_amount: field(500000, "high", "$500,000.00"),
    },
  };
  const statements = [
    {
      fileName: "statement-2024.pdf",
      fields: {
        statement_date: field("2024-12-31", "high", "12/31/2024"),
        accumulation_value: field(125000, "high", "$125,000.00"),
        cash_value: field(119000, "high", "$119,000.00"),
        cash_surrender_value: field(114000, "high", "$114,000.00"),
        loan_balance: field(0, "high", "$0.00"),
        premium_paid: field(90000, "high", "$90,000.00"),
        cost_of_insurance: field(1200, "high", "$1,200.00"),
        admin_fee: field(100, "high", "$100.00"),
        monthly_deduction: field(250, "high", "$250.00"),
        rider_charge: field(0, "high", "$0.00"),
        expense_charge: field(300, "high", "$300.00"),
        policy_charges_total: field(1850, "high", "$1,850.00"),
        index_strategy: field("S&P 500 Index Account"),
        allocation_percent: field(100, "high", "100%"),
        index_credit: field(6.5, "high", "6.5%"),
        crediting_rate: field(6.5, "high", "6.5%"),
        participation_rate: field(100, "high", "100%"),
        cap_rate: field(12, "high", "12%"),
        spread: field(0, "high", "0%"),
        indexed_account_value: field(100000, "high", "$100,000.00"),
        fixed_account_value: field(25000, "high", "$25,000.00"),
      },
      parserDebug: {
        fg_strategy_split: {
          observed_statement_strategies: ["S&P 500 Index Account"],
          active_statement_strategies: ["S&P 500 Index Account"],
          primary_strategy_source_evidence: "statement_active",
        },
      },
    },
  ];

  const analytics = computeDerivedAnalytics(baseline, statements);

  assert.equal(analytics.performance_summary.illustration_variance, "Not found");
  assert.equal(analytics.illustration_variance.value, null);
});

runTest("policy intelligence derives policy-year match from issue date and statement date when explicit policy year is missing", () => {
  const baseline = parseIllustrationDocument({
    fileName: "derived-policy-year-illustration.pdf",
    pages: [
      [
        "F&G Life Insurance Company",
        "Issue Date: 06/01/2015",
        "Policy Year",
        "Attained Age",
        "Premium Outlay",
        "Accumulation Value",
        "Cash Surrender Value",
        "Death Benefit",
        "10",
        "54",
        "$50,000.00",
        "$68,500.00",
        "$60,100.00",
        "$500,000.00",
      ].join("\n"),
    ],
  });

  const statement = parseStatementDocument({
    fileName: "derived-policy-year-statement.pdf",
    pages: [
      [
        "F&G Life Insurance Company",
        "Annual Statement",
        "Statement Date: 12/31/2024",
        "Accumulation Value: $70,000.00",
        "Cash Surrender Value: $61,500.00",
      ].join("\n"),
    ],
  });

  const intelligence = buildPolicyIntelligence({
    baseline,
    statements: [statement],
    legacyAnalytics: {
      charge_analysis: {},
      policy_health_score: { value: { value: 5, label: "Limited", factors: [] } },
    },
  });

  assert.equal(intelligence.normalizedAnalytics.illustration_projection.current_projection_match.actual_policy_year, 10);
  assert.equal(
    intelligence.normalizedAnalytics.illustration_projection.current_projection_match.actual_policy_year_source,
    "derived_from_issue_and_statement_date"
  );
  assert.equal(
    intelligence.normalizedAnalytics.illustration_projection.narrative.includes("estimated from issue date and statement date"),
    true
  );
});

runTest("sortStatementsChronologically orders statements by trusted statement date values", () => {
  const sorted = sortStatementsChronologically([
    { fileName: "statement-2024.pdf", fields: { statement_date: field("2024-12-31", "high", "12/31/2024") } },
    { fileName: "statement-2022.pdf", fields: { statement_date: field("2022-12-31", "high", "12/31/2022") } },
    { fileName: "statement-2023.pdf", fields: { statement_date: field("2023-12-31", "high", "12/31/2023") } },
  ]);

  assert.deepEqual(
    sorted.map((statement) => statement.fileName),
    ["statement-2022.pdf", "statement-2023.pdf", "statement-2024.pdf"]
  );
});

runTest("buildIulReaderModel flags identity mismatches and recommends next uploads", () => {
  const reader = buildIulReaderModel({
    illustrationSummary: {
      carrier: "F&G Life Insurance Company",
      productName: "Accumulator Universal Life",
      policyType: "Universal Life",
      policyNumber: "ABC123456",
      issueDate: "June 1, 2008",
      deathBenefit: "$500,000.00",
      periodicPremium: "$5,000.00",
      __meta: {
        carrier: { confidence: "high" },
        productName: { confidence: "high" },
        policyType: { confidence: "high" },
        policyNumber: { confidence: "high" },
        issueDate: { confidence: "high" },
        deathBenefit: { confidence: "high" },
        periodicPremium: { confidence: "high" },
      },
    },
    statementResults: [
      {
        fileName: "statement-2024.pdf",
        summary: {
          carrier: "Different Carrier",
          policyNumber: "XYZ999999",
          statementDate: "12/31/2024",
          accumulationValue: "$125,000.00",
          cashValue: "Not found",
          cashSurrenderValue: "Not found",
          loanBalance: "Not found",
          costOfInsurance: "Not found",
          expenseCharge: "Not found",
          indexStrategy: "Not found",
          allocationPercent: "Not found",
          capRate: "Not found",
          __meta: {
            carrier: { confidence: "high" },
            policyNumber: { confidence: "high" },
            statementDate: { confidence: "high" },
            accumulationValue: { confidence: "high" },
          },
        },
      },
    ],
    analytics: {
      performance_summary: {
        illustration_variance: "Not found",
      },
      growth_trend: { value: null },
      policy_health_score: { value: { label: "Limited", value: 4 } },
    },
    normalizedAnalytics: {
      policy_health_score: {
        score: 6,
        status: "stable",
      },
      comparison_summary: {
        continuity_score: 72,
        continuity_explanation: "The statement trail is usable, but not fully complete.",
        latest_statement_date: "12/31/2024",
        charge_drag_ratio: "18.0%",
        charge_visibility_status: "moderate",
      },
      charge_summary: {
        total_coi: 1200,
        total_visible_policy_charges: 2200,
        coi_confidence: "moderate",
        charge_notes: ["COI is currently supported by a single strongly labeled statement row."],
      },
      illustration_projection: {
        comparison_possible: true,
        benchmark_rows: [
          {
            policy_year: 10,
            premium_outlay: "$50,000.00",
            accumulation_value: "$68,500.00",
            cash_surrender_value: "$60,100.00",
            death_benefit: "$500,000.00",
          },
        ],
        current_projection_match: {
          matched_policy_year: 10,
          actual_policy_year: 10,
          projected_accumulation_value: "$68,500.00",
          actual_accumulation_value: "$70,000.00",
          accumulation_variance_display: "$1,500.00",
          cash_surrender_variance_display: "$1,100.00",
        },
        narrative: "At the current visible policy year, actual accumulation value is tracking at or above the extracted illustration checkpoint by $1,500.00.",
        limitations: [],
      },
    },
    normalizedPolicy: {
      policy_identity: {
        policy_type: "Indexed Universal Life Policy",
        carrier_name: "F&G Life Insurance Company",
        product_name: "PathSetter",
      },
      funding: {
        planned_premium: field(5000, "high", "$5,000.00"),
      },
      values: {
        accumulation_value: field(125000, "high", "$125,000.00"),
        cash_value: field(119000, "high", "$119,000.00"),
        cash_surrender_value: field(114000, "high", "$114,000.00"),
      },
      loans: {
        loan_balance: field(0, "high", "$0.00"),
      },
      death_benefit: {
        death_benefit: field(500000, "high", "$500,000.00"),
      },
      strategy: {
        current_index_strategy: "S&P 500 Index Account",
        allocation_percent: field(100, "high", "100%"),
        cap_rate: field(12, "high", "12%"),
        participation_rate: field(100, "high", "100%"),
        spread: field(0, "high", "0%"),
      },
    },
    completenessAssessment: {
      status: "moderate",
    },
    carrierProfile: {
      display_name: "F&G Life Insurance Company",
      known_document_patterns: ["annual statement", "policy detail", "in force ledger"],
    },
    productProfile: {
      display_name: "PathSetter",
      notes: "F&G indexed universal life product family built around permanent death benefit coverage plus account-value accumulation tied to declared and indexed crediting options.",
      known_strategies: ["Indexed Account", "Fixed Account"],
    },
  });

  assert.equal(reader.confirmed.length > 0, true);
  assert.equal(reader.confirmed.some((entry) => entry.label === "Accumulation Value"), true);
  assert.equal(reader.warnings.some((warning) => warning.includes("policy numbers do not match")), true);
  assert.equal(reader.warnings.some((warning) => warning.includes("Carrier identity differs")), true);
  assert.equal(reader.benchmarks.length >= 5, true);
  assert.equal(reader.benchmarks.some((benchmark) => benchmark.label === "Growth vs Funding"), true);
  assert.equal(reader.benchmarks.some((benchmark) => benchmark.label === "Charge Pressure"), true);
  assert.equal(reader.benchmarks.some((benchmark) => benchmark.label === "Projection Match"), true);
  assert.equal(typeof reader.laymanSummary, "string");
  assert.equal(reader.laymanSummary.length > 20, true);
  assert.equal(typeof reader.productExplanation, "string");
  assert.equal(reader.productExplanation.includes("permanent life insurance coverage"), true);
  assert.equal(typeof reader.initialReading, "string");
  assert.equal(reader.initialReading.includes("initial illustration"), true);
  assert.equal(Array.isArray(reader.readerTables), true);
  assert.equal(reader.readerTables.some((table) => table.title === "Values And Funding"), true);
  assert.equal(reader.readerTables.some((table) => table.title === "Charges And Crediting"), true);
  assert.equal(typeof reader.classification.productNameDisplay, "string");
  assert.equal(reader.classification.productNameDisplay.length > 5, true);
  assert.equal(reader.classification.productNameNote.includes("directly supported"), true);
  assert.equal(typeof reader.overview.continuityScore, "string");
  assert.equal(typeof reader.projectionSummary, "string");
  assert.equal(reader.projectionView.available, true);
  assert.equal(reader.projectionView.benchmarkRows.some((row) => row.policy_year === 10), true);
  assert.equal(reader.projectionView.currentMatch.actual_policy_year, 10);
  assert.equal(reader.nextSteps.length > 0, true);
  assert.equal(reader.nextSteps.some((step) => step.includes("supports the main IUL reader")), true);
});

runTest("sanitizeParserStructuredData versions and trims persisted parser payloads", () => {
  const sanitized = sanitizeParserStructuredData({
    extractionSummary: {
      document_type: "annual_statement",
      carrier_key: "symetra",
      strategy_row_count: 2,
    },
    pageTypes: [
      {
        page_number: 1,
        page_type: "allocation_table",
        confidence: "strong",
        matched_signals: ["Current Allocation"],
        ignored: "nope",
      },
    ],
    tables: [
      {
        page_number: 1,
        page_type: "allocation_table",
        quality: "strong",
        quality_inputs: {
          header_match_quality: "strong",
          currency_consistency: true,
        },
        rows: [
          {
            strategy_name: "S&P 500",
            allocation_percent: 75,
            cap_rate: 11,
            unrelated_blob: "drop-me",
          },
        ],
      },
    ],
    strategyRows: [
      {
        strategy_name: "S&P 500",
        allocation_percent: 75,
        cap_rate: 11,
        provenance: {
          method: "carrier_strategy_row",
          page: 1,
          document: "symetra.pdf",
          candidates: ["S&P 500", "Fixed Account"],
        },
      },
    ],
    allStrategyRows: [],
    failedPages: [3],
  });

  assert.equal(sanitized.version, VAULTED_PARSER_VERSION);
  assert.equal(sanitized.quality.strategy, "strong");
  assert.equal(sanitized.tables[0].rows[0].unrelated_blob, undefined);
  assert.deepEqual(sanitized.strategyRows[0].provenance.candidates, ["S&P 500", "Fixed Account"]);
});

runTest("isMissingUpsertConstraintError detects missing ON CONFLICT constraint errors", () => {
  assert.equal(
    isMissingUpsertConstraintError({
      message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
    }),
    true
  );
  assert.equal(
    isMissingUpsertConstraintError({
      message: "some other database error",
    }),
    false
  );
});

runTest("buildInitialPersistenceStepResults creates stable diagnostics shape for statement saves", () => {
  const diagnostics = buildInitialPersistenceStepResults(2);

  assert.equal(diagnostics.policy.attempted, false);
  assert.equal(diagnostics.baseline_snapshot.structuredDataPresent, false);
  assert.equal(diagnostics.statement_uploads.length, 2);
  assert.equal(diagnostics.statement_documents.length, 2);
  assert.equal(diagnostics.statement_snapshots.length, 2);
  assert.equal(diagnostics.analytics.succeeded, false);
  assert.equal(diagnostics.statement_rows.count, 0);
});

runTest("isHouseholdOwnedByUser recognizes direct and legacy metadata ownership", () => {
  assert.equal(isHouseholdOwnedByUser({ owner_user_id: "user-1", metadata: {} }, "user-1"), true);
  assert.equal(isHouseholdOwnedByUser({ owner_user_id: null, metadata: { auth_user_id: "user-2" } }, "user-2"), true);
  assert.equal(isHouseholdOwnedByUser({ owner_user_id: "user-1", metadata: {} }, "user-3"), false);
});

runTest("buildVaultedPolicyScopeFilter isolates authenticated and guest policy queries", () => {
  assert.deepEqual(buildVaultedPolicyScopeFilter("user-1"), {
    column: "user_id",
    operator: "eq",
    value: "user-1",
  });
  assert.deepEqual(buildVaultedPolicyScopeFilter(null), {
    column: "user_id",
    operator: "is",
    value: null,
  });
});

runTest("resolvePlatformDataScope blocks authenticated shell loads until an owned household resolves", () => {
  assert.deepEqual(
    resolvePlatformDataScope(
      { isAuthenticated: true, userId: "user-1" },
      {
        loading: true,
        context: {
          householdId: null,
          ownershipMode: "loading",
          guestFallbackActive: false,
        },
      }
    ),
    {
      authUserId: "user-1",
      householdId: null,
      ownershipMode: "loading",
      guestFallbackActive: false,
      canLoadShellData: false,
      scopeSource: "awaiting_owned_household",
    }
  );

  assert.deepEqual(
    resolvePlatformDataScope(
      { isAuthenticated: true, userId: "user-1" },
      {
        loading: false,
        context: {
          householdId: "household-1",
          ownershipMode: "authenticated_owned",
          guestFallbackActive: false,
        },
      }
    ),
    {
      authUserId: "user-1",
      householdId: "household-1",
      ownershipMode: "authenticated_owned",
      guestFallbackActive: false,
      canLoadShellData: true,
      scopeSource: "authenticated_owned",
    }
  );
});

runTest("resolveResponsiveLayout keeps phone widths in compact mode", () => {
  assert.equal(resolveResponsiveLayout(390).isMobile, true);
  assert.equal(resolveResponsiveLayout(430).isMobile, true);
  assert.equal(resolveResponsiveLayout(430).isTablet, true);
  assert.equal(resolveResponsiveLayout(1180).isDesktop, true);
});

runTest("snapshot payload builder carries parser version and structured parser payload for new saves", () => {
  const parserStructuredData = sanitizeParserStructuredData({
    extractionSummary: {
      document_type: "annual_statement",
      carrier_key: "protective",
      strategy_row_count: 1,
    },
    strategyRows: [
      {
        strategy_name: "S&P 500 Strategy",
        allocation_percent: 100,
        provenance: {
          method: "carrier_strategy_row",
          page: 2,
          document: "statement.pdf",
        },
      },
    ],
  });

  const payload = buildVaultedSnapshotPayload({
    policy_id: "policy-1",
    document_id: "doc-1",
    snapshot_type: "annual_statement",
    statement_date: "2024-12-31",
    normalized_policy: {},
    extraction_meta: {},
    completeness_assessment: {},
    carrier_profile: {},
    product_profile: {},
    strategy_reference_hits: [],
    parser_version: VAULTED_PARSER_VERSION,
    parser_structured_data: parserStructuredData,
  });

  assert.equal(payload.parser_version, VAULTED_PARSER_VERSION);
  assert.equal(payload.parser_structured_data.version, VAULTED_PARSER_VERSION);
  assert.equal(payload.parser_structured_data.strategyRows.length, 1);
});

runTest("rehydrateVaultedPolicyBundle keeps legacy snapshots readable without structured parser data", () => {
  const bundle = {
    policy: { id: "policy-1", updated_at: "2026-03-23T00:00:00Z" },
    documents: [],
    snapshots: [
      {
        id: "snapshot-1",
        snapshot_type: "baseline_illustration",
        normalized_policy: {
          policy_identity: {
            carrier_name: "F&G Life Insurance Company",
            product_name: "PathSetter",
            policy_type: "Indexed Universal Life",
            policy_number: "ABC12345",
            issue_date: "2020-01-01",
          },
          death_benefit: {
            death_benefit: {
              display_value: "$300,000.00",
            },
          },
          funding: {
            planned_premium: {
              display_value: "$5,000.00",
            },
          },
        },
        extraction_meta: {},
        completeness_assessment: {},
        carrier_profile: {},
        product_profile: {},
        strategy_reference_hits: [],
      },
    ],
    analytics: [],
    statements: [],
  };

  const rehydrated = rehydrateVaultedPolicyBundle(bundle);

  assert.equal(rehydrated.baseline_illustration.parserState.structuredDataPresent, false);
  assert.equal(rehydrated.readbackStatus.structuredDataPresent, false);
  assert.equal(rehydrated.readbackStatus.fallbackUsed, true);
  assert.equal(rehydrated.baseline_illustration.structuredData, null);
});

runTest("rehydrateVaultedPolicyBundle restores structured parser data for mixed-version saved policies", () => {
  const parserStructuredData = sanitizeParserStructuredData({
    extractionSummary: {
      document_type: "annual_statement",
      carrier_key: "protective",
      table_count: 1,
      strategy_row_count: 1,
    },
    pageTypes: [
      {
        page_number: 1,
        page_type: "statement_summary",
        confidence: "strong",
        matched_signals: ["Statement Summary"],
      },
    ],
    tables: [
      {
        page_number: 1,
        page_type: "statement_summary",
        quality: "strong",
        rows: [
          {
            policy_year: 10,
            account_value: 125000,
            cash_surrender_value: 114000,
            death_benefit: 300000,
          },
        ],
      },
    ],
    strategyRows: [
      {
        strategy_name: "S&P 500 Strategy",
        allocation_percent: 100,
        provenance: {
          method: "carrier_strategy_row",
          page: 2,
          document: "statement.pdf",
          confidence: "strong",
          candidates: [],
        },
      },
    ],
    failedPages: [],
  });

  const bundle = {
    policy: { id: "policy-2", updated_at: "2026-03-23T00:00:00Z" },
    documents: [
      {
        id: "doc-1",
        document_role: "illustration",
        file_name: "illustration.pdf",
      },
      {
        id: "doc-2",
        document_role: "annual_statement",
        file_name: "statement.pdf",
        statement_date: "2024-12-31",
      },
    ],
    snapshots: [
      {
        id: "snapshot-1",
        document_id: "doc-1",
        snapshot_type: "baseline_illustration",
        normalized_policy: {
          policy_identity: {
            carrier_name: "Protective Life Insurance Company",
            product_name: "Protective IUL",
            policy_type: "Indexed Universal Life",
            policy_number: "P1234567",
            issue_date: "2015-01-01",
          },
          death_benefit: {
            death_benefit: {
              display_value: "$300,000.00",
            },
          },
          funding: {
            planned_premium: {
              display_value: "$8,000.00",
            },
          },
        },
        extraction_meta: {},
        completeness_assessment: {},
        carrier_profile: { key: "protective", display_name: "Protective Life Insurance Company" },
        product_profile: {},
        strategy_reference_hits: [],
      },
      {
        id: "snapshot-2",
        document_id: "doc-2",
        snapshot_type: "annual_statement",
        statement_date: "2024-12-31",
        parser_version: VAULTED_PARSER_VERSION,
        parser_structured_data: parserStructuredData,
        normalized_policy: {
          policy_identity: {
            carrier_name: "Protective Life Insurance Company",
            product_name: "Protective IUL",
            policy_type: "Indexed Universal Life",
            policy_number: "P1234567",
          },
        },
        extraction_meta: {
          statement_date: { display_value: "December 31, 2024", confidence: "high" },
          index_strategy: { display_value: "S&P 500 Strategy", confidence: "high" },
        },
        completeness_assessment: {},
        carrier_profile: { key: "protective", display_name: "Protective Life Insurance Company" },
        product_profile: {},
        strategy_reference_hits: [],
      },
    ],
    analytics: [],
    statements: [
      {
        snapshot_id: "snapshot-2",
        statement_date: "2024-12-31",
        accumulation_value: 125000,
        cash_surrender_value: 114000,
        current_index_strategy: "S&P 500 Strategy",
        raw_statement_payload: {},
      },
    ],
  };

  const rehydrated = rehydrateVaultedPolicyBundle(bundle);

  assert.equal(rehydrated.statementResults.length, 1);
  assert.equal(rehydrated.statementResults[0].parserState.structuredDataPresent, true);
  assert.equal(rehydrated.statementResults[0].parserState.parserVersion, VAULTED_PARSER_VERSION);
  assert.equal(rehydrated.statementResults[0].structuredData.quality.statement, "strong");
  assert.equal(rehydrated.statementResults[0].structuredData.strategyRows[0].strategy_name, "S&P 500 Strategy");
  assert.equal(rehydrated.readbackStatus.structuredDataPresent, true);
  assert.equal(rehydrated.readbackStatus.fallbackUsed, false);
});

runTest("rehydrateStructuredParserData treats malformed structured payloads as unusable and falls back safely", () => {
  const malformed = rehydrateStructuredParserData({
    parser_version: VAULTED_PARSER_VERSION,
    parser_structured_data: {
      quality: "not-an-object",
      strategyRows: "bad",
      pageTypes: null,
      extractionSummary: [],
    },
  });

  assert.equal(malformed, null);

  const bundle = {
    policy: { id: "policy-bad", updated_at: "2026-03-23T00:00:00Z" },
    documents: [],
    snapshots: [
      {
        id: "snapshot-bad",
        snapshot_type: "baseline_illustration",
        parser_version: VAULTED_PARSER_VERSION,
        parser_structured_data: {
          quality: "not-an-object",
          strategyRows: "bad",
        },
        normalized_policy: {
          policy_identity: {
            carrier_name: "Carrier",
            policy_type: "Universal Life",
          },
          death_benefit: {},
          funding: {},
        },
        extraction_meta: {},
        completeness_assessment: {},
        carrier_profile: {},
        product_profile: {},
        strategy_reference_hits: [],
      },
    ],
    analytics: [],
    statements: [],
  };

  const rehydrated = rehydrateVaultedPolicyBundle(bundle);
  assert.equal(rehydrated.baseline_illustration.parserState.structuredDataPresent, false);
  assert.equal(rehydrated.baseline_illustration.parserState.fallbackUsed, true);
  assert.equal(rehydrated.readbackStatus.structuredDataPresent, false);
  assert.equal(rehydrated.readbackStatus.fallbackUsed, true);
});

runTest("structured access helpers normalize persisted strategy rows and respect fallback flags", () => {
  const snapshot = {
    structuredData: {
      version: VAULTED_PARSER_VERSION,
      quality: { strategy: "strong", statement: "moderate" },
      strategyRows: [
        {
          strategy_name: "S&P 500 Strategy",
          allocation_percent: 80,
          active: true,
          source_page_number: 2,
        },
        {
          strategy: "Fixed Account",
          allocation_percent: 20,
          menu_only: true,
          row_kind: "menu",
        },
      ],
    },
    parserState: {
      parserVersion: VAULTED_PARSER_VERSION,
      fallbackUsed: false,
    },
  };

  const structured = getStructuredData(snapshot);
  const strategies = getStructuredStrategyRows(snapshot);
  const support = hasStrongStructuredSupport(snapshot, "strategy");

  assert.equal(structured.present, true);
  assert.equal(structured.parserVersion, VAULTED_PARSER_VERSION);
  assert.equal(strategies.activeRows[0].strategy, "S&P 500 Strategy");
  assert.equal(strategies.menuRows[0].strategy, "Fixed Account");
  assert.equal(support.supported, true);
});

runTest("buildPolicyIntelligence prefers strong structured strategy rows and charge support", () => {
  const baseline = {
    fileName: "baseline.pdf",
    fields: {
      carrier_name: field("Symetra Life Insurance Company"),
      product_name: field("Symetra IUL"),
      policy_type: field("Indexed Universal Life"),
      policy_number: field("S1234"),
      issue_date: field("2018-01-01", "high", "January 1, 2018"),
      death_benefit: field(300000, "high", "$300,000.00"),
      planned_premium: field(8000, "high", "$8,000.00"),
    },
    structuredData: {
      quality: { ledger: "moderate" },
      extractionSummary: { document_type: "illustration", table_count: 1 },
      tables: [{ page_type: "illustration_ledger", quality: "moderate", rows: [] }],
    },
    illustrationProjection: { rows: [], benchmark_rows: [] },
    documentType: { document_type: "illustration" },
    carrierDetection: { confidence: "high" },
    pages: [],
  };

  const statement = {
    fileName: "statement.pdf",
    fields: {
      statement_date: field("2024-12-31", "high", "12/31/2024"),
      policy_year: field(10, "high", "10"),
      accumulation_value: field(70000, "high", "$70,000.00"),
      cash_value: field(68000, "high", "$68,000.00"),
      cash_surrender_value: field(64000, "high", "$64,000.00"),
      loan_balance: field(0, "high", "$0.00"),
      index_strategy: field("Legacy Heuristic Strategy", "medium", "Legacy Heuristic Strategy"),
      cost_of_insurance: field(900, "medium", "$900.00"),
    },
    structuredData: {
      quality: { statement: "strong", strategy: "strong" },
      extractionSummary: { document_type: "annual_statement", strategy_row_count: 2 },
      strategyRows: [
        { strategy_name: "S&P 500 Strategy", allocation_percent: 75, cap_rate: 11, active: true, row_kind: "active" },
        { strategy_name: "Fixed Account", allocation_percent: 25, menu_only: true, row_kind: "menu" },
      ],
      tables: [
        {
          page_type: "charges_table",
          quality: "strong",
          rows: [
            { key: "cost_of_insurance", value: 1200, label: "Cost of Insurance" },
            { key: "monthly_deduction", value: 300, label: "Monthly Deduction" },
          ],
        },
      ],
    },
    parserState: {
      parserVersion: VAULTED_PARSER_VERSION,
      fallbackUsed: false,
    },
    documentType: { document_type: "annual_statement" },
    carrierDetection: { confidence: "high" },
    pages: [],
  };

  const intelligence = buildPolicyIntelligence({
    baseline,
    statements: [statement],
    legacyAnalytics: {
      total_policy_charges: { value: 1500 },
      charge_analysis: {},
      policy_health_score: { value: { value: 7, label: "Stable", factors: [] } },
    },
  });

  assert.equal(intelligence.normalizedPolicy.strategy.current_index_strategy, "S&P 500 Strategy");
  assert.equal(intelligence.normalizedPolicy.strategy.strategy_source_evidence, "structured_strategy_rows_active");
  assert.equal(intelligence.normalizedPolicy.strategy.strategy_confidence, "strong");
  assert.equal(intelligence.normalizedAnalytics.charge_summary.coi_confidence, "strong");
  assert.equal(intelligence.normalizedAnalytics.structured_debug.structured_strategy_used, true);
  assert.equal(intelligence.normalizedAnalytics.comparison_summary.comparison_debug.structured_data_present, true);
});

runTest("buildPolicyIntelligence falls back when structured support is missing or weak", () => {
  const baseline = {
    fileName: "baseline.pdf",
    fields: {
      carrier_name: field("Carrier"),
      product_name: field("Product"),
      policy_type: field("Indexed Universal Life"),
      policy_number: field("P1"),
      issue_date: field("2018-01-01", "high", "January 1, 2018"),
      death_benefit: field(250000, "high", "$250,000.00"),
      planned_premium: field(5000, "high", "$5,000.00"),
    },
    structuredData: null,
    illustrationProjection: { rows: [], benchmark_rows: [] },
    documentType: { document_type: "illustration" },
    carrierDetection: { confidence: "high" },
    pages: [],
  };
  const statement = {
    fileName: "statement.pdf",
    fields: {
      statement_date: field("2024-12-31", "high", "12/31/2024"),
      accumulation_value: field(50000, "high", "$50,000.00"),
      cash_value: field(49000, "high", "$49,000.00"),
      cash_surrender_value: field(47000, "high", "$47,000.00"),
      loan_balance: field(0, "high", "$0.00"),
      index_strategy: field("Heuristic Strategy", "high", "Heuristic Strategy"),
    },
    structuredData: {
      quality: { strategy: "weak" },
      strategyRows: [],
      tables: [],
    },
    parserState: {
      parserVersion: VAULTED_PARSER_VERSION,
      fallbackUsed: true,
    },
    documentType: { document_type: "annual_statement" },
    carrierDetection: { confidence: "high" },
    pages: [],
  };

  const intelligence = buildPolicyIntelligence({
    baseline,
    statements: [statement],
    legacyAnalytics: { charge_analysis: {}, policy_health_score: { value: { value: 5, label: "Limited", factors: [] } } },
  });

  assert.equal(intelligence.normalizedPolicy.strategy.current_index_strategy, "Heuristic Strategy");
  assert.equal(intelligence.normalizedAnalytics.structured_debug.structured_strategy_used, false);
  assert.equal(intelligence.normalizedPolicy.extraction_meta.fallback_used, false);
});

runTest("comparison analysis reflects uneven structured support across mixed-version policies", () => {
  const analysis = buildPolicyComparisonAnalysis(
    {
      policy_id: "legacy",
      product: "Legacy Policy",
      latest_statement_date: "2024-12-31",
      structured_data_present: false,
      coi_confidence: "moderate",
      charge_visibility_status: "moderate",
      strategy_visibility: "basic",
      missing_fields: [],
      continuity_score: 70,
    },
    {
      policy_id: "structured",
      product: "Structured Policy",
      latest_statement_date: "2024-12-31",
      structured_data_present: true,
      parser_version: VAULTED_PARSER_VERSION,
      coi_confidence: "moderate",
      charge_visibility_status: "moderate",
      strategy_visibility: "moderate",
      missing_fields: [],
      continuity_score: 70,
    }
  );

  assert.equal(analysis.analysis_items.find((item) => item.id === "statement_support").stronger_policy, "comparison");
  assert.equal(analysis.summary.includes("uneven structured parser support"), true);
});

runTest("buildIulV2Analytics explains illustration drift and funding pressure responsibly", () => {
  const result = buildIulV2Analytics({
    lifePolicy: {
      funding: {
        plannedPremium: "$5,000.00",
        totalPremiumPaid: 3600,
      },
      values: {
        accumulationValue: "$70,000.00",
        cashValue: "$66,000.00",
      },
      loans: {
        loanBalance: "$25,000.00",
      },
      typeSpecific: {
        strategy: "S&P 500 Strategy",
        allocationPercent: "100%",
        capRate: "11%",
        participationRate: "100%",
        spread: "0%",
      },
      meta: {
        statementCount: 1,
      },
    },
    normalizedAnalytics: {
      illustration_projection: {
        comparison_possible: true,
        current_projection_match: {
          matched_policy_year: 10,
          actual_policy_year: 10,
          projected_accumulation_value: "$82,000.00",
          actual_accumulation_value: "$70,000.00",
          accumulation_variance: -12000,
        },
        narrative: "Actual accumulation value is trailing the extracted illustration checkpoint by $12,000.00.",
        limitations: [],
      },
      charge_summary: {
        total_coi: 2800,
        total_visible_policy_charges: 7400,
        coi_confidence: "strong",
      },
      growth_attribution: {
        visible_total_premium_paid: 3600,
      },
    },
    statementRows: [
      {
        statement_date: "2024-12-31",
        visible_charges: 1800,
        loan_balance: 25000,
      },
    ],
  });

  assert.equal(result.illustrationComparison.status, "behind");
  assert.equal(result.chargeAnalysis.chargeDragLevel, "high");
  assert.equal(result.fundingAnalysis.status, "underfunded");
  assert.equal(result.riskAnalysis.overallRisk, "high");
});

runTest("buildIulV2Analytics stays indeterminate when illustration alignment is weak", () => {
  const result = buildIulV2Analytics({
    lifePolicy: {
      funding: {
        plannedPremium: "$5,000.00",
      },
      values: {
        accumulationValue: "$42,000.00",
      },
      loans: {},
      typeSpecific: {},
      meta: {
        statementCount: 0,
      },
    },
    normalizedAnalytics: {
      charge_summary: {
        total_coi: null,
        total_visible_policy_charges: null,
        coi_confidence: "weak",
      },
      illustration_projection: {
        comparison_possible: false,
        narrative: "Illustration checkpoints were identified, but the latest statement does not align cleanly enough by policy year for a direct projected-versus-actual comparison.",
      },
    },
    statementRows: [],
  });

  assert.equal(result.illustrationComparison.status, "indeterminate");
  assert.equal(result.fundingAnalysis.status, "unclear");
  assert.equal(result.riskAnalysis.overallRisk, "unclear");
  assert.equal(
    result.missingData.some((item) => item.includes("charges")) ||
      result.missingData.some((item) => item.includes("Strategy allocation percentages")),
    true
  );
});

runTest("normalizeExplicitVaultedPolicyScope blocks unresolved authenticated account scopes", () => {
  const blocked = normalizeExplicitVaultedPolicyScope({
    userId: null,
    householdId: "household-1",
    ownershipMode: "authenticated_owned",
    guestFallbackActive: false,
    source: "test_scope",
  });

  assert.equal(blocked.blocked, true);
  assert.equal(blocked.mode, "blocked");
  assert.equal(blocked.source, "test_scope_missing_user");
});

runTest("normalizeExplicitVaultedPolicyScope blocks guest-shared overrides without a user id", () => {
  const guestScope = normalizeExplicitVaultedPolicyScope({
    userId: null,
    ownershipMode: "guest_shared",
    guestFallbackActive: true,
    source: "guest_test_scope",
  });

  assert.equal(guestScope.blocked, true);
  assert.equal(guestScope.mode, "blocked");
  assert.equal(guestScope.source, "guest_test_scope_missing_user");
});

console.log("All IUL regression checks passed.");
