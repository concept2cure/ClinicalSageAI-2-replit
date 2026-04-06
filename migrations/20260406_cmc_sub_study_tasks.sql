-- Migration: CMC Sub-Study Tasks & Approvals
-- Date: 2026-04-06
-- Purpose: Add project-scoped tasking and multi-level approval for CMC data entry activities

CREATE TABLE IF NOT EXISTS cmc_sub_study_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES cmc_projects(id) ON DELETE CASCADE,
  data_category TEXT NOT NULL, -- drug_substance, drug_product, method, stability, specification, batch, change_control, comparability, process_validation, excipient, container_closure, reference_standard
  title TEXT NOT NULL,
  description TEXT,
  source_record_id TEXT, -- ID of the specific record in legacy CMC table
  source_object_id UUID, -- ID of canonical source object after write-through
  impacted_sections JSONB, -- e.g. ['3.2.S.4', '3.2.S.7']
  status TEXT NOT NULL DEFAULT 'draft', -- draft, in_progress, data_entered, pending_review, approved, merged, rejected
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  assigned_to TEXT,
  due_date TIMESTAMP,
  merged_to_module3 BOOLEAN NOT NULL DEFAULT false,
  merged_at TIMESTAMP,
  metadata JSONB,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cmc_sub_study_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  task_id UUID NOT NULL REFERENCES cmc_sub_study_tasks(id) ON DELETE CASCADE,
  approval_level INTEGER NOT NULL, -- 1 = data reviewer, 2 = QA/RA reviewer, 3 = study director
  approval_level_label TEXT NOT NULL,
  approver_user_id TEXT,
  approver_name TEXT,
  decision TEXT DEFAULT 'pending', -- pending, approved, rejected, returned_for_revision
  decision_note TEXT,
  decided_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_cmc_sub_study_tasks_project
  ON cmc_sub_study_tasks (organization_id, project_id, status);

CREATE INDEX IF NOT EXISTS idx_cmc_sub_study_tasks_category
  ON cmc_sub_study_tasks (project_id, data_category);

CREATE INDEX IF NOT EXISTS idx_cmc_sub_study_tasks_assigned
  ON cmc_sub_study_tasks (assigned_to, status)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cmc_sub_study_approvals_task
  ON cmc_sub_study_approvals (task_id, approval_level);

CREATE INDEX IF NOT EXISTS idx_cmc_sub_study_approvals_pending
  ON cmc_sub_study_approvals (approver_user_id, decision)
  WHERE decision = 'pending';
