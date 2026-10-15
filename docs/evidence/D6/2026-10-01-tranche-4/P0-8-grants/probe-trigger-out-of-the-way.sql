-- P0-8 (DP-04) probe: with the trigger out of the way, is anything else stopping
-- the runtime role? Run as the owner (postgres); the owner sets
-- session_replication_role = replica (the state a pg_restore, a logical-replica
-- apply or a DISABLE TRIGGER leaves the trigger in), then BECOMES app_service
-- for the statements. One transaction, always rolled back; tenant 92808.
--
--   psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=0 -f probe-trigger-out-of-the-way.sql
\set VERBOSITY verbose
\pset pager off
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL session_replication_role = replica;
SET LOCAL ROLE app_service;
SET LOCAL app.rls_enforce = 'on';
SET LOCAL app.current_tenant_id = '92808';
SELECT current_user AS acting_as, current_setting('session_replication_role') AS replication_role;
INSERT INTO public.audit_logs (tenant_id, action, table_name, record_id)
VALUES (92808, 'dbtest-p08.replica-probe', 'p08_probe', 'p08') RETURNING id AS probe_id \gset
SAVEPOINT s;
UPDATE public.audit_logs SET action = 'tampered' WHERE id = :'probe_id';
ROLLBACK TO SAVEPOINT s;
DELETE FROM public.audit_logs WHERE id = :'probe_id';
ROLLBACK;
