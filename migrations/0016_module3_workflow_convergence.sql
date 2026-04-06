-- Migration: Module 3 Workflow Convergence
-- Date: 2026-04-06
-- Purpose: Ensure Module 3 OS tables support all 15 subsections, new source types,
--          and the convergence workflow (artifact-to-source mapping, build-state tracking).

-- 1. Ensure cmc_source_objects has the unique constraint needed for upsert
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cmc_source_objects_project_type_key_version'
  ) THEN
    ALTER TABLE cmc_source_objects
      ADD CONSTRAINT cmc_source_objects_project_type_key_version
      UNIQUE (project_id, source_type, source_key, version);
  END IF;
END $$;

-- 2. Ensure cmc_module3_sections has the unique constraint for upsert
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cmc_module3_sections_project_section'
  ) THEN
    ALTER TABLE cmc_module3_sections
      ADD CONSTRAINT cmc_module3_sections_project_section
      UNIQUE (project_id, section_key);
  END IF;
END $$;

-- 3. Add indexes for Module 3 build-state queries
CREATE INDEX IF NOT EXISTS idx_cmc_source_objects_org_project
  ON cmc_source_objects (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_cmc_module3_sections_org_project
  ON cmc_module3_sections (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_cmc_contradictions_org_project
  ON cmc_contradictions (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_cmc_provenance_events_org_project
  ON cmc_provenance_events (organization_id, project_id);

-- 4. Index for dossier-classified artifact lookups
CREATE INDEX IF NOT EXISTS idx_c2c_artifacts_ctd_section
  ON concept2cure_artifacts (organization_id, project_id, ctd_section)
  WHERE ctd_section IS NOT NULL;

-- 5. Index for Module 3 source feed queries (artifacts with feedsModule3=true)
CREATE INDEX IF NOT EXISTS idx_c2c_artifacts_module3_sources
  ON concept2cure_artifacts (organization_id, project_id)
  WHERE category = 'source'
    AND (metadata->'dossierClassification'->>'feedsModule3')::text = 'true';

-- 6. Ensure cmc_section_lineage has proper indexes
CREATE INDEX IF NOT EXISTS idx_cmc_section_lineage_section
  ON cmc_section_lineage (section_id);

CREATE INDEX IF NOT EXISTS idx_cmc_section_lineage_source
  ON cmc_section_lineage (source_object_id);
