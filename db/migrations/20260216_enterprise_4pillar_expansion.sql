-- ============================================================================
-- Migration: Enterprise 4-Pillar Expansion
-- Date: 2026-02-16
-- Description: Creates tables for Project Hierarchy, Rules Engine,
--              AI Sentinel, and Module Integration pillars.
-- Depends on: projects, organizations, client_workspaces, project_templates, users
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PILLAR 1: Project Hierarchy — ALTER projects table
-- Adds parent_project_id, depth, path for hierarchical project traversal
-- (Program → Project → Study → Sub-project)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'parent_project_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN parent_project_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'depth'
  ) THEN
    ALTER TABLE projects ADD COLUMN depth INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'path'
  ) THEN
    ALTER TABLE projects ADD COLUMN path TEXT;
  END IF;
END $$;

-- Self-referential FK: parent_project_id → projects(id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'projects_parent_project_id_projects_id_fk'
      AND table_name = 'projects'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_parent_project_id_projects_id_fk
      FOREIGN KEY (parent_project_id) REFERENCES projects(id);
  END IF;
END $$;

-- Indexes for hierarchy queries
CREATE INDEX IF NOT EXISTS projects_parent_project_idx ON projects (parent_project_id);
CREATE INDEX IF NOT EXISTS projects_path_idx ON projects (path);
CREATE INDEX IF NOT EXISTS projects_depth_idx ON projects (depth);

-- ─────────────────────────────────────────────────────────────────────────────
-- PILLAR 4: Module Integration — project_modules table
-- Links modules (CER, IND, CMC, etc.) to projects
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_modules (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  client_workspace_id INTEGER NOT NULL REFERENCES client_workspaces(id),
  module_type     TEXT NOT NULL,
  module_instance_id INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  settings        JSONB,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_project_module UNIQUE (project_id, module_type, module_instance_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PILLAR 2: Rules Engine — project_rules + rule_execution_log tables
-- Trigger-based automation for project lifecycle events
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_rules (
  id                SERIAL PRIMARY KEY,
  rule_id           TEXT NOT NULL UNIQUE,
  organization_id   INTEGER NOT NULL REFERENCES organizations(id),
  name              TEXT NOT NULL,
  description       TEXT,
  scope             TEXT NOT NULL DEFAULT 'global',
  scope_project_id  INTEGER REFERENCES projects(id),
  scope_template_id INTEGER REFERENCES project_templates(id),
  trigger_event     TEXT NOT NULL,
  conditions        JSONB,
  actions           JSONB,
  priority          INTEGER DEFAULT 50,
  is_active         BOOLEAN DEFAULT TRUE,
  cooldown_minutes  INTEGER DEFAULT 0,
  max_executions    INTEGER,
  execution_count   INTEGER DEFAULT 0,
  success_count     INTEGER DEFAULT 0,
  failure_count     INTEGER DEFAULT 0,
  last_executed_at  TIMESTAMPTZ,
  last_result       JSONB,
  is_built_in       BOOLEAN DEFAULT FALSE,
  tags              TEXT[],
  metadata          JSONB,
  created_by_id     INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_rules_rule_id_idx ON project_rules (rule_id);
CREATE INDEX IF NOT EXISTS project_rules_org_idx ON project_rules (organization_id);
CREATE INDEX IF NOT EXISTS project_rules_trigger_idx ON project_rules (trigger_event);
CREATE INDEX IF NOT EXISTS project_rules_scope_idx ON project_rules (scope);
CREATE INDEX IF NOT EXISTS project_rules_active_idx ON project_rules (is_active);

CREATE TABLE IF NOT EXISTS rule_execution_log (
  id                 SERIAL PRIMARY KEY,
  execution_id       TEXT NOT NULL UNIQUE,
  rule_id            TEXT NOT NULL,
  organization_id    INTEGER NOT NULL REFERENCES organizations(id),
  project_id         INTEGER REFERENCES projects(id),
  trigger_event      TEXT NOT NULL,
  trigger_context    JSONB,
  conditions_matched BOOLEAN DEFAULT FALSE,
  actions_executed   JSONB,
  success            BOOLEAN DEFAULT FALSE,
  error_message      TEXT,
  duration_ms        INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rule_exec_rule_id_idx ON rule_execution_log (rule_id);
CREATE INDEX IF NOT EXISTS rule_exec_org_idx ON rule_execution_log (organization_id);
CREATE INDEX IF NOT EXISTS rule_exec_project_idx ON rule_execution_log (project_id);
CREATE INDEX IF NOT EXISTS rule_exec_created_idx ON rule_execution_log (created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- PILLAR 3: AI Sentinel — sentinel_findings table
-- Stores AI-generated findings from automated project analysis
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sentinel_findings (
  id              SERIAL PRIMARY KEY,
  finding_id      TEXT NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id      INTEGER REFERENCES projects(id),
  analyzer_type   TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'medium',
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  details         JSONB,
  recommendations JSONB,
  affected_items  JSONB,
  status          TEXT NOT NULL DEFAULT 'open',
  resolved_at     TIMESTAMPTZ,
  resolved_by_id  INTEGER REFERENCES users(id),
  ai_request_id   TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sentinel_finding_id_idx ON sentinel_findings (finding_id);
CREATE INDEX IF NOT EXISTS sentinel_org_idx ON sentinel_findings (organization_id);
CREATE INDEX IF NOT EXISTS sentinel_project_idx ON sentinel_findings (project_id);
CREATE INDEX IF NOT EXISTS sentinel_analyzer_idx ON sentinel_findings (analyzer_type);
CREATE INDEX IF NOT EXISTS sentinel_severity_idx ON sentinel_findings (severity);
CREATE INDEX IF NOT EXISTS sentinel_status_idx ON sentinel_findings (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS policies for multi-tenant isolation
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on new tables
ALTER TABLE project_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel_findings ENABLE ROW LEVEL SECURITY;

-- project_modules: tenant sees only own org
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'project_modules_tenant_isolation'
  ) THEN
    CREATE POLICY project_modules_tenant_isolation ON project_modules
      USING (organization_id = current_setting('app.current_org_id', true)::integer);
  END IF;
END $$;

-- project_rules: tenant sees only own org
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'project_rules_tenant_isolation'
  ) THEN
    CREATE POLICY project_rules_tenant_isolation ON project_rules
      USING (organization_id = current_setting('app.current_org_id', true)::integer);
  END IF;
END $$;

-- rule_execution_log: tenant sees only own org
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'rule_exec_log_tenant_isolation'
  ) THEN
    CREATE POLICY rule_exec_log_tenant_isolation ON rule_execution_log
      USING (organization_id = current_setting('app.current_org_id', true)::integer);
  END IF;
END $$;

-- sentinel_findings: tenant sees only own org
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'sentinel_findings_tenant_isolation'
  ) THEN
    CREATE POLICY sentinel_findings_tenant_isolation ON sentinel_findings
      USING (organization_id = current_setting('app.current_org_id', true)::integer);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger function (reuse if exists)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at on modification
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_project_modules_updated_at') THEN
    CREATE TRIGGER trg_project_modules_updated_at
      BEFORE UPDATE ON project_modules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_project_rules_updated_at') THEN
    CREATE TRIGGER trg_project_rules_updated_at
      BEFORE UPDATE ON project_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sentinel_findings_updated_at') THEN
    CREATE TRIGGER trg_sentinel_findings_updated_at
      BEFORE UPDATE ON sentinel_findings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verification: Run after migration to confirm all objects exist
-- ============================================================================
-- SELECT 'projects.parent_project_id' AS col, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='parent_project_id') AS present
-- UNION ALL SELECT 'project_modules', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='project_modules')
-- UNION ALL SELECT 'project_rules', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='project_rules')
-- UNION ALL SELECT 'rule_execution_log', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='rule_execution_log')
-- UNION ALL SELECT 'sentinel_findings', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='sentinel_findings');
