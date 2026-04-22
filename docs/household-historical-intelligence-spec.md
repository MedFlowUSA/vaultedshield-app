# Household Historical Intelligence Spec

VaultedShield now has the right product direction for reviewed work:

- reviewed items can be held out of active priority
- recent wins can lift the visible household read
- Reports can reflect more than the raw live queue

The next step is to turn that behavior into a durable intelligence layer instead of a reporting adapter.

## Goal

Make workflow memory persist, rescore, explain, and reopen from evidence so the app can tell a coherent household-improvement story over time.

Success state:

- the system remembers completed work across sessions and devices
- household and module scores change when issues are resolved or reopened
- users can see why a score changed
- new conflicting evidence can reopen a previously resolved issue automatically

## Current state in the codebase

The app already has most of the product seams needed for this layer:

- Queue workflow state and digest logic live in `src/lib/domain/platformIntelligence/reviewWorkflowState.js`
- Workflow-aware score lift and reviewed-item filtering live in `src/lib/domain/platformIntelligence/workflowMemory.js`
- Household scoring and top priorities live in `src/lib/domain/platformIntelligence/householdOperatingSystem.js`
- Household report generation lives in `src/lib/domain/platformIntelligence/householdIntelligenceEngine.js`
- Reports consumes workflow-aware context in `src/pages/ReportsPage.jsx`
- Insurance portfolio intelligence lives in `src/pages/InsuranceIntelligencePage.jsx`
- Current issue persistence helpers live in `src/lib/supabase/issueData.js`

Important gap:

- `issueData.js` already assumes a `household_issues` table exists
- there is no matching `household_issues` migration in `supabase/migrations`
- `reviewWorkflowState.js` still stores reviewed/follow-up state in local storage, so workflow memory is not durable today

## Product requirements

The historical intelligence layer must support:

1. Persistent resolution history by issue type and asset
2. Automatic readiness rescoring at the household and module level
3. "Why your score changed" explanations
4. Reopened issue detection when new evidence conflicts with a previous resolution

## Delivery strategy

Build this in four passes:

1. Establish persistent issue state and event history in Supabase
2. Move workflow memory from local storage to persisted issue-backed state
3. Replace flat score bonuses with event-driven rescoring
4. Expose score-change explanations and conflict-based reopen logic in Reports, Review Workspace, and Insurance

That order keeps the system from adding new UI logic on top of a temporary storage layer.

## Data model

### 1. `household_issues`

Create the current-state table that `src/lib/supabase/issueData.js` already expects.

Recommended migration:

- `supabase/migrations/20260416_add_household_issue_tables.sql`

