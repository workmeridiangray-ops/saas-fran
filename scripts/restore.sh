#!/usr/bin/env bash
# Restore a backup into an EMPTY database. Usage: DATABASE_URL=... bash scripts/restore.sh path/to/nm-....dump
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"; FILE="${1:?backup file}"
[ "$(psql "$DATABASE_URL" -tA -c "select count(*) from information_schema.tables where table_schema in ('public','identity')")" = "0" ] || { echo "target database is not empty; restore into a fresh database"; exit 1; }
pg_restore --no-owner --dbname "$DATABASE_URL" "$FILE"
echo "restored $FILE"
