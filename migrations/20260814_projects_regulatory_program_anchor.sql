-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: projects.regulatory_program_id — the bridge from the legacy integer
--          project to its regulatory program (uuid).
--
-- AMENDED IN PLACE 2026-09-26 (project-first plan PF-04; CLAUDE.md Rule 1).
--   What changed: the "Why NO FOREIGN KEY" section below and the column
--   COMMENT this file replays. Both said regulatory_programs "is created by no
--   durable applier". That was false: its creator,
--   migrations/20260524_program_workbench_schema.sql, is entry 1 of
--   C2C_MIGRATION_FILES. The anchor is now held to the project's own
--   organization by projects_regulatory_program_same_org_fk, added by
--   migrations/20260926b_program_same_org_keys.sql (NOT VALID, ON DELETE SET
--   NULL (regulatory_program_id)). No schema object here changed; this file
--   still creates the column and index only. The replayed comment text differs,
--   so the journal records drift for this file; that is this amendment.
-- =============================================================================
-- ============================================================================
-- Program anchor — projects.regulatory_program_id
-- (Document Identity Contract 2026-08, slice C1; approved 2026-08-13)
-- ============================================================================
--
-- THE DEFECT. Live code has assumed this column exists for a long time and no
-- migration ever created it:
--
--   server/routes/mdx-vault.ts   filtered the Vault listing on
--     `projects.regulatory_program_id` while its own header comment asserted the
--     column "was added by the MDX migration". It was not. Every program-scoped
--     Vault request raised 42703 and 500'd; a second site selected the same
--     phantom column unconditionally, so artifact-version reads 500'd on EVERY
--     call. Corrected 2026-08-13 to refuse honestly (422) pending this file.
--
-- The absence is the root of the wider split documented in
-- docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md §1: `regulatory_programs.id` is
-- uuid (the spine every v2 surface uses) while `projects.id` is integer (the
-- legacy PM spine that `concept2cure_artifacts.project_id` FKs to). With no
-- bridge, governed 510(k)/CER exports for uuid programs cannot be written to
-- the artifact registry at all — they are delivered "audited but unplaced" —
-- and Module-1 form blockers cannot clear because forms and readiness count
-- different lineages.
--
-- THE RESOLUTION. One additive, nullable uuid column on `projects` plus an
-- index. NULL means "this project is not anchored to a regulatory program",
-- which is the correct and common state; nothing is required to be anchored.
--
-- ── The key (amended 2026-09-26) ───────────────────────────────────────────
-- This file adds no foreign key; migrations/20260926b_program_same_org_keys.sql
-- does. As first written, this section gave two reasons for having none:
--
--   1. "regulatory_programs reaches no already-provisioned database; its only
--      creator is on no durable applier." False when written and false now: that
--      creator is migrations/20260524_program_workbench_schema.sql, entry 1 of
--      C2C_MIGRATION_FILES, so every database deploy-migrate has touched has it.
--   2. "A guarded key would exist on some databases and not others." The
--      20260926b key is guarded on its target, and every applier that runs this
--      file runs the target's creator first, so it exists wherever this column
--      does.
--
-- Meanwhile the column was written unchecked from 2026-08-14 to 2026-09-24
-- (ana-platform-controller), so an anchor could name another organization's
-- program. 20260926b holds (regulatory_program_id, organization_id) to
-- regulatory_programs (id, organization_id) — NOT VALID, so rows written before
-- it are not scanned (scripts/db/program-same-org-preflight.mjs lists them), and
-- ON DELETE SET NULL (regulatory_program_id), so a tenant purge that deletes the
-- program un-anchors the project instead of failing. Reads must still tolerate a
-- NULL anchor; a same-organization anchor to a soft-deleted program is still
-- possible, and readers still check deleted_at.
--
-- ── Backfill semantics: unambiguous 1:1 only, never a guess ─────────────────
-- A pair (project P, program G) is a CANDIDATE when all of:
--   • P.organization_id = G.organization_id      (same tenant, always)
--   • G.deleted_at IS NULL                       (soft-deleted programs never link)
--   • P.regulatory_program_id IS NULL            (an existing anchor is never overwritten)
--   • G is not already anchored by some other project row
--   • lower(btrim(P.code)) = lower(btrim(G.code))  — exact code match, OR
--     lower(btrim(P.name)) = lower(btrim(G.name))  — exact name match
--     (both sides non-empty; matching on the empty string would join everything)
--
-- A candidate pair is APPLIED only when it is unambiguous in BOTH directions:
-- the project appears in exactly one distinct candidate pair AND the program
-- appears in exactly one distinct candidate pair. A project matching two
-- programs, or a program matched by two projects, links NEITHER — it is left
-- NULL. There is no scoring, no "best" match, and no preference of code over
-- name: a preference would silently resolve exactly the ambiguity that means we
-- do not know the answer. An unanchored project costs a degraded surface; a
-- wrongly anchored one files one customer's export into another customer's
-- program lineage.
--
-- Re-runnable: the `P.regulatory_program_id IS NULL` and not-already-anchored
-- predicates make a second application a no-op, and they also mean the backfill
-- can never overwrite an anchor set by intake or by a human.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS projects_regulatory_program_idx;
--   ALTER TABLE projects DROP COLUMN IF EXISTS regulatory_program_id;
-- Rollback loses only the anchor; no project or program row is touched.
-- ============================================================================

