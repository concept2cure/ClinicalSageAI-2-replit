-- Nonclinical study-summary display fields — surface a study on the review
-- board (duration, key finding, finding classification) without opening the
-- full record. Additive, nullable, non-destructive. The SEND conformance shown
-- alongside is derived on read from send_datasets (no column needed).
--
-- Guarded: nonclinical_studies is created by migrations/20260610_nonclinical_send.sql
-- (raw path, not the Drizzle barrel), so on a schema state that predates it the
-- ALTER is a no-op instead of an error.

DO $$
BEGIN
  IF to_regclass('public.nonclinical_studies') IS NOT NULL THEN
    ALTER TABLE nonclinical_studies ADD COLUMN IF NOT EXISTS duration_label TEXT;
    ALTER TABLE nonclinical_studies ADD COLUMN IF NOT EXISTS key_finding    TEXT;
    ALTER TABLE nonclinical_studies ADD COLUMN IF NOT EXISTS finding_class  TEXT;
  END IF;
END $$;
