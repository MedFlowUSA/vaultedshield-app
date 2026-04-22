import assert from "node:assert/strict";

import {
  buildPolicyIntelligence,
  buildPolicyComparisonAnalysis,
} from "../src/lib/domain/intelligenceEngine.js";
import { buildPolicyAdequacyReview } from "../src/lib/domain/insurance/insuranceIntelligence.js";
import { buildPolicySignals } from "../src/lib/domain/insurance/policySignalsEngine.js";
import { buildPolicySignals as buildPolicySignalSummary } from "../src/lib/policySignals/buildPolicySignals.js";
import { buildPortfolioActionFeed } from "../src/lib/policySignals/buildPortfolioActionFeed.js";
import { buildPortfolioSignals } from "../src/lib/policySignals/buildPortfolioSignals.js";
import { buildPropertySignals } from "../src/lib/propertySignals/buildPropertySignals.js";
import { buildPropertyActionFeed } from "../src/lib/propertySignals/buildPropertyActionFeed.js";
import { buildRetirementSignals } from "../src/lib/retirementSignals/buildRetirementSignals.js";
import { buildRetirementActionFeed } from "../src/lib/retirementSignals/buildRetirementActionFeed.js";
import {
  buildPolicyAiAssistantResponse,
  classifyPolicyAiAssistantIntent,
} from "../src/lib/policyAi/policyAiAssistantModule.js";
import {
  POLICY_QUESTION_TYPES,
  classifyPolicyQuestionType,
} from "../src/utils/policyQuestionClassifier.js";
import { generatePolicyResponse } from "../src/utils/policyResponseEngine.js";
import {
  MORTGAGE_QUESTION_TYPES,
  classifyMortgageQuestionType,
} from "../src/utils/mortgageQuestionClassifier.js";
import { generateMortgageResponse } from "../src/utils/mortgageResponseEngine.js";
import {
  PROPERTY_QUESTION_TYPES,
  classifyPropertyQuestionType,
} from "../src/utils/propertyQuestionClassifier.js";
import { generatePropertyResponse } from "../src/utils/propertyResponseEngine.js";
import { routeGlobalAssistantRequest } from "../src/utils/globalAssistantRouter.js";
import { runPolicyAiAssistant } from "../src/utils/runPolicyAiAssistant.js";
import { runPortfolioAiAssistant } from "../src/utils/runPortfolioAiAssistant.js";
import { runPropertyAiAssistant } from "../src/utils/runPropertyAiAssistant.js";
import { runRetirementAiAssistant } from "../src/utils/runRetirementAiAssistant.js";
import {
  buildHouseholdPriorityEngine,
  buildHouseholdScorecard,
} from "../src/lib/domain/platformIntelligence/householdOperatingSystem.js";
import { answerHouseholdQuestion } from "../src/lib/domain/platformIntelligence/householdIntelligenceEngine.js";
import {
  applyReviewWorkspaceFilters,
  buildHouseholdAssistantReviewActions,
  buildReviewWorkspaceRoute,
  deriveReviewWorkspaceCandidateFromQueueItem,
  parseReviewWorkspaceHashState,
} from "../src/lib/reviewWorkspace/workspaceFilters.js";
import {
  annotateReviewWorkflowItems,
  buildPersistedReviewWorkflowState,
  buildReviewWorkflowStateEntry,
  getHouseholdReviewWorkflowState,
  primeHouseholdReviewWorkflowState,
} from "../src/lib/domain/platformIntelligence/reviewWorkflowState.js";
import { buildWorkflowAwareHouseholdContext } from "../src/lib/domain/platformIntelligence/workflowMemory.js";
import { normalizeIssueInput } from "../src/lib/domain/issues/issueTypes.js";
import {
  findExistingHouseholdIssueByIdentity,
  ignoreHouseholdIssue,
  listHouseholdIssueEvents,
  listOpenIssuesForAsset,
  listOpenIssuesForHousehold,
  listRecentReopenedIssuesForHousehold,
  listRecentResolvedIssuesForHousehold,
  resolveHouseholdIssue,
  upsertHouseholdIssue,
} from "../src/lib/supabase/issueData.js";
import {
  buildDetectedIssues,
  buildDetectedIssuesFingerprint,
} from "../src/lib/intelligence/issues/buildDetectedIssues.js";
import { syncDetectedIssues } from "../src/lib/intelligence/issues/syncDetectedIssues.js";
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
import { buildPolicyAssistantAnswer } from "../src/lib/ai/policyAssistantEngine.js";
import { buildPolicyInsightSummary } from "../src/lib/ai/policyInsightEngine.js";
import { buildIulV2Analytics } from "../src/lib/insurance/iulV2Analytics.js";
import { normalizeLifePolicy } from "../src/lib/insurance/normalizeLifePolicy.js";
import { resolveResponsiveLayout } from "../src/lib/ui/responsiveLayout.js";
import { normalizeHashPath } from "../src/lib/navigation/useHashRoute.js";
import {
  clearAuthLandingStateFromUrl,
  getAuthLandingState,
  hasAuthLandingState,
} from "../src/lib/auth/authLandingState.js";
import {
  clearVaultedShieldSessionArtifacts,
  consumeAccountDeletionFlash,
  normalizeAccountDeletionPayload,
  requiresDeletionReauth,
  setAccountDeletionFlash,
} from "../src/lib/auth/requestAccountDeletion.js";
import { assembleModuleBundle } from "../src/lib/supabase/moduleBundleState.js";

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

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function withWindowMock(windowMock, fn) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  globalThis.window = windowMock;
  globalThis.document = windowMock?.document || { title: "VaultedShield" };

  try {
    fn();
  } finally {
    if (typeof previousWindow === "undefined") {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }

    if (typeof previousDocument === "undefined") {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  key(index) {
    return [...this.values.keys()][index] || null;
  }

  removeItem(key) {
    this.values.delete(key);
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
}

function createIssueSupabaseDouble({ rows = [], currentUserId = "user-1" } = {}) {
  const state = {
    rows: rows.map((row) => ({ ...row })),
    issueEvents: [],
    currentUserId,
    nextId: rows.length + 1,
    nextEventId: 1,
  };

  function cloneRow(row) {
    return row ? { ...row } : row;
  }

  function applyRowFilters(rowsToFilter, filters = []) {
    return rowsToFilter.filter((row) =>
      filters.every((filter) => {
        if (filter.operator === "is") {
          return (row?.[filter.column] ?? null) === filter.value;
        }
        if (filter.operator === "in") {
          return Array.isArray(filter.value) && filter.value.includes(row?.[filter.column]);
        }
        return row?.[filter.column] === filter.value;
      })
    );
  }

  function applyRowOrder(rowsToSort, orders = []) {
    const nextRows = [...rowsToSort];
    for (let index = orders.length - 1; index >= 0; index -= 1) {
      const order = orders[index];
      nextRows.sort((left, right) => {
        const leftValue = left?.[order.column] ?? null;
        const rightValue = right?.[order.column] ?? null;
        if (leftValue === rightValue) return 0;
        if (leftValue === null) return 1;
        if (rightValue === null) return -1;
        if (leftValue > rightValue) return order.ascending ? 1 : -1;
        return order.ascending ? -1 : 1;
      });
    }
    return nextRows;
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.action = "select";
      this.filters = [];
      this.orders = [];
      this.limitCount = null;
      this.payload = null;
      this.selectColumns = "*";
    }

    select(columns = "*") {
      this.selectColumns = columns;
      return this;
    }

    eq(column, value) {
      this.filters.push({ column, value, operator: "eq" });
      return this;
    }

    is(column, value) {
      this.filters.push({ column, value, operator: "is" });
      return this;
    }

    in(column, value) {
      this.filters.push({ column, value, operator: "in" });
      return this;
    }

    order(column, { ascending = false } = {}) {
      this.orders.push({ column, ascending });
      return this;
    }

    limit(count) {
      this.limitCount = count;
      return this;
    }

    insert(payload) {
      this.action = "insert";
      this.payload = Array.isArray(payload) ? payload : [payload];
      return this;
    }

    update(payload) {
      this.action = "update";
      this.payload = { ...payload };
      return this;
    }

    async execute() {
      if (!["household_issues", "household_issue_events"].includes(this.table)) {
        return {
          data: null,
          error: new Error(`Unsupported fake table ${this.table}`),
        };
      }

      const targetRows = this.table === "household_issue_events" ? state.issueEvents : state.rows;
      const nextIdKey = this.table === "household_issue_events" ? "nextEventId" : "nextId";
      const idPrefix = this.table === "household_issue_events" ? "issue-event" : "issue";

      if (this.action === "insert") {
        const insertedRows = this.payload.map((entry) => {
          const timestamp = entry.updated_at || entry.last_detected_at || entry.created_at || new Date().toISOString();
          const row = {
            id: entry.id || `${idPrefix}-${state[nextIdKey]++}`,
            created_at: entry.created_at || timestamp,
            updated_at: timestamp,
            ...entry,
          };
          targetRows.push(row);
          return cloneRow(row);
        });
        return { data: insertedRows, error: null };
      }

      if (this.action === "update") {
        const matchingRows = applyRowFilters(targetRows, this.filters);
        const updatedRows = matchingRows.map((row) => {
          const nextRow = {
            ...row,
            ...this.payload,
            updated_at: this.payload.updated_at || new Date().toISOString(),
          };
          const rowIndex = targetRows.findIndex((entry) => entry.id === row.id);
          targetRows[rowIndex] = nextRow;
          return cloneRow(nextRow);
        });
        return { data: updatedRows, error: null };
      }

      let selectedRows = applyRowFilters(targetRows, this.filters).map(cloneRow);
      selectedRows = applyRowOrder(selectedRows, this.orders);
      if (Number.isInteger(this.limitCount)) {
        selectedRows = selectedRows.slice(0, this.limitCount);
      }
      return { data: selectedRows, error: null };
    }

    async maybeSingle() {
      const result = await this.execute();
      if (result.error) return result;
      if (!Array.isArray(result.data) || result.data.length === 0) {
        return { data: null, error: null };
      }
      if (result.data.length > 1) {
        return {
          data: null,
          error: new Error(`Expected a single ${this.table} row but found multiple.`),
        };
      }
      return { data: result.data[0], error: null };
    }

    async single() {
      const result = await this.execute();
      if (result.error) return result;
      if (!Array.isArray(result.data) || result.data.length !== 1) {
        return {
          data: null,
          error: new Error(`Expected a single ${this.table} row.`),
        };
      }
      return { data: result.data[0], error: null };
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    from(table) {
      return new QueryBuilder(table);
    },
    auth: {
      async getUser() {
        return {
          data: {
            user: state.currentUserId ? { id: state.currentUserId } : null,
          },
          error: null,
        };
      },
    },
    __state: state,
  };
}

function buildPropertyMissingHomeownersDetectionContext({
  householdId = "H1",
  properties = [
    {
      id: "property-1",
      asset_id: "A1",
      property_name: "Primary Residence",
      address_line_1: "123 Main St",
      city: "San Jose",
      state: "CA",
    },
  ],
} = {}) {
  return {
    householdId,
    intelligence: {
      review_flags: ["properties_missing_homeowners_link"],
    },
    bundle: {
      household: { id: householdId },
      propertyStackSummary: {
        propertiesMissingHomeownersLink: properties,
      },
      portalReadiness: {
        criticalAssetsWithoutLinkedPortals: [],
      },
      retirementAccounts: [],
      retirementSummary: {
        retirementDocumentsByAccountId: {},
      },
      warranties: [],
      warrantySummary: {
        warrantyDocumentsById: {},
      },
      documentCountsByCategory: {
        estate: 1,
      },
      emergencyContacts: [{ id: "contact-1" }],
      keyProfessionalContacts: [{ id: "contact-2" }],
    },
    savedPolicyRows: [],
  };
}

function buildAllSignalDetectionContext({ householdId = "H1" } = {}) {
  return {
    householdId,
    intelligence: {
      review_flags: [
        "properties_missing_homeowners_link",
        "missing_retirement_docs",
        "missing_estate_docs",
        "household_contacts_sparse",
        "warranties_missing_proof_of_purchase_prompt",
      ],
    },
    bundle: {
      household: { id: householdId },
      propertyStackSummary: {
        propertiesMissingHomeownersLink: [
          {
            id: "property-1",
            asset_id: "asset-property-1",
            property_name: "Primary Residence",
            address_line_1: "123 Main St",
            city: "San Jose",
            state: "CA",
          },
        ],
      },
      portalReadiness: {
        criticalAssetsWithoutLinkedPortals: [
          {
            id: "asset-portal-1",
            asset_name: "Primary Home",
            asset_category: "property",
          },
        ],
      },
      retirementAccounts: [
        {
          id: "retirement-1",
          asset_id: "asset-retirement-1",
          account_name: "401(k)",
          provider_name: "Fidelity",
        },
      ],
      retirementSummary: {
        retirementDocumentsByAccountId: {},
      },
      warranties: [
        {
          id: "warranty-1",
          asset_id: "asset-warranty-1",
          covered_item_name: "Kitchen Refrigerator",
          provider_name: "Best Buy",
        },
      ],
      warrantySummary: {
        warrantyDocumentsById: {},
      },
      documentCountsByCategory: {
        estate: 0,
      },
      emergencyContacts: [],
      keyProfessionalContacts: [],
    },
    savedPolicyRows: [
      {
        policy_id: "policy-1",
        carrier: "Mutual Life",
        product: "Accumulator UL",
        latest_statement_date: null,
        continuity_score: 41,
      },
    ],
  };
}

function buildHouseholdAssistantFixture({
  includeAssets = true,
  includeDocuments = true,
  includePortals = true,
} = {}) {
  const householdMap = {
    bottom_line:
      "Household continuity is usable, but protection linkage and support records still need review.",
    overall_score: includeAssets ? 61 : 24,
    overall_status: includeAssets ? "Moderate" : "At Risk",
    visibility_gaps: includeAssets
      ? [
          "Some property and protection records are not yet fully connected.",
          "Document support is still uneven across the visible household file.",
        ]
      : [
          "Core household records are still sparse.",
          "Document support is still missing across the current household file.",
        ],
    strength_signals: includeAssets
      ? ["Insurance visibility is present enough to support targeted review."]
      : [],
    focus_areas: [
      {
        key: "cross_asset_alignment",
        title: "Cross-Asset Alignment",
        score: includeAssets ? 58 : 20,
        status: includeAssets ? "Moderate" : "Weak",
        summary: "Cross-module records are only partially aligned right now.",
        route: "/dashboard",
        action_label: "Open household review",
        metrics: [{ label: "Priority issues", value: includeAssets ? 1 : 0 }],
      },
      {
        key: "insurance_review_strength",
        title: "Insurance Review Strength",
        score: includeAssets ? 66 : 28,
        status: includeAssets ? "Moderate" : "Weak",
        summary: "Insurance support is usable but still not complete.",
        route: "/insurance",
        action_label: "Open insurance review",
        metrics: [{ label: "Weak continuity", value: includeAssets ? 1 : 0 }],
      },
      {
        key: "property_debt_linkage",
        title: "Property / Debt Linkage",
        score: includeAssets ? 52 : 18,
        status: includeAssets ? "Moderate" : "Weak",
        summary: "Property and debt relationships still need cleanup.",
        route: "/property",
        action_label: "Open property review",
        metrics: [{ label: "Linked properties", value: includeAssets ? 1 : 0 }],
      },
      {
        key: "document_readiness",
        title: "Document Readiness",
        score: includeDocuments ? 57 : 12,
        status: includeDocuments ? "Moderate" : "Weak",
        summary: "Document readiness is improving, but coverage is still uneven.",
        route: "/upload-center",
        action_label: "Open document review",
        metrics: [{ label: "Documents", value: includeDocuments ? 2 : 0 }],
      },
      {
        key: "continuity_operations",
        title: "Continuity Operations",
        score: includePortals ? 60 : 14,
        status: includePortals ? "Moderate" : "Weak",
        summary: "Portal and access continuity remain in progress.",
        route: "/portals",
        action_label: "Open portal review",
        metrics: [{ label: "Portals", value: includePortals ? 1 : 0 }],
      },
    ],
    dependency_signals: {
      alignment_strength: {
        score: includeAssets ? 54 : 18,
        status: includeAssets ? "Moderate" : "Weak",
      },
      dependency_flags: includeAssets
        ? [
            {
              key: "property-coverage-gap",
              title: "Property protection linkage is incomplete",
              explanation: "A property record is visible without linked homeowners protection.",
              supporting_evidence: ["Primary property does not yet show linked homeowners coverage."],
              route: "/property",
              action_label: "Open property stack review",
            },
          ]
        : [],
      priority_issues: includeAssets
        ? [
            {
              id: "property-stack-gap",
              label: "Review property stack linkage",
              summary: "A primary property record is missing linked homeowners protection.",
              change_signal: "Property continuity remains partial until protection is linked.",
              route: "/property",
              action_label: "Open property stack review",
              priority_score: 86,
            },
          ]
        : [],
    },
  };

  const bundle = {
    assets: includeAssets ? [{ id: "asset-1", asset_category: "property" }] : [],
    documents: includeDocuments ? [{ id: "doc-1" }, { id: "doc-2" }] : [],
    portalReadiness: {
      portalCount: includePortals ? 1 : 0,
      missingRecoveryCount: includePortals ? 0 : 1,
    },
    propertyStackSummary: {
      propertyCount: includeAssets ? 1 : 0,
      mortgageCount: includeAssets ? 1 : 0,
      homeownersCount: includeAssets ? 0 : 0,
      assetGraphSummary: {
        completePropertyAssetGraph: [],
        partialPropertyAssetGraph: includeAssets ? [{ id: "property-1" }] : [],
        propertiesMissingAssetGraphHomeownersLink: includeAssets ? [{ id: "property-1" }] : [],
        propertiesMissingAssetGraphMortgageLink: [],
      },
      propertiesMissingHomeownersLink: includeAssets ? [{ id: "property-1" }] : [],
      propertiesMissingMortgageLink: [],
    },
  };

  const reviewDigest = {
    summary: includeAssets
      ? "One active household review item is limiting a cleaner continuity read."
      : "No saved review digest is available yet.",
    reopened_count: 0,
    improved_count: 0,
    active_count: includeAssets ? 1 : 0,
    bullets: includeAssets
      ? ["Property protection linkage is still missing from the current household stack."]
      : [],
  };

  const queueItems = includeAssets
    ? [
        {
          id: "queue-1",
          label: "Primary property stack",
          summary: "Protection linkage is still missing from the main property stack.",
          route: "/property",
          action_label: "Open property stack review",
          workflow_status: "open",
          workflow_label: "Open",
          changed_since_review: false,
          workflow_assignee_label: "Unassigned",
          workflow_assignee_key: "",
        },
      ]
    : [];

  const scorecard = buildHouseholdScorecard(householdMap);
  const priorityEngine = buildHouseholdPriorityEngine({
    householdMap,
    commandCenter: { blockers: [] },
    housingCommand: { blockers: [] },
    emergencyAccessCommand: { blockers: [] },
    bundle,
  });

  return {
    householdMap,
    bundle,
    reviewDigest,
    queueItems,
    scorecard,
    priorityEngine,
  };
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

runTest("buildPolicySignals promotes visible loan and charge pressure into an at-risk signal", () => {
  const signals = buildPolicySignals({
    comparisonSummary: {
      cash_value: "$100,000",
      loan_balance: "$42,000",
      total_coi: "$9,500",
      coi_ratio: "9.5%",
      charge_drag_ratio: "13%",
      charge_visibility_status: "moderate",
      coi_confidence: "strong",
      latest_statement_date: "2025-12-31",
      missing_fields: [],
    },
  });

  assert.equal(signals.policy_signal, "at_risk");
  assert.equal(signals.risk_flags.some((item) => item.includes("Loan balance")), true);
  assert.equal(signals.signal_reasons.length > 0, true);
});

runTest("buildPolicySignals keeps stable supported rows healthy", () => {
  const signals = buildPolicySignals({
    comparisonSummary: {
      cash_value: "$150,000",
      surrender_value: "$148,000",
      loan_balance: "$0",
      premium: "$8,000",
      total_coi: "$1,500",
      total_visible_policy_charges: "$2,100",
      coi_ratio: "1%",
      charge_drag_ratio: "2%",
      charge_visibility_status: "strong",
      coi_confidence: "strong",
      strategy_visibility: "strong",
      data_completeness_status: "strong",
      policy_health_status: "strong",
      latest_statement_date: "2025-12-31",
      missing_fields: [],
      continuity_score: 92,
    },
  });

  assert.equal(signals.policy_signal, "healthy");
  assert.equal(signals.confidence, "high");
});

runTest("buildPolicySignalSummary returns a healthy product signal", () => {
  const signal = buildPolicySignalSummary({
    policyInterpretation: {
      performance_assessment: { status: "performing_well" },
      growth_summary: "Cash value support appears stable.",
    },
    trendSummary: {
      periods_count: 2,
      summary: "Cash value increased modestly across the visible statement period.",
    },
    comparisonData: {
      cash_value: "$150,000",
      loan_balance: "$0",
      charge_drag_ratio: "2%",
      charge_visibility_status: "strong",
      latest_statement_date: "2025-12-31",
      missing_fields: [],
    },
  });

  assert.equal(signal.signalLevel, "healthy");
  assert.equal(signal.flags.loanRisk, false);
  assert.equal(signal.confidence >= 0.7, true);
});

runTest("buildPolicySignalSummary returns a monitor product signal", () => {
  const signal = buildPolicySignalSummary({
    policyInterpretation: {
      performance_assessment: { status: "mixed_needs_review" },
    },
    trendSummary: {
      periods_count: 1,
      summary: "The current read is usable but mixed.",
    },
    comparisonData: {
      cash_value: "$100,000",
      loan_balance: "$5,000",
      charge_drag_ratio: "7%",
      charge_visibility_status: "moderate",
      latest_statement_date: "2025-12-31",
      missing_fields: ["index_strategy"],
    },
  });

  assert.equal(signal.signalLevel, "monitor");
  assert.equal(signal.flags.chargeDrag, true);
  assert.equal(signal.reasons.length > 0, true);
});

runTest("buildPolicySignalSummary returns an at-risk product signal", () => {
  const signal = buildPolicySignalSummary({
    trendSummary: {
      periods_count: 2,
      summary: "Cash value is trailing illustration.",
    },
    comparisonData: {
      cash_value: "$100,000",
      loan_balance: "$42,000",
      charge_drag_ratio: "14%",
      latest_statement_date: "2025-12-31",
      missing_fields: [],
    },
  });

  assert.equal(signal.signalLevel, "at_risk");
  assert.equal(signal.flags.loanRisk, true);
  assert.equal(signal.flags.chargeDrag, true);
});

runTest("buildPolicySignalSummary downgrades incomplete policy evidence", () => {
  const signal = buildPolicySignalSummary({
    comparisonData: {
      missing_fields: ["cash_value", "loan_balance", "latest_statement_date", "total_coi", "planned_premium", "index_strategy"],
    },
  });

  assert.equal(signal.signalLevel, "at_risk");
  assert.equal(signal.flags.incompleteData, true);
  assert.equal(signal.reasons.some((reason) => reason.includes("Critical policy evidence")), true);
});

runTest("buildPortfolioSignals returns a healthy portfolio signal", () => {
  const policies = [
    {
      policy_id: "policy-1",
      product: "Stable Policy A",
      carrier: "Carrier A",
      continuity_score: 92,
      policySignals: {
        signalLevel: "healthy",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.88,
      },
    },
    {
      policy_id: "policy-2",
      product: "Stable Policy B",
      carrier: "Carrier B",
      continuity_score: 89,
      policySignals: {
        signalLevel: "healthy",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.84,
      },
    },
  ];
  const signal = buildPortfolioSignals({ policies });

  assert.equal(signal.portfolioSignalLevel, "healthy");
  assert.equal(signal.totals.healthyCount, 2);
  assert.equal(signal.priorityPolicyIds.length > 0, true);
});

runTest("buildPortfolioSignals returns a mixed monitor portfolio signal", () => {
  const policies = [
    {
      policy_id: "policy-1",
      product: "Watch Policy",
      carrier: "Carrier A",
      continuity_score: 68,
      missing_fields: ["index_strategy"],
      policySignals: {
        signalLevel: "monitor",
        flags: {
          fundingPressure: false,
          chargeDrag: true,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.7,
      },
    },
    {
      policy_id: "policy-2",
      product: "Stable Policy",
      carrier: "Carrier B",
      continuity_score: 86,
      policySignals: {
        signalLevel: "healthy",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.82,
      },
    },
  ];
  const signal = buildPortfolioSignals({ policies });

  assert.equal(signal.portfolioSignalLevel, "monitor");
  assert.equal(signal.totals.monitorCount, 1);
  assert.equal(signal.portfolioFlags.chargeDragRisk, true);
});

runTest("buildPortfolioSignals returns an at-risk portfolio signal and selects priority policy", () => {
  const policies = [
    {
      policy_id: "policy-risk-1",
      product: "Risk Policy One",
      carrier: "Carrier A",
      continuity_score: 34,
      missing_fields: ["cash_value", "loan_balance", "latest_statement_date"],
      policySignals: {
        signalLevel: "at_risk",
        flags: {
          fundingPressure: true,
          chargeDrag: true,
          loanRisk: true,
          incompleteData: true,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.42,
      },
    },
    {
      policy_id: "policy-risk-2",
      product: "Risk Policy Two",
      carrier: "Carrier A",
      continuity_score: 45,
      missing_fields: ["index_strategy", "planned_premium"],
      policySignals: {
        signalLevel: "at_risk",
        flags: {
          fundingPressure: true,
          chargeDrag: false,
          loanRisk: true,
          incompleteData: false,
          illustrationVarianceRisk: true,
          concentrationRisk: true,
        },
        confidence: 0.5,
      },
    },
    {
      policy_id: "policy-healthy",
      product: "Healthy Policy",
      carrier: "Carrier B",
      continuity_score: 90,
      policySignals: {
        signalLevel: "healthy",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.9,
      },
    },
  ];
  const signal = buildPortfolioSignals({ policies });

  assert.equal(signal.portfolioSignalLevel, "at_risk");
  assert.equal(signal.priorityPolicyIds[0], "policy-risk-1");
  assert.equal(signal.totals.atRiskCount, 2);
});

runTest("buildPortfolioSignals identifies strongest and weakest policies deterministically", () => {
  const policies = [
    {
      policy_id: "policy-strongest",
      product: "Strongest Policy",
      continuity_score: 94,
      policySignals: {
        signalLevel: "healthy",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.92,
      },
    },
    {
      policy_id: "policy-middle",
      product: "Middle Policy",
      continuity_score: 71,
      policySignals: {
        signalLevel: "monitor",
        flags: {
          fundingPressure: false,
          chargeDrag: true,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.66,
      },
    },
    {
      policy_id: "policy-weakest",
      product: "Weakest Policy",
      continuity_score: 38,
      policySignals: {
        signalLevel: "at_risk",
        flags: {
          fundingPressure: true,
          chargeDrag: true,
          loanRisk: true,
          incompleteData: true,
          illustrationVarianceRisk: true,
          concentrationRisk: false,
        },
        confidence: 0.4,
      },
    },
  ];
  const signal = buildPortfolioSignals({ policies });

  assert.equal(signal.strongestPolicyIds[0], "policy-strongest");
  assert.equal(signal.weakestPolicyIds[0], "policy-weakest");
});

runTest("buildPortfolioSignals downgrades when incomplete data spreads across portfolio", () => {
  const policies = [
    {
      policy_id: "policy-a",
      product: "Policy A",
      continuity_score: 55,
      missing_fields: ["cash_value", "loan_balance", "latest_statement_date", "total_coi"],
      policySignals: {
        signalLevel: "monitor",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: true,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.48,
      },
    },
    {
      policy_id: "policy-b",
      product: "Policy B",
      continuity_score: 57,
      missing_fields: ["planned_premium", "index_strategy", "cash_value", "latest_statement_date"],
      policySignals: {
        signalLevel: "monitor",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: true,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.46,
      },
    },
    {
      policy_id: "policy-c",
      product: "Policy C",
      continuity_score: 88,
      policySignals: {
        signalLevel: "healthy",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.84,
      },
    },
  ];
  const signal = buildPortfolioSignals({ policies });

  assert.equal(signal.portfolioFlags.incompleteDataSpread, true);
  assert.equal(signal.portfolioSignalLevel, "monitor");
});

runTest("buildPortfolioActionFeed creates ordered review actions from portfolio pressure", () => {
  const policies = [
    {
      policy_id: "priority-policy",
      product: "Priority Policy",
      carrier: "Carrier A",
      missing_fields: ["cash_value", "loan_balance", "latest_statement_date"],
      review_reason: "Visible loan and charge pressure are concentrated here.",
      interpretation: {
        bottom_line_summary: "This policy is one of the main portfolio pressure points.",
      },
      policySignals: {
        signalLevel: "at_risk",
        reasons: ["Visible loan and charge pressure are concentrated here."],
        flags: {
          fundingPressure: true,
          chargeDrag: true,
          loanRisk: true,
          incompleteData: true,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.42,
      },
    },
    {
      policy_id: "data-policy",
      product: "Data Gap Policy",
      carrier: "Carrier A",
      missing_fields: ["cash_value", "loan_balance", "latest_statement_date", "planned_premium"],
      interpretation: {
        bottom_line_summary: "This file needs more evidence.",
      },
      policySignals: {
        signalLevel: "monitor",
        reasons: ["Critical policy evidence is still incomplete."],
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: true,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.46,
      },
    },
    {
      policy_id: "strong-policy",
      product: "Strong Policy",
      carrier: "Carrier B",
      interpretation: {
        bottom_line_summary: "This policy currently looks stable.",
      },
      policySignals: {
        signalLevel: "healthy",
        reasons: ["Most visible policy support looks stable."],
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.9,
      },
    },
  ];
  const portfolioSignals = buildPortfolioSignals({ policies });
  const feed = buildPortfolioActionFeed({ policies, portfolioSignals });

  assert.equal(feed.length > 0, true);
  assert.equal(feed[0].policyId, "priority-policy");
  assert.equal(feed.some((item) => item.category === "data_completion"), true);
  assert.equal(feed.some((item) => item.category === "comparison"), true);
});

runTest("buildPropertySignals returns a healthy property signal", () => {
  const signal = buildPropertySignals({
    property: {
      city: "Scottsdale",
      state: "AZ",
      postal_code: "85255",
      square_feet: 3100,
      beds: 4,
      baths: 3,
      year_built: 2019,
      last_purchase_price: 720000,
      last_purchase_date: "2023-05-10",
    },
    latestValuation: {
      id: "valuation-1",
      confidence_label: "strong",
      confidence_score: 0.86,
      metadata: {
        subject_completeness: 0.92,
        official_market_support: "aligned",
        comp_fit_score: 0.84,
        strong_comp_count: 3,
        valuation_range_ratio: 0.11,
        review_flags: [],
      },
    },
    valuationChangeSummary: {
      change_status: "stable_change",
      summary: "The latest valuation is broadly consistent with the prior run.",
    },
    propertyEquityPosition: {
      financing_status: "visible",
      protection_status: "visible",
      estimated_ltv: 0.54,
      review_flags: [],
    },
    propertyStackAnalytics: {
      id: "stack-1",
      linkage_status: "complete_property_stack",
      continuity_status: "strong",
    },
    propertyValuationHistory: [{ id: "valuation-1" }, { id: "valuation-0" }],
    linkedMortgages: [{ id: "mortgage-1" }],
    linkedHomeownersPolicies: [{ id: "homeowners-1" }],
  });

  assert.equal(signal.signalLevel, "healthy");
  assert.equal(signal.flags.weakValuation, false);
  assert.equal(signal.confidence >= 0.75, true);
});

runTest("buildPropertySignals returns a monitor property signal when support is mixed", () => {
  const signal = buildPropertySignals({
    property: {
      city: "Phoenix",
      state: "AZ",
      postal_code: "",
      square_feet: "",
      beds: 4,
      baths: "",
      year_built: 1998,
    },
    latestValuation: {
      id: "valuation-2",
      confidence_label: "moderate",
      confidence_score: 0.66,
      metadata: {
        subject_completeness: 0.61,
        official_market_support: "mixed",
        comp_fit_score: 0.69,
        strong_comp_count: 1,
        valuation_range_ratio: 0.17,
        review_flags: ["limited_comp_support"],
      },
    },
    valuationChangeSummary: {
      change_status: "insufficient_history",
      summary: "Only one valuation is available.",
    },
    propertyEquityPosition: {
      financing_status: "linked_balance_missing",
      protection_status: "visible",
      estimated_ltv: 0.66,
      review_flags: [],
    },
    propertyStackAnalytics: {
      linkage_status: "partial_property_stack",
      continuity_status: "moderate",
    },
    linkedMortgages: [{ id: "mortgage-1" }],
    linkedHomeownersPolicies: [{ id: "homeowners-1" }],
  });

  assert.equal(signal.signalLevel, "monitor");
  assert.equal(signal.flags.incompleteFacts, true);
  assert.equal(signal.flags.marketSupportGap, true);
  assert.equal(signal.reasons.length > 0, true);
});

runTest("buildPropertySignals returns an at-risk property signal when pressure stacks up", () => {
  const signal = buildPropertySignals({
    property: {
      city: "",
      state: "",
      postal_code: "",
      square_feet: "",
      beds: "",
      baths: "",
      year_built: "",
    },
    latestValuation: null,
    valuationChangeSummary: {
      change_status: "insufficient_history",
      summary: "No valuation history is available yet.",
    },
    propertyEquityPosition: {
      financing_status: "missing",
      protection_status: "missing",
      estimated_ltv: 0.91,
      review_flags: ["ltv_review_elevated"],
    },
    propertyStackAnalytics: {
      linkage_status: "property_only",
      continuity_status: "weak",
    },
    linkedMortgages: [],
    linkedHomeownersPolicies: [],
  });

  assert.equal(signal.signalLevel, "at_risk");
  assert.equal(signal.flags.valuationMissing, true);
  assert.equal(signal.flags.protectionGap, true);
  assert.equal(signal.flags.equityPressure, true);
});

runTest("buildPropertyActionFeed prioritizes core property review moves", () => {
  const propertySignals = buildPropertySignals({
    property: {
      city: "",
      state: "",
      postal_code: "",
      square_feet: "",
      beds: "",
      baths: "",
      year_built: "",
    },
    latestValuation: null,
    propertyEquityPosition: {
      financing_status: "missing",
      protection_status: "missing",
      estimated_ltv: 0.88,
      review_flags: ["ltv_review_elevated"],
    },
    propertyStackAnalytics: {
      linkage_status: "property_only",
      continuity_status: "weak",
    },
    linkedMortgages: [],
    linkedHomeownersPolicies: [],
  });
  const actions = buildPropertyActionFeed({
    property: { property_name: "North Ranch Home" },
    propertySignals,
    valuationChangeSummary: { change_status: "insufficient_history" },
  });

  assert.equal(actions.length > 0, true);
  assert.equal(actions[0].category, "valuation_setup");
  assert.equal(actions.some((item) => item.category === "data_completion"), true);
  assert.equal(actions.some((item) => item.category === "operating_graph"), true);
});

runTest("runPropertyAiAssistant references property signals for risk and review questions", () => {
  const propertySignals = buildPropertySignals({
    property: {
      city: "Austin",
      state: "TX",
      postal_code: "",
      square_feet: 2400,
      beds: 4,
      baths: "",
      year_built: 2007,
    },
    latestValuation: {
      id: "valuation-3",
      confidence_label: "moderate",
      confidence_score: 0.67,
      metadata: {
        subject_completeness: 0.68,
        official_market_support: "mixed",
        comp_fit_score: 0.7,
        strong_comp_count: 1,
        valuation_range_ratio: 0.16,
        review_flags: ["limited_comp_support"],
      },
    },
    valuationChangeSummary: {
      change_status: "stable_change",
      summary: "The latest valuation stayed relatively close to the prior run.",
    },
    propertyEquityPosition: {
      financing_status: "linked_balance_missing",
      protection_status: "missing",
      estimated_ltv: 0.74,
      review_flags: [],
    },
    propertyStackAnalytics: {
      linkage_status: "partial_property_stack",
      continuity_status: "moderate",
    },
    linkedMortgages: [{ id: "mortgage-1" }],
    linkedHomeownersPolicies: [],
  });
  const propertyActionFeed = buildPropertyActionFeed({
    property: { property_name: "Austin Home" },
    propertySignals,
    valuationChangeSummary: {
      change_status: "stable_change",
      summary: "The latest valuation stayed relatively close to the prior run.",
    },
  });
  const response = runPropertyAiAssistant({
    userQuestion: "What should I review first on this property?",
    property: {
      property_name: "Austin Home",
      city: "Austin",
      state: "TX",
    },
    latestValuation: {
      id: "valuation-3",
      confidence_label: "moderate",
      confidence_score: 0.67,
      midpoint_estimate: 640000,
      comps_count: 2,
      metadata: {
        subject_completeness: 0.68,
        official_market_support: "mixed",
        comp_fit_score: 0.7,
        strong_comp_count: 1,
        valuation_range_ratio: 0.16,
        review_flags: ["limited_comp_support"],
      },
    },
    valuationChangeSummary: {
      change_status: "stable_change",
      summary: "The latest valuation stayed relatively close to the prior run.",
    },
    propertyEquityPosition: {
      financing_status: "linked_balance_missing",
      protection_status: "missing",
      estimated_ltv: 0.74,
      review_flags: [],
    },
    propertyStackAnalytics: {
      linkage_status: "partial_property_stack",
      continuity_status: "moderate",
    },
    linkedMortgages: [{ id: "mortgage-1" }],
    linkedHomeownersPolicies: [],
    propertySignals,
    propertyActionFeed,
  });

  assert.equal(response.signal_level, propertySignals.signalLevel);
  assert.equal(response.answer.includes("review"), true);
  assert.equal(response.evidence.length > 0, true);
});

runTest("household assistant explains property operating graph pressure with completeness evidence", () => {
  const bundle = {
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
    documents: [],
  };
  const householdMap = {
    bottom_line: "Household continuity is only partially supported right now.",
    overall_score: 58,
    overall_status: "Moderate",
    focus_areas: [],
    visibility_gaps: ["Property linkage is still developing."],
    dependency_signals: { priority_issues: [] },
  };
  const priorityEngine = buildHouseholdPriorityEngine({
    householdMap,
    commandCenter: { blockers: [] },
    housingCommand: { blockers: [] },
    emergencyAccessCommand: { blockers: [] },
    bundle,
  });

  const response = answerHouseholdQuestion({
    questionText: "Which property stack needs attention first, and why?",
    householdMap,
    reviewDigest: {
      summary: "No saved review digest is available yet.",
      reopened_count: 0,
      improved_count: 0,
      active_count: 0,
    },
    queueItems: [],
    intelligence: null,
    bundle,
    scorecard: {
      weakestDimension: { label: "Property", score: 54 },
      strongestDimension: { label: "Protection", score: 71 },
    },
    priorityEngine,
  });

  assert.equal(response.intent, "property_operating_graph");
  assert.equal(response.confidence_label, "strong");
  assert.equal(/property-stack issue|operating graph/i.test(response.answer_text), true);
  assert.equal(response.evidence_points.some((point) => point.includes("50%")), true);
  assert.equal(response.actions.some((action) => action.route === "/property"), true);
});

runTest("buildRetirementSignals returns a healthy account signal", () => {
  const signal = buildRetirementSignals({
    retirementRead: {
      readinessStatus: "Better Supported",
      confidence: 0.86,
      metrics: {
        currentBalanceVisible: true,
        contributionsVisible: true,
        completenessStatus: "strong",
      },
    },
    latestSnapshot: {
      id: "snapshot-1",
      snapshot_date: "2026-02-01",
      normalized_retirement: {
        statement_context: {
          statement_date: "2026-02-01",
        },
        loan_distribution_metrics: {
          loan_balance: 0,
        },
        beneficiary_metrics: {
          beneficiary_present: true,
        },
      },
    },
    latestAnalytics: {
      id: "analytics-1",
      review_flags: [],
      normalized_intelligence: {
        concentration_flags: {
          concentration_warning: false,
        },
        loan_flags: {
          outstanding_loan_detected: false,
        },
        beneficiary_flags: {
          beneficiary_missing: false,
          beneficiary_status_unknown: false,
        },
      },
    },
    positions: [
      { position_name: "Target Date Fund", allocation_percent: 35, current_value: 120000 },
      { position_name: "Bond Fund", allocation_percent: 25, current_value: 80000 },
    ],
  });

  assert.equal(signal.signalLevel, "healthy");
  assert.equal(signal.flags.incompleteData, false);
  assert.equal(signal.confidence >= 0.75, true);
});

runTest("buildRetirementSignals returns a monitor account signal", () => {
  const signal = buildRetirementSignals({
    retirementRead: {
      readinessStatus: "Usable",
      confidence: 0.61,
      metrics: {
        currentBalanceVisible: true,
        contributionsVisible: false,
        completenessStatus: "moderate",
      },
    },
    latestSnapshot: {
      id: "snapshot-2",
      snapshot_date: "2025-01-01",
      normalized_retirement: {
        statement_context: {
          statement_date: "2025-01-01",
        },
        loan_distribution_metrics: {
          loan_balance: 0,
        },
        beneficiary_metrics: {
          beneficiary_present: true,
        },
      },
    },
    latestAnalytics: {
      id: "analytics-2",
      review_flags: [],
      normalized_intelligence: {
        concentration_flags: {
          concentration_warning: true,
        },
        loan_flags: {
          outstanding_loan_detected: false,
        },
        beneficiary_flags: {
          beneficiary_missing: false,
          beneficiary_status_unknown: false,
        },
      },
    },
    positions: [{ position_name: "Employer Stock", allocation_percent: 68, current_value: 150000 }],
  });

  assert.equal(signal.signalLevel, "monitor");
  assert.equal(signal.flags.contributionVisibility, true);
  assert.equal(signal.flags.concentrationRisk, true);
});

runTest("buildRetirementSignals returns an at-risk account signal", () => {
  const signal = buildRetirementSignals({
    retirementRead: {
      readinessStatus: "Needs Review",
      confidence: 0.34,
      metrics: {
        currentBalanceVisible: false,
        contributionsVisible: false,
        completenessStatus: "limited",
      },
    },
    latestSnapshot: {
      id: "snapshot-3",
      snapshot_date: "2023-12-31",
      normalized_retirement: {
        statement_context: {
          statement_date: "2023-12-31",
        },
        loan_distribution_metrics: {
          loan_balance: 25000,
        },
        beneficiary_metrics: {
          beneficiary_present: false,
        },
      },
    },
    latestAnalytics: {
      id: "analytics-3",
      review_flags: ["beneficiary_missing", "outstanding_loan_detected"],
      normalized_intelligence: {
        concentration_flags: {
          concentration_warning: false,
        },
        loan_flags: {
          outstanding_loan_detected: true,
        },
        beneficiary_flags: {
          beneficiary_missing: true,
          beneficiary_status_unknown: false,
        },
      },
    },
    positions: [],
  });

  assert.equal(signal.signalLevel, "at_risk");
  assert.equal(signal.flags.loanRisk, true);
  assert.equal(signal.flags.beneficiaryRisk, true);
  assert.equal(signal.flags.incompleteData, true);
});

runTest("buildRetirementActionFeed prioritizes incomplete retirement evidence", () => {
  const retirementSignals = buildRetirementSignals({
    retirementRead: {
      readinessStatus: "Needs Review",
      confidence: 0.38,
      metrics: {
        currentBalanceVisible: false,
        contributionsVisible: false,
        completenessStatus: "limited",
      },
    },
    latestSnapshot: {
      id: "snapshot-4",
      snapshot_date: "2024-01-01",
      normalized_retirement: {
        statement_context: {
          statement_date: "2024-01-01",
        },
      },
    },
    latestAnalytics: null,
    positions: [],
  });
  const actions = buildRetirementActionFeed({
    retirementSignals,
    retirementRead: {
      headline: "This account still needs stronger statement support before it can be treated as reliable.",
    },
    positions: [],
  });

  assert.equal(actions.length > 0, true);
  assert.equal(actions[0].category, "data_completion");
  assert.equal(actions.some((item) => item.category === "positions_review"), true);
});

runTest("runRetirementAiAssistant references signals for review-first questions", () => {
  const retirementSignals = buildRetirementSignals({
    retirementRead: {
      readinessStatus: "Needs Review",
      confidence: 0.46,
      headline: "This retirement read still needs stronger statement support before it can be treated as reliable.",
      metrics: {
        currentBalanceVisible: true,
        contributionsVisible: false,
        completenessStatus: "limited",
      },
    },
    latestSnapshot: {
      id: "snapshot-5",
      snapshot_date: "2024-02-01",
      normalized_retirement: {
        statement_context: {
          statement_date: "2024-02-01",
        },
        beneficiary_metrics: {
          beneficiary_present: false,
        },
      },
    },
    latestAnalytics: {
      id: "analytics-5",
      review_flags: ["beneficiary_missing"],
      normalized_intelligence: {
        concentration_flags: {
          concentration_warning: false,
        },
        loan_flags: {
          outstanding_loan_detected: false,
        },
        beneficiary_flags: {
          beneficiary_missing: true,
          beneficiary_status_unknown: false,
        },
      },
    },
    positions: [],
  });
  const retirementActionFeed = buildRetirementActionFeed({
    retirementSignals,
    retirementRead: {
      headline: "This account still needs stronger statement support before it can be treated as reliable.",
    },
    positions: [],
  });
  const response = runRetirementAiAssistant({
    userQuestion: "What should I review first?",
    retirementSignals,
    retirementRead: {
      readinessStatus: "Needs Review",
      confidence: 0.46,
    },
    retirementActionFeed,
    positionSummary: {
      count: 0,
      topHolding: null,
      concentrationNote: "",
    },
    latestSnapshot: {
      snapshot_date: "2024-02-01",
      normalized_retirement: {
        statement_context: {
          statement_date: "2024-02-01",
        },
      },
    },
    latestAnalytics: {
      normalized_intelligence: {},
    },
  });

  assert.equal(response.intent, "review_first");
  assert.equal(response.answer.includes("review"), true);
  assert.equal(response.evidence.length > 0, true);
});

runTest("policy AI assistant classifies the required question set", () => {
  assert.deepEqual(classifyPolicyAiAssistantIntent("Is this policy good?"), {
    intent: "performance",
    internalIntent: "performance_summary",
  });
  assert.deepEqual(classifyPolicyAiAssistantIntent("What are the risks?"), {
    intent: "risk",
    internalIntent: "risk_summary",
  });
  assert.deepEqual(classifyPolicyAiAssistantIntent("How are charges affecting it?"), {
    intent: "charges",
    internalIntent: "charge_analysis",
  });
  assert.deepEqual(classifyPolicyAiAssistantIntent("Is it growing?"), {
    intent: "performance",
    internalIntent: "performance_summary",
  });
});

runTest("policy AI assistant returns evidence-based non-advice responses", () => {
  const baseInput = {
    policyInterpretation: {
      bottom_line_summary: "This policy is readable, but visible charge drag means it should stay on the monitor list.",
    },
    trendSummary: {
      summary: "Cash value increased modestly across the visible statement period.",
    },
    comparisonData: {
      cash_value: "$100,000",
      total_visible_charges: "$6,500",
      charge_visibility_status: "moderate",
      latest_statement_date: "2025-12-31",
      missing_fields: [],
    },
    signalsOutput: {
      policy_signal: "monitor",
      primary_reason: "Visible charge drag deserves monitoring.",
      risk_flags: [],
      monitor_flags: ["Visible charge drag deserves monitoring."],
      signal_reasons: ["Visible charge drag deserves monitoring."],
      confidence: "high",
      missing_fields: [],
    },
  };
  const questions = [
    "Is this policy good?",
    "What are the risks?",
    "How are charges affecting it?",
    "Is it growing?",
  ];

  for (const userQuestion of questions) {
    const response = buildPolicyAiAssistantResponse({
      ...baseInput,
      userQuestion,
    });

    assert.equal(response.explanation.length > 0, true);
    assert.equal(response.evidence.length > 0, true);
    assert.equal(/should buy|should sell|should replace/i.test(response.explanation), false);
  }

  const riskResponse = buildPolicyAiAssistantResponse({
    ...baseInput,
    userQuestion: "What are the risks?",
  });

  assert.equal(riskResponse.intent, "risk");
  assert.equal(riskResponse.disclaimers.some((item) => item.includes("not financial advice")), true);
});

runTest("runPolicyAiAssistant returns the chat-layer response contract", () => {
  const response = runPolicyAiAssistant({
    userQuestion: "How much are charges affecting this?",
    policyInterpretation: {
      charge_summary_explanation: "Visible charges are present and should be read alongside the policy's cash-value movement.",
    },
    trendSummary: {
      summary: "Cash value increased modestly across the visible statement period.",
    },
    comparisonData: {
      cash_value: "$100,000",
      total_visible_charges: "$6,500",
      charge_visibility_status: "moderate",
      missing_fields: [],
    },
    signalsOutput: {
      policy_signal: "monitor",
      confidence: "high",
      missing_fields: [],
    },
  });

  assert.equal(response.intent, "charge_analysis");
  assert.equal(response.answer.length > 0, true);
  assert.equal(response.confidence, "high");
  assert.equal(Array.isArray(response.evidence), true);
  assert.equal(/replace policy/i.test(response.answer), false);
});

runTest("runPolicyAiAssistant references product policy signals in risk answers", () => {
  const policySignals = buildPolicySignalSummary({
    trendSummary: {
      periods_count: 2,
      summary: "Loan pressure is visible.",
    },
    comparisonData: {
      cash_value: "$100,000",
      loan_balance: "$40,000",
      charge_drag_ratio: "13%",
      latest_statement_date: "2025-12-31",
      missing_fields: [],
    },
  });
  const response = runPolicyAiAssistant({
    userQuestion: "What are the risks?",
    policyInterpretation: {
      bottom_line_summary: "This policy needs review because visible pressure is present.",
    },
    trendSummary: {
      periods_count: 2,
      summary: "Loan pressure is visible.",
    },
    comparisonData: {
      cash_value: "$100,000",
      loan_balance: "$40,000",
      latest_statement_date: "2025-12-31",
      missing_fields: [],
    },
    policySignals,
  });

  assert.equal(response.answer.includes("Policy signal: at risk."), true);
  assert.equal(response.intent, "risk_summary");
  assert.equal(response.confidence, policySignals.confidence);
});

runTest("classifyPolicyQuestionType maps the first supported policy assistant prompts", () => {
  assert.equal(
    classifyPolicyQuestionType("Is this policy performing well?"),
    POLICY_QUESTION_TYPES.performance
  );
  assert.equal(
    classifyPolicyQuestionType("Why is this rated weak?"),
    POLICY_QUESTION_TYPES.policy_health
  );
  assert.equal(
    classifyPolicyQuestionType("Are we ahead of illustration?"),
    POLICY_QUESTION_TYPES.illustration_vs_actual
  );
  assert.equal(
    classifyPolicyQuestionType("How much are charges affecting this?"),
    POLICY_QUESTION_TYPES.charges
  );
  assert.equal(
    classifyPolicyQuestionType("Is there anything missing?"),
    POLICY_QUESTION_TYPES.missing_data
  );
  assert.equal(
    classifyPolicyQuestionType("Compare this to another policy"),
    POLICY_QUESTION_TYPES.comparison
  );
});

runTest("generatePolicyResponse returns structured grounded policy-engine output", () => {
  const response = generatePolicyResponse({
    question: "How much are charges affecting this?",
    type: POLICY_QUESTION_TYPES.charges,
    policy: {
      values: {
        cash_value: {
          display_value: "$100,000",
        },
      },
      loans: {
        loan_balance: {
          display_value: "$12,000",
        },
      },
    },
    analytics: {
      charge_summary: {
        total_coi: 6500,
        coi_confidence: "moderate",
      },
    },
    precomputed: {
      comparisonRow: {
        cash_value: "$100,000",
        latest_statement_date: "2025-12-31",
        loan_balance: "$12,000",
        total_coi: "$6,500",
        charge_visibility_status: "moderate",
        missing_fields: ["planned_premium"],
      },
      chargeSummary: {
        total_coi: 6500,
        coi_confidence: "moderate",
      },
      statementTimeline: [{ statement_date: "2025-12-31" }, { statement_date: "2024-12-31" }],
      policyInterpretation: {
        charge_summary_explanation:
          "Visible charges are meaningful and should be reviewed alongside cash-value movement.",
        growth_summary: "Growth appears positive, but visible deductions are present.",
        bottom_line_summary: "This policy is readable, but visible pressure remains.",
        review_items: ["Confirm planned premium support"],
      },
      trendSummary: {
        summary: "Cash value increased modestly across the visible statement period.",
      },
      reviewReport: {
        sections: [
          {
            kind: "bullets",
            bullets: ["Review current-year statement support"],
          },
        ],
      },
      policyContinuity: {
        score: 74,
        explanation: "Statement support is present but not complete.",
        penalties: [{ reason: "Planned premium support is still incomplete." }],
      },
    },
  });

  assert.equal(response.source, "policy_engine");
  assert.equal(response.confidence, "medium");
  assert.equal(response.answer.includes("Visible charges are meaningful"), true);
  assert.equal(Array.isArray(response.supporting_data.why), true);
  assert.equal(response.supporting_data.why.length > 0, true);
  assert.equal(Array.isArray(response.supporting_data.facts), true);
  assert.equal(
    response.supporting_data.facts.some(
      (fact) => fact.label === "Visible COI" && fact.value.includes("$6,500")
    ),
    true
  );
  assert.equal(
    response.supporting_data.uncertainties.some((item) =>
      item.toLowerCase().includes("planned premium")
    ),
    true
  );
  assert.equal(
    response.disclaimers.some((item) => item.toLowerCase().includes("not financial advice")),
    true
  );
});

runTest("generatePolicyResponse stays honest when illustration support is missing", () => {
  const response = generatePolicyResponse({
    question: "Are we ahead of illustration?",
    type: POLICY_QUESTION_TYPES.illustration_vs_actual,
    policy: {},
    analytics: {},
    precomputed: {
      comparisonRow: {
        missing_fields: ["latest_statement_date", "cash_value", "planned_premium"],
      },
      chargeSummary: {},
      statementTimeline: [],
      policyInterpretation: {
        bottom_line_summary: "Current policy visibility is limited.",
        review_items: ["Upload current annual statement"],
      },
      trendSummary: {
        summary: "Statement history is too thin for a trend read.",
      },
      reviewReport: {
        sections: [],
      },
      policyContinuity: {
        score: 24,
        explanation: "Continuity is limited because statement coverage is thin.",
        penalties: [{ reason: "Latest statement date is still incomplete." }],
      },
      iulV2: {
        missingData: ["Illustration pages are not yet visible."],
      },
    },
  });

  assert.equal(response.source, "policy_engine");
  assert.equal(response.confidence, "low");
  assert.equal(
    response.answer.toLowerCase().includes("cannot be fully determined"),
    true
  );
  assert.equal(
    response.supporting_data.uncertainties.some((item) =>
      item.toLowerCase().includes("illustration")
    ),
    true
  );
});

runTest("runPortfolioAiAssistant answers priority questions", () => {
  const policies = [
    {
      policy_id: "priority-policy",
      product: "Priority Policy",
      carrier: "Carrier A",
      policySignals: {
        signalLevel: "at_risk",
        flags: {
          fundingPressure: true,
          chargeDrag: true,
          loanRisk: true,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.45,
      },
    },
    {
      policy_id: "stable-policy",
      product: "Stable Policy",
      carrier: "Carrier B",
      policySignals: {
        signalLevel: "healthy",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.88,
      },
    },
  ];
  const portfolioSignals = buildPortfolioSignals({ policies });
  const response = runPortfolioAiAssistant({
    userQuestion: "Which policy needs attention first?",
    policies,
    portfolioSignals,
  });

  assert.equal(response.intent, "priority");
  assert.equal(response.answer.includes("Priority Policy"), true);
});

runTest("runPortfolioAiAssistant answers strongest policy questions", () => {
  const policies = [
    {
      policy_id: "strong-policy",
      product: "Strong Policy",
      policySignals: {
        signalLevel: "healthy",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.92,
      },
    },
    {
      policy_id: "watch-policy",
      product: "Watch Policy",
      policySignals: {
        signalLevel: "monitor",
        flags: {
          fundingPressure: false,
          chargeDrag: true,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.66,
      },
    },
  ];
  const response = runPortfolioAiAssistant({
    userQuestion: "Which policy looks strongest?",
    policies,
    portfolioSignals: buildPortfolioSignals({ policies }),
  });

  assert.equal(response.intent, "strongest");
  assert.equal(response.answer.includes("Strong Policy"), true);
});

runTest("runPortfolioAiAssistant answers biggest risk questions", () => {
  const policies = [
    {
      policy_id: "risk-a",
      product: "Risk A",
      carrier: "Carrier A",
      policySignals: {
        signalLevel: "at_risk",
        flags: {
          fundingPressure: true,
          chargeDrag: true,
          loanRisk: true,
          incompleteData: true,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.42,
      },
    },
    {
      policy_id: "risk-b",
      product: "Risk B",
      carrier: "Carrier A",
      policySignals: {
        signalLevel: "monitor",
        flags: {
          fundingPressure: false,
          chargeDrag: true,
          loanRisk: false,
          incompleteData: true,
          illustrationVarianceRisk: true,
          concentrationRisk: true,
        },
        confidence: 0.5,
      },
    },
  ];
  const response = runPortfolioAiAssistant({
    userQuestion: "What are the biggest risks across my policies?",
    policies,
    portfolioSignals: buildPortfolioSignals({ policies }),
  });

  assert.equal(response.intent, "risk_summary");
  assert.equal(response.answer.length > 0, true);
  assert.equal(Array.isArray(response.evidence), true);
});

runTest("runPortfolioAiAssistant answers incomplete-data questions", () => {
  const policies = [
    {
      policy_id: "incomplete-policy",
      product: "Incomplete Policy",
      policySignals: {
        signalLevel: "monitor",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: true,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.46,
      },
    },
    {
      policy_id: "stable-policy",
      product: "Stable Policy",
      policySignals: {
        signalLevel: "healthy",
        flags: {
          fundingPressure: false,
          chargeDrag: false,
          loanRisk: false,
          incompleteData: false,
          illustrationVarianceRisk: false,
          concentrationRisk: false,
        },
        confidence: 0.86,
      },
    },
  ];
  const response = runPortfolioAiAssistant({
    userQuestion: "Where is my data incomplete?",
    policies,
    portfolioSignals: buildPortfolioSignals({ policies }),
  });

  assert.equal(response.intent, "incomplete_data");
  assert.equal(response.answer.includes("Incomplete Policy"), true);
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

runTest("requiresDeletionReauth forces stale sessions back through password verification", () => {
  const nowMs = new Date("2026-04-10T18:00:00.000Z").getTime();

  assert.equal(
    requiresDeletionReauth(
      {
        lastAuthAt: "2026-04-10T17:55:30.000Z",
      },
      nowMs
    ),
    false
  );

  assert.equal(
    requiresDeletionReauth(
      {
        lastAuthAt: "2026-04-10T17:30:00.000Z",
      },
      nowMs
    ),
    true
  );
});

runTest("normalizeAccountDeletionPayload maps completed, pending, and reauth states safely", () => {
  assert.deepEqual(normalizeAccountDeletionPayload({ status: "completed", message: "done" }), {
    ok: true,
    status: "completed",
    message: "done",
  });

  assert.deepEqual(normalizeAccountDeletionPayload({ status: "requested", message: "pending" }), {
    ok: true,
    status: "requested",
    message: "pending",
  });

  assert.deepEqual(normalizeAccountDeletionPayload({ status: "reauth_required", message: "reauth" }), {
    ok: false,
    status: "reauth_required",
    message: "reauth",
  });
});

runTest("account deletion cleanup removes VaultedShield storage keys but preserves unrelated browser state", () => {
  const originalWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();

  try {
    globalThis.window = {
      localStorage,
      sessionStorage,
    };

    localStorage.setItem("vaultedshield_access_session_v1", "session");
    localStorage.setItem("vaultedshield-current-household-id", "household-1");
    localStorage.setItem("another-app-key", "keep");
    sessionStorage.setItem("vaultedshield-account-deletion-flash-v1", "flash");
    sessionStorage.setItem("unrelated-session-key", "keep");

    clearVaultedShieldSessionArtifacts();

    assert.equal(localStorage.getItem("vaultedshield_access_session_v1"), null);
    assert.equal(localStorage.getItem("vaultedshield-current-household-id"), null);
    assert.equal(localStorage.getItem("another-app-key"), "keep");
    assert.equal(sessionStorage.getItem("vaultedshield-account-deletion-flash-v1"), null);
    assert.equal(sessionStorage.getItem("unrelated-session-key"), "keep");
  } finally {
    globalThis.window = originalWindow;
  }
});

runTest("account deletion flash is persisted once and then consumed", () => {
  const originalWindow = globalThis.window;
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();

  try {
    globalThis.window = {
      localStorage,
      sessionStorage,
    };

    setAccountDeletionFlash("Account removed");
    assert.equal(consumeAccountDeletionFlash(), "Account removed");
    assert.equal(consumeAccountDeletionFlash(), "");
  } finally {
    globalThis.window = originalWindow;
  }
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

runTest("normalizeHashPath keeps hash auth callbacks on the login route", () => {
  assert.equal(normalizeHashPath("#/login?type=signup&access_token=test-token"), "/login");
  assert.equal(normalizeHashPath("#/login?error_description=Link+expired"), "/login");
  assert.equal(normalizeHashPath(""), "/dashboard");
});

runTest("getAuthLandingState recognizes verification callbacks from hash parameters", () => {
  withWindowMock(
    {
      location: {
        hash: "#/login?type=signup&access_token=token-123",
        search: "",
        pathname: "/",
      },
      history: { replaceState() {} },
      document: { title: "VaultedShield" },
    },
    () => {
      const landing = getAuthLandingState();
      assert.equal(landing.status, "verification_complete");
      assert.equal(/verification is complete/i.test(landing.message), true);
      assert.equal(hasAuthLandingState(), true);
    }
  );
});

runTest("getAuthLandingState surfaces provider errors cleanly", () => {
  withWindowMock(
    {
      location: {
        hash: "#/login?error_description=Link+expired",
        search: "",
        pathname: "/",
      },
      history: { replaceState() {} },
      document: { title: "VaultedShield" },
    },
    () => {
      const landing = getAuthLandingState();
      assert.equal(landing.status, "error");
      assert.equal(landing.message, "Link expired");
    }
  );
});

runTest("clearAuthLandingStateFromUrl removes auth callback params but preserves the login route", () => {
  const calls = [];
  withWindowMock(
    {
      location: {
        hash: "#/login?type=signup&access_token=token-123",
        search: "",
        pathname: "/",
      },
      history: {
        replaceState(_state, _title, nextUrl) {
          calls.push(nextUrl);
        },
      },
      document: { title: "VaultedShield" },
    },
    () => {
      clearAuthLandingStateFromUrl();
      assert.deepEqual(calls, ["/#/login"]);
    }
  );
});

runTest("assembleModuleBundle keeps the core mortgage record available when child reads fail", () => {
  const result = assembleModuleBundle({
    coreResult: {
      data: { id: "mortgage-1", loan_name: "Beach House Mortgage", assets: { id: "asset-1" } },
      error: null,
    },
    coreKey: "mortgageLoan",
    missingMessage: "Mortgage loan bundle could not be loaded.",
    collections: [
      {
        key: "mortgageDocuments",
        area: "documents",
        label: "Mortgage documents",
        result: {
          data: [],
          error: new Error('relation "public.mortgage_documents" does not exist'),
        },
      },
      {
        key: "mortgageSnapshots",
        area: "snapshots",
        label: "Mortgage snapshots",
        result: {
          data: [],
          error: null,
        },
      },
      {
        key: "mortgageAnalytics",
        area: "analytics",
        label: "Mortgage analytics",
        result: {
          data: [],
          error: new Error("Analytics read blocked"),
        },
      },
      {
        key: "mortgageAssetLinks",
        area: "asset_links",
        label: "Mortgage linked context",
        result: {
          data: [],
          error: null,
        },
      },
    ],
  });

  assert.equal(result.error, null);
  assert.equal(result.data?.mortgageLoan?.id, "mortgage-1");
  assert.equal(result.data?.isPartialBundle, true);
  assert.deepEqual(
    result.data?.bundleWarnings?.map((warning) => warning.area),
    ["documents", "analytics"]
  );
});

runTest("assembleModuleBundle keeps the core homeowners record available when child reads fail", () => {
  const result = assembleModuleBundle({
    coreResult: {
      data: { id: "homeowners-1", policy_name: "Primary Home Coverage", assets: { id: "asset-2" } },
      error: null,
    },
    coreKey: "homeownersPolicy",
    missingMessage: "Homeowners policy bundle could not be loaded.",
    collections: [
      {
        key: "homeownersDocuments",
        area: "documents",
        label: "Homeowners documents",
        result: {
          data: [],
          error: new Error("Documents read blocked"),
        },
      },
      {
        key: "homeownersSnapshots",
        area: "snapshots",
        label: "Homeowners snapshots",
        result: {
          data: [],
          error: null,
        },
      },
      {
        key: "homeownersAnalytics",
        area: "analytics",
        label: "Homeowners analytics",
        result: {
          data: [],
          error: null,
        },
      },
      {
        key: "homeownersAssetLinks",
        area: "asset_links",
        label: "Homeowners linked context",
        result: {
          data: [],
          error: new Error("Linked context unavailable"),
        },
      },
    ],
  });

  assert.equal(result.error, null);
  assert.equal(result.data?.homeownersPolicy?.id, "homeowners-1");
  assert.equal(result.data?.isPartialBundle, true);
  assert.deepEqual(
    result.data?.bundleWarnings?.map((warning) => warning.area),
    ["documents", "asset_links"]
  );
});

runTest("mortgage and property question classifiers stay deterministic", () => {
  assert.equal(classifyMortgageQuestionType("Is escrow visible?"), MORTGAGE_QUESTION_TYPES.escrow);
  assert.equal(
    classifyPropertyQuestionType("Is this property stack complete?"),
    PROPERTY_QUESTION_TYPES.stack_completeness
  );
});

runTest("globalAssistantRouter returns a structured policy envelope with section targets", () => {
  const response = routeGlobalAssistantRequest({
    assistantType: "policy",
    question: "Are we ahead of illustration?",
    recordContext: {
      values: { cash_value: "$75,000.00" },
      loans: { loan_balance: "$0.00" },
    },
    analyticsContext: {
      comparison_summary: {
        latest_statement_date: "2025-12-31",
        cash_value: "$75,000.00",
        loan_balance: "$0.00",
        total_coi: 1800,
        missing_fields: [],
        continuity_score: 84,
      },
      charge_summary: {
        total_coi: 1800,
        coi_confidence: "strong",
      },
    },
    precomputed: {
      comparisonRow: {
        latest_statement_date: "2025-12-31",
        cash_value: "$75,000.00",
        loan_balance: "$0.00",
        total_coi: 1800,
        missing_fields: [],
        continuity_score: 84,
      },
      chargeSummary: {
        total_coi: 1800,
        coi_confidence: "strong",
      },
      statementTimeline: [],
      policyInterpretation: {
        bottom_line_summary: "This policy is readable from the available support.",
        growth_summary: "Cash value support appears stable.",
        charge_summary_explanation: "Visible charges look manageable.",
        review_items: ["Review illustration alignment."],
      },
      trendSummary: {
        summary: "Visible statements show a stable read.",
      },
      reviewReport: {
        sections: [{ kind: "bullets", bullets: ["Review illustration alignment."] }],
      },
      iulV2: {
        illustrationComparison: {
          shortExplanation: "Actual performance is close to the visible illustration checkpoint.",
          selectedMetricLabel: "Accumulation Value",
          selectedMetricData: {
            illustratedDisplay: "$78,000",
            actualDisplay: "$75,000",
          },
          varianceDisplay: "-$3,000",
        },
      },
    },
  });

  assert.equal(response.assistantType, "policy");
  assert.equal(response.type, POLICY_QUESTION_TYPES.illustration_vs_actual);
  assert.equal(Array.isArray(response.whyThisRead), true);
  assert.equal(Array.isArray(response.sectionTargets), true);
  assert.equal(response.sectionTargets.includes("illustration-proof"), true);
});

runTest("globalAssistantRouter returns a structured household envelope with section targets", () => {
  const fixture = buildHouseholdAssistantFixture();
  const response = routeGlobalAssistantRequest({
    assistantType: "household",
    question: "What should I review first?",
    recordContext: fixture.householdMap,
    analyticsContext: {
      summary: {
        generated_at: "2026-04-12T00:00:00.000Z",
      },
    },
    precomputed: {
      reviewDigest: fixture.reviewDigest,
      queueItems: fixture.queueItems,
      bundle: fixture.bundle,
      scorecard: fixture.scorecard,
      priorityEngine: fixture.priorityEngine,
    },
  });

  assert.equal(response.assistantType, "household");
  assert.equal(response.type, "priority_review");
  assert.equal(response.source, "household_engine");
  assert.equal(Array.isArray(response.whyThisRead), true);
  assert.equal(Array.isArray(response.supportingData.facts), true);
  assert.equal(response.sectionTargets.includes("household-priority"), true);
  assert.equal(response.sectionTargets.includes("action-required"), true);
  assert.equal(response.reviewAction?.target, "review_workspace");
  assert.equal(response.reviewAction?.filters?.module, "property");
});

runTest("mortgage structured response stays explainable and local", () => {
  const response = generateMortgageResponse({
    question: "Is escrow visible?",
    type: MORTGAGE_QUESTION_TYPES.escrow,
    mortgage: {
      id: "mortgage-1",
      loan_name: "Primary Mortgage",
      current_status: "active",
      lender_key: "chase",
      mortgage_loan_type_key: "fixed_rate_mortgage",
      origination_date: "2020-01-01",
      maturity_date: "2050-01-01",
    },
    analytics: {},
    precomputed: {
      mortgageDocuments: [{ id: "doc-1", document_class_key: "escrow_analysis" }],
      mortgageSnapshots: [
        {
          id: "snap-1",
          snapshot_date: "2025-01-01",
          normalized_mortgage: {
            payment_metrics: { monthly_payment: 2400 },
            rate_terms: { interest_rate: "5.75%" },
            balance_metrics: { current_principal_balance: 320000, payoff_amount: 321500 },
            escrow_metrics: { escrow_present: true, escrow_balance: 1800 },
          },
        },
      ],
      propertyLinks: [{ id: "link-1", is_primary: true }],
    },
  });

  assert.equal(typeof response.answer, "string");
  assert.equal(Array.isArray(response.whyThisRead), true);
  assert.equal(Array.isArray(response.supportingData.facts), true);
  assert.equal(response.source, "mortgage_engine");
  assert.equal(response.sectionTargets.includes("loan-summary"), true);
});

runTest("property structured response stays explainable and local", () => {
  const response = generatePropertyResponse({
    question: "How strong is the property record?",
    type: PROPERTY_QUESTION_TYPES.stack_completeness,
    property: {
      id: "property-1",
      property_address: "123 Test St",
      city: "San Diego",
      state: "CA",
      postal_code: "92101",
      square_feet: 1800,
      beds: 3,
      baths: 2,
      year_built: 1995,
    },
    analytics: {},
    precomputed: {
      latestPropertyValuation: {
        confidence_label: "moderate",
        confidence_score: 0.64,
        midpoint_estimate: 850000,
        comps_count: 3,
        metadata: {
          official_market_support: "mixed",
          review_flags: ["limited_comp_support"],
        },
      },
      propertyStackAnalytics: {
        completeness_score: 0.72,
        continuity_status: "moderate",
        linkage_status: "partial",
        has_homeowners: false,
      },
      propertyEquityPosition: {
        equity_visibility_status: "moderate",
        financing_status: "visible",
        protection_status: "missing",
        primary_mortgage_balance: 450000,
      },
      linkedMortgages: [{ id: "mortgage-1" }],
      linkedHomeownersPolicies: [],
      propertySignals: {
        signalLevel: "monitor",
        confidence: 0.62,
        reasons: ["Protection linkage is missing.", "Valuation support is mixed."],
      },
      propertyDocuments: [{ id: "doc-1" }],
    },
  });

  assert.equal(typeof response.answer, "string");
  assert.equal(Array.isArray(response.whyThisRead), true);
  assert.equal(Array.isArray(response.supportingData.facts), true);
  assert.equal(response.source, "property_engine");
  assert.equal(response.sectionTargets.includes("property-stack-analytics"), true);
});

runTest("household structured response stays deterministic and workflow-native", () => {
  const fixture = buildHouseholdAssistantFixture();
  const request = {
    assistantType: "household",
    question: "Why is household readiness rated this way?",
    recordContext: fixture.householdMap,
    analyticsContext: {},
    precomputed: {
      reviewDigest: fixture.reviewDigest,
      queueItems: fixture.queueItems,
      bundle: fixture.bundle,
      scorecard: fixture.scorecard,
      priorityEngine: fixture.priorityEngine,
    },
  };

  const first = routeGlobalAssistantRequest(request);
  const second = routeGlobalAssistantRequest(request);

  assert.equal(typeof first.answer, "string");
  assert.equal(Array.isArray(first.whyThisRead), true);
  assert.equal(Array.isArray(first.safeReviewFocus), true);
  assert.equal(Array.isArray(first.actions), true);
  assert.equal(Array.isArray(first.followupPrompts), true);
  assert.equal(Array.isArray(first.reviewActions), true);
  assert.deepEqual(first, second);
});

runTest("household assistant review actions map deterministically to workspace filters", () => {
  const fixture = buildHouseholdAssistantFixture();
  const actions = buildHouseholdAssistantReviewActions({
    intent: "property_operating_graph",
    queueItems: fixture.queueItems,
    householdId: "household-1",
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].target, "review_workspace");
  assert.equal(actions[0].filters.module, "property");
  assert.equal(actions[0].filters.issueType, "missing_protection");
  assert.equal(actions[0].filters.householdId, "household-1");
  assert.equal(actions[0].route.includes("/review-workspace?"), true);
});

runTest("review workspace route parsing restores assistant filters safely", () => {
  const route = buildReviewWorkspaceRoute({
    filters: {
      module: "property",
      issueType: "missing_protection",
      severity: "high",
      householdId: "household-1",
      recordId: "property-1",
    },
    openedFromAssistant: true,
  });
  const parsed = parseReviewWorkspaceHashState(`#${route}`, "household-1");

  assert.equal(parsed.openedFromAssistant, true);
  assert.equal(parsed.invalid, false);
  assert.deepEqual(parsed.filters, {
    module: "property",
    issueType: "missing_protection",
    severity: "high",
    householdId: "household-1",
    recordId: "property-1",
  });
});

runTest("invalid or stale review workspace filters fail safely", () => {
  const invalidModule = parseReviewWorkspaceHashState(
    "#/review-workspace?origin=household_assistant&module=unknown&issueType=missing_protection",
    "household-1"
  );
  const staleHousehold = parseReviewWorkspaceHashState(
    "#/review-workspace?origin=household_assistant&module=property&issueType=missing_protection&householdId=other-household",
    "household-1"
  );

  assert.equal(invalidModule.filters, null);
  assert.equal(invalidModule.openedFromAssistant, false);
  assert.equal(staleHousehold.filters, null);
  assert.equal(staleHousehold.openedFromAssistant, false);
});

runTest("review workspace filter application scopes queue items and clearing returns default queue", () => {
  const fixture = buildHouseholdAssistantFixture();
  const derivedFilter = deriveReviewWorkspaceCandidateFromQueueItem(fixture.queueItems[0], "household-1");
  const filtered = applyReviewWorkspaceFilters(fixture.queueItems, derivedFilter, "household-1");
  const cleared = applyReviewWorkspaceFilters(fixture.queueItems, null, "household-1");

  assert.equal(derivedFilter.module, "property");
  assert.equal(derivedFilter.issueType, "missing_protection");
  assert.equal(filtered.length, 1);
  assert.equal(cleared.length, fixture.queueItems.length);
  assert.equal(buildReviewWorkspaceRoute(), "/review-workspace");
});

runTest("review workflow memory persists by normalized issue filter when queue ids change", () => {
  const fixture = buildHouseholdAssistantFixture();
  const originalItem = fixture.queueItems[0];
  const workflowState = {
    [originalItem.id]: buildReviewWorkflowStateEntry({
      item: originalItem,
      householdId: "household-1",
      updates: {
        status: "reviewed",
        updated_at: "2026-04-13T08:00:00.000Z",
      },
    }),
  };
  const replacementItem = {
    ...originalItem,
    id: `${originalItem.id}:replacement`,
  };
  const annotated = annotateReviewWorkflowItems([replacementItem], workflowState);

  assert.equal(annotated[0].workflow_status, "reviewed");
  assert.equal(Boolean(annotated[0].workflow_resolution_key), true);
});

runTest("persisted workflow state is rebuilt from household issue metadata", () => {
  const issueRows = [
    {
      id: "issue-1",
      updated_at: "2026-04-14T09:00:00.000Z",
      metadata: {
        workflow_state: {
          status: "reviewed",
          updated_at: "2026-04-14T09:00:00.000Z",
          resolution_filters: {
            module: "property",
            issueType: "missing_protection",
            householdId: "household-1",
            assetId: "asset-1",
            recordId: "property-1",
          },
          resolution_key: "property|missing_protection|asset-1|property-1",
        },
      },
    },
  ];

  const persistedState = buildPersistedReviewWorkflowState(issueRows);

  assert.equal(persistedState["issue-1"].status, "reviewed");
  assert.equal(
    persistedState["issue-1"].resolution_key,
    "property|missing_protection|asset-1|property-1"
  );
});

runTest("persisted workflow state primes the sync getter and wins when newer than local storage", () => {
  globalThis.window = {
    localStorage: {
      store: {},
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
      },
      setItem(key, value) {
        this.store[key] = String(value);
      },
      removeItem(key) {
        delete this.store[key];
      },
    },
  };

  const scope = { householdId: "household-1", userId: "user-1" };
  window.localStorage.setItem(
    "vaultedshield_household_review_workflow_v2",
    JSON.stringify({
      "user-1:household-1": {
        "queue-item-1": {
          status: "follow_up",
          updated_at: "2026-04-14T08:00:00.000Z",
          resolution_key: "property|missing_protection|asset-1|property-1",
          resolution_filters: {
            module: "property",
            issueType: "missing_protection",
            householdId: "household-1",
            assetId: "asset-1",
            recordId: "property-1",
          },
        },
      },
    })
  );

  primeHouseholdReviewWorkflowState(scope, [
    {
      id: "issue-1",
      updated_at: "2026-04-14T09:00:00.000Z",
      metadata: {
        workflow_state: {
          status: "reviewed",
          updated_at: "2026-04-14T09:00:00.000Z",
          resolution_filters: {
            module: "property",
            issueType: "missing_protection",
            householdId: "household-1",
            assetId: "asset-1",
            recordId: "property-1",
          },
          resolution_key: "property|missing_protection|asset-1|property-1",
        },
      },
    },
  ]);

  const mergedState = getHouseholdReviewWorkflowState(scope);
  const mergedEntry = Object.values(mergedState).find(
    (entry) => entry.resolution_key === "property|missing_protection|asset-1|property-1"
  );

  assert.equal(mergedEntry.status, "reviewed");
  assert.equal(mergedEntry.persisted_issue_id, "issue-1");

  delete globalThis.window;
});

runTest("workflow-aware household context suppresses resolved issues and updates readiness", () => {
  const fixture = buildHouseholdAssistantFixture();
  const reviewedState = {
    [fixture.queueItems[0].id]: buildReviewWorkflowStateEntry({
      item: fixture.queueItems[0],
      householdId: "household-1",
      updates: {
        status: "reviewed",
        updated_at: "2026-04-13T08:00:00.000Z",
      },
    }),
  };
  const annotatedQueue = annotateReviewWorkflowItems(fixture.queueItems, reviewedState);
  const workflowContext = buildWorkflowAwareHouseholdContext({
    householdMap: fixture.householdMap,
    queueItems: annotatedQueue,
    reviewDigest: fixture.reviewDigest,
    bundle: fixture.bundle,
  });

  assert.equal(workflowContext.activeQueueItems.length, annotatedQueue.length - 1);
  assert.equal(workflowContext.resolvedQueueItems.length, 1);
  assert.equal(/active household queue is currently clear|held out of active priority/i.test(workflowContext.householdMap.bottom_line), true);
  assert.equal(workflowContext.scorecard.overallScore >= fixture.scorecard.overallScore, true);
});

runTest("household assistant stops surfacing reviewed issues as the next active priority", () => {
  const fixture = buildHouseholdAssistantFixture();
  const reviewedState = Object.fromEntries(
    fixture.queueItems.map((item, index) => [
      item.id,
      buildReviewWorkflowStateEntry({
        item,
        householdId: "household-1",
        updates: {
          status: "reviewed",
          updated_at: `2026-04-13T08:0${index}:00.000Z`,
        },
      }),
    ])
  );
  const annotatedQueue = annotateReviewWorkflowItems(fixture.queueItems, reviewedState);
  const response = routeGlobalAssistantRequest({
    assistantType: "household",
    question: "What needs attention first?",
    recordContext: fixture.householdMap,
    analyticsContext: {},
    precomputed: {
      reviewDigest: fixture.reviewDigest,
      queueItems: annotatedQueue,
      bundle: fixture.bundle,
    },
  });

  assert.equal(response.reviewAction, null);
  assert.equal(response.answer.includes(fixture.queueItems[0].label), false);
});

runTest("mortgage and property assistants stay honest when core data is missing", () => {
  const mortgageResponse = generateMortgageResponse({
    question: "What is missing here?",
    type: MORTGAGE_QUESTION_TYPES.missing_data,
    mortgage: {
      id: "mortgage-missing",
      current_status: "active",
      mortgage_loan_type_key: "fixed_rate_mortgage",
    },
    analytics: {},
    precomputed: {
      mortgageDocuments: [],
      mortgageSnapshots: [],
      propertyLinks: [],
    },
  });

  const propertyResponse = generatePropertyResponse({
    question: "What is missing from this property?",
    type: PROPERTY_QUESTION_TYPES.missing_data,
    property: {
      id: "property-missing",
      property_address: "",
      city: "",
      state: "",
      postal_code: "",
    },
    analytics: {},
    precomputed: {
      latestPropertyValuation: null,
      linkedMortgages: [],
      linkedHomeownersPolicies: [],
      propertyDocuments: [],
      portalLinks: [],
    },
  });

  assert.equal(/monthly statement/i.test(mortgageResponse.answer), true);
  assert.equal(/saved virtual valuation is not available/i.test(propertyResponse.answer), true);
});

runTest("household assistant stays honest when household visibility is thin", () => {
  const fixture = buildHouseholdAssistantFixture({
    includeAssets: false,
    includeDocuments: false,
    includePortals: false,
  });
  const response = routeGlobalAssistantRequest({
    assistantType: "household",
    question: "What is limiting continuity most?",
    recordContext: fixture.householdMap,
    analyticsContext: {},
    precomputed: {
      reviewDigest: fixture.reviewDigest,
      queueItems: fixture.queueItems,
      bundle: fixture.bundle,
      scorecard: fixture.scorecard,
      priorityEngine: fixture.priorityEngine,
    },
  });

  assert.equal(response.confidence, "low");
  assert.equal(/more complete household review/i.test(response.uncertainty), true);
  assert.equal(Array.isArray(response.supportingData.uncertainties), true);
  assert.equal(response.supportingData.uncertainties.length > 0, true);
});

runTest("assistant section targets stay string-only and deterministic", () => {
  const first = routeGlobalAssistantRequest({
    assistantType: "property",
    question: "Does this property have protection?",
    recordContext: {
      id: "property-2",
      property_address: "456 Main St",
      city: "San Jose",
      state: "CA",
      postal_code: "95112",
      square_feet: 1400,
      beds: 2,
      baths: 2,
      year_built: 1988,
    },
    analyticsContext: {},
    precomputed: {
      latestPropertyValuation: {
        confidence_label: "strong",
        confidence_score: 0.82,
        midpoint_estimate: 910000,
        comps_count: 4,
        metadata: { official_market_support: "aligned", review_flags: [] },
      },
      propertyStackAnalytics: {
        completeness_score: 0.88,
        continuity_status: "strong",
        linkage_status: "connected",
        has_homeowners: true,
      },
      propertyEquityPosition: {
        equity_visibility_status: "strong",
        financing_status: "visible",
        protection_status: "visible",
        primary_mortgage_balance: 380000,
      },
      linkedMortgages: [{ id: "mortgage-2" }],
      linkedHomeownersPolicies: [{ id: "homeowners-1" }],
      propertyDocuments: [{ id: "doc-2" }],
      portalLinks: [{ id: "portal-1", portal_profiles: { institution_name: "County Portal" } }],
      propertySignals: {
        signalLevel: "healthy",
        confidence: 0.84,
        reasons: ["Protection and liability links are visible."],
      },
    },
  });

  const second = routeGlobalAssistantRequest({
    assistantType: "property",
    question: "Does this property have protection?",
    recordContext: {
      id: "property-2",
      property_address: "456 Main St",
      city: "San Jose",
      state: "CA",
      postal_code: "95112",
      square_feet: 1400,
      beds: 2,
      baths: 2,
      year_built: 1988,
    },
    analyticsContext: {},
    precomputed: {
      latestPropertyValuation: {
        confidence_label: "strong",
        confidence_score: 0.82,
        midpoint_estimate: 910000,
        comps_count: 4,
        metadata: { official_market_support: "aligned", review_flags: [] },
      },
      propertyStackAnalytics: {
        completeness_score: 0.88,
        continuity_status: "strong",
        linkage_status: "connected",
        has_homeowners: true,
      },
      propertyEquityPosition: {
        equity_visibility_status: "strong",
        financing_status: "visible",
        protection_status: "visible",
        primary_mortgage_balance: 380000,
      },
      linkedMortgages: [{ id: "mortgage-2" }],
      linkedHomeownersPolicies: [{ id: "homeowners-1" }],
      propertyDocuments: [{ id: "doc-2" }],
      portalLinks: [{ id: "portal-1", portal_profiles: { institution_name: "County Portal" } }],
      propertySignals: {
        signalLevel: "healthy",
        confidence: 0.84,
        reasons: ["Protection and liability links are visible."],
      },
    },
  });

  assert.equal(first.sectionTargets.every((target) => typeof target === "string" && target.length > 0), true);
  assert.deepEqual(first, second);
});

runTest("normalizeIssueInput validates and cleans the canonical issue payload", () => {
  const normalized = normalizeIssueInput({
    household_id: "H1",
    module_key: "Property",
    issue_type: "Coverage Gap",
    issue_key: "property_missing_homeowners",
    asset_id: "A1",
    record_id: null,
    title: "Primary property is missing homeowners coverage",
    summary: "Protection linkage was not identified.",
    severity: "high",
    priority: "medium",
    source_system: "property_engine",
    metadata: { area: "stack" },
  });

  assert.equal(normalized.household_id, "H1");
  assert.equal(normalized.module_key, "property");
  assert.equal(normalized.issue_type, "coverage_gap");
  assert.equal(normalized.issue_key, "property_missing_homeowners");
  assert.equal(normalized.severity, "high");
  assert.equal(normalized.priority, "medium");
  assert.deepEqual(normalized.metadata, { area: "stack" });
  assert.equal(normalized.evidence, null);
});

runTest("detected issue adapters map the first-pass household prompt families into canonical issues", () => {
  const detected = buildDetectedIssues(buildAllSignalDetectionContext());
  const moduleKeys = new Set(detected.map((issue) => issue.module_key));

  assert.equal(moduleKeys.has("property"), true);
  assert.equal(moduleKeys.has("portals"), true);
  assert.equal(moduleKeys.has("retirement"), true);
  assert.equal(moduleKeys.has("estate"), true);
  assert.equal(moduleKeys.has("contacts"), true);
  assert.equal(moduleKeys.has("insurance"), true);
  assert.equal(moduleKeys.has("warranties"), true);
  assert.equal(detected.every((issue) => typeof issue.detection_hash === "string" && issue.detection_hash.length > 0), true);
});

runTest("detected issue adapters stay deterministic for the same source signals", () => {
  const context = buildAllSignalDetectionContext();
  const first = buildDetectedIssues(context);
  const second = buildDetectedIssues(context);

  assert.deepEqual(first, second);
  assert.equal(buildDetectedIssuesFingerprint(first), buildDetectedIssuesFingerprint(second));
});

await runAsyncTest("detected property coverage gap becomes one canonical open household issue", async () => {
  const context = buildPropertyMissingHomeownersDetectionContext();
  const detected = buildDetectedIssues(context);
  const supabase = createIssueSupabaseDouble();

  assert.equal(detected.length, 1);
  assert.equal(detected[0].module_key, "property");
  assert.equal(detected[0].issue_type, "coverage_gap");
  assert.equal(detected[0].issue_key, "property_missing_homeowners:a1");

  const syncResult = await syncDetectedIssues(context, {
    supabase,
    currentUserId: "user-1",
    now: "2026-04-13T12:00:00.000Z",
  });

  assert.equal(syncResult.createdCount, 1);
  assert.equal(syncResult.updatedCount, 0);
  assert.equal(syncResult.reopenedCount, 0);
  assert.equal(syncResult.totalProcessed, 1);
  assert.equal(syncResult.issues[0].status, "open");
  assert.equal(supabase.__state.rows.length, 1);
});

await runAsyncTest("detected property coverage gap refreshes the same row when evidence changes", async () => {
  const firstContext = buildPropertyMissingHomeownersDetectionContext();
  const secondContext = buildPropertyMissingHomeownersDetectionContext({
    properties: [
      {
        id: "property-1",
        asset_id: "A1",
        property_name: "Primary Residence",
        address_line_1: "789 Updated Ave",
        city: "San Jose",
        state: "CA",
      },
    ],
  });
  const supabase = createIssueSupabaseDouble();

  const firstDetected = buildDetectedIssues(firstContext);
  const secondDetected = buildDetectedIssues(secondContext);
  assert.notEqual(firstDetected[0].detection_hash, secondDetected[0].detection_hash);

  const firstSync = await syncDetectedIssues(firstContext, {
    supabase,
    currentUserId: "user-1",
    now: "2026-04-13T12:00:00.000Z",
  });
  const secondSync = await syncDetectedIssues(secondContext, {
    supabase,
    currentUserId: "user-1",
    now: "2026-04-13T13:00:00.000Z",
  });

  assert.equal(secondSync.createdCount, 0);
  assert.equal(secondSync.updatedCount, 1);
  assert.equal(secondSync.reopenedCount, 0);
  assert.equal(secondSync.issues[0].id, firstSync.issues[0].id);
  assert.equal(secondSync.issues[0].detection_hash, secondDetected[0].detection_hash);
  assert.equal(supabase.__state.rows.length, 1);
});

await runAsyncTest("detected property coverage gap reopens the same row after resolution", async () => {
  const context = buildPropertyMissingHomeownersDetectionContext();
  const supabase = createIssueSupabaseDouble();

  const firstSync = await syncDetectedIssues(context, {
    supabase,
    currentUserId: "user-1",
    now: "2026-04-13T12:00:00.000Z",
  });

  await resolveHouseholdIssue(
    firstSync.issues[0].id,
    {
      resolution_reason: "temporarily_cleared",
      resolution_note: "Marked resolved during review.",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T12:30:00.000Z",
    }
  );

  const secondSync = await syncDetectedIssues(context, {
    supabase,
    currentUserId: "user-2",
    now: "2026-04-13T13:00:00.000Z",
  });

  assert.equal(secondSync.createdCount, 0);
  assert.equal(secondSync.updatedCount, 0);
  assert.equal(secondSync.reopenedCount, 1);
  assert.equal(secondSync.issues[0].id, firstSync.issues[0].id);
  assert.equal(secondSync.issues[0].status, "open");
  assert.equal(supabase.__state.rows.length, 1);
});

await runAsyncTest("detected property coverage gaps stay separate when asset scope differs", async () => {
  const context = buildPropertyMissingHomeownersDetectionContext({
    properties: [
      {
        id: "property-1",
        asset_id: "A1",
        property_name: "Primary Residence",
        address_line_1: "123 Main St",
        city: "San Jose",
        state: "CA",
      },
      {
        id: "property-2",
        asset_id: "A2",
        property_name: "Lake House",
        address_line_1: "456 Lake Rd",
        city: "Truckee",
        state: "CA",
      },
    ],
  });
  const supabase = createIssueSupabaseDouble();

  const syncResult = await syncDetectedIssues(context, {
    supabase,
    currentUserId: "user-1",
    now: "2026-04-13T12:00:00.000Z",
  });

  assert.equal(syncResult.createdCount, 2);
  assert.equal(syncResult.totalProcessed, 2);
  assert.equal(new Set(syncResult.issues.map((issue) => issue.issue_key)).size, 2);
  assert.equal(supabase.__state.rows.length, 2);
});

await runAsyncTest("household issue lifecycle inserts first detection as one open issue", async () => {
  const supabase = createIssueSupabaseDouble();
  const issue = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      title: "Primary property is missing homeowners coverage",
      summary: "Protection linkage was not identified.",
      severity: "high",
      priority: "high",
      source_system: "property_engine",
      evidence: { linkedHomeowners: false },
      metadata: { section: "property-stack" },
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T09:00:00.000Z",
    }
  );

  assert.equal(issue.status, "open");
  assert.equal(issue.first_detected_at, "2026-04-13T09:00:00.000Z");
  assert.equal(issue.last_detected_at, "2026-04-13T09:00:00.000Z");
  assert.equal(supabase.__state.rows.length, 1);
});

await runAsyncTest("household issue lifecycle refreshes repeated detection without duplication", async () => {
  const supabase = createIssueSupabaseDouble();
  const first = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      title: "Primary property is missing homeowners coverage",
      summary: "Initial summary",
      severity: "high",
      priority: "high",
      source_system: "property_engine",
      evidence: { version: 1 },
      metadata: { stage: "initial" },
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T09:00:00.000Z",
    }
  );

  const second = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      title: "Primary property is missing homeowners coverage",
      summary: "Updated summary",
      severity: "critical",
      priority: "medium",
      source_system: "property_engine",
      evidence: { version: 2 },
      metadata: { stage: "refresh" },
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T10:00:00.000Z",
    }
  );

  assert.equal(second.id, first.id);
  assert.equal(second.summary, "Updated summary");
  assert.equal(second.severity, "critical");
  assert.equal(second.last_detected_at, "2026-04-13T10:00:00.000Z");
  assert.equal(supabase.__state.rows.length, 1);
});

await runAsyncTest("household issue lifecycle reopens the same row after resolve and redetection", async () => {
  const supabase = createIssueSupabaseDouble();
  const detected = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      title: "Primary property is missing homeowners coverage",
      summary: "Protection linkage was not identified.",
      severity: "high",
      priority: "high",
      source_system: "property_engine",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T09:00:00.000Z",
    }
  );

  const resolved = await resolveHouseholdIssue(
    detected.id,
    {
      resolution_reason: "link_verified",
      resolution_note: "Coverage was confirmed during review.",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T10:00:00.000Z",
    }
  );

  const reopened = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      title: "Primary property is missing homeowners coverage",
      summary: "Fresh evidence shows protection linkage is still incomplete.",
      severity: "high",
      priority: "high",
      source_system: "property_engine",
    },
    {
      supabase,
      currentUserId: "user-2",
      now: "2026-04-13T11:00:00.000Z",
    }
  );

  assert.equal(resolved.status, "resolved");
  assert.equal(reopened.id, detected.id);
  assert.equal(reopened.status, "open");
  assert.equal(reopened.reopened_at, "2026-04-13T11:00:00.000Z");
  assert.equal(reopened.reopened_by, "user-2");
  assert.equal(supabase.__state.rows.length, 1);
});

await runAsyncTest("household issue lifecycle reopens the same row after ignore and redetection", async () => {
  const supabase = createIssueSupabaseDouble();
  const detected = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "portal",
      issue_type: "continuity_gap",
      issue_key: "primary_portal_missing_recovery",
      asset_id: "A1",
      title: "Primary portal continuity is incomplete",
      summary: "Recovery contact data is still missing.",
      severity: "medium",
      priority: "low",
      source_system: "portal_engine",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T09:00:00.000Z",
    }
  );

  const ignored = await ignoreHouseholdIssue(
    detected.id,
    {
      resolution_note: "Temporarily ignored during setup cleanup.",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T10:00:00.000Z",
    }
  );

  const reopened = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "portal",
      issue_type: "continuity_gap",
      issue_key: "primary_portal_missing_recovery",
      asset_id: "A1",
      title: "Primary portal continuity is incomplete",
      summary: "Recovery contact data is still missing after the latest read.",
      severity: "medium",
      priority: "low",
      source_system: "portal_engine",
    },
    {
      supabase,
      currentUserId: "user-3",
      now: "2026-04-13T11:00:00.000Z",
    }
  );

  assert.equal(ignored.status, "ignored");
  assert.equal(reopened.id, detected.id);
  assert.equal(reopened.status, "open");
  assert.equal(reopened.reopened_at, "2026-04-13T11:00:00.000Z");
  assert.equal(reopened.reopened_by, "user-3");
  assert.equal(supabase.__state.rows.length, 1);
});

