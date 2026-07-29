-- Enablement / training content stores — learning paths and certifications.
-- Org-scoped, FK-free, non-destructive. Schema only — demo rows are seeded by
-- scripts/seed-ga-demo.mjs against the resolved demo org (a migration must not
-- write tenant rows).

CREATE TABLE IF NOT EXISTS enablement_learning_paths (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  title             TEXT,
  lessons           INTEGER DEFAULT 0,
  done              INTEGER DEFAULT 0,
  mins              INTEGER DEFAULT 0,
  level             TEXT,
  tone              TEXT,
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE IF NOT EXISTS enablement_certifications (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  name              TEXT,
  status            TEXT,
  when_label        TEXT,
  PRIMARY KEY (organization_id, id)
);
