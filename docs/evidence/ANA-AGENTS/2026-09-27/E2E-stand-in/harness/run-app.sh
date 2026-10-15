#!/usr/bin/env bash
# Start the scripted stand-in and the app, exactly as this capture ran them.
#   SNAP  the exported tree of commit 640937815 (S4 + trunk), node_modules symlinked
#   OUT   a scratch folder for logs and saved request bodies
#   DB    the database name (this capture: ana_e2e_2)
# The JWT/session secret is a throwaway random value made here; it is not recorded.
set -euo pipefail
: "${SNAP:?set SNAP to the snapshot tree}"
: "${OUT:?set OUT to a scratch folder}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/requests"

API_CONTRACT="$SNAP/docs/evidence/W1/2026-09-28-ana-drive/harness/api-contract.mjs" \
FAKE_PORT=8797 FAKE_REQ_DIR="$OUT/requests" \
  nohup node "$HERE/stand-in-e2e.mjs" > "$OUT/stand-in.log" 2>&1 &
echo $! > "$OUT/stand-in.pid"

RAND="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
cd "$SNAP"
JWT_SECRET="$RAND" SESSION_SECRET="$RAND" \
ANTHROPIC_API_KEY=local-stand-in ANTHROPIC_BASE_URL=http://127.0.0.1:8797 \
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/${DB:?set DB to the database name}" \
ALLOWED_ORIGINS=http://localhost:5077 \
NODE_ENV=development PORT=5077 \
  nohup npx tsx server/index.ts > "$OUT/server.log" 2>&1 &
echo $! > "$OUT/server.pid"
