-- Report OS foundation (architecture-first slice)
-- Date: 2026-03-30
-- AMENDED IN PLACE 2026-10-13 W1/D2: group membership now records the exact
-- organization shared by its group and project, with validated composite keys.
-- Replay preflight refuses inconsistent legacy links instead of relabeling or
-- deleting them. Only unambiguous NULL tenant keys are backfilled. The canonical
-- child-parent and integer tenant policy installers run after this foundation.

BEGIN;

-- Also declared by shared/schema.ts. A fresh drizzle push can create the
-- sealed-record table without this index; the replayed Report OS foundation
-- must establish the required tenant query path before install verification.
DO $sealed_report_tenant_index$
BEGIN
  IF to_regclass('public.irr_org_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
      WHERE i.indexrelid=to_regclass('public.irr_org_idx') AND i.indrelid='public.immutable_report_records'::regclass
        AND a.attname='organization_id' AND i.indisvalid AND i.indisready AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'REPORT_TENANT_INDEX_RECONCILIATION_REQUIRED: irr_org_idx has a conflicting or invalid definition; no index or report was changed.';
  END IF;
END
$sealed_report_tenant_index$;
CREATE INDEX IF NOT EXISTS irr_org_idx ON public.immutable_report_records(organization_id);

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
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  program_group_id integer NOT NULL REFERENCES report_program_groups(id) ON DELETE CASCADE,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  added_by integer REFERENCES users(id) ON DELETE SET NULL,
  added_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.report_program_group_projects ADD COLUMN IF NOT EXISTS organization_id integer;

DO $membership_preflight$
DECLARE broken_id integer;
BEGIN
  IF (SELECT atttypid FROM pg_attribute WHERE attrelid='public.report_program_group_projects'::regclass
      AND attname='organization_id' AND NOT attisdropped) <> 'integer'::regtype THEN
    RAISE EXCEPTION 'REPORT_GROUP_MEMBERSHIP_TENANT_COLUMN_MISMATCH: organization_id must be integer; no column was converted.';
  END IF;
  SELECT member.id INTO broken_id FROM public.report_program_group_projects member
    LEFT JOIN public.report_program_groups parent ON parent.id=member.program_group_id
    LEFT JOIN public.projects project ON project.id=member.project_id
    WHERE parent.id IS NULL OR project.id IS NULL OR parent.organization_id IS NULL OR project.organization_id IS NULL
      OR parent.organization_id IS DISTINCT FROM project.organization_id
      OR (member.organization_id IS NOT NULL AND member.organization_id IS DISTINCT FROM parent.organization_id)
    ORDER BY member.id LIMIT 1;
  IF broken_id IS NOT NULL THEN
    RAISE EXCEPTION 'REPORT_GROUP_MEMBERSHIP_TENANT_RECONCILIATION_REQUIRED: membership % has missing or conflicting parent organization scope. Retained links must be reconciled before deployment; nothing was rewritten.', broken_id;
  END IF;
END
$membership_preflight$;

UPDATE public.report_program_group_projects member SET organization_id=parent.organization_id
  FROM public.report_program_groups parent, public.projects project
  WHERE member.organization_id IS NULL AND member.program_group_id=parent.id AND member.project_id=project.id
    AND parent.organization_id=project.organization_id;
ALTER TABLE public.report_program_group_projects ALTER COLUMN organization_id SET NOT NULL;

DO $membership_keys$
DECLARE
  parent record;
  link record;
  existing_key record;
BEGIN
  -- Reuse an existing valid unique parent key; adding another on every replay
  -- would rebuild an already protected identity under a different name.
  FOR parent IN SELECT * FROM (VALUES
    ('report_program_groups','report_program_groups_id_org_uq'),
    ('projects','projects_id_org_uq')
  ) AS parents(table_name,index_name) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_index i
      WHERE i.indrelid=to_regclass('public.'||parent.table_name) AND i.indisunique AND i.indisvalid
        AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=2
        AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='id')
        AND i.indkey[1]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='organization_id')) THEN
      IF to_regclass('public.'||parent.index_name) IS NOT NULL THEN
        RAISE EXCEPTION 'REPORT_GROUP_MEMBERSHIP_PARENT_KEY_MISMATCH: % does not establish the declared parent identity; no index was replaced.', parent.index_name;
      END IF;
      EXECUTE format('CREATE UNIQUE INDEX %I ON public.%I (id, organization_id)',parent.index_name,parent.table_name);
    END IF;
  END LOOP;
  FOR link IN SELECT * FROM (VALUES
    ('program_group_id','report_program_groups','report_program_group_projects_group_same_org_fk'),
    ('project_id','projects','report_program_group_projects_project_same_org_fk')
  ) AS links(parent_column,parent_table,constraint_name) LOOP
    SELECT * INTO existing_key FROM pg_constraint WHERE conrelid='public.report_program_group_projects'::regclass
      AND conname=link.constraint_name;
    IF FOUND THEN
      IF existing_key.contype<>'f' OR existing_key.confrelid<>to_regclass('public.'||link.parent_table)
        OR existing_key.conkey<>ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid=existing_key.conrelid AND attname=link.parent_column),
          (SELECT attnum FROM pg_attribute WHERE attrelid=existing_key.conrelid AND attname='organization_id')
        ]::smallint[]
        OR existing_key.confkey<>ARRAY[
          (SELECT attnum FROM pg_attribute WHERE attrelid=existing_key.confrelid AND attname='id'),
          (SELECT attnum FROM pg_attribute WHERE attrelid=existing_key.confrelid AND attname='organization_id')
        ]::smallint[]
        OR existing_key.confdeltype<>'c' OR existing_key.confupdtype<>'a'
        OR existing_key.confmatchtype<>'s' OR existing_key.condeferrable THEN
        RAISE EXCEPTION 'REPORT_GROUP_MEMBERSHIP_CONSTRAINT_MISMATCH: % does not enforce the declared same-organization parentage. No key was replaced.',link.constraint_name;
      END IF;
      IF NOT existing_key.convalidated THEN
        EXECUTE format('ALTER TABLE public.report_program_group_projects VALIDATE CONSTRAINT %I',link.constraint_name);
      END IF;
    ELSE
      EXECUTE format('ALTER TABLE public.report_program_group_projects ADD CONSTRAINT %I FOREIGN KEY (%I, organization_id) REFERENCES public.%I (id, organization_id) ON DELETE CASCADE ON UPDATE NO ACTION',
        link.constraint_name,link.parent_column,link.parent_table);
    END IF;
  END LOOP;
END
$membership_keys$;

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

COMMIT;
