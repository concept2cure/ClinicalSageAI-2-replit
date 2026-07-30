-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give ectd_compilations the application_number + sequence_number the
--          eCTD sequence-continuity gateway gate reads, so it can run at all.
--
-- eCTD/CTD Context:
--   - Module(s): all (a project-level compilation spans every module)
--   - Integrity Risk Addressed: broken submission-sequence continuity check —
--     a gateway gate that could never execute, blocking every submission
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================
--
-- Ledger C-31 (closes the "recorded, not fixed" note under C-16).
--
-- server/services/ectd/ectd-validator-hardening.ts detectSequenceGaps() — step 5
-- of validateEctdPackageHardened, the hardened gateway-readiness gate wired at
-- server/routes/submission-orchestrator.ts — verifies eCTD submission-sequence
-- continuity for an application: the first submission must be 0000, no duplicate,
-- no gap, no regression. It sources the prior sequences from
--
--     SELECT sequence_number FROM ectd_compilations WHERE application_number = $1
--     UNION
--     SELECT sequence_number FROM ectd_submissions  WHERE application_number = $1
--
-- but ectd_compilations has NEITHER column in any definition (the drizzle journal
-- 0000_sweet_joseph, shared/schema.ts, and the C-16 project-level ALTER all omit
-- them). The query therefore throws `column "application_number" does not exist`,
-- the handler's catch reports it as SEQ_QUERY_FAILED "submission tracking database
-- is unreachable", and EVERY submission is blocked as gateway-not-ready — a schema
-- gap misattributed as a connectivity outage, the same swallowed-cause pattern
-- C-16 itself documented.
--
-- This migration adds the two columns (nullable: a compilation may not yet target
-- a specific application/sequence) and an index on application_number for the
-- validator's WHERE. It is the durable, existing-database half of the fix; fresh
-- installs get the columns from shared/schema.ts via drizzle-kit push. The
-- validator is separately hardened to tolerate the (independently deploy-dead)
-- ectd_submissions table being absent, so the gate runs on ectd_compilations
-- alone — see the C-31 change to ectd-validator-hardening.ts.
--
-- Widening + idempotent: every existing row stays valid; safe to re-run.

ALTER TABLE ectd_compilations
  ADD COLUMN IF NOT EXISTS application_number TEXT;

ALTER TABLE ectd_compilations
  ADD COLUMN IF NOT EXISTS sequence_number TEXT;

-- The validator filters `WHERE application_number = $1`; index it so the
-- sequence-continuity probe stays cheap as compilation history grows.
CREATE INDEX IF NOT EXISTS ectd_compilations_application_number_idx
  ON ectd_compilations (application_number);