await runAsyncTest("household issue lifecycle appends durable issue events", async () => {
  const supabase = createIssueSupabaseDouble();
  const detected = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      title: "Primary property is missing homeowners coverage",
      summary: "Protection linkage was not identified.",
      severity: "high",
      priority: "high",
      source_system: "property_engine",
      detection_hash: "detect-v1",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T09:00:00.000Z",
    }
  );

  await resolveHouseholdIssue(
    detected.id,
    {
      resolution_reason: "link_verified",
      resolution_note: "Coverage was confirmed during review.",
    },
    {
      supabase,
      currentUserId: "user-2",
      now: "2026-04-13T10:00:00.000Z",
    }
  );

  await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      title: "Primary property is missing homeowners coverage",
      summary: "Fresh evidence shows protection linkage is still incomplete.",
      severity: "high",
      priority: "high",
      source_system: "property_engine",
      detection_hash: "detect-v2",
    },
    {
      supabase,
      currentUserId: "user-3",
      now: "2026-04-13T11:00:00.000Z",
    }
  );

  const events = await listHouseholdIssueEvents(
    {
      issueId: detected.id,
    },
    { supabase }
  );

  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => event.event_type),
    ["reopened", "resolved", "detected"]
  );
  assert.equal(events[0].event_reason, "stale_review_superseded");
  assert.equal(events[0].actor_user_id, "user-3");
  assert.equal(events[1].metadata.resolution_reason, "link_verified");
});

