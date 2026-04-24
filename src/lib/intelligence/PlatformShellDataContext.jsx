/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { buildHouseholdIntelligence } from "../domain/platformIntelligence";
import { resolvePlatformDataScope } from "./platformShellScope";
import { getHouseholdIntelligenceBundle, getHouseholdPlatformCounts } from "../supabase/platformData";
import { listHouseholdIssues } from "../supabase/issueData.js";
import { compareVaultedPolicies, listVaultedPolicies } from "../supabase/vaultedPolicies";
import { usePlatformHousehold } from "../supabase/usePlatformHousehold";
import {
  buildDetectedIssues,
  buildDetectedIssuesFingerprint,
} from "./issues/buildDetectedIssues.js";
import { syncDetectedIssues } from "./issues/syncDetectedIssues.js";
import { primeHouseholdReviewWorkflowState } from "../domain/platformIntelligence/reviewWorkflowState.js";

const PlatformShellDataContext = createContext(null);

function buildFallbackPolicyRows(savedPolicies = []) {
  return savedPolicies.map((policy) => ({
    policy_id: policy.id,
    carrier: policy.carrier_name || "",
    product: policy.product_name || "",
    issue_date: policy.issue_date || null,
    latest_statement_date: policy.latest_statement_date || null,
    continuity_score: null,
    death_benefit: null,
    total_coi: null,
    total_visible_charges: null,
    missing_fields: [],
    coi_confidence: "unknown",
    charge_visibility_status: "limited",
    strategy_visibility: "limited",
  }));
}

function buildEmptyInsuranceState() {
  return {
    savedPolicies: [],
    comparisonRows: [],
    error: "",
    loading: false,
    comparisonLoaded: false,
    scopeSource: "unresolved",
  };
}

