create table if not exists public.household_issues (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  module_key text not null,
  issue_type text not null,
  issue_key text not null,
  asset_id uuid null references public.assets(id) on delete cascade,
  record_id text null,
  title text not null,
  summary text null,
  status text not null default 'open',
  severity text not null default 'medium',
  priority text null,
  detection_hash text null,
  source_system text not null default 'household_engine',
  due_at timestamptz null,
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  last_state_changed_at timestamptz not null default now(),
  reopened_at timestamptz null,
  reopened_by uuid null,
  resolved_at timestamptz null,
  resolved_by uuid null,
  ignored_at timestamptz null,
  ignored_by uuid null,
  resolution_reason text null,
  resolution_note text null,
  constraint household_issues_status_check
    check (status in ('open', 'resolved', 'ignored')),
  constraint household_issues_severity_check
    check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  constraint household_issues_priority_check
    check (priority is null or priority in ('high', 'medium', 'low')),
  constraint household_issues_source_system_check
    check (source_system in (
      'household_engine',
      'property_engine',
      'mortgage_engine',
      'insurance_engine',
      'retirement_engine',
      'portal_engine',
      'manual_user'
    ))
);

comment on table public.household_issues is
'Current-state household issue registry for operational review, scoring, and reopen logic.';

create unique index if not exists household_issues_identity_idx
  on public.household_issues(
    household_id,
    module_key,
    issue_type,
    issue_key,
    coalesce(asset_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(record_id, '')
  );

create index if not exists household_issues_household_id_idx
  on public.household_issues(household_id);

create index if not exists household_issues_status_idx
  on public.household_issues(status);

create index if not exists household_issues_module_key_idx
  on public.household_issues(module_key);

create index if not exists household_issues_asset_id_idx
  on public.household_issues(asset_id);

create index if not exists household_issues_last_detected_at_idx
  on public.household_issues(last_detected_at desc);

create index if not exists household_issues_resolved_at_idx
  on public.household_issues(resolved_at desc);

create index if not exists household_issues_reopened_at_idx
  on public.household_issues(reopened_at desc);

drop trigger if exists set_household_issues_updated_at on public.household_issues;
create trigger set_household_issues_updated_at
before update on public.household_issues
for each row execute function public.set_updated_at();

create table if not exists public.household_issue_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  issue_id uuid not null references public.household_issues(id) on delete cascade,
  asset_id uuid null references public.assets(id) on delete cascade,
  module_key text not null,
  issue_type text not null,
  issue_key text not null,
  event_type text not null,
  event_reason text null,
  actor_user_id uuid null,
  detection_hash text null,
  evidence_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  score_before jsonb not null default '{}'::jsonb,
  score_after jsonb not null default '{}'::jsonb,
  constraint household_issue_events_event_type_check
    check (event_type in (
      'detected',
      'updated',
      'resolved',
      'ignored',
      'reopened',
      'reopened_conflict',
      'rescored'
    )),
  constraint household_issue_events_event_reason_check
    check (
      event_reason is null
      or event_reason in (
        'new_document_conflict',
        'missing_field_regression',
        'cross_record_mismatch',
        'stale_review_superseded',
        'manual_reopen'
      )
    )
);

comment on table public.household_issue_events is
'Append-only household issue history for durable workflow memory, reopen analysis, and score explanations.';

create index if not exists household_issue_events_household_id_idx
  on public.household_issue_events(household_id);

create index if not exists household_issue_events_issue_id_idx
  on public.household_issue_events(issue_id);

create index if not exists household_issue_events_asset_id_idx
  on public.household_issue_events(asset_id);

create index if not exists household_issue_events_event_type_idx
  on public.household_issue_events(event_type);

create index if not exists household_issue_events_created_at_idx
  on public.household_issue_events(created_at desc);

