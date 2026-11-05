-- Identity: users, sessions, one-time tokens, outbound mail.
-- Self-contained so the app runs on any Postgres. On Supabase, auth.uid() already
-- exists and is left untouched. The `identity` schema is never granted to the
-- `authenticated` role, so RLS-bound sessions cannot read credentials.

create extension if not exists citext;
create schema if not exists auth;
create schema if not exists identity;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid') then
    create function auth.uid() returns uuid language sql stable as
      $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  end if;
end $$;

create table identity.users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text not null,
  display_name text not null default '',
  email_verified_at timestamptz,
  totp_secret text,                       -- base32; set while enrolling
  totp_enabled boolean not null default false,
  recovery_code_hashes text[] not null default '{}',
  failed_attempts int not null default 0,
  locked_until timestamptz,
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

create table identity.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  token_hash text not null unique,
  pending_2fa boolean not null default false,   -- password ok, second factor outstanding
  user_agent text, ip text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index on identity.sessions(user_id);

create table identity.tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references identity.users(id) on delete cascade,
  kind text not null check (kind in ('verify_email','reset_password','invitation')),
  token_hash text not null unique,
  payload jsonb not null default '{}',
  expires_at timestamptz not null,
  used_at timestamptz
);

create table identity.outbox (
  id bigint generated always as identity primary key,
  to_email text not null, subject text not null, body text not null,
  created_at timestamptz not null default now(), sent_at timestamptz
);

revoke all on schema identity from public;
revoke all on all tables in schema identity from public, anon, authenticated;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
