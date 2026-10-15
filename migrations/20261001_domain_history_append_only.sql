-- ============================================================================
-- 20261001_domain_history_append_only.sql
--
-- 21 CFR Part 11 §11.10(e) / §11.70; EU Annex 11 §9: the domain history tables
-- and the authoring signature store are append-only in the database, not by
-- convention.
--
-- WHY (P1-24; security audit 2026-09-24 findings DP-15 and DP-16; rows D5, D6;
-- evidence docs/evidence/D6/2026-10-01-tranche-4/P1-24/):
-- five stores that record who did what to a governed record carried no trigger
-- at all, and the runtime role holds UPDATE and DELETE on every public table.
-- Reproduced on PostgreSQL 16.13 as app_service (NOSUPERUSER NOBYPASSRLS), under
-- RLS, in its own tenant: UPDATE 1 and DELETE 1 on each; the owner could
-- TRUNCATE each; deleting a parent cascaded into the history beneath it.
--
--   table                  created on the deploy path by
--   workflow_history       migrations/20260815_workflow_approval_tables.sql (C2C set)
--   document_audit_logs    migrations/20260729b_unified_workflow_companion_tables.sql (C2C set)
--   regulatory_audit_logs  drizzle push of shared/schema.ts regulatoryAuditLogs
--                          (baseline migrations/0000_sweet_joseph.sql)
--   c2c_ana_actions        migrations/20260527_mutation_primitives.sql (C2C set)
--   authoring_signatures   db/migrations/20260725_authoring_signatures_and_workflow.sql
--                          (authoring subsystem, deploy-migrate step 3, before this set)
--
-- The two other stores P1-24 names were already closed, and are not touched:
-- authoring_audit_trail (db/migrations/20260725_authoring_audit_trail.sql,
-- amended 2026-09-26) and concept2cure_signatures
-- (migrations/20260929_concept2cure_signatures_append_only.sql).
--
-- POLICY: strictly append-only. UPDATE and DELETE are refused per row and
-- TRUNCATE per statement, for every role. A correction is a new row
-- (c2c_ana_actions already records a reversal that way: reverse_of).
--
-- NO DOOR, BECAUSE NO PATH NEEDS ONE. Census of 2026-10-01 (server/, scripts/,
-- shared/, both appliers' files): every writer INSERTs and nothing else —
--   workflow_history       WorkflowService.ts (7), workflow/ApprovalOrchestrator.ts:630
--   document_audit_logs    ModuleIntegrationService.ts (4), module-integration/attachment-service.ts (2),
--                          workflow/ApprovalOrchestrator.ts:644
--   regulatory_audit_logs  routes/c2c/shared.ts, routes/orchestration.ts, routes/concept2cure.ts,
--                          ai-actions/action-registry.ts, compute/*, ana/verifiedSealService.ts,
--                          ana/submission-chat-*
--   c2c_ana_actions        routes/c2c/actions.ts (recordGovernedAction), the single writer
--   authoring_signatures   routes/authoring.router.ts (two INSERTs)
-- No UPDATE, DELETE, TRUNCATE or upsert of any of them; no migration on either
-- applier mutates their rows; the tenant purge (PURGE_CHILD_TABLES,
-- server/services/tenant/tenant-offboarding.ts) and the audit retention archive
-- list none of them. Only test fixtures delete them.
--
-- CASCADES. Three foreign keys reach these tables from a parent:
--   document_audit_logs.document_id   → unified_documents      ON DELETE CASCADE
--   workflow_history.workflow_id      → document_workflows     ON DELETE CASCADE
--                                       (→ unified_documents   ON DELETE CASCADE)
--   c2c_ana_actions.conversation_id   → c2c_ana_conversations  ON DELETE SET NULL
-- Nothing deletes any of those parents. With these triggers, deleting a parent
-- that HAS history is refused with it — the history outlives the record it
-- describes, the rule 20260929 applies to an artifact's signatures. A parent
-- with no history is deleted as before. authoring_signatures has no foreign key
-- by design (its creating file explains why).
--
-- One function for the five, with the store's name in the message. The
-- existing c2c_artifact_record_* pair (20260929) is not reused: it cites §11.70
-- for every table and is the artifact store's own; this file stays readable on
-- its own.
--
-- Idempotent and replay-safe (CLAUDE.md Rule 1: every file in the set re-runs on
-- every deploy): CREATE OR REPLACE FUNCTION; per table DROP TRIGGER IF EXISTS of
-- this file's own names, then CREATE TRIGGER — so each deploy also re-arms a
-- trigger someone disabled. Each table guarded with to_regclass (an edition
-- without it gets a NOTICE). No DROP of anything another file creates; creates
-- no table, so the tenant sweep has nothing new to policy.
-- Pinned by tests/db/domain-history-append-only.dbtest.ts.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.domain_history_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_LEVEL = 'STATEMENT' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: % is append-only (21 CFR Part 11 §11.10(e)) — TRUNCATE refused.',
      TG_TABLE_NAME
      USING ERRCODE = 'raise_exception';
  END IF;
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: % is append-only (21 CFR Part 11 §11.10(e)) — % refused.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'raise_exception',
          HINT = 'A history row or signature is corrected by appending a new row, never by editing or removing one.';
END;
$$;

-- ── workflow_history ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.workflow_history') IS NULL THEN
    RAISE NOTICE '[domain-history-append-only] public.workflow_history not present — nothing to protect.';
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_workflow_history_append_only ON public.workflow_history;
  CREATE TRIGGER trg_workflow_history_append_only
    BEFORE UPDATE OR DELETE ON public.workflow_history
    FOR EACH ROW EXECUTE FUNCTION public.domain_history_append_only();
  DROP TRIGGER IF EXISTS trg_workflow_history_no_truncate ON public.workflow_history;
  CREATE TRIGGER trg_workflow_history_no_truncate
    BEFORE TRUNCATE ON public.workflow_history
    FOR EACH STATEMENT EXECUTE FUNCTION public.domain_history_append_only();
END;
$$;

-- ── document_audit_logs ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.document_audit_logs') IS NULL THEN
    RAISE NOTICE '[domain-history-append-only] public.document_audit_logs not present — nothing to protect.';
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_document_audit_logs_append_only ON public.document_audit_logs;
  CREATE TRIGGER trg_document_audit_logs_append_only
    BEFORE UPDATE OR DELETE ON public.document_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.domain_history_append_only();
  DROP TRIGGER IF EXISTS trg_document_audit_logs_no_truncate ON public.document_audit_logs;
  CREATE TRIGGER trg_document_audit_logs_no_truncate
    BEFORE TRUNCATE ON public.document_audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.domain_history_append_only();
END;
$$;

-- ── regulatory_audit_logs ───────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.regulatory_audit_logs') IS NULL THEN
    RAISE NOTICE '[domain-history-append-only] public.regulatory_audit_logs not present — nothing to protect.';
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_regulatory_audit_logs_append_only ON public.regulatory_audit_logs;
  CREATE TRIGGER trg_regulatory_audit_logs_append_only
    BEFORE UPDATE OR DELETE ON public.regulatory_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.domain_history_append_only();
  DROP TRIGGER IF EXISTS trg_regulatory_audit_logs_no_truncate ON public.regulatory_audit_logs;
  CREATE TRIGGER trg_regulatory_audit_logs_no_truncate
    BEFORE TRUNCATE ON public.regulatory_audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.domain_history_append_only();
END;
$$;

-- ── c2c_ana_actions ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.c2c_ana_actions') IS NULL THEN
    RAISE NOTICE '[domain-history-append-only] public.c2c_ana_actions not present — nothing to protect.';
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_c2c_ana_actions_append_only ON public.c2c_ana_actions;
  CREATE TRIGGER trg_c2c_ana_actions_append_only
    BEFORE UPDATE OR DELETE ON public.c2c_ana_actions
    FOR EACH ROW EXECUTE FUNCTION public.domain_history_append_only();
  DROP TRIGGER IF EXISTS trg_c2c_ana_actions_no_truncate ON public.c2c_ana_actions;
  CREATE TRIGGER trg_c2c_ana_actions_no_truncate
    BEFORE TRUNCATE ON public.c2c_ana_actions
    FOR EACH STATEMENT EXECUTE FUNCTION public.domain_history_append_only();
END;
$$;

-- ── authoring_signatures ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.authoring_signatures') IS NULL THEN
    RAISE NOTICE '[domain-history-append-only] public.authoring_signatures not present — nothing to protect.';
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_authoring_signatures_append_only ON public.authoring_signatures;
  CREATE TRIGGER trg_authoring_signatures_append_only
    BEFORE UPDATE OR DELETE ON public.authoring_signatures
    FOR EACH ROW EXECUTE FUNCTION public.domain_history_append_only();
  DROP TRIGGER IF EXISTS trg_authoring_signatures_no_truncate ON public.authoring_signatures;
  CREATE TRIGGER trg_authoring_signatures_no_truncate
    BEFORE TRUNCATE ON public.authoring_signatures
    FOR EACH STATEMENT EXECUTE FUNCTION public.domain_history_append_only();
END;
$$;
