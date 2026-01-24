-- Migration: Complete Schema for Unified Document Ingestion System
-- Date: 2025-01-08
-- Purpose: Ensure all tables and columns exist for enhanced regulatory document processing

-- Create tenants table if not exists
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id TEXT PRIMARY KEY,
    tenant_name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create users table if not exists
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

-- Check if unified_documents table exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'unified_documents') THEN
        -- Create the table with all columns
        CREATE TABLE unified_documents (
            id TEXT PRIMARY KEY,
            processing_id TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT, -- Nullable for memory storage
            file_size BIGINT,
            mime_type TEXT,
            module TEXT DEFAULT 'general',
            context TEXT,
            text_content TEXT,
            processed_text JSONB,
            ai_analysis JSONB,
            module_specific_data JSONB,
            document_type JSONB,
            structure JSONB,
            content_hash TEXT,
            processing_time INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            
            -- Versioning fields
            document_version_id TEXT NOT NULL,
            is_latest_version BOOLEAN DEFAULT TRUE,
            previous_version_doc_id TEXT,
            version_number INTEGER DEFAULT 1,
            version_label TEXT DEFAULT 'Initial',
            
            -- Audit fields
            ingested_by TEXT DEFAULT 'system',
            source_system TEXT,
            source_file_checksum TEXT,
            ingestion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            
            -- Regulatory metadata
            regulatory_pathway TEXT,
            compliance_score NUMERIC,
            therapeutic_area TEXT,
            study_id TEXT,
            product_name TEXT,
            regulatory_agency TEXT,
            effective_date DATE,
            version_notes TEXT,
            
            -- eCTD specific fields
            ectd_module TEXT,
            ectd_section TEXT,
            ectd_leaf_id TEXT,
            ectd_operation_type TEXT DEFAULT 'new',
            ectd_sequence_number TEXT,
            submission_id TEXT,
            submission_type TEXT,
            
            -- Tenant isolation
            tenant_id TEXT,
            
            FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE RESTRICT,
            FOREIGN KEY (previous_version_doc_id) REFERENCES unified_documents(id) ON DELETE SET NULL
        );
    ELSE
        -- Add columns if they don't exist
        ALTER TABLE unified_documents 
        ADD COLUMN IF NOT EXISTS tenant_id TEXT,
        ADD COLUMN IF NOT EXISTS document_version_id TEXT,
        ADD COLUMN IF NOT EXISTS is_latest_version BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS previous_version_doc_id TEXT,
        ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS version_label TEXT DEFAULT 'Initial',
        ADD COLUMN IF NOT EXISTS ingested_by TEXT DEFAULT 'system',
        ADD COLUMN IF NOT EXISTS source_system TEXT,
        ADD COLUMN IF NOT EXISTS source_file_checksum TEXT,
        ADD COLUMN IF NOT EXISTS ingestion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS regulatory_pathway TEXT,
        ADD COLUMN IF NOT EXISTS compliance_score NUMERIC,
        ADD COLUMN IF NOT EXISTS therapeutic_area TEXT,
        ADD COLUMN IF NOT EXISTS study_id TEXT,
        ADD COLUMN IF NOT EXISTS product_name TEXT,
        ADD COLUMN IF NOT EXISTS regulatory_agency TEXT,
        ADD COLUMN IF NOT EXISTS effective_date DATE,
        ADD COLUMN IF NOT EXISTS version_notes TEXT,
        ADD COLUMN IF NOT EXISTS ectd_module TEXT,
        ADD COLUMN IF NOT EXISTS ectd_section TEXT,
        ADD COLUMN IF NOT EXISTS ectd_leaf_id TEXT,
        ADD COLUMN IF NOT EXISTS ectd_operation_type TEXT DEFAULT 'new',
        ADD COLUMN IF NOT EXISTS ectd_sequence_number TEXT,
        ADD COLUMN IF NOT EXISTS submission_id TEXT,
        ADD COLUMN IF NOT EXISTS submission_type TEXT;
        
        -- Make file_path nullable if it isn't already
        ALTER TABLE unified_documents ALTER COLUMN file_path DROP NOT NULL;
    END IF;
