#!/usr/bin/env bash
# Concept2Cure Codespace start: local database up, migrations applied, app
# started on port 5000 (development mode, dev sign-in), demo data seeded once.
#
# The app runs with app.env only: the app_service runtime role, never the
# owner credential (owner.env is sourced only in the provisioning subshells).
# The doctor and the server's boot check still refuse owner credentials in the
# app's environment; that refusal is unchanged.
#
# Each step says what it did. A failed step says BLOCKED and why, and the
# script never claims the app is ready unless /readyz answered.
set -u

. "$(dirname "${BASH_SOURCE[0]}")/post-create.sh"
set +e

C2C_PORT="${PORT:-5000}"
C2C_APP_LOG="${C2C_APP_LOG:-/tmp/concept2cure-app.log}"
C2C_CDISC_DIR="$C2C_CODESPACE_STATE/cdisc-pilot"
cd "$C2C_REPO_ROOT" || exit 0

echo "C2C Codespace post-start. Branch: $(git branch --show-current 2>/dev/null || echo unknown)"
echo "No database or AI secret is printed."

c2c_blocked() { c2c_log "BLOCKED: $*"; c2c_log "The editor stays open for repair; see .devcontainer and docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md."; exit 0; }

if [[ ! -s "$C2C_CODESPACE_STATE/owner.env" || ! -s "$C2C_CODESPACE_STATE/app.env" ]]; then
  c2c_log "No local database state yet; running the setup steps (post-create)."
  ( c2c_install_postgres && c2c_start_postgres && c2c_write_state && c2c_ensure_database ) || c2c_blocked "local PostgreSQL could not be set up."
  NEED_ACCOUNTS=1
fi
c2c_start_postgres || c2c_blocked "PostgreSQL did not start."
c2c_ensure_database || c2c_blocked "the owner role or database could not be ensured."
# Idempotent: over a complete database this is deploy-migrate + the readiness
# contract, so migrations committed since the last start are applied.
c2c_provision || c2c_blocked "database provisioning failed."
if [[ "${NEED_ACCOUNTS:-0}" == "1" || ! -f "$C2C_CODESPACE_STATE/accounts.done" ]]; then
  c2c_seed_accounts && touch "$C2C_CODESPACE_STATE/accounts.done" || c2c_blocked "sign-in accounts could not be created."
fi

# The forwarded origin the browser uses; the CSRF origin check refuses others.
C2C_ORIGINS="http://localhost:$C2C_PORT,http://127.0.0.1:$C2C_PORT"
if [[ -n "${CODESPACE_NAME:-}" ]]; then
  C2C_PUBLIC_URL="https://${CODESPACE_NAME}-${C2C_PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  C2C_ORIGINS="$C2C_PUBLIC_URL,$C2C_ORIGINS"
else
  C2C_PUBLIC_URL="http://localhost:$C2C_PORT"
fi

# Owner or maintenance credentials a Codespaces secret may carry are not given
# to the app (the doctor and the server refuse them). Named, never printed.
C2C_OWNER_NAMES=(DATABASE_URL DATABASE_URL_PROD DATABASE_OWNER_URL DATABASE_NEON_NEW_SECRET NEON_DATABASE_URL
  DATABASE_URL_ADMIN NEON_DATABASE_URL_ADMIN DATABASE_URL_DIRECT APP_SERVICE_DB_PASSWORD)
C2C_UNSET=()
for name in "${C2C_OWNER_NAMES[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    c2c_log "Not passing $name to the app: this Codespace uses its own local database."
  fi
  C2C_UNSET+=(-u "$name")
done

