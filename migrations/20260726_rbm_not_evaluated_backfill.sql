-- Backfill KRI/QTL indicators that were never measured to 'not_evaluated'.
--
-- rbm_kris.status defaulted to 'green' and rbm_qtls.status to 'within', and
-- the engine used to return those same values for a null reading. The engine
-- now returns 'not_evaluated' — but the board and the risk review read the
-- STORED status, so without this backfill every already-seeded indicator that
-- has never been measured keeps rendering as healthy indefinitely, until
-- somebody happens to edit it.
--
-- That is precisely the false assurance the status change exists to remove: an
-- indicator nobody has read has not been shown to be in control, and a study
-- that has measured nothing must not report "within tolerance".
--
-- Only rows with NO current value are touched. A measured indicator keeps the
-- status the engine computed for it.
--
-- Idempotent, and tolerant of a database where the rbm_* store was never
-- provisioned: the RBM read routes already fail closed on an undefined table
-- rather than erroring, and a data migration that hard-fails on a environment
-- without these tables would block every unrelated migration behind it.
-- Guarded with to_regclass so it is a no-op there instead.

DO $$
BEGIN
  -- ── KRIs: no reading, or no threshold to read against ───────────────────
  IF to_regclass('public.rbm_kris') IS NOT NULL THEN
    UPDATE rbm_kris
       SET status = 'not_evaluated',
           updated_at = now()
     WHERE deleted_at IS NULL
       AND status IN ('green', 'amber', 'red')
       AND (
         current_value IS NULL
         OR (threshold_amber IS NULL AND threshold_red IS NULL)
       );

    -- A newly created indicator has measured nothing yet, so 'not_evaluated'
    -- is the correct resting state; the routes set the real status explicitly
    -- once a value exists.
    ALTER TABLE rbm_kris ALTER COLUMN status SET DEFAULT 'not_evaluated';
  END IF;

  -- ── QTLs: no current value, or no tolerance limit to compare against ────
  IF to_regclass('public.rbm_qtls') IS NOT NULL THEN
    UPDATE rbm_qtls
       SET status = 'not_evaluated',
           breached = false,
           updated_at = now()
     WHERE deleted_at IS NULL
       AND status IN ('within', 'approaching', 'breached')
       AND (current_value IS NULL OR threshold IS NULL);

    ALTER TABLE rbm_qtls ALTER COLUMN status SET DEFAULT 'not_evaluated';
  END IF;
END $$;
