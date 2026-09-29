-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: cre_evidence_sources.client_program_id — the project a Data Room
--          source belongs to.
--
-- AMENDED IN PLACE 2026-09-26 (project-first plans PF-04 and PF-07; CLAUDE.md
-- Rule 1). What changed: the column COMMENT this file replays, and the
-- meaning of "neither set" in the header below. No schema object changed.
--   * The comment said "No FK". migrations/20260926b_program_same_org_keys.sql
--     now holds (client_program_id, organization_id) to regulatory_programs
--     (id, organization_id): cre_evidence_sources_program_same_org_fk, NOT
--     VALID, ON DELETE SET NULL (client_program_id). A source with no
--     organization (GLOBAL_PUBLIC) may carry no project:
--     cre_evidence_sources_program_needs_org.
--   * "Tenant-wide, adoptable later" no longer describes a chat upload with no
--     project open. Founder decision PF-07 (2026-09-26): that file stays a
--     conversation file with no source row until POST
--     /api/c2c/projects/:id/adopt brings it into a project.
-- The replayed comment text differs, so the journal records drift for this
-- file; that is this amendment.
-- =============================================================================
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
--                             (a chat upload no longer lands here: PF-07, header)
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
    'regulatory_programs.id (UUID) this source is scoped to. Complements client_workspace_id, which scopes to the numeric project id-space. Held to the source''s own organization by cre_evidence_sources_program_same_org_fk (migrations/20260926b_program_same_org_keys.sql, PF-04): NOT VALID, ON DELETE SET NULL (client_program_id); a GLOBAL_PUBLIC source carries no project (cre_evidence_sources_program_needs_org).';

  -- The Data Room lists a program's sources; that read filters on
  -- (organization_id, client_program_id) and this is the half the org index
  -- cannot serve.
  CREATE INDEX IF NOT EXISTS cre_src_program_idx
    ON cre_evidence_sources (client_program_id);
END $$;
