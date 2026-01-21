-- 1. Create CMC Submissions Table
CREATE TABLE IF NOT EXISTS cmc_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    project_title VARCHAR(255) NOT NULL,
    module_type VARCHAR(10) CHECK (module_type IN ('3.2.S', '3.2.P')),

    -- STORES: { manufacturing: {...}, control_strategy: {...}, impurities: [...] }
    data JSONB DEFAULT '{}',

    status VARCHAR(50) DEFAULT 'DRAFT',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by VARCHAR(50)
);

-- 2. Index for Tenant Performance
CREATE INDEX IF NOT EXISTS idx_cmc_tenant_type ON cmc_submissions(tenant_id, module_type);