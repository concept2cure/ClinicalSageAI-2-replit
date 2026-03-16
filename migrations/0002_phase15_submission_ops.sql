-- Phase 15: Submission Operations Command Center
-- Tables: submission_packages, package_sections, artifact_section_map,
--         milestones, milestone_sections, submission_policies,
--         readiness_snapshots, blockers, automation_runs, automation_actions, digests

CREATE TABLE IF NOT EXISTS c2c_submission_packages (
  id SERIAL PRIMARY KEY,
  package_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_family TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB,
  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS c2c_subpkg_org_project_idx ON c2c_submission_packages(org_id, project_id);
CREATE INDEX IF NOT EXISTS c2c_subpkg_family_idx ON c2c_submission_packages(package_family);
CREATE INDEX IF NOT EXISTS c2c_subpkg_status_idx ON c2c_submission_packages(status);

CREATE TABLE IF NOT EXISTS c2c_package_sections (
  id SERIAL PRIMARY KEY,
  section_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  package_db_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  section_label TEXT NOT NULL,
  parent_section_id INTEGER,
  sort_order INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS c2c_pkgsec_package_idx ON c2c_package_sections(package_db_id);
CREATE INDEX IF NOT EXISTS c2c_pkgsec_org_idx ON c2c_package_sections(org_id);
CREATE INDEX IF NOT EXISTS c2c_pkgsec_key_idx ON c2c_package_sections(package_db_id, section_key);

CREATE TABLE IF NOT EXISTS c2c_artifact_section_map (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  section_db_id INTEGER NOT NULL REFERENCES c2c_package_sections(id) ON DELETE CASCADE,
  document_family TEXT,
  owner_user_id INTEGER REFERENCES users(id),
  owner_role TEXT,
  owner_function TEXT,
  ownership_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS c2c_artsec_artifact_idx ON c2c_artifact_section_map(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_artsec_section_idx ON c2c_artifact_section_map(section_db_id);
CREATE INDEX IF NOT EXISTS c2c_artsec_org_idx ON c2c_artifact_section_map(org_id);
CREATE INDEX IF NOT EXISTS c2c_artsec_owner_idx ON c2c_artifact_section_map(owner_user_id);
CREATE INDEX IF NOT EXISTS c2c_artsec_docfamily_idx ON c2c_artifact_section_map(document_family);

CREATE TABLE IF NOT EXISTS c2c_milestones (
  id SERIAL PRIMARY KEY,
  milestone_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  package_db_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_date TIMESTAMPTZ,
  gate_status TEXT NOT NULL DEFAULT 'open',
  block_reasons JSONB,
  sort_order INTEGER DEFAULT 0,
  metadata JSONB,
  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS c2c_milestone_package_idx ON c2c_milestones(package_db_id);
CREATE INDEX IF NOT EXISTS c2c_milestone_org_idx ON c2c_milestones(org_id);
CREATE INDEX IF NOT EXISTS c2c_milestone_gate_idx ON c2c_milestones(gate_status);
CREATE INDEX IF NOT EXISTS c2c_milestone_target_idx ON c2c_milestones(target_date);

CREATE TABLE IF NOT EXISTS c2c_milestone_sections (
  id SERIAL PRIMARY KEY,
  milestone_db_id INTEGER NOT NULL REFERENCES c2c_milestones(id) ON DELETE CASCADE,
  section_db_id INTEGER NOT NULL REFERENCES c2c_package_sections(id) ON DELETE CASCADE,
  required BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS c2c_ms_milestone_idx ON c2c_milestone_sections(milestone_db_id);
CREATE INDEX IF NOT EXISTS c2c_ms_section_idx ON c2c_milestone_sections(section_db_id);

CREATE TABLE IF NOT EXISTS c2c_submission_policies (
  id SERIAL PRIMARY KEY,
  policy_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  package_family TEXT,
  section_key TEXT,
  document_family TEXT,
  owner_function TEXT,
  reviewer_class TEXT,
  ownership_type TEXT,
  review_due_hours INTEGER,
  due_soon_threshold_hours INTEGER,
  overdue_threshold_hours INTEGER,
  escalation_threshold_hours INTEGER,
  fallback_role TEXT,
  required_reviewer_classes JSONB,
  required_approvals JSONB,
  block_on_open_critical BOOLEAN DEFAULT TRUE,
  block_publish_on_open_critical BOOLEAN DEFAULT TRUE,
  require_section_ready_for_gate BOOLEAN DEFAULT TRUE,
  rule_description TEXT,
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS c2c_policy_org_idx ON c2c_submission_policies(org_id);
CREATE INDEX IF NOT EXISTS c2c_policy_family_idx ON c2c_submission_policies(package_family);
CREATE INDEX IF NOT EXISTS c2c_policy_section_idx ON c2c_submission_policies(section_key);
CREATE INDEX IF NOT EXISTS c2c_policy_docfamily_idx ON c2c_submission_policies(document_family);
CREATE INDEX IF NOT EXISTS c2c_policy_enabled_idx ON c2c_submission_policies(enabled);

CREATE TABLE IF NOT EXISTS c2c_readiness_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  package_db_id INTEGER NOT NULL REFERENCES c2c_submission_packages(id) ON DELETE CASCADE,
  section_db_id INTEGER REFERENCES c2c_package_sections(id) ON DELETE CASCADE,
  total_artifacts INTEGER DEFAULT 0,
  ready_artifacts INTEGER DEFAULT 0,
  readiness_percent INTEGER DEFAULT 0,
  open_threads INTEGER DEFAULT 0,
  open_tasks INTEGER DEFAULT 0,
  overdue_items INTEGER DEFAULT 0,
  missing_approvals INTEGER DEFAULT 0,
  open_critical_findings INTEGER DEFAULT 0,
  overall_state TEXT NOT NULL DEFAULT 'on_track',
  max_blocker_severity TEXT,
  previous_readiness_percent INTEGER,
  trend TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  automation_run_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS c2c_rdsnap_package_idx ON c2c_readiness_snapshots(package_db_id);
CREATE INDEX IF NOT EXISTS c2c_rdsnap_section_idx ON c2c_readiness_snapshots(section_db_id);
CREATE INDEX IF NOT EXISTS c2c_rdsnap_org_idx ON c2c_readiness_snapshots(org_id);
CREATE INDEX IF NOT EXISTS c2c_rdsnap_computed_at_idx ON c2c_readiness_snapshots(computed_at);
CREATE INDEX IF NOT EXISTS c2c_rdsnap_state_idx ON c2c_readiness_snapshots(overall_state);

CREATE TABLE IF NOT EXISTS c2c_blockers (
  id SERIAL PRIMARY KEY,
  blocker_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_db_id INTEGER REFERENCES c2c_submission_packages(id) ON DELETE CASCADE,
  section_db_id INTEGER REFERENCES c2c_package_sections(id) ON DELETE SET NULL,
  artifact_id INTEGER REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  thread_id INTEGER REFERENCES concept2cure_review_threads(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES concept2cure_review_tasks(id) ON DELETE SET NULL,
  blocker_type TEXT NOT NULL,
  document_family TEXT,
  owner_function TEXT,
  owner_user_id INTEGER REFERENCES users(id),
  owner_name TEXT,
  ownership_type TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  next_action TEXT,
  breached_policy_id INTEGER REFERENCES c2c_submission_policies(id) ON DELETE SET NULL,
  escalation_status TEXT DEFAULT 'none',
  escalated_at TIMESTAMPTZ,
  milestone_db_id INTEGER REFERENCES c2c_milestones(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS c2c_blocker_org_project_idx ON c2c_blockers(org_id, project_id);
CREATE INDEX IF NOT EXISTS c2c_blocker_package_idx ON c2c_blockers(package_db_id);
CREATE INDEX IF NOT EXISTS c2c_blocker_section_idx ON c2c_blockers(section_db_id);
CREATE INDEX IF NOT EXISTS c2c_blocker_artifact_idx ON c2c_blockers(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_blocker_type_idx ON c2c_blockers(blocker_type);
CREATE INDEX IF NOT EXISTS c2c_blocker_status_idx ON c2c_blockers(status);
CREATE INDEX IF NOT EXISTS c2c_blocker_severity_idx ON c2c_blockers(severity);
CREATE INDEX IF NOT EXISTS c2c_blocker_owner_idx ON c2c_blockers(owner_user_id);
CREATE INDEX IF NOT EXISTS c2c_blocker_due_at_idx ON c2c_blockers(due_at);

CREATE TABLE IF NOT EXISTS c2c_automation_runs (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_db_id INTEGER REFERENCES c2c_submission_packages(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  idempotency_key TEXT NOT NULL,
  actions_created INTEGER DEFAULT 0,
  blockers_found INTEGER DEFAULT 0,
  escalations_triggered INTEGER DEFAULT 0,
  readiness_updated BOOLEAN DEFAULT FALSE,
  summary JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS c2c_autorun_org_project_idx ON c2c_automation_runs(org_id, project_id);
CREATE INDEX IF NOT EXISTS c2c_autorun_type_idx ON c2c_automation_runs(run_type);
CREATE INDEX IF NOT EXISTS c2c_autorun_idemp_idx ON c2c_automation_runs(idempotency_key);
CREATE INDEX IF NOT EXISTS c2c_autorun_status_idx ON c2c_automation_runs(status);
CREATE INDEX IF NOT EXISTS c2c_autorun_started_at_idx ON c2c_automation_runs(started_at);

CREATE TABLE IF NOT EXISTS c2c_automation_actions (
  id SERIAL PRIMARY KEY,
  action_id TEXT NOT NULL UNIQUE,
  run_id INTEGER NOT NULL REFERENCES c2c_automation_runs(id) ON DELETE CASCADE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  action_type TEXT NOT NULL,
  target_artifact_id INTEGER REFERENCES concept2cure_artifacts(id) ON DELETE SET NULL,
  target_user_id INTEGER REFERENCES users(id),
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS c2c_autoaction_run_idx ON c2c_automation_actions(run_id);
CREATE INDEX IF NOT EXISTS c2c_autoaction_org_idx ON c2c_automation_actions(org_id);
CREATE INDEX IF NOT EXISTS c2c_autoaction_type_idx ON c2c_automation_actions(action_type);
CREATE INDEX IF NOT EXISTS c2c_autoaction_created_at_idx ON c2c_automation_actions(created_at);

CREATE TABLE IF NOT EXISTS c2c_digests (
  id SERIAL PRIMARY KEY,
  digest_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_db_id INTEGER REFERENCES c2c_submission_packages(id) ON DELETE CASCADE,
  digest_type TEXT NOT NULL,
  recipient_user_id INTEGER REFERENCES users(id),
  recipient_role TEXT,
  title TEXT NOT NULL,
  sections JSONB NOT NULL,
  waiting_on_me INTEGER DEFAULT 0,
  waiting_on_my_function INTEGER DEFAULT 0,
  new_requested_changes INTEGER DEFAULT 0,
  open_critical_findings INTEGER DEFAULT 0,
  overdue_items INTEGER DEFAULT 0,
  reopened_items INTEGER DEFAULT 0,
  blocking_readiness INTEGER DEFAULT 0,
  degrading_sections INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'generated',
  read_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS c2c_digest_org_project_idx ON c2c_digests(org_id, project_id);
CREATE INDEX IF NOT EXISTS c2c_digest_type_idx ON c2c_digests(digest_type);
CREATE INDEX IF NOT EXISTS c2c_digest_recipient_idx ON c2c_digests(recipient_user_id);
CREATE INDEX IF NOT EXISTS c2c_digest_generated_at_idx ON c2c_digests(generated_at);
