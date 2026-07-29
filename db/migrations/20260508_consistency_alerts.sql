-- Cross-artifact consistency alerts.
--
-- One row per (project, artifactA, artifactB, sentenceContentHash) where
-- artifactA's sentence cites artifactB with relationship='contradicts'.
-- The unique partial index (active statuses only) makes re-scans
-- idempotent — a resolved alert CAN be re-raised when the same
-- contradiction is rediscovered later.

BEGIN;

CREATE TABLE IF NOT EXISTS cross_artifact_consistency_alerts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id             INTEGER NOT NULL,
  project_id                  INTEGER NOT NULL,

  -- The artifact whose sentence flags the contradiction.
  artifact_a_id               TEXT NOT NULL,
  artifact_a_pk               INTEGER NOT NULL,
  artifact_a_ctd_section      TEXT,
  -- sentence contentHash from the citation engine (sha256-prefix).
  sentence_content_hash       TEXT NOT NULL,
  sentence_text               TEXT NOT NULL,

  -- The artifact cited as a contradicting source.
  artifact_b_id               TEXT NOT NULL,
  artifact_b_pk               INTEGER NOT NULL,
  artifact_b_ctd_section      TEXT,
  contradicting_passage       TEXT,

  severity                    TEXT NOT NULL
    CHECK (severity IN ('critical','major','minor','info')),
  -- gap-classifier rule id used to infer severity (when one matched).
  severity_rule_id            TEXT,

  status                      TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_at             TIMESTAMPTZ,
  acknowledged_by             INTEGER,
  resolved_at                 TIMESTAMPTZ,
  resolved_by                 INTEGER,

  metadata                    JSONB,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consistency_alerts_org
  ON cross_artifact_consistency_alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_consistency_alerts_project
  ON cross_artifact_consistency_alerts(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_consistency_alerts_artifact_a
  ON cross_artifact_consistency_alerts(artifact_a_id);
CREATE INDEX IF NOT EXISTS idx_consistency_alerts_artifact_b
  ON cross_artifact_consistency_alerts(artifact_b_id);
CREATE INDEX IF NOT EXISTS idx_consistency_alerts_status_severity
  ON cross_artifact_consistency_alerts(organization_id, status, severity)
  WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS idx_consistency_alerts_unique_active
  ON cross_artifact_consistency_alerts (
    organization_id, project_id,
    artifact_a_id, artifact_b_id,
    sentence_content_hash
  )
  WHERE status IN ('open','acknowledged');

COMMIT;
