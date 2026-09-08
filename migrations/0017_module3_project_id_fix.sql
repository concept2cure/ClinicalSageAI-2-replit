-- Migration: Fix Module 3 project_id FK to support concept2cure project IDs
-- Date: 2026-04-06
-- Problem: cmc_source_objects, cmc_module3_sections, cmc_contradictions, cmc_provenance_events,
--          cmc_section_lineage all reference cmc_projects(id) via FK. But the upload flow
--          and convergence service pass the concept2cure project ID (from the projects table),
--          which is an integer, not a cmc_projects UUID. This causes FK violations at runtime.
-- Fix: Drop the FK constraints to cmc_projects and change project_id to TEXT to accept
--      any project identifier. The application layer handles project scoping.

-- 1. Drop FK constraints from cmc_source_objects
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%cmc_source_objects%project%' AND constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE cmc_source_objects DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'cmc_source_objects' AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%project%'
      LIMIT 1
    );
  END IF;
END $$;

-- 2. Drop FK constraints from cmc_module3_sections
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'cmc_module3_sections' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%project%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE cmc_module3_sections DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'cmc_module3_sections' AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%project%'
      LIMIT 1
    );
  END IF;
END $$;

-- 3. Drop FK constraints from cmc_contradictions
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'cmc_contradictions' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%project%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE cmc_contradictions DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'cmc_contradictions' AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%project%'
      LIMIT 1
    );
  END IF;
END $$;

-- 4. Drop FK constraints from cmc_provenance_events
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'cmc_provenance_events' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%project%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE cmc_provenance_events DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'cmc_provenance_events' AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%project%'
      LIMIT 1
    );
  END IF;
END $$;

-- 5. Drop FK constraints from cmc_module3_section_versions
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'cmc_module3_section_versions' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%project%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE cmc_module3_section_versions DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'cmc_module3_section_versions' AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%project%'
      LIMIT 1
    );
  END IF;
END $$;

-- 6. Alter project_id columns to TEXT to accept both integer and UUID formats
ALTER TABLE cmc_source_objects ALTER COLUMN project_id TYPE TEXT USING project_id::TEXT;
ALTER TABLE cmc_module3_sections ALTER COLUMN project_id TYPE TEXT USING project_id::TEXT;
ALTER TABLE cmc_contradictions ALTER COLUMN project_id TYPE TEXT USING project_id::TEXT;
ALTER TABLE cmc_provenance_events ALTER COLUMN project_id TYPE TEXT USING project_id::TEXT;
ALTER TABLE cmc_module3_section_versions ALTER COLUMN project_id TYPE TEXT USING project_id::TEXT;

-- 7. Recreate unique constraints with TEXT project_id
--
-- AMENDED IN PLACE 2026-09-08 (CLAUDE.md Rule 1). These created
--   cmc_source_objects_project_key_idx  (project_id, source_type, source_key, version)
--   cmc_module3_sections_project_key_idx (project_id, section_key)
-- both of which OMIT organization_id.
--
-- What was removed: the two tenant-blind unique indexes.
-- Why: a unique key without the tenant column is what ON CONFLICT resolves
-- against, so it decides whose row an upsert overwrites — one tenant could
-- write into another's canonical CMC source objects and Module 3 section
-- bodies. The whole account is in
-- migrations/20260728_cmc_module3_org_scoped_uniqueness.sql.
-- Which change removed it: that file. Amended here as well because
-- install-fresh applies both, so this re-created the defect on every fresh
-- install and left a window in which the tenant-blind key was the arbiter.
-- The org-scoped indexes are created here directly, in the same shape 20260728
-- installs, so the two appliers agree.
DROP INDEX IF EXISTS cmc_source_objects_project_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS cmc_source_objects_org_project_key_idx
  ON cmc_source_objects(organization_id, project_id, source_type, source_key, version);

DROP INDEX IF EXISTS cmc_module3_sections_project_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS cmc_module3_sections_org_project_key_idx
  ON cmc_module3_sections(organization_id, project_id, section_key);

-- 8. Recreate performance indexes
CREATE INDEX IF NOT EXISTS idx_cmc_source_objects_org_project_v2
  ON cmc_source_objects (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_cmc_module3_sections_org_project_v2
  ON cmc_module3_sections (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_cmc_contradictions_org_project_v2
  ON cmc_contradictions (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_cmc_provenance_events_org_project_v2
  ON cmc_provenance_events (organization_id, project_id);
