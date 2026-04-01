function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function includesAny(value, patterns = []) {
  const text = normalizeText(value).toLowerCase();
  return patterns.some((pattern) => text.includes(pattern));
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const diff = parsed.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function classifyStatus(goodThresholdMet, warningThresholdMet) {
  if (goodThresholdMet) return "Ready";
  if (warningThresholdMet) return "Building";
  return "Needs Review";
}

function buildWatchpoint(summary) {
  const notes = normalizeArray(summary?.notes).filter(Boolean);
  if (notes.length > 0) return notes[0];
  const status = summary?.status || "Needs Review";
  if (status === "Ready") return "Ready for household review.";
  if (status === "Building") return "Usable, but still building toward fuller household support.";
  return "More records are needed before this module can support a strong household read.";
}

export function buildModuleReadinessOverview(module, summary = {}) {
  return {
    module,
    status: summary?.status || "Needs Review",
    insight: summary?.headline || "Readiness details are still being built.",
    watchpoint: buildWatchpoint(summary),
    summary,
  };
}

export function summarizeBankingModule({ assets = [], portals = [], contacts = [] } = {}) {
  const safeAssets = normalizeArray(assets);
  const safePortals = normalizeArray(portals);
  const safeContacts = normalizeArray(contacts);
  const bankingAssets = safeAssets.filter((asset) =>
    includesAny(`${asset.asset_category} ${asset.asset_subcategory} ${asset.asset_name}`, [
      "bank",
      "cash",
      "checking",
      "savings",
      "treasury",
      "brokerage",
      "liquidity",
      "money market",
    ])
  );
  const emergencyPortals = safePortals.filter((portal) => portal.emergency_relevance);
  const institutionContacts = safeContacts.filter((contact) =>
    includesAny(`${contact.contact_type} ${contact.organization_name}`, ["institution", "bank", "advisor", "cpa"])
  );
  const missingRecovery = emergencyPortals.filter((portal) => !portal.recovery_contact_hint);

  const status = classifyStatus(
    bankingAssets.length > 0 && emergencyPortals.length > 0,
    bankingAssets.length > 0 || emergencyPortals.length > 0
  );

  const notes = [];
  if (bankingAssets.length === 0) {
    notes.push("No dedicated cash or banking assets are visible yet.");
  } else {
    notes.push(`${pluralize(bankingAssets.length, "banking asset")} are visible in the current household record.`);
  }
  if (emergencyPortals.length === 0) {
    notes.push("No emergency-relevant portal profiles are linked for liquidity access yet.");
  } else if (missingRecovery.length > 0) {
    notes.push(`${pluralize(missingRecovery.length, "emergency-relevant portal")} still need recovery contact hints.`);
  } else {
    notes.push("Emergency-relevant portal recovery visibility looks reasonably supported.");
  }
  if (institutionContacts.length > 0) {
    notes.push(`${pluralize(institutionContacts.length, "institution or advisor contact")} support the current banking continuity picture.`);
  }

  return {
    status,
    headline:
      status === "Ready"
        ? "Banking continuity has enough household evidence to act as a usable liquidity and access register."
        : status === "Building"
          ? "Banking continuity is taking shape, but recovery and institution visibility are still uneven."
          : "Banking continuity is still thin, so liquidity access and emergency recovery should be documented further.",
    notes: notes.slice(0, 4),
    metrics: {
      bankingAssets: bankingAssets.length,
      emergencyPortals: emergencyPortals.length,
      missingRecovery: missingRecovery.length,
      institutionContacts: institutionContacts.length,
    },
  };
}

export function summarizeEstateModule({ contacts = [], assets = [] } = {}) {
  const safeContacts = normalizeArray(contacts);
  const safeAssets = normalizeArray(assets);
  const successorContacts = safeContacts.filter((contact) =>
    includesAny(contact.contact_type, ["executor", "trustee", "attorney"])
  );
  const familyContacts = safeContacts.filter((contact) => includesAny(contact.contact_type, ["family"]));
  const legalAssets = safeAssets.filter((asset) =>
    includesAny(`${asset.asset_category} ${asset.asset_subcategory} ${asset.asset_name}`, [
      "estate",
      "trust",
      "legal",
      "will",
      "directive",
    ])
  );

  const status = classifyStatus(
    successorContacts.length >= 2,
    successorContacts.length >= 1 || familyContacts.length >= 2 || legalAssets.length > 0
  );

  const notes = [];
  if (successorContacts.length === 0) {
    notes.push("No trustee, executor, or attorney contacts are clearly visible yet.");
  } else {
    notes.push(`${pluralize(successorContacts.length, "successor or legal contact")} are visible for estate handoff.`);
  }
  if (familyContacts.length === 0) {
    notes.push("Family contact coverage is still limited for emergency handoff context.");
  }
  if (legalAssets.length > 0) {
    notes.push(`${pluralize(legalAssets.length, "estate or legal asset shell")} already exists in the household record.`);
  } else {
    notes.push("No estate-specific document or asset shell is visible yet.");
  }

  return {
    status,
    headline:
      status === "Ready"
        ? "Estate continuity has a visible successor layer and can support a stronger handoff conversation."
        : status === "Building"
          ? "Estate continuity is forming, but successor roles or legal-document coverage still look incomplete."
          : "Estate continuity is still light, so successor roles and legal-document visibility should be strengthened.",
    notes: notes.slice(0, 4),
    metrics: {
      successorContacts: successorContacts.length,
      familyContacts: familyContacts.length,
      legalAssets: legalAssets.length,
    },
  };
}

export function summarizeContactsModule(contacts = []) {
  const safeContacts = normalizeArray(contacts);
  const successorContacts = safeContacts.filter((contact) =>
    includesAny(contact.contact_type, ["executor", "trustee", "attorney"])
  );
  const advisorContacts = safeContacts.filter((contact) =>
    includesAny(contact.contact_type, ["advisor", "cpa", "insurance_agent"])
  );
  const institutionContacts = safeContacts.filter((contact) =>
    includesAny(contact.contact_type, ["institution"])
  );
  const missingDirectReach = safeContacts.filter((contact) => !normalizeText(contact.email) && !normalizeText(contact.phone));

  const status = classifyStatus(
    safeContacts.length >= 6 && missingDirectReach.length === 0,
    safeContacts.length >= 3
  );

  return {
    status,
    headline:
      status === "Ready"
        ? "The household contact directory is broad enough to support continuity, advisor coordination, and emergency outreach."
        : status === "Building"
          ? "The household contact directory is useful, but some role coverage or direct contact methods are still thin."
          : "The household contact directory needs more depth before it can support strong continuity and handoff workflows.",
    notes: [
      `${pluralize(successorContacts.length, "successor contact")} visible.`,
      `${pluralize(advisorContacts.length, "advisor contact")} visible.`,
      `${pluralize(institutionContacts.length, "institution contact")} visible.`,
      missingDirectReach.length > 0
        ? `${pluralize(missingDirectReach.length, "contact")} still lack both phone and email.`
        : "Direct reachability looks stronger across the visible contacts.",
    ],
    metrics: {
      totalContacts: safeContacts.length,
      successorContacts: successorContacts.length,
      advisorContacts: advisorContacts.length,
      institutionContacts: institutionContacts.length,
      missingDirectReach: missingDirectReach.length,
    },
  };
}

export function summarizePortalModule(bundle = {}) {
  const readiness = bundle?.readiness || {};
  const portals = normalizeArray(bundle?.portals);
  const lockedOrLimited = portals.filter((portal) => ["locked", "limited"].includes(portal.access_status));
  const unverified = portals.filter((portal) => !portal.last_verified_at);
  const status = classifyStatus(
    Number(readiness.missingRecoveryCount || 0) === 0 && lockedOrLimited.length === 0 && portals.length > 0,
    portals.length > 0
  );

  const notes = [];
  if ((readiness.criticalAssetsWithoutLinkedPortals || []).length > 0) {
    notes.push(`${pluralize(readiness.criticalAssetsWithoutLinkedPortals.length, "critical asset")} still lack a linked portal.`);
  }
  if (lockedOrLimited.length > 0) {
    notes.push(`${pluralize(lockedOrLimited.length, "portal")} are still limited or locked.`);
  }
  if (unverified.length > 0) {
    notes.push(`${pluralize(unverified.length, "portal")} still need verification timestamps.`);
  }
  if (Number(readiness.missingRecoveryCount || 0) === 0 && portals.length > 0) {
    notes.push("Recovery visibility looks stronger across the current portal set.");
  }

  return {
    status,
    headline:
      status === "Ready"
        ? "Portal continuity looks relatively strong for the currently tracked household assets."
        : status === "Building"
          ? "Portal continuity is usable, but linked coverage or recovery detail is still uneven."
          : "Portal continuity still needs work before it can be treated as dependable for emergency access.",
    notes: notes.slice(0, 4),
    metrics: {
      portals: portals.length,
      limitedPortals: lockedOrLimited.length,
      unverifiedPortals: unverified.length,
      missingRecovery: Number(readiness.missingRecoveryCount || 0),
    },
  };
}

export function summarizeWarrantyModule(warranties = []) {
  const safeWarranties = normalizeArray(warranties);
  const active = safeWarranties.filter((item) => item.contract_status === "active");
  const expiringSoon = safeWarranties.filter((item) => {
    const remaining = daysUntil(item.expiration_date);
    return remaining !== null && remaining >= 0 && remaining <= 90;
  });
  const missingExpiration = safeWarranties.filter((item) => !item.expiration_date);
  const status = classifyStatus(
    safeWarranties.length > 0 && expiringSoon.length === 0,
    safeWarranties.length > 0
  );

  return {
    status,
    headline:
      status === "Ready"
        ? "Warranty tracking is active and the current contract set does not show immediate expiration pressure."
        : status === "Building"
          ? "Warranty tracking is usable, but expiration visibility and contract coverage still need cleanup."
          : "Warranty tracking is still thin, so coverage and expiration visibility should be expanded.",
    notes: [
      `${pluralize(active.length, "active warranty")} visible.`,
      expiringSoon.length > 0
        ? `${pluralize(expiringSoon.length, "warranty")} expire within about 90 days.`
        : "No near-term expiration pressure is visible.",
      missingExpiration.length > 0
        ? `${pluralize(missingExpiration.length, "warranty")} still lack expiration visibility.`
        : "Expiration dates are visible across the current warranty set.",
    ],
    metrics: {
      warranties: safeWarranties.length,
      active: active.length,
      expiringSoon: expiringSoon.length,
      missingExpiration: missingExpiration.length,
    },
  };
}

export function summarizeAutoInsuranceModule(policies = []) {
  const safePolicies = normalizeArray(policies);
  const active = safePolicies.filter((item) => item.policy_status === "active");
  const renewalPending = safePolicies.filter((item) => item.policy_status === "renewal_pending");
  const expiringSoon = safePolicies.filter((item) => {
    const remaining = daysUntil(item.expiration_date);
    return remaining !== null && remaining >= 0 && remaining <= 60;
  });
  const missingNamedInsured = safePolicies.filter((item) => !normalizeText(item.named_insured));

  const status = classifyStatus(
    safePolicies.length > 0 && expiringSoon.length === 0 && missingNamedInsured.length === 0,
    safePolicies.length > 0
  );

  return {
    status,
    headline:
      status === "Ready"
        ? "Auto coverage visibility is in decent shape for a household continuity and renewal review."
        : status === "Building"
          ? "Auto coverage visibility is usable, but renewal timing or named-insured detail still needs cleanup."
          : "Auto coverage visibility is still thin, so policy timing and household-driver context should be reviewed.",
    notes: [
      `${pluralize(active.length, "active auto policy")} visible.`,
      renewalPending.length > 0
        ? `${pluralize(renewalPending.length, "policy")} are already marked renewal pending.`
        : "No policies are currently marked renewal pending.",
      expiringSoon.length > 0
        ? `${pluralize(expiringSoon.length, "policy")} expire within about 60 days.`
        : "No near-term expiration pressure is visible.",
      missingNamedInsured.length > 0
        ? `${pluralize(missingNamedInsured.length, "policy")} still lack named-insured visibility.`
        : "Named-insured visibility looks stronger across the current auto set.",
    ],
    metrics: {
      policies: safePolicies.length,
      active: active.length,
      renewalPending: renewalPending.length,
      expiringSoon: expiringSoon.length,
      missingNamedInsured: missingNamedInsured.length,
    },
  };
}

export function summarizeHomeownersModule(policies = []) {
  const safePolicies = normalizeArray(policies);
  const active = safePolicies.filter((item) => item.policy_status === "active");
  const expiringSoon = safePolicies.filter((item) => {
    const remaining = daysUntil(item.expiration_date);
    return remaining !== null && remaining >= 0 && remaining <= 60;
  });
  const missingProperty = safePolicies.filter((item) => !normalizeText(item.property_address));
  const missingNamedInsured = safePolicies.filter((item) => !normalizeText(item.named_insured));

  const status = classifyStatus(
    safePolicies.length > 0 && expiringSoon.length === 0 && missingProperty.length === 0,
    safePolicies.length > 0
  );

  return {
    status,
    headline:
      status === "Ready"
        ? "Homeowners coverage visibility is strong enough for a usable household property-protection review."
        : status === "Building"
          ? "Homeowners coverage is visible, but property linkage or renewal timing still needs attention."
          : "Homeowners coverage is still too thin to support a confident household property-protection read.",
    notes: [
      `${pluralize(active.length, "active homeowners policy")} visible.`,
      expiringSoon.length > 0
        ? `${pluralize(expiringSoon.length, "policy")} expire within about 60 days.`
        : "No near-term expiration pressure is visible.",
      missingProperty.length > 0
        ? `${pluralize(missingProperty.length, "policy")} still lack property-address visibility.`
        : "Property-address visibility looks stronger across the current homeowners set.",
      missingNamedInsured.length > 0
        ? `${pluralize(missingNamedInsured.length, "policy")} still lack named-insured visibility.`
        : "Named-insured visibility looks stronger across the current homeowners set.",
    ],
    metrics: {
      policies: safePolicies.length,
      active: active.length,
      expiringSoon: expiringSoon.length,
      missingProperty: missingProperty.length,
      missingNamedInsured: missingNamedInsured.length,
    },
  };
}

export function summarizeHealthModule(plans = []) {
  const safePlans = normalizeArray(plans);
  const active = safePlans.filter((item) => item.plan_status === "active");
  const renewalPending = safePlans.filter((item) => item.plan_status === "renewal_pending");
  const renewalSoon = safePlans.filter((item) => {
    const remaining = daysUntil(item.renewal_date);
    return remaining !== null && remaining >= 0 && remaining <= 90;
  });
  const missingSubscriber = safePlans.filter((item) => !normalizeText(item.subscriber_name));

  const status = classifyStatus(
    safePlans.length > 0 && renewalSoon.length === 0 && missingSubscriber.length === 0,
    safePlans.length > 0
  );

  return {
    status,
    headline:
      status === "Ready"
        ? "Health-plan visibility is good enough for a basic household benefits and renewal review."
        : status === "Building"
          ? "Health-plan visibility is usable, but subscriber or renewal detail still needs work."
          : "Health-plan visibility is still light, so benefits continuity and subscriber coverage should be documented further.",
    notes: [
      `${pluralize(active.length, "active health plan")} visible.`,
      renewalPending.length > 0
        ? `${pluralize(renewalPending.length, "plan")} are already marked renewal pending.`
        : "No plans are currently marked renewal pending.",
      renewalSoon.length > 0
        ? `${pluralize(renewalSoon.length, "plan")} renew within about 90 days.`
        : "No near-term renewal pressure is visible.",
      missingSubscriber.length > 0
        ? `${pluralize(missingSubscriber.length, "plan")} still lack subscriber visibility.`
        : "Subscriber visibility looks stronger across the current health-plan set.",
    ],
    metrics: {
      plans: safePlans.length,
      active: active.length,
      renewalPending: renewalPending.length,
      renewalSoon: renewalSoon.length,
      missingSubscriber: missingSubscriber.length,
    },
  };
}

export function summarizeAssetsModule(assets = []) {
  const safeAssets = normalizeArray(assets);
  const active = safeAssets.filter((item) => item.status === "active");
  const missingInstitution = safeAssets.filter((item) => !normalizeText(item.institution_name));
  const categories = new Set(
    safeAssets.map((item) => normalizeText(item.asset_category)).filter(Boolean)
  );

  const status = classifyStatus(
    safeAssets.length >= 8 && missingInstitution.length <= Math.floor(safeAssets.length / 3),
    safeAssets.length >= 3
  );

  return {
    status,
    headline:
      status === "Ready"
        ? "The household asset map is broad enough to support a useful cross-module planning view."
        : status === "Building"
          ? "The household asset map is forming, but category coverage and institution detail still need work."
          : "The household asset map is still thin, so several modules may remain under-contextualized.",
    notes: [
      `${pluralize(active.length, "active asset")} visible.`,
      `${categories.size} asset ${categories.size === 1 ? "category is" : "categories are"} represented.`,
      missingInstitution.length > 0
        ? `${pluralize(missingInstitution.length, "asset")} still lack institution visibility.`
        : "Institution visibility looks stronger across the current asset map.",
    ],
    metrics: {
      assets: safeAssets.length,
      active: active.length,
      categories: categories.size,
      missingInstitution: missingInstitution.length,
    },
  };
}

export function summarizeVaultModule(documents = []) {
  const safeDocuments = normalizeArray(documents);
  const stored = safeDocuments.filter((item) => item.storage_path);
  const review = safeDocuments.filter((item) => item.processing_status === "needs_review");
  const householdLevel = safeDocuments.filter(
    (item) => item.metadata?.document_scope === "household" || !item.asset_id
  );
  const assetLinked = safeDocuments.filter((item) => item.asset_id);

  const status = classifyStatus(
    safeDocuments.length >= 6 && review.length === 0,
    safeDocuments.length >= 2
  );

  return {
    status,
    headline:
      status === "Ready"
        ? "The household vault is broad enough to act as a usable document register across the platform."
        : status === "Building"
          ? "The vault is becoming useful, but document coverage or review-state cleanup is still needed."
          : "The vault is still light, so household document continuity remains limited.",
    notes: [
      `${pluralize(stored.length, "stored document")} visible.`,
      `${pluralize(assetLinked.length, "asset-linked document")} currently anchor the vault to real records.`,
      review.length > 0
        ? `${pluralize(review.length, "document")} still need review.`
        : "No generic vault documents are currently flagged for review.",
      `${pluralize(householdLevel.length, "household-level document")} currently sit outside a specific asset link.`,
    ],
    metrics: {
      documents: safeDocuments.length,
      stored: stored.length,
      review: review.length,
      householdLevel: householdLevel.length,
      assetLinked: assetLinked.length,
    },
  };
}

export function summarizeUploadCenterModule({ assets = [], documents = [], queue = [] } = {}) {
  const safeAssets = normalizeArray(assets);
  const safeDocuments = normalizeArray(documents);
  const safeQueue = normalizeArray(queue);
  const failedQueue = safeQueue.filter((item) => item.status === "failed");
  const savedQueue = safeQueue.filter((item) => item.status === "saved");
  const assetLinkedDocuments = safeDocuments.filter((item) => item.asset_id);

  const status = classifyStatus(
    safeAssets.length > 0 && safeDocuments.length > 0 && failedQueue.length === 0,
    safeAssets.length > 0 || safeDocuments.length > 0 || safeQueue.length > 0
  );

  return {
    status,
    headline:
      status === "Ready"
        ? "Generic intake is working as a usable household document pipeline."
        : status === "Building"
          ? "Generic intake is usable, but attachment depth or queue cleanup still needs attention."
          : "Generic intake is still light, so household document capture is not yet well established.",
    notes: [
      `${pluralize(safeAssets.length, "asset")} are available as upload targets.`,
      `${pluralize(assetLinkedDocuments.length, "saved document")} are already linked to specific assets.`,
      failedQueue.length > 0
        ? `${pluralize(failedQueue.length, "queued file")} still need upload retry.`
        : "No queued upload failures are currently visible.",
      savedQueue.length > 0
        ? `${pluralize(savedQueue.length, "queued file")} have already saved in the current session.`
        : "No queued files have been saved in the current session yet.",
    ],
    metrics: {
      assets: safeAssets.length,
      documents: safeDocuments.length,
      assetLinkedDocuments: assetLinkedDocuments.length,
      queued: safeQueue.length,
      failedQueue: failedQueue.length,
      savedQueue: savedQueue.length,
    },
  };
}
