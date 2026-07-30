-- ============================================================================
-- 20260730_orchestrator_run_ledger_hardening.sql
--
-- 21 CFR Part 11 §11.10(e): harden the submission-orchestrator ledger.
-- Auth/e-signature audit 2026-07-30, follow-ups flagged in
-- docs/compliance/part11-immutability-record-class-policy.md.
--
-- 1. WORKFLOW-DEFINITION VERSIONING. Each run's steps jsonb already snapshots
--    per-step dependsOn edges, but nothing recorded WHICH workflow definition
--    produced the run — so a code change to the dependency graph silently
--    changed the meaning of historical runs. Two additive columns record the
--    definition version + a deterministic digest of the dependency graph at
--    run creation (write-once via COALESCE in the service's upsert).
--
-- 2. STEP EVENTS ARE APPEND-ONLY, ENFORCED. The step table was described as
--    append-only (its one writer only INSERTs) but the database allowed
--    UPDATE/DELETE, and the run_id FK was ON DELETE CASCADE — deleting a run
--    erased its entire step history. The FK becomes RESTRICT (a run with
--    history cannot be deleted) and a trigger refuses UPDATE/DELETE outright.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the FK swap checks confdeltype and
-- only rewrites a CASCADE; CREATE OR REPLACE FUNCTION + conditional trigger.
-- to_regclass-guarded so lineages without the orchestrator tables no-op.
-- ============================================================================

-- ── 1. Run-level workflow-definition provenance ─────────────────────────────

ALTER TABLE IF EXISTS submission_orchestrator_runs
  ADD COLUMN IF NOT EXISTS workflow_version TEXT;
ALTER TABLE IF EXISTS submission_orchestrator_runs
  ADD COLUMN IF NOT EXISTS dependency_graph_digest TEXT;

-- ── 2a. run_id FK: CASCADE → RESTRICT ───────────────────────────────────────

DO $$
DECLARE
  fk RECORD;
BEGIN
  IF to_regclass('public.submission_orchestrator_steps') IS NULL THEN
    RETURN;
  END IF;

  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'submission_orchestrator_steps'
      AND c.contype = 'f'
      AND c.confdeltype = 'c'  -- only rewrite a CASCADE
      AND c.confrelid = to_regclass('public.submission_orchestrator_runs')
  LOOP
    EXECUTE format(
      'ALTER TABLE submission_orchestrator_steps DROP CONSTRAINT %I', fk.conname
    );
    EXECUTE format(
      'ALTER TABLE submission_orchestrator_steps
         ADD CONSTRAINT %I FOREIGN KEY (run_id)
         REFERENCES submission_orchestrator_runs(run_id) ON DELETE RESTRICT',
      fk.conname
    );
  END LOOP;
END;
$$;

-- ── 2b. Step events: refuse UPDATE/DELETE at the database ───────────────────

CREATE OR REPLACE FUNCTION orchestrator_steps_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: submission_orchestrator_steps is append-only (21 CFR Part 11 §11.10(e)) — step events can never be modified or deleted. Record a correcting event instead.'
    USING ERRCODE = 'raise_exception';
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.submission_orchestrator_steps') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE t.tgname = 'trg_orchestrator_steps_immutable'
        AND c.relname = 'submission_orchestrator_steps'
    ) THEN
      CREATE TRIGGER trg_orchestrator_steps_immutable
        BEFORE UPDATE OR DELETE ON public.submission_orchestrator_steps
        FOR EACH ROW
        EXECUTE FUNCTION orchestrator_steps_block_mutation();
    END IF;
  END IF;
END;
$$;
