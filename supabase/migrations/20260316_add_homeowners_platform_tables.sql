create table if not exists public.homeowners_policies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  homeowners_policy_type_key text not null,
  carrier_key text null,
  policy_name text null,
  property_address text null,
  named_insured text null,
  effective_date date null,
  expiration_date date null,
  policy_status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.homeowners_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  homeowners_policy_id uuid not null references public.homeowners_policies(id) on delete cascade,
  asset_document_id uuid null references public.asset_documents(id) on delete set null,
  document_class_key text null,
  carrier_key text null,
  document_date date null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.homeowners_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  homeowners_policy_id uuid not null references public.homeowners_policies(id) on delete cascade,
  homeowners_document_id uuid null references public.homeowners_documents(id) on delete set null,
  snapshot_type text null,
  snapshot_date date null,
  normalized_homeowners jsonb not null default '{}'::jsonb,
  completeness_assessment jsonb not null default '{}'::jsonb,
  carrier_profile jsonb not null default '{}'::jsonb,
  extraction_meta jsonb not null default '{}'::jsonb
);

create table if not exists public.homeowners_analytics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  homeowners_policy_id uuid not null references public.homeowners_policies(id) on delete cascade,
  snapshot_id uuid null references public.homeowners_snapshots(id) on delete set null,
  analytics_type text null,
  normalized_intelligence jsonb not null default '{}'::jsonb,
  review_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.homeowners_policies is
'Deep homeowners policy records linked one-to-one with the broad platform assets table. Generic assets remain visible while homeowners-specific structure stays modular.';

comment on table public.homeowners_documents is
'Homeowners-specific document layer that coexists with asset_documents. Generic uploads remain the source of truth for file storage while homeowners_documents carries module-specific classification.';

comment on table public.homeowners_snapshots is
'Normalized homeowners extraction layer for declarations, renewals, billing, claims, and later merged policy views.';

comment on table public.homeowners_analytics is
'Starter homeowners intelligence layer kept separate from retirement analytics and the specialized IUL vaulted_policy_analytics tables.';

create unique index if not exists homeowners_policies_asset_id_unique_idx
  on public.homeowners_policies(asset_id);
create index if not exists homeowners_policies_household_id_idx
  on public.homeowners_policies(household_id);
create index if not exists homeowners_policies_policy_type_key_idx
  on public.homeowners_policies(homeowners_policy_type_key);
create index if not exists homeowners_policies_carrier_key_idx
  on public.homeowners_policies(carrier_key);
create index if not exists homeowners_policies_policy_status_idx
  on public.homeowners_policies(policy_status);

create index if not exists homeowners_documents_policy_id_idx
  on public.homeowners_documents(homeowners_policy_id);
create index if not exists homeowners_documents_asset_document_id_idx
  on public.homeowners_documents(asset_document_id);
create index if not exists homeowners_documents_document_class_key_idx
  on public.homeowners_documents(document_class_key);
create index if not exists homeowners_documents_carrier_key_idx
  on public.homeowners_documents(carrier_key);
create index if not exists homeowners_documents_document_date_idx
  on public.homeowners_documents(document_date);

create index if not exists homeowners_snapshots_policy_id_idx
  on public.homeowners_snapshots(homeowners_policy_id);
create index if not exists homeowners_snapshots_document_id_idx
  on public.homeowners_snapshots(homeowners_document_id);
create index if not exists homeowners_snapshots_snapshot_type_idx
  on public.homeowners_snapshots(snapshot_type);
create index if not exists homeowners_snapshots_snapshot_date_idx
  on public.homeowners_snapshots(snapshot_date);

create index if not exists homeowners_analytics_policy_id_idx
  on public.homeowners_analytics(homeowners_policy_id);
create index if not exists homeowners_analytics_snapshot_id_idx
  on public.homeowners_analytics(snapshot_id);
create index if not exists homeowners_analytics_analytics_type_idx
  on public.homeowners_analytics(analytics_type);

drop trigger if exists set_homeowners_policies_updated_at on public.homeowners_policies;
create trigger set_homeowners_policies_updated_at
before update on public.homeowners_policies
for each row execute function public.set_updated_at();

drop trigger if exists set_homeowners_documents_updated_at on public.homeowners_documents;
create trigger set_homeowners_documents_updated_at
before update on public.homeowners_documents
for each row execute function public.set_updated_at();

drop trigger if exists set_homeowners_snapshots_updated_at on public.homeowners_snapshots;
create trigger set_homeowners_snapshots_updated_at
before update on public.homeowners_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists set_homeowners_analytics_updated_at on public.homeowners_analytics;
create trigger set_homeowners_analytics_updated_at
before update on public.homeowners_analytics
for each row execute function public.set_updated_at();
