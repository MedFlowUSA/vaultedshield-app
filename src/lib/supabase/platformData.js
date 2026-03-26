import { getSupabaseClient, getSupabaseConfigurationMessage } from "./client.js";
import {
  buildDocumentSourceHash,
  uploadPlatformDocumentFile,
} from "./documentStorage.js";
import {
  appendHouseholdScope,
  buildScopedAccessError,
  normalizePlatformScope,
} from "./platformScope.js";

// Broad platform tables support the modular shell:
// - households, members, contacts, generic assets, documents, alerts, tasks, reports
// - shell modules like vault, contacts, banking, retirement, estate, emergency
//
// Specialized IUL intelligence stays in the dedicated vaulted_* policy tables.
// Recommended coexistence pattern:
// - assets can hold a broad life-insurance asset shell record
// - retirement accounts can link one-to-one to assets while keeping deep data in retirement_* tables
// - vaulted_policies and related specialized tables continue to hold deep policy intelligence
// - later passes can add explicit cross-module linking keys where operationally necessary

const FOUNDATIONAL_PLATFORM_TABLES = new Set([
  "households",
  "household_members",
  "contacts",
  "assets",
  "asset_documents",
  "asset_snapshots",
  "asset_alerts",
  "asset_tasks",
  "reports",
  "institution_profiles",
  "roles_permissions",
]);

const FOUNDATIONAL_PLATFORM_MIGRATION =
  "supabase/migrations/20260316_create_platform_shell_schema.sql";

function isMissingSchemaCacheTableError(error, table) {
  const message = String(error?.message || "");
  return (
    Boolean(table) &&
    (error?.code === "PGRST205" ||
      message.includes(`Could not find the table 'public.${table}' in the schema cache`) ||
      message.includes(`relation "public.${table}" does not exist`) ||
      message.includes(`relation "${table}" does not exist`))
  );
}

function normalizePlatformQueryError(table, error) {
  if (!error) return null;
  if (!FOUNDATIONAL_PLATFORM_TABLES.has(table) || !isMissingSchemaCacheTableError(error, table)) {
    return error;
  }

  if (!import.meta.env.DEV) {
    return new Error("Required VaultedShield platform tables are missing in Supabase.");
  }

  return new Error(
    [
      `Missing base table: ${table}.`,
      "The connected Supabase project is missing the foundational VaultedShield platform schema.",
      `Run ${FOUNDATIONAL_PLATFORM_MIGRATION} against the connected project, then restart the app.`,
      `Original Supabase error: ${error.message}`,
    ].join(" ")
  );
}

function getClientOrError() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      supabase: null,
      error: new Error(getSupabaseConfigurationMessage() || "Supabase not configured"),
    };
  }
  return { supabase, error: null };
}

const HOUSEHOLD_CONTEXT_KEY = "vaultedshield-current-household-id";

function readStoredHouseholdId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(HOUSEHOLD_CONTEXT_KEY);
}

function writeStoredHouseholdId(householdId) {
  if (typeof window === "undefined") return;
  if (!householdId) {
    window.localStorage.removeItem(HOUSEHOLD_CONTEXT_KEY);
    return;
  }
  window.localStorage.setItem(HOUSEHOLD_CONTEXT_KEY, householdId);
}

async function insertRecord(table, payload) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };

  const { data, error: insertError } = await supabase
    .from(table)
    .insert(payload)
    .select()
    .single();

  return { data, error: normalizePlatformQueryError(table, insertError) };
}

async function updateRecord(table, id, payload) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };

  const { data, error: updateError } = await supabase
    .from(table)
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  return { data, error: normalizePlatformQueryError(table, updateError) };
}

async function findExistingGenericDocument({ householdId, sourceHash }) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  if (!householdId || !sourceHash) return { data: null, error: null };

  const { data, error: findError } = await supabase
    .from("asset_documents")
    .select("*")
    .eq("household_id", householdId)
    .eq("source_hash", sourceHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error: findError };
}

function mapGenericUploadError(error, { assetId = null } = {}) {
  const message = String(error?.message || error?.details || "").toLowerCase();

  if (!message) {
    return "We couldn't save this upload right now.";
  }

  if (message.includes("asset_id") && message.includes("null value")) {
    return assetId
      ? "We couldn't attach this document to the selected asset. Please try again."
      : "We couldn't attach this document correctly. Please try again or choose an asset.";
  }

  if (message.includes("violates row-level security") || message.includes("row-level security")) {
    return "This upload could not be saved for the current household context.";
  }

  return "We couldn't save this upload right now.";
}

async function listRecords(table, filters = [], options = {}) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };

  let query = supabase.from(table).select(options.select || "*");

  filters.forEach((filter) => {
    if (filter.operator === "is") {
      query = query.is(filter.column, filter.value);
      return;
    }
    query = query[filter.operator || "eq"](filter.column, filter.value);
  });

  if (options.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending ?? false });
  }

  const { data, error: listError } = await query;
  return { data: data || [], error: normalizePlatformQueryError(table, listError) };
}

async function listRowsByIds(table, column, ids, select = "*") {
  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };
  if (!ids?.length) return { data: [], error: null };

  const { data, error: queryError } = await supabase
    .from(table)
    .select(select)
    .in(column, ids);

  return { data: data || [], error: normalizePlatformQueryError(table, queryError) };
}

export function getCurrentHouseholdContext() {
  return {
    householdId: readStoredHouseholdId(),
  };
}

export function setCurrentHouseholdContext(householdId) {
  writeStoredHouseholdId(householdId);
  return { householdId };
}

export function isHouseholdOwnedByUser(household, ownerUserId) {
  if (!household || !ownerUserId) return false;
  return household.owner_user_id === ownerUserId || household.metadata?.auth_user_id === ownerUserId;
}

export async function listHouseholds(ownerUserId = null) {
  const filters = ownerUserId ? [{ column: "owner_user_id", value: ownerUserId }] : [];
  return listRecords("households", filters, { orderBy: "updated_at" });
}

async function listSharedHouseholds() {
  return listRecords("households", [{ column: "owner_user_id", operator: "is", value: null }], {
    orderBy: "updated_at",
  });
}

