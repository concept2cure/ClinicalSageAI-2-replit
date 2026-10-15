-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A program has at most one anchor row in projects (project-first plan
--          PF-08, D2/D5).
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (the integer key every governed artifact of a
--     program is filed under)
--   - Integrity Risk Addressed: one program's documents split across two
--     integer projects, so one export files under one row and the next under
--     the other.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261001b_projects_one_anchor_per_program.sql
--
-- AMENDED IN PLACE 2026-10-01 (review wf_6f56bbd0-de6; CLAUDE.md Rule 1). The
-- NOTICE now names each anchor row's organization, and the remedy below
-- separates a same-organization duplicate from a cross-organization one. As
-- first pushed, it named only project ids and gave one remedy, which for a
-- cross-organization pair would have moved one tenant's records onto another
-- tenant's project. No schema object changed; the journal records drift for
-- this file, and that is this amendment.
--
-- WHY. projects.regulatory_program_id (20260814) is the anchor from a program to
-- the integer projects row its artifacts, packages and tasks hang from. Nothing
-- held it unique: 20260814 created a plain index, and its backfill linked by
-- name. The one writer today, intake's ensureProgramProjectAnchor, links an
-- existing row rather than forking, but that is a check in code. The reader,
-- program-project-anchor.ts readProgramAnchorRow, reads the lowest id, the row
-- intake links, and names a second row in the log.
--
-- WHAT. A partial unique index projects_one_anchor_per_program on
-- (regulatory_program_id) WHERE regulatory_program_id IS NOT NULL.
--   * Created only when no program has two anchor rows. Otherwise a NOTICE names
--     each program and its anchor rows as project@organization, and the index is
--     not created: a unique index over duplicate rows fails CREATE, and an
--     unguarded one would fail every deploy (Rule 1). The index is global, not
--     per organization: a program belongs to one organization, so it has one
--     anchor row in all of projects. Resolve the duplicates and the next deploy
--     creates the index:
--       - A row whose organization is not the program's is a cross-tenant
--         anchor, written unchecked 2026-08-14..09-24 (20260926b's header).
--         scripts/db/program-same-org-preflight.mjs lists it. Clear that row's
--         regulatory_program_id; move nothing between organizations.
--       - Rows of the program's own organization: re-point the higher ids'
--         records onto the lowest id (the row every reader reads) and clear
--         the higher ids' anchors.
--   * The intake writer runs inside the program's creating transaction. A
--     second anchor insert is refused 23505, and the program's creation rolls
--     back: fail closed. The program id is minted in that same uncommitted
--     transaction, so the race is not reachable in practice.
--
-- RULE 1: replayed on every deploy. Once the index exists, a replay does
-- nothing. While duplicates remain, every replay repeats the NOTICE. No DROP.
--
-- Pinned by tests/schema-contract/projects-one-anchor-per-program.pglite.test.ts.
-- =============================================================================

DO $mig$
DECLARE
  dup RECORD;
  found boolean := false;
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE NOTICE 'projects absent - PF-08 one-anchor index skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.projects'::regclass
                    AND attname = 'regulatory_program_id' AND NOT attisdropped) THEN
    RAISE NOTICE 'projects.regulatory_program_id absent - PF-08 one-anchor index skipped';
    RETURN;
  END IF;
  IF to_regclass('public.projects_one_anchor_per_program') IS NOT NULL THEN
    RETURN;
  END IF;
  FOR dup IN
    SELECT regulatory_program_id AS program_id, count(*) AS n,
           string_agg(id::text || '@' || organization_id::text, ', ' ORDER BY id) AS anchor_rows
      FROM public.projects
     WHERE regulatory_program_id IS NOT NULL
     GROUP BY regulatory_program_id
    HAVING count(*) > 1
  LOOP
    found := true;
    RAISE NOTICE 'PF-08: program % has % anchor rows (project@organization: %); one-anchor index not created',
      dup.program_id, dup.n, dup.anchor_rows;
  END LOOP;
  IF found THEN
    RETURN;
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS projects_one_anchor_per_program
    ON public.projects (regulatory_program_id) WHERE regulatory_program_id IS NOT NULL;
END
$mig$;
