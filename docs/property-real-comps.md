# Real Property Comps Setup

VaultedShield now supports a proxy-ready real comparable-sale provider path.

## Client env

Add this to your client env when you want the browser to request the server proxy:

```bash
VITE_PROPERTY_VALUATION_API_URL=/api/property-comps
VITE_PROPERTY_VALUATION_PROVIDER=attom_proxy
VITE_PROPERTY_VALUATION_ALLOW_SIMULATED_FALLBACK=true
```

## Server env

Add this to your deployment environment for the serverless proxy:

```bash
ATTOM_API_KEY=your_attom_api_key
ATTOM_BASE_URL=https://api.gateway.attomdata.com/propertyapi/v1.0.0
ATTOM_SALES_COMPARABLES_PATH=/salescomparables
ATTOM_DEFAULT_COMP_RADIUS_MILES=1.5
```

## Behavior

- If the proxy is configured and responds with usable comps, the Property Detail page will show `Official API comps`.
- If the proxy fails and `VITE_PROPERTY_VALUATION_ALLOW_SIMULATED_FALLBACK=true`, the page will show `Simulated fallback`.
- If no proxy is configured, the page will show `Simulated comps`.

## Important

- API keys stay on the server. Do not expose ATTOM keys in browser-visible env vars.
- The current proxy normalizes ATTOM-like comparable-sale payloads conservatively and may need light tuning once a live response is captured.
- The valuation engine remains conservative even when real comps are present; stronger confidence still has to be earned.
