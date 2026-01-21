-- 1. Add tenant isolation
ALTER TABLE document_drafts
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50);

-- 2. Drop legacy constraint
ALTER TABLE document_drafts DROP CONSTRAINT IF EXISTS document_drafts_pkey;

-- 3. Create Composite Primary Key (The "Firewall")
-- Ensures no overlap between tenants on the same section ID
ALTER TABLE document_drafts
ADD PRIMARY KEY (section_id, tenant_id);

-- 4. PERFORMANCE ENHANCEMENT: Index
-- Critical for "List all drafts for this Tenant" queries later
CREATE INDEX IF NOT EXISTS idx_drafts_tenant ON document_drafts(tenant_id);