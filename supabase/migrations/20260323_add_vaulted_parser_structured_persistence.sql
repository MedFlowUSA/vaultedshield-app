alter table if exists public.vaulted_policy_snapshots
  add column if not exists parser_version text null,
  add column if not exists parser_structured_data jsonb null;

comment on column public.vaulted_policy_snapshots.parser_version is
'Version tag for persisted parser payloads. Null for legacy snapshots.';

comment on column public.vaulted_policy_snapshots.parser_structured_data is
'Structured carrier-aware parser output persisted as JSONB for versioned readback.';