await runAsyncTest("household issue event helpers filter recent resolved and reopened rows", async () => {
  const supabase = createIssueSupabaseDouble();
  const issue = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "portal",
      issue_type: "continuity_gap",
      issue_key: "primary_portal_missing_recovery",
      asset_id: "A1",
      title: "Primary portal continuity is incomplete",
      summary: "Recovery contact data is still missing.",
      severity: "medium",
      priority: "low",
      source_system: "portal_engine",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T09:00:00.000Z",
    }
  );

  await resolveHouseholdIssue(
    issue.id,
    {
      resolution_reason: "temporarily_cleared",
      resolution_note: "Marked resolved during review.",
    },
    {
      supabase,
      currentUserId: "user-2",
      now: "2026-04-13T10:00:00.000Z",
    }
  );

  await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "portal",
      issue_type: "continuity_gap",
      issue_key: "primary_portal_missing_recovery",
      asset_id: "A1",
      title: "Primary portal continuity is incomplete",
      summary: "Recovery contact data is still missing after the latest read.",
      severity: "medium",
      priority: "low",
      source_system: "portal_engine",
    },
    {
      supabase,
      currentUserId: "user-3",
      now: "2026-04-13T11:00:00.000Z",
    }
  );

  const resolvedEvents = await listRecentResolvedIssuesForHousehold("H1", {
    supabase,
    limit: 5,
  });
  const reopenedEvents = await listRecentReopenedIssuesForHousehold("H1", {
    supabase,
    limit: 5,
  });

  assert.equal(resolvedEvents.length, 1);
  assert.equal(resolvedEvents[0].event_type, "resolved");
  assert.equal(reopenedEvents.length, 1);
  assert.equal(reopenedEvents[0].event_type, "reopened");
  assert.equal(reopenedEvents[0].event_reason, "stale_review_superseded");
});

