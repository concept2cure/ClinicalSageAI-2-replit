#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

die() { printf 'DR restore drill refused: %s\n' "$*" >&2; exit 64; }
need() { command -v "$1" >/dev/null || die "required PostgreSQL tool not found: $1"; }
db_name() { local u=${1%%\?*}; printf '%s' "${u##*/}"; }
db_host() { local u=${1#*://}; u=${u#*@}; u=${u%%/*}; u=${u%%:*}; printf '%s' "$u"; }
db_user() { local u=${1#*://}; [[ $u == *@* ]] || return 1; u=${u%%@*}; u=${u%%:*}; printf '%s' "$u"; }
schema_fingerprint() {
  pg_dump --schema-only --no-owner --no-acl "$1" |
    sed -E '/^--/d; /^\\restrict /d; /^\\unrestrict /d; /^$/d' |
    sha256sum | awk '{print $1}'
}

guard() {
  local source_url=${DR_SOURCE_DATABASE_URL:-} target_url=${DR_TARGET_DATABASE_URL:-}
  [[ -n $source_url && -n $target_url ]] || die 'DR_SOURCE_DATABASE_URL and DR_TARGET_DATABASE_URL are required'
  [[ $source_url != "$target_url" ]] || die 'source and restore target must differ'
  local source_db target_db source_host target_host
  source_db=$(db_name "$source_url"); target_db=$(db_name "$target_url")
  source_host=$(db_host "$source_url"); target_host=$(db_host "$target_url")
  [[ $source_db =~ ^c2c_dr_[a-z0-9_]+$ && $target_db =~ ^c2c_dr_[a-z0-9_]+$ ]] ||
    die 'database names must use the c2c_dr_ prefix and lowercase identifier characters'
  [[ $target_db != postgres && $target_db != template0 && $target_db != template1 ]] || die 'system database target forbidden'
  local combined=${source_url,,}' '${target_url,,}
  [[ ! $combined =~ (prod|production|customer|neon\.tech|amazonaws\.com|azure\.com|cloudsql) ]] ||
    die 'production/cloud-looking database endpoint forbidden'
  if [[ ! $source_host =~ ^(localhost|127\.0\.0\.1|::1|postgres)$ || ! $target_host =~ ^(localhost|127\.0\.0\.1|::1|postgres)$ ]]; then
    [[ ${DR_ALLOW_NON_EPHEMERAL:-} == I_ACKNOWLEDGE_DESTRUCTIVE_DRILL && ${DR_OVERRIDE_TICKET:-} =~ ^[A-Za-z0-9._/-]{4,80}$ ]] ||
      die 'non-ephemeral endpoint requires DR_ALLOW_NON_EPHEMERAL=I_ACKNOWLEDGE_DESTRUCTIVE_DRILL and an auditable DR_OVERRIDE_TICKET'
    DR_ENVIRONMENT_CLASS=approved-non-ephemeral-lab
    DR_AUDIT_TICKET=$DR_OVERRIDE_TICKET
    DR_OVERRIDE_AT=$(date -u +%FT%TZ)
    printf 'AUDIT non-ephemeral override ticket=%s utc=%s operator=%s\n' "$DR_AUDIT_TICKET" "$DR_OVERRIDE_AT" "${USER:-unknown}" >&2
  else
    DR_ENVIRONMENT_CLASS=ephemeral-local-ci
    DR_AUDIT_TICKET=not-required
    DR_OVERRIDE_AT=not-required
  fi
}

guard_admin() {
  local admin_url=${DR_TARGET_ADMIN_URL:-} app_url=${DR_APP_DATABASE_URL:-}
  [[ -n $admin_url ]] || die 'DR_TARGET_ADMIN_URL (same ephemeral cluster, maintenance database) is required'
  [[ -n $app_url ]] || die 'DR_APP_DATABASE_URL for the non-superuser readiness session is required'
  [[ $(db_host "$admin_url") == "$(db_host "$DR_TARGET_DATABASE_URL")" ]] || die 'maintenance URL host must exactly match target host'
  [[ $(db_name "$admin_url") == postgres ]] || die 'maintenance URL must name the postgres database'
  [[ ${admin_url,,} != *prod* && ${admin_url,,} != *customer* && ${admin_url,,} != *cloudsql* ]] || die 'production-looking maintenance endpoint forbidden'
  [[ $(db_host "$app_url") == "$(db_host "$DR_TARGET_DATABASE_URL")" && $(db_name "$app_url") == "$(db_name "$DR_TARGET_DATABASE_URL")" ]] || die 'application URL must exactly match the restore target host and database'
  [[ $(db_user "$app_url") == c2c_dr_app ]] || die 'application URL must authenticate directly as c2c_dr_app'
}

if [[ ${1:-} == --check-guardrails ]]; then guard; guard_admin; printf 'guardrails accepted ephemeral DR endpoints\n'; exit 0; fi
guard
guard_admin
for tool in pg_dump pg_restore psql createdb dropdb sha256sum; do need "$tool"; done

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
EVIDENCE_DIR=${DR_EVIDENCE_DIR:-"$ROOT/.dr-evidence"}
[[ $EVIDENCE_DIR == "$ROOT"/* ]] || die 'DR_EVIDENCE_DIR must be a contained repository path'
mkdir -p "$EVIDENCE_DIR"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/c2c-dr.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
BACKUP="$WORK/database.dump"
META="$EVIDENCE_DIR/dr-evidence.json"
TARGET_DB=$(db_name "$DR_TARGET_DATABASE_URL")
TARGET_ADMIN_URL=$DR_TARGET_ADMIN_URL
START_EPOCH=$(date +%s%3N); BACKUP_START=$(date -u +%FT%TZ)

# The passwordless login role exists only in the disposable cluster and models application RLS grants.
psql "$DR_SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='c2c_dr_app') THEN CREATE ROLE c2c_dr_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF; END \$\$;"
psql "$DR_SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/ops/dr-fixture.sql"
SERVER_VERSION=$(psql "$DR_SOURCE_DATABASE_URL" -Atqc 'show server_version')
CLIENT_VERSION=$(pg_dump --version | tr -d '\n')
RESTORE_CLIENT_VERSION=$(pg_restore --version | tr -d '\n')
SOURCE_SCHEMA_FINGERPRINT=$(schema_fingerprint "$DR_SOURCE_DATABASE_URL")
SOURCE_COUNTS=$(psql "$DR_SOURCE_DATABASE_URL" -Atqc "SELECT json_build_object('tenants',count(*),'regulated_records',(SELECT count(*) FROM dr_proof.regulated_records),'audit_events',(SELECT count(*) FROM dr_proof.audit_events),'object_references',(SELECT count(*) FROM dr_proof.object_references)) FROM dr_proof.tenants")
SOURCE_MARK=$(psql "$DR_SOURCE_DATABASE_URL" -Atqc "SELECT (extract(epoch FROM max(applied_at))*1000)::bigint FROM dr_proof.schema_migrations")
pg_dump --format=custom --compress=9 --no-owner --no-acl --file="$BACKUP" "$DR_SOURCE_DATABASE_URL"
BACKUP_END=$(date -u +%FT%TZ); BACKUP_END_EPOCH=$(date +%s%3N); BACKUP_SHA=$(sha256sum "$BACKUP" | awk '{print $1}')
printf '%s  %s\n' "$BACKUP_SHA" "$BACKUP" | sha256sum --check --status || die 'backup checksum verification failed before restore'

# Materialize a disposable target marker, then destroy only the exact, prefix-validated
# target. A changed database OID proves replacement rather than an in-place restore.
if ! psql "$DR_TARGET_DATABASE_URL" -Atqc 'select 1' >/dev/null 2>&1; then
  createdb --maintenance-db="$TARGET_ADMIN_URL" "$TARGET_DB"
fi
psql "$DR_TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS public.dr_target_destruction_marker(id int PRIMARY KEY); INSERT INTO public.dr_target_destruction_marker VALUES (1) ON CONFLICT DO NOTHING;' >/dev/null
OLD_TARGET_OID=$(psql "$TARGET_ADMIN_URL" -Atqc "SELECT oid FROM pg_database WHERE datname='$TARGET_DB'")
RECOVERY_START_EPOCH=$(date +%s%3N)
dropdb --if-exists --force --maintenance-db="$TARGET_ADMIN_URL" "$TARGET_DB"
createdb --maintenance-db="$TARGET_ADMIN_URL" "$TARGET_DB"
NEW_TARGET_OID=$(psql "$TARGET_ADMIN_URL" -Atqc "SELECT oid FROM pg_database WHERE datname='$TARGET_DB'")
[[ -n $OLD_TARGET_OID && -n $NEW_TARGET_OID && $OLD_TARGET_OID != "$NEW_TARGET_OID" ]] || die 'target replacement proof failed'
pg_restore --exit-on-error --no-owner --no-acl --dbname="$DR_TARGET_DATABASE_URL" "$BACKUP"

VERIFY_SQL="$WORK/verify.sql"
cat >"$VERIFY_SQL" <<'SQL'
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT count(*) FROM dr_proof.tenants) <> 2 THEN RAISE EXCEPTION 'tenant count mismatch'; END IF;
 IF (SELECT count(*) FROM dr_proof.users) <> 2 THEN RAISE EXCEPTION 'user count mismatch'; END IF;
 IF EXISTS (SELECT FROM dr_proof.regulated_records WHERE content_sha256 <> encode(digest(content,'sha256'),'hex')) THEN RAISE EXCEPTION 'content hash mismatch'; END IF;
 IF EXISTS (SELECT FROM dr_proof.object_references WHERE payload_sha256 <> encode(digest(payload,'sha256'),'hex')) THEN RAISE EXCEPTION 'object hash mismatch'; END IF;
 IF EXISTS (SELECT FROM dr_proof.users u LEFT JOIN dr_proof.tenants t ON t.id=u.tenant_id WHERE t.id IS NULL) THEN RAISE EXCEPTION 'tenant relationship broken'; END IF;
 IF EXISTS (SELECT FROM dr_proof.audit_events a WHERE a.event_hash <> encode(digest(a.sequence_no||'|'||a.tenant_id||'|'||a.action||'|'||a.previous_hash,'sha256'),'hex')) THEN RAISE EXCEPTION 'audit event hash mismatch'; END IF;
 IF EXISTS (SELECT FROM dr_proof.audit_events a JOIN dr_proof.audit_events p ON a.sequence_no=p.sequence_no+1 WHERE a.previous_hash<>p.event_hash) THEN RAISE EXCEPTION 'audit chain link mismatch'; END IF;
 IF NOT EXISTS (SELECT FROM dr_proof.schema_migrations WHERE version='wo-04-dr-proof-v1') THEN RAISE EXCEPTION 'migration level mismatch'; END IF;
END $$;
SET ROLE c2c_dr_app;
SELECT set_config('app.tenant_id','10000000-0000-4000-8000-000000000001',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM dr_proof.users) <> 1 THEN RAISE EXCEPTION 'authenticated RLS read failed'; END IF;
 IF (SELECT count(*) FROM dr_proof.regulated_records) <> 1 THEN RAISE EXCEPTION 'application readiness read failed'; END IF;
END $$;
SQL
psql "$DR_TARGET_DATABASE_URL" -f "$VERIFY_SQL"
DR_RESTORED_DATABASE_URL="$DR_APP_DATABASE_URL" node "$ROOT/scripts/ops/dr-application-readiness.mjs"
SCHEMA_FINGERPRINT=$(schema_fingerprint "$DR_TARGET_DATABASE_URL")
[[ $SCHEMA_FINGERPRINT == "$SOURCE_SCHEMA_FINGERPRINT" ]] || die 'source/restored schema fingerprints differ'
RESTORED_COUNTS=$(psql "$DR_TARGET_DATABASE_URL" -Atqc "SELECT json_build_object('tenants',count(*),'regulated_records',(SELECT count(*) FROM dr_proof.regulated_records),'audit_events',(SELECT count(*) FROM dr_proof.audit_events),'object_references',(SELECT count(*) FROM dr_proof.object_references)) FROM dr_proof.tenants")
[[ $RESTORED_COUNTS == "$SOURCE_COUNTS" ]] || die 'source/restored row-count manifest differs'
END_EPOCH=$(date +%s%3N); RTO_MS=$((END_EPOCH-RECOVERY_START_EPOCH)); RPO_MS=$((BACKUP_END_EPOCH-SOURCE_MARK))
cat >"$META" <<JSON
{"proof":"WO-04","data_class":"synthetic-only","environment_class":"$DR_ENVIRONMENT_CLASS","override_ticket":"$DR_AUDIT_TICKET","override_recorded_at":"$DR_OVERRIDE_AT","backup_started_at":"$BACKUP_START","backup_completed_at":"$BACKUP_END","postgres_server_version":"$SERVER_VERSION","pg_dump_version":"$CLIENT_VERSION","pg_restore_version":"$RESTORE_CLIENT_VERSION","backup_sha256":"$BACKUP_SHA","backup_checksum_verified_before_restore":true,"target_replacement_verified":true,"source_schema_fingerprint_sha256":"$SOURCE_SCHEMA_FINGERPRINT","restored_schema_fingerprint_sha256":"$SCHEMA_FINGERPRINT","source_counts":$SOURCE_COUNTS,"restored_counts":$RESTORED_COUNTS,"observed_rpo_ms":$RPO_MS,"observed_restore_and_verify_rto_ms":$RTO_MS,"total_drill_ms":$((END_EPOCH-START_EPOCH)),"backup_artifact_retained":false,"encryption_expectation":"CI dump is sensitive and short-lived; production backups must be encrypted at rest with separately governed keys"}
JSON
printf 'DR restore proof passed; evidence=%s (database dump securely deleted on exit)\n' "$META"
