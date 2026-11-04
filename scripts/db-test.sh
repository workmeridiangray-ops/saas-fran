#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres database (with a stub of
# Supabase's auth.uid()) and runs tests/db/*.sql. Needs a reachable Postgres
# and a role allowed to create databases: set PGHOST/PGUSER/PGPASSWORD as usual.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="saasfran_test_$$"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
export PGDATABASE="$DB"

psql -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL

for f in supabase/migrations/*.sql; do
  echo "migrate  $f"
  psql -v ON_ERROR_STOP=1 -q -f "$f"
done
for f in tests/db/*.sql; do
  echo "test     $f"
  psql -v ON_ERROR_STOP=1 -q -t -A -f "$f" | sed '/^$/d'  # pipefail: a failing psql fails the run
done
echo "database tests passed"