await runAsyncTest("household issue lifecycle creates a new row for a distinct issue key", async () => {
  const supabase = createIssueSupabaseDouble();
  await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      title: "Primary property is missing homeowners coverage",
      summary: "Protection linkage was not identified.",
      severity: "high",
      priority: "high",
      source_system: "property_engine",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T09:00:00.000Z",
    }
  );

  const second = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_portal",
      asset_id: "A1",
      title: "Primary property portal continuity is incomplete",
      summary: "Portal support is still missing.",
      severity: "medium",
      priority: "low",
      source_system: "property_engine",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T10:00:00.000Z",
    }
  );

  assert.equal(second.issue_key, "property_missing_portal");
  assert.equal(supabase.__state.rows.length, 2);
});

await runAsyncTest("household issue lookup and open issue listing stay deterministic", async () => {
  const supabase = createIssueSupabaseDouble();
  const first = await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      record_id: "property-1",
      title: "Primary property is missing homeowners coverage",
      summary: "Protection linkage was not identified.",
      severity: "high",
      priority: "high",
      source_system: "property_engine",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T09:00:00.000Z",
    }
  );
  await upsertHouseholdIssue(
    {
      household_id: "H1",
      module_key: "portal",
      issue_type: "continuity_gap",
      issue_key: "primary_portal_missing_recovery",
      asset_id: "A1",
      title: "Primary portal continuity is incomplete",
      summary: "Recovery contact data is still missing.",
      severity: "critical",
      priority: "high",
      source_system: "portal_engine",
    },
    {
      supabase,
      currentUserId: "user-1",
      now: "2026-04-13T10:00:00.000Z",
    }
  );
  await upsertHouseholdIssue(
    {
      household_id: "H2",
      module_key: "mortgage",
      issue_type: "document_gap",
      issue_key: "mortgage_missing_statement",
      asset_id: "A2",
      title: "Mortgage statement support is thin",
      summary: "A current monthly statement was not identified.",
      severity: "medium",
      priority: "medium",
      source_system: "mortgage_engine",
    },
    {
      supabase,
      currentUserId: "user-2",
      now: "2026-04-13T11:00:00.000Z",
    }
  );

  const existing = await findExistingHouseholdIssueByIdentity(
    {
      household_id: "H1",
      module_key: "property",
      issue_type: "coverage_gap",
      issue_key: "property_missing_homeowners",
      asset_id: "A1",
      record_id: "property-1",
    },
    { supabase }
  );
  const openForAsset = await listOpenIssuesForAsset("A1", { supabase });
  const openForHousehold = await listOpenIssuesForHousehold("H1", { supabase });

  assert.equal(existing.id, first.id);
  assert.equal(openForAsset.length, 2);
  assert.equal(openForAsset[0].severity, "critical");
  assert.equal(openForHousehold.length, 2);
  assert.equal(openForHousehold[0].severity, "critical");
});

