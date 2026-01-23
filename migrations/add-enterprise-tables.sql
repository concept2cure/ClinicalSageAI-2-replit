-- Enterprise Tables Migration (Non-Destructive)
-- Executed: January 22, 2026
-- Purpose: Add missing regulatory tables without touching existing data

-- 1. LICENSES (Gatekeeper for module access)
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    license_key VARCHAR(255) UNIQUE NOT NULL,
    plan_type VARCHAR(50) DEFAULT 'ENTERPRISE',
    status VARCHAR(50) DEFAULT 'active',
    seats_limit INTEGER DEFAULT 10,
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '1 year'),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed License for Concept2Cure (Org 1)
INSERT INTO licenses (organization_id, license_key, status)
SELECT 1, 'ENT-INITIAL-KEY-2026', 'active'
WHERE NOT EXISTS (SELECT 1 FROM licenses WHERE organization_id = 1);

-- 2. PROJECTS (The eCTD Container)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'IND',
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. ECTD NODES (The Regulatory Hierarchy M1-M5)
CREATE TABLE IF NOT EXISTS ectd_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES ectd_nodes(id),
    name VARCHAR(255) NOT NULL,
    node_type VARCHAR(50) DEFAULT 'folder',
    sequence_number INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. ATOMS (The AI Evidence Graph)
CREATE TABLE IF NOT EXISTS lumen_data_atoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL REFERENCES organizations(id),
    content TEXT,
    source_document_id UUID,
    type VARCHAR(50) DEFAULT 'text',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. ORGANIZATION SETTINGS
CREATE TABLE IF NOT EXISTS organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed settings for Concept2Cure
INSERT INTO organization_settings (organization_id, settings)
SELECT 1, '{"region": "US", "timezone": "America/New_York", "regulatory_agency": "FDA"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM organization_settings WHERE organization_id = 1);

-- Verification query
SELECT 
    'licenses' as table_name, COUNT(*) as row_count FROM licenses
UNION ALL SELECT 'projects', COUNT(*) FROM projects
UNION ALL SELECT 'ectd_nodes', COUNT(*) FROM ectd_nodes
UNION ALL SELECT 'lumen_data_atoms', COUNT(*) FROM lumen_data_atoms
UNION ALL SELECT 'organization_settings', COUNT(*) FROM organization_settings;
