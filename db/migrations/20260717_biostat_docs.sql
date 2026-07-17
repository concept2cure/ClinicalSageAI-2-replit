-- Biostatistics data layer — statistical analysis plans (SAP documents),
-- sample-size scenarios, and pre-planned interim analyses that back the three
-- previously-stubbed sections of GET /api/intelligence/biostat
-- (server/routes/intelligence-cluster.ts → out.saps / out.sampleSize /
-- out.interims). The fourth section of that endpoint, tlfQueue, is unaffected —
-- it already aggregates over c2c_tlf_builds.
--
-- Org-scoped (organization_id in the composite PK), FK-free, non-destructive
-- (CREATE TABLE IF NOT EXISTS only) — same c2c_* convention as
-- db/migrations/20260716_biopharma_specialty.sql. Schema only: demo rows are
-- seeded by scripts/seed/ga-demo.d/91-biostat-docs.mjs against the resolved demo
-- org (a migration must not write tenant rows).

-- Statistical analysis plans. `primary_endpoint` aliases to the surface's
-- `primary` key; `updated_at` + `locked` drive the surface's `updated` label
-- (locked SAPs render 'locked', others a relative "N ago" computed on read).
CREATE TABLE IF NOT EXISTS c2c_biostat_saps (
  id                TEXT        NOT NULL,
  organization_id   INTEGER     NOT NULL,
  program           TEXT,
  study             TEXT,
  primary_endpoint  TEXT,
  alpha             TEXT,
  power             TEXT,
  size              TEXT,
  status            TEXT,
  owner             TEXT,
  locked            BOOLEAN     DEFAULT FALSE,
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, id)
);

-- Sample-size scenarios. The surface renders a single scenario in its
-- calculator card; the read returns the is_primary row (numeric inputs +
-- expected N). Extra scenarios are stored for future scenario switching.
CREATE TABLE IF NOT EXISTS c2c_biostat_sample_sizes (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  study             TEXT,
  label             TEXT,
  alpha             NUMERIC,
  power             NUMERIC,
  delta             NUMERIC,
  sd                NUMERIC,
  expected          INTEGER,
  is_primary        BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (organization_id, id)
);

-- Pre-planned interim analyses (DSMB). `analysis_date` is formatted to
-- YYYY-MM-DD on read; sort_order gives a stable display order.
CREATE TABLE IF NOT EXISTS c2c_biostat_interims (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  study             TEXT,
  kind              TEXT,
  dsmb              TEXT,
  analysis_date     DATE,
  sort_order        INTEGER DEFAULT 0,
  PRIMARY KEY (organization_id, id)
);
