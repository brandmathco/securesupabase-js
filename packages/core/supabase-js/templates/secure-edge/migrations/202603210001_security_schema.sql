-- Optional security schema objects for database-backed rate limiting and blocklists.
-- This migration is additive and safe to run multiple times.

create schema if not exists security;

create table if not exists security.rate_limits (
  identifier text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists security.blocklist (
  id uuid primary key default gen_random_uuid(),
  block_type text not null check (block_type in ('ip', 'user_id', 'email')),
  value text not null,
  active boolean not null default true,
  reason text null,
  expires_at timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists security_blocklist_unique_active
  on security.blocklist (block_type, value, active);

create index if not exists security_blocklist_lookup_idx
  on security.blocklist (block_type, value, active, expires_at);