export function PlatformShellDataProvider({ children, accessSession = null, authReady = true }) {
  const householdState = usePlatformHousehold(accessSession, authReady);
  const scope = resolvePlatformDataScope(accessSession, householdState);
  const householdId = scope.householdId;
  const authUserId = scope.authUserId;
  const ownershipMode = scope.ownershipMode;
  const guestFallbackActive = scope.guestFallbackActive;
  const canLoadShellData = authReady && scope.canLoadShellData;
  const scopeKey = `${authUserId || "guest"}:${householdId || "none"}:${ownershipMode}:${guestFallbackActive ? "guest" : "owned"}`;
  const [countsState, setCountsState] = useState({ data: null, error: "", loading: false });
  const [bundleState, setBundleState] = useState({ data: null, error: "", loading: false });
  const [issueState, setIssueState] = useState({ data: [], error: "", loading: false });
  const [insuranceState, setInsuranceState] = useState(buildEmptyInsuranceState);
  const householdLoadRef = useRef({ requestKey: "", inFlight: false });
  const insuranceLoadRef = useRef({ requestKey: "", inFlight: false });
  const issueSyncRef = useRef({ householdId: "", fingerprint: "", inFlight: false });

  useEffect(() => {
    householdLoadRef.current = { requestKey: "", inFlight: false };
    insuranceLoadRef.current = { requestKey: "", inFlight: false };
    issueSyncRef.current = { householdId: "", fingerprint: "", inFlight: false };
    setCountsState({ data: null, error: "", loading: false });
    setBundleState({ data: null, error: "", loading: false });
    setIssueState({ data: [], error: "", loading: false });
    setInsuranceState({
      ...buildEmptyInsuranceState(),
      scopeSource: scope.scopeSource,
    });
    primeHouseholdReviewWorkflowState({ householdId, userId: authUserId || null }, []);
  }, [authUserId, canLoadShellData, householdId, scope.scopeSource, scopeKey]);

  const refreshHouseholdData = useCallback(async () => {
    if (!canLoadShellData) {
      householdLoadRef.current = { requestKey: "", inFlight: false };
      setCountsState({ data: null, error: "", loading: false });
      setBundleState({ data: null, error: "", loading: false });
      setIssueState({ data: [], error: "", loading: false });
      primeHouseholdReviewWorkflowState({ householdId, userId: authUserId || null }, []);
      return;
    }

    const requestKey = scopeKey;
    householdLoadRef.current = { requestKey, inFlight: true };
    setCountsState((current) => ({ ...current, loading: true, error: "" }));
    setBundleState((current) => ({ ...current, loading: true, error: "" }));
    setIssueState((current) => ({ ...current, loading: true, error: "" }));

    try {
      const [countsResult, bundleResult, issueResult] = await Promise.all([
        getHouseholdPlatformCounts(householdId),
        getHouseholdIntelligenceBundle(householdId),
        listHouseholdIssues({ householdId }),
      ]);

      if (householdLoadRef.current.requestKey !== requestKey) {
        return;
      }

      setCountsState({
        data: countsResult.data || null,
        error: countsResult.error?.message || "",
        loading: false,
      });
      setBundleState({
        data: bundleResult.data || null,
        error: bundleResult.error?.message || "",
        loading: false,
      });
      setIssueState({
        data: issueResult || [],
        error: "",
        loading: false,
      });
      primeHouseholdReviewWorkflowState({ householdId, userId: authUserId || null }, issueResult || []);
    } catch (error) {
      if (householdLoadRef.current.requestKey !== requestKey) {
        return;
      }
      const message = error?.message || "Household data could not be loaded.";
      setCountsState({ data: null, error: message, loading: false });
      setBundleState({ data: null, error: message, loading: false });
      setIssueState({ data: [], error: message, loading: false });
      primeHouseholdReviewWorkflowState({ householdId, userId: authUserId || null }, []);
    } finally {
      if (householdLoadRef.current.requestKey === requestKey) {
        householdLoadRef.current = { requestKey, inFlight: false };
      }
    }
  }, [authUserId, canLoadShellData, householdId, scopeKey]);

  const refreshInsurancePortfolio = useCallback(
    async ({ force = false } = {}) => {
      if (!canLoadShellData) {
        setInsuranceState({
          ...buildEmptyInsuranceState(),
          scopeSource: scope.scopeSource,
        });
        return;
      }

      const requestKey = scopeKey;
      if (!force) {
        if (insuranceLoadRef.current.inFlight && insuranceLoadRef.current.requestKey === requestKey) {
          return;
        }
        if (insuranceState.comparisonLoaded && insuranceLoadRef.current.requestKey === requestKey) {
          return;
        }
      }

      insuranceLoadRef.current = { requestKey, inFlight: true };
      setInsuranceState((current) => ({ ...current, loading: true, error: "" }));

      try {
        const policyScope = {
          userId: authUserId,
          householdId,
          ownershipMode,
          guestFallbackActive,
          source: "platform_shell_provider",
        };
        const policiesResult = await listVaultedPolicies(policyScope);
        const savedPolicies = policiesResult.data || [];
        const policyIds = savedPolicies.map((policy) => policy?.id).filter(Boolean);
        const comparisonResult =
          policyIds.length > 0
            ? await compareVaultedPolicies(policyIds, policyScope)
            : { data: { comparison_rows: [] }, error: null };

        if (insuranceLoadRef.current.requestKey !== requestKey) {
          return;
        }

        setInsuranceState({
          savedPolicies,
          comparisonRows: comparisonResult.data?.comparison_rows || [],
          error: policiesResult.error?.message || comparisonResult.error?.message || "",
          loading: false,
          comparisonLoaded: true,
          scopeSource: authUserId ? "authenticated_query" : "guest_query",
        });
      } catch (error) {
        if (insuranceLoadRef.current.requestKey !== requestKey) {
          return;
        }
        setInsuranceState({
          ...buildEmptyInsuranceState(),
          error: error?.message || "Insurance portfolio could not be loaded.",
          scopeSource: authUserId ? "authenticated_query" : "guest_query",
        });
      } finally {
        if (insuranceLoadRef.current.requestKey === requestKey) {
          insuranceLoadRef.current = { requestKey, inFlight: false };
        }
      }
    },
    [
      authUserId,
      canLoadShellData,
      guestFallbackActive,
      householdId,
      insuranceState.comparisonLoaded,
      ownershipMode,
      scope.scopeSource,
      scopeKey,
    ]
  );

  useEffect(() => {
    refreshHouseholdData();
  }, [refreshHouseholdData]);

  useEffect(() => {
    refreshInsurancePortfolio();
  }, [refreshInsurancePortfolio]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const scopedProperties = bundleState.data?.properties || [];
    if (!householdId || scopedProperties.length === 0) return;

    const mismatched = scopedProperties.filter(
      (property) => property?.household_id && property.household_id !== householdId
    );

    if (mismatched.length > 0) {
      console.warn("[VaultedShield] property rows were returned outside the active household scope.", {
        activeHouseholdId: householdId,
        propertyIds: mismatched.map((property) => property.id),
        propertyHouseholdIds: mismatched.map((property) => property.household_id),
      });
    }
  }, [bundleState.data?.properties, householdId]);

  const fallbackRows = useMemo(
    () => buildFallbackPolicyRows(insuranceState.savedPolicies),
    [insuranceState.savedPolicies]
  );
  const insuranceRows = insuranceState.comparisonRows.length > 0 ? insuranceState.comparisonRows : fallbackRows;
  const intelligence = useMemo(
    () => (bundleState.data ? buildHouseholdIntelligence(bundleState.data) : null),
    [bundleState.data]
  );

  useEffect(() => {
    if (!authUserId || !householdId || !bundleState.data || !intelligence) {
      return;
    }
    if (bundleState.loading || insuranceState.loading) {
      return;
    }

    const detectedIssues = buildDetectedIssues({
      householdId,
      bundle: bundleState.data,
      intelligence,
      savedPolicyRows: insuranceRows,
    });
    const fingerprint = buildDetectedIssuesFingerprint(detectedIssues);
    const syncKey = `${householdId}:${fingerprint}`;

    if (
      issueSyncRef.current.householdId === householdId &&
      issueSyncRef.current.fingerprint === fingerprint
    ) {
      return;
    }
    if (issueSyncRef.current.inFlight && issueSyncRef.current.fingerprint === fingerprint) {
      return;
    }

    issueSyncRef.current = {
      householdId,
      fingerprint,
      inFlight: true,
    };

    let cancelled = false;

    syncDetectedIssues(
      {
        householdId,
        bundle: bundleState.data,
        intelligence,
        savedPolicyRows: insuranceRows,
      },
      {
        currentUserId: authUserId,
      }
    ).catch((error) => {
      if (cancelled) return;
      console.error("[VaultedShield] detected issue sync failed.", {
        householdId,
        syncKey,
        error,
      });
      issueSyncRef.current = {
        householdId: "",
        fingerprint: "",
        inFlight: false,
      };
    }).finally(() => {
      if (cancelled) return;
      issueSyncRef.current = {
        householdId,
        fingerprint,
        inFlight: false,
      };
    });

    return () => {
      cancelled = true;
    };
  }, [
    authUserId,
    bundleState.data,
    bundleState.loading,
    householdId,
    insuranceRows,
    insuranceState.loading,
    intelligence,
  ]);

  const value = useMemo(
    () => ({
      householdState,
      householdId,
      householdIssues: issueState.data || [],
      counts: countsState.data,
      intelligenceBundle: bundleState.data,
      intelligence,
      savedPolicies: insuranceState.savedPolicies,
      insuranceComparisonRows: insuranceState.comparisonRows,
      insuranceRows,
      debug: {
        authUserId,
        householdId,
        householdName: bundleState.data?.household?.household_name || householdState.household?.household_name || null,
        ownershipMode,
        guestModeActive: !authUserId,
        sharedFallbackActive: guestFallbackActive,
        policyScopeSource: insuranceState.scopeSource,
        scopedPropertyCount: bundleState.data?.properties?.length || 0,
        scopedMortgageCount: bundleState.data?.mortgageLoans?.length || 0,
        scopedEmergencyContactCount: bundleState.data?.emergencyContacts?.length || 0,
        scopedProfessionalContactCount: bundleState.data?.keyProfessionalContacts?.length || 0,
        usedFallbackPlatformData: Boolean(authUserId && guestFallbackActive),
      },
      loadingStates: {
        household: householdState.loading,
        householdData: countsState.loading || bundleState.loading,
        householdIssues: issueState.loading,
        insurancePortfolio: insuranceState.loading,
      },
      errors: {
        household: householdState.error || "",
        householdData: countsState.error || bundleState.error || "",
        householdIssues: issueState.error || "",
        insurancePortfolio: insuranceState.error || "",
      },
      refreshHouseholdData,
      refreshInsurancePortfolio,
    }),
    [
      householdState,
      householdId,
      countsState,
      bundleState,
      issueState,
      intelligence,
      insuranceState,
      insuranceRows,
      authUserId,
      guestFallbackActive,
      refreshHouseholdData,
      refreshInsurancePortfolio,
      ownershipMode,
    ]
  );

  return (
    <PlatformShellDataContext.Provider value={value}>
      {children}
    </PlatformShellDataContext.Provider>
  );
}

export function usePlatformShellData() {
  const value = useContext(PlatformShellDataContext);
  if (!value) {
    throw new Error("usePlatformShellData must be used inside PlatformShellDataProvider.");
  }
  return value;
}
