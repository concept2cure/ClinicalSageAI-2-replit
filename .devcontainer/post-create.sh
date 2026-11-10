#!/usr/bin/env bash
# Codespace creation: install dependencies, a local PostgreSQL 16 + pgvector,
# and a provisioned database that the app serves from as a NON-OWNER role.
#
# Credential split (codespaces-doctor DB_OWNER_CREDENTIAL_IN_APP,
# server/startup/env.ts assertCodespacesNoOwnerCredential):
#   $C2C_CODESPACE_STATE/owner.env  owner DSN + app_service password. chmod 600,
#                                   OUTSIDE the repository, sourced only in the
#                                   subshells that provision the database and
#                                   create the sign-in accounts. Never exported
#                                   into the app's environment.
#   $C2C_CODESPACE_STATE/app.env    what the app runs with: the app_service DSN,
#                                   a random JWT secret, dev sign-in identities.
# Nothing here is printed, committed or written inside the repository.
#
# This file is also sourced by post-start.sh for the shared helpers below; it
# runs its own main only when executed.
set -Eeuo pipefail

C2C_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
C2C_CODESPACE_STATE="${C2C_CODESPACE_STATE:-$HOME/.concept2cure-codespace}"
C2C_PG_VERSION="${C2C_PG_VERSION:-16}"
C2C_DB_NAME="${C2C_DB_NAME:-concept2cure}"
C2C_DB_OWNER_ROLE="${C2C_DB_OWNER_ROLE:-c2c_owner}"
C2C_DB_PORT="${C2C_DB_PORT:-5432}"
# Fictional demo people (no real person's identity is built in). The author is
# the dev sign-in identity; reviewer and approver give the CSR study the
# separation of duties its Vault approvals require.
C2C_DEV_EMAIL="${C2C_DEV_EMAIL:-ana.author@concept2cure.pro}"
C2C_REVIEWER_EMAIL="${C2C_REVIEWER_EMAIL:-rhea.reviewer@concept2cure.pro}"
C2C_APPROVER_EMAIL="${C2C_APPROVER_EMAIL:-ava.approver@concept2cure.pro}"

c2c_log() { printf '[c2c-codespace] %s\n' "$*"; }
c2c_sudo() { if [[ "$(id -u)" == "0" ]]; then "$@"; else sudo -n --preserve-env=DEBIAN_FRONTEND "$@"; fi; }
c2c_as_postgres() { c2c_sudo runuser -u postgres -- "$@"; }

c2c_pg_bin() { printf '/usr/lib/postgresql/%s/bin' "$C2C_PG_VERSION"; }
c2c_pgvector_present() {
  [[ -f "/usr/share/postgresql/$C2C_PG_VERSION/extension/vector.control" ]]
}

# PostgreSQL $C2C_PG_VERSION and pgvector: the distribution's packages when it
# offers both (Ubuntu noble), otherwise the PostgreSQL project's apt repository
# (PGDG; Debian bookworm, the devcontainer image, ships PostgreSQL 15 only).
c2c_install_postgres() {
  if [[ -x "$(c2c_pg_bin)/postgres" ]] && c2c_pgvector_present && command -v psql >/dev/null; then
    c2c_log "PostgreSQL $C2C_PG_VERSION and pgvector already installed."
    return 0
  fi
  local pkgs=("postgresql-$C2C_PG_VERSION" "postgresql-$C2C_PG_VERSION-pgvector" "postgresql-client-$C2C_PG_VERSION")
  export DEBIAN_FRONTEND=noninteractive
  c2c_log "Installing PostgreSQL $C2C_PG_VERSION + pgvector."
  c2c_sudo apt-get update -qq || { c2c_log "BLOCKED: apt-get update failed: the distribution's package mirror is unreachable (see the lines above)."; return 1; }
  if ! apt-cache show "postgresql-$C2C_PG_VERSION-pgvector" >/dev/null 2>&1; then
    local codename
    codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-}")"
    [[ -n "$codename" ]] || { c2c_log "BLOCKED: cannot read the OS codename for the PostgreSQL apt repository."; return 1; }
    c2c_log "Adding the PostgreSQL apt repository (apt.postgresql.org, $codename-pgdg)."
    c2c_sudo apt-get install -y -qq ca-certificates curl >/dev/null
    c2c_sudo install -d /usr/share/postgresql-common/pgdg
    c2c_sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc ||
      { c2c_log "BLOCKED: could not download the PostgreSQL signing key from www.postgresql.org."; return 1; }
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $codename-pgdg main" |
      c2c_sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
    c2c_sudo apt-get update -qq ||
      { c2c_log "BLOCKED: apt-get update failed with the PostgreSQL repository (apt.postgresql.org)."; return 1; }
  fi
  c2c_sudo apt-get install -y -qq "${pkgs[@]}" >/dev/null ||
    { c2c_log "BLOCKED: could not install ${pkgs[*]}."; return 1; }
  c2c_pgvector_present || { c2c_log "BLOCKED: pgvector is not installed for PostgreSQL $C2C_PG_VERSION."; return 1; }
}

