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
SQL

# pgvector is a SEPARATE package (postgresql-${PG_VERSION}-pgvector) and is not
# always installed. Until now it was the last statement in the block above, under
# `ON_ERROR_STOP=1` and `set -e`, so on any machine without it this script died
# HERE — before writing .env and before creating a single table. The SessionStart
# hook runs this as `... >/dev/null 2>&1 || true`, so the failure was silent, and
# every fresh session began with no DATABASE_URL and an empty database. That is
# the state in which the product's surfaces report "the service didn't respond".
#
# Non-fatal now, and reported. The embedding features degrade without it; nothing
# else does.
if $PSQL -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1; then
  log "pgvector ready"
  PGVECTOR=1
else
  PGVECTOR=0
  err "pgvector unavailable — embedding features will degrade. Install it with:"
  err "  apt-get install -y postgresql-${PG_VERSION}-pgvector   (then re-run)"
  err "install-fresh will provision everything that does not need it and name"
  err "the objects it had to skip."
fi

# ── 5. Write .env (only if absent — never clobber an operator's config) ─────
if [ -f .env ]; then
  log ".env already present — leaving it untouched"
  if ! grep -q '^DATABASE_URL=' .env; then
    err ".env exists but has no DATABASE_URL. Add: DATABASE_URL=${DATABASE_URL}"
  fi
  # The sign-in card's dev-only "Demo access" button POSTs /api/auth/dev-login,
  # which server/auth/dev-auth-policy.ts gates behind NODE_ENV=development AND
  # ALLOW_DEV_AUTH=1. Without the flag the route answers 404 and the button
  # appears to do nothing — the reason the Wave 0 design review could not get
  # past the login page and screenshotted it for every surface it had changed.
  if ! grep -q '^ALLOW_DEV_AUTH=' .env; then
    err ".env exists but has no ALLOW_DEV_AUTH. The sign-in card's 'Demo access'"
    err "button will 404 without it. Add:  ALLOW_DEV_AUTH=1"
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

# Enables POST /api/auth/dev-login — the sign-in card's dev-only "Demo access"
# button (client/src/concept2cure/components/concept2cure-auth/Concept2CureLogin.tsx).
#
# The route is gated by server/auth/dev-auth-policy.ts → isDevAuthAllowed(),
# which requires BOTH NODE_ENV=development AND ALLOW_DEV_AUTH=1, and returns
# 404 otherwise. This file never ships: it is gitignored, local-only, and
# production injects its environment from the host. Setting the flag HERE does
# not weaken that gate — with NODE_ENV=production the route still refuses even
# with this set.
#
# It is written because the flag was the missing half: setup produced a dev
# environment whose only usable sign-in path was silently disabled, so the
# button did nothing and no session could be established to look at the product.
ALLOW_DEV_AUTH=1
ENV
fi

# ── 6. Provision the schema the application actually serves from ────────────
#
# This step used to run ensureCoreTables + ensureAuthTables and stop, and its
# epilogue said "Core + auth tables are ready (sufficient for most work)". That
# claim is what BP-W0-2 was.
#
# ensureCoreTables does not CREATE anything — it VERIFIES and reports. So on a
# fresh cluster this step wrote nothing at all, and the developer was told the
# database was ready. Booting the app against it produced exactly the symptom in
# the work order: "roughly half the specialist services do not load", six
# surfaces each with a user-facing error. Every one of them was a missing table.
#
# Even with tables, the out-of-band migration set (scripts/db/migration-set.mjs)
# adds columns the live queries read — `nonclinical_studies.duration_label` is
# the one that surfaced — so a database provisioned by install-fresh alone still
# answers 500 on the nonclinical registry. Diagnosed by probing all six services
# against a running server: five returned 200 once the schema existed, and the
# sixth returned 200 after deploy-migrate. None of them was a code defect.
#
# Both steps now run here, in order, and the script reports honestly if either
# is incomplete rather than printing a green line over a database the app cannot
# serve from.
#
# `--allow-incomplete` is deliberate: on a local cluster the governed-content
# tree needs roles a non-superuser cannot create, and refusing the whole install
# over that would put us back where we started. The verification below is what
# decides whether to claim success.
log "Provisioning application schema (install-fresh)"
if DATABASE_URL="$DATABASE_URL" NODE_ENV=development node scripts/db/install-fresh.mjs --allow-incomplete >/tmp/c2c-install.log 2>&1; then
  log "Application schema provisioned"
