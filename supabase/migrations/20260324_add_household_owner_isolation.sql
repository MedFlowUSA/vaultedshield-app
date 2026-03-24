alter table if exists public.households
  add column if not exists owner_user_id uuid null;

create index if not exists households_owner_user_id_idx
  on public.households(owner_user_id);

update public.households
set owner_user_id = nullif(metadata->>'auth_user_id', '')::uuid
where owner_user_id is null
  and metadata ? 'auth_user_id'
  and nullif(metadata->>'auth_user_id', '') is not null;
