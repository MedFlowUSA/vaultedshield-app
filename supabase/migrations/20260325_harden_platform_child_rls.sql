create or replace function public.vs_can_access_asset(target_asset_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.assets a
    where a.id = target_asset_id
      and public.vs_can_access_household(a.household_id)
  );
$$;

create or replace function public.vs_can_access_property(target_property_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = target_property_id
      and public.vs_can_access_household(p.household_id)
  );
$$;

create or replace function public.vs_can_access_mortgage_loan(target_mortgage_loan_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.mortgage_loans m
    where m.id = target_mortgage_loan_id
      and public.vs_can_access_household(m.household_id)
  );
$$;

create or replace function public.vs_can_access_homeowners_policy(target_homeowners_policy_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.homeowners_policies h
    where h.id = target_homeowners_policy_id
      and public.vs_can_access_household(h.household_id)
  );
$$;

create or replace function public.vs_can_access_portal_profile(target_portal_profile_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.portal_profiles p
    where p.id = target_portal_profile_id
      and public.vs_can_access_household(p.household_id)
  );
$$;

alter table if exists public.property_documents enable row level security;
alter table if exists public.property_snapshots enable row level security;
alter table if exists public.property_analytics enable row level security;
alter table if exists public.property_comps enable row level security;
alter table if exists public.property_mortgage_links enable row level security;
alter table if exists public.property_homeowners_links enable row level security;
alter table if exists public.mortgage_documents enable row level security;
alter table if exists public.mortgage_snapshots enable row level security;
alter table if exists public.mortgage_analytics enable row level security;
alter table if exists public.asset_portal_links enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'asset_portal_links',
    'property_documents',
    'property_snapshots',
    'property_analytics',
    'property_comps',
    'mortgage_documents',
    'mortgage_snapshots',
    'mortgage_analytics',
    'property_mortgage_links',
    'property_homeowners_links'
  ]
  loop
    execute format('drop policy if exists "%1$s access read" on public.%1$I', target_table);
    execute format('drop policy if exists "%1$s access insert" on public.%1$I', target_table);
    execute format('drop policy if exists "%1$s access update" on public.%1$I', target_table);
    execute format('drop policy if exists "%1$s access delete" on public.%1$I', target_table);
  end loop;
end $$;

do $$
begin
  create policy "asset_portal_links access read"
  on public.asset_portal_links
  for select
  to anon, authenticated
  using (
    public.vs_can_access_asset(asset_id)
    and public.vs_can_access_portal_profile(portal_profile_id)
  );

  create policy "asset_portal_links access insert"
  on public.asset_portal_links
  for insert
  to anon, authenticated
  with check (
    public.vs_can_access_asset(asset_id)
    and public.vs_can_access_portal_profile(portal_profile_id)
  );

  create policy "asset_portal_links access update"
  on public.asset_portal_links
  for update
  to anon, authenticated
  using (
    public.vs_can_access_asset(asset_id)
    and public.vs_can_access_portal_profile(portal_profile_id)
  )
  with check (
    public.vs_can_access_asset(asset_id)
    and public.vs_can_access_portal_profile(portal_profile_id)
  );

  create policy "asset_portal_links access delete"
  on public.asset_portal_links
  for delete
  to anon, authenticated
  using (
    public.vs_can_access_asset(asset_id)
    and public.vs_can_access_portal_profile(portal_profile_id)
  );
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'property_documents',
    'property_snapshots',
    'property_analytics',
    'property_comps'
  ]
  loop
    execute format(
      'create policy "%1$s access read" on public.%1$I for select to anon, authenticated using (public.vs_can_access_property(property_id))',
      target_table
    );
    execute format(
      'create policy "%1$s access insert" on public.%1$I for insert to anon, authenticated with check (public.vs_can_access_property(property_id))',
      target_table
    );
    execute format(
      'create policy "%1$s access update" on public.%1$I for update to anon, authenticated using (public.vs_can_access_property(property_id)) with check (public.vs_can_access_property(property_id))',
      target_table
    );
    execute format(
      'create policy "%1$s access delete" on public.%1$I for delete to anon, authenticated using (public.vs_can_access_property(property_id))',
      target_table
    );
  end loop;
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'mortgage_documents',
    'mortgage_snapshots',
    'mortgage_analytics'
  ]
  loop
    execute format(
      'create policy "%1$s access read" on public.%1$I for select to anon, authenticated using (public.vs_can_access_mortgage_loan(mortgage_loan_id))',
      target_table
    );
    execute format(
      'create policy "%1$s access insert" on public.%1$I for insert to anon, authenticated with check (public.vs_can_access_mortgage_loan(mortgage_loan_id))',
      target_table
    );
    execute format(
      'create policy "%1$s access update" on public.%1$I for update to anon, authenticated using (public.vs_can_access_mortgage_loan(mortgage_loan_id)) with check (public.vs_can_access_mortgage_loan(mortgage_loan_id))',
      target_table
    );
    execute format(
      'create policy "%1$s access delete" on public.%1$I for delete to anon, authenticated using (public.vs_can_access_mortgage_loan(mortgage_loan_id))',
      target_table
    );
  end loop;
end $$;

do $$
begin
  create policy "property_mortgage_links access read"
  on public.property_mortgage_links
  for select
  to anon, authenticated
  using (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_mortgage_loan(mortgage_loan_id)
  );

  create policy "property_mortgage_links access insert"
  on public.property_mortgage_links
  for insert
  to anon, authenticated
  with check (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_mortgage_loan(mortgage_loan_id)
  );

  create policy "property_mortgage_links access update"
  on public.property_mortgage_links
  for update
  to anon, authenticated
  using (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_mortgage_loan(mortgage_loan_id)
  )
  with check (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_mortgage_loan(mortgage_loan_id)
  );

  create policy "property_mortgage_links access delete"
  on public.property_mortgage_links
  for delete
  to anon, authenticated
  using (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_mortgage_loan(mortgage_loan_id)
  );
end $$;

do $$
begin
  create policy "property_homeowners_links access read"
  on public.property_homeowners_links
  for select
  to anon, authenticated
  using (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_homeowners_policy(homeowners_policy_id)
  );

  create policy "property_homeowners_links access insert"
  on public.property_homeowners_links
  for insert
  to anon, authenticated
  with check (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_homeowners_policy(homeowners_policy_id)
  );

  create policy "property_homeowners_links access update"
  on public.property_homeowners_links
  for update
  to anon, authenticated
  using (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_homeowners_policy(homeowners_policy_id)
  )
  with check (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_homeowners_policy(homeowners_policy_id)
  );

  create policy "property_homeowners_links access delete"
  on public.property_homeowners_links
  for delete
  to anon, authenticated
  using (
    public.vs_can_access_property(property_id)
    and public.vs_can_access_homeowners_policy(homeowners_policy_id)
  );
end $$;