END $$;

-- Create document_chunks table if not exists
CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_version_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tenant_id TEXT,
    
    FOREIGN KEY (document_version_id) REFERENCES unified_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

-- Create document_tables table if not exists
CREATE TABLE IF NOT EXISTS document_tables (
    id TEXT PRIMARY KEY,
    document_version_id TEXT NOT NULL,
    table_index INTEGER NOT NULL,
    table_data JSONB NOT NULL,
    headers JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tenant_id TEXT,
    
    FOREIGN KEY (document_version_id) REFERENCES unified_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

-- Create document_audit_trail table if not exists
CREATE TABLE IF NOT EXISTS document_audit_trail (
    id TEXT PRIMARY KEY,
    document_version_id TEXT,
    action TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    details JSONB,
    tenant_id TEXT,
    
    FOREIGN KEY (document_version_id) REFERENCES unified_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_unified_documents_module ON unified_documents(module);
CREATE INDEX IF NOT EXISTS idx_unified_documents_created_at ON unified_documents(created_at);
CREATE INDEX IF NOT EXISTS idx_unified_documents_document_type ON unified_documents USING gin(document_type);
CREATE INDEX IF NOT EXISTS idx_unified_documents_ai_analysis ON unified_documents USING gin(ai_analysis);
CREATE INDEX IF NOT EXISTS idx_unified_documents_version ON unified_documents(document_version_id, is_latest_version);
CREATE INDEX IF NOT EXISTS idx_unified_documents_tenant ON unified_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_unified_documents_regulatory ON unified_documents(regulatory_pathway, submission_id);
CREATE INDEX IF NOT EXISTS idx_unified_documents_ectd ON unified_documents(ectd_module, ectd_section);

-- Create version tracking trigger
CREATE OR REPLACE FUNCTION update_document_version_tracking()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is a new version of an existing document
    IF NEW.previous_version_doc_id IS NOT NULL THEN
        -- Update the previous version to not be latest
        UPDATE unified_documents 
        SET is_latest_version = FALSE 
        WHERE id = NEW.previous_version_doc_id;
        
        -- Calculate the new version number
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO NEW.version_number
        FROM unified_documents
        WHERE id = NEW.previous_version_doc_id 
           OR previous_version_doc_id = NEW.previous_version_doc_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_document_version') THEN
        CREATE TRIGGER trigger_update_document_version
        BEFORE INSERT ON unified_documents
        FOR EACH ROW
        EXECUTE FUNCTION update_document_version_tracking();
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE unified_documents IS 'Central storage for all document ingestion across all platform modules with versioning and regulatory compliance';
COMMENT ON COLUMN unified_documents.file_path IS 'File path - can be NULL for memory-stored uploads';
COMMENT ON COLUMN unified_documents.document_version_id IS 'Unique ID for this specific version of the document';
COMMENT ON COLUMN unified_documents.is_latest_version IS 'True if this is the most recent version';
COMMENT ON COLUMN unified_documents.regulatory_pathway IS 'Regulatory submission pathway (Standard, Fast Track, etc.)';
COMMENT ON COLUMN unified_documents.ectd_module IS 'eCTD module identifier (m1, m2, m3, m4, m5)';
COMMENT ON COLUMN unified_documents.ectd_leaf_id IS 'eCTD leaf identifier from regulatory index.xml';

-- Insert default tenant if none exists (for development)
INSERT INTO tenants (tenant_id, tenant_name) 
VALUES ('default', 'Default Organization')
ON CONFLICT (tenant_id) DO NOTHING;

-- Insert default user if none exists (for development)
INSERT INTO users (user_id, tenant_id, username, password_hash, role)
VALUES ('system', 'default', 'system', 'not-for-login', 'system')
ON CONFLICT (user_id) DO NOTHING;