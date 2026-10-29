-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: c2c_commitments, the earlier commitment file, is read-only. A
--          regulatory commitment is recorded in regulatory_commitments, where it
--          is created with a reason and fulfilled by signature (P-39 step 2,
--          2026-10-29).
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 regional commitments (PMR, PMC, REMS, meeting
--     commitments) as Communication records them.
--   - Integrity Risk Addressed: two commitment stores. c2c_commitments took a
--     create with no reason and no audit row, and a model-extracted row with
--     none either, while the canonical store governs both.
--
-- Determinism Contract:
--   - No existing row is rewritten, moved or dropped; the rows stay as history.
-- =============================================================================
-- 20261029i_c2c_commitments_read_only.sql
--
-- WHY. P-39 step 2 (docs/LAUNCH_DEFINITION_OF_DONE.md) converges c2c_commitments
-- (migrations/20260603_commitments.sql) onto regulatory_commitments. The routes
-- that wrote it (/api/c2c/commitments) and their service are deleted in the same
-- change. They had no client caller, no AnA tool and no MCP tool, and the launch
-- scope gate refused the namespace in production. Evidence:
-- docs/evidence/D2-COMMITMENTS-CONVERGED/2026-10-29/.
--
-- WHAT. A trigger refuses INSERT and UPDATE on the table, and one refuses
-- TRUNCATE, as 20261019b did for reg_questions (P-39 step 1). DELETE is not
-- refused: a tenant's offboarding purge (P-58) may remove its rows. The table
-- and its rows are kept: whether any deployed database holds rows is not known
-- here, and a drop would destroy them.
--
-- RULE 1: replayed on every deploy. CREATE OR REPLACE FUNCTION and CREATE OR
-- REPLACE TRIGGER are idempotent. 20260603_commitments.sql, which creates the
-- table, runs earlier in the set and creates nothing this file removes: no
-- create-then-drop ordering hazard. Creates no table.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.c2c_commitments_read_only() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'c2c_commitments is read-only since 2026-10-29 (% refused): regulatory commitments are recorded in Communication (regulatory_commitments), with a reason, and fulfilled by signature.',
    TG_OP
    USING ERRCODE = 'raise_exception',
          HINT = 'Record the commitment in regulatory_commitments. A correction to this file amends migrations/20261029i_c2c_commitments_read_only.sql.';
END;
$fn$;

COMMENT ON FUNCTION public.c2c_commitments_read_only() IS
  'Refuses INSERT, UPDATE and TRUNCATE on c2c_commitments, the earlier commitment file, read-only since 2026-10-29 (P-39 step 2). DELETE stays open for a tenant purge.';

DO $$
BEGIN
  IF to_regclass('public.c2c_commitments') IS NULL THEN
    RAISE NOTICE '[c2c-commitments-read-only] public.c2c_commitments not present; nothing to guard.';
    RETURN;
  END IF;
  CREATE OR REPLACE TRIGGER c2c_commitments_read_only
    BEFORE INSERT OR UPDATE ON public.c2c_commitments
    FOR EACH ROW EXECUTE FUNCTION public.c2c_commitments_read_only();
  CREATE OR REPLACE TRIGGER c2c_commitments_read_only_truncate
    BEFORE TRUNCATE ON public.c2c_commitments
    FOR EACH STATEMENT EXECUTE FUNCTION public.c2c_commitments_read_only();
  COMMENT ON TABLE public.c2c_commitments IS
    'The earlier commitment file. Read-only since 2026-10-29: regulatory commitments are recorded in regulatory_commitments (P-39 step 2).';
END;
$$;
