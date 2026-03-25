create or replace function public.vs_can_access_household(target_household_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and (
        (auth.uid() is not null and h.owner_user_id = auth.uid())
        or (auth.uid() is null and h.owner_user_id is null)
      )
  );
$$;

create or replace function public.vs_can_access_vaulted_policy(target_policy_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.vaulted_policies p
    where p.id = target_policy_id
      and (
        (auth.uid() is not null and p.user_id = auth.uid())
        or (auth.uid() is null and p.user_id is null)
      )
  );
$$;

alter table if exists public.households enable row level security;
alter table if exists public.household_members enable row level security;
alter table if exists public.contacts enable row level security;
alter table if exists public.assets enable row level security;
alter table if exists public.asset_documents enable row level security;
alter table if exists public.asset_snapshots enable row level security;
alter table if exists public.asset_alerts enable row level security;
alter table if exists public.asset_tasks enable row level security;
alter table if exists public.reports enable row level security;
alter table if exists public.roles_permissions enable row level security;
alter table if exists public.portal_profiles enable row level security;
alter table if exists public.portal_asset_links enable row level security;
alter table if exists public.properties enable row level security;
alter table if exists public.property_stack_analytics enable row level security;
alter table if exists public.property_valuations enable row level security;
alter table if exists public.property_valuation_events enable row level security;
alter table if exists public.mortgage_loans enable row level security;
alter table if exists public.homeowners_policies enable row level security;
alter table if exists public.auto_policies enable row level security;
alter table if exists public.health_plans enable row level security;
alter table if exists public.retirement_accounts enable row level security;
alter table if exists public.warranties enable row level security;
alter table if exists public.vaulted_policies enable row level security;
alter table if exists public.vaulted_policy_documents enable row level security;
alter table if exists public.vaulted_policy_snapshots enable row level security;
alter table if exists public.vaulted_policy_analytics enable row level security;
alter table if exists public.vaulted_policy_statements enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'vaulted_policies',
    'vaulted_policy_documents',
    'vaulted_policy_snapshots',
    'vaulted_policy_analytics',
    'vaulted_policy_statements'
  ]
  loop
    execute format('drop policy if exists "VaultedShield beta read access" on public.%I', target_table);
    execute format('drop policy if exists "VaultedShield beta write access" on public.%I', target_table);
    execute format('drop policy if exists "VaultedShield beta update access" on public.%I', target_table);
    execute format('drop policy if exists "VaultedShield beta delete access" on public.%I', target_table);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'households' and policyname = 'households account read'
  ) then
    create policy "households account read"
    on public.households
    for select
    to anon, authenticated
    using (
      (auth.uid() is not null and owner_user_id = auth.uid())
      or (auth.uid() is null and owner_user_id is null)
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'households' and policyname = 'households account insert'
  ) then
    create policy "households account insert"
    on public.households
    for insert
    to anon, authenticated
    with check (
      (auth.uid() is not null and owner_user_id = auth.uid())
      or (auth.uid() is null and owner_user_id is null)
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'households' and policyname = 'households account update'
  ) then
    create policy "households account update"
    on public.households
    for update
    to anon, authenticated
    using (
      (auth.uid() is not null and owner_user_id = auth.uid())
      or (auth.uid() is null and owner_user_id is null)
    )
    with check (
      (auth.uid() is not null and owner_user_id = auth.uid())
      or (auth.uid() is null and owner_user_id is null)
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'households' and policyname = 'households account delete'
  ) then
    create policy "households account delete"
    on public.households
    for delete
    to anon, authenticated
    using (
      (auth.uid() is not null and owner_user_id = auth.uid())
      or (auth.uid() is null and owner_user_id is null)
    );
  end if;
end $$;

do $$
declare
  household_table text;
  policy_prefix text;
