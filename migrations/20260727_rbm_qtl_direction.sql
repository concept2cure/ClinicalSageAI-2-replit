-- Quality Tolerance Limits: make the bound's DIRECTION explicit.
--
-- qtlStatus assumed a higher value is always worse. That is true for deviation
-- and dropout rates, and false for anything expressed as attainment — primary
-- endpoint data completeness, consent-documentation rate, enrollment against
-- target. Under the old assumption a QTL of "endpoint completeness >= 90%"
-- sitting at 40% evaluated as WITHIN TOLERANCE, because 40 < 90. The engine
-- reported the study as in control precisely when it was furthest out.
--
-- Three shapes are now supported:
--   upper      breach when value >= threshold          (deviation rate <= 15%)
--   lower      breach when value <= threshold          (completeness >= 90%)
--   two_sided  breach outside either bound             (randomisation ratio)
--
-- For `upper` and `lower` the existing threshold / secondary_limit columns hold
-- the bound in the declared direction, so no data moves and every existing row
-- keeps its current meaning under the `upper` default. `two_sided` adds the
-- second bound in the new *_lower columns.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF to_regclass('public.rbm_qtls') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE rbm_qtls
    -- 'upper' is the correct backfill: it is exactly what the engine did before,
    -- so no existing QTL silently changes status on deploy. A parameter that is
    -- really a lower bound was already being evaluated wrongly and has to be
    -- corrected deliberately by someone who knows the parameter.
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'upper',
    -- Second bound, two_sided only. Null for upper/lower.
    ADD COLUMN IF NOT EXISTS threshold_lower NUMERIC(12,4),
    ADD COLUMN IF NOT EXISTS secondary_limit_lower NUMERIC(12,4);
END $$;
