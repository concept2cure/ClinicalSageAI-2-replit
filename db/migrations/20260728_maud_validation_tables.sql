-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: MAUD validation persistence tables (G-02 canonicalization)
-- Date: 2026-07-28
--
-- WHY THIS EXISTS
-- server/db/maudDb.ts reads/writes maud_algorithms, maud_validations, and
-- maud_validation_requests, but the ONLY CREATE TABLE for them lives in
-- db/migrations/_consolidated/20250512-create-maud-validations-table.sql — an
-- ARCHIVED directory that the schema scanners (unbacked-tables, duplicate-DDL)
-- deliberately exclude, and which no durable apply path runs (only the on-demand
-- runMaudMigration() reads it). So on a fresh database the MAUD routes 500 / no-op,
-- and the three tables sit on the unbacked-tables baseline.
--
-- This is the CANONICAL, durable definition: identical shape to the archived
-- file (validation_id / request_id / algorithm_id are UNIQUE — the ON CONFLICT
-- targets maudDb.ts upserts on; organization_id carries the tenant the router
-- filters by with explicit `AND organization_id = $2`). Placed in the live
-- db/migrations/ lineage and on the applier path so it actually provisions, and
-- made fully idempotent (triggers DROP-then-CREATE) for the applier's re-run
-- contract.
--
-- ROLLBACK: DROP TABLE IF EXISTS maud_validation_requests, maud_validations, maud_algorithms;
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS maud_algorithms (
  id                    SERIAL PRIMARY KEY,
  algorithm_id          VARCHAR(255) NOT NULL UNIQUE,
  name                  VARCHAR(255) NOT NULL,
  version               VARCHAR(50) NOT NULL,
  description           TEXT,
  validation_level      VARCHAR(50),
  regulatory_frameworks JSONB,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_maud_algorithms_algorithm_id ON maud_algorithms(algorithm_id);
CREATE INDEX IF NOT EXISTS idx_maud_algorithms_validation_level ON maud_algorithms(validation_level);

CREATE TABLE IF NOT EXISTS maud_validations (
  id                    SERIAL PRIMARY KEY,
  validation_id         VARCHAR(255) NOT NULL UNIQUE,
  document_id           VARCHAR(255) NOT NULL,
  organization_id       VARCHAR(255),  -- multi-tenant: filtered by `AND organization_id = $2`
  status                VARCHAR(50) NOT NULL,
  timestamp             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  score                 INTEGER,
  validator_name        VARCHAR(255),
  validator_version     VARCHAR(50),
  regulatory_frameworks JSONB,
  algorithms_used       JSONB,
  validation_details    JSONB,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_maud_validations_document_id ON maud_validations(document_id);
CREATE INDEX IF NOT EXISTS idx_maud_validations_status ON maud_validations(status);
CREATE INDEX IF NOT EXISTS idx_maud_validations_organization_id ON maud_validations(organization_id);
CREATE INDEX IF NOT EXISTS idx_maud_validations_timestamp ON maud_validations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_maud_validations_org_doc ON maud_validations(organization_id, document_id);

CREATE TABLE IF NOT EXISTS maud_validation_requests (
  id                        SERIAL PRIMARY KEY,
  request_id                VARCHAR(255) NOT NULL UNIQUE,
  document_id               VARCHAR(255) NOT NULL,
  organization_id           VARCHAR(255),  -- multi-tenant
  status                    VARCHAR(50) NOT NULL,
  algorithms                JSONB,
  metadata                  JSONB,
  created_at                TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  estimated_completion_time TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_maud_validation_requests_document_id ON maud_validation_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_maud_validation_requests_status ON maud_validation_requests(status);
CREATE INDEX IF NOT EXISTS idx_maud_validation_requests_organization_id ON maud_validation_requests(organization_id);

-- Shared updated_at trigger. CREATE OR REPLACE is idempotent; triggers are
-- DROP-then-CREATE so the whole file is safe to re-run on the applier path.
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS maud_algorithms_updated ON maud_algorithms;
CREATE TRIGGER maud_algorithms_updated
  BEFORE UPDATE ON maud_algorithms
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS maud_validations_updated ON maud_validations;
CREATE TRIGGER maud_validations_updated
  BEFORE UPDATE ON maud_validations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS maud_validation_requests_updated ON maud_validation_requests;
CREATE TRIGGER maud_validation_requests_updated
  BEFORE UPDATE ON maud_validation_requests
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