runTest("normalizeLifePolicy classifies variable universal life and exposes VUL fields", () => {
  const lifePolicy = normalizeLifePolicy({
    normalizedPolicy: {
      policy_identity: {
        product_name: field("Strategic Advantage VUL"),
        policy_type: field("Variable Universal Life"),
      },
      values: {
        accumulation_value: field(125000, "high", "$125,000.00"),
        cash_surrender_value: field(119400, "high", "$119,400.00"),
        fixed_account_value: field(18000, "high", "$18,000.00"),
      },
      charges: {
        cost_of_insurance: field(1900, "high", "$1,900.00"),
      },
      loans: {
        loan_balance: field(12000, "high", "$12,000.00"),
      },
    },
    normalizedAnalytics: {
      completeness_assessment: { status: "moderate" },
    },
  });

  assert.equal(lifePolicy.meta.policyType, "vul");
  assert.equal(lifePolicy.meta.policyTypeLabel, "Variable Universal Life");
  assert.equal(lifePolicy.typeSpecific.accountValue, "$125,000.00");
  assert.equal(lifePolicy.typeSpecific.fixedAccountValue, "$18,000.00");
  assert.equal(lifePolicy.typeSpecific.allocationDetailVisible, true);
  assert.ok(lifePolicy.meta.supportedInterpretationAreas.includes("market_exposure"));
});