# Start (creating if needed) the cluster, listening on localhost only. The
# packaged pg_hba.conf (peer for the postgres OS user, scram-sha-256 on
# 127.0.0.1) is used unchanged.
c2c_start_postgres() {
  if ! pg_lsclusters -h 2>/dev/null | awk -v v="$C2C_PG_VERSION" '$1 == v && $2 == "main"' | grep -q .; then
    c2c_log "Creating PostgreSQL cluster $C2C_PG_VERSION/main."
    c2c_sudo pg_createcluster "$C2C_PG_VERSION" main -p "$C2C_DB_PORT" --encoding=UTF8 --locale=C -- --auth-local=peer --auth-host=scram-sha-256 >/dev/null
  fi
  if ! pg_lsclusters -h | awk -v v="$C2C_PG_VERSION" '$1 == v && $2 == "main" && $4 == "online"' | grep -q .; then
    if pg_isready -q -h 127.0.0.1 -p "$C2C_DB_PORT"; then
      c2c_log "BLOCKED: another PostgreSQL already listens on 127.0.0.1:$C2C_DB_PORT. Stop it, or set C2C_DB_PORT to a free port."
      return 1
    fi
    c2c_sudo pg_conftool "$C2C_PG_VERSION" main set listen_addresses localhost
    c2c_sudo pg_conftool "$C2C_PG_VERSION" main set port "$C2C_DB_PORT"
    c2c_sudo pg_ctlcluster "$C2C_PG_VERSION" main start
  fi
  local i
  for i in $(seq 1 30); do
    pg_isready -q -h 127.0.0.1 -p "$C2C_DB_PORT" && return 0
    sleep 1
  done
  c2c_log "BLOCKED: PostgreSQL did not accept connections on 127.0.0.1:$C2C_DB_PORT."
  return 1
}

