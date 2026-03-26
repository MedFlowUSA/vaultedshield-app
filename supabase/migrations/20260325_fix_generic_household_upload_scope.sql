alter table if exists public.asset_documents
  alter column asset_id drop not null;

update public.asset_documents
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{document_scope}',
  to_jsonb(case when asset_id is null then 'household' else 'asset' end),
  true
)
where coalesce(metadata ->> 'document_scope', '') = '';

comment on column public.asset_documents.asset_id is
  'Nullable for household-level generic documents. Asset-linked uploads continue to store an asset_id.';
