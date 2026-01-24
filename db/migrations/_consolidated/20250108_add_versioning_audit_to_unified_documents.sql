-- Migration: Add Versioning, Audit, and eCTD fields to unified_documents table
-- Date: 2025-01-08
-- Purpose: Enhance unified_documents with regulatory compliance features

-- Add versioning columns
ALTER TABLE unified_documents 
ADD COLUMN IF NOT EXISTS document_version_id UUID DEFAULT gen_random_uuid() UNIQUE,
ADD COLUMN IF NOT EXISTS is_latest_version BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS previous_version_doc_id UUID REFERENCES unified_documents(id),
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS version_label VARCHAR(50);

-- Add comprehensive audit fields
ALTER TABLE unified_documents
ADD COLUMN IF NOT EXISTS ingested_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS source_system VARCHAR(100),
ADD COLUMN IF NOT EXISTS source_file_checksum VARCHAR(64),
ADD COLUMN IF NOT EXISTS regulatory_pathway VARCHAR(50),
ADD COLUMN IF NOT EXISTS compliance_score NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS therapeutic_area VARCHAR(200),
ADD COLUMN IF NOT EXISTS study_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS regulatory_agency VARCHAR(100),
ADD COLUMN IF NOT EXISTS effective_date DATE,
ADD COLUMN IF NOT EXISTS version_notes TEXT;

-- Add eCTD specific fields
ALTER TABLE unified_documents
ADD COLUMN IF NOT EXISTS ectd_module VARCHAR(20),
ADD COLUMN IF NOT EXISTS ectd_section VARCHAR(50),
ADD COLUMN IF NOT EXISTS ectd_leaf_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS ectd_operation_type VARCHAR(20) DEFAULT 'new',
ADD COLUMN IF NOT EXISTS ectd_sequence_number INTEGER;

-- Create indexes for versioning
CREATE INDEX IF NOT EXISTS idx_unified_documents_version_id ON unified_documents(document_version_id);
CREATE INDEX IF NOT EXISTS idx_unified_documents_latest_version ON unified_documents(is_latest_version) WHERE is_latest_version = true;
CREATE INDEX IF NOT EXISTS idx_unified_documents_previous_version ON unified_documents(previous_version_doc_id);
CREATE INDEX IF NOT EXISTS idx_unified_documents_version_number ON unified_documents(version_number);

-- Create indexes for audit and search
CREATE INDEX IF NOT EXISTS idx_unified_documents_ingested_by ON unified_documents(ingested_by);
CREATE INDEX IF NOT EXISTS idx_unified_documents_source_system ON unified_documents(source_system);
CREATE INDEX IF NOT EXISTS idx_unified_documents_regulatory_pathway ON unified_documents(regulatory_pathway);
CREATE INDEX IF NOT EXISTS idx_unified_documents_therapeutic_area ON unified_documents(therapeutic_area);
CREATE INDEX IF NOT EXISTS idx_unified_documents_study_id ON unified_documents(study_id);
CREATE INDEX IF NOT EXISTS idx_unified_documents_submission_id ON unified_documents(submission_id);

-- Create indexes for eCTD
CREATE INDEX IF NOT EXISTS idx_unified_documents_ectd_module ON unified_documents(ectd_module);
CREATE INDEX IF NOT EXISTS idx_unified_documents_ectd_section ON unified_documents(ectd_section);
CREATE INDEX IF NOT EXISTS idx_unified_documents_ectd_leaf_id ON unified_documents(ectd_leaf_id);

-- Create document_chunks table for chunked content
CREATE TABLE IF NOT EXISTS document_chunks (
    chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_version_id UUID NOT NULL,
    chunk_type VARCHAR(50) NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT,
    chunk_metadata JSONB,
    chunk_embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (document_version_id) REFERENCES unified_documents(document_version_id) ON DELETE CASCADE
);