c2c_app_up() { curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$C2C_PORT/readyz"; }

if c2c_app_up; then
  c2c_log "The app is already running on port $C2C_PORT."
else
  c2c_log "Starting the app (npm run dev) on port $C2C_PORT; log: $C2C_APP_LOG"
  (
    set -a; . "$C2C_CODESPACE_STATE/app.env"; set +a
    exec env "${C2C_UNSET[@]}" NODE_ENV=development PORT="$C2C_PORT" ALLOWED_ORIGINS="$C2C_ORIGINS" \
      setsid nohup npm run dev >"$C2C_APP_LOG" 2>&1 </dev/null
  ) &
  disown || true
  c2c_log "Waiting for /readyz (the first start compiles the client; a few minutes)."
  for _ in $(seq 1 180); do
    c2c_app_up && break
    sleep 5
  done
  c2c_app_up || c2c_blocked "the app did not answer /readyz within 15 minutes. Last log lines:
$(tail -n 30 "$C2C_APP_LOG")"
fi
c2c_log "The app answered /readyz."

# Read (not export) the demo identities; the seeders get only what they need.
. "$C2C_CODESPACE_STATE/app.env"

# Demo packs through the product's own API, once.
if [[ ! -f "$C2C_CODESPACE_STATE/demo-seed.done" ]]; then
  c2c_log "Seeding the demo projects (npm run demo:seed -- --pack all); log: $C2C_CODESPACE_STATE/demo-seed.log"
  if npm run --silent demo:seed -- --pack all --base-url "http://127.0.0.1:$C2C_PORT" --email "$DEMO_SEED_EMAIL" \
      >"$C2C_CODESPACE_STATE/demo-seed.log" 2>&1; then
    touch "$C2C_CODESPACE_STATE/demo-seed.done"
    c2c_log "Demo projects seeded."
  else
    c2c_log "The demo seed did not finish; see $C2C_CODESPACE_STATE/demo-seed.log. It re-runs on the next start."
  fi
fi

# The CSR study (CDISCPILOT01), prepared once: the public CDISC pilot ADaM
# files are fetched OUTSIDE the repository (CDISC's terms forbid committing or
# altering them), uploaded and approved in Vault by three people, and the CSR
# document is created with its study data frozen. It stops before the build:
# the build is AnA drafting with your model key, which you start yourself.
if [[ ! -f "$C2C_CODESPACE_STATE/csr-study.done" ]]; then
  if [[ ! -f "$C2C_CDISC_DIR/adsl.xpt" ]]; then
    c2c_log "Fetching the CDISC pilot ADaM files into $C2C_CDISC_DIR (verified by SHA-256)."
    node scripts/cre/fetch-cdisc-pilot-adam.mjs "$C2C_CDISC_DIR" >"$C2C_CODESPACE_STATE/cdisc-fetch.log" 2>&1 ||
      c2c_log "The CDISC pilot files could not be fetched; see $C2C_CODESPACE_STATE/cdisc-fetch.log."
  fi
  if [[ -f "$C2C_CDISC_DIR/adsl.xpt" ]]; then
    c2c_log "Preparing the CSR study in the app (Vault uploads, approvals, CSR document, frozen study data)."
    if DEMO_TAG=codespace DEMO_PREPARE_UNTIL=freeze DEMO_AUTHOR_EMAIL="$DEMO_AUTHOR_EMAIL" \
        DEMO_REVIEWER_EMAIL="$DEMO_REVIEWER_EMAIL" DEMO_APPROVER_EMAIL="$DEMO_APPROVER_EMAIL" \
        DEMO_SIGNER_PASSWORD="$DEMO_SIGNER_PASSWORD" \
        node docs/evidence/DEMO/2026-11-05-csr-lifecycle/walk.cjs "http://127.0.0.1:$C2C_PORT" "$C2C_CDISC_DIR" prepare \
        >"$C2C_CODESPACE_STATE/csr-study.log" 2>&1; then
      touch "$C2C_CODESPACE_STATE/csr-study.done"
      c2c_log "CSR study ready: project \"Xanomeline TTS Phase 2 (CDISCPILOT01)\", document \"CDISCPILOT01 Clinical Study Report\"."
    else
      c2c_log "The CSR study preparation did not finish; see $C2C_CODESPACE_STATE/csr-study.log. It re-runs on the next start."
    fi
  fi
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${OPENAI_API_KEY:-}" ]]; then
  c2c_log "No ANTHROPIC_API_KEY or OPENAI_API_KEY secret: AnA cannot draft. Add one as a Codespaces secret and rebuild."
fi

cat <<EOF

============================================================================
 Concept2Cure is running: $C2C_PUBLIC_URL
 Sign in: press "Demo access" on the sign-in page (signs in as $DEMO_SEED_EMAIL).
 Password sign-in for the three demo people: see $C2C_CODESPACE_STATE/app.env
   (DEMO_SIGNER_PASSWORD). App log: $C2C_APP_LOG
 Restart the app: pkill -f 'tsx --inspect=0 server/index.ts'; bash .devcontainer/post-start.sh
============================================================================
EOF
exit 0
