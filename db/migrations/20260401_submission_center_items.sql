-- Communication Center submission center persistence
-- Adds work-item lifecycle support for document prep/publish/submit operations.

CREATE TABLE IF NOT EXISTS concept2cure_submission_center_items (
  item_id text PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  authority text NOT NULL,
  submission_type text NOT NULL,
  sequence_number text,
  gateway_profile text,
  status text NOT NULL,
  ectd_path text,
  dispatch_ready boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_c2c_submission_center_scope
  ON concept2cure_submission_center_items (organization_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_c2c_submission_center_status
  ON concept2cure_submission_center_items (organization_id, project_id, status);
