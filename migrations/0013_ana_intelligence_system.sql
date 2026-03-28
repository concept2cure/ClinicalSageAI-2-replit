-- Migration: AnA Intelligence System (CLAUDE.md Memory Compression Model)
-- Concept2Cure (C2C) / AnA 1.0 RI
--
-- Creates tables for:
--   1. ana_capability_registry — Every capability AnA has (ana.md)
--   2. ana_outcome_log — Success/failure tracking for compounding intelligence
--   3. ana_project_capabilities — Per-project capability tracking
--   4. user_intelligence_profiles — Per-user context (User.md / CLAUDE.local.md)
--   5. ana_platform_wisdom — Cross-client anonymized wisdom (Level 1 intelligence)
--   6. ana_scoped_rules — Path-scoped rules for smart context loading
--   7. ana_client_objectives — Company + project objectives tracking
--
-- Also adds new fields to project_intelligence_profiles for project classification.

-- ============================================================
-- 1. ANA CAPABILITY REGISTRY
-- ============================================================
CREATE TABLE IF NOT EXISTS ana_capability_registry (
  id SERIAL PRIMARY KEY,
  capability_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  slash_command TEXT,
  api_endpoint TEXT,
  trigger_patterns JSONB DEFAULT '[]',
  regulatory_bodies_applicable JSONB DEFAULT '[]',
  project_types_applicable JSONB DEFAULT '[]',
  document_types_applicable JSONB DEFAULT '[]',
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  partial_count INTEGER NOT NULL DEFAULT 0,
  avg_quality_score REAL,
  last_used_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ana_cap_registry_category_idx ON ana_capability_registry(category);
CREATE INDEX IF NOT EXISTS ana_cap_registry_active_idx ON ana_capability_registry(is_active);

-- ============================================================
-- 2. ANA OUTCOME LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS ana_outcome_log (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER REFERENCES projects(id),
  user_id INTEGER REFERENCES users(id),
  capability_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  input_summary TEXT,
  outcome TEXT NOT NULL,
  quality_score INTEGER,
  user_feedback TEXT,
  edit_delta TEXT,
  error_message TEXT,
  resolution TEXT,
  regulatory_body TEXT,
  project_type TEXT,
  therapeutic_area TEXT,
  document_type TEXT,
  section_code TEXT,
  duration_ms INTEGER,
  token_count INTEGER,
  lessons_learned TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ana_outcome_log_org_idx ON ana_outcome_log(organization_id);
CREATE INDEX IF NOT EXISTS ana_outcome_log_project_idx ON ana_outcome_log(project_id);
CREATE INDEX IF NOT EXISTS ana_outcome_log_capability_idx ON ana_outcome_log(capability_key);
CREATE INDEX IF NOT EXISTS ana_outcome_log_outcome_idx ON ana_outcome_log(outcome);
CREATE INDEX IF NOT EXISTS ana_outcome_log_regulatory_idx ON ana_outcome_log(regulatory_body);
CREATE INDEX IF NOT EXISTS ana_outcome_log_project_type_idx ON ana_outcome_log(project_type);
CREATE INDEX IF NOT EXISTS ana_outcome_log_created_idx ON ana_outcome_log(created_at);

-- ============================================================
-- 3. ANA PROJECT CAPABILITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS ana_project_capabilities (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  capability_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP,
  project_specific_notes TEXT,
  effectiveness_score REAL,
  success_rate REAL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, capability_key)
);

CREATE INDEX IF NOT EXISTS ana_project_cap_org_idx ON ana_project_capabilities(organization_id);

-- ============================================================
-- 4. USER INTELLIGENCE PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_intelligence_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  display_name TEXT,
  role TEXT,
  department TEXT,
  expertise_areas JSONB DEFAULT '[]',
  regulatory_specializations JSONB DEFAULT '[]',
  communication_style TEXT,
  personal_instructions TEXT,
  workflow_preferences JSONB DEFAULT '{}',
  preferred_capabilities JSONB DEFAULT '[]',
  projects_contributed JSONB DEFAULT '[]',
  editing_patterns JSONB DEFAULT '{}',
  total_interactions INTEGER NOT NULL DEFAULT 0,
  avg_satisfaction_score REAL,
  last_active_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS user_intel_profiles_org_idx ON user_intelligence_profiles(organization_id);

-- ============================================================
-- 5. ANA PLATFORM WISDOM
-- ============================================================
CREATE TABLE IF NOT EXISTS ana_platform_wisdom (
  id SERIAL PRIMARY KEY,
  wisdom_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  regulatory_body TEXT,
  project_type TEXT,
  therapeutic_area TEXT,
  document_type TEXT,
  pattern_description TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  min_evidence_threshold INTEGER NOT NULL DEFAULT 10,
  effectiveness_score REAL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_validated_at TIMESTAMP,
  rejection_rate REAL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ana_wisdom_category_idx ON ana_platform_wisdom(category);
CREATE INDEX IF NOT EXISTS ana_wisdom_regulatory_idx ON ana_platform_wisdom(regulatory_body);
CREATE INDEX IF NOT EXISTS ana_wisdom_project_type_idx ON ana_platform_wisdom(project_type);
CREATE INDEX IF NOT EXISTS ana_wisdom_active_idx ON ana_platform_wisdom(is_active);
CREATE INDEX IF NOT EXISTS ana_wisdom_confidence_idx ON ana_platform_wisdom(confidence_score);

-- ============================================================
-- 6. ANA SCOPED RULES
-- ============================================================
CREATE TABLE IF NOT EXISTS ana_scoped_rules (
  id SERIAL PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  scope_document_types JSONB DEFAULT '[]',
  scope_capabilities JSONB DEFAULT '[]',
  scope_regulatory_bodies JSONB DEFAULT '[]',
  scope_workflow_stages JSONB DEFAULT '[]',
  scope_section_codes JSONB DEFAULT '[]',
  scope_slash_commands JSONB DEFAULT '[]',
  rule_content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ana_scoped_rules_active_idx ON ana_scoped_rules(is_active);
CREATE INDEX IF NOT EXISTS ana_scoped_rules_priority_idx ON ana_scoped_rules(priority);

-- ============================================================
-- 7. ANA CLIENT OBJECTIVES
-- ============================================================
CREATE TABLE IF NOT EXISTS ana_client_objectives (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER REFERENCES projects(id),
  objective TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  target_date TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'on_track',
  success_criteria TEXT,
  risk_factors TEXT,
  parent_objective_id INTEGER,
  linked_project_ids JSONB DEFAULT '[]',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ana_objectives_org_idx ON ana_client_objectives(organization_id);
CREATE INDEX IF NOT EXISTS ana_objectives_project_idx ON ana_client_objectives(project_id);
CREATE INDEX IF NOT EXISTS ana_objectives_status_idx ON ana_client_objectives(status);
CREATE INDEX IF NOT EXISTS ana_objectives_category_idx ON ana_client_objectives(category);

-- ============================================================
-- 8. ADD FIELDS TO project_intelligence_profiles
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_intelligence_profiles' AND column_name = 'target_regulatory_bodies') THEN
    ALTER TABLE project_intelligence_profiles ADD COLUMN target_regulatory_bodies JSONB DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_intelligence_profiles' AND column_name = 'project_type') THEN
    ALTER TABLE project_intelligence_profiles ADD COLUMN project_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_intelligence_profiles' AND column_name = 'therapeutic_area') THEN
    ALTER TABLE project_intelligence_profiles ADD COLUMN therapeutic_area TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_intelligence_profiles' AND column_name = 'drug_device_name') THEN
    ALTER TABLE project_intelligence_profiles ADD COLUMN drug_device_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_intelligence_profiles' AND column_name = 'mechanism_of_action') THEN
    ALTER TABLE project_intelligence_profiles ADD COLUMN mechanism_of_action TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_intelligence_profiles' AND column_name = 'development_phase') THEN
    ALTER TABLE project_intelligence_profiles ADD COLUMN development_phase TEXT;
  END IF;
END
$$;
