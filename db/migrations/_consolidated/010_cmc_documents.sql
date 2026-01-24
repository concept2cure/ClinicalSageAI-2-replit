-- CMC Documents Database Schema
-- For Module 3 Quality Documentation

-- Main documents table
CREATE TABLE IF NOT EXISTS cmc_documents (
    id SERIAL PRIMARY KEY,
    module_section VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    version VARCHAR(20) DEFAULT '1.0',
    drug_candidate_id VARCHAR(100),
    study_id VARCHAR(100),
    tenant_id INTEGER NOT NULL,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document versions history
CREATE TABLE IF NOT EXISTS cmc_document_versions (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES cmc_documents(id) ON DELETE CASCADE,
    version_number VARCHAR(20) NOT NULL,
    content TEXT,
    changes TEXT,
    author VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document links for cross-referencing
CREATE TABLE IF NOT EXISTS cmc_document_links (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES cmc_documents(id) ON DELETE CASCADE,
    linked_document_id INTEGER NOT NULL REFERENCES cmc_documents(id) ON DELETE CASCADE,
    link_type VARCHAR(50),
    context TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Document collaborators
CREATE TABLE IF NOT EXISTS cmc_document_collaborators (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES cmc_documents(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    permission_level VARCHAR(20) DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cmc_documents_tenant ON cmc_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cmc_documents_module ON cmc_documents(module_section);
CREATE INDEX IF NOT EXISTS idx_cmc_documents_drug ON cmc_documents(drug_candidate_id);
CREATE INDEX IF NOT EXISTS idx_cmc_documents_study ON cmc_documents(study_id);
CREATE INDEX IF NOT EXISTS idx_cmc_document_versions_doc ON cmc_document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_cmc_document_links_doc ON cmc_document_links(document_id);
CREATE INDEX IF NOT EXISTS idx_cmc_document_collaborators_doc ON cmc_document_collaborators(document_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_cmc_documents_updated_at BEFORE UPDATE
    ON cmc_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();