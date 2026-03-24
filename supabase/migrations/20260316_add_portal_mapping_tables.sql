create table if not exists public.portal_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  portal_name text not null,
  institution_name text null,
  institution_key text null,
  portal_url text null,
  username_hint text null,
  recovery_contact_hint text null,
  mfa_type text null,
  support_contact text null,
  access_status text not null default 'unknown',
  emergency_relevance boolean not null default false,
  last_verified_at timestamptz null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.asset_portal_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  portal_profile_id uuid not null references public.portal_profiles(id) on delete cascade,
  link_type text null,
  is_primary boolean not null default false,
  notes text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists portal_profiles_household_id_idx on public.portal_profiles(household_id);
create index if not exists portal_profiles_institution_key_idx on public.portal_profiles(institution_key);
create index if not exists portal_profiles_access_status_idx on public.portal_profiles(access_status);

create index if not exists asset_portal_links_asset_id_idx on public.asset_portal_links(asset_id);
create index if not exists asset_portal_links_portal_profile_id_idx on public.asset_portal_links(portal_profile_id);

drop trigger if exists set_portal_profiles_updated_at on public.portal_profiles;
create trigger set_portal_profiles_updated_at
before update on public.portal_profiles
for each row execute function public.set_updated_at();
