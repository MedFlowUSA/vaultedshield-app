import { runMockValuationProvider } from "./mockValuationProvider";

export const PROPERTY_VALUATION_PROVIDER_KEY = "local_heuristic_property_valuation_provider_v3_fhfa";

export function getPropertyValuationProvider() {
  return {
    provider_key: PROPERTY_VALUATION_PROVIDER_KEY,
    runValuation: runMockValuationProvider,
  };
}
