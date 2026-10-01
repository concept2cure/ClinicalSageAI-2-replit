-- P1-24 probe (DP-15, DP-16): can the runtime role rewrite or remove a domain
-- history row or an authoring signature?
--
-- ONE transaction, ROLLED BACK at the end: nothing it writes survives, so it is
-- safe on the shared test database. Fixture parents are inserted as the owner;
-- every UPDATE and DELETE then runs as app_service (NOSUPERUSER NOBYPASSRLS)
-- under RLS in the fixture tenant's scope, exactly as a request would. The
-- cascades and TRUNCATE run as the owner, because app_service holds no
-- TRUNCATE privilege and no route deletes the parents.
--
-- psql 'postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
--      -X -f docs/evidence/D6/2026-10-01-tranche-4/P1-24/probe.sql
\set ON_ERROR_STOP off
\set ON_ERROR_ROLLBACK on
\set VERBOSITY terse
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO organizations (name, slug) VALUES ('dbtest-p124 probe', 'dbtest-p124-probe') RETURNING id AS org \gset
INSERT INTO users (email, name, password_hash) VALUES ('dbtest-p124-probe@example.invalid', 'P124 Probe', 'x') RETURNING id AS uid \gset
INSERT INTO workflow_templates (name, module_type, organization_id, created_by) VALUES ('dbtest-p124', 'cmc', :org, 'probe') RETURNING id AS tpl \gset
INSERT INTO unified_documents (title, document_type, created_by, organization_id) VALUES ('dbtest-p124', 'protocol', 'probe', :org) RETURNING id AS doc \gset
INSERT INTO document_workflows (document_id, template_id, started_by, organization_id) VALUES (:doc, :tpl, 'probe', :org) RETURNING id AS wf \gset
INSERT INTO c2c_ana_conversations (id, org_id, owner_id, surface) VALUES ('dbtest-p124-conv', :org, :uid, 'probe');

\echo '== the legitimate path: INSERT, as app_service under RLS'
SET LOCAL ROLE app_service;
SELECT set_config('app.rls_enforce', 'on', true) AS rls, set_config('app.current_tenant_id', :'org', true) AS tenant, current_user;
INSERT INTO workflow_history (workflow_id, action, performed_by) VALUES (:wf, 'step_approved', 'probe');
INSERT INTO document_audit_logs (document_id, action, performed_by) VALUES (:doc, 'approved', 'probe');
INSERT INTO regulatory_audit_logs (audit_id, organization_id, entity_type, entity_id, action, action_category, user_id, user_name, ip_address)
  VALUES ('dbtest-p124-ral', :org, 'submission', 's1', 'approve', 'approval', :uid, 'P124 Probe', '127.0.0.1');
INSERT INTO c2c_ana_actions (id, org_id, conversation_id, domain, surface, command, target, proposed_by)
  VALUES ('dbtest-p124-act', :org, 'dbtest-p124-conv', 'mdx', 'probe', 'sign', 'doc:1', :uid);
INSERT INTO authoring_signatures (id, doc_id, signer_email, meaning, content_hash, tenant_id)
  VALUES ('00000000-0000-4000-8000-000000000124', gen_random_uuid(), 'dbtest-p124-probe@example.invalid', 'APPROVER', 'h', :org);

\echo '== UPDATE, as app_service under RLS (each must be refused)'
UPDATE workflow_history SET action = 'rewritten' WHERE workflow_id = :wf;
UPDATE document_audit_logs SET performed_by = 'someone else' WHERE document_id = :doc;
UPDATE regulatory_audit_logs SET user_name = 'someone else' WHERE audit_id = 'dbtest-p124-ral';
UPDATE c2c_ana_actions SET state = 'reversed', decision_reason = 'rewritten' WHERE id = 'dbtest-p124-act';
UPDATE authoring_signatures SET signer_email = 'someone-else@example.invalid' WHERE id = '00000000-0000-4000-8000-000000000124';

\echo '== DELETE, as app_service under RLS (each must be refused)'
DELETE FROM workflow_history WHERE workflow_id = :wf;
DELETE FROM document_audit_logs WHERE document_id = :doc;
DELETE FROM regulatory_audit_logs WHERE audit_id = 'dbtest-p124-ral';
DELETE FROM c2c_ana_actions WHERE id = 'dbtest-p124-act';
DELETE FROM authoring_signatures WHERE id = '00000000-0000-4000-8000-000000000124';
RESET ROLE;

\echo '== cascades from a parent, as the owner (each must be refused)'
INSERT INTO workflow_history (workflow_id, action, performed_by) VALUES (:wf, 'cascade_probe', 'probe');
INSERT INTO document_audit_logs (document_id, action, performed_by) VALUES (:doc, 'cascade_probe', 'probe');
INSERT INTO c2c_ana_actions (id, org_id, conversation_id, domain, surface, command, target, proposed_by)
  VALUES ('dbtest-p124-act2', :org, 'dbtest-p124-conv', 'mdx', 'probe', 'sign', 'doc:2', :uid);
DELETE FROM document_workflows WHERE id = :wf;
DELETE FROM unified_documents WHERE id = :doc;
DELETE FROM c2c_ana_conversations WHERE id = 'dbtest-p124-conv';

\echo '== TRUNCATE, as the owner (each must be refused)'
TRUNCATE workflow_history;
TRUNCATE document_audit_logs;
TRUNCATE regulatory_audit_logs;
TRUNCATE c2c_ana_actions CASCADE;
TRUNCATE authoring_signatures;

\echo '== what survived inside the transaction'
SELECT 'workflow_history' AS t, count(*) FROM workflow_history WHERE workflow_id = :wf
UNION ALL SELECT 'document_audit_logs', count(*) FROM document_audit_logs WHERE document_id = :doc
UNION ALL SELECT 'regulatory_audit_logs', count(*) FROM regulatory_audit_logs WHERE audit_id = 'dbtest-p124-ral'
UNION ALL SELECT 'c2c_ana_actions', count(*) FROM c2c_ana_actions WHERE id LIKE 'dbtest-p124-act%'
UNION ALL SELECT 'authoring_signatures', count(*) FROM authoring_signatures WHERE id = '00000000-0000-4000-8000-000000000124';
ROLLBACK;
