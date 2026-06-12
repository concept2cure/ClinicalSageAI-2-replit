-- Minimal base/prerequisite tables my migrations FK to + governance ledger tables.
CREATE TABLE IF NOT EXISTS organizations (id serial PRIMARY KEY, name text);
CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, email text, password_hash text);
CREATE TABLE IF NOT EXISTS submissions (id serial PRIMARY KEY, organization_id integer);
CREATE TABLE IF NOT EXISTS clinical_studies (id serial PRIMARY KEY, organization_id integer, study_id text, title text);
CREATE TABLE IF NOT EXISTS projects (id serial PRIMARY KEY, organization_id integer, name text);
CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY, tenant_id integer, user_id integer, action text, table_name text, record_id text,
  actor_id integer, target text, target_type text, target_id text, reason text, payload_hash text,
  ana_action_id text, sha256_chain text, occurred_at timestamptz, hmac_seal text
);
CREATE TABLE IF NOT EXISTS c2c_ana_actions (
  id text PRIMARY KEY, org_id integer, domain text, surface text, command text, target text, risk text, payload jsonb,
  agentic_mode text, state text, proposed_at timestamptz, proposed_by integer, decided_at timestamptz, decided_by integer,
  decision_reason text, executed_at timestamptz, audit_row_id text, idempotency_key text
);

-- Full unified_tasks (central tasking) — matches the Drizzle model for the tasking-bridge verification.
CREATE TABLE unified_tasks (
  id serial PRIMARY KEY,
  task_id text NOT NULL UNIQUE,
  organization_id integer NOT NULL,
  client_workspace_id integer,
  project_id integer,
  module_type text NOT NULL,
  module_icon text, module_color text,
  source_entity_id text, source_entity_type text,
  title text NOT NULL, description text,
  category text, task_type text,
  assignee_id integer, assignee_name text, assigned_by integer, assigned_at timestamptz, team_id integer,
  status text NOT NULL DEFAULT 'pending', priority text NOT NULL DEFAULT 'medium',
  progress integer DEFAULT 0, completion_percentage integer DEFAULT 0,
  start_date timestamptz, due_date timestamptz, completed_at timestamptz,
  estimated_hours numeric, actual_hours numeric,
  linked_tasks text[], dependencies text[], blocked_by text[], blocks text[],
  module_source text, module_data jsonb, cross_module_links jsonb, automation_rules jsonb, escalation_path jsonb,
  approval_required boolean DEFAULT false, approvers jsonb, approval_status text, approval_history jsonb,
  impact_score integer, risk_level text, critical_path boolean DEFAULT false, regulatory_impact boolean DEFAULT false,
  notification_settings jsonb, automation_enabled boolean DEFAULT true, ai_suggestions jsonb,
  tags text[], attachments jsonb, comments jsonb, metadata jsonb,
  created_by_id integer, last_modified_by integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
