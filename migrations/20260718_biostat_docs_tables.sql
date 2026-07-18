-- Biostatistics store — backs the three previously-stubbed sections of the v2
-- Phase 11 Intelligence · Biostatistics surface.
--
-- The route (server/routes/intelligence-cluster.ts, GET /api/intelligence/biostat
-- -> out.saps / out.sampleSize / out.interims) and the demo seed
-- (scripts/seed/ga-demo.d/91-biostat-docs.mjs) were already shipped, but the
-- three c2c_biostat_* tables they read/seed were never created by any migration
-- the drizzle runner processes (an equivalent CREATE lived only under
-- db/migrations/, a separate legacy tree). So each section fell back to its
-- fixture. This creates all three, matching exactly what the route projects and
-- the seed inserts. (The endpoint's fourth section, tlfQueue, is unaffected — it
-- aggregates over c2c_tlf_builds, seeded elsewhere.)
--
-- Tenant model: integer organization_id (RLS rollout, 0021). Composite PK
-- (organization_id, id) matches each seed's ON CONFLICT target; id is a
-- client/seed-supplied text key ('SAP-BX099-301-v2.1', 'ss-bx099-301',
-- 'ia-bx099-301-fut'). FK-free.

-- ── SAP documents ──
-- Route: SELECT id, program, study, primary_endpoint AS primary, alpha, power,
--        size, status, owner, locked, updated_at ... ORDER BY updated_at DESC.
-- alpha/power/size are display strings ('0.025 1-sided', '90%', '480 (240/240)')
-- so they are text, not numeric. `locked` drives the 'locked' updated-label;
-- `updated_at` (seed writes NOW() - N hours) drives the relative "N ago" label.
CREATE TABLE IF NOT EXISTS c2c_biostat_saps (
  id                text    NOT NULL,
  organization_id   integer NOT NULL,
  program           text,
  study             text,
  primary_endpoint  text,
  alpha             text,
  power             text,
  size              text,
  status            text,
  owner             text,
  locked            boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_biostat_saps_org
  ON c2c_biostat_saps (organization_id);

-- ── Sample-size scenarios ──
-- Route: SELECT alpha, power, delta, sd, expected ... ORDER BY is_primary DESC,
--        id ASC LIMIT 1 (values Number()-coerced on read). alpha/power/delta/sd
--        are decimals -> numeric; expected is a subject count -> integer.
CREATE TABLE IF NOT EXISTS c2c_biostat_sample_sizes (
  id                text    NOT NULL,
  organization_id   integer NOT NULL,
  study             text,
  label             text,
  alpha             numeric,
  power             numeric,
  delta             numeric,
  sd                numeric,
  expected          integer,
  is_primary        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_biostat_sample_sizes_org
  ON c2c_biostat_sample_sizes (organization_id);

-- ── Pre-planned interim analyses (DSMB) ──
-- Route: SELECT study, kind, dsmb, to_char(analysis_date, 'YYYY-MM-DD') AS date
--        ... ORDER BY sort_order ASC, analysis_date ASC. analysis_date is a real
--        DATE (seed writes CURRENT_DATE + N days; route to_char()s it).
CREATE TABLE IF NOT EXISTS c2c_biostat_interims (
  id                text    NOT NULL,
  organization_id   integer NOT NULL,
  study             text,
  kind              text,
  dsmb              text,
  analysis_date     date,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_biostat_interims_org
  ON c2c_biostat_interims (organization_id);
