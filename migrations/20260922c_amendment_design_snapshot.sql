-- The study design as it stood when an amendment was opened.
--
-- 2026-09-22. `substantiality.ts` assesses an amendment under EU CTR 536/2014
-- Article 16 from what actually CHANGED, which needs two versions of the
-- design to compare. Nothing captured a "before": protocol_versions.snapshot
-- holds the authored SECTIONS only, and the bound design in
-- cdisc_prm_studies.metadata is overwritten in place as it is edited, so by
-- the time an amendment is reviewed the version it amends is gone.
--
-- This column captures the bound design at the moment the amendment is
-- created. It is a snapshot, deliberately: a foreign key to a design version
-- would need a design-versioning scheme this platform does not have, and the
-- point of the snapshot is that it must not move when the live design does.
--
-- Additive and replayable (Rule 1, CLAUDE.md): ADD COLUMN IF NOT EXISTS, no
-- DROP, no backfill. Amendments created before this column exists keep a NULL
-- snapshot, and the assessment reports every indicator as not-assessed for
-- them rather than comparing against an invented baseline. That is the honest
-- outcome and it is pinned by a test.
--
-- Guarded on to_regclass. protocol_amendments is created by
-- migrations/20260629_protocol_amendments.sql, which is applied by install-fresh
-- ONLY, not by deploy-migrate. (Corrected 2026-09-22: this header first said
-- that file was "on the applier". It is not in C2C_MIGRATION_FILES, see
-- docs/evaluation-2026-09/evidence/03-applier-reachability.json. A database
-- built only by the set has no protocol_amendments, and the guard is what
-- keeps this file from failing there. The guard is load-bearing, not
-- belt-and-braces.) Comment-only amendment: the SQL is unchanged, and the
-- journal will record the hash change as drift.

DO $$
BEGIN
  IF to_regclass('public.protocol_amendments') IS NULL THEN
    RAISE NOTICE 'protocol_amendments absent, skipping design-snapshot column';
    RETURN;
  END IF;

  ALTER TABLE protocol_amendments
    ADD COLUMN IF NOT EXISTS study_design_snapshot jsonb;

  ALTER TABLE protocol_amendments
    ADD COLUMN IF NOT EXISTS study_design_snapshot_id text;

  ALTER TABLE protocol_amendments
    ADD COLUMN IF NOT EXISTS study_design_snapshot_at timestamptz;

  /* The COMMENT must live INSIDE the guard. It was outside on the first cut,
     and on a database with no protocol_amendments the DO block skipped
     correctly and then the bare COMMENT raised
     `relation "protocol_amendments" does not exist` and failed the deploy --
     the guard protecting nothing because the statement it protects ran after
     it. Caught by applying this file to a blank database, which is the case
     the guard exists for and therefore the case worth testing. */
  EXECUTE $c$
    COMMENT ON COLUMN protocol_amendments.study_design_snapshot IS
      'The bound StudyDesign object as it stood when this amendment was created. The "before" side of the EU CTR Article 16 substantiality comparison. NULL means no design was bound, or the amendment predates this column; either way the comparison reports not-assessed rather than assuming no change.'
  $c$;
END $$;
