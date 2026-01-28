-- =============================================================================
-- Concept2Cure Foundation: Tables + RLS + Immutability
-- Date: 2026-01-28
-- Purpose: Establish Concept2Cure persistence with tenant isolation and audit-grade immutability
-- =============================================================================

-- Ensure required extension for UUIDs exists (safe no-op if already installed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1) Core Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS concept2cure_conversations (
  id SERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  summary TEXT,
  parent_conversation_id INTEGER,
  fork_message_index INTEGER,
  thread_id TEXT,
  message_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_id INTEGER REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS concept2cure_messages (
  id SERIAL PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  conversation_id INTEGER NOT NULL REFERENCES concept2cure_conversations(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  attachments JSONB,
  artifact_id TEXT,
  citations JSONB,
  token_count INTEGER,
  model_used TEXT,
  latency_ms INTEGER,
  edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  original_content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS concept2cure_artifacts (
  id SERIAL PRIMARY KEY,
  artifact_id TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id INTEGER REFERENCES concept2cure_conversations(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  ctd_section TEXT,
  template_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  locked_at TIMESTAMPTZ,
  locked_by_id INTEGER REFERENCES users(id),
  created_by_id INTEGER REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS concept2cure_artifact_versions (
  id SERIAL PRIMARY KEY,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  change_description TEXT,
  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2) Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS c2c_conv_project_idx ON concept2cure_conversations(project_id);
CREATE INDEX IF NOT EXISTS c2c_conv_org_idx ON concept2cure_conversations(organization_id);
CREATE INDEX IF NOT EXISTS c2c_conv_id_idx ON concept2cure_conversations(conversation_id);

CREATE INDEX IF NOT EXISTS c2c_msg_conv_idx ON concept2cure_messages(conversation_id);
CREATE INDEX IF NOT EXISTS c2c_msg_id_idx ON concept2cure_messages(message_id);
CREATE INDEX IF NOT EXISTS c2c_msg_role_idx ON concept2cure_messages(role);

CREATE INDEX IF NOT EXISTS c2c_artifact_project_idx ON concept2cure_artifacts(project_id);
CREATE INDEX IF NOT EXISTS c2c_artifact_id_idx ON concept2cure_artifacts(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_artifact_type_idx ON concept2cure_artifacts(type);
CREATE INDEX IF NOT EXISTS c2c_artifact_status_idx ON concept2cure_artifacts(status);

CREATE INDEX IF NOT EXISTS c2c_artifact_versions_artifact_idx ON concept2cure_artifact_versions(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_artifact_versions_version_idx ON concept2cure_artifact_versions(artifact_id, version);

-- =============================================================================
-- 3) Tenant RLS + Insert Trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION set_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.organization_id := NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'No tenant ID set for insert operation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS + policy for Concept2Cure tables
DO $$
BEGIN
  PERFORM 1 FROM pg_policies WHERE policyname = 'concept2cure_conversations_tenant_policy';
  IF NOT FOUND THEN
    ALTER TABLE concept2cure_conversations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY concept2cure_conversations_tenant_policy ON concept2cure_conversations
      FOR ALL
      USING (
        organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
        OR organization_id = 0
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
  END IF;

  PERFORM 1 FROM pg_policies WHERE policyname = 'concept2cure_messages_tenant_policy';
  IF NOT FOUND THEN
    ALTER TABLE concept2cure_messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY concept2cure_messages_tenant_policy ON concept2cure_messages
      FOR ALL
      USING (
        organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
        OR organization_id = 0
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
  END IF;

  PERFORM 1 FROM pg_policies WHERE policyname = 'concept2cure_artifacts_tenant_policy';
  IF NOT FOUND THEN
    ALTER TABLE concept2cure_artifacts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY concept2cure_artifacts_tenant_policy ON concept2cure_artifacts
      FOR ALL
      USING (
        organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
        OR organization_id = 0
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
  END IF;

  PERFORM 1 FROM pg_policies WHERE policyname = 'concept2cure_artifact_versions_tenant_policy';
  IF NOT FOUND THEN
    ALTER TABLE concept2cure_artifact_versions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY concept2cure_artifact_versions_tenant_policy ON concept2cure_artifact_versions
      FOR ALL
      USING (
        organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
        OR organization_id = 0
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
  END IF;
END $$;

-- Insert triggers (set org id) — safe to recreate
DROP TRIGGER IF EXISTS c2c_set_tenant_id_conversations ON concept2cure_conversations;
CREATE TRIGGER c2c_set_tenant_id_conversations
  BEFORE INSERT ON concept2cure_conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_id();

DROP TRIGGER IF EXISTS c2c_set_tenant_id_messages ON concept2cure_messages;
CREATE TRIGGER c2c_set_tenant_id_messages
  BEFORE INSERT ON concept2cure_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_id();

DROP TRIGGER IF EXISTS c2c_set_tenant_id_artifacts ON concept2cure_artifacts;
CREATE TRIGGER c2c_set_tenant_id_artifacts
  BEFORE INSERT ON concept2cure_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_id();

DROP TRIGGER IF EXISTS c2c_set_tenant_id_artifact_versions ON concept2cure_artifact_versions;
CREATE TRIGGER c2c_set_tenant_id_artifact_versions
  BEFORE INSERT ON concept2cure_artifact_versions
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_id();

-- =============================================================================
-- 4) Immutability Enforcement (Append-Only)
-- =============================================================================

CREATE OR REPLACE FUNCTION concept2cure_prevent_message_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'concept2cure_messages is append-only (21 CFR Part 11)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS c2c_messages_immutable ON concept2cure_messages;
CREATE TRIGGER c2c_messages_immutable
  BEFORE UPDATE OR DELETE ON concept2cure_messages
  FOR EACH ROW
  EXECUTE FUNCTION concept2cure_prevent_message_mutation();

CREATE OR REPLACE FUNCTION concept2cure_prevent_artifact_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'concept2cure_artifact_versions is append-only (21 CFR Part 11)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS c2c_artifact_versions_immutable ON concept2cure_artifact_versions;
CREATE TRIGGER c2c_artifact_versions_immutable
  BEFORE UPDATE OR DELETE ON concept2cure_artifact_versions
  FOR EACH ROW
  EXECUTE FUNCTION concept2cure_prevent_artifact_version_mutation();

-- =============================================================================
-- End of migration
-- =============================================================================
