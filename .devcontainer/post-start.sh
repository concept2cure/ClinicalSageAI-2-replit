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

# Dependencies first: a pull that changed package-lock.json since the last
# install would otherwise start the app on the old tree.
if ! c2c_deps_current; then
  c2c_log "package-lock.json changed since the last install: stopping the app and running npm ci."
  pkill -f 'tsx --inspect=0 server/index.ts' 2>/dev/null
  c2c_install_deps >"$C2C_CODESPACE_STATE/npm-ci.log" 2>&1 ||
    { tail -n 20 "$C2C_CODESPACE_STATE/npm-ci.log"; c2c_log "BLOCKED: npm ci failed; see $C2C_CODESPACE_STATE/npm-ci.log."; exit 0; }
  c2c_log "Dependencies match package-lock.json."
fi

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
if [[ "${NEED_ACCOUNTS:-0}" == "1" ]] || ! c2c_accounts_current; then
  c2c_seed_accounts || c2c_blocked "sign-in accounts could not be created."
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

# Serving: /readyz answers with the database and the schema ok. It answers 503
# while any dependency is down (AnA without a model key), so "serving" and
# "ready" are reported separately, from what /readyz itself says.
c2c_readyz() { curl -s --max-time 5 "http://127.0.0.1:$C2C_PORT/readyz" 2>/dev/null; }
c2c_app_up() {
  c2c_readyz | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s);
    process.exit(r.dependencies?.database==="ok"&&r.dependencies?.schema==="ok"?0:1)}catch{process.exit(1)}})'
}
c2c_readiness_line() {
  c2c_readyz | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s);
    console.log(r.ready ? "ready (every dependency ok)" :
      "serving; not ready: " + (r.failed||[]).join(", ") + (r.anaState ? " (AnA: " + r.anaState + ")" : ""))}
    catch{console.log("unknown")}})'
}

# What the RUNNING app's AnA sees (anaState / anaDetail on /readyz). This, not
# this shell's environment, says whether the app has the model key.
c2c_ana_state() {
  c2c_readyz | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).anaState||"unknown")}catch{console.log("unknown")}})'
}
c2c_ana_detail() {
  c2c_readyz | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(String(JSON.parse(s).anaDetail||"").slice(0,300))}catch{console.log("")}})'
}
# The existing public build stamp is fixed when the backend starts. A healthy
# process can otherwise survive a pull while the database/client move ahead.
c2c_app_current() {
  local expected
  expected="$(git rev-parse HEAD 2>/dev/null)" || return 1
  [[ "$expected" =~ ^[0-9a-f]{40}$ ]] || return 1
  curl -fsS --max-time 5 "http://127.0.0.1:$C2C_PORT/api/version" 2>/dev/null |
    C2C_EXPECTED_COMMIT="$expected" node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{const c=JSON.parse(s).commit;process.exit(typeof c==="string"&&/^[0-9a-f]{40}$/.test(c)&&c===process.env.C2C_EXPECTED_COMMIT?0:1)}
      catch{process.exit(1)}})'
}
c2c_stop_app() {
  pkill -f 'tsx --inspect=0 server/index.ts' 2>/dev/null
  for _ in $(seq 1 30); do
    curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$C2C_PORT/healthz" || return 0
    sleep 1
  done
  pkill -9 -f 'tsx --inspect=0 server/index.ts' 2>/dev/null; sleep 2
}
c2c_start_app() {
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
  c2c_app_up || c2c_blocked "the app did not serve (database and schema ok on /readyz) within 15 minutes. Last log lines:
$(tail -n 30 "$C2C_APP_LOG")"
}

# The model keys this start holds that the running server process does not.
# Read by name from the process's own environment; no value is printed.
c2c_keys_app_lacks() {
  local pid name missing=()
  pid="$(pgrep -f 'tsx --inspect=0 server/index.ts' | tail -n 1)"
  [[ -n "$pid" && -r "/proc/$pid/environ" ]] || return 0
  for name in ANTHROPIC_API_KEY OPENAI_API_KEY; do
    if [[ -n "${!name:-}" ]] && ! tr '\0' '\n' < "/proc/$pid/environ" | grep -q "^$name=."; then
      missing+=("$name")
    fi
  done
  echo "${missing[*]}"
}

