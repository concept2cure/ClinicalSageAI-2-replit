-- Study digital twins + simulation runs.
--
-- A study twin is a persisted StudyDesign object (the design-as-data spine) that
-- AnA can simulate to predict outcomes across any therapeutic area / phase. Each
-- simulation run records the prediction, the mandatory disclaimer, whether it was
-- grounded on uploaded history, and whether a history upload was requested.
--
-- Idempotent and FK-free (org_id / created_by are soft references — consistent
-- with the mutation_primitives + governance-grants convention).

CREATE TABLE IF NOT EXISTS study_twins (
  id           text        PRIMARY KEY,
  org_id       integer     NOT NULL,
  project_id   text,
  program_id   text,
  title        text        NOT NULL,
  phase        text,
  indication   text,
  design       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status       text        NOT NULL DEFAULT 'draft',
  created_by   integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_twins_org_idx ON study_twins (org_id);

CREATE TABLE IF NOT EXISTS study_twin_simulations (
  id                   bigserial   PRIMARY KEY,
  org_id               integer     NOT NULL,
  twin_id              text        NOT NULL,
  requested_by         integer,
  question             text,
  prediction           text,
  disclaimer           text        NOT NULL,
  grounded             boolean     NOT NULL DEFAULT false,
  needs_history_upload boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_twin_sims_org_twin_idx ON study_twin_simulations (org_id, twin_id);
