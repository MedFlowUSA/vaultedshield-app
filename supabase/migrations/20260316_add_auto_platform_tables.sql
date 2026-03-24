create table if not exists public.auto_policies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  auto_policy_type_key text not null,
  carrier_key text null,
  policy_name text null,
  named_insured text null,
  effective_date date null,
  expiration_date date null,
  policy_status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.auto_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  auto_policy_id uuid not null references public.auto_policies(id) on delete cascade,
  asset_document_id uuid null references public.asset_documents(id) on delete set null,
  document_class_key text null,
  carrier_key text null,
  document_date date null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.auto_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  auto_policy_id uuid not null references public.auto_policies(id) on delete cascade,
  auto_document_id uuid null references public.auto_documents(id) on delete set null,
  snapshot_type text null,
  snapshot_date date null,
  normalized_auto jsonb not null default '{}'::jsonb,
  completeness_assessment jsonb not null default '{}'::jsonb,
  carrier_profile jsonb not null default '{}'::jsonb,
  extraction_meta jsonb not null default '{}'::jsonb
);

create table if not exists public.auto_analytics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  auto_policy_id uuid not null references public.auto_policies(id) on delete cascade,
  snapshot_id uuid null references public.auto_snapshots(id) on delete set null,
  analytics_type text null,
  normalized_intelligence jsonb not null default '{}'::jsonb,
  review_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_auto_policies_household_id on public.auto_policies(household_id);
create index if not exists idx_auto_policies_asset_id on public.auto_policies(asset_id);
create index if not exists idx_auto_policies_auto_policy_type_key on public.auto_policies(auto_policy_type_key);
create index if not exists idx_auto_policies_carrier_key on public.auto_policies(carrier_key);
create index if not exists idx_auto_documents_auto_policy_id on public.auto_documents(auto_policy_id);
create index if not exists idx_auto_documents_document_class_key on public.auto_documents(document_class_key);
create index if not exists idx_auto_documents_carrier_key on public.auto_documents(carrier_key);
create index if not exists idx_auto_documents_document_date on public.auto_documents(document_date);
create index if not exists idx_auto_snapshots_auto_policy_id on public.auto_snapshots(auto_policy_id);
create index if not exists idx_auto_snapshots_snapshot_date on public.auto_snapshots(snapshot_date);
create index if not exists idx_auto_analytics_auto_policy_id on public.auto_analytics(auto_policy_id);
create index if not exists idx_auto_analytics_analytics_type on public.auto_analytics(analytics_type);

create trigger set_auto_policies_updated_at
before update on public.auto_policies
for each row
execute function public.set_updated_at();

comment on table public.auto_policies is 'Deep auto insurance records linked one-to-one with generic assets.';
comment on table public.auto_documents is 'Auto insurance document metadata linked to generic asset_documents.';
comment on table public.auto_snapshots is 'Future normalized auto policy snapshots.';
comment on table public.auto_analytics is 'Future auto insurance review and intelligence outputs.';
