-- ═══════════════════════════════════════════════════════════════════════════
-- cre_evidence_sources — scope a canonical source to a UUID-keyed program
--
-- PROBLEM THIS FIXES
-- The platform carries two project id-spaces:
--
--   regulatory_programs.id        UUID   — what the project management module
--                                          (ProjectHome, /api/c2c/projects) is
--                                          keyed on, and what the UI selects
--   cre_evidence_sources
--     .client_workspace_id        INTEGER — the only project scope a canonical
--                                          source could carry
--
-- So a source could never be scoped to the project a user actually has open.
-- Worse, the chat upload route parsed its `projectId` with parseInt and
-- returned 400 GOVERNED_UPLOAD_CONTEXT_INVALID when the result was NaN — so
-- uploading a file while a UUID-keyed program was selected failed outright
-- rather than landing in that project.
--
-- DECISION
-- Add `client_program_id` alongside the existing integer scope rather than
-- replacing or overloading it. Both id-spaces are real and in use; collapsing
-- them is a separate migration with its own data question. A source carries
-- whichever scope its uploader actually had:
--
--   client_program_id   set → scoped to a regulatory_programs UUID
--   client_workspace_id set → scoped to a numeric workspace (legacy/CSR paths)
--   neither             set → tenant-wide, adoptable into a project later
--
-- This is deliberately NOT a resolution of the wider CRE collision
-- (cre_evidence_sources vs clinical_evidence_sources) — see
-- docs/architecture/CLINICAL_REGULATORY_EVIDENCE_PHASE8_RETIREMENT.md. It only
-- makes program-scoped listing first-class on the table uploads already write.
--
-- SAFETY
-- Additive and idempotent. No existing column is altered and no row is
-- rewritten: every current source keeps exactly the scope it has, and the new
-- column is NULL for all of them. Nothing backfills, because no existing row
-- has a provable program.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS cre_src_program_idx;
--   ALTER TABLE cre_evidence_sources DROP COLUMN IF EXISTS client_program_id;
-- Rollback loses only the program scope, not the sources.
-- ═══════════════════════════════════════════════════════════════════════════

-- PREREQUISITE, AND WHY THIS IS GUARDED
-- `cre_evidence_sources` is created by
-- db/migrations/20260724_clinical_regulatory_evidence_spine.sql. That file is
-- merged, but it is NOT in the allowlist in scripts/db/apply-c2c-migrations.mjs
-- and CI only applies migrations a PR *adds* — to an ephemeral preview branch
-- that is deleted when the PR closes. So the spine can be absent from a real
-- database even though its migration is on the default branch, and an
-- unguarded ALTER here fails with 'relation "cre_evidence_sources" does not
-- exist'.
--
-- Rather than fail the whole migration run, this no-ops with a NOTICE when the
-- spine is absent. It is idempotent and safe to re-run: once the spine is
-- applied, run this again and the column appears. Do NOT assume the column
-- exists just because this migration reported success — check the NOTICE.
DO $$
BEGIN
  IF to_regclass('public.cre_evidence_sources') IS NULL THEN
    RAISE NOTICE 'cre_evidence_sources is not present; skipping client_program_id. Apply db/migrations/20260724_clinical_regulatory_evidence_spine.sql first, then re-run this migration (it is idempotent).';
    RETURN;
  END IF;

  ALTER TABLE cre_evidence_sources
    ADD COLUMN IF NOT EXISTS client_program_id UUID;

  COMMENT ON COLUMN cre_evidence_sources.client_program_id IS
    'regulatory_programs.id (UUID) this source is scoped to. Complements client_workspace_id, which scopes to the numeric project id-space. No FK: cre_* deliberately avoids hard cross-schema references (see the spine migration).';

  -- The Data Room lists a program's sources; that read filters on
  -- (organization_id, client_program_id) and this is the half the org index
  -- cannot serve.
  CREATE INDEX IF NOT EXISTS cre_src_program_idx
    ON cre_evidence_sources (client_program_id);
END $$;
