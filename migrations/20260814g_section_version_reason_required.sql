-- ============================================================================
-- Section version ledger — a missing reason is refused, not defaulted
-- (GA ledger L34)
-- ============================================================================
--
-- THE GAP. `c2c_snapshot_section_version()` RAISES when `app.actor_id` is
-- absent — attribution is mandatory and the database enforces it. The reason
-- for change got the opposite treatment one line down:
--
--     COALESCE(NULLIF(v_reason, ''), 'content change')
--
-- so a writer that set the actor but not the reason silently wrote the literal
-- string 'content change' into a NOT NULL Part 11 reason column. The row looks
-- complete. An inspector reading the ledger sees a reason for every version,
-- and cannot tell which of them a human actually gave.
--
-- 21 CFR Part 11 §11.10(e) asks for the reason where one is relevant, and the
-- whole point of the column is that it carries a human's words. A placeholder
-- satisfies the constraint while defeating the requirement, which is worse than
-- a constraint violation: a violation gets fixed, a placeholder gets filed.
--
-- THE CHANGE. The reason is now enforced exactly as the actor is — the trigger
-- raises when it is absent or blank. Two symmetric checks for two mandatory
-- facts, both in the database rather than in whichever route happens to
-- remember.
--
-- ── Why this is safe to make fail-closed now ────────────────────────────────
-- Both writers of `c2c_document_sections` already guarantee a non-empty reason:
--   • routes/c2c/documents.ts rejects the request with 400 before it opens a
--     transaction when `reason` is missing or blank;
--   • services/c2c/commit-section-to-filing.ts supplies 'authored in the
--     document editor' when the caller gave none — a default that names the
--     mechanism truthfully rather than pretending a human typed it.
-- So no current path can trip this. It exists for the next writer, which is
-- precisely the one that would otherwise reintroduce the placeholder.
--
-- ── What is NOT changed ─────────────────────────────────────────────────────
-- Existing rows carrying 'content change' are left exactly as they are. They
-- are a truthful record of what was captured at the time — which was nothing —
-- and rewriting them now would be inventing history. The string simply cannot
-- be produced any more.
--
-- ROLLBACK
--   Re-apply migrations/20260814f_section_version_ana_action_backlink.sql,
--   which carries the prior function body (with the COALESCE).
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.c2c_document_section_versions') IS NULL THEN
    RAISE NOTICE 'c2c_document_section_versions absent — reason-required trigger update skipped';
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

      -- Symmetric with the actor check above. Previously this fell through to
      -- COALESCE(…, 'content change'), which filed a placeholder as though it
      -- were a reason somebody gave.
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
         CASE WHEN OLD.draft_source IN ('ana','template','imported')
              THEN OLD.draft_source ELSE 'human' END,
         btrim(v_reason),
         v_action_id);
      NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
  END $fn$ LANGUAGE plpgsql;
END
$do$;
