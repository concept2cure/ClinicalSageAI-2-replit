-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: authoring_documents.client_program_id — the project an Authoring
--          document belongs to.
--
-- AMENDED IN PLACE 2026-09-26 (project-first plans PF-04 and PF-07; CLAUDE.md
-- Rule 1). What changed: the column COMMENT this file replays, and the
-- meaning of NULL in the header below. No schema object changed.
--   * The comment said "No FK". migrations/20260926b_program_same_org_keys.sql
--     now holds (client_program_id, tenant_id) to regulatory_programs (id,
--     organization_id): authoring_documents_program_same_org_fk, NOT VALID,
--     ON DELETE SET NULL (client_program_id).
--   * NULL no longer means "org-wide, adoptable later" for new rows. Founder
--     decision PF-07 (2026-09-26): a document belongs to a project, and POST
--     /api/authoring/docs refuses a create with none (400 PROJECT_REQUIRED).
--     NULL is now only a legacy row written before that, or one un-anchored by
--     a program's deletion.
-- The replayed comment text differs, so the journal records drift for this
-- file; that is this amendment.
-- =============================================================================
-- ═══════════════════════════════════════════════════════════════════════════
-- authoring_documents — scope an authoring document to a UUID-keyed program
--
-- PROBLEM THIS FIXES
-- The flagship authoring loop (server/routes/authoring.router.ts + the
-- DocumentAuthoring surface) is tenant-scoped only:
--
--   authoring_documents.tenant_id   INTEGER — the organization the document
--                                             belongs to
--
-- There is no link to the project a tester actually creates and has open
-- (regulatory_programs.id, a UUID — what ProjectHome and /api/c2c/projects are
-- keyed on). So "create a project → author ITS documents" cannot be expressed:
-- the authoring tree can only filter by module/status across the whole org, and
-- a new document cannot be tagged to the project it belongs to.
--
-- DECISION
-- Add `client_program_id` alongside the existing tenant scope — the SAME name
-- and shape base uses to program-scope canonical sources
-- (migrations/20260726_cre_source_program_scope.sql), so the two link columns
-- are one convention across the platform and reconcile to a no-op if applied
-- more than once:
--
--   client_program_id set → scoped to a regulatory_programs UUID (project)
--   NULL                  → org-wide, adoptable into a project later
--                           (superseded 2026-09-26, PF-07: see the header)
--
-- No existing document carries a provable program, so nothing backfills.
--
-- SAFETY
-- Additive and idempotent. No existing column is altered and no row is
-- rewritten: every current document keeps its tenant scope and the new column
-- is NULL for all of them.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS authoring_documents_program_idx;
--   ALTER TABLE authoring_documents DROP COLUMN IF EXISTS client_program_id;
-- Rollback loses only the program scope, not the documents.
-- ═══════════════════════════════════════════════════════════════════════════

-- PREREQUISITE, AND WHY THIS IS GUARDED
-- `authoring_documents` is created by
-- db/migrations/20260725_authoring_document_loop_tables.sql. As base documents
-- in scripts/db/apply-c2c-migrations.mjs, "merged and applied have diverged
-- silently" — a table's CREATE can be on the default branch yet absent from a
-- given database. An unguarded ALTER would then fail with 'relation
-- "authoring_documents" does not exist' and abort the whole run.
--
-- So this no-ops with a NOTICE when the table is absent. It is idempotent and
-- safe to re-run: once the loop tables are applied, run this again and the
-- column appears. Do NOT assume the column exists just because this migration
-- reported success — check the NOTICE.
DO $$
BEGIN
  IF to_regclass('public.authoring_documents') IS NULL THEN
    RAISE NOTICE 'authoring_documents is not present; skipping client_program_id. Apply db/migrations/20260725_authoring_document_loop_tables.sql first, then re-run this migration (it is idempotent).';
    RETURN;
  END IF;

  ALTER TABLE authoring_documents
    ADD COLUMN IF NOT EXISTS client_program_id UUID;

  COMMENT ON COLUMN authoring_documents.client_program_id IS
    'regulatory_programs.id (UUID) this document belongs to (PF-07: required for new documents). Complements tenant_id, which scopes to the organization. Held to that organization by authoring_documents_program_same_org_fk (migrations/20260926b_program_same_org_keys.sql, PF-04): NOT VALID, ON DELETE SET NULL (client_program_id).';

  -- The authoring tree lists a project's documents; that read filters on
  -- (tenant_id, client_program_id) and this is the half the tenant index
  -- cannot serve.
  CREATE INDEX IF NOT EXISTS authoring_documents_program_idx
    ON authoring_documents (client_program_id);
END $$;
