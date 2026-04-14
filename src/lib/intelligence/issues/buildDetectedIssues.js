import { normalizeIssueInput } from "../../domain/issues/issueTypes.js";

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function sanitizeKeySegment(value, fallback = "unknown") {
  const normalized = cleanString(value)
    ?.toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function stableSerialize(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function hashStableString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return `det_${(hash >>> 0).toString(36)}`;
}

function buildScopeKey(scope, fallbackLabel) {
  return sanitizeKeySegment(scope, fallbackLabel);
}

function buildScopedIssueKey(baseKey, scopeValue, fallbackLabel = "household") {
  return `${sanitizeKeySegment(baseKey)}:${buildScopeKey(scopeValue, fallbackLabel)}`;
}

function buildEvidenceHashInput({
  moduleKey,
  issueType,
  issueKey,
  assetId,
  recordId,
  evidence,
  metadata,
  summary,
  severity,
  priority,
}) {
  return {
    moduleKey,
    issueType,
    issueKey,
    assetId: cleanString(assetId),
    recordId: cleanString(recordId),
    severity: cleanString(severity),
    priority: cleanString(priority),
    summary: cleanString(summary),
    evidence: evidence ?? null,
    metadata: metadata ?? {},
  };
}

function buildIdentityFingerprint(issue) {
  return [
    issue.household_id,
    issue.module_key,
    issue.issue_type,
    issue.issue_key,
    issue.asset_id || "asset:null",
    issue.record_id || "record:null",
  ].join("|");
}

function normalizeAssetId(record) {
  return cleanString(
    record?.asset_id ||
      record?.assetId ||
      record?.linked_asset_id ||
      record?.linkedAssetId ||
      null
  );
}

function normalizeRecordId(record) {
  return cleanString(
    record?.record_id ||
      record?.recordId ||
      record?.id ||
      null
  );
}

function getDisplayLabel(record, fallback = "record") {
  return (
    cleanString(record?.property_name) ||
    cleanString(record?.asset_name) ||
    cleanString(record?.nickname) ||
    cleanString(record?.display_name) ||
    cleanString(record?.covered_item_name) ||
    cleanString(record?.provider_name) ||
    cleanString(record?.institution_name) ||
    cleanString(record?.carrier) ||
    cleanString(record?.carrier_name) ||
    cleanString(record?.product) ||
    cleanString(record?.product_name) ||
    cleanString(record?.plan_name) ||
    cleanString(record?.account_name) ||
    cleanString(record?.address_line_1) ||
    cleanString(record?.property_address) ||
    fallback
  );
}

function normalizeHouseholdId(context = {}) {
  return (
    cleanString(context.householdId) ||
    cleanString(context.household_id) ||
    cleanString(context.bundle?.household?.id) ||
    cleanString(context.bundle?.household_id)
  );
}

function hasReviewFlag(intelligence = {}, flagKey) {
  return Array.isArray(intelligence?.review_flags)
    ? intelligence.review_flags.includes(flagKey)
    : false;
}

function addDetectedIssue(collection, rawIssue) {
  const normalizedIssue = normalizeIssueInput(rawIssue);
  collection.set(buildIdentityFingerprint(normalizedIssue), normalizedIssue);
}

export function buildIssueKey(baseKey, scopeValue, fallbackLabel = "household") {
  return buildScopedIssueKey(baseKey, scopeValue, fallbackLabel);
}

export function buildDetectionHash(payload) {
  return hashStableString(stableSerialize(payload));
}

function createDetectedIssue({
  householdId,
  moduleKey,
  issueType,
  issueKey,
  assetId = null,
  recordId = null,
  title,
  summary,
  severity = "medium",
  priority = null,
  sourceSystem = "household_engine",
  dueAt = null,
  evidence = null,
  metadata = {},
}) {
  const detectionHash = buildDetectionHash(
    buildEvidenceHashInput({
      moduleKey,
      issueType,
      issueKey,
      assetId,
      recordId,
      evidence,
      metadata,
      summary,
      severity,
      priority,
    })
  );

  return {
    household_id: householdId,
    module_key: moduleKey,
    issue_type: issueType,
    issue_key: issueKey,
    asset_id: assetId,
    record_id: recordId,
    title,
    summary,
    severity,
    priority,
    detection_hash: detectionHash,
    source_system: sourceSystem,
    due_at: dueAt,
    evidence,
    metadata,
  };
}

function buildPropertyCoverageGapIssues(context) {
  const householdId = context.householdId;
  const propertySummary = context.bundle?.propertyStackSummary || {};
  const properties = Array.isArray(propertySummary.propertiesMissingHomeownersLink)
    ? propertySummary.propertiesMissingHomeownersLink
    : [];

  return properties.map((property) => {
    const assetId = normalizeAssetId(property) || normalizeRecordId(property);
    const recordId = normalizeRecordId(property);
    const propertyLabel = getDisplayLabel(property, "Property");
    const issueKey = buildIssueKey(
      "property_missing_homeowners",
      assetId || recordId || householdId,
      "property"
    );
    const evidence = {
      property_id: recordId,
      property_label: propertyLabel,
      address_line_1: cleanString(property?.address_line_1) || cleanString(property?.property_address),
      city: cleanString(property?.city),
      state: cleanString(property?.state),
      mortgage_linked: true,
      homeowners_linked: false,
    };

    return createDetectedIssue({
      householdId,
      moduleKey: "property",
      issueType: "coverage_gap",
      issueKey,
      assetId,
      recordId,
      title: `${propertyLabel} is missing homeowners protection`,
      summary:
        `${propertyLabel} appears to have financing visibility, but linked homeowners coverage was not identified in the current property stack.`,
      severity: "high",
      priority: "high",
      sourceSystem: "property_engine",
      evidence,
      metadata: {
        source_signal: "properties_missing_homeowners_link",
        route: recordId ? `/property/detail/${recordId}` : "/property",
      },
    });
  });
}

function buildPortalContinuityIssues(context) {
  const householdId = context.householdId;
  const readiness = context.bundle?.portalReadiness || {};
  const assets = Array.isArray(readiness.criticalAssetsWithoutLinkedPortals)
    ? readiness.criticalAssetsWithoutLinkedPortals
    : [];

  return assets.map((asset) => {
    const assetId = normalizeAssetId(asset) || normalizeRecordId(asset);
    const recordId = cleanString(asset?.linked_record_id) || null;
    const assetLabel = getDisplayLabel(asset, "Asset");
    const issueKey = buildIssueKey(
      "asset_missing_portal",
      assetId || recordId || householdId,
      "asset"
    );
    const evidence = {
      asset_id: assetId,
      asset_label: assetLabel,
      asset_category: cleanString(asset?.asset_category),
      portal_linked: false,
      recovery_support_visible: false,
    };

    return createDetectedIssue({
      householdId,
      moduleKey: "portals",
      issueType: "continuity_gap",
      issueKey,
      assetId,
      recordId,
      title: `${assetLabel} is missing portal continuity`,
      summary:
        `${assetLabel} is being treated as a critical asset, but a linked access portal was not identified in the current continuity read.`,
      severity: "high",
      priority: "medium",
      sourceSystem: "portal_engine",
      evidence,
      metadata: {
        source_signal: "critical_assets_without_portals",
        route: "/portals",
      },
    });
  });
}

function buildRetirementDocumentationIssues(context) {
  if (
    !hasReviewFlag(context.intelligence, "missing_retirement_docs") &&
    !Array.isArray(context.bundle?.retirementAccounts)
  ) {
    return [];
  }

  const householdId = context.householdId;
  const retirementAccounts = Array.isArray(context.bundle?.retirementAccounts)
    ? context.bundle.retirementAccounts
    : [];
  const retirementDocumentsByAccountId =
    context.bundle?.retirementSummary?.retirementDocumentsByAccountId || {};

  return retirementAccounts
    .filter((account) => {
      const recordId = normalizeRecordId(account);
      const documents = Array.isArray(retirementDocumentsByAccountId?.[recordId])
        ? retirementDocumentsByAccountId[recordId]
        : [];
      return documents.length === 0;
    })
    .map((account) => {
      const assetId = normalizeAssetId(account) || normalizeRecordId(account);
      const recordId = normalizeRecordId(account);
      const accountLabel = getDisplayLabel(account, "Retirement account");
      const issueKey = buildIssueKey(
        "retirement_missing_documents",
        assetId || recordId || householdId,
        "retirement"
      );
      const evidence = {
        account_id: recordId,
        account_label: accountLabel,
        provider_name: cleanString(account?.provider_name) || cleanString(account?.institution_name),
        document_count: 0,
      };

      return createDetectedIssue({
        householdId,
        moduleKey: "retirement",
        issueType: "missing_documentation",
        issueKey,
        assetId,
        recordId,
        title: `${accountLabel} is missing statement support`,
        summary:
          `${accountLabel} is visible in the household file, but retirement statement support was not identified for this account.`,
        severity: "high",
        priority: "medium",
        sourceSystem: "retirement_engine",
        evidence,
        metadata: {
          source_signal: "missing_retirement_docs",
          route: recordId ? `/retirement/detail/${recordId}` : "/retirement",
        },
      });
    });
}

function buildEstateComponentIssues(context) {
  const householdId = context.householdId;
  const issues = [];

  if (hasReviewFlag(context.intelligence, "missing_estate_docs")) {
    issues.push(
      createDetectedIssue({
        householdId,
        moduleKey: "estate",
        issueType: "missing_component",
        issueKey: buildIssueKey("estate_missing_component", "core_records", "estate"),
        title: "Estate records are not visible",
        summary:
          "No wills, trusts, or estate records were identified in the current household file, so estate continuity remains incomplete.",
        severity: "high",
        priority: "medium",
        sourceSystem: "household_engine",
        evidence: {
          estate_present: false,
          estate_document_count: Number(context.bundle?.documentCountsByCategory?.estate || 0),
        },
        metadata: {
          source_signal: "missing_estate_docs",
          route: "/estate",
          component_key: "core_records",
        },
      })
    );
  } else if (hasReviewFlag(context.intelligence, "limited_estate_document_visibility")) {
    issues.push(
      createDetectedIssue({
        householdId,
        moduleKey: "estate",
        issueType: "missing_component",
        issueKey: buildIssueKey("estate_missing_component", "document_support", "estate"),
        title: "Estate document support is limited",
        summary:
          "Estate records are present, but the document layer still looks thin enough to weaken continuity review.",
        severity: "medium",
        priority: "low",
        sourceSystem: "household_engine",
        evidence: {
          estate_present: true,
          estate_document_count: Number(context.bundle?.documentCountsByCategory?.estate || 0),
        },
        metadata: {
          source_signal: "limited_estate_document_visibility",
          route: "/estate",
          component_key: "document_support",
        },
      })
    );
  }

  return issues;
}

function buildContactCoverageIssues(context) {
  if (!hasReviewFlag(context.intelligence, "household_contacts_sparse")) {
    return [];
  }

  const emergencyCount = Array.isArray(context.bundle?.emergencyContacts)
    ? context.bundle.emergencyContacts.length
    : 0;
  const professionalCount = Array.isArray(context.bundle?.keyProfessionalContacts)
    ? context.bundle.keyProfessionalContacts.length
    : 0;
  const missingScope =
    emergencyCount === 0 && professionalCount === 0
      ? "emergency_and_professional"
      : emergencyCount === 0
        ? "emergency"
        : "professional";

  return [
    createDetectedIssue({
      householdId: context.householdId,
      moduleKey: "contacts",
      issueType: "coverage_gap",
      issueKey: buildIssueKey("contacts_sparse_coverage", missingScope, "contacts"),
      title: "Household contact coverage is sparse",
      summary:
        "Emergency and professional contact coverage is still too thin for a stronger continuity handoff.",
      severity: "medium",
      priority: "medium",
      sourceSystem: "household_engine",
      evidence: {
        emergency_contact_count: emergencyCount,
        professional_contact_count: professionalCount,
      },
      metadata: {
        source_signal: "household_contacts_sparse",
        route: "/contacts",
        missing_scope: missingScope,
      },
    }),
  ];
}

function buildInsuranceDocumentIssues(context) {
  const policies = Array.isArray(context.savedPolicyRows) ? context.savedPolicyRows : [];

  return policies
    .filter((policy) => !cleanString(policy?.latest_statement_date))
    .map((policy) => {
      const recordId = cleanString(policy?.policy_id) || cleanString(policy?.id);
      const assetId = cleanString(policy?.asset_id) || null;
      const policyLabel = getDisplayLabel(policy, "Insurance policy");
      const issueKey = buildIssueKey(
        "insurance_missing_statement",
        recordId || assetId || context.householdId,
        "insurance"
      );
      const evidence = {
        policy_id: recordId,
        carrier: cleanString(policy?.carrier) || cleanString(policy?.carrier_name),
        product: cleanString(policy?.product) || cleanString(policy?.product_name),
        latest_statement_date: null,
        continuity_score: policy?.continuity_score ?? null,
      };

      return createDetectedIssue({
        householdId: context.householdId,
        moduleKey: "insurance",
        issueType: "missing_document",
        issueKey,
        assetId,
        recordId,
        title: `${policyLabel} is missing a current statement`,
        summary:
          `${policyLabel} is visible in the insurance file, but a current statement was not identified for continuity review.`,
        severity: "high",
        priority: "medium",
        sourceSystem: "insurance_engine",
        evidence,
        metadata: {
          source_signal: "weak_insurance_statement_support",
          route: recordId ? `/policy/${recordId}` : "/insurance",
        },
      });
    });
}

function buildWarrantyDocumentIssues(context) {
  if (
    !hasReviewFlag(context.intelligence, "warranties_missing_proof_of_purchase_prompt") &&
    !Array.isArray(context.bundle?.warranties)
  ) {
    return [];
  }

  const warranties = Array.isArray(context.bundle?.warranties) ? context.bundle.warranties : [];
  const warrantyDocumentsById = context.bundle?.warrantySummary?.warrantyDocumentsById || {};

  return warranties
    .filter((warranty) => {
      const recordId = normalizeRecordId(warranty);
      const documents = Array.isArray(warrantyDocumentsById?.[recordId])
        ? warrantyDocumentsById[recordId]
        : [];
      return documents.length === 0;
    })
    .map((warranty) => {
      const assetId = normalizeAssetId(warranty) || normalizeRecordId(warranty);
      const recordId = normalizeRecordId(warranty);
      const warrantyLabel = getDisplayLabel(warranty, "Warranty");
      const issueKey = buildIssueKey(
        "warranty_missing_proof_of_purchase",
        assetId || recordId || context.householdId,
        "warranty"
      );
      const evidence = {
        warranty_id: recordId,
        warranty_label: warrantyLabel,
        provider_name: cleanString(warranty?.provider_name),
        document_count: 0,
      };

      return createDetectedIssue({
        householdId: context.householdId,
        moduleKey: "warranties",
        issueType: "missing_document",
        issueKey,
        assetId,
        recordId,
        title: `${warrantyLabel} is missing proof of purchase`,
        summary:
          `${warrantyLabel} is visible in the household file, but proof-of-purchase or contract support was not identified.`,
        severity: "medium",
        priority: "low",
        sourceSystem: "household_engine",
        evidence,
        metadata: {
          source_signal: "warranties_missing_proof_of_purchase_prompt",
          route: recordId ? `/warranties/${recordId}` : "/warranties",
        },
      });
    });
}

const DETECTOR_BUILDERS = [
  buildPropertyCoverageGapIssues,
  buildPortalContinuityIssues,
  buildRetirementDocumentationIssues,
  buildEstateComponentIssues,
  buildContactCoverageIssues,
  buildInsuranceDocumentIssues,
  buildWarrantyDocumentIssues,
];

export function buildDetectedIssues(context = {}) {
  const householdId = normalizeHouseholdId(context);
  if (!householdId) {
    throw new Error("householdId is required to build detected household issues.");
  }

  const normalizedContext = {
    householdId,
    bundle: context.bundle || {},
    intelligence: context.intelligence || {},
    savedPolicyRows: Array.isArray(context.savedPolicyRows) ? context.savedPolicyRows : [],
  };
  const issuesByIdentity = new Map();

  for (const builder of DETECTOR_BUILDERS) {
    const nextIssues = builder(normalizedContext);
    for (const issue of nextIssues) {
      addDetectedIssue(issuesByIdentity, issue);
    }
  }

  return [...issuesByIdentity.values()];
}

export function buildDetectedIssuesFingerprint(issues = []) {
  return stableSerialize(
    [...issues]
      .map((issue) => ({
        issue_key: issue.issue_key,
        detection_hash: issue.detection_hash,
        asset_id: issue.asset_id,
        record_id: issue.record_id,
      }))
      .sort((left, right) => {
        const leftKey = `${left.issue_key}:${left.asset_id || ""}:${left.record_id || ""}`;
        const rightKey = `${right.issue_key}:${right.asset_id || ""}:${right.record_id || ""}`;
        return leftKey.localeCompare(rightKey);
      })
  );
}
