create table if not exists public.health_plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  health_plan_type_key text not null,
  carrier_key text null,
  plan_name text null,
  subscriber_name text null,
  employer_group_name text null,
  effective_date date null,
  renewal_date date null,
  plan_status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.health_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  health_plan_id uuid not null references public.health_plans(id) on delete cascade,
  asset_document_id uuid null references public.asset_documents(id) on delete set null,
  document_class_key text null,
  carrier_key text null,
  document_date date null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.health_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  health_plan_id uuid not null references public.health_plans(id) on delete cascade,
  health_document_id uuid null references public.health_documents(id) on delete set null,
  snapshot_type text null,
  snapshot_date date null,
  normalized_health jsonb not null default '{}'::jsonb,
  completeness_assessment jsonb not null default '{}'::jsonb,
  carrier_profile jsonb not null default '{}'::jsonb,
  extraction_meta jsonb not null default '{}'::jsonb
);

create table if not exists public.health_analytics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  health_plan_id uuid not null references public.health_plans(id) on delete cascade,
  snapshot_id uuid null references public.health_snapshots(id) on delete set null,
  analytics_type text null,
  normalized_intelligence jsonb not null default '{}'::jsonb,
  review_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_health_plans_household_id on public.health_plans(household_id);
create index if not exists idx_health_plans_asset_id on public.health_plans(asset_id);
create index if not exists idx_health_plans_health_plan_type_key on public.health_plans(health_plan_type_key);
create index if not exists idx_health_plans_carrier_key on public.health_plans(carrier_key);
create index if not exists idx_health_documents_health_plan_id on public.health_documents(health_plan_id);
create index if not exists idx_health_documents_document_class_key on public.health_documents(document_class_key);
create index if not exists idx_health_documents_carrier_key on public.health_documents(carrier_key);
create index if not exists idx_health_documents_document_date on public.health_documents(document_date);
create index if not exists idx_health_snapshots_health_plan_id on public.health_snapshots(health_plan_id);
create index if not exists idx_health_snapshots_snapshot_date on public.health_snapshots(snapshot_date);
create index if not exists idx_health_analytics_health_plan_id on public.health_analytics(health_plan_id);
create index if not exists idx_health_analytics_analytics_type on public.health_analytics(analytics_type);

create trigger set_health_plans_updated_at
before update on public.health_plans
for each row
execute function public.set_updated_at();

comment on table public.health_plans is 'Deep health insurance records linked one-to-one with generic assets.';
comment on table public.health_documents is 'Health insurance document metadata linked to generic asset_documents.';
comment on table public.health_snapshots is 'Future normalized health plan snapshots.';
comment on table public.health_analytics is 'Future health insurance review and intelligence outputs.';
