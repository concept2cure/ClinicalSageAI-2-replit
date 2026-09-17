-- Batch and program attribution on the QC testing register.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- A QC result is the batch analysis §3.2.S.4.4 / §3.2.P.5.4 carry, and the
-- capability question ICH Q6A raises over a specification — can the process
-- meet this limit batch after batch? — is asked over a SERIES of batch
-- results. The register recorded a sample id and nothing about the batch the
-- sample represents, and it recorded no program at all: the program came from
-- the request body at write time and was never stored, so an edit could not
-- re-link the result and nothing could group results by batch.
--
-- batch_number is the batch the sample represents (nullable: an in-process or
-- cleaning sample may have none). project_id is the program the result files
-- under, checked against the tenant's programs at link time and fixed at
-- creation like every other register's.
--
-- Additive and idempotent.

-- Guarded on to_regclass: ADD COLUMN IF NOT EXISTS guards the COLUMN, not the
-- TABLE, and qc_testing is created by the drizzle baseline, which is not in
-- this set on every applier. On a database without the table this is a no-op
-- rather than an abort of the whole set.
DO $$
BEGIN
  IF to_regclass('public.qc_testing') IS NOT NULL THEN
    ALTER TABLE qc_testing
      ADD COLUMN IF NOT EXISTS batch_number text,
      ADD COLUMN IF NOT EXISTS project_id text;
    CREATE INDEX IF NOT EXISTS idx_qc_testing_org_project
      ON qc_testing (organization_id, project_id);
  END IF;
END $$;
