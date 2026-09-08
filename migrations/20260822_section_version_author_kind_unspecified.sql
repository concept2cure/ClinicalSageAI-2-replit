-- ════════════════════════════════════════════════════════════════════════════
-- An unstated author is recorded as UNSPECIFIED, not as a human.
--
-- THE GAP. Two layers turned silence into a positive claim of human authorship
-- in the system of record for a regulatory filing:
--
--   1. POST/PATCH /api/c2c/documents/:id/sections/:key resolved an omitted
--      `draftSource` to the literal 'human' (`draftSource ?? 'human'`).
--   2. This trigger's CASE fell through to 'human' for any draft_source outside
--      ('ana','template','imported') — which includes NULL, i.e. "nobody said".
--
-- So a save that stated nothing about where its text came from produced a
-- version row asserting a named person wrote it. Fixing only the route moves
-- the invention down here; fixing only this leaves the route asserting. Both
-- change together, which is why this migration accompanies that route change.
--
-- WHY THIS MATTERS MORE THAN IT LOOKS. `author_kind` is what an inspector reads
-- to answer "who wrote this section". ALCOA+ asks that a record be Attributable
-- and Original; a default that manufactures human authorship from an absent
-- field is neither, and it is invisible — the row looks exactly like a genuine
-- human assertion, so no later audit can distinguish them. "Not stated" is a
-- true answer and 'human' is a guess wearing the same clothes.
--
-- WHY 'unspecified' AND NOT NULL. `author_kind` is NOT NULL with DEFAULT
-- 'human' (20260528_phase9_document_schema.sql:136) and the schema deliberately
-- carries no CHECK, so a new vocabulary value is representable without a
-- constraint migration on a table that may already hold rows. Nothing in the
-- application reads `author_kind` today, so no consumer breaks; the value
-- exists to be read by a human or an auditor.
--
-- HISTORY IS NOT REWRITTEN. Rows already written as 'human' stay as they are.
-- They record what the system believed at the time, and rewriting them would
-- be a worse falsification than the one being fixed — an audit trail edited
-- after the fact. Only rows written from here on carry the honest value.
--
-- THE SAME FIX AS 20260814g, ONE COLUMN OVER. That migration refused a missing
-- `reason` instead of defaulting it to the literal 'content change', on exactly
-- this reasoning: "a placeholder satisfies the constraint while defeating the
-- requirement, which is worse than a constraint violation: a violation gets
-- fixed, a placeholder gets filed." `author_kind` had the same shape and is
-- fixed the same way. This migration is built ON 20260814g's function body and
-- keeps its mandatory-reason RAISE verbatim — it is the fifth definition of
-- c2c_snapshot_section_version() and must run last, so it carries everything
-- the four before it established.
--
-- Idempotent: CREATE OR REPLACE of one function, guarded on the table existing.
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  IF to_regclass('public.c2c_document_section_versions') IS NULL THEN
    RAISE NOTICE 'c2c_document_section_versions absent — author_kind honesty update skipped';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION c2c_snapshot_section_version()
  RETURNS TRIGGER AS $fn$
  DECLARE
    v_actor  text := current_setting('app.actor_id', true);
    v_reason text := current_setting('app.reason', true);
    v_action text := current_setting('app.ana_action_id', true);
    v_action_id text := NULL;
  BEGIN
    IF NEW.content IS DISTINCT FROM OLD.content THEN
      IF v_actor IS NULL OR v_actor = '' THEN
        RAISE EXCEPTION
          'c2c_document_sections: content changed with no app.actor_id — Part 11 attribution is mandatory';
      END IF;

      -- Carried forward from 20260814g. Symmetric with the actor check above.
      IF v_reason IS NULL OR btrim(v_reason) = '' THEN
        RAISE EXCEPTION
          'c2c_document_sections: content changed with no app.reason — Part 11 reason-for-change is mandatory';
      END IF;

      -- Only link to an action that exists: a dangling FK reference raised from
      -- inside a BEFORE UPDATE trigger would turn a section save into a 500.
      IF v_action IS NOT NULL AND v_action <> '' THEN
        SELECT id INTO v_action_id FROM c2c_ana_actions WHERE id = v_action;
      END IF;

      INSERT INTO c2c_document_section_versions
        (section_id, version, content, author_id, author_kind, reason, ana_action_id)
      VALUES
        (NEW.id, OLD.version, OLD.content, v_actor::integer,
         -- author_kind describes the CONTENT IN THIS ROW, which is OLD.content,
         -- so it is read from OLD.draft_source, not NEW.draft_source.
         --
         -- 'human' is now claimed only when the save SAID 'human'. Anything
         -- unstated — NULL, or a value outside the vocabulary — records
         -- 'unspecified', because the honest answer to "who wrote this" is that
         -- nobody told us, and a filing record must not fill that in.
         CASE
           WHEN OLD.draft_source IN ('ana', 'template', 'imported', 'human')
             THEN OLD.draft_source
           ELSE 'unspecified'
         END,
         btrim(v_reason),
         v_action_id);
      NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
  END $fn$ LANGUAGE plpgsql;
END
$do$;
