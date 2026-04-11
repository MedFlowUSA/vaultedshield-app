begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.vaulted_policies vp
    left join auth.users au on au.id = vp.user_id
    where au.id is null
  ) then
    raise exception 'Cannot enforce vaulted policy auth ownership: one or more vaulted_policies.user_id values do not match auth.users.id.';
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vaulted_policies'
      and constraint_name = 'vaulted_policies_user_id_fkey'
  ) then
    alter table public.vaulted_policies
      add constraint vaulted_policies_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'requested',
  completed_at timestamptz null,
  failure_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint account_deletion_requests_status_check
    check (status in ('requested', 'in_progress', 'completed', 'failed'))
);

comment on table public.account_deletion_requests is
'Auditable lifecycle table for in-app user-initiated account deletion requests.';

create index if not exists account_deletion_requests_user_id_idx
  on public.account_deletion_requests(user_id, requested_at desc);

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests(status, requested_at desc);

create unique index if not exists account_deletion_requests_active_user_idx
  on public.account_deletion_requests(user_id)
  where status in ('requested', 'in_progress');

drop trigger if exists set_account_deletion_requests_updated_at on public.account_deletion_requests;
create trigger set_account_deletion_requests_updated_at
before update on public.account_deletion_requests
for each row execute function public.set_updated_at();

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;

drop policy if exists account_deletion_requests_select_own on public.account_deletion_requests;

create policy account_deletion_requests_select_own
on public.account_deletion_requests
for select
to authenticated
using (user_id = auth.uid());

commit;