# Generate the credentials once. Hex passwords need no URL encoding.
c2c_write_state() {
  install -d -m 700 "$C2C_CODESPACE_STATE"
  local owner_env="$C2C_CODESPACE_STATE/owner.env" app_env="$C2C_CODESPACE_STATE/app.env"
  if [[ ! -s "$owner_env" ]]; then
    local owner_pw app_pw
    owner_pw="$(openssl rand -hex 24)"; app_pw="$(openssl rand -hex 24)"
    ( umask 077
      cat >"$owner_env" <<EOF
# Concept2Cure Codespace: database OWNER credential. Provisioning only.
# Never source this into the app's environment (DB_OWNER_CREDENTIAL_IN_APP).
C2C_OWNER_PASSWORD=$owner_pw
DATABASE_OWNER_URL=postgresql://$C2C_DB_OWNER_ROLE:$owner_pw@127.0.0.1:$C2C_DB_PORT/$C2C_DB_NAME?sslmode=disable
APP_SERVICE_DB_PASSWORD=$app_pw
APP_DATABASE_URL=postgresql://app_service:$app_pw@127.0.0.1:$C2C_DB_PORT/$C2C_DB_NAME?sslmode=disable
EOF
    )
  fi
  if [[ ! -s "$app_env" ]]; then
    local app_url signer_pw
    app_url="$(sed -n 's/^APP_DATABASE_URL=//p' "$owner_env")"
    signer_pw="$(openssl rand -hex 12)"
    ( umask 077
      cat >"$app_env" <<EOF
# Concept2Cure Codespace: what the app runs with. No owner credential here.
C2C_DB_MODE=local
APP_DATABASE_URL=$app_url
JWT_SECRET=$(openssl rand -hex 32)
REFRESH_TOKEN_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
ALLOW_DEV_AUTH=1
VITE_DEV_LOGIN_EMAIL=$C2C_DEV_EMAIL
DEMO_SEED_EMAIL=$C2C_DEV_EMAIL
DEMO_AUTHOR_EMAIL=$C2C_DEV_EMAIL
DEMO_REVIEWER_EMAIL=$C2C_REVIEWER_EMAIL
DEMO_APPROVER_EMAIL=$C2C_APPROVER_EMAIL
DEMO_SIGNER_PASSWORD=$signer_pw
EOF
    )
  fi
  chmod 600 "$owner_env" "$app_env"
}

# Run a command with ONLY the owner credential file added, in a subshell.
c2c_with_owner_env() {
  ( set -a; . "$C2C_CODESPACE_STATE/owner.env"; set +a; "$@" )
}

# The owner role and the empty database (superuser: provision.mjs needs
# CREATE ROLE and CREATE EXTENSION). Idempotent; the password is aligned with
# owner.env on every run so a re-created state directory still works.
c2c_ensure_database() {
  local owner_pw
  owner_pw="$(sed -n 's/^C2C_OWNER_PASSWORD=//p' "$C2C_CODESPACE_STATE/owner.env")"
  c2c_as_postgres psql -q -X -v ON_ERROR_STOP=1 -p "$C2C_DB_PORT" -d postgres \
    -v role="$C2C_DB_OWNER_ROLE" -v pw="$owner_pw" -v db="$C2C_DB_NAME" >/dev/null <<'SQL'
SELECT format('CREATE ROLE %I LOGIN SUPERUSER', :'role')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN SUPERUSER PASSWORD %L', :'role', :'pw') \gexec
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L LC_COLLATE %L LC_CTYPE %L TEMPLATE template0',
              :'db', :'role', 'UTF8', 'C', 'C')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
SQL
}

# The existing one-command path: empty database -> readiness contract, as the
# owner; verified as app_service. Re-runs apply new migrations (deploy-migrate).
c2c_provision() {
  c2c_log "Provisioning the database (npm run db:provision; first run takes several minutes)."
  ( cd "$C2C_REPO_ROOT" && c2c_with_owner_env npm run --silent db:provision ) \
    >"$C2C_CODESPACE_STATE/provision.log" 2>&1 || {
      c2c_log "BLOCKED: database provisioning failed. Last lines of $C2C_CODESPACE_STATE/provision.log:"
      tail -n 25 "$C2C_CODESPACE_STATE/provision.log" | sed 's/:[0-9a-f]\{24,\}@/:***@/g'
      return 1
    }
  c2c_log "Database provisioned and verified as the app_service role."
}

