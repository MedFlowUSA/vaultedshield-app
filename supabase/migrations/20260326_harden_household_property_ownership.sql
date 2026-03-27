begin;

update public.households
set owner_user_id = nullif(metadata->>'auth_user_id', '')::uuid
where owner_user_id is null
  and metadata ? 'auth_user_id'
  and nullif(metadata->>'auth_user_id', '') is not null;

do $$
declare
  orphan_count integer;
begin
  select count(*) into orphan_count
  from public.households
  where owner_user_id is null;

  if orphan_count > 0 then
    raise exception 'Cannot harden household/property ownership: % household rows still have owner_user_id = null', orphan_count;
  end if;
end $$;

alter table public.households
  alter column owner_user_id set not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'households'
      and constraint_name = 'households_owner_user_id_fkey'
  ) then
    alter table public.households
      add constraint households_owner_user_id_fkey
      foreign key (owner_user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

create or replace function public.vs_can_access_household(target_household_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.owner_user_id = auth.uid()
  );
$$;

alter table public.households enable row level security;
alter table public.properties enable row level security;
alter table public.property_documents enable row level security;
alter table public.property_snapshots enable row level security;
alter table public.property_analytics enable row level security;

alter table public.households force row level security;
alter table public.properties force row level security;
alter table public.property_documents force row level security;
alter table public.property_snapshots force row level security;
alter table public.property_analytics force row level security;

drop policy if exists "households account read" on public.households;
drop policy if exists "households account insert" on public.households;
drop policy if exists "households account update" on public.households;
drop policy if exists "households account delete" on public.households;
drop policy if exists households_select_own on public.households;
drop policy if exists households_insert_own on public.households;
drop policy if exists households_update_own on public.households;
drop policy if exists households_delete_own on public.households;

create policy households_select_own
on public.households
for select
to authenticated
using (owner_user_id = auth.uid());

create policy households_insert_own
on public.households
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy households_update_own
on public.households
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy households_delete_own
on public.households
for delete
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "properties account read" on public.properties;
drop policy if exists "properties account insert" on public.properties;
drop policy if exists "properties account update" on public.properties;
drop policy if exists "properties account delete" on public.properties;
drop policy if exists properties_scoped_access on public.properties;
drop policy if exists properties_select_scoped on public.properties;
drop policy if exists properties_insert_scoped on public.properties;
drop policy if exists properties_update_scoped on public.properties;
drop policy if exists properties_delete_scoped on public.properties;

create policy properties_scoped_access
on public.properties
for all
to authenticated
using (public.vs_can_access_household(household_id))
with check (public.vs_can_access_household(household_id));

drop policy if exists "property_documents access read" on public.property_documents;
drop policy if exists "property_documents access insert" on public.property_documents;
drop policy if exists "property_documents access update" on public.property_documents;
drop policy if exists "property_documents access delete" on public.property_documents;
drop policy if exists "property_snapshots access read" on public.property_snapshots;
drop policy if exists "property_snapshots access insert" on public.property_snapshots;
drop policy if exists "property_snapshots access update" on public.property_snapshots;
drop policy if exists "property_snapshots access delete" on public.property_snapshots;
drop policy if exists "property_analytics access read" on public.property_analytics;
drop policy if exists "property_analytics access insert" on public.property_analytics;
drop policy if exists "property_analytics access update" on public.property_analytics;
drop policy if exists "property_analytics access delete" on public.property_analytics;
drop policy if exists property_documents_scoped_access on public.property_documents;
drop policy if exists property_snapshots_scoped_access on public.property_snapshots;
drop policy if exists property_analytics_scoped_access on public.property_analytics;
drop policy if exists "property_documents scoped access" on public.property_documents;
drop policy if exists "property_snapshots scoped access" on public.property_snapshots;
drop policy if exists "property_analytics scoped access" on public.property_analytics;

create policy property_documents_scoped_access
on public.property_documents
for all
to authenticated
using (public.vs_can_access_property(property_id))
with check (public.vs_can_access_property(property_id));

create policy property_snapshots_scoped_access
on public.property_snapshots
for all
to authenticated
using (public.vs_can_access_property(property_id))
with check (public.vs_can_access_property(property_id));

create policy property_analytics_scoped_access
on public.property_analytics
for all
to authenticated
using (public.vs_can_access_property(property_id))
with check (public.vs_can_access_property(property_id));

commit;
