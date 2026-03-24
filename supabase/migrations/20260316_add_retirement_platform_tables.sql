create table if not exists public.retirement_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  retirement_type_key text not null,
  provider_key text null,
  plan_name text null,
  institution_name text null,
  account_number_masked text null,
  account_owner text null,
  participant_name text null,
  employer_name text null,
  plan_status text not null default 'active',
  is_account_based boolean not null default true,
  is_benefit_based boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.retirement_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retirement_account_id uuid not null references public.retirement_accounts(id) on delete cascade,
  asset_document_id uuid null references public.asset_documents(id) on delete set null,
  document_class_key text null,
  provider_key text null,
  statement_date date null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.retirement_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retirement_account_id uuid not null references public.retirement_accounts(id) on delete cascade,
  retirement_document_id uuid null references public.retirement_documents(id) on delete set null,
  snapshot_type text null,
  snapshot_date date null,
  normalized_retirement jsonb not null default '{}'::jsonb,
  completeness_assessment jsonb not null default '{}'::jsonb,
  provider_profile jsonb not null default '{}'::jsonb,
  extraction_meta jsonb not null default '{}'::jsonb
);

create table if not exists public.retirement_analytics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retirement_account_id uuid not null references public.retirement_accounts(id) on delete cascade,
  snapshot_id uuid null references public.retirement_snapshots(id) on delete set null,
  analytics_type text null,
  normalized_intelligence jsonb not null default '{}'::jsonb,
  readiness_status text null,
  review_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.retirement_positions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retirement_account_id uuid not null references public.retirement_accounts(id) on delete cascade,
  snapshot_id uuid null references public.retirement_snapshots(id) on delete set null,
  position_type text null,
  position_name text null,
  ticker_symbol text null,
  asset_class text null,
  units numeric null,
  unit_value numeric null,
  current_value numeric null,
  allocation_percent numeric null,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.retirement_accounts is
'Deep retirement records linked one-to-one with the broad platform assets table. This preserves generic asset visibility while allowing retirement-specific structure.';

comment on table public.retirement_documents is
'Retirement-specific document layer that coexists with asset_documents. Generic uploads remain the source of truth for file storage while retirement_documents carries module-specific classification.';

comment on table public.retirement_snapshots is
'Normalized retirement extraction layer for baseline, statement, pension estimate, beneficiary review, and merged account views.';

comment on table public.retirement_analytics is
'Future retirement intelligence layer kept separate from the specialized IUL vaulted_policy_analytics tables.';

comment on table public.retirement_positions is
'Future allocation, fund, subaccount, pension option, and model portfolio detail rows linked to retirement snapshots.';

create unique index if not exists retirement_accounts_asset_id_unique_idx
  on public.retirement_accounts(asset_id);
create index if not exists retirement_accounts_household_id_idx
  on public.retirement_accounts(household_id);
create index if not exists retirement_accounts_retirement_type_key_idx
  on public.retirement_accounts(retirement_type_key);
create index if not exists retirement_accounts_provider_key_idx
  on public.retirement_accounts(provider_key);

create index if not exists retirement_documents_retirement_account_id_idx
  on public.retirement_documents(retirement_account_id);
create index if not exists retirement_documents_asset_document_id_idx
  on public.retirement_documents(asset_document_id);
create index if not exists retirement_documents_document_class_key_idx
  on public.retirement_documents(document_class_key);
create index if not exists retirement_documents_provider_key_idx
  on public.retirement_documents(provider_key);
create index if not exists retirement_documents_statement_date_idx
  on public.retirement_documents(statement_date);

create index if not exists retirement_snapshots_retirement_account_id_idx
  on public.retirement_snapshots(retirement_account_id);
create index if not exists retirement_snapshots_retirement_document_id_idx
  on public.retirement_snapshots(retirement_document_id);
create index if not exists retirement_snapshots_snapshot_type_idx
  on public.retirement_snapshots(snapshot_type);
create index if not exists retirement_snapshots_snapshot_date_idx
  on public.retirement_snapshots(snapshot_date);

create index if not exists retirement_analytics_retirement_account_id_idx
  on public.retirement_analytics(retirement_account_id);
create index if not exists retirement_analytics_snapshot_id_idx
  on public.retirement_analytics(snapshot_id);
create index if not exists retirement_analytics_analytics_type_idx
  on public.retirement_analytics(analytics_type);

create index if not exists retirement_positions_retirement_account_id_idx
  on public.retirement_positions(retirement_account_id);
create index if not exists retirement_positions_snapshot_id_idx
  on public.retirement_positions(snapshot_id);
create index if not exists retirement_positions_position_type_idx
  on public.retirement_positions(position_type);

drop trigger if exists set_retirement_accounts_updated_at on public.retirement_accounts;
create trigger set_retirement_accounts_updated_at
before update on public.retirement_accounts
for each row execute function public.set_updated_at();

drop trigger if exists set_retirement_documents_updated_at on public.retirement_documents;
create trigger set_retirement_documents_updated_at
before update on public.retirement_documents
for each row execute function public.set_updated_at();

drop trigger if exists set_retirement_snapshots_updated_at on public.retirement_snapshots;
create trigger set_retirement_snapshots_updated_at
before update on public.retirement_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists set_retirement_analytics_updated_at on public.retirement_analytics;
create trigger set_retirement_analytics_updated_at
before update on public.retirement_analytics
for each row execute function public.set_updated_at();

drop trigger if exists set_retirement_positions_updated_at on public.retirement_positions;
create trigger set_retirement_positions_updated_at
before update on public.retirement_positions
for each row execute function public.set_updated_at();