Recommended columns:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `household_id uuid not null references public.households(id) on delete cascade`
- `module_key text not null`
- `issue_type text not null`
- `issue_key text not null`
- `asset_id uuid null references public.assets(id) on delete cascade`
- `record_id text null`
- `title text not null`
- `summary text null`
- `status text not null default 'open'`
- `severity text not null default 'medium'`
- `priority text null`
- `detection_hash text null`
- `source_system text not null default 'household_engine'`
- `due_at timestamptz null`
- `evidence jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `first_detected_at timestamptz not null default now()`
- `last_detected_at timestamptz not null default now()`
- `last_state_changed_at timestamptz not null default now()`
- `reopened_at timestamptz null`
- `reopened_by uuid null`
- `resolved_at timestamptz null`
- `resolved_by uuid null`
- `ignored_at timestamptz null`
- `ignored_by uuid null`
- `resolution_reason text null`
- `resolution_note text null`

Recommended constraints and indexes:

- unique identity index on `(household_id, module_key, issue_type, issue_key, coalesce(asset_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(record_id, ''))`
- indexes on `household_id`, `status`, `module_key`, `asset_id`, `last_detected_at`, `resolved_at`, `reopened_at`

### 2. `household_issue_events`

Create an append-only event log for historical intelligence.

Recommended columns:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `household_id uuid not null references public.households(id) on delete cascade`
- `issue_id uuid not null references public.household_issues(id) on delete cascade`
- `asset_id uuid null references public.assets(id) on delete cascade`
- `module_key text not null`
- `issue_type text not null`
- `issue_key text not null`
- `event_type text not null`
- `event_reason text null`
- `actor_user_id uuid null`
- `detection_hash text null`
- `evidence_summary jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `score_before jsonb not null default '{}'::jsonb`
- `score_after jsonb not null default '{}'::jsonb`

Recommended event types:

- `detected`
- `updated`
- `resolved`
- `ignored`
- `reopened`
- `reopened_conflict`
- `rescored`

Recommended reopen reasons:

- `new_document_conflict`
- `missing_field_regression`
- `cross_record_mismatch`
- `stale_review_superseded`
- `manual_reopen`

### 3. `household_readiness_snapshots`

Create a lightweight snapshot table for narrative and trend views.

Recommended columns:

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `household_id uuid not null references public.households(id) on delete cascade`
- `scope_type text not null`
- `scope_key text not null`
- `score_value integer not null`
- `score_status text not null`
- `explanation jsonb not null default '{}'::jsonb`
- `source_event_id uuid null references public.household_issue_events(id) on delete set null`
- `metadata jsonb not null default '{}'::jsonb`

Recommended scope types:

- `household`
- `module`
- `asset`

This table is the cleanest way to support:

- 30-day score change
- module trend rows
- score-change explanations
- advisor/export packet narratives

## Row-level security

Match the existing household-owned RLS pattern used in `supabase/migrations/20260324_add_account_isolation_rls.sql`.

Add:

- `alter table if exists public.household_issues enable row level security`
- `alter table if exists public.household_issue_events enable row level security`
- `alter table if exists public.household_readiness_snapshots enable row level security`

Use `public.vs_can_access_household(household_id)` for select/insert/update/delete policies.

## Source-of-truth strategy

Do not keep long-term dual workflow state in both local storage and Supabase.

Target source of truth:

- `household_issues` stores current issue state
- `household_issue_events` stores history
- `household_readiness_snapshots` stores derived score snapshots

Short transition:

- keep local storage reads as a fallback adapter only
- once issue-backed workflow state is live, stop writing reviewed state to local storage

## Application changes

### `src/lib/domain/issues/issueTypes.js`

Add:

- issue event type constants
- reopen reason constants
- validation helpers for event types and reopen reasons

Keep existing status/severity/priority validation intact.

### `src/lib/supabase/issueData.js`

Extend this file from a current-state helper into an issue-history gateway.

Add:

- `appendHouseholdIssueEvent(issueId, eventInput, options)`
- `listHouseholdIssueEvents({ householdId, issueId, assetId, moduleKey, limit }, options)`
- `listIssueHistoryForAsset(assetId, options)`
- `listRecentResolvedIssuesForHousehold(householdId, options)`
- `listRecentReopenedIssuesForHousehold(householdId, options)`

Update:

- `upsertHouseholdIssue()` should append `detected`, `updated`, or `reopened` events
- `resolveHouseholdIssue()` should append a `resolved` event
- `ignoreHouseholdIssue()` should append an `ignored` event
- `reopenHouseholdIssue()` should append a `reopened` event with reason

Important rule:

- event writes should happen in the same logical action path as issue-row writes so history never lags the current row

### `src/lib/domain/platformIntelligence/reviewWorkflowState.js`

This file currently persists workflow memory in local storage.

Refactor target:

- use persisted issue state as the primary source
- keep the queue-item annotation helpers, because the UI still needs normalized workflow fields
- treat local storage as migration fallback only

Recommended change:

- replace `getHouseholdReviewWorkflowState()` and `saveHouseholdReviewWorkflowState()` with a Supabase-backed adapter
- preserve `annotateReviewWorkflowItems()` but let it consume normalized persisted issue rows instead of raw local storage blobs

### `src/lib/domain/platformIntelligence/reviewWorkspaceData.js`

Update queue construction so every review row can be matched to a durable issue identity.

Use:

- `workflow_resolution_filters`
- `workflow_resolution_key`
- issue identity fields from `issueData.js`

Goal:

- no important review item should exist only as an anonymous UI row if it is meant to participate in history, reopening, or rescoring

### `src/lib/domain/platformIntelligence/workflowMemory.js`

Replace the flat resolution bonus with weighted scoring.

Current behavior:

- resolved counts add a simple bonus to focus areas and overall score

Target behavior:

- resolved issues increase readiness based on severity, module importance, and recency
- reopened issues reduce readiness
- repeated reopen cycles reduce trust more than a one-time reopen
- module and asset history can influence focus-area score explanations

Recommended scoring inputs:

- severity weight
- module weight
- age/recency decay
- reopen penalty
- evidence confidence modifier

Recommended output additions:

- `scoreChangeSummary`
- `moduleScoreChanges`
- `assetScoreChanges`
- `reopenedDrivers`
- `improvementDrivers`

### `src/lib/domain/platformIntelligence/householdOperatingSystem.js`

Update household scoring and priority logic to accept historical deltas instead of only current-state area scores.

Add support for:

- household-level delta summaries
- module-level delta summaries
- explanation rows for strongest gain and strongest drag

Priority engine behavior should remain based on active items, but top-level summary should include whether the household is improving or regressing overall.

### `src/lib/domain/platformIntelligence/householdIntelligenceEngine.js`

Extend the report/intelligence layer to expose historical intelligence.

Add:

- `score_change_summary`
- `recent_resolutions`
- `recent_reopens`
- `module_improvement_summary`
- `asset_improvement_summary`

Update `buildHouseholdReviewReport()` to include:

- 30-day improvement summary
- score delta section
- top resolved issue types
- reopened issue section
- clearer "queue clear" language when only resolved history remains

### `src/pages/ReportsPage.jsx`

Expand the existing Workflow Memory card into a historical intelligence surface.

Add:

- `30 Day Score Change`
- `Resolved This Period`
- `Reopened This Period`
- `Top Improvement Drivers`
- `Top Regression Drivers`

Update executive summary lines so they can say:

- what improved
- what reopened
- why the readiness score moved

### `src/pages/InsuranceIntelligencePage.jsx`

Insurance should become the first module-level proof point for this system.

Add:

- recently stabilized policies
- reopened policy warnings
- module score delta
- "why this score changed" explanation block

This page is already a strong narrative surface, so it is the best place to prove that history can feel intelligent rather than merely archived.

## Reopen logic

Automatic reopen logic should trigger when fresh evidence invalidates a prior resolution.

Initial reopen heuristics:

- new document arrives with a different `detection_hash`
- previously missing field becomes conflicting instead of resolved
- policy, property, or portal relationships no longer match prior evidence
- latest statement/document date is newer than the last reviewed timestamp and changes a relevant risk signal

Implementation rule:

- do not reopen only because any new document exists
- reopen only when a monitored field or evidence signature materially conflicts with the resolution basis

Recommended metadata to store on resolution events:

- `resolved_basis_fields`
- `resolved_basis_document_ids`
- `resolved_basis_detection_hash`
- `resolved_basis_summary`

That gives reopen logic a stable comparison target.

## Rescoring model

First-pass household delta formula:

`net_delta = resolved_lift - reopen_penalty`

Where:

- `resolved_lift = severity_weight * module_weight * recency_multiplier`
- `reopen_penalty = severity_weight * reopen_multiplier`

Recommended starting weights:

- severity: `critical=12`, `high=8`, `medium=5`, `low=2`, `info=1`
- module: `policy=1.0`, `property=1.0`, `mortgage=0.9`, `portal=0.8`, `estate=0.8`, `retirement=0.9`, `household=1.0`
- recency multiplier: `1.0` in 7 days, `0.7` in 30 days, `0.4` in 90 days
- reopen multiplier: `1.25` base, plus `+0.15` for each prior reopen on the same issue

Rules:

- cap total history lift so old resolutions do not overwhelm live operational reality
- keep active open issues dominant in priority ranking
- let history influence readiness and explanation more than queue order

## Rollout plan

### Phase 1

- add `household_issues`, `household_issue_events`, and `household_readiness_snapshots`
- add RLS and indexes
- wire `issueData.js` to append events

### Phase 2

- migrate review workflow persistence off local storage
- annotate queue items from persisted issue state
- keep local-storage fallback temporarily

### Phase 3

- update `workflowMemory.js` and `householdOperatingSystem.js` for event-driven rescoring
- generate score-change summaries and module deltas

### Phase 4

- update `householdIntelligenceEngine.js`
- expand `ReportsPage.jsx`
- add insurance historical-intelligence surfaces in `InsuranceIntelligencePage.jsx`

### Phase 5

- add conflict-based reopen logic
- tune scoring weights using real households and QA scenarios

## Acceptance tests

### Core story test

If a household resolves 8 issues over 30 days, the app should show:

- the net household score change
- which modules improved
- which assets improved
- which issue types were resolved
- whether any issues reopened
- why the score moved up or down

### Queue trust test

If the active queue is empty and reviewed work exists, the UI should say the queue is clear and explain that resolved items are being held out unless new evidence reopens them.

### Reopen trust test

If a new document conflicts with a previously resolved issue, the system should:

- reopen the issue
- log a reopen event with reason
- lower the relevant score
- explain the change in Reports and module surfaces

### Cross-session persistence test

If a user marks work reviewed on one device, the same reviewed history and score-change story should be visible on another device after reload.

## Recommended first implementation slice

Build the thinnest end-to-end version in this order:

1. Add the missing `household_issues` migration
2. Add `household_issue_events`
3. Append events from `issueData.js`
4. Read persisted issue state into review queue annotation
5. Add a basic `30 Day Score Change` summary to Reports

That slice closes the biggest architectural gap first:

- there is currently workflow memory behavior
- there is not yet a durable historical record behind it

Once that is live, the richer explanations and reopen intelligence will have a trustworthy foundation.
