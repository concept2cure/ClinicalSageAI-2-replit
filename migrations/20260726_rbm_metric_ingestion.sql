-- RBM metric ingestion — the producer the RBM engines were missing.
--
-- Every RBM engine is a consumer: kriStatus reads rbm_kris.current_value,
-- scorePatientCohort reads rbm_patient_profiles.metrics, the site-risk engine
-- reads site_intel.sites, and detectSiteOutliers reads that engine's output.
-- Until now nothing wrote any of them from a source system — readings were
-- hand-entered. These two tables are the load path, and, as importantly, its
-- provenance: what came from where, as of what cutoff, how much was accepted
-- and what was rejected and why.
--
-- That provenance is not bookkeeping. Under ICH E6(R3) an indicator is only
-- meaningful alongside the currency and completeness of the data behind it — a
-- green KRI computed from a feed that last landed three weeks ago is not
-- evidence of control. rbm_data_runs is what lets the board say so.
--
-- Entities:
--   rbm_data_runs           — one row per ingestion attempt (source, cutoff,
--                             counts, rejects, outcome).
--   rbm_metric_observations — the landed measurements, scoped to study,
--                             country, site or subject, each tied to its run.
--
-- Idempotent: safe to re-run.

-- ── Ingestion runs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbm_data_runs (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  program_id      UUID,
  -- Which feed this load represents. Kept as the sponsor's system-of-record
  -- category rather than a vendor name, so a study can move from one EDC to
  -- another without the history changing meaning.
  source          TEXT NOT NULL,                        -- edc | ctms | safety | lab | irt | ecoa | vendor | manual_upload
  source_ref      TEXT,                                 -- filename, export id, or endpoint the rows came from
  -- The date the extract represents, which is NOT the time it was loaded. A
  -- run that lands today from a cutoff two weeks ago must not read as fresh.
  data_cutoff     DATE,
  status          TEXT NOT NULL DEFAULT 'running',      -- running | succeeded | partial | failed
  rows_received   INTEGER NOT NULL DEFAULT 0,
  rows_accepted   INTEGER NOT NULL DEFAULT 0,
  rows_rejected   INTEGER NOT NULL DEFAULT 0,
  -- Per-row reject reasons, capped by the service. A silently dropped row is
  -- indistinguishable from a row that was never sent, so rejects are kept.
  rejects         JSONB NOT NULL DEFAULT '[]'::jsonb,
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  ingested_by     INTEGER REFERENCES users(id),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rbm_data_runs_org_idx         ON rbm_data_runs (organization_id);
CREATE INDEX IF NOT EXISTS rbm_data_runs_org_program_idx ON rbm_data_runs (organization_id, program_id);
-- Freshness lookups are "latest run per source for this program".
CREATE INDEX IF NOT EXISTS rbm_data_runs_freshness_idx
  ON rbm_data_runs (organization_id, program_id, source, started_at DESC);

-- ── Landed observations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbm_metric_observations (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  program_id      UUID,
  run_id          INTEGER REFERENCES rbm_data_runs(id) ON DELETE CASCADE,
  -- The measure being reported. For a study-scope row this is matched against
  -- an existing KRI or QTL by key/name; site- and subject-scope rows are free
  -- dimensions that feed the site and patient engines.
  metric_key      TEXT NOT NULL,
  scope_level     TEXT NOT NULL DEFAULT 'study',        -- study | country | site | subject
  scope_id        TEXT,                                 -- site number, country code, subject id; NULL at study scope
  value           NUMERIC(18,6),
  -- Carried when the source can supply them. A rate with a denominator of 3 is
  -- not the same evidence as the same rate over 300, and the engine cannot
  -- tell the difference from `value` alone.
  numerator       NUMERIC(18,6),
  denominator     NUMERIC(18,6),
  unit            TEXT,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_cutoff     DATE,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rbm_metric_obs_org_idx         ON rbm_metric_observations (organization_id);
CREATE INDEX IF NOT EXISTS rbm_metric_obs_org_program_idx ON rbm_metric_observations (organization_id, program_id);
CREATE INDEX IF NOT EXISTS rbm_metric_obs_run_idx         ON rbm_metric_observations (run_id);
-- "Latest value for this metric at this scope" — the projection read pattern.
CREATE INDEX IF NOT EXISTS rbm_metric_obs_lookup_idx
  ON rbm_metric_observations (organization_id, program_id, metric_key, scope_level, scope_id, observed_at DESC);
