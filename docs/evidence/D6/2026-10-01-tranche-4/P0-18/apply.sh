#!/usr/bin/env bash
# Run on a database the file has NOT been applied to (green/apply-twice-legacy-row.txt is that run):
# step 1 stores an effective, unsigned row the way a pre-guard database holds one. On a guarded
# database step 1 is itself refused by the guard, which is the point of the file.
set -u
OWNER="${TEST_DATABASE_URL:?set TEST_DATABASE_URL (the owner URL)}"
APP="${APP_DATABASE_URL:?set APP_DATABASE_URL (the app_service URL)}"
# TEST_DATABASE_URL is the owner URL the applier uses
echo "--- 1. a legacy document, effective with NO signature, stored before the file is applied"
psql "$OWNER" -X -q -c "INSERT INTO organizations (id, name, slug, status) VALUES (93180, 'dbqsr-qms-signature-93180', 'dbqsr-qms-signature-93180', 'active') ON CONFLICT (id) DO NOTHING" \
  -c "DELETE FROM qms_documents WHERE doc_number = 'dbqsr-legacy-effective'"
psql "$OWNER" -X -c "INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, status) VALUES (93180,'dbqsr-legacy-effective','legacy effective, unsigned','sop','effective') RETURNING id, status"
psql "$OWNER" -X -At -c "SELECT 'triggers on qms_documents before: ' || count(*) FROM pg_trigger WHERE tgrelid = 'public.qms_documents'::regclass AND NOT tgisinternal"
echo "--- 2. apply through applyMigrationFiles (the deploy's applier), first run"
node "$(dirname "$0")/apply-one-file.mjs"; echo "exit $?"
echo "--- 3. replay (CLAUDE.md Rule 1: every deploy re-runs it)"
node "$(dirname "$0")/apply-one-file.mjs"; echo "exit $?"
psql "$OWNER" -X -c "SELECT tgname, tgenabled, tgdeferrable, tginitdeferred, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid = 'public.qms_documents'::regclass AND NOT tgisinternal ORDER BY 1"
echo "--- 4. the legacy row is untouched, and as the runtime role an edit that leaves its status alone commits"
psql "$APP" -X -e <<'SQL'
BEGIN;
SELECT set_config('app.rls_enforce','on',true) AS rls, set_config('app.current_tenant_id','93180',true) AS tenant, current_user;
UPDATE qms_documents SET next_review_date = DATE '2027-10-01', updated_at = now() WHERE doc_number = 'dbqsr-legacy-effective' RETURNING doc_number, status, next_review_date;
COMMIT;
SQL
psql "$OWNER" -X -c "SELECT doc_number, status, next_review_date FROM qms_documents WHERE doc_number = 'dbqsr-legacy-effective'"
psql "$OWNER" -X -q -c "DELETE FROM qms_documents WHERE doc_number = 'dbqsr-legacy-effective'"
