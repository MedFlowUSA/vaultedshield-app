import {
  createAsset,
  getCurrentUserOrThrow,
  getOrCreateCurrentHousehold,
  getOwnedHouseholdById,
} from "./platformData";

function warnCreation(context, message, details = {}) {
  if (import.meta.env.DEV) {
    console.warn(`[VaultedShield] ${context} ${message}`, details);
  }
}

/**
 * Map raw auth / database / RLS failures into UI-safe creation messages.
 *
 * @param {unknown} error
 * @param {string} fallbackMessage
 * @param {string} context
 * @returns {string}
 */
export function mapCreationError(error, fallbackMessage, context = "record") {
  const message = String(error?.message || error?.details || "").toLowerCase();
  if (!message) return fallbackMessage;
  if (message.includes("owner_user_id") && message.includes("null value")) {
    return "We could not initialize your household profile yet. Please try again.";
  }
  if (message.includes("row-level security")) {
    return `We could not save this ${context} inside your current household yet. Please try again.`;
  }
  if (message.includes("signed in") || message.includes("authenticated")) {
    return `Please sign in again before creating a ${context}.`;
  }
  if (message.includes("household")) {
    return "We could not initialize your household profile yet. Please try again.";
  }
  return fallbackMessage;
}

/**
 * Resolve the owned household for the current auth user. If a preferred household id
 * is provided, it must belong to the current user or it will be ignored safely.
 *
 * @param {{ preferredHouseholdId?: string | null, context?: string }} options
 * @returns {Promise<{ data: { user: any, household: any } | null, error: Error | null }>}
 */
export async function resolveUserAndHouseholdDependencies({
  preferredHouseholdId = null,
  context = "record",
} = {}) {
  const authResult = await getCurrentUserOrThrow();
  if (authResult.error || !authResult.data?.id) {
    warnCreation(context, "creation blocked because no authenticated user was available", {
      householdId: preferredHouseholdId || null,
    });
    return {
      data: null,
      error: new Error(`Please sign in again before creating a ${context}.`),
    };
  }

  let resolvedHousehold = null;
  if (preferredHouseholdId) {
    const ownedHouseholdResult = await getOwnedHouseholdById(preferredHouseholdId, authResult.data.id);
    if (ownedHouseholdResult.error) {
      return {
        data: null,
        error: new Error(
          mapCreationError(
            ownedHouseholdResult.error,
            "We could not verify your household profile yet. Please try again.",
            context
          )
        ),
      };
    }

    if (ownedHouseholdResult.data?.id) {
      resolvedHousehold = ownedHouseholdResult.data;
    } else {
      warnCreation(context, "creation attempted with a household outside the current user scope", {
        householdId: preferredHouseholdId,
        authUserId: authResult.data.id,
      });
    }
  }

  if (!resolvedHousehold?.id) {
    const householdResult = await getOrCreateCurrentHousehold();
    if (householdResult.error || !householdResult.data?.id) {
      warnCreation(context, "creation failed while initializing the current household", {
        authUserId: authResult.data.id,
        error: householdResult.error?.message || null,
      });
      return {
        data: null,
        error: new Error(
          mapCreationError(
            householdResult.error,
            "We could not initialize your household profile yet. Please try again.",
            context
          )
        ),
      };
    }
    resolvedHousehold = householdResult.data;
  }

  return {
    data: {
      user: authResult.data,
      household: resolvedHousehold,
    },
    error: null,
  };
}

/**
 * Shared safe dependency chain for household-scoped module creation.
 *
 * auth -> household -> generic asset
 *
 * The module-specific record insert should happen after this helper returns.
 *
 * @param {{
 *   context?: string,
 *   preferredHouseholdId?: string | null,
 *   payload?: Record<string, any>,
 *   buildAssetPayload: (payload: Record<string, any>, household: any, user: any) => Record<string, any>
 * }} config
 * @returns {Promise<{ data: { user: any, household: any, asset: any } | null, error: Error | null }>}
 */
export async function createAssetWithDependencies({
  context = "record",
  preferredHouseholdId = null,
  payload = {},
  buildAssetPayload,
}) {
  const dependencyResult = await resolveUserAndHouseholdDependencies({
    preferredHouseholdId,
    context,
  });
  if (dependencyResult.error || !dependencyResult.data?.household?.id) {
    return {
      data: null,
      error:
        dependencyResult.error ||
        new Error(`We could not initialize your household profile before creating this ${context}.`),
    };
  }

  const { user, household } = dependencyResult.data;
  const assetPayload = buildAssetPayload(
    {
      ...payload,
      household_id: household.id,
    },
    household,
    user
  );

  const assetResult = await createAsset(assetPayload);
  if (assetResult.error || !assetResult.data?.id) {
    warnCreation(context, "generic asset creation failed", {
      householdId: household.id,
      authUserId: user.id,
      error: assetResult.error?.message || null,
    });
    return {
      data: null,
      error: new Error(
        mapCreationError(
          assetResult.error,
          `We could not create the base asset for this ${context}. Please try again.`,
          context
        )
      ),
    };
  }

  return {
    data: {
      user,
      household,
      asset: assetResult.data,
    },
    error: null,
  };
}

/**
 * Best-effort rollback for a generic asset when the module-specific record fails.
 * Rollback errors are logged in development but should not surface as a second UX failure.
 *
 * @param {{
 *   context?: string,
 *   assetId: string | null,
 *   deleteAsset: (assetId: string) => Promise<{ data: any, error: any }>,
 *   details?: Record<string, any>
 * }} options
 * @returns {Promise<void>}
 */
export async function rollbackCreatedAsset({
  context = "record",
  assetId,
  deleteAsset,
  details = {},
}) {
  if (!assetId || typeof deleteAsset !== "function") {
    return;
  }

  const rollbackResult = await deleteAsset(assetId);
  if (rollbackResult?.error) {
    warnCreation(context, "asset rollback failed after module record creation failed", {
      assetId,
      error: rollbackResult.error?.message || null,
      ...details,
    });
  }
}

/**
 * Placeholder shape for the next module adopters.
 * Future adopters can plug in by:
 * 1. defining their asset payload builder
 * 2. calling createAssetWithDependencies(...)
 * 3. inserting their module-specific deep row
 * 4. deleting the asset if the deep-row insert fails
 *
 * future: createRetirementAccountWithDependencies()
 * future: createInsurancePolicyWithDependencies()
 */
export const NEXT_MODULE_DEPENDENCY_TARGETS = Object.freeze([
  "retirement",
  "insurance",
]);