-- Create indexes for document_chunks
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_version ON document_chunks(document_version_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_type ON document_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_document_chunks_index ON document_chunks(document_version_id, chunk_index);

-- Create document_tables table for extracted tabular data
CREATE TABLE IF NOT EXISTS document_tables (
    table_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_version_id UUID NOT NULL,
    table_index INTEGER NOT NULL,
    table_title VARCHAR(500),
    table_type VARCHAR(100),
    table_data JSONB NOT NULL,
    headers JSONB,
    row_count INTEGER,
    column_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (document_version_id) REFERENCES unified_documents(document_version_id) ON DELETE CASCADE
);

-- Create indexes for document_tables
CREATE INDEX IF NOT EXISTS idx_document_tables_doc_version ON document_tables(document_version_id);
CREATE INDEX IF NOT EXISTS idx_document_tables_type ON document_tables(table_type);

-- Create full-text search configuration
CREATE INDEX IF NOT EXISTS idx_unified_documents_fts ON unified_documents 
USING gin(to_tsvector('english', 
    COALESCE(original_name, '') || ' ' || 
    COALESCE(text_content, '') || ' ' ||
    COALESCE(extracted_content, '') || ' ' ||
    COALESCE(therapeutic_area, '') || ' ' ||
    COALESCE(product_name, '')
));

-- Add comments for documentation
COMMENT ON COLUMN unified_documents.document_version_id IS 'Unique identifier for this version of the document';
COMMENT ON COLUMN unified_documents.is_latest_version IS 'Flag indicating if this is the most recent version';
COMMENT ON COLUMN unified_documents.previous_version_doc_id IS 'Reference to the previous version of this document';
COMMENT ON COLUMN unified_documents.version_number IS 'Sequential version number';
COMMENT ON COLUMN unified_documents.version_label IS 'Human-readable version label (e.g., v2.1, Final, Draft)';
COMMENT ON COLUMN unified_documents.ingested_by IS 'User or system that ingested this document';
COMMENT ON COLUMN unified_documents.source_system IS 'System from which the document was ingested';
COMMENT ON COLUMN unified_documents.source_file_checksum IS 'SHA256 checksum of the source file';
COMMENT ON COLUMN unified_documents.regulatory_pathway IS 'Regulatory submission pathway (510k, PMA, IND, NDA, etc.)';
COMMENT ON COLUMN unified_documents.ectd_module IS 'eCTD module number (1-5)';
COMMENT ON COLUMN unified_documents.ectd_section IS 'eCTD section within module';
COMMENT ON COLUMN unified_documents.ectd_operation_type IS 'eCTD operation: new, append, replace, delete';

-- Create trigger to update is_latest_version when new versions are added
CREATE OR REPLACE FUNCTION update_document_version_flags()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is a new version of an existing document
    IF NEW.previous_version_doc_id IS NOT NULL THEN
        -- Set all previous versions to not be latest
        UPDATE unified_documents 
        SET is_latest_version = false 
        WHERE id = NEW.previous_version_doc_id 
           OR previous_version_doc_id = NEW.previous_version_doc_id;
        
        -- Ensure new version is marked as latest
        NEW.is_latest_version = true;
        
        -- Set version number
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO NEW.version_number
        FROM unified_documents 
        WHERE id = NEW.previous_version_doc_id 
           OR previous_version_doc_id = NEW.previous_version_doc_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_version_trigger
BEFORE INSERT ON unified_documents
FOR EACH ROW
EXECUTE FUNCTION update_document_version_flags();

-- Create view for latest documents only
CREATE OR REPLACE VIEW latest_documents AS
SELECT * FROM unified_documents
WHERE is_latest_version = true;

-- Create audit log table for document changes
CREATE TABLE IF NOT EXISTS document_audit_trail (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_version_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    FOREIGN KEY (document_version_id) REFERENCES unified_documents(document_version_id)
);

CREATE INDEX IF NOT EXISTS idx_document_audit_trail_doc_version ON document_audit_trail(document_version_id);
CREATE INDEX IF NOT EXISTS idx_document_audit_trail_performed_by ON document_audit_trail(performed_by);
CREATE INDEX IF NOT EXISTS idx_document_audit_trail_performed_at ON document_audit_trail(performed_at DESC);