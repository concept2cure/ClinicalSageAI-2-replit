-- 1. Add the tenant_id column (nullable first to allow migration of existing rows)
ALTER TABLE document_drafts
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50);

-- 2. (Optional) Backfill existing rows with a default/system tenant if needed
-- UPDATE document_drafts SET tenant_id = 'DEFAULT_ORG' WHERE tenant_id IS NULL;

-- 3. Drop the old Primary Key (which was just section_id)
ALTER TABLE document_drafts DROP CONSTRAINT IF EXISTS document_drafts_pkey;

-- 4. Create the new Composite Primary Key
ALTER TABLE document_drafts
ADD PRIMARY KEY (section_id, tenant_id);

-- 5. Set tenant_id to NOT NULL after migration
-- ALTER TABLE document_drafts ALTER COLUMN tenant_id SET NOT NULL;
