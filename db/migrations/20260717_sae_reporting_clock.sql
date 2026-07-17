-- Expedited-reporting-clock inputs for the SAE case store — the two facts the
-- 21 CFR 312.32(c) / ICH E2A clock needs that the base c2c_sae_cases table did
-- not carry:
--   * awareness_date — the date the SPONSOR FIRST BECAME AWARE of the event
--     (the awareness / receipt date). This is Day 0 of the reporting clock, and
--     is deliberately DISTINCT from the event onset date (event.onsetDate);
--     anchoring the clock on onset would produce a WRONG legal deadline.
--   * expectedness — listedness vs the reference safety information / IB
--     ('unexpected' | 'expected'). A distinct, human-supplied fact; it is never
--     inferred from severity or causality.
--
-- The reporting category (7-day / 15-day / none), due date, and overdue state
-- are computed LIVE on read from these columns + the event JSONB (seriousness,
-- causality, outcome) by server/services/pv/expedited-reporting-clock.ts. They
-- are NOT stored, so they can never drift stale. The pre-existing static
-- due / clock / due_days columns are left untouched for backward compatibility.
--
-- Additive, nullable, non-destructive. to_regclass-guarded so on a schema state
-- that predates 20260717_sae_cases_store.sql the ALTER is a no-op, not an error.

DO $$
BEGIN
  IF to_regclass('public.c2c_sae_cases') IS NOT NULL THEN
    ALTER TABLE c2c_sae_cases ADD COLUMN IF NOT EXISTS awareness_date TEXT;
    ALTER TABLE c2c_sae_cases ADD COLUMN IF NOT EXISTS expectedness   TEXT;
  END IF;
END $$;
