-- P0-8 (DP-04) probe: the archive door still works for the role that calls it.
-- Run as app_service. One transaction, always rolled back; tenant 92808.
--
--   psql "$APP_DATABASE_URL" -X -v ON_ERROR_STOP=0 -f probe-archive-door.sql
\set VERBOSITY verbose
\pset pager off
BEGIN;
SET LOCAL app.rls_enforce = 'on';
SET LOCAL app.current_tenant_id = '92808';
SELECT current_user AS acting_as,
       has_table_privilege(current_user, 'public.audit_logs', 'DELETE') AS holds_delete,
       has_function_privilege(current_user,
         'public.audit_logs_archive_delete(uuid[], text, text, timestamptz)', 'EXECUTE') AS may_call_door;
INSERT INTO public.audit_logs (tenant_id, action, table_name, record_id, created_at)
VALUES (92808, 'dbtest-p08.archive-probe', 'p08_probe', 'p08', now() - interval '26 months')
RETURNING id AS probe_id \gset
SELECT public.audit_logs_archive_delete(ARRAY[:'probe_id']::uuid[], 'dbtest-p08://probe',
                                        repeat('a', 64), now() - interval '25 months') AS deleted_by_door;
SELECT count(*) AS probe_rows_left FROM public.audit_logs WHERE id = :'probe_id';
SELECT row_count, locator, performed_by FROM public.audit_log_archives WHERE locator = 'dbtest-p08://probe';
ROLLBACK;