else
  err "install-fresh failed — see /tmp/c2c-install.log"
fi

log "Applying the out-of-band migration set (deploy-migrate)"
if DATABASE_URL="$DATABASE_URL" NODE_ENV=development node scripts/db/deploy-migrate.mjs >/tmp/c2c-migrate.log 2>&1; then
  log "Migration set applied"
else
  err "deploy-migrate failed — see /tmp/c2c-migrate.log"
fi

# ── 6b. Seed the account the dev sign-in actually uses ──────────────────────
# ALLOW_DEV_AUTH=1 only opens the route. /api/auth/dev-login then LOOKS UP the
# email it was given, and the sign-in card's "Demo access" button hardcodes
# jm.smith@concept2cure.pro — so on a freshly provisioned database, with the
# flag set and the route reachable, the button still answers
# 401 "User not found. Please sign up first." Seeding that user (idempotent
# upsert, plus its organization and admin membership) is the other half of a
# dev environment you can actually sign into and look at.
log "Seeding the demo admin account (scripts/seed-admin.mjs)"
SEEDED=0
if DATABASE_URL="$DATABASE_URL" NODE_ENV=development node scripts/seed-admin.mjs >/tmp/c2c-seed.log 2>&1; then
  SEEDED=1
  log "Demo account ready: jm.smith@concept2cure.pro"
else
  err "seed-admin failed — 'Demo access' will answer 401. See /tmp/c2c-seed.log"
fi

# ── 7. Verify, and say what is actually true ────────────────────────────────
# The point of this block is that the script must not report readiness it has
# not checked. It counts the tables the product's own route handlers read.
TABLES=$($PSQL -d "$DB_NAME" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo 0)
MISSING=$($PSQL -d "$DB_NAME" -tAc "
  SELECT count(*) FROM (VALUES
    ('organizations'),('users'),('regulatory_programs'),('authoring_documents'),
    ('authoring_sections'),('nonclinical_studies'),('unified_tasks')
  ) AS required(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name = required.name
  )" 2>/dev/null || echo 99)

# ── Done ─────────────────────────────────────────────────────────────────────
log "Local PostgreSQL ready."
log "  DATABASE_URL=${DATABASE_URL}"
log "  data dir:    ${DATADIR}"
log "  logs:        ${LOGFILE}"
log "  tables:      ${TABLES}"
if [ "$MISSING" = "0" ]; then
  log "Every core route table is present — the app can serve from this database."
else
  err "${MISSING} core route table(s) MISSING. The app will boot and its"
  err "specialist surfaces will report that services did not respond."
  err "See /tmp/c2c-install.log and /tmp/c2c-migrate.log."
fi

if [ "${PGVECTOR:-0}" = "1" ]; then
  log "  pgvector:    installed"
else
  err "pgvector is NOT installed. Everything that does not need it was"
  err "provisioned; the vector-dependent tables were skipped and are named at"
  err "the end of /tmp/c2c-install.log. Embedding storage and similarity"
  err "search are unavailable until you install postgresql-${PG_VERSION}-pgvector"
  err "and re-run this script."
fi

# ── 8. How to sign in ───────────────────────────────────────────────────────
# A provisioned database nobody can log into is not a usable dev environment.
# State the exact path, and state it only when both halves are actually true.
if grep -q '^ALLOW_DEV_AUTH=1' .env 2>/dev/null && [ "${SEEDED:-0}" = "1" ]; then
  log "Dev sign-in is available:"
  log "  the 'Demo access' button on the sign-in card (POST /api/auth/dev-login)"
  log "  or email jm.smith@concept2cure.pro / password 'pass-word'."
  log "  ALLOW_DEV_AUTH=1 is set in .env; the route stays 404 in any environment"
  log "  where NODE_ENV is not 'development' (server/auth/dev-auth-policy.ts)."
else
  err "Dev sign-in is NOT usable: ALLOW_DEV_AUTH=1 in .env and a seeded"
  err "jm.smith@concept2cure.pro are BOTH required. /api/auth/dev-login answers"
  err "404 without the flag and 401 without the user."
fi
