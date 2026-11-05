#!/usr/bin/env bash
# Runs the production build the way the Docker image does. Usage: PORT=3000 bash scripts/start-standalone.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .next/standalone/server.js ] || { echo "run 'npm run build' first"; exit 1; }
mkdir -p .next/standalone/.next && rm -rf .next/standalone/.next/static && cp -r .next/static .next/standalone/.next/static
[ -d public ] && { rm -rf .next/standalone/public; cp -r public .next/standalone/public; }
HOSTNAME="${HOSTNAME_BIND:-0.0.0.0}" exec node .next/standalone/server.js
