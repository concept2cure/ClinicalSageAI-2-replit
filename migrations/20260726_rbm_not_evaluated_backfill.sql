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
-- Idempotent: safe to re-run.

-- ── KRIs: no reading, or no threshold to read against ─────────────────────
UPDATE rbm_kris
   SET status = 'not_evaluated',
       updated_at = now()
 WHERE deleted_at IS NULL
   AND status IN ('green', 'amber', 'red')
   AND (
     current_value IS NULL
     OR (threshold_amber IS NULL AND threshold_red IS NULL)
   );

-- ── QTLs: no current value, or no tolerance limit to compare against ──────
UPDATE rbm_qtls
   SET status = 'not_evaluated',
       breached = false,
       updated_at = now()
 WHERE deleted_at IS NULL
   AND status IN ('within', 'approaching', 'breached')
   AND (current_value IS NULL OR threshold IS NULL);

-- ── Defaults follow the same rule for rows created from here on ───────────
-- A newly created indicator has measured nothing yet, so 'not_evaluated' is
-- the correct resting state; the routes set the real status explicitly once a
-- value exists.
ALTER TABLE rbm_kris ALTER COLUMN status SET DEFAULT 'not_evaluated';
ALTER TABLE rbm_qtls ALTER COLUMN status SET DEFAULT 'not_evaluated';
