-- Production hardening: household and uploaded-document data must always belong
-- to the active authenticated account. Existing rows are preserved so they can
-- be reviewed/reassigned by an administrator before any separate cleanup.

create or replace function public.vs_can_access_household(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.households h
      where h.id = target_household_id
        and h.owner_user_id = auth.uid()
    );
$$;

create or replace function public.vs_can_access_vaulted_policy(target_policy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.vaulted_policies p
      where p.id = target_policy_id
        and p.user_id = auth.uid()
    );
$$;

drop policy if exists "households account read" on public.households;
drop policy if exists "households account insert" on public.households;
drop policy if exists "households account update" on public.households;
drop policy if exists "households account delete" on public.households;

create policy "households account read"
on public.households for select to authenticated
using (owner_user_id = auth.uid());

create policy "households account insert"
on public.households for insert to authenticated
with check (owner_user_id = auth.uid());

create policy "households account update"
on public.households for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "households account delete"
on public.households for delete to authenticated
using (owner_user_id = auth.uid());

update storage.buckets
set public = false
where id in ('vaulted-policy-files', 'vaulted-platform-documents');

drop policy if exists "VaultedShield policy file uploads" on storage.objects;
drop policy if exists "VaultedShield policy file reads" on storage.objects;
drop policy if exists "VaultedShield policy file updates" on storage.objects;
drop policy if exists "VaultedShield policy file deletes" on storage.objects;
drop policy if exists "VaultedShield platform document uploads" on storage.objects;
drop policy if exists "VaultedShield platform document reads" on storage.objects;
drop policy if exists "VaultedShield platform document updates" on storage.objects;
drop policy if exists "VaultedShield platform document deletes" on storage.objects;

create policy "VaultedShield policy file uploads"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vaulted-policy-files'
  and public.vs_can_access_vaulted_policy(((storage.foldername(name))[1])::uuid)
);

create policy "VaultedShield policy file reads"
on storage.objects for select to authenticated
using (
  bucket_id = 'vaulted-policy-files'
  and public.vs_can_access_vaulted_policy(((storage.foldername(name))[1])::uuid)
);

create policy "VaultedShield policy file deletes"
on storage.objects for delete to authenticated
using (
  bucket_id = 'vaulted-policy-files'
  and public.vs_can_access_vaulted_policy(((storage.foldername(name))[1])::uuid)
);

create policy "VaultedShield platform document uploads"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vaulted-platform-documents'
  and public.vs_can_access_household(((storage.foldername(name))[1])::uuid)
);

create policy "VaultedShield platform document reads"
on storage.objects for select to authenticated
using (
  bucket_id = 'vaulted-platform-documents'
  and public.vs_can_access_household(((storage.foldername(name))[1])::uuid)
);

create policy "VaultedShield platform document deletes"
on storage.objects for delete to authenticated
using (
  bucket_id = 'vaulted-platform-documents'
  and public.vs_can_access_household(((storage.foldername(name))[1])::uuid)
);

revoke execute on function public.vs_can_access_household(uuid) from anon;
revoke execute on function public.vs_can_access_vaulted_policy(uuid) from anon;
grant execute on function public.vs_can_access_household(uuid) to authenticated;
grant execute on function public.vs_can_access_vaulted_policy(uuid) to authenticated;
