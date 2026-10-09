-- The four facts an IRB package manifest needs and irb_submissions never recorded.
--
-- 2026-09-22. `server/services/irb/package-manifest.ts` gates five artifact
-- slots on four facts about the study:
--
--   irb.assent                <- involves_children          (45 CFR 46.408, Subpart D)
--   irb.form-1572             <- is_ind_study               (21 CFR 312.53(c))
--   irb.financial-disclosure  <- is_ind_study               (21 CFR 54)
--   irb.hipaa-authorization   <- uses_phi                   (45 CFR 164.508)
--   irb.recruitment-material  <- uses_recruitment_material  (21 CFR 56.111(a)(3))
--
-- The table recorded none of them, so every one of those five came back
-- `undetermined` on every submission ever made and `readyToAssemble` could
-- never be true. Honest, and useless. These four columns let a sponsor record
-- the answer so a recorded answer decides the requirement.
--
-- ── Why nullable with NO DEFAULT. This is the whole point of the file. ──────
--
-- Three states have to survive from this table to the manifest:
--
--   true   -> the requirement applies; the slot is conditional-required
--   false  -> a RECORDED statement by a human; the slot is not_required
--   NULL   -> NOT RECORDED; the slot stays `undetermined`, naming the field
--             that would settle it
--
-- `boolean NOT NULL DEFAULT false` would collapse the third state into the
-- second: every row that exists, and every row ever inserted without the
-- field, would assert that the sponsor said "no". The concrete failure that
-- buys is a board receiving a package with no Form FDA 1572 because a column
-- defaulted, which is exactly the outcome package-manifest.ts's module comment
-- was written to prevent. An unrecorded field is not a record that something
-- does not apply.
--
-- So: no DEFAULT, no NOT NULL, and no backfill. Rows that predate this file
-- keep NULL and keep reporting `undetermined`, which is the truth about them.
-- Sibling columns on this table (involves_vulnerable_populations,
-- consent_waiver_requested) are NOT NULL DEFAULT false, and that is correct
-- for THEM -- they drive no not_required branch -- but it is the pattern that
-- must not be copied here. `server/services/irb/__tests__/
-- submission-context-columns.pglite.integration.test.ts` fails if a default or
-- a NOT NULL is ever added to any of the four.
--
-- ── Rule 1 (CLAUDE.md) ─────────────────────────────────────────────────────
-- Additive and replayable: ADD COLUMN IF NOT EXISTS only, no DROP, no
-- backfill, no data written. Re-running it on a database that already has the
-- columns is a no-op and does not touch a single recorded answer.
--
-- Guarded on to_regclass. irb_submissions is created by
-- migrations/20260610_irb_submissions.sql, which was registered on the applier
-- earlier the same day, so on a full applier run the table is there. The guard
-- keeps a set-only or partially-provisioned database from failing here, and
-- every statement including the COMMENTs lives INSIDE the DO block -- a bare
-- COMMENT outside its guard failed a blank-database apply with
-- `relation does not exist` earlier today, the guard protecting nothing
-- because the statement it protected ran after it.

DO $$
BEGIN
  IF to_regclass('public.irb_submissions') IS NULL THEN
    RAISE NOTICE 'irb_submissions absent, skipping submission-context columns';
    RETURN;
  END IF;

  -- Subpart D. NULL is not "no children"; it is "nobody was asked".
  ALTER TABLE irb_submissions
    ADD COLUMN IF NOT EXISTS involves_children boolean;

  -- 21 CFR 312. Gates BOTH the 1572 and the financial disclosure.
  ALTER TABLE irb_submissions
    ADD COLUMN IF NOT EXISTS is_ind_study boolean;

  -- HIPAA. NULL is not "no PHI".
  ALTER TABLE irb_submissions
    ADD COLUMN IF NOT EXISTS uses_phi boolean;

  -- Advertising and other recruitment material the board reviews.
  ALTER TABLE irb_submissions
    ADD COLUMN IF NOT EXISTS uses_recruitment_material boolean;

  EXECUTE $c$
    COMMENT ON COLUMN irb_submissions.involves_children IS
      'Subpart D (45 CFR 46.408): does this research involve children? Deliberately nullable with NO DEFAULT. true makes the assent document conditional-required, false takes it out of scope as a recorded statement, and NULL means NOT RECORDED and leaves the requirement undetermined. A DEFAULT false here would turn every unanswered submission into a sponsor assertion that no children are involved.'
  $c$;

  EXECUTE $c$
    COMMENT ON COLUMN irb_submissions.is_ind_study IS
      'Does the trial run under an IND (21 CFR 312)? Gates both Form FDA 1572 (21 CFR 312.53(c)) and the investigator financial disclosure (21 CFR 54). Nullable with NO DEFAULT: NULL means NOT RECORDED and both requirements stay undetermined. A DEFAULT false would remove Form FDA 1572 from a package on the strength of a claim nobody made.'
  $c$;

  EXECUTE $c$
    COMMENT ON COLUMN irb_submissions.uses_phi IS
      'Is protected health information used (45 CFR 164.508)? Nullable with NO DEFAULT: NULL means NOT RECORDED and the HIPAA authorization requirement stays undetermined rather than being read as "no PHI".'
  $c$;

  EXECUTE $c$
    COMMENT ON COLUMN irb_submissions.uses_recruitment_material IS
      'Does the sponsor plan to recruit with advertising or other subject-facing recruitment material (21 CFR 56.111(a)(3))? Nullable with NO DEFAULT: NULL means NOT RECORDED and the requirement stays undetermined.'
  $c$;
END $$;