-- ─── 1. The column + index ──────────────────────────────────────────────────
-- ALTER TABLE IF EXISTS / ADD COLUMN IF NOT EXISTS: idempotent, and a no-op on a
-- database that somehow has no `projects` table (it is a drizzle-push base
-- table, so this is belt-and-braces rather than an expected state).

ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS regulatory_program_id UUID;

DO $do$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE NOTICE 'projects absent — program anchor skipped';
    RETURN;
  END IF;

  -- Plain (not partial) index, deliberately: shared/schema.ts declares the
  -- drizzle mirror with the SAME NAME, and drizzle-kit push cannot express a
  -- partial index there. A partial index here and a full one on fresh installs
  -- would be two shapes under one name — the exact divergence class the D11d
  -- consolidation existed to end.
  EXECUTE 'CREATE INDEX IF NOT EXISTS projects_regulatory_program_idx
             ON projects (regulatory_program_id)';

  EXECUTE $q$COMMENT ON COLUMN projects.regulatory_program_id IS
    'Anchor to regulatory_programs.id (uuid). NULL = not anchored, which is a valid and common state. Held to this project''s own organization by projects_regulatory_program_same_org_fk (migrations/20260926b_program_same_org_keys.sql, PF-04): NOT VALID, ON DELETE SET NULL (regulatory_program_id).'$q$;
END
$do$;

-- ─── 2. Backfill — unambiguous same-org exact code/name matches only ─────────

DO $do$
DECLARE
  linked INTEGER := 0;
BEGIN
  IF to_regclass('public.projects') IS NULL
     OR to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE NOTICE 'projects or regulatory_programs absent — anchor backfill skipped';
    RETURN;
  END IF;

  -- Every column the match predicate reads must be present, or the statement
  -- below fails at plan time (42703) and takes the whole migration set with it
  -- (deploy-migrate runs stopOnFirstFailure). Skipping is the fail-closed
  -- outcome: an un-backfilled anchor is a degraded surface, and the column
  -- itself — the thing live code needs — has already landed above.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'regulatory_programs'
       AND column_name IN ('code', 'name', 'organization_id', 'deleted_at')
     GROUP BY table_name HAVING count(DISTINCT column_name) = 4
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'projects'
       AND column_name IN ('code', 'name', 'organization_id')
     GROUP BY table_name HAVING count(DISTINCT column_name) = 3
  ) THEN
    RAISE NOTICE 'projects/regulatory_programs lack a column the match predicate reads — anchor backfill skipped (column itself is in place)';
    RETURN;
  END IF;

  WITH candidate AS (
    SELECT DISTINCT p.id AS project_id, g.id AS program_id
      FROM projects p
      JOIN regulatory_programs g
        ON g.organization_id = p.organization_id
       AND (
             (   lower(btrim(p.code)) = lower(btrim(g.code))
             AND btrim(coalesce(p.code, '')) <> '' )
          OR (   lower(btrim(p.name)) = lower(btrim(g.name))
             AND btrim(coalesce(p.name, '')) <> '' )
           )
     WHERE p.regulatory_program_id IS NULL
       AND g.deleted_at IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM projects x WHERE x.regulatory_program_id = g.id
           )
  ),
  unambiguous AS (
    SELECT c.project_id, c.program_id
      FROM candidate c
     WHERE (SELECT count(*) FROM candidate c2 WHERE c2.project_id = c.project_id) = 1
       AND (SELECT count(*) FROM candidate c3 WHERE c3.program_id = c.program_id) = 1
  )
  UPDATE projects p
     SET regulatory_program_id = u.program_id
    FROM unambiguous u
   WHERE p.id = u.project_id
     AND p.regulatory_program_id IS NULL;

  GET DIAGNOSTICS linked = ROW_COUNT;
  RAISE NOTICE 'program anchor backfill: % project row(s) linked on an unambiguous same-org exact code/name match; every ambiguous or unmatched project left NULL', linked;
END
$do$;
