-- Backfill: the ICH M11 discontinuation / withdrawal section, onto clinical
-- protocols seeded before it existed.
--
-- 2026-09-22. SECTION_TEMPLATES.clinical in
-- server/services/protocol-development/protocol-development-logic.ts carried
-- twelve sections, each stamped with ICH M11 as its basis, and none of them
-- covered discontinuation of trial intervention or participant withdrawal. A
-- protocol seeded from that template could have every required section marked
-- complete and pass the finalize gate while saying nothing about when dosing
-- stops or how a participant leaves the study. protocol-rule-pack.ts reports
-- it as ich-m11-discontinuation-withdrawal and a test pins the gap.
--
-- The template now carries the section, which fixes NEW protocols. This file
-- fixes the ones already in a deployed database.
--
-- Rule 1 (CLAUDE.md): every file in C2C_MIGRATION_FILES re-executes on every
-- deploy, so this must be replayable. It is, and the guard is the inserted row
-- itself: a document that already has a 'discontinuation' section is skipped
-- entirely, including the order_index shift, so a second run is a no-op. The
-- shift and the insert happen together per document for the same reason -- a
-- document is never left shifted-but-not-inserted.
--
-- Finalized and superseded protocols are deliberately NOT touched. A finalized
-- protocol is a record of what was approved; adding a required section to it
-- would rewrite that record and drop its completeness after the fact. Those
-- documents carry the gap and the rule pack reports it, which is the honest
-- outcome.
--
-- Guarded on to_regclass: protocol_documents is created by the Drizzle schema
-- install-fresh pushes and by no file in this set, so on a set-only database
-- this NOTICE-skips rather than failing.

DO $$
DECLARE
  d           record;
  anchor_idx  integer;
BEGIN
  IF to_regclass('public.protocol_documents') IS NULL
     OR to_regclass('public.protocol_sections') IS NULL THEN
    RAISE NOTICE 'protocol_documents/protocol_sections absent, skipping discontinuation backfill';
    RETURN;
  END IF;

  FOR d IN
    SELECT pd.id, pd.organization_id, pd.created_by
      FROM protocol_documents pd
     WHERE pd.protocol_kind = 'clinical'
       AND pd.deleted_at IS NULL
       AND pd.status NOT IN ('finalized', 'superseded')
       AND NOT EXISTS (
             SELECT 1 FROM protocol_sections ps
              WHERE ps.protocol_document_id = pd.id
                AND ps.deleted_at IS NULL
                AND ps.section_key = 'discontinuation'
           )
  LOOP
    -- Place it directly after 'intervention' where that section exists; a
    -- document missing it (hand-built, or from an older template) gets the new
    -- section at the end rather than at a guessed position.
    SELECT ps.order_index INTO anchor_idx
      FROM protocol_sections ps
     WHERE ps.protocol_document_id = d.id
       AND ps.deleted_at IS NULL
       AND ps.section_key = 'intervention'
     LIMIT 1;

    IF anchor_idx IS NULL THEN
      SELECT COALESCE(MAX(ps.order_index), -1) INTO anchor_idx
        FROM protocol_sections ps
       WHERE ps.protocol_document_id = d.id
         AND ps.deleted_at IS NULL;
    ELSE
      UPDATE protocol_sections
         SET order_index = order_index + 1
       WHERE protocol_document_id = d.id
         AND deleted_at IS NULL
         AND order_index > anchor_idx;
    END IF;

    INSERT INTO protocol_sections
      (organization_id, protocol_document_id, section_key, title, required, status, order_index, created_by)
    VALUES
      (d.organization_id, d.id, 'discontinuation',
       'Discontinuation of Intervention & Participant Withdrawal',
       true, 'not_started', anchor_idx + 1, d.created_by);
  END LOOP;
END $$;
