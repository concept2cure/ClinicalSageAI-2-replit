-- Project Schedule of Events — AnA-managed visual milestone schedule.
--
-- One header/plan row per project (project_schedule_of_events), the program
-- goals AnA tracks and re-baselines (project_schedule_goals), and an
-- append-only revision log of everything AnA changed
-- (project_schedule_revisions).
--
-- The visual MILESTONES are NOT stored here: they reuse the existing
-- project_workflow_stages table, tagged via metadata.source =
-- 'ana_schedule_of_events' and linked to the plan via metadata.scheduleId. This
-- avoids a second milestone store and keeps timeline/rollup logic consistent.
--
-- AnA generates the schedule from the project type, its goals, and the
-- applicable regulatory framework, then keeps it current — amending milestone
-- dates, re-baselining goals, and firing proactive tasks/alerts. Surfaced in
-- the project manager Schedule tab and monitored by the schedule-of-events
-- sweep (server/jobs/scheduleOfEventsSweep.ts).
--
-- Tenant column is the canonical integer organization_id, indexed on it and on
-- project_id because every query is org- and project-scoped. Not in the RLS
-- allowlist: organization_id is NOT NULL, so the blanket tenant-isolation
-- policy is the correct default.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS project_schedule_of_events (
  id                       SERIAL PRIMARY KEY,
  organization_id          INTEGER NOT NULL REFERENCES organizations(id),
  project_id               INTEGER NOT NULL REFERENCES projects(id),
  status                   TEXT NOT NULL DEFAULT 'active',
  project_type             TEXT,
  regulatory_framework     TEXT,
  goals                    JSON,
  basis_summary            TEXT,
  ana_summary              TEXT,
  confidence               TEXT DEFAULT 'moderate',
  version                  INTEGER NOT NULL DEFAULT 1,
  baseline_date            TIMESTAMP,
  target_date              TIMESTAMP,
  generated_by_ana         BOOLEAN NOT NULL DEFAULT true,
  last_reviewed_by_ana_at  TIMESTAMP,
  last_amended_at          TIMESTAMP,
  metadata                 JSON,
  created_at               TIMESTAMP NOT NULL DEFAULT now(),
  updated_at               TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_project_schedule
  ON project_schedule_of_events (project_id);
CREATE INDEX IF NOT EXISTS idx_project_schedule_org
  ON project_schedule_of_events (organization_id);
CREATE INDEX IF NOT EXISTS idx_project_schedule_project
  ON project_schedule_of_events (project_id);

CREATE TABLE IF NOT EXISTS project_schedule_goals (
  id                   SERIAL PRIMARY KEY,
  organization_id      INTEGER NOT NULL REFERENCES organizations(id),
  project_id           INTEGER NOT NULL REFERENCES projects(id),
  schedule_id          INTEGER REFERENCES project_schedule_of_events(id),
  title                TEXT NOT NULL,
  description          TEXT,
  target_date          TIMESTAMP,
  status               TEXT NOT NULL DEFAULT 'active',
  priority             TEXT NOT NULL DEFAULT 'medium',
  metric               TEXT,
  current_context      TEXT,
  last_reset_by_ana_at TIMESTAMP,
  ana_rationale        TEXT,
  metadata             JSON,
  created_at           TIMESTAMP NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_goal_org
  ON project_schedule_goals (organization_id);
CREATE INDEX IF NOT EXISTS idx_schedule_goal_project
  ON project_schedule_goals (project_id);

CREATE TABLE IF NOT EXISTS project_schedule_revisions (
  id                SERIAL PRIMARY KEY,
  organization_id   INTEGER NOT NULL REFERENCES organizations(id),
  project_id        INTEGER NOT NULL REFERENCES projects(id),
  schedule_id       INTEGER NOT NULL REFERENCES project_schedule_of_events(id),
  revision_type     TEXT NOT NULL,
  summary           TEXT NOT NULL,
  detail            JSON,
  triggered_by      TEXT DEFAULT 'ana_proactive',
  created_by_ana    BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_revision_schedule
  ON project_schedule_revisions (schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_revision_project
  ON project_schedule_revisions (project_id);
