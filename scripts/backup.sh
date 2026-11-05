#!/usr/bin/env bash
# Logical backup of the whole database (custom format, compressed). Run from cron; keep copies off the server.
# Usage: DATABASE_URL=... BACKUP_DIR=/var/backups/nm KEEP_DAYS=30 bash scripts/backup.sh
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"; DIR="${BACKUP_DIR:-./backups}"; KEEP="${KEEP_DAYS:-30}"
mkdir -p "$DIR"; FILE="$DIR/nm-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --file "$FILE"
pg_restore --list "$FILE" >/dev/null   # prove the archive is readable before trusting it
find "$DIR" -name 'nm-*.dump' -mtime +"$KEEP" -delete
echo "backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
