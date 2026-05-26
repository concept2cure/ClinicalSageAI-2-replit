#!/usr/bin/env bash
# ============================================================================
# setup-local-db.sh — stand up a local PostgreSQL for development / build agents
#
# WHY THIS EXISTS
#   The app refuses to do anything useful without a database: server/db/runtime.ts
#   sets `pool = null` when no connection string is present, and every
#   DB-touching call then throws "Database connection not available". Build
#   agents and fresh checkouts that have no DATABASE_URL hit exactly that —
#   the "there is no DB" failure.
#
#   This script provisions a local PostgreSQL 16 instance, creates the app
#   role/database/schemas/extensions, writes a dev .env pointing at it, and
#   lets the app's own boot-time bootstrap (ensureCoreTables + ensureAuthTables)
#   create the working table set on first run.
#
# WHAT IT IS NOT
#   Not for production. Production injects DATABASE_URL + JWT secrets via the
#   host environment. This is dev/CI/build-agent scaffolding only.
#
# USAGE
#   bash scripts/setup-local-db.sh            # provision + start + write .env
#   bash scripts/setup-local-db.sh --status   # report whether it's up
#
# IDEMPOTENT: safe to re-run. Re-running starts the server if stopped and
# leaves an existing .env untouched.
# ============================================================================
set -euo pipefail

PG_VERSION="${PG_VERSION:-16}"
PG_BIN="/usr/lib/postgresql/${PG_VERSION}/bin"
DATADIR="${C2C_PGDATA:-/var/lib/postgresql/c2c-local}"
PG_PORT="${C2C_PGPORT:-5432}"
PG_HOST="127.0.0.1"
DB_NAME="${C2C_DBNAME:-clinicalsage}"
DB_USER="${C2C_DBUSER:-c2c}"
DB_PASS="${C2C_DBPASS:-c2c_local}"
LOGFILE="/tmp/c2c-pg.log"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${PG_HOST}:${PG_PORT}/${DB_NAME}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf '\033[0;34m[setup-local-db]\033[0m %s\n' "$1"; }
err() { printf '\033[0;31m[setup-local-db] ERROR:\033[0m %s\n' "$1" >&2; }

if [ "${1:-}" = "--status" ]; then
  if pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
    log "PostgreSQL is UP on ${PG_HOST}:${PG_PORT}"
    log "DATABASE_URL=${DATABASE_URL}"
    exit 0
  fi
  err "PostgreSQL is NOT running on ${PG_HOST}:${PG_PORT}"
  exit 1
fi

# ── 1. Locate the PostgreSQL binaries ───────────────────────────────────────
if [ ! -x "${PG_BIN}/initdb" ]; then
  err "PostgreSQL ${PG_VERSION} not found at ${PG_BIN}."
  err "Install it: apt-get install -y postgresql-${PG_VERSION} postgresql-${PG_VERSION}-pgvector"
  exit 1
fi

# ── 2. initdb (once) ─────────────────────────────────────────────────────────
# initdb / postgres refuse to run as root, so run cluster ops as the
# `postgres` system user that the postgresql package creates.
RUN_AS_PG="sudo -u postgres"
if [ "$(id -un)" = "postgres" ]; then RUN_AS_PG=""; fi

if [ ! -s "${DATADIR}/PG_VERSION" ]; then
  log "Initializing cluster at ${DATADIR}"
  install -d -o postgres -g postgres "$(dirname "$DATADIR")" 2>/dev/null || true
  $RUN_AS_PG rm -rf "$DATADIR" 2>/dev/null || true
  $RUN_AS_PG "${PG_BIN}/initdb" -D "$DATADIR" -U postgres --auth=trust -E UTF8 >/dev/null
else
  log "Cluster already initialized at ${DATADIR}"
fi

# ── 3. Start the server (if not already accepting connections) ──────────────
if pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
  log "PostgreSQL already accepting connections on :${PG_PORT}"
