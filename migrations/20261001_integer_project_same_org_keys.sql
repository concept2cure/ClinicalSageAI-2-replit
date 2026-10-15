-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A governed artifact, a submission package, a conversation and AnA's
--          working memory can name an integer project only of their OWN
--          organization, enforced by the database (project-first plan PF-03,
--          D3; the integer half of PF-04; PF-10 S11).
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (the project every governed record starts at)
--   - Integrity Risk Addressed: tenant isolation — an artifact of organization
--     A filed under organization B's project is listed under B's project,
--     shows B's project code to A, and is cascaded away when B deletes it.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261001_integer_project_same_org_keys.sql
--
-- AMENDED IN PLACE 2026-10-01 (PF-13 follow-up, D5; CLAUDE.md Rule 1). The
-- working-memory key's delete action is SET NULL (project_id), not NO ACTION,
-- with 20260820's own key on the column, so that a project delete detaches the
-- summaries of its conversations instead of being refused by them (see
-- 20260820's note). Where the NO ACTION version deployed, the block below
-- replaces it in place, only when it is not already SET NULL.
--
-- AMENDED IN PLACE 2026-10-01 (PF-10 S11; CLAUDE.md Rule 1). Added the fourth
-- key, conversation_working_memory (project_id, organization_id), (see its
-- block below), and a preflight entry. The other
-- statements are unchanged; the journal records drift for this file once more,
-- and this note is why.
--
-- AMENDED IN PLACE 2026-10-01 (PF-03 rest; CLAUDE.md Rule 1). Added the third
-- key, concept2cure_conversations (project_id, organization_id), and replaced
-- the "NOT KEYED HERE" note below, which was wrong: it named the AnA stream as
-- an unchecked writer of concept2cure_conversations.project_id. The stream does
-- not write that table. Its one production writer is POST
-- /api/concept2cure/projects/:projectId/conversations (server/routes/c2c/
-- conversations.ts), which runs verifyProjectAccess, an organization-scoped
-- project read, before the insert. The other statements are unchanged; the
-- journal records drift for this file, and that is this amendment.
--
-- WHY. concept2cure_artifacts.project_id and c2c_submission_packages.project_id
-- are integer keys to projects(id). Each proves the project exists, not that it
-- is the row's organization's. PF-03 (2026-10-01) made five writers check
-- ownership first, through projectBelongsToTenant:
--   chat upload, POST /api/submission-ops/packages, AnA
--   create_submission_package, and the artifact version store (the stream's
--   draft save and commit_document_revision).
-- But concept2cure_artifacts has eleven writers, and a check in code covers
-- only the ones that make it. At the time of writing, AnA approve_import and
-- save_document_to_vault and POST /api/knowledge-base/save-docx-as-artifact
-- still insert an unchecked project id. A review of PF-08 also showed the cost
-- (wf_72c8daf0-af3): under row-level security a project's delete cannot see a
-- foreign organization's artifact filed under it, and the cascade removes it
-- anyway.
--
-- WHAT. One composite key per table, (project_id, org) → projects (id,
-- organization_id), on a unique index projects_id_org_uq created here when
-- absent. projects.id is the primary key, so the index can never conflict.
--   * NOT VALID: existing rows are not scanned, so a legacy cross-organization
--     row does not fail the deploy. Every row inserted, and every row whose
--     project or organization changes, is checked from here on.
--     scripts/db/program-same-org-preflight.mjs lists the legacy rows.
--   * ON DELETE CASCADE, the action each table's existing project_id key
--     already has (0000_sweet_joseph.sql:6488; 0002_phase15_submission_ops.sql
--     and shared/schema.ts for the drizzle-pushed install). Two keys with
--     opposite delete actions on one column resolve by RI trigger-name order
--     (see the c2c_documents block of 20260926b), so the actions must agree.
--     A project delete therefore behaves exactly as before; PF-08 decides
--     whether it may happen.
--   * ON UPDATE NO ACTION (the default): a project with another
--     organization's records under it cannot be moved to another organization.
--
-- concept2cure_conversations (project_id, organization_id) is the third key
-- (amended 2026-10-01, above). Its one writer checks the project's organization
-- first, so the key refuses nothing that writer sends; it holds the next writer.
-- ON DELETE CASCADE, as its existing key (0000_sweet_joseph.sql:6493).
--
-- conversation_working_memory (project_id, organization_id) is the fourth key
-- (PF-10 S11, amended 2026-10-01). AnA's working memory records the project a
-- thread was held in, and the nightly consolidation promotes it into that
-- project's memory (memory-consolidation-job.ts), so a summary written under
-- another organization's project would become that project's memory. Its
-- writers take the project from the turn: the anchor of a v2 program
-- (org-scoped, project-ref.ts) or the integer the client sent, which nothing
-- checks. The writer (working-memory.ts) catches a refusal and logs it, so a
-- refused summary costs that turn's summary and never the turn.
-- ON DELETE SET NULL (project_id), as its existing key (20260820_working_memory_project_id.sql,
-- amended 2026-10-01), for the same reason the actions agree above: a project
-- delete detaches the summary, keeping the organization. project_id is
-- nullable: a thread held in no project writes NULL, which the key does not
-- check.
-- 20260820 creates the table and runs before this file on the applier.
--
-- RULE 1: replayed on every deploy. Each statement runs only when its object
-- is absent (to_regclass / pg_constraint), so a replay executes no DDL and takes
-- no lock. One DO block per table, so one table's absence never skips another.
-- No DROP; no COMMENT.
--
-- Pinned by tests/schema-contract/integer-project-same-org-keys.pglite.test.ts.
-- =============================================================================

DO $mig$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE NOTICE 'projects absent - PF-03 integer same-org keys skipped';
    RETURN;
  END IF;
  IF to_regclass('public.projects_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS projects_id_org_uq ON public.projects (id, organization_id);
  END IF;
END
$mig$;

-- concept2cure_artifacts (project_id, organization_id)
DO $mig$
BEGIN
  IF to_regclass('public.concept2cure_artifacts') IS NULL OR to_regclass('public.projects_id_org_uq') IS NULL THEN
    RAISE NOTICE 'concept2cure_artifacts or projects_id_org_uq absent - artifacts key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concept2cure_artifacts_project_same_org_fk'
                    AND conrelid = 'public.concept2cure_artifacts'::regclass) THEN
    ALTER TABLE public.concept2cure_artifacts
      ADD CONSTRAINT concept2cure_artifacts_project_same_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$mig$;

-- c2c_submission_packages (project_id, org_id)
DO $mig$
BEGIN
  IF to_regclass('public.c2c_submission_packages') IS NULL OR to_regclass('public.projects_id_org_uq') IS NULL THEN
    RAISE NOTICE 'c2c_submission_packages or projects_id_org_uq absent - packages key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_submission_packages_project_same_org_fk'
                    AND conrelid = 'public.c2c_submission_packages'::regclass) THEN
    ALTER TABLE public.c2c_submission_packages
      ADD CONSTRAINT c2c_submission_packages_project_same_org_fk
      FOREIGN KEY (project_id, org_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$mig$;

-- concept2cure_conversations (project_id, organization_id) — amended 2026-10-01
DO $mig$
BEGIN
  IF to_regclass('public.concept2cure_conversations') IS NULL OR to_regclass('public.projects_id_org_uq') IS NULL THEN
    RAISE NOTICE 'concept2cure_conversations or projects_id_org_uq absent - conversations key skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concept2cure_conversations_project_same_org_fk'
                    AND conrelid = 'public.concept2cure_conversations'::regclass) THEN
    ALTER TABLE public.concept2cure_conversations
      ADD CONSTRAINT concept2cure_conversations_project_same_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$mig$;

-- conversation_working_memory (project_id, organization_id) — amended 2026-10-01 (PF-10 S11)
DO $mig$
BEGIN
  IF to_regclass('public.conversation_working_memory') IS NULL OR to_regclass('public.projects_id_org_uq') IS NULL THEN
    RAISE NOTICE 'conversation_working_memory or projects_id_org_uq absent - working-memory key skipped';
    RETURN;
  END IF;
  -- The NO ACTION version (deployed before the PF-13 amendment) is replaced in place.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_working_memory_project_same_org_fk'
                AND conrelid = 'public.conversation_working_memory'::regclass AND confdeltype <> 'n') THEN
    ALTER TABLE public.conversation_working_memory DROP CONSTRAINT conversation_working_memory_project_same_org_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_working_memory_project_same_org_fk'
                    AND conrelid = 'public.conversation_working_memory'::regclass) THEN
    ALTER TABLE public.conversation_working_memory
      ADD CONSTRAINT conversation_working_memory_project_same_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE SET NULL (project_id)
      NOT VALID;
  END IF;
END
$mig$;
