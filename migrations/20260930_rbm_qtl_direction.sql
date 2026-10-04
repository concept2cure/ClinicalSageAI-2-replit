-- 20260930_rbm_qtl_direction.sql
--
-- Quality Tolerance Limits: make the bound's DIRECTION explicit (ported from
-- the abandoned #1120, 260912e4c, onto the v2 applier).
--
-- qtlStatus assumed a higher value is always worse. That holds for deviation
-- and dropout rates and is false for anything expressed as attainment —
-- primary-endpoint data completeness, consent documentation, enrollment against
-- target. A QTL of "endpoint completeness >= 90%" sitting at 40% evaluated as
-- WITHIN TOLERANCE, because 40 < 90: the engine reported the study in control
-- precisely when it was furthest out.
--
--   upper      breach when value >= threshold          (deviation rate <= 15%)
--   lower      breach when value <= threshold          (completeness >= 90%)
--   two_sided  breach outside either bound             (randomisation ratio)
--
-- For upper and lower the existing threshold / secondary_limit columns hold
-- the bound in the declared direction, so no data moves. 'upper' is the correct
-- backfill: it is exactly what the engine did before, so no existing QTL changes
-- status on deploy. A parameter that is really a lower bound was already being
-- read wrongly and has to be corrected deliberately by someone who knows it.
--
-- WHY A NEW FILE AND NOT AN AMENDMENT OF 20260629_rbm_surfaces.sql: that file
-- creates rbm_qtls with CREATE TABLE IF NOT EXISTS, which converges nothing on
-- a database where the table exists — an amendment would reach fresh installs
-- and no deployed tenant (see 20260918_rbm_author_attribution.sql).
--
-- REPLAY-SAFE (CLAUDE.md RULE 1): every statement is ADD COLUMN IF NOT EXISTS
-- or a CHECK added only when absent; no DROP. The to_regclass guard is
-- load-bearing — ADD COLUMN IF NOT EXISTS raises 42P01 on an absent table.

DO $$
BEGIN
  IF to_regclass('public.rbm_qtls') IS NULL THEN
    RAISE NOTICE '20260930_rbm_qtl_direction: rbm_qtls absent, skipping';
    RETURN;
  END IF;

  ALTER TABLE rbm_qtls
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'upper',
    -- Second bound, two_sided only. NULL for upper/lower.
    ADD COLUMN IF NOT EXISTS threshold_lower NUMERIC(12,4),
    ADD COLUMN IF NOT EXISTS secondary_limit_lower NUMERIC(12,4);

  -- Added once, never replaced: nothing else in the set defines this
  -- constraint, so there is no narrowing hazard on replay.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'rbm_qtls_direction_chk'
       AND conrelid = 'public.rbm_qtls'::regclass
  ) THEN
    ALTER TABLE rbm_qtls
      ADD CONSTRAINT rbm_qtls_direction_chk
      CHECK (direction IN ('upper', 'lower', 'two_sided'));
  END IF;

  COMMENT ON COLUMN rbm_qtls.direction IS
    'Which way the tolerance limit bites: upper (breach at/above threshold), lower (at/below), two_sided (outside threshold_lower..threshold).';
END $$;
