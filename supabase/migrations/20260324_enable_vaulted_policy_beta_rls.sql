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
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'VaultedShield beta read access'
    ) then
      execute format(
        'create policy "VaultedShield beta read access" on public.%I for select to anon, authenticated using (true)',
        target_table
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'VaultedShield beta write access'
    ) then
      execute format(
        'create policy "VaultedShield beta write access" on public.%I for insert to anon, authenticated with check (true)',
        target_table
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'VaultedShield beta update access'
    ) then
      execute format(
        'create policy "VaultedShield beta update access" on public.%I for update to anon, authenticated using (true) with check (true)',
        target_table
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'VaultedShield beta delete access'
    ) then
      execute format(
        'create policy "VaultedShield beta delete access" on public.%I for delete to anon, authenticated using (true)',
        target_table
      );
    end if;
  end loop;
end $$;
