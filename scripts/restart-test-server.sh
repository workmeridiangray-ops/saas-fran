#!/usr/bin/env bash
# Test helper: stop whatever holds the port, rebuild if asked, start the standalone server on 3100.
cd "$(dirname "$0")/.."
fuser -k 3100/tcp 2>/dev/null; pkill -f ".next/standalone/server.js" 2>/dev/null; sleep 1
[ "${1:-}" = "build" ] && npx next build 2>&1 | grep -E "Failed|rror|Compiled"
(set -a; . ./.env.local; set +a; PORT=3100 HOSTNAME_BIND=127.0.0.1 bash scripts/start-standalone.sh >/tmp/next.log 2>&1 &)
sleep 4; curl -s localhost:3100/api/health; echo