if c2c_app_up; then
  C2C_APP_LACKS="$(c2c_keys_app_lacks)"
  if [[ -n "$C2C_APP_LACKS" ]]; then
    # The app was started before the key reached this Codespace (a secret added
    # later, or a restart from a terminal opened before it). It keeps the
    # environment it started with, so it is restarted to start with the key.
    c2c_log "The running app was started without $C2C_APP_LACKS (AnA: $(c2c_ana_state)); restarting it with this start's keys."
    c2c_stop_app
    c2c_start_app
  elif ! c2c_app_current; then
    c2c_log "The running app serves an older or unverified code revision; restarting it with the current checkout."
    c2c_stop_app
    c2c_start_app
  else
    c2c_log "The app is already running on port $C2C_PORT."
  fi
else
  c2c_start_app
fi
c2c_log "The app is serving. /readyz: $(c2c_readiness_line)"

# Read (not export) the demo identities; the seeders get only what they need.
. "$C2C_CODESPACE_STATE/app.env"

# Demo packs through the product's own API. They run again when scripts/demo
# changes on the branch (the packs are idempotent by title), so a Codespace
# made earlier gets new demo data on its next start. Without a second signer
# (OQ_SIGNER_*) the two-person steps are recorded as not executed; the reviewer
# becomes that signer once the QMS packs route a draft to review before
# approving it (the server refuses a draft's approval with QMS_INVALID_STATE).
C2C_DEMO_VERSION="$(git rev-parse HEAD:scripts/demo 2>/dev/null || echo unknown)"
if [[ "$(cat "$C2C_CODESPACE_STATE/demo-seed.done" 2>/dev/null)" != "$C2C_DEMO_VERSION" ]]; then
  c2c_log "Seeding the demo projects (npm run demo:seed -- --pack all); log: $C2C_CODESPACE_STATE/demo-seed.log"
  if DEMO_MANIFEST_ROOT="$C2C_CODESPACE_STATE/demo-manifests" \
      npm run --silent demo:seed -- --pack all --base-url "http://127.0.0.1:$C2C_PORT" --email "$DEMO_SEED_EMAIL" \
      >"$C2C_CODESPACE_STATE/demo-seed.log" 2>&1; then
    echo "$C2C_DEMO_VERSION" >"$C2C_CODESPACE_STATE/demo-seed.done"
    c2c_log "Demo projects seeded ($(grep -c 'not executed' "$C2C_CODESPACE_STATE/demo-seed.log" || true) steps recorded as not executed; see the log)."
  else
    c2c_log "The demo seed did not finish; see $C2C_CODESPACE_STATE/demo-seed.log. It re-runs on the next start."
  fi
fi

# A demonstration is a conversation: the default 15-minute idle sign-out
# would end it mid-sentence. The development organisation's idle window is set
# to 120 minutes once, through the governed settings route an administrator
# uses (PATCH /api/tenant-config/:id/settings, audited as
# tenant_settings_changed). Real tenants keep their own setting.
c2c_set_idle_window() {
  local email="$1" minutes="$2" marker="$C2C_CODESPACE_STATE/idle-window.done"
  grep -qx "$email=$minutes" "$marker" 2>/dev/null && return 0
  if C2C_BASE="http://127.0.0.1:$C2C_PORT" C2C_EMAIL="$email" C2C_MINUTES="$minutes" node -e '
    (async () => {
      const base = process.env.C2C_BASE;
      const l = await (await fetch(base + "/api/auth/dev-login", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env.C2C_EMAIL }) })).json();
      const org = l?.user?.organizationId;
      if (!l?.accessToken || !org) process.exit(1);
      const r = await fetch(base + "/api/tenant-config/" + org + "/settings", { method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + l.accessToken },
        body: JSON.stringify({ security: { sessionTimeoutMinutes: Number(process.env.C2C_MINUTES) } }) });
      const j = await r.json().catch(() => null);
      process.exit(r.status === 200 && j?.security?.sessionTimeoutMinutes === Number(process.env.C2C_MINUTES) ? 0 : 1);
    })().catch(() => process.exit(1));' 2>/dev/null; then
    echo "$email=$minutes" >>"$marker"
    c2c_log "Idle sign-out for $email's organisation: $minutes minutes."
  else
    c2c_log "Could not set the idle sign-out for $email's organisation; it stays at the default (15 minutes)."
  fi
}
c2c_set_idle_window "$DEMO_SEED_EMAIL" 120

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
  if [[ -f "$C2C_CDISC_DIR/adsl.xpt" ]] && ! node -e "require.resolve('playwright')" >/dev/null 2>&1; then
    # The preparation walk drives a browser with playwright, which is not a project dependency: without it every
    # fresh Codespace stopped here with "Cannot find module 'playwright'" (2026-11-09). Installed for this checkout
    # only (--no-save), with its browser; a failure leaves the app running and the preparation re-tried next start.
    c2c_log "Installing playwright for the CSR study preparation; log: $C2C_CODESPACE_STATE/playwright-install.log"
    { timeout 900 npm install --no-save --no-audit --no-fund playwright@1.56.1 &&
      timeout 900 npx playwright install chromium &&
      c2c_sudo timeout 900 "$(command -v npx)" playwright install-deps chromium; } >"$C2C_CODESPACE_STATE/playwright-install.log" 2>&1 ||
      c2c_log "playwright could not be installed; see $C2C_CODESPACE_STATE/playwright-install.log."
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

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  c2c_log "No ANTHROPIC_API_KEY secret: AnA cannot draft regulatory documents (OPENAI_API_KEY alone answers chat only)."
  c2c_log "Add it as a Codespaces secret for this repository, then rebuild or restart the Codespace."
