create table if not exists public.property_mortgage_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  mortgage_loan_id uuid not null references public.mortgage_loans(id) on delete cascade,
  link_type text not null default 'primary_financing',
  is_primary boolean not null default true,
  notes text null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.property_homeowners_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property_id uuid not null references public.properties(id) on delete cascade,
  homeowners_policy_id uuid not null references public.homeowners_policies(id) on delete cascade,
  link_type text not null default 'primary_property_coverage',
  is_primary boolean not null default true,
  notes text null,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists property_mortgage_links_exact_relationship_idx
on public.property_mortgage_links(property_id, mortgage_loan_id, link_type);

create unique index if not exists property_homeowners_links_exact_relationship_idx
on public.property_homeowners_links(property_id, homeowners_policy_id, link_type);

create index if not exists property_mortgage_links_property_id_idx
on public.property_mortgage_links(property_id);

create index if not exists property_mortgage_links_mortgage_loan_id_idx
on public.property_mortgage_links(mortgage_loan_id);

create index if not exists property_mortgage_links_is_primary_idx
on public.property_mortgage_links(is_primary);

create index if not exists property_homeowners_links_property_id_idx
on public.property_homeowners_links(property_id);

create index if not exists property_homeowners_links_homeowners_policy_id_idx
on public.property_homeowners_links(homeowners_policy_id);

create index if not exists property_homeowners_links_is_primary_idx
on public.property_homeowners_links(is_primary);
