-- RLS verification harness template
-- Run after creating your policies. Replace table/column names to match your schema.

-- Example fixtures
-- Replace UUIDs with real ids from your environment.
select
  '00000000-0000-0000-0000-000000000001'::uuid as owner_id,
  '00000000-0000-0000-0000-000000000002'::uuid as other_user_id;

-- As owner user, own-row access should work
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';

-- Expect: returns owner rows only
select id, user_id
from public.subscriptions
where user_id = '00000000-0000-0000-0000-000000000001'::uuid;

rollback;

-- As non-owner user, owner rows should be denied by RLS
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';

-- Expect: zero rows
select id, user_id
from public.subscriptions
where user_id = '00000000-0000-0000-0000-000000000001'::uuid;

rollback;

-- As anon role, business-table access should be denied/empty
begin;
set local role anon;

-- Expect: denied/empty based on your grants + policies
select id
from public.subscriptions
limit 1;

rollback;
