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

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_name text not null,
  household_status text not null default 'active',
  notes text null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  full_name text not null,
  role_type text null,
  relationship_label text null,
  email text null,
  phone text null,
  date_of_birth date null,
  is_primary boolean not null default false,
  is_emergency_contact boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid null references public.households(id) on delete cascade,
  full_name text not null,
  contact_type text null,
  organization_name text null,
  email text null,
  phone text null,
  address text null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_category text not null,
  asset_subcategory text null,
  asset_name text not null,
  institution_name text null,
  institution_key text null,
  owner_member_id uuid null references public.household_members(id) on delete set null,
  status text not null default 'active',
  summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.asset_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  document_role text null,
  document_type text null,
  file_name text null,
  mime_type text null,
  storage_bucket text null,
  storage_path text null,
  source_hash text null,
  processing_status text not null default 'uploaded',
  notes text null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  snapshot_type text null,
  snapshot_date date null,
  extracted_data jsonb not null default '{}'::jsonb,
  completeness_assessment jsonb not null default '{}'::jsonb,
  ai_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.asset_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  asset_id uuid null references public.assets(id) on delete cascade,
  household_id uuid null references public.households(id) on delete cascade,
  severity text not null default 'info',
  alert_type text not null,
  title text not null,
  description text null,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.asset_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid null references public.assets(id) on delete cascade,
  assigned_contact_id uuid null references public.contacts(id) on delete set null,
  task_type text null,
  title text not null,
  description text null,
  due_date date null,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid null references public.assets(id) on delete cascade,
  report_type text not null,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  storage_bucket text null,
  storage_path text null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.institution_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  institution_key text unique not null,
  display_name text not null,
  institution_type text not null,
  aliases jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.roles_permissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid null references public.household_members(id) on delete cascade,
  contact_id uuid null references public.contacts(id) on delete cascade,
  role_name text not null,
  permission_scope jsonb not null default '{}'::jsonb,
  status text not null default 'active'
);

comment on table public.assets is
'Broad platform asset registry. Life insurance assets can live here generically while deep IUL intelligence remains in vaulted_policies and related specialized tables.';

comment on table public.asset_snapshots is
'Generic snapshot layer for non-IUL modules and lighter shell modules. Specialized life-policy analytics continue to live in vaulted_policy_snapshots and vaulted_policy_analytics.';

create index if not exists households_status_idx on public.households(household_status);

create index if not exists household_members_household_id_idx on public.household_members(household_id);
create index if not exists household_members_role_type_idx on public.household_members(role_type);
create index if not exists household_members_is_primary_idx on public.household_members(is_primary);

create index if not exists contacts_household_id_idx on public.contacts(household_id);
create index if not exists contacts_contact_type_idx on public.contacts(contact_type);

create index if not exists assets_household_id_idx on public.assets(household_id);
create index if not exists assets_asset_category_idx on public.assets(asset_category);
create index if not exists assets_asset_subcategory_idx on public.assets(asset_subcategory);
create index if not exists assets_status_idx on public.assets(status);
create index if not exists assets_owner_member_id_idx on public.assets(owner_member_id);
create index if not exists assets_institution_key_idx on public.assets(institution_key);

create index if not exists asset_documents_asset_id_idx on public.asset_documents(asset_id);
create index if not exists asset_documents_household_id_idx on public.asset_documents(household_id);
create index if not exists asset_documents_source_hash_idx on public.asset_documents(source_hash);
create index if not exists asset_documents_processing_status_idx on public.asset_documents(processing_status);

create index if not exists asset_snapshots_asset_id_idx on public.asset_snapshots(asset_id);
create index if not exists asset_snapshots_household_id_idx on public.asset_snapshots(household_id);
create index if not exists asset_snapshots_snapshot_date_idx on public.asset_snapshots(snapshot_date);

create index if not exists asset_alerts_asset_id_idx on public.asset_alerts(asset_id);
create index if not exists asset_alerts_household_id_idx on public.asset_alerts(household_id);
create index if not exists asset_alerts_status_idx on public.asset_alerts(status);
create index if not exists asset_alerts_severity_idx on public.asset_alerts(severity);

create index if not exists asset_tasks_household_id_idx on public.asset_tasks(household_id);
create index if not exists asset_tasks_asset_id_idx on public.asset_tasks(asset_id);
create index if not exists asset_tasks_assigned_contact_id_idx on public.asset_tasks(assigned_contact_id);
create index if not exists asset_tasks_due_date_idx on public.asset_tasks(due_date);
create index if not exists asset_tasks_status_idx on public.asset_tasks(status);

create index if not exists reports_household_id_idx on public.reports(household_id);
create index if not exists reports_asset_id_idx on public.reports(asset_id);
create index if not exists reports_report_type_idx on public.reports(report_type);

create index if not exists institution_profiles_institution_type_idx on public.institution_profiles(institution_type);
create index if not exists institution_profiles_institution_key_idx on public.institution_profiles(institution_key);

create index if not exists roles_permissions_household_id_idx on public.roles_permissions(household_id);
create index if not exists roles_permissions_member_id_idx on public.roles_permissions(member_id);
create index if not exists roles_permissions_contact_id_idx on public.roles_permissions(contact_id);
create index if not exists roles_permissions_status_idx on public.roles_permissions(status);

drop trigger if exists set_households_updated_at on public.households;
create trigger set_households_updated_at
before update on public.households
for each row execute function public.set_updated_at();

drop trigger if exists set_household_members_updated_at on public.household_members;
create trigger set_household_members_updated_at
before update on public.household_members
for each row execute function public.set_updated_at();

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists set_assets_updated_at on public.assets;
create trigger set_assets_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

drop trigger if exists set_asset_documents_updated_at on public.asset_documents;
create trigger set_asset_documents_updated_at
before update on public.asset_documents
for each row execute function public.set_updated_at();

insert into public.institution_profiles (institution_key, display_name, institution_type, aliases, metadata)
values
  ('corebridge_aig', 'American General Life Insurance Company', 'carrier', '["American General Life Insurance Company","Corebridge Financial"]'::jsonb, '{"source":"seed"}'::jsonb),
  ('allianz', 'Allianz', 'carrier', '["Allianz"]'::jsonb, '{"source":"seed"}'::jsonb),
  ('nationwide', 'Nationwide', 'carrier', '["Nationwide"]'::jsonb, '{"source":"seed"}'::jsonb),
  ('pacific_life', 'Pacific Life', 'carrier', '["Pacific Life"]'::jsonb, '{"source":"seed"}'::jsonb),
  ('lincoln_financial', 'Lincoln Financial', 'carrier', '["Lincoln Financial","Lincoln"]'::jsonb, '{"source":"seed"}'::jsonb)
on conflict (institution_key) do nothing;