# Sign-in accounts through the existing scripts/seed-admin.mjs (local
# database only; it refuses anything else). The author creates the development
# organisation; everyone else joins it. All are fictional. The roster is
# recorded in accounts.done, so a Codespace made before a name was added gets
# it on its next start (seed-admin is idempotent on this machine).
c2c_account_roster() {
  printf '%s\n' \
    "$C2C_DEV_EMAIL|Ana Author|" \
    "$C2C_REVIEWER_EMAIL|Rhea Reviewer|concept2cure" \
    "$C2C_APPROVER_EMAIL|Ava Approver|concept2cure" \
    "mo.monitor@concept2cure.pro|Mo Monitor|concept2cure" \
    "quinn.quality@concept2cure.pro|Quinn Quality|concept2cure" \
    "sam.stats@concept2cure.pro|Sam Statistician|concept2cure" \
    "cal.cmc@concept2cure.pro|Cal CMC|concept2cure"
}
c2c_accounts_current() {
  [[ -f "$C2C_CODESPACE_STATE/accounts.done" ]] &&
    [[ "$(cat "$C2C_CODESPACE_STATE/accounts.done")" == "$(c2c_account_roster)" ]]
}
c2c_seed_accounts() {
  local signer_pw owner_url email name slug
  signer_pw="$(sed -n 's/^DEMO_SIGNER_PASSWORD=//p' "$C2C_CODESPACE_STATE/app.env")"
  owner_url="$(sed -n 's/^DATABASE_OWNER_URL=//p' "$C2C_CODESPACE_STATE/owner.env")"
  while IFS='|' read -r email name slug; do
    ( cd "$C2C_REPO_ROOT" && c2c_with_owner_env env DATABASE_URL="$owner_url" \
        ADMIN_EMAIL="$email" ADMIN_NAME="$name" ADMIN_PASSWORD="$signer_pw" ADMIN_ORG_SLUG="$slug" \
        NODE_ENV=development node scripts/seed-admin.mjs ) >>"$C2C_CODESPACE_STATE/accounts.log" 2>&1 || {
      c2c_log "BLOCKED: could not create the account $email; see $C2C_CODESPACE_STATE/accounts.log"
      return 1
    }
  done < <(c2c_account_roster)
  c2c_account_roster >"$C2C_CODESPACE_STATE/accounts.done"
  c2c_log "Sign-in accounts ready: $(c2c_account_roster | cut -d'|' -f2 | paste -sd, - | sed 's/,/, /g')."
}

# node_modules matches package-lock.json only as of the last npm ci. A pull
# that changes the lockfile (a dependency upgrade) leaves the old tree behind,
# and the server can then fail at boot. The lockfile's hash is recorded at each
# install so a start can tell.
c2c_lock_hash() { sha256sum "$C2C_REPO_ROOT/package-lock.json" | cut -d' ' -f1; }
c2c_deps_current() {
  [[ -d "$C2C_REPO_ROOT/node_modules" ]] &&
    [[ "$(cat "$C2C_CODESPACE_STATE/npm-ci.lock-sha256" 2>/dev/null)" == "$(c2c_lock_hash)" ]]
}
c2c_install_deps() {
  ( cd "$C2C_REPO_ROOT" && npm ci ) || return 1
  [[ -d "$C2C_REPO_ROOT/node_modules" ]] || { c2c_log "BLOCKED: node_modules missing after npm ci"; return 1; }
  install -d -m 700 "$C2C_CODESPACE_STATE"
  c2c_lock_hash >"$C2C_CODESPACE_STATE/npm-ci.lock-sha256"
}

