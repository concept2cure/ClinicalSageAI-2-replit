#!/usr/bin/env bash
# Reset the lane database to the freshly seeded snapshot and boot the server.
# server-env.sh (not committed: it carries session secrets) exports DATABASE_URL and
# friends for c2c_ind_ref, NODE_ENV=development, RLS_ENFORCE=on, LAUNCH_SCOPE_ENFORCE=on,
# ALLOW_DEV_AUTH=1, AUDIT_TRAIL_ENABLED=true and CONCEPT2CURE_SIGNER_MODE=dev.
set -u
SP="${SP:?set SP to the run directory holding server-env.sh}"
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
for pid in $(pgrep -f '[n]ode.*server/index.ts'); do kill "$pid" 2>/dev/null; done
sleep 2
if [ "${1:-}" != "--keep-db" ]; then
  su postgres -c "psql -h /tmp -qc 'DROP DATABASE IF EXISTS c2c_ind_ref WITH (FORCE);' -c 'CREATE DATABASE c2c_ind_ref TEMPLATE c2c_ind_ref_base;'" || exit 1
fi
rm -rf "$REPO/uploads/ind-ref-run" 2>/dev/null
cd "$REPO"
source $SP/server-env.sh
nohup npx tsx server/index.ts > $SP/server.log 2>&1 &
for i in $(seq 1 80); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/healthz)
  [ "$code" = "200" ] && { echo "server up after $((i*2))s"; exit 0; }
  sleep 2
done
echo "server did not come up"; tail -30 $SP/server.log; exit 1
