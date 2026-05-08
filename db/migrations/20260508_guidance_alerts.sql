-- Guidance Change Impact Scanner (Feature 2.6).
--
-- Two tables:
--
--   1. guidance_reference_index
--      Tracks the current version of every regulatory guidance document
--      AnA can detect changes against (ICH, FDA, EMA, HC). When a new
--      version is upserted, the scanner uses the previous version
--      (carried in this row before the update) to identify what
--      changed.
--
--   2. guidance_alerts
--      Section-level impact alerts. One row per (artifact, guidance,
--      new_version) when an artifact's CTD section is mapped to the
--      changed guidance via either:
--        - the gap-classifier rule registry (rule.guidance contains
--          the guidance family), or
--        - the IND section registry (section.guidance contains it)
--      Severity is the max severity across matching gap rules.
--      Status flow: open → acknowledged → resolved.

BEGIN;

CREATE TABLE IF NOT EXISTS guidance_reference_index (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Canonical guidance code: 'ICH E6(R3)', 'ICH M4Q(R1)',
  -- '21 CFR 312.23(a)(1)', etc.
  guidance_code         TEXT NOT NULL UNIQUE,
  -- 'ICH', 'FDA', 'EMA', 'PMDA', 'HC', 'ICH-MULTIREGIONAL'
  authority             TEXT NOT NULL,
  current_version       TEXT NOT NULL,
  current_version_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_url            TEXT,
  metadata              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guidance_reference_authority
  ON guidance_reference_index(authority);


CREATE TABLE IF NOT EXISTS guidance_alerts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id       INTEGER NOT NULL,
  project_id            INTEGER NOT NULL,
  artifact_id           TEXT NOT NULL,
  artifact_pk           INTEGER NOT NULL,

  guidance_code         TEXT NOT NULL,
  guidance_authority    TEXT NOT NULL,
  prev_version          TEXT,                 -- nullable on first registration
  new_version           TEXT NOT NULL,

  severity              TEXT NOT NULL
    CHECK (severity IN ('critical','major','minor','info')),

  -- Section-level impact: array of
  --   { ctdSection, source: 'gap_rule'|'ind_section', ruleId? }
  affected_sections     JSONB NOT NULL,

  status                TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_at       TIMESTAMPTZ,
  acknowledged_by       INTEGER,
  resolved_at           TIMESTAMPTZ,
  resolved_by           INTEGER,

  metadata              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot path: list open alerts for a project / org.
CREATE INDEX IF NOT EXISTS idx_guidance_alerts_org
  ON guidance_alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_guidance_alerts_project
  ON guidance_alerts(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_guidance_alerts_artifact
  ON guidance_alerts(artifact_id);
CREATE INDEX IF NOT EXISTS idx_guidance_alerts_status_severity
  ON guidance_alerts(organization_id, status, severity)
  WHERE status = 'open';

-- Idempotency: a scan that re-runs against the same version shouldn't
-- duplicate open / acknowledged alerts. A resolved alert CAN be re-
-- raised when the version moves again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_guidance_alerts_unique_active
  ON guidance_alerts (organization_id, artifact_id, guidance_code, new_version)
  WHERE status IN ('open', 'acknowledged');

COMMIT;
