#!/usr/bin/env bash
# Make the database guard fail on the cases it exists for, then re-arm it by replaying the migration
# (CLAUDE.md Rule 1: the replay re-creates a dropped trigger). Run from the repository root.
set -u
OWNER="${TEST_DATABASE_URL:?owner URL}"; : "${APP_DATABASE_URL:?app_service URL}"
DIR="$(dirname "$0")"
run() { RLS_ENFORCE=on npx vitest run --config vitest.db.config.ts tests/db/compliance-review-records.dbtest.ts -t "$1" 2>&1 | grep -E "✓|×|Tests " ; }
echo "=== mutant 1: the commit-time signature check dropped (both constraint triggers)"
psql "$OWNER" -X -q -c "DROP TRIGGER trg_compliance_review_records_signed_ins ON public.compliance_review_records; DROP TRIGGER trg_compliance_review_records_signed_upd ON public.compliance_review_records;"
run "bare UPDATE to signed|bare INSERT of a signed row"
echo "=== mutant 2: the immutability guard's function made a pass-through"
# (Not DISABLE TRIGGER: the suite's own cleanup disables and re-enables the guard by name to remove
#  its rows as the owner, which would undo that mutant before the first case runs.)
node "$DIR/apply-one-file.mjs" > /dev/null 2>&1
psql "$OWNER" -X -q -c "CREATE OR REPLACE FUNCTION public.compliance_review_records_guard() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; \$\$;"
run "a signed row cannot be updated or deleted"
echo "=== re-armed: the migration replayed through applyMigrationFiles"
node "$DIR/apply-one-file.mjs" 2>&1 | grep -E "applied|failures"
psql "$OWNER" -X -At -c "SELECT tgname || ' ' || tgenabled::text FROM pg_trigger WHERE tgrelid = 'public.compliance_review_records'::regclass AND NOT tgisinternal ORDER BY 1"
run "signing without the ceremony is refused|a signed row cannot be updated or deleted"