create table if not exists public.household_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid not null references public.households(id) on delete cascade,
  scope_type text not null,
  scope_key text not null,
  score_value integer not null,
  score_status text not null,
  explanation jsonb not null default '{}'::jsonb,
  source_event_id uuid null references public.household_issue_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  constraint household_readiness_snapshots_scope_type_check
    check (scope_type in ('household', 'module', 'asset'))
);

comment on table public.household_readiness_snapshots is
'Derived household, module, and asset score snapshots used for trend lines and score-change narratives.';

create index if not exists household_readiness_snapshots_household_id_idx
  on public.household_readiness_snapshots(household_id);

create index if not exists household_readiness_snapshots_scope_idx
  on public.household_readiness_snapshots(scope_type, scope_key);

create index if not exists household_readiness_snapshots_created_at_idx
  on public.household_readiness_snapshots(created_at desc);

create or replace function public.vs_household_issue_event_matches_household(
  target_household_id uuid,
  target_issue_id uuid
)
returns boolean
language sql
stable
as $$
  select
    public.vs_can_access_household(target_household_id)
    and exists (
      select 1
      from public.household_issues issue_row
      where issue_row.id = target_issue_id
        and issue_row.household_id = target_household_id
    );
$$;

alter table if exists public.household_issues enable row level security;
alter table if exists public.household_issue_events enable row level security;
alter table if exists public.household_readiness_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_issues'
      and policyname = 'household_issues account read'
  ) then
    create policy "household_issues account read"
    on public.household_issues
    for select
    to anon, authenticated
    using (public.vs_can_access_household(household_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_issues'
      and policyname = 'household_issues account insert'
  ) then
    create policy "household_issues account insert"
    on public.household_issues
    for insert
    to anon, authenticated
    with check (public.vs_can_access_household(household_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_issues'
      and policyname = 'household_issues account update'
  ) then
    create policy "household_issues account update"
    on public.household_issues
    for update
    to anon, authenticated
    using (public.vs_can_access_household(household_id))
    with check (public.vs_can_access_household(household_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_issues'
      and policyname = 'household_issues account delete'
  ) then
    create policy "household_issues account delete"
    on public.household_issues
    for delete
    to anon, authenticated
    using (public.vs_can_access_household(household_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_issue_events'
      and policyname = 'household_issue_events account read'
  ) then
    create policy "household_issue_events account read"
    on public.household_issue_events
    for select
    to anon, authenticated
    using (public.vs_household_issue_event_matches_household(household_id, issue_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_issue_events'
      and policyname = 'household_issue_events account insert'
  ) then
    create policy "household_issue_events account insert"
    on public.household_issue_events
    for insert
    to anon, authenticated
    with check (public.vs_household_issue_event_matches_household(household_id, issue_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_issue_events'
      and policyname = 'household_issue_events account delete'
  ) then
    create policy "household_issue_events account delete"
    on public.household_issue_events
    for delete
    to anon, authenticated
    using (public.vs_household_issue_event_matches_household(household_id, issue_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_readiness_snapshots'
      and policyname = 'household_readiness_snapshots account read'
  ) then
    create policy "household_readiness_snapshots account read"
    on public.household_readiness_snapshots
    for select
    to anon, authenticated
    using (public.vs_can_access_household(household_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_readiness_snapshots'
      and policyname = 'household_readiness_snapshots account insert'
  ) then
    create policy "household_readiness_snapshots account insert"
    on public.household_readiness_snapshots
    for insert
    to anon, authenticated
    with check (public.vs_can_access_household(household_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_readiness_snapshots'
      and policyname = 'household_readiness_snapshots account update'
  ) then
    create policy "household_readiness_snapshots account update"
    on public.household_readiness_snapshots
    for update
    to anon, authenticated
    using (public.vs_can_access_household(household_id))
    with check (public.vs_can_access_household(household_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_readiness_snapshots'
      and policyname = 'household_readiness_snapshots account delete'
  ) then
    create policy "household_readiness_snapshots account delete"
    on public.household_readiness_snapshots
    for delete
    to anon, authenticated
    using (public.vs_can_access_household(household_id));
  end if;
end $$;
