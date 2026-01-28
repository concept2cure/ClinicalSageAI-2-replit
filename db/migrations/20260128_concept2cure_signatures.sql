-- =============================================================================
-- Concept2Cure Signatures + Immutability
-- Date: 2026-01-28
-- Purpose: Electronic signatures for Concept2Cure artifacts (21 CFR Part 11)
-- =============================================================================

-- Ensure required extension for UUIDs exists (safe no-op if already installed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1) Signatures Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS concept2cure_signatures (
  id SERIAL PRIMARY KEY,
  signature_id TEXT NOT NULL UNIQUE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  artifact_version_id INTEGER NOT NULL REFERENCES concept2cure_artifact_versions(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  -- Signature Details
  signature_type TEXT NOT NULL, -- approval, review, witness, acknowledgment
  signature_purpose TEXT NOT NULL,
  signature_meaning TEXT,
  -- Signer Information (denormalized for compliance)
  signer_id INTEGER NOT NULL REFERENCES users(id),
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_role TEXT,
  -- Authentication
  authentication_method TEXT NOT NULL,
  authentication_timestamp TIMESTAMPTZ NOT NULL,
  second_factor_verified BOOLEAN DEFAULT FALSE,
  -- Signature Data
  signature_hash VARCHAR(256) NOT NULL,
  signature_manifest JSONB,
  -- Metadata
  ip_address VARCHAR(45),
  device_info JSONB,
  status TEXT NOT NULL DEFAULT 'active',
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2) Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS c2c_sig_signature_id_idx ON concept2cure_signatures(signature_id);
CREATE INDEX IF NOT EXISTS c2c_sig_artifact_idx ON concept2cure_signatures(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_sig_artifact_version_idx ON concept2cure_signatures(artifact_version_id);
CREATE INDEX IF NOT EXISTS c2c_sig_org_idx ON concept2cure_signatures(organization_id);
CREATE INDEX IF NOT EXISTS c2c_sig_signer_idx ON concept2cure_signatures(signer_id);
CREATE INDEX IF NOT EXISTS c2c_sig_signed_at_idx ON concept2cure_signatures(signed_at DESC);

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

DO $$
BEGIN
  PERFORM 1 FROM pg_policies WHERE policyname = 'concept2cure_signatures_tenant_policy';
  IF NOT FOUND THEN
    ALTER TABLE concept2cure_signatures ENABLE ROW LEVEL SECURITY;
    CREATE POLICY concept2cure_signatures_tenant_policy ON concept2cure_signatures
      FOR ALL
      USING (
        organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
        OR organization_id = 0
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS c2c_set_tenant_id_signatures ON concept2cure_signatures;
CREATE TRIGGER c2c_set_tenant_id_signatures
  BEFORE INSERT ON concept2cure_signatures
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_id();

-- =============================================================================
-- 4) Immutability Enforcement (Append-Only)
-- =============================================================================

CREATE OR REPLACE FUNCTION concept2cure_prevent_signature_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'concept2cure_signatures is append-only (21 CFR Part 11)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS c2c_signatures_immutable ON concept2cure_signatures;
CREATE TRIGGER c2c_signatures_immutable
  BEFORE UPDATE OR DELETE ON concept2cure_signatures
  FOR EACH ROW
  EXECUTE FUNCTION concept2cure_prevent_signature_mutation();

-- =============================================================================
-- End of migration
-- =============================================================================
