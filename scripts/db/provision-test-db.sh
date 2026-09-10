#!/usr/bin/env bash
# ============================================================================
# provision-test-db.sh — build a deploy-shaped database to test against
#
# WHY THIS EXISTS
#   Three of this repository's schema gates can only be answered by a real,
#   fully-provisioned PostgreSQL: ci:tables-live-schema, the RLS coverage
#   checks, and the whole tests/db/*.dbtest.ts tier. CI has had that database
#   since the `blank-db-provisioning` job was written (.github/workflows/ci.yml).
#   A developer did not, so those answers were reachable only by pushing.
#
#   That gap cost something concrete on 2026-09-10. Retiring the duplicate
#   migrations/0010 removed the ONLY creator of `contradiction_links` from
#   install-fresh — and ci:duplicate-table-ddl went 51 -> 47, ci:unbacked-tables
#   stayed green, and every schema-contract test passed. Nothing in the
#   repository could see it, because the question "does this table exist after a
#   real provisioning run" is not a question about the repository. A live
#   database found it in one command.
#
#   This script is that command.
#
# WHAT IT DOES — deliberately the same sequence CI runs, so a local green and a
# CI green mean the same thing (ci.yml, "Provision a deploy-shaped database for
# the real-database tests"):
#
#     scripts/setup-local-db.sh   cluster up (idempotent; its own concern)
#     DROP + CREATE <test db>     always from empty — see below
#     install-fresh.mjs           drizzle push + raw overlay + RLS + gcc tree
#     deploy-migrate.mjs          the out-of-band C2C set (RULE 1 replay)
#
#   install-fresh provisions the non-superuser `app_service` role itself at step
#   7/8, so this only has to hand it APP_SERVICE_DB_PASSWORD.
#
# WHY IT ALWAYS DROPS
#   A database carried forward across runs accumulates tables from DDL no deploy
#   will ever reproduce — which is the drift being measured. Reusing one would
#   make this harness lie in the reassuring direction.
#
# USAGE
#   bash scripts/db/provision-test-db.sh              # provision, then print the env
#   bash scripts/db/provision-test-db.sh --status     # is it there, and how big
#   C2C_TESTDB=other_name bash scripts/db/provision-test-db.sh
#
#   --allow-incomplete   pass through to install-fresh; see pgvector below.
#
# PGVECTOR IS REQUIRED, NOT OPTIONAL
#   Without postgresql-16-pgvector, install-fresh skips ~100 vector-dependent
#   objects and 11 governed-content files, and SAYS SO — it does not pretend to
#   have succeeded. But a harness built on that database answers
#   ci:tables-live-schema with ~100 false absences, which is worse than no
#   answer. So this refuses to proceed without it unless --allow-incomplete is
#   passed explicitly.
#     apt-get install -y postgresql-16-pgvector
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

PG_VERSION="${PG_VERSION:-16}"
PG_HOST="${C2C_PGHOST:-127.0.0.1}"
PG_PORT="${C2C_PGPORT:-5432}"
TEST_DB="${C2C_TESTDB:-c2c_testdb}"
ADMIN_URL="postgresql://postgres@${PG_HOST}:${PG_PORT}/postgres"
TEST_URL="postgresql://postgres@${PG_HOST}:${PG_PORT}/${TEST_DB}?sslmode=disable"

# Local-only, and never a production credential: this database is dropped and
# rebuilt on every run. It exists so install-fresh mints `app_service` as
# LOGIN NOSUPERUSER NOBYPASSRLS — without it the runtime connects as the OWNER,
# and an owner bypasses RLS unless the table carries FORCE, so every
# tenant-isolation test in tests/db/ would pass while proving nothing.
APP_SERVICE_DB_PASSWORD="${APP_SERVICE_DB_PASSWORD:-local-testdb-app-service-password}"

ALLOW_INCOMPLETE=0
for arg in "$@"; do [ "$arg" = "--allow-incomplete" ] && ALLOW_INCOMPLETE=1; done

log()  { printf '\033[0;34m[provision-test-db]\033[0m %s\n' "$1"; }
err()  { printf '\033[0;31m[provision-test-db] ERROR:\033[0m %s\n' "$1" >&2; }
step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }

export PAGER=cat PSQL_PAGER=cat