export async function createHousehold(payload) {
  return insertRecord("households", {
    household_name: payload.household_name,
    household_status: payload.household_status || "active",
    owner_user_id: payload.owner_user_id || null,
    notes: payload.notes || null,
    metadata: payload.metadata || {},
  });
}

export async function updateHousehold(householdId, payload) {
  return updateRecord("households", householdId, {
    household_name: payload.household_name,
    household_status: payload.household_status,
    notes: payload.notes,
    metadata: payload.metadata,
    ...(Object.prototype.hasOwnProperty.call(payload || {}, "owner_user_id")
      ? { owner_user_id: payload.owner_user_id }
      : {}),
  });
}

async function findHouseholdForAuthUser(authUser) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error };
  if (!authUser?.id) return { data: null, error: null };

  const { data: directData, error: directError } = await supabase
    .from("households")
    .select("*")
    .eq("owner_user_id", authUser.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (directData || directError) {
    return {
      data: directData || null,
      error: normalizePlatformQueryError("households", directError),
    };
  }

  const { data, error: queryError } = await supabase
    .from("households")
    .select("*")
    .contains("metadata", { auth_user_id: authUser.id })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: data || null,
    error: normalizePlatformQueryError("households", queryError),
  };
}

export async function getOrCreateDefaultHousehold(authUser = null) {
  const storedHouseholdId = readStoredHouseholdId();

  if (authUser?.id) {
    const authHouseholdResult = await findHouseholdForAuthUser(authUser);
    if (authHouseholdResult.error) {
      return {
        data: null,
        error: authHouseholdResult.error,
        context: {
          householdId: null,
          source: "auth_lookup_failed",
          bootstrapped: false,
          ownerUserId: authUser.id,
          ownershipMode: "authenticated_owned",
          guestFallbackActive: false,
        },
      };
    }

    if (authHouseholdResult.data?.id) {
      if (!authHouseholdResult.data.owner_user_id) {
        await updateHousehold(authHouseholdResult.data.id, {
          household_name: authHouseholdResult.data.household_name,
          household_status: authHouseholdResult.data.household_status,
          owner_user_id: authUser.id,
          notes: authHouseholdResult.data.notes,
          metadata: {
            ...(authHouseholdResult.data.metadata || {}),
            auth_user_id: authUser.id,
            auth_email: authUser.email || null,
          },
        });
      }
      writeStoredHouseholdId(authHouseholdResult.data.id);
      return {
        data: {
          ...authHouseholdResult.data,
          owner_user_id: authHouseholdResult.data.owner_user_id || authUser.id,
        },
        error: null,
        context: {
          householdId: authHouseholdResult.data.id,
          source: "loaded_auth_household",
          bootstrapped: false,
          ownerUserId: authUser.id,
          ownershipMode: "authenticated_owned",
          guestFallbackActive: false,
        },
      };
    }

    const createResult = await createHousehold({
      household_name: authUser?.user_metadata?.household_name || "VaultedShield Household",
      household_status: "active",
      owner_user_id: authUser.id,
      notes: "Authenticated household workspace for the current VaultedShield user.",
      metadata: {
        bootstrap: true,
        auth_user_id: authUser.id,
        auth_email: authUser.email || null,
      },
    });

    if (createResult.error || !createResult.data?.id) {
      return {
        data: null,
        error: createResult.error || new Error("Authenticated household bootstrap failed"),
        context: {
          householdId: null,
          source: "bootstrap_failed",
          bootstrapped: false,
          ownerUserId: authUser.id,
          ownershipMode: "authenticated_owned",
          guestFallbackActive: false,
        },
      };
    }

    await createHouseholdMember({
      household_id: createResult.data.id,
      full_name: authUser?.user_metadata?.full_name || authUser?.email || "Primary Household Member",
      role_type: "self",
      relationship_label: "Primary",
      email: authUser?.email || null,
      is_primary: true,
      is_emergency_contact: true,
      metadata: { bootstrap: true, auth_user_id: authUser.id },
    });

    writeStoredHouseholdId(createResult.data.id);

    return {
      data: createResult.data,
      error: null,
      context: {
        householdId: createResult.data.id,
        source: "bootstrapped_auth_household",
        bootstrapped: true,
        ownerUserId: authUser.id,
        ownershipMode: "authenticated_owned",
        guestFallbackActive: false,
      },
    };
  }

  if (storedHouseholdId) {
    const households = await listSharedHouseholds();
    const matchingHousehold = households.data.find((row) => row.id === storedHouseholdId);
    if (matchingHousehold) {
      return {
        data: matchingHousehold,
        error: null,
        context: {
          householdId: matchingHousehold.id,
          source: "loaded_existing",
          bootstrapped: false,
          ownerUserId: null,
          ownershipMode: "guest_shared",
          guestFallbackActive: true,
        },
      };
    }
  }

  const householdsResult = await listSharedHouseholds();
  if (householdsResult.error) {
    return {
      data: null,
      error: householdsResult.error,
      context: {
        householdId: null,
        source: isMissingSchemaCacheTableError(householdsResult.error, "households")
          ? "missing_foundation_schema"
          : "supabase_unavailable",
        bootstrapped: false,
        ownerUserId: null,
        ownershipMode: "guest_shared",
        guestFallbackActive: true,
      },
    };
  }

  if (householdsResult.data.length > 0) {
    const household = householdsResult.data[0];
    writeStoredHouseholdId(household.id);
    return {
      data: household,
      error: null,
      context: {
        householdId: household.id,
        source: "loaded_existing",
        bootstrapped: false,
        ownerUserId: null,
        ownershipMode: "guest_shared",
        guestFallbackActive: true,
      },
    };
  }

  const createResult = await createHousehold({
    household_name: authUser?.user_metadata?.household_name || "VaultedShield Household",
    household_status: "active",
    owner_user_id: null,
    notes: "Default bootstrap household for the platform shell.",
    metadata: {
      bootstrap: true,
      auth_user_id: authUser?.id || null,
      auth_email: authUser?.email || null,
    },
  });

  if (createResult.error || !createResult.data?.id) {
    return {
      data: null,
      error: createResult.error || new Error("Default household bootstrap failed"),
      context: {
        householdId: null,
        source: "bootstrap_failed",
        bootstrapped: false,
        ownerUserId: null,
        ownershipMode: "guest_shared",
        guestFallbackActive: true,
      },
    };
  }

  await createHouseholdMember({
    household_id: createResult.data.id,
    full_name: "Primary Household Member",
    role_type: "self",
    relationship_label: "Primary",
    is_primary: true,
    is_emergency_contact: true,
    metadata: { bootstrap: true },
  });

  writeStoredHouseholdId(createResult.data.id);

  return {
    data: createResult.data,
    error: null,
    context: {
      householdId: createResult.data.id,
      source: "bootstrapped_default",
      bootstrapped: true,
      ownerUserId: null,
      ownershipMode: "guest_shared",
      guestFallbackActive: true,
    },
  };
}

