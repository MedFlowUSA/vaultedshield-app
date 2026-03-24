create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.vaulted_policies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid null,
  policy_number text,
  policy_number_masked text,
  carrier_name text,
  carrier_key text,
  product_name text,
  product_key text,
  policy_type text,
  issue_date date null,
  insured_name text null,
  owner_name text null,
  source_status text not null default 'active'
);

create table if not exists public.vaulted_policy_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  policy_id uuid not null references public.vaulted_policies(id) on delete cascade,
  document_role text,
  document_type text,
  file_name text,
  file_size bigint null,
  statement_date date null,
  page_count integer null,
  carrier_name text null,
  carrier_key text null,
  classification_confidence text null,
  classification_score numeric null,
  raw_text_excerpt text null,
  source_hash text null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.vaulted_policy_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  policy_id uuid not null references public.vaulted_policies(id) on delete cascade,
  document_id uuid null references public.vaulted_policy_documents(id) on delete set null,
  snapshot_type text,
  statement_date date null,
  normalized_policy jsonb not null default '{}'::jsonb,
  extraction_meta jsonb not null default '{}'::jsonb,
  completeness_assessment jsonb not null default '{}'::jsonb,
  carrier_profile jsonb not null default '{}'::jsonb,
  product_profile jsonb not null default '{}'::jsonb,
  strategy_reference_hits jsonb not null default '[]'::jsonb
);

create table if not exists public.vaulted_policy_analytics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  policy_id uuid not null references public.vaulted_policies(id) on delete cascade,
  snapshot_id uuid null references public.vaulted_policy_snapshots(id) on delete set null,
  analytics_type text,
  normalized_analytics jsonb not null default '{}'::jsonb,
  health_score numeric null,
  health_status text null,
  coverage_status text null,
  review_flags jsonb not null default '[]'::jsonb
);

create table if not exists public.vaulted_policy_statements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  policy_id uuid not null references public.vaulted_policies(id) on delete cascade,
  snapshot_id uuid null references public.vaulted_policy_snapshots(id) on delete set null,
  statement_date date null,
  policy_year integer null,
  accumulation_value numeric null,
  cash_value numeric null,
  cash_surrender_value numeric null,
  loan_balance numeric null,
  cost_of_insurance numeric null,
  admin_fee numeric null,
  monthly_deduction numeric null,
  expense_charge numeric null,
  rider_charge numeric null,
  current_index_strategy text null,
  allocation_percent numeric null,
  cap_rate numeric null,
  participation_rate numeric null,
  crediting_rate numeric null,
  spread numeric null,
  indexed_account_value numeric null,
  fixed_account_value numeric null,
  raw_statement_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.carrier_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  carrier_key text unique not null,
  display_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  known_document_patterns jsonb not null default '[]'::jsonb,
  known_charge_labels jsonb not null default '[]'::jsonb,
  known_strategy_labels jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.carrier_strategy_versions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  carrier_key text not null,
  product_key text null,
  strategy_name text not null,
  term_type text not null,
  term_value text not null,
  effective_date date null,
  expiration_date date null,
  source_type text null,
  source_reference text null,
  verification_status text null,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists vaulted_policies_policy_number_carrier_key_idx
  on public.vaulted_policies(policy_number, carrier_key);
create index if not exists vaulted_policy_documents_policy_id_idx on public.vaulted_policy_documents(policy_id);
create index if not exists vaulted_policy_documents_statement_date_idx on public.vaulted_policy_documents(statement_date);
create index if not exists vaulted_policy_documents_carrier_key_idx on public.vaulted_policy_documents(carrier_key);
create index if not exists vaulted_policy_documents_source_hash_idx on public.vaulted_policy_documents(source_hash);
create index if not exists vaulted_policy_snapshots_policy_id_idx on public.vaulted_policy_snapshots(policy_id);
create index if not exists vaulted_policy_snapshots_statement_date_idx on public.vaulted_policy_snapshots(statement_date);
create index if not exists vaulted_policy_analytics_policy_id_idx on public.vaulted_policy_analytics(policy_id);
create index if not exists vaulted_policy_analytics_analytics_type_idx on public.vaulted_policy_analytics(analytics_type);
create index if not exists vaulted_policy_statements_policy_id_idx on public.vaulted_policy_statements(policy_id);
create index if not exists vaulted_policy_statements_statement_date_idx on public.vaulted_policy_statements(statement_date);
create index if not exists vaulted_policy_statements_current_index_strategy_idx on public.vaulted_policy_statements(current_index_strategy);
create index if not exists carrier_profiles_carrier_key_idx on public.carrier_profiles(carrier_key);
create index if not exists carrier_strategy_versions_carrier_key_idx on public.carrier_strategy_versions(carrier_key);
create index if not exists carrier_strategy_versions_product_key_idx on public.carrier_strategy_versions(product_key);

drop trigger if exists set_vaulted_policies_updated_at on public.vaulted_policies;
create trigger set_vaulted_policies_updated_at
before update on public.vaulted_policies
for each row
execute function public.set_updated_at();

insert into public.carrier_profiles (
  carrier_key,
  display_name,
  aliases,
  known_document_patterns,
  known_charge_labels,
  known_strategy_labels,
  metadata
)
values
  (
    'corebridge_aig',
    'American General Life Insurance Company',
    '["american general life insurance company","corebridge financial","agl","us life"]'::jsonb,
    '["policy activity summary by month","your account values and allocation","external indices performance detail"]'::jsonb,
    '["policy cost of insurance","expense charges","rider(s) charges","monthly administration fee"]'::jsonb,
    '["index account strategies","cap rate","participation rate","declared interest account (dia)"]'::jsonb,
    '{}'::jsonb
  ),
  (
    'allianz',
    'Allianz Life Insurance Company of North America',
    '["allianz","allianz life insurance company of north america"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb
  ),
  (
    'nationwide',
    'Nationwide Life Insurance Company',
    '["nationwide","nationwide life insurance company"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb
  ),
  (
    'pacific_life',
    'Pacific Life Insurance Company',
    '["pacific life","pacific life insurance company"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb
  ),
  (
    'lincoln_financial',
    'Lincoln Financial',
    '["lincoln financial","the lincoln national life insurance company","lincoln"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb
  )
on conflict (carrier_key) do update
set
  display_name = excluded.display_name,
  aliases = excluded.aliases,
  known_document_patterns = excluded.known_document_patterns,
  known_charge_labels = excluded.known_charge_labels,
  known_strategy_labels = excluded.known_strategy_labels,
  metadata = excluded.metadata;
