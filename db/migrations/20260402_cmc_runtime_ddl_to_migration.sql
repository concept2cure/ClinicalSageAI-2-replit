-- Migration: Move runtime DDL from server/api/cmc/routes.ts into a proper migration
-- These tables were previously created at request time via module-level boolean guards.

CREATE TABLE IF NOT EXISTS project_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER,
  project_id UUID,
  template_id UUID,
  workflow_name TEXT NOT NULL,
  workflow_data JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'active',
  progress INTEGER DEFAULT 0,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  assigned_to TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS compliance_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  organization_id INTEGER,
  guideline TEXT NOT NULL,
  requirement TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence JSONB,
  justification TEXT,
  risk_level TEXT,
  mitigation TEXT,
  due_date TIMESTAMP,
  completed_date TIMESTAMP,
  assigned_to TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
