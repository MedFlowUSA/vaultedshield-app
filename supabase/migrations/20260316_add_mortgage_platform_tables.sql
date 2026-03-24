create table if not exists public.mortgage_loans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  mortgage_loan_type_key text not null,
  lender_key text null,
  loan_name text null,
  property_address text null,
  borrower_name text null,
  current_status text not null default 'active',
  origination_date date null,
  maturity_date date null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.mortgage_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mortgage_loan_id uuid not null references public.mortgage_loans(id) on delete cascade,
  asset_document_id uuid null references public.asset_documents(id) on delete set null,
  document_class_key text null,
  lender_key text null,
  document_date date null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.mortgage_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mortgage_loan_id uuid not null references public.mortgage_loans(id) on delete cascade,
  mortgage_document_id uuid null references public.mortgage_documents(id) on delete set null,
  snapshot_type text null,
  snapshot_date date null,
  normalized_mortgage jsonb not null default '{}'::jsonb,
  completeness_assessment jsonb not null default '{}'::jsonb,
  lender_profile jsonb not null default '{}'::jsonb,
  extraction_meta jsonb not null default '{}'::jsonb
);

create table if not exists public.mortgage_analytics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mortgage_loan_id uuid not null references public.mortgage_loans(id) on delete cascade,
  snapshot_id uuid null references public.mortgage_snapshots(id) on delete set null,
  analytics_type text null,
  normalized_intelligence jsonb not null default '{}'::jsonb,
  review_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.mortgage_loans is
'Deep mortgage loan records linked one-to-one with the broad platform assets table. Generic assets remain visible while mortgage-specific structure stays modular.';

comment on table public.mortgage_documents is
'Mortgage-specific document layer that coexists with asset_documents. Generic uploads remain the source of truth for file storage while mortgage_documents carries module-specific classification.';

comment on table public.mortgage_snapshots is
'Normalized mortgage extraction layer for statements, escrow, payoff, and later merged loan views.';

comment on table public.mortgage_analytics is
'Starter mortgage intelligence layer kept separate from retirement analytics and the specialized IUL vaulted_policy_analytics tables.';

create unique index if not exists mortgage_loans_asset_id_unique_idx
  on public.mortgage_loans(asset_id);
create index if not exists mortgage_loans_household_id_idx
  on public.mortgage_loans(household_id);
create index if not exists mortgage_loans_loan_type_key_idx
  on public.mortgage_loans(mortgage_loan_type_key);
create index if not exists mortgage_loans_lender_key_idx
  on public.mortgage_loans(lender_key);
create index if not exists mortgage_loans_current_status_idx
  on public.mortgage_loans(current_status);

create index if not exists mortgage_documents_loan_id_idx
  on public.mortgage_documents(mortgage_loan_id);
create index if not exists mortgage_documents_asset_document_id_idx
  on public.mortgage_documents(asset_document_id);
create index if not exists mortgage_documents_document_class_key_idx
  on public.mortgage_documents(document_class_key);
create index if not exists mortgage_documents_lender_key_idx
  on public.mortgage_documents(lender_key);
create index if not exists mortgage_documents_document_date_idx
  on public.mortgage_documents(document_date);

create index if not exists mortgage_snapshots_loan_id_idx
  on public.mortgage_snapshots(mortgage_loan_id);
create index if not exists mortgage_snapshots_document_id_idx
  on public.mortgage_snapshots(mortgage_document_id);
create index if not exists mortgage_snapshots_snapshot_type_idx
  on public.mortgage_snapshots(snapshot_type);
create index if not exists mortgage_snapshots_snapshot_date_idx
  on public.mortgage_snapshots(snapshot_date);

create index if not exists mortgage_analytics_loan_id_idx
  on public.mortgage_analytics(mortgage_loan_id);
create index if not exists mortgage_analytics_snapshot_id_idx
  on public.mortgage_analytics(snapshot_id);
create index if not exists mortgage_analytics_analytics_type_idx
  on public.mortgage_analytics(analytics_type);

drop trigger if exists set_mortgage_loans_updated_at on public.mortgage_loans;
create trigger set_mortgage_loans_updated_at
before update on public.mortgage_loans
for each row execute function public.set_updated_at();

drop trigger if exists set_mortgage_documents_updated_at on public.mortgage_documents;
create trigger set_mortgage_documents_updated_at
before update on public.mortgage_documents
for each row execute function public.set_updated_at();

drop trigger if exists set_mortgage_snapshots_updated_at on public.mortgage_snapshots;
create trigger set_mortgage_snapshots_updated_at
before update on public.mortgage_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists set_mortgage_analytics_updated_at on public.mortgage_analytics;
create trigger set_mortgage_analytics_updated_at
before update on public.mortgage_analytics
for each row execute function public.set_updated_at();
