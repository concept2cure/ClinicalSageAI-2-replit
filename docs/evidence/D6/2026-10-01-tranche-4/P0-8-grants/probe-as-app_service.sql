-- P0-8 (DP-04) probe: what the runtime role can do to the append-only audit stores.
-- Run as app_service (APP_DATABASE_URL). Every row it writes is inside a
-- transaction that is rolled back; tenant 92808 is this probe's alone.
--
--   psql "$APP_DATABASE_URL" -X -v ON_ERROR_STOP=0 -f probe-as-app_service.sql
\set VERBOSITY verbose
\pset pager off
SELECT current_user AS role, r.rolsuper, r.rolbypassrls
  FROM pg_roles r WHERE r.rolname = current_user;

\echo '== 1. table-level privileges the runtime role holds on each store'
SELECT s AS store,
       has_table_privilege(current_user, s, 'SELECT')   AS sel,
       has_table_privilege(current_user, s, 'INSERT')   AS ins,
       has_table_privilege(current_user, s, 'UPDATE')   AS upd,
       has_table_privilege(current_user, s, 'DELETE')   AS del,
       has_table_privilege(current_user, s, 'TRUNCATE') AS trunc
  FROM unnest(ARRAY[
    'public.audit_logs', 'public.audit_events', 'public.audit_log_archives',
    'audit.tamper_proof_log', 'public.electronic_signatures',
    'public.ana_turn_records', 'public.ana_record_blobs', 'public.authoring_audit_trail',
    'public.doc_revisions', 'public.concept2cure_signatures',
    'public.concept2cure_submission_snapshots']) AS s;

\echo '== 2. electronic_signatures: the supersession columns stay updatable, the attested ones do not'
SELECT c AS col, has_column_privilege(current_user, 'public.electronic_signatures', c, 'UPDATE') AS can_update
  FROM unnest(ARRAY['superseded_by', 'is_valid', 'verification_status', 'verification_date',
                    'updated_at', 'signer_id', 'signature_hash', 'signed_at']) AS c;

\echo '== 3. statements the role can run today: UPDATE/DELETE ... WHERE false (no row, so no trigger fires)'
UPDATE public.audit_logs SET action = action WHERE false;
DELETE FROM public.audit_logs WHERE false;
UPDATE public.audit_events SET id = id WHERE false;
DELETE FROM public.audit_events WHERE false;
UPDATE public.audit_log_archives SET id = id WHERE false;
DELETE FROM public.audit_log_archives WHERE false;
UPDATE public.electronic_signatures SET signature_hash = signature_hash WHERE false;
DELETE FROM public.electronic_signatures WHERE false;
UPDATE public.ana_turn_records SET id = id WHERE false;
DELETE FROM public.ana_record_blobs WHERE false;
UPDATE public.authoring_audit_trail SET id = id WHERE false;
DELETE FROM public.doc_revisions WHERE false;
UPDATE public.concept2cure_signatures SET id = id WHERE false;
DELETE FROM public.concept2cure_submission_snapshots WHERE false;
\echo '   the governed revocation path (superseded_by et al.) must still be allowed:'
UPDATE public.electronic_signatures
   SET superseded_by = superseded_by, is_valid = is_valid, verification_status = verification_status,
       verification_date = verification_date, updated_at = updated_at
 WHERE false;

\echo '== 4. a real audit row in the role''s own tenant: who refuses, the privilege or the trigger?'
BEGIN;
SET LOCAL app.rls_enforce = 'on';
SET LOCAL app.current_tenant_id = '92808';
INSERT INTO public.audit_logs (tenant_id, action, table_name, record_id)
VALUES (92808, 'dbtest-p08.probe', 'p08_probe', 'p08') RETURNING id AS probe_id \gset
SAVEPOINT s;
DELETE FROM public.audit_logs WHERE id = :'probe_id';
ROLLBACK TO SAVEPOINT s;
UPDATE public.audit_logs SET action = 'tampered' WHERE id = :'probe_id';
ROLLBACK TO SAVEPOINT s;
TRUNCATE public.audit_logs;
ROLLBACK;