else
  # The key is checked against the Claude versions approved for drafting, with
  # the doctor's no-generation-charge model list. Nothing secret is printed.
  C2C_DRAFTING_MODELS="$(timeout 120 npx --no-install tsx -e "import('./server/services/ai-governance/approved-models.ts').then(m => console.log(m.APPROVED_MODELS.filter(x => x.provider === 'anthropic' && x.approvedForHighRisk).map(x => x.pinnedVersion).join(',')))" 2>/dev/null | tail -n 1)"
  C2C_ANTHROPIC_LINE="$(
    set -a; . "$C2C_CODESPACE_STATE/app.env"; set +a
    env "${C2C_UNSET[@]}" node scripts/ops/codespaces-doctor.mjs --json --probe-anthropic \
      "--expect-anthropic-models=$C2C_DRAFTING_MODELS" 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s.slice(s.indexOf("{"),s.lastIndexOf("}")+1)).anthropic;
      const seen=(a.draftingModelsVisible||[]).join(", "), miss=(a.draftingModelsMissing||[]).join(", ");
      console.log(a.status==="passed" ? "key accepted; drafting models available: " + (seen||"not checked") + (miss ? " (not available: " + miss + ")" : "")
        : "BLOCKED " + a.code + ": " + a.explanation)}catch{console.log("the key check did not run")}})'
  )"
  c2c_log "ANTHROPIC_API_KEY: $C2C_ANTHROPIC_LINE"
fi
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  c2c_log "No OPENAI_API_KEY secret: search (Vault, knowledge base, AnA's project memory) uses OpenAI embeddings and will fail."
fi
# What the running app itself reports for AnA, whatever this shell holds.
C2C_APP_ANA="$(c2c_ana_state)"
case "$C2C_APP_ANA" in
  ready) c2c_log "AnA in the running app: ready." ;;
  no_provider|no_high_risk_model)
    c2c_log "AnA in the running app: $C2C_APP_ANA. $(c2c_ana_detail)"
    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
      c2c_log "This start has no ANTHROPIC_API_KEY. A Codespaces secret reaches a Codespace when it starts:"
      c2c_log "after adding one, stop and start the Codespace (Codespaces menu: Stop Current Codespace), not just reload the page."
    fi ;;
  *) c2c_log "AnA in the running app: $C2C_APP_ANA. $(c2c_ana_detail)" ;;
esac

cat <<EOF

============================================================================
 Concept2Cure is running: $C2C_PUBLIC_URL
 Sign in: press "Demo access" on the sign-in page (signs in as $DEMO_SEED_EMAIL).
 Password sign-in for the three demo people: see $C2C_CODESPACE_STATE/app.env
   (DEMO_SIGNER_PASSWORD). App log: $C2C_APP_LOG
 Restart the app: bash .devcontainer/post-start.sh (restarts it when it lacks a key this
   terminal has). A secret added after the Codespace started is not in an open terminal:
   stop and start the Codespace instead.
============================================================================
EOF
exit 0
