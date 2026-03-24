alter table if exists public.properties
  add column if not exists street_1 text null,
  add column if not exists street_2 text null,
  add column if not exists city text null,
  add column if not exists state text null,
  add column if not exists postal_code text null,
  add column if not exists apn text null,
  add column if not exists beds numeric null,
  add column if not exists baths numeric null,
  add column if not exists square_feet numeric null,
  add column if not exists lot_size numeric null,
  add column if not exists year_built integer null,
  add column if not exists last_purchase_price numeric null,
  add column if not exists last_purchase_date date null;

create table if not exists public.property_valuations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  valuation_date timestamptz not null default now(),
  valuation_status text not null default 'draft',
  valuation_method text null,
  low_estimate numeric null,
  midpoint_estimate numeric null,
  high_estimate numeric null,
  confidence_score numeric null,
  confidence_label text null,
  source_summary jsonb not null default '[]'::jsonb,
  adjustment_notes jsonb not null default '[]'::jsonb,
  comps_count integer not null default 0,
  price_per_sqft_estimate numeric null,
  disclaimer_text text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_comps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  valuation_id uuid null references public.property_valuations(id) on delete set null,
  source_name text null,
  comp_address text null,
  city text null,
  state text null,
  postal_code text null,
  distance_miles numeric null,
  sale_price numeric null,
  sale_date date null,
  beds numeric null,
  baths numeric null,
  square_feet numeric null,
  lot_size numeric null,
  year_built integer null,
  price_per_sqft numeric null,
  property_type text null,
  status text null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists property_valuations_property_id_idx
  on public.property_valuations(property_id);
create index if not exists property_valuations_household_id_idx
  on public.property_valuations(household_id);
create index if not exists property_valuations_valuation_date_idx
  on public.property_valuations(valuation_date desc);
create index if not exists property_valuations_confidence_label_idx
  on public.property_valuations(confidence_label);
create index if not exists property_comps_property_id_idx
  on public.property_comps(property_id);
create index if not exists property_comps_valuation_id_idx
  on public.property_comps(valuation_id);

drop trigger if exists set_property_valuations_updated_at on public.property_valuations;
create trigger set_property_valuations_updated_at
before update on public.property_valuations
for each row
execute function public.set_updated_at();
