import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { buildHouseholdIntelligence } from "../domain/platformIntelligence";
import { getHouseholdIntelligenceBundle, getHouseholdPlatformCounts } from "../supabase/platformData";
import { compareVaultedPolicies, listVaultedPolicies } from "../supabase/vaultedPolicies";
import { usePlatformHousehold } from "../supabase/usePlatformHousehold";

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

export function PlatformShellDataProvider({ children }) {
  const householdState = usePlatformHousehold();
  const householdId = householdState.context.householdId;
  const [countsState, setCountsState] = useState({ data: null, error: "", loading: false });
  const [bundleState, setBundleState] = useState({ data: null, error: "", loading: false });
  const [insuranceState, setInsuranceState] = useState({
    savedPolicies: [],
    comparisonRows: [],
    error: "",
    loading: false,
    comparisonLoaded: false,
  });
  const insuranceLoadRef = useRef({ requestKey: "", inFlight: false });

  const refreshHouseholdData = useCallback(async () => {
    if (!householdId) {
      setCountsState({ data: null, error: "", loading: false });
      setBundleState({ data: null, error: "", loading: false });
      return;
    }

    setCountsState((current) => ({ ...current, loading: true, error: "" }));
    setBundleState((current) => ({ ...current, loading: true, error: "" }));

    try {
      const [countsResult, bundleResult] = await Promise.all([
        getHouseholdPlatformCounts(householdId),
        getHouseholdIntelligenceBundle(householdId),
      ]);

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
    } catch (error) {
      const message = error?.message || "Household data could not be loaded.";
      setCountsState({ data: null, error: message, loading: false });
      setBundleState({ data: null, error: message, loading: false });
    }
  }, [householdId]);

  const refreshInsurancePortfolio = useCallback(
    async ({ force = false } = {}) => {
      if (!householdId) {
        setInsuranceState({
          savedPolicies: [],
          comparisonRows: [],
          error: "",
          loading: false,
          comparisonLoaded: false,
        });
        return;
      }

      const requestKey = householdId;
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
        const policiesResult = await listVaultedPolicies();
        const savedPolicies = policiesResult.data || [];
        const policyIds = savedPolicies.map((policy) => policy?.id).filter(Boolean);
        const comparisonResult =
          policyIds.length > 0
            ? await compareVaultedPolicies(policyIds)
            : { data: { comparison_rows: [] }, error: null };

        setInsuranceState({
          savedPolicies,
          comparisonRows: comparisonResult.data?.comparison_rows || [],
          error: policiesResult.error?.message || comparisonResult.error?.message || "",
          loading: false,
          comparisonLoaded: true,
        });
      } catch (error) {
        setInsuranceState({
          savedPolicies: [],
          comparisonRows: [],
          error: error?.message || "Insurance portfolio could not be loaded.",
          loading: false,
          comparisonLoaded: false,
        });
      } finally {
        insuranceLoadRef.current = { requestKey, inFlight: false };
      }
    },
    [householdId, insuranceState.comparisonLoaded]
  );

  useEffect(() => {
    refreshHouseholdData();
  }, [refreshHouseholdData]);

  useEffect(() => {
    refreshInsurancePortfolio();
  }, [refreshInsurancePortfolio]);

  const fallbackRows = useMemo(
    () => buildFallbackPolicyRows(insuranceState.savedPolicies),
    [insuranceState.savedPolicies]
  );
  const insuranceRows = insuranceState.comparisonRows.length > 0 ? insuranceState.comparisonRows : fallbackRows;
  const intelligence = useMemo(
    () => (bundleState.data ? buildHouseholdIntelligence(bundleState.data) : null),
    [bundleState.data]
  );

  const value = useMemo(
    () => ({
      householdState,
      householdId,
      counts: countsState.data,
      intelligenceBundle: bundleState.data,
      intelligence,
      savedPolicies: insuranceState.savedPolicies,
      insuranceComparisonRows: insuranceState.comparisonRows,
      insuranceRows,
      loadingStates: {
        household: householdState.loading,
        householdData: countsState.loading || bundleState.loading,
        insurancePortfolio: insuranceState.loading,
      },
      errors: {
        household: householdState.error || "",
        householdData: countsState.error || bundleState.error || "",
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
      intelligence,
      insuranceState,
      insuranceRows,
      refreshHouseholdData,
      refreshInsurancePortfolio,
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