else
  log "Starting PostgreSQL on :${PG_PORT}"
  $RUN_AS_PG "${PG_BIN}/pg_ctl" -D "$DATADIR" -o "-p ${PG_PORT} -k /tmp" -l "$LOGFILE" start >/dev/null
  for _ in $(seq 1 15); do
    pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1 && break
    sleep 1
  done
fi
pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1 || { err "PostgreSQL failed to start (see ${LOGFILE})"; exit 1; }

# ── 4. Role + database + schemas + extensions (idempotent) ──────────────────
export PAGER=cat PSQL_PAGER=cat
PSQL="psql -h ${PG_HOST} -p ${PG_PORT} -U postgres -q -v ON_ERROR_STOP=1"

log "Ensuring role '${DB_USER}' and database '${DB_NAME}'"
$PSQL >/dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}' CREATEDB;
  END IF;
END \$\$;
SQL
if ! $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  $PSQL >/dev/null -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
fi

log "Ensuring schemas + extensions"
$PSQL -d "$DB_NAME" >/dev/null <<SQL
CREATE SCHEMA IF NOT EXISTS vault AUTHORIZATION ${DB_USER};
CREATE SCHEMA IF NOT EXISTS precedent AUTHORIZATION ${DB_USER};
GRANT ALL ON SCHEMA public TO ${DB_USER};
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
SQL

# ── 5. Write .env (only if absent — never clobber an operator's config) ─────
if [ -f .env ]; then
  log ".env already present — leaving it untouched"
  if ! grep -q '^DATABASE_URL=' .env; then
    err ".env exists but has no DATABASE_URL. Add: DATABASE_URL=${DATABASE_URL}"
  fi
else
  log "Writing dev .env"
  cat > .env <<ENV
# Local development environment — generated by scripts/setup-local-db.sh.
# Points at the local PostgreSQL ${PG_VERSION} instance under ${DATADIR}.
# NOT for production. Real deployments inject these via the host env.

NODE_ENV=development
DATABASE_URL=${DATABASE_URL}

# JWT dev secrets (>=32 chars, as server/config/environment.ts requires).
JWT_SECRET=dev_local_jwt_secret_change_me_0123456789abcdef
JWT_SECRET_DEV=dev_local_jwt_secret_change_me_0123456789abcdef

# RLS rollout is off (shadow) in dev; see server/db/rlsEnforcement.ts.
RLS_ENFORCE=off
ENV
fi

# ── 6. Populate the working table set via the app's own bootstrap ───────────
# ensureCoreTables + ensureAuthTables are idempotent (CREATE TABLE IF NOT
# EXISTS) and are what the server runs on boot. Running them here means the
# DB is usable immediately without booting the full server.
log "Bootstrapping core + auth tables"
DATABASE_URL="$DATABASE_URL" NODE_ENV=development npx tsx -e "
import { ensureCoreTables } from './server/db/ensureCoreTables';
import { ensureAuthTables } from './server/db/bootstrap/index';
(async () => {
  await ensureCoreTables(process.env.DATABASE_URL);
  await ensureAuthTables();
  process.exit(0);
})().catch(e => { console.error(e?.message || e); process.exit(1); });
" >/dev/null 2>&1 && log "Core + auth tables ready" || err "Bootstrap step failed (DB is up; run the server to retry table creation)"

# ── Done ─────────────────────────────────────────────────────────────────────
log "Local PostgreSQL ready."
log "  DATABASE_URL=${DATABASE_URL}"
log "  data dir:    ${DATADIR}"
log "  logs:        ${LOGFILE}"
log "Full schema (all ~200 tables incl. CDISC reference): npm run db:push"
log "  (note: db:push currently halts on a pre-existing FK in the CDISC"
log "   reference tables — cdiscCdashFields → cdiscCdashForms; the core +"
log "   auth bootstrap above is sufficient for most work.)"
