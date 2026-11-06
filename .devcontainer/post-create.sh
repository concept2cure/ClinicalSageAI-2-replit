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
c2c_sudo() { if [[ "$(id -u)" == "0" ]]; then "$@"; else sudo -n "$@"; fi; }
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
  c2c_sudo apt-get update -qq
  if ! apt-cache show "postgresql-$C2C_PG_VERSION-pgvector" >/dev/null 2>&1; then
    local codename
    codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-}")"
    [[ -n "$codename" ]] || { c2c_log "BLOCKED: cannot read the OS codename for the PostgreSQL apt repository."; return 1; }
    c2c_log "Adding the PostgreSQL apt repository (apt.postgresql.org, $codename-pgdg)."
    c2c_sudo apt-get install -y -qq ca-certificates curl >/dev/null
    c2c_sudo install -d /usr/share/postgresql-common/pgdg
    c2c_sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $codename-pgdg main" |
      c2c_sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
    c2c_sudo apt-get update -qq
  fi
  c2c_sudo apt-get install -y -qq "${pkgs[@]}" >/dev/null
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
# organisation; reviewer and approver join it.
c2c_seed_accounts() {
  local signer_pw
  signer_pw="$(sed -n 's/^DEMO_SIGNER_PASSWORD=//p' "$C2C_CODESPACE_STATE/app.env")"
  local who email name slug
  for who in author reviewer approver; do
    case "$who" in
      author)   email="$C2C_DEV_EMAIL";      name="Ana Author";    slug="" ;;
      reviewer) email="$C2C_REVIEWER_EMAIL"; name="Rhea Reviewer"; slug="concept2cure" ;;
      approver) email="$C2C_APPROVER_EMAIL"; name="Ava Approver";  slug="concept2cure" ;;
    esac
    ( cd "$C2C_REPO_ROOT" && c2c_with_owner_env env DATABASE_URL="$(sed -n 's/^DATABASE_OWNER_URL=//p' "$C2C_CODESPACE_STATE/owner.env")" \
        ADMIN_EMAIL="$email" ADMIN_NAME="$name" ADMIN_PASSWORD="$signer_pw" ADMIN_ORG_SLUG="$slug" \
        NODE_ENV=development node scripts/seed-admin.mjs ) >>"$C2C_CODESPACE_STATE/accounts.log" 2>&1 || {
      c2c_log "BLOCKED: could not create the $who account ($email); see $C2C_CODESPACE_STATE/accounts.log"
      return 1
    }
  done
  touch "$C2C_CODESPACE_STATE/accounts.done"
  c2c_log "Sign-in accounts ready: $C2C_DEV_EMAIL (author), $C2C_REVIEWER_EMAIL, $C2C_APPROVER_EMAIL."
}

c2c_post_create_main() {
  echo "C2C Codespace setup (Node.js 22, PostgreSQL $C2C_PG_VERSION + pgvector, local database)"
  node -e "if (Number(process.versions.node.split('.')[0]) !== 22) { console.error('Node.js 22 is required'); process.exit(1) }"
  test -f "$C2C_REPO_ROOT/package-lock.json" || { echo "BLOCKED: package-lock.json is missing"; exit 1; }
  cd "$C2C_REPO_ROOT"

  # Match CI: fail rather than allowing a partially installed npm tree to look
  # complete. Do not delete/change the lockfile to hide an install error.
  npm ci
  test -d node_modules || { echo "BLOCKED: node_modules missing after npm ci"; exit 1; }

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