export async function listHouseholdMembers(householdId) {
  return listRecords(
    "household_members",
    [{ column: "household_id", value: householdId }],
    { orderBy: "updated_at" }
  );
}

export async function createHouseholdMember(payload) {
  return insertRecord("household_members", {
    household_id: payload.household_id,
    full_name: payload.full_name,
    role_type: payload.role_type || null,
    relationship_label: payload.relationship_label || null,
    email: payload.email || null,
    phone: payload.phone || null,
    date_of_birth: payload.date_of_birth || null,
    is_primary: Boolean(payload.is_primary),
    is_emergency_contact: Boolean(payload.is_emergency_contact),
    metadata: payload.metadata || {},
  });
}

export async function listContacts(householdId) {
  return listRecords(
    "contacts",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    { orderBy: "updated_at" }
  );
}

export async function createContact(payload) {
  return insertRecord("contacts", {
    household_id: payload.household_id || null,
    full_name: payload.full_name,
    contact_type: payload.contact_type || null,
    organization_name: payload.organization_name || null,
    email: payload.email || null,
    phone: payload.phone || null,
    address: payload.address || null,
    notes: payload.notes || null,
    metadata: payload.metadata || {},
  });
}

export async function listAssets(householdId) {
  return listRecords(
    "assets",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    { orderBy: "updated_at" }
  );
}

export async function listHouseholdAssetsForSelection(householdId) {
  return listAssets(householdId);
}

export async function createAsset(payload) {
  return insertRecord("assets", {
    household_id: payload.household_id,
    asset_category: payload.asset_category,
    asset_subcategory: payload.asset_subcategory || null,
    asset_name: payload.asset_name,
    institution_name: payload.institution_name || null,
    institution_key: payload.institution_key || null,
    owner_member_id: payload.owner_member_id || null,
    status: payload.status || "active",
    summary: payload.summary || {},
    metadata: payload.metadata || {},
  });
}

export async function getAssetById(assetId, scopeOverride = null) {
  const result = await listRecords(
    "assets",
    appendHouseholdScope([{ column: "id", value: assetId }], scopeOverride),
    { select: "*, household_members(full_name)" }
  );

  return {
    data: result.data?.[0] || null,
    error: result.error,
  };
}

export async function listAssetDocuments(assetId) {
  return listRecords(
    "asset_documents",
    [{ column: "asset_id", value: assetId }],
    { orderBy: "updated_at" }
  );
}

export async function getAssetDocuments(assetId) {
  return listRecords(
    "asset_documents",
    [{ column: "asset_id", value: assetId }],
    { orderBy: "updated_at" }
  );
}

export async function listHouseholdDocuments(householdId) {
  return listRecords(
    "asset_documents",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    {
      select: "*, assets(asset_name, asset_category, asset_subcategory)",
      orderBy: "updated_at",
    }
  );
}

export async function createAssetDocument(payload) {
  return insertRecord("asset_documents", {
    asset_id: payload.asset_id || null,
    household_id: payload.household_id,
    document_role: payload.document_role || null,
    document_type: payload.document_type || null,
    file_name: payload.file_name || null,
    mime_type: payload.mime_type || null,
    storage_bucket: payload.storage_bucket || null,
    storage_path: payload.storage_path || null,
    source_hash: payload.source_hash || null,
    processing_status: payload.processing_status || "uploaded",
    notes: payload.notes || null,
    metadata: payload.metadata || {},
  });
}

export async function uploadGenericAssetDocument({
  householdId,
  assetId = null,
  file,
  documentType,
  documentRole,
  assetCategoryHint,
  notes,
  metadata = {},
}) {
  if (!householdId || !file) {
    return {
      data: null,
      error: new Error("Household and file are required"),
      upload: null,
      duplicate: false,
    };
  }

  const sourceHash = await buildDocumentSourceHash(file);
  const documentScope = assetId ? "asset" : "household";
  const existingResult = await findExistingGenericDocument({
    householdId,
    sourceHash,
  });

  if (existingResult.error) {
    return { data: null, error: existingResult.error, upload: null, duplicate: false };
  }

  if (existingResult.data?.id) {
    return {
      data: existingResult.data,
      error: null,
      errorSummary: "",
      upload: {
        attempted: false,
        succeeded: Boolean(existingResult.data.storage_path),
        storageBucket: existingResult.data.storage_bucket,
        storagePath: existingResult.data.storage_path,
        errorSummary: "",
      },
      duplicate: true,
    };
  }

  const uploadResult = await uploadPlatformDocumentFile({
    file,
    householdId,
    documentRole: documentRole || "uploaded_document",
    sourceHash,
  });

  const documentResult = await createAssetDocument({
    asset_id: assetId,
    household_id: householdId,
    document_role: documentRole || "uploaded_document",
    document_type: documentType || "other",
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    storage_bucket: uploadResult.storageBucket,
    storage_path: uploadResult.storagePath,
    source_hash: sourceHash,
    processing_status: uploadResult.succeeded ? "uploaded" : "failed",
    notes: notes || null,
    metadata: {
      ...metadata,
      document_scope: documentScope,
      asset_category_hint: assetCategoryHint || null,
      upload_attempted: uploadResult.attempted,
      upload_error: uploadResult.errorSummary || null,
    },
  });

  const friendlyErrorSummary =
    uploadResult.errorSummary ||
    (documentResult.error ? mapGenericUploadError(documentResult.error, { assetId }) : "");

  return {
    data: documentResult.data,
    error: documentResult.error,
    errorSummary: friendlyErrorSummary,
    upload: uploadResult,
    duplicate: false,
  };
}

