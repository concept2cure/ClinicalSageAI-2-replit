#!/usr/bin/env bash
# P0-18 reproduction: a bare UPDATE to 'effective' / 'retired' as the runtime role, under RLS, in its own tenant.
OWNER="${TEST_DATABASE_URL:?set TEST_DATABASE_URL (the owner URL)}"
APP="${APP_DATABASE_URL:?set APP_DATABASE_URL (the app_service URL)}"
psql "$OWNER" -qAt -c "INSERT INTO organizations (id, name, slug, status) VALUES (93180, 'dbqsr-qms-signature-93180', 'dbqsr-qms-signature-93180', 'active') ON CONFLICT (id) DO NOTHING" \
  -c "DELETE FROM qms_documents WHERE doc_number IN ('dbqsr-psql-repro-e','dbqsr-psql-repro-r')" \
  -c "INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, status) VALUES (93180,'dbqsr-psql-repro-e','repro effective','sop','draft'), (93180,'dbqsr-psql-repro-r','repro retired','sop','draft')"
echo "--- as the runtime role: psql as app_service (NOSUPERUSER NOBYPASSRLS), app.rls_enforce=on, tenant 93180"
psql "$APP" -X -e <<'SQL'
BEGIN;
SELECT set_config('app.rls_enforce','on',true) AS rls, set_config('app.current_tenant_id','93180',true) AS tenant, current_user;
SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user;
UPDATE qms_documents SET status = 'effective' WHERE doc_number = 'dbqsr-psql-repro-e' RETURNING doc_number, status;
COMMIT;
BEGIN;
SELECT set_config('app.rls_enforce','on',true) AS rls, set_config('app.current_tenant_id','93180',true) AS tenant;
UPDATE qms_documents SET status = 'retired' WHERE doc_number = 'dbqsr-psql-repro-r' RETURNING doc_number, status;
COMMIT;
SQL
echo "--- what is stored afterwards (owner read)"
psql "$OWNER" -X -c "SELECT d.doc_number, d.status, (SELECT count(*) FROM electronic_signatures es WHERE es.signed_target = 'qms-document:' || d.id) AS signatures FROM qms_documents d WHERE d.doc_number LIKE 'dbqsr-psql-repro-%' ORDER BY 1"
psql "$OWNER" -qAt -c "DELETE FROM qms_documents WHERE doc_number IN ('dbqsr-psql-repro-e','dbqsr-psql-repro-r')"
