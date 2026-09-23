-- ============================================================================
-- Protocol document → study design link (2026-09-22, PROTOCOL-CONVERGENCE)
-- ============================================================================
--
-- Additive, idempotent, replay-safe (CLAUDE.md RULE 1). Every deploy re-runs
-- every file in C2C_MIGRATION_FILES; this one only ADDs three nullable columns
-- and one partial index, all IF NOT EXISTS, and carries no DROP, no backfill
-- and no data rewrite — so a second, tenth or hundredth run is a no-op and a
-- link written between two deploys survives the replay.
--
-- Why: docs/design/PROTOCOL_DESIGN_CONVERGENCE.md (binding, 2026-09-22). The
-- repository holds a complete USDM / ICH M11 design-as-data spine in
-- server/services/study-design/ — the object model, the ICH E9/E9(R1)/E10/E3
-- and M11 design gates, and five projections — and the Protocol development
-- surface referenced none of it, because protocol_documents had no way to name
-- the design it is a projection OF. These three columns are that link. Step 1
-- of that document's order of work: read-only, nothing is generated yet.
--
--   study_design_id         cdisc_prm_studies.study_id of the bound design
--   study_design_linked_at  when the binding was recorded
--   study_design_linked_by  users.id of whoever recorded it (the governed
--                           action itself is in the c2c ledger; this is the
--                           denormalised "who" the read model renders)
--
-- SOFT LINK — no REFERENCES clause, deliberately.
-- The FK target would be cdisc_prm_studies(study_id). That table is created by
-- the Drizzle schema install-fresh pushes (shared/schema/cdisc-reference.ts;
-- its DDL is in the drizzle baseline migrations/0000_sweet_joseph.sql) and is
-- created by NO file in C2C_MIGRATION_FILES. protocol_documents is likewise
-- created by the install-fresh overlay only (migrations/20260621_protocol_
-- development.sql). A REFERENCES clause here would therefore be a foreign key
-- to a table nothing on this applier creates — exactly the defect found in
-- migrations/20260610_irb_submissions.sql (a hard FK to clinical_studies) that
-- would have failed that file's first deploy. The link is enforced in the
-- application instead: bindStudyDesignTx refuses a study_id that is not the
-- acting tenant's, and the read model resolves the link tenant-scoped and
-- reports `resolved: false` rather than inventing a design when it cannot.
--
-- The ALTER is guarded on to_regclass for the same reason the 2026-09-21
-- sponsor/PI companion is: on a database provisioned by the set alone (the
-- C-33 blank-database replay) protocol_documents does not exist, so the file
-- NOTICE-skips instead of aborting the deploy.
--
-- Rollback (manual, never automated here — RULE 1): amend this file in place;
-- do not append a DROP.
--
-- Schema note: shared/schema/protocol-development.ts is not amended by this
-- change — every reader and writer of these columns is raw SQL
-- (pdev-view-assembler, protocol-development-service); the Drizzle model is
-- unused for protocol_documents writes. Same reason recorded on the 2026-09-21
-- sponsor/PI file, so ci:model-migration-agreement has it if it ever covers
-- this table.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.protocol_documents') IS NULL THEN
    RAISE NOTICE 'protocol_documents does not exist on this database (created by the install-fresh overlay, migrations/20260621_protocol_development.sql); study_design link columns not added here.';
    RETURN;
  END IF;

  ALTER TABLE public.protocol_documents ADD COLUMN IF NOT EXISTS study_design_id TEXT;
  ALTER TABLE public.protocol_documents ADD COLUMN IF NOT EXISTS study_design_linked_at TIMESTAMPTZ;
  ALTER TABLE public.protocol_documents ADD COLUMN IF NOT EXISTS study_design_linked_by INTEGER;

  -- Partial: only bound protocols are ever looked up this way, and the read
  -- model resolves the design per organisation.
  CREATE INDEX IF NOT EXISTS protocol_documents_study_design_idx
    ON public.protocol_documents (organization_id, study_design_id)
    WHERE study_design_id IS NOT NULL;
END
$$;
