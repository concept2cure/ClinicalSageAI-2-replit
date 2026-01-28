-- =============================================================================
-- Concept2Cure Step 1.2: WBS + Assignments Tables
-- Date: 2026-01-28
-- Purpose: Provide project workflow stages, tasks, and CRO team assignments
-- =============================================================================

-- Project Workflow Stages (WBS)
CREATE TABLE IF NOT EXISTS project_workflow_stages (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  description TEXT,
  "order" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  critical_to_quality_factors JSONB,
  completion_criteria JSONB,
  auto_advance BOOLEAN DEFAULT FALSE,
  assignees TEXT[],
  reviewers TEXT[],
  approval_status TEXT DEFAULT 'not-started',
  settings JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_workflow_stages_project_idx ON project_workflow_stages(project_id);
CREATE INDEX IF NOT EXISTS project_workflow_stages_org_idx ON project_workflow_stages(organization_id);
CREATE INDEX IF NOT EXISTS project_workflow_stages_status_idx ON project_workflow_stages(status);
CREATE INDEX IF NOT EXISTS project_workflow_stages_order_idx ON project_workflow_stages("order");

-- Project Tasks (WBS)
CREATE TABLE IF NOT EXISTS project_tasks (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  workflow_stage_id INTEGER REFERENCES project_workflow_stages(id),
  parent_task_id INTEGER REFERENCES project_tasks(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  module_type TEXT,
  module_icon TEXT,
  module_color TEXT,
  assignee_id INTEGER REFERENCES users(id),
  reviewer_id INTEGER REFERENCES users(id),
  estimated_hours INTEGER,
  actual_hours INTEGER,
  start_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by_id INTEGER REFERENCES users(id),
  blocked_reason TEXT,
  critical_to_quality BOOLEAN DEFAULT FALSE,
  quality_metrics JSONB,
  depends_on TEXT[],
  linked_tasks JSONB,
  settings JSONB,
  metadata JSONB,
  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_tasks_project_idx ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS project_tasks_org_idx ON project_tasks(organization_id);
CREATE INDEX IF NOT EXISTS project_tasks_status_idx ON project_tasks(status);
CREATE INDEX IF NOT EXISTS project_tasks_stage_idx ON project_tasks(workflow_stage_id);
CREATE INDEX IF NOT EXISTS project_tasks_assignee_idx ON project_tasks(assignee_id);

-- CRO Team Assignments
CREATE TABLE IF NOT EXISTS cro_team_assignments (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  client_id INTEGER,
  study_id INTEGER,
  submission_id INTEGER,
  role TEXT NOT NULL,
  responsibility TEXT,
  assignment_type TEXT NOT NULL DEFAULT 'primary',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  utilization_percentage INTEGER DEFAULT 100,
  billable_rate DECIMAL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cro_team_assignments_org_idx ON cro_team_assignments(organization_id);
CREATE INDEX IF NOT EXISTS cro_team_assignments_user_idx ON cro_team_assignments(user_id);
CREATE INDEX IF NOT EXISTS cro_team_assignments_status_idx ON cro_team_assignments(status);

-- Add foreign keys if referenced CRO tables exist
DO $$
BEGIN
  IF to_regclass('public.cro_clients') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'cro_team_assignments_client_id_fkey'
    ) THEN
      ALTER TABLE cro_team_assignments
        ADD CONSTRAINT cro_team_assignments_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES cro_clients(id);
    END IF;
  END IF;

  IF to_regclass('public.cro_studies') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'cro_team_assignments_study_id_fkey'
    ) THEN
      ALTER TABLE cro_team_assignments
        ADD CONSTRAINT cro_team_assignments_study_id_fkey
        FOREIGN KEY (study_id) REFERENCES cro_studies(id);
    END IF;
  END IF;

  IF to_regclass('public.cro_regulatory_submissions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'cro_team_assignments_submission_id_fkey'
    ) THEN
      ALTER TABLE cro_team_assignments
        ADD CONSTRAINT cro_team_assignments_submission_id_fkey
        FOREIGN KEY (submission_id) REFERENCES cro_regulatory_submissions(id);
    END IF;
  END IF;
END $$;
