#!/usr/bin/env bash
# Grants platform-staff access to an existing user. Usage: DATABASE_URL=... bash scripts/make-staff.sh user@example.com super_admin
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"; EMAIL="${1:?email}"; ROLE="${2:-super_admin}"
case "$ROLE" in super_admin|billing|support|technical) ;; *) echo "role must be super_admin|billing|support|technical"; exit 1;; esac
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v email="$EMAIL" -v role="$ROLE" -c "insert into public.platform_staff(user_id, role) select id, :'role' from identity.users where email = :'email' on conflict (user_id) do update set role = excluded.role returning user_id"
