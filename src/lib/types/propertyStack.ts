export type AssetLink = {
  id: string;
  created_at: string;
  updated_at: string;
  household_id: string;
  source_asset_id: string;
  target_asset_id: string;
  source_module: string | null;
  target_module: string | null;
  source_record_id: string | null;
  target_record_id: string | null;
  relationship_origin: string | null;
  relationship_key: string | null;
  link_type: string;
  confidence_score: number;
  is_primary: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
};

export type PropertyStackAnalyticsRecord = {
  id?: string;
  household_id: string | null;
  property_id: string | null;
  linkage_status: string;
  has_mortgage: boolean;
  has_homeowners: boolean;
  mortgage_link_count: number;
  homeowners_link_count: number;
  primary_mortgage_loan_id: string | null;
  primary_homeowners_policy_id: string | null;
  review_flags: string[];
  prompts: string[];
  completeness_score: number;
  continuity_status: "weak" | "moderate" | "strong" | string;
  metadata: {
    generated_from?: string;
    latest_valuation_id?: string | null;
    valuation_available?: boolean;
    valuation_confidence_label?: string | null;
    equity_visibility_status?: string | null;
    estimated_equity_midpoint?: number | null;
    estimated_ltv?: number | null;
    primary_mortgage_balance?: number | null;
    protection_status?: string | null;
    financing_status?: string | null;
    valuation_review_flags?: string[];
    valuation_prompts?: string[];
    linked_mortgage_ids?: string[];
    linked_homeowners_policy_ids?: string[];
  } & Record<string, unknown>;
};

export type PropertyValuationRecord = {
  id: string;
  household_id: string;
  property_id: string;
  valuation_date: string;
  valuation_status: string;
  valuation_method: string | null;
  low_estimate: number | null;
  midpoint_estimate: number | null;
  high_estimate: number | null;
  confidence_score: number | null;
  confidence_label: string | null;
  source_summary: Array<Record<string, unknown>>;
  adjustment_notes: Array<Record<string, unknown> | string>;
  comps_count: number;
  price_per_sqft_estimate: number | null;
  disclaimer_text: string | null;
  metadata: Record<string, unknown>;
};

export type PropertyCompRecord = {
  id: string;
  property_id: string;
  valuation_id: string | null;
  source_name: string | null;
  comp_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  distance_miles: number | null;
  sale_price: number | null;
  sale_date: string | null;
  beds: number | null;
  baths: number | null;
  square_feet: number | null;
  lot_size: number | null;
  year_built: number | null;
  price_per_sqft: number | null;
  property_type: string | null;
  status: string | null;
  raw_payload: Record<string, unknown>;
};

export type PropertyStackBundle = {
  property: Record<string, unknown> | null;
  linkedMortgages: Array<Record<string, unknown>>;
  linkedHomeownersPolicies: Array<Record<string, unknown>>;
  propertyStackAnalytics: PropertyStackAnalyticsRecord | null;
  latestPropertyValuation: PropertyValuationRecord | null;
  propertyValuationHistory: PropertyValuationRecord[];
  propertyComps: PropertyCompRecord[];
  propertyEquityPosition: Record<string, unknown> | null;
  propertyAssetLinks?: AssetLink[];
};
