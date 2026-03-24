create table if not exists public.warranties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  warranty_type_key text not null,
  provider_key text null,
  contract_name text null,
  covered_item_name text null,
  purchaser_name text null,
  effective_date date null,
  expiration_date date null,
  contract_status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.warranty_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  warranty_id uuid not null references public.warranties(id) on delete cascade,
  asset_document_id uuid null references public.asset_documents(id) on delete set null,
  document_class_key text null,
  provider_key text null,
  document_date date null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.warranty_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  warranty_id uuid not null references public.warranties(id) on delete cascade,
  warranty_document_id uuid null references public.warranty_documents(id) on delete set null,
  snapshot_type text null,
  snapshot_date date null,
  normalized_warranty jsonb not null default '{}'::jsonb,
  completeness_assessment jsonb not null default '{}'::jsonb,
  provider_profile jsonb not null default '{}'::jsonb,
  extraction_meta jsonb not null default '{}'::jsonb
);

create table if not exists public.warranty_analytics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  warranty_id uuid not null references public.warranties(id) on delete cascade,
  snapshot_id uuid null references public.warranty_snapshots(id) on delete set null,
  analytics_type text null,
  normalized_intelligence jsonb not null default '{}'::jsonb,
  review_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_warranties_household_id on public.warranties(household_id);
create index if not exists idx_warranties_asset_id on public.warranties(asset_id);
create index if not exists idx_warranties_warranty_type_key on public.warranties(warranty_type_key);
create index if not exists idx_warranties_provider_key on public.warranties(provider_key);
create index if not exists idx_warranty_documents_warranty_id on public.warranty_documents(warranty_id);
create index if not exists idx_warranty_documents_document_class_key on public.warranty_documents(document_class_key);
create index if not exists idx_warranty_documents_provider_key on public.warranty_documents(provider_key);
create index if not exists idx_warranty_documents_document_date on public.warranty_documents(document_date);
create index if not exists idx_warranty_snapshots_warranty_id on public.warranty_snapshots(warranty_id);
create index if not exists idx_warranty_snapshots_snapshot_date on public.warranty_snapshots(snapshot_date);
create index if not exists idx_warranty_analytics_warranty_id on public.warranty_analytics(warranty_id);
create index if not exists idx_warranty_analytics_analytics_type on public.warranty_analytics(analytics_type);

create trigger set_warranties_updated_at
before update on public.warranties
for each row
execute function public.set_updated_at();

comment on table public.warranties is 'Deep warranty and service-contract records linked one-to-one with generic assets.';
comment on table public.warranty_documents is 'Warranty document metadata linked to generic asset_documents.';
comment on table public.warranty_snapshots is 'Future normalized warranty snapshots.';
comment on table public.warranty_analytics is 'Future warranty review and intelligence outputs.';
