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
-- Effort Certification (add-on) — 2 CFR 200.430. See shared/schema/effort-certification.ts.
CREATE TABLE IF NOT EXISTS effort_certifications (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  personnel_id integer NOT NULL REFERENCES research_personnel(id),
  period_start date NOT NULL, period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_certification','certified','recertify_required','superseded')),
  certified_by integer REFERENCES users(id), certified_at timestamptz, content_hash text,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_effort_certifications_org ON effort_certifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_effort_certifications_personnel ON effort_certifications(personnel_id);
CREATE TABLE IF NOT EXISTS effort_lines (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  certification_id integer NOT NULL REFERENCES effort_certifications(id),
  award_id integer REFERENCES grant_awards(id),
  activity_label text NOT NULL,
  committed_pct numeric(5,2) NOT NULL DEFAULT 0, actual_pct numeric(5,2) NOT NULL DEFAULT 0,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_effort_lines_org ON effort_lines(organization_id);
CREATE INDEX IF NOT EXISTS idx_effort_lines_cert ON effort_lines(certification_id);
-- Research Security / COI-FCOI (add-on) — NOT-OD-26-017 / NSPM-33 / 42 CFR 50 Subpart F.
CREATE TABLE IF NOT EXISTS coi_disclosures (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  personnel_id integer NOT NULL REFERENCES research_personnel(id),
  disclosure_type text NOT NULL CHECK (disclosure_type IN ('financial_interest','outside_activity','foreign_appointment','foreign_support','other_support','gift','intellectual_property','other')),
  entity_name text NOT NULL, country text, description text, monetary_value numeric(14,2), related_to_research text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','no_conflict','managed','conflict','denied')),
  reviewed_by integer REFERENCES users(id), reviewed_at timestamptz, management_plan text, disclosed_date date,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_coi_disclosures_org ON coi_disclosures(organization_id);
CREATE INDEX IF NOT EXISTS idx_coi_disclosures_personnel ON coi_disclosures(personnel_id);
