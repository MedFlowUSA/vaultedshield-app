create table if not exists public.asset_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_asset_id uuid not null references public.assets(id) on delete cascade,
  target_asset_id uuid not null references public.assets(id) on delete cascade,
  source_module text null,
  target_module text null,
  source_record_id uuid null,
  target_record_id uuid null,
  relationship_origin text null,
  relationship_key text unique null,
  link_type text not null,
  confidence_score numeric(4,3) not null default 0.800,
  is_primary boolean not null default false,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint asset_links_confidence_score_check
    check (confidence_score >= 0 and confidence_score <= 1),
  constraint asset_links_no_self_reference_check
    check (source_asset_id <> target_asset_id)
);

comment on table public.asset_links is
'Generic household asset graph for cross-module linkage. Property-specific link tables remain the primary domain records while asset_links mirrors those relationships into a reusable platform backbone.';

create index if not exists asset_links_household_id_idx
  on public.asset_links(household_id);

create index if not exists asset_links_source_asset_id_idx
  on public.asset_links(source_asset_id);

create index if not exists asset_links_target_asset_id_idx
  on public.asset_links(target_asset_id);

create index if not exists asset_links_link_type_idx
  on public.asset_links(link_type);

create index if not exists asset_links_relationship_origin_idx
  on public.asset_links(relationship_origin);

create index if not exists asset_links_is_primary_idx
  on public.asset_links(is_primary);

drop trigger if exists set_asset_links_updated_at on public.asset_links;
create trigger set_asset_links_updated_at
before update on public.asset_links
for each row execute function public.set_updated_at();

create or replace function public.vs_asset_link_matches_household(
  target_household_id uuid,
  source_asset_id uuid,
  target_asset_id uuid
)
returns boolean
language sql
stable
as $$
  select
    public.vs_can_access_household(target_household_id)
    and exists (
      select 1
      from public.assets source_asset_row
      where source_asset_row.id = source_asset_id
        and source_asset_row.household_id = target_household_id
    )
    and exists (
      select 1
      from public.assets target_asset_row
      where target_asset_row.id = target_asset_id
        and target_asset_row.household_id = target_household_id
    );
$$;

alter table if exists public.asset_links enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_links'
      and policyname = 'asset_links account read'
  ) then
    create policy "asset_links account read"
    on public.asset_links
    for select
    to anon, authenticated
    using (
      public.vs_asset_link_matches_household(household_id, source_asset_id, target_asset_id)
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_links'
      and policyname = 'asset_links account insert'
  ) then
    create policy "asset_links account insert"
    on public.asset_links
    for insert
    to anon, authenticated
    with check (
      public.vs_asset_link_matches_household(household_id, source_asset_id, target_asset_id)
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_links'
      and policyname = 'asset_links account update'
  ) then
    create policy "asset_links account update"
    on public.asset_links
    for update
    to anon, authenticated
    using (
      public.vs_asset_link_matches_household(household_id, source_asset_id, target_asset_id)
    )
    with check (
      public.vs_asset_link_matches_household(household_id, source_asset_id, target_asset_id)
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_links'
      and policyname = 'asset_links account delete'
  ) then
    create policy "asset_links account delete"
    on public.asset_links
    for delete
    to anon, authenticated
    using (
      public.vs_asset_link_matches_household(household_id, source_asset_id, target_asset_id)
    );
  end if;
end $$;

insert into public.asset_links (
  created_at,
  updated_at,
  household_id,
  source_asset_id,
  target_asset_id,
  source_module,
  target_module,
  source_record_id,
  target_record_id,
  relationship_origin,
  relationship_key,
  link_type,
  confidence_score,
  is_primary,
  notes,
  metadata
)
select
  link.created_at,
  coalesce(link.created_at, now()),
  property.household_id,
  property.asset_id,
  mortgage.asset_id,
  'property',
  'mortgage',
  property.id,
  mortgage.id,
  'property_mortgage',
  'property_mortgage_links:' || link.id::text,
  link.link_type,
  coalesce(nullif(link.metadata->>'confidence_score', '')::numeric, 0.950),
  link.is_primary,
  link.notes,
  jsonb_strip_nulls(
    coalesce(link.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'legacy_table', 'property_mortgage_links',
      'legacy_link_id', link.id,
      'source_record_type', 'property',
      'target_record_type', 'mortgage_loan'
    )
  )
from public.property_mortgage_links link
join public.properties property
  on property.id = link.property_id
join public.mortgage_loans mortgage
  on mortgage.id = link.mortgage_loan_id
where property.asset_id is not null
  and mortgage.asset_id is not null
on conflict (relationship_key) do update
set
  household_id = excluded.household_id,
  source_asset_id = excluded.source_asset_id,
  target_asset_id = excluded.target_asset_id,
  source_module = excluded.source_module,
  target_module = excluded.target_module,
  source_record_id = excluded.source_record_id,
  target_record_id = excluded.target_record_id,
  relationship_origin = excluded.relationship_origin,
  link_type = excluded.link_type,
  confidence_score = excluded.confidence_score,
  is_primary = excluded.is_primary,
  notes = excluded.notes,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.asset_links (
  created_at,
  updated_at,
  household_id,
  source_asset_id,
  target_asset_id,
  source_module,
  target_module,
  source_record_id,
  target_record_id,
  relationship_origin,
  relationship_key,
  link_type,
  confidence_score,
  is_primary,
  notes,
  metadata
)
select
  link.created_at,
  coalesce(link.created_at, now()),
  property.household_id,
  property.asset_id,
  homeowners.asset_id,
  'property',
  'homeowners',
  property.id,
  homeowners.id,
  'property_homeowners',
  'property_homeowners_links:' || link.id::text,
  link.link_type,
  coalesce(nullif(link.metadata->>'confidence_score', '')::numeric, 0.950),
  link.is_primary,
  link.notes,
  jsonb_strip_nulls(
    coalesce(link.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'legacy_table', 'property_homeowners_links',
      'legacy_link_id', link.id,
      'source_record_type', 'property',
      'target_record_type', 'homeowners_policy'
    )
  )
from public.property_homeowners_links link
join public.properties property
  on property.id = link.property_id
join public.homeowners_policies homeowners
  on homeowners.id = link.homeowners_policy_id
where property.asset_id is not null
  and homeowners.asset_id is not null
on conflict (relationship_key) do update
set
  household_id = excluded.household_id,
  source_asset_id = excluded.source_asset_id,
  target_asset_id = excluded.target_asset_id,
  source_module = excluded.source_module,
  target_module = excluded.target_module,
  source_record_id = excluded.source_record_id,
  target_record_id = excluded.target_record_id,
  relationship_origin = excluded.relationship_origin,
  link_type = excluded.link_type,
  confidence_score = excluded.confidence_score,
  is_primary = excluded.is_primary,
  notes = excluded.notes,
  metadata = excluded.metadata,
  updated_at = now();
