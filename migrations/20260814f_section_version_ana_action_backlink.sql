-- ============================================================================
-- Section version ledger — write the AnA action backlink
-- (GA ledger L36)
-- ============================================================================
--
-- THE GAP. `c2c_document_section_versions.ana_action_id` was declared in the
-- Phase-9 schema as "backlink when AnA-mediated", with a foreign key to
-- `c2c_ana_actions`. The BEFORE UPDATE trigger `c2c_snapshot_section_version()`
-- is the table's ONLY writer, and its INSERT names six columns — section_id,
-- version, content, author_id, author_kind, reason — omitting this one. So the
-- column has been NULL on every row ever written, and the question it exists to
-- answer ("which AnA action produced this version?") has never been answerable.
--
-- What DOES work, and is not changed here: `author_kind` is carried from the
-- section's `draft_source`, so a version superseded from an AnA-drafted section
-- is already recorded as 'ana'. The gap is not "we cannot tell AI from human" —
-- it is "we cannot tell WHICH AnA action", which is the difference between
-- knowing a machine wrote it and being able to open the conversation, the
-- prompt, and the tool calls behind it.
--
-- THE MECHANISM. The same one the actor and reason already use: a transaction-
-- local GUC set by the route (`set_config('app.ana_action_id', …, true)`) and
-- read by the trigger. No new plumbing, and the value cannot leak to the next
-- borrower of a pooled connection because it is transaction-scoped.
--
-- ── Fail-safe on the foreign key ────────────────────────────────────────────
-- `ana_action_id` REFERENCES c2c_ana_actions(id). A GUC carrying an id that
-- does not exist would raise a FK violation from inside a BEFORE UPDATE
-- trigger, turning an ordinary section save into a 500. So the trigger only
-- uses the value when a row with that id actually exists, and otherwise writes
-- NULL. A missing backlink is a gap in the record; a save that cannot complete
-- is a section a reviewer cannot edit. The first is recoverable.
--
-- NULL here therefore means "no AnA action was named, or the one named is not
-- in the ledger" — never "this was human-authored". `author_kind` is what says
-- that, and it is unaffected.
--
-- ── No backfill ─────────────────────────────────────────────────────────────
-- None is possible: nothing recorded which action produced the existing rows,
-- and inferring one from timestamps would fabricate a link an inspector would
-- reasonably treat as recorded fact.
--
-- ROLLBACK
--   Re-apply the prior function body from
--   migrations/20260528_phase9_document_schema.sql. The column and its FK are
--   untouched by this migration; only the trigger body changes.
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.c2c_document_section_versions') IS NULL THEN
    RAISE NOTICE 'c2c_document_section_versions absent — AnA backlink trigger update skipped';
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

      -- Only link to an action that exists. See the header: a dangling FK
      -- reference here would turn a section save into a 500.
      IF v_action IS NOT NULL AND v_action <> '' THEN
        SELECT id INTO v_action_id FROM c2c_ana_actions WHERE id = v_action;
      END IF;

      INSERT INTO c2c_document_section_versions
        (section_id, version, content, author_id, author_kind, reason, ana_action_id)
      VALUES
        (NEW.id, OLD.version, OLD.content, v_actor::integer,
         CASE WHEN OLD.draft_source IN ('ana','template','imported')
              THEN OLD.draft_source ELSE 'human' END,
         COALESCE(NULLIF(v_reason, ''), 'content change'),
         v_action_id);
      NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
  END $fn$ LANGUAGE plpgsql;
END
$do$;
