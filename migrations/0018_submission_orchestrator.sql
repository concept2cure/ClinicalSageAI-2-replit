-- Migration 0018: Submission-Package Orchestrator audit tables
--
-- The orchestrator coordinates artifact → section → module → ZIP assembly for
-- IND/NDA/BLA/510(k) submissions. These two tables record the per-run state
-- and the per-step audit trail needed for 21 CFR Part 11 traceability.
--
-- Run-level state: one row per orchestration pass (e.g., "build NDA seq 0003").
--   Steps are stored as JSONB to keep per-run lookups single-query while
--   preserving enough structure for filtering on status / step key.
--
-- Step-level audit: append-only event log (start / complete / fail / stale).
--   Each event records input/output hash and output reference so a future
--   run can detect that input changed and mark downstream steps stale.

BEGIN;

CREATE TABLE IF NOT EXISTS submission_orchestrator_runs (
  run_id              UUID PRIMARY KEY,
  submission_id       TEXT NOT NULL,
  application_number  TEXT NOT NULL,
  region              TEXT NOT NULL CHECK (region IN ('US', 'EU', 'JP', 'CA')),
  submission_type     TEXT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  completed_at        TIMESTAMPTZ,
  status              TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed', 'partial')),
  steps               JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_submission
  ON submission_orchestrator_runs(submission_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_application
  ON submission_orchestrator_runs(application_number, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_status
  ON submission_orchestrator_runs(status)
  WHERE status IN ('running', 'failed', 'partial');

-- Append-only step audit (21 CFR Part 11 traceability)
CREATE TABLE IF NOT EXISTS submission_orchestrator_steps (
  id            BIGSERIAL PRIMARY KEY,
  run_id        UUID NOT NULL REFERENCES submission_orchestrator_runs(run_id) ON DELETE CASCADE,
  step_key      TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('start', 'complete', 'fail', 'stale')),
  status        TEXT NOT NULL,
  input_hash    TEXT NOT NULL,
  output_hash   TEXT,
  output_ref    TEXT,
  error         TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_steps_run
  ON submission_orchestrator_steps(run_id, occurred_at ASC);

CREATE INDEX IF NOT EXISTS idx_orchestrator_steps_key
  ON submission_orchestrator_steps(step_key, occurred_at DESC);

-- Dependency graph (denormalized for query convenience)
CREATE TABLE IF NOT EXISTS submission_orchestrator_dependencies (
  step_key      TEXT NOT NULL,
  depends_on    TEXT NOT NULL,
  PRIMARY KEY (step_key, depends_on)
);

INSERT INTO submission_orchestrator_dependencies (step_key, depends_on) VALUES
  ('m3.appendices',      'm3.compose'),
  ('m3.regional',        'm3.compose'),
  ('m2.3.qos',           'm3.compose'),
  ('m2.3.qos',           'm3.appendices'),
  ('m2.3.qos',           'm3.regional'),
  ('m2.7.clinical',      'csr.tabulate'),
  ('package.assemble',   'm2.3.qos'),
  ('package.assemble',   'm2.4.nonclinical'),
  ('package.assemble',   'm2.7.clinical'),
  ('package.assemble',   'm1.admin'),
  ('package.validate',   'package.assemble')
ON CONFLICT DO NOTHING;

-- updated_at trigger
CREATE OR REPLACE FUNCTION submission_orchestrator_runs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orchestrator_runs_updated_at ON submission_orchestrator_runs;
CREATE TRIGGER trg_orchestrator_runs_updated_at
  BEFORE UPDATE ON submission_orchestrator_runs
  FOR EACH ROW EXECUTE FUNCTION submission_orchestrator_runs_set_updated_at();

COMMIT;