runTest("policy assistant returns VUL-specific allocation guidance", () => {
  const lifePolicy = normalizeLifePolicy({
    normalizedPolicy: {
      policy_identity: {
        product_name: field("Strategic Advantage VUL"),
        policy_type: field("Variable Universal Life"),
      },
      values: {
        accumulation_value: field(125000, "high", "$125,000.00"),
        fixed_account_value: field(18000, "high", "$18,000.00"),
      },
      loans: {
        loan_balance: field(12000, "high", "$12,000.00"),
      },
    },
    normalizedAnalytics: {
      completeness_assessment: { status: "moderate" },
      charge_summary: { total_coi: 1900, total_visible_policy_charges: 2400 },
    },
  });
  const insightSummary = buildPolicyInsightSummary({
    lifePolicy,
    normalizedAnalytics: {
      charge_summary: { total_coi: 1900, total_visible_policy_charges: 2400 },
      comparison_summary: { latest_statement_date: "2026-03-31", missing_fields: [] },
    },
    statementRows: [{ statement_date: "2026-03-31" }, { statement_date: "2025-03-31" }],
    comparisonSummary: { latest_statement_date: "2026-03-31", missing_fields: [] },
  });

  const response = buildPolicyAssistantAnswer({
    intent: "vul_allocation_visibility",
    lifePolicy,
    normalizedAnalytics: {
      charge_summary: { total_coi: 1900, total_visible_policy_charges: 2400 },
    },
    comparisonSummary: { latest_statement_date: "2026-03-31", missing_fields: [] },
    insightSummary,
  });

  assert.equal(response.intent, "vul_allocation_visibility");
  assert.equal(response.confidence, "moderate");
  assert.match(response.answer, /allocation support is visible/i);
  assert.ok(response.suggestedFollowUps.includes("How exposed is this policy to market performance?"));
});

console.log("All IUL regression checks passed.");
