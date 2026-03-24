alter table if exists public.asset_documents
  alter column asset_id drop not null;

insert into storage.buckets (id, name, public)
values ('vaulted-platform-documents', 'vaulted-platform-documents', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'VaultedShield platform document uploads'
  ) then
    create policy "VaultedShield platform document uploads"
      on storage.objects
      for insert
      to anon, authenticated
      with check (bucket_id = 'vaulted-platform-documents');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'VaultedShield platform document reads'
  ) then
    create policy "VaultedShield platform document reads"
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'vaulted-platform-documents');
  end if;
end $$;