begin
  foreach household_table in array array[
    'household_members',
    'contacts',
    'assets',
    'asset_documents',
    'asset_snapshots',
    'asset_alerts',
    'asset_tasks',
    'reports',
    'roles_permissions',
    'portal_profiles',
    'portal_asset_links',
    'properties',
    'property_stack_analytics',
    'property_valuations',
    'property_valuation_events',
    'mortgage_loans',
    'homeowners_policies',
    'auto_policies',
    'health_plans',
    'retirement_accounts',
    'warranties'
  ]
  loop
    policy_prefix := household_table || ' account';

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = household_table and policyname = policy_prefix || ' read'
    ) then
      execute format(
        'create policy "%1$s read" on public.%2$I for select to anon, authenticated using (public.vs_can_access_household(household_id))',
        policy_prefix,
        household_table
      );
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = household_table and policyname = policy_prefix || ' insert'
    ) then
      execute format(
        'create policy "%1$s insert" on public.%2$I for insert to anon, authenticated with check (public.vs_can_access_household(household_id))',
        policy_prefix,
        household_table
      );
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = household_table and policyname = policy_prefix || ' update'
    ) then
      execute format(
        'create policy "%1$s update" on public.%2$I for update to anon, authenticated using (public.vs_can_access_household(household_id)) with check (public.vs_can_access_household(household_id))',
        policy_prefix,
        household_table
      );
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = household_table and policyname = policy_prefix || ' delete'
    ) then
      execute format(
        'create policy "%1$s delete" on public.%2$I for delete to anon, authenticated using (public.vs_can_access_household(household_id))',
        policy_prefix,
        household_table
      );
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vaulted_policies' and policyname = 'vaulted policies account read'
  ) then
    create policy "vaulted policies account read"
    on public.vaulted_policies
    for select
    to anon, authenticated
    using (
      (auth.uid() is not null and user_id = auth.uid())
      or (auth.uid() is null and user_id is null)
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vaulted_policies' and policyname = 'vaulted policies account insert'
  ) then
    create policy "vaulted policies account insert"
    on public.vaulted_policies
    for insert
    to anon, authenticated
    with check (
      (auth.uid() is not null and user_id = auth.uid())
      or (auth.uid() is null and user_id is null)
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vaulted_policies' and policyname = 'vaulted policies account update'
  ) then
    create policy "vaulted policies account update"
    on public.vaulted_policies
    for update
    to anon, authenticated
    using (
      (auth.uid() is not null and user_id = auth.uid())
      or (auth.uid() is null and user_id is null)
    )
    with check (
      (auth.uid() is not null and user_id = auth.uid())
      or (auth.uid() is null and user_id is null)
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vaulted_policies' and policyname = 'vaulted policies account delete'
  ) then
    create policy "vaulted policies account delete"
    on public.vaulted_policies
    for delete
    to anon, authenticated
    using (
      (auth.uid() is not null and user_id = auth.uid())
      or (auth.uid() is null and user_id is null)
    );
  end if;
end $$;

do $$
declare
  policy_table text;
  policy_prefix text;
begin
  foreach policy_table in array array[
    'vaulted_policy_documents',
    'vaulted_policy_snapshots',
    'vaulted_policy_analytics',
    'vaulted_policy_statements'
  ]
  loop
    policy_prefix := policy_table || ' account';

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = policy_table and policyname = policy_prefix || ' read'
    ) then
      execute format(
        'create policy "%1$s read" on public.%2$I for select to anon, authenticated using (public.vs_can_access_vaulted_policy(policy_id))',
        policy_prefix,
        policy_table
      );
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = policy_table and policyname = policy_prefix || ' insert'
    ) then
      execute format(
        'create policy "%1$s insert" on public.%2$I for insert to anon, authenticated with check (public.vs_can_access_vaulted_policy(policy_id))',
        policy_prefix,
        policy_table
      );
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = policy_table and policyname = policy_prefix || ' update'
    ) then
      execute format(
        'create policy "%1$s update" on public.%2$I for update to anon, authenticated using (public.vs_can_access_vaulted_policy(policy_id)) with check (public.vs_can_access_vaulted_policy(policy_id))',
        policy_prefix,
        policy_table
      );
    end if;

    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = policy_table and policyname = policy_prefix || ' delete'
    ) then
      execute format(
        'create policy "%1$s delete" on public.%2$I for delete to anon, authenticated using (public.vs_can_access_vaulted_policy(policy_id))',
        policy_prefix,
        policy_table
      );
    end if;
  end loop;
end $$;
