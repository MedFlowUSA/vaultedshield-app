create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  property_type_key text not null,
  property_name text null,
  property_address text null,
  county text null,
  occupancy_type text null,
  owner_name text null,
  purchase_date date null,
  property_status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.property_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  asset_document_id uuid null references public.asset_documents(id) on delete set null,
  document_class_key text null,
  document_date date null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.property_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  property_document_id uuid null references public.property_documents(id) on delete set null,
  snapshot_type text null,
  snapshot_date date null,
  normalized_property jsonb not null default '{}'::jsonb,
  completeness_assessment jsonb not null default '{}'::jsonb,
  extraction_meta jsonb not null default '{}'::jsonb
);

create table if not exists public.property_analytics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  snapshot_id uuid null references public.property_snapshots(id) on delete set null,
  analytics_type text null,
  normalized_intelligence jsonb not null default '{}'::jsonb,
  review_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists properties_household_id_idx on public.properties(household_id);
create index if not exists properties_asset_id_idx on public.properties(asset_id);
create index if not exists properties_property_type_key_idx on public.properties(property_type_key);
create index if not exists property_documents_property_id_idx on public.property_documents(property_id);
create index if not exists property_documents_document_class_key_idx on public.property_documents(document_class_key);
create index if not exists property_documents_document_date_idx on public.property_documents(document_date);
create index if not exists property_snapshots_property_id_idx on public.property_snapshots(property_id);
create index if not exists property_snapshots_snapshot_date_idx on public.property_snapshots(snapshot_date);
create index if not exists property_analytics_property_id_idx on public.property_analytics(property_id);
create index if not exists property_analytics_analytics_type_idx on public.property_analytics(analytics_type);

drop trigger if exists set_properties_updated_at on public.properties;
create trigger set_properties_updated_at
before update on public.properties
for each row
execute function public.set_updated_at();
