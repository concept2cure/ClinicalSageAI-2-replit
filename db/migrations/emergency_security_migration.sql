-- EMERGENCY SECURITY MIGRATION: Multi-tenant Isolation Fix
-- Date: 2025-01-08
-- Purpose: Add missing tenant_id columns and fix schema mismatches to restore security

BEGIN;

-- 1. Add tenant_id to document_chunks table
ALTER TABLE IF EXISTS document_chunks 
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'default';

-- 2. Add tenant_id to document_tables table
ALTER TABLE IF EXISTS document_tables 
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'default';

-- Ensure document_version_id exists for document_tables
ALTER TABLE IF EXISTS document_tables
ADD COLUMN IF NOT EXISTS document_version_id UUID;

-- 3. Add tenant_id to document_audit_trail table
ALTER TABLE IF EXISTS document_audit_trail 
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'default';

-- Ensure document_version_id exists for document_audit_trail
ALTER TABLE IF EXISTS document_audit_trail
ADD COLUMN IF NOT EXISTS document_version_id UUID;

-- 4. Fix document_chunks schema mismatch
-- Add missing columns that Node.js expects
ALTER TABLE IF EXISTS document_chunks 
ADD COLUMN IF NOT EXISTS document_version_id UUID,
ADD COLUMN IF NOT EXISTS chunk_text TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 5-8. Indexes, backfill, constraints (only if tables exist)
DO $$
BEGIN
	IF to_regclass('document_chunks') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_id ON document_chunks(tenant_id);
		CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_doc ON document_chunks(tenant_id, doc_id);
		UPDATE document_chunks SET tenant_id = 'default' WHERE tenant_id IS NULL;
		ALTER TABLE document_chunks ALTER COLUMN tenant_id SET NOT NULL;
	END IF;

	IF to_regclass('document_tables') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_document_tables_tenant_id ON document_tables(tenant_id);
		CREATE INDEX IF NOT EXISTS idx_document_tables_tenant_doc ON document_tables(tenant_id, document_version_id);
		UPDATE document_tables SET tenant_id = 'default' WHERE tenant_id IS NULL;
		ALTER TABLE document_tables ALTER COLUMN tenant_id SET NOT NULL;
	END IF;

	IF to_regclass('document_audit_trail') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_document_audit_trail_tenant_id ON document_audit_trail(tenant_id);
		CREATE INDEX IF NOT EXISTS idx_audit_tenant_doc ON document_audit_trail(tenant_id, document_version_id);
		UPDATE document_audit_trail SET tenant_id = 'default' WHERE tenant_id IS NULL;
		ALTER TABLE document_audit_trail ALTER COLUMN tenant_id SET NOT NULL;
	END IF;
END $$;

COMMIT;

-- Verification notices (only if tables exist)
DO $$
DECLARE
	v_total BIGINT;
	v_tenants BIGINT;
BEGIN
	IF to_regclass('document_chunks') IS NOT NULL THEN
		SELECT COUNT(*), COUNT(DISTINCT tenant_id) INTO v_total, v_tenants FROM document_chunks;
		RAISE NOTICE 'document_chunks total_rows=%, tenant_count=%', v_total, v_tenants;
	END IF;

	IF to_regclass('document_tables') IS NOT NULL THEN
		SELECT COUNT(*), COUNT(DISTINCT tenant_id) INTO v_total, v_tenants FROM document_tables;
		RAISE NOTICE 'document_tables total_rows=%, tenant_count=%', v_total, v_tenants;
	END IF;

	IF to_regclass('document_audit_trail') IS NOT NULL THEN
		SELECT COUNT(*), COUNT(DISTINCT tenant_id) INTO v_total, v_tenants FROM document_audit_trail;
		RAISE NOTICE 'document_audit_trail total_rows=%, tenant_count=%', v_total, v_tenants;
	END IF;
END $$;