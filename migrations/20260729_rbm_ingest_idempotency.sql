-- Metric ingestion: make a repeated load detectable instead of additive.
--
-- rbm_data_runs recorded WHICH feed a load came from (source, source_ref) but
-- nothing that identifies the CONTENT. Nothing stopped the same extract being
-- loaded twice, and a second load is not a no-op: ingestMetrics appends a row to
-- rbm_kri_values per study-scope observation. So re-uploading last night's export
-- — a retry after a timeout, two data managers working the same inbox, a
-- scheduled job that ran twice — silently doubles the KRI history.
--
-- That is worse than a cosmetic duplicate. Every trend, every sparkline and every
-- robust z-score is computed over those readings, so a duplicated load bends the
-- statistics the whole module's judgments rest on, in a direction nobody chose.
--
-- Content hash, not filename. Two exports can share a filename and differ, and
-- the same content can arrive under different names, so identity is the SHA-256
-- of the bytes actually parsed.
--
-- Replay is refused, not silently ignored: an operator who genuinely needs to
-- reload (a corrected mapping, a fixed transformation) reprocesses explicitly,
-- with a reason, and the new run records which run it supersedes. Refusing and
-- superseding are both visible; a silent skip would look like a successful load
-- that changed nothing.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF to_regclass('public.rbm_data_runs') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE rbm_data_runs
    -- SHA-256 (hex) of the exact payload parsed. Null for rows that predate this
    -- column: their content was never hashed, so they cannot participate in
    -- replay detection and must not block a later load.
    ADD COLUMN IF NOT EXISTS content_hash TEXT,
    -- Which mapping/transformation produced the observations. Bumped when the
    -- interpretation of a source changes, so a reprocess under a new mapping is
    -- distinguishable from a duplicate of the same load.
    ADD COLUMN IF NOT EXISTS mapping_version TEXT NOT NULL DEFAULT 'v1',
    -- Set on a deliberate reprocess: the earlier run whose observations this one
    -- replaces, and why. Both are required together at the service layer.
    ADD COLUMN IF NOT EXISTS supersedes_run_id INTEGER REFERENCES rbm_data_runs(id),
    ADD COLUMN IF NOT EXISTS reprocess_reason TEXT,
    -- Marks a run whose observations a later run has replaced. Superseded runs
    -- stay on file — they are the record of what was believed at the time — but
    -- they no longer participate in freshness or replay detection.
    ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

  -- Replay detection index. Partial on succeeded/partial and not-superseded,
  -- because:
  --   * a FAILED run's content was not (fully) landed, so re-loading it is the
  --     correct thing to do and must not be blocked;
  --   * a SUPERSEDED run has already been deliberately replaced.
  --
  -- UNIQUE, as a backstop under concurrency. The service layer still does the
  -- graceful check first — findPriorRun names the earlier run and offers the
  -- reprocess path rather than surfacing a raw constraint violation — and that
  -- remains the path every ordinary duplicate takes. But that check is a
  -- read-then-write: two workers ingesting the SAME extract can both run
  -- findPriorRun before either commits, both see no landed run, and both append
  -- observations and KRI readings, doubling the very history the guard protects.
  -- The unique index closes that window: a run enters it only when it finalizes
  -- to succeeded/partial, so the second of two concurrent identical loads fails
  -- at finalize and its transaction rolls back, leaving no duplicate behind. A
  -- constraint violation in that rare race is the correct safe outcome; the
  -- common case never reaches it.
  --
  -- DROP first so an environment that already built the non-unique version is
  -- upgraded in place; both statements are re-runnable.
  DROP INDEX IF EXISTS rbm_data_runs_replay_idx;
  CREATE UNIQUE INDEX IF NOT EXISTS rbm_data_runs_replay_idx
    ON rbm_data_runs (organization_id, program_id, source, content_hash)
    WHERE content_hash IS NOT NULL
      AND superseded_at IS NULL
      AND status IN ('succeeded', 'partial');

  CREATE INDEX IF NOT EXISTS rbm_data_runs_supersedes_idx
    ON rbm_data_runs (supersedes_run_id)
    WHERE supersedes_run_id IS NOT NULL;
END $$;

-- ── KRI readings need run lineage for a reprocess to mean anything ──────────
--
-- rbm_metric_observations already carries run_id, so raw landed data is
-- attributable. rbm_kri_values did not: a reading recorded only which SOURCE it
-- came from, in a free-text note.
--
-- That makes "reprocess" a false promise. Superseding the run record while
-- leaving its appended readings behind still doubles the KRI history — the exact
-- corruption the replay guard exists to prevent, just reached by the deliberate
-- path instead of the accidental one. With run_id present, a reprocess can retract
-- precisely the readings the superseded run appended and nothing else.
--
-- Hand-entered readings keep run_id NULL and are never touched by a reprocess,
-- which is correct: a human observation is not something an ingestion run owns.

DO $$
BEGIN
  IF to_regclass('public.rbm_kri_values') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE rbm_kri_values
    ADD COLUMN IF NOT EXISTS run_id INTEGER;

  -- FK added separately and tolerantly: rbm_data_runs may be absent in an
  -- environment where rbm_kri_values exists, and a missing constraint must not
  -- fail the whole apply.
  IF to_regclass('public.rbm_data_runs') IS NOT NULL THEN
    BEGIN
      ALTER TABLE rbm_kri_values
        ADD CONSTRAINT rbm_kri_values_run_fk
        FOREIGN KEY (run_id) REFERENCES rbm_data_runs(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
    END;
  END IF;

  CREATE INDEX IF NOT EXISTS rbm_kri_values_run_idx
    ON rbm_kri_values (run_id) WHERE run_id IS NOT NULL;
END $$;
