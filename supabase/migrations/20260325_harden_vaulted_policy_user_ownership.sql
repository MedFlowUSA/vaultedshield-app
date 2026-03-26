do $$
begin
  if exists (
    select 1
    from public.vaulted_policies
    where user_id is null
  ) then
    raise exception 'vaulted_policies still contains null user_id rows. Clean or reassign those rows before applying the hardened ownership migration.';
  end if;
end $$;

drop index if exists public.vaulted_policies_policy_number_carrier_key_idx;

create unique index if not exists vaulted_policies_user_policy_number_carrier_key_idx
  on public.vaulted_policies(user_id, policy_number, carrier_key)
  where policy_number is not null and carrier_key is not null;

alter table if exists public.vaulted_policies
  alter column user_id set not null;

do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vaulted_policies' and policyname = 'vaulted policies account read'
  ) then
    drop policy "vaulted policies account read" on public.vaulted_policies;
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vaulted_policies' and policyname = 'vaulted policies account insert'
  ) then
    drop policy "vaulted policies account insert" on public.vaulted_policies;
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vaulted_policies' and policyname = 'vaulted policies account update'
  ) then
    drop policy "vaulted policies account update" on public.vaulted_policies;
  end if;
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'vaulted_policies' and policyname = 'vaulted policies account delete'
  ) then
    drop policy "vaulted policies account delete" on public.vaulted_policies;
  end if;
end $$;

create policy "vaulted policies account read"
on public.vaulted_policies
for select
to authenticated
using (user_id = auth.uid());

create policy "vaulted policies account insert"
on public.vaulted_policies
for insert
to authenticated
with check (user_id = auth.uid());

create policy "vaulted policies account update"
on public.vaulted_policies
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "vaulted policies account delete"
on public.vaulted_policies
for delete
to authenticated
using (user_id = auth.uid());
