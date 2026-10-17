-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure regulatory evidence and governed workflow platform
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Retain immutable input snapshots and one-time suspended outputs for exact run continuation.
--
-- eCTD/CTD Context:
--   - Module(s): Submission orchestration and frozen source inputs for Modules 1-5.
--   - Integrity Risk Addressed: Resuming with substituted inputs or changing previously retained continuation evidence.
--
-- Determinism Contract:
--   - Preserve run, tenant, programme, digests and seals; only the first suspended-output receipt may be added.
--   - Replay-safe migration; existing data and canonical evidence identities remain preserved.
--
-- Notes:
--   - 2026-10-14 publication review adds this required audit context only.
--   - Existing dated remediation notes and all executable SQL are retained verbatim.
-- =============================================================================
-- Original inputs and pause outputs are private, immutable continuation receipts.
CREATE TABLE IF NOT EXISTS submission_orchestrator_inputs (
  run_id uuid PRIMARY KEY REFERENCES submission_orchestrator_runs(run_id),
  organization_id integer NOT NULL REFERENCES organizations(id),
  program_id uuid REFERENCES regulatory_programs(id),
  input_snapshot jsonb NOT NULL,
  input_digest text NOT NULL,
  input_seal text,
  suspended_outputs jsonb,
  outputs_digest text,
  outputs_seal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(input_snapshot) = 'object'),
  CHECK ((suspended_outputs IS NULL) = (outputs_digest IS NULL))
);
CREATE INDEX IF NOT EXISTS submission_orchestrator_inputs_program_idx
  ON submission_orchestrator_inputs (organization_id, program_id, created_at DESC);
CREATE OR REPLACE FUNCTION protect_orchestrator_continuation_inputs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Orchestrator input receipts are immutable' USING ERRCODE='23514'; END IF;
  IF (NEW.run_id, NEW.organization_id, NEW.program_id, NEW.input_snapshot, NEW.input_digest, NEW.input_seal, NEW.created_at)
     IS DISTINCT FROM (OLD.run_id, OLD.organization_id, OLD.program_id, OLD.input_snapshot, OLD.input_digest, OLD.input_seal, OLD.created_at)
     OR (OLD.suspended_outputs IS NOT NULL AND (NEW.suspended_outputs, NEW.outputs_digest, NEW.outputs_seal)
       IS DISTINCT FROM (OLD.suspended_outputs, OLD.outputs_digest, OLD.outputs_seal)) THEN
    RAISE EXCEPTION 'Orchestrator input receipts are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS submission_orchestrator_inputs_immutable ON submission_orchestrator_inputs;
CREATE TRIGGER submission_orchestrator_inputs_immutable BEFORE UPDATE OR DELETE ON submission_orchestrator_inputs
  FOR EACH ROW EXECUTE FUNCTION protect_orchestrator_continuation_inputs();
