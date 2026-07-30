-- ============================================================================
-- 20260730_c2c_ana_actions_command_vocab.sql
--
-- 21 CFR Part 11 §11.10(e) — governed-action ledger integrity.
-- Auth/e-signature audit 2026-07-30.
--
-- DEFECT (proven, SQLSTATE 23514). c2c_ana_actions is THE agentic-action ledger:
-- every governed UI/AnA mutation writes a row here (paired with an audit_logs
-- sha256-chain row, in one transaction — see server/routes/c2c/actions.ts
-- recordGovernedAction). migrations/20260527_mutation_primitives.sql created the
-- table with a `command` CHECK enumerating only the SIX original universal
-- mutations + their reverses:
--   claim, transition, resolve, sign, accept-ai-suggestion, lock,
--   unclaim, transition-back, reopen, revoke-signature, reject-ai-suggestion, unlock
-- Since then recordGovernedAction was adopted across the platform with
-- domain-appropriate verbs passed as a free `command: string` — through the
-- generic governed() route helpers (protocol-*, research-*, irb/iacuc/ibc,
-- grants, lifecycle, rim, inspections, …), the AnA tool executor, the
-- financial-disclosures / study-design / preclinical services, the FDA-ESG
-- gateway (transmittal_rollback), and the canonical document spine
-- (commitCanonicalRevision writes 'update' / 'reaffirm'). NONE of
--   create, update, delete, assign, approve, review, reject, persist,
--   reaffirm, transmittal_rollback
-- are in the CHECK. Each such INSERT raises check_violation (23514), which rolls
-- back the ENTIRE governed transaction — so the domain mutation fails AND no
-- audit/action row is written. The canonical spine (version + AI-action + audit
-- + review + placement, all atomic) can never commit a revision.
--
-- The defect was masked because the db-verify bootstrap schema
-- (scripts/db-verify/00_bootstrap_base.sql) creates c2c_ana_actions WITHOUT this
-- CHECK, and unit tests mock the DB (mocks do not enforce CHECKs) — so it only
-- bites against the real migrated schema. That is exactly the schema divergence
-- this migration removes.
--
-- FIX. `command` is OPEN-VOCABULARY descriptive audit metadata — it is chosen
-- per domain and passed as a free string through generic helpers, so an
-- enumerated allow-list cannot be kept complete (it already drifted and broke
-- ~50 endpoints). Drop the narrow allow-list CHECK and replace it with a
-- drift-proof floor: command must be non-empty and length-bounded. The genuine
-- closed-enum guards that the application DOES depend on — risk, state,
-- agentic_mode — are intentionally left untouched. Audit-chain integrity is
-- unaffected: the sha256 chain commits action = 'c2c.work.' || command
-- regardless of the verb.
--
-- Non-destructive: drops/rewrites only a CHECK constraint; no column or row is
-- touched. Idempotent: DROP CONSTRAINT IF EXISTS + conditional ADD via catalog
-- lookup. to_regclass-guarded so lineages without the table no-op.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.c2c_ana_actions') IS NULL THEN
    RAISE NOTICE 'c2c_ana_actions not present in this schema; skipping command-vocab migration.';
    RETURN;
  END IF;

  -- Drop the over-narrow enumerated allow-list (present on migrated lineages;
  -- absent on the bootstrap lineage — IF EXISTS covers both).
  ALTER TABLE public.c2c_ana_actions
    DROP CONSTRAINT IF EXISTS c2c_ana_actions_command_check;

  -- Add the drift-proof floor once (skip if a prior run already added it).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'c2c_ana_actions_command_bounds'
      AND conrelid = 'public.c2c_ana_actions'::regclass
  ) THEN
    ALTER TABLE public.c2c_ana_actions
      ADD CONSTRAINT c2c_ana_actions_command_bounds
      CHECK (char_length(command) BETWEEN 1 AND 64);
  END IF;
END $$;
