-- Communication Center backend persistence scaffold
-- Authority profiles, normalized agency communication events, and PublishOps service lane records

CREATE TABLE IF NOT EXISTS concept2cure_authority_profiles (
  id BIGSERIAL PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  authority TEXT NOT NULL,
  center_or_division TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  submission_transport TEXT NOT NULL,
  accepted_formats JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  package_constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
  acknowledgment_model TEXT NOT NULL,
  message_receipt_model TEXT NOT NULL,
  metadata_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_c2c_authority_profiles_scope
  ON concept2cure_authority_profiles (organization_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS concept2cure_agency_communications (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  communication_type TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  linked_submission_id TEXT,
  linked_package_id TEXT,
  linked_section_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  received_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  urgency TEXT NOT NULL,
  response_required BOOLEAN NOT NULL DEFAULT FALSE,
  extracted_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  human_review_status TEXT NOT NULL,
  closure_status TEXT NOT NULL,
  audit_metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_c2c_agency_events_scope
  ON concept2cure_agency_communications (organization_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS concept2cure_publishops_services (
  id BIGSERIAL PRIMARY KEY,
  service_id TEXT NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  service_request_title TEXT NOT NULL,
  entitlement_level TEXT NOT NULL,
  requested_by_role TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  operator_assignee TEXT,
  blocked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_c2c_publishops_scope
  ON concept2cure_publishops_services (organization_id, project_id, created_at DESC);