export async function getHouseholdPlatformCounts(householdId) {
  const [members, contacts, assets, documents, alerts, tasks, reports] =
    await Promise.all([
      listHouseholdMembers(householdId),
      listContacts(householdId),
      listAssets(householdId),
      listHouseholdDocuments(householdId),
      listAssetAlerts(householdId),
      listAssetTasks(householdId),
      listReports(householdId),
    ]);

  const error =
    members.error ||
    contacts.error ||
    assets.error ||
    documents.error ||
    alerts.error ||
    tasks.error ||
    reports.error ||
    null;

  return {
    data: {
      memberCount: members.data.length,
      contactCount: contacts.data.length,
      assetCount: assets.data.length,
      documentCount: documents.data.length,
      openAlertCount: alerts.data.filter((item) => item.status === "open").length,
      openTaskCount: tasks.data.filter((item) => item.status === "open").length,
      reportCount: reports.data.length,
    },
    error,
  };
}

export async function getEmergencyModeBundle(householdId) {
  const [householdsResult, membersResult, contactsResult, assetsResult, documentsResult, alertsResult, tasksResult, reportsResult, portalHubResult] =
    await Promise.all([
      listRecords("households", [{ column: "id", value: householdId }], { orderBy: "updated_at" }),
      listHouseholdMembers(householdId),
      listContacts(householdId),
      listAssets(householdId),
      listHouseholdDocuments(householdId),
      listAssetAlerts(householdId),
      listAssetTasks(householdId),
      listReports(householdId),
      getPortalHubBundle(householdId),
    ]);

  const error =
    householdsResult.error ||
    membersResult.error ||
    contactsResult.error ||
    assetsResult.error ||
    documentsResult.error ||
    alertsResult.error ||
    tasksResult.error ||
    reportsResult.error ||
    portalHubResult.error ||
    null;

  const household = householdsResult.data?.[0] || null;
  const householdMembers = membersResult.data || [];
  const contacts = contactsResult.data || [];
  const assets = assetsResult.data || [];
  const keyDocuments = (documentsResult.data || [])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 12);
  const openAlerts = (alertsResult.data || []).filter((item) => item.status === "open");
  const openTasks = (tasksResult.data || []).filter((item) => item.status === "open");
  const reports = reportsResult.data || [];

  const emergencyMemberRoles = ["self", "spouse", "partner", "guardian", "executor", "trustee"];
  const professionalContactTypes = [
    "attorney",
    "CPA",
    "advisor",
    "insurance_agent",
    "trustee",
    "executor",
    "doctor",
    "institution",
  ];

  const emergencyContacts = [
    ...householdMembers.filter(
      (member) =>
        member.is_primary ||
        member.is_emergency_contact ||
        emergencyMemberRoles.includes(member.role_type)
    ),
    ...contacts.filter((contact) =>
      ["family", "attorney", "advisor", "executor", "trustee", "insurance_agent"].includes(contact.contact_type)
    ),
  ];

  const uniqueEmergencyContacts = emergencyContacts.filter(
    (contact, index, array) =>
      index === array.findIndex((item) => item.id === contact.id || item.full_name === contact.full_name)
  );

  const keyProfessionalContacts = contacts.filter((contact) =>
    professionalContactTypes.includes(contact.contact_type)
  );

  return {
    data: {
      household,
      householdMembers,
      emergencyContacts: uniqueEmergencyContacts,
      keyProfessionalContacts,
      assets,
      keyDocuments,
      openAlerts,
      openTasks,
      reports,
      portals: portalHubResult.data?.portals || [],
      portalReadiness: portalHubResult.data?.readiness || {
        portalCount: 0,
        linkedPortalCount: 0,
        emergencyRelevantCount: 0,
        missingRecoveryCount: 0,
        criticalAssetsWithoutLinkedPortals: [],
      },
    },
    error,
  };
}

