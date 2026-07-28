-- c2c_snapshot_section_version(): stop stamping every superseded version
-- 'human'.
--
-- ── The defect ───────────────────────────────────────────────────────────────
-- The Part 11 version ledger recorded author_kind as the literal 'human' for
-- every row, regardless of how the content was produced. The route collects the
-- provenance correctly — server/routes/c2c/documents.ts validates draftSource
-- against {human, ana} and writes it to c2c_document_sections.draft_source —
-- and the trigger discarded it.
--
-- So AnA-generated text entered the immutable record asserting that a person
-- wrote it. c2c_document_sections.draft_source is mutable and is overwritten by
-- the next edit, which makes c2c_document_section_versions the only place the
-- fact can survive at all. 21 CFR Part 11 §11.10(e) requires that record to be
-- accurate; this made it uniformly false for AI-assisted content.
--
-- ── OLD.draft_source, not NEW.draft_source ───────────────────────────────────
-- Each version row stores OLD.content — the text being superseded — so
-- author_kind must describe how THAT text was authored. Reading NEW.draft_source
-- would stamp the snapshot with the provenance of the incoming edit: a human
-- editing an AnA-drafted section would relabel the AnA draft 'human', which is
-- the exact falsification this migration exists to remove.
--
-- author_id and reason keep their existing meaning (the actor performing the
-- supersession, and their stated reason). That is deliberately unchanged:
-- c2c_document_sections.owner_id is never written by any route, so there is no
-- stored id for "who authored OLD.content", and inventing one would need a
-- schema change plus a backfill rather than a trigger replacement.
--
-- ── Scope ────────────────────────────────────────────────────────────────────
-- CREATE OR REPLACE FUNCTION only. The trigger binding is unchanged, no table
-- is altered, and no existing row is rewritten: rows already written as 'human'
-- stay as they are, because retro-labelling an immutable Part 11 ledger from
-- inferred data would be a worse defect than the one being fixed. This corrects
-- the record from here forward.
--
-- Guarded on the table existing so the file is a no-op on a database that has
-- not yet had 20260528_phase9_document_schema.sql applied — deploy-migrate runs
-- with stopOnFirstFailure, so an unguarded reference here would abort the
-- entire deploy migration set.

DO $$
BEGIN
  IF to_regclass('public.c2c_document_sections') IS NULL
     OR to_regclass('public.c2c_document_section_versions') IS NULL THEN
    RAISE NOTICE 'c2c document schema absent; skipping author_kind trigger fix';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION c2c_snapshot_section_version() RETURNS trigger AS $body$
    DECLARE
      v_actor  text := current_setting('app.actor_id', true);
      v_reason text := current_setting('app.reason', true);
    BEGIN
      IF OLD.content IS DISTINCT FROM NEW.content THEN
        IF v_actor IS NULL OR v_actor = '' THEN
          RAISE EXCEPTION 'c2c_snapshot_section_version: app.actor_id GUC required for section content change (Part-11 attribution)';
        END IF;
        INSERT INTO c2c_document_section_versions
          (section_id, version, content, author_id, author_kind, reason)
        VALUES
          (NEW.id, OLD.version, OLD.content, v_actor::integer,
           CASE WHEN OLD.draft_source IN ('ana','template','imported')
                THEN OLD.draft_source ELSE 'human' END,
           COALESCE(NULLIF(v_reason, ''), 'content change'));
        NEW.version := OLD.version + 1;
      END IF;
      RETURN NEW;
    END $body$ LANGUAGE plpgsql;
  $fn$;
END $$;
