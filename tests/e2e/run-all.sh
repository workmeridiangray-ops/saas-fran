#!/usr/bin/env bash
# Runs every end-to-end flow against a running server (BASE defaults to http://127.0.0.1:3100) and a migrated database.
cd "$(dirname "$0")"
rc=0
for f in [0-9]*.mjs; do
  echo "== $f"; timeout 600 node "$f" || rc=1
done
exit $rc
