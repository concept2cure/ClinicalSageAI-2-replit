-- Therapeutic Area Context Injection (Feature 2.7).
--
-- Adds projects.therapeutic_area — a single source-of-truth slug
-- that the therapeutic-area-profiles registry resolves to a profile
-- module (oncology / rare-disease / neurology / immunology / ...).
-- The slug is intentionally a free-form string so adding a new profile
-- only requires a new module file + a registry entry; no migration.
--
-- Default NULL means "no profile injected" — backward-compatible with
-- every existing project.

BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS therapeutic_area TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_therapeutic_area
  ON projects(therapeutic_area)
  WHERE therapeutic_area IS NOT NULL;

COMMIT;
