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
--     each program and its project ids, and the index is not created: a unique
--     index over duplicate rows fails CREATE, and an unguarded one would fail
--     every deploy (Rule 1). Resolve the duplicates, by re-pointing the
--     artifacts of the higher id onto the lowest and clearing its anchor, and
--     the next deploy creates the index.
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
    SELECT regulatory_program_id AS program_id, array_agg(id ORDER BY id) AS project_ids
      FROM public.projects
     WHERE regulatory_program_id IS NOT NULL
     GROUP BY regulatory_program_id
    HAVING count(*) > 1
  LOOP
    found := true;
    RAISE NOTICE 'PF-08: program % has % anchor rows (projects %); one-anchor index not created',
      dup.program_id, array_length(dup.project_ids, 1), dup.project_ids;
  END LOOP;
  IF found THEN
    RETURN;
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS projects_one_anchor_per_program
    ON public.projects (regulatory_program_id) WHERE regulatory_program_id IS NOT NULL;
END
$mig$;