# The Lumen demonstration account (the founder, 2026-11-06: "create an account for Lumen … a biotech with multiple
# users"): its own organisation, three people. No real person's identity is built in (2026-10-15). The people come
# from Codespaces secrets when set, with fictional defaults otherwise, so the account always loads:
#   C2C_FOUNDER_EMAIL, C2C_FOUNDER_NAME   the lead; "Demo access" signs in as them
#   C2C_LUMEN_REVIEWER_NAME               the reviewer and second signer
#   C2C_LUMEN_APPROVER_NAME               the approver
# The reviewer's and approver's sign-in addresses are derived from their names at the non-deliverable
# lumen-demo.example. Everyone signs in with DEMO_SIGNER_PASSWORD (app.env).
C2C_LUMEN_ORG_SLUG="lumen-bioscience-demo"
C2C_LUMEN_ORG_NAME="Lumen Bioscience (demo)"
c2c_demo_address() {
  printf '%s@lumen-demo.example' "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/./g; s/^[.]+//; s/[.]+$//')"
}
c2c_lumen_roster() {
  local lead_name="${C2C_FOUNDER_NAME:-${C2C_FOUNDER_EMAIL:-Lumen Lead}}"
  local lead_email="${C2C_FOUNDER_EMAIL:-$(c2c_demo_address "$lead_name")}"
  local reviewer="${C2C_LUMEN_REVIEWER_NAME:-Lumen Reviewer}" approver="${C2C_LUMEN_APPROVER_NAME:-Lumen Approver}"
  printf '%s\n' "$lead_email|$lead_name|lead" \
    "$(c2c_demo_address "$reviewer")|$reviewer|reviewer" \
    "$(c2c_demo_address "$approver")|$approver|approver"
}
c2c_lumen_person() { c2c_lumen_roster | awk -F'|' -v r="$1" '$3 == r { print $1 }'; }
c2c_lumen_accounts_current() {
  [[ "$(cat "$C2C_CODESPACE_STATE/lumen-accounts.done" 2>/dev/null)" == "$(c2c_lumen_roster)" ]]
}
c2c_seed_lumen_accounts() {
  local signer_pw email name role
  signer_pw="$(sed -n 's/^DEMO_SIGNER_PASSWORD=//p' "$C2C_CODESPACE_STATE/app.env")"
  while IFS='|' read -r email name role; do
    ( cd "$C2C_REPO_ROOT" && c2c_with_owner_env env DATABASE_URL="$(sed -n 's/^DATABASE_OWNER_URL=//p' "$C2C_CODESPACE_STATE/owner.env")" \
        ADMIN_EMAIL="$email" ADMIN_NAME="$name" ADMIN_PASSWORD="$signer_pw" \
        ADMIN_ORG_SLUG="$C2C_LUMEN_ORG_SLUG" ADMIN_ORG_NAME="$C2C_LUMEN_ORG_NAME" \
        NODE_ENV=development node scripts/seed-admin.mjs ) >>"$C2C_CODESPACE_STATE/accounts.log" 2>&1 || {
      c2c_log "BLOCKED: could not create the Lumen $role account ($email); see $C2C_CODESPACE_STATE/accounts.log"
      return 1
    }
  done < <(c2c_lumen_roster)
  c2c_lumen_roster >"$C2C_CODESPACE_STATE/lumen-accounts.done"
  c2c_log "Lumen account ready: $C2C_LUMEN_ORG_NAME, with $(c2c_lumen_roster | cut -d'|' -f2 | paste -sd, - | sed 's/,/, /g')."
}

# The Lumen pack, seeded into that organisation as its lead, with its reviewer and approver as the second and third
# people (OQ_SIGNER_*, OQ_APPROVER_*), so its reviews, approvals and seals are signed. Again when scripts/demo or the
# people change; the pack is idempotent by title. $1 is the demo version (git rev-parse HEAD:scripts/demo).
c2c_seed_lumen_org() {
  local version pw
  version="$1|$(c2c_lumen_roster)"
  [[ "$(cat "$C2C_CODESPACE_STATE/lumen-seed.done" 2>/dev/null)" == "$version" ]] && return 0
  pw="$(sed -n 's/^DEMO_SIGNER_PASSWORD=//p' "$C2C_CODESPACE_STATE/app.env")"
  c2c_log "Seeding the Lumen account ($C2C_LUMEN_ORG_NAME) as $(c2c_lumen_person lead); log: $C2C_CODESPACE_STATE/lumen-seed.log"
  if DEMO_MANIFEST_ROOT="$C2C_CODESPACE_STATE/demo-manifests-lumen" \
      OQ_SIGNER_EMAIL="$(c2c_lumen_person reviewer)" OQ_SIGNER_PASSWORD="$pw" \
      OQ_APPROVER_EMAIL="$(c2c_lumen_person approver)" OQ_APPROVER_PASSWORD="$pw" \
      npm run --silent demo:seed -- --pack lumen --base-url "http://127.0.0.1:$C2C_PORT" --email "$(c2c_lumen_person lead)" \
      >"$C2C_CODESPACE_STATE/lumen-seed.log" 2>&1; then
    printf '%s\n' "$version" >"$C2C_CODESPACE_STATE/lumen-seed.done"
    c2c_log "Lumen account seeded: $(grep -o 'lumen pack: created [0-9]*, found [0-9]*' "$C2C_CODESPACE_STATE/lumen-seed.log" | tail -n 1)."
  else
    c2c_log "The Lumen seed did not finish; see $C2C_CODESPACE_STATE/lumen-seed.log. It re-runs on the next start."
  fi
}