export async function getHouseholdIntelligenceBundle(householdId) {
  const [householdsResult, membersResult, contactsResult, assetsResult, documentsResult, alertsResult, tasksResult, reportsResult, portalHubResult, propertiesResult, mortgageLoansResult, homeownersPoliciesResult, propertyStackAnalyticsResult] =
    await Promise.all([
      listRecords("households", householdId ? [{ column: "id", value: householdId }] : [], {
        orderBy: "updated_at",
      }),
      listHouseholdMembers(householdId),
      listContacts(householdId),
      listAssets(householdId),
      listHouseholdDocuments(householdId),
      listAssetAlerts(householdId),
      listAssetTasks(householdId),
      listReports(householdId),
      getPortalHubBundle(householdId),
      listRecords("properties", householdId ? [{ column: "household_id", value: householdId }] : []),
      listRecords("mortgage_loans", householdId ? [{ column: "household_id", value: householdId }] : []),
      listRecords("homeowners_policies", householdId ? [{ column: "household_id", value: householdId }] : []),
      listRecords("property_stack_analytics", householdId ? [{ column: "household_id", value: householdId }] : [], {
        orderBy: "updated_at",
      }),
    ]);

  const error =
    householdsResult.error ||
    membersResult.error ||
    contactsResult.error ||
    assetsResult.error ||
    documentsResult.error ||
    alertsResult.error ||
    tasksResult.error ||
    reportsResult.error ||
    portalHubResult.error ||
    propertiesResult.error ||
    mortgageLoansResult.error ||
    homeownersPoliciesResult.error ||
    propertyStackAnalyticsResult.error ||
    null;

  const household = householdsResult.data?.[0] || null;
  const householdMembers = membersResult.data || [];
  const contacts = contactsResult.data || [];
  const assets = assetsResult.data || [];
  const documents = documentsResult.data || [];
  const openAlerts = (alertsResult.data || []).filter((item) => item.status === "open");
  const openTasks = (tasksResult.data || []).filter((item) => item.status === "open");
  const reports = reportsResult.data || [];
  const properties = propertiesResult.data || [];
  const mortgageLoans = mortgageLoansResult.data || [];
  const homeownersPolicies = homeownersPoliciesResult.data || [];
  const propertyStackAnalytics = propertyStackAnalyticsResult.data || [];

  const emergencyMemberRoles = ["self", "spouse", "partner", "guardian", "executor", "trustee"];
  const professionalContactTypes = [
    "attorney",
    "CPA",
    "advisor",
    "insurance_agent",
    "trustee",
    "executor",
    "doctor",
    "institution",
  ];

  const emergencyContacts = [
    ...householdMembers.filter(
      (member) =>
        member.is_primary ||
        member.is_emergency_contact ||
        emergencyMemberRoles.includes(member.role_type)
    ),
    ...contacts.filter((contact) =>
      ["family", "attorney", "advisor", "executor", "trustee", "insurance_agent"].includes(contact.contact_type)
    ),
  ].filter(
    (contact, index, array) =>
      index === array.findIndex((item) => item.id === contact.id || item.full_name === contact.full_name)
  );

  const keyProfessionalContacts = contacts.filter((contact) =>
    professionalContactTypes.includes(contact.contact_type)
  );

  const keyAssets = assets.filter((asset) =>
    ["insurance", "banking", "mortgage", "retirement", "estate", "property", "homeowners", "health_insurance", "auto_insurance", "warranty"].includes(asset.asset_category)
  );

  const assetCountsByCategory = assets.reduce((accumulator, asset) => {
    const key = asset.asset_category || "unknown";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  const documentCountsByCategory = documents.reduce((accumulator, document) => {
    const key = document.assets?.asset_category || document.metadata?.asset_category_hint || "unassigned";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  const propertyIds = properties.map((item) => item.id);
  const [propertyMortgageLinksResult, propertyHomeownersLinksResult] = await Promise.all([
    listRowsByIds("property_mortgage_links", "property_id", propertyIds),
    listRowsByIds("property_homeowners_links", "property_id", propertyIds),
  ]);

  const linkedMortgageIds = new Set((propertyMortgageLinksResult.data || []).map((link) => link.mortgage_loan_id));
  const linkedHomeownersIds = new Set((propertyHomeownersLinksResult.data || []).map((link) => link.homeowners_policy_id));
  const propertyIdsWithMortgage = new Set((propertyMortgageLinksResult.data || []).map((link) => link.property_id));
  const propertyIdsWithHomeowners = new Set((propertyHomeownersLinksResult.data || []).map((link) => link.property_id));

  const propertiesMissingMortgageLink = properties.filter((item) => !propertyIdsWithMortgage.has(item.id));
  const propertiesMissingHomeownersLink = properties.filter((item) => !propertyIdsWithHomeowners.has(item.id));
  const mortgagesWithoutLinkedProperties = mortgageLoans.filter((item) => !linkedMortgageIds.has(item.id));
  const homeownersWithoutLinkedProperties = homeownersPolicies.filter((item) => !linkedHomeownersIds.has(item.id));
  const weakContinuityPropertyStacks = propertyStackAnalytics.filter(
    (item) => item.continuity_status === "weak"
  );
  const completePropertyStacksNeedingReview = propertyStackAnalytics.filter(
    (item) =>
      item.linkage_status === "complete_property_stack" &&
      (
        item.continuity_status !== "strong" ||
        (item.review_flags || []).length > 1
      )
  );
  const multipleMortgageLinkReview = propertyStackAnalytics.filter((item) =>
    (item.review_flags || []).includes("multiple_mortgages_linked")
  );
  const multipleHomeownersLinkReview = propertyStackAnalytics.filter((item) =>
    (item.review_flags || []).includes("multiple_homeowners_policies_linked")
  );
  const incompletePropertyStacks = propertyStackAnalytics.filter(
    (item) => item.linkage_status && item.linkage_status !== "complete_property_stack"
  );
  const propertiesWithValuationCount = propertyStackAnalytics.filter(
    (item) => item.metadata?.valuation_available
  ).length;
  const propertiesWithEquityVisibilityCount = propertyStackAnalytics.filter((item) =>
    ["strong", "partial"].includes(item.metadata?.equity_visibility_status)
  ).length;
  const propertiesMissingValueReview = propertyStackAnalytics.filter(
    (item) => !item.metadata?.valuation_available
  );
  const propertiesMissingProtectionButWithValue = propertyStackAnalytics.filter(
    (item) => item.metadata?.valuation_available && !item.has_homeowners
  );
  const weakValuationConfidenceProperties = propertyStackAnalytics.filter(
    (item) => item.metadata?.valuation_confidence_label === "weak"
  );
  const highQualityPropertyReviewAvailable = propertyStackAnalytics.filter(
    (item) =>
      item.metadata?.valuation_available &&
      item.metadata?.equity_visibility_status === "strong" &&
      item.continuity_status === "strong"
  );
  const analyticsByPropertyId = propertyStackAnalytics.reduce((accumulator, row) => {
    if (row.property_id) accumulator[row.property_id] = row;
    return accumulator;
  }, {});

  return {
    data: {
      household,
      householdMembers,
      contacts,
      emergencyContacts,
      keyProfessionalContacts,
      assets,
      keyAssets,
      assetCountsByCategory,
      documents,
      documentCountsByCategory,
      properties,
      mortgageLoans,
      homeownersPolicies,
      propertyStackAnalytics,
      propertyMortgageLinks: propertyMortgageLinksResult.data || [],
      propertyHomeownersLinks: propertyHomeownersLinksResult.data || [],
      propertyStackSummary: {
        propertyCount: properties.length,
        mortgageCount: mortgageLoans.length,
        homeownersCount: homeownersPolicies.length,
        propertiesMissingMortgageLink,
        propertiesMissingHomeownersLink,
        mortgagesWithoutLinkedProperties,
        homeownersWithoutLinkedProperties,
        propertyIdsWithMortgageCount: propertyIdsWithMortgage.size,
        propertyIdsWithHomeownersCount: propertyIdsWithHomeowners.size,
        weakContinuityPropertyStacks,
        completePropertyStacksNeedingReview,
        multipleMortgageLinkReview,
        multipleHomeownersLinkReview,
        incompletePropertyStacks,
        propertiesWithValuationCount,
        propertiesWithEquityVisibilityCount,
        propertiesMissingValueReview,
        propertiesMissingProtectionButWithValue,
        weakValuationConfidenceProperties,
        highQualityPropertyReviewAvailable,
        analyticsByPropertyId,
      },
      openAlerts,
      openTasks,
      reports,
      portals: portalHubResult.data?.portals || [],
      portalReadiness: portalHubResult.data?.readiness || {
        portalCount: 0,
        linkedPortalCount: 0,
        emergencyRelevantCount: 0,
        missingRecoveryCount: 0,
        criticalAssetsWithoutLinkedPortals: [],
      },
    },
    error:
      error ||
      propertyMortgageLinksResult.error ||
      propertyHomeownersLinksResult.error ||
      null,
  };
}

export async function listAssetSnapshots(assetId) {
  return listRecords(
    "asset_snapshots",
    [{ column: "asset_id", value: assetId }],
    { orderBy: "snapshot_date", ascending: false }
  );
}

export async function getAssetSnapshots(assetId) {
  return listAssetSnapshots(assetId);
}

export async function createAssetSnapshot(payload) {
  return insertRecord("asset_snapshots", {
    asset_id: payload.asset_id,
    household_id: payload.household_id,
    snapshot_type: payload.snapshot_type || null,
    snapshot_date: payload.snapshot_date || null,
    extracted_data: payload.extracted_data || {},
    completeness_assessment: payload.completeness_assessment || {},
    ai_summary: payload.ai_summary || {},
    metadata: payload.metadata || {},
  });
}

export async function listAssetAlerts(householdId) {
  return listRecords(
    "asset_alerts",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    { orderBy: "created_at" }
  );
}

export async function getAssetAlerts(assetId) {
  return listRecords(
    "asset_alerts",
    [{ column: "asset_id", value: assetId }],
    { orderBy: "created_at" }
  );
}

export async function createAssetAlert(payload) {
  return insertRecord("asset_alerts", {
    asset_id: payload.asset_id || null,
    household_id: payload.household_id || null,
    severity: payload.severity || "info",
    alert_type: payload.alert_type,
    title: payload.title,
    description: payload.description || null,
    status: payload.status || "open",
    metadata: payload.metadata || {},
  });
}

export async function listAssetTasks(householdId) {
  return listRecords(
    "asset_tasks",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    { orderBy: "due_date", ascending: true }
  );
}

export async function getAssetTasks(assetId) {
  return listRecords(
    "asset_tasks",
    [{ column: "asset_id", value: assetId }],
    { orderBy: "due_date", ascending: true }
  );
}

export async function createAssetTask(payload) {
  return insertRecord("asset_tasks", {
    household_id: payload.household_id,
    asset_id: payload.asset_id || null,
    assigned_contact_id: payload.assigned_contact_id || null,
    task_type: payload.task_type || null,
    title: payload.title,
    description: payload.description || null,
    due_date: payload.due_date || null,
    status: payload.status || "open",
    metadata: payload.metadata || {},
  });
}

export async function listReports(householdId) {
  return listRecords(
    "reports",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    { orderBy: "created_at" }
  );
}

export async function createReport(payload) {
  return insertRecord("reports", {
    household_id: payload.household_id,
    asset_id: payload.asset_id || null,
    report_type: payload.report_type,
    title: payload.title,
    payload: payload.payload || {},
    storage_bucket: payload.storage_bucket || null,
    storage_path: payload.storage_path || null,
    metadata: payload.metadata || {},
  });
}

export async function listPortalProfiles(householdId) {
  return listRecords(
    "portal_profiles",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    { orderBy: "updated_at" }
  );
}

function buildPortalContinuitySignals(portal, linkedAssetCount = 0) {
  const signals = [];

  if (!portal?.recovery_contact_hint) {
    signals.push("Recovery contact hint is missing.");
  }
  if (!portal?.mfa_type || portal.mfa_type === "unknown") {
    signals.push("MFA type has not been recorded.");
  }
  if (!portal?.last_verified_at) {
    signals.push("Portal access has not been recently verified.");
  }
  if (!portal?.emergency_relevance) {
    signals.push("Emergency relevance has not been marked.");
  }
  if (!portal?.access_status || ["limited", "locked", "unknown"].includes(portal.access_status)) {
    signals.push("Access status is limited, locked, or still unknown.");
  }
  if (linkedAssetCount === 0) {
    signals.push("This portal is not currently linked to an asset.");
  }

  return signals;
}

function buildPortalHubInsights(portals, links, assets) {
  const linkedAssetIds = new Set(links.map((link) => link.asset_id).filter(Boolean));
  const criticalAssetsWithoutLinkedPortals = assets.filter(
    (asset) =>
      ["insurance", "banking", "mortgage", "retirement", "warranty", "estate", "property", "homeowners", "health_insurance", "auto_insurance"].includes(asset.asset_category) &&
      !linkedAssetIds.has(asset.id)
  );

  const emergencyRelevantPortals = portals.filter((portal) => portal.emergency_relevance);
  const portalsMissingRecovery = portals.filter((portal) => !portal.recovery_contact_hint);

  return {
    portalCount: portals.length,
    linkedPortalCount: links.length,
    emergencyRelevantCount: emergencyRelevantPortals.length,
    missingRecoveryCount: portalsMissingRecovery.length,
    criticalAssetsWithoutLinkedPortals,
  };
}

export async function createPortalProfile(payload) {
  return insertRecord("portal_profiles", {
    household_id: payload.household_id,
    portal_name: payload.portal_name,
    institution_name: payload.institution_name || null,
    institution_key: payload.institution_key || null,
    portal_url: payload.portal_url || null,
    username_hint: payload.username_hint || null,
    recovery_contact_hint: payload.recovery_contact_hint || null,
    mfa_type: payload.mfa_type || "unknown",
    support_contact: payload.support_contact || null,
    access_status: payload.access_status || "unknown",
    emergency_relevance: Boolean(payload.emergency_relevance),
    last_verified_at: payload.last_verified_at || null,
    notes: payload.notes || null,
    metadata: payload.metadata || {},
  });
}

export async function updatePortalProfile(portalProfileId, payload) {
  return updateRecord("portal_profiles", portalProfileId, {
    portal_name: payload.portal_name,
    institution_name: payload.institution_name,
    institution_key: payload.institution_key,
    portal_url: payload.portal_url,
    username_hint: payload.username_hint,
    recovery_contact_hint: payload.recovery_contact_hint,
    mfa_type: payload.mfa_type,
    support_contact: payload.support_contact,
    access_status: payload.access_status,
    emergency_relevance: payload.emergency_relevance,
    last_verified_at: payload.last_verified_at,
    notes: payload.notes,
    metadata: payload.metadata,
  });
}

export async function getPortalProfileById(portalProfileId, scopeOverride = null) {
  const result = await listRecords(
    "portal_profiles",
    appendHouseholdScope([{ column: "id", value: portalProfileId }], scopeOverride),
    { orderBy: "updated_at" }
  );

  return {
    data: result.data?.[0] || null,
    error: result.error,
  };
}

export async function createAssetPortalLink(payload) {
  return insertRecord("asset_portal_links", {
    asset_id: payload.asset_id,
    portal_profile_id: payload.portal_profile_id,
    link_type: payload.link_type || null,
    is_primary: Boolean(payload.is_primary),
    notes: payload.notes || null,
    metadata: payload.metadata || {},
  });
}

export async function linkExistingPortalToAsset(assetId, portalProfileId, options = {}) {
  if (!assetId || !portalProfileId) {
    return {
      data: null,
      error: new Error("Asset and portal profile are required"),
      duplicate: false,
    };
  }

  const scope = normalizePlatformScope(options.scopeOverride);
  const assetResult = await getAssetById(assetId, scope);
  if (assetResult.error || !assetResult.data) {
    return {
      data: null,
      error: assetResult.error || buildScopedAccessError("Asset"),
      duplicate: false,
    };
  }

  const portalResult = await getPortalProfileById(portalProfileId, scope);
  if (portalResult.error || !portalResult.data) {
    return {
      data: null,
      error: portalResult.error || buildScopedAccessError("Portal profile"),
      duplicate: false,
    };
  }

  const { supabase, error } = getClientOrError();
  if (error) return { data: null, error, duplicate: false };

  const { data: existingLink, error: existingError } = await supabase
    .from("asset_portal_links")
    .select("*, portal_profiles(*)")
    .eq("asset_id", assetId)
    .eq("portal_profile_id", portalProfileId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: existingError, duplicate: false };
  }

  if (existingLink?.id) {
    return { data: existingLink, error: null, duplicate: true };
  }

  const linkResult = await createAssetPortalLink({
    asset_id: assetId,
    portal_profile_id: portalProfileId,
    link_type: options.link_type || null,
    is_primary: Boolean(options.is_primary),
    notes: options.notes || null,
    metadata: options.metadata || {},
  });

  if (linkResult.error || !linkResult.data?.id) {
    return { data: null, error: linkResult.error, duplicate: false };
  }

  const linkedPortalResult = await getPortalProfileById(portalProfileId, scope);

  return {
    data: {
      ...linkResult.data,
      portal_profiles: linkedPortalResult.data || null,
    },
    error: linkedPortalResult.error || null,
    duplicate: false,
  };
}

export async function getAssetPortalLinks(assetId) {
  return listRecords(
    "asset_portal_links",
    [{ column: "asset_id", value: assetId }],
    {
      select: "*, portal_profiles(*)",
      orderBy: "created_at",
      ascending: false,
    }
  );
}

export async function getPortalLinksForHousehold(householdId) {
  const { supabase, error } = getClientOrError();
  if (error) return { data: [], error };
  if (!householdId) return { data: [], error: null };

  const portalProfilesResult = await supabase
    .from("portal_profiles")
    .select("id")
    .eq("household_id", householdId);

  if (portalProfilesResult.error) {
    return { data: [], error: portalProfilesResult.error };
  }

  const portalIds = (portalProfilesResult.data || []).map((row) => row.id);
  if (portalIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error: queryError } = await supabase
    .from("asset_portal_links")
    .select("*, assets(id, asset_name, asset_category, asset_subcategory, status), portal_profiles(*)")
    .in("portal_profile_id", portalIds)
    .order("created_at", { ascending: false });

  return { data: data || [], error: queryError };
}

export async function listAssetsForPortalLinking(householdId) {
  return listAssets(householdId);
}

export async function getPortalHubBundle(householdId) {
  const [householdsResult, portalsResult, linksResult, assetsResult] = await Promise.all([
    listRecords("households", householdId ? [{ column: "id", value: householdId }] : [], {
      orderBy: "updated_at",
    }),
    listPortalProfiles(householdId),
    getPortalLinksForHousehold(householdId),
    listAssets(householdId),
  ]);

  const error =
    householdsResult.error ||
    portalsResult.error ||
    linksResult.error ||
    assetsResult.error ||
    null;

  const household = householdsResult.data?.[0] || null;
  const portals = portalsResult.data || [];
  const links = linksResult.data || [];
  const assets = assetsResult.data || [];

  const linksByPortalId = links.reduce((accumulator, link) => {
    if (!link.portal_profile_id) return accumulator;
    if (!accumulator[link.portal_profile_id]) {
      accumulator[link.portal_profile_id] = [];
    }
    accumulator[link.portal_profile_id].push(link);
    return accumulator;
  }, {});

  const portalSummaries = portals.map((portal) => {
    const portalLinks = linksByPortalId[portal.id] || [];
    const linkedAssets = portalLinks
      .map((link) => link.assets)
      .filter(Boolean)
      .filter(
        (asset, index, array) => index === array.findIndex((item) => item.id === asset.id)
      );

    return {
      ...portal,
      linked_assets: linkedAssets,
      linked_asset_count: linkedAssets.length,
      continuity_signals: buildPortalContinuitySignals(portal, linkedAssets.length),
    };
  });

  return {
    data: {
      household,
      portals: portalSummaries,
      links,
      assets,
      readiness: buildPortalHubInsights(portalSummaries, links, assets),
    },
    error,
  };
}

export async function getAssetDetailBundle(assetId, scopeOverride = null) {
  const assetResult = await getAssetById(assetId, scopeOverride);
  if (assetResult.error || !assetResult.data) {
    return {
      data: null,
      error: assetResult.error || buildScopedAccessError("Asset"),
    };
  }

  const [documentsResult, alertsResult, tasksResult, snapshotsResult, portalLinksResult] =
    await Promise.all([
      getAssetDocuments(assetId),
      getAssetAlerts(assetId),
      getAssetTasks(assetId),
      getAssetSnapshots(assetId),
      getAssetPortalLinks(assetId),
    ]);

  return {
    data: {
      asset: assetResult.data,
      documents: documentsResult.data || [],
      alerts: alertsResult.data || [],
      tasks: tasksResult.data || [],
      snapshots: snapshotsResult.data || [],
      portalLinks: portalLinksResult.data || [],
      portalContinuity: {
        linkedCount: (portalLinksResult.data || []).length,
        missingRecoveryCount: (portalLinksResult.data || []).filter(
          (link) => !link.portal_profiles?.recovery_contact_hint
        ).length,
      },
    },
    error:
      documentsResult.error ||
      alertsResult.error ||
      tasksResult.error ||
      snapshotsResult.error ||
      portalLinksResult.error ||
      null,
  };
}

export async function listInstitutionProfiles(filters = {}) {
  const queryFilters = [];
  if (filters.institution_type) {
    queryFilters.push({ column: "institution_type", value: filters.institution_type });
  }
  if (filters.institution_key) {
    queryFilters.push({ column: "institution_key", value: filters.institution_key });
  }

  return listRecords("institution_profiles", queryFilters, {
    orderBy: "display_name",
    ascending: true,
  });
}

export async function listRolesPermissions(householdId) {
  return listRecords(
    "roles_permissions",
    householdId ? [{ column: "household_id", value: householdId }] : [],
    { orderBy: "created_at" }
  );
}

export async function createRolePermission(payload) {
  return insertRecord("roles_permissions", {
    household_id: payload.household_id,
    member_id: payload.member_id || null,
    contact_id: payload.contact_id || null,
    role_name: payload.role_name,
    permission_scope: payload.permission_scope || {},
    status: payload.status || "active",
  });
}

export function getPlatformModuleDataMap() {
  return {
    dashboard: ["households", "assets", "asset_alerts", "asset_tasks", "reports"],
    vault: ["assets", "asset_documents", "asset_snapshots"],
    upload_center: ["asset_documents"],
    contacts: ["household_members", "contacts", "roles_permissions"],
    insurance_shell: ["assets", "asset_documents", "asset_alerts"],
    insurance_iul_intelligence: [
      "vaulted_policies",
      "vaulted_policy_documents",
      "vaulted_policy_snapshots",
      "vaulted_policy_analytics",
      "vaulted_policy_statements",
    ],
    banking: ["assets", "asset_documents", "asset_snapshots", "asset_alerts"],
    mortgage: [
      "assets",
      "asset_documents",
      "mortgage_loans",
      "mortgage_documents",
      "mortgage_snapshots",
      "mortgage_analytics",
      "reports",
    ],
    mortgage_detail: [
      "assets",
      "asset_documents",
      "mortgage_loans",
      "mortgage_documents",
      "mortgage_snapshots",
      "mortgage_analytics",
      "portal_profiles",
      "asset_portal_links",
    ],
    property: [
      "assets",
      "asset_documents",
      "properties",
      "property_documents",
      "property_snapshots",
      "property_analytics",
      "reports",
    ],
    property_detail: [
      "assets",
      "asset_documents",
      "properties",
      "property_documents",
      "property_snapshots",
      "property_analytics",
      "portal_profiles",
      "asset_portal_links",
    ],
    retirement: [
      "assets",
      "asset_documents",
      "retirement_accounts",
      "retirement_documents",
      "retirement_snapshots",
      "retirement_analytics",
      "retirement_positions",
      "reports",
    ],
    retirement_detail: [
      "assets",
      "asset_documents",
      "retirement_accounts",
      "retirement_documents",
      "retirement_snapshots",
      "retirement_analytics",
      "retirement_positions",
      "portal_profiles",
      "asset_portal_links",
    ],
    warranty: [
      "assets",
      "asset_documents",
      "warranties",
      "warranty_documents",
      "warranty_snapshots",
      "warranty_analytics",
      "reports",
    ],
    warranty_detail: [
      "assets",
      "asset_documents",
      "warranties",
      "warranty_documents",
      "warranty_snapshots",
      "warranty_analytics",
      "portal_profiles",
      "asset_portal_links",
    ],
    homeowners: [
      "assets",
      "asset_documents",
      "homeowners_policies",
      "homeowners_documents",
      "homeowners_snapshots",
      "homeowners_analytics",
      "reports",
    ],
    homeowners_detail: [
      "assets",
      "asset_documents",
      "homeowners_policies",
      "homeowners_documents",
      "homeowners_snapshots",
      "homeowners_analytics",
      "portal_profiles",
      "asset_portal_links",
    ],
    health_insurance: [
      "assets",
      "asset_documents",
      "health_plans",
      "health_documents",
      "health_snapshots",
      "health_analytics",
      "reports",
    ],
    health_plan_detail: [
      "assets",
      "asset_documents",
      "health_plans",
      "health_documents",
      "health_snapshots",
      "health_analytics",
      "portal_profiles",
      "asset_portal_links",
    ],
    auto_insurance: [
      "assets",
      "asset_documents",
      "auto_policies",
      "auto_documents",
      "auto_snapshots",
      "auto_analytics",
      "reports",
    ],
    auto_policy_detail: [
      "assets",
      "asset_documents",
      "auto_policies",
      "auto_documents",
      "auto_snapshots",
      "auto_analytics",
      "portal_profiles",
      "asset_portal_links",
    ],
    estate: ["assets", "asset_documents", "contacts", "reports"],
    emergency: ["contacts", "asset_documents", "reports", "roles_permissions"],
    portals: ["portal_profiles", "asset_portal_links", "assets"],
    settings: ["households", "household_members", "roles_permissions"],
    asset_detail: [
      "assets",
      "asset_documents",
      "asset_alerts",
      "asset_tasks",
      "asset_snapshots",
      "portal_profiles",
      "asset_portal_links",
    ],
  };
}
