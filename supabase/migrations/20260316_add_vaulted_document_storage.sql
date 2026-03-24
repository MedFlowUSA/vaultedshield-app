alter table if exists public.vaulted_policy_documents
  add column if not exists storage_bucket text null,
  add column if not exists storage_path text null,
  add column if not exists mime_type text null,
  add column if not exists upload_status text null,
  add column if not exists version_label text null,
  add column if not exists parent_document_id uuid null references public.vaulted_policy_documents(id) on delete set null;

create index if not exists vaulted_policy_documents_policy_role_idx
  on public.vaulted_policy_documents(policy_id, document_role);

create index if not exists vaulted_policy_documents_parent_document_id_idx
  on public.vaulted_policy_documents(parent_document_id);

create index if not exists vaulted_policy_documents_storage_path_idx
  on public.vaulted_policy_documents(storage_path);

insert into storage.buckets (id, name, public)
values ('vaulted-policy-files', 'vaulted-policy-files', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'VaultedShield policy file uploads'
  ) then
    create policy "VaultedShield policy file uploads"
      on storage.objects
      for insert
      to anon, authenticated
      with check (bucket_id = 'vaulted-policy-files');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'VaultedShield policy file reads'
  ) then
    create policy "VaultedShield policy file reads"
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'vaulted-policy-files');
  end if;
end $$;
