-- RLS baseline template
-- Copy this file into your app migrations and replace table/column names.

-- 1) Enable RLS
alter table if exists public.subscriptions enable row level security;
alter table if exists public.subscriptions force row level security;

-- 2) Remove broad/default policies if present (adjust names to your project)
drop policy if exists "subscriptions_select_all" on public.subscriptions;
drop policy if exists "subscriptions_insert_all" on public.subscriptions;
drop policy if exists "subscriptions_update_all" on public.subscriptions;
drop policy if exists "subscriptions_delete_all" on public.subscriptions;

-- 3) Owner-scoped policies (example: user_id owner)
create policy "subscriptions_select_own"
on public.subscriptions
for select
to authenticated
using (user_id = security.auth_user_id());

create policy "subscriptions_insert_own"
on public.subscriptions
for insert
to authenticated
with check (user_id = security.auth_user_id());

create policy "subscriptions_update_own"
on public.subscriptions
for update
to authenticated
using (user_id = security.auth_user_id())
with check (user_id = security.auth_user_id());

create policy "subscriptions_delete_own"
on public.subscriptions
for delete
to authenticated
using (user_id = security.auth_user_id());

-- 4) Optional admin override
create policy "subscriptions_admin_all"
on public.subscriptions
for all
to authenticated
using (security.is_admin())
with check (security.is_admin());

-- 5) Recommended grants (never grant business-table access to anon unless required)
revoke all on table public.subscriptions from anon;
grant select, insert, update, delete on table public.subscriptions to authenticated;
