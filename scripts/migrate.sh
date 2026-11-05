#!/usr/bin/env bash
# Applies migrations in order, once each, recording them in migrations.applied.
# Usage: DATABASE_URL=postgres://... bash scripts/migrate.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "create schema if not exists migrations; create table if not exists migrations.applied (name text primary key, applied_at timestamptz not null default now())"
for f in supabase/migrations/*.sql; do
  n=$(basename "$f")
  if [ "$(psql "$DATABASE_URL" -tA -c "select 1 from migrations.applied where name = '$n'")" = "1" ]; then continue; fi
  echo "applying $n"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$f" -c "insert into migrations.applied(name) values ('$n')"
done
echo "database is up to date"