# Every person "Demo access" offers (client DemoAccounts.tsx), as email|name|organisation|role entries separated by
# ";": the Lumen account's three people, then the development organisation's roster. Only accounts that exist.
c2c_demo_role() {
  case "$1" in
    "Ana Author") echo "Author: the CDISC CSR study, the C2C-101 IND, the NeuroPanel 510(k)" ;;
    "Rhea Reviewer") echo "Reviewer and second signer" ;;
    "Ava Approver") echo "Approver: approves and signs" ;;
    "Mo Monitor") echo "Clinical monitor: risk-based monitoring and site visits" ;;
    "Quinn Quality") echo "QA lead: SOPs, deviations, CAPA, audits" ;;
    "Sam Statistician") echo "Biostatistician: sample size, SAP, tables" ;;
    "Cal CMC") echo "CMC lead: Module 3, specifications, stability" ;;
    *) echo "Team member" ;;
  esac
}
c2c_demo_accounts() {
  local entries=() email name role slug
  if [[ -f "$C2C_CODESPACE_STATE/lumen-accounts.done" ]]; then
    while IFS='|' read -r email name role; do
      case "$role" in
        lead) role="Lead and author: the LMN-201 Phase 2 CSR, Lumen's projects" ;;
        reviewer) role="Reviewer and second signer" ;;
        approver) role="Approver: approves, signs and seals" ;;
      esac
      entries+=("$email|$name|$C2C_LUMEN_ORG_NAME|$role")
    done < <(c2c_lumen_roster)
  fi
  if [[ -f "$C2C_CODESPACE_STATE/accounts.done" ]]; then
    while IFS='|' read -r email name slug; do
      entries+=("$email|$name|Concept2Cure Therapeutics (demo)|$(c2c_demo_role "$name")")
    done < <(c2c_account_roster)
  fi
  (IFS=';'; printf '%s' "${entries[*]}")
}

c2c_post_create_main() {
  echo "C2C Codespace setup (Node.js 22, PostgreSQL $C2C_PG_VERSION + pgvector, local database)"
  node -e "if (Number(process.versions.node.split('.')[0]) !== 22) { console.error('Node.js 22 is required'); process.exit(1) }"
  test -f "$C2C_REPO_ROOT/package-lock.json" || { echo "BLOCKED: package-lock.json is missing"; exit 1; }
  cd "$C2C_REPO_ROOT"

  # Match CI: fail rather than allowing a partially installed npm tree to look
  # complete. Do not delete/change the lockfile to hide an install error.
  c2c_install_deps

  # Native self-tests do not use a credential or a database.
  npm run codespaces:doctor:test

  c2c_install_postgres
  c2c_start_postgres
  c2c_write_state
  c2c_ensure_database
  c2c_provision
  c2c_seed_accounts

  # Chromium for the CSR study preparation (a browser walk of the app). Best
  # effort: without it everything else still works.
  if node -e "process.exit(require('fs').existsSync(require('playwright').chromium.executablePath()) ? 0 : 1)" 2>/dev/null; then
    c2c_log "Chromium for the CSR study preparation is already installed."
  else
    npx --yes playwright install --with-deps chromium >/dev/null 2>&1 ||
      c2c_log "Chromium for the CSR study preparation could not be installed; post-start will skip that step."
  fi

  c2c_log "Setup complete. post-start starts the app on port 5000."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  c2c_post_create_main "$@"
fi
