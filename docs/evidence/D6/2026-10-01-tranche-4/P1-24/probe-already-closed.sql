-- P1-24: the two stores the item names that were already closed before this
-- change — authoring_audit_trail (7863cf83, 2026-09-29) and
-- concept2cure_signatures (20d2ef59, 2026-09-29). Same shape as probe.sql:
-- one transaction, rolled back; mutations as app_service under RLS.
\set ON_ERROR_STOP off
\set ON_ERROR_ROLLBACK on
\set VERBOSITY terse
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO organizations (name, slug) VALUES ('dbtest-p124 probe', 'dbtest-p124-probe') RETURNING id AS org \gset
INSERT INTO users (email, name, password_hash) VALUES ('dbtest-p124-probe@example.invalid', 'P124 Probe', 'x') RETURNING id AS uid \gset
INSERT INTO authoring_audit_trail (doc_id, operation_type, actor_email, tenant_id)
  VALUES ('00000000-0000-4000-8000-000000000124', 'probe', 'dbtest-p124-probe@example.invalid', :org);
SELECT tgrelid::regclass AS "table", tgname, tgenabled FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN ('authoring_audit_trail'::regclass, 'concept2cure_signatures'::regclass) ORDER BY 1, 2;
SET LOCAL ROLE app_service;
SELECT set_config('app.rls_enforce', 'on', true) AS rls, set_config('app.current_tenant_id', :'org', true) AS tenant, current_user;
UPDATE authoring_audit_trail SET actor_email = 'someone-else@example.invalid' WHERE tenant_id = :org;
DELETE FROM authoring_audit_trail WHERE tenant_id = :org;
RESET ROLE;
-- No fixture row is needed to show the concept2cure_signatures row trigger is on
-- the table; the statement-level TRUNCATE trigger fires with zero rows.
TRUNCATE concept2cure_signatures;
TRUNCATE authoring_audit_trail;
ROLLBACK;
