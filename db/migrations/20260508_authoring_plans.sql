-- Regulatory Authoring Plans (Feature 2.4).
--
-- One row per (project, ctd_section) authoring plan. The plan captures
-- the AI-assembled "what we'll write" before the artifact is drafted:
--   - source artifacts to cite (with relevance + dossier provenance)
--   - cross-references to other CTD sections
--   - risk factors flagged by Shadow Review for the section
--   - contradictions surfaced by a Truth Engine pre-scan
--   - therapeutic-area-driven reviewer expectations + guidance refs
--   - a strawman outline (optional)
--
-- Status flow: draft -> pending_approval -> approved -> executed
--                                       -> rejected
-- Idempotent re-generation via the unique partial index on
--   (organization_id, project_id, ctd_section)
-- WHERE status IN ('draft','pending_approval') — only one active plan per
-- (project, section). Approved/rejected/executed are immutable history.

BEGIN;

CREATE TABLE IF NOT EXISTS authoring_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id       INTEGER NOT NULL,
  project_id            INTEGER NOT NULL,

  -- Optional: when generated against an existing artifact (e.g. for a
  -- rewrite). NULL when planning a fresh section.
  artifact_id           TEXT,
  artifact_pk           INTEGER,

  ctd_section           TEXT NOT NULL,
  submission_type       TEXT,             -- IND | NDA | BLA | ALL (snapshot)

  status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','rejected','executed')),

  title                 TEXT,
  summary               TEXT,

  -- AI-assembled inputs (jsonb for forward-compat).
  sources               JSONB NOT NULL DEFAULT '[]'::jsonb,
  cross_refs            JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_factors          JSONB NOT NULL DEFAULT '[]'::jsonb,
  contradictions        JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewer_expectations JSONB NOT NULL DEFAULT '[]'::jsonb,
  guidance_refs         JSONB NOT NULL DEFAULT '[]'::jsonb,
  outline               JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Therapeutic-area context snapshot (id only — full profile is
  -- resolvable from the registry).
  therapeutic_area      TEXT,

  -- Approval lifecycle.
  approved_at           TIMESTAMPTZ,
  approved_by           INTEGER,
  rejected_at           TIMESTAMPTZ,
  rejected_by           INTEGER,
  rejected_reason       TEXT,
  executed_at           TIMESTAMPTZ,
  executed_artifact_id  TEXT,

  -- Provenance + auxiliary scoring.
  generator_version     TEXT,             -- e.g. 'authoring-plan-v1'
  score                 INTEGER,          -- 0-100, plan completeness
  metadata              JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            INTEGER,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_authoring_plans_org
  ON authoring_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_authoring_plans_project
  ON authoring_plans(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_authoring_plans_section
  ON authoring_plans(organization_id, project_id, ctd_section);
CREATE INDEX IF NOT EXISTS idx_authoring_plans_artifact
  ON authoring_plans(artifact_id)
  WHERE artifact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_authoring_plans_status
  ON authoring_plans(organization_id, status);

-- One active plan per (project, section). Re-generation supersedes the
-- prior draft/pending row (caller updates the row in place).
CREATE UNIQUE INDEX IF NOT EXISTS idx_authoring_plans_unique_active
  ON authoring_plans (organization_id, project_id, ctd_section)
  WHERE status IN ('draft','pending_approval');

COMMIT;
