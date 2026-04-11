import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000;
const STORAGE_REMOVE_CHUNK_SIZE = 100;

const ACCOUNT_DELETION_SCOPE = {
  auth_account: ["auth.users"],
  household_owned: [
    "households",
    "household_members",
    "contacts",
    "assets",
    "asset_documents",
    "asset_snapshots",
    "asset_alerts",
    "asset_tasks",
    "reports",
    "roles_permissions",
    "portal_profiles",
    "asset_portal_links",
    "properties",
    "property_documents",
    "property_snapshots",
    "property_analytics",
    "property_stack_analytics",
    "property_mortgage_links",
    "property_homeowners_links",
    "property_valuations",
    "property_valuation_events",
    "mortgage_loans",
    "mortgage_documents",
    "mortgage_snapshots",
    "mortgage_analytics",
    "homeowners_policies",
    "homeowners_documents",
    "homeowners_snapshots",
    "homeowners_analytics",
    "auto_policies",
    "auto_documents",
    "auto_snapshots",
    "auto_analytics",
    "health_plans",
    "health_documents",
    "health_snapshots",
    "health_analytics",
    "retirement_accounts",
    "retirement_documents",
    "retirement_snapshots",
    "retirement_analytics",
    "retirement_positions",
    "warranties",
    "warranty_documents",
    "warranty_snapshots",
    "warranty_analytics",
  ],
  user_owned_policy_intelligence: [
    "vaulted_policies",
    "vaulted_policy_documents",
    "vaulted_policy_snapshots",
    "vaulted_policy_analytics",
    "vaulted_policy_statements",
  ],
  storage_buckets: ["vaulted-platform-documents", "vaulted-policy-files"],
};

type AuthUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

