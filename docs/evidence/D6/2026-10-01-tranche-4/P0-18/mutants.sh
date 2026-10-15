#!/usr/bin/env bash
# Each mutant weakens ONE predicate of the guard (or its deferral) on the local database, runs the dbtest,
# and the original is restored through the deploy applier afterwards.
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
S="$(mktemp -d)"; HERE=docs/evidence/D6/2026-10-01-tranche-4/P0-18
OWNER="${TEST_DATABASE_URL:?set TEST_DATABASE_URL (the owner URL)}"
export RLS_ENFORCE=on
SRC=migrations/20261001_qms_document_signature_required.sql
run() {
  local name="$1" sedexpr="$2"
  sed "$sedexpr" "$SRC" > "$S/mutant.sql"
  echo "=== mutant $name: $(diff "$SRC" "$S/mutant.sql" | grep '^[<>]' | tr -s ' ' | tr '\n' ' ')"
  psql "$OWNER" -X -q -v ON_ERROR_STOP=1 -1 -f "$S/mutant.sql" 2>&1 | grep -v NOTICE
  NODE_OPTIONS=--max-old-space-size=3072 npx vitest run --config vitest.db.config.ts tests/db/qms-document-signature-required.dbtest.ts 2>&1 \
    | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ +(✓|×) |Tests +[0-9]| FAIL |^ ❯ tests/db/qms-document-signature-required.dbtest.ts:[0-9]+" | grep -E "×|Tests|❯" 
}
run "no-organisation-filter"   's/WHERE es.organization_id = NEW.organization_id/WHERE true/'
run "no-type-filter"           '/AND es.signature_type = required_type/s/^/--/'
run "revoked-counts"           '/AND es.superseded_by IS NULL/s/^/--/; /AND es.is_valid IS DISTINCT FROM false/s/^/--/; /AND es.verification_status IS DISTINCT FROM/s/^/--/'
run "any-transaction"          '/AND es.created_at = LOCALTIMESTAMP/s/^/--/'
run "not-deferred"             '/CREATE CONSTRAINT TRIGGER/,/FOR EACH ROW/s/DEFERRABLE INITIALLY DEFERRED/NOT DEFERRABLE/'
echo "=== restore the file as written, through the deploy applier"
node "$HERE/apply-one-file.mjs"
psql "$OWNER" -X -At -c "SELECT tgname || ' deferrable=' || tgdeferrable || ' initdeferred=' || tginitdeferred FROM pg_trigger WHERE tgrelid = 'public.qms_documents'::regclass AND NOT tgisinternal ORDER BY 1"
psql "$OWNER" -X -At -c "SELECT position('es.created_at = LOCALTIMESTAMP' in prosrc) > 0 AND position('es.organization_id = NEW.organization_id' in prosrc) > 0 AS restored FROM pg_proc WHERE proname = 'qms_documents_signed_status_guard'"
