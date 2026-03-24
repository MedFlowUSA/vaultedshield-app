create table if not exists public.property_stack_analytics (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_id uuid not null unique references public.properties(id) on delete cascade,
  linkage_status text null,
  has_mortgage boolean not null default false,
  has_homeowners boolean not null default false,
  mortgage_link_count integer not null default 0,
  homeowners_link_count integer not null default 0,
  primary_mortgage_loan_id uuid null references public.mortgage_loans(id) on delete set null,
  primary_homeowners_policy_id uuid null references public.homeowners_policies(id) on delete set null,
  review_flags jsonb not null default '[]'::jsonb,
  prompts jsonb not null default '[]'::jsonb,
  completeness_score numeric null,
  continuity_status text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_stack_analytics_household_id_idx
on public.property_stack_analytics(household_id);

create index if not exists property_stack_analytics_property_id_idx
on public.property_stack_analytics(property_id);

create index if not exists property_stack_analytics_linkage_status_idx
on public.property_stack_analytics(linkage_status);

create index if not exists property_stack_analytics_continuity_status_idx
on public.property_stack_analytics(continuity_status);

drop trigger if exists set_property_stack_analytics_updated_at on public.property_stack_analytics;
create trigger set_property_stack_analytics_updated_at
before update on public.property_stack_analytics
for each row
execute function public.set_updated_at();
