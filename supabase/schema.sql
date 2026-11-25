-- studycal cloud sync: one row per signed-in person holding their whole planner.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table if not exists public.planner_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  -- Bumped on every save. A save only succeeds if the version hasn't changed since this device last
  -- read it, so two devices can never silently overwrite each other.
  version    integer     not null default 1,
  updated_at timestamptz not null default now()
);

-- Row-level security: each person can only ever see and change their own row.
alter table public.planner_state enable row level security;

drop policy if exists "Read own planner" on public.planner_state;
create policy "Read own planner" on public.planner_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Create own planner" on public.planner_state;
create policy "Create own planner" on public.planner_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Update own planner" on public.planner_state;
create policy "Update own planner" on public.planner_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own planner" on public.planner_state;
create policy "Delete own planner" on public.planner_state
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.planner_state to authenticated;
revoke all on public.planner_state from anon;
