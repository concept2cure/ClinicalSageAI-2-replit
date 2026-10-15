-- 20260930_rbm_ingest_idempotency.sql
--
-- Metric ingestion: a repeated load is refused instead of silently doubling
-- the KRI history (ported from the abandoned #1130, eea28c673, with #1166's
-- UNIQUE replay index, onto the v2 applier).
--
-- rbm_data_runs recorded WHICH feed a load came from but nothing identifying
-- the CONTENT. A second load is not a no-op: ingestMetrics appends a row to
-- rbm_kri_values per study-scope observation, so a retry, two data managers on
-- one inbox, or a job that fired twice doubled every trend and every robust
-- z-score computed over those readings.
--
--   content_hash      SHA-256 of the exact payload parsed (not the filename)
--   mapping_version   which interpretation produced the observations
--   supersedes_run_id / reprocess_reason / superseded_at
--                     a deliberate reprocess, with its reason, and the run it
--                     replaced (kept on file, excluded from replay detection)
--   rbm_kri_values.run_id
--                     lineage, so a reprocess retracts exactly the readings
--                     the superseded run appended — never hand-entered ones
--
-- rbm_data_runs_replay_uq is UNIQUE, as a backstop under concurrency: the
-- service's findPriorRun check is read-then-write, so two workers loading the
-- same extract could both pass it. A run enters the index only when it
-- finalizes to succeeded/partial, so the second of two concurrent identical
-- loads fails at finalize and rolls back. Rows written before this file have
-- content_hash NULL and are outside the partial predicate, so building the
-- index cannot fail on existing data.
--
-- WHY A NEW FILE: 20260726_rbm_metric_ingestion.sql / 20260630_rbm_kri_values
-- create these tables with CREATE TABLE IF NOT EXISTS; amending them would
-- reach no deployed tenant.
--
-- REPLAY-SAFE (CLAUDE.md RULE 1): ADD COLUMN / CREATE INDEX IF NOT EXISTS, and
-- the FK is added only when absent. No DROP. to_regclass-guarded.

DO $$
BEGIN
  IF to_regclass('public.rbm_data_runs') IS NULL THEN
    RAISE NOTICE '20260930_rbm_ingest_idempotency: rbm_data_runs absent, skipping';
    RETURN;
  END IF;

  ALTER TABLE rbm_data_runs
    ADD COLUMN IF NOT EXISTS content_hash TEXT,
    ADD COLUMN IF NOT EXISTS mapping_version TEXT NOT NULL DEFAULT 'v1',
    ADD COLUMN IF NOT EXISTS supersedes_run_id INTEGER REFERENCES rbm_data_runs(id),
    ADD COLUMN IF NOT EXISTS reprocess_reason TEXT,
    ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

  CREATE UNIQUE INDEX IF NOT EXISTS rbm_data_runs_replay_uq
    ON rbm_data_runs (organization_id, program_id, source, content_hash)
    WHERE content_hash IS NOT NULL
      AND superseded_at IS NULL
      AND status IN ('succeeded', 'partial');

  CREATE INDEX IF NOT EXISTS rbm_data_runs_supersedes_idx
    ON rbm_data_runs (supersedes_run_id)
    WHERE supersedes_run_id IS NOT NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.rbm_kri_values') IS NULL THEN
    RAISE NOTICE '20260930_rbm_ingest_idempotency: rbm_kri_values absent, skipping';
    RETURN;
  END IF;

  ALTER TABLE rbm_kri_values
    ADD COLUMN IF NOT EXISTS run_id INTEGER;

  IF to_regclass('public.rbm_data_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'rbm_kri_values_run_fk'
          AND conrelid = 'public.rbm_kri_values'::regclass
     ) THEN
    ALTER TABLE rbm_kri_values
      ADD CONSTRAINT rbm_kri_values_run_fk
      FOREIGN KEY (run_id) REFERENCES rbm_data_runs(id) ON DELETE SET NULL;
  END IF;

  CREATE INDEX IF NOT EXISTS rbm_kri_values_run_idx
    ON rbm_kri_values (run_id) WHERE run_id IS NOT NULL;
END $$;
