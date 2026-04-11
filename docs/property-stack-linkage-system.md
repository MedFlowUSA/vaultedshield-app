# Property Stack Linkage System

VaultedShield now supports a two-layer linkage model for the property stack:

- Domain layer: `property_mortgage_links` and `property_homeowners_links`
- Platform layer: `asset_links`

The domain tables remain the source of truth for property-specific UX and review workflows. The new `asset_links` table mirrors those relationships into the shared household asset graph so cross-module intelligence can reason over a consistent linkage backbone.

## What is implemented

- `asset_links` stores household-scoped asset-to-asset relationships with:
  - `source_asset_id`
  - `target_asset_id`
  - `link_type`
  - `confidence_score`
  - `relationship_origin`
  - `relationship_key`
  - record-level traceability back to module rows
- Existing property-to-mortgage and property-to-homeowners links are backfilled into `asset_links` via the migration.
- Property link create, update, and delete flows now resync the mirrored `asset_links` rows automatically.
- `property_stack_analytics` remains the primary analytics record for:
  - mortgage presence
  - homeowners presence
  - linkage counts
  - completeness score
  - continuity / review flags
- Virtual valuation continues to write to `property_valuations` and `property_comps`, and property stack analytics are refreshed after valuation runs.

## Current frontend integration path

For property detail views, continue using `getPropertyBundle(propertyId, scopeOverride)` from [src/lib/supabase/propertyData.js](/c:/Users/jir92/vaultedshield-app/src/lib/supabase/propertyData.js).

The bundle already returns the current linkage and valuation context needed for the property stack experience:

- `linkedMortgages`
- `linkedHomeownersPolicies`
- `propertyStackAnalytics`
- `latestPropertyValuation`
- `propertyValuationHistory`
- `propertyComps`
- `propertyEquityPosition`

If a module needs the generic household graph instead of the property-specific bundle, use the new helpers in [src/lib/supabase/assetLinks.js](/c:/Users/jir92/vaultedshield-app/src/lib/supabase/assetLinks.js):

- `listAssetLinksForAsset(assetId, scopeOverride)`
- `listHouseholdAssetLinks(householdId)`

## Architecture notes

- `property_mortgage_links` and `property_homeowners_links` are still easier for module UIs to work with directly.
- `asset_links` is the reusable cross-module graph for:
  - property to liability linkage
  - property to protection linkage
  - future retirement / portal / continuity graph work
- `relationship_key` provides deterministic mirroring so the platform graph can stay in sync without guessing.

## Follow-up recommendation

The next micro-pass should expose `asset_links` inside cross-module household intelligence and linked-context panels so the UI can show one consistent “linked liabilities / linked protections / linked documents” system across property, retirement, and insurance detail pages.
