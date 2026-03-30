-- Report OS foundation (architecture-first slice)
-- Date: 2026-03-30

CREATE TABLE IF NOT EXISTS report_program_groups (
  id serial PRIMARY KEY,
  group_uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_workspace_id integer REFERENCES client_workspaces(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  metadata json,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  archived_at timestamp
);

CREATE INDEX IF NOT EXISTS report_program_groups_org_idx ON report_program_groups(organization_id);
CREATE INDEX IF NOT EXISTS report_program_groups_status_idx ON report_program_groups(status);

CREATE TABLE IF NOT EXISTS report_program_group_projects (
  id serial PRIMARY KEY,
  program_group_id integer NOT NULL REFERENCES report_program_groups(id) ON DELETE CASCADE,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  added_by integer REFERENCES users(id) ON DELETE SET NULL,
  added_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS report_program_group_projects_unique_idx
  ON report_program_group_projects(program_group_id, project_id);
CREATE INDEX IF NOT EXISTS report_program_group_projects_group_idx
  ON report_program_group_projects(program_group_id);
CREATE INDEX IF NOT EXISTS report_program_group_projects_project_idx
  ON report_program_group_projects(project_id);

CREATE TABLE IF NOT EXISTS report_program_group_snapshots (
  id serial PRIMARY KEY,
  program_group_id integer NOT NULL REFERENCES report_program_groups(id) ON DELETE CASCADE,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_label text,
  snapshot_reason text,
  as_of timestamp NOT NULL DEFAULT now(),
  project_set_hash text,
  project_ids json DEFAULT '[]'::json,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_program_group_snapshots_group_idx
  ON report_program_group_snapshots(program_group_id);
CREATE INDEX IF NOT EXISTS report_program_group_snapshots_asof_idx
  ON report_program_group_snapshots(as_of);

CREATE TABLE IF NOT EXISTS report_type_registry (
  id serial PRIMARY KEY,
  type_id text NOT NULL UNIQUE,
  label text NOT NULL,
  family text NOT NULL,
  allowed_scopes json NOT NULL,
  allowed_personas json DEFAULT '[]'::json,
  allowed_client_segments json DEFAULT '[]'::json,
  data_dependencies json DEFAULT '[]'::json,
  artifact_dependencies json DEFAULT '[]'::json,
  workflow_dependencies json DEFAULT '[]'::json,
  ana_modules json DEFAULT '[]'::json,
  export_template text,
  governance_requirements json,
  truthfulness_rules json,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_type_registry_family_idx ON report_type_registry(family);
CREATE INDEX IF NOT EXISTS report_type_registry_enabled_idx ON report_type_registry(enabled);

CREATE TABLE IF NOT EXISTS report_runs (
  id serial PRIMARY KEY,
  run_uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_workspace_id integer REFERENCES client_workspaces(id) ON DELETE SET NULL,
  scope_type text NOT NULL,
  scope_id text NOT NULL,
  report_type_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  requested_by integer REFERENCES users(id) ON DELETE SET NULL,
  dependency_summary json,
  blockers json,
  confidence integer,
  freshness json,
  error text,
  started_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'report_runs_report_type_fk'
      AND table_name = 'report_runs'
  ) THEN
    ALTER TABLE report_runs
      ADD CONSTRAINT report_runs_report_type_fk
      FOREIGN KEY (report_type_id)
      REFERENCES report_type_registry(type_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS report_runs_org_idx ON report_runs(organization_id);
CREATE INDEX IF NOT EXISTS report_runs_scope_idx ON report_runs(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS report_runs_type_idx ON report_runs(report_type_id);
CREATE INDEX IF NOT EXISTS report_runs_status_idx ON report_runs(status);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id serial PRIMARY KEY,
  run_id integer NOT NULL REFERENCES report_runs(id) ON DELETE CASCADE,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope_type text NOT NULL,
  scope_id text NOT NULL,
  snapshot_version integer NOT NULL DEFAULT 1,
  is_latest boolean NOT NULL DEFAULT true,
  previous_snapshot_id integer,
  artifact_record_id integer REFERENCES immutable_report_records(id) ON DELETE SET NULL,
  snapshot_metadata json,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_snapshots_run_idx ON report_snapshots(run_id);
CREATE INDEX IF NOT EXISTS report_snapshots_scope_idx ON report_snapshots(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS report_snapshots_latest_idx ON report_snapshots(is_latest);

CREATE TABLE IF NOT EXISTS report_run_dependencies (
  id serial PRIMARY KEY,
  run_id integer NOT NULL REFERENCES report_runs(id) ON DELETE CASCADE,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL,
  blocker text,
  observed_at timestamp NOT NULL DEFAULT now(),
  payload json,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_run_dependencies_run_idx
  ON report_run_dependencies(run_id);
CREATE INDEX IF NOT EXISTS report_run_dependencies_provider_idx
  ON report_run_dependencies(provider);
CREATE INDEX IF NOT EXISTS report_run_dependencies_status_idx
  ON report_run_dependencies(status);
