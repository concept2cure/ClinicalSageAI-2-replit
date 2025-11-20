-- Compliance Check History Table
-- This table stores persistent history of all compliance checks performed
-- Enables audit trails, trend analysis, and compliance monitoring

CREATE TABLE IF NOT EXISTS compliance_check_history (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    document_id VARCHAR(255),
    document_title VARCHAR(500),
    document_type VARCHAR(255) NOT NULL DEFAULT 'Clinical Overview',
    submission_type VARCHAR(255) NOT NULL DEFAULT 'IND',
    regulatory_region VARCHAR(255) NOT NULL DEFAULT 'FDA',
    therapeutic_area VARCHAR(255),
    
    -- Input content (truncated for storage efficiency)
    input_content TEXT,
    content_length INTEGER,
    
    -- Compliance scores (JSON format for flexibility)
    compliance_scores JSONB NOT NULL,
    overall_compliance_score NUMERIC(5,2),
    
    -- Analysis results
    identified_issues JSONB,
    suggestions JSONB,
    biotech_specific_issues JSONB,
    overall_assessment TEXT,
    
    -- AI processing metadata
    ai_model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
    processing_time_ms INTEGER,
    tokens_used INTEGER,
    
    -- Cross-document analysis indicators
    knowledge_graph_used BOOLEAN DEFAULT FALSE,
    nlp_analysis_used BOOLEAN DEFAULT FALSE,
    related_documents_count INTEGER DEFAULT 0,
    
    -- Audit trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Performance indexes
    CONSTRAINT fk_tenant_compliance_check FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_compliance_check_tenant_id ON compliance_check_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_check_user_id ON compliance_check_history(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_check_document_type ON compliance_check_history(document_type);
CREATE INDEX IF NOT EXISTS idx_compliance_check_created_at ON compliance_check_history(created_at);
CREATE INDEX IF NOT EXISTS idx_compliance_check_overall_score ON compliance_check_history(overall_compliance_score);
CREATE INDEX IF NOT EXISTS idx_compliance_check_regulatory_region ON compliance_check_history(regulatory_region);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_compliance_check_tenant_user_date ON compliance_check_history(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_check_tenant_document_type ON compliance_check_history(tenant_id, document_type, created_at DESC);

-- Add update trigger for updated_at
CREATE OR REPLACE FUNCTION update_compliance_check_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_compliance_check_updated_at 
    BEFORE UPDATE ON compliance_check_history 
    FOR EACH ROW 
    EXECUTE FUNCTION update_compliance_check_updated_at_column();