tables_in_test_db() {
  psql "$ADMIN_URL" -tAc \
    "SELECT count(*) FROM pg_database WHERE datname = '${TEST_DB}'" 2>/dev/null | grep -q 1 || { echo "absent"; return; }
  psql "postgresql://postgres@${PG_HOST}:${PG_PORT}/${TEST_DB}" -tAc \
    "SELECT count(*) FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog','information_schema')" 2>/dev/null || echo "?"
}

# ── --status ────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--status" ]; then
  if ! pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
    err "PostgreSQL is not accepting connections on ${PG_HOST}:${PG_PORT}"
    exit 1
  fi
  log "PostgreSQL is up on ${PG_HOST}:${PG_PORT}"
  COUNT="$(tables_in_test_db)"
  if [ "$COUNT" = "absent" ]; then
    log "${TEST_DB}: does not exist — run without --status to provision it"
  else
    log "${TEST_DB}: ${COUNT} base table(s)"
  fi
  exit 0
fi

# ── 1. Cluster ──────────────────────────────────────────────────────────────
# Delegated entirely to setup-local-db.sh rather than reimplemented: cluster
# bring-up is its job, it is idempotent, and duplicating initdb/pg_ctl here is
# how the two drift apart.
step "1/4  PostgreSQL cluster"
if pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
  log "already accepting connections on :${PG_PORT}"
else
  log "starting via scripts/setup-local-db.sh"
  bash scripts/setup-local-db.sh >/dev/null
  pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1 || {
    err "cluster did not come up; see /tmp/c2c-pg.log"; exit 1; }
fi

# ── 2. pgvector ─────────────────────────────────────────────────────────────
step "2/4  pgvector"
if psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_available_extensions WHERE name = 'vector'" | grep -q 1; then
  log "available"
elif [ "$ALLOW_INCOMPLETE" = "1" ]; then
  err "NOT available — continuing because --allow-incomplete was passed."
  err "install-fresh will skip the vector-dependent objects and name them."
  err "Do NOT read ci:tables-live-schema off the result: it will report ~100"
  err "absences that are this missing extension, not schema defects."
else
  err "postgresql-${PG_VERSION}-pgvector is not installed."
  err "The schema needs CREATE EXTENSION vector; without it install-fresh skips"
  err "~100 objects and 11 governed-content files, and a harness built on that"
  err "answers ci:tables-live-schema with ~100 FALSE absences."
  err ""
  err "  apt-get install -y postgresql-${PG_VERSION}-pgvector"
  err ""
  err "Or re-run with --allow-incomplete if you accept the above."
  exit 1
fi

# ── 3. A database from empty ────────────────────────────────────────────────
step "3/4  ${TEST_DB} — dropped and recreated"
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"${TEST_DB}\" WITH (FORCE)" \
  -c "CREATE DATABASE \"${TEST_DB}\"" >/dev/null
log "created (0 tables)"

# ── 4. The real provisioning path ───────────────────────────────────────────
step "4/4  install-fresh, then deploy-migrate"
export DATABASE_URL="$TEST_URL"
export APP_SERVICE_DB_PASSWORD

log "install-fresh (several minutes — drizzle push, raw overlay, RLS, gcc tree)"
node scripts/db/install-fresh.mjs ${ALLOW_INCOMPLETE:+--allow-incomplete}

log "deploy-migrate (the out-of-band C2C set)"
node scripts/db/deploy-migrate.mjs

# ── Report ──────────────────────────────────────────────────────────────────
COUNT="$(tables_in_test_db)"
ROLE_OK="$(psql "$TEST_URL" -tAc \
  "SELECT CASE WHEN rolsuper OR rolbypassrls THEN 'BYPASSES RLS' ELSE 'ok' END
     FROM pg_roles WHERE rolname = '${APP_SERVICE_DB_ROLE:-app_service}'" 2>/dev/null || echo 'absent')"

printf '\n\033[0;32m✅ %s provisioned — %s base tables\033[0m\n' "$TEST_DB" "$COUNT"
printf '   app_service role: %s\n' "$ROLE_OK"
cat <<ENVBLOCK

Run the live-database suites against it:

  export DATABASE_URL='${TEST_URL}'
  export TEST_DATABASE_URL='${TEST_URL}'
  export RLS_ENFORCE=on
  npm run test:db
  npm run ci:tables-live-schema

RLS_ENFORCE=on matters. The canonical policy's first USING clause is
  NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
so with it unset the policy passes everything and an isolation test proves
nothing.
ENVBLOCK
