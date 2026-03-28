import { runMockValuationProvider } from "./mockValuationProvider";
import {
  getRealPropertyValuationProviderDiagnostics,
  runRealPropertyValuationProvider,
} from "./realCompProvider";

export const PROPERTY_VALUATION_PROVIDER_KEY = "property_valuation_provider_router_v1";

export function getPropertyValuationProvider() {
  const diagnostics = getRealPropertyValuationProviderDiagnostics();

  return {
    provider_key: diagnostics.enabled ? `${diagnostics.providerKind}_property_valuation_provider_v1` : "local_heuristic_property_valuation_provider_v4",
    diagnostics,
    async runValuation(subject = {}) {
      if (!diagnostics.enabled) {
        const fallback = await runMockValuationProvider(subject);
        return {
          ...fallback,
          metadata: {
            ...(fallback.metadata || {}),
            comp_data_origin: "simulated",
            provider_mode: "mock_only",
          },
        };
      }

      try {
        const realResult = await runRealPropertyValuationProvider(subject);
        return {
          ...realResult,
          metadata: {
            ...(realResult.metadata || {}),
            comp_data_origin: "official_api",
            provider_mode: "official_api",
          },
        };
      } catch (error) {
        if (!diagnostics.allowSimulatedFallback) {
          throw error;
        }

        const fallback = await runMockValuationProvider(subject);
        return {
          ...fallback,
          metadata: {
            ...(fallback.metadata || {}),
            comp_data_origin: "simulated_fallback",
            provider_mode: "simulated_fallback",
            fallback_reason: error?.message || "Real comp provider failed",
            requested_provider: diagnostics.providerKind,
            attempted_endpoint: diagnostics.endpoint,
          },
        };
      }
    },
  };
}
