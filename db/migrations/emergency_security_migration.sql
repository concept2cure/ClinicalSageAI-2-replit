-- EMERGENCY SECURITY MIGRATION: Multi-tenant Isolation Fix
-- Date: 2025-01-08
-- Purpose: Add missing tenant_id columns and fix schema mismatches to restore security

BEGIN;

-- 1. Add tenant_id to document_chunks table
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'default';

-- 2. Add tenant_id to document_tables table
ALTER TABLE document_tables 
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'default';

-- 3. Add tenant_id to document_audit_trail table
ALTER TABLE document_audit_trail 
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255) DEFAULT 'default';

-- 4. Fix document_chunks schema mismatch
-- Add missing columns that Node.js expects
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS document_version_id UUID,
ADD COLUMN IF NOT EXISTS chunk_text TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 5. Create indexes for performance and multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_id ON document_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_tables_tenant_id ON document_tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_audit_trail_tenant_id ON document_audit_trail(tenant_id);

-- 6. Add composite indexes for tenant + document queries
CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant_doc ON document_chunks(tenant_id, doc_id);
CREATE INDEX IF NOT EXISTS idx_document_tables_tenant_doc ON document_tables(tenant_id, document_version_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_doc ON document_audit_trail(tenant_id, document_version_id);

-- 7. Update existing NULL tenant_ids (if any) to 'default'
UPDATE document_chunks SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE document_tables SET tenant_id = 'default' WHERE tenant_id IS NULL;
UPDATE document_audit_trail SET tenant_id = 'default' WHERE tenant_id IS NULL;

-- 8. Add NOT NULL constraints after backfill
ALTER TABLE document_chunks ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE document_tables ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE document_audit_trail ALTER COLUMN tenant_id SET NOT NULL;

COMMIT;

-- Verification queries
SELECT 'document_chunks' as table_name, COUNT(*) as total_rows, COUNT(DISTINCT tenant_id) as tenant_count FROM document_chunks
UNION ALL
SELECT 'document_tables', COUNT(*), COUNT(DISTINCT tenant_id) FROM document_tables
UNION ALL
SELECT 'document_audit_trail', COUNT(*), COUNT(DISTINCT tenant_id) FROM document_audit_trail;