type StorageReference = {
  storage_bucket: string | null;
  storage_path: string | null;
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeRecentAuthAgeMs(user: AuthUser) {
  const timestamp = user.last_sign_in_at || user.created_at || null;
  if (!timestamp) return Number.POSITIVE_INFINITY;
  const authMs = new Date(timestamp).getTime();
  if (!Number.isFinite(authMs)) return Number.POSITIVE_INFINITY;
  return Date.now() - authMs;
}

function uniqueStorageReferences(rows: StorageReference[] = []) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const bucket = row.storage_bucket || "";
    const path = row.storage_path || "";
    if (!bucket || !path) return false;
    const key = `${bucket}:${path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chunkValues<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function updateDeletionRequest(
  admin: ReturnType<typeof createClient>,
  requestId: string,
  payload: Record<string, unknown>
) {
  await admin.from("account_deletion_requests").update(payload).eq("id", requestId);
}

async function listStorageReferencesForDeletion(
  admin: ReturnType<typeof createClient>,
  householdIds: string[],
  policyIds: string[]
) {
  const references: StorageReference[] = [];

  if (householdIds.length) {
    const [assetDocumentResult, reportsResult] = await Promise.all([
      admin
        .from("asset_documents")
        .select("storage_bucket, storage_path")
        .in("household_id", householdIds),
      admin
        .from("reports")
        .select("storage_bucket, storage_path")
        .in("household_id", householdIds),
    ]);

    if (assetDocumentResult.error) throw assetDocumentResult.error;
    if (reportsResult.error) throw reportsResult.error;

    references.push(...(assetDocumentResult.data || []), ...(reportsResult.data || []));
  }

  if (policyIds.length) {
    const vaultedDocumentResult = await admin
      .from("vaulted_policy_documents")
      .select("storage_bucket, storage_path")
      .in("policy_id", policyIds);

    if (vaultedDocumentResult.error) throw vaultedDocumentResult.error;
    references.push(...(vaultedDocumentResult.data || []));
  }

  return uniqueStorageReferences(references);
}

async function removeStorageReferences(
  admin: ReturnType<typeof createClient>,
  references: StorageReference[]
) {
  const pathsByBucket = references.reduce<Record<string, string[]>>((accumulator, item) => {
    const bucket = item.storage_bucket || "";
    const path = item.storage_path || "";
    if (!bucket || !path) return accumulator;
    if (!accumulator[bucket]) {
      accumulator[bucket] = [];
    }
    accumulator[bucket].push(path);
    return accumulator;
  }, {});

  for (const [bucket, paths] of Object.entries(pathsByBucket)) {
    for (const chunk of chunkValues(paths, STORAGE_REMOVE_CHUNK_SIZE)) {
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) throw error;
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      status: "failed",
      message: "Method not allowed.",
    });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse(401, {
        ok: false,
        status: "failed",
        message: "You need to be signed in before deleting your account.",
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user?.id) {
      return jsonResponse(401, {
        ok: false,
        status: "failed",
        message: "You need to be signed in before deleting your account.",
      });
    }

    const recentAuthAgeMs = normalizeRecentAuthAgeMs(user as AuthUser);
    if (!Number.isFinite(recentAuthAgeMs) || recentAuthAgeMs > RECENT_AUTH_WINDOW_MS) {
      return jsonResponse(409, {
        ok: false,
        status: "reauth_required",
        message: "For security, re-enter your password before deleting your account.",
      });
    }

    const activeRequestResult = await admin
      .from("account_deletion_requests")
      .select("id, status, requested_at")
      .eq("user_id", user.id)
      .in("status", ["requested", "in_progress"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeRequestResult.error) {
      throw activeRequestResult.error;
    }

    if (activeRequestResult.data?.id) {
      return jsonResponse(202, {
        ok: true,
        status: "requested",
        message: "Your account deletion request is already in progress. You will be signed out now.",
        request_id: activeRequestResult.data.id,
      });
    }

    const [householdsResult, policiesResult] = await Promise.all([
      admin.from("households").select("id").eq("owner_user_id", user.id),
      admin.from("vaulted_policies").select("id").eq("user_id", user.id),
    ]);

    if (householdsResult.error) throw householdsResult.error;
    if (policiesResult.error) throw policiesResult.error;

    const householdIds = (householdsResult.data || []).map((row) => row.id).filter(Boolean);
    const policyIds = (policiesResult.data || []).map((row) => row.id).filter(Boolean);
    const storageReferences = await listStorageReferencesForDeletion(admin, householdIds, policyIds);

    const requestInsertResult = await admin
      .from("account_deletion_requests")
      .insert({
        user_id: user.id,
        status: "requested",
        metadata: {
          request_source: "account_center",
          requested_by_email: user.email || null,
          recent_auth_age_ms: recentAuthAgeMs,
          scope_map: ACCOUNT_DELETION_SCOPE,
          discovered_counts: {
            household_count: householdIds.length,
            vaulted_policy_count: policyIds.length,
            storage_object_count: storageReferences.length,
          },
        },
      })
      .select("id")
      .single();

    if (requestInsertResult.error || !requestInsertResult.data?.id) {
      throw requestInsertResult.error || new Error("Deletion request could not be recorded.");
    }

    const requestId = requestInsertResult.data.id;

    try {
      await updateDeletionRequest(admin, requestId, {
        status: "in_progress",
        failure_reason: null,
        metadata: {
          request_source: "account_center",
          requested_by_email: user.email || null,
          recent_auth_age_ms: recentAuthAgeMs,
          scope_map: ACCOUNT_DELETION_SCOPE,
          discovered_counts: {
            household_count: householdIds.length,
            vaulted_policy_count: policyIds.length,
            storage_object_count: storageReferences.length,
          },
          cleanup_started_at: new Date().toISOString(),
        },
      });

      await removeStorageReferences(admin, storageReferences);

      const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteUserError) throw deleteUserError;

      await updateDeletionRequest(admin, requestId, {
        status: "completed",
        completed_at: new Date().toISOString(),
        failure_reason: null,
        metadata: {
          request_source: "account_center",
          requested_by_email: user.email || null,
          recent_auth_age_ms: recentAuthAgeMs,
          scope_map: ACCOUNT_DELETION_SCOPE,
          discovered_counts: {
            household_count: householdIds.length,
            vaulted_policy_count: policyIds.length,
            storage_object_count: storageReferences.length,
          },
          cleanup_started_at: new Date().toISOString(),
          cleanup_completed_at: new Date().toISOString(),
        },
      });

      return jsonResponse(200, {
        ok: true,
        status: "completed",
        message:
          "Your VaultedShield account and owned data were permanently deleted. Limited records may be retained only where required by law.",
        request_id: requestId,
      });
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "Account deletion could not be completed.";

      await updateDeletionRequest(admin, requestId, {
        status: "failed",
        completed_at: null,
        failure_reason: failureReason,
      });

      return jsonResponse(500, {
        ok: false,
        status: "failed",
        message: "Account deletion could not be completed right now. Please try again.",
        request_id: requestId,
      });
    }
  } catch (error) {
    console.error("[VaultedShield] request-account-deletion failed", error);
    return jsonResponse(500, {
      ok: false,
      status: "failed",
      message: "Account deletion could not be completed right now. Please try again.",
    });
  }
});
