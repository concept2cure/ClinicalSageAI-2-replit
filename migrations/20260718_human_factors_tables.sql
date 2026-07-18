-- Human-factors (IEC 62366-1) store — backs the v2 HumanFactors surface.
--
-- The route (server/routes/human-factors.ts, GET /api/human-factors read +
-- POST /api/human-factors/scenarios write) and the demo seed
-- (scripts/seed/ga-demo.d/95-human-factors.mjs) were already shipped, but the
-- two tables they read/write/seed were never created by any migration the
-- drizzle runner processes (an equivalent CREATE lived only under db/migrations/,
-- a separate legacy tree). So the surface fell back to its fixture. This creates
-- both, matching exactly what the route projects and the seed/route insert.
--
-- Tenant model: integer organization_id (RLS rollout, 0021). Composite PK
-- (organization_id, id) matches each ON CONFLICT target; id is a text key
-- ('hf-bx204' for the file, 'hfs-<n>' for scenarios). `present` is the element
-- presence map (JSON.stringify(...)::jsonb in the seed) -> jsonb. scenarios link
-- to their file by file_id (text, mirrors c2c_hf_files.id); kept a plain indexed
-- column (no hard FK) to stay load-order agnostic.
--
-- Route reads:
--   files:     SELECT id, device, framework, present FROM c2c_hf_files
--                WHERE organization_id = $1 ORDER BY id LIMIT 1
--   scenarios: SELECT task, use_error AS "useError",
--                     potential_harm_severity AS "potentialHarmSeverity", mitigated
--                FROM c2c_hf_scenarios
--               WHERE organization_id = $1 AND file_id = $2 ORDER BY id

CREATE TABLE IF NOT EXISTS c2c_hf_files (
  id                text    NOT NULL,
  organization_id   integer NOT NULL,
  device            text,
  framework         text    NOT NULL DEFAULT 'IEC 62366-1',
  present           jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_hf_files_org
  ON c2c_hf_files (organization_id);

CREATE TABLE IF NOT EXISTS c2c_hf_scenarios (
  id                       text    NOT NULL,
  organization_id          integer NOT NULL,
  file_id                  text,
  task                     text,
  use_error                text,
  potential_harm_severity  text,
  mitigated                boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_hf_scenarios_org
  ON c2c_hf_scenarios (organization_id);

-- The scenarios read filters WHERE organization_id = $1 AND file_id = $2, so a
-- composite index over both matches the route's actual access path.
CREATE INDEX IF NOT EXISTS idx_c2c_hf_scenarios_file
  ON c2c_hf_scenarios (organization_id, file_id);
