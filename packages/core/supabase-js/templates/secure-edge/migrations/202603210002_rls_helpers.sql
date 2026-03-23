-- Reusable RLS helper functions.
-- Safe to run multiple times.

create schema if not exists security;

create or replace function security.auth_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function security.is_authenticated()
returns boolean
language sql
stable
as $$
  select auth.role() = 'authenticated';
$$;

create or replace function security.jwt_email()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'email', '');
$$;

create or replace function security.jwt_role_claim()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'app_role', ''),
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    auth.role()
  );
$$;

create or replace function security.is_admin()
returns boolean
language sql
stable
as $$
  select security.jwt_role_claim() in ('admin', 'owner', 'service_role');
$$;
