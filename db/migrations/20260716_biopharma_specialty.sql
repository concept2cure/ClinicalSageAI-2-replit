-- Biopharma specialty data layer — pediatric investigation plans, orphan
-- designations, and lifecycle supplements/variations. Org-scoped, FK-free,
-- non-destructive. Schema only — demo rows are seeded by
-- scripts/seed-ga-demo.mjs against the resolved demo org (a migration must not
-- write tenant rows).

CREATE TABLE IF NOT EXISTS biopharma_pediatric_plans (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  product           TEXT,
  kind              TEXT,
  age_range         TEXT,
  deferrals         INTEGER DEFAULT 0,
  waivers           INTEGER DEFAULT 0,
  milestones        INTEGER DEFAULT 0,
  due               TEXT,
  status            TEXT,
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE IF NOT EXISTS biopharma_orphan_designations (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  product           TEXT,
  agency            TEXT,
  indication        TEXT,
  date              TEXT,
  prevalence        TEXT,
  benefit           TEXT,
  status            TEXT,
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE IF NOT EXISTS biopharma_supplements (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  agency            TEXT,
  product           TEXT,
  subject           TEXT,
  filed             TEXT,
  due               TEXT,
  status            TEXT,
  PRIMARY KEY (organization_id, id)
